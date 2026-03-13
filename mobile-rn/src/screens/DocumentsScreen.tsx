import { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, ExternalLink, WifiOff, RefreshCw } from 'lucide-react-native';
import { useDocumentsStore } from '../stores/documents-store';
import type { Document } from '../types';

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function getStatusChip(status?: string): { bg: string; text: string } {
  const key = String(status || '').toLowerCase();
  if (['signed', 'completed'].includes(key)) return { bg: '#dcfce7', text: '#166534' };
  if (['sent', 'viewed', 'pending'].includes(key)) return { bg: '#dbeafe', text: '#1d4ed8' };
  if (['declined', 'voided', 'expired'].includes(key)) return { bg: '#fee2e2', text: '#b91c1c' };
  return { bg: '#e2e8f0', text: '#334155' };
}

function getPaymentChip(status?: string): { bg: string; text: string } {
  const key = String(status || '').toLowerCase();
  if (key === 'paid') return { bg: '#dcfce7', text: '#166534' };
  if (key === 'failed') return { bg: '#fee2e2', text: '#b91c1c' };
  if (key === 'pending') return { bg: '#fef3c7', text: '#92400e' };
  if (key === 'awaiting_signature') return { bg: '#dbeafe', text: '#1d4ed8' };
  return { bg: '#e2e8f0', text: '#475569' };
}

async function openExternalUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    // no-op
  }
}

export default function DocumentsScreen() {
  const { documents, isLoading, fetchError, fetchDocuments } = useDocumentsStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const onRefresh = useCallback(() => {
    fetchDocuments();
  }, []);

  const renderItem = ({ item }: { item: Document }) => {
    const statusChip = getStatusChip(item.status);
    const paymentStatus = item.metadata?.payment?.status;
    const paymentChip = getPaymentChip(paymentStatus);
    const recipient = item.recipients?.[0]?.email || '-';
    const signUrl = String(item.signingUrl || '').trim();
    const paymentUrl = String(item.metadata?.payment?.paymentLink || '').trim();

    return (
      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-2.5">
        <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>{item.name}</Text>
        <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{recipient}</Text>

        <View className="flex-row items-center gap-2 mt-2.5">
          <View className="px-2 py-1 rounded-full" style={{ backgroundColor: statusChip.bg }}>
            <Text className="text-[10px] font-semibold" style={{ color: statusChip.text }}>{item.status}</Text>
          </View>
          <View className="px-2 py-1 rounded-full" style={{ backgroundColor: paymentChip.bg }}>
            <Text className="text-[10px] font-semibold" style={{ color: paymentChip.text }}>{paymentStatus || 'n/a'}</Text>
          </View>
          <Text className="text-[11px] text-slate-400 ml-auto">{formatDate(item.createdAt)}</Text>
        </View>

        {item.metadata?.payment?.failureReason && (
          <Text className="text-xs text-rose-600 mt-2" numberOfLines={2}>{item.metadata.payment.failureReason}</Text>
        )}

        {(signUrl || paymentUrl) && (
          <View className="flex-row gap-2 mt-3">
            {signUrl ? (
              <TouchableOpacity
                onPress={() => openExternalUrl(signUrl)}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50"
              >
                <ExternalLink size={14} color="#047857" />
                <Text className="text-xs font-semibold text-emerald-700">Sign Link</Text>
              </TouchableOpacity>
            ) : null}
            {paymentUrl ? (
              <TouchableOpacity
                onPress={() => openExternalUrl(paymentUrl)}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50"
              >
                <ExternalLink size={14} color="#4338ca" />
                <Text className="text-xs font-semibold text-indigo-700">Payment Link</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pb-4 bg-slate-700" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-slate-300">Contracts</Text>
            <Text className="text-2xl font-extrabold text-white">Documents</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{documents.length} total</Text>
          </View>
        </View>
      </View>

      {fetchError && !isLoading && (
        <View className="mx-3 mt-3 flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
          <WifiOff size={20} color="#f87171" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-rose-700">Connection error</Text>
            <Text className="text-xs text-rose-500 mt-0.5" numberOfLines={1}>{fetchError}</Text>
          </View>
          <TouchableOpacity onPress={fetchDocuments} className="p-2 rounded-lg bg-rose-100">
            <RefreshCw size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={documents}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#475569" />}
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-20">
              <View className="h-14 w-14 rounded-2xl bg-white border border-slate-200 items-center justify-center">
                <FileText size={28} color="#94a3b8" />
              </View>
              <Text className="text-sm font-medium text-slate-500 mt-3">No documents</Text>
              <Text className="text-xs text-slate-400 mt-1">Documentele vor aparea aici.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
