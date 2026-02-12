from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from datetime import datetime, date
import pandas as pd
import openpyxl
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from io import BytesIO
from typing import List
from .. import models, schemas
from ..database import get_db

router = APIRouter()

def detect_section_level(code: str) -> int:
    """
    Определяет уровень вложенности по количеству точек в шифре
    Примеры:
    - "1" -> level 0
    - "1.1" -> level 1
    - "1.1.1" -> level 2
    - "1.1.1.1" -> level 3
    """
    return code.count('.')

def get_parent_code(code: str) -> str:
    """
    Получает шифр родительского раздела
    Примеры:
    - "1.1.2" -> "1.1"
    - "1.1" -> "1"
    - "1" -> None
    """
    parts = code.split('.')
    if len(parts) <= 1:
        return None
    return '.'.join(parts[:-1])

@router.get("/template/download")
def download_template():
    """Скачать шаблон Excel для импорта графика"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "График работ"
    
    # Заголовки - добавлены контрактные даты
    headers = [
        "Шифр", 
        "Наименование работ", 
        "Ед. изм.", 
        "Объем план", 
        "Дата начала (контракт)", 
        "Дата окончания (контракт)",
        "Цена за ед.",
        "Трудозатраты на ед. (чел-час)",
        "Машиночасы на ед.",
        "Исполнитель"
    ]
    ws.append(headers)
    
    # Стилизация заголовков
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    for col_num, cell in enumerate(ws[1], 1):
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border
        if col_num <= 2:
            ws.column_dimensions[cell.column_letter].width = 25
        elif col_num <= 6:
            ws.column_dimensions[cell.column_letter].width = 18
        else:
            ws.column_dimensions[cell.column_letter].width = 25
    
    # Примеры данных с иерархическими разделами
    examples = [
        # Раздел уровня 0 (без ед. изм.)
        ["1.", "Раздел CMP", "", "", "", "", "", "", "", ""],
        # Подраздел уровня 1
        ["1.1", "Строительные работы", "", "", "", "", "", "", "", ""],
        # Работы уровня 2
        ["1.1.1", "Земляные работы", "м³", 1000, "2026-01-01", "2026-02-15", 150.5, 0.5, 0.25, "Бригада №1"],
        ["1.1.2", "Бетонные работы", "м³", 500, "2026-02-16", "2026-03-30", 350.75, 1.2, 0.8, "Бригада №2"],
        ["1.1.3", "Кирпичная кладка", "м³", 250, "2026-04-01", "2026-05-15", 280, 2.5, 0.1, "Бригада №3"]
    ]
    
    for row_data in examples:
        ws.append(row_data)
    
    # Форматирование столбцов с датами (колонки 5-6)
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=5, max_col=6):
        for cell in row:
            cell.number_format = 'YYYY-MM-DD'
            cell.border = border
    
    # Форматирование остальных ячеек
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=1, max_col=10):
        for cell in row:
            if cell.column < 5 or cell.column > 6:
                cell.border = border
    
    # Сохранение в BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=template_schedule.xlsx"}
    )

@router.post("/template/upload")
async def upload_template(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Загрузить заполненный шаблон Excel"""
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Файл должен быть в формате Excel (.xlsx или .xls)")
    
    try:
        # Чтение файла
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents))
        
        # Проверка наличия необходимых колонок
        required_columns = ["Шифр", "Наименование работ"]
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(
                status_code=400,
                detail=f"Файл должен содержать колонки: {', '.join(required_columns)}"
            )
        
        created_tasks = []
        errors = []
        
        # Обработка каждой строки
        for idx, row in df.iterrows():
            try:
                # Пропускаем строки с пустыми значениями
                if pd.isna(row["Шифр"]) or pd.isna(row["Наименование работ"]):
                    continue
                
                code = str(row["Шифр"]).strip()
                name = str(row["Наименование работ"]).strip()
                
                # Определяем, является ли строка разделом
                # Раздел = нет единицы измерения
                unit = row.get("Ед. изм.", "")
                is_section = pd.isna(unit) or str(unit).strip() == ""
                
                # Определяем уровень и родителя
                level = detect_section_level(code)
                parent_code = get_parent_code(code)
                
                # Проверка существования задачи
                existing_task = db.query(models.Task).filter(models.Task.code == code).first()
                
                if is_section:
                    # Обработка раздела
                    if existing_task:
                        existing_task.name = name
                        existing_task.is_section = True
                        existing_task.level = level
                        existing_task.parent_code = parent_code
                        db.commit()
                        created_tasks.append({"action": "updated", "code": code, "type": "section"})
                    else:
                        task = models.Task(
                            code=code,
                            name=name,
                            unit=None,
                            volume_plan=0,
                            volume_fact=0,
                            start_date_contract=None,
                            end_date_contract=None,
                            start_date_plan=None,
                            end_date_plan=None,
                            is_section=True,
                            level=level,
                            parent_code=parent_code
                        )
                        db.add(task)
                        db.commit()
                        created_tasks.append({"action": "created", "code": code, "type": "section"})
                else:
                    # Обработка работы
                    # Преобразование дат (из Excel загружаются контрактные даты)
                    start_date_contract = pd.to_datetime(row["Дата начала (контракт)"]).date() if "Дата начала (контракт)" in row and not pd.isna(row["Дата начала (контракт)"]) else None
                    end_date_contract = pd.to_datetime(row["Дата окончания (контракт)"]).date() if "Дата окончания (контракт)" in row and not pd.isna(row["Дата окончания (контракт)"]) else None
                    
                    if not start_date_contract or not end_date_contract:
                        errors.append(f"Строка {idx + 2} ({code}): отсутствуют даты")
                        continue
                    
                    # Плановые даты = контрактные при первом импорте
                    start_date_plan = start_date_contract
                    end_date_plan = end_date_contract
                    
                    # Читаем опциональные поля
                    volume_plan = float(row.get("Объем план", 0)) if "Объем план" in row and not pd.isna(row["Объем план"]) else 0
                    unit_price = float(row.get("Цена за ед.", 0)) if "Цена за ед." in row and not pd.isna(row["Цена за ед."]) else 0
                    labor_per_unit = float(row.get("Трудозатраты на ед. (чел-час)", 0)) if "Трудозатраты на ед. (чел-час)" in row and not pd.isna(row["Трудозатраты на ед. (чел-час)"]) else 0
                    machine_hours_per_unit = float(row.get("Машиночасы на ед.", 0)) if "Машиночасы на ед." in row and not pd.isna(row["Машиночасы на ед."]) else 0
                    executor = str(row.get("Исполнитель", "")) if "Исполнитель" in row and not pd.isna(row["Исполнитель"]) else None
                    
                    if existing_task:
                        # Обновление
                        existing_task.name = name
                        existing_task.unit = str(unit).strip()
                        existing_task.volume_plan = volume_plan
                        existing_task.start_date_contract = start_date_contract
                        existing_task.end_date_contract = end_date_contract
                        # Плановые даты не перезаписываем если они уже есть
                        if not existing_task.start_date_plan:
                            existing_task.start_date_plan = start_date_plan
                        if not existing_task.end_date_plan:
                            existing_task.end_date_plan = end_date_plan
                        existing_task.unit_price = unit_price
                        existing_task.labor_per_unit = labor_per_unit
                        existing_task.machine_hours_per_unit = machine_hours_per_unit
                        existing_task.executor = executor
                        existing_task.is_section = False
                        existing_task.level = level
                        existing_task.parent_code = parent_code
                        db.commit()
                        created_tasks.append({"action": "updated", "code": code, "type": "task"})
                    else:
                        # Создание
                        task = models.Task(
                            code=code,
                            name=name,
                            unit=str(unit).strip(),
                            volume_plan=volume_plan,
                            volume_fact=0,
                            start_date_contract=start_date_contract,
                            end_date_contract=end_date_contract,
                            start_date_plan=start_date_plan,
                            end_date_plan=end_date_plan,
                            unit_price=unit_price,
                            labor_per_unit=labor_per_unit,
                            machine_hours_per_unit=machine_hours_per_unit,
                            executor=executor,
                            is_section=False,
                            level=level,
                            parent_code=parent_code
                        )
                        db.add(task)
                        db.commit()
                        created_tasks.append({"action": "created", "code": code, "type": "task"})
                    
            except Exception as e:
                errors.append(f"Строка {idx + 2}: {str(e)}")
                continue
        
        return {
            "success": True,
            "tasks_processed": len(created_tasks),
            "tasks": created_tasks,
            "errors": errors
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка обработки файла: {str(e)}")
