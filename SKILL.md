---
name: moji-chat-core-context
description: Single-source operating context for Moji Chat. Use when auditing, debugging, or patching message delivery, optimistic UI, voice memo, realtime, and thread workflows.
---

# Moji Chat Core Skill

## Skill Intent
This skill is a single-source operating brief for making safe, high-confidence changes in Moji Chat/CRM message stack without re-auditing the whole codebase each time.

Primary outcomes:
- Protect data integrity first.
- Keep optimistic UI and server truth convergent.
- Prioritize Voice Memo hardening before Thread Panel upgrades.
- Avoid regressions in direct/group chat, reactions, remove-for-me, unsend, edits, and read state.

---

## Working Rules (Project-Specific)

1. Do not run commit or push from agent tasks unless explicitly requested.
2. Priority order for implementation:
   - Voice memo reliability and delivery guarantees.
   - Then thread panel and thread realtime behavior.
3. Preserve optimistic UX but never at the expense of canonical data correctness.
4. Prefer small, isolated patches and verify behavior after each patch.
5. Keep existing API contracts and event names unless migration is deliberate and synchronized front/back.

---

## Repository Orientation

Top-level chat-relevant zones:
- `frontend/`
- `backend/`
- root smoke scripts and checklists (`PHASE2_SMOKE_CHECKLIST.md`, `scripts/`)

Critical files to load first for chat work:
- Frontend state and delivery:
  - `frontend/src/stores/useChatStore.ts`
  - `frontend/src/stores/useSocketStore.ts`
  - `frontend/src/hooks/useMessageInput.ts`
  - `frontend/src/lib/voiceMemoOutbox.ts`
  - `frontend/src/lib/voiceMemoDelivery.ts`
- Frontend UI surfaces:
  - `frontend/src/components/chat/ThreadPanel.tsx`
  - `frontend/src/components/chat/ChatWindowBody.tsx`
  - `frontend/src/components/chat/MessageItem.tsx`
  - `frontend/src/components/chat/message-item/MessageItemContextMenu.tsx`
  - `frontend/src/components/chat/ForwardMessageModal.tsx`
  - `frontend/src/components/chat/DirectMessageCard.tsx`
  - `frontend/src/components/chat/GroupChatCard.tsx`
- Backend message stack:
  - `backend/src/controllers/messageController.js`
  - `backend/src/controllers/conversationController.js` (read/seen/pagination)
  - `backend/src/utils/messageHelper.js`
  - `backend/src/models/Message.js`
  - `backend/src/models/Conversation.js`
  - `backend/src/routes/messageRoute.js`

---

## Product and UX Invariants

### Messaging invariants
- A sender action may appear optimistically first, but final state must reconcile with server canonical payload.
- Duplicate messages must not survive after reconciliation (temp id vs real id).
- Remove-for-me is user-scoped hide, not global delete.
- Unsend is global logical delete and should neutralize content/media/reactions/read-by/reply pointers.
- Edits must honor newer canonical events and avoid stale rollback.

### Group channel invariants
- Channel-specific unread must stay consistent with conversation unread.
- Active channel filtering must not leak messages from inactive channels in list views.
- Thread replies in group must remain in same channel as thread root.

### Voice memo invariants
- Data URL audio is temporary client payload only.
- Canonical sent message should reference uploaded URL and optional normalized audioMeta.
- Offline path must queue and retry without data loss.
- Retry/backoff must avoid duplicate sends and preserve clientMessageId idempotency.

---

## Frontend Architecture Notes

## 1) `useChatStore.ts` (core chat state machine)

Responsibilities:
- Conversation list cache and synchronization.
- Message buckets per conversation with pagination.
- Optimistic send for direct/group with temp ids.
- Outgoing queue and retry (`outgoingQueue`, `retryMessageDelivery`, `flushOutgoingQueue`).
- Mutation guards for react/unsend/edit.
- Thread unread tracking by key `conversationId:threadRootId`.

Key mechanics:
- Optimistic direct/group send creates temp message with delivery states (`sending`, `queued`, `failed`, `uploading`).
- Dedupe by `pendingOwnTempMessagesByConversation` descriptor matching.
- Queue item cap: `MAX_OUTGOING_QUEUE_ITEMS = 120`.
- `clientMessageId` is used as idempotency key on server.

High-value guardrails in file:
- Mutation lock/version maps prevent stale rollback races.
- Remove temp on success, reconcile real message into bucket.
- Preserve channel bucket semantics for group messages.

Known edge to remember:
- `consumeMatchingPendingOwnTempMessage` currently consumes first queue item when descriptor match fails due to `Math.max(0, matchedIndex)` pattern. This is a potential mismatch risk.

## 2) `useSocketStore.ts` (realtime event coordinator)

Responsibilities:
- Socket lifecycle, reconnect behavior, room joins.
- Realtime event dedupe + ordering via event metadata (feature-flag aware).
- Snapshot-delta resync queue during reconnect (`pendingRealtimeDeltas`).
- Mapping inbound events to `useChatStore` mutations.

Critical reliability primitives:
- `shouldProcessSocketEvent` checks `eventId`, scope sequence, and timestamp ordering.
- `applyRealtimeAwareEvent` optionally queues deltas during snapshot resync.

Important event coverage:
- `new-message`
- `message-reacted`
- `message-deleted`
- `message-hidden-for-user`
- `message-edited`
- `message-read`
- conversation lifecycle events

Current thread gap to track:
- `thread-reply-new` handler is currently a direct add path and should be aligned with metadata-aware dedupe/order flow.

## 3) `useMessageInput.ts` (main composer)

Responsibilities:
- Text input, draft persistence per conversation.
- Typing emits.
- Media and voice record lifecycle.
- Voice upload resolution and offline outbox fallback.

Voice specifics:
- Max recording duration: 180s.
- Data URL audio upload via `chatService.uploadAudio`.
- Offline fallback queues voice memo item with `buildVoiceMemoOutboxId()`.
- Flush triggers on login, online event, focus, and visibility recovery.

## 4) Voice outbox libs

`voiceMemoOutbox.ts`:
- IndexedDB storage with memory fallback.
- Payload validation and byte cap:
  - `MAX_VOICE_MEMO_OUTBOX_BYTES = 8MB`.
  - Max attempts: 8.
- Exponential backoff metadata stored per item.

`voiceMemoDelivery.ts`:
- Serialized flush guard: `isVoiceMemoOutboxFlushRunning`.
- Per-item flow: upload audio -> send direct/group via store -> remove item.
- Retry classification includes likely offline detection.
- Summary toasts for delivered/failed/exhausted.

## 5) `ThreadPanel.tsx`

Responsibilities:
- Fetch and paginate thread timeline.
- Render merged local + fetched thread messages by root.
- Send thread replies (text/audio).

Current behavior to note:
- Thread panel has independent recording/upload/send logic.
- Offline queue parity with main composer is not yet equivalent.

---

## Backend Architecture Notes

## 1) `messageController.js`

Main endpoints:
- `POST /messages/audio/upload`
- `POST /messages/direct`
- `POST /messages/group`
- `POST /messages/:messageId/react`
- `DELETE /messages/:messageId/undo`
- `DELETE /messages/:messageId/unsend`
- `DELETE /messages/:messageId/remove-for-me`
- `PUT /messages/:messageId/edit`
- `POST /messages/:messageId/read`
- `GET /messages/:messageId/thread`
- `POST /messages/:messageId/forward`
- `PUT /messages/:messageId/toggle-forward`

Core validations and helpers:
- ObjectId guard, membership checks, role checks.
- Reply/thread root validators ensure same conversation and same group channel when needed.
- Image/audio upload helpers with payload checks and Cloudinary upload.
- Conversation sync retry loop (`syncConversationAfterCreateMessage`) with optimistic concurrency by `__v`.

Idempotency:
- `clientMessageId` de-dupes sender replays in direct/group send.

Delete/edit behavior:
- Unsend normalizes deleted payload and emits canonical event.
- Remove-for-me adds user to `hiddenFor` and emits user-room update.
- Edit updates content/editedAt and syncs conversation preview if applicable.

Thread behavior:
- `getMessageThread` supports cursor pagination, hidden filtering, membership checks.

Forward behavior:
- Supports direct and group targets with partial success reporting.
- Enforces target validation and permission constraints.

## 2) `conversationController.js` (message retrieval + seen state)

Relevant responsibilities:
- `getMessages` with cursor pagination, hidden filtering, channel filtering.
- `markAsSeen` with atomic direct/group variants.
- Group channel unread normalization and conversion to total unread.

## 3) `messageHelper.js` (cross-cutting send side effects)

Responsibilities:
- Update conversation preview and unread counters after send.
- Emit `new-message` realtime payload including normalized conversation patch.
- Emit thread reply event when `threadRootId` exists.
- Invalidate conversation cache for participants.

## 4) Data models

`Message.js`:
- Contains `audioUrl`, `audioMeta`, `replyTo`, `threadRootId`, `clientMessageId`, `hiddenFor`, `isDeleted`.
- Unique index: `(conversationId, senderId, clientMessageId)` where `clientMessageId` is string.
- Post hooks adjust denormalized message counts and cleanup dependents.

`Conversation.js`:
- `lastMessage`, `lastMessageAt`, `unreadCounts`, `seenBy`.
- Group channel structure and per-user channel unread map.
- `directKey` unique partial index for direct conversation identity.

---

## Canonical Data Contracts

## Message object fields frequently relied on by UI
- `_id`
- `conversationId`
- `groupChannelId` (group only)
- `senderId`
- `content`
- `imgUrl`
- `audioUrl`
- `audioMeta { durationSeconds, mimeType, sizeBytes }`
- `replyTo`
- `threadRootId`
- `reactions`
- `isDeleted`
- `editedAt`
- `readBy`
- `hiddenFor`
- `createdAt`, `updatedAt`

## Conversation patch fields consumed by UI
- `_id`
- `lastMessage`
- `lastMessageAt`
- `unreadCounts`
- `seenBy`
- `group.channelUnreadCounts` (group)
- `group.activeChannelId` and channels metadata

---

## Realtime Event Matrix (Chat)

Expected producer -> consumer mapping:
- `new-message`
  - Producer: backend send pipeline
  - Consumer: `useSocketStore` -> `useChatStore.addMessage` + `updateConversation`
- `thread-reply-new`
  - Producer: backend helper when `threadRootId` exists
  - Consumer: thread view via main message bucket updates
- `message-reacted`
  - Producer: react endpoint
  - Consumer: message patch by id
- `message-deleted`
  - Producer: unsend endpoint
  - Consumer: message canonical deleted payload + conversation patch
- `message-hidden-for-user`
  - Producer: remove-for-me endpoint
  - Consumer: remove item from user bucket + optional conversation patch
- `message-edited`
  - Producer: edit endpoint
  - Consumer: content/editedAt patch + conversation patch
- `message-read` and `read-message`
  - Producer: message read and conversation seen endpoints
  - Consumer: readBy and conversation unread/seen updates

Dedupe/order requirement:
- All high-volume message events should carry socket event metadata and be routed through metadata-aware client path when possible.

---

## Known Risk Ledger (As of 2026-04-27)

### High
1. Forwarded voice memo can lose audio payload in backend forward paths.
2. Thread reply realtime path is not fully aligned with metadata-based dedupe/order.
3. Preview content fallback is not fully normalized for audio in all backend preview builders.

### Medium
1. ThreadPanel audio send does not yet mirror main composer offline outbox behavior.
2. Forward modal does not surface partial success details from backend response.
3. `updateConversation` path in store does not upsert when conversation is absent.

### Low
1. Pending temp message consume fallback may remove wrong entry if descriptor mismatch.
2. Route ordering in message routes can be tightened for future maintainability.

---

## Patch Priority Protocol

When asked to patch high-priority issues first, apply this order:
1. Data integrity in payload transfer (forward audio, canonical preview fields).
2. Realtime consistency and dedupe/order parity.
3. Voice memo resilience parity between composer surfaces.
4. UX visibility for partial failures and admin diagnostics.

For each patch:
- Keep API response backward compatible where possible.
- Update frontend and backend in one cycle when contract changes.
- Run focused smoke checks related to changed path.

---

## Smoke and Validation Playbook

Backend commands (`backend/package.json`):
- `npm run dev`
- `npm run db:health`
- `npm run test:message-actions-ci`
- `npm run test:message-hardening-smoke`
- `npm run test:join-link-concurrency`
- `npm run security:regression`

Frontend commands (`frontend/package.json`):
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run smoke:slow3g-chat`
- `npm run smoke:search-jump-refresh`
- `npm run smoke:chat-responsive`

Manual checklist reference:
- `PHASE2_SMOKE_CHECKLIST.md`

Recommended targeted checks after chat-core patches:
1. Send direct text/image/audio.
2. Send group text/image/audio in active channel.
3. Retry failed temp message and verify no duplicate.
4. Unsend and remove-for-me race with socket updates.
5. React toggle under rapid interaction.
6. Thread reply send + realtime reflection.
7. Reconnect and verify no duplicate/out-of-order thread updates.
8. Forward to mixed targets and verify partial failure reporting.

---

## Fast Re-Entry Workflow (Next Session)

1. Read this file first.
2. Load only these files next unless task scope requires more:
   - `frontend/src/stores/useChatStore.ts`
   - `frontend/src/stores/useSocketStore.ts`
   - `backend/src/controllers/messageController.js`
   - `backend/src/utils/messageHelper.js`
3. Confirm current priority lane:
   - Voice memo hardening, then thread panel.
4. Apply minimal patch and run focused smoke checks.
5. Report findings with severity and exact file/line references.

---

## What Not To Forget

- Preserve `clientMessageId` idempotency behavior end-to-end.
- Do not break `hiddenFor` semantics while fixing previews.
- Keep group channel constraints when validating reply/thread root.
- Keep optimistic rollback guarded by mutation version checks.
- Be careful with reconnect paths and queued realtime deltas.

---

## Current Desired Next Implementation Batch

If user says "continue patch now", start with:
1. Forward integrity patch:
   - Add `audioUrl` and `audioMeta` propagation in both direct and group forward paths.
2. Thread realtime consistency patch:
   - Add event metadata to `thread-reply-new` emit.
   - Route client handling via metadata-aware realtime apply path.

Then verify:
- Forwarded voice appears correctly in target chats.
- Thread reply event does not duplicate under reconnect or burst.

---

## Maintainer Notes

Keep this document updated whenever one of the following changes:
- Message schema fields.
- Conversation preview shaping rules.
- Realtime event names/payloads.
- Outbox retry policy.
- Priority order requested by project owner.
