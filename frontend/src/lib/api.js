import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  verify: () => api.get('/auth/verify'),
};

// Members API
export const membersAPI = {
  getAll: () => api.get('/members'),
  create: (data) => api.post('/members', data),
  delete: (id) => api.delete(`/members/${id}`),
  getCount: () => api.get('/members/count'),
};

// Expenses API
export const expensesAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  create: (data) => api.post('/expenses', data),
  toggleSettled: (id, settled) => api.patch(`/expenses/${id}/settle`, { settled }),
  delete: (id) => api.delete(`/expenses/${id}`),
  getStats: () => api.get('/expenses/stats'),
};

// Balances API
export const balancesAPI = {
  get: () => api.get('/balances'),
};

// Settlements API
export const settlementsAPI = {
  markAsPaid: (data) => api.post('/settlements', data),
  getHistory: (params) => api.get('/settlements/history', { params }),
  delete: (id) => api.delete(`/settlements/${id}`),
};

export default api;
