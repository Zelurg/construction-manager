from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from io import BytesIO
from .. import models, schemas
from ..database import get_db
from ..dependencies import get_current_user
from .projects import touch_project

router = APIRouter()

COLUMN_MAP = {
    'A': 'code', 'B': 'name', 'C': 'unit',
    'D': 'volume_plan', 'E': 'start_date_contract', 'F': 'end_date_contract',
    'G': 'start_date_plan', 'H': 'end_date_plan',
    'I': 'unit_price', 'J': 'labor_per_unit', 'K': 'machine_hours_per_unit',
    'L': 'executor',
}


@router.post("/import")
async def import_tasks(
    file: UploadFile = File(...),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Поддерживаются только файлы .xlsx и .xls")

    content = await file.read()
    wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
    ws = wb.active

    tasks_processed = 0
    errors = []
    tasks_to_create = []
    codes_seen = set()

    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not any(row):
            continue
        try:
            task_data = {}
            cols = list('ABCDEFGHIJKL')
            for i, col in enumerate(cols):
                if i < len(row):
                    task_data[COLUMN_MAP[col]] = row[i]

            code = str(task_data.get('code', '')).strip() if task_data.get('code') else None
            name = str(task_data.get('name', '')).strip() if task_data.get('name') else None
            if not code or not name:
                errors.append(f"Строка {row_num}: пропущен код или название")
                continue
            if code in codes_seen:
                errors.append(f"Строка {row_num}: дублирующийся код '{code}'")
                continue
            codes_seen.add(code)

            # Определяем уровень по отступам в наименовании
            raw_name = task_data.get('name', '')
            if isinstance(raw_name, str):
                spaces = len(raw_name) - len(raw_name.lstrip())
                level = spaces // 2
            else:
                level = 0

            # Определяем is_section (нет единицы измерения)
            unit = task_data.get('unit')
            is_section = not unit or str(unit).strip() == ''

            def parse_float(v):
                if v is None or str(v).strip() in ('', '-', 'None'):
                    return 0.0
                try:
                    return float(str(v).replace(',', '.'))
                except:
                    return 0.0

            def parse_date(v):
                if v is None:
                    return None
                if hasattr(v, 'date'):
                    return v.date()
                from datetime import datetime as dt
                for fmt in ('%d.%m.%Y', '%Y-%m-%d', '%d/%m/%Y'):
                    try:
                        return dt.strptime(str(v).strip(), fmt).date()
                    except:
                        pass
                return None

            start_contract = parse_date(task_data.get('start_date_contract'))
            end_contract   = parse_date(task_data.get('end_date_contract'))
            start_plan     = parse_date(task_data.get('start_date_plan'))
            end_plan       = parse_date(task_data.get('end_date_plan'))

            # Если плановые даты не заполнены — копируем из контрактных
            if start_plan is None:
                start_plan = start_contract
            if end_plan is None:
                end_plan = end_contract

            tasks_to_create.append({
                "code": code, "name": name.strip(),
                "unit": str(unit).strip() if unit and str(unit).strip() else None,
                "volume_plan": parse_float(task_data.get('volume_plan')),
                "volume_fact": 0.0,
                "start_date_contract": start_contract,
                "end_date_contract":   end_contract,
                "start_date_plan":     start_plan,
                "end_date_plan":       end_plan,
                "unit_price": parse_float(task_data.get('unit_price')),
                "labor_per_unit": parse_float(task_data.get('labor_per_unit')),
                "machine_hours_per_unit": parse_float(task_data.get('machine_hours_per_unit')),
                "executor": str(task_data.get('executor', '')).strip() or None,
                "is_section": is_section,
                "level": level,
                "parent_code": None,
                "project_id": project_id,
            })
            tasks_processed += 1
        except Exception as e:
            errors.append(f"Строка {row_num}: {str(e)}")

    # Определяем parent_code через стек уровней
    stack = []
    for t in tasks_to_create:
        while stack and stack[-1]['level'] >= t['level']:
            stack.pop()
        t['parent_code'] = stack[-1]['code'] if stack else None
        if t['is_section']:
            stack.append(t)

    # Очищаем старые задачи проекта и вставляем новые
    db.query(models.Task).filter(models.Task.project_id == project_id).delete()
    db.bulk_insert_mappings(models.Task, tasks_to_create)
    db.commit()
    touch_project(project_id, db)

    return {"tasks_processed": tasks_processed, "errors": errors}


@router.get("/export")
def export_tasks(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.Task)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    tasks = query.order_by(models.Task.code).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "График"

    headers = ['Код', 'Наименование', 'Ед.изм.', 'Объём план',
               'Нач.контракт', 'Оконч.контракт', 'Нач.план', 'Оконч.план',
               'Цена за ед.', 'Трудозатраты/ед.', 'Машиночасы/ед.', 'Исполнитель']
    header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal='center')

    for row_num, task in enumerate(tasks, 2):
        indent = '  ' * task.level if task.level else ''
        ws.cell(row=row_num, column=1, value=task.code)
        ws.cell(row=row_num, column=2, value=f"{indent}{task.name}")
        ws.cell(row=row_num, column=3, value=task.unit)
        ws.cell(row=row_num, column=4, value=task.volume_plan)
        ws.cell(row=row_num, column=5, value=str(task.start_date_contract) if task.start_date_contract else None)
        ws.cell(row=row_num, column=6, value=str(task.end_date_contract) if task.end_date_contract else None)
        ws.cell(row=row_num, column=7, value=str(task.start_date_plan) if task.start_date_plan else None)
        ws.cell(row=row_num, column=8, value=str(task.end_date_plan) if task.end_date_plan else None)
        ws.cell(row=row_num, column=9, value=task.unit_price)
        ws.cell(row=row_num, column=10, value=task.labor_per_unit)
        ws.cell(row=row_num, column=11, value=task.machine_hours_per_unit)
        ws.cell(row=row_num, column=12, value=task.executor)
        if task.is_section:
            for col in range(1, 13):
                ws.cell(row=row_num, column=col).font = Font(bold=True)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=schedule_export.xlsx"}
    )
