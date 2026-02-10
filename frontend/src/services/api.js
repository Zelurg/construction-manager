import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
});

export const scheduleAPI = {
  getTasks: () => api.get('/schedule/tasks'),
  createTask: (task) => api.post('/schedule/tasks', task),
  updateTask: (id, task) => api.put(`/schedule/tasks/${id}`, task),
  deleteTask: (id) => api.delete(`/schedule/tasks/${id}`),
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

export default api;
