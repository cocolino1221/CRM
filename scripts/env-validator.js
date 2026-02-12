#!/usr/bin/env node

/**
 * Environment Variable Validator
 * Validates all required and optional environment variables
 * Provides clear feedback on missing or invalid configuration
 */

const fs = require('fs');
const path = require('path');

// Color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.blue}${msg}${colors.reset}`),
};

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '../backend/.env');

  if (!fs.existsSync(envPath)) {
    log.error('.env file not found in backend directory');
    return {};
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};

  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return env;
}

// Validation rules
const validators = {
  required: (value) => value && value.length > 0,
  minLength: (value, min) => value && value.length >= min,
  isNumber: (value) => !isNaN(parseInt(value, 10)),
  isBoolean: (value) => value === 'true' || value === 'false',
  isUrl: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  oneOf: (value, options) => options.includes(value),
};

// Environment variable definitions
const envVars = {
  // Critical - Database
  database: {
    title: 'Database Configuration',
    vars: [
      {
        name: 'DATABASE_URL',
        description: 'PostgreSQL connection string (Neon, Supabase, etc.)',
        required: false,
        validate: (v) => !v || validators.required(v),
        example: 'postgresql://user:pass@host:5432/dbname',
      },
      {
        name: 'DB_HOST',
        description: 'Database host (if not using DATABASE_URL)',
        required: (env) => !env.DATABASE_URL,
        validate: validators.required,
        example: 'localhost',
      },
      {
        name: 'DB_PORT',
        description: 'Database port',
        required: (env) => !env.DATABASE_URL,
        validate: (v) => validators.isNumber(v),
        example: '5432',
      },
      {
        name: 'DB_USERNAME',
        description: 'Database username',
        required: (env) => !env.DATABASE_URL,
        validate: validators.required,
        example: 'postgres',
      },
      {
        name: 'DB_PASSWORD',
        description: 'Database password',
        required: (env) => !env.DATABASE_URL,
        validate: validators.required,
        example: 'password',
      },
      {
        name: 'DB_NAME',
        description: 'Database name',
        required: (env) => !env.DATABASE_URL,
        validate: validators.required,
        example: 'slackcrm',
      },
    ],
  },

  // Critical - Authentication
  authentication: {
    title: 'Authentication & Security',
    vars: [
      {
        name: 'JWT_SECRET',
        description: 'JWT signing secret (min 32 characters)',
        required: true,
        validate: (v) => validators.minLength(v, 32),
        example: 'your-super-secret-jwt-key-minimum-32-characters',
      },
      {
        name: 'JWT_REFRESH_SECRET',
        description: 'JWT refresh token secret (min 32 characters)',
        required: true,
        validate: (v) => validators.minLength(v, 32),
        example: 'your-super-secret-refresh-key-minimum-32-characters',
      },
      {
        name: 'STACK_SECRET_SERVER_KEY',
        description: 'Stack Auth server key',
        required: true,
        validate: validators.required,
        example: 'stack_secret_...',
      },
      {
        name: 'NEXT_PUBLIC_STACK_PROJECT_ID',
        description: 'Stack Auth project ID',
        required: true,
        validate: validators.required,
        example: 'your-stack-project-id',
      },
    ],
  },

  // Critical - URLs
  urls: {
    title: 'Application URLs',
    vars: [
      {
        name: 'FRONTEND_URL',
        description: 'Frontend application URL',
        required: true,
        validate: validators.isUrl,
        example: 'http://localhost:3001',
      },
      {
        name: 'APP_URL',
        description: 'Backend API URL',
        required: true,
        validate: validators.isUrl,
        example: 'http://localhost:4000',
      },
    ],
  },

  // Optional - Redis
  redis: {
    title: 'Redis Configuration (Optional)',
    vars: [
      {
        name: 'REDIS_HOST',
        description: 'Redis server host',
        required: false,
        validate: (v) => !v || validators.required(v),
        example: 'localhost',
      },
      {
        name: 'REDIS_PORT',
        description: 'Redis server port',
        required: false,
        validate: (v) => !v || validators.isNumber(v),
        example: '6379',
      },
      {
        name: 'REDIS_PASSWORD',
        description: 'Redis password (if required)',
        required: false,
        example: 'your-redis-password',
      },
    ],
  },

  // Optional - Email
  email: {
    title: 'Email Configuration (Optional)',
    vars: [
      {
        name: 'SENDGRID_API_KEY',
        description: 'SendGrid API key',
        required: false,
        validate: (v) => !v || validators.required(v),
        example: 'SG.xxxxxxxxxxxx',
      },
      {
        name: 'SMTP_HOST',
        description: 'SMTP server host',
        required: false,
        example: 'smtp.gmail.com',
      },
      {
        name: 'SMTP_PORT',
        description: 'SMTP server port',
        required: false,
        validate: (v) => !v || validators.isNumber(v),
        example: '587',
      },
      {
        name: 'SMTP_USER',
        description: 'SMTP username',
        required: false,
        example: 'your-email@gmail.com',
      },
      {
        name: 'SMTP_PASS',
        description: 'SMTP password',
        required: false,
        example: 'your-app-password',
      },
    ],
  },

  // Optional - Integrations
  integrations: {
    title: 'Integration OAuth Configuration (Optional)',
    vars: [
      {
        name: 'OAUTH_GOOGLE_CLIENT_ID',
        description: 'Google OAuth client ID',
        required: false,
        example: 'xxx.apps.googleusercontent.com',
      },
      {
        name: 'OAUTH_GOOGLE_CLIENT_SECRET',
        description: 'Google OAuth client secret',
        required: false,
        example: 'GOCSPX-xxx',
      },
      {
        name: 'OAUTH_SLACK_CLIENT_ID',
        description: 'Slack OAuth client ID',
        required: false,
        example: 'xxx.xxx',
      },
      {
        name: 'OAUTH_SLACK_CLIENT_SECRET',
        description: 'Slack OAuth client secret',
        required: false,
        example: 'xxx',
      },
    ],
  },

  // Environment settings
  environment: {
    title: 'Environment Settings',
    vars: [
      {
        name: 'NODE_ENV',
        description: 'Node environment',
        required: true,
        validate: (v) => validators.oneOf(v, ['development', 'production', 'test']),
        example: 'production',
      },
      {
        name: 'PORT',
        description: 'Server port',
        required: false,
        validate: (v) => !v || validators.isNumber(v),
        example: '4000',
      },
    ],
  },
};

// Validate environment
function validateEnvironment() {
  const env = loadEnv();

  console.log(`\n${colors.bright}🔍 SlackCRM Environment Validator${colors.reset}`);
  console.log('=' .repeat(50));

  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;
  let warnings = 0;

  // Validate each category
  Object.keys(envVars).forEach(category => {
    const { title, vars } = envVars[category];

    log.header(title);
    console.log('-'.repeat(50));

    vars.forEach(varDef => {
      const { name, description, required, validate, example } = varDef;
      const value = env[name];
      const isRequired = typeof required === 'function' ? required(env) : required;

      totalChecks++;

      // Check if variable exists
      if (!value || value.length === 0) {
        if (isRequired) {
          log.error(`${name} is REQUIRED but not set`);
          log.info(`  ${description}`);
          log.info(`  Example: ${example}`);
          failedChecks++;
        } else {
          log.warn(`${name} is not set (optional)`);
          warnings++;
        }
        return;
      }

      // Validate value
      if (validate) {
        const isValid = typeof validate === 'function' ? validate(value) : true;

        if (isValid) {
          log.success(`${name} is set and valid`);
          passedChecks++;
        } else {
          log.error(`${name} is set but INVALID`);
          log.info(`  Current: ${value.substring(0, 20)}...`);
          log.info(`  Expected: ${description}`);
          log.info(`  Example: ${example}`);
          failedChecks++;
        }
      } else {
        log.success(`${name} is set`);
        passedChecks++;
      }
    });
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  log.header('Validation Summary');
  console.log('='.repeat(50));
  console.log(`${colors.green}Passed:${colors.reset}   ${passedChecks}`);
  console.log(`${colors.red}Failed:${colors.reset}   ${failedChecks}`);
  console.log(`${colors.yellow}Warnings:${colors.reset} ${warnings}`);
  console.log('');

  if (failedChecks === 0) {
    log.success('All critical environment variables are properly configured!');
    console.log('');

    if (warnings > 0) {
      log.warn('Some optional variables are not set. Review warnings above.');
      console.log('');
    }

    log.info('Next steps:');
    console.log('  1. Start the backend: cd backend && npm run start:dev');
    console.log('  2. Run migrations: npm run migration:run');
    console.log('  3. Start the frontend: cd frontend && npm run dev');
    console.log('');

    process.exit(0);
  } else {
    log.error('Critical environment variables are missing or invalid!');
    console.log('');
    log.info('Fix the errors above and run this validator again.');
    console.log('');
    log.info('For a complete reference, see:');
    console.log('  - backend/.env.example');
    console.log('  - PRODUCTION_README.md');
    console.log('');

    process.exit(1);
  }
}

// Run validation
validateEnvironment();
