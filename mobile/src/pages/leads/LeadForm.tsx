import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useLeadsStore } from '@/stores/leads-store';
import type { Contact } from '@/types';

interface Props {
  contact?: Contact | null;
  onClose: () => void;
}

export default function LeadForm({ contact, onClose }: Props) {
  const { createContact, updateContact, selectedPipeline } = useLeadsStore();
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

    const ok = isEdit
      ? await updateContact(contact!.id, data)
      : await createContact(data);

    setIsSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Lead' : 'New Lead'}</h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4 pb-8">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">First Name *</label>
              <input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
              <input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+40..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {stages.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Pipeline Stage</label>
              <select
                value={stage}
                onChange={e => setStage(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              >
                {stages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
            <select
              value={source}
              onChange={e => setSource(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
            >
              <option value="">Select source...</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!firstName.trim() || isSaving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isEdit ? 'Save Changes' : 'Create Lead')}
          </button>
        </div>
      </div>
    </div>
  );
}
