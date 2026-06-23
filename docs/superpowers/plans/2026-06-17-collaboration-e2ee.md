# Collaboration E2EE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents are not used because the repository instructions only allow them when explicitly authorized.

**Goal:** Add passphrase-based E2EE for relay document updates so team-owned relays cannot read collaborative document contents.

**Architecture:** Extend shared collaboration contracts with non-secret encryption metadata and Web Crypto helpers. Replace the default y-websocket document sync path with an encrypted websocket provider when a team manifest enables shared-key encryption, while keeping awareness and auth behavior compatible with the existing relay. Add an opaque encrypted room mode to the TypeScript relay. Encrypted v1 document frames carry whole-document snapshots because the editor stores the design file as one `documentJson` value.

**Tech Stack:** TypeScript, React, Vite, Yjs, Web Crypto, ws, Vitest, Playwright CLI.

## Global Constraints

- The public web app remains static-hostable.
- The relay remains team-owned and self-hosted.
- Passphrases and derived keys are runtime-only and are never exported in team manifests.
- Awareness and presence remain plaintext metadata in this v1.
- Browser debugging and rendered-route verification use Playwright CLI.
- Subagents are not used unless explicitly authorized by the user.

---

### Task 1: Manifest Encryption Metadata And Crypto Helpers

**Files:**
- Modify: `packages/collaboration/src/team-manifest.ts`
- Modify: `packages/collaboration/src/team-manifest.test.ts`
- Create: `packages/collaboration/src/e2ee.ts`
- Create: `packages/collaboration/src/e2ee.test.ts`
- Modify: `packages/collaboration/src/index.ts`

**Interfaces:**
- Produces: `TeamEncryptionConfig`
- Produces: `createSharedKeyEncryptionConfig(input?: { salt?: string; iterations?: number }): TeamEncryptionConfig`
- Produces: `deriveSharedKey(passphrase: string, config: Extract<TeamEncryptionConfig, { mode: "shared-key" }>): Promise<CryptoKey>`
- Produces: `encryptYjsUpdate(update: Uint8Array, key: CryptoKey, crypto?: Crypto): Promise<EncryptedYjsUpdate>`
- Produces: `decryptYjsUpdate(encrypted: EncryptedYjsUpdate, key: CryptoKey, crypto?: Crypto): Promise<Uint8Array>`

- [x] **Step 1: Write failing manifest tests**

Add tests that create a shared-key manifest, preserve only non-secret encryption metadata, parse legacy manifests without encryption, and strip `passphrase`, `encryptionKey`, and `derivedKey` aliases.

- [x] **Step 2: Verify manifest RED**

Run: `pnpm --filter @layo/collaboration test -- src/team-manifest.test.ts`
Expected: FAIL because encryption metadata helpers and redaction do not exist yet.

- [x] **Step 3: Implement manifest metadata**

Add `TeamEncryptionConfig`, schema validation, create input support, legacy defaulting, and plaintext key redaction.

- [x] **Step 4: Verify manifest GREEN**

Run: `pnpm --filter @layo/collaboration test -- src/team-manifest.test.ts`
Expected: PASS.

- [x] **Step 5: Write failing crypto tests**

Cover AES-GCM round-trip, wrong passphrase rejection, unique IVs, and empty passphrase rejection.

- [x] **Step 6: Verify crypto RED**

Run: `pnpm --filter @layo/collaboration test -- src/e2ee.test.ts`
Expected: FAIL because `src/e2ee.ts` does not exist yet.

- [x] **Step 7: Implement crypto helpers**

Use Web Crypto PBKDF2-SHA-256 and AES-GCM. Encode salt and IV as base64url strings.

- [x] **Step 8: Verify crypto GREEN**

Run: `pnpm --filter @layo/collaboration test -- src/e2ee.test.ts`
Expected: PASS.

### Task 2: Encrypted Relay Room Mode

**Files:**
- Modify: `apps/collab-relay/src/index.ts`
- Modify: `apps/collab-relay/src/index.test.ts`

**Interfaces:**
- Consumes: websocket query parameter `e2ee=true`
- Produces: relay handling for `messageEncryptedSync = 10` and `messageEncryptedSyncQuery = 11`

- [x] **Step 1: Write failing relay tests**

Add tests that encrypted rooms broadcast opaque encrypted frames without mutating a relay `Y.Doc`, broadcast encrypted query frames to peers, reject mixed encrypted/plain connections in the same room, and keep viewer sync restrictions.

- [x] **Step 2: Verify relay RED**

Run: `pnpm --filter @layo/collab-relay test -- src/index.test.ts`
Expected: FAIL because encrypted room mode does not exist.

- [x] **Step 3: Implement relay mode**

Track each room as `mode: "plain" | "encrypted"`. Plain rooms keep current Yjs sync. Encrypted rooms skip `sendSyncStep1`, skip relay `Y.Doc` mutation, and only broadcast encrypted document/query frames plus awareness frames.

- [x] **Step 4: Verify relay GREEN**

Run: `pnpm --filter @layo/collab-relay test -- src/index.test.ts`
Expected: PASS.

### Task 3: Web Encrypted Provider

**Files:**
- Create: `apps/web/src/collaboration/encrypted-provider.ts`
- Create: `apps/web/src/collaboration/encrypted-provider.test.ts`
- Modify: `apps/web/src/collaboration/collab-session.ts`
- Modify: `apps/web/src/collaboration/collab-session.test.ts`

**Interfaces:**
- Consumes: `deriveSharedKey`, `encryptYjsUpdate`, `decryptYjsUpdate`
- Produces: `createEncryptedProvider(input: CollaborationProviderInput & { passphrase: string; encryption: SharedKeyEncryptionConfig }): CollaborationProvider`
- Extends: `CreateCollabDocumentSessionInput.encryptionPassphrase?: string`

- [x] **Step 1: Write failing provider tests**

Cover websocket URL includes `e2ee=true`, encrypted document frames do not contain plaintext document text, incoming encrypted frames apply to the local `Y.Doc`, query frames trigger encrypted snapshot responses, competing local seed documents are replaced by encrypted snapshots, and wrong passphrase reports `error`.

- [x] **Step 2: Verify provider RED**

Run: `pnpm --filter @layo/web test -- src/collaboration/encrypted-provider.test.ts src/collaboration/collab-session.test.ts`
Expected: FAIL because encrypted provider/session wiring does not exist.

- [x] **Step 3: Implement provider**

Implement binary frame encode/decode with `DataView` or small byte helpers, use native `WebSocket`, keep awareness through `Awareness`, send encrypted document snapshots for editor document changes, and ignore document sync for viewer awareness-only sessions.

- [x] **Step 4: Wire session**

When `team.encryption.mode === "shared-key"`, require `encryptionPassphrase` and create the encrypted provider instead of `WebsocketProvider`.

- [x] **Step 5: Verify provider GREEN**

Run: `pnpm --filter @layo/web test -- src/collaboration/encrypted-provider.test.ts src/collaboration/collab-session.test.ts`
Expected: PASS.

### Task 4: Team UI And E2E

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/e2e/collaboration.spec.ts`
- Modify: `README.md`
- Modify: `docs/deployment/collaboration.md`

**Interfaces:**
- Consumes: `createSharedKeyEncryptionConfig`
- Consumes: `CreateCollabDocumentSessionInput.encryptionPassphrase`

- [x] **Step 1: Write failing UI/e2e assertions**

Add Playwright steps that enable E2EE, enter the same passphrase in two browser contexts, sync a document edit, and assert the downloaded manifest does not contain the passphrase.

- [x] **Step 2: Verify UI/e2e RED**

Run: `pnpm test:e2e:collab`
Expected: FAIL because UI controls and provider wiring are incomplete.

- [x] **Step 3: Implement UI controls**

Add E2EE toggle, passphrase input, encrypted relay creation, encrypted manifest import activation, and status feedback for missing passphrase.

- [x] **Step 4: Update docs**

Document that document updates are encrypted through the relay, presence remains plaintext, passphrases are runtime-only, and the relay must still be team-owned.

- [x] **Step 5: Verify all checks**

Run:
- `pnpm --filter @layo/collaboration test -- src/team-manifest.test.ts src/e2ee.test.ts`
- `pnpm --filter @layo/collab-relay test -- src/index.test.ts`
- `pnpm --filter @layo/web test -- src/collaboration/encrypted-provider.test.ts src/collaboration/collab-session.test.ts`
- `pnpm test`
- `pnpm typecheck`
- `pnpm --filter @layo/web build`
- `pnpm test:e2e:collab`
- `git diff --check`

Expected: all pass.

### Self-Review

- Spec coverage: Covers manifest metadata, runtime-only passphrase, relay opaque mode, encrypted provider, UI, docs, and Playwright verification.
- Placeholder scan: No TBD/TODO placeholders.
- Type consistency: `TeamEncryptionConfig`, shared-key config, `encryptionPassphrase`, and encrypted frame names are consistent across tasks.
