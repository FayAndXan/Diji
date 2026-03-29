---
name: telegram-linker
description: "Links Telegram users to app accounts via deep link tokens"
metadata:
  {
    "openclaw":
      {
        "emoji": "🔗",
        "events": ["message:received"],
        "install": [{ "id": "managed", "kind": "managed", "label": "Diji managed hook" }],
      },
  }
---

# Telegram Linker

When a user sends `/start link_TOKEN` via Telegram, this hook links their Telegram chat ID to their app account.
