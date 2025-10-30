'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Check, ExternalLink, Zap, Settings, Webhook, X, Copy, Key, Lock, Link as LinkIcon, AlertCircle, Loader2 } from 'lucide-react';
import Image from 'next/image';
import api from '@/lib/api';

interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  logoUrl: string;
  color: string;
  connected: boolean;
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

  const [integrations, setIntegrations] = useState<Integration[]>([
    // Communication
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'Send messages, automate conversations, and manage customer interactions via WhatsApp Business API.',
      category: 'communication',
      icon: '💬',
      logoUrl: 'https://cdn.cdnlogo.com/logos/w/20/whatsapp-icon.svg',
      color: 'from-green-500 to-emerald-500',
      connected: false,
      features: ['Bulk messaging', 'Template messages', 'Two-way chat', 'Media sharing'],
      configFields: [
        { name: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true, placeholder: '1234567890123456' },
        { name: 'accessToken', label: 'Access Token', type: 'password', required: true, placeholder: 'Your WhatsApp Business API token' },
        { name: 'verifyToken', label: 'Verify Token', type: 'password', required: true, placeholder: 'Webhook verification token' },
      ],
    },
    {
      id: 'twilio',
      name: 'Twilio',
      description: 'Send SMS, make calls, and automate customer communications with Twilio.',
      category: 'communication',
      icon: '📱',
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/twilio.svg',
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
      logoUrl: 'https://cdn.cdnlogo.com/logos/s/47/slack.svg',
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
      logoUrl: 'https://cdn.cdnlogo.com/logos/z/53/zoom.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/microsoft-teams-1.svg',
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
      logoUrl: 'https://cdn.cdnlogo.com/logos/g/24/gmail-icon.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/mailchimp-freddie-icon.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/sendgrid-1.svg',
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
      logoUrl: 'https://cdn.cdnlogo.com/logos/z/4/zapier-icon.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/n8n.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/make-4.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/manychat-1.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/typeform-1.svg',
      color: 'from-blue-500 to-cyan-500',
      connected: false,
      features: ['Auto-create contacts', 'Custom field mapping', 'Real-time sync', 'Form analytics'],
      configFields: [
        { name: 'apiToken', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'tfp_...' },
        { name: 'formId', label: 'Form ID', type: 'text', required: true, placeholder: 'aBcDeF12' },
      ],
    },
    {
      id: 'google-forms',
      name: 'Google Forms',
      description: 'Capture leads and create contacts from Google Forms submissions.',
      category: 'forms',
      icon: '📋',
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/google-forms.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/jotform-icon.svg',
      color: 'from-orange-500 to-amber-500',
      connected: false,
      features: ['Form sync', 'Lead creation', 'Custom fields', 'Webhooks'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true },
        { name: 'formId', label: 'Form ID', type: 'text', required: true },
      ],
    },

    // Scheduling
    {
      id: 'calendly',
      name: 'Calendly',
      description: 'Sync appointments, create contacts from bookings, and track meeting outcomes.',
      category: 'scheduling',
      icon: '📅',
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/calendly-1.svg',
      color: 'from-blue-500 to-cyan-600',
      connected: false,
      features: ['Appointment sync', 'Auto-create contacts', 'Meeting tracking', 'Calendar integration'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Your Calendly API token' },
        { name: 'webhookUrl', label: 'Webhook URL', type: 'url', required: false },
      ],
    },
    {
      id: 'cal-com',
      name: 'Cal.com',
      description: 'Open-source scheduling with automatic contact creation and meeting sync.',
      category: 'scheduling',
      icon: '🗓️',
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/cal.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/stripe-4.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/paypal-2.svg',
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
      logoUrl: 'https://cdn.cdnlogo.com/logos/s/72/smartbill.svg',
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
      logoUrl: 'https://cdn.cdnlogo.com/logos/o/31/oblio.svg',
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
      logoUrl: 'https://cdn.cdnlogo.com/logos/f/23/fgo.svg',
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
      id: 'payfunnels',
      name: 'PayFunnels',
      description: 'Payment and funnel management platform for online businesses and sales funnels.',
      category: 'payments',
      icon: '💸',
      logoUrl: 'https://cdn.cdnlogo.com/logos/p/84/payfunnels.svg',
      color: 'from-purple-500 to-pink-600',
      connected: false,
      features: ['Funnel tracking', 'Payment processing', 'Conversion optimization', 'A/B testing'],
      configFields: [
        { name: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'Your PayFunnels API key' },
        { name: 'accountId', label: 'Account ID', type: 'text', required: true, placeholder: 'Your account ID' },
        { name: 'webhookUrl', label: 'Webhook URL', type: 'url', required: false, placeholder: 'https://your-domain.com/webhook' },
      ],
    },

    // Social Media
    {
      id: 'facebook',
      name: 'Facebook',
      description: 'Sync leads from Facebook Lead Ads and track social interactions.',
      category: 'social',
      icon: '👥',
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/facebook-3.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/instagram-2016.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/linkedin-icon-2.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/shopify.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/woocommerce.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/google-analytics-4.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/mixpanel.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/intercom-1.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/zendesk-1.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/notion-2.svg',
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
      logoUrl: 'https://cdn.worldvectorlogo.com/logos/airtable-1.svg',
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
          const typeKey = int.type.toLowerCase();
          connectedMap[typeKey] = int;
        });

        setConnectedIntegrations(connectedMap);

        // Map backend integrations to frontend format
        const formattedIntegrations = available.map((int: any) => ({
          id: int.type.toLowerCase(),
          name: int.name,
          description: int.description,
          icon: int.icon,
          category: int.category.toLowerCase(),
          connected: !!connectedMap[int.type.toLowerCase()],
          oauth: int.defaultAuthType === 'oauth2',
          oauthProvider: int.type.toLowerCase(),
          features: int.features || [], // Add features with fallback to empty array
          configFields: int.defaultAuthType === 'api_key' ? [
            {
              name: 'apiKey',
              label: 'API Key',
              type: 'text',
              required: true,
            }
          ] : undefined,
        }));

        setIntegrations(formattedIntegrations);
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
    if (integration.connected) {
      setManagingIntegration(integration);
      return;
    }

    // For OAuth integrations, redirect to integration OAuth flow
    if (integration.oauth) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
      const provider = integration.oauthProvider || integration.id;

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

        // Redirect to OAuth endpoint with workspace and user context
        window.location.href = `${apiUrl}/integrations/oauth/${provider}?workspace_id=${workspaceId}&user_id=${userId}`;
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
    if (!connectedIntegrations[integration.id]) return;

    setIsSubmitting(true);
    setModalError('');

    try {
      const response = await api.post(`/integrations/${connectedIntegrations[integration.id].id}/test`);

      if (response.data.success) {
        alert('Connection test successful!');
      } else {
        setModalError(response.data.message || 'Connection test failed');
      }
    } catch (err: any) {
      console.error('Failed to test connection:', err);
      setModalError(err.response?.data?.message || 'Failed to test connection');
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
      await api.post('/integrations/install', {
        type: selectedIntegration.id,
        config: configData,
      });

      // Update the integration status locally
      const updatedIntegrations = integrations.map(int =>
        int.id === selectedIntegration.id ? { ...int, connected: true } : int
      );
      setIntegrations(updatedIntegrations);

      handleCloseModal();
    } catch (err: any) {
      console.error('Failed to connect integration:', err);
      setModalError(err.response?.data?.message || 'Failed to connect integration');
    } finally {
      setIsSubmitting(false);
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
                  <Image
                    src={integration.logoUrl}
                    alt={`${integration.name} logo`}
                    width={48}
                    height={48}
                    className="object-contain"
                  />
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
              <button className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all">
                View Documentation
                <ExternalLink className="h-4 w-4" />
              </button>
              <button className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all">
                Create Webhook
              </button>
            </div>
          </div>
        </div>
      </div>

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
                <Image
                  src={selectedIntegration.logoUrl}
                  alt={`${selectedIntegration.name} logo`}
                  width={48}
                  height={48}
                  className="object-contain"
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

            {/* Configuration Form */}
            <form onSubmit={handleSubmitConfig} className="space-y-6">
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
                <Image
                  src={managingIntegration.logoUrl}
                  alt={`${managingIntegration.name} logo`}
                  width={48}
                  height={48}
                  className="object-contain"
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