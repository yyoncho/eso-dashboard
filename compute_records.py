#!/usr/bin/env python3
"""Compute renewable/battery/export records from all daily JSONL files."""

import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import os

BG_TZ = ZoneInfo('Europe/Sofia')

DATA_DIR = Path(os.environ.get('DATA_DIR', Path(__file__).parent / 'data'))
RE = ['ВЕЦ', 'Малки ВЕЦ', 'ВяЕЦ', 'ФЕЦ', 'Био ЕЦ']


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
    """Per-record interval in hours from timestamp gaps; gaps >30 min capped."""
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


def batt_discharge(r):
    return max(0.0, r.get('batt_discharge_mw') or 0)


def main():
    PUMPS_START = '2026-06-03'

    rec = {
        'solar':       {'val': 0.0, 'label': 'Пиково соларно производство',      'unit': 'MW',  'date': None, 'snap_ts': None},
        'solar_gwh':   {'val': 0.0, 'label': 'Соларна енергия за ден',     'unit': 'GWh', 'date': None, 'snap_ts': None},
        'total_chg':   {'val': 0.0, 'label': 'Зареждане ССЕЕ + Помпи',    'unit': 'MW',  'date': None, 'snap_ts': None},
        'batt_chg':    {'val': 0.0, 'label': 'Зареждане батерии',           'unit': 'MW',  'date': None, 'snap_ts': None},
        'chg_gwh_day': {'val': 0.0, 'label': 'Зареждане за ден',            'unit': 'GWh', 'date': None, 'snap_ts': None},
        'batt_dis':    {'val': 0.0, 'label': 'Разреждане на ССЕЕ',         'unit': 'MW',  'date': None, 'snap_ts': None},
        'dis_gwh_day': {'val': 0.0, 'label': 'Разреждане за ден',          'unit': 'GWh', 'date': None, 'snap_ts': None},
        'pumps_gwh':   {'val': 0.0, 'label': 'Помпи рекорд ден',           'unit': 'GWh', 'date': None, 'snap_ts': None},
        'export':      {'val': 0.0, 'label': 'Пикова мощност износ',       'unit': 'MW',  'date': None, 'snap_ts': None},
        'daily_re':    {'val': 0.0, 'label': 'Дневен дял ВЕИ',             'unit': '%',   'date': None, 'snap_ts': None},
        're_gwh_day':  {'val': 0.0, 'label': 'ВЕИ енергия за ден',         'unit': 'GWh', 'date': None, 'snap_ts': None},
        're_hours':    {'val': 0.0, 'label': 'Най-дълго 100% ВЕИ',         'unit': 'ч',   'date': None, 'snap_ts': None},
        'peak_consumption':  {'val': 0.0, 'label': 'Пиково потребление',                       'unit': 'MW', 'date': None, 'snap_ts': None},
        'peak_gen_daylight': {'val': 0.0, 'label': 'Пиково производство (дневно, 08-18ч)',      'unit': 'MW', 'date': None, 'snap_ts': None},
        'peak_gen_evening':  {'val': 0.0, 'label': 'Пиково производство (вечерен пик, 18-22ч)', 'unit': 'MW', 'date': None, 'snap_ts': None},
    }

    for f in sorted(DATA_DIR.glob('2026-*.jsonl')):
        day = f.stem
        records = [json.loads(l) for l in f.read_text().strip().split('\n') if l.strip()]
        if not records:
            continue
        ihs = intervals_h(records)
        load_gwh = re_gwh = re_hours = solar_gwh = 0.0
        day_chg_gwh = day_dis_gwh = day_pumps_gwh = 0.0

        for r, ih in zip(records, ihs):
            ts    = r.get('timestamp_utc') or r.get('timestamp') or ''
            solar = r.get('ФЕЦ') or 0
            chg   = r.get('batt_charge_mw') or 0
            dis   = batt_discharge(r)
            exp   = max(0.0, -(r.get('net_import_mw') or 0))
            load  = r.get('Товар на РБ') or 0
            pumps = r.get('pumps_mw') or 0
            re_av = sum(r.get(k) or 0 for k in RE) + dis

            load_gwh  += load  * ih / 1000
            re_gwh    += min(re_av, load) * ih / 1000
            solar_gwh += solar * ih / 1000
            if load > 0 and re_av >= load:
                re_hours += ih

            total_chg = chg + pumps
            day_pumps_gwh += pumps * ih / 1000

            if solar > rec['solar']['val']:
                rec['solar'].update(val=round(solar, 1), date=day, snap_ts=ts)
            if total_chg > rec['total_chg']['val']:
                rec['total_chg'].update(val=round(total_chg, 1), date=day, snap_ts=ts)
            if day >= PUMPS_START and chg > rec['batt_chg']['val']:
                rec['batt_chg'].update(val=round(chg, 1), date=day, snap_ts=ts)
            if dis > rec['batt_dis']['val']:
                rec['batt_dis'].update(val=round(dis, 1), date=day, snap_ts=ts)
            if exp > rec['export']['val']:
                rec['export'].update(val=round(exp, 1), date=day, snap_ts=ts)

            load_mw = r.get('load_mw') or 0
            batt_charge_mw = r.get('batt_charge_mw') or 0
            pumps_mw = r.get('pumps_mw') or 0
            gen_total_mw = r.get('gen_total_mw') or 0
            peak_cons = load_mw + batt_charge_mw + pumps_mw
            if peak_cons > rec['peak_consumption']['val']:
                rec['peak_consumption'].update(val=round(peak_cons, 1), date=day, snap_ts=ts)

            snap_dt = snap_ts_to_utc(r)
            bg_hour = snap_dt.astimezone(BG_TZ).hour if snap_dt else None
            if bg_hour is not None and 8 <= bg_hour < 18 and gen_total_mw > rec['peak_gen_daylight']['val']:
                rec['peak_gen_daylight'].update(val=round(gen_total_mw, 1), date=day, snap_ts=ts)
            if bg_hour is not None and 18 <= bg_hour < 22 and gen_total_mw > rec['peak_gen_evening']['val']:
                rec['peak_gen_evening'].update(val=round(gen_total_mw, 1), date=day, snap_ts=ts)

            if day >= PUMPS_START:
                day_chg_gwh += chg * ih / 1000
                day_dis_gwh += dis * ih / 1000

        daily_re = re_gwh / load_gwh * 100 if load_gwh else 0
        if daily_re > rec['daily_re']['val']:
            rec['daily_re'].update(val=round(daily_re, 1), date=day, snap_ts=None)
        if re_hours > rec['re_hours']['val']:
            rec['re_hours'].update(val=round(re_hours, 2), date=day, snap_ts=None)
        if solar_gwh > rec['solar_gwh']['val']:
            rec['solar_gwh'].update(val=round(solar_gwh, 1), date=day, snap_ts=None)
        if re_gwh > rec['re_gwh_day']['val']:
            rec['re_gwh_day'].update(val=round(re_gwh, 1), date=day, snap_ts=None)
        if day_pumps_gwh > rec['pumps_gwh']['val']:
            rec['pumps_gwh'].update(val=round(day_pumps_gwh, 1), date=day, snap_ts=None)

        if day >= PUMPS_START:
            if day_chg_gwh > rec['chg_gwh_day']['val']:
                rec['chg_gwh_day'].update(val=round(day_chg_gwh, 1), date=day, snap_ts=None)
            if day_dis_gwh > rec['dis_gwh_day']['val']:
                rec['dis_gwh_day'].update(val=round(day_dis_gwh, 1), date=day, snap_ts=None)

    out = DATA_DIR / 'records.json'
    out.write_text(json.dumps(rec, ensure_ascii=False, indent=2))
    print(f'Written {out}')


if __name__ == '__main__':
    main()
