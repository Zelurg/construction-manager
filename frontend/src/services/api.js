import axios from 'axios';
import { API_URL } from '../config';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.error('Токен авторизации истёк или недействителен');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      alert('Сессия истекла. Пожалуйста, войдите заново.');
    }
    return Promise.reject(error);
  }
);

export const importExportAPI = {
  downloadTemplate: () => api.get('/import-export/template/download', { responseType: 'blob' }),
  uploadTemplate: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/import-export/template/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
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

export const employeesAPI = {
  getAll: (params = {}) => api.get('/employees/', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  create: (employee) => api.post('/employees/', employee),
  update: (id, employee) => api.put(`/employees/${id}`, employee),
  delete: (id) => api.delete(`/employees/${id}`),
  deactivate: (id) => api.patch(`/employees/${id}/deactivate`),
  activate: (id) => api.patch(`/employees/${id}/activate`),
};

export const executorsAPI = {
  getByDate: (date) => api.get('/executors/', { params: { work_date: date } }),
  getStats: (date, brigadeId) => api.get('/executors/stats', {
    params: { work_date: date, ...(brigadeId != null ? { brigade_id: brigadeId } : {}) }
  }),
  create: (executor) => api.post('/executors/', executor),
  update: (id, executor) => api.put(`/executors/${id}`, executor),
  delete: (id) => api.delete(`/executors/${id}`),
};

export const equipmentAPI = {
  getAll: (params = {}) => api.get('/equipment/', { params }),
  getById: (id) => api.get(`/equipment/${id}`),
  create: (equipment) => api.post('/equipment/', equipment),
  update: (id, equipment) => api.put(`/equipment/${id}`, equipment),
  delete: (id) => api.delete(`/equipment/${id}`),
  deactivate: (id) => api.patch(`/equipment/${id}/deactivate`),
  activate: (id) => api.patch(`/equipment/${id}/activate`),
};

export const equipmentUsageAPI = {
  getByDate: (date) => api.get('/equipment-usage/', { params: { work_date: date } }),
  getStats: (date, brigadeId) => api.get('/equipment-usage/stats', {
    params: { work_date: date, ...(brigadeId != null ? { brigade_id: brigadeId } : {}) }
  }),
  create: (usage) => api.post('/equipment-usage/', usage),
  update: (id, usage) => api.put(`/equipment-usage/${id}`, usage),
  delete: (id) => api.delete(`/equipment-usage/${id}`),
};

export const brigadesAPI = {
  getByDate: (date) => api.get('/brigades/', { params: { work_date: date } }),
  getStats: (date) => api.get('/brigades/stats', { params: { work_date: date } }),
  create: (brigade) => api.post('/brigades/', brigade),
  update: (id, brigade) => api.put(`/brigades/${id}`, brigade),
  delete: (id) => api.delete(`/brigades/${id}`),
};

export default api;
