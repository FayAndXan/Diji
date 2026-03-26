// ---------------------------------------------------------------------------
// Diji Memory Provider - Supermemory Integration
//
// Thin abstraction over Supermemory API for per-user memory storage.
// Swap this file to change memory providers (Issue #4).
//
// Usage:
//   const memory = require('./index');
//   await memory.store(userId, "Fay likes pad thai");
//   const results = await memory.search(userId, "food preferences");
//   const profile = await memory.getProfile(userId);
// ---------------------------------------------------------------------------

const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY;
const SUPERMEMORY_BASE_URL = process.env.SUPERMEMORY_BASE_URL || 'https://api.supermemory.ai/v3';

if (!SUPERMEMORY_API_KEY) {
  console.warn('[memory-provider] SUPERMEMORY_API_KEY not set. Memory disabled.');
}

const headers = {
  'Authorization': `Bearer ${SUPERMEMORY_API_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Store a memory for a user
 * @param {string} userId - Unique user identifier (containerTag)
 * @param {string} content - Text content to remember
 * @param {object} [metadata] - Optional metadata
 * @returns {Promise<{id: string, status: string}>}
 */
async function store(userId, content, metadata = {}) {
  if (!SUPERMEMORY_API_KEY) return { id: null, status: 'disabled' };
  
  const resp = await fetch(`${SUPERMEMORY_BASE_URL}/documents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content,
      containerTags: [userId],
      metadata,
    }),
  });
  
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[memory-provider] Store failed for ${userId}: ${resp.status} ${err}`);
    return { id: null, status: 'error', error: err };
  }
  
  return resp.json();
}

/**
 * Store a conversation for a user (auto-extracts memories)
 * @param {string} userId - Unique user identifier
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @returns {Promise<{id: string, status: string}>}
 */
async function storeConversation(userId, messages) {
  const content = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');
  return store(userId, content, { type: 'conversation' });
}

/**
 * Search memories for a user
 * @param {string} userId - Unique user identifier
 * @param {string} query - Search query
 * @param {number} [limit=5] - Max results
 * @param {number} [threshold=0.5] - Min relevance score
 * @returns {Promise<Array<{content: string, score: number, title: string}>>}
 */
async function search(userId, query, limit = 5, threshold = 0.5) {
  if (!SUPERMEMORY_API_KEY) return [];
  
  const resp = await fetch(`${SUPERMEMORY_BASE_URL}/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      q: query,
      containerTags: [userId],
      limit,
      threshold,
    }),
  });
  
  if (!resp.ok) {
    console.error(`[memory-provider] Search failed for ${userId}: ${resp.status}`);
    return [];
  }
  
  const data = await resp.json();
  return (data.results || []).map(r => ({
    content: r.chunks?.[0]?.content || '',
    score: r.score,
    title: r.title || '',
    id: r.documentId,
    createdAt: r.createdAt,
  }));
}

/**
 * Get user profile (static facts + dynamic context)
 * @param {string} userId - Unique user identifier
 * @param {string} [query] - Optional query for context-relevant profile
 * @returns {Promise<{static: string[], dynamic: string[], memories: Array}>}
 */
async function getProfile(userId, query = '') {
  if (!SUPERMEMORY_API_KEY) return { static: [], dynamic: [], memories: [] };
  
  const body = { containerTag: userId };
  if (query) body.q = query;
  
  const resp = await fetch(`${SUPERMEMORY_BASE_URL}/profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  if (!resp.ok) {
    console.error(`[memory-provider] Profile failed for ${userId}: ${resp.status}`);
    return { static: [], dynamic: [], memories: [] };
  }
  
  const data = await resp.json();
  return {
    static: data.profile?.static || [],
    dynamic: data.profile?.dynamic || [],
    memories: (data.searchResults?.results || []).map(r => ({
      content: r.memory || r.chunks?.[0]?.content || '',
      score: r.score,
    })),
  };
}

/**
 * Delete all memories for a user (account deletion)
 * @param {string} userId - Unique user identifier
 */
async function deleteUser(userId) {
  if (!SUPERMEMORY_API_KEY) return;
  
  // Search all docs for this user, then delete each
  const resp = await fetch(`${SUPERMEMORY_BASE_URL}/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      q: '*',
      containerTags: [userId],
      limit: 1000,
    }),
  });
  
  if (!resp.ok) return;
  
  const data = await resp.json();
  for (const result of (data.results || [])) {
    if (result.documentId) {
      await fetch(`${SUPERMEMORY_BASE_URL}/documents/${result.documentId}`, {
        method: 'DELETE',
        headers,
      });
    }
  }
  
  console.log(`[memory-provider] Deleted all memories for ${userId}`);
}

module.exports = { store, storeConversation, search, getProfile, deleteUser };
