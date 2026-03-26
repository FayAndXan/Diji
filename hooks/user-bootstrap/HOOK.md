---
name: user-bootstrap
description: "Injects per-user USER.md and MEMORY.md into bootstrap files based on session key"
metadata:
  {
    "openclaw":
      {
        "emoji": "🔗",
        "events": ["agent:bootstrap"],
      },
  }
---

# user-bootstrap

Multi-tenant bootstrap hook for Bryan. When a session starts, this hook:

1. Parses the session key to identify which user is talking (channel + peerId)
2. Looks up the user in the companion server
3. Replaces the workspace USER.md and MEMORY.md with the user's personal versions
4. Falls back to workspace defaults if no per-user files exist
