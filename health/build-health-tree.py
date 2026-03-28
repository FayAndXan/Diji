#!/usr/bin/env python3
"""
Builds a Markdown health tree from Bryan's JSON data files + health API.
Runs via cron every hour. Bryan reads the MD files, API stays as real-time fallback.
"""

import json, os, glob
from datetime import datetime, timedelta
from pathlib import Path

import sys
import urllib.request

# Multi-tenant: can run per-user or for all users
# Usage: build-health-tree.py [username]  — single user
#        build-health-tree.py --all       — all users with health data
USER_ARG = sys.argv[1] if len(sys.argv) > 1 else None
if not USER_ARG:
    print("Usage: build-health-tree.py <username>")
    sys.exit(1)

BASE_DATA_DIR = "/root/.openclaw-companion/.openclaw/workspace/data"
USERS_DIR = f"{BASE_DATA_DIR}/users"

def get_user_dirs():
    """Get all user data directories, or single one if specified"""
    if USER_ARG == "--all":
        # Fetch all users from API
        try:
            with urllib.request.urlopen("http://localhost:3950/api/internal/users", timeout=5) as r:
                users = json.loads(r.read())
            return [(u['id'], u.get('telegramUsername', u['id'])) for u in users]
        except:
            # Fallback: list directories
            if os.path.exists(USERS_DIR):
                return [(d, d) for d in os.listdir(USERS_DIR) if os.path.isdir(os.path.join(USERS_DIR, d))]
            return []
    else:
        return [(USER_ARG, USER_ARG)]

# Legacy paths (still used for backward compat during migration)
DATA_DIR = BASE_DATA_DIR
HEALTH_DIR = f"{DATA_DIR}/health"
API_URL = f"http://localhost:3950/api/internal/health/{USER_ARG}"
HISTORY_URL = f"http://localhost:3950/api/internal/health-history/{USER_ARG}"

def fetch_json(url):
    try:
        import urllib.request
        with urllib.request.urlopen(url, timeout=5) as r:
            return json.loads(r.read())
    except:
        return None

def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return None

def latest_file(pattern):
    files = sorted(glob.glob(f"{DATA_DIR}/{pattern}"))
    return files[-1] if files else None

def ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)

def write_md(path, content):
    with open(path, 'w') as f:
        f.write(content)

def build_vitals():
    data = fetch_json(API_URL)
    if not data or not data.get('lastHealth'):
        return
    h = data['lastHealth']
    profile = data.get('healthProfile', {}) or {}
    ts = h.get('timestamp', 'unknown')
    
    lines = [f"# Vitals — Last Updated {ts[:16]}\n"]
    
    if h.get('heartRate'): lines.append(f"Heart rate: {h['heartRate']} bpm")
    if h.get('restingHeartRate'): lines.append(f"Resting HR: {h['restingHeartRate']} bpm")
    if h.get('walkingHeartRateAverage'): lines.append(f"Walking HR avg: {h['walkingHeartRateAverage']} bpm")
    if h.get('hrv'): lines.append(f"HRV: {h['hrv']} ms")
    if h.get('oxygenSaturation'): lines.append(f"SpO2: {h['oxygenSaturation']}%")
    if h.get('respiratoryRate'): lines.append(f"Respiratory rate: {h['respiratoryRate']}/min")
    if h.get('bloodPressureSystolic'): lines.append(f"BP: {h['bloodPressureSystolic']}/{h.get('bloodPressureDiastolic','?')}")
    if h.get('bodyTemperature'): lines.append(f"Body temp: {h['bodyTemperature']}°C")
    
    write_md(f"{HEALTH_DIR}/vitals.md", '\n'.join(lines))

def build_activity():
    data = fetch_json(API_URL)
    if not data or not data.get('lastHealth'):
        return
    h = data['lastHealth']
    
    lines = [f"# Activity — Today\n"]
    if h.get('steps'): lines.append(f"Steps: {h['steps']:,}")
    if h.get('activeCalories'): lines.append(f"Active calories: {round(h['activeCalories'])} kcal")
    if h.get('basalCalories'): lines.append(f"Basal calories: {round(h['basalCalories'])} kcal")
    if h.get('distanceWalkingRunning'): lines.append(f"Distance: {round(h['distanceWalkingRunning'])}m")
    if h.get('flightsClimbed'): lines.append(f"Flights climbed: {h['flightsClimbed']}")
    if h.get('exerciseMinutes'): lines.append(f"Exercise: {round(h['exerciseMinutes'])} min")
    if h.get('vo2Max'): lines.append(f"VO2 max: {h['vo2Max']} ml/kg/min")
    
    write_md(f"{HEALTH_DIR}/activity.md", '\n'.join(lines))

def build_body():
    data = fetch_json(API_URL)
    if not data or not data.get('lastHealth'):
        return
    h = data['lastHealth']
    profile = data.get('healthProfile', {}) or {}
    
    lines = ["# Body\n"]
    if h.get('weight'): lines.append(f"Weight: {h['weight']} kg")
    if profile.get('heightCm'): lines.append(f"Height: {profile['heightCm']} cm")
    if h.get('bodyFatPercentage'): lines.append(f"Body fat: {h['bodyFatPercentage']}%")
    if h.get('bmi'): lines.append(f"BMI: {h['bmi']}")
    if h.get('leanBodyMass'): lines.append(f"Lean mass: {h['leanBodyMass']} kg")
    if profile.get('biologicalSex'): lines.append(f"Sex: {profile['biologicalSex']}")
    if profile.get('dateOfBirth'): lines.append(f"DOB: {profile['dateOfBirth'][:10]}")
    
    write_md(f"{HEALTH_DIR}/body.md", '\n'.join(lines))

def build_sleep():
    data = fetch_json(API_URL)
    if not data or not data.get('lastHealth'):
        return
    h = data['lastHealth']
    
    lines = ["# Sleep\n"]
    if h.get('sleepHours'):
        hrs = h['sleepHours']
        lines.append(f"Last night: {round(hrs, 1)}h")
        if hrs < 6: lines.append("⚠️ Under 6 hours")
        elif hrs >= 7.5: lines.append("✅ Good duration")
    else:
        lines.append("No sleep data yet")
    
    # Historical trends from API
    history = fetch_json(HISTORY_URL)
    if history and history.get('days'):
        days = history['days']
        sleep_days = [d for d in days[-7:] if d.get('sleepHours')]
        if sleep_days:
            avg = sum(d['sleepHours'] for d in sleep_days) / len(sleep_days)
            lines.append(f"\n## 7-Day Average")
            lines.append(f"Avg: {round(avg, 1)}h ({len(sleep_days)} days with data)")
    
    write_md(f"{HEALTH_DIR}/sleep.md", '\n'.join(lines))

def build_nutrition_today():
    today = datetime.now().strftime('%Y-%m-%d')
    meal_file = latest_file(f"meals-{today}.json")
    if not meal_file:
        meal_file = latest_file("meals-*.json")
    if not meal_file:
        return
    
    meals = load_json(meal_file)
    if not meals:
        return
    
    if isinstance(meals, dict):
        meals_list = meals.get('meals', [meals])
    elif isinstance(meals, list):
        meals_list = meals
    else:
        return
    
    total_cal = 0
    total_protein = 0
    lines = [f"# Nutrition — {os.path.basename(meal_file).replace('meals-','').replace('.json','')}\n"]
    
    for i, meal in enumerate(meals_list):
        name = meal.get('name', meal.get('meal', f'Meal {i+1}'))
        cal = meal.get('calories', meal.get('totalCalories', 0))
        pro = meal.get('protein', meal.get('totalProtein', 0))
        total_cal += cal or 0
        total_protein += pro or 0
        lines.append(f"**{name}**: {cal} kcal, {pro}g protein")
    
    lines.append(f"\n## Daily Total")
    lines.append(f"Calories: {total_cal} / 2200 kcal ({round(total_cal/2200*100)}%)")
    lines.append(f"Protein: {total_protein} / 118g ({round(total_protein/118*100)}%)")
    
    write_md(f"{HEALTH_DIR}/nutrition-today.md", '\n'.join(lines))

def build_supplements():
    supp_file = latest_file("supplements-*.json")
    if not supp_file:
        return
    
    data = load_json(supp_file)
    if not data:
        return
    
    lines = [f"# Supplements — {os.path.basename(supp_file).replace('.json','')}\n"]
    
    supps = data if isinstance(data, list) else data.get('supplements', [])
    for s in supps:
        name = s.get('name', 'Unknown')
        dose = s.get('dose', s.get('amount', ''))
        lines.append(f"{name}: {dose}")
    
    write_md(f"{HEALTH_DIR}/supplements.md", '\n'.join(lines))

def build_bloodwork():
    bw_file = latest_file("bloodwork-*.json")
    if not bw_file:
        return
    
    data = load_json(bw_file)
    if not data:
        return
    
    lines = [f"# Blood Work — {os.path.basename(bw_file).replace('bloodwork-','').replace('.json','')}\n"]
    
    markers = data.get('markers', data) if isinstance(data, dict) else data
    if isinstance(markers, list):
        for m in markers:
            name = m.get('name', '?')
            val = m.get('value', '?')
            unit = m.get('unit', '')
            ref = m.get('refRange', m.get('reference', ''))
            f = m.get('flag', '')
            flag = " ⚠️" if f and f.lower() in ('critical', 'high', 'low', 'abnormal') else ""
            lines.append(f"{name}: {val} {unit} (ref: {ref}){flag}")
    elif isinstance(markers, dict):
        for key, val in markers.items():
            if key in ('date', 'source', 'lab'):
                continue
            if isinstance(val, dict):
                v = val.get('value', '')
                ref = val.get('reference', val.get('range', ''))
                flag = " ⚠️" if val.get('flag') else ""
                lines.append(f"{key}: {v} (ref: {ref}){flag}")
            else:
                lines.append(f"{key}: {val}")
    
    write_md(f"{HEALTH_DIR}/bloodwork.md", '\n'.join(lines))

def build_symptoms():
    symp_file = f"{DATA_DIR}/symptoms.json"
    if not os.path.exists(symp_file):
        return
    
    data = load_json(symp_file)
    if not data:
        return
    
    symptoms = data if isinstance(data, list) else data.get('symptoms', [])
    if not symptoms:
        return
    
    # Last 30 days
    recent = symptoms[-30:]
    lines = ["# Symptoms — Recent\n"]
    for s in recent:
        date = s.get('date', s.get('timestamp', '?'))[:10]
        name = s.get('symptom', s.get('name', '?'))
        sev = s.get('severity', '?')
        lines.append(f"{date}: {name} (severity {sev})")
    
    write_md(f"{HEALTH_DIR}/symptoms.md", '\n'.join(lines))

def build_trends():
    history = fetch_json(HISTORY_URL)
    if not history or not history.get('days'):
        return
    
    days = history['days'][-14:]  # last 2 weeks
    
    lines = ["# Trends — Last 14 Days\n"]
    
    # Steps
    step_days = [d for d in days if d.get('steps')]
    if step_days:
        avg_steps = sum(d['steps'] for d in step_days) // len(step_days)
        best = max(step_days, key=lambda d: d['steps'])
        lines.append(f"## Steps")
        lines.append(f"Avg: {avg_steps:,}/day")
        lines.append(f"Best: {best['steps']:,} ({best.get('date','?')})")
    
    # Calories
    cal_days = [d for d in days if d.get('activeCalories')]
    if cal_days:
        avg_cal = round(sum(d['activeCalories'] for d in cal_days) / len(cal_days))
        lines.append(f"\n## Active Calories")
        lines.append(f"Avg: {avg_cal} kcal/day")
    
    # HR
    hr_days = [d for d in days if d.get('restingHeartRate')]
    if hr_days:
        avg_hr = round(sum(d['restingHeartRate'] for d in hr_days) / len(hr_days), 1)
        lines.append(f"\n## Resting Heart Rate")
        lines.append(f"Avg: {avg_hr} bpm")
    
    # HRV
    hrv_days = [d for d in days if d.get('hrv')]
    if hrv_days:
        avg_hrv = round(sum(d['hrv'] for d in hrv_days) / len(hrv_days), 1)
        lines.append(f"\n## HRV")
        lines.append(f"Avg: {avg_hrv} ms")
    
    write_md(f"{HEALTH_DIR}/trends.md", '\n'.join(lines))

def main():
    ensure_dir(HEALTH_DIR)
    
    print(f"[health-tree] Building at {datetime.now().isoformat()}")
    
    build_vitals()
    build_activity()
    build_body()
    build_sleep()
    build_nutrition_today()
    build_supplements()
    build_bloodwork()
    build_symptoms()
    build_trends()
    
    # Write index
    files = sorted(Path(HEALTH_DIR).glob("*.md"))
    index = ["# Health Data Tree\n", f"Updated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"]
    for f in files:
        if f.name != 'index.md':
            index.append(f"- [{f.stem}]({f.name})")
    write_md(f"{HEALTH_DIR}/index.md", '\n'.join(index))
    
    print(f"[health-tree] Done. {len(files)} files in {HEALTH_DIR}")

if __name__ == '__main__':
    main()
