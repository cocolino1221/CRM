import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useLeadsStore } from '@/stores/leads-store';
import { useToastStore } from '@/stores/toast-store';
import type { Contact } from '@/types';

interface Props {
  contact?: Contact | null;
  onClose: () => void;
}

export default function LeadForm({ contact, onClose }: Props) {
  const { createContact, updateContact, selectedPipeline } = useLeadsStore();
  const showToast = useToastStore(s => s.show);
  const isEdit = !!contact;

  const [firstName, setFirstName] = useState(contact?.firstName || '');
  const [lastName, setLastName] = useState(contact?.lastName || '');
  const [email, setEmail] = useState(
    contact?.email?.includes('placeholder') ? '' : contact?.email || ''
  );
  const [phone, setPhone] = useState(contact?.phone || '');
  const [notes, setNotes] = useState(contact?.notes || '');
  const [stage, setStage] = useState(contact?.pipelineStage || selectedPipeline?.stages?.[0] || '');
  const [source, setSource] = useState(contact?.source || '');
  const [isSaving, setIsSaving] = useState(false);

  const stages = selectedPipeline?.stages || [];
  const sources = ['Website', 'Referral', 'Social Media', 'Cold Call', 'Typeform', 'WhatsApp', 'Other'];

  const handleSave = async () => {
    if (!firstName.trim()) return;
    setIsSaving(true);
    const data: any = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
      pipelineStage: stage || undefined,
      pipelineId: selectedPipeline?.id,
      source: source || undefined,
    };

    const error = isEdit
      ? await updateContact(contact!.id, data)
      : await createContact(data);

    setIsSaving(false);
    if (error) {
      showToast(error, 'error');
    } else {
      showToast(isEdit ? 'Lead updated' : 'Lead created', 'success');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-[2px] flex items-end">
      <div className="bg-white/96 w-full rounded-t-3xl max-h-[90vh] overflow-y-auto animate-slide-up border-t border-white/80 shadow-[0_-12px_40px_rgba(15,23,42,0.25)]">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 border-b border-slate-100 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Lead' : 'New Lead'}</h2>
          <button onClick={onClose} className="text-slate-400 p-1.5 rounded-xl hover:bg-slate-100 transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4 pb-8">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">First Name *</label>
              <input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Last Name</label>
              <input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+40..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm"
            />
          </div>

          {stages.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Pipeline Stage</label>
              <select
                value={stage}
                onChange={e => setStage(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm bg-white"
              >
                {stages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Source</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm bg-white"
            >
              <option value="">Select source...</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!firstName.trim() || isSaving}
            className="w-full py-3 bg-gradient-to-r from-sky-700 to-teal-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition hover:brightness-105 active:brightness-95"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save Changes' : 'Create Lead')}
          </button>
        </div>
      </div>
    </div>
  );
}
