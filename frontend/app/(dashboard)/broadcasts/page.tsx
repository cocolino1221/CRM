'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  Trash2,
  Upload,
  MessageCircle,
  Mail,
  Users,
  Calendar,
  RefreshCw,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaCampaign {
  id: string;
  name: string;
  templateName: string;
  language: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt: string | null;
  sentAt: string | null;
  stats: { total?: number; sent?: number; failed?: number };
  csvRecipients: Array<{ phone: string; firstName?: string }>;
  createdAt: string;
}

interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  scheduledAt: string | null;
  sentAt: string | null;
  stats: { total?: number; sent?: number; failed?: number };
  csvRecipients?: Array<{ email: string; name?: string }>;
  createdAt: string;
}

type Tab = 'whatsapp' | 'email';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  draft:     { label: 'Draft',     cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: <Clock className="h-3 w-3" /> },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: <Calendar className="h-3 w-3" /> },
  sending:   { label: 'Sending',   cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  sent:      { label: 'Sent',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: <CheckCircle className="h-3 w-3" /> },
  failed:    { label: 'Failed',    cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: <XCircle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.icon} {s.label}
    </span>
  );
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
}

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  });
}

// ─── Create WA Campaign Modal ─────────────────────────────────────────────────

function CreateWaCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [scheduledAt, setScheduledAt] = useState('');
  const [csvText, setCsvText] = useState('');
  const [parsedCount, setParsedCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setParsedCount(parseCSV(text).length);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Nome da campanha obrigatório'); return; }
    if (!templateName.trim()) { setError('Template name obrigatório'); return; }
    if (!csvText.trim()) { setError('Carrega um CSV com números de telefone'); return; }

    const rows = parseCSV(csvText);
    const csvRecipients = rows
      .map(r => ({
        phone: r.phone || r.telefone || r.number || r.whatsapp || '',
        firstName: r.firstname || r.first_name || r.nome || r.name || '',
        lastName: r.lastname || r.last_name || r.apelido || '',
      }))
      .filter(r => r.phone);

    if (!csvRecipients.length) {
      setError('Nenhum número encontrado. O CSV precisa ter uma coluna "phone", "telefone" ou "number".');
      return;
    }

    setLoading(true);
    try {
      await api.post('/integrations/whatsapp/bulk-campaigns', {
        name: name.trim(),
        templateName: templateName.trim(),
        language,
        csvRecipients,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao criar campanha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Nova Campanha WhatsApp</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da campanha</label>
            <input
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: Promoção Maio 2025"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template name</label>
              <input
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="hello_world"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Idioma</label>
              <select
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={language}
                onChange={e => setLanguage(e.target.value)}
              >
                <option value="pt_BR">Português (BR)</option>
                <option value="pt_PT">Português (PT)</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="ro">Română</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CSV de destinatários
            </label>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Colunas aceites: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">phone</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">firstname</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">lastname</code>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 py-4 text-sm text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600 transition-colors"
            >
              <Upload className="h-4 w-4" />
              {parsedCount > 0 ? `${parsedCount} contactos carregados` : 'Clique para carregar CSV'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Agendar envio (opcional)
            </label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Deixa vazio para criar como rascunho e enviar manualmente
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar campanha
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Email Campaign Modal ──────────────────────────────────────────────

function CreateEmailCampaignModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [csvText, setCsvText] = useState('');
  const [parsedCount, setParsedCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setParsedCount(parseCSV(text).length);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) { setError('Nome da campanha obrigatório'); return; }
    if (!subject.trim()) { setError('Assunto obrigatório'); return; }
    if (!htmlBody.trim()) { setError('Corpo do email obrigatório'); return; }

    let csvRecipients: Array<{ email: string; name?: string }> | undefined;
    if (csvText.trim()) {
      const rows = parseCSV(csvText);
      csvRecipients = rows
        .map(r => ({
          email: r.email || r['e-mail'] || r.mail || '',
          name: r.name || r.nome || r.firstname || r.first_name || '',
        }))
        .filter(r => r.email);

      if (!csvRecipients.length) {
        setError('Nenhum email encontrado. O CSV precisa ter uma coluna "email".');
        return;
      }
    }

    setLoading(true);
    try {
      await api.post('/email-campaigns', {
        name: name.trim(),
        subject: subject.trim(),
        htmlBody: htmlBody.trim(),
        csvRecipients: csvRecipients || [],
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao criar campanha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Nova Campanha Email</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da campanha</label>
            <input
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Newsletter Maio"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assunto do email</label>
            <input
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: Oferta especial para você!"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Corpo do email (HTML)</label>
            <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Podes usar <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{name}}'}</code> e <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{email}}'}</code></div>
            <textarea
              rows={5}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="<p>Olá {{name}},...</p>"
              value={htmlBody}
              onChange={e => setHtmlBody(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CSV de destinatários (opcional)
            </label>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Se não carregares CSV, a campanha usa os contactos do CRM com os filtros que definires depois.
              Colunas aceites: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">email</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">name</code>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 py-4 text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              <Upload className="h-4 w-4" />
              {parsedCount > 0 ? `${parsedCount} emails carregados` : 'Clique para carregar CSV (opcional)'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Agendar envio (opcional)
            </label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar campanha
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WA Campaign Row ──────────────────────────────────────────────────────────

function WaCampaignRow({
  campaign,
  onRefresh,
}: {
  campaign: WaCampaign;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    try {
      await api.post(`/integrations/whatsapp/bulk-campaigns/${campaign.id}/send`);
      onRefresh();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Eliminar campanha "${campaign.name}"?`)) return;
    try {
      await api.delete(`/integrations/whatsapp/bulk-campaigns/${campaign.id}`);
      onRefresh();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao eliminar');
    }
  };

  const canSend = campaign.status === 'draft' || campaign.status === 'failed';

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{campaign.name}</span>
          <StatusBadge status={campaign.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            {campaign.templateName}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {campaign.csvRecipients?.length || 0} destinatários
          </span>
          {campaign.scheduledAt && campaign.status === 'scheduled' && (
            <span className="flex items-center gap-1 text-blue-500">
              <Calendar className="h-3 w-3" />
              {fmtDate(campaign.scheduledAt)}
            </span>
          )}
          {campaign.sentAt && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-3 w-3" />
              {campaign.stats.sent}/{campaign.stats.total} enviados
            </span>
          )}
          {campaign.stats.failed != null && campaign.stats.failed > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="h-3 w-3" />
              {campaign.stats.failed} falharam
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        {canSend && (
          <button
            onClick={handleSend}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Trimite acum
          </button>
        )}
        <button
          onClick={handleDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Email Campaign Row ───────────────────────────────────────────────────────

function EmailCampaignRow({
  campaign,
  onRefresh,
}: {
  campaign: EmailCampaign;
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    try {
      await api.post(`/email-campaigns/${campaign.id}/send`);
      onRefresh();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao enviar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Eliminar campanha "${campaign.name}"?`)) return;
    try {
      await api.delete(`/email-campaigns/${campaign.id}`);
      onRefresh();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao eliminar');
    }
  };

  const canSend = campaign.status === 'draft' || campaign.status === 'failed';
  const recipientCount = campaign.csvRecipients?.length || 0;

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{campaign.name}</span>
          <StatusBadge status={campaign.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {campaign.subject}
          </span>
          {recipientCount > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {recipientCount} destinatários CSV
            </span>
          )}
          {campaign.scheduledAt && campaign.status === 'scheduled' && (
            <span className="flex items-center gap-1 text-blue-500">
              <Calendar className="h-3 w-3" />
              {fmtDate(campaign.scheduledAt)}
            </span>
          )}
          {campaign.sentAt && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-3 w-3" />
              {campaign.stats.sent}/{campaign.stats.total} enviados
            </span>
          )}
          {campaign.stats?.failed != null && campaign.stats.failed > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="h-3 w-3" />
              {campaign.stats.failed} falharam
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        {canSend && (
          <button
            onClick={handleSend}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Trimite acum
          </button>
        )}
        <button
          onClick={handleDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BroadcastsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('whatsapp');
  const [waCampaigns, setWaCampaigns] = useState<WaCampaign[]>([]);
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateWa, setShowCreateWa] = useState(false);
  const [showCreateEmail, setShowCreateEmail] = useState(false);

  const fetchWaCampaigns = async () => {
    try {
      const res = await api.get('/integrations/whatsapp/bulk-campaigns');
      setWaCampaigns(res.data || []);
    } catch {
      // ignore
    }
  };

  const fetchEmailCampaigns = async () => {
    try {
      const res = await api.get('/email-campaigns');
      setEmailCampaigns(res.data || []);
    } catch {
      // ignore
    }
  };

  const refresh = async () => {
    setLoading(true);
    await Promise.all([fetchWaCampaigns(), fetchEmailCampaigns()]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // Auto-refresh every 15s when any campaign is sending
    const interval = setInterval(() => {
      const hasSending =
        waCampaigns.some(c => c.status === 'sending') ||
        emailCampaigns.some(c => c.status === 'sending');
      if (hasSending) refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const csvInfoBox = (type: 'whatsapp' | 'email') => (
    <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Formato CSV {type === 'whatsapp' ? 'WhatsApp' : 'Email'}</p>
      {type === 'whatsapp' ? (
        <pre className="text-xs bg-gray-50 dark:bg-gray-700 rounded-lg p-2 overflow-x-auto">phone,firstname,lastname{'\n'}351912345678,João,Silva{'\n'}351968765432,Maria,Santos</pre>
      ) : (
        <pre className="text-xs bg-gray-50 dark:bg-gray-700 rounded-lg p-2 overflow-x-auto">email,name{'\n'}joao@exemplo.com,João Silva{'\n'}maria@exemplo.com,Maria Santos</pre>
      )}
      <p className="mt-2 text-xs">
        {type === 'whatsapp'
          ? 'Os contactos NÃO são criados no CRM. São enviados diretamente para o template aprovado no Meta.'
          : 'Os contactos NÃO são criados no CRM. Se não deres CSV, usa os filtros do CRM.'}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Broadcasts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Envio em massa por WhatsApp e Email, com suporte a CSV e agendamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => activeTab === 'whatsapp' ? setShowCreateWa(true) : setShowCreateEmail(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
              activeTab === 'whatsapp' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Plus className="h-4 w-4" />
            Nova campanha
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'WA Campanhas', value: waCampaigns.length, icon: MessageCircle, color: 'text-green-500' },
          { label: 'WA Enviadas', value: waCampaigns.filter(c => c.status === 'sent').length, icon: CheckCircle, color: 'text-green-600' },
          { label: 'Email Campanhas', value: emailCampaigns.length, icon: Mail, color: 'text-blue-500' },
          { label: 'Email Enviadas', value: emailCampaigns.filter(c => c.status === 'sent').length, icon: CheckCircle, color: 'text-blue-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</span>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['whatsapp', 'email'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? tab === 'whatsapp'
                    ? 'border-green-500 text-green-600 dark:text-green-400'
                    : 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              {tab === 'whatsapp' ? 'WhatsApp' : 'Email'}
              <span className="ml-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-1.5 py-0.5 rounded-full">
                {tab === 'whatsapp' ? waCampaigns.length : emailCampaigns.length}
              </span>
            </button>
          ))}
        </div>

        <div className="p-6 space-y-3">
          {activeTab === 'whatsapp' && (
            <>
              {waCampaigns.length === 0 ? (
                <div className="space-y-4">
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Nenhuma campanha WhatsApp ainda</p>
                    <p className="text-sm mt-1">Cria uma campanha para enviar templates aprovados a uma lista CSV</p>
                    <button
                      onClick={() => setShowCreateWa(true)}
                      className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm mx-auto hover:bg-green-700"
                    >
                      <Plus className="h-4 w-4" /> Nova campanha WhatsApp
                    </button>
                  </div>
                  {csvInfoBox('whatsapp')}
                </div>
              ) : (
                <>
                  {waCampaigns.map(c => (
                    <WaCampaignRow key={c.id} campaign={c} onRefresh={refresh} />
                  ))}
                  <div className="pt-2">{csvInfoBox('whatsapp')}</div>
                </>
              )}
            </>
          )}

          {activeTab === 'email' && (
            <>
              {emailCampaigns.length === 0 ? (
                <div className="space-y-4">
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                    <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Nenhuma campanha email ainda</p>
                    <p className="text-sm mt-1">Cria uma campanha para enviar emails a uma lista CSV ou contactos do CRM</p>
                    <button
                      onClick={() => setShowCreateEmail(true)}
                      className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm mx-auto hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4" /> Nova campanha Email
                    </button>
                  </div>
                  {csvInfoBox('email')}
                </div>
              ) : (
                <>
                  {emailCampaigns.map(c => (
                    <EmailCampaignRow key={c.id} campaign={c} onRefresh={refresh} />
                  ))}
                  <div className="pt-2">{csvInfoBox('email')}</div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showCreateWa && (
        <CreateWaCampaignModal
          onClose={() => setShowCreateWa(false)}
          onCreated={() => { fetchWaCampaigns(); }}
        />
      )}
      {showCreateEmail && (
        <CreateEmailCampaignModal
          onClose={() => setShowCreateEmail(false)}
          onCreated={() => { fetchEmailCampaigns(); }}
        />
      )}
    </div>
  );
}
