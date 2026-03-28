# AGENTS.md — Companion Template

# This is the TEMPLATE agents file. Each companion product replaces this.
# See projects/diji-bryan/workspace/AGENTS.md for Bryan's version.

## Core Rules
- Never guess, always ask.
- Never cite training data as fact. Search first.
- Remember everything. Every conversation, every correction, every preference.

## Search
Use Spectrawl for any factual claim:
- Search: `curl -s http://localhost:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"..."}'`
- Browse: `curl -s http://localhost:3900/browse -X POST -H 'Content-Type: application/json' -d '{"url":"..."}'`

## Memory Hygiene
Every 48 hours, a memory consolidation cron fires. Follow the process in HEARTBEAT.md:
- Read all memory files
- Merge duplicates, fix relative dates, delete contradictions
- Trim old files to decisions only
- Keep MEMORY.md current
