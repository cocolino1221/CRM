'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Radio,
  RefreshCw,
  Plus,
  ExternalLink,
  Trash2,
  LoaderCircle,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  Facebook,
  Instagram,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

type ChannelKind = 'messenger' | 'instagram' | 'whatsapp';

interface ChannelCard {
  id: string;
  kind: ChannelKind;
  name: string;
  subtitle?: string | null;
  live: boolean;
  warning?: string | null;
  status?: string | null;
}

const KIND_META: Record<
  ChannelKind,
  { label: string; icon: typeof MessageCircle; accent: string; inboxHref: string; inboxLabel: string }
> = {
  messenger: {
    label: 'Messenger',
    icon: Facebook,
    accent: 'bg-blue-50 text-blue-600 ring-blue-100',
    inboxHref: '/meta-inbox',
    inboxLabel: 'Open inbox',
  },
  instagram: {
    label: 'Instagram',
    icon: Instagram,
    accent: 'bg-pink-50 text-pink-600 ring-pink-100',
    inboxHref: '/meta-inbox',
    inboxLabel: 'Open inbox',
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageCircle,
    accent: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    inboxHref: '/whatsapp',
    inboxLabel: 'Open inbox',
  },
};

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    setError('');
    if (refresh) setRefreshing(true);
    try {
      const [metaRes, waRes] = await Promise.allSettled([
        api.get('/integrations/meta-messaging/accounts', { params: refresh ? { refresh: 1 } : undefined }),
        api.get('/integrations/whatsapp/accounts'),
      ]);

      const cards: ChannelCard[] = [];

      if (metaRes.status === 'fulfilled' && Array.isArray(metaRes.value.data)) {
        for (const acc of metaRes.value.data) {
          const kind: ChannelKind = acc.provider === 'facebook' ? 'messenger' : 'instagram';
          cards.push({
            id: acc.integrationId,
            kind,
            name: acc.name || KIND_META[kind].label,
            subtitle: acc.account?.pageName || acc.account?.igUsername || null,
            live: !!acc.liveReady,
            warning: acc.warning || null,
            status: acc.status || null,
          });
        }
      }

      if (waRes.status === 'fulfilled' && Array.isArray(waRes.value.data?.data)) {
        for (const acc of waRes.value.data.data) {
          cards.push({
            id: acc.id,
            kind: 'whatsapp',
            name: acc.phoneDisplay || acc.name || 'WhatsApp',
            subtitle: acc.phoneDisplay && acc.name !== acc.phoneDisplay ? acc.name : null,
            live: !!acc.phoneNumberId,
            warning: acc.phoneNumberId ? null : 'Phone number not verified — reconnect this account.',
            status: acc.status || null,
          });
        }
      }

      setChannels(cards);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load channels');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const disconnect = useCallback(
    async (card: ChannelCard) => {
      if (!window.confirm(`Disconnect ${card.name}? Incoming messages from this account will stop.`)) return;
      setDisconnecting(card.id);
      setError('');
      try {
        await api.delete(`/integrations/${card.id}`);
        setChannels((prev) => prev.filter((c) => c.id !== card.id));
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Could not disconnect account');
      } finally {
        setDisconnecting(null);
      }
    },
    [],
  );

  const stats = useMemo(() => {
    const live = channels.filter((c) => c.live).length;
    return { total: channels.length, live, attention: channels.length - live };
  }, [channels]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white">
              <Radio className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-950">Channels</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Every connected messaging account and its live status in one place.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            Refresh
          </button>
          <Link
            href="/integrations"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Connect account
          </Link>
        </div>
      </div>

      {!loading && channels.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            {stats.total} connected
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {stats.live} live
          </span>
          {stats.attention > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {stats.attention} need attention
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-16 flex flex-col items-center justify-center gap-3 text-slate-400">
          <LoaderCircle className="h-6 w-6 animate-spin" />
          <span className="text-sm">Loading channels…</span>
        </div>
      ) : channels.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 ring-1 ring-slate-200">
            <Radio className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">No channels connected yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Connect a Facebook Page, Instagram account, or WhatsApp number to start receiving messages in your inbox.
          </p>
          <Link
            href="/integrations"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Connect your first account
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {channels.map((card) => {
            const meta = KIND_META[card.kind];
            const Icon = meta.icon;
            return (
              <div
                key={`${card.kind}:${card.id}`}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ring-1', meta.accent)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-950">{card.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {meta.label}
                        {card.subtitle ? ` · ${card.subtitle}` : ''}
                      </div>
                    </div>
                  </div>

                  {card.live ? (
                    <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
                    </span>
                  ) : (
                    <span
                      title={card.warning || 'Reconnect required'}
                      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" /> Needs reconnect
                    </span>
                  )}
                </div>

                {!card.live && card.warning && (
                  <p className="rounded-lg bg-amber-50/60 px-3 py-2 text-xs text-amber-700">{card.warning}</p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => router.push(meta.inboxHref)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {meta.inboxLabel}
                  </button>
                  {!card.live && (
                    <Link
                      href="/integrations"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reconnect
                    </Link>
                  )}
                  <button
                    onClick={() => void disconnect(card)}
                    disabled={disconnecting === card.id}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {disconnecting === card.id ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
