# Diji Router v2

Companion-aware webhook router. Routes traffic based on hostname.

## How It Works
- `demi.dijicomp.com` → router identifies as "demi" companion → forwards to Demi instance pool
- `bryan.dijicomp.com` → router identifies as "bryan" → forwards to Bryan instance pool
- `gateway.dijicomp.com` → admin (stats, registration)

## Endpoints
- `GET /health` — health check
- `GET /stats` — all companions, instances, user counts
- `POST /register` — register instance: `{"companion":"demi","id":"demi-1","host":"127.0.0.1","port":18814}`
- `POST /deregister` — remove instance: `{"companion":"demi","id":"demi-1"}`

## Redis Keys
- `diji:{companion}:instances` — set of instance IDs
- `diji:{companion}:instance:{id}` — hash: host, port, userCount
- `diji:{companion}:user:{channel}:{userId}` — assigned instance ID

## Adding a New Companion
1. Add hostname mapping in `COMPANION_MAP` in `gateway/router/index.js`
2. Add DNS CNAME: `newcomp.dijicomp.com` → tunnel
3. Add tunnel route: `newcomp.dijicomp.com` → `http://localhost:4000`
4. Register instance: `curl -X POST localhost:4000/register -d '...'`

## Config
- `ROUTER_PORT` — default 4000
- `REDIS_URL` — default redis://localhost:6379
- `MAX_USERS_PER_INSTANCE` — default 500
