# CRM UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the daily workflow for sales reps/setters by adding a "My Work Today" dashboard panel, simplifying the add-lead form, adding inline status badges on lead cards, and adding a one-click stage-advance button on pipeline deal cards.

**Architecture:** Frontend-only changes across 3 existing pages. No new API endpoints needed — existing `/auth/me`, `/contacts`, `/tasks`, and `/deals` endpoints cover all data requirements. All changes follow the existing page-file pattern (large single-file components).

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS 4.x, Axios (`frontend/lib/api.ts`), lucide-react icons.

---

### Task 1: "My Work Today" panel on the dashboard

**Files:**
- Modify: `frontend/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Add new interfaces and state to `dashboard/page.tsx`**

After the existing `LeadScoreDistribution` interface (around line 47), add:

```typescript
interface CurrentUser {
  id: string;
  firstName: string;
  lastName: string;
}

interface MyLead {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  leadScore: number;
  status: string;
}

interface MyTask {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  status: string;
  contact?: { firstName: string; lastName: string } | null;
}

interface MyDeal {
  id: string;
  title: string;
  value: number;
  stage: string;
}
```

Inside `DashboardPage()`, after the existing state declarations, add:

```typescript
const [myLeads, setMyLeads] = useState<MyLead[]>([]);
const [myTasks, setMyTasks] = useState<MyTask[]>([]);
const [myDeals, setMyDeals] = useState<MyDeal[]>([]);
```

- [ ] **Step 2: Fetch "My Work Today" data inside the existing `useEffect`**

Inside `fetchDashboardData`, after the existing `Promise.allSettled` block, add:

```typescript
try {
  const meRes = await api.get<CurrentUser>('/auth/me');
  const userId = meRes.data.id;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

  const [leadsRes, tasksRes, dealsRes] = await Promise.allSettled([
    api.get<any>(`/contacts?ownerId=${userId}&limit=8&sortBy=createdAt&sortOrder=DESC`),
    api.get<any>(`/tasks?assigneeId=${userId}&dueDateFrom=${encodeURIComponent(todayStart)}&dueDateTo=${encodeURIComponent(todayEnd)}&limit=10`),
    api.get<any>(`/deals?ownerId=${userId}&limit=12`),
  ]);

  if (leadsRes.status === 'fulfilled') {
    const raw = leadsRes.value.data;
    const arr: MyLead[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.contacts ?? []);
    setMyLeads(arr.slice(0, 8));
  }

  if (tasksRes.status === 'fulfilled') {
    const raw = tasksRes.value.data;
    const arr: MyTask[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.tasks ?? []);
    setMyTasks(arr.slice(0, 10));
  }

  if (dealsRes.status === 'fulfilled') {
    const raw = dealsRes.value.data;
    const arr: MyDeal[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.deals ?? []);
    setMyDeals(arr.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost').slice(0, 8));
  }
} catch {
  // my-work data is non-critical; dashboard still renders without it
}
```

- [ ] **Step 3: Render the "My Work Today" panel in the JSX**

Add `import { CheckCircle2 as CheckCircle } from 'lucide-react'` if not already imported (it already is as `CheckCircle2`).

In the return JSX, after the `{/* Stats Grid */}` section and before the `{/* AI Insights Section */}`, insert:

```tsx
{/* My Work Today */}
{(myLeads.length > 0 || myTasks.length > 0 || myDeals.length > 0) && (
  <div className="glass-effect rounded-2xl p-6 animate-slide-up">
    <div className="flex items-center gap-2 mb-5">
      <Zap className="h-5 w-5 text-indigo-600" />
      <h2 className="text-lg font-semibold text-gray-900">My Work Today</h2>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* My Leads */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">My Leads</span>
          <a href="/leads" className="text-xs text-indigo-600 hover:underline">View all</a>
        </div>
        {myLeads.length === 0 ? (
          <p className="text-sm text-gray-400">No leads assigned</p>
        ) : (
          <div className="space-y-2">
            {myLeads.map(lead => (
              <a
                key={lead.id}
                href="/leads"
                className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {lead.firstName} {lead.lastName}
                  </p>
                  {lead.phone && (
                    <p className="text-xs text-gray-500 truncate">{lead.phone}</p>
                  )}
                </div>
                <div className="flex-shrink-0 ml-2">
                  <span className={`inline-block w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center ${
                    lead.leadScore >= 80 ? 'bg-green-100 text-green-700' :
                    lead.leadScore >= 60 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {lead.leadScore}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Tasks Due Today */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">Tasks Due Today</span>
          <a href="/tasks" className="text-xs text-indigo-600 hover:underline">View all</a>
        </div>
        {myTasks.length === 0 ? (
          <p className="text-sm text-gray-400">No tasks due today</p>
        ) : (
          <div className="space-y-2">
            {myTasks.map(task => (
              <div key={task.id} className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg">
                <CheckCircle2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                  task.status === 'completed' ? 'text-green-500' : 'text-gray-300'
                }`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                  {task.contact && (
                    <p className="text-xs text-gray-500 truncate">
                      {task.contact.firstName} {task.contact.lastName}
                    </p>
                  )}
                </div>
                <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  task.priority === 'high' ? 'bg-red-100 text-red-700' :
                  task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {task.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Deals */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">My Open Deals</span>
          <a href="/pipeline" className="text-xs text-indigo-600 hover:underline">View all</a>
        </div>
        {myDeals.length === 0 ? (
          <p className="text-sm text-gray-400">No open deals</p>
        ) : (
          <div className="space-y-2">
            {myDeals.map(deal => (
              <a
                key={deal.id}
                href="/pipeline"
                className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                  <p className="text-xs text-gray-500 capitalize">{deal.stage.replace(/_/g, ' ')}</p>
                </div>
                <span className="flex-shrink-0 ml-2 text-sm font-bold text-indigo-600">
                  ${Number(deal.value).toLocaleString()}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

    </div>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat(dashboard): add My Work Today panel for sales reps"
```

---

### Task 2: Simplified add-lead form (collapsible "More details")

**Files:**
- Modify: `frontend/app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Add `showMoreFields` state**

Inside the `LeadsPage` component, find the block of `useState` declarations (around line 130–160) and add:

```typescript
const [showMoreFields, setShowMoreFields] = useState(false);
```

Also add `ChevronDown` and `ChevronUp` to the existing lucide-react import at the top of the file (they should already be there; if not, add them).

- [ ] **Step 2: Wrap secondary fields in collapsible section inside the add modal form**

In the add modal form (starting around line 1575), the `<div className="grid grid-cols-2 gap-4">` block contains all fields. Restructure it so the form has two parts:

**Find and replace** the entire `<div className="grid grid-cols-2 gap-4">` block inside the add modal form (`{showAddModal && ...}`). Replace it with:

```tsx
{/* Primary fields - always visible */}
<div className="grid grid-cols-2 gap-4">
  {/* First Name */}
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">First Name *</label>
    <input
      type="text"
      required
      disabled={isSubmitting}
      value={formData.firstName}
      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
      placeholder="John"
    />
  </div>
  {/* Last Name */}
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name *</label>
    <input
      type="text"
      required
      disabled={isSubmitting}
      value={formData.lastName}
      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
      placeholder="Doe"
    />
  </div>
  {/* Email */}
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
    <input
      type="email"
      required
      disabled={isSubmitting}
      value={formData.email}
      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
      placeholder="john@example.com"
    />
  </div>
  {/* Phone */}
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
    <div className="flex gap-2">
      <select
        disabled={isSubmitting}
        value={phonePrefix}
        onChange={(e) => setPhonePrefix(e.target.value)}
        className="w-28 px-2 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all text-sm"
      >
        {PHONE_PREFIXES.map(p => (
          <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
        ))}
      </select>
      <input
        type="tel"
        disabled={isSubmitting}
        value={formData.phone}
        onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, '') })}
        className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
        placeholder="712345678"
      />
    </div>
  </div>
  {/* Pipeline */}
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">Pipeline</label>
    <select
      disabled={isSubmitting}
      value={formData.pipelineId}
      onChange={(e) => {
        const pipeline = pipelines.find(p => p.id === e.target.value);
        const firstStage = pipeline?.stages?.find(s => s && s.id);
        setFormData({ ...formData, pipelineId: e.target.value, pipelineStageId: firstStage?.id || '' });
      }}
      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
    >
      {pipelines.map(pipeline => (
        <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
      ))}
    </select>
  </div>
  {/* Stage */}
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-2">Stage</label>
    <select
      disabled={isSubmitting}
      value={formData.pipelineStageId}
      onChange={(e) => setFormData({ ...formData, pipelineStageId: e.target.value })}
      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
    >
      {(pipelines.find(p => p.id === formData.pipelineId)?.stages || [])
        .filter(stage => stage && stage.id)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(stage => (
          <option key={stage.id} value={stage.id}>{stage.name}</option>
        ))}
    </select>
  </div>
</div>

{/* More details toggle */}
<button
  type="button"
  onClick={() => setShowMoreFields(v => !v)}
  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors mt-1"
>
  {showMoreFields ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
  {showMoreFields ? 'Hide details' : 'More details (setter, source, notes…)'}
</button>

{/* Secondary fields - collapsed by default */}
{showMoreFields && (
  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
    {/* Setter */}
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">Setter</label>
      <select
        disabled={isSubmitting}
        value={formData.setterId || ''}
        onChange={(e) => setFormData({ ...formData, setterId: e.target.value })}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
      >
        <option value="">None</option>
        {setters.map(user => (
          <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
        ))}
      </select>
    </div>
    {/* Caller */}
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">Caller</label>
      <select
        disabled={isSubmitting}
        value={formData.callerId || ''}
        onChange={(e) => setFormData({ ...formData, callerId: e.target.value })}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
      >
        <option value="">None</option>
        {callers.map(user => (
          <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
        ))}
      </select>
    </div>
    {/* Closer */}
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">Closer</label>
      <select
        disabled={isSubmitting}
        value={formData.closerId || ''}
        onChange={(e) => setFormData({ ...formData, closerId: e.target.value })}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
      >
        <option value="">None</option>
        {closers.map(user => (
          <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
        ))}
      </select>
    </div>
    {/* Source */}
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">Source</label>
      <select
        disabled={isSubmitting}
        value={formData.source}
        onChange={(e) => setFormData({ ...formData, source: e.target.value })}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
      >
        <option value="manual">Manual</option>
        <option value="website">Website</option>
        <option value="referral">Referral</option>
        <option value="social_media">Social Media</option>
        <option value="email_campaign">Email Campaign</option>
        <option value="cold_outreach">Cold Outreach</option>
        <option value="event">Event</option>
        <option value="facebook">Facebook</option>
        <option value="instagram">Instagram</option>
        <option value="linkedin">LinkedIn</option>
        <option value="google-ads">Google Ads</option>
        <option value="slack">Slack</option>
        <option value="typeform">Typeform</option>
        <option value="other">Other</option>
      </select>
    </div>
    {/* Notes */}
    <div className="col-span-2">
      <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
      <textarea
        disabled={isSubmitting}
        value={formData.notes}
        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        rows={3}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
        placeholder="Add any additional notes about this lead..."
      />
    </div>
  </div>
)}
```

Also reset `showMoreFields` when the modal closes. Find the two places where `setShowAddModal(false)` is called (in the Cancel button and the X button) and add `setShowMoreFields(false)` alongside them.

- [ ] **Step 3: Verify `ChevronDown` and `ChevronUp` are imported**

In the imports at the top of `leads/page.tsx`, confirm `ChevronDown` and `ChevronUp` are in the lucide-react import. If not, add them. The file already imports `ChevronLeft` and `ChevronRight`.

Check: `grep "ChevronDown\|ChevronUp" frontend/app/\(dashboard\)/leads/page.tsx`

If missing, add to the existing import:
```typescript
import { ..., ChevronDown, ChevronUp } from 'lucide-react';
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(dashboard\)/leads/page.tsx
git commit -m "feat(leads): collapse secondary fields in add-lead form by default"
```

---

### Task 3: Inline status badge on lead cards

**Files:**
- Modify: `frontend/app/(dashboard)/leads/page.tsx`

- [ ] **Step 1: Add `handleInlineStatusChange` function**

Inside the `LeadsPage` component, near the other handler functions (around the `handleQuickStageChange` function), add:

```typescript
const handleInlineStatusChange = async (contact: Contact, newStatus: string) => {
  try {
    await api.patch(`/contacts/${contact.id}`, { status: newStatus });
    setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, status: newStatus } : c));
  } catch {
    // status update failure is silent; the card still shows the old value on next render
  }
};
```

Note: check if the backend uses `api.patch` or `api.put` for partial contact updates. If `PATCH /contacts/:id` is not defined, use `api.put` instead. Verify with:
`grep -n "patch\|put" backend/src/contacts/contacts.controller.ts | head -20`

- [ ] **Step 2: Add inline status badge to each lead card**

In the JSX for each lead card (the `stageLeads.map((contact) => (...))` block), after the `{/* Date */}` div and before `{/* Quick Stage Controls */}`, insert:

```tsx
{/* Inline status badge */}
<div
  className="mb-1.5"
  onClick={(e) => e.stopPropagation()}
>
  <select
    value={contact.status}
    onChange={(e) => handleInlineStatusChange(contact, e.target.value)}
    onClick={(e) => e.stopPropagation()}
    className={`w-full text-[10px] font-semibold rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      contact.status === 'qualified' ? 'bg-green-100 text-green-700' :
      contact.status === 'customer' ? 'bg-emerald-100 text-emerald-700' :
      contact.status === 'prospect' ? 'bg-purple-100 text-purple-700' :
      contact.status === 'inactive' ? 'bg-gray-100 text-gray-700' :
      contact.status === 'churned' ? 'bg-red-100 text-red-700' :
      'bg-blue-100 text-blue-700'
    }`}
  >
    <option value="lead">Lead</option>
    <option value="prospect">Prospect</option>
    <option value="qualified">Qualified</option>
    <option value="customer">Customer</option>
    <option value="inactive">Inactive</option>
    <option value="churned">Churned</option>
  </select>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/\(dashboard\)/leads/page.tsx
git commit -m "feat(leads): add inline status badge on lead cards"
```

---

### Task 4: One-click stage advance on pipeline deal cards

**Files:**
- Modify: `frontend/app/(dashboard)/pipeline/page.tsx`

- [ ] **Step 1: Add `handleAdvanceDeal` function**

Inside the main `PipelinePage` component, near `handleDragEnd` (around line 260), add:

```typescript
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
```

- [ ] **Step 2: Pass `onAdvance` and `stages` props to `DealCard`**

Find where `DealCard` is rendered (the `stage.deals.map((deal) => ...)` block around line 515) and update the render call:

```tsx
{stage.deals.map((deal) => (
  <DealCard
    key={deal.id}
    deal={deal}
    isLastStage={pipeline.stages[pipeline.stages.length - 1]?.id === stage.id}
    onAdvance={() => handleAdvanceDeal(deal.id, stage.id)}
  />
))}
```

Also update the `DragOverlay` DealCard (it doesn't need `onAdvance`):
```tsx
<DragOverlay>
  {activeDeal && <DealCard deal={activeDeal} isDragging isLastStage={false} />}
</DragOverlay>
```

- [ ] **Step 3: Update `DealCardProps` and `DealCard` component**

Find the `DealCardProps` interface at the bottom of the file and update it:

```typescript
interface DealCardProps {
  deal: Deal;
  isDragging?: boolean;
  isLastStage?: boolean;
  onAdvance?: () => void;
}
```

Update the `DealCard` function signature:
```typescript
function DealCard({ deal, isDragging, isLastStage, onAdvance }: DealCardProps) {
```

Add the advance button at the bottom of the card, after the probability section:

```tsx
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
```

Ensure `ChevronRight` is imported at the top of `pipeline/page.tsx`. Check with:
`grep "ChevronRight" frontend/app/\(dashboard\)/pipeline/page.tsx`

If missing, add to the lucide-react import:
```typescript
import { ..., ChevronRight } from 'lucide-react';
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(dashboard\)/pipeline/page.tsx
git commit -m "feat(pipeline): add one-click Advance Stage button on deal cards"
```

---

### Task 5: Type-check and verify build

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript type-check**

```bash
cd /Users/constantinpristavita/Desktop/CRM && npm run typecheck:frontend
```

Expected: no errors. Fix any type errors before proceeding.

- [ ] **Step 2: Run frontend build**

```bash
cd /Users/constantinpristavita/Desktop/CRM/frontend && npm run build
```

Expected: build completes successfully with no errors.

- [ ] **Step 3: If build passes, push to git for Netlify auto-deploy**

```bash
git push origin main
```

**IMPORTANT: Ask the user for confirmation before running this step. The app is live in production.**
