# ARCHITECTURE.md — Diji Companion Template

## Directory Structure

```
.openclaw/
├── openclaw.json              # OpenClaw config (tools, channels, security)
├── exec-approvals.json        # Exec allowlist (paranoid mode)
├── workspace/                 # Auto-injected files + knowledge
│   ├── SOUL.md               # WHO the companion is (auto-injected)
│   ├── VOICE.md              # HOW they talk — dialogue examples (loaded by rule-injector)
│   ├── AGENTS.md             # Operating rules (auto-injected)
│   ├── IDENTITY.md           # Name, origin, creature type (auto-injected)
│   ├── TOOLS.md              # Available tools (auto-injected)
│   ├── HEARTBEAT.md          # Scheduled tasks (auto-injected)
│   ├── KNOWLEDGE.md          # Domain knowledge (loaded by rule-injector)
│   ├── ONBOARDING.md         # First-time user flow (loaded by rule-injector)
│   ├── TRACKER.md            # Progress tracking template
│   ├── [DOMAIN].md           # Additional knowledge files (SKINCARE.md, NUTRITION.md, etc)
│   └── skills/               # Skills with SKILL.md + optional scripts
│       └── example-skill/
│           ├── SKILL.md      # Skill instructions (auto-discovered by OpenClaw)
│           └── script.py     # Optional executable (called via companion-run wrapper)
└── extensions/                # Plugins — each does ONE thing
    ├── auth-gate/            # Blocks unauthorized users (zero LLM cost)
    ├── companion-auto-memory/ # Auto-saves user data after conversations
    ├── companion-mood-detector/ # Detects emotional tone, injects mood context
    ├── companion-schedule-learner/ # Learns user message patterns
    ├── search-enforcer/      # Forces web search for product recommendations
    └── rule-injector/        # Core: conditional knowledge + personality injection
```

## Design Principles

### 1. ONE EXTENSION = ONE JOB
Each extension hooks `before_prompt_build` and does exactly one thing:
- Detect a condition (selfie, frustration, product mention)
- Inject relevant context via `appendSystemContext`
- Never overlap with other extensions

### 2. KNOWLEDGE IN WORKSPACE ROOT
Domain knowledge lives as `.md` files in workspace root (not docs/, not nested).
OpenClaw auto-injects: SOUL.md, AGENTS.md, IDENTITY.md, TOOLS.md, HEARTBEAT.md, USER.md.
Rule-injector loads everything else conditionally based on topic.

### 3. SKILLS = INSTRUCTIONS + OPTIONAL CODE
Each skill has a SKILL.md with:
- `name` and `description` in YAML frontmatter (for auto-discovery)
- Step-by-step instructions the LLM follows
- Reference to executable if needed: `companion-run script.py args`

Skills WITHOUT code (like Bryan's): LLM uses native tools (image, web_search).
Skills WITH code (like Demi's face-analysis): script lives in skill directory.

### 4. VOICE FILE = PERSONALITY ANCHOR
VOICE.md (or SAMANTHA.md, DEMI-VOICE.md) is loaded by the rule-injector EVERY turn.
This prevents personality drift during long conversations.
Study a real character: analyze word count, openers, emotional range.

### 5. PARANOID EXEC MODE
- `exec.security = allowlist` in openclaw.json
- Wrapper script (companion-run) maps script names to paths
- Python3 not directly allowed — only the wrapper
- Update wrapper when adding new scripts (see SECURITY.md)

### 6. PER-USER DATA
User data stored in: `/data/users/{chatId}/`
- `profile.json` — face shape, skin type, preferences
- `products.json` — product shelf (tracked by product-tracker)
- `routine.json` — current routine (tracked by routine-tracker)
- `memory.md` — conversation memory (managed by auto-memory)

## Extension Manifest Format

```json
{
  "id": "extension-name",
  "name": "extension-name",
  "version": "0.1.0",
  "description": "What this extension does",
  "entry": "index.ts",
  "hooks": ["before_prompt_build"],
  "configSchema": {
    "type": "object",
    "properties": {
      "enabled": { "type": "boolean", "default": true }
    },
    "additionalProperties": false
  }
}
```

## Adding a New Companion

1. Copy this template
2. Write SOUL.md (who they are)
3. Write VOICE.md (how they talk — use real dialogue data)
4. Add domain knowledge as workspace root .md files
5. Create skills (SKILL.md + optional scripts)
6. Add domain-specific extensions (copy pattern from existing ones)
7. Configure openclaw.json (model, channels, security)
8. If scripts exist: create companion-run wrapper, update exec-approvals.json

## What NOT to Do

- NO docs/ directory — knowledge goes in workspace root
- NO scripts/ directory — scripts go inside skill directories
- NO monolith rule-injector — split behavior into separate extensions
- NO direct python3 exec — use the wrapper
- NO hardcoded user data — use per-user directory pattern
- NO training data as fact — always web_search for products/prices
