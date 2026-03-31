# Per-User Memory Cap

## What It Is
Each user's MEMORY.md file is capped at 7KB. When a new entry would exceed the cap, the oldest entries are trimmed first.

## What Gets Trimmed
- Oldest conversational preferences ("I like X", "my budget is Y")
- Oldest interaction notes

## What Does NOT Get Trimmed
- Structured data in separate files (health/, analysis/, meals/, routines/)
- USER.md (profile data)
- Any file that isn't MEMORY.md

## How It Works
In rule-injector, after loading MEMORY.md:
```javascript
const MAX_MEMORY_BYTES = 7168; // 7KB
if (userMemory.length > MAX_MEMORY_BYTES) {
  const lines = userMemory.split('\n').filter(l => l.trim());
  while (lines.join('\n').length > MAX_MEMORY_BYTES && lines.length > 5) {
    lines.shift(); // remove oldest
  }
  writeFileSync(memoryMd, lines.join('\n') + '\n');
}
```

## Changing the Cap
Update `MAX_MEMORY_BYTES` in `extensions/rule-injector/index.js`.
7KB = ~140 preference entries. Increase to 10240 (10KB) if companions need more history.
