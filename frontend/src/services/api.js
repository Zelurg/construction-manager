import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

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
