class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
  }

  connect(url = 'ws://localhost:8000/api/ws') {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

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
        
        // Уведомляем слушателей
        const eventType = message.event || message.type;
        this.notifyListeners(eventType, message);
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
      this.listeners.get(eventType).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in listener for ${eventType}:`, error);
        }
      });
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
