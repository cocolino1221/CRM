import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bot, Play, Pause, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react-native';
import api from '../lib/api';

type WorkflowStatus = 'active' | 'paused' | 'draft' | 'error';
type WorkflowTriggerType =
  | 'contact.created'
  | 'contact.updated'
  | 'deal.created'
  | 'deal.updated'
  | 'deal.won'
  | 'deal.lost'
  | 'task.created'
  | 'task.completed'
  | 'form.submitted'
  | 'email.received'
  | 'payment.received'
  | 'whatsapp.message.received'
  | 'whatsapp.button.clicked'
  | 'webhook'
  | 'schedule';
type WorkflowActionType =
  | 'send_whatsapp'
  | 'send_email'
  | 'create_task'
  | 'update_deal_stage'
  | 'send_webhook'
  | 'wait';

interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  config: Record<string, any>;
  condition?: {
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'not_equals';
    value: string;
  };
}

interface WorkflowItem {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  triggerType: WorkflowTriggerType;
  actions: WorkflowAction[];
  executionCount?: number;
  lastExecutedAt?: string;
  updatedAt?: string;
}

const TRIGGER_OPTIONS: Array<{ value: WorkflowTriggerType; label: string }> = [
  { value: 'whatsapp.message.received', label: 'WhatsApp Message Received' },
  { value: 'whatsapp.button.clicked', label: 'WhatsApp Button Clicked' },
  { value: 'payment.received', label: 'Payment Updated' },
  { value: 'contact.created', label: 'New Contact Created' },
  { value: 'contact.updated', label: 'Contact Updated' },
  { value: 'deal.created', label: 'New Deal Created' },
  { value: 'deal.updated', label: 'Deal Updated' },
  { value: 'deal.won', label: 'Deal Won' },
  { value: 'deal.lost', label: 'Deal Lost' },
  { value: 'task.created', label: 'Task Created' },
  { value: 'task.completed', label: 'Task Completed' },
  { value: 'form.submitted', label: 'Form Submitted' },
  { value: 'email.received', label: 'Email Received' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'schedule', label: 'Scheduled (Cron)' },
];

const ACTION_OPTIONS: Array<{ value: WorkflowActionType; label: string }> = [
  { value: 'send_whatsapp', label: 'Send WhatsApp' },
  { value: 'send_email', label: 'Send Email' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'update_deal_stage', label: 'Move Deal Stage' },
  { value: 'send_webhook', label: 'Send Webhook' },
  { value: 'wait', label: 'Wait / Delay' },
];

const DEAL_STAGES = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
];

function statusBadge(status: WorkflowStatus): { bg: string; text: string } {
  if (status === 'active') return { bg: '#dcfce7', text: '#166534' };
  if (status === 'paused') return { bg: '#fef3c7', text: '#92400e' };
  if (status === 'error') return { bg: '#fee2e2', text: '#b91c1c' };
  return { bg: '#e2e8f0', text: '#475569' };
}

function formatDate(value?: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function defaultConfigForAction(type: WorkflowActionType): Record<string, any> {
  if (type === 'send_whatsapp') return { to: '', message: '' };
  if (type === 'send_email') return { to: '', subject: '', body: '' };
  if (type === 'create_task') return { title: '', description: '', priority: 'medium' };
  if (type === 'update_deal_stage') return { stage: 'closed_won' };
  if (type === 'send_webhook') return { url: '', method: 'POST' };
  if (type === 'wait') return { duration: 60 };
  return {};
}

function buildAction(id: string, type: WorkflowActionType = 'send_whatsapp'): WorkflowAction {
  return {
    id,
    type,
    config: defaultConfigForAction(type),
  };
}

function triggerLabel(value: string): string {
  return TRIGGER_OPTIONS.find((item) => item.value === value)?.label || value;
}

export default function AutomationsScreen() {
  const insets = useSafeAreaInsets();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>('whatsapp.message.received');
  const [actions, setActions] = useState<WorkflowAction[]>([buildAction('1')]);

  const activeCount = useMemo(() => workflows.filter((workflow) => workflow.status === 'active').length, [workflows]);
  const totalExecutions = useMemo(
    () => workflows.reduce((sum, workflow) => sum + Number(workflow.executionCount || 0), 0),
    [workflows],
  );

  const loadWorkflows = useCallback(async () => {
    try {
      setFetchError('');
      const response = await api.get('/workflows');
      setWorkflows(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      setFetchError(error?.response?.data?.message || 'Failed to load workflows');
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    loadWorkflows().finally(() => setIsLoading(false));
  }, [loadWorkflows]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadWorkflows();
    setIsRefreshing(false);
  }, [loadWorkflows]);

  const resetForm = () => {
    setEditingWorkflowId(null);
    setWorkflowName('');
    setWorkflowDescription('');
    setTriggerType('whatsapp.message.received');
    setActions([buildAction('1')]);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (workflow: WorkflowItem) => {
    setEditingWorkflowId(workflow.id);
    setWorkflowName(workflow.name || '');
    setWorkflowDescription(workflow.description || '');
    setTriggerType(workflow.triggerType || 'whatsapp.message.received');
    const parsedActions = Array.isArray(workflow.actions) && workflow.actions.length
      ? workflow.actions.map((action, index) => ({
          id: String(action.id || index + 1),
          type: action.type || 'send_whatsapp',
          config: action.config || defaultConfigForAction(action.type || 'send_whatsapp'),
          ...(action.condition ? { condition: action.condition } : {}),
        }))
      : [buildAction('1')];
    setActions(parsedActions);
    setShowModal(true);
  };

  const addAction = () => {
    const nextId = String(actions.length + 1);
    setActions((prev) => [...prev, buildAction(nextId)]);
  };

  const removeAction = (id: string) => {
    setActions((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  };

  const updateActionType = (id: string, type: WorkflowActionType) => {
    setActions((prev) => prev.map((action) => (
      action.id === id
        ? { ...action, type, config: defaultConfigForAction(type) }
        : action
    )));
  };

  const updateActionConfig = (id: string, key: string, value: any) => {
    setActions((prev) => prev.map((action) => (
      action.id === id
        ? { ...action, config: { ...(action.config || {}), [key]: value } }
        : action
    )));
  };

  const toggleWorkflowStatus = async (workflow: WorkflowItem) => {
    const nextStatus: WorkflowStatus = workflow.status === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`/workflows/${workflow.id}`, { status: nextStatus });
      await loadWorkflows();
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to update workflow status');
    }
  };

  const deleteWorkflow = (workflow: WorkflowItem) => {
    Alert.alert(
      'Delete workflow',
      `Delete "${workflow.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/workflows/${workflow.id}`);
              await loadWorkflows();
            } catch (error: any) {
              Alert.alert('Error', error?.response?.data?.message || 'Failed to delete workflow');
            }
          },
        },
      ],
    );
  };

  const validateActions = (): string | null => {
    for (const action of actions) {
      if (action.type === 'send_whatsapp' && !String(action.config?.message || '').trim()) {
        return 'Send WhatsApp action needs a message.';
      }
      if (action.type === 'send_email' && !String(action.config?.subject || '').trim()) {
        return 'Send Email action needs a subject.';
      }
      if (action.type === 'send_webhook' && !String(action.config?.url || '').trim()) {
        return 'Send Webhook action needs a URL.';
      }
      if (action.type === 'create_task' && !String(action.config?.title || '').trim()) {
        return 'Create Task action needs a title.';
      }
    }
    return null;
  };

  const saveWorkflow = async () => {
    const name = workflowName.trim();
    if (!name) {
      Alert.alert('Validation', 'Workflow name is required.');
      return;
    }

    const validationError = validateActions();
    if (validationError) {
      Alert.alert('Validation', validationError);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name,
        description: workflowDescription.trim(),
        triggerType,
        status: 'draft',
        actions: actions.map((action, index) => ({
          id: String(action.id || index + 1),
          type: action.type,
          config: action.config || {},
          ...(action.condition ? { condition: action.condition } : {}),
        })),
      };

      if (editingWorkflowId) {
        await api.patch(`/workflows/${editingWorkflowId}`, payload);
      } else {
        await api.post('/workflows', payload);
      }

      setShowModal(false);
      resetForm();
      await loadWorkflows();
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.message || 'Failed to save workflow');
    } finally {
      setIsSaving(false);
    }
  };

  const renderWorkflow = ({ item }: { item: WorkflowItem }) => {
    const badge = statusBadge(item.status);
    return (
      <View className="bg-white rounded-2xl p-4 border border-slate-200 mb-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-bold text-slate-900">{item.name}</Text>
            <Text className="text-xs text-slate-500 mt-0.5">{triggerLabel(item.triggerType)}</Text>
          </View>
          <View style={{ backgroundColor: badge.bg }} className="px-2.5 py-1 rounded-full">
            <Text style={{ color: badge.text }} className="text-[11px] font-semibold uppercase">
              {item.status}
            </Text>
          </View>
        </View>

        {item.description ? (
          <Text className="text-sm text-slate-600 mt-2">{item.description}</Text>
        ) : null}

        <View className="flex-row items-center justify-between mt-3">
          <Text className="text-xs text-slate-500">Actions: {item.actions?.length || 0}</Text>
          <Text className="text-xs text-slate-500">Executions: {item.executionCount || 0}</Text>
        </View>
        <Text className="text-[11px] text-slate-400 mt-1">
          Last run: {formatDate(item.lastExecutedAt || item.updatedAt)}
        </Text>

        <View className="flex-row gap-2 mt-3">
          <TouchableOpacity
            onPress={() => openEdit(item)}
            className="flex-1 bg-slate-800 rounded-xl py-2.5 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-white text-sm font-semibold">Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleWorkflowStatus(item)}
            className="px-3 rounded-xl border border-slate-300 justify-center"
            activeOpacity={0.8}
          >
            {item.status === 'active' ? <Pause size={16} color="#334155" /> : <Play size={16} color="#334155" />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => deleteWorkflow(item)}
            className="px-3 rounded-xl border border-rose-300 justify-center"
            activeOpacity={0.8}
          >
            <Trash2 size={16} color="#be123c" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pb-4 bg-slate-700" style={{ paddingTop: insets.top + 10 }}>
        <Text className="text-[11px] uppercase tracking-widest text-slate-300">Flows</Text>
        <Text className="text-2xl font-extrabold text-white">Automations</Text>
        <Text className="text-xs text-slate-200 mt-1">
          Active: {activeCount} · Total executions: {totalExecutions}
        </Text>
        <View className="flex-row gap-2 mt-3">
          <TouchableOpacity
            onPress={openCreate}
            className="bg-emerald-500 rounded-xl px-4 py-2.5 flex-row items-center gap-2"
            activeOpacity={0.85}
          >
            <Plus size={16} color="#ffffff" />
            <Text className="text-white text-sm font-semibold">New Flow</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={loadWorkflows}
            className="bg-slate-600 rounded-xl px-3 py-2.5 justify-center"
            activeOpacity={0.85}
          >
            <RefreshCw size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0f766e" />
          <Text className="text-slate-500 mt-2">Loading automations...</Text>
        </View>
      ) : fetchError ? (
        <View className="flex-1 px-4 pt-4">
          <View className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
            <Text className="text-rose-700 font-semibold">Could not load workflows</Text>
            <Text className="text-rose-600 text-sm mt-1">{fetchError}</Text>
            <TouchableOpacity onPress={loadWorkflows} className="mt-3 self-start bg-rose-600 rounded-lg px-3 py-2">
              <Text className="text-white text-xs font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={workflows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={(
            <View className="items-center justify-center py-20">
              <Bot size={40} color="#94a3b8" />
              <Text className="text-slate-700 font-semibold mt-3">No automations yet</Text>
              <Text className="text-slate-500 text-sm mt-1 text-center">
                Create your first flow and auto-reply to WhatsApp triggers.
              </Text>
            </View>
          )}
          renderItem={renderWorkflow}
        />
      )}

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[92%]">
            <View className="px-4 py-3 border-b border-slate-200 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-slate-900">
                {editingWorkflowId ? 'Edit Workflow' : 'Create Workflow'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)} className="p-2">
                <X size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView className="px-4 py-4" contentContainerStyle={{ paddingBottom: insets.bottom + 26 }}>
              <Text className="text-xs font-semibold text-slate-700 mb-1">Workflow Name *</Text>
              <TextInput
                value={workflowName}
                onChangeText={setWorkflowName}
                placeholder="e.g. WA Auto Reply Flow"
                className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                placeholderTextColor="#94a3b8"
              />

              <Text className="text-xs font-semibold text-slate-700 mb-1 mt-3">Description</Text>
              <TextInput
                value={workflowDescription}
                onChangeText={setWorkflowDescription}
                placeholder="What this automation does..."
                multiline
                numberOfLines={3}
                className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                placeholderTextColor="#94a3b8"
                textAlignVertical="top"
              />

              <Text className="text-xs font-semibold text-slate-700 mb-2 mt-3">Trigger *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2 pr-4">
                  {TRIGGER_OPTIONS.map((option) => {
                    const selected = triggerType === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => setTriggerType(option.value)}
                        className={`rounded-full px-3 py-2 border ${selected ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}
                        activeOpacity={0.8}
                      >
                        <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-slate-700'}`}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text className="text-xs font-semibold text-slate-700 mb-2 mt-4">Actions</Text>
              <View className="gap-3">
                {actions.map((action, index) => (
                  <View key={action.id} className="border border-slate-200 rounded-2xl p-3">
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-xs font-bold text-slate-600">Action #{index + 1}</Text>
                      {actions.length > 1 ? (
                        <TouchableOpacity onPress={() => removeAction(action.id)} className="px-2 py-1 rounded-lg bg-rose-50">
                          <Text className="text-rose-600 text-xs font-semibold">Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row gap-2 pr-3 pb-1">
                        {ACTION_OPTIONS.map((option) => {
                          const selected = action.type === option.value;
                          return (
                            <TouchableOpacity
                              key={`${action.id}-${option.value}`}
                              onPress={() => updateActionType(action.id, option.value)}
                              className={`rounded-full px-3 py-2 border ${selected ? 'bg-slate-800 border-slate-800' : 'bg-white border-slate-300'}`}
                              activeOpacity={0.8}
                            >
                              <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-slate-700'}`}>
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>

                    {action.type === 'send_whatsapp' ? (
                      <View className="gap-2 mt-2">
                        <TextInput
                          value={String(action.config?.to || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'to', value)}
                          placeholder="Recipient phone (optional)"
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                        />
                        <TextInput
                          value={String(action.config?.message || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'message', value)}
                          placeholder="Message (supports variables like {{firstName}})"
                          multiline
                          numberOfLines={3}
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                          textAlignVertical="top"
                        />
                        <TextInput
                          value={String(action.config?.integrationId || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'integrationId', value)}
                          placeholder="Sender integration ID (optional)"
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    ) : null}

                    {action.type === 'send_email' ? (
                      <View className="gap-2 mt-2">
                        <TextInput
                          value={String(action.config?.to || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'to', value)}
                          placeholder="Recipient email (optional)"
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                        />
                        <TextInput
                          value={String(action.config?.subject || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'subject', value)}
                          placeholder="Email subject"
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                        />
                        <TextInput
                          value={String(action.config?.body || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'body', value)}
                          placeholder="Email body"
                          multiline
                          numberOfLines={3}
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                          textAlignVertical="top"
                        />
                      </View>
                    ) : null}

                    {action.type === 'create_task' ? (
                      <View className="gap-2 mt-2">
                        <TextInput
                          value={String(action.config?.title || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'title', value)}
                          placeholder="Task title"
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                        />
                        <TextInput
                          value={String(action.config?.description || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'description', value)}
                          placeholder="Task description"
                          multiline
                          numberOfLines={3}
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                          textAlignVertical="top"
                        />
                      </View>
                    ) : null}

                    {action.type === 'update_deal_stage' ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
                        <View className="flex-row gap-2 pr-3">
                          {DEAL_STAGES.map((stage) => {
                            const selected = String(action.config?.stage || 'closed_won') === stage.value;
                            return (
                              <TouchableOpacity
                                key={`${action.id}-${stage.value}`}
                                onPress={() => updateActionConfig(action.id, 'stage', stage.value)}
                                className={`rounded-full px-3 py-2 border ${selected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}
                                activeOpacity={0.8}
                              >
                                <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-slate-700'}`}>
                                  {stage.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    ) : null}

                    {action.type === 'send_webhook' ? (
                      <View className="gap-2 mt-2">
                        <TextInput
                          value={String(action.config?.url || '')}
                          onChangeText={(value) => updateActionConfig(action.id, 'url', value)}
                          placeholder="https://your-webhook-url"
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                          autoCapitalize="none"
                        />
                        <TextInput
                          value={String(action.config?.method || 'POST')}
                          onChangeText={(value) => updateActionConfig(action.id, 'method', value.toUpperCase())}
                          placeholder="POST"
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    ) : null}

                    {action.type === 'wait' ? (
                      <View className="gap-2 mt-2">
                        <Text className="text-xs text-slate-500">Delay (seconds)</Text>
                        <TextInput
                          value={String(action.config?.duration ?? 60)}
                          onChangeText={(value) => updateActionConfig(action.id, 'duration', Number(value.replace(/[^0-9]/g, '') || 0))}
                          keyboardType="numeric"
                          placeholder="60"
                          className="border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900"
                          placeholderTextColor="#94a3b8"
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>

              <TouchableOpacity
                onPress={addAction}
                className="mt-3 border border-dashed border-slate-400 rounded-xl py-2.5 items-center"
                activeOpacity={0.8}
              >
                <Text className="text-slate-700 text-sm font-semibold">+ Add Action</Text>
              </TouchableOpacity>

              <View className="flex-row gap-2 mt-5">
                <TouchableOpacity
                  onPress={() => setShowModal(false)}
                  className="flex-1 border border-slate-300 rounded-xl py-3 items-center"
                  activeOpacity={0.8}
                  disabled={isSaving}
                >
                  <Text className="text-slate-700 font-semibold">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveWorkflow}
                  className="flex-1 bg-emerald-600 rounded-xl py-3 items-center flex-row justify-center gap-2"
                  activeOpacity={0.8}
                  disabled={isSaving}
                >
                  {isSaving ? <ActivityIndicator size="small" color="#ffffff" /> : <Save size={16} color="#ffffff" />}
                  <Text className="text-white font-semibold">{editingWorkflowId ? 'Update' : 'Create'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

