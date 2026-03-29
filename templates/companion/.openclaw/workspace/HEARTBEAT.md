# HEARTBEAT.md

## Daily Memory Audit (every 48h at 06:10 UTC)
When this heartbeat fires with the memory consolidation prompt:

### Phase 1: Orientation
Read all memory files. Map what exists.

### Phase 2: Gather Signal
Check recent conversations for: corrections, key decisions, recurring patterns, new preferences.

### Phase 3: Consolidation
- Merge duplicates
- Convert relative dates to absolute ("yesterday" → actual date)
- Delete contradicted facts (newer correction wins)
- Remove stale entries (debugging notes, temporary state, resolved issues)
- Keep: decisions, outcomes, corrections, user preferences, health data

### Phase 4: Prune & Index
- Each daily file: max 2K chars. Decisions and outcomes only.
- Files older than 7 days: trim aggressively.
- MEMORY.md: keep current, remove stale project references.
- Report: "Consolidated X files. Pruned Y entries. N remain."

If nothing to consolidate, reply: "Memory clean. No action needed."
