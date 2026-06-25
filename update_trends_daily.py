#!/usr/bin/env python3
"""Daily update for trends_daily.json on the VPS.

Loads existing trends_daily.json, then:
  - Downloads fresh Ember BG daily prices and patches missing/new entries
  - Scans SCADA JSONL files for new days not yet in the JSON
  - Appends any new days; saves back and commits to the data branch.

Designed to run from the VPS cron, once per day.
"""

import json, glob, os, sys, urllib.request, io, csv
from datetime import datetime, timezone, timedelta
from pathlib import Path

DATA_DIR  = Path('/opt/eso-data/data')
JSON_PATH = DATA_DIR / 'trends_daily.json'
EMBER_URL = 'https://files.ember-energy.org/public-downloads/price/outputs/european_wholesale_electricity_price_data_daily.csv'
COAL_SCADA_FIELDS = ['Кондензационни ТЕЦ', 'Топлофикационни ТЕЦ', 'Заводски ТЕЦ']

def log(msg):
    print(f'[{datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")}] {msg}', flush=True)

# ── Load existing JSON ────────────────────────────────────────────────────────
if not JSON_PATH.exists():
    log('ERROR: trends_daily.json not found — run full generation first')
    sys.exit(1)

base = json.loads(JSON_PATH.read_text())
days_idx = {d: i for i, d in enumerate(base['days'])}
log(f'Loaded {len(base["days"])} days, last={base["days"][-1]}')

# ── Download Ember prices ─────────────────────────────────────────────────────
ember_price = {}
try:
    log('Downloading Ember daily prices…')
    with urllib.request.urlopen(EMBER_URL, timeout=30) as resp:
        content = resp.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(content))
    for row in reader:
        if row.get('Country', '').strip() != 'Bulgaria':
            continue
        date  = row.get('Date', '').strip()
        price = row.get('Price (EUR/MWhe)', '').strip()
        if date and price:
            try:
                ember_price[date] = float(price)
            except ValueError:
                pass
    log(f'Ember: {len(ember_price)} BG days')
except Exception as e:
    log(f'WARNING: Ember download failed: {e}')

# ── Patch existing Ember prices (fills in recent days that were null) ─────────
updated_prices = 0
for date, price in ember_price.items():
    if date in days_idx:
        i = days_idx[date]
        if base['price'][i] is None:
            base['price'][i] = price
            updated_prices += 1
log(f'Patched {updated_prices} missing Ember prices in existing entries')

# ── Scan SCADA JSONL for new days ─────────────────────────────────────────────
new_days = {}   # date -> {solar_sum, solar_n, coal_sum, coal_n}
last_known = base['days'][-1]

for fpath in sorted(glob.glob(str(DATA_DIR / '*.jsonl'))):
    fname_date = os.path.basename(fpath).replace('.jsonl', '')
    if fname_date <= last_known and fname_date != 'today':
        continue
    with open(fpath, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts_str = r.get('timestamp_utc') or r.get('timestamp', '')
            if not ts_str:
                continue
            try:
                ts = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                dt_bg = ts + timedelta(hours=2)
                date = dt_bg.strftime('%Y-%m-%d')
            except Exception:
                continue
            if date <= last_known:
                continue
            solar = r.get('ФЕЦ')
            coal_vals = [r.get(k) for k in COAL_SCADA_FIELDS]
            coal_total = sum(v for v in coal_vals if v is not None) if any(v is not None for v in coal_vals) else None
            if date not in new_days:
                new_days[date] = {'solar_sum': 0, 'solar_n': 0, 'coal_sum': 0, 'coal_n': 0}
            e = new_days[date]
            if solar is not None:
                e['solar_sum'] += solar; e['solar_n'] += 1
            if coal_total is not None:
                e['coal_sum'] += coal_total; e['coal_n'] += 1

log(f'Found {len(new_days)} new SCADA days after {last_known}')

# ── Append new days ───────────────────────────────────────────────────────────
for date in sorted(new_days.keys()):
    e = new_days[date]
    solar_avg = (e['solar_sum'] / e['solar_n']) if e['solar_n'] >= 6 else None
    coal_avg  = (e['coal_sum']  / e['coal_n'])  if e['coal_n']  >= 6 else None
    base['days'].append(date)
    base['price'].append(ember_price.get(date))
    base['solar'].append(round(solar_avg, 2) if solar_avg is not None else None)
    base['coal'].append(round(coal_avg,  2) if coal_avg  is not None else None)

# ── Save ──────────────────────────────────────────────────────────────────────
JSON_PATH.write_text(json.dumps(base, ensure_ascii=False, separators=(',', ':')))
log(f'Saved {len(base["days"])} days → {JSON_PATH}')
