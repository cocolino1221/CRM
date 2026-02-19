import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending httpOnly cookies with requests
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor — cookies sent automatically; also add Bearer header as
// fallback for iOS Safari (ITP blocks cross-site httpOnly cookies)
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Let browser set multipart boundaries for FormData uploads.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      const headers = config.headers as any;
      if (headers?.delete) {
        headers.delete('Content-Type');
        headers.delete('content-type');
      } else if (headers) {
        delete headers['Content-Type'];
        delete headers['content-type'];
      }
    }

    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors and token refresh
api.interceptors.response.use(
  (response) => {
    // If the backend returns a new accessToken in the body, store it for Bearer fallback
    if (typeof window !== 'undefined' && response.data?.accessToken) {
      localStorage.setItem('accessToken', response.data.accessToken);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue the request while token is being refreshed
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      if (typeof window !== 'undefined') {
        try {
          // Attempt to refresh the token (cookies sent automatically)
          const response = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            {}, // Empty body - refresh token is in httpOnly cookie
            { withCredentials: true } // Ensure cookies are sent
          );

          // New tokens are set as httpOnly cookies; accessToken also in response body
          // (response interceptor above already saves it to localStorage)
          const newToken = response.data?.accessToken ?? null;

          processQueue(null, newToken);
          isRefreshing = false;

          // Retry the original request
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError as AxiosError, null);
          isRefreshing = false;

          // Clear stored user data so AuthGuard doesn't redirect back to dashboard
          localStorage.removeItem('user');
          localStorage.removeItem('accessToken');

          // Refresh failed, redirect to login (only if not already on auth pages)
          const currentPath = window.location.pathname;
          const isAuthPage = currentPath.startsWith('/login') ||
                            currentPath.startsWith('/register') ||
                            currentPath.startsWith('/forgot-password');

          if (!isAuthPage) {
            window.location.href = '/login';
          }
          return Promise.reject(refreshError);
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
