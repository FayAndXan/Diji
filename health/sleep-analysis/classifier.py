#!/usr/bin/env python3
"""
Sleep Stage Classifier v1 — Rule-based estimation from sparse HR data.

Input: list of (timestamp_epoch, bpm) tuples during sleep window
Output: list of (timestamp_epoch, stage) where stage is wake/light/deep/rem

Based on established cardiology:
- Deep sleep: HR at nadir, low variability (parasympathetic dominance)
- REM: HR variability increases, mean rises slightly (sympathetic bursts)  
- Light: intermediate HR and variability
- Wake: HR elevates sharply, high variability

References:
- Murali et al., "Cardiorespiratory Sleep Staging" (PMC8314617)
- Neurobit-HRV validation (PMC9584568)
- Oura Ring sleep staging methodology (published white papers)
"""

import json
import sys
import math
from datetime import datetime, timezone

EPOCH_SECONDS = None  # Auto-detect from data density

def detect_epoch_seconds(samples):
    """Auto-detect sampling interval from actual data gaps."""
    if len(samples) < 3:
        return 120
    samples = sorted(samples, key=lambda x: x[0])
    gaps = [samples[i+1][0] - samples[i][0] for i in range(min(len(samples)-1, 50))]
    gaps = [g for g in gaps if 30 < g < 1800]  # ignore <30s duplicates and >30min gaps
    if not gaps:
        return 120
    # Use median gap as epoch size
    gaps.sort()
    median_gap = gaps[len(gaps) // 2]
    # Round to nearest 30s
    return max(60, round(median_gap / 30) * 30)


def interpolate_hr(samples, epoch_seconds=None):
    """
    Interpolate sparse HR samples into uniform epochs.
    samples: [(timestamp_epoch, bpm), ...]
    Returns: [(epoch_start, interpolated_bpm), ...]
    """
    if len(samples) < 2:
        return samples
    
    samples = sorted(samples, key=lambda x: x[0])
    start = samples[0][0]
    end = samples[-1][0]
    
    epochs = []
    t = start
    while t <= end:
        # Find surrounding samples
        before = None
        after = None
        for ts, bpm in samples:
            if ts <= t:
                before = (ts, bpm)
            if ts >= t and after is None:
                after = (ts, bpm)
        
        if before and after and before[0] != after[0]:
            # Linear interpolation
            frac = (t - before[0]) / (after[0] - before[0])
            bpm = before[1] + frac * (after[1] - before[1])
        elif before:
            bpm = before[1]
        elif after:
            bpm = after[1]
        else:
            bpm = samples[0][1]
        
        epochs.append((t, round(bpm, 1)))
        t += epoch_seconds
    
    return epochs


def compute_features(epochs, window=8):
    """
    Compute features for each epoch using a sliding window.
    window: number of epochs in each direction for context
    
    Features per epoch:
    - hr_mean: mean HR in window
    - hr_std: std HR in window (proxy for HRV)
    - hr_relative: how far below/above personal baseline
    - hr_trend: rising/falling/stable
    - hr_min_distance: how close to overnight minimum
    """
    if len(epochs) < 3:
        return []
    
    all_bpm = [bpm for _, bpm in epochs]
    overnight_min = min(all_bpm)
    overnight_max = max(all_bpm)
    overnight_mean = sum(all_bpm) / len(all_bpm)
    overnight_range = overnight_max - overnight_min if overnight_max > overnight_min else 1
    
    features = []
    for i, (ts, bpm) in enumerate(epochs):
        start = max(0, i - window)
        end = min(len(epochs), i + window + 1)
        window_bpm = [b for _, b in epochs[start:end]]
        
        hr_mean = sum(window_bpm) / len(window_bpm)
        hr_std = math.sqrt(sum((b - hr_mean)**2 for b in window_bpm) / len(window_bpm))
        hr_relative = (bpm - overnight_mean) / overnight_range  # -1 to +1 ish
        hr_min_distance = (bpm - overnight_min) / overnight_range  # 0 = at minimum
        
        # Trend: compare current window mean to previous window mean
        if i >= window:
            prev_bpm = [b for _, b in epochs[max(0, i-2*window):i]]
            prev_mean = sum(prev_bpm) / len(prev_bpm) if prev_bpm else hr_mean
            hr_trend = hr_mean - prev_mean
        else:
            hr_trend = 0
        
        features.append({
            'timestamp': ts,
            'bpm': bpm,
            'hr_mean': round(hr_mean, 1),
            'hr_std': round(hr_std, 2),
            'hr_relative': round(hr_relative, 3),
            'hr_min_distance': round(hr_min_distance, 3),
            'hr_trend': round(hr_trend, 2),
        })
    
    return features


def classify_stages(features):
    """
    Rule-based sleep stage classification.
    
    Thresholds calibrated from sleep science literature:
    - Deep sleep: ~20% of total sleep, lowest HR, lowest variability
    - REM: ~25% of total sleep, higher variability than deep, HR rises
    - Light: ~55% of total sleep, everything in between
    - Wake: sharp HR increases, highest variability
    
    Sleep cycles ~90 min. Deep dominates early, REM dominates late.
    """
    if not features:
        return []
    
    total_epochs = len(features)
    results = []
    
    for i, f in enumerate(features):
        # Position in the night (0.0 = start, 1.0 = end)
        night_position = i / total_epochs if total_epochs > 1 else 0.5
        
        score_deep = 0
        score_rem = 0
        score_light = 0
        score_wake = 0
        
        # --- HR level relative to overnight minimum ---
        if f['hr_min_distance'] < 0.15:
            score_deep += 3  # Very close to minimum = deep
        elif f['hr_min_distance'] < 0.3:
            score_deep += 1
            score_light += 1
        elif f['hr_min_distance'] < 0.5:
            score_light += 2
            score_rem += 1
        elif f['hr_min_distance'] < 0.7:
            score_rem += 1
            score_light += 1
            score_wake += 1
        else:
            score_wake += 3
        
        # --- HR variability (std as HRV proxy) ---
        if f['hr_std'] < 1.5:
            score_deep += 2  # Very steady = deep sleep
        elif f['hr_std'] < 3.0:
            score_light += 1
            score_deep += 1
        elif f['hr_std'] < 5.0:
            score_rem += 2  # Moderate variability = REM
            score_light += 1
        else:
            score_wake += 2  # High variability = wake or REM
            score_rem += 1
        
        # --- HR trend ---
        if f['hr_trend'] > 2:
            score_wake += 2  # Rising HR = waking up
            score_rem += 1
        elif f['hr_trend'] > 0.5:
            score_rem += 1
            score_light += 1
        elif f['hr_trend'] < -2:
            score_deep += 2  # Falling HR = entering deep sleep
        elif f['hr_trend'] < -0.5:
            score_deep += 1
            score_light += 1
        
        # --- Night position bias (sleep architecture) ---
        # First third: more deep sleep
        if night_position < 0.33:
            score_deep += 1
        # Last third: more REM
        elif night_position > 0.66:
            score_rem += 1
        
        # --- Determine stage ---
        scores = {
            'deep': score_deep,
            'rem': score_rem,
            'light': score_light,
            'wake': score_wake,
        }
        stage = max(scores, key=scores.get)
        
        results.append({
            'timestamp': f['timestamp'],
            'bpm': f['bpm'],
            'stage': stage,
            'confidence': scores[stage] / sum(scores.values()) if sum(scores.values()) > 0 else 0,
            'scores': scores,
        })
    
    return results


def smooth_stages(results, min_duration_epochs=2):
    """
    Post-processing: remove single-epoch stage flickers.
    A stage must persist for at least min_duration_epochs to count.
    """
    if len(results) < 3:
        return results
    
    smoothed = [r.copy() for r in results]
    
    for i in range(1, len(smoothed) - 1):
        if smoothed[i]['stage'] != smoothed[i-1]['stage'] and smoothed[i]['stage'] != smoothed[i+1]['stage']:
            # Single epoch different from both neighbors - smooth it
            # Use the neighbor with higher confidence
            if smoothed[i-1]['confidence'] >= smoothed[i+1]['confidence']:
                smoothed[i]['stage'] = smoothed[i-1]['stage']
            else:
                smoothed[i]['stage'] = smoothed[i+1]['stage']
            smoothed[i]['smoothed'] = True
    
    return smoothed


def compute_summary(results, epoch_seconds=EPOCH_SECONDS):
    """Compute sleep stage summary statistics."""
    if not results:
        return {}
    
    stage_counts = {'wake': 0, 'light': 0, 'deep': 0, 'rem': 0}
    for r in results:
        stage_counts[r['stage']] = stage_counts.get(r['stage'], 0) + 1
    
    total = sum(stage_counts.values())
    total_minutes = total * epoch_seconds / 60
    
    summary = {
        'total_sleep_minutes': round(total_minutes),
        'stages': {},
        'avg_hr': round(sum(r['bpm'] for r in results) / len(results), 1),
        'min_hr': round(min(r['bpm'] for r in results), 1),
        'max_hr': round(max(r['bpm'] for r in results), 1),
        'sleep_efficiency': round((1 - stage_counts['wake'] / total) * 100, 1) if total > 0 else 0,
    }
    
    for stage in ['wake', 'light', 'deep', 'rem']:
        minutes = stage_counts[stage] * epoch_seconds / 60
        pct = stage_counts[stage] / total * 100 if total > 0 else 0
        summary['stages'][stage] = {
            'minutes': round(minutes),
            'percent': round(pct, 1),
        }
    
    return summary


def analyze_sleep(hr_samples, sleep_start=None, sleep_end=None):
    """
    Main entry point.
    
    hr_samples: [(timestamp_epoch_seconds, bpm), ...]
    sleep_start: epoch timestamp of sleep start (optional, auto-detect)
    sleep_end: epoch timestamp of sleep end (optional, auto-detect)
    
    Returns: {summary: {...}, stages: [{timestamp, stage, bpm, confidence}, ...]}
    """
    if not hr_samples or len(hr_samples) < 6:
        return {'error': 'Need at least 6 HR samples for analysis', 'stages': [], 'summary': {}}
    
    # Filter to sleep window if provided
    if sleep_start and sleep_end:
        hr_samples = [(ts, bpm) for ts, bpm in hr_samples if sleep_start <= ts <= sleep_end]
    
    # Auto-detect sampling interval from data
    epoch_sec = detect_epoch_seconds(hr_samples)
    
    # Interpolate to uniform epochs
    epochs = interpolate_hr(hr_samples, epoch_seconds=epoch_sec)
    
    if len(epochs) < 6:
        return {'error': 'Not enough data points after interpolation', 'stages': [], 'summary': {}}
    
    # Compute features
    features = compute_features(epochs)
    
    # Classify
    raw_stages = classify_stages(features)
    
    # Smooth
    stages = smooth_stages(raw_stages)
    
    # Summary
    summary = compute_summary(stages, epoch_seconds=epoch_sec)
    
    return {
        'summary': summary,
        'stages': stages,
        'epoch_seconds': epoch_sec,
        'detected_interval': f'{epoch_sec}s',
        'version': '1.0-rule-based',
    }


# --- CLI usage ---
if __name__ == '__main__':
    if len(sys.argv) > 1:
        # Read HR data from JSON file: [{"timestamp": epoch, "bpm": number}, ...]
        with open(sys.argv[1]) as f:
            data = json.load(f)
        samples = [(d['timestamp'], d['bpm']) for d in data]
    else:
        # Demo: simulate 8 hours of sleep HR data
        import random
        random.seed(42)
        base_time = 1711152000  # midnight
        samples = []
        
        for i in range(96):  # 96 x 5min = 8 hours
            t = base_time + i * 300
            night_pos = i / 96
            
            # Simulate realistic sleep HR pattern
            # Cycle ~18 epochs (90 min)
            cycle_pos = (i % 18) / 18
            
            if night_pos < 0.33:
                # First third: deeper sleep
                if cycle_pos < 0.4:
                    hr = random.gauss(52, 1.5)  # deep
                elif cycle_pos < 0.7:
                    hr = random.gauss(58, 3)    # light
                else:
                    hr = random.gauss(62, 4)    # REM
            elif night_pos < 0.66:
                # Middle: mixed
                if cycle_pos < 0.25:
                    hr = random.gauss(54, 1.5)  # deep
                elif cycle_pos < 0.6:
                    hr = random.gauss(59, 2.5)  # light  
                else:
                    hr = random.gauss(64, 4.5)  # REM
            else:
                # Last third: more REM, lighter
                if cycle_pos < 0.15:
                    hr = random.gauss(56, 2)    # brief deep
                elif cycle_pos < 0.5:
                    hr = random.gauss(60, 3)    # light
                else:
                    hr = random.gauss(66, 5)    # more REM
            
            # Add occasional wake moments
            if random.random() < 0.03:
                hr = random.gauss(75, 5)
            
            samples.append((t, max(40, min(100, hr))))
        
        # Simulate sparse data (remove ~60% of points like real wearable)
        sparse = [(t, bpm) for t, bpm in samples if random.random() > 0.6]
        samples = sparse
    
    result = analyze_sleep(samples)
    print(json.dumps(result, indent=2))
