import axios from 'axios';
import { API_URL } from '../config';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Добавляем интерцептор для автоматического добавления токена
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const importExportAPI = {
  downloadTemplate: async () => {
    const response = await api.get('/import-export/template/download', {
      responseType: 'blob'
    });
    return response;
  },
  
  uploadTemplate: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/import-export/template/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response;
  }
};

export const scheduleAPI = {
  getTasks: () => api.get('/schedule/tasks'),
  createTask: (task) => api.post('/schedule/tasks', task),
  updateTask: (id, task) => api.put(`/schedule/tasks/${id}`, task),
  deleteTask: (id) => api.delete(`/schedule/tasks/${id}`),
  clearAll: () => api.post('/schedule/clear'),
};

export const monthlyAPI = {
  getTasks: (month) => api.get('/monthly/tasks/with-details', { params: { month } }),
  createTask: (task) => api.post('/monthly/tasks', task),
};

export const dailyAPI = {
  getWorks: (date) => api.get('/daily/works/with-details', { params: { work_date: date } }),
  createWork: (work) => api.post('/daily/works', work),
};

export const analyticsAPI = {
  getData: () => api.get('/analytics/'),
};

// Новые API для справочника сотрудников
export const employeesAPI = {
  // Получить список всех сотрудников
  getAll: (params = {}) => api.get('/employees/', { params }),
  
  // Получить сотрудника по ID
  getById: (id) => api.get(`/employees/${id}`),
  
  // Создать нового сотрудника
  create: (employee) => api.post('/employees/', employee),
  
  // Обновить данные сотрудника
  update: (id, employee) => api.put(`/employees/${id}`, employee),
  
  // Удалить сотрудника
  delete: (id) => api.delete(`/employees/${id}`),
  
  // Деактивировать сотрудника (безопасная альтернатива удалению)
  deactivate: (id) => api.patch(`/employees/${id}/deactivate`),
  
  // Активировать сотрудника
  activate: (id) => api.patch(`/employees/${id}/activate`),
};

// Новые API для исполнителей работ
export const executorsAPI = {
  // Получить список исполнителей за конкретную дату
  getByDate: (date) => api.get('/executors/', { params: { work_date: date } }),
  
  // Получить статистику по исполнителям за день
  getStats: (date) => api.get('/executors/stats', { params: { work_date: date } }),
  
  // Добавить исполнителя на день
  create: (executor) => api.post('/executors/', executor),
  
  // Обновить данные исполнителя (например, часы работы)
  update: (id, executor) => api.put(`/executors/${id}`, executor),
  
  // Удалить исполнителя из дня
  delete: (id) => api.delete(`/executors/${id}`),
};

export default api;
