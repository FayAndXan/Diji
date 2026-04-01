# Security: Exec Allowlist (Paranoid Mode)

## How it works
Companions can ONLY run scripts through a wrapper binary (`demi-run` / `bryan-run`).
The wrapper has a hardcoded ALLOWED list of script filenames.
Python3 itself is NOT directly allowed — only the wrapper is.

## ⚠️ WHEN YOU ADD A NEW SCRIPT:
1. Add the script `.py` file to `workspace/scripts/`
2. **Update the wrapper** (`/usr/local/bin/demi-run` or `/usr/local/bin/bryan-run`)
   - Add the filename to the `ALLOWED=` line
3. Restart the container

## Current allowed scripts

### Demi (`/usr/local/bin/demi-run`):
- face-analysis.py
- undertone.py
- makeup-transfer.py
- skin-detector.py
- fal-generate.py

### Bryan (`/usr/local/bin/bryan-run`):
- (none yet)

## Files
- Wrapper: `/usr/local/bin/{demi,bryan}-run`
- Exec approvals: `exec-approvals.json` (only allows the wrapper binary)
- Config: `openclaw.json` → `tools.exec.security = "allowlist"`

## Why paranoid mode?
Allowlisting python3 directly means the LLM could theoretically run `python3 -c "malicious code"`.
The wrapper ensures only pre-approved scripts can execute — nothing else.

---

## Infrastructure: Redis & Database Security

### ⚠️ MANDATORY for any DIJI companion using Redis/Postgres

**Redis:**
- ALWAYS set `--requirepass <password>` in docker-compose command
- NEVER map port 6379 externally (`ports: "6379:6379"` = exposed to internet)
- Redis is internal-only — containers talk via Docker network, not host ports
- Use `redis://:PASSWORD@redis:6379` in REDIS_URL

**Postgres:**
- NEVER map port 5432 externally
- Internal Docker network only
- Strong password in POSTGRES_PASSWORD env var

**docker-compose.yml — correct pattern:**
```yaml
redis:
  image: redis:7-alpine
  # NO ports section — internal only
  command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
  volumes:
    - redis-data:/data

postgres:
  image: postgres:16-alpine
  # NO ports section — internal only
  environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  volumes:
    - postgres-data:/var/lib/postgresql/data
```

**docker-compose.yml — WRONG (exposes to internet):**
```yaml
# ❌ NEVER DO THIS
redis:
  ports:
    - "6379:6379"  # Anyone on the internet can connect
postgres:
  ports:
    - "5432:5432"  # Anyone on the internet can connect
```

**Firewall:**
- UFW must be ACTIVE on host (`ufw enable`)
- Docker bypasses UFW via iptables — password auth is the real protection
- Verify with `ss -tlnp | grep -E "6379|5432"` — should show nothing

### Incident: March 31, 2026
CERT-Bund (German federal CERT) detected open Redis 7.4.8 on our server.
Root cause: Docker Redis container had no password, port was accessible via Dockers iptables bypass, and UFW was inactive.


---

## Infrastructure: Redis & Database Security

### MANDATORY for any DIJI companion using Redis/Postgres

**Redis:**
- ALWAYS set `--requirepass <password>` in docker-compose command
- NEVER map port 6379 externally (`ports: "6379:6379"` = exposed to internet)
- Redis is internal-only — containers talk via Docker network, not host ports
- Use `redis://:PASSWORD@redis:6379` in REDIS_URL

**Postgres:**
- NEVER map port 5432 externally
- Internal Docker network only
- Strong password in POSTGRES_PASSWORD env var

**docker-compose.yml — correct pattern:**
```yaml
redis:
  image: redis:7-alpine
  # NO ports section — internal only
  command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
  volumes:
    - redis-data:/data

postgres:
  image: postgres:16-alpine
  # NO ports section — internal only
  environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  volumes:
    - postgres-data:/var/lib/postgresql/data
```

**docker-compose.yml — WRONG (exposes to internet):**
```yaml
# NEVER DO THIS
redis:
  ports:
    - "6379:6379"  # Anyone on the internet can connect
postgres:
  ports:
    - "5432:5432"  # Anyone on the internet can connect
```

**Firewall:**
- UFW must be ACTIVE on host (`ufw enable`)
- Docker bypasses UFW via iptables — password auth is the real protection
- Verify with `ss -tlnp | grep -E "6379|5432"` — should show nothing

### Incident: March 31, 2026
CERT-Bund (German federal CERT) detected open Redis 7.4.8 on our server.
Root cause: Docker Redis container had no password, port was accessible via Docker's iptables bypass, and UFW was inactive.
Fix: Added requirepass, removed port mappings, enabled UFW.
