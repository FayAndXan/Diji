#!/usr/bin/env python3
"""
Health Analysis API — HTTP server that wraps sleep classifier, workout zones, recovery score.

Runs alongside companion server. Bryan or cron calls this to get computed health insights.

Endpoints:
  POST /analyze/sleep    — classify sleep stages from HR data
  POST /analyze/workout  — analyze workout zones from HR data  
  POST /analyze/recovery — compute recovery/readiness score
  POST /analyze/day      — full day analysis (auto-detect workouts)
  GET  /health           — healthcheck

Port: 3951
"""

import json
import sys
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classifier import analyze_sleep
from workout_zones import analyze_workout, analyze_day
from recovery_score import compute_recovery_score


class AnalysisHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Quiet logging
        pass
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))
    
    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/health':
            self.send_json({'status': 'ok', 'version': '1.0'})
        else:
            self.send_json({'error': 'Not found'}, 404)
    
    def do_POST(self):
        path = urlparse(self.path).path
        
        try:
            body = self.read_body()
        except Exception as e:
            self.send_json({'error': f'Invalid JSON: {e}'}, 400)
            return
        
        try:
            if path == '/analyze/sleep':
                result = self._analyze_sleep(body)
            elif path == '/analyze/workout':
                result = self._analyze_workout(body)
            elif path == '/analyze/recovery':
                result = self._analyze_recovery(body)
            elif path == '/analyze/day':
                result = self._analyze_day(body)
            else:
                self.send_json({'error': 'Not found'}, 404)
                return
            
            self.send_json(result)
        except Exception as e:
            self.send_json({'error': str(e)}, 500)
    
    def _analyze_sleep(self, body):
        """
        POST /analyze/sleep
        Body: {
            hr_samples: [{timestamp: epoch, bpm: number}, ...],
            sleep_start: epoch (optional),
            sleep_end: epoch (optional)
        }
        """
        hr_data = body.get('hr_samples', [])
        samples = [(d['timestamp'], d['bpm']) for d in hr_data]
        return analyze_sleep(
            samples,
            sleep_start=body.get('sleep_start'),
            sleep_end=body.get('sleep_end'),
        )
    
    def _analyze_workout(self, body):
        """
        POST /analyze/workout
        Body: {
            hr_samples: [{timestamp: epoch, bpm: number}, ...],
            age: number,
            weight_kg: number,
            is_male: bool (default true),
            workout_type: string (optional)
        }
        """
        hr_data = body.get('hr_samples', [])
        samples = [(d['timestamp'], d['bpm']) for d in hr_data]
        return analyze_workout(
            samples,
            age=body.get('age', 35),
            weight_kg=body.get('weight_kg', 75),
            is_male=body.get('is_male', True),
            workout_type=body.get('workout_type'),
        )
    
    def _analyze_recovery(self, body):
        """
        POST /analyze/recovery
        Body: {
            resting_hr: number,
            sleep_hr_std: number,
            sleep_summary: {...} (from /analyze/sleep),
            daily_strain: number (0-21),
            bedtime_deviation_min: number,
            baseline_rhr: number (optional, personal baseline),
            baseline_hrv: number (optional, personal baseline)
        }
        """
        return compute_recovery_score(
            resting_hr=body.get('resting_hr', 60),
            sleep_hr_std=body.get('sleep_hr_std', 3.0),
            sleep_summary=body.get('sleep_summary', {}),
            daily_strain=body.get('daily_strain', 0),
            bedtime_deviation_min=body.get('bedtime_deviation_min', 30),
            baseline_rhr=body.get('baseline_rhr'),
            baseline_hrv=body.get('baseline_hrv'),
        )
    
    def _analyze_day(self, body):
        """
        POST /analyze/day
        Body: {
            hr_samples: [{timestamp: epoch, bpm: number}, ...],
            age: number,
            weight_kg: number,
            is_male: bool (default true)
        }
        """
        hr_data = body.get('hr_samples', [])
        samples = [(d['timestamp'], d['bpm']) for d in hr_data]
        return analyze_day(
            samples,
            age=body.get('age', 35),
            weight_kg=body.get('weight_kg', 75),
            is_male=body.get('is_male', True),
        )


def main():
    port = int(os.environ.get('ANALYSIS_PORT', 3951))
    server = HTTPServer(('127.0.0.1', port), AnalysisHandler)
    print(f'Health Analysis API running on http://127.0.0.1:{port}')
    server.serve_forever()


if __name__ == '__main__':
    main()
