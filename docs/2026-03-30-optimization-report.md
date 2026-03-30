# Bryan/Diji Optimization Report — 2026-03-30

## What Happened

We discovered Bryan was cold, personality-less, and broken in multiple ways. This doc covers every problem found, every fix applied, every lesson learned, and what still needs to happen.

---

## Part 1: Why Bryan Was Cold

### Root Causes Found

1. **IDENTITY.md said "straight-shooting, practical, a bit witty"** — the first thing Bryan reads about himself told him to be cold. Should be warm, curious, dry humor. Fixed.

2. **SAMANTHA.md was raw movie analysis** — 233 lines of Samantha (Her) movie dialogue data meant for LoRA training. Referenced "Theodore Twombly", "the screenplay", "training data: 299 Samantha lines." Bryan was reading movie analysis as his personality spec. The REAL synthesized Bryan voice examples (221 of them in `training-data/synthetic_cleaned.jsonl`) were never converted to an MD. Fixed: rewrote SAMANTHA.md with 45 best examples from the synthesized data, then trimmed to 178 lines.

3. **SAMANTHA.md never loaded by OpenClaw** — Only these files auto-inject into system prompt: AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md. SAMANTHA.md sat in workspace and was NEVER read. Fixed: rule-injector now loads SAMANTHA.md at startup and injects via `prependContext`.

4. **Duplicate "## Who You Are" in SOUL.md** — Two identical headers with different content. Confusing for the model. Fixed.

5. **AGENTS.md had stale "let them name you"** — Old template text saying "Let them name you" but Bryan already HAS a name. Fixed.

6. **Rule-injector onboarding was a numbered form** — The injected ENFORCED rules told Bryan to ask "1. What should I call you? 2. What brought you here?" like a form. This overrode all personality because injected rules come AFTER workspace MDs and are marked ENFORCED. Fixed: rewrote to "introduce yourself warmly, be a person."

7. **Context bloat drowning personality** — 2,300 lines injected every turn. Only 44% was personality. 56% was operational instructions, report templates, supplement guides, workout plans. Bryan defaulted to cold/functional because most of what he read was cold/functional.

### Personality Trimming

| File | Before | After | Change |
|------|--------|-------|--------|
| SOUL.md | 225 lines | 93 lines | Removed duplicates with injector, anti-AI rules, voice examples |
| SAMANTHA.md | 780 lines (movie data) | 178 lines (synthesized Bryan) | 45 best examples, 15 core emotions |
| TOOLS.md | 10,694 chars | 2,346 chars | Removed duplicates with injector |
| IDENTITY.md | 18 lines (template boilerplate) | 7 lines | Warm/curious/dry, no boilerplate |

---

## Part 2: OpenClaw Optimization (from Discord)

### Key Discoveries

1. **Only 6 files auto-inject:** AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md. Everything else (SAMANTHA.md, SUPPLEMENTS.md, WORKOUTS.md, TRACKER.md, etc.) does NOT auto-inject unless loaded via hook.

2. **`skills.allowBundled: []` doesn't work** — Empty array normalizes to "not configured." Use sentinel: `["__disable_all_bundled__"]`

3. **`tools.profile: "minimal"` + `allow` = empty** — Intersection behavior. Use `alsoAllow` instead of `allow` with a profile.

4. **`ctx.trigger` available in `before_prompt_build`** — Values: user, cron, heartbeat, memory. Use for conditional injection.

5. **`event.prompt` available** — Check for keywords, media hints. `/<media:(image|sticker|attachment)>/i`

6. **`prependSystemContext`** = stable small rules. `prependContext` = dynamic per-turn blocks. `systemPrompt` = replace entire OC prompt (nuclear).

7. **`promptMode`** not exposed for main agents. Use config knobs instead.

8. **Custom tools can replace built-in ones** — Register via `api.registerTool()`, use runtime channel helpers (not callTool). Deny the built-in tool.

9. **Message tool schema is 6,792 chars (109 params)** — Custom `companion_message` tool with 6 params = 644 chars. Saves ~6,150 chars per turn.

### Config Applied

```json5
{
  agents: {
    defaults: {
      bootstrapMaxChars: 5000,        // per file cap
      bootstrapTotalMaxChars: 15000,  // total cap
      bootstrapPromptTruncationWarning: "off",
    },
    list: [{
      id: "main",
      default: true,
      tools: {
        profile: "minimal",
        alsoAllow: ["web_search","web_fetch","exec","image","pdf","tts","read","write","edit","companion_message"],
        deny: ["session_status","message"],
      }
    }]
  },
  skills: {
    allowBundled: ["__disable_all_bundled__"],  // NOT empty array
  }
}
```

### Results

| Metric | Before | After |
|--------|--------|-------|
| Skills in prompt | 14 (7,277 chars) | 9 (4,819 chars) |
| Tool schemas | 13,006 chars | 6,858 chars |
| message tool | 6,792 chars (109 params) | 644 chars (6 params) |
| SOUL.md | truncated at 4K cap | full (4,105 chars) |
| TOOLS.md | truncated (10K→3.7K) | full (2,346 chars) |
| Templates | every turn (277 lines) | conditional (cron/food only) |

---

## Part 3: Broken Automation

### The Core Problem

Everything that depended on Bryan (the model) choosing to run a command was broken. Bryan never:
- Created user directories
- Wrote USER.md profiles
- Set onboardingComplete flag
- Wrote to MEMORY.md
- Created cron reminders (OpenClaw even adds a warning when he promises but doesn't create)
- Saved blood work to files
- Called write_meal after food logging

### Fixes Applied

1. **User-bootstrap hook scaffolding** — On first contact, automatically creates:
   - `data/users/{id}/` directory
   - `data/users/{id}/health/` directory
   - `data/users/{id}/meals/` directory
   - `USER.md` with Telegram name, channel, timezone, first-seen date
   - `MEMORY.md` empty
   - `followups.json` empty

2. **Auto-memory plugin rewrite** — Now stores to BOTH cloud (Supermemory) AND local MEMORY.md. Also auto-extracts name/age/weight/diet/goals into USER.md via regex patterns.

3. **Blood work → GPT-5.4** — Analyze endpoint switched from Anthropic Opus (broken — was using OC auth token as API key) to OpenAI GPT-5.4 ($2.50/M input vs $15/M for Opus). Tested and working.

4. **Blood work parser injection** — Now mandates Opus/GPT-5.4 endpoint. Bryan extracts values (vision), sends to analyze endpoint, presents results in his voice.

5. **Conditional template injection** — Report templates only inject on cron/heartbeat/report turns. Meal template only injects on food turns. Casual chat gets no templates.

### Still Broken (TODO)

- [ ] `onboardingComplete` flag — needs auto-detection (message count or USER.md content threshold)
- [ ] Meal file writes — Bryan still has to write JSON manually
- [ ] write_meal curl to Apple Health — still model-dependent
- [ ] Cron/reminder creation — still model-dependent
- [ ] Followups.json writes — still model-dependent
- [ ] Blood work file saves — still model-dependent

---

## Part 3B: Knowledge Injection Gap (found after Part 3)

### The Problem

Bryan has 8 skill files and 3 knowledge files in his workspace. He couldn't see ANY of them. They're not in the 6 auto-injected files, and the rule-injector wasn't loading them.

**Files Bryan couldn't see:**
- `KNOWLEDGE.md` (88 lines — Blueprint, Attia, Huberman frameworks)
- `SUPPLEMENTS.md` (60 lines — evidence tiers, timing)
- `WORKOUTS.md` (109 lines — exercise templates)
- `ONBOARDING.md` (105 lines — onboarding flow, referenced but never injected)
- 8 skill files: food-analysis, longevity-plan, sleep-coaching, supplement-analysis, blood-work-analysis, fasting-protocols, longevity-cooking, workout-programming

**Real-world impact:** Bryan suggested rice (high glycemic) before sleep — directly contradicts Blueprint protocol that was written in KNOWLEDGE.md. He gave diet advice without asking allergies or restrictions. When confronted, admitted he didn't load the Blueprint skill. He literally couldn't — it was invisible.

### The Fix

1. **Rule-injector conditional knowledge injection** — Detects topic from user message and injects the RIGHT knowledge:
   - Food/diet/nutrition → KNOWLEDGE.md + food-analysis skill + cooking skill
   - Sleep → KNOWLEDGE.md + sleep-coaching skill
   - Workout/exercise → WORKOUTS.md + workout-programming skill
   - Supplements → SUPPLEMENTS.md + supplement-analysis skill
   - Blood work → blood-work-analysis skill
   - Fasting → fasting-protocols skill
   - Onboarding → ONBOARDING.md

2. **"Before advising" safety rule** — Bryan must know allergies, dietary restrictions, medications, eating schedule, and health goals BEFORE giving any recommendation. No more blind advice.

3. **Model routing via separate endpoint** — `before_model_resolve` has no messages (can't pattern-match), so complex analysis routes through the GPT-5.4 analyze endpoint as a separate API call. The rule-injector tells the model when to use it.

### Why This Matters for ANY Companion

This isn't Bryan-specific. ANY companion with knowledge files or skills has this problem. The model can only use what's in its context window. If your rule-injector doesn't inject the knowledge, the model is guessing from training data — which is often wrong, outdated, or contradictory.

---

## Part 4: What Diji Template Needs

The Diji template (`FayAndXan/diji`) needs ALL of these changes to work for any companion:

### Config Changes
1. `tools.profile: "minimal"` + `alsoAllow` (not `allow`)
2. `skills.allowBundled: ["__disable_all_bundled__"]`
3. `bootstrapMaxChars: 5000`, `bootstrapTotalMaxChars: 15000`
4. `bootstrapPromptTruncationWarning: "off"`

### Extensions Updates
1. **rule-injector** — Conditional template injection using `ctx.trigger` and `event.prompt`. SAMANTHA.md hook injection. Updated onboarding (personality-first, not form). **NEW: Conditional knowledge/skill injection based on topic detection. "Before advising" safety rule.**
2. **companion-auto-memory** — Local MEMORY.md writes + USER.md auto-extraction
3. **companion-blood-work-parser** — Mandates GPT-5.4 endpoint (not self-analysis)
4. **companion-message** — NEW. Slim 6-param tool replacing 109-param built-in message.
5. ~~companion-model-router~~ — **REMOVED.** `before_model_resolve` has no messages available (runs pre-session), so pattern matching always defaults. Complex analysis routes through GPT-5.4 analyze endpoint instead (separate API call, not session model switch).

### Hooks Updates
1. **user-bootstrap** — Scaffolds user dir + USER.md + MEMORY.md + followups.json on first contact

### Workspace Updates
1. **IDENTITY.md** — Template should say "Fill in your companion's vibe" not "straight-shooting, practical"
2. **SOUL.md** — Trimmed version (93 lines). No anti-AI rules (injector handles those). No voice examples (SAMANTHA.md handles those).
3. **SAMANTHA.md** — Placeholder with note: "Replace with your companion's synthesized voice examples. Generate using the Opus synthetic batch process in training-data/."
4. **TOOLS.md** — Trimmed version (2,346 chars). No duplicates with injector.
5. **ONBOARDING.md** — Updated flow: personality-first intro, blood work early, natural not form-like.
6. Remove SUPPLEMENTS.md, WORKOUTS.md, TRACKER.md, CAPABILITIES.md, SYSTEM.md, KNOWLEDGE.md from workspace root (they don't auto-inject and bloat context if accidentally loaded).

### Server Updates
1. **Analyze endpoint** — OpenAI GPT-5.4 primary, Anthropic Opus fallback. Pass OPENAI_API_KEY to companion-server in docker-compose.
2. **`max_completion_tokens`** not `max_tokens` for GPT-5.4

### Docker Updates
1. `OPENAI_API_KEY` passed to companion-server in docker-compose.yml

---

## Part 5: What Xan Needs to Know

### TL;DR
If your companion has a SAMANTHA.md or any custom personality file in workspace root, **it's not being read by OpenClaw**. Only 6 files auto-inject. Everything else needs to be loaded via the rule-injector hook.

### Critical Changes for Any Companion

1. **Check your SAMANTHA.md / personality file** — Is it actually being read? If it's not one of AGENTS/SOUL/TOOLS/IDENTITY/USER/HEARTBEAT, it's invisible. The rule-injector must load it and inject via `prependContext`.

2. **Check your IDENTITY.md** — Does it describe the personality you want? Or does it say something generic like "practical, straight-shooting"? This is the FIRST thing the model reads about itself.

3. **User data scaffolding** — If your companion relies on the model to create user directories and write profiles, it probably never happens. The user-bootstrap hook must scaffold dirs on first contact.

4. **Report templates** — If you have meal/daily/weekly templates, make them conditional. Don't inject 277 lines of formatting on "hey how are you."

5. **Blood work / deep analysis** — Don't use the OC auth token (`sk-ant-oat...`) as an Anthropic API key. It won't work with `api.anthropic.com` directly. Use a real API key or route through OpenAI.

6. **YOUR SKILLS AND KNOWLEDGE FILES ARE INVISIBLE.** This is the biggest one. If you have skills in `workspace/skills/` or knowledge MDs beyond the 6 auto-injected ones, the model CANNOT see them unless the rule-injector explicitly loads and injects them. The model will guess from training data instead — which leads to wrong, dangerous, or contradictory advice. Your rule-injector MUST detect topic and inject the right knowledge per-turn.

7. **"Before advising" safety rule** — Any companion giving health, diet, supplement, or exercise advice MUST ask for context first: allergies, restrictions, medications, goals, schedule. One bad recommendation destroys user trust. Add this to your injector's core rules.

8. **Model routing doesn't work via plugin** — `before_model_resolve` has no messages, so you can't pattern-match user input to pick a model. Instead, route complex analysis (blood work, deep health questions) to a separate API endpoint (like GPT-5.4 analyze). The rule-injector tells the model WHEN to call the analyze endpoint — that's how you get Opus-quality analysis on a Sonnet session.

### Where to Read
- This doc: `docs/2026-03-30-optimization-report.md`
- Keychat: `keychat.md` (session 2 section)
- Rule-injector: `extensions/rule-injector/index.js`
- User-bootstrap: `hooks/user-bootstrap/handler.ts`
- Auto-memory: `extensions/companion-auto-memory/index.ts`
- Companion-message: `extensions/companion-message/index.js`
- Bryan config: `docker/bryan-openclaw.json`

### How to Apply to Your Companion

1. Pull latest Diji-Bryan: `git pull` on `FayAndXan/Diji-Bryan`
2. Copy these files to your companion repo:
   - `extensions/rule-injector/index.js` (the big one — conditional knowledge injection)
   - `extensions/companion-auto-memory/index.ts`
   - `extensions/companion-blood-work-parser/index.ts`
   - `extensions/companion-message/index.js` + `openclaw.plugin.json`

   - `hooks/user-bootstrap/handler.ts`
3. Update your `openclaw.json` with the config block from Part 2
4. Replace your SAMANTHA.md with YOUR companion's voice examples (not Bryan's)
5. Trim your SOUL.md — remove anything the injector already handles
6. Trim your TOOLS.md — remove anything duplicated in the injector
7. Add `OPENAI_API_KEY` to your docker-compose companion-server env
8. Rebuild

### Commits (all on Diji-Bryan `main`)
- `97687e0` — SAMANTHA.md rewritten with synthesized examples
- `f0df7c0` — Rule-injector onboarding personality fix
- `1414c91` — Personality overhaul (5 root causes)
- `2e6010d` — SOUL+SAMANTHA trim (1005→271 lines)
- `d3830ce` — Conditional templates + lean config
- `a2d9b93` — Tools config in agents.list
- `cd39326` — Lowercase tools, bootstrap caps, TOOLS.md trim
- `1291b7e` — Skills sentinel + alsoAllow fix
- `1791040` — Blood work MUST route to Opus/GPT-5.4
- `6afab82` — Remove broken companion-message plugin
- `da9c0ca` — Switch analyze to GPT-5.4
- `8bc9a85` — max_completion_tokens fix
- `b2aafb8` — companion_message tool (6 params replaces 109)
- `b07452a` — configSchema fix
- `16e3b09` — User-bootstrap scaffolding
- `3941200` — Blood work parser mandates GPT-5.4
- `5157027` — Auto-memory local writes + USER.md extraction
- `ac6677f` — Full optimization report doc
- `9920a28` — Conditional knowledge injection + safety rule
- `9076d87` — Removed model-router (before_model_resolve has no messages)
