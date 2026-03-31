# Creating a New Diji Companion

## Step 1: Copy the template
```bash
cp -r templates/companion my-companion
```

## Step 2: Define personality
Edit `my-companion/.openclaw/workspace/SOUL.md`:
- Name, voice, personality traits
- Communication style (casual, formal, playful)
- Domain expertise (beauty, health, fitness, etc)
- Anti-AI writing rules are already included in the template

Edit `my-companion/.openclaw/workspace/AGENTS.md`:
- Operating rules specific to your companion
- What it should/shouldn't do

## Step 3: Add domain knowledge
Create `my-companion/.openclaw/workspace/docs/` with your domain docs:
- Skincare docs, health protocols, fitness plans, etc
- Rule-injector loads these and injects based on topic detection
- Keep each doc under 10KB for fast injection

## Step 4: Configure OpenClaw
Copy `templates/openclaw.json` and update:
- `channels.telegram.accounts[0].botToken` — your Telegram bot token
- `channels.telegram.webhookUrl` — `https://YOURNAME.dijicomp.com/webhook/telegram`
- `channels.telegram.webhookPort` — unique port (check existing: Demi=18814, Bryan=18810)
- `agents.defaults.model` — start with `anthropic/claude-sonnet-4-6`

## Step 5: Set up infrastructure
1. **DNS**: Add CNAME `YOURNAME.dijicomp.com` pointing to Cloudflare tunnel
2. **Tunnel route**: Add route in tunnel config → `http://localhost:YOUR_PORT`
3. **Router registration**: `curl -X POST http://localhost:4000/register -d '{"companion":"YOURNAME","id":"YOURNAME-1","host":"127.0.0.1","port":YOUR_PORT}'`
4. **Companion server**: Register companion type in scheduled check-in prompts

## Step 6: Deploy
### Systemd (single instance):
```bash
cat > /etc/systemd/system/openclaw-YOURNAME.service << 'SVC'
[Unit]
Description=YOURNAME Companion
After=network.target
[Service]
Type=simple
ExecStart=/usr/bin/openclaw gateway run --allow-unconfigured
Environment=OPENCLAW_CONFIG_PATH=/path/to/openclaw.json
Environment=OPENCLAW_STATE_DIR=/path/to/state/
Restart=always
[Install]
WantedBy=multi-user.target
SVC
systemctl daemon-reload && systemctl enable --now openclaw-YOURNAME
```

### Docker (scalable):
See `docker/docker-compose.yml`. Update env vars and ports.

## Step 7: Verify
1. Message the bot on Telegram
2. Check webhook: `curl https://api.telegram.org/botTOKEN/getWebhookInfo`
3. Check router: `curl https://gateway.dijicomp.com/stats`
4. Check logs: `journalctl -u openclaw-YOURNAME -f`
