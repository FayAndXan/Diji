# telegram-linker

Links Telegram users to their app accounts via deep link tokens.

## Events
- `message:received`

## What it does
When a user sends `/start link_TOKEN` via Telegram, this hook:
1. Extracts the link token
2. Calls companion-server to link the Telegram chat ID to the app user
3. Sends a welcome message via Telegram API
