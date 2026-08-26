#!/usr/bin/env python3
"""VPS-side updater: refreshes JSONL-era records in records_history.json.

Run after compute_records.py in push_data.sh. Keeps the historical
ENTSOE/SCADA baseline (solar 2015-2020, RE% 2015-2026-06, etc.) frozen
from the last locally-committed file, and re-computes everything from
JSONL_START onward so new record-breaks appear within 5 minutes.

Works by:
  1. Loading existing records_history.json (baseline built locally).
  2. Stripping entries >= JSONL_START from each metric's history/top10.
  3. Re-processing all 2026-*.jsonl files from JSONL_START.
  4. Merging new record-break entries back in.
"""

import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BG_TZ  = ZoneInfo('Europe/Sofia')
DATA_DIR = Path(os.environ.get('DATA_DIR', Path(__file__).parent / 'data'))
OUT      = DATA_DIR / 'records_history.json'

JSONL_RE_KEYS = ['ВЕЦ', 'Малки ВЕЦ', 'ВяЕЦ', 'ФЕЦ', 'Био ЕЦ']
PUMPS_START   = '2026-06-03'
JSONL_START   = '2026-05-01'


def snap_ts_to_utc(r):
    ts = r.get('timestamp_utc') or r.get('timestamp') or ''
    if not ts:
        return None
    try:
        ts = ts.replace('Z', '+00:00')
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=BG_TZ)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def intervals_h(records):
    dts = [snap_ts_to_utc(r) for r in records]
    result = []
    for i, dt in enumerate(dts):
        if dt is None:
            result.append(5 / 60)
            continue
        if i + 1 < len(dts) and dts[i + 1] is not None:
            gap_h = (dts[i + 1] - dt).total_seconds() / 3600
        else:
            gap_h = 5 / 60
        result.append(min(gap_h, 0.5))
    return result


def _hist_append(hist, date, val, ts=None):
    """ts: the exact timestamp_utc the value was recorded at, for "momentum"
    (instantaneous MW peak) metrics only -- lets records.html link straight to
    that moment instead of just the day. Day-total metrics (GWh, %, hours)
    have no single exact moment, so they pass ts=None and get no 't' key."""
    if hist and hist[-1]['d'] == date:
        hist[-1]['val'] = val
        if ts:
            hist[-1]['t'] = ts
    else:
        entry = {'d': date, 'val': val}
        if ts:
            entry['t'] = ts
        hist.append(entry)


def top10(all_vals):
    """Dedupe by date (keep max), return top-10 ranked list.
    all_vals: (date, val) pairs, or (date, val, ts) triples for momentum
    metrics -- the ts of the day's max value is carried through as 't'."""
    best = {}  # date -> (val, ts)
    for item in all_vals:
        d, v, ts = item if len(item) == 3 else (*item, None)
        if d not in best or v > best[d][0]:
            best[d] = (v, ts)
    ranked = sorted(best.items(), key=lambda x: x[1][0], reverse=True)[:10]
    out = []
    for i, (d, (v, ts)) in enumerate(ranked):
        row = {'rank': i + 1, 'd': d, 'val': round(v, 3)}
        if ts:
            row['t'] = ts
        out.append(row)
    return out


def get_baseline(existing, key, cutover=JSONL_START):
    """Strip JSONL-era entries; return (trimmed_hist, last_max, pre_top10_pool)."""
    r = existing.get(key, {})
    hist    = [e for e in r.get('history', []) if e['d'] < cutover]
    pre_max = hist[-1]['val'] if hist else 0.0
    pool    = [(e['d'], e['val']) for e in r.get('top10', []) if e['d'] < cutover]
    return hist, pre_max, pool


def main():
    if not OUT.exists():
        print(f'ERROR: {OUT} not found — run compute_records_history.py locally first')
        return

    existing = json.loads(OUT.read_text())

    # ── Baseline (pre-JSONL) ──────────────────────────────────────────────────
    sol_hist,       sol_max,       sol_pool       = get_baseline(existing, 'solar')
    sol_gwh_hist,   sol_gwh_max,   sol_gwh_pool   = get_baseline(existing, 'solar_gwh')
    batt_chg_hist,  batt_chg_max,  batt_chg_pool  = get_baseline(existing, 'batt_chg',    PUMPS_START)
    total_chg_hist, total_chg_max, total_chg_pool = get_baseline(existing, 'total_chg',   PUMPS_START)
    batt_dis_hist,  batt_dis_max,  batt_dis_pool  = get_baseline(existing, 'batt_dis')
    chg_gwh_hist,   chg_gwh_max,   chg_gwh_pool   = get_baseline(existing, 'chg_gwh_day', PUMPS_START)
    dis_gwh_hist,   dis_gwh_max,   dis_gwh_pool   = get_baseline(existing, 'dis_gwh_day', PUMPS_START)
    pumps_gwh_hist, pumps_gwh_max, pumps_gwh_pool = get_baseline(existing, 'pumps_gwh',   PUMPS_START)
    export_hist,    export_max,    export_pool    = get_baseline(existing, 'export')
    daily_re_hist,  daily_re_max,  daily_re_pool  = get_baseline(existing, 'daily_re')
    re_gwh_hist,    re_gwh_max,    re_gwh_pool    = get_baseline(existing, 're_gwh_day')
    re_hours_hist,  re_hours_max,  re_hours_pool  = get_baseline(existing, 're_hours')

    sol_all       = list(sol_pool)
    sol_gwh_all   = list(sol_gwh_pool)
    batt_chg_all  = list(batt_chg_pool)
    total_chg_all = list(total_chg_pool)
    batt_dis_all  = list(batt_dis_pool)
    chg_gwh_all   = list(chg_gwh_pool)
    dis_gwh_all   = list(dis_gwh_pool)
    pumps_gwh_all = list(pumps_gwh_pool)
    export_all    = list(export_pool)
    daily_re_all  = list(daily_re_pool)
    re_gwh_all    = list(re_gwh_pool)
    re_hours_all  = list(re_hours_pool)

    days = defaultdict(lambda: {'re': 0.0, 'demand': 0.0, 're_covers_h': 0.0, 'n': 0})

    # ── Process JSONL files ───────────────────────────────────────────────────
    for f in sorted(DATA_DIR.glob('2026-*.jsonl')):
        day = f.stem
        if day < JSONL_START:
            continue
        records = [json.loads(l) for l in f.read_text().strip().split('\n') if l.strip()]
        if not records:
            continue
        ihs = intervals_h(records)

        day_sol_gwh = day_chg_gwh = day_dis_gwh = day_pumps_gwh = 0.0

        for r, ih in zip(records, ihs):
            solar     = r.get('ФЕЦ') or 0.0
            chg       = r.get('batt_charge_mw') or 0.0
            dis       = max(0.0, r.get('batt_discharge_mw') or 0.0)
            pumps     = r.get('pumps_mw') or 0.0
            total_chg = chg + pumps
            load      = r.get('Товар на РБ') or 0.0
            re_mw     = sum(r.get(k) or 0.0 for k in JSONL_RE_KEYS) + dis
            export    = max(0.0, -(r.get('net_import_mw') or 0.0))
            ts        = r.get('timestamp_utc')

            # Solar peak MW
            sol_all.append((day, solar, ts))
            if solar > sol_max:
                sol_max = solar
                _hist_append(sol_hist, day, round(solar, 1), ts)
            day_sol_gwh += solar * ih / 1000

            # Export peak MW (tracked from JSONL only)
            export_all.append((day, export, ts))
            if export > export_max:
                export_max = export
                _hist_append(export_hist, day, round(export, 1), ts)

            # Battery discharge (all JSONL)
            batt_dis_all.append((day, dis, ts))
            if dis > batt_dis_max:
                batt_dis_max = dis
                _hist_append(batt_dis_hist, day, round(dis, 1), ts)

            # Battery charge + pumps (only since PUMPS_START)
            if day >= PUMPS_START:
                batt_chg_all.append((day, chg, ts))
                total_chg_all.append((day, total_chg, ts))
                if chg > batt_chg_max:
                    batt_chg_max = chg
                    _hist_append(batt_chg_hist, day, round(chg, 1), ts)
                if total_chg > total_chg_max:
                    total_chg_max = total_chg
                    _hist_append(total_chg_hist, day, round(total_chg, 1), ts)
                day_chg_gwh   += chg   * ih / 1000
                day_dis_gwh   += dis   * ih / 1000
                day_pumps_gwh += pumps * ih / 1000

            # Daily RE accumulation (cap RE at demand, same as compute_records.py)
            d = days[day]
            d['re']          += min(re_mw, load) * ih
            d['demand']      += load * ih
            d['re_covers_h'] += ih if load > 0 and re_mw >= load else 0.0
            d['n']           += 1

        # Per-day GWh totals
        sol_gwh_all.append((day, day_sol_gwh))
        if day_sol_gwh > sol_gwh_max:
            sol_gwh_max = day_sol_gwh
            sol_gwh_hist.append({'d': day, 'val': round(day_sol_gwh, 3)})

        chg_gwh_all.append((day, day_chg_gwh))
        dis_gwh_all.append((day, day_dis_gwh))
        pumps_gwh_all.append((day, day_pumps_gwh))
        if day >= PUMPS_START:
            if day_chg_gwh > chg_gwh_max:
                chg_gwh_max = day_chg_gwh
                chg_gwh_hist.append({'d': day, 'val': round(day_chg_gwh, 3)})
            if day_dis_gwh > dis_gwh_max:
                dis_gwh_max = day_dis_gwh
                dis_gwh_hist.append({'d': day, 'val': round(day_dis_gwh, 3)})
            if day_pumps_gwh > pumps_gwh_max:
                pumps_gwh_max = day_pumps_gwh
                pumps_gwh_hist.append({'d': day, 'val': round(day_pumps_gwh, 3)})

    # ── Daily RE metrics from accumulators ───────────────────────────────────
    for date in sorted(days.keys()):
        d = days[date]
        if d['n'] < 10:
            continue
        load_gwh = d['demand'] / 1000.0
        re_gwh   = d['re']    / 1000.0
        daily_re = re_gwh / load_gwh * 100 if load_gwh > 0 else 0.0
        re_hours = d['re_covers_h']

        daily_re_all.append((date, daily_re))
        if daily_re > daily_re_max:
            daily_re_max = daily_re
            daily_re_hist.append({'d': date, 'val': round(daily_re, 1)})

        re_gwh_all.append((date, re_gwh))
        if re_gwh > re_gwh_max:
            re_gwh_max = re_gwh
            re_gwh_hist.append({'d': date, 'val': round(re_gwh, 3)})

        re_hours_all.append((date, re_hours))
        if re_hours > re_hours_max:
            re_hours_max = re_hours
            re_hours_hist.append({'d': date, 'val': round(re_hours, 2)})

    # ── Write back (preserve _days and any other keys untouched) ─────────────
    updates = {
        'solar':       {'history': sol_hist,       'top10': top10(sol_all)},
        'solar_gwh':   {'history': sol_gwh_hist,   'top10': top10(sol_gwh_all)},
        'batt_chg':    {'history': batt_chg_hist,  'top10': top10(batt_chg_all)},
        'total_chg':   {'history': total_chg_hist, 'top10': top10(total_chg_all)},
        'batt_dis':    {'history': batt_dis_hist,  'top10': top10(batt_dis_all)},
        'chg_gwh_day': {'history': chg_gwh_hist,   'top10': top10(chg_gwh_all)},
        'dis_gwh_day': {'history': dis_gwh_hist,   'top10': top10(dis_gwh_all)},
        'pumps_gwh':   {'history': pumps_gwh_hist, 'top10': top10(pumps_gwh_all)},
        'export':      {'history': export_hist,    'top10': top10(export_all)},
        'daily_re':    {'history': daily_re_hist,  'top10': top10(daily_re_all)},
        're_gwh_day':  {'history': re_gwh_hist,    'top10': top10(re_gwh_all)},
        're_hours':    {'history': re_hours_hist,  'top10': top10(re_hours_all)},
    }
    for key, val in updates.items():
        existing[key].update(val)

    OUT.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    print(f'Updated {OUT}')
    for key, val in updates.items():
        hist = val['history']
        top  = f"{hist[-1]['val']} {existing[key]['unit']}" if hist else '—'
        print(f'  {key}: {len(hist)} record-breaks, current={top}')


if __name__ == '__main__':
    main()
