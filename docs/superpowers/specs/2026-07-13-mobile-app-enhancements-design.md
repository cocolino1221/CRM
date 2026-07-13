# Mobile App Enhancements — Design Spec

**Date:** 2026-07-13
**App:** `mobile-rn` (Expo / React Native, iOS + Android) + `frontend` (Next.js web) where noted
**Backend:** NestJS (`backend/`)

## Goal

Enhance the existing EasyTeam CRM mobile app with: granular push-notification controls, richer social-inbox filtering, a redesigned "real-chat" conversation UI (shared with web), a full media composer for social + WhatsApp, sending saved audio clips, and optional per-workspace white-label branding.

## Principles

- **Adapt, don't rebuild.** The app already has SocialInbox, SocialChat, WhatsAppInbox, MessagesHub, Notifications, Payments, Settings screens; `notifications-store`, `whatsapp-store`; `lib/push-notifications.ts`. The backend already has `notifications.service`, `push-notification.service`, an `audio-library` module, and R2 upload. We extend these.
- **One source of truth** for notification preferences, read by both the push sender and the mobile UI.
- **Reuse** existing endpoints: `audio-library`, meta-messaging send, R2 upload.
- **Ship in phases** (see Phasing) even though this is one combined spec.

---

## Feature 1 — Granular notification preferences

### Data model
- Add `notificationPreferences?` JSON to the **User** entity (JSONB, no migration pain), shape:
  ```ts
  interface NotificationPreferences {
    categories: Record<string, boolean>; // key -> enabled
    quietHours?: { enabled: boolean; start: string; end: string; timezone: string }; // "22:00","08:00"
  }
  ```
- **Category keys** (each an independent on/off toggle):
  - `lead:typeform`, `lead:social`, `lead:manual`
  - `payment:received`, `payment:failed`, `payment:contract`
  - `message:instagram`, `message:facebook`, `message:whatsapp`
  - `task`, `call`
- Default: all `true`; quietHours disabled by default.

### Backend
- `NotificationType` enum extended / notifications tagged with a `category` string matching a key above. When a notification is created, its `category` is derived from the event (e.g. a Typeform-sourced lead → `lead:typeform`).
- New event hooks that don't exist yet:
  - **Lead created** → tag by `contact.source` (TYPEFORM → typeform, social sources → social, else manual).
  - **Payment** received/failed and **contract** signed → from the payments/documents modules.
  - **Inbound social message** (IG/FB) → hook into `meta-messaging` ingest (`saveInboundActivity`); WhatsApp → whatsapp ingest.
- **Preference-aware delivery:** `push-notification.service.sendPushToUser` loads the user's `notificationPreferences`; if the notification's `category` is disabled → **do not push** (still persist the in-app Notification row). If within quiet hours → **do not push** (still persist). Quiet-hours check uses the stored timezone.
- Endpoints: `GET /notifications/preferences`, `PUT /notifications/preferences`.

### Mobile UI (SettingsScreen → "Notifications" section, or NotificationsScreen settings tab)
- A list of grouped toggles matching the keys (grouped: New Lead / Payments / Messages / Tasks & Calls).
- A **Quiet hours** block: enable switch + start/end time pickers (device timezone prefilled).
- Reads/writes via the two endpoints; optimistic local update.

---

## Feature 2 — Social inbox filters (setter + closer)

- **Existing:** channel filter (All/Messenger/Instagram) and account/profile filter, on both mobile (`SocialInboxScreen`) and web (`meta-inbox`).
- **Add:** `Setter ▾` and `Closer ▾` filter chips.
- **Backend dependency:** `meta-messaging.getInbox` must include each conversation's `setterId`/`setterName` and `closerId`/`closerName` (they live on the linked contact). Add these to the conversation payload.
- **Both platforms:** dropdown of workspace users (reuse team list); filtering is client-side on the returned conversations (matches the existing account-filter pattern).

---

## Feature 3 — Chat redesign (Direction C — Warm Neumorphic)

Applies to the **Social chat** on **mobile + web** (SocialChatScreen and the web meta-inbox conversation pane).

- **Palette:** fresh teal (`#12b886`/`#0ea371` gradient outbound bubbles), soft `#eef0f4` neumorphic surfaces; retire the tired grey.
- **Bubbles:** inbound = soft "raised" neumorphic card (`box-shadow` light/dark pair), radius `16px` with a 4px tail corner; outbound = teal gradient with soft drop shadow, white text.
- **Header:** neumorphic bar, gradient avatar, channel badge (IG/Messenger/WhatsApp).
- **Voice notes:** render with a play control + waveform + duration.
- **Composer:** neumorphic input pill + tactile round icon buttons (see Feature 4).
- Encapsulate the palette/shadows as shared style tokens (mobile: a theme module; web: Tailwind classes/CSS vars) so both platforms stay consistent.

---

## Feature 4 — Media composer (IG · Messenger · WhatsApp)

A shared composer with **two icon buttons** before the input:
1. **＋ (attach)** → popover menu: 📷 Photo · 🎥 Video · 📄 Document/file · 🎙️ Record audio (record a new voice message) · 🎤 Audio library (send a saved clip).
2. **📋 Templates** → IG/FB quick replies; WhatsApp approved templates (existing picker).

### Behavior
- **Photo/Video/Document:** pick via `expo-image-picker` / `expo-document-picker` (mobile) or file input (web) → upload via existing `/upload` → **mirror to R2** (already built) → send through the channel's media send:
  - Meta (IG/Messenger): `meta-messaging` attachment-by-URL send (already supports image/video/audio/file by URL).
  - WhatsApp: media message by `link` (already supported).
- **Record audio:** record with `expo-av` (mobile) / MediaRecorder (web) → upload+mirror → send as a voice/audio message.
- **Audio library:** reuses the `audio-library` module — list saved clips, tap → `POST /audio-library/:id/send`.
- **Templates:** existing pickers.

### Constraints (surfaced in UI)
- Meta only allows free-form/media messages inside the **24h window**; each channel has format/size limits. The composer **disables** options a channel or an expired window can't send, with a short reason tooltip. Reuse the existing `sessionOpen`/liveReady signals.

---

## Feature 5 — White-label workspace logo (optional)

- **Backend:** add `brandLogoUrl?` to `workspace.settings` (JSONB). Endpoint `PUT /workspaces/current/branding` (admin only) uploads a logo via existing `/upload` → R2 → stores the URL. `GET` current workspace already returns settings.
- **Mobile:** wherever the app shows the "etcrm" logo (login header, drawer/hub header), render `workspace.brandLogoUrl` when present, else the default etcrm logo. Logo comes from the authenticated workspace payload (auth-store).
- **Optional:** empty/unset → default branding. No other theming in scope (YAGNI).

---

## Data model summary (all JSONB — no destructive migrations)

- `User.notificationPreferences` (new JSONB column) — Feature 1.
- `Notification.category` (string) — Feature 1 tagging.
- Conversation payload gains `setter*`/`closer*`/… fields (computed, not stored) — Feature 2.
- `workspace.settings.brandLogoUrl` — Feature 5.

## Error handling / edge cases

- Push send when prefs missing → treat as all-enabled (backward compatible).
- Quiet-hours spanning midnight (start > end) handled explicitly.
- Media send outside 24h window → option disabled; if attempted anyway, surface the Meta/WhatsApp error clearly (don't fake success).
- R2 not configured → falls back to local disk URL (existing behavior); media still sends if URL is reachable.
- Logo upload: validate it's an image; cap size; bad URL → fall back to default logo (onError).

## Testing

- Backend unit tests: preference gating (category off / quiet hours) suppresses push but persists notification; category derivation from lead source; conversation payload includes setter/closer.
- Mobile: preference toggles round-trip; composer disables unsupported options; audio-library send hits the right endpoint.
- Manual: end-to-end send of each media type on IG/Messenger/WhatsApp within the 24h window; logo override renders and falls back.

## Phasing (implementation order)

1. **Backend foundations** — notification preferences model + endpoints + preference-aware delivery + source-tagged triggers; conversation setter/closer fields; workspace `brandLogoUrl` endpoint.
2. **Mobile notifications UI** — preferences + quiet hours in Settings.
3. **Chat redesign (Direction C)** — shared style tokens; apply to mobile SocialChat + web meta-inbox.
4. **Media composer** — attach menu (photo/video/document/record/audio-library) + templates, mobile + web, with 24h-window gating.
5. **Filters** — setter/closer chips, mobile + web.
6. **White-label logo** — upload UI + mobile rendering.

## Out of scope (YAGNI)

- Per-category quiet-hours schedules (one global window only).
- Full app theming/white-label beyond the logo.
- Comment→DM automation, message reactions, typing indicators.
