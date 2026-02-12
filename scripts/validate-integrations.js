#!/usr/bin/env node

/**
 * Validate Redis connectivity and OAuth integration credentials.
 * Run: node scripts/validate-integrations.js
 */

const path = require('path');
const net = require('net');

// Load .env from backend directory
try {
  require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });
} catch {
  // dotenv may not be installed globally; read manually
  const fs = require('fs');
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function ok(msg) { console.log(`  ${GREEN}[OK]${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}[MISSING]${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}[WARN]${RESET} ${msg}`); }
function header(msg) { console.log(`\n${BOLD}${msg}${RESET}`); }
function divider() { console.log(`${DIM}${'─'.repeat(60)}${RESET}`); }

// ── Redis Check ──────────────────────────────────────────────

function checkRedis() {
  return new Promise((resolve) => {
    header('1. Redis Connectivity');
    divider();

    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT, 10) || 6379;

    console.log(`   Host: ${host}:${port}`);

    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on('connect', () => {
      ok(`Redis reachable at ${host}:${port}`);
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      fail(`Redis timeout at ${host}:${port}`);
      socket.destroy();
      resolve(false);
    });

    socket.on('error', (err) => {
      fail(`Redis unreachable at ${host}:${port} (${err.code || err.message})`);
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

// ── OAuth Credentials Check ─────────────────────────────────

const OAUTH_INTEGRATIONS = [
  { name: 'Google', key: 'GOOGLE', description: 'Calendar, Contacts, Drive, Gmail' },
  { name: 'Slack', key: 'SLACK', description: 'Messaging, Channels, Users' },
  { name: 'Microsoft 365', key: 'MICROSOFT', description: 'Outlook, Teams, OneDrive' },
  { name: 'HubSpot', key: 'HUBSPOT', description: 'CRM Contacts, Deals, Companies' },
  { name: 'Salesforce', key: 'SALESFORCE', description: 'Leads, Contacts, Opportunities' },
  { name: 'Zoom', key: 'ZOOM', description: 'Meetings, Webinars' },
  { name: 'DocuSign', key: 'DOCUSIGN', description: 'Document Signing' },
  { name: 'Calendly', key: 'CALENDLY', description: 'Scheduling, Event Types' },
];

function checkOAuth() {
  header('2. OAuth Integration Credentials');
  divider();

  let configured = 0;
  let missing = 0;

  for (const integration of OAUTH_INTEGRATIONS) {
    const clientId = process.env[`OAUTH_${integration.key}_CLIENT_ID`];
    const clientSecret = process.env[`OAUTH_${integration.key}_CLIENT_SECRET`];

    const hasId = clientId && !clientId.startsWith('your-') && clientId !== '';
    const hasSecret = clientSecret && !clientSecret.startsWith('your-') && clientSecret !== '';

    if (hasId && hasSecret) {
      ok(`${integration.name} - ${DIM}${integration.description}${RESET}`);
      configured++;
    } else if (hasId || hasSecret) {
      warn(`${integration.name} - partial (${!hasId ? 'missing CLIENT_ID' : 'missing CLIENT_SECRET'})`);
      missing++;
    } else {
      fail(`${integration.name} - ${DIM}${integration.description}${RESET}`);
      missing++;
    }
  }

  return { configured, missing };
}

// ── API Key Integrations Check ──────────────────────────────

const APIKEY_INTEGRATIONS = [
  { name: 'Typeform', envKey: 'TYPEFORM_API_KEY', description: 'Form Submissions, Surveys' },
  { name: 'OpenAI', envKey: 'OPENAI_API_KEY', description: 'AI Lead Scoring, Email Generation' },
  { name: 'SendGrid', envKey: 'SENDGRID_API_KEY', description: 'Email Delivery' },
];

function checkApiKeys() {
  header('3. API Key Integrations');
  divider();

  let configured = 0;
  let missing = 0;

  for (const integration of APIKEY_INTEGRATIONS) {
    const value = process.env[integration.envKey];
    const hasValue = value && !value.startsWith('your-') && value !== '';

    if (hasValue) {
      ok(`${integration.name} - ${DIM}${integration.description}${RESET}`);
      configured++;
    } else {
      fail(`${integration.name} - ${DIM}${integration.description}${RESET}`);
      missing++;
    }
  }

  return { configured, missing };
}

// ── Core Config Check ───────────────────────────────────────

function checkCoreConfig() {
  header('4. Core Configuration');
  divider();

  const checks = [
    { name: 'DATABASE_URL', env: 'DATABASE_URL' },
    { name: 'JWT_SECRET', env: 'JWT_SECRET' },
    { name: 'APP_URL', env: 'APP_URL' },
    { name: 'FRONTEND_URL', env: 'FRONTEND_URL' },
    { name: 'Stack Auth Project ID', env: 'NEXT_PUBLIC_STACK_PROJECT_ID' },
    { name: 'Stack Auth Server Key', env: 'STACK_SECRET_SERVER_KEY' },
  ];

  for (const check of checks) {
    const value = process.env[check.env];
    const hasValue = value && !value.startsWith('your_') && !value.startsWith('your-') && value !== '';
    if (hasValue) {
      ok(check.name);
    } else {
      fail(check.name);
    }
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}SlackCRM - Integration & Redis Validation${RESET}`);
  console.log(`${'='.repeat(60)}`);

  const redisOk = await checkRedis();
  const oauth = checkOAuth();
  checkApiKeys();
  checkCoreConfig();

  // Summary
  header('Summary');
  divider();
  console.log(`  Redis:       ${redisOk ? `${GREEN}Connected${RESET}` : `${RED}Not available${RESET}`}`);
  console.log(`  OAuth:       ${GREEN}${oauth.configured}${RESET} configured, ${oauth.missing > 0 ? RED : GREEN}${oauth.missing}${RESET} missing`);
  console.log('');

  if (!redisOk) {
    console.log(`${YELLOW}  Redis is required for Bull queues (email, sync, AI, workflows).`);
    console.log(`  Options:`);
    console.log(`    - Local:   docker run -d -p 6379:6379 redis`);
    console.log(`    - Upstash: https://upstash.com (free tier)`);
    console.log(`    - Fly.io:  flyctl redis create${RESET}`);
  }

  if (oauth.missing > 0) {
    console.log(`${YELLOW}  To configure OAuth integrations, follow:`);
    console.log(`    instructions/SETUP_OAUTH_INTEGRATIONS.md${RESET}`);
  }

  console.log('');
}

main().catch(console.error);
