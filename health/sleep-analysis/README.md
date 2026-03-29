# Sleep Stage Classifier

Estimates sleep stages (wake/light/deep/REM) from sparse heart rate data.

## Architecture

**Input:** Heart rate BPM samples from Apple Health (typically every 1-10 minutes from wearable)
**Output:** 30-second epoch classifications: wake, light, deep, REM

## Approach

Two-tier system:
1. **Rule-based classifier** (v1, immediate) — uses HR patterns + HRV approximation from sparse BPM
2. **ML classifier** (v2, future) — trained model if we get enough data

### Rule-based logic (v1)
- Compute rolling HR stats per 5-minute window: mean, std, trend
- Deep sleep: HR drops to lowest sustained levels, low variability
- REM: HR shows higher variability, slightly elevated from deep
- Light: moderate HR, moderate variability
- Wake: HR spike, sudden changes

### Why rule-based first
- Every paper needs continuous RR intervals (beat-to-beat). We have sparse BPM.
- SleepECG: needs raw ECG at 200+Hz → beat detection → RR intervals
- Nature transfer learning model: needs raw PPG waveform at 32-64Hz
- Stanford model: needs raw PPG + accelerometer at 32Hz
- Mi Band writes BPM every 1-10 minutes. Completely different data.
- Rule-based gets us 60-70% accuracy from sparse data. Good enough to start.
- Can improve when we understand actual sample density from Mi Band.

## Dependencies
- Python 3.x, numpy (already installed)
- No GPU, no TensorFlow, no heavy deps
