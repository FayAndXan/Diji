#!/bin/bash
# Bryan Multi-Tenant Cron Wrapper
# Runs a given cron script for ALL active users
# Usage: bryan-multi-tenant.sh <cron-type> 
# Example: bryan-multi-tenant.sh morning

CRON_TYPE="$1"
BRYAN_CONFIG=/root/.openclaw-companion/openclaw.json
BRYAN_STATE=/root/.openclaw-companion
BOT_TOKEN="${BOT_TOKEN:?BOT_TOKEN env var required}"

if [ -z "$CRON_TYPE" ]; then
  echo "Usage: bryan-multi-tenant.sh <morning|lunch|evening|weekly|monthly>"
  exit 1
fi

# Fetch all users from companion server
USERS=$(curl -s http://localhost:3950/api/internal/users 2>/dev/null)

if [ -z "$USERS" ] || [ "$USERS" = "[]" ]; then
  echo "[$(date)] [multi-tenant] No users found" >> /tmp/bryan-cron.log
  exit 0
fi

# Loop through each user
echo "$USERS" | python3 -c "
import json, sys, subprocess, os

users = json.load(sys.stdin)
cron_type = '$CRON_TYPE'

for user in users:
    uid = user['id']
    profile = user.get('healthProfile', {})
    tz = profile.get('timezone', 'UTC')
    
    # Determine how to reach this user
    chat_id = user.get('telegramChatId', '')
    channel_links = user.get('channelLinks', [])
    
    # Find the best channel to reach them
    target_channel = None
    target_id = None
    
    # Prefer Telegram (free, no rate limits)
    for link in channel_links:
        if link['channel'] == 'telegram':
            target_channel = 'telegram'
            target_id = link['peerId']
            break
    
    # Fallback to legacy telegram
    if not target_channel and chat_id:
        target_channel = 'telegram'
        target_id = chat_id
    
    # Try WhatsApp
    if not target_channel:
        for link in channel_links:
            if link['channel'] == 'whatsapp-cloud':
                target_channel = 'whatsapp-cloud'
                target_id = link['peerId']
                break
    
    # Try WeChat
    if not target_channel:
        for link in channel_links:
            if link['channel'] == 'openclaw-weixin':
                target_channel = 'openclaw-weixin'
                target_id = link['peerId']
                break
    
    if not target_channel or not target_id:
        print(f'[{uid}] No reachable channel, skipping')
        continue
    
    # Check dedup
    import urllib.request
    username = user.get('telegramUsername', uid)
    try:
        r = urllib.request.urlopen(f'http://localhost:3950/api/internal/trigger-status/{username}/{cron_type}', timeout=5)
        status = json.loads(r.read())
        if status.get('fired', False):
            print(f'[{uid}] {cron_type} already fired, skipping')
            continue
    except:
        pass
    
    # Get time in user's timezone
    import datetime
    try:
        from zoneinfo import ZoneInfo
        user_time = datetime.datetime.now(ZoneInfo(tz)).strftime('%I:%M %p %Z, %A %B %d')
    except:
        user_time = datetime.datetime.utcnow().strftime('%I:%M %p UTC, %A %B %d')
    
    # Load prompt template
    prompt_file = f'/usr/local/bin/bryan-prompts/bryan-{cron_type}.txt'
    if not os.path.exists(prompt_file):
        print(f'[{uid}] No prompt file for {cron_type}')
        continue
    
    with open(prompt_file) as f:
        prompt = f.read()
    
    prompt = prompt.replace('{{TIME}}', user_time).replace('{{HEALTH_USER}}', username)
    
    # Run via openclaw agent
    env = os.environ.copy()
    env['OPENCLAW_CONFIG_PATH'] = '$BRYAN_CONFIG'
    env['OPENCLAW_STATE_DIR'] = '$BRYAN_STATE'
    
    cmd = [
        'openclaw', 'agent',
        '--channel', target_channel,
        '--to', target_id,
        '-m', prompt
    ]
    
    print(f'[{uid}] Running {cron_type} on {target_channel}:{target_id}')
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, env=env)
        output = result.stdout.strip()
        if output and output not in ('HEARTBEAT_OK', 'SKIP', 'NO_REPLY'):
            print(f'[{uid}] Response: {output[:100]}...')
        else:
            print(f'[{uid}] Filtered: {output}')
    except Exception as e:
        print(f'[{uid}] Error: {e}')
"

echo "[$(date)] [multi-tenant] $CRON_TYPE complete" >> /tmp/bryan-cron.log
