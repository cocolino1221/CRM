import { useEffect, useState } from 'react';
import { ArrowLeft, Edit, Phone, Mail, Building2, Briefcase, Tag, MessageCircle, Loader2, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/api';
import Avatar from '@/components/Avatar';
import LeadForm from './LeadForm';
import type { Contact } from '@/types';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  const fetchContact = async () => {
    try {
      const res = await api.get(`/contacts/${id}?relations=company,owner`);
      setContact(res.data);
    } catch {
      navigate('/leads');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchContact(); }, [id]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!contact) return null;
  const name = `${contact.firstName} ${contact.lastName}`.trim();

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="safe-top bg-blue-600 px-2 pt-1 pb-4">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/leads')} className="text-white p-1.5">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button onClick={() => setShowEdit(true)} className="text-white p-1.5">
            <Edit className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Profile card */}
      <div className="px-4 -mt-6">
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-4">
            <Avatar name={name} size="lg" />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{name}</h2>
              {contact.jobTitle && <p className="text-sm text-gray-500">{contact.jobTitle}</p>}
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  contact.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                  contact.status === 'NEW' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {contact.status}
                </span>
                {contact.pipelineStage && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                    {contact.pipelineStage}
                  </span>
                )}
              </div>
            </div>
          </div>

          {contact.leadScore != null && contact.leadScore > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Lead Score</span>
                <span className="font-semibold">{contact.leadScore}/100</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-3">
        {/* Contact info */}
        <div className="bg-white rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Info</h3>
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-3 text-sm text-gray-700">
              <Phone className="h-4 w-4 text-blue-500" /> {contact.phone}
            </a>
          )}
          {contact.email && !contact.email.includes('placeholder') && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-3 text-sm text-gray-700">
              <Mail className="h-4 w-4 text-blue-500" /> {contact.email}
            </a>
          )}
          {contact.company && (
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <Building2 className="h-4 w-4 text-blue-500" /> {contact.company.name}
            </div>
          )}
          {contact.source && (
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <Briefcase className="h-4 w-4 text-blue-500" /> Source: {contact.source}
            </div>
          )}
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="bg-white rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
                  <Tag className="h-3 w-3" /> {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {contact.notes && (
          <div className="bg-white rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}

        {/* Owner */}
        {contact.owner && (
          <div className="bg-white rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assigned To</h3>
            <div className="flex items-center gap-2">
              <Avatar name={`${contact.owner.firstName} ${contact.owner.lastName}`} size="sm" />
              <span className="text-sm text-gray-700">{contact.owner.firstName} {contact.owner.lastName}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-14 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-3 safe-bottom">
        {contact.phone && (
          <>
            <a
              href={`tel:${contact.phone}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-50 text-blue-600 rounded-xl font-medium text-sm"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
            <button
              onClick={() => navigate(`/whatsapp/chat/${contact.phone?.replace('+', '')}`)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl font-medium text-sm"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </button>
          </>
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
