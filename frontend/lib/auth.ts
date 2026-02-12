import api from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  workspaceName?: string;
}

export interface AuthResponse {
  // Tokens are now in httpOnly cookies (not returned in response body)
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    workspaceId: string;
  };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  workspaceId: string;
  avatar?: string;
}

class AuthService {
  // Tokens are now in httpOnly cookies (not managed by frontend)
  private readonly USER_KEY = 'user';

  /**
   * Login user with credentials
   * Tokens are automatically set as httpOnly cookies by the backend
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    this.setSession(response.data);
    return response.data;
  }

  /**
   * Register new user
   * Tokens are automatically set as httpOnly cookies by the backend
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/register', data);
    this.setSession(response.data);
    return response.data;
  }

  /**
   * Logout user
   * Backend clears httpOnly cookies
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearSession();
    }
  }

  /**
   * Refresh access token
   * Tokens are automatically refreshed via httpOnly cookies
   */
  async refreshToken(): Promise<void> {
    await api.post('/auth/refresh');
    // New tokens are set as httpOnly cookies by the backend
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<User> {
    const response = await api.get<User>('/auth/profile');
    this.setUser(response.data);
    return response.data;
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    this.setUser(response.data);
    return response.data;
  }

  /**
   * Store auth session (only user data, tokens are in httpOnly cookies)
   */
  private setSession(data: AuthResponse): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));
    }
  }

  /**
   * Set user data
   */
  private setUser(user: User): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }
  }

  /**
   * Clear auth session (only user data, cookies cleared by backend)
   */
  clearSession(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.USER_KEY);
    }
  }

  /**
   * Get stored user
   */
  getUser(): User | null {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem(this.USER_KEY);
      if (userStr) {
        try {
          return JSON.parse(userStr);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Check if user is authenticated (based on stored user data)
   * Note: Actual authentication is verified by backend via httpOnly cookies
   */
  isAuthenticated(): boolean {
    return !!this.getUser();
  }
}

export const authService = new AuthService();
export default authService;
