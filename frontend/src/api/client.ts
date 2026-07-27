import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Response interceptor for unified error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[API Error]:', error?.response?.data || error.message);
    return Promise.reject(error);
  }
);

export async function checkBackendHealth() {
  const response = await apiClient.get<{ status: string }>('/health');
  return response.data;
}
