/**
 * Test data fixtures for E2E tests
 */

export const testUsers = {
  admin: {
    email: process.env.TEST_USER_EMAIL || 'admin@test.com',
    password: process.env.TEST_USER_PASSWORD || 'Test123!@#',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
  },
  manager: {
    email: process.env.TEST_MANAGER_EMAIL || 'manager@test.com',
    password: process.env.TEST_MANAGER_PASSWORD || 'Test123!@#',
    firstName: 'Manager',
    lastName: 'User',
    role: 'manager',
  },
  salesRep: {
    email: process.env.TEST_SALES_EMAIL || 'sales@test.com',
    password: process.env.TEST_SALES_PASSWORD || 'Test123!@#',
    firstName: 'Sales',
    lastName: 'Rep',
    role: 'sales_rep',
  },
};

export const testContacts = {
  valid: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    status: 'lead',
    source: 'website',
    tags: ['test', 'vip'],
  },
  minimal: {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
  },
  invalid: {
    firstName: '',
    lastName: '',
    email: 'invalid-email',
  },
};

export const testDeals = {
  valid: {
    title: 'Enterprise Contract Q1',
    value: 50000,
    currency: 'USD',
    probability: 75,
    expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  smallDeal: {
    title: 'Small Business Package',
    value: 5000,
    currency: 'USD',
    probability: 50,
  },
  largeDeal: {
    title: 'Enterprise Annual Contract',
    value: 500000,
    currency: 'USD',
    probability: 25,
  },
};

export const testTasks = {
  valid: {
    title: 'Follow up with client',
    description: 'Call to discuss proposal details',
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    priority: 'high',
  },
  overdue: {
    title: 'Overdue task',
    description: 'This task is overdue',
    dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    priority: 'medium',
  },
};

export const testForms = {
  contactForm: {
    name: 'Contact Form',
    description: 'General contact form for website',
    fields: [
      {
        id: 'name',
        type: 'text',
        label: 'Full Name',
        placeholder: 'Enter your name',
        required: true,
      },
      {
        id: 'email',
        type: 'email',
        label: 'Email Address',
        placeholder: 'you@example.com',
        required: true,
      },
      {
        id: 'phone',
        type: 'phone',
        label: 'Phone Number',
        placeholder: '+1 (555) 000-0000',
        required: false,
      },
      {
        id: 'message',
        type: 'textarea',
        label: 'Message',
        placeholder: 'How can we help?',
        required: true,
      },
    ],
    settings: {
      submitButtonText: 'Send Message',
      successMessage: 'Thank you for contacting us!',
      allowMultipleSubmissions: false,
    },
  },
  leadCaptureForm: {
    name: 'Lead Capture',
    description: 'Form for capturing leads from landing pages',
    fields: [
      {
        id: 'firstName',
        type: 'text',
        label: 'First Name',
        required: true,
      },
      {
        id: 'lastName',
        type: 'text',
        label: 'Last Name',
        required: true,
      },
      {
        id: 'email',
        type: 'email',
        label: 'Work Email',
        required: true,
      },
      {
        id: 'company',
        type: 'text',
        label: 'Company',
        required: true,
      },
      {
        id: 'budget',
        type: 'select',
        label: 'Budget Range',
        required: false,
        options: ['Under $10k', '$10k - $50k', '$50k - $100k', 'Over $100k'],
      },
    ],
    settings: {
      submitButtonText: 'Get Started',
      successMessage: 'Thanks! We will be in touch shortly.',
    },
  },
};

export const testCompanies = {
  techStartup: {
    name: 'TechCorp Inc.',
    industry: 'Technology',
    size: '50-100',
    website: 'https://techcorp.example.com',
    address: '123 Tech Street, San Francisco, CA 94105',
  },
  enterprise: {
    name: 'Enterprise Solutions Ltd.',
    industry: 'Consulting',
    size: '1000+',
    website: 'https://enterprise.example.com',
  },
};

/**
 * Generate unique test data to avoid conflicts
 */
export function generateUniqueEmail(prefix: string = 'test'): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).substring(7)}@example.com`;
}

export function generateUniqueName(prefix: string = 'Test'): string {
  return `${prefix} ${Date.now()}`;
}

export function generateUniquePhone(): string {
  const random = Math.floor(Math.random() * 9000000000) + 1000000000;
  return `+1${random}`;
}

/**
 * Date helpers for tests
 */
export const dateHelpers = {
  tomorrow: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  nextWeek: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  nextMonth: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  yesterday: () => new Date(Date.now() - 24 * 60 * 60 * 1000),
  lastWeek: () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
};
