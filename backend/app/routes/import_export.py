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

@router.get("/template/download")
def download_template():
    """Скачать шаблон Excel для импорта графика"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "График работ"
    
    # Заголовки
    headers = ["Шифр", "Наименование работ", "Ед. изм.", "Объем план", "Дата начала", "Дата окончания"]
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
        ws.column_dimensions[cell.column_letter].width = 20
    
    # Примеры данных
    examples = [
        ["1.1", "Земляные работы", "м³", 1000, "2026-01-01", "2026-02-15"],
        ["1.2", "Бетонные работы", "м³", 500, "2026-02-16", "2026-03-30"],
        ["2.1", "Кирпичная кладка", "м³", 250, "2026-04-01", "2026-05-15"]
    ]
    
    for row_data in examples:
        ws.append(row_data)
    
    # Форматирование столбцов с датами
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=5, max_col=6):
        for cell in row:
            cell.number_format = 'YYYY-MM-DD'
            cell.border = border
    
    # Форматирование остальных ячеек
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=1, max_col=4):
        for cell in row:
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
        required_columns = ["Шифр", "Наименование работ", "Ед. изм.", "Объем план", "Дата начала", "Дата окончания"]
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
                
                # Преобразование дат
                start_date = pd.to_datetime(row["Дата начала"]).date() if not pd.isna(row["Дата начала"]) else None
                end_date = pd.to_datetime(row["Дата окончания"]).date() if not pd.isna(row["Дата окончания"]) else None
                
                if not start_date or not end_date:
                    errors.append(f"Строка {idx + 2}: отсутствуют даты")
                    continue
                
                # Проверка существования задачи с таким кодом
                existing_task = db.query(models.Task).filter(models.Task.code == str(row["Шифр"])).first()
                
                if existing_task:
                    # Обновление существующей задачи
                    existing_task.name = str(row["Наименование работ"])
                    existing_task.unit = str(row["Ед. изм."])
                    existing_task.volume_plan = float(row["Объем план"])
                    existing_task.start_date = start_date
                    existing_task.end_date = end_date
                    db.commit()
                    created_tasks.append({"action": "updated", "code": existing_task.code})
                else:
                    # Создание новой задачи
                    task = models.Task(
                        code=str(row["Шифр"]),
                        name=str(row["Наименование работ"]),
                        unit=str(row["Ед. изм."]),
                        volume_plan=float(row["Объем план"]),
                        volume_fact=0,
                        start_date=start_date,
                        end_date=end_date
                    )
                    db.add(task)
                    db.commit()
                    created_tasks.append({"action": "created", "code": task.code})
                    
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
