-- Diji Platform Database Schema
-- Foundation for all companions, all users, all data
-- Designed for 1M+ users with row-level isolation

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  token UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  link_token UUID UNIQUE DEFAULT uuid_generate_v4(),
  companion_name TEXT NOT NULL DEFAULT 'Bryan',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_token ON users (token);
CREATE INDEX idx_users_link_token ON users (link_token);

-- Channel links (telegram, whatsapp, wechat, app)
CREATE TABLE channel_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- 'telegram', 'whatsapp-cloud', 'openclaw-weixin', 'app'
  peer_id TEXT NOT NULL, -- chat ID, phone number, wxid, etc.
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, peer_id)
);

CREATE INDEX idx_channel_links_user ON channel_links (user_id);
CREATE INDEX idx_channel_links_lookup ON channel_links (channel, peer_id);

-- ============================================================
-- HEALTH PROFILES
-- ============================================================

CREATE TABLE health_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  companion_gender TEXT NOT NULL DEFAULT 'male',
  companion_name TEXT NOT NULL DEFAULT 'Bryan',
  has_band BOOLEAN NOT NULL DEFAULT false,
  sleeps_with_band BOOLEAN NOT NULL DEFAULT false,
  -- From HealthKit auto-profile
  dob DATE,
  sex TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  -- User-set
  activity_level TEXT, -- sedentary, light, moderate, active, very_active
  goal TEXT, -- lose_weight, maintain, lean_bulk, muscle
  dietary_restrictions TEXT[], -- vegetarian, vegan, halal, kosher, gluten_free, etc.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HEALTH DATA (from HealthKit syncs)
-- ============================================================

-- Raw health snapshots from app syncs
CREATE TABLE health_syncs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  steps INTEGER,
  active_calories NUMERIC,
  basal_calories NUMERIC,
  sleep_hours NUMERIC,
  resting_heart_rate NUMERIC,
  heart_rate NUMERIC,
  hrv NUMERIC,
  weight_kg NUMERIC,
  body_fat_pct NUMERIC,
  blood_oxygen NUMERIC,
  respiratory_rate NUMERIC,
  -- Raw JSON for everything else
  raw_data JSONB,
  overnight_hr JSONB -- array of {timestamp, bpm} for sleep analysis
);

CREATE INDEX idx_health_syncs_user_time ON health_syncs (user_id, synced_at DESC);
-- Partition by month for large scale
-- CREATE TABLE health_syncs_2026_03 PARTITION OF health_syncs FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- ============================================================
-- MEALS & NUTRITION
-- ============================================================

CREATE TABLE meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items JSONB NOT NULL, -- [{name, grams, calories, protein, carbs, fat, fiber}]
  totals JSONB NOT NULL, -- {calories, protein, carbs, fat, fiber}
  vitamins JSONB, -- {A_mcg, C_mg, D_mcg, ...}
  minerals JSONB, -- {calcium_mg, iron_mg, ...}
  source TEXT DEFAULT 'chat', -- 'chat', 'photo', 'app'
  written_to_healthkit BOOLEAN DEFAULT false
);

CREATE INDEX idx_meals_user_time ON meals (user_id, logged_at DESC);

-- Food memory (what the user typically eats)
CREATE TABLE food_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  last_grams NUMERIC,
  count INTEGER DEFAULT 1,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, food_name)
);

-- ============================================================
-- SUPPLEMENTS
-- ============================================================

CREATE TABLE supplement_stacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplement_name TEXT NOT NULL,
  brand TEXT,
  ingredients JSONB, -- [{name, dose, unit, percentDV}]
  fillers TEXT[],
  verdict TEXT, -- KEEP, REPLACE, DROP, ADJUST
  timing TEXT, -- morning, evening, with_meals
  notes TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supplements_user ON supplement_stacks (user_id);

-- ============================================================
-- BLOOD WORK
-- ============================================================

CREATE TABLE blood_work (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_date DATE NOT NULL,
  lab_name TEXT,
  markers JSONB NOT NULL, -- {category: {marker: {value, unit, flag, refRange, optimalRange}}}
  next_retest DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blood_work_user ON blood_work (user_id, test_date DESC);

-- ============================================================
-- WORKOUTS
-- ============================================================

CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_date DATE NOT NULL,
  type TEXT NOT NULL, -- strength, cardio, mixed
  duration_min INTEGER,
  exercises JSONB, -- [{name, sets, reps, weight_kg, rpe}]
  zone_analysis JSONB, -- from sleep analysis API
  strain_score NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workouts_user ON workouts (user_id, workout_date DESC);

-- ============================================================
-- SYMPTOMS
-- ============================================================

CREATE TABLE symptoms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symptom TEXT NOT NULL,
  severity INTEGER CHECK (severity BETWEEN 1 AND 3), -- 1=mild, 2=moderate, 3=severe
  written_to_healthkit BOOLEAN DEFAULT false
);

CREATE INDEX idx_symptoms_user ON symptoms (user_id, logged_at DESC);

-- ============================================================
-- LONGEVITY PLANS
-- ============================================================

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_data JSONB NOT NULL, -- {sleep, nutrition, exercise, supplements, biomarkers}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEMORY (Bryan's memory of each user)
-- ============================================================

CREATE TABLE companion_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  topic TEXT, -- name, preference, health_goal, pattern, correction
  source TEXT DEFAULT 'conversation', -- conversation, observation, health_data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_user ON companion_memory (user_id, created_at DESC);

-- ============================================================
-- SESSIONS (OpenClaw conversation state)
-- ============================================================

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_key TEXT UNIQUE NOT NULL, -- agent:main:telegram:direct:CHAT_ID
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Session JSONL stored as rows for queryability
  message_count INTEGER DEFAULT 0,
  token_usage INTEGER DEFAULT 0
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_key ON sessions (session_key);
CREATE INDEX idx_sessions_active ON sessions (last_active DESC);

-- Session messages (replaces JSONL files)
CREATE TABLE session_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- user, assistant, system, tool
  content JSONB NOT NULL,
  token_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_messages_session ON session_messages (session_id, created_at);

-- ============================================================
-- TRIGGERS & JOBS
-- ============================================================

-- Trigger dedup (prevent spamming same trigger)
CREATE TABLE trigger_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL, -- morning, hr_spike, critical_sleep, etc.
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fired_date DATE NOT NULL DEFAULT CURRENT_DATE,
  message TEXT,
  UNIQUE (user_id, trigger_type, fired_date)
);
CREATE INDEX idx_trigger_log_user ON trigger_log (user_id, fired_at DESC);

-- Device pairing persistence
CREATE TABLE device_pairings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  role TEXT DEFAULT 'operator',
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SCHEDULED JOBS (replaces crontab)
-- ============================================================

CREATE TABLE scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL = system job
  job_type TEXT NOT NULL, -- morning_checkin, lunch_reminder, daily_report, weekly_report, etc.
  cron_expression TEXT, -- NULL for one-shot
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  payload JSONB, -- any job-specific data
  channel TEXT, -- telegram, whatsapp-cloud, etc.
  target_id TEXT, -- peer ID to send to
  enabled BOOLEAN DEFAULT true,
  delete_after_run BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scheduled_jobs_next ON scheduled_jobs (next_run_at) WHERE enabled = true;
CREATE INDEX idx_scheduled_jobs_user ON scheduled_jobs (user_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER health_profiles_updated_at BEFORE UPDATE ON health_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER supplement_stacks_updated_at BEFORE UPDATE ON supplement_stacks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
