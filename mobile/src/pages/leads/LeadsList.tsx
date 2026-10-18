import { useEffect, useState } from 'react';
import { Search, Plus, X, Phone, Mail, ChevronRight, Funnel, WifiOff, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLeadsStore } from '@/stores/leads-store';
import Avatar from '@/components/Avatar';
import LeadForm from './LeadForm';

export default function LeadsList() {
  const {
    contacts, selectedPipeline, selectedStage, isLoading, fetchError,
    search, setSearch, fetchPipelines, fetchContacts, selectStage,
  } = useLeadsStore();
  const [showSearch, setShowSearch] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPipelines().then(() => fetchContacts());
  }, []);

  useEffect(() => {
    if (selectedPipeline) fetchContacts();
  }, [selectedPipeline, search]);

  const stageContacts = contacts.filter(c => c.pipelineStage === selectedStage);
  const stages = selectedPipeline?.stages || [];
  const stageColors: Record<string, string> = {};
  const palette = ['bg-sky-500', 'bg-teal-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500'];
  stages.forEach((s, i) => { stageColors[s] = palette[i % palette.length]; });

  return (
    <div className="h-full flex flex-col page-enter">
      {/* Header */}
      <div className="safe-top px-4 pt-3 pb-4 bg-gradient-to-br from-[#153f6d] via-[#1a5f96] to-[#2097a4] text-white shadow-[0_8px_32px_rgba(15,63,104,0.28)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-sky-100/90">Pipeline</p>
            <h1 className="text-[24px] font-extrabold">Leads</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowSearch(!showSearch)} className="text-white/90 p-2 rounded-xl bg-white/15 border border-white/20">
              {showSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>
            <button onClick={() => { setEditingContact(null); setShowForm(true); }} className="text-white p-2 rounded-xl bg-white/18 border border-white/25 shadow-sm">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-white/16 border border-white/20 px-2.5 py-1 font-semibold">
            {contacts.length} total
          </span>
          <span className="rounded-full bg-white/16 border border-white/20 px-2.5 py-1 font-semibold">
            {stageContacts.length} in {selectedStage || 'all'}
          </span>
        </div>
        {showSearch && (
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search leads..."
            autoFocus
            className="mt-3 w-full px-3.5 py-2.5 rounded-xl bg-white/16 border border-white/25 text-white placeholder-white/65 focus:outline-none focus:ring-2 focus:ring-white/35 text-sm animate-slide-down"
          />
        )}
      </div>

      {/* Pipeline tabs */}
      {stages.length > 0 && (
        <div className="overflow-x-auto px-3 py-3">
          <div className="flex min-w-max gap-1.5">
            {stages.map(stage => {
              const count = contacts.filter(c => c.pipelineStage === stage).length;
              const isActive = stage === selectedStage;
              return (
                <button
                  key={stage}
                  onClick={() => selectStage(stage)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white/90 border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {!isActive && <Funnel className="inline h-3 w-3 mr-1.5 text-slate-400" />}
                  {stage}
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error banner */}
      {fetchError && !isLoading && (
        <div className="mx-3 mb-1 flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
          <WifiOff className="h-5 w-5 text-rose-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-rose-700">Connection error</p>
            <p className="text-xs text-rose-500 mt-0.5 truncate">{fetchError}</p>
          </div>
          <button onClick={() => fetchPipelines().then(() => fetchContacts())} className="p-2 rounded-lg bg-rose-100 text-rose-600 active:bg-rose-200">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Contacts */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {isLoading ? (
          <div className="space-y-3 px-1 pt-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="glass-panel rounded-2xl p-3 flex items-center gap-3 animate-pulse">
                <div className="h-12 w-12 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-36 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : stageContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500">
            <p className="text-sm font-medium">No leads in {selectedStage || 'this stage'}</p>
            <p className="text-xs text-slate-400 mt-1">Tap + to create your first lead.</p>
          </div>
        ) : (
          stageContacts.map(contact => {
            const tags = Array.isArray(contact.tags)
              ? contact.tags
              : typeof contact.tags === 'string'
                ? contact.tags.split(',').map(t => t.trim()).filter(Boolean)
                : [];

            return (
            <button
              key={contact.id}
              onClick={() => {
                if (!contact.id) return;
                navigate(`/leads/${contact.id}`, { state: { contact } });
              }}
              className="glass-panel w-full flex items-center gap-3 px-3.5 py-3.5 rounded-2xl mb-2.5 transition text-left hover:translate-y-[-1px]"
            >
              <Avatar name={`${contact.firstName} ${contact.lastName}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {contact.firstName} {contact.lastName}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  {contact.phone && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Phone className="h-3 w-3" />{contact.phone}
                    </span>
                  )}
                  {contact.email && !contact.email.includes('placeholder') && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                      <Mail className="h-3 w-3" />{contact.email}
                    </span>
                  )}
                </div>
                {contact.pipelineStage && (
                  <div className="mt-1.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full text-white ${stageColors[contact.pipelineStage] || 'bg-slate-500'}`}>
                      {contact.pipelineStage}
                    </span>
                  </div>
                )}
                {tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              {contact.leadScore != null && contact.leadScore > 0 && (
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${
                  contact.leadScore >= 70 ? 'bg-emerald-500' : contact.leadScore >= 40 ? 'bg-amber-500' : 'bg-red-400'
                }`}>
                  {contact.leadScore}
                </div>
              )}
              <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
            </button>
            );
          })
        )}
      </div>

      {showForm && (
        <LeadForm
          contact={editingContact}
          onClose={() => { setShowForm(false); setEditingContact(null); }}
        />
      )}
    </div>
  );
}
