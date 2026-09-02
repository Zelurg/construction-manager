from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_admin_user, get_current_user
from ..websocket_manager import manager

router = APIRouter()

ALLOWED_FIELDS = set(schemas.COMMENT_FIELDS)


def _serialize(comment):
    return {
        "id": comment.id,
        "task_id": comment.task_id,
        "field": comment.field,
        "author_name": comment.author_name,
        "text": comment.text,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


def _latest_text(db: Session, task_id: int, field: str) -> Optional[str]:
    """Возвращает текст самого свежего комментария для (task, field) или None."""
    c = (
        db.query(models.TaskComment)
        .filter(models.TaskComment.task_id == task_id, models.TaskComment.field == field)
        .order_by(models.TaskComment.created_at.desc(), models.TaskComment.id.desc())
        .first()
    )
    return c.text if c else None


def _sync_scalar(db: Session, task: models.Task, field: str):
    """Обновляет скалярную колонку задачи текстом последнего комментария (или None)."""
    latest = _latest_text(db, task.id, field)
    setattr(task, field, latest)
    db.add(task)


@router.get("/", response_model=List[schemas.TaskCommentOut])
def get_comments(
    task_id: Optional[int] = None,
    field: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Список комментариев. Можно фильтровать по task_id и field."""
    q = db.query(models.TaskComment)
    if task_id is not None:
        q = q.filter(models.TaskComment.task_id == task_id)
    if field is not None:
        q = q.filter(models.TaskComment.field == field)
    return q.order_by(models.TaskComment.created_at.asc(), models.TaskComment.id.asc()).all()


@router.post("/", response_model=schemas.TaskCommentOut)
async def add_comment(
    payload: schemas.TaskCommentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Добавить комментарий в колонку задачи. Обновляет и скалярную колонку последним текстом."""
    if payload.field not in ALLOWED_FIELDS:
        raise HTTPException(status_code=400, detail="Недопустимое поле колонки")

    task = db.query(models.Task).filter(models.Task.id == payload.task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Текст комментария не может быть пустым")

    comment = models.TaskComment(
        task_id=task.id,
        field=payload.field,
        author_name=current_user.full_name or current_user.username,
        text=text,
    )
    db.add(comment)
    db.flush()

    _sync_scalar(db, task, payload.field)
    db.commit()
    db.refresh(comment)

    await manager.broadcast(
        {
            "type": "comment_added",
            "comment": _serialize(comment),
            "task": {"id": task.id, "field": payload.field, "value": getattr(task, payload.field)},
        },
        event_type="tasks",
    )
    await manager.broadcast(
        {"type": "task_updated", "data": {"id": task.id, payload.field: getattr(task, payload.field)}},
        event_type="tasks",
    )

    return comment


@router.delete("/{comment_id}")
async def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user),
):
    """Админ может точечно удалить один комментарий."""
    comment = db.query(models.TaskComment).filter(models.TaskComment.id == comment_id).first()
    if comment is None:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    task_id = comment.task_id
    field = comment.field
    removed = _serialize(comment)

    db.delete(comment)
    db.flush()

    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if task is not None:
        _sync_scalar(db, task, field)

    db.commit()

    await manager.broadcast(
        {
            "type": "comment_deleted",
            "comment": removed,
            "task": {"id": task_id, "field": field, "value": (getattr(task, field) if task else None)},
        },
        event_type="tasks",
    )
    if task is not None:
        await manager.broadcast(
            {"type": "task_updated", "data": {"id": task_id, field: getattr(task, field)}},
            event_type="tasks",
        )

    return {"ok": True}
