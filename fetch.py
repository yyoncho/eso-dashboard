#!/usr/bin/env python3
"""
Fetch ESO Bulgaria real-time data + IBEX/DA prices and write to data/.

Writes every run:
  data/YYYY-MM-DD.jsonl    per-day snapshot log
  data/latest.json         most recent snapshot
  data/today.jsonl         today's snapshots (copy)
  data/index.json          list of available dates

Refreshed every 4 hours (energy-charts updates prices throughout the day):
  data/prices-YYYY-MM.json IBEX 15-min prices from energy-charts
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT     = Path(__file__).parent
DATA_DIR = Path(os.environ.get("DATA_DIR", str(ROOT / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# energy_charts module lives alongside us once deployed; also try local source
sys.path.insert(0, str(ROOT))
try:
    from energy_charts import fetch as ec_fetch
    HAS_EC = True
except ImportError:
    HAS_EC = False

HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": "https://www.eso.bg/"}

BG_TZ = ZoneInfo('Europe/Sofia')

GEN_COLS = [
    "АЕЦ", "Кондензационни ТЕЦ", "Топлофикационни ТЕЦ", "Заводски ТЕЦ",
    "ВЕЦ", "Малки ВЕЦ", "ВяЕЦ", "ФЕЦ", "Био ЕЦ",
]
FLOW_COUNTRIES = ["RO", "SR", "MK", "GR", "TR"]


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def build_record():
    gen_data = fetch_json("https://www.eso.bg/api/rabota_na_EEC_json.php?tovar")
    flows    = fetch_json("https://www.eso.bg/api/scada_live_json_pure.php")

    row = {}
    bess_charge    = 0.0
    bess_discharge = 0.0

    for item in gen_data:
        if item is None:
            continue
        label, value = item[0], item[1]
        # BESS: ESO used ССЕЕ (old) and switched to ССЕБ (~2026-06).
        # New format has two separate entries for charge and discharge.
        if "ССЕЕ" in label or "ССЕБ" in label:
            try:
                val = float(str(value).replace(",", "."))
            except (ValueError, TypeError):
                val = 0.0
            if "зареждане" in label:
                bess_charge += val
            else:
                bess_discharge += val
        elif label.strip() == "Помпи":
            try:
                row["pumps_mw"] = float(str(value).replace(",", "."))
            except (ValueError, TypeError):
                pass
        else:
            name = re.sub(r"\s+\d+[.,]\d+%$", "", label).strip()
            try:
                row[name] = float(str(value).replace(",", "."))
            except (ValueError, TypeError):
                pass

    # Net BESS: positive = discharging into grid, negative = charging from grid
    net_bess = bess_discharge - bess_charge
    row["ССЕЕ_mw"]    = round(net_bess, 2)
    row["ССЕЕ_state"] = "discharging" if net_bess >= 0 else "charging"

    for c in FLOW_COUNTRIES:
        row[f"{c}_mw"] = flows.get(f"{c}_data", 0) or 0

    gen_sum    = sum(row.get(c, 0) for c in GEN_COLS)
    net_import = sum(row.get(f"{c}_mw", 0) for c in FLOW_COUNTRIES)
    load       = row.get("Товар на РБ", 0)

    row["gen_total_mw"]  = round(gen_sum, 1)
    row["net_import_mw"] = round(net_import, 1)
    row["load_mw"]       = round(load, 1)

    # Direct values from API — no implied calculation needed with new ССЕБ format
    row["batt_charge_mw"]    = round(bess_charge, 1)
    row["batt_discharge_mw"] = round(bess_discharge, 1)

    row["raw_gen_api"] = gen_data

    now_utc = datetime.now(timezone.utc)
    row["timestamp_utc"] = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    row["date_bg"]       = now_utc.astimezone(BG_TZ).strftime("%Y-%m-%d")

    return row


def _fetch_prices_direct(year: int, month: int) -> dict:
    """Fetch BG prices directly using bzn=BG (not country=bg).

    The energy_charts module uses ?country=bg for all endpoints, but the price
    endpoint requires ?bzn=BG — these return different data. Calling directly
    ensures we get the correct IBEX bidding-zone prices.
    """
    from calendar import monthrange
    import urllib.parse
    _, last_day = monthrange(year, month)
    start = f"{year}-{month:02d}-01T00:00+00:00"
    end   = f"{year}-{month:02d}-{last_day:02d}T23:59+00:00"
    url = (
        "https://api.energy-charts.info/price"
        f"?bzn=BG"
        f"&start={urllib.parse.quote(start)}"
        f"&end={urllib.parse.quote(end)}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "eso-dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _fetch_prices_ibex_today() -> list[dict]:
    """Fetch today's day-ahead prices from ibex.bg (CET delivery day).

    ibex.bg delivery times are in CET/CEST (Europe/Berlin). Returns list of
    {unix_seconds, price} with UTC unix timestamps for all 96 quarter-hours.
    """
    from zoneinfo import ZoneInfo
    CET = ZoneInfo("Europe/Berlin")
    url = f"https://ibex.bg/Ext/IDM_Homepage/fetch_dam.php?lang=en&num={int(datetime.now(timezone.utc).timestamp())}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://ibex.bg/"})
    with urllib.request.urlopen(req, timeout=15) as r:
        rows = json.loads(r.read().decode())
    result = []
    for row in rows:
        local_dt = datetime.strptime(row["date"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=CET)
        result.append({"unix_seconds": int(local_dt.timestamp()), "price": row["price"]})
    return result


def _merge_ibex_into(data: dict, ibex_rows: list[dict]) -> dict:
    """Merge ibex.bg rows into an energy-charts price dict, filling gaps."""
    existing = set(data.get("unix_seconds", []))
    new_ts, new_pr = [], []
    for row in ibex_rows:
        if row["unix_seconds"] not in existing:
            new_ts.append(row["unix_seconds"])
            new_pr.append(row["price"])
    if not new_ts:
        return data
    ts_all = data.get("unix_seconds", []) + new_ts
    pr_all = data.get("price", [])       + new_pr
    # sort by timestamp
    paired = sorted(zip(ts_all, pr_all))
    data["unix_seconds"] = [p[0] for p in paired]
    data["price"]        = [p[1] for p in paired]
    return data


def update_neighbor_prices(year: int, month: int):
    """Download RO and GR day-ahead prices from energy-charts, same format as BG prices."""
    from calendar import monthrange
    import urllib.parse
    _, last_day = monthrange(year, month)
    start = f"{year}-{month:02d}-01T00:00+00:00"
    end   = f"{year}-{month:02d}-{last_day:02d}T23:59+00:00"
    now   = datetime.now(timezone.utc)

    for bzn in ('RO', 'GR'):
        ym   = f"{year:04d}-{month:02d}"
        path = DATA_DIR / f"prices-{bzn.lower()}-{ym}.json"
        if path.exists():
            try:
                cached = json.loads(path.read_text())
                fetched_at = cached.get("fetched_at")
                if fetched_at:
                    age_h = (now - datetime.fromisoformat(fetched_at)).total_seconds() / 3600
                    if age_h < 4:
                        continue
            except Exception:
                pass
        print(f"Fetching {bzn} prices for {ym} …", flush=True)
        try:
            url = (
                "https://api.energy-charts.info/price"
                f"?bzn={bzn}"
                f"&start={urllib.parse.quote(start)}"
                f"&end={urllib.parse.quote(end)}"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "eso-dashboard/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read())
            print(f"  {bzn} → {len(data.get('unix_seconds', []))} price points", flush=True)
            data["fetched_at"] = now.isoformat()
            path.write_text(json.dumps(data))
        except Exception as e:
            print(f"  WARN: {bzn} price fetch failed: {e}", flush=True)


def update_prices(year: int, month: int):
    """Download IBEX/DA prices from energy-charts (+ ibex.bg fallback), refreshing every 4 hours.

    energy-charts blends DA and real-time prices and updates throughout the day,
    so a once-per-day fetch produces stale values for past hours.
    ibex.bg supplements coverage for the CET-midnight boundary hours that
    energy-charts (UTC-aligned) may miss.
    """
    ym   = f"{year:04d}-{month:02d}"
    path = DATA_DIR / f"prices-{ym}.json"
    now  = datetime.now(timezone.utc)

    if path.exists():
        try:
            cached = json.loads(path.read_text())
            fetched_at = cached.get("fetched_at")
            if fetched_at:
                age_h = (now - datetime.fromisoformat(fetched_at)).total_seconds() / 3600
                if age_h < 4:
                    return   # still fresh
        except Exception:
            pass

    print(f"Fetching IBEX prices for {ym} …", flush=True)
    data = None
    try:
        data = _fetch_prices_direct(year, month)
        print(f"  energy-charts → {len(data.get('unix_seconds', []))} price points", flush=True)
    except Exception as e:
        print(f"  WARN: energy-charts fetch failed: {e}", flush=True)
        data = {"unix_seconds": [], "price": [], "unit": "EUR/MWh"}

    # Supplement with ibex.bg to fill the CET-midnight boundary gaps.
    # Energy-charts is UTC-aligned; ibex.bg CET delivery days span ±2h around UTC midnight.
    # We include all ibex.bg entries so getDayPrices() (Sofia-midnight-aligned) finds prices
    # for the full Sofia day even when it crosses a UTC month boundary.
    try:
        ibex_rows = _fetch_prices_ibex_today()
        before = len(data.get("unix_seconds", []))
        data = _merge_ibex_into(data, ibex_rows)
        added = len(data.get("unix_seconds", [])) - before
        if added:
            print(f"  ibex.bg added {added} boundary entries", flush=True)
    except Exception as e:
        print(f"  WARN: ibex.bg supplement failed: {e}", flush=True)

    data["fetched_at"] = now.isoformat()
    path.write_text(json.dumps(data))
    print(f"  → total {len(data.get('unix_seconds', []))} price points saved", flush=True)


def append_day_file(record):
    path = DATA_DIR / f"{record['date_bg']}.jsonl"
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_today_alias(date_str):
    src = DATA_DIR / f"{date_str}.jsonl"
    dst = DATA_DIR / "today.jsonl"
    if src.exists():
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


def write_index():
    dates = sorted(p.stem for p in DATA_DIR.glob("????-??-??.jsonl"))
    (DATA_DIR / "index.json").write_text(json.dumps({"dates": dates}))


def main():
    record = build_record()
    append_day_file(record)
    (DATA_DIR / "latest.json").write_text(
        json.dumps(record, ensure_ascii=False, indent=2)
    )
    write_today_alias(record["date_bg"])
    write_index()

    # refresh prices for current month (once per day)
    now_utc = datetime.now(timezone.utc)
    update_prices(now_utc.year, now_utc.month)
    update_neighbor_prices(now_utc.year, now_utc.month)

    print(f"[{record['timestamp_utc']}] load {record['load_mw']} MW  "
          f"gen {record['gen_total_mw']} MW  "
          f"net_import {record['net_import_mw']} MW")


if __name__ == "__main__":
    main()
