// Bryan Rule Injector (Multi-Tenant)
// Injects ONLY dynamic per-user context that workspace files can't provide
// All personality, formatting, templates, search rules live in workspace files

import { resolveUser, getUserDataDir } from './user-resolver.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default function register(api) {
  api.on('before_prompt_build', (event, ctx) => {
    const user = resolveUser(ctx);
    
    console.log(`[rule-injector] User: ${user.id} (${user.channel}:${user.peerId}) new=${user.isNew} guest=${user.isGuest || false}`);
    
    // Guest users — gate them
    if (user.isGuest) {
      return { prependContext: '### You are in GATE MODE. This user is not registered. Do not have a conversation. Say only: "hey! download the companion app to get started 🧬"' };
    }
    
    // User config
    const userLang = user.healthProfile?.language || 'en';
    const companionName = user.healthProfile?.companionName || 'Bryan';
    const userTimezone = user.healthProfile?.timezone || 'UTC';
    const userDataDir = user.dataDir;
    const userId = user.id;
    const tgUsername = user.telegramUsername || userId;
    
    // Language
    const langMap = {
      en: 'English', zh: 'Chinese (Simplified)', ko: 'Korean', it: 'Italian',
      es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German',
      ar: 'Arabic', th: 'Thai', hi: 'Hindi', ja: 'Japanese', ru: 'Russian'
    };
    const langName = langMap[userLang] || 'English';
    const langRule = userLang !== 'en'
      ? `LANGUAGE: ALWAYS respond in ${langName}. Everything the user sees must be in ${langName}.`
      : '';

    // Load per-user files
    let userProfile = '';
    const userMd = join(userDataDir, 'USER.md');
    if (existsSync(userMd)) {
      try { userProfile = readFileSync(userMd, 'utf-8'); } catch {}
    }
    
    let userMemory = '';
    const memoryMd = join(userDataDir, 'MEMORY.md');
    if (existsSync(memoryMd)) {
      try { userMemory = readFileSync(memoryMd, 'utf-8'); } catch {}
    }

    let userDataContext = '';
    const healthIndex = join(userDataDir, 'health', 'index.md');
    if (existsSync(healthIndex)) {
      try { userDataContext = readFileSync(healthIndex, 'utf-8'); } catch {}
    }

    // Build compact context
    const parts = [
      `## User Context (auto-injected)`,
      langRule,
      user.isNew
        ? `NEW USER: First conversation. Introduce yourself as ${companionName}. See ONBOARDING.md.`
        : `User: ${userId} | Timezone: ${userTimezone} | Data: ${userDataDir}`,
      !user.isNew ? `Health API: curl -s http://localhost:3950/api/internal/health/${tgUsername}` : '',
      !user.isNew ? `Health history: curl -s http://localhost:3950/api/internal/health-history/${tgUsername}` : '',
      !user.isNew ? `Write meal: curl -s -X POST http://localhost:3950/api/internal/command -H 'Content-Type: application/json' -d '{"telegramUsername":"${tgUsername}","type":"write_meal","payload":{"meal":"..."}}'` : '',
      !user.isNew ? `Memory path: ${userDataDir}/MEMORY.md (append, don't overwrite)` : '',
      userProfile ? `\n## About This User\n${userProfile}` : '',
      userMemory ? `\n## Your Memory of This User\n${userMemory}` : '',
      userDataContext ? `\n## Health Data (from sync)\n${userDataContext}` : '',
    ].filter(Boolean);

    return {
      prependContext: parts.join('\n'),
    };
  });
}
