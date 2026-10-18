import { useEffect, useState } from 'react';
import { ArrowLeft, Edit, Phone, Mail, Building2, Briefcase, Tag, MessageCircle, Loader2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import { useToastStore } from '@/stores/toast-store';
import Avatar from '@/components/Avatar';
import LeadForm from './LeadForm';
import type { Contact } from '@/types';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const showToast = useToastStore(s => s.show);
  const initialContact = (location.state as { contact?: Contact } | null)?.contact || null;
  const [contact, setContact] = useState<Contact | null>(initialContact);
  const [isLoading, setIsLoading] = useState(!initialContact);
  const [showEdit, setShowEdit] = useState(false);

  const fetchContact = async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/contacts/${id}`, { params: { include: 'company,owner' } });
      setContact(res.data);
    } catch {
      try {
        // Backward-compatible fallback if include parsing is blocked by environment config.
        const fallback = await api.get(`/contacts/${id}`);
        setContact(fallback.data);
      } catch (err: any) {
        const msg = err?.response?.data?.message || 'Failed to load contact';
        showToast(msg, 'error');
        if (!initialContact) {
          navigate('/leads');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchContact(); }, [id]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!contact) return null;
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  const tags = Array.isArray(contact.tags)
    ? contact.tags
    : typeof contact.tags === 'string'
      ? contact.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];

  return (
    <div className="h-full flex flex-col page-enter">
      {/* Header */}
      <div className="safe-top bg-gradient-to-br from-[#153f6d] via-[#1a5f96] to-[#2097a4] px-2 pt-1 pb-5 shadow-[0_10px_30px_rgba(15,63,104,0.3)]">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/leads')} className="text-white p-2 rounded-xl bg-white/12 border border-white/20">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button onClick={() => setShowEdit(true)} className="text-white p-2 rounded-xl bg-white/12 border border-white/20">
            <Edit className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Profile card */}
      <div className="px-4 -mt-8">
        <div className="glass-panel rounded-3xl p-5">
          <div className="flex items-center gap-4">
            <Avatar name={name} size="lg" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate">{name}</h2>
              {contact.jobTitle && <p className="text-sm text-slate-500">{contact.jobTitle}</p>}
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                  contact.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                  contact.status === 'NEW' ? 'bg-sky-100 text-sky-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {contact.status}
                </span>
                {contact.pipelineStage && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">
                    {contact.pipelineStage}
                  </span>
                )}
              </div>
            </div>
          </div>

          {contact.leadScore != null && contact.leadScore > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-500">Lead score</span>
                <span className="font-semibold text-slate-800">{contact.leadScore}/100</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    contact.leadScore >= 70 ? 'bg-emerald-500' : contact.leadScore >= 40 ? 'bg-amber-500' : 'bg-red-400'
                  }`}
                  style={{ width: `${contact.leadScore}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32 space-y-3">
        <div className="glass-panel rounded-2xl p-4 space-y-3">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em]">Contact info</h3>
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-3 text-sm text-slate-700">
              <Phone className="h-4 w-4 text-sky-600" /> {contact.phone}
            </a>
          )}
          {contact.email && !contact.email.includes('placeholder') && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-3 text-sm text-slate-700">
              <Mail className="h-4 w-4 text-sky-600" /> {contact.email}
            </a>
          )}
          {contact.company && (
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Building2 className="h-4 w-4 text-sky-600" /> {contact.company.name}
            </div>
          )}
          {contact.source && (
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <Briefcase className="h-4 w-4 text-sky-600" /> Source: {contact.source}
            </div>
          )}
        </div>

        {tags.length > 0 && (
          <div className="glass-panel rounded-2xl p-4">
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
                  <Tag className="h-3 w-3" /> {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {contact.notes && (
          <div className="glass-panel rounded-2xl p-4">
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-2">Notes</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}

        {contact.owner && (
          <div className="glass-panel rounded-2xl p-4">
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-2">Assigned to</h3>
            <div className="flex items-center gap-2">
              <Avatar name={`${contact.owner.firstName} ${contact.owner.lastName}`} size="sm" />
              <span className="text-sm text-slate-700">{contact.owner.firstName} {contact.owner.lastName}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-[92px] left-0 right-0 px-4 safe-bottom">
        {contact.phone && (
          <div className="glass-panel rounded-2xl p-2 flex gap-2">
            <a
              href={`tel:${contact.phone}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sky-50 text-sky-700 rounded-xl font-semibold text-sm"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
            <button
              onClick={() => navigate(`/whatsapp/chat/${contact.phone?.replace('+', '')}`)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-teal-50 text-teal-700 rounded-xl font-semibold text-sm"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </button>
          </div>
        )}
      </div>

      {showEdit && (
        <LeadForm
          contact={contact}
          onClose={() => { setShowEdit(false); fetchContact(); }}
        />
      )}
    </div>
  );
}
