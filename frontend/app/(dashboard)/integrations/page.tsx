'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Check, ExternalLink, Zap, Settings, Webhook, X, Copy, Key, Lock, Link as LinkIcon, AlertCircle, Loader2, Plus, Trash2, FileText, Edit } from 'lucide-react';
import api from '@/lib/api';
import { integrationIcons } from '@/lib/integration-icons';

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  logoUrl: string;
  color: string;
  connected: boolean;
  status?: string;
  features: string[];
  configFields?: ConfigField[];
  oauth?: boolean; // True for OAuth integrations (no API keys needed)
  oauthProvider?: string; // OAuth provider name for backend route (e.g., 'google', 'slack')
}

interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select' | 'textarea';
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  helpText?: string;
}

// Helper function to get emoji for integration type
const getEmojiForIntegration = (type: string): string => {
  const emojiMap: Record<string, string> = {
    'slack': '🔮',
    'google': '📧',
    'microsoft': '👥',
    'salesforce': '☁️',
    'hubspot': '🧡',
    'zoom': '🎥',
    'typeform': '📝',
    'pandadoc': '📄',
    'docusign': '✍️',
    'calendly': '📅',
    'whatsapp': '💬',
    'manychat': '🤖',
    'webhook': '🔗',
    'api': '⚡',
    'esemneaza': '🖊️',
  };
  return emojiMap[type.toLowerCase()] || '🔌';
};

export default function IntegrationsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [managingIntegration, setManagingIntegration] = useState<Integration | null>(null);
  const [configData, setConfigData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [connectedIntegrations, setConnectedIntegrations] = useState<Record<string, any>>({});
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [isWebhookSubmitting, setIsWebhookSubmitting] = useState(false);
  const [webhookError, setWebhookError] = useState('');
  const [webhookSuccess, setWebhookSuccess] = useState('');
  const [webhookForm, setWebhookForm] = useState<{
    integrationId: string;
    url: string;
    event: string;
    secret: string;
    headersJson: string;
  }>({
    integrationId: '',
    url: '',
    event: '*',
    secret: '',
    headersJson: '',
  });

  // Typeform multi-form management
  const [typeformForms, setTypeformForms] = useState<any[]>([]);
  const [showAddFormModal, setShowAddFormModal] = useState(false);
  const [newFormId, setNewFormId] = useState('');
  const [newFormName, setNewFormName] = useState('');
  const [isLoadingForms, setIsLoadingForms] = useState(false);

  const [integrations, setIntegrations] = useState<Integration[]>([
    // Communication
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'Send messages, automate conversations, and manage customer interactions via WhatsApp Business API.',
      category: 'communication',
      icon: '💬',
      logoUrl: integrationIcons.whatsapp,
      color: 'from-green-500 to-emerald-500',
      connected: false,
      features: ['Bulk messaging', 'Template messages', 'Two-way chat', 'Media sharing'],
      configFields: [
        { name: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true, placeholder: '1234567890123456', helpText: 'Found in Meta for Developers → Your App → WhatsApp → API Setup' },
        { name: 'accessToken', label: 'Access Token', type: 'password', required: true, placeholder: 'EAAxxxxxxxx...', helpText: 'Permanent access token from Meta App Settings → System Users' },
        { name: 'verifyToken', label: 'Verify Token', type: 'text', required: true, placeholder: 'my-secret-verify-token', helpText: 'A string you choose — enter the same value in Meta webhook settings' },
        { name: 'wabaId', label: 'WABA ID (optional)', type: 'text', required: false, placeholder: '123456789012345', helpText: 'WhatsApp Business Account ID — needed for template management. Found in Meta Business Suite → Settings → Business Account.' },
      ],
    },
    {
      id: 'twilio',
      name: 'Twilio',
      description: 'Send SMS, make calls, and automate customer communications with Twilio.',
      category: 'communication',
      icon: '📱',
      logoUrl: integrationIcons.twilio,
      color: 'from-red-600 to-pink-600',
      connected: false,
      features: ['SMS campaigns', 'Voice calls', 'Call tracking', 'Number management'],
      configFields: [
        { name: 'accountSid', label: 'Account SID', type: 'text', required: true, placeholder: 'AC...' },
        { name: 'authToken', label: 'Auth Token', type: 'password', required: true, placeholder: 'Your Twilio auth token' },
        { name: 'phoneNumber', label: 'Phone Number', type: 'text', required: true, placeholder: '+1234567890' },
      ],
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Connect your Slack workspace to sync contacts, send notifications, and enable AI-powered chat commands.',
      category: 'communication',
      icon: '🔮',
      logoUrl: integrationIcons.slack,
      color: 'from-purple-500 to-pink-500',
      connected: false,
      features: ['Contact sync', 'Real-time notifications', 'Slash commands', 'AI chat assistant'],
      oauth: true,
      oauthProvider: 'slack',
    },
    {
      id: 'zoom',
      name: 'Zoom',
      description: 'Schedule meetings, track calls, and sync recordings directly to contact records.',
      category: 'communication',
      icon: '🎥',
      logoUrl: integrationIcons.zoom,
      color: 'from-blue-600 to-indigo-600',
      connected: false,
      features: ['Meeting scheduling', 'Call tracking', 'Recording sync', 'Calendar integration'],
      configFields: [
        { name: 'accountId', label: 'Account ID', type: 'text', required: true, placeholder: 'Your Zoom Account ID' },
        { name: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: 'Your Zoom OAuth Client ID' },
        { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true, placeholder: 'Your Zoom OAuth Client Secret' },
      ],
    },
    {
      id: 'microsoft-teams',
      name: 'Microsoft Teams',
      description: 'Integrate with Microsoft Teams for notifications, meetings, and collaboration.',
      category: 'communication',
      icon: '👥',
      logoUrl: integrationIcons.microsoftteams,
      color: 'from-indigo-600 to-purple-600',
      connected: false,
      features: ['Team notifications', 'Meeting scheduler', 'File sharing', 'Chat integration'],
      configFields: [
        { name: 'tenantId', label: 'Tenant ID', type: 'text', required: true, placeholder: 'Your Azure AD Tenant ID' },
        { name: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: 'Your app Client ID' },
        { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      ],
    },

    // Email & Marketing
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Sync emails, track conversations, and manage communication from your CRM. Simply click Connect and authorize access - no API keys needed!',
      category: 'email',
      icon: '📧',
      logoUrl: integrationIcons.gmail,
      color: 'from-red-500 to-pink-500',
      connected: false,
      features: ['Email sync', 'Two-way communication', 'Email tracking', 'Template management'],
      oauth: true,
      oauthProvider: 'google',
    },
    {
      id: 'mailchimp',
      name: 'Mailchimp',
      description: 'Sync contacts with Mailchimp lists, track campaigns, and automate email marketing.',
      category: 'email',
      icon: '🐵',
      logoUrl: integrationIcons.mailchimp,
      color: 'from-yellow-400 to-yellow-600',
      connected: false,
      features: ['Contact sync', 'Campaign tracking', 'Audience segmentation', 'Analytics'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Your Mailchimp API key' },
        { name: 'serverPrefix', label: 'Server Prefix', type: 'text', required: true, placeholder: 'us1' },
      ],
    },
    {
      id: 'sendgrid',
      name: 'SendGrid',
      description: 'Send transactional and marketing emails with SendGrid integration.',
      category: 'email',
      icon: '✉️',
      logoUrl: integrationIcons.sendgrid,
      color: 'from-blue-500 to-cyan-500',
      connected: false,
      features: ['Email delivery', 'Template management', 'Analytics', 'Contact lists'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'SG...' },
      ],
    },

    // Automation & Workflows
    {
      id: 'zapier',
      name: 'Zapier',
      description: 'Connect your CRM with 5,000+ apps through Zapier automations.',
      category: 'automation',
      icon: '⚙️',
      logoUrl: integrationIcons.zapier,
      color: 'from-orange-400 to-yellow-500',
      connected: false,
      features: ['Multi-app zaps', 'Trigger actions', 'Data sync', 'Custom workflows'],
      configFields: [
        { name: 'webhookUrl', label: 'Zapier Webhook URL', type: 'url', required: true, placeholder: 'https://hooks.zapier.com/hooks/catch/...' },
      ],
    },
    {
      id: 'n8n',
      name: 'n8n',
      description: 'Automate workflows and connect your CRM with 300+ apps through n8n webhooks and workflows.',
      category: 'automation',
      icon: '⚡',
      logoUrl: integrationIcons.n8n,
      color: 'from-orange-500 to-red-500',
      connected: false,
      features: ['Webhook triggers', 'Custom workflows', 'Data transformation', 'Multi-app connections'],
      configFields: [
        { name: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://your-n8n-instance.com/webhook/...' },
        { name: 'apiKey', label: 'API Key', type: 'password', required: false, placeholder: 'Optional API key' },
      ],
    },
    {
      id: 'make',
      name: 'Make (Integromat)',
      description: 'Build visual automation scenarios with Make and connect hundreds of apps.',
      category: 'automation',
      icon: '🔄',
      logoUrl: integrationIcons.make,
      color: 'from-purple-600 to-pink-600',
      connected: false,
      features: ['Visual workflows', 'Scenario builder', 'Data routing', 'Error handling'],
      configFields: [
        { name: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://hook.make.com/...' },
      ],
    },
    {
      id: 'manychat',
      name: 'Manychat',
      description: 'Sync contacts from Manychat campaigns, track user interactions, and automate follow-ups.',
      category: 'automation',
      icon: '💬',
      logoUrl: integrationIcons.manychat,
      color: 'from-green-500 to-emerald-500',
      connected: false,
      features: ['Contact sync', 'Campaign tracking', 'Message automation', 'Tag management'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Your Manychat API Key' },
        { name: 'pageId', label: 'Facebook Page ID', type: 'text', required: true, placeholder: '123456789' },
      ],
    },

    // Forms & Surveys
    {
      id: 'typeform',
      name: 'Typeform',
      description: 'Automatically create contacts and leads from Typeform submissions with field mapping.',
      category: 'forms',
      icon: '📝',
      logoUrl: integrationIcons.typeform,
      color: 'from-blue-500 to-cyan-500',
      connected: false,
      features: ['Auto-create contacts', 'Custom field mapping', 'Real-time sync', 'Form analytics'],
      configFields: [
        { name: 'apiToken', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'tfp_...', helpText: 'Go to Typeform → Settings → Personal tokens → Generate new token. Select scopes: Forms (Read), Responses (Read), Webhooks (Read+Write).' },
        { name: 'formId', label: 'Form ID (optional)', type: 'text', required: false, placeholder: 'aBcDeF12', helpText: 'Found in the form URL: https://form.typeform.com/to/aBcDeF12. Leave empty to receive webhooks from all forms.' },
      ],
    },

    // ManyChat Integration
    {
      id: 'manychat',
      name: 'ManyChat',
      description: 'Import leads from ManyChat chatbot flows and trigger ManyChat automation sequences directly from your CRM contacts.',
      category: 'marketing',
      icon: '🤖',
      logoUrl: 'https://manychat.com/favicon.ico',
      color: 'from-indigo-500 to-purple-600',
      connected: false,
      features: ['Lead import from flows', 'Auto-create CRM contacts', 'Trigger flows from CRM', 'WhatsApp auto-send', 'Custom field mapping'],
      configFields: [
        {
          name: 'apiKey',
          label: 'ManyChat API Key',
          type: 'password',
          required: true,
          placeholder: 'your_manychat_api_key',
          helpText: 'Go to ManyChat → Settings → API → Copy your API key.',
        },
        {
          name: 'securityKey',
          label: 'Webhook Security Key (optional)',
          type: 'text',
          required: false,
          placeholder: 'my_secret_key',
          helpText: 'Optional: set a security key and add it to your ManyChat External Request as the "key" field to validate incoming webhooks.',
        },
      ],
    },

    {
      id: 'google-forms',
      name: 'Google Forms',
      description: 'Capture leads and create contacts from Google Forms submissions.',
      category: 'forms',
      icon: '📋',
      logoUrl: integrationIcons.googleforms,
      color: 'from-purple-600 to-indigo-600',
      connected: false,
      features: ['Lead capture', 'Auto-sync', 'Field mapping', 'Response tracking'],
      configFields: [
        { name: 'formId', label: 'Form ID', type: 'text', required: true, placeholder: 'Your Google Form ID' },
        { name: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text', required: true },
      ],
    },
    {
      id: 'jotform',
      name: 'Jotform',
      description: 'Sync form submissions and automatically create leads in your CRM.',
      category: 'forms',
      icon: '📄',
      logoUrl: integrationIcons.jotform,
      color: 'from-orange-500 to-amber-500',
      connected: false,
      features: ['Form sync', 'Lead creation', 'Custom fields', 'Webhooks'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true },
        { name: 'formId', label: 'Form ID', type: 'text', required: true },
      ],
    },

    // Scheduling (Note: This will be overridden by backend data which uses OAuth)
    {
      id: 'calendly',
      name: 'Calendly',
      description: 'Sync appointments, create contacts from bookings, and track meeting outcomes. Simply click Connect and authorize - no API keys needed!',
      category: 'scheduling',
      icon: '📅',
      logoUrl: integrationIcons.calendly,
      color: 'from-blue-500 to-cyan-600',
      connected: false,
      features: ['Appointment sync', 'Auto-create contacts', 'Meeting tracking', 'Calendar integration'],
      oauth: true,
      oauthProvider: 'calendly',
    },
    {
      id: 'cal-com',
      name: 'Cal.com',
      description: 'Open-source scheduling with automatic contact creation and meeting sync.',
      category: 'scheduling',
      icon: '🗓️',
      logoUrl: integrationIcons.cal,
      color: 'from-gray-800 to-gray-900',
      connected: false,
      features: ['Booking sync', 'Contact automation', 'Team scheduling', 'Integrations'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      ],
    },

    // Payments
    {
      id: 'stripe',
      name: 'Stripe',
      description: 'Track payments, manage subscriptions, and sync customer data with Stripe.',
      category: 'payments',
      icon: '💳',
      logoUrl: integrationIcons.stripe,
      color: 'from-indigo-600 to-purple-600',
      connected: false,
      features: ['Payment tracking', 'Subscription management', 'Customer sync', 'Invoice automation'],
      configFields: [
        { name: 'secretKey', label: 'Secret Key', type: 'password', required: true, placeholder: 'sk_...' },
        { name: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: true, placeholder: 'whsec_...' },
      ],
    },
    {
      id: 'paypal',
      name: 'PayPal',
      description: 'Accept payments, track transactions, and manage customer billing.',
      category: 'payments',
      icon: '💰',
      logoUrl: integrationIcons.paypal,
      color: 'from-blue-600 to-blue-700',
      connected: false,
      features: ['Payment processing', 'Transaction tracking', 'Refund management', 'Customer sync'],
      configFields: [
        { name: 'clientId', label: 'Client ID', type: 'text', required: true },
        { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      ],
    },
    {
      id: 'smartbill',
      name: 'SmartBill',
      description: 'Automated invoicing and billing for Romanian businesses. Issue invoices, manage fiscal data, and sync payments.',
      category: 'payments',
      icon: '🧾',
      logoUrl: integrationIcons.smartbill,
      color: 'from-blue-500 to-cyan-600',
      connected: false,
      features: ['Auto invoice generation', 'Fiscal compliance', 'ANAF integration', 'Payment tracking'],
      configFields: [
        { name: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'Your SmartBill API token' },
        { name: 'email', label: 'SmartBill Email', type: 'text', required: true, placeholder: 'account@smartbill.ro' },
        { name: 'companyVat', label: 'Company VAT', type: 'text', required: true, placeholder: 'RO12345678' },
      ],
    },
    {
      id: 'oblio',
      name: 'Oblio',
      description: 'Cloud invoicing platform for Romanian businesses with ANAF e-Factura integration.',
      category: 'payments',
      icon: '📄',
      logoUrl: integrationIcons.oblio,
      color: 'from-emerald-500 to-green-600',
      connected: false,
      features: ['E-Factura ANAF', 'Automatic invoicing', 'VAT compliance', 'Cloud storage'],
      configFields: [
        { name: 'email', label: 'Oblio Email', type: 'text', required: true, placeholder: 'your@email.com' },
        { name: 'secret', label: 'API Secret', type: 'password', required: true, placeholder: 'Your Oblio API secret' },
        { name: 'cif', label: 'Company CIF', type: 'text', required: true, placeholder: 'RO12345678' },
      ],
    },
    {
      id: 'fgo',
      name: 'FGO (FacturaGestiune Online)',
      description: 'Romanian invoicing and inventory management system with fiscal compliance.',
      category: 'payments',
      icon: '📋',
      logoUrl: integrationIcons.fgo,
      color: 'from-orange-500 to-red-600',
      connected: false,
      features: ['Invoice generation', 'Inventory sync', 'Fiscal reports', 'ANAF compliance'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Your FGO API key' },
        { name: 'username', label: 'Username', type: 'text', required: true, placeholder: 'FGO username' },
        { name: 'cui', label: 'Company CUI', type: 'text', required: true, placeholder: '12345678' },
      ],
    },
    {
      id: 'esemneaza',
      name: 'eSemneaza',
      description: 'Trimite contracte la semnat direct din CRM si primeste status in timp real.',
      category: 'payments',
      icon: '🖊️',
      logoUrl: integrationIcons.esemneaza || integrationIcons.pandadoc,
      color: 'from-blue-600 to-cyan-600',
      connected: false,
      features: ['Trimitere contract', 'Link semnare', 'Webhook status semnat', 'Automatizare post-semnare'],
      configFields: [
        { name: 'apiUrl', label: 'API URL', type: 'url', required: true, placeholder: 'https://api.esemneaza.ro' },
        { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'ESM_...' },
        { name: 'sendContractPath', label: 'Send Contract Path', type: 'text', required: false, placeholder: '/contracts/send' },
        { name: 'listTemplatesPath', label: 'Templates Path', type: 'text', required: false, placeholder: '/templates' },
        { name: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: false, placeholder: 'Secret pentru verificare webhook' },
      ],
    },
    {
      id: 'payfunnels',
      name: 'PayFunnels',
      description: 'Payment and funnel management platform for online businesses and sales funnels.',
      category: 'payments',
      icon: '💸',
      logoUrl: integrationIcons.payfunnels,
      color: 'from-purple-500 to-pink-600',
      connected: false,
      features: ['Funnel tracking', 'Payment processing', 'Conversion optimization', 'A/B testing'],
      configFields: [
        { name: 'apiUrl', label: 'API URL', type: 'url', required: false, placeholder: 'https://api.payfunnels.com' },
        { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Your PayFunnels API key' },
        { name: 'accountId', label: 'Account ID', type: 'text', required: true, placeholder: 'Your account ID' },
        { name: 'createPaymentPath', label: 'Create Payment Path', type: 'text', required: false, placeholder: '/payments/links' },
        { name: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: false, placeholder: 'Secret pentru verificare webhook' },
      ],
    },

    // Social Media
    {
      id: 'facebook',
      name: 'Facebook',
      description: 'Sync leads from Facebook Lead Ads and track social interactions.',
      category: 'social',
      icon: '👥',
      logoUrl: integrationIcons.facebook,
      color: 'from-blue-600 to-indigo-700',
      connected: false,
      features: ['Lead ads sync', 'Page management', 'Message automation', 'Ad tracking'],
      configFields: [
        { name: 'pageId', label: 'Page ID', type: 'text', required: true },
        { name: 'accessToken', label: 'Access Token', type: 'password', required: true },
      ],
    },
    {
      id: 'instagram',
      name: 'Instagram',
      description: 'Manage Instagram messages, comments, and track engagement with leads.',
      category: 'social',
      icon: '📸',
      logoUrl: integrationIcons.instagram,
      color: 'from-pink-500 to-purple-600',
      connected: false,
      features: ['DM automation', 'Comment tracking', 'Engagement sync', 'Story interactions'],
      configFields: [
        { name: 'accountId', label: 'Business Account ID', type: 'text', required: true },
        { name: 'accessToken', label: 'Access Token', type: 'password', required: true },
      ],
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      description: 'Connect with professionals, track leads, and automate outreach campaigns.',
      category: 'social',
      icon: '💼',
      logoUrl: integrationIcons.linkedin,
      color: 'from-blue-700 to-blue-800',
      connected: false,
      features: ['Lead generation', 'Connection tracking', 'Message automation', 'Profile sync'],
      configFields: [
        { name: 'clientId', label: 'Client ID', type: 'text', required: true },
        { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      ],
    },

    // E-commerce
    {
      id: 'shopify',
      name: 'Shopify',
      description: 'Sync customers, orders, and products from your Shopify store.',
      category: 'ecommerce',
      icon: '🛍️',
      logoUrl: integrationIcons.shopify,
      color: 'from-green-600 to-emerald-600',
      connected: false,
      features: ['Customer sync', 'Order tracking', 'Product management', 'Abandoned cart recovery'],
      configFields: [
        { name: 'shopDomain', label: 'Shop Domain', type: 'text', required: true, placeholder: 'your-store.myshopify.com' },
        { name: 'accessToken', label: 'Access Token', type: 'password', required: true },
      ],
    },
    {
      id: 'woocommerce',
      name: 'WooCommerce',
      description: 'Integrate your WooCommerce store to manage customers and track orders.',
      category: 'ecommerce',
      icon: '🛒',
      logoUrl: integrationIcons.woocommerce,
      color: 'from-purple-600 to-pink-600',
      connected: false,
      features: ['Order sync', 'Customer data', 'Product catalog', 'Sales tracking'],
      configFields: [
        { name: 'storeUrl', label: 'Store URL', type: 'url', required: true, placeholder: 'https://yourstore.com' },
        { name: 'consumerKey', label: 'Consumer Key', type: 'text', required: true },
        { name: 'consumerSecret', label: 'Consumer Secret', type: 'password', required: true },
      ],
    },

    // Analytics
    {
      id: 'google-analytics',
      name: 'Google Analytics',
      description: 'Track website visitors, analyze behavior, and sync data with CRM contacts.',
      category: 'analytics',
      icon: '📊',
      logoUrl: integrationIcons['google-analytics'],
      color: 'from-orange-500 to-yellow-500',
      connected: false,
      features: ['Traffic tracking', 'Event monitoring', 'Conversion tracking', 'User behavior'],
      configFields: [
        { name: 'propertyId', label: 'Property ID', type: 'text', required: true, placeholder: 'GA4 Property ID' },
        { name: 'measurementId', label: 'Measurement ID', type: 'text', required: true, placeholder: 'G-...' },
      ],
    },
    {
      id: 'mixpanel',
      name: 'Mixpanel',
      description: 'Advanced product analytics and user behavior tracking for better insights.',
      category: 'analytics',
      icon: '📈',
      logoUrl: integrationIcons.mixpanel,
      color: 'from-indigo-600 to-purple-700',
      connected: false,
      features: ['Event tracking', 'Funnel analysis', 'User segmentation', 'Retention reports'],
      configFields: [
        { name: 'projectToken', label: 'Project Token', type: 'password', required: true },
        { name: 'apiSecret', label: 'API Secret', type: 'password', required: true },
      ],
    },

    // Customer Support
    {
      id: 'intercom',
      name: 'Intercom',
      description: 'Sync customer conversations, track support tickets, and automate messaging.',
      category: 'support',
      icon: '💬',
      logoUrl: integrationIcons.intercom,
      color: 'from-blue-500 to-indigo-600',
      connected: false,
      features: ['Chat sync', 'Ticket tracking', 'User data', 'Automation'],
      configFields: [
        { name: 'accessToken', label: 'Access Token', type: 'password', required: true },
      ],
    },
    {
      id: 'zendesk',
      name: 'Zendesk',
      description: 'Integrate support tickets, customer data, and service interactions.',
      category: 'support',
      icon: '🎫',
      logoUrl: integrationIcons.zendesk,
      color: 'from-green-600 to-teal-600',
      connected: false,
      features: ['Ticket sync', 'Customer profiles', 'SLA tracking', 'Knowledge base'],
      configFields: [
        { name: 'subdomain', label: 'Subdomain', type: 'text', required: true, placeholder: 'yourcompany' },
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'apiToken', label: 'API Token', type: 'password', required: true },
      ],
    },

    // Productivity
    {
      id: 'notion',
      name: 'Notion',
      description: 'Sync contacts, deals, and tasks with your Notion workspace.',
      category: 'productivity',
      icon: '📝',
      logoUrl: integrationIcons.notion,
      color: 'from-gray-800 to-gray-900',
      connected: false,
      features: ['Database sync', 'Page creation', 'Task management', 'Team collaboration'],
      configFields: [
        { name: 'integrationToken', label: 'Integration Token', type: 'password', required: true },
        { name: 'databaseId', label: 'Database ID', type: 'text', required: true },
      ],
    },
    {
      id: 'airtable',
      name: 'Airtable',
      description: 'Sync data between your CRM and Airtable bases for advanced workflows.',
      category: 'productivity',
      icon: '🗃️',
      logoUrl: integrationIcons.airtable,
      color: 'from-yellow-500 to-orange-500',
      connected: false,
      features: ['Base sync', 'Record creation', 'View filtering', 'Field mapping'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true },
        { name: 'baseId', label: 'Base ID', type: 'text', required: true, placeholder: 'app...' },
      ],
    },
  ]);

  const categories = [
    { id: 'all', name: 'All Integrations' },
    { id: 'communication', name: 'Communication' },
    { id: 'email', name: 'Email & Marketing' },
    { id: 'automation', name: 'Automation' },
    { id: 'forms', name: 'Forms & Surveys' },
    { id: 'scheduling', name: 'Scheduling' },
    { id: 'payments', name: 'Payments' },
    { id: 'social', name: 'Social Media' },
    { id: 'ecommerce', name: 'E-commerce' },
    { id: 'analytics', name: 'Analytics' },
    { id: 'support', name: 'Customer Support' },
    { id: 'productivity', name: 'Productivity' },
  ];

  // Fetch available and connected integrations on mount
  useEffect(() => {
    const fetchIntegrations = async () => {
      try {
        // Fetch available integrations from backend (only those with handlers)
        const availableResponse = await api.get('/integrations/available');
        const available = availableResponse.data.integrations || [];

        // Fetch connected integrations
        const connectedResponse = await api.get('/integrations');
        const connected = connectedResponse.data.integrations || [];

        // Create a map of connected integrations by type
        const connectedMap: Record<string, any> = {};
        connected.forEach((int: any) => {
          const typeKey = String(int.type || '').toLowerCase();
          const externalKey = String(int.externalId || '').toLowerCase();
          const providerKey = String(int.config?.provider || '').toLowerCase();

          if (typeKey) {
            connectedMap[typeKey] = int;
          }
          if (externalKey) {
            connectedMap[externalKey] = int;
          }
          if (providerKey) {
            connectedMap[providerKey] = int;
          }
        });

        setConnectedIntegrations(connectedMap);

        // Merge backend connection status into the static integrations list
        // (preserves static configFields which are more detailed than the generic fallback)
        setIntegrations(prev => prev.map(staticInt => {
          const backendInt = available.find((b: any) => String(b.type || '').toLowerCase() === staticInt.id);
          const connectedEntry = connectedMap[staticInt.id];
          if (!backendInt && !connectedEntry) return staticInt;
          // Webhook-only integrations (typeform, manychat, calendly) work without active API key test — treat pending as connected
          const isConnected = connectedEntry
            ? connectedEntry.status !== 'disabled' && connectedEntry.status !== 'expired' && connectedEntry.status !== 'suspended'
            : false;
          return {
            ...staticInt,
            connected: isConnected,
            status: connectedEntry?.status,
          };
        }));
      } catch (error) {
        console.error('Failed to fetch integrations:', error);
        // Keep hardcoded integrations as fallback
      }
    };

    fetchIntegrations();
  }, []);

  const filteredIntegrations = integrations.filter((integration) => {
    const matchesSearch = integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || integration.category === filter;
    return matchesSearch && matchesFilter;
  });

  const handleConnect = async (integration: Integration) => {
    // If already connected, show manage modal
    const existing = connectedIntegrations[integration.id];

    if (integration.connected && existing) {
      setManagingIntegration(integration);
      // Fetch Typeform forms if applicable
      if (integration.id === 'typeform' && existing.id) {
        setIsLoadingForms(true);
        api.get(`/integrations/${existing.id}/typeform/forms`)
          .then(res => setTypeformForms(res.data.forms || []))
          .catch(() => setTypeformForms([]))
          .finally(() => setIsLoadingForms(false));
      }
      return;
    }

    // Normalize provider names (e.g. Gmail uses Google OAuth)
    const mapProvider = (id?: string, provider?: string) => {
      const p = (provider || id || '').toLowerCase().trim();
      console.log('[mapProvider] Input - id:', id, 'provider:', provider, 'result p:', p);

      // Map Gmail and Google Workspace to google
      if (p === 'gmail' || p.includes('google')) return 'google';

      // Return the provider as-is
      const result = p;
      console.log('[mapProvider] Output:', result);
      return result;
    };

    // For OAuth integrations, redirect to integration OAuth flow
    if (integration.oauth) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const provider = mapProvider(integration.id, integration.oauthProvider);

      try {
        // Fetch current user data from API to ensure we have the correct IDs
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
          setModalError('Please log in first');
          router.push('/login');
          return;
        }

        const response = await fetch(`${apiUrl}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const userData = await response.json();
        const { id: userId, workspaceId } = userData;

        if (!userId || !workspaceId) {
          setModalError('Unable to determine user or workspace. Please log in again.');
          return;
        }

        // Redirect to OAuth endpoint with workspace and user context.
        // If an integration record already exists (even if pending), reuse it to avoid "already connected" errors.
        const integrationIdParam = existing?.id ? `&integration_id=${existing.id}` : '';
        const oauthUrl = `${apiUrl}/integrations/oauth/${provider}?workspace_id=${workspaceId}&user_id=${userId}${integrationIdParam}`;
        console.log('[OAuth] Redirecting to:', oauthUrl);
        console.log('[OAuth] Integration details:', { id: integration.id, name: integration.name, provider, oauthProvider: integration.oauthProvider });
        window.location.href = oauthUrl;
        return;
      } catch (error) {
        console.error('Error connecting integration:', error);
        setModalError('Failed to connect integration. Please try logging in again.');
        return;
      }
    }

    // For manual config integrations, show modal
    setSelectedIntegration(integration);
    setConfigData({});
  };

  const handleDisconnect = async (integration: Integration) => {
    if (!connectedIntegrations[integration.id]) return;

    setIsSubmitting(true);
    setModalError('');

    try {
      await api.delete(`/integrations/${connectedIntegrations[integration.id].id}`);

      // Update local state
      const newConnected = { ...connectedIntegrations };
      delete newConnected[integration.id];
      setConnectedIntegrations(newConnected);

      setIntegrations(prevIntegrations =>
        prevIntegrations.map(int =>
          int.id === integration.id ? { ...int, connected: false } : int
        )
      );

      setManagingIntegration(null);
    } catch (err: any) {
      console.error('Failed to disconnect integration:', err);
      setModalError(err.response?.data?.message || 'Failed to disconnect integration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestConnection = async (integration: Integration) => {
    if (!connectedIntegrations[integration.id]) {
      setModalError('Integration not found. Please reconnect this integration.');
      return;
    }

    setIsSubmitting(true);
    setModalError('');

    try {
      const response = await api.post(`/integrations/${connectedIntegrations[integration.id].id}/test`);

      if (response.data.success) {
        setModalError(''); // Clear any errors
        alert(`✅ Connection test successful!\n\n${response.data.message || 'Your integration is working correctly.'}`);
      } else {
        setModalError(response.data.message || 'Connection test failed. Please check your credentials.');
      }
    } catch (err: any) {
      console.error('Failed to test connection:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to test connection. Please check your credentials and try again.';
      setModalError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncNow = async (integration: Integration) => {
    if (!connectedIntegrations[integration.id]) return;

    setIsSubmitting(true);
    setModalError('');

    try {
      await api.post(`/integrations/${connectedIntegrations[integration.id].id}/sync`);
      alert('Sync started successfully!');
    } catch (err: any) {
      console.error('Failed to sync:', err);
      setModalError(err.response?.data?.message || 'Failed to start sync');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedIntegration(null);
    setConfigData({});
  };

  const handleConfigChange = (fieldName: string, value: string) => {
    setConfigData({ ...configData, [fieldName]: value });
  };

  const handleSubmitConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedIntegration) return;

    setIsSubmitting(true);
    setModalError('');

    try {
      const knownBackendTypes = new Set([
        'slack',
        'google',
        'microsoft',
        'salesforce',
        'hubspot',
        'zoom',
        'typeform',
        'pandadoc',
        'docusign',
        'calendly',
        'kajabi',
        'whatsapp',
        'manychat',
        'webhook',
        'api',
      ]);

      const integrationId = selectedIntegration.id.toLowerCase();
      const backendType = knownBackendTypes.has(integrationId) ? integrationId : 'api';
      const externalId = backendType === 'api' && integrationId !== 'api' ? integrationId : undefined;

      // Separate credential fields (API keys, tokens, secrets) from config fields
      const credentialFieldNames = ['apiToken', 'apiKey', 'accessToken', 'secretKey', 'authToken', 'secret', 'consumerKey', 'consumerSecret', 'clientSecret', 'apiSecret'];
      const credentials: Record<string, string> = {};
      const config: Record<string, string> = {};

      for (const [key, value] of Object.entries(configData)) {
        if (credentialFieldNames.includes(key)) {
          credentials[key] = value;
        } else {
          config[key] = value;
        }
      }

      // Generic API integrations need a provider key and baseUrl for connection testing.
      if (backendType === 'api') {
        config.provider = integrationId;
        if (config.apiUrl && !config.baseUrl) {
          config.baseUrl = config.apiUrl;
        }
      }

      const response = await api.post('/integrations/install', {
        type: backendType,
        authType: 'api_key',
        externalId,
        name: selectedIntegration.name,
        config,
        credentials,
      });

      // Refetch connected integrations to get the full integration data
      const connectedResponse = await api.get('/integrations');
      const connected = connectedResponse.data.integrations || [];

      const connectedMap: Record<string, any> = {};
      connected.forEach((int: any) => {
        const typeKey = String(int.type || '').toLowerCase();
        const externalKey = String(int.externalId || '').toLowerCase();
        const providerKey = String(int.config?.provider || '').toLowerCase();
        if (typeKey) connectedMap[typeKey] = int;
        if (externalKey) connectedMap[externalKey] = int;
        if (providerKey) connectedMap[providerKey] = int;
      });

      setConnectedIntegrations(connectedMap);

      // Update the integration status locally
      const updatedIntegrations = integrations.map(int =>
        int.id === selectedIntegration.id ? { ...int, connected: true } : int
      );
      setIntegrations(updatedIntegrations);

      handleCloseModal();

      // Show success message with unique webhook URL
      const createdIntegration = response.data?.integration || response.data;
      const createdIntegrationId = createdIntegration?.id || connectedMap[integrationId]?.id;
      const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace('/api/v1', '');
      const needsWebhook = ['typeform', 'calendly', 'manychat'].includes(selectedIntegration.id);

      if (selectedIntegration.id === 'whatsapp') {
        const waWebhookUrl = `${apiUrl}/api/v1/integrations/whatsapp/webhook`;
        alert(`WhatsApp integration connected!\n\nWebhook URL for Meta for Developers:\n${waWebhookUrl}\n\nPaste this URL in Meta → App → WhatsApp → Configuration → Webhook URL.`);
      } else if (selectedIntegration.id === 'esemneaza' && createdIntegrationId) {
        const webhookUrl = `${apiUrl}/api/v1/documents/webhooks/esemneaza/${createdIntegrationId}`;
        alert(`eSemneaza connected!\n\nWebhook URL:\n${webhookUrl}\n\nConfigure this URL in eSemneaza for signature status callbacks.`);
      } else if (selectedIntegration.id === 'payfunnels' && createdIntegrationId) {
        const webhookUrl = `${apiUrl}/api/v1/documents/webhooks/payfunnel/${createdIntegrationId}`;
        alert(`PayFunnels connected!\n\nWebhook URL:\n${webhookUrl}\n\nConfigure this URL in PayFunnels for payment status callbacks.`);
      } else if (createdIntegrationId && needsWebhook) {
        const webhookUrl = `${apiUrl}/api/v1/integrations/webhooks/${createdIntegrationId}`;
        alert(`Integration connected!\n\nYour unique webhook URL:\n${webhookUrl}\n\nPaste this URL in ${selectedIntegration.name}'s webhook settings.`);
      } else {
        alert('Integration connected successfully!');
      }
    } catch (err: any) {
      console.error('Failed to connect integration:', err);
      setModalError(err.response?.data?.message || 'Failed to connect integration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getWebhookUrl = (integrationKey: string, record?: any): string | null => {
    if (!record?.id) return null;
    const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace('/api/v1', '');

    if (integrationKey === 'esemneaza') {
      return `${baseUrl}/api/v1/documents/webhooks/esemneaza/${record.id}`;
    }
    if (integrationKey === 'payfunnels') {
      return `${baseUrl}/api/v1/documents/webhooks/payfunnel/${record.id}`;
    }
    if (['typeform', 'calendly', 'manychat'].includes(integrationKey)) {
      return `${baseUrl}/api/v1/integrations/webhooks/${record.id}`;
    }
    return null;
  };

  const getConnectedIntegrationOptions = () => {
    const unique = new Map<string, any>();
    Object.values(connectedIntegrations).forEach((integration: any) => {
      if (integration?.id && !unique.has(integration.id)) {
        unique.set(integration.id, integration);
      }
    });
    return Array.from(unique.values());
  };

  const connectedIntegrationOptions = getConnectedIntegrationOptions();

  const openWebhookDocs = () => {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace('/api/v1', '');
    window.open(`${apiBase}/api/docs`, '_blank');
  };

  const openCreateWebhookModal = () => {
    setWebhookError('');
    setWebhookSuccess('');

    if (connectedIntegrationOptions.length === 0) {
      setModalError('Connect at least one integration before creating a custom webhook.');
      return;
    }

    setWebhookForm((prev) => ({
      ...prev,
      integrationId: prev.integrationId || connectedIntegrationOptions[0].id,
      event: prev.event || '*',
    }));
    setShowWebhookModal(true);
  };

  const handleWebhookFormChange = (key: keyof typeof webhookForm, value: string) => {
    setWebhookForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookError('');
    setWebhookSuccess('');

    if (!webhookForm.integrationId || !webhookForm.url || !webhookForm.event) {
      setWebhookError('Integration, URL and event are required.');
      return;
    }

    let parsedHeaders: Record<string, string> | undefined;
    if (webhookForm.headersJson.trim()) {
      try {
        const headersCandidate = JSON.parse(webhookForm.headersJson);
        if (!headersCandidate || typeof headersCandidate !== 'object' || Array.isArray(headersCandidate)) {
          setWebhookError('Headers must be a valid JSON object.');
          return;
        }
        parsedHeaders = Object.fromEntries(
          Object.entries(headersCandidate).map(([k, v]) => [String(k), String(v)]),
        );
      } catch {
        setWebhookError('Headers JSON is invalid.');
        return;
      }
    }

    try {
      setIsWebhookSubmitting(true);
      const response = await api.post(`/integrations/${webhookForm.integrationId}/webhooks`, {
        url: webhookForm.url.trim(),
        event: webhookForm.event.trim(),
        secret: webhookForm.secret.trim() || undefined,
        headers: parsedHeaders,
      });

      setWebhookSuccess(`Webhook created: ${response.data?.id || 'success'}`);
      setWebhookForm((prev) => ({
        ...prev,
        url: '',
        event: '*',
        secret: '',
        headersJson: '',
      }));
    } catch (err: any) {
      console.error('Failed to create webhook:', err);
      setWebhookError(err.response?.data?.message || 'Failed to create webhook.');
    } finally {
      setIsWebhookSubmitting(false);
    }
  };

  const connectedCount = integrations.filter(i => i.connected).length;
  const totalCount = integrations.length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
          Integrations
        </h1>
        <p className="mt-2 text-gray-600">
          Connect your favorite tools and apps to automate your workflow
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up" style={{ animationDelay: '100ms' }}>
        <div className="glass-effect rounded-2xl p-6 border border-indigo-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <Check className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Connected</p>
              <p className="text-2xl font-bold text-gray-900">{connectedCount}</p>
            </div>
          </div>
        </div>
        <div className="glass-effect rounded-2xl p-6 border border-purple-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-600">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Available</p>
              <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
            </div>
          </div>
        </div>
        <div className="glass-effect rounded-2xl p-6 border border-green-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Categories</p>
              <p className="text-2xl font-bold text-gray-900">{categories.length - 1}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col gap-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-400" />
          <input
            type="text"
            placeholder="Search from 30+ integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-indigo-200/50 bg-white/50 py-3.5 pl-11 pr-4 text-sm placeholder:text-gray-500 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setFilter(category.id)}
              className={`whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-semibold transition-all ${
                filter === category.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-105'
                  : 'bg-white text-gray-700 hover:bg-gray-50 hover:shadow-md border border-gray-200'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredIntegrations.map((integration, idx) => (
          <div
            key={integration.id}
            style={{ animationDelay: `${idx * 100}ms` }}
            className="group relative overflow-hidden glass-effect rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl animate-scale-in"
          >
            {/* Gradient Background */}
            <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${integration.color} opacity-10 blur-2xl transition-all duration-500 group-hover:opacity-20 group-hover:scale-125`}></div>

            <div className="relative">
              {/* Icon and Status */}
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-3 shadow-lg border border-gray-100">
                  {integration.logoUrl ? (
                    <img
                      src={integration.logoUrl}
                      alt={`${integration.name} logo`}
                      className="w-12 h-12 object-contain"
                      onError={(e) => {
                        // Fallback to emoji icon if image fails
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `<span class="text-3xl">${integration.icon}</span>`;
                        }
                      }}
                    />
                  ) : (
                    <span className="text-3xl">{integration.icon}</span>
                  )}
                </div>
                {integration.connected && (
                  <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <Check className="h-3 w-3" />
                    Connected
                  </div>
                )}
              </div>

              {/* Name and Description */}
              <h3 className="mb-2 text-xl font-bold text-gray-900">{integration.name}</h3>
              <p className="mb-4 text-sm text-gray-600">{integration.description}</p>

              {/* Features */}
              {integration.features && integration.features.length > 0 && (
                <div className="mb-4 space-y-2">
                  {integration.features.slice(0, 3).map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                      <Zap className="h-3.5 w-3.5 text-indigo-600" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleConnect(integration)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                    integration.connected
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:shadow-xl'
                  }`}
                >
                  {integration.connected ? 'Manage' : 'Connect'}
                </button>
                <button
                  onClick={() => handleConnect(integration)}
                  className="rounded-xl bg-white/50 p-2.5 hover:bg-white transition-all"
                >
                  <Settings className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Custom Webhooks Section */}
      <div className="glass-effect rounded-2xl p-8 animate-slide-up">
        <div className="flex items-start gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg">
            <Webhook className="h-8 w-8 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Custom Webhooks</h3>
            <p className="text-gray-600 mb-4">
              Need a custom integration? Use webhooks to connect any service to your CRM.
            </p>
            <div className="flex gap-4">
              <button
                onClick={openWebhookDocs}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all"
              >
                View Documentation
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                onClick={openCreateWebhookModal}
                className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
              >
                Create Webhook
              </button>
            </div>
          </div>
        </div>
      </div>

      {showWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowWebhookModal(false)}
              className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Create Custom Webhook</h2>
              <p className="text-sm text-gray-600 mt-1">
                Register a webhook endpoint to receive integration events.
              </p>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-4">
              {webhookError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {webhookError}
                </div>
              )}
              {webhookSuccess && (
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                  {webhookSuccess}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Connected Integration</label>
                <select
                  value={webhookForm.integrationId}
                  onChange={(e) => handleWebhookFormChange('integrationId', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  required
                >
                  <option value="">Select integration</option>
                  {connectedIntegrationOptions.map((integration: any) => (
                    <option key={integration.id} value={integration.id}>
                      {integration.name} ({integration.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Destination URL</label>
                <input
                  type="url"
                  value={webhookForm.url}
                  onChange={(e) => handleWebhookFormChange('url', e.target.value)}
                  placeholder="https://your-system.com/webhooks/slackcrm"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Event</label>
                <input
                  type="text"
                  value={webhookForm.event}
                  onChange={(e) => handleWebhookFormChange('event', e.target.value)}
                  placeholder="* or payment.received"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Secret (optional)</label>
                <input
                  type="text"
                  value={webhookForm.secret}
                  onChange={(e) => handleWebhookFormChange('secret', e.target.value)}
                  placeholder="webhook secret"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Headers JSON (optional)</label>
                <textarea
                  value={webhookForm.headersJson}
                  onChange={(e) => handleWebhookFormChange('headersJson', e.target.value)}
                  placeholder='{"X-Source":"crm"}'
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none resize-none"
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(false)}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isWebhookSubmitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isWebhookSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Webhook'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      {selectedIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in">
            {/* Close Button */}
            <button
              onClick={handleCloseModal}
              className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Header */}
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-3 shadow-lg border border-gray-100">
                <img
                  src={selectedIntegration.logoUrl}
                  alt={`${selectedIntegration.name} logo`}
                  className="w-12 h-12 object-contain"
                />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Connect {selectedIntegration.name}
                </h2>
                <p className="text-sm text-gray-600">
                  Configure your {selectedIntegration.name} integration
                </p>
              </div>
            </div>

            {/* Meta Embedded Signup for WhatsApp */}
            {selectedIntegration.id === 'whatsapp' && (
              <EmbeddedSignupSection
                onSuccess={() => {
                  handleCloseModal();
                  window.location.reload();
                }}
                onError={(msg: string) => setModalError(msg)}
              />
            )}

            {/* Configuration Form */}
            <form onSubmit={handleSubmitConfig} className="space-y-6">
              {selectedIntegration.id === 'whatsapp' && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">Or connect manually (Advanced)</p>
                </div>
              )}
              {/* Error Message */}
              {modalError && (
                <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900">Connection Failed</p>
                    <p className="text-sm text-red-700 mt-1">{modalError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalError('')}
                    className="text-red-400 hover:text-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {selectedIntegration.configFields?.map((field) => (
                <div key={field.name}>
                  <label htmlFor={field.name} className="block text-sm font-semibold text-gray-700 mb-2">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <div className="relative">
                    {field.type === 'text' && <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />}
                    {field.type === 'password' && <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />}
                    {field.type === 'url' && <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />}

                    {field.type === 'textarea' ? (
                      <textarea
                        id={field.name}
                        required={field.required}
                        disabled={isSubmitting}
                        value={configData[field.name] || ''}
                        onChange={(e) => handleConfigChange(field.name, e.target.value)}
                        placeholder={field.placeholder}
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        id={field.name}
                        required={field.required}
                        disabled={isSubmitting}
                        value={configData[field.name] || ''}
                        onChange={(e) => handleConfigChange(field.name, e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Select...</option>
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={field.name}
                        type={field.type}
                        required={field.required}
                        disabled={isSubmitting}
                        value={configData[field.name] || ''}
                        onChange={(e) => handleConfigChange(field.name, e.target.value)}
                        placeholder={field.placeholder}
                        className={`w-full py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none disabled:bg-gray-50 disabled:cursor-not-allowed ${
                          field.type === 'text' || field.type === 'password' || field.type === 'url' ? 'pl-12 pr-4' : 'px-4'
                        }`}
                      />
                    )}
                  </div>
                  {field.helpText && (
                    <p className="mt-2 text-xs text-gray-500">{field.helpText}</p>
                  )}
                </div>
              ))}

              {/* WhatsApp webhook setup info */}
              {managingIntegration?.id === 'whatsapp' && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="text-xs font-semibold text-green-800 mb-2">Webhook URL for Meta for Developers</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-green-900 break-all">
                      {(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace('/api/v1', '')}/api/v1/integrations/whatsapp/webhook
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(`${(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace('/api/v1', '')}/api/v1/integrations/whatsapp/webhook`)}
                      className="p-2 rounded-lg bg-white border border-green-200 hover:bg-green-100 transition-all"
                      title="Copy webhook URL"
                    >
                      <Copy className="h-4 w-4 text-green-700" />
                    </button>
                  </div>
                  <p className="text-xs text-green-700 mt-2">
                    Go to <strong>Meta for Developers → App → WhatsApp → Configuration</strong> and paste this URL as the Callback URL. Set the Verify Token to match what you enter above.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    `Connect ${selectedIntegration.name}`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Integration Modal */}
      {managingIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in">
            {/* Close Button */}
            <button
              onClick={() => {
                setManagingIntegration(null);
                setModalError('');
              }}
              className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Header */}
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-3 shadow-lg border border-gray-100">
                <img
                  src={managingIntegration.logoUrl}
                  alt={`${managingIntegration.name} logo`}
                  className="w-12 h-12 object-contain"
                />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Manage {managingIntegration.name}
                </h2>
                <p className="text-sm text-gray-600">
                  {connectedIntegrations[managingIntegration.id]?.status || 'active'} • Connected
                </p>
              </div>
            </div>

            {/* Error Message */}
            {modalError && (
              <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-900">Error</p>
                  <p className="text-sm text-red-700 mt-1">{modalError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalError('')}
                  className="text-red-400 hover:text-red-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Integration Details */}
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-600 mb-1">Status</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">
                    {connectedIntegrations[managingIntegration.id]?.status || 'Active'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm font-medium text-gray-600 mb-1">Last Sync</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {connectedIntegrations[managingIntegration.id]?.lastActivityAt
                      ? new Date(connectedIntegrations[managingIntegration.id].lastActivityAt).toLocaleDateString()
                      : 'Never'}
                  </p>
                </div>
              </div>

              {connectedIntegrations[managingIntegration.id]?.syncInfo && (
                <div className="rounded-xl bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900 mb-2">Last Sync Info</p>
                  <div className="text-sm text-blue-800">
                    <p>Records Processed: {connectedIntegrations[managingIntegration.id].syncInfo.recordsProcessed || 0}</p>
                    <p>Records Created: {connectedIntegrations[managingIntegration.id].syncInfo.recordsCreated || 0}</p>
                    <p>Records Updated: {connectedIntegrations[managingIntegration.id].syncInfo.recordsUpdated || 0}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Webhook URL for webhook-based integrations (not WhatsApp — it has its own URL block above) */}
            {getWebhookUrl(managingIntegration.id, connectedIntegrations[managingIntegration.id]) && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-6">
                <p className="text-xs font-semibold text-blue-800 mb-2">Your Webhook URL (unique to your workspace)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 text-blue-900 break-all">
                    {getWebhookUrl(managingIntegration.id, connectedIntegrations[managingIntegration.id])}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      const url = getWebhookUrl(managingIntegration.id, connectedIntegrations[managingIntegration.id]);
                      if (url) {
                        navigator.clipboard?.writeText(url);
                      }
                    }}
                    className="p-2 rounded-lg bg-white border border-blue-200 hover:bg-blue-100 transition-all"
                    title="Copy webhook URL"
                  >
                    <Copy className="h-4 w-4 text-blue-700" />
                  </button>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  Paste this URL in <strong>{managingIntegration.name}</strong> webhook settings. Each workspace gets a unique URL.
                </p>
              </div>
            )}

            {/* ManyChat Setup Guide */}
            {managingIntegration.id === 'manychat' && connectedIntegrations[managingIntegration.id]?.id && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 mb-6 space-y-3">
                <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                  🤖 How to Connect ManyChat Flows
                </h4>
                <ol className="text-xs text-indigo-800 space-y-1.5 list-decimal list-inside">
                  <li>Copy the webhook URL above.</li>
                  <li>In ManyChat, open any flow and add an <strong>External Request</strong> action.</li>
                  <li>Set the method to <strong>POST</strong> and paste the webhook URL.</li>
                  <li>
                    Add these fields to the request body (merge tags):{' '}
                    <code className="bg-white px-1 rounded text-indigo-700">first_name</code>,{' '}
                    <code className="bg-white px-1 rounded text-indigo-700">last_name</code>,{' '}
                    <code className="bg-white px-1 rounded text-indigo-700">email</code>,{' '}
                    <code className="bg-white px-1 rounded text-indigo-700">phone</code>,{' '}
                    <code className="bg-white px-1 rounded text-indigo-700">id</code>{' '}
                    (subscriber ID).
                  </li>
                  <li>Optionally add a <code className="bg-white px-1 rounded text-indigo-700">key</code> field with the security key set above.</li>
                  <li>Test the flow — a new contact should appear in your CRM instantly.</li>
                </ol>
                <p className="text-xs text-indigo-600">
                  💡 <strong>Tip:</strong> In ManyChat External Request, use merge tags like <code className="bg-white px-1 rounded">{'{{first name}}'}</code> for subscriber data.
                </p>
              </div>
            )}

            {/* Typeform Forms Management */}
            {managingIntegration.id === 'typeform' && connectedIntegrations[managingIntegration.id]?.id && (
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Connected Forms
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddFormModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-white border border-purple-300 rounded-lg hover:bg-purple-100 transition-all"
                  >
                    <Plus className="h-3 w-3" />
                    Add Form
                  </button>
                </div>

                {isLoadingForms ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                  </div>
                ) : typeformForms.length === 0 ? (
                  <p className="text-xs text-purple-700 py-3 text-center">
                    No forms connected yet. Add a form to enable per-form pipeline and WhatsApp settings.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {typeformForms.map((form: any) => (
                      <div key={form.formId} className="flex items-center justify-between bg-white rounded-lg border border-purple-100 p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{form.name || form.formId}</p>
                          <p className="text-xs text-gray-500">ID: {form.formId}</p>
                          {form.pipelineId && (
                            <p className="text-xs text-purple-600 mt-0.5">Pipeline configured</p>
                          )}
                          {form.whatsApp?.enabled && (
                            <p className="text-xs text-green-600 mt-0.5">WhatsApp auto-send enabled</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${form.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {form.enabled !== false ? 'Active' : 'Disabled'}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`Remove form "${form.name || form.formId}"?`)) return;
                              try {
                                await api.delete(`/integrations/${connectedIntegrations[managingIntegration.id].id}/typeform/forms/${form.formId}`);
                                setTypeformForms(prev => prev.filter(f => f.formId !== form.formId));
                              } catch (err) {
                                console.error('Failed to remove form:', err);
                              }
                            }}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Remove form"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Form Inline */}
                {showAddFormModal && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Add New Form</p>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newFormId}
                        onChange={(e) => setNewFormId(e.target.value)}
                        placeholder="Form ID (e.g., aBcDeF12)"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <input
                        type="text"
                        value={newFormName}
                        onChange={(e) => setNewFormName(e.target.value)}
                        placeholder="Form name (optional)"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setShowAddFormModal(false); setNewFormId(''); setNewFormName(''); }}
                          className="flex-1 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!newFormId.trim() || isSubmitting}
                          onClick={async () => {
                            setIsSubmitting(true);
                            try {
                              const res = await api.post(`/integrations/${connectedIntegrations[managingIntegration.id].id}/typeform/forms`, {
                                formId: newFormId.trim(),
                                name: newFormName.trim() || undefined,
                              });
                              if (res.data.success && res.data.form) {
                                setTypeformForms(prev => [...prev, res.data.form]);
                              }
                              setShowAddFormModal(false);
                              setNewFormId('');
                              setNewFormName('');
                            } catch (err: any) {
                              alert(err.response?.data?.message || 'Failed to add form');
                            } finally {
                              setIsSubmitting(false);
                            }
                          }}
                          className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1"
                        >
                          {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => handleTestConnection(managingIntegration)}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-indigo-300 bg-white px-6 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Test Connection
                  </>
                )}
              </button>
              {connectedIntegrations[managingIntegration.id]?.capabilities?.supportsSync !== false && (
                <button
                  onClick={() => handleSyncNow(managingIntegration)}
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Sync Now
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Disconnect Button */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to disconnect ${managingIntegration.name}? This will remove all synced data and credentials.`)) {
                    handleDisconnect(managingIntegration);
                  }
                }}
                disabled={isSubmitting}
                className="w-full rounded-xl border-2 border-red-300 bg-white px-6 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Disconnecting...' : 'Disconnect Integration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmbeddedSignupSection({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<{ appId: string; configId: string; available: boolean } | null>(null);

  useEffect(() => {
    api.get('/integrations/whatsapp/embedded-signup-config')
      .then(res => setConfig(res.data))
      .catch(() => setConfig({ appId: '', configId: '', available: false }));
  }, []);

  const handleEmbeddedSignup = () => {
    if (!config?.appId) {
      onError('Meta App ID not configured on server. Please use manual setup below.');
      return;
    }

    setIsLoading(true);

    // Load Facebook SDK
    const fbScript = document.getElementById('facebook-jssdk');
    if (!fbScript) {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      script.onload = () => initFBAndLogin();
      document.body.appendChild(script);
    } else {
      initFBAndLogin();
    }

    function initFBAndLogin() {
      const FB = (window as any).FB;
      if (!FB) {
        setIsLoading(false);
        onError('Failed to load Facebook SDK');
        return;
      }

      FB.init({
        appId: config!.appId,
        cookie: true,
        xfbml: true,
        version: 'v21.0',
      });

      FB.login(
        (response: any) => {
          if (response.authResponse?.code) {
            // Exchange code via backend
            api.post('/integrations/whatsapp/embedded-signup', { code: response.authResponse.code })
              .then((res) => {
                setIsLoading(false);
                if (res.data.success) {
                  onSuccess();
                } else {
                  onError('Signup completed but integration creation failed');
                }
              })
              .catch((err) => {
                setIsLoading(false);
                onError(err?.response?.data?.message || 'Failed to complete signup');
              });
          } else {
            setIsLoading(false);
            onError('WhatsApp signup was cancelled or failed');
          }
        },
        {
          config_id: config!.configId || undefined,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: { business: { name: 'My Business' } },
            featureType: 'only_waba_sharing',
          },
        },
      );
    }
  };

  if (!config) return null;
  if (!config.available) return null;

  return (
    <div className="rounded-xl bg-green-50 border border-green-200 p-5">
      <h3 className="text-sm font-semibold text-green-900 mb-2">Quick Setup with Meta</h3>
      <p className="text-xs text-green-700 mb-4">
        Connect your WhatsApp Business account instantly using Meta&apos;s Embedded Signup.
        No need to manually copy tokens or IDs.
      </p>
      <button
        onClick={handleEmbeddedSignup}
        disabled={isLoading}
        className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors w-full justify-center"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {isLoading ? 'Connecting...' : 'Connect with WhatsApp'}
      </button>
    </div>
  );
}
