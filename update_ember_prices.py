#!/usr/bin/env python3
"""
Extract BG hourly prices from Ember ZIP and write compact JSON to DATA_DIR.
Refreshes every 3 days (Ember publishes with ~1-2 day lag).
Called from push_data.sh; safe to skip if fresh.
"""
import csv
import io
import json
import os
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

EMBER_URL = (
    'https://files.ember-energy.org/public-downloads/price/outputs/'
    'european_wholesale_electricity_price_data_hourly.zip'
)
DATA_DIR  = Path(os.environ.get('DATA_DIR', Path(__file__).parent / 'data'))
ZIP_CACHE = DATA_DIR / 'ember_hourly_cache.zip'
OUT_FILE  = DATA_DIR / 'ember-bg-prices.json'
TTL_DAYS  = 3


def _is_fresh():
    if not OUT_FILE.exists():
        return False
    age_days = (datetime.now(timezone.utc).timestamp() - OUT_FILE.stat().st_mtime) / 86400
    return age_days < TTL_DAYS


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if _is_fresh():
        print('ember-bg-prices.json is fresh, skipping', flush=True)
        return

    print('Downloading Ember hourly ZIP...', flush=True)
    urllib.request.urlretrieve(EMBER_URL, ZIP_CACHE)

    print('Extracting BG prices...', flush=True)
    with zipfile.ZipFile(ZIP_CACHE) as z:
        with z.open('Bulgaria.csv') as f:
            rows = list(csv.DictReader(io.TextIOWrapper(f)))

    ts_list, p_list = [], []
    for row in rows:
        try:
            dt    = datetime.strptime(row['Datetime (UTC)'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
            ts    = int(dt.timestamp())
            price = round(float(row['Price (EUR/MWhe)']), 2)
        except (ValueError, KeyError):
            continue
        ts_list.append(ts)
        p_list.append(price)

    OUT_FILE.write_text(json.dumps({
        't': ts_list,
        'p': p_list,
        'updated': datetime.now(timezone.utc).isoformat(),
    }))
    print(f'  → {len(ts_list)} price points → {OUT_FILE.name}', flush=True)
    ZIP_CACHE.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
