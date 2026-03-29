// Diji Database Layer — Postgres via pg
// Drop-in replacement for JSON file operations

import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://diji:diji_dev_2026@localhost:5432/diji',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

// ============================================================
// USERS
// ============================================================

export interface User {
  id: string;
  email: string;
  token: string;
  link_token: string;
  companion_name: string;
  created_at: Date;
  updated_at: Date;
  // Joined data
  channel_links?: ChannelLink[];
  health_profile?: HealthProfile;
}

export interface ChannelLink {
  id: string;
  channel: string;
  peer_id: string;
  linked_at: Date;
}

export interface HealthProfile {
  language: string;
  timezone: string;
  companion_gender: string;
  companion_name: string;
  has_band: boolean;
  sleeps_with_band: boolean;
  dob?: string;
  sex?: string;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: string;
  goal?: string;
  dietary_restrictions?: string[];
}

export async function createUser(email: string, companionName = 'Bryan'): Promise<User> {
  const res = await pool.query(
    `INSERT INTO users (email, companion_name) VALUES ($1, $2) RETURNING *`,
    [email, companionName]
  );
  // Create default health profile
  await pool.query(
    `INSERT INTO health_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [res.rows[0].id]
  );
  return res.rows[0];
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const res = await pool.query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
  return res.rows[0] || null;
}

export async function getUserByToken(token: string): Promise<User | null> {
  const res = await pool.query(`SELECT * FROM users WHERE token = $1`, [token]);
  if (!res.rows[0]) return null;
  return enrichUser(res.rows[0]);
}

export async function getUserById(id: string): Promise<User | null> {
  const res = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  if (!res.rows[0]) return null;
  return enrichUser(res.rows[0]);
}

export async function getUserByIdentifier(identifier: string): Promise<User | null> {
  // Try: user ID, email, token, channel link peer_id, telegram chat ID
  let res = await pool.query(`SELECT * FROM users WHERE id::text = $1 OR email = $1 OR token::text = $1`, [identifier]);
  if (!res.rows[0]) {
    // Try channel links
    res = await pool.query(
      `SELECT u.* FROM users u JOIN channel_links cl ON u.id = cl.user_id WHERE cl.peer_id = $1`,
      [identifier]
    );
  }
  if (!res.rows[0]) return null;
  return enrichUser(res.rows[0]);
}

async function enrichUser(user: User): Promise<User> {
  const links = await pool.query(`SELECT * FROM channel_links WHERE user_id = $1`, [user.id]);
  const profile = await pool.query(`SELECT * FROM health_profiles WHERE user_id = $1`, [user.id]);
  user.channel_links = links.rows;
  user.health_profile = profile.rows[0] || null;
  return user;
}

export async function getAllUsers(): Promise<User[]> {
  const res = await pool.query(`SELECT * FROM users ORDER BY created_at`);
  const users = [];
  for (const row of res.rows) {
    users.push(await enrichUser(row));
  }
  return users;
}

// ============================================================
// CHANNEL LINKS
// ============================================================

export async function linkChannel(userId: string, channel: string, peerId: string): Promise<ChannelLink> {
  const res = await pool.query(
    `INSERT INTO channel_links (user_id, channel, peer_id) VALUES ($1, $2, $3)
     ON CONFLICT (channel, peer_id) DO UPDATE SET user_id = $1
     RETURNING *`,
    [userId, channel, peerId]
  );
  return res.rows[0];
}

export async function getUserByChannelPeer(channel: string, peerId: string): Promise<User | null> {
  const res = await pool.query(
    `SELECT u.* FROM users u JOIN channel_links cl ON u.id = cl.user_id
     WHERE cl.channel = $1 AND cl.peer_id = $2`,
    [channel, peerId]
  );
  if (!res.rows[0]) return null;
  return enrichUser(res.rows[0]);
}

// ============================================================
// HEALTH PROFILES
// ============================================================

export async function updateHealthProfile(userId: string, updates: Partial<HealthProfile>): Promise<void> {
  const fields = Object.keys(updates).filter(k => updates[k as keyof HealthProfile] !== undefined);
  if (fields.length === 0) return;
  
  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`);
  const values = fields.map(f => updates[f as keyof HealthProfile]);
  
  await pool.query(
    `INSERT INTO health_profiles (user_id, ${fields.join(', ')})
     VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}`,
    [userId, ...values]
  );
}

// ============================================================
// HEALTH SYNCS
// ============================================================

export async function saveHealthSync(userId: string, data: any): Promise<void> {
  await pool.query(
    `INSERT INTO health_syncs (user_id, steps, active_calories, basal_calories, sleep_hours,
     resting_heart_rate, heart_rate, hrv, weight_kg, body_fat_pct, blood_oxygen,
     respiratory_rate, raw_data, overnight_hr)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [userId, data.steps, data.activeCalories, data.basalCalories, data.sleepHours,
     data.restingHeartRate, data.heartRate, data.hrv, data.weight,
     data.bodyFatPercentage, data.bloodOxygen, data.respiratoryRate,
     JSON.stringify(data), JSON.stringify(data.overnightHR || null)]
  );
}

export async function getLatestHealthSync(userId: string): Promise<any | null> {
  const res = await pool.query(
    `SELECT * FROM health_syncs WHERE user_id = $1 ORDER BY synced_at DESC LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
}

export async function getHealthHistory(userId: string, days = 14): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM health_syncs WHERE user_id = $1 AND synced_at > NOW() - INTERVAL '1 day' * $2
     ORDER BY synced_at DESC`,
    [userId, days]
  );
  return res.rows;
}

// ============================================================
// MEALS
// ============================================================

export async function saveMeal(userId: string, items: any, totals: any, vitamins?: any, minerals?: any, source = 'chat'): Promise<string> {
  const res = await pool.query(
    `INSERT INTO meals (user_id, items, totals, vitamins, minerals, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [userId, JSON.stringify(items), JSON.stringify(totals), JSON.stringify(vitamins), JSON.stringify(minerals), source]
  );
  return res.rows[0].id;
}

export async function getMealsForDate(userId: string, date: string): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM meals WHERE user_id = $1 AND logged_at::date = $2::date ORDER BY logged_at`,
    [userId, date]
  );
  return res.rows;
}

// ============================================================
// TRIGGERS
// ============================================================

export async function hasTriggerFired(userId: string, triggerType: string, date?: string): Promise<boolean> {
  const d = date || new Date().toISOString().split('T')[0];
  const res = await pool.query(
    `SELECT 1 FROM trigger_log WHERE user_id = $1 AND trigger_type = $2 AND fired_date = $3::date`,
    [userId, triggerType, d]
  );
  return res.rows.length > 0;
}

export async function logTrigger(userId: string, triggerType: string, message?: string): Promise<void> {
  await pool.query(
    `INSERT INTO trigger_log (user_id, trigger_type, fired_date, message) VALUES ($1, $2, CURRENT_DATE, $3)
     ON CONFLICT (user_id, trigger_type, fired_date) DO NOTHING`,
    [userId, triggerType, message]
  );
}

// ============================================================
// DEVICE PAIRINGS
// ============================================================

export async function saveDevicePairing(deviceId: string, publicKey: string, privateKey: string): Promise<void> {
  await pool.query(
    `INSERT INTO device_pairings (device_id, public_key, private_key) VALUES ($1, $2, $3)
     ON CONFLICT (device_id) DO UPDATE SET public_key = $2, private_key = $3`,
    [deviceId, publicKey, privateKey]
  );
}

export async function getDevicePairing(deviceId: string): Promise<any | null> {
  const res = await pool.query(`SELECT * FROM device_pairings WHERE device_id = $1`, [deviceId]);
  return res.rows[0] || null;
}

export async function approveDevicePairing(deviceId: string): Promise<void> {
  await pool.query(`UPDATE device_pairings SET approved = true WHERE device_id = $1`, [deviceId]);
}

// ============================================================
// SCHEDULED JOBS
// ============================================================

export async function createScheduledJob(params: {
  userId?: string;
  jobType: string;
  cronExpression?: string;
  nextRunAt: Date;
  payload?: any;
  channel?: string;
  targetId?: string;
  deleteAfterRun?: boolean;
}): Promise<string> {
  const res = await pool.query(
    `INSERT INTO scheduled_jobs (user_id, job_type, cron_expression, next_run_at, payload, channel, target_id, delete_after_run)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [params.userId, params.jobType, params.cronExpression, params.nextRunAt,
     JSON.stringify(params.payload), params.channel, params.targetId, params.deleteAfterRun || false]
  );
  return res.rows[0].id;
}

export async function getDueJobs(): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM scheduled_jobs WHERE enabled = true AND next_run_at <= NOW() ORDER BY next_run_at LIMIT 100`
  );
  return res.rows;
}

export async function markJobRun(jobId: string, nextRunAt?: Date): Promise<void> {
  if (nextRunAt) {
    await pool.query(
      `UPDATE scheduled_jobs SET last_run_at = NOW(), next_run_at = $2 WHERE id = $1`,
      [jobId, nextRunAt]
    );
  } else {
    await pool.query(`DELETE FROM scheduled_jobs WHERE id = $1`, [jobId]);
  }
}

// ============================================================
// COMPANION MEMORY
// ============================================================

export async function saveMemory(userId: string, content: string, topic?: string, source = 'conversation'): Promise<void> {
  await pool.query(
    `INSERT INTO companion_memory (user_id, content, topic, source) VALUES ($1, $2, $3, $4)`,
    [userId, content, topic, source]
  );
}

export async function getMemories(userId: string, limit = 20): Promise<any[]> {
  const res = await pool.query(
    `SELECT * FROM companion_memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

// ============================================================
// SESSIONS
// ============================================================

export async function upsertSession(userId: string, sessionKey: string, model: string): Promise<void> {
  await pool.query(
    `INSERT INTO sessions (user_id, session_key, model) VALUES ($1, $2, $3)
     ON CONFLICT (session_key) DO UPDATE SET last_active = NOW(), model = $3`,
    [userId, sessionKey, model]
  );
}

export async function saveSessionMessage(sessionKey: string, role: string, content: any, tokenCount?: number): Promise<void> {
  const session = await pool.query(`SELECT id FROM sessions WHERE session_key = $1`, [sessionKey]);
  if (!session.rows[0]) return;
  await pool.query(
    `INSERT INTO session_messages (session_id, role, content, token_count) VALUES ($1, $2, $3, $4)`,
    [session.rows[0].id, role, JSON.stringify(content), tokenCount]
  );
  await pool.query(
    `UPDATE sessions SET message_count = message_count + 1, last_active = NOW() WHERE id = $1`,
    [session.rows[0].id]
  );
}

// ============================================================
// SUPPLEMENTS
// ============================================================

export async function saveSupplementStack(userId: string, supplement: any): Promise<void> {
  await pool.query(
    `INSERT INTO supplement_stacks (user_id, supplement_name, brand, ingredients, fillers, verdict, timing, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, supplement.name, supplement.brand, JSON.stringify(supplement.ingredients),
     supplement.fillers, supplement.verdict, supplement.timing, supplement.notes]
  );
}

// ============================================================
// BLOOD WORK
// ============================================================

export async function saveBloodWork(userId: string, testDate: string, markers: any, labName?: string): Promise<void> {
  await pool.query(
    `INSERT INTO blood_work (user_id, test_date, markers, lab_name) VALUES ($1, $2, $3, $4)`,
    [userId, testDate, JSON.stringify(markers), labName]
  );
}

export async function getLatestBloodWork(userId: string): Promise<any | null> {
  const res = await pool.query(
    `SELECT * FROM blood_work WHERE user_id = $1 ORDER BY test_date DESC LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
}

// ============================================================
// WORKOUTS
// ============================================================

export async function saveWorkout(userId: string, workout: any): Promise<void> {
  await pool.query(
    `INSERT INTO workouts (user_id, workout_date, type, duration_min, exercises, strain_score, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, workout.date, workout.type, workout.duration, JSON.stringify(workout.exercises),
     workout.strainScore, workout.notes]
  );
}

// ============================================================
// SYMPTOMS
// ============================================================

export async function saveSymptom(userId: string, symptom: string, severity: number): Promise<void> {
  await pool.query(
    `INSERT INTO symptoms (user_id, symptom, severity) VALUES ($1, $2, $3)`,
    [userId, symptom, severity]
  );
}

// ============================================================
// PLANS
// ============================================================

export async function savePlan(userId: string, planData: any): Promise<void> {
  await pool.query(
    `INSERT INTO plans (user_id, plan_data) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET plan_data = $2, updated_at = NOW()`,
    [userId, JSON.stringify(planData)]
  );
}

export async function getPlan(userId: string): Promise<any | null> {
  const res = await pool.query(`SELECT * FROM plans WHERE user_id = $1`, [userId]);
  return res.rows[0] || null;
}

// ============================================================
// MIGRATION: Import from JSON files
// ============================================================

export async function migrateFromJson(usersJson: Record<string, any>): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  
  for (const [id, u] of Object.entries(usersJson)) {
    try {
      // Insert user
      await pool.query(
        `INSERT INTO users (id, email, token, link_token, companion_name, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [id, u.email, u.token, u.linkToken || null, u.companionName || 'Bryan', u.createdAt]
      );
      
      // Channel links
      if (u.channelLinks) {
        for (const link of u.channelLinks) {
          await pool.query(
            `INSERT INTO channel_links (user_id, channel, peer_id, linked_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (channel, peer_id) DO NOTHING`,
            [id, link.channel, link.peerId, link.linkedAt]
          );
        }
      }
      
      // Legacy telegram
      if (u.telegramChatId) {
        await pool.query(
          `INSERT INTO channel_links (user_id, channel, peer_id)
           VALUES ($1, 'telegram', $2)
           ON CONFLICT (channel, peer_id) DO NOTHING`,
          [id, String(u.telegramChatId)]
        );
      }
      
      // Health profile
      if (u.healthProfile) {
        const hp = u.healthProfile;
        await pool.query(
          `INSERT INTO health_profiles (user_id, language, timezone, companion_gender, companion_name, has_band, sleeps_with_band)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE SET language = $2, timezone = $3, companion_gender = $4, companion_name = $5`,
          [id, hp.language || 'en', hp.timezone || 'UTC', hp.companionGender || 'male',
           hp.companionName || 'Bryan', hp.hasBand || false, hp.sleepsWithBand || false]
        );
      }
      
      imported++;
    } catch (e: any) {
      errors.push(`${id}: ${e.message}`);
    }
  }
  
  return { imported, errors };
}

// ============================================================
// POOL MANAGEMENT
// ============================================================

export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export { pool };
