# Diji Platform Audit — 2026-03-27
## Original Bryan vs Diji-Bryan vs Diji Template

---

## 1. EXTENSIONS (plugins)

### Original Bryan (12 plugins):
| Plugin | In Diji? | In Diji-Bryan? | Status |
|--------|----------|----------------|--------|
| auth-gate | ✅ | — | Identical except "bryan 🧬" → generic msg |
| rule-injector | ✅ | — | Identical (135 lines each) |
| companion-auto-memory | ❌ | ❌ | NOT PORTED — stores facts to pyx-memory |
| companion-blood-work-parser | ❌ | ❌ | NOT PORTED — detects blood work images/PDFs |
| companion-food | ❌ | ❌ | NOT PORTED — food photo analysis |
| companion-interaction-checker | ❌ | ❌ | NOT PORTED — supplement interaction warnings |
| companion-model-router | ❌ | ❌ | NOT PORTED — Opus/Sonnet/Haiku routing |
| companion-mood-detector | ❌ | ❌ | NOT PORTED — emotional tone analysis |
| companion-nutrient-calculator | ❌ | ❌ | NOT PORTED — USDA FoodData API |
| companion-schedule-learner | ❌ | ❌ | NOT PORTED — learns user schedule patterns |
| companion-search-enforcer | ❌ | ❌ | NOT PORTED — forces search for health claims |
| openclaw-weixin | ❌ | ❌ | NOT PORTED — WeChat channel plugin |

### Diji-only (not in Bryan):
| Plugin | Notes |
|--------|-------|
| memory-provider | Supermemory integration. New for Diji. Not wired into live Bryan. |

### Summary: 9 health plugins + WeChat NOT ported. Only auth-gate, rule-injector, memory-provider exist in Diji.

### ⚠️ CRITICAL: When porting, use FIXED versions from live Bryan (2026-03-27)
All 8 companion-* plugins had a bug: they scanned conversation HISTORY for keywords instead of only the current message. This caused them to fire on every heartbeat/cron turn, injecting instructions every 3 hours even when the user said nothing. Fixed 2026-03-27 in live Bryan. Also: auto-memory was storing system prompts as "personal-info" to pyx-memory (50+ junk entries). Fixed with content filter.
Port from: `/root/.openclaw-companion/extensions/` (the fixed versions)

---

## 2. WORKSPACE FILES

### Original Bryan (9 files):
| File | In Diji-Bryan? | In Diji Template? | Status |
|------|---------------|-------------------|--------|
| SOUL.md (2976B) | ✅ (9257B, expanded) | ✅ (888B, generic) | Different versions |
| AGENTS.md (5409B) | ✅ (4839B, different) | ❌ | Missing from template |
| TOOLS.md (1686B) | ✅ (12369B, expanded) | ❌ | Missing from template |
| KNOWLEDGE.md (4260B) | ❌ | ❌ | NOT PORTED |
| ONBOARDING.md (2264B) | ❌ | ❌ | NOT PORTED |
| SUPPLEMENTS.md (4017B) | ❌ | ❌ | NOT PORTED |
| SYSTEM.md (2168B) | ❌ | ❌ | NOT PORTED |
| TRACKER.md (3771B) | ❌ | ❌ | NOT PORTED |
| WORKOUTS.md (3960B) | ❌ | ❌ | NOT PORTED |

### Diji-Bryan only (not in original):
| File | Notes |
|------|-------|
| HEARTBEAT.md (646B) | New |
| IDENTITY.md (569B) | New |

### Summary: 6 workspace files NOT ported to Diji-Bryan. Diji template only has SOUL.md.

---

## 3. HOOKS

| Hook | Original | Diji | Diff |
|------|----------|------|------|
| user-bootstrap | ✅ (154 lines) | ✅ (154 lines) | 4 lines differ: env vars, generic msg, no hardcoded paths |

### Summary: ✅ Hook is ported and properly generalized.

---

## 4. RULE INJECTOR

| Component | Original | Diji | Diff |
|-----------|----------|------|------|
| index.js | 135 lines | 135 lines | Identical |
| templates.js | 277 lines | 277 lines | Identical |
| user-resolver.js | 242 lines | 242 lines | Identical |

### Summary: ✅ Rule injector fully ported.

---

## 5. OPENCLAW.JSON CONFIG

### Original Bryan has, Diji template MISSING:

| Config | Value | In Diji? |
|--------|-------|----------|
| session.dmScope | "per-peer" | ❌ NO OPENCLAW.JSON TEMPLATE EXISTS |
| session.reset | daily at 4am | ❌ |
| session.identityLinks | telegram + whatsapp cross-link | ❌ (needs to be dynamic per user) |
| heartbeat | 3h, 2239-char prompt | ❌ |
| model.primary | anthropic/claude-sonnet-4-6 | ❌ |
| models cache config | cacheRetention: short | ❌ |
| compaction | safeguard | ❌ |
| contextPruning | cache-ttl, 1h | ❌ |
| commands | native: auto, restart: true | ❌ |
| gateway config | port, health check, restart limits | ❌ |
| channel configs | telegram, whatsapp, weixin with dmPolicy | ❌ |
| plugin allow list | all 12 plugins | ❌ |
| plugin load paths | all extension dirs | ❌ |

### Summary: ❌ NO openclaw.json template exists for Diji. This is critical — without it, instances have no config.

---

## 6. CRON SCRIPTS

| Script | Original Bryan | Diji-Bryan repo | Diji platform |
|--------|---------------|-----------------|---------------|
| bryan-morning.sh | ✅ /usr/local/bin/ | ✅ health/crons/ | ❌ |
| bryan-lunch.sh | ✅ | ✅ | ❌ |
| bryan-evening.sh | ✅ | ✅ | ❌ |
| bryan-daily-report.sh | ✅ | ✅ | ❌ |
| bryan-weekly.sh | ✅ | ✅ | ❌ |
| bryan-monthly.sh | ✅ | ✅ | ❌ |
| bryan-cron-run.sh | ✅ | ✅ | ❌ |
| bryan-cron-wrapper.sh | ✅ | ✅ | ❌ |
| bryan-env.sh | ✅ | ✅ | ❌ |
| bryan-multi-tenant.sh | ✅ | ✅ | ❌ |
| All prompt .txt files | ✅ | ✅ (identical) | ❌ |
| instance-start.sh | — | — | ✅ |
| multi-tenant-cron.sh | — | — | ✅ |

### Summary: Cron scripts exist in Diji-Bryan repo but NOT in Diji platform docker/compose. Dockerfile doesn't copy them. Prompts are identical.

---

## 7. HEALTH PIPELINE

| Component | Original | Diji-Bryan | Diji platform |
|-----------|----------|------------|---------------|
| build-health-tree.py | ✅ (on server) | ✅ (335 lines) | ❌ |
| Sleep classifier | ✅ (on server) | ? | ❌ |
| JSON→MD hourly cron | ✅ running | Not wired | ❌ |

### Summary: Health pipeline script exists in Diji-Bryan but is NOT wired into docker/cron.

---

## 8. COMPANION SERVER

| | Original | Diji |
|-|----------|------|
| Lines | 1210 | 1210 |
| Content | Identical | Identical |
| Running | systemd service | Docker compose service |

### Summary: ✅ Server is ported. Same code.

---

## 9. DOCKER/INFRASTRUCTURE

### Dockerfile issues:
- Only creates dirs for auth-gate, rule-injector, user-bootstrap
- Does NOT create dirs for the 9 missing plugins
- Does NOT copy openclaw.json (none exists)
- Does NOT copy cron scripts or prompts
- Does NOT install health pipeline (build-health-tree.py, sleep classifier)
- Does NOT install companion-specific workspace files (only template)

### Docker Compose issues:
- No volume for per-user data persistence across restarts
- openclaw-data volume is shared across all replicas (conflict!)
- No Supermemory API key in env
- No health pipeline service/cron
- No cloudflared/tunnel service
- No nginx service (nginx config exists but isn't in compose)

---

## 10. SYSTEMD SERVICES (Original Bryan)

| Service | In Diji Docker? |
|---------|-----------------|
| openclaw-bryan.service | ✅ (replaced by container) |
| companion-server.service | ✅ (in compose) |
| cloudflared.service | ❌ NOT IN COMPOSE |

---

## FULL GAP SUMMARY

### Critical (blocks deployment):
1. ❌ No openclaw.json template — instances can't configure
2. ❌ 9 health plugins not ported to Diji
3. ❌ 6 workspace files missing from Diji-Bryan
4. ❌ No heartbeat config
5. ❌ Dockerfile doesn't wire plugins, crons, health pipeline
6. ❌ Docker volumes will conflict across replicas

### Important (blocks feature parity):
7. ❌ WeChat plugin not ported
8. ❌ Health pipeline not dockerized
9. ❌ Cron scripts not in docker image
10. ❌ No nginx in compose (router config exists)
11. ❌ No cloudflared/tunnel in compose
12. ❌ auto-memory plugin uses pyx-memory, needs Supermemory swap
13. ❌ Identity links need to be dynamic (from companion server), not static

### Working correctly:
- ✅ Rule injector (identical)
- ✅ User-bootstrap hook (generalized)
- ✅ Auth-gate (generalized)
- ✅ Memory-provider module (new, Supermemory)
- ✅ Companion server (identical)
- ✅ Router + nginx config (exist)
- ✅ Multi-tenant cron wrapper (exists)
- ✅ Cron prompts (identical in Diji-Bryan repo)
- ✅ build-health-tree.py (in Diji-Bryan repo)
