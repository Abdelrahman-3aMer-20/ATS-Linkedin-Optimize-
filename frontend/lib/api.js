import axios from 'axios';
import Cookies from 'js-cookie';
import toast from 'react-hot-toast';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Something went wrong';
    
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      Cookies.remove('token');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    
    if (error.response?.status === 403) {
      // Forbidden - show upgrade message for plan limits
      if (message.includes('limit reached') || message.includes('requires')) {
        toast.error(message, { duration: 5000 });
      } else {
        toast.error(message);
      }
      return Promise.reject(error);
    }
    
    // Show error toast for other errors
    if (error.response?.status >= 400) {
      toast.error(message);
    }
    
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  generateApiKey: () => api.post('/auth/generate-api-key'),
  revokeApiKey: () => api.delete('/auth/revoke-api-key'),
};

// CV Analysis API
export const cvAPI = {
  analyze: (formData) => api.post('/cv/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  getAnalysis: (id) => api.get(`/cv/analysis/${id}`),
  getHistory: (params) => api.get('/cv/history', { params }),
  optimize: (id) => api.post(`/cv/optimize/${id}`),
  exportPDF: (id, useOptimized = false) => api.post(`/cv/export/${id}`, 
    { useOptimized }, 
    { responseType: 'blob' }
  ),
  compare: (id) => api.get(`/cv/compare/${id}`),
};

// LinkedIn Analysis API
export const linkedinAPI = {
  analyze: (data) => api.post('/linkedin/analyze', data),
  analyzeContent: (data) => api.post('/linkedin/analyze-content', data),
  getAnalysis: (id) => api.get(`/linkedin/analysis/${id}`),
  getHistory: (params) => api.get('/linkedin/history', { params }),
  optimize: (id) => api.post(`/linkedin/optimize/${id}`),
  compare: (id) => api.get(`/linkedin/compare/${id}`),
};

// Payment API
export const paymentAPI = {
  createCheckout: (data) => api.post('/payments/create-checkout', data),
  getHistory: () => api.get('/payments/history'),
  cancelSubscription: () => api.post('/payments/cancel-subscription'),
};

// Admin API
export const adminAPI = {
  getDashboard: () => api.get('/admin/dashboard'),
  getUsers: (params) => api.get('/admin/users', { params }),
  getUser: (id) => api.get(`/admin/users/${id}`),
  updateUserPlan: (id, data) => api.patch(`/admin/users/${id}/plan`, data),
  getPayments: (params) => api.get('/admin/payments', { params }),
  getAnalytics: (params) => api.get('/admin/analytics', { params }),
  exportData: (type, params) => api.get(`/admin/export/${type}`, { 
    params,
    responseType: 'blob'
  }),
};

// Public API (with API key)
export const publicAPI = {
  getDocs: () => api.get('/v1/docs'),
  getUser: () => api.get('/v1/user'),
  getCVAnalyses: (params) => api.get('/v1/cv/analyses', { params }),
  getCVAnalysis: (id) => api.get(`/v1/cv/analysis/${id}`),
  analyzeCVText: (data) => api.post('/v1/cv/analyze-text', data),
  getLinkedInAnalyses: (params) => api.get('/v1/linkedin/analyses', { params }),
  getLinkedInAnalysis: (id) => api.get(`/v1/linkedin/analysis/${id}`),
  analyzeLinkedInContent: (data) => api.post('/v1/linkedin/analyze-content', data),
};

// Utility functions
export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getScoreColor = (score) => {
  if (score >= 80) return 'text-success-600';
  if (score >= 60) return 'text-warning-600';
  return 'text-danger-600';
};

export const getScoreBadgeColor = (score) => {
  if (score >= 80) return 'badge-success';
  if (score >= 60) return 'badge-warning';
  return 'badge-danger';
};

export const getPlanColor = (plan) => {
  switch (plan) {
    case 'pro':
      return 'badge-primary';
    case 'basic':
      return 'badge-success';
    case 'one-time':
      return 'badge-warning';
    default:
      return 'badge-secondary';
  }
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount / 100); // Assuming amount is in cents
};

export default api;
