from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user, get_current_admin_user

router = APIRouter()


@router.get("/", response_model=List[schemas.Project])
def get_projects(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Список объектов.
    - Обычные пользователи видят только активные (is_archived=False).
    - Админ может запросить include_archived=true и увидит все.
    """
    query = db.query(models.Project)
    if not include_archived or current_user.role != "admin":
        query = query.filter(models.Project.is_archived == False)
    return query.order_by(models.Project.created_at).all()


@router.post("/", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    """Создать новый объект. Только admin."""
    db_project = models.Project(
        name=project.name,
        description=project.description,
        address=project.address,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.put("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: int,
    project: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user)
):
    """Обновить объект (название, описание, адрес, архивирование). Только admin."""
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Объект не найден")

    update_data = project.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)

    db_project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_project)
    return db_project


@router.get("/{project_id}", response_model=schemas.Project)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Объект не найден")
    if db_project.is_archived and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Объект в архиве")
    return db_project


def touch_project(project_id: int, db: Session):
    """Обновить updated_at объекта при любом изменении данных внутри него."""
    if project_id:
        db.query(models.Project).filter(
            models.Project.id == project_id
        ).update({"updated_at": datetime.utcnow()})
        db.commit()
