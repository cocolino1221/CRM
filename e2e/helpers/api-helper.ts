import { APIRequestContext } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';

/**
 * API Helper class for making authenticated API calls in tests
 */
export class ApiHelper {
  private request: APIRequestContext;
  private token: string | null = null;

  constructor(request: APIRequestContext) {
    this.request = request;
  }

  /**
   * Login and store token
   */
  async login(email: string, password: string): Promise<string> {
    const response = await this.request.post(`${API_URL}/auth/login`, {
      data: { email, password },
    });

    if (!response.ok()) {
      throw new Error(`Login failed: ${response.status()}`);
    }

    const data = await response.json();
    this.token = data.accessToken;
    return this.token;
  }

  /**
   * Get auth headers
   */
  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a contact via API
   */
  async createContact(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    status?: string;
  }): Promise<any> {
    const response = await this.request.post(`${API_URL}/contacts`, {
      headers: this.getHeaders(),
      data,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Failed to create contact: ${error}`);
    }

    return response.json();
  }

  /**
   * Create a deal via API
   */
  async createDeal(data: {
    title: string;
    value: number;
    currency?: string;
    contactId?: string;
    stageId?: string;
  }): Promise<any> {
    const response = await this.request.post(`${API_URL}/deals`, {
      headers: this.getHeaders(),
      data,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Failed to create deal: ${error}`);
    }

    return response.json();
  }

  /**
   * Create a task via API
   */
  async createTask(data: {
    title: string;
    description?: string;
    dueDate?: string;
    priority?: string;
    contactId?: string;
    dealId?: string;
  }): Promise<any> {
    const response = await this.request.post(`${API_URL}/tasks`, {
      headers: this.getHeaders(),
      data,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Failed to create task: ${error}`);
    }

    return response.json();
  }

  /**
   * Create a form via API
   */
  async createForm(data: {
    name: string;
    fields: any[];
    settings?: any;
  }): Promise<any> {
    const response = await this.request.post(`${API_URL}/forms`, {
      headers: this.getHeaders(),
      data,
    });

    if (!response.ok()) {
      const error = await response.text();
      throw new Error(`Failed to create form: ${error}`);
    }

    return response.json();
  }

  /**
   * Get contacts list
   */
  async getContacts(params?: { page?: number; limit?: number; search?: string }): Promise<any> {
    const queryString = new URLSearchParams(params as any).toString();
    const url = `${API_URL}/contacts${queryString ? `?${queryString}` : ''}`;

    const response = await this.request.get(url, {
      headers: this.getHeaders(),
    });

    return response.json();
  }

  /**
   * Get deals list
   */
  async getDeals(params?: { page?: number; limit?: number; stageId?: string }): Promise<any> {
    const queryString = new URLSearchParams(params as any).toString();
    const url = `${API_URL}/deals${queryString ? `?${queryString}` : ''}`;

    const response = await this.request.get(url, {
      headers: this.getHeaders(),
    });

    return response.json();
  }

  /**
   * Get pipelines
   */
  async getPipelines(): Promise<any> {
    const response = await this.request.get(`${API_URL}/pipelines`, {
      headers: this.getHeaders(),
    });

    return response.json();
  }

  /**
   * Delete contact
   */
  async deleteContact(id: string): Promise<void> {
    await this.request.delete(`${API_URL}/contacts/${id}`, {
      headers: this.getHeaders(),
    });
  }

  /**
   * Delete deal
   */
  async deleteDeal(id: string): Promise<void> {
    await this.request.delete(`${API_URL}/deals/${id}`, {
      headers: this.getHeaders(),
    });
  }

  /**
   * Clean up test data
   */
  async cleanup(options: { contacts?: string[]; deals?: string[]; tasks?: string[] }): Promise<void> {
    const promises: Promise<any>[] = [];

    if (options.contacts) {
      options.contacts.forEach((id) => {
        promises.push(this.deleteContact(id).catch(() => {}));
      });
    }

    if (options.deals) {
      options.deals.forEach((id) => {
        promises.push(this.deleteDeal(id).catch(() => {}));
      });
    }

    await Promise.all(promises);
  }
}
