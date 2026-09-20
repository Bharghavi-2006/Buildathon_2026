import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

let currentEmail: string = localStorage.getItem('sdr_user_email') || 'manager@demo.local';

export const getActiveUserEmail = (): string => currentEmail;

export const setActiveUserEmail = (email: string): void => {
  currentEmail = email;
  localStorage.setItem('sdr_user_email', email);
};

const axiosInstance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use((config) => {
  if (currentEmail) {
    config.headers['X-User-Email'] = currentEmail;
  }
  return config;
});

// A misconfigured API base URL (or a backend that's unreachable) can still resolve to a
// 200 response instead of a network error -- e.g. the request lands on this SPA's own
// static host, which serves index.html for every path. Axios then hands back that HTML
// as a raw string instead of parsed JSON. Every caller in this app expects an object/array,
// so treat any non-JSON 2xx response as a failed request here, once, instead of letting it
// crash wherever the page first tries to read a property off it.
axiosInstance.interceptors.response.use((response) => {
  if (typeof response.data === 'string') {
    return Promise.reject(new Error('Received an unexpected non-JSON response from the API. Check that VITE_API_BASE_URL points to the backend.'));
  }
  return response;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    let message = 'An unexpected error occurred';
    if (error.response?.data) {
      const data = error.response.data as any;
      if (typeof data === 'string') {
        message = data;
      } else if (data.detail) {
        if (typeof data.detail === 'string') {
          message = data.detail;
        } else if (data.detail.message) {
          message = data.detail.message;
        } else if (Array.isArray(data.detail)) {
          message = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        }
      } else if (data.message) {
        message = data.message;
      }
    } else if (error.message) {
      message = error.message;
    }
    return Promise.reject(new Error(message));
  }
);

export const apiClient = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.get<T>(url, config);
    return res.data;
  },
  post: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.post<T>(url, data, config);
    return res.data;
  },
  patch: async <T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.patch<T>(url, data, config);
    return res.data;
  },
  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const res = await axiosInstance.delete<T>(url, config);
    return res.data;
  },
};
