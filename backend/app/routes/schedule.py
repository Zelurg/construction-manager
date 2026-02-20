from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from ..websocket_manager import manager
from .projects import touch_project

router = APIRouter()


@router.get("/tasks", response_model=List[schemas.Task])
def get_tasks(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.Task)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    # Единственный источник порядка — sort_order.
    # Обычные задачи получают sort_order при импорте (row*10),
    # ручные — при создании/перетаскивании.
    return query.order_by(models.Task.sort_order).all()


# ВАЖНО: /tasks/custom и /tasks/custom/all стоят ДО /tasks/{task_id}
# иначе FastAPI пытается привести строку "custom" к int и возвращает 422.

@router.post("/tasks/custom", response_model=schemas.Task)
async def create_custom_task(
    body: schemas.CustomTaskCreate,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Создаёт ручную строку.

    Если передан insert_before_task_id — вставляет перед якорем,
    используя sort_order = anchor.sort_order - 1.
    Если между якорем и предыдущей строкой нет места (разница <= 1) —
    делаем renumber всего проекта с шагом 10 и повторяем.
    Иначе — вставляет в конец.
    """
    # 1. Генерируем шифр
    existing_custom = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.is_custom == True
    ).count()
    new_number = existing_custom + 1
    new_code = f"С-{new_number}"
    while db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.code == new_code
    ).first():
        new_number += 1
        new_code = f"С-{new_number}"

    # 2. Определяем sort_order
    if body.insert_before_task_id:
        anchor = db.query(models.Task).filter(
            models.Task.id == body.insert_before_task_id
        ).first()
        if anchor:
            new_sort_order = _insert_before(db, project_id, anchor.sort_order)
        else:
            new_sort_order = _next_sort_order(db, project_id)
    elif body.insert_after_task_id:
        anchor = db.query(models.Task).filter(
            models.Task.id == body.insert_after_task_id
        ).first()
        if anchor:
            new_sort_order = _insert_after(db, project_id, anchor.sort_order)
        else:
            new_sort_order = _next_sort_order(db, project_id)
    else:
        new_sort_order = _next_sort_order(db, project_id)

    # 3. Создаём
    db_task = models.Task(
        project_id=project_id,
        code=new_code,
        name=body.name,
        unit=body.unit,
        volume_plan=body.volume_plan or 0,
        volume_fact=0,
        start_date_plan=body.start_date_plan,
        end_date_plan=body.end_date_plan,
        unit_price=body.unit_price or 0,
        labor_per_unit=body.labor_per_unit or 0,
        machine_hours_per_unit=body.machine_hours_per_unit or 0,
        executor=body.executor,
        parent_code=body.parent_code,
        is_section=False,
        is_custom=True,
        sort_order=new_sort_order,
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    touch_project(project_id, db)

    await manager.broadcast(
        {"type": "task_created", "event": "tasks",
         "data": {"id": db_task.id, "project_id": project_id, "is_custom": True}},
        event_type="tasks"
    )
    return db_task


@router.delete("/tasks/custom/all")
async def delete_all_custom_tasks(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Удалить все ручные строки проекта."""
    query = db.query(models.Task).filter(models.Task.is_custom == True)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    ids = [t.id for t in query.all()]
    query.delete(synchronize_session=False)
    db.commit()
    touch_project(project_id, db)
    await manager.broadcast(
        {"type": "tasks_cleared", "event": "tasks",
         "data": {"project_id": project_id, "custom_only": True}},
        event_type="tasks"
    )
    return {"message": f"Удалено {len(ids)} ручных строк", "ids": ids}


@router.post("/tasks", response_model=schemas.Task)
async def create_task(
    task: schemas.TaskCreate,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    existing = db.query(models.Task).filter(
        models.Task.code == task.code,
        models.Task.project_id == project_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Задача с кодом '{task.code}' уже существует")

    task_data = task.dict()
    if not task_data.get('sort_order'):
        task_data['sort_order'] = _next_sort_order(db, project_id)

    db_task = models.Task(**task_data, project_id=project_id)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    touch_project(project_id, db)

    await manager.broadcast(
        {"type": "task_created", "event": "tasks",
         "data": {"id": db_task.id, "project_id": project_id}},
        event_type="tasks"
    )
    return db_task


@router.put("/tasks/{task_id}", response_model=schemas.Task)
async def update_task(
    task_id: int,
    task: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    for key, value in task.dict(exclude_unset=True).items():
        setattr(db_task, key, value)
    db.commit()
    db.refresh(db_task)
    touch_project(db_task.project_id, db)

    await manager.broadcast(
        {"type": "task_updated", "event": "tasks", "data": {"id": db_task.id}},
        event_type="tasks"
    )
    return db_task


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    project_id = db_task.project_id
    db.delete(db_task)
    db.commit()
    touch_project(project_id, db)
    await manager.broadcast(
        {"type": "task_deleted", "event": "tasks", "data": {"id": task_id}},
        event_type="tasks"
    )
    return {"message": "Задача удалена", "id": task_id}


@router.delete("/tasks")
async def delete_all_tasks(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(models.Task)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    count = query.count()
    query.delete()
    db.commit()
    touch_project(project_id, db)
    await manager.broadcast(
        {"type": "tasks_cleared", "event": "tasks", "data": {"project_id": project_id}},
        event_type="tasks"
    )
    return {"message": f"Удалено {count} задач"}


def _next_sort_order(db: Session, project_id: Optional[int]) -> int:
    """Возвращает sort_order на 10 больше текущего максимума."""
    max_order = db.query(func.max(models.Task.sort_order)).filter(
        models.Task.project_id == project_id
    ).scalar()
    return (max_order or 0) + 10


def _renumber(db: Session, project_id: Optional[int]):
    """Перенумеровываем все задачи проекта с шагом 10, сохраняя текущий порядок."""
    tasks = db.query(models.Task).filter(
        models.Task.project_id == project_id
    ).order_by(models.Task.sort_order).all()
    for i, t in enumerate(tasks):
        t.sort_order = (i + 1) * 10
    db.flush()


def _insert_before(db: Session, project_id: Optional[int], anchor_sort_order: int) -> int:
    """Возвращает sort_order для вставки перед якорем.
    Если места нет — делает renumber и пересчитывает.
    """
    # Ищем предыдущую строку
    prev = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.sort_order < anchor_sort_order
    ).order_by(models.Task.sort_order.desc()).first()

    prev_order = prev.sort_order if prev else 0
    gap = anchor_sort_order - prev_order

    if gap > 1:
        # Есть место — берём середину
        return prev_order + gap // 2
    else:
        # Места нет — перенумеруем и пересчитываем
        _renumber(db, project_id)
        # После renumber ищем новый sort_order якоря
        anchor_new = db.query(models.Task).filter(
            models.Task.project_id == project_id,
            models.Task.sort_order >= anchor_sort_order
        ).order_by(models.Task.sort_order).first()
        if anchor_new:
            return _insert_before(db, project_id, anchor_new.sort_order)
        return _next_sort_order(db, project_id)


def _insert_after(db: Session, project_id: Optional[int], anchor_sort_order: int) -> int:
    """Возвращает sort_order для вставки после якоря."""
    next_task = db.query(models.Task).filter(
        models.Task.project_id == project_id,
        models.Task.sort_order > anchor_sort_order
    ).order_by(models.Task.sort_order).first()

    next_order = next_task.sort_order if next_task else anchor_sort_order + 20
    gap = next_order - anchor_sort_order

    if gap > 1:
        return anchor_sort_order + gap // 2
    else:
        _renumber(db, project_id)
        anchor_new = db.query(models.Task).filter(
            models.Task.project_id == project_id,
            models.Task.sort_order > anchor_sort_order
        ).order_by(models.Task.sort_order).first()
        prev_new = db.query(models.Task).filter(
            models.Task.project_id == project_id,
            models.Task.sort_order <= anchor_sort_order
        ).order_by(models.Task.sort_order.desc()).first()
        if prev_new and anchor_new:
            return _insert_after(db, project_id, prev_new.sort_order)
        return _next_sort_order(db, project_id)
