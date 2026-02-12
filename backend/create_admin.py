"""
Скрипт для создания первого администратора
Запустите: python create_admin.py
"""
from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash

def create_admin():
    db = SessionLocal()
    
    # Проверяем, есть ли уже администратор
    existing_admin = db.query(User).filter(User.role == "admin").first()
    if existing_admin:
        print(f"Администратор уже существует: {existing_admin.username}")
        db.close()
        return
    
    # Создаем администратора
    admin = User(
        username="admin",
        email="admin@construction-manager.com",
        full_name="Администратор",
        hashed_password=get_password_hash("admin123"),
        role="admin"
    )
    
    db.add(admin)
    db.commit()
    db.refresh(admin)
    
    print("=" * 50)
    print("Администратор успешно создан!")
    print("=" * 50)
    print(f"Имя пользователя: admin")
    print(f"Пароль: admin123")
    print(f"Email: admin@construction-manager.com")
    print("=" * 50)
    print("ВАЖНО: Измените пароль после первого входа!")
    print("=" * 50)
    
    db.close()

if __name__ == "__main__":
    create_admin()
