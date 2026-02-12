from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..websocket_manager import manager
import json

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket эндпоинт для real-time обновлений
    
    Клиент может отправлять команды:
    - {"action": "subscribe", "events": ["tasks", "daily_works"]}
    - {"action": "unsubscribe", "events": ["analytics"]}
    - {"action": "ping"} - для проверки соединения
    """
    await manager.connect(websocket)
    
    try:
        # Отправляем приветственное сообщение
        await manager.send_personal_message({
            "type": "connection",
            "status": "connected",
            "message": "Successfully connected to Construction Manager real-time updates"
        }, websocket)
        
        # Слушаем входящие сообщения от клиента
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                action = message.get("action")
                
                if action == "subscribe":
                    event_types = message.get("events", [])
                    await manager.subscribe(websocket, event_types)
                    await manager.send_personal_message({
                        "type": "subscription",
                        "status": "success",
                        "subscribed_to": event_types
                    }, websocket)
                
                elif action == "unsubscribe":
                    event_types = message.get("events", [])
                    await manager.unsubscribe(websocket, event_types)
                    await manager.send_personal_message({
                        "type": "subscription",
                        "status": "success",
                        "unsubscribed_from": event_types
                    }, websocket)
                
                elif action == "ping":
                    await manager.send_personal_message({
                        "type": "pong",
                        "timestamp": message.get("timestamp")
                    }, websocket)
            
            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "error",
                    "message": "Invalid JSON format"
                }, websocket)
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"Client disconnected")
