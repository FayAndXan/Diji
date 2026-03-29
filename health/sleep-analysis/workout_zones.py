#!/usr/bin/env python3
"""
Workout Zone Analyzer — compute HR zones, calories, and recovery from HR data.

Input: list of (timestamp_epoch, bpm) tuples + user profile (age, weight)
Output: zone breakdown, avg/max HR, calories, recovery time estimate

HR Zones (% of max HR, where max = 220 - age):
- Zone 1 (Warm Up):     50-60% — very light, recovery
- Zone 2 (Fat Burn):    60-70% — light, endurance base
- Zone 3 (Cardio):      70-80% — moderate, aerobic fitness
- Zone 4 (Hard):        80-90% — hard, anaerobic threshold
- Zone 5 (Max):         90-100% — max effort, VO2max
"""

import json
import sys
import math


def compute_max_hr(age):
    """Estimate max HR using Tanaka formula (more accurate than 220-age)."""
    return 208 - 0.7 * age


def get_zone(bpm, max_hr):
    """Determine HR zone from BPM."""
    pct = bpm / max_hr * 100
    if pct < 50:
        return 0  # below zones (rest)
    elif pct < 60:
        return 1
    elif pct < 70:
        return 2
    elif pct < 80:
        return 3
    elif pct < 90:
        return 4
    else:
        return 5


def estimate_calories(hr_samples, weight_kg, age, is_male=True):
    """
    Estimate calories burned using HR-based formula.
    Keytel et al. (2005) — validated HR-calorie equation.
    """
    total_cal = 0
    for i in range(len(hr_samples) - 1):
        t1, hr1 = hr_samples[i]
        t2, hr2 = hr_samples[i + 1]
        duration_min = (t2 - t1) / 60
        avg_hr = (hr1 + hr2) / 2
        
        if duration_min <= 0 or duration_min > 30:  # skip gaps > 30 min
            continue
        
        if is_male:
            cal_per_min = (-55.0969 + 0.6309 * avg_hr + 0.1988 * weight_kg + 0.2017 * age) / 4.184
        else:
            cal_per_min = (-20.4022 + 0.4472 * avg_hr - 0.1263 * weight_kg + 0.074 * age) / 4.184
        
        cal_per_min = max(0, cal_per_min)
        total_cal += cal_per_min * duration_min
    
    return round(total_cal)


def detect_workouts(hr_samples, max_hr, min_duration_min=10, threshold_zone=3):
    """
    Auto-detect workout periods from HR data.
    A workout = sustained HR in zone 3+ for at least min_duration_min.
    """
    workouts = []
    current_start = None
    current_samples = []
    
    for ts, bpm in hr_samples:
        zone = get_zone(bpm, max_hr)
        if zone >= threshold_zone:
            if current_start is None:
                current_start = ts
                current_samples = [(ts, bpm)]
            else:
                current_samples.append((ts, bpm))
        else:
            if current_start and current_samples:
                duration_min = (current_samples[-1][0] - current_start) / 60
                if duration_min >= min_duration_min:
                    workouts.append({
                        'start': current_start,
                        'end': current_samples[-1][0],
                        'samples': current_samples,
                    })
            current_start = None
            current_samples = []
    
    # Don't forget last segment
    if current_start and current_samples:
        duration_min = (current_samples[-1][0] - current_start) / 60
        if duration_min >= min_duration_min:
            workouts.append({
                'start': current_start,
                'end': current_samples[-1][0],
                'samples': current_samples,
            })
    
    return workouts


def analyze_workout(hr_samples, age, weight_kg, is_male=True, workout_type=None):
    """
    Analyze a workout session from HR data.
    
    hr_samples: [(timestamp_epoch, bpm), ...]
    Returns: zone breakdown, stats, calories, recovery estimate
    """
    if not hr_samples or len(hr_samples) < 2:
        return {'error': 'Need at least 2 HR samples'}
    
    max_hr = compute_max_hr(age)
    hr_samples = sorted(hr_samples, key=lambda x: x[0])
    
    duration_min = (hr_samples[-1][0] - hr_samples[0][0]) / 60
    all_bpm = [bpm for _, bpm in hr_samples]
    
    # Zone time breakdown
    zone_minutes = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for i in range(len(hr_samples) - 1):
        t1, bpm1 = hr_samples[i]
        t2, bpm2 = hr_samples[i + 1]
        seg_min = (t2 - t1) / 60
        if seg_min > 15:  # skip gaps
            continue
        avg_bpm = (bpm1 + bpm2) / 2
        zone = get_zone(avg_bpm, max_hr)
        zone_minutes[zone] += seg_min
    
    # Calories
    calories = estimate_calories(hr_samples, weight_kg, age, is_male)
    
    # EPOC / recovery estimate (based on time in zones 4-5)
    intense_minutes = zone_minutes[4] + zone_minutes[5]
    if intense_minutes > 30:
        recovery_hours = 48
    elif intense_minutes > 15:
        recovery_hours = 36
    elif intense_minutes > 5:
        recovery_hours = 24
    else:
        recovery_hours = 12
    
    # Strain score (0-21 scale like Whoop)
    strain = 0
    for zone, mins in zone_minutes.items():
        if zone >= 3:
            strain += mins * (zone * 0.5)
    strain = min(21, round(strain / duration_min * 10, 1)) if duration_min > 0 else 0
    
    zone_names = {0: 'rest', 1: 'warm_up', 2: 'fat_burn', 3: 'cardio', 4: 'hard', 5: 'max'}
    
    result = {
        'duration_minutes': round(duration_min),
        'avg_hr': round(sum(all_bpm) / len(all_bpm)),
        'max_hr': round(max(all_bpm)),
        'min_hr': round(min(all_bpm)),
        'max_hr_percent': round(max(all_bpm) / max_hr * 100, 1),
        'calories': calories,
        'strain_score': strain,
        'recovery_hours': recovery_hours,
        'zones': {},
    }
    
    if workout_type:
        result['workout_type'] = workout_type
    
    for zone_num in range(1, 6):
        mins = round(zone_minutes[zone_num])
        pct = round(zone_minutes[zone_num] / duration_min * 100, 1) if duration_min > 0 else 0
        result['zones'][zone_names[zone_num]] = {
            'minutes': mins,
            'percent': pct,
            'hr_range': f"{round(max_hr * (0.4 + zone_num * 0.1))}-{round(max_hr * (0.5 + zone_num * 0.1))}",
        }
    
    return result


def analyze_day(hr_samples, age, weight_kg, is_male=True):
    """
    Analyze a full day of HR data.
    Auto-detect workouts, compute daily strain, resting HR.
    """
    if not hr_samples or len(hr_samples) < 10:
        return {'error': 'Need at least 10 HR samples for daily analysis'}
    
    max_hr = compute_max_hr(age)
    hr_samples = sorted(hr_samples, key=lambda x: x[0])
    all_bpm = [bpm for _, bpm in hr_samples]
    
    # Resting HR = lowest 5th percentile
    sorted_bpm = sorted(all_bpm)
    p5_idx = max(1, len(sorted_bpm) // 20)
    resting_hr = round(sum(sorted_bpm[:p5_idx]) / p5_idx)
    
    # Detect workouts
    workouts = detect_workouts(hr_samples, max_hr)
    workout_results = []
    for w in workouts:
        result = analyze_workout(w['samples'], age, weight_kg, is_male)
        workout_results.append(result)
    
    # Daily calories (total, including rest)
    total_calories = estimate_calories(hr_samples, weight_kg, age, is_male)
    
    # Daily strain (sum of workout strains)
    daily_strain = sum(w.get('strain_score', 0) for w in workout_results)
    daily_strain = min(21, daily_strain)
    
    return {
        'resting_hr': resting_hr,
        'avg_hr': round(sum(all_bpm) / len(all_bpm)),
        'max_hr': round(max(all_bpm)),
        'total_calories': total_calories,
        'daily_strain': daily_strain,
        'workouts_detected': len(workout_results),
        'workouts': workout_results,
        'sample_count': len(hr_samples),
    }


# --- CLI ---
if __name__ == '__main__':
    import random
    random.seed(42)
    
    # Simulate a day with a morning workout
    age = 35
    weight = 75
    base_time = 1711152000
    samples = []
    
    # Sleep (midnight-7am): low HR
    for i in range(84):  # 7h * 12 samples/h
        t = base_time + i * 300
        hr = random.gauss(55, 3)
        samples.append((t, max(42, min(80, hr))))
    
    # Morning (7-9am): gradually rising
    for i in range(24):
        t = base_time + 25200 + i * 300
        hr = random.gauss(70, 5)
        samples.append((t, max(55, min(90, hr))))
    
    # Workout (9-10am): elevated HR
    for i in range(12):
        t = base_time + 32400 + i * 300
        cycle = math.sin(i / 12 * math.pi)
        hr = 120 + cycle * 30 + random.gauss(0, 5)
        samples.append((t, max(100, min(185, hr))))
    
    # Afternoon (10am-6pm): normal
    for i in range(96):
        t = base_time + 36000 + i * 300
        hr = random.gauss(72, 5)
        samples.append((t, max(58, min(95, hr))))
    
    # Evening (6pm-midnight): winding down
    for i in range(72):
        t = base_time + 64800 + i * 300
        hr = random.gauss(65, 4)
        samples.append((t, max(55, min(85, hr))))
    
    result = analyze_day(samples, age, weight)
    print(json.dumps(result, indent=2))
