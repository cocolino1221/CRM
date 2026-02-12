#!/usr/bin/env node

/**
 * Database Seeding Script for SlackCRM
 * Creates demo data for development and testing
 *
 * Usage: node scripts/seed-database.js [options]
 * Options:
 *   --clean     Drop existing data before seeding
 *   --small     Create minimal dataset (10 contacts, 5 deals)
 *   --medium    Create medium dataset (50 contacts, 25 deals) [default]
 *   --large     Create large dataset (200 contacts, 100 deals)
 *   --help      Show this help message
 */

const { Client } = require('pg');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcrypt');

// Configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/slackcrm';
const BCRYPT_ROUNDS = 10;

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  clean: args.includes('--clean'),
  size: args.includes('--large') ? 'large' :
        args.includes('--small') ? 'small' :
        'medium',
  help: args.includes('--help'),
};

// Data sizes
const SIZES = {
  small: {
    users: 3,
    contacts: 10,
    companies: 5,
    deals: 5,
    tasks: 10,
    workflows: 2,
  },
  medium: {
    users: 5,
    contacts: 50,
    companies: 20,
    deals: 25,
    tasks: 40,
    workflows: 5,
  },
  large: {
    users: 10,
    contacts: 200,
    companies: 50,
    deals: 100,
    tasks: 150,
    workflows: 10,
  },
};

const COUNT = SIZES[options.size];

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Helper functions
const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.cyan}${msg}${colors.reset}`),
};

// Show help
if (options.help) {
  console.log(`
SlackCRM Database Seeding Script

Usage: node scripts/seed-database.js [options]

Options:
  --clean     Drop existing data before seeding
  --small     Create minimal dataset (10 contacts, 5 deals)
  --medium    Create medium dataset (50 contacts, 25 deals) [default]
  --large     Create large dataset (200 contacts, 100 deals)
  --help      Show this help message

Examples:
  node scripts/seed-database.js                # Medium dataset
  node scripts/seed-database.js --small        # Small dataset
  node scripts/seed-database.js --clean --large # Clean and seed large dataset

Environment:
  DATABASE_URL - PostgreSQL connection string (default: postgresql://localhost:5432/slackcrm)
`);
  process.exit(0);
}

// Main seeding function
async function seed() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    log.success('Connected to database');

    // Check if database has required tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'workspaces', 'contacts', 'companies', 'deals', 'tasks')
    `);

    if (tablesResult.rows.length < 6) {
      log.error('Required tables not found. Did you run migrations?');
      log.info('Run: npm run migration:run');
      process.exit(1);
    }

    log.header(`Seeding ${options.size} dataset...`);

    // Clean existing data if requested
    if (options.clean) {
      log.info('Cleaning existing data...');
      await cleanData(client);
      log.success('Data cleaned');
    }

    // Create data
    const workspace = await createWorkspace(client);
    const users = await createUsers(client, workspace.id, COUNT.users);
    const companies = await createCompanies(client, workspace.id, COUNT.companies);
    const contacts = await createContacts(client, workspace.id, users, companies, COUNT.contacts);
    const deals = await createDeals(client, workspace.id, users, contacts, companies, COUNT.deals);
    const tasks = await createTasks(client, workspace.id, users, contacts, deals, COUNT.tasks);
    const workflows = await createWorkflows(client, workspace.id, users, COUNT.workflows);

    // Summary
    log.header('Seeding Complete!');
    console.log('');
    log.success(`Workspace: ${workspace.name} (ID: ${workspace.id})`);
    log.success(`Users: ${users.length}`);
    log.success(`Companies: ${companies.length}`);
    log.success(`Contacts: ${contacts.length}`);
    log.success(`Deals: ${deals.length}`);
    log.success(`Tasks: ${tasks.length}`);
    log.success(`Workflows: ${workflows.length}`);
    console.log('');
    log.info('Login credentials:');
    console.log(`  Email: admin@example.com`);
    console.log(`  Password: Admin123!@#`);
    console.log('');
    log.info('Test the API:');
    console.log(`  curl -X POST http://localhost:4000/api/v1/auth/login \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"email":"admin@example.com","password":"Admin123!@#"}'`);
    console.log('');

  } catch (error) {
    log.error(`Seeding failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Clean existing data
async function cleanData(client) {
  const tables = [
    'workflow_executions',
    'workflows',
    'tasks',
    'deals',
    'contacts',
    'companies',
    'activities',
    'notifications',
    'integrations',
    'users',
    'workspaces',
  ];

  for (const table of tables) {
    try {
      await client.query(`DELETE FROM ${table}`);
    } catch (error) {
      // Ignore errors for tables that don't exist
    }
  }
}

// Create workspace
async function createWorkspace(client) {
  log.info('Creating workspace...');

  const result = await client.query(`
    INSERT INTO workspaces (name, domain, plan, "isActive", settings, "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    RETURNING *
  `, [
    'Demo Company',
    'demo-company.slackcrm.com',
    'trial',
    true,
    JSON.stringify({
      timezone: 'UTC',
      dateFormat: 'YYYY-MM-DD',
      currency: 'USD',
      features: {
        aiEnabled: true,
        slackIntegration: true,
        emailIntegration: true,
      },
    }),
  ]);

  return result.rows[0];
}

// Create users
async function createUsers(client, workspaceId, count) {
  log.info(`Creating ${count} users...`);

  const users = [];
  const roles = ['admin', 'manager', 'closer', 'setter', 'sales_rep', 'support_agent'];
  const hashedPassword = await bcrypt.hash('Admin123!@#', BCRYPT_ROUNDS);

  // Create admin user
  const admin = await client.query(`
    INSERT INTO users (
      "workspaceId", email, password, "firstName", "lastName",
      role, status, "failedLoginAttempts", "createdAt", "updatedAt"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    RETURNING *
  `, [
    workspaceId,
    'admin@example.com',
    hashedPassword,
    'Admin',
    'User',
    'admin',
    'active',
    0,
  ]);

  users.push(admin.rows[0]);

  // Create other users
  for (let i = 1; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
    const role = roles[i % roles.length];

    const result = await client.query(`
      INSERT INTO users (
        "workspaceId", email, password, "firstName", "lastName",
        role, status, "failedLoginAttempts", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `, [
      workspaceId,
      email,
      hashedPassword,
      firstName,
      lastName,
      role,
      'active',
      0,
    ]);

    users.push(result.rows[0]);
  }

  log.success(`Created ${users.length} users`);
  return users;
}

// Create companies
async function createCompanies(client, workspaceId, count) {
  log.info(`Creating ${count} companies...`);

  const companies = [];
  const industries = ['technology', 'healthcare', 'finance', 'education', 'retail', 'manufacturing', 'consulting', 'real_estate', 'other'];
  const sizes = ['startup', 'small', 'medium', 'large', 'enterprise'];

  for (let i = 0; i < count; i++) {
    const name = faker.company.name();
    const website = faker.internet.url();
    const result = await client.query(`
      INSERT INTO companies (
        "workspaceId", name, website, industry, size, "isActive",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `, [
      workspaceId,
      name,
      website,
      faker.helpers.arrayElement(industries),
      faker.helpers.arrayElement(sizes),
      true,
    ]);

    companies.push(result.rows[0]);
  }

  log.success(`Created ${companies.length} companies`);
  return companies;
}

// Create contacts
async function createContacts(client, workspaceId, users, companies, count) {
  log.info(`Creating ${count} contacts...`);

  const contacts = [];
  const statuses = ['active', 'lead', 'prospect', 'qualified', 'customer', 'inactive', 'churned'];
  const sources = ['manual', 'website', 'referral', 'social_media', 'email_campaign', 'cold_outreach', 'event'];

  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const owner = users[Math.floor(Math.random() * users.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];

    const phone = faker.phone.number().substring(0, 20); // Limit to 20 chars

    const result = await client.query(`
      INSERT INTO contacts (
        "workspaceId", "firstName", "lastName", email, phone,
        "jobTitle", status, source, "leadScore", "emailOptIn", "ownerId", "companyId",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING *
    `, [
      workspaceId,
      firstName,
      lastName,
      `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${faker.internet.domainName()}`,
      phone,
      faker.person.jobTitle(),
      statuses[Math.floor(Math.random() * statuses.length)],
      sources[Math.floor(Math.random() * sources.length)],
      Math.floor(Math.random() * 100),
      Math.random() > 0.5,
      owner.id,
      company.id,
    ]);

    contacts.push(result.rows[0]);
  }

  log.success(`Created ${contacts.length} contacts`);
  return contacts;
}

// Create deals
async function createDeals(client, workspaceId, users, contacts, companies, count) {
  log.info(`Creating ${count} deals...`);

  const deals = [];
  const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
  const priorities = ['low', 'medium', 'high', 'urgent'];

  for (let i = 0; i < count; i++) {
    const owner = users[Math.floor(Math.random() * users.length)];
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const company = companies[Math.floor(Math.random() * companies.length)];
    const stage = stages[Math.floor(Math.random() * stages.length)];

    const result = await client.query(`
      INSERT INTO deals (
        "workspaceId", title, value, currency, stage, priority,
        "ownerId", "contactId", "companyId", "expectedCloseDate",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `, [
      workspaceId,
      `${faker.company.catchPhrase()} - ${company.name}`,
      Math.floor(Math.random() * 100000) + 5000,
      'USD',
      stage,
      priorities[Math.floor(Math.random() * priorities.length)],
      owner.id,
      contact.id,
      company.id,
      faker.date.future(),
    ]);

    deals.push(result.rows[0]);
  }

  log.success(`Created ${deals.length} deals`);
  return deals;
}

// Create tasks
async function createTasks(client, workspaceId, users, contacts, deals, count) {
  log.info(`Creating ${count} tasks...`);

  const tasks = [];
  const statuses = ['pending', 'in_progress', 'completed', 'cancelled'];
  const priorities = ['low', 'medium', 'high', 'urgent'];
  const types = ['call', 'email', 'meeting', 'follow_up', 'demo', 'proposal'];

  for (let i = 0; i < count; i++) {
    const assignee = users[Math.floor(Math.random() * users.length)];
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const deal = Math.random() > 0.5 ? deals[Math.floor(Math.random() * deals.length)] : null;

    const result = await client.query(`
      INSERT INTO tasks (
        "workspaceId", title, description, status, priority, type,
        "assigneeId", "contactId", "dealId", "dueDate",
        "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `, [
      workspaceId,
      faker.hacker.phrase(),
      faker.lorem.sentence(),
      statuses[Math.floor(Math.random() * statuses.length)],
      priorities[Math.floor(Math.random() * priorities.length)],
      types[Math.floor(Math.random() * types.length)],
      assignee.id,
      contact.id,
      deal?.id || null,
      faker.date.future(),
    ]);

    tasks.push(result.rows[0]);
  }

  log.success(`Created ${tasks.length} tasks`);
  return tasks;
}

// Create workflows
async function createWorkflows(client, workspaceId, users, count) {
  log.info(`Creating ${count} workflows...`);

  const workflows = [];
  const creator = users[0]; // Admin user

  const workflowTemplates = [
    {
      name: 'Welcome New Contacts',
      triggerType: 'contact.created',
      actions: [
        {
          id: '1',
          type: 'send_email',
          config: {
            to: '{{email}}',
            subject: 'Welcome to {{companyName}}',
            body: 'Hi {{firstName}}, welcome to our CRM!',
          },
        },
        {
          id: '2',
          type: 'create_task',
          config: {
            title: 'Follow up with {{firstName}} {{lastName}}',
            description: 'Initial outreach call',
            priority: 'high',
          },
        },
      ],
    },
    {
      name: 'Deal Won Celebration',
      triggerType: 'deal.won',
      actions: [
        {
          id: '1',
          type: 'send_email',
          config: {
            to: '{{ownerEmail}}',
            subject: 'Congratulations! Deal Won: {{dealTitle}}',
            body: 'Great job closing {{dealTitle}} worth ${{dealValue}}!',
          },
        },
        {
          id: '2',
          type: 'create_task',
          config: {
            title: 'Onboard {{contactName}}',
            description: 'Schedule onboarding call',
            priority: 'urgent',
          },
        },
      ],
    },
    {
      name: 'Task Completed Follow-up',
      triggerType: 'task.completed',
      actions: [
        {
          id: '1',
          type: 'create_task',
          config: {
            title: 'Follow up on {{taskTitle}}',
            description: 'Check results and plan next steps',
            priority: 'medium',
          },
        },
      ],
    },
  ];

  for (let i = 0; i < Math.min(count, workflowTemplates.length); i++) {
    const template = workflowTemplates[i];

    const result = await client.query(`
      INSERT INTO workflows (
        "workspaceId", name, description, status, "triggerType",
        actions, "executionCount", "createdBy", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `, [
      workspaceId,
      template.name,
      `Automated workflow: ${template.name}`,
      Math.random() > 0.5 ? 'active' : 'draft',
      template.triggerType,
      JSON.stringify(template.actions),
      Math.floor(Math.random() * 50),
      creator.id,
    ]);

    workflows.push(result.rows[0]);
  }

  log.success(`Created ${workflows.length} workflows`);
  return workflows;
}

// Run seeding
seed();
