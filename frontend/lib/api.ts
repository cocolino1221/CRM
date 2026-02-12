import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

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

// Request interceptor - tokens are now in httpOnly cookies (sent automatically)
// No need to manually add Authorization header
api.interceptors.request.use(
  (config: InternalAxionsRequestConfig) => {
    // Cookies are automatically included with withCredentials: true
    // No manual token management needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors and token refresh
api.interceptors.response.use(
  (response) => response,
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

          // New tokens are set as httpOnly cookies by the backend
          // No need to manually store them

          processQueue(null, 'refreshed');
          isRefreshing = false;

          // Retry the original request (cookies will be sent automatically)
          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError as AxiosError, null);
          isRefreshing = false;

          // Clear stored user data so AuthGuard doesn't redirect back to dashboard
          localStorage.removeItem('user');

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