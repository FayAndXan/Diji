"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = process.env.PORT || 3950;
const DATA_DIR = process.env.DATA_DIR || (0, path_1.join)(__dirname, 'data');
const OPENCLAW_GATEWAY = process.env.OPENCLAW_GATEWAY || 'http://localhost:18809';
// Ensure data directory
if (!(0, fs_1.existsSync)(DATA_DIR))
    (0, fs_1.mkdirSync)(DATA_DIR, { recursive: true });
// ─── Simple file-based user store ────────────────────────────────
function getUsers() {
    const path = (0, path_1.join)(DATA_DIR, 'users.json');
    if (!(0, fs_1.existsSync)(path))
        return {};
    return JSON.parse((0, fs_1.readFileSync)(path, 'utf-8'));
}
function saveUsers(users) {
    (0, fs_1.writeFileSync)((0, path_1.join)(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2));
}
function getUserByToken(token) {
    const users = getUsers();
    return Object.values(users).find(u => u.token === token);
}
function updateUser(id, updates) {
    const users = getUsers();
    if (users[id]) {
        users[id] = { ...users[id], ...updates };
        saveUsers(users);
    }
}
// ─── Auth middleware ─────────────────────────────────────────────
function auth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token)
        return res.status(401).json({ error: 'No token' });
    const user = getUserByToken(token);
    if (!user)
        return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
}
// ─── Send message to user via Telegram ───────────────────────────
async function sendToUser(user, message) {
    // Send directly via Telegram Bot API
    const BOT_TOKEN = process.env.BOT_TOKEN || '';
    try {
        // First resolve username to chat_id
        // For now, if we have a stored chat_id, use it. Otherwise try sending by username.
        const chatId = user.telegramChatId || user.telegramUsername;
        const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message
            })
        });
        const result = await resp.json();
        if (result.ok) {
            // Store chat_id for future messages
            if (!user.telegramChatId && result.result?.chat?.id) {
                user.telegramChatId = result.result.chat.id;
                const users = getUsers();
                users[user.id] = user;
                saveUsers(users);
            }
            console.log(`[Companion] Message sent to @${user.telegramUsername}: ${message.substring(0, 50)}...`);
        }
        else {
            console.error(`[Companion] Telegram API error:`, result);
        }
    }
    catch (err) {
        console.error(`[Companion] Failed to send to @${user.telegramUsername}:`, err);
    }
}
// ─── Evaluate creature state based on data ───────────────────────
function evaluateCreatureState(user) {
    // Use CST (UTC+8) for now — TODO: per-user timezone
    const utcHour = new Date().getUTCHours();
    const hour = (utcHour + 8) % 24;
    if (hour >= 23 || hour < 6)
        return 'sleeping';
    const screenTime = user.lastScreenTime;
    const health = user.lastHealth;
    if (!screenTime && !health)
        return 'calm';
    let score = 50; // neutral
    if (screenTime) {
        // High screen time = bad
        if (screenTime.totalScreenTime > 4 * 3600)
            score -= 20;
        else if (screenTime.totalScreenTime > 2 * 3600)
            score -= 10;
        else if (screenTime.totalScreenTime < 1 * 3600)
            score += 10;
        // Many pickups = bad
        if (screenTime.pickups > 80)
            score -= 10;
        else if (screenTime.pickups < 30)
            score += 5;
    }
    if (health) {
        // Good sleep
        if (health.sleepHours && health.sleepHours >= 7)
            score += 15;
        else if (health.sleepHours && health.sleepHours < 5)
            score -= 15;
        // Steps
        if (health.steps && health.steps >= 8000)
            score += 10;
        else if (health.steps && health.steps < 2000)
            score -= 10;
    }
    if (score >= 65)
        return 'glowing';
    if (score >= 40)
        return 'calm';
    if (score >= 20)
        return 'concerned';
    return 'wilting';
}
// ─── Screen time reaction logic ──────────────────────────────────
function shouldReactToScreenTime(user, data) {
    const totalHours = data.totalScreenTime / 3600;
    // Find doom scroll patterns (social media > 30 min continuous)
    const socialApps = data.appUsage.filter(a => a.categoryName.toLowerCase().includes('social') ||
        a.bundleId.includes('instagram') ||
        a.bundleId.includes('tiktok') ||
        a.bundleId.includes('twitter') ||
        a.bundleId.includes('reddit'));
    const maxSocialSession = Math.max(...socialApps.map(a => a.duration), 0);
    if (maxSocialSession > 45 * 60) {
        return `you've been scrolling for ${Math.round(maxSocialSession / 60)} minutes. that's almost an hour of your life. what if you just... didn't?`;
    }
    if (maxSocialSession > 30 * 60) {
        return `30 minutes of scrolling. you noticed, right?`;
    }
    if (totalHours > 5) {
        return `${totalHours.toFixed(1)} hours of screen time today. your eyes are probably tired. mine would be if i had them.`;
    }
    if (data.pickups > 60) {
        return `${data.pickups} pickups today. that's once every ${Math.round(16 * 60 / data.pickups)} minutes. what are you looking for?`;
    }
    return null;
}
// ─── Routes ──────────────────────────────────────────────────────
// Register new user (supports email + channel choice for multi-tenant)
app.post('/api/register', (req, res) => {
    const { companion_name, telegram_username, device_id, email, chat_channel } = req.body;
    const users = getUsers();
    // Check if email already registered (cross-channel linking)
    if (email) {
        const existingByEmail = Object.values(users).find(u => u.email === email.toLowerCase());
        if (existingByEmail) {
            // Generate linkToken if missing (legacy user)
            if (!existingByEmail.linkToken) {
                existingByEmail.linkToken = (0, crypto_1.randomUUID)().replace(/-/g, '').substring(0, 12);
                users[existingByEmail.id] = existingByEmail;
                saveUsers(users);
            }
            console.log(`[Companion] Existing user found by email: ${email} → ${existingByEmail.id}`);
            return res.json({ token: existingByEmail.token, agentId: existingByEmail.id, linkToken: existingByEmail.linkToken, gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '' });
        }
    }
    // Check if device already registered
    if (device_id) {
        const existing = Object.values(users).find(u => u.deviceId === device_id);
        if (existing) {
            return res.json({ token: existing.token, agentId: existing.id, gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '' });
        }
    }
    const id = (0, crypto_1.randomUUID)();
    const token = (0, crypto_1.randomUUID)();
    const linkToken = (0, crypto_1.randomUUID)().replace(/-/g, '').substring(0, 12); // short token for deep links
    const user = {
        id,
        token,
        email: email?.toLowerCase() || '',
        companionName: companion_name || 'Bryan',
        telegramUsername: telegram_username?.replace('@', '') || '',
        deviceId: device_id || '',
        createdAt: new Date().toISOString(),
        creatureState: 'calm',
        channelLinks: [],
        linkToken,
    };
    users[id] = user;
    saveUsers(users);
    // Create per-user data directory
    const userDataDir = (0, path_1.join)(DATA_DIR, '..', '..', '..', '.openclaw-companion', '.openclaw', 'workspace', 'data', 'users', id);
    if (!(0, fs_1.existsSync)(userDataDir)) {
        (0, fs_1.mkdirSync)((0, path_1.join)(userDataDir, 'health'), { recursive: true });
    }
    console.log(`[Companion] New user registered: ${email || telegram_username || id} (${companion_name || 'Bryan'}) channel=${chat_channel || 'none'} linkToken=${linkToken}`);
    res.json({ token, agentId: id, linkToken, gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || '' });
});
// Receive screen time data from iOS app
app.post('/api/screentime', auth, async (req, res) => {
    const user = req.user;
    const data = req.body;
    updateUser(user.id, { lastScreenTime: data });
    // Check if we should react
    const reaction = shouldReactToScreenTime(user, data);
    if (reaction) {
        await sendToUser(user, reaction);
    }
    // Update creature state
    const updatedUser = { ...user, lastScreenTime: data };
    const newState = evaluateCreatureState(updatedUser);
    updateUser(user.id, { creatureState: newState });
    res.json({ ok: true, creatureState: newState });
});
// Receive screen time alert (from DeviceActivity extension)
app.post('/api/screentime/alert', auth, async (req, res) => {
    const user = req.user;
    const alert = req.body;
    console.log(`[Companion] Screen time alert for @${user.telegramUsername}: ${alert.event}`);
    // The event name encodes what threshold was hit
    await sendToUser(user, `i noticed something. you hit a screen time threshold. want to take a break?`);
    res.json({ ok: true });
});
// Receive historical health data from iOS app (first sync)
app.post('/api/health/history', auth, async (req, res) => {
    const user = req.user;
    const { days } = req.body;
    if (!days || !Array.isArray(days)) {
        return res.status(400).json({ error: 'Missing days array' });
    }
    // Store historical data per user
    const historyPath = (0, path_1.join)(DATA_DIR, `health-history-${user.id}.json`);
    (0, fs_1.writeFileSync)(historyPath, JSON.stringify(days, null, 2));
    console.log(`[Companion] Historical health data received for @${user.telegramUsername}: ${days.length} days`);
    // Mark bulk import so triggers are suppressed for 2 minutes
    recentHistoricalSync.set(user.id, Date.now());
    res.json({ ok: true, daysReceived: days.length });
});
function getHistoricalAverages(userId) {
    const historyPath = (0, path_1.join)(DATA_DIR, `health-history-${userId}.json`);
    if (!(0, fs_1.existsSync)(historyPath))
        return null;
    const days = JSON.parse((0, fs_1.readFileSync)(historyPath, 'utf-8'));
    const stepsArr = days.filter((d) => d.steps).map((d) => d.steps);
    const sleepArr = days.filter((d) => d.sleepHours).map((d) => d.sleepHours);
    const rhrArr = days.filter((d) => d.restingHeartRate).map((d) => d.restingHeartRate);
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
        avgSteps: avg(stepsArr),
        avgSleep: avg(sleepArr),
        avgRHR: avg(rhrArr)
    };
}
async function analyzeHealthTriggers(user, data) {
    const triggers = [];
    const averages = getHistoricalAverages(user.id);
    const now = new Date();
    const hour = now.getUTCHours() + 8; // CST approximation
    // Track daily pushes to detect "first push of the day"
    const lastPushPath = (0, path_1.join)(DATA_DIR, `last-push-${user.id}.json`);
    let lastPushDate = '';
    if ((0, fs_1.existsSync)(lastPushPath)) {
        lastPushDate = JSON.parse((0, fs_1.readFileSync)(lastPushPath, 'utf-8')).date || '';
    }
    const today = now.toISOString().split('T')[0];
    const isFirstPushToday = lastPushDate !== today;
    (0, fs_1.writeFileSync)(lastPushPath, JSON.stringify({ date: today, timestamp: now.toISOString() }));
    // 1. Wake-up detection
    const userProfile = user.healthProfile || {};
    const hasBand = userProfile.hasBand !== false;
    const sleepsWithBand = userProfile.sleepsWithBand !== false; // default true for backwards compat
    if (hasBand && sleepsWithBand && data.heartRate && typeof data.heartRate === 'number') {
        // Band user: detect wake-up from HR jump
        // Resting HR during sleep is typically 45-65. Waking up causes HR to rise to 70-90+.
        const wakeupPath = (0, path_1.join)(DATA_DIR, `wakeup-${user.id}.json`);
        let wakeupState = { lastSleepHR: 0, wakeDetected: false, date: '' };
        if ((0, fs_1.existsSync)(wakeupPath)) {
            wakeupState = JSON.parse((0, fs_1.readFileSync)(wakeupPath, 'utf-8'));
        }
        const todayDate = today;
        if (wakeupState.date !== todayDate) {
            // New day, reset
            wakeupState = { lastSleepHR: 0, wakeDetected: false, date: todayDate };
        }
        const currentHR = data.heartRate;
        const hourCST = (now.getUTCHours() + 8) % 24;
        // During sleep hours (10pm-11am), track lowest HR
        if ((hourCST >= 22 || hourCST <= 11) && !wakeupState.wakeDetected) {
            if (currentHR < 70 && (wakeupState.lastSleepHR === 0 || currentHR < wakeupState.lastSleepHR)) {
                wakeupState.lastSleepHR = currentHR;
            }
            // Wake detection: HR jumps 15+ bpm above sleep baseline, between 4am-11am
            if (wakeupState.lastSleepHR > 0 && hourCST >= 4 && hourCST <= 11) {
                const hrJump = currentHR - wakeupState.lastSleepHR;
                if (hrJump >= 15 && currentHR >= 68) {
                    wakeupState.wakeDetected = true;
                    // Call sleep analysis API for last night
                    let sleepAnalysis = '';
                    try {
                        const sleepResp = await fetch('http://localhost:3951/analyze/sleep', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ hr_samples: data.overnightHR || [] })
                        });
                        const sleepData = await sleepResp.json();
                        if (sleepData.summary && sleepData.summary.total_sleep_minutes) {
                            const s = sleepData.summary;
                            sleepAnalysis = `Sleep analysis: ${Math.round(s.total_sleep_minutes / 60 * 10) / 10}h total. Deep: ${s.stages?.deep?.percent || '?'}%, REM: ${s.stages?.rem?.percent || '?'}%, Light: ${s.stages?.light?.percent || '?'}%. Efficiency: ${s.sleep_efficiency || '?'}%. Recovery score pending.`;
                        }
                    }
                    catch { }
                    const sleepMsg = data.sleepHours
                        ? `${data.sleepHours.toFixed(1)} hours of sleep.`
                        : 'sleep data not available yet.';
                    triggers.push({
                        type: 'morning',
                        message: `[HEALTH TRIGGER: User just woke up (HR jumped from ${wakeupState.lastSleepHR} to ${currentHR} bpm at ${hourCST}:${String(now.getUTCMinutes()).padStart(2, '0')}). Sleep last night: ${sleepMsg} ${sleepAnalysis} Steps so far: ${data.steps || 0}. Send a natural morning message. Reference their sleep quality. Keep it short and warm.]`,
                        priority: 'medium'
                    });
                }
            }
        }
        (0, fs_1.writeFileSync)(wakeupPath, JSON.stringify(wakeupState));
    }
    else if (isFirstPushToday) {
        // No band or no HR data: fall back to first-push detection
        const sleepMsg = data.sleepHours
            ? (data.sleepHours < 5 ? `rough night... ${data.sleepHours.toFixed(1)} hours.`
                : data.sleepHours < 6 ? `${data.sleepHours.toFixed(1)} hours of sleep. not great.`
                    : data.sleepHours >= 7 ? `${data.sleepHours.toFixed(1)} hours of sleep. solid.`
                        : `${data.sleepHours.toFixed(1)} hours of sleep.`)
            : '';
        triggers.push({
            type: 'morning',
            message: `[HEALTH TRIGGER: User just woke up (first app sync today — no band data). Sleep last night: ${sleepMsg || 'no data'}. Steps so far: ${data.steps || 0}. Send a natural morning message on Telegram. Reference the sleep data if available. Keep it short and warm.]`,
            priority: 'medium'
        });
    }
    // 2. Resting HR spike (if we have baseline)
    if (averages && data.restingHeartRate && averages.avgRHR > 0) {
        const deviation = data.restingHeartRate - averages.avgRHR;
        if (deviation > 10) {
            triggers.push({
                type: 'hr_spike',
                message: `[HEALTH TRIGGER: Resting heart rate is ${Math.round(data.restingHeartRate)} bpm — that's ${Math.round(deviation)} above their average of ${Math.round(averages.avgRHR)}. Ask if they're feeling okay. Could be stress, illness, poor sleep, or dehydration.]`,
                priority: 'high'
            });
        }
    }
    // 3. Very low sleep
    if (data.sleepHours && data.sleepHours < 4 && data.sleepHours > 0) {
        triggers.push({
            type: 'critical_sleep',
            message: `[HEALTH TRIGGER: User only got ${data.sleepHours.toFixed(1)} hours of sleep. That's dangerously low. Check in with genuine concern. Don't lecture — ask what happened.]`,
            priority: 'high'
        });
    }
    // 4. Steps milestone
    if (averages && data.steps && averages.avgSteps > 0) {
        if (data.steps > averages.avgSteps * 1.5 && data.steps > 8000) {
            triggers.push({
                type: 'steps_milestone',
                message: `[HEALTH TRIGGER: ${data.steps} steps today — way above their average of ${Math.round(averages.avgSteps)}. Give them a natural compliment. Keep it short. "big day" or "you've been moving."]`,
                priority: 'low'
            });
        }
    }
    // 5. Workout detected (sustained elevated HR)
    if (data.heartRate && typeof data.heartRate === 'number' && data.heartRate > 120) {
        triggers.push({
            type: 'workout_detected',
            message: `[HEALTH TRIGGER: Heart rate at ${Math.round(data.heartRate)} bpm — looks like they're working out right now. Don't interrupt. Just note it. When they're done (HR drops below 100), you can say "solid session" or ask what they did. For now, stay quiet.]`,
            priority: 'low'
        });
    }
    // 6. Inactivity (low steps late in the day)
    if (averages && data.steps !== undefined && averages.avgSteps > 0) {
        const hourCST = (new Date().getUTCHours() + 8) % 24;
        // After 4pm with less than 30% of average steps
        if (hourCST >= 16 && data.steps < averages.avgSteps * 0.3 && data.steps < 3000) {
            triggers.push({
                type: 'low_activity',
                message: `[HEALTH TRIGGER: Only ${data.steps} steps today and it's ${hourCST}:00. Their average is ${Math.round(averages.avgSteps)}. Gently suggest a walk. Don't nag. Something like "quiet day huh? even a 10 min walk would help."]`,
                priority: 'low'
            });
        }
    }
    // 7. Great sleep celebration
    if (data.sleepHours && data.sleepHours >= 8 && averages && averages.avgSleep > 0) {
        if (data.sleepHours > averages.avgSleep * 1.15) {
            triggers.push({
                type: 'great_sleep',
                message: `[HEALTH TRIGGER: ${data.sleepHours.toFixed(1)} hours of sleep — better than their average of ${averages.avgSleep.toFixed(1)}. Acknowledge it naturally. "you actually slept well" or "that's more like it."]`,
                priority: 'low'
            });
        }
    }
    // 8. Day-end summary — behavior-based, not cron
    // Fires when: steps haven't increased for 30+ min, it's within 2h of user's typical bedtime,
    // and we haven't sent a day-end summary today
    const dayEndPath = (0, path_1.join)(DATA_DIR, `dayend-${user.id}.json`);
    let dayEndState = { date: '', lastSteps: 0, stepsStableAt: '', summaryFired: false,
        bedtimeHistory: [] };
    if ((0, fs_1.existsSync)(dayEndPath)) {
        dayEndState = JSON.parse((0, fs_1.readFileSync)(dayEndPath, 'utf-8'));
    }
    const hourCST_dayend = (now.getUTCHours() + 8) % 24;
    const todayDate_dayend = today;
    if (dayEndState.date !== todayDate_dayend) {
        // New day — keep bedtime history, reset daily state
        dayEndState = {
            date: todayDate_dayend, lastSteps: 0, stepsStableAt: '', summaryFired: false,
            bedtimeHistory: dayEndState.bedtimeHistory || []
        };
    }
    if (!dayEndState.summaryFired && data.steps !== undefined) {
        const currentSteps = data.steps;
        // Detect steps plateau (no increase for 30+ min)
        if (currentSteps > dayEndState.lastSteps + 50) {
            // Still moving — update
            dayEndState.lastSteps = currentSteps;
            dayEndState.stepsStableAt = now.toISOString();
        }
        else if (!dayEndState.stepsStableAt) {
            dayEndState.stepsStableAt = now.toISOString();
            dayEndState.lastSteps = currentSteps;
        }
        // Calculate user's typical bedtime from history (default 23:00)
        const avgBedtime = dayEndState.bedtimeHistory.length >= 3
            ? Math.round(dayEndState.bedtimeHistory.reduce((a, b) => a + b, 0) / dayEndState.bedtimeHistory.length)
            : 23;
        // Fire conditions: steps stable 30+ min AND within 2h window before typical bedtime
        const stepsStableMinutes = dayEndState.stepsStableAt
            ? (now.getTime() - new Date(dayEndState.stepsStableAt).getTime()) / 60000
            : 0;
        const inBedtimeWindow = hourCST_dayend >= (avgBedtime - 2) && hourCST_dayend <= (avgBedtime + 1);
        // Also fire if it's very late (past midnight but before 3am) as a catch-all
        const isVeryLate = hourCST_dayend >= 0 && hourCST_dayend <= 3 && hourCST_dayend >= (avgBedtime > 21 ? 0 : avgBedtime);
        if (stepsStableMinutes >= 30 && (inBedtimeWindow || isVeryLate) && hourCST_dayend >= 20) {
            dayEndState.summaryFired = true;
            // Record this bedtime hour for learning
            dayEndState.bedtimeHistory.push(hourCST_dayend);
            // Keep last 14 days
            if (dayEndState.bedtimeHistory.length > 14) {
                dayEndState.bedtimeHistory = dayEndState.bedtimeHistory.slice(-14);
            }
            // Build calorie summary
            const caloriesBurned = data.activeCalories || 0;
            const basalCalories = data.basalCalories || 0;
            const totalBurned = caloriesBurned + basalCalories;
            const caloriesEaten = data.caloriesConsumed || 0; // from meal logging
            const calorieDelta = caloriesEaten > 0 ? caloriesEaten - totalBurned : 0;
            // Build steps/activity summary
            const steps = data.steps || 0;
            const exerciseMin = data.exerciseMinutes || 0;
            const distance = data.distanceWalkingRunning ? (data.distanceWalkingRunning / 1000).toFixed(1) : '?';
            let calorieMsg = '';
            if (caloriesEaten > 0) {
                calorieMsg = `Calories: ${caloriesEaten} eaten, ${totalBurned} burned (${caloriesBurned} active + ${basalCalories} basal). ${calorieDelta > 0 ? `Surplus: +${calorieDelta}` : `Deficit: ${calorieDelta}`}.`;
            }
            else {
                calorieMsg = `Calories burned: ${totalBurned} (${caloriesBurned} active + ${basalCalories} basal). No meal data logged today.`;
            }
            // Get sleep analysis from last night if available
            let sleepNote = '';
            if (data.sleepHours) {
                sleepNote = `Last night's sleep: ${data.sleepHours.toFixed(1)}h.`;
            }
            triggers.push({
                type: 'day_end_summary',
                message: `[HEALTH TRIGGER: Day-end summary. User has stopped moving for 30+ min and it's near their bedtime (typical: ${avgBedtime}:00).

Activity: ${steps} steps, ${distance}km walked, ${exerciseMin} min exercise.
${calorieMsg}
${sleepNote}
Heart: RHR ${data.restingHeartRate || '?'} bpm, HRV ${data.hrv || '?'} ms.

Send a natural end-of-day summary. Cover what went well, what could be better. Mention calories in/out if meal data exists. Give one specific suggestion for tomorrow. End with something about sleep. Keep Bryan's voice — short, warm, no lectures.]`,
                priority: 'medium'
            });
        }
    }
    (0, fs_1.writeFileSync)(dayEndPath, JSON.stringify(dayEndState));
    // 9. Consecutive good days (streak)
    const historyPath = (0, path_1.join)(DATA_DIR, `health-history-${user.id}.json`);
    if ((0, fs_1.existsSync)(historyPath)) {
        try {
            const days = JSON.parse((0, fs_1.readFileSync)(historyPath, 'utf-8'));
            const recent = days.slice(-3);
            if (recent.length >= 3) {
                const allGoodSleep = recent.every((d) => d.sleepHours && d.sleepHours >= 7);
                const allGoodSteps = recent.every((d) => d.steps && d.steps >= 7000);
                if (allGoodSleep && allGoodSteps) {
                    triggers.push({
                        type: 'streak',
                        message: `[HEALTH TRIGGER: 3+ days in a row of good sleep (7+ hours) and good activity (7K+ steps). That's a streak. Celebrate it. "three days straight. your body's noticing." Keep it genuine.]`,
                        priority: 'medium'
                    });
                }
            }
        }
        catch { }
    }
    return triggers;
}
const BRYAN_BOT_TOKEN = process.env.BRYAN_BOT_TOKEN || process.env.BOT_TOKEN || '';
const COMPANION_CONFIG = process.env.COMPANION_CONFIG || process.env.OPENCLAW_CONFIG_PATH || '/root/.openclaw-companion/openclaw.json';
const COMPANION_STATE = process.env.COMPANION_STATE || '/root/.openclaw-companion/';
// Cooldown: don't spam triggers (max 1 per type per hour per user)
const triggerCooldowns = new Map();
function canFireTrigger(userId, type, cooldownMs = 3600000) {
    const key = `${userId}:${type}`;
    const last = triggerCooldowns.get(key) || 0;
    if (Date.now() - last < cooldownMs)
        return false;
    triggerCooldowns.set(key, Date.now());
    return true;
}
// Track which trigger types fired today (persisted per-user for cron dedup)
function markTriggerFired(userId, type) {
    const path = (0, path_1.join)(DATA_DIR, `triggers-today-${userId}.json`);
    let today = {};
    if ((0, fs_1.existsSync)(path)) {
        try {
            today = JSON.parse((0, fs_1.readFileSync)(path, 'utf-8'));
        }
        catch { }
    }
    const dateKey = new Date().toISOString().split('T')[0];
    if (today._date !== dateKey)
        today = { _date: dateKey }; // reset on new day
    today[type] = Date.now();
    (0, fs_1.writeFileSync)(path, JSON.stringify(today));
}
function didTriggerFireToday(userId, type) {
    const path = (0, path_1.join)(DATA_DIR, `triggers-today-${userId}.json`);
    if (!(0, fs_1.existsSync)(path))
        return false;
    try {
        const today = JSON.parse((0, fs_1.readFileSync)(path, 'utf-8'));
        const dateKey = new Date().toISOString().split('T')[0];
        if (today._date !== dateKey)
            return false;
        return !!today[type];
    }
    catch {
        return false;
    }
}
// Internal API: check if a trigger fired today (crons call this to dedup)
app.get('/api/internal/trigger-status/:username/:type', (req, res) => {
    const username = req.params.username.replace('@', '');
    const type = req.params.type;
    const users = getUsers();
    const user = Object.values(users).find(u => u.telegramUsername === username);
    if (!user)
        return res.json({ fired: false });
    res.json({ fired: didTriggerFireToday(user.id, type) });
});
async function fireBryanTrigger(user, trigger) {
    const chatId = user.telegramChatId || user.telegramUsername;
    if (!chatId)
        return;
    // Cooldown: day_end_summary = 20h, everything else = 1h
    const cooldownMs = trigger.type === 'day_end_summary' ? 72000000 : 3600000;
    if (!canFireTrigger(user.id, trigger.type, cooldownMs)) {
        console.log(`[Companion] Trigger ${trigger.type} on cooldown for @${user.telegramUsername}`);
        return;
    }
    console.log(`[Companion] Firing trigger ${trigger.type} (${trigger.priority}) for @${user.telegramUsername}`);
    try {
        // Use OpenClaw CLI to run Bryan with the trigger prompt
        const { execSync } = require('child_process');
        const result = execSync(`OPENCLAW_CONFIG_PATH=${COMPANION_CONFIG} OPENCLAW_STATE_DIR=${COMPANION_STATE} openclaw agent --channel telegram --to ${chatId} -m "${trigger.message.replace(/"/g, '\\"')}"`, { timeout: 30000, encoding: 'utf-8' }).trim();
        // Filter non-responses
        if (!result || /^(HEARTBEAT_OK|SKIP|NO_REPLY)$/i.test(result)) {
            console.log(`[Companion] Trigger ${trigger.type} filtered: ${result}`);
            return;
        }
        // Send Bryan's response via Telegram
        await fetch(`https://api.telegram.org/bot${BRYAN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: result,
                parse_mode: 'Markdown'
            })
        });
        console.log(`[Companion] Trigger ${trigger.type} sent to @${user.telegramUsername}`);
        markTriggerFired(user.id, trigger.type);
    }
    catch (err) {
        console.error(`[Companion] Trigger ${trigger.type} failed:`, err.message);
    }
}
// Track recent historical syncs to suppress triggers during bulk import
const recentHistoricalSync = new Map();
// Receive health data from iOS app
app.post('/api/health', auth, async (req, res) => {
    const user = req.user;
    const data = req.body;
    updateUser(user.id, { lastHealth: data });
    // Skip triggers if a historical sync happened in the last 2 minutes (bulk import)
    const lastHistSync = recentHistoricalSync.get(user.id) || 0;
    const isBulkImport = Date.now() - lastHistSync < 120000;
    let triggerCount = 0;
    if (!isBulkImport) {
        const triggers = await analyzeHealthTriggers(user, data);
        for (const trigger of triggers) {
            await fireBryanTrigger(user, trigger);
        }
        triggerCount = triggers.length;
    }
    else {
        console.log(`[Companion] Skipping triggers for @${user.telegramUsername} — bulk import cooldown`);
    }
    // Update creature state
    const updatedUser = { ...user, lastHealth: data };
    const newState = evaluateCreatureState(updatedUser);
    updateUser(user.id, { creatureState: newState });
    res.json({ ok: true, creatureState: newState, triggers: triggerCount });
});
// Push user profile from HealthKit
app.post('/api/profile', auth, (req, res) => {
    const user = req.user;
    const profile = req.body;
    updateUser(user.id, { healthProfile: profile });
    console.log(`[Companion] Profile received for @${user.telegramUsername}: ${JSON.stringify(profile)}`);
    res.json({ ok: true });
});
// Get creature state
app.get('/api/creature', auth, (req, res) => {
    const user = req.user;
    const state = evaluateCreatureState(user);
    res.json({
        state,
        message: getCreatureMessage(state, user)
    });
});
function getCreatureMessage(state, user) {
    switch (state) {
        case 'glowing': return 'feeling good today.';
        case 'calm': return 'here with you.';
        case 'concerned': return 'something feels off...';
        case 'wilting': return 'i miss you.';
        case 'sleeping': return 'resting...';
        default: return 'here.';
    }
}
// Queue a command for the iOS app to pick up
app.post('/api/commands', auth, (req, res) => {
    const user = req.user;
    const { type, payload } = req.body;
    if (!type || !payload) {
        return res.status(400).json({ error: 'Missing type or payload' });
    }
    const commandsPath = (0, path_1.join)(DATA_DIR, `commands-${user.id}.json`);
    const commands = (0, fs_1.existsSync)(commandsPath)
        ? JSON.parse((0, fs_1.readFileSync)(commandsPath, 'utf-8'))
        : [];
    const cmd = {
        id: (0, crypto_1.randomUUID)(),
        type,
        payload,
        createdAt: new Date().toISOString(),
        executed: false
    };
    commands.push(cmd);
    (0, fs_1.writeFileSync)(commandsPath, JSON.stringify(commands, null, 2));
    console.log(`[Companion] Command queued for @${user.telegramUsername}: ${type}`);
    res.json({ ok: true, commandId: cmd.id });
});
// iOS app polls for pending commands
app.get('/api/commands/pending', auth, (req, res) => {
    const user = req.user;
    const commandsPath = (0, path_1.join)(DATA_DIR, `commands-${user.id}.json`);
    if (!(0, fs_1.existsSync)(commandsPath)) {
        return res.json({ commands: [] });
    }
    const commands = JSON.parse((0, fs_1.readFileSync)(commandsPath, 'utf-8'));
    const pending = commands.filter(c => !c.executed);
    res.json({ commands: pending });
});
// iOS app confirms command execution
app.post('/api/commands/:commandId/done', auth, (req, res) => {
    const user = req.user;
    const { commandId } = req.params;
    const commandsPath = (0, path_1.join)(DATA_DIR, `commands-${user.id}.json`);
    if (!(0, fs_1.existsSync)(commandsPath)) {
        return res.status(404).json({ error: 'No commands' });
    }
    const commands = JSON.parse((0, fs_1.readFileSync)(commandsPath, 'utf-8'));
    const cmd = commands.find(c => c.id === commandId);
    if (cmd) {
        cmd.executed = true;
        (0, fs_1.writeFileSync)(commandsPath, JSON.stringify(commands, null, 2));
    }
    res.json({ ok: true });
});
// ─── Internal API: Bryan triggers commands ───────────────────────
// This endpoint lets Bryan's OpenClaw instance queue commands for a user's phone
// No auth required (internal only, localhost)
app.post('/api/internal/command', (req, res) => {
    const { telegramUsername, type, payload } = req.body;
    if (!telegramUsername || !type || !payload) {
        return res.status(400).json({ error: 'Missing telegramUsername, type, or payload' });
    }
    const users = getUsers();
    const user = Object.values(users).find(u => u.telegramUsername === telegramUsername.replace('@', ''));
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    const commandsPath = (0, path_1.join)(DATA_DIR, `commands-${user.id}.json`);
    const commands = (0, fs_1.existsSync)(commandsPath)
        ? JSON.parse((0, fs_1.readFileSync)(commandsPath, 'utf-8'))
        : [];
    const cmd = {
        id: (0, crypto_1.randomUUID)(),
        type,
        payload,
        createdAt: new Date().toISOString(),
        executed: false
    };
    commands.push(cmd);
    (0, fs_1.writeFileSync)(commandsPath, JSON.stringify(commands, null, 2));
    console.log(`[Companion] Internal command for @${user.telegramUsername}: ${type} — ${JSON.stringify(payload)}`);
    res.json({ ok: true, commandId: cmd.id });
});
// ─── Siri voice command relay ────────────────────────────────────
app.post('/api/siri', auth, async (req, res) => {
    const user = req.user;
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Missing message' });
    }
    console.log(`[Companion] Siri command from @${user.telegramUsername}: ${message}`);
    // Route to Bryan via Telegram (Bryan will respond on Telegram)
    await sendToUser(user, `[via Siri] ${message}`);
    res.json({ ok: true });
});
// ─── Internal API: Bryan reads user health data ──────────────────
app.get('/api/internal/health/:identifier', (req, res) => {
    const identifier = req.params.identifier.replace('@', '');
    const users = getUsers();
    // Look up by: user ID, telegram username, telegram chat ID, or channel peer ID
    let user = null;
    for (const [id, u] of Object.entries(users)) {
        if (id === identifier ||
            u.telegramUsername === identifier ||
            String(u.telegramChatId) === identifier ||
            (u.channelLinks || []).some((l) => l.peerId === identifier)) {
            user = u;
            break;
        }
    }
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    const creatureState = evaluateCreatureState(user);
    res.json({
        username: user.telegramUsername,
        companionName: user.companionName,
        creatureState,
        lastHealth: user.lastHealth || null,
        healthProfile: user.healthProfile || null,
        lastScreenTime: user.lastScreenTime || null,
        registeredAt: user.createdAt
    });
});
// Internal: Bryan reads user health history
app.get('/api/internal/health-history/:identifier', (req, res) => {
    const identifier = req.params.identifier.replace('@', '');
    const users = getUsers();
    let user = null;
    for (const [id, u] of Object.entries(users)) {
        if (id === identifier ||
            u.telegramUsername === identifier ||
            String(u.telegramChatId) === identifier ||
            (u.channelLinks || []).some((l) => l.peerId === identifier)) {
            user = u;
            break;
        }
    }
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    const historyPath = (0, path_1.join)(DATA_DIR, `health-history-${user.id}.json`);
    if (!(0, fs_1.existsSync)(historyPath)) {
        return res.json({ username: user.telegramUsername, days: [], message: 'No historical data yet' });
    }
    const days = JSON.parse((0, fs_1.readFileSync)(historyPath, 'utf-8'));
    // Also compute summary stats
    const stepsArr = days.filter((d) => d.steps).map((d) => d.steps);
    const sleepArr = days.filter((d) => d.sleepHours).map((d) => d.sleepHours);
    const rhrArr = days.filter((d) => d.restingHeartRate).map((d) => d.restingHeartRate);
    const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
    const min = (arr) => arr.length ? Math.min(...arr) : null;
    const max = (arr) => arr.length ? Math.max(...arr) : null;
    res.json({
        username: user.telegramUsername,
        totalDays: days.length,
        dateRange: {
            earliest: days[days.length - 1]?.date,
            latest: days[0]?.date
        },
        summary: {
            steps: { avg: avg(stepsArr), min: min(stepsArr), max: max(stepsArr), daysWithData: stepsArr.length },
            sleep: { avg: avg(sleepArr), min: min(sleepArr), max: max(sleepArr), daysWithData: sleepArr.length },
            restingHR: { avg: avg(rhrArr), min: min(rhrArr), max: max(rhrArr), daysWithData: rhrArr.length }
        },
        recentDays: days.slice(0, 14) // last 2 weeks for quick analysis
    });
});
// ─── Multi-Tenant Endpoints ──────────────────────────────────────
// Look up user by channel + peerId (used by rule injector)
app.get('/api/internal/user-by-channel/:channel/:peerId', (req, res) => {
    const { channel, peerId } = req.params;
    const users = getUsers();
    for (const [id, user] of Object.entries(users)) {
        // Check channelLinks
        if (user.channelLinks) {
            for (const link of user.channelLinks) {
                if (link.channel === channel && link.peerId === peerId) {
                    return res.json({ ...user, id });
                }
            }
        }
        // Legacy telegram lookup
        if (channel === 'telegram' && user.telegramChatId === peerId) {
            return res.json({ ...user, id });
        }
    }
    res.status(404).json({ error: 'User not found' });
});
// Link a channel to an existing user + update OpenClaw identityLinks
app.post('/api/internal/link-channel', (req, res) => {
    const { userId, channel, peerId } = req.body;
    if (!userId || !channel || !peerId) {
        return res.status(400).json({ error: 'Missing userId, channel, or peerId' });
    }
    const users = getUsers();
    const user = users[userId];
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    if (!user.channelLinks)
        user.channelLinks = [];
    // Don't duplicate
    const exists = user.channelLinks.some(l => l.channel === channel && l.peerId === peerId);
    if (!exists) {
        user.channelLinks.push({ channel, peerId, linkedAt: new Date().toISOString() });
        users[userId] = user;
        saveUsers(users);
        console.log(`[Companion] Channel linked: ${channel}:${peerId} → user ${userId}`);
        // Update OpenClaw config: identityLinks + allowFrom
        try {
            const configPath = process.env.OPENCLAW_CONFIG_PATH || process.env.OPENCLAW_CONFIG_PATH || '/root/.openclaw-companion/openclaw.json';
            const config = JSON.parse((0, fs_1.readFileSync)(configPath, 'utf-8'));
            // 1. Add to allowFrom for the channel (so DM allowlist lets them through)
            const channelKey = channel === 'whatsapp-cloud' ? 'whatsapp-cloud' : channel;
            if (config.channels?.[channelKey]) {
                if (!config.channels[channelKey].allowFrom)
                    config.channels[channelKey].allowFrom = [];
                if (!config.channels[channelKey].allowFrom.includes(String(peerId))) {
                    config.channels[channelKey].allowFrom.push(String(peerId));
                    console.log(`[Companion] Added ${peerId} to ${channelKey} allowFrom`);
                }
            }
            // 2. Update identityLinks for cross-channel sessions
            if (!config.session)
                config.session = {};
            if (!config.session.identityLinks)
                config.session.identityLinks = {};
            const allLinks = user.channelLinks.map((l) => `${l.channel}:${l.peerId}`);
            if (allLinks.length >= 2) {
                config.session.identityLinks[userId] = allLinks;
                console.log(`[Companion] Updated identityLinks for ${userId}: ${allLinks.join(', ')}`);
            }
            (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2));
        }
        catch (err) {
            console.error(`[Companion] Failed to update OpenClaw config: ${err}`);
        }
    }
    res.json({ ok: true });
});
// Link Telegram via deep link token (/start link_XXXX)
app.post('/api/internal/link-by-token', (req, res) => {
    const { linkToken, channel, peerId } = req.body;
    if (!linkToken || !channel || !peerId) {
        return res.status(400).json({ error: 'Missing linkToken, channel, or peerId' });
    }
    const users = getUsers();
    const user = Object.values(users).find((u) => u.linkToken === linkToken);
    if (!user) {
        return res.status(404).json({ error: 'Invalid link token' });
    }
    // Link the channel
    if (!user.channelLinks)
        user.channelLinks = [];
    const exists = user.channelLinks.some((l) => l.channel === channel && String(l.peerId) === String(peerId));
    if (!exists) {
        user.channelLinks.push({ channel, peerId: String(peerId), linkedAt: new Date().toISOString() });
    }
    // Also set telegramChatId for backwards compat
    if (channel === 'telegram') {
        user.telegramChatId = String(peerId);
    }
    users[user.id] = user;
    saveUsers(users);
    console.log(`[Companion] Channel linked via token: ${channel}:${peerId} → user ${user.id} (${user.email})`);
    // Also update OpenClaw config (allowFrom + identityLinks)
    try {
        const configPath = process.env.OPENCLAW_CONFIG_PATH || '/root/.openclaw-companion/openclaw.json';
        const config = JSON.parse((0, fs_1.readFileSync)(configPath, 'utf-8'));
        const channelKey = channel === 'whatsapp-cloud' ? 'whatsapp-cloud' : channel;
        if (config.channels?.[channelKey]) {
            if (!config.channels[channelKey].allowFrom)
                config.channels[channelKey].allowFrom = [];
            if (!config.channels[channelKey].allowFrom.includes(String(peerId))) {
                config.channels[channelKey].allowFrom.push(String(peerId));
            }
        }
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(config, null, 2));
    }
    catch (err) {
        console.error(`[Companion] Failed to update OpenClaw config: ${err}`);
    }
    res.json({ ok: true, userId: user.id, email: user.email });
});
// List all users (internal, for crons)
app.get('/api/internal/users', (req, res) => {
    const users = getUsers();
    const list = Object.entries(users).map(([id, user]) => ({
        id,
        email: user.email,
        telegramUsername: user.telegramUsername,
        telegramChatId: user.telegramChatId,
        channelLinks: user.channelLinks || [],
        healthProfile: user.healthProfile,
        createdAt: user.createdAt,
    }));
    res.json(list);
});
// Magic link: send login email
app.post('/api/auth/magic-link', async (req, res) => {
    const { email } = req.body;
    if (!email)
        return res.status(400).json({ error: 'Missing email' });
    // Generate a 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiry = Date.now() + 15 * 60 * 1000; // 15 minutes
    // Store pending auth
    const authPath = (0, path_1.join)(DATA_DIR, 'pending-auth.json');
    let pending = {};
    if ((0, fs_1.existsSync)(authPath)) {
        try {
            pending = JSON.parse((0, fs_1.readFileSync)(authPath, 'utf-8'));
        }
        catch { }
    }
    pending[email.toLowerCase()] = { code, expiry, email: email.toLowerCase() };
    (0, fs_1.writeFileSync)(authPath, JSON.stringify(pending, null, 2));
    // Send via Resend API
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
        try {
            const emailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: 'Bryan <onboarding@resend.dev>',
                    to: email,
                    subject: 'Your Bryan verification code',
                    html: `<div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
            <h2 style="font-size: 24px; margin-bottom: 8px;">Your code</h2>
            <p style="font-size: 36px; font-weight: 700; letter-spacing: 8px; margin: 20px 0;">${code}</p>
            <p style="color: #666; font-size: 14px;">Enter this code in the Bryan app to continue. It expires in 15 minutes.</p>
          </div>`,
                }),
            });
            const result = await emailRes.json();
            console.log(`[Auth] Magic link sent to ${email}: ${result.id || 'error'}`);
        }
        catch (err) {
            console.error(`[Auth] Failed to send email to ${email}:`, err);
        }
    }
    else {
        console.log(`[Auth] No RESEND_API_KEY — code for ${email}: ${code}`);
    }
    res.json({ ok: true, message: 'Check your email' });
});
// Magic link: verify code
app.post('/api/auth/verify', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code)
        return res.status(400).json({ error: 'Missing email or code' });
    const authPath = (0, path_1.join)(DATA_DIR, 'pending-auth.json');
    let pending = {};
    if ((0, fs_1.existsSync)(authPath)) {
        try {
            pending = JSON.parse((0, fs_1.readFileSync)(authPath, 'utf-8'));
        }
        catch { }
    }
    const entry = pending[email.toLowerCase()];
    if (!entry)
        return res.status(401).json({ error: 'No pending auth for this email' });
    if (entry.code !== code)
        return res.status(401).json({ error: 'Wrong code' });
    if (Date.now() > entry.expiry)
        return res.status(401).json({ error: 'Code expired' });
    // Find or create user by email
    const users = getUsers();
    let user = Object.values(users).find(u => u.email === email.toLowerCase());
    if (!user) {
        // Create new user
        const id = (0, crypto_1.randomUUID)();
        const token = (0, crypto_1.randomUUID)();
        const linkToken = (0, crypto_1.randomUUID)().replace(/-/g, '').substring(0, 12);
        user = {
            id,
            token,
            linkToken,
            email: email.toLowerCase(),
            companionName: 'Bryan',
            telegramUsername: '',
            deviceId: '',
            createdAt: new Date().toISOString(),
            creatureState: 'calm',
            channelLinks: [],
            healthProfile: { language: 'en', companionGender: 'male', timezone: 'UTC' }
        };
        users[id] = user;
        saveUsers(users);
        // Create data directory
        const userDataDir = (0, path_1.join)(DATA_DIR, '..', '..', '.openclaw-companion', '.openclaw', 'workspace', 'data', 'users', id);
        (0, fs_1.mkdirSync)((0, path_1.join)(userDataDir, 'health'), { recursive: true });
        console.log(`[Auth] New user created via magic link: ${email} → ${id}`);
    }
    // Clean up pending auth
    delete pending[email.toLowerCase()];
    (0, fs_1.writeFileSync)(authPath, JSON.stringify(pending, null, 2));
    res.json({ token: user.token, userId: user.id });
});
// ─── Chat Proxy (REST → OpenClaw Gateway WS) ────────────────────
const ws_1 = __importDefault(require("ws"));
// @ts-ignore
const ed = __importStar(require("@noble/ed25519"));
const crypto_2 = require("crypto");
const GATEWAY_WS_URL = process.env.GATEWAY_WS_URL || 'ws://openclaw:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
let deviceIdentity = null;
function base64url(buf) {
    return Buffer.from(buf).toString('base64url');
}
// DATA_DIR may resolve to dist/data locally; use explicit /app/data in Docker or DATA_DIR env
const PERSISTENT_DIR = process.env.DATA_DIR || DATA_DIR;
const DEVICE_KEY_PATH = (0, path_1.join)(PERSISTENT_DIR, 'device-identity.json');
async function getDeviceIdentity() {
    if (deviceIdentity)
        return deviceIdentity;
    // Try loading persisted identity
    if ((0, fs_1.existsSync)(DEVICE_KEY_PATH)) {
        try {
            const saved = JSON.parse((0, fs_1.readFileSync)(DEVICE_KEY_PATH, 'utf-8'));
            if (saved.deviceId && saved.publicKey && saved.privateKey) {
                deviceIdentity = {
                    deviceId: saved.deviceId,
                    publicKey: saved.publicKey,
                    privateKey: Buffer.from(saved.privateKey, 'base64url')
                };
                console.log('[ChatProxy] Loaded device identity:', saved.deviceId.substring(0, 16) + '...');
                return deviceIdentity;
            }
        }
        catch { }
    }
    // Generate new identity
    const privateKey = ed.utils.randomSecretKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    const deviceId = (0, crypto_2.createHash)('sha256').update(publicKey).digest('hex');
    deviceIdentity = { deviceId, publicKey: base64url(publicKey), privateKey };
    // Persist to disk
    (0, fs_1.writeFileSync)(DEVICE_KEY_PATH, JSON.stringify({
        deviceId,
        publicKey: base64url(publicKey),
        privateKey: base64url(privateKey)
    }, null, 2));
    console.log('[ChatProxy] Created device identity:', deviceId.substring(0, 16) + '...');
    return deviceIdentity;
}
function createGatewayConnection() {
    return new Promise(async (resolve, reject) => {
        const identity = await getDeviceIdentity();
        const ws = new ws_1.default(GATEWAY_WS_URL, {
            headers: { 'Origin': 'http://localhost:18789' }
        });
        const conn = { ws, ready: false, pendingMessages: [] };
        let connected = false;
        ws.on('open', () => { });
        ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'event' && msg.event === 'connect.challenge') {
                    const nonce = msg.payload?.nonce || '';
                    const signedAt = Date.now();
                    const clientId = 'webchat-ui';
                    const clientMode = 'webchat';
                    const role = 'operator';
                    const scopes = ['operator.admin', 'operator.read', 'operator.write'];
                    const signPayload = ['v2', identity.deviceId, clientId, clientMode, role, scopes.join(','), String(signedAt), GATEWAY_TOKEN || '', nonce].join('|');
                    const sig = await ed.signAsync(new TextEncoder().encode(signPayload), identity.privateKey);
                    ws.send(JSON.stringify({
                        type: 'req', id: 'connect-1', method: 'connect',
                        params: {
                            minProtocol: 3, maxProtocol: 3,
                            client: { id: clientId, version: '1.0.0', platform: 'linux', mode: clientMode },
                            role, scopes, caps: ['tool-events'],
                            auth: { token: GATEWAY_TOKEN },
                            device: {
                                id: identity.deviceId,
                                publicKey: identity.publicKey,
                                signature: base64url(sig),
                                signedAt,
                                nonce
                            },
                            locale: 'en-US',
                            userAgent: 'companion-server/1.0.0'
                        }
                    }));
                    return;
                }
                if (msg.type === 'res' && msg.id === 'connect-1') {
                    if (msg.ok) {
                        conn.ready = true;
                        connected = true;
                        const auth = msg.payload?.auth;
                        console.log('[ChatProxy] Connected. Scopes:', JSON.stringify(auth?.scopes || 'none'));
                        resolve(conn);
                    }
                    else {
                        console.error('[ChatProxy] Connect failed:', JSON.stringify(msg.error));
                        reject(new Error(`Gateway connect failed: ${JSON.stringify(msg.error || msg)}`));
                    }
                    return;
                }
                if (msg.type === 'event' && msg.event === 'chat') {
                    const payload = msg.payload;
                    if (!payload)
                        return;
                    const pending = conn.pendingMessages.find(p => p.runId === payload.runId);
                    if (!pending)
                        return;
                    if (payload.state === 'delta') {
                        // Accumulate streaming text
                        if (payload.message) {
                            const text = typeof payload.message === 'string'
                                ? payload.message
                                : (payload.message.content || payload.message.text || '');
                            if (text)
                                pending.segments.push(text);
                        }
                    }
                    if (payload.state === 'final') {
                        // Extract final text
                        let finalText = '';
                        if (payload.message) {
                            if (typeof payload.message === 'string') {
                                finalText = payload.message;
                            }
                            else if (Array.isArray(payload.message)) {
                                finalText = payload.message
                                    .filter((b) => b.type === 'text')
                                    .map((b) => b.text)
                                    .join('');
                            }
                            else if (payload.message.content) {
                                if (typeof payload.message.content === 'string') {
                                    finalText = payload.message.content;
                                }
                                else if (Array.isArray(payload.message.content)) {
                                    finalText = payload.message.content
                                        .filter((b) => b.type === 'text')
                                        .map((b) => b.text)
                                        .join('');
                                }
                            }
                        }
                        // If no final text, use accumulated segments
                        if (!finalText && pending.segments.length > 0) {
                            finalText = pending.segments.join('');
                        }
                        // Remove from pending
                        conn.pendingMessages = conn.pendingMessages.filter(p => p.runId !== payload.runId);
                        pending.resolve(finalText || 'sorry, i got nothing.');
                    }
                }
                // Handle chat.send response (just acknowledge, real response comes via events)
                if (msg.type === 'res' && msg.id?.startsWith('chat-')) {
                    const runId = msg.id.replace('chat-', '');
                    if (!msg.ok) {
                        console.error('[ChatProxy] chat.send failed:', JSON.stringify(msg.error || msg));
                        const pending = conn.pendingMessages.find(p => p.runId === runId);
                        if (pending) {
                            conn.pendingMessages = conn.pendingMessages.filter(p => p.runId !== runId);
                            pending.reject(new Error(msg.error?.message || 'chat.send failed'));
                        }
                    }
                    else {
                        console.log('[ChatProxy] chat.send accepted for run:', runId);
                    }
                }
                // Log all events for debugging
                if (msg.type === 'event') {
                    console.log('[ChatProxy] Event:', msg.event, JSON.stringify(msg.payload || {}).substring(0, 200));
                }
            }
            catch (err) {
                console.error('[ChatProxy] Parse error:', err);
            }
        });
        ws.on('error', (err) => {
            console.error('[ChatProxy] WS error:', err.message);
            if (!connected)
                reject(err);
            // Reject all pending
            conn.pendingMessages.forEach(p => p.reject(new Error('Gateway connection lost')));
            conn.pendingMessages = [];
        });
        ws.on('close', () => {
            console.log('[ChatProxy] WS closed');
            conn.ready = false;
            conn.pendingMessages.forEach(p => p.reject(new Error('Gateway connection closed')));
            conn.pendingMessages = [];
        });
        // Timeout
        setTimeout(() => {
            if (!connected) {
                ws.close();
                reject(new Error('Gateway connection timeout'));
            }
        }, 10000);
    });
}
// Connection pool (one per process for now, scale later with pool)
let gatewayConn = null;
async function getGatewayConnection() {
    if (gatewayConn && gatewayConn.ready && gatewayConn.ws.readyState === ws_1.default.OPEN) {
        return gatewayConn;
    }
    gatewayConn = await createGatewayConnection();
    return gatewayConn;
}
app.post('/api/chat', auth, async (req, res) => {
    const user = req.user;
    const { message, sessionKey: customSessionKey } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Missing message' });
    }
    // Build session key — app users get their own session
    const sessionKey = customSessionKey || `agent:main:app:direct:${user.id}`;
    const runId = (0, crypto_1.randomUUID)();
    try {
        const conn = await getGatewayConnection();
        const responsePromise = new Promise((resolve, reject) => {
            conn.pendingMessages.push({ resolve, reject, runId, sessionKey, segments: [] });
            // Send chat.send
            conn.ws.send(JSON.stringify({
                type: 'req',
                id: `chat-${runId}`,
                method: 'chat.send',
                params: {
                    sessionKey,
                    message,
                    idempotencyKey: runId
                }
            }));
            // 60s timeout
            setTimeout(() => {
                const idx = conn.pendingMessages.findIndex(p => p.runId === runId);
                if (idx !== -1) {
                    conn.pendingMessages.splice(idx, 1);
                    reject(new Error('Chat response timeout'));
                }
            }, 60000);
        });
        const responseText = await responsePromise;
        res.json({
            message: responseText,
            sessionKey,
            runId
        });
    }
    catch (err) {
        console.error('[ChatProxy] Error:', err.message);
        // Reset connection on failure
        if (gatewayConn) {
            try {
                gatewayConn.ws.close();
            }
            catch { }
            gatewayConn = null;
        }
        res.status(502).json({ error: 'Failed to reach Bryan', detail: err.message });
    }
});
// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));
// ─── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[Companion] Server running on port ${PORT}`);
    console.log(`[Companion] OpenClaw gateway: ${OPENCLAW_GATEWAY}`);
    console.log(`[Companion] Gateway WS: ${GATEWAY_WS_URL}`);
});
//# sourceMappingURL=index.js.map