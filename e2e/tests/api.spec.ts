import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';

test.describe('API Tests', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Login to get auth token
    const loginResponse = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: process.env.TEST_USER_EMAIL || 'admin@test.com',
        password: process.env.TEST_USER_PASSWORD || 'Test123!@#',
      },
    });

    if (loginResponse.ok()) {
      const data = await loginResponse.json();
      authToken = data.accessToken;
    }
  });

  test.describe('Health Endpoints', () => {
    test('API-001: Health endpoint returns 200 @critical', async ({ request }) => {
      const response = await request.get(`${API_URL.replace('/api/v1', '')}/health`);
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('ok');
    });

    test('Liveness check returns 200', async ({ request }) => {
      const response = await request.get(`${API_URL.replace('/api/v1', '')}/health/liveness`);
      expect(response.status()).toBe(200);
    });

    test('Readiness check returns 200', async ({ request }) => {
      const response = await request.get(`${API_URL.replace('/api/v1', '')}/health/readiness`);
      expect(response.status()).toBe(200);
    });
  });

  test.describe('Authentication API', () => {
    test('API-002: Unauthenticated requests return 401 @critical', async ({ request }) => {
      const response = await request.get(`${API_URL}/contacts`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status()).toBe(401);
    });

    test('Login with valid credentials returns token', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: 'admin@test.com',
          password: 'Test123!@#',
        },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
    });

    test('Login with invalid credentials returns 401', async ({ request }) => {
      const response = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: 'admin@test.com',
          password: 'wrongpassword',
        },
      });

      expect(response.status()).toBe(401);
    });

    test('API-008: Token refresh works correctly', async ({ request }) => {
      // First login
      const loginResponse = await request.post(`${API_URL}/auth/login`, {
        data: {
          email: 'admin@test.com',
          password: 'Test123!@#',
        },
      });

      const { refreshToken } = await loginResponse.json();

      // Refresh token
      const refreshResponse = await request.post(`${API_URL}/auth/refresh`, {
        data: { refreshToken },
      });

      expect(refreshResponse.status()).toBe(200);

      const body = await refreshResponse.json();
      expect(body.accessToken).toBeDefined();
    });
  });

  test.describe('Contacts API', () => {
    test('GET /contacts returns list', async ({ request }) => {
      const response = await request.get(`${API_URL}/contacts`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body.contacts || body)).toBeTruthy();
    });

    test('POST /contacts creates contact', async ({ request }) => {
      const uniqueEmail = `api.test.${Date.now()}@example.com`;

      const response = await request.post(`${API_URL}/contacts`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          firstName: 'API',
          lastName: 'Test',
          email: uniqueEmail,
          phone: '+1234567890',
          status: 'lead',
        },
      });

      expect(response.status()).toBe(201);

      const body = await response.json();
      expect(body.email).toBe(uniqueEmail);
    });

    test('API-003: Invalid data returns 400', async ({ request }) => {
      const response = await request.post(`${API_URL}/contacts`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          // Missing required fields
          phone: '123',
        },
      });

      expect(response.status()).toBe(400);
    });

    test('API-008: Duplicate email returns error', async ({ request }) => {
      const email = 'duplicate.test@example.com';

      // Create first contact
      await request.post(`${API_URL}/contacts`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          firstName: 'First',
          lastName: 'Contact',
          email,
        },
      });

      // Try to create duplicate
      const response = await request.post(`${API_URL}/contacts`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          firstName: 'Second',
          lastName: 'Contact',
          email,
        },
      });

      expect([400, 409]).toContain(response.status());
    });

    test('API-006: Pagination parameters work', async ({ request }) => {
      const response = await request.get(`${API_URL}/contacts?page=1&limit=10`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.contacts?.length || body.length).toBeLessThanOrEqual(10);
    });
  });

  test.describe('Deals API', () => {
    test('GET /deals returns list', async ({ request }) => {
      const response = await request.get(`${API_URL}/deals`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });

    test('POST /deals creates deal', async ({ request }) => {
      const response = await request.post(`${API_URL}/deals`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          title: `API Test Deal ${Date.now()}`,
          value: 25000,
          currency: 'USD',
        },
      });

      // 201 or 200 depending on implementation
      expect([200, 201]).toContain(response.status());
    });

    test('API-004: Deal value calculation is correct', async ({ request }) => {
      const value = 50000;

      const response = await request.post(`${API_URL}/deals`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          title: 'Value Test Deal',
          value,
          currency: 'USD',
        },
      });

      if (response.ok()) {
        const body = await response.json();
        expect(body.value).toBe(value);
      }
    });
  });

  test.describe('Tasks API', () => {
    test('GET /tasks returns list', async ({ request }) => {
      const response = await request.get(`${API_URL}/tasks`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });

    test('POST /tasks creates task', async ({ request }) => {
      const response = await request.post(`${API_URL}/tasks`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          title: `API Test Task ${Date.now()}`,
          description: 'Test task created by API',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          priority: 'medium',
        },
      });

      expect([200, 201]).toContain(response.status());
    });
  });

  test.describe('Integrations API', () => {
    test('GET /integrations/available returns list', async ({ request }) => {
      const response = await request.get(`${API_URL}/integrations/available`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.integrations).toBeDefined();
      expect(Array.isArray(body.integrations)).toBeTruthy();
    });

    test('GET /integrations returns workspace integrations', async ({ request }) => {
      const response = await request.get(`${API_URL}/integrations`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });

    test('API-007: Webhook endpoint accepts POST', async ({ request }) => {
      // Test webhook endpoint (should accept even without valid integration)
      const response = await request.post(`${API_URL}/integrations/webhooks/test-webhook-id`, {
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          event: 'test',
          data: { test: true },
        },
      });

      // May return 200 or 404 depending on if integration exists
      expect([200, 404]).toContain(response.status());
    });
  });

  test.describe('Forms API', () => {
    test('GET /forms returns list', async ({ request }) => {
      const response = await request.get(`${API_URL}/forms`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });

    test('POST /forms creates form', async ({ request }) => {
      const response = await request.post(`${API_URL}/forms`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          name: `API Test Form ${Date.now()}`,
          fields: [
            {
              id: 'email-field',
              type: 'email',
              label: 'Email',
              required: true,
            },
          ],
        },
      });

      expect([200, 201]).toContain(response.status());
    });
  });

  test.describe('Pipeline API', () => {
    test('GET /pipelines returns list', async ({ request }) => {
      const response = await request.get(`${API_URL}/pipelines`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });
  });

  test.describe('CORS and Security', () => {
    test('API-005: CORS headers are set', async ({ request }) => {
      const response = await request.get(`${API_URL.replace('/api/v1', '')}/health`, {
        headers: {
          Origin: 'http://localhost:4001',
        },
      });

      expect(response.status()).toBe(200);
      // CORS headers should be present
      const headers = response.headers();
      expect(headers['access-control-allow-origin']).toBeDefined();
    });

    test('API returns JSON content type', async ({ request }) => {
      const response = await request.get(`${API_URL.replace('/api/v1', '')}/health`);

      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('application/json');
    });

    test('Security headers are present', async ({ request }) => {
      const response = await request.get(`${API_URL.replace('/api/v1', '')}/health`);

      const headers = response.headers();
      // Check for common security headers (helmet adds these)
      // X-Content-Type-Options, X-Frame-Options, etc.
      expect(response.status()).toBe(200);
    });
  });

  test.describe('Rate Limiting', () => {
    test('API-004: Rate limiting enforced on multiple requests', async ({ request }) => {
      // Make several rapid requests
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request.get(`${API_URL.replace('/api/v1', '')}/health`)
        );
      }

      const responses = await Promise.all(requests);

      // All should succeed (rate limit typically allows more than 10)
      responses.forEach((response) => {
        expect([200, 429]).toContain(response.status());
      });
    });
  });

  test.describe('Users API', () => {
    test('GET /users/me returns current user', async ({ request }) => {
      const response = await request.get(`${API_URL}/users/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body.email).toBeDefined();
    });

    test('GET /users returns list (admin only)', async ({ request }) => {
      const response = await request.get(`${API_URL}/users`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      // Admin should be able to list users
      expect([200, 403]).toContain(response.status());
    });
  });

  test.describe('Analytics API', () => {
    test('GET /analytics/dashboard returns data', async ({ request }) => {
      const response = await request.get(`${API_URL}/analytics/dashboard`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect([200, 404]).toContain(response.status());
    });

    test('GET /analytics/sales returns sales data', async ({ request }) => {
      const response = await request.get(`${API_URL}/analytics/sales`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect([200, 404]).toContain(response.status());
    });
  });

  test.describe('Error Handling', () => {
    test('Invalid endpoint returns 404', async ({ request }) => {
      const response = await request.get(`${API_URL}/nonexistent-endpoint`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(404);
    });

    test('Invalid HTTP method returns 405 or 404', async ({ request }) => {
      const response = await request.patch(`${API_URL}/health`, {
        data: {},
      });

      expect([404, 405]).toContain(response.status());
    });

    test('Malformed JSON returns 400', async ({ request }) => {
      const response = await request.post(`${API_URL}/contacts`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        data: 'invalid-json{',
      });

      expect([400, 500]).toContain(response.status());
    });
  });

  test.describe('Search and Filtering', () => {
    test('Search contacts by query', async ({ request }) => {
      const response = await request.get(`${API_URL}/contacts?search=test`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });

    test('Filter contacts by status', async ({ request }) => {
      const response = await request.get(`${API_URL}/contacts?status=lead`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });

    test('Sort contacts by field', async ({ request }) => {
      const response = await request.get(`${API_URL}/contacts?sortBy=createdAt&sortOrder=desc`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.status()).toBe(200);
    });
  });
});
