'use client';

import { useEffect, useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2, Plus, TrendingUp, DollarSign, Calendar, User, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface Deal {
  id: string;
  title: string;
  value: number;
  stage: string;
  contactName: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  probability?: number;
}

interface PipelineStageApi {
  stage: string;
  deals: Array<{
    id: string;
    title: string;
    value: number | string;
    probability?: number;
    contact?: { name?: string } | null;
    company?: { name?: string } | null;
    expectedCloseDate?: string | null;
  }>;
  totalValue: number;
}

interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  deals: Deal[];
  totalValue: number;
}

interface ContactPipeline {
  id: string;
  name: string;
  isDefault?: boolean;
  stages: ContactPipelineStage[];
}

interface ContactPipelineStage {
  id: string;
  name: string;
  color: string;
  displayOrder: number;
  isClosedWon?: boolean;
  isClosedLost?: boolean;
}

const STAGE_COLORS: Record<string, string> = {
  lead: 'bg-gray-100 border-gray-300',
  qualified: 'bg-blue-100 border-blue-300',
  proposal: 'bg-purple-100 border-purple-300',
  negotiation: 'bg-yellow-100 border-yellow-300',
  closed_won: 'bg-green-100 border-green-300',
  closed_lost: 'bg-red-100 border-red-300',
};

const STAGE_LABELS: Record<string, string> = {
  lead: 'New Leads',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [contactPipelines, setContactPipelines] = useState<ContactPipeline[]>([]);
  const [selectedContactPipelineId, setSelectedContactPipelineId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [newStatusName, setNewStatusName] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#6366F1');
  const [newStatusType, setNewStatusType] = useState<'normal' | 'won' | 'lost'>('normal');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    const initialize = async () => {
      await Promise.all([fetchPipelineData(), fetchContactPipelines()]);
    };
    initialize();
  }, []);

  const fetchPipelineData = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/deals/pipeline');
      const apiStages = Array.isArray(response.data?.pipeline) ? response.data.pipeline as PipelineStageApi[] : [];

      const fallbackDeals = Array.isArray(response.data?.deals)
        ? response.data.deals
        : (Array.isArray(response.data?.data) ? response.data.data : []);

      const stagesFromPipeline: PipelineStage[] = apiStages.map((stageData) => {
        const mappedDeals: Deal[] = (stageData.deals || []).map((deal) => ({
          id: deal.id,
          title: deal.title,
          value: Number(deal.value) || 0,
          stage: stageData.stage,
          contactName: deal.contact?.name || '',
          companyName: deal.company?.name || '',
          createdAt: deal.expectedCloseDate || new Date().toISOString(),
          updatedAt: deal.expectedCloseDate || new Date().toISOString(),
          probability: typeof deal.probability === 'number' ? deal.probability : undefined,
        }));

        const stageId = stageData.stage;
        return {
          id: stageId,
          name: STAGE_LABELS[stageId] || stageId.replace(/_/g, ' '),
          color: stageId,
          deals: mappedDeals,
          totalValue: mappedDeals.reduce((sum, deal) => sum + deal.value, 0),
        };
      });

      const stages = stagesFromPipeline.length > 0
        ? stagesFromPipeline
        : Object.keys(STAGE_LABELS).map((stageId) => {
          const dealsInStage: Deal[] = fallbackDeals
            .filter((deal: any) => deal?.stage === stageId)
            .map((deal: any) => ({
              id: String(deal.id),
              title: String(deal.title || ''),
              value: Number(deal.value) || 0,
              stage: String(deal.stage || stageId),
              contactName: deal.contactName || `${deal.contact?.firstName || ''} ${deal.contact?.lastName || ''}`.trim(),
              companyName: deal.companyName || deal.company?.name || '',
              createdAt: String(deal.createdAt || new Date().toISOString()),
              updatedAt: String(deal.updatedAt || deal.createdAt || new Date().toISOString()),
              probability: typeof deal.probability === 'number' ? deal.probability : undefined,
            }));

          return {
            id: stageId,
            name: STAGE_LABELS[stageId],
            color: stageId,
            deals: dealsInStage,
            totalValue: dealsInStage.reduce((sum, deal) => sum + deal.value, 0),
          };
        });

      setPipeline({
        id: 'main',
        name: 'Sales Pipeline',
        stages,
      });
    } catch (error) {
      console.error('Failed to fetch pipeline data:', error);
      setPipeline(null);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContactPipelines = async () => {
    try {
      const response = await api.get('/pipelines');
      const rows: ContactPipeline[] = Array.isArray(response.data) ? response.data : [];
      setContactPipelines(rows);
      if (rows.length === 0) {
        setSelectedContactPipelineId('');
        return;
      }

      setSelectedContactPipelineId((current) => {
        if (current && rows.some((pipelineRow) => pipelineRow.id === current)) {
          return current;
        }
        const defaultPipeline = rows.find((pipelineRow) => pipelineRow.isDefault);
        return defaultPipeline?.id || rows[0].id;
      });
    } catch (error) {
      console.error('Failed to fetch contact pipelines:', error);
      setContactPipelines([]);
      setSelectedContactPipelineId('');
    }
  };

  const handleAddPipelineStatus = async () => {
    const pipelineId = selectedContactPipelineId;
    const name = newStatusName.trim();
    if (!pipelineId) {
      setStatusError('Selecteaza un pipeline inainte sa adaugi status.');
      return;
    }
    if (!name) {
      setStatusError('Numele statusului este obligatoriu.');
      return;
    }

    setSavingStatus(true);
    setStatusError('');
    try {
      await api.post(`/pipelines/${pipelineId}/stages`, {
        name,
        color: newStatusColor,
        isClosedWon: newStatusType === 'won',
        isClosedLost: newStatusType === 'lost',
      });
      setNewStatusName('');
      setNewStatusType('normal');
      await fetchContactPipelines();
    } catch (error: any) {
      const rawMessage = error?.response?.data?.message;
      if (Array.isArray(rawMessage)) {
        setStatusError(rawMessage.join(', '));
      } else {
        setStatusError(rawMessage || 'Nu am putut adauga statusul.');
      }
    } finally {
      setSavingStatus(false);
    }
  };

  const handleAdvanceDeal = async (dealId: string, currentStageId: string) => {
    if (!pipeline) return;
    const stageIndex = pipeline.stages.findIndex(s => s.id === currentStageId);
    if (stageIndex === -1 || stageIndex >= pipeline.stages.length - 1) return;
    const nextStage = pipeline.stages[stageIndex + 1];

    const movingDeal = pipeline.stages.flatMap(s => s.deals).find(d => d.id === dealId);
    if (!movingDeal) return;

    const updatedStages = pipeline.stages.map(stage => {
      if (stage.id === currentStageId) {
        return { ...stage, deals: stage.deals.filter(d => d.id !== dealId), totalValue: stage.totalValue - movingDeal.value };
      }
      if (stage.id === nextStage.id) {
        return { ...stage, deals: [...stage.deals, { ...movingDeal, stage: nextStage.id }], totalValue: stage.totalValue + movingDeal.value };
      }
      return stage;
    });
    setPipeline({ ...pipeline, stages: updatedStages });

    try {
      await api.put(`/deals/${dealId}`, { stage: nextStage.id });
    } catch {
      setPipeline(pipeline);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dealId = event.active.id as string;
    const deal = pipeline?.stages
      .flatMap(stage => stage.deals)
      .find(d => d.id === dealId);
    setActiveDeal(deal || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);

    if (!over || !pipeline) return;

    const dealId = active.id as string;
    const newStageId = over.id as string;

    // Find the deal and its current stage
    let deal: Deal | undefined;
    let currentStage: PipelineStage | undefined;

    for (const stage of pipeline.stages) {
      deal = stage.deals.find(d => d.id === dealId);
      if (deal) {
        currentStage = stage;
        break;
      }
    }

    if (!deal || !currentStage || currentStage.id === newStageId) return;

    // Optimistically update UI
    const updatedStages = pipeline.stages.map(stage => {
      if (stage.id === currentStage.id) {
        return {
          ...stage,
          deals: stage.deals.filter(d => d.id !== dealId),
          totalValue: stage.totalValue - deal.value,
        };
      }
      if (stage.id === newStageId) {
        return {
          ...stage,
          deals: [...stage.deals, { ...deal, stage: newStageId }],
          totalValue: stage.totalValue + deal.value,
        };
      }
      return stage;
    });

    setPipeline({ ...pipeline, stages: updatedStages });

    // Update backend
    try {
      await api.put(`/deals/${dealId}`, { stage: newStageId });
    } catch (error) {
      console.error('Failed to update deal stage:', error);
      // Revert on error
      fetchPipelineData();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Failed to load pipeline data</p>
      </div>
    );
  }

  const totalPipelineValue = pipeline.stages.reduce((sum, stage) => sum + stage.totalValue, 0);
  const totalDeals = pipeline.stages.reduce((sum, stage) => sum + stage.deals.length, 0);
  const selectedContactPipeline = contactPipelines.find((row) => row.id === selectedContactPipelineId) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
            Sales Pipeline
          </h1>
          <p className="mt-2 text-gray-600">
            Drag and drop deals between stages to update their status
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus className="h-4 w-4" />
          New Deal
        </button>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-white p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Statusuri Pipeline</h2>
            <p className="text-sm text-gray-600">
              Adauga statusuri noi pentru pipeline-ul de lead-uri din CRM.
            </p>
          </div>
          <select
            value={selectedContactPipelineId}
            onChange={(e) => setSelectedContactPipelineId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {contactPipelines.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>

        {selectedContactPipeline ? (
          <>
            <div className="flex flex-wrap gap-2">
              {selectedContactPipeline.stages
                .slice()
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((stage) => (
                  <span
                    key={stage.id}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: stage.color || '#6366F1' }}
                  >
                    {stage.name}
                    {stage.isClosedWon ? ' (Won)' : ''}
                    {stage.isClosedLost ? ' (Lost)' : ''}
                  </span>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                placeholder="Nume status nou"
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="color"
                value={newStatusColor}
                onChange={(e) => setNewStatusColor(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300"
              />
              <select
                value={newStatusType}
                onChange={(e) => setNewStatusType(e.target.value as 'normal' | 'won' | 'lost')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="normal">Normal</option>
                <option value="won">Closed Won</option>
                <option value="lost">Closed Lost</option>
              </select>
              <button
                type="button"
                onClick={handleAddPipelineStatus}
                disabled={savingStatus}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adauga status
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-600">Nu exista pipeline configurat in workspace.</p>
        )}

        {statusError && (
          <p className="text-sm text-red-600">{statusError}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-effect rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalPipelineValue)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="glass-effect rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Deals</p>
              <p className="text-2xl font-bold text-gray-900">{totalDeals}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="glass-effect rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Deal Size</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalDeals > 0 ? totalPipelineValue / totalDeals : 0)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-purple-600" />
          </div>
        </div>
        <div className="glass-effect rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Win Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalDeals > 0
                  ? `${Math.round((pipeline.stages.find(s => s.id === 'closed_won')?.deals.length || 0) / totalDeals * 100)}%`
                  : '0%'}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
        </div>
      </div>

      {/* Pipeline Board */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {pipeline.stages.map((stage) => (
            <div
              key={stage.id}
              className="flex-shrink-0 w-80"
            >
              <div className={`${STAGE_COLORS[stage.id]} rounded-t-xl border-2 border-b-0 px-4 py-3`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{stage.name}</h3>
                  <span className="text-sm font-medium text-gray-600">{stage.deals.length}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{formatCurrency(stage.totalValue)}</p>
              </div>

              <SortableContext
                id={stage.id}
                items={stage.deals.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  className="min-h-[500px] bg-gray-50 border-2 border-t-0 rounded-b-xl p-3 space-y-3"
                  style={{ borderColor: STAGE_COLORS[stage.id].split(' ')[1].replace('border-', '') }}
                >
                  {stage.deals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      isLastStage={pipeline.stages[pipeline.stages.length - 1]?.id === stage.id}
                      onAdvance={() => handleAdvanceDeal(deal.id, stage.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeDeal && <DealCard deal={activeDeal} isDragging isLastStage={false} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
  isLastStage?: boolean;
  onAdvance?: () => void;
}

function DealCard({ deal, isDragging, isLastStage, onAdvance }: DealCardProps) {
  return (
    <div
      className={`bg-white rounded-lg p-4 border-2 border-gray-200 cursor-move hover:shadow-md transition-shadow ${
        isDragging ? 'shadow-2xl rotate-2' : ''
      }`}
    >
      <h4 className="font-semibold text-gray-900 mb-2">{deal.title}</h4>
      <p className="text-2xl font-bold text-indigo-600 mb-3">{formatCurrency(deal.value)}</p>

      <div className="space-y-2 text-sm text-gray-600">
        {deal.contactName && (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>{deal.contactName}</span>
          </div>
        )}
        {deal.companyName && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400">@</span>
            <span>{deal.companyName}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-gray-400">
          <Calendar className="h-4 w-4" />
          <span>{new Date(deal.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {deal.probability && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Win Probability</span>
            <span className="font-semibold text-gray-900">{deal.probability}%</span>
          </div>
          <div className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 transition-all"
              style={{ width: `${deal.probability}%` }}
            />
          </div>
        </div>
      )}

      {!isDragging && !isLastStage && onAdvance && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={(e) => { e.stopPropagation(); onAdvance(); }}
            className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg py-1.5 transition-colors"
          >
            Advance Stage
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
