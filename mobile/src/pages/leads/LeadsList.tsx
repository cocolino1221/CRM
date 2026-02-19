import { useEffect, useState } from 'react';
import { Search, Plus, X, Phone, Mail, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLeadsStore } from '@/stores/leads-store';
import Avatar from '@/components/Avatar';
import LeadForm from './LeadForm';

export default function LeadsList() {
  const {
    contacts, pipelines, selectedPipeline, selectedStage, isLoading,
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
  const palette = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500', 'bg-rose-500'];
  stages.forEach((s, i) => { stageColors[s] = palette[i % palette.length]; });

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="safe-top bg-blue-600 px-4 pt-2 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Leads</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSearch(!showSearch)} className="text-white/80 p-1.5">
              {showSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
            </button>
            <button onClick={() => { setEditingContact(null); setShowForm(true); }} className="text-white/80 p-1.5">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        {showSearch && (
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search leads..."
            autoFocus
            className="mt-2 w-full px-3 py-2 rounded-lg bg-blue-700/50 text-white placeholder-white/60 focus:outline-none text-sm"
          />
        )}
      </div>

      {/* Pipeline tabs */}
      {stages.length > 0 && (
        <div className="overflow-x-auto border-b border-gray-100 bg-gray-50">
          <div className="flex min-w-max px-2 py-1.5">
            {stages.map(stage => {
              const count = contacts.filter(c => c.pipelineStage === stage).length;
              const isActive = stage === selectedStage;
              return (
                <button
                  key={stage}
                  onClick={() => selectStage(stage)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap mr-1 transition ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {stage}
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                    isActive ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Contacts */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-12 w-12 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-36 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : stageContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <p className="text-sm">No leads in {selectedStage || 'this stage'}</p>
          </div>
        ) : (
          stageContacts.map(contact => (
            <button
              key={contact.id}
              onClick={() => navigate(`/leads/${contact.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition border-b border-gray-50 text-left"
            >
              <Avatar name={`${contact.firstName} ${contact.lastName}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {contact.firstName} {contact.lastName}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  {contact.phone && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <Phone className="h-3 w-3" />{contact.phone}
                    </span>
                  )}
                  {contact.email && !contact.email.includes('placeholder') && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400 truncate">
                      <Mail className="h-3 w-3" />{contact.email}
                    </span>
                  )}
                </div>
                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {contact.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">{tag}</span>
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
              <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
            </button>
          ))
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
