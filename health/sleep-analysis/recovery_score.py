#!/usr/bin/env python3
"""
Recovery & Readiness Score — 0-100 score from sleep + HR + activity data.

Inspired by Whoop Recovery and Oura Readiness.

Components (weighted):
- Resting HR vs baseline (25%) — lower = more recovered
- HRV proxy vs baseline (25%) — higher = more recovered  
- Sleep quality (25%) — duration + efficiency + deep %
- Previous day strain (15%) — high strain = needs more recovery
- Sleep consistency (10%) — regular bedtime = better recovery

Score bands:
- 0-33: Red (take it easy, recovery needed)
- 34-66: Yellow (moderate activity OK)  
- 67-100: Green (fully recovered, go hard)
"""

import json
import sys
import math


def compute_rhr_score(resting_hr, baseline_rhr=None):
    """
    Score resting HR vs personal baseline.
    Lower than baseline = good recovery.
    """
    if baseline_rhr is None:
        # Default baseline if no history
        baseline_rhr = 60
    
    diff = resting_hr - baseline_rhr
    
    if diff <= -5:
        return 100  # Well below baseline
    elif diff <= -2:
        return 85
    elif diff <= 0:
        return 75  # At baseline
    elif diff <= 2:
        return 60
    elif diff <= 5:
        return 40
    elif diff <= 8:
        return 20
    else:
        return 5  # Way above baseline = stressed/sick


def compute_hrv_score(hr_variability, baseline_hrv=None):
    """
    Score HRV proxy (std of sleeping HR) vs personal baseline.
    With sparse data, we use HR std during sleep as HRV proxy.
    Higher variability during sleep = better autonomic recovery.
    
    Note: This is a PROXY. Real HRV needs beat-to-beat intervals.
    But HR std during sleep correlates ~0.7 with RMSSD.
    """
    if baseline_hrv is None:
        baseline_hrv = 3.0  # Default baseline std
    
    ratio = hr_variability / baseline_hrv if baseline_hrv > 0 else 1.0
    
    if ratio >= 1.3:
        return 100
    elif ratio >= 1.1:
        return 85
    elif ratio >= 0.9:
        return 70
    elif ratio >= 0.7:
        return 50
    elif ratio >= 0.5:
        return 30
    else:
        return 10


def compute_sleep_score(sleep_summary):
    """
    Score sleep quality from classifier output.
    Considers: duration, efficiency, deep %, REM %.
    """
    score = 0
    
    # Duration (target 7-9 hours)
    duration_h = sleep_summary.get('total_sleep_minutes', 0) / 60
    if 7 <= duration_h <= 9:
        score += 30
    elif 6 <= duration_h < 7 or 9 < duration_h <= 10:
        score += 20
    elif 5 <= duration_h < 6:
        score += 10
    else:
        score += 0
    
    # Efficiency (% of time asleep vs in bed)
    efficiency = sleep_summary.get('sleep_efficiency', 0)
    if efficiency >= 90:
        score += 25
    elif efficiency >= 80:
        score += 18
    elif efficiency >= 70:
        score += 10
    else:
        score += 3
    
    stages = sleep_summary.get('stages', {})
    
    # Deep sleep % (target 15-25%)
    deep_pct = stages.get('deep', {}).get('percent', 0)
    if 15 <= deep_pct <= 30:
        score += 25
    elif 10 <= deep_pct < 15 or 30 < deep_pct <= 40:
        score += 15
    elif deep_pct > 0:
        score += 5
    
    # REM % (target 20-25%)
    rem_pct = stages.get('rem', {}).get('percent', 0)
    if 18 <= rem_pct <= 30:
        score += 20
    elif 12 <= rem_pct < 18 or 30 < rem_pct <= 35:
        score += 12
    elif rem_pct > 0:
        score += 5
    
    return min(100, score)


def compute_strain_penalty(daily_strain):
    """
    Higher previous day strain = more recovery needed.
    Returns 0-100 (100 = low strain, easy to recover).
    """
    if daily_strain <= 5:
        return 100
    elif daily_strain <= 10:
        return 75
    elif daily_strain <= 15:
        return 50
    elif daily_strain <= 18:
        return 30
    else:
        return 15


def compute_consistency_score(bedtime_deviation_min):
    """
    Score based on bedtime consistency.
    bedtime_deviation_min: how far off from usual bedtime (in minutes).
    """
    if bedtime_deviation_min <= 15:
        return 100
    elif bedtime_deviation_min <= 30:
        return 80
    elif bedtime_deviation_min <= 60:
        return 50
    elif bedtime_deviation_min <= 120:
        return 25
    else:
        return 10


def compute_recovery_score(
    resting_hr,
    sleep_hr_std,
    sleep_summary,
    daily_strain=0,
    bedtime_deviation_min=30,
    baseline_rhr=None,
    baseline_hrv=None,
):
    """
    Main entry point — compute recovery/readiness score 0-100.
    
    Args:
        resting_hr: lowest sleeping HR (BPM)
        sleep_hr_std: std deviation of sleeping HR (HRV proxy)
        sleep_summary: output from classifier.compute_summary()
        daily_strain: previous day strain score (0-21)
        bedtime_deviation_min: minutes from usual bedtime
        baseline_rhr: personal baseline resting HR (learned over time)
        baseline_hrv: personal baseline HR std (learned over time)
    """
    rhr_score = compute_rhr_score(resting_hr, baseline_rhr)
    hrv_score = compute_hrv_score(sleep_hr_std, baseline_hrv)
    sleep_score = compute_sleep_score(sleep_summary)
    strain_score = compute_strain_penalty(daily_strain)
    consistency = compute_consistency_score(bedtime_deviation_min)
    
    # Weighted combination
    recovery = (
        rhr_score * 0.25 +
        hrv_score * 0.25 +
        sleep_score * 0.25 +
        strain_score * 0.15 +
        consistency * 0.10
    )
    
    recovery = round(min(100, max(0, recovery)))
    
    # Band
    if recovery >= 67:
        band = 'green'
        recommendation = 'Fully recovered. Go hard today.'
    elif recovery >= 34:
        band = 'yellow'
        recommendation = 'Moderate recovery. Keep it moderate or do a light session.'
    else:
        band = 'red'
        recommendation = 'Low recovery. Focus on rest and easy movement.'
    
    return {
        'score': recovery,
        'band': band,
        'recommendation': recommendation,
        'components': {
            'resting_hr': {'score': rhr_score, 'value': resting_hr, 'weight': 0.25},
            'hrv_proxy': {'score': hrv_score, 'value': round(sleep_hr_std, 2), 'weight': 0.25},
            'sleep_quality': {'score': sleep_score, 'weight': 0.25},
            'strain_recovery': {'score': strain_score, 'value': daily_strain, 'weight': 0.15},
            'consistency': {'score': consistency, 'value': bedtime_deviation_min, 'weight': 0.10},
        },
        'version': '1.0',
    }


# --- CLI ---
if __name__ == '__main__':
    # Demo with realistic values
    sleep_summary = {
        'total_sleep_minutes': 460,
        'sleep_efficiency': 91.3,
        'stages': {
            'wake': {'minutes': 40, 'percent': 8.7},
            'light': {'minutes': 180, 'percent': 39.1},
            'deep': {'minutes': 110, 'percent': 23.9},
            'rem': {'minutes': 130, 'percent': 28.3},
        }
    }
    
    result = compute_recovery_score(
        resting_hr=52,
        sleep_hr_std=3.2,
        sleep_summary=sleep_summary,
        daily_strain=12,
        bedtime_deviation_min=20,
        baseline_rhr=55,
        baseline_hrv=3.0,
    )
    
    print(json.dumps(result, indent=2))
