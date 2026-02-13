import { WS_URL } from '../config';

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
  }

  connect(url = WS_URL) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    console.log('Connecting to WebSocket:', url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.notifyListeners('connection', { status: 'connected' });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('WebSocket message received:', message);
        
        // Уведомляем слушателей - используем message.type как основной тип события
        const eventType = message.type || message.event;
        if (eventType) {
          console.log(`📡 Calling listeners for: ${eventType}`);
          this.notifyListeners(eventType, message);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.notifyListeners('error', { error });
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.notifyListeners('connection', { status: 'disconnected' });
      
      // Попытка переподключения
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
        setTimeout(() => this.connect(url), this.reconnectDelay);
      }
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }

  subscribe(eventTypes) {
    this.send({
      action: 'subscribe',
      events: eventTypes
    });
  }

  unsubscribe(eventTypes) {
    this.send({
      action: 'unsubscribe',
      events: eventTypes
    });
  }

  // Добавить слушателя для конкретного типа события
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
    console.log(`🎯 Registered listener for: ${eventType}, total: ${this.listeners.get(eventType).length}`);
  }

  // Удалить слушателя
  off(eventType, callback) {
    if (this.listeners.has(eventType)) {
      const callbacks = this.listeners.get(eventType);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Уведомить всех слушателей о событии
  notifyListeners(eventType, data) {
    if (this.listeners.has(eventType)) {
      const callbacks = this.listeners.get(eventType);
      console.log(`🔔 Notifying ${callbacks.length} listener(s) for: ${eventType}`);
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in listener for ${eventType}:`, error);
        }
      });
    } else {
      console.log(`⚠️ No listeners registered for: ${eventType}`);
    }
  }

  ping() {
    this.send({
      action: 'ping',
      timestamp: new Date().toISOString()
    });
  }
}

// Создаём singleton экземпляр
const websocketService = new WebSocketService();

export default websocketService;
