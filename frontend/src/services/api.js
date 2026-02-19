import axios from 'axios';
import { API_URL } from '../config';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('currentProject');
      window.location.href = '/login';
      alert('Сессия истекла. Пожалуйста, войдите заново.');
    }
    return Promise.reject(error);
  }
);

// ─── helpers ────────────────────────────────────────────────────────────────
const projectParams = (extra = {}) => {
  const p = JSON.parse(localStorage.getItem('currentProject') || 'null');
  return p ? { project_id: p.id, ...extra } : { ...extra };
};

// ─── Projects ────────────────────────────────────────────────────────────────
export const projectsAPI = {
  getAll: (includeArchived = false) =>
    api.get('/projects/', { params: { include_archived: includeArchived } }),
  getById: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects/', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
};

// ─── Import / Export ─────────────────────────────────────────────────────────
export const importExportAPI = {
  downloadTemplate: () =>
    api.get('/import-export/template/download', { responseType: 'blob' }),
  uploadTemplate: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/import-export/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: projectParams(),
    });
  },
  exportTasks: () =>
    api.get('/import-export/export', {
      params: projectParams(),
      responseType: 'blob',
    }),
};

// ─── Schedule ────────────────────────────────────────────────────────────────
export const scheduleAPI = {
  getTasks: () => api.get('/schedule/tasks', { params: projectParams() }),
  createTask: (task) =>
    api.post('/schedule/tasks', task, { params: projectParams() }),
  updateTask: (id, task) => api.put(`/schedule/tasks/${id}`, task),
  deleteTask: (id) => api.delete(`/schedule/tasks/${id}`),
  clearAll: () =>
    api.delete('/schedule/tasks', { params: projectParams() }),
};

// ─── Monthly ─────────────────────────────────────────────────────────────────
export const monthlyAPI = {
  getTasks: (month) =>
    api.get('/monthly/', { params: projectParams({ month }) }),
  createTask: (task) => api.post('/monthly/', task),
  updateTask: (id, task) => api.put(`/monthly/${id}`, task),
  deleteTask: (id) => api.delete(`/monthly/${id}`),
};

// ─── Daily ───────────────────────────────────────────────────────────────────
export const dailyAPI = {
  getWorks: (date) =>
    api.get('/daily/', { params: projectParams({ work_date: date }) }),
  createWork: (work) => api.post('/daily/', work),
  deleteWork: (id) => api.delete(`/daily/${id}`),
};

// ─── Analytics ───────────────────────────────────────────────────────────────
export const analyticsAPI = {
  getData: () => api.get('/analytics/', { params: projectParams() }),
};

// ─── Employees (global) ──────────────────────────────────────────────────────
export const employeesAPI = {
  getAll: (params = {}) => api.get('/employees/', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  create: (employee) => api.post('/employees/', employee),
  update: (id, employee) => api.put(`/employees/${id}`, employee),
  delete: (id) => api.delete(`/employees/${id}`),
  deactivate: (id) => api.patch(`/employees/${id}/deactivate`),
  activate: (id) => api.patch(`/employees/${id}/activate`),
};

// ─── Executors ───────────────────────────────────────────────────────────────
export const executorsAPI = {
  getByDate: (date) =>
    api.get('/executors/', { params: { work_date: date } }),
  getStats: (date, brigadeId) =>
    api.get('/executors/stats', {
      params: { work_date: date, ...(brigadeId != null ? { brigade_id: brigadeId } : {}) },
    }),
  create: (executor) => api.post('/executors/', executor),
  update: (id, executor) => api.put(`/executors/${id}`, executor),
  delete: (id) => api.delete(`/executors/${id}`),
};

// ─── Equipment (global) ──────────────────────────────────────────────────────
export const equipmentAPI = {
  getAll: (params = {}) => api.get('/equipment/', { params }),
  getById: (id) => api.get(`/equipment/${id}`),
  create: (equipment) => api.post('/equipment/', equipment),
  update: (id, equipment) => api.put(`/equipment/${id}`, equipment),
  delete: (id) => api.delete(`/equipment/${id}`),
  deactivate: (id) => api.patch(`/equipment/${id}/deactivate`),
  activate: (id) => api.patch(`/equipment/${id}/activate`),
};

// ─── Equipment Usage ─────────────────────────────────────────────────────────
export const equipmentUsageAPI = {
  getByDate: (date) =>
    api.get('/equipment-usage/', { params: { work_date: date } }),
  getStats: (date, brigadeId) =>
    api.get('/equipment-usage/stats', {
      params: { work_date: date, ...(brigadeId != null ? { brigade_id: brigadeId } : {}) },
    }),
  create: (usage) => api.post('/equipment-usage/', usage),
  update: (id, usage) => api.put(`/equipment-usage/${id}`, usage),
  delete: (id) => api.delete(`/equipment-usage/${id}`),
};

// ─── Brigades ────────────────────────────────────────────────────────────────
export const brigadesAPI = {
  getByDate: (date) =>
    api.get('/brigades/', { params: projectParams({ work_date: date }) }),
  getStats: (date) =>
    api.get('/brigades/stats', { params: projectParams({ work_date: date }) }),
  create: (brigade) => api.post('/brigades/', brigade),
  update: (id, brigade) => api.put(`/brigades/${id}`, brigade),
  delete: (id) => api.delete(`/brigades/${id}`),
};

export default api;
