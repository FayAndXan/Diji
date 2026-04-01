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
