# UPSTREAM-FIXES.md — Fixes from Bryan that must be ported to Diji Template

Generated: 2026-04-05. Source: Diji-Bryan repo commits.

## 🔴 Critical (broken without these)

### 1. Remove `group:runtime` and `group:fs` from `tools.deny`
**Why:** OC's deny ALWAYS wins over alsoAllow. If these groups are in deny, exec/read/write are blocked regardless of agent-level config. Every companion needs these tools for internal API calls and file I/O.
**Where:** `docker/<companion>-openclaw.json` → `tools.deny`
**Bryan commit:** `3368b41`

### 2. Disable OC memory flush for multi-tenant
**Why:** OC's built-in memory flush writes to `workspace/memory/YYYY-MM-DD.md` which is shared across ALL users. In a multi-tenant setup (per-channel-peer sessions), User A's data leaks to User B.
**Where:** `docker/<companion>-openclaw.json` → `agents.defaults.compaction.memoryFlush.enabled: false`
**Bryan commit:** `5c523e6`

### 3. Per-user data volume
**Why:** Per-user files (MEMORY.md, USER.md, meals, health) live at `/root/.openclaw-companion/data/users/`. Without a volume, every `docker compose build` wipes all user data.
**Where:** `docker/docker-compose.yml` — add volume:
```yaml
volumes:
  - openclaw-user-data:/root/.openclaw-companion/data/users
# And in top-level volumes:
volumes:
  openclaw-user-data:
```
**Bryan commit:** `788024a`

### 4. Persist sessions volume
**Why:** Conversation transcripts at `/root/.openclaw-companion/agents/` must survive rebuilds.
**Where:** `docker/docker-compose.yml` — add volume:
```yaml
volumes:
  - openclaw-sessions:/root/.openclaw-companion/agents
```
**Bryan commit:** `7749aba`

## 🟡 Important (memory system)

### 5. companion-memory-flush extension
**Why:** Since OC's memory flush is disabled (#2), companions need a custom hook to persist per-user memories. This extension hooks `before_reset` and `before_compaction` to extract facts from the conversation transcript and write them to the correct per-user MEMORY.md.
**Also:** Auto-sets `onboardingComplete=true` when 5+ substantive messages + basic profile data exists.
**Where:** 
- `extensions/companion-memory-flush/index.js`
- `extensions/companion-memory-flush/openclaw.plugin.json`
- Register in `docker/<companion>-openclaw.json`:
  - `plugins.allow` array
  - `plugins.load.paths` array
  - `plugins.entries` object
**Bryan commits:** `dd8c78d`, `595a4b2`, `50b605c`, `c5d8f18`
**IMPORTANT:** Extensions must be in ALL THREE plugin config locations or they silently don't load.

### 6. Expanded auto-memory patterns
**Why:** Default 13 regex patterns miss most real conversation (meals, mood, sleep, exercise, health data). Expanded to 45+ patterns. Also handles apostrophe-free input (im, dont, cant) which is common in chat.
**Where:** `extensions/companion-auto-memory/index.js` → `MEMORY_PATTERNS`
**Bryan commit:** `aa4cbe8`

## 🟢 Nice-to-have

### 7. Rule-injector: tell companion to use exec for internal APIs
**Why:** OC v2026.2.22+ blocks web_fetch to private/internal IPs (SSRF guard). Companions must use `exec` + `curl` for Docker-internal API calls (companion-server, health API, etc). The rule-injector should explicitly state this.
**Bryan commit:** `11f3b11`

### 8. LESSONS.md
**Why:** Hard-learned deploy rules. Good reference for any companion developer.
**Bryan commit:** `f558157`

## OC Facts (learned the hard way)

- `tools.deny` ALWAYS wins over `tools.allow` / `tools.alsoAllow`
- `tools.profile: minimal` = only session_status
- `group:runtime` = exec, process. `group:fs` = read, write, edit, apply_patch
- Extensions need: `plugins.allow` + `plugins.load.paths` + `plugins.entries` (all three)
- `before_reset` hook receives full messages array. `before_compaction` only gets counts — read JSONL yourself.
- OC memory flush writes to shared workspace, not per-user dirs. Disable for multi-tenant.
- web_fetch blocks private IPs (172.x, 10.x, etc). Use exec+curl for internal APIs.
