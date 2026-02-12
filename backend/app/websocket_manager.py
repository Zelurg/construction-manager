from fastapi import WebSocket
from typing import List, Dict, Set
import json
from datetime import datetime

class ConnectionManager:
    def __init__(self):
        # Активные WebSocket подключения
        self.active_connections: List[WebSocket] = []
        # Подписки пользователей на конкретные типы событий
        self.subscriptions: Dict[str, Set[WebSocket]] = {
            "tasks": set(),
            "daily_works": set(),
            "monthly_tasks": set(),
            "analytics": set()
        }
    
    async def connect(self, websocket: WebSocket):
        """Подключение нового клиента"""
        await websocket.accept()
        self.active_connections.append(websocket)
        # По умолчанию подписываем на все события
        for event_type in self.subscriptions:
            self.subscriptions[event_type].add(websocket)
    
    def disconnect(self, websocket: WebSocket):
        """Отключение клиента"""
        self.active_connections.remove(websocket)
        # Удаляем из всех подписок
        for event_type in self.subscriptions:
            self.subscriptions[event_type].discard(websocket)
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Отправка сообщения конкретному клиенту"""
        await websocket.send_json(message)
    
    async def broadcast(self, message: dict, event_type: str = None):
        """
        Рассылка сообщения всем подключенным клиентам
        Если указан event_type, отправляется только подписанным на этот тип
        """
        # Добавляем timestamp
        message["timestamp"] = datetime.now().isoformat()
        
        # Определяем список получателей
        if event_type and event_type in self.subscriptions:
            recipients = self.subscriptions[event_type]
        else:
            recipients = self.active_connections
        
        # Отправляем сообщение
        disconnected = []
        for connection in recipients:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error sending message: {e}")
                disconnected.append(connection)
        
        # Удаляем отключившихся клиентов
        for connection in disconnected:
            self.disconnect(connection)
    
    async def subscribe(self, websocket: WebSocket, event_types: List[str]):
        """Подписка на конкретные типы событий"""
        for event_type in event_types:
            if event_type in self.subscriptions:
                self.subscriptions[event_type].add(websocket)
    
    async def unsubscribe(self, websocket: WebSocket, event_types: List[str]):
        """Отписка от типов событий"""
        for event_type in event_types:
            if event_type in self.subscriptions:
                self.subscriptions[event_type].discard(websocket)

# Глобальный экземпляр менеджера
manager = ConnectionManager()
