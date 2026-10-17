import axios, { type InternalAxiosRequestConfig, type AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = 'https://slackcrm-backend.fly.dev/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

function isFormDataPayload(value: unknown): boolean {
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return true;
  }

  // React Native FormData can behave slightly differently across runtimes.
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as { append?: unknown }).append === 'function'
    && Array.isArray((value as { _parts?: unknown })._parts),
  );
}

let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (r: unknown) => void }> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  failedQueue = [];
};

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (isFormDataPayload(config.data)) {
    const headers = config.headers as any;
    if (headers?.delete) {
      headers.delete('Content-Type');
      headers.delete('content-type');
    } else if (headers) {
      delete headers['Content-Type'];
      delete headers['content-type'];
    }
  }

  const token = await AsyncStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  async (response) => {
    if (response.data?.accessToken) {
      await AsyncStorage.setItem('accessToken', response.data.accessToken);
    }
    return response;
  },
  async (error: AxiosError) => {
    const orig = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const requestUrl = String(orig?.url || '');
    const isAuthEndpoint = /^\/?auth\/(login|register|refresh|logout)(\/|$)/i.test(requestUrl);
    const hasAccessToken = Boolean(await AsyncStorage.getItem('accessToken'));

    // Don't try token refresh for auth endpoints or anonymous requests.
    if (error.response?.status === 401 && !orig._retry && !isAuthEndpoint && hasAccessToken) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          if (orig.headers) orig.headers.Authorization = `Bearer ${token}`;
          return api(orig);
        });
      }
      orig._retry = true;
      isRefreshing = true;
      try {
        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {});
        const newToken = res.data?.accessToken ?? null;
        if (newToken) await AsyncStorage.setItem('accessToken', newToken);
        processQueue(null, newToken);
        isRefreshing = false;
        return api(orig);
      } catch (refreshErr) {
        processQueue(refreshErr as AxiosError, null);
        isRefreshing = false;
        await AsyncStorage.multiRemove(['user', 'accessToken']);
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
