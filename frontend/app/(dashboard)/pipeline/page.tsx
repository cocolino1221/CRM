'use client';

import { useEffect, useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2, Plus, Filter, Search, TrendingUp, DollarSign, Calendar, User } from 'lucide-react';
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

const STAGE_COLORS: Record<string, string> = {
  lead: 'bg-gray-100 border-gray-300',
  qualified: 'bg-blue-100 border-blue-300',
  proposal: 'bg-purple-100 border-purple-300',
  negotiation: 'bg-yellow-100 border-yellow-300',
  closed_won: 'bg-green-100 border-green-300',
  closed_lost: 'bg-red-100 border-red-300',
};

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetchPipelineData();
  }, []);

  const fetchPipelineData = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<{ deals: Deal[] }>('/deals');

      // Group deals by stage
      const dealsByStage = response.data.deals.reduce((acc, deal) => {
        if (!acc[deal.stage]) {
          acc[deal.stage] = [];
        }
        acc[deal.stage].push(deal);
        return acc;
      }, {} as Record<string, Deal[]>);

      // Create pipeline structure
      const stages: PipelineStage[] = [
        { id: 'lead', name: 'New Leads', color: 'gray', deals: dealsByStage['lead'] || [], totalValue: 0 },
        { id: 'qualified', name: 'Qualified', color: 'blue', deals: dealsByStage['qualified'] || [], totalValue: 0 },
        { id: 'proposal', name: 'Proposal', color: 'purple', deals: dealsByStage['proposal'] || [], totalValue: 0 },
        { id: 'negotiation', name: 'Negotiation', color: 'yellow', deals: dealsByStage['negotiation'] || [], totalValue: 0 },
        { id: 'closed_won', name: 'Closed Won', color: 'green', deals: dealsByStage['closed_won'] || [], totalValue: 0 },
      ];

      // Calculate total value for each stage
      stages.forEach(stage => {
        stage.totalValue = stage.deals.reduce((sum, deal) => sum + deal.value, 0);
      });

      setPipeline({
        id: 'main',
        name: 'Sales Pipeline',
        stages,
      });
    } catch (error) {
      console.error('Failed to fetch pipeline data:', error);
    } finally {
      setIsLoading(false);
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
                    <DealCard key={deal.id} deal={deal} />
                  ))}
                </div>
              </SortableContext>
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeDeal && <DealCard deal={activeDeal} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
}

function DealCard({ deal, isDragging }: DealCardProps) {
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
    </div>
  );
}
