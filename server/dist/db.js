"use strict";
// Diji Database Layer — Postgres via pg
// Drop-in replacement for JSON file operations
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.createUser = createUser;
exports.getUserByEmail = getUserByEmail;
exports.getUserByToken = getUserByToken;
exports.getUserById = getUserById;
exports.getUserByIdentifier = getUserByIdentifier;
exports.getAllUsers = getAllUsers;
exports.linkChannel = linkChannel;
exports.getUserByChannelPeer = getUserByChannelPeer;
exports.updateHealthProfile = updateHealthProfile;
exports.saveHealthSync = saveHealthSync;
exports.getLatestHealthSync = getLatestHealthSync;
exports.getHealthHistory = getHealthHistory;
exports.saveMeal = saveMeal;
exports.getMealsForDate = getMealsForDate;
exports.hasTriggerFired = hasTriggerFired;
exports.logTrigger = logTrigger;
exports.saveDevicePairing = saveDevicePairing;
exports.getDevicePairing = getDevicePairing;
exports.approveDevicePairing = approveDevicePairing;
exports.createScheduledJob = createScheduledJob;
exports.getDueJobs = getDueJobs;
exports.markJobRun = markJobRun;
exports.saveMemory = saveMemory;
exports.getMemories = getMemories;
exports.upsertSession = upsertSession;
exports.saveSessionMessage = saveSessionMessage;
exports.saveSupplementStack = saveSupplementStack;
exports.saveBloodWork = saveBloodWork;
exports.getLatestBloodWork = getLatestBloodWork;
exports.saveWorkout = saveWorkout;
exports.saveSymptom = saveSymptom;
exports.savePlan = savePlan;
exports.getPlan = getPlan;
exports.migrateFromJson = migrateFromJson;
exports.checkConnection = checkConnection;
exports.closePool = closePool;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://diji:diji_dev_2026@localhost:5432/diji',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
exports.pool = pool;
pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err.message);
});
async function createUser(email, companionName = 'Bryan') {
    const res = await pool.query(`INSERT INTO users (email, companion_name) VALUES ($1, $2) RETURNING *`, [email, companionName]);
    // Create default health profile
    await pool.query(`INSERT INTO health_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [res.rows[0].id]);
    return res.rows[0];
}
async function getUserByEmail(email) {
    const res = await pool.query(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()]);
    return res.rows[0] || null;
}
async function getUserByToken(token) {
    const res = await pool.query(`SELECT * FROM users WHERE token = $1`, [token]);
    if (!res.rows[0])
        return null;
    return enrichUser(res.rows[0]);
}
async function getUserById(id) {
    const res = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
    if (!res.rows[0])
        return null;
    return enrichUser(res.rows[0]);
}
async function getUserByIdentifier(identifier) {
    // Try: user ID, email, token, channel link peer_id, telegram chat ID
    let res = await pool.query(`SELECT * FROM users WHERE id::text = $1 OR email = $1 OR token::text = $1`, [identifier]);
    if (!res.rows[0]) {
        // Try channel links
        res = await pool.query(`SELECT u.* FROM users u JOIN channel_links cl ON u.id = cl.user_id WHERE cl.peer_id = $1`, [identifier]);
    }
    if (!res.rows[0])
        return null;
    return enrichUser(res.rows[0]);
}
async function enrichUser(user) {
    const links = await pool.query(`SELECT * FROM channel_links WHERE user_id = $1`, [user.id]);
    const profile = await pool.query(`SELECT * FROM health_profiles WHERE user_id = $1`, [user.id]);
    user.channel_links = links.rows;
    user.health_profile = profile.rows[0] || null;
    return user;
}
async function getAllUsers() {
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
async function linkChannel(userId, channel, peerId) {
    const res = await pool.query(`INSERT INTO channel_links (user_id, channel, peer_id) VALUES ($1, $2, $3)
     ON CONFLICT (channel, peer_id) DO UPDATE SET user_id = $1
     RETURNING *`, [userId, channel, peerId]);
    return res.rows[0];
}
async function getUserByChannelPeer(channel, peerId) {
    const res = await pool.query(`SELECT u.* FROM users u JOIN channel_links cl ON u.id = cl.user_id
     WHERE cl.channel = $1 AND cl.peer_id = $2`, [channel, peerId]);
    if (!res.rows[0])
        return null;
    return enrichUser(res.rows[0]);
}
// ============================================================
// HEALTH PROFILES
// ============================================================
async function updateHealthProfile(userId, updates) {
    const fields = Object.keys(updates).filter(k => updates[k] !== undefined);
    if (fields.length === 0)
        return;
    const setClauses = fields.map((f, i) => `${f} = $${i + 2}`);
    const values = fields.map(f => updates[f]);
    await pool.query(`INSERT INTO health_profiles (user_id, ${fields.join(', ')})
     VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}`, [userId, ...values]);
}
// ============================================================
// HEALTH SYNCS
// ============================================================
async function saveHealthSync(userId, data) {
    await pool.query(`INSERT INTO health_syncs (user_id, steps, active_calories, basal_calories, sleep_hours,
     resting_heart_rate, heart_rate, hrv, weight_kg, body_fat_pct, blood_oxygen,
     respiratory_rate, raw_data, overnight_hr)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`, [userId, data.steps, data.activeCalories, data.basalCalories, data.sleepHours,
        data.restingHeartRate, data.heartRate, data.hrv, data.weight,
        data.bodyFatPercentage, data.bloodOxygen, data.respiratoryRate,
        JSON.stringify(data), JSON.stringify(data.overnightHR || null)]);
}
async function getLatestHealthSync(userId) {
    const res = await pool.query(`SELECT * FROM health_syncs WHERE user_id = $1 ORDER BY synced_at DESC LIMIT 1`, [userId]);
    return res.rows[0] || null;
}
async function getHealthHistory(userId, days = 14) {
    const res = await pool.query(`SELECT * FROM health_syncs WHERE user_id = $1 AND synced_at > NOW() - INTERVAL '1 day' * $2
     ORDER BY synced_at DESC`, [userId, days]);
    return res.rows;
}
// ============================================================
// MEALS
// ============================================================
async function saveMeal(userId, items, totals, vitamins, minerals, source = 'chat') {
    const res = await pool.query(`INSERT INTO meals (user_id, items, totals, vitamins, minerals, source) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [userId, JSON.stringify(items), JSON.stringify(totals), JSON.stringify(vitamins), JSON.stringify(minerals), source]);
    return res.rows[0].id;
}
async function getMealsForDate(userId, date) {
    const res = await pool.query(`SELECT * FROM meals WHERE user_id = $1 AND logged_at::date = $2::date ORDER BY logged_at`, [userId, date]);
    return res.rows;
}
// ============================================================
// TRIGGERS
// ============================================================
async function hasTriggerFired(userId, triggerType, date) {
    const d = date || new Date().toISOString().split('T')[0];
    const res = await pool.query(`SELECT 1 FROM trigger_log WHERE user_id = $1 AND trigger_type = $2 AND fired_date = $3::date`, [userId, triggerType, d]);
    return res.rows.length > 0;
}
async function logTrigger(userId, triggerType, message) {
    await pool.query(`INSERT INTO trigger_log (user_id, trigger_type, fired_date, message) VALUES ($1, $2, CURRENT_DATE, $3)
     ON CONFLICT (user_id, trigger_type, fired_date) DO NOTHING`, [userId, triggerType, message]);
}
// ============================================================
// DEVICE PAIRINGS
// ============================================================
async function saveDevicePairing(deviceId, publicKey, privateKey) {
    await pool.query(`INSERT INTO device_pairings (device_id, public_key, private_key) VALUES ($1, $2, $3)
     ON CONFLICT (device_id) DO UPDATE SET public_key = $2, private_key = $3`, [deviceId, publicKey, privateKey]);
}
async function getDevicePairing(deviceId) {
    const res = await pool.query(`SELECT * FROM device_pairings WHERE device_id = $1`, [deviceId]);
    return res.rows[0] || null;
}
async function approveDevicePairing(deviceId) {
    await pool.query(`UPDATE device_pairings SET approved = true WHERE device_id = $1`, [deviceId]);
}
// ============================================================
// SCHEDULED JOBS
// ============================================================
async function createScheduledJob(params) {
    const res = await pool.query(`INSERT INTO scheduled_jobs (user_id, job_type, cron_expression, next_run_at, payload, channel, target_id, delete_after_run)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [params.userId, params.jobType, params.cronExpression, params.nextRunAt,
        JSON.stringify(params.payload), params.channel, params.targetId, params.deleteAfterRun || false]);
    return res.rows[0].id;
}
async function getDueJobs() {
    const res = await pool.query(`SELECT * FROM scheduled_jobs WHERE enabled = true AND next_run_at <= NOW() ORDER BY next_run_at LIMIT 100`);
    return res.rows;
}
async function markJobRun(jobId, nextRunAt) {
    if (nextRunAt) {
        await pool.query(`UPDATE scheduled_jobs SET last_run_at = NOW(), next_run_at = $2 WHERE id = $1`, [jobId, nextRunAt]);
    }
    else {
        await pool.query(`DELETE FROM scheduled_jobs WHERE id = $1`, [jobId]);
    }
}
// ============================================================
// COMPANION MEMORY
// ============================================================
async function saveMemory(userId, content, topic, source = 'conversation') {
    await pool.query(`INSERT INTO companion_memory (user_id, content, topic, source) VALUES ($1, $2, $3, $4)`, [userId, content, topic, source]);
}
async function getMemories(userId, limit = 20) {
    const res = await pool.query(`SELECT * FROM companion_memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
    return res.rows;
}
// ============================================================
// SESSIONS
// ============================================================
async function upsertSession(userId, sessionKey, model) {
    await pool.query(`INSERT INTO sessions (user_id, session_key, model) VALUES ($1, $2, $3)
     ON CONFLICT (session_key) DO UPDATE SET last_active = NOW(), model = $3`, [userId, sessionKey, model]);
}
async function saveSessionMessage(sessionKey, role, content, tokenCount) {
    const session = await pool.query(`SELECT id FROM sessions WHERE session_key = $1`, [sessionKey]);
    if (!session.rows[0])
        return;
    await pool.query(`INSERT INTO session_messages (session_id, role, content, token_count) VALUES ($1, $2, $3, $4)`, [session.rows[0].id, role, JSON.stringify(content), tokenCount]);
    await pool.query(`UPDATE sessions SET message_count = message_count + 1, last_active = NOW() WHERE id = $1`, [session.rows[0].id]);
}
// ============================================================
// SUPPLEMENTS
// ============================================================
async function saveSupplementStack(userId, supplement) {
    await pool.query(`INSERT INTO supplement_stacks (user_id, supplement_name, brand, ingredients, fillers, verdict, timing, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [userId, supplement.name, supplement.brand, JSON.stringify(supplement.ingredients),
        supplement.fillers, supplement.verdict, supplement.timing, supplement.notes]);
}
// ============================================================
// BLOOD WORK
// ============================================================
async function saveBloodWork(userId, testDate, markers, labName) {
    await pool.query(`INSERT INTO blood_work (user_id, test_date, markers, lab_name) VALUES ($1, $2, $3, $4)`, [userId, testDate, JSON.stringify(markers), labName]);
}
async function getLatestBloodWork(userId) {
    const res = await pool.query(`SELECT * FROM blood_work WHERE user_id = $1 ORDER BY test_date DESC LIMIT 1`, [userId]);
    return res.rows[0] || null;
}
// ============================================================
// WORKOUTS
// ============================================================
async function saveWorkout(userId, workout) {
    await pool.query(`INSERT INTO workouts (user_id, workout_date, type, duration_min, exercises, strain_score, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userId, workout.date, workout.type, workout.duration, JSON.stringify(workout.exercises),
        workout.strainScore, workout.notes]);
}
// ============================================================
// SYMPTOMS
// ============================================================
async function saveSymptom(userId, symptom, severity) {
    await pool.query(`INSERT INTO symptoms (user_id, symptom, severity) VALUES ($1, $2, $3)`, [userId, symptom, severity]);
}
// ============================================================
// PLANS
// ============================================================
async function savePlan(userId, planData) {
    await pool.query(`INSERT INTO plans (user_id, plan_data) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET plan_data = $2, updated_at = NOW()`, [userId, JSON.stringify(planData)]);
}
async function getPlan(userId) {
    const res = await pool.query(`SELECT * FROM plans WHERE user_id = $1`, [userId]);
    return res.rows[0] || null;
}
// ============================================================
// MIGRATION: Import from JSON files
// ============================================================
async function migrateFromJson(usersJson) {
    const errors = [];
    let imported = 0;
    for (const [id, u] of Object.entries(usersJson)) {
        try {
            // Insert user
            await pool.query(`INSERT INTO users (id, email, token, link_token, companion_name, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`, [id, u.email, u.token, u.linkToken || null, u.companionName || 'Bryan', u.createdAt]);
            // Channel links
            if (u.channelLinks) {
                for (const link of u.channelLinks) {
                    await pool.query(`INSERT INTO channel_links (user_id, channel, peer_id, linked_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (channel, peer_id) DO NOTHING`, [id, link.channel, link.peerId, link.linkedAt]);
                }
            }
            // Legacy telegram
            if (u.telegramChatId) {
                await pool.query(`INSERT INTO channel_links (user_id, channel, peer_id)
           VALUES ($1, 'telegram', $2)
           ON CONFLICT (channel, peer_id) DO NOTHING`, [id, String(u.telegramChatId)]);
            }
            // Health profile
            if (u.healthProfile) {
                const hp = u.healthProfile;
                await pool.query(`INSERT INTO health_profiles (user_id, language, timezone, companion_gender, companion_name, has_band, sleeps_with_band)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id) DO UPDATE SET language = $2, timezone = $3, companion_gender = $4, companion_name = $5`, [id, hp.language || 'en', hp.timezone || 'UTC', hp.companionGender || 'male',
                    hp.companionName || 'Bryan', hp.hasBand || false, hp.sleepsWithBand || false]);
            }
            imported++;
        }
        catch (e) {
            errors.push(`${id}: ${e.message}`);
        }
    }
    return { imported, errors };
}
// ============================================================
// POOL MANAGEMENT
// ============================================================
async function checkConnection() {
    try {
        await pool.query('SELECT 1');
        return true;
    }
    catch {
        return false;
    }
}
async function closePool() {
    await pool.end();
}
//# sourceMappingURL=db.js.map