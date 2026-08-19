#!/usr/bin/env python3
"""
Local poller — runs on dev machine when VPS IP is blocked by ESO.
Uses Playwright (headless Chrome) to bypass TLS/WAF restrictions.
Runs as a persistent daemon with a single reused browser instance.
Start: python3 local_poller.py
Stop:  kill $(cat /tmp/local_poller.pid)
"""

import fcntl
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR    = Path(__file__).parent
DATA_WORKTREE = SCRIPT_DIR.parent / 'eso-data'
DATA_DIR      = DATA_WORKTREE / 'data'
LOCK_FILE     = Path('/tmp/local_poller.lock')
PID_FILE      = Path('/tmp/local_poller.pid')
LOG_FILE      = Path('/tmp/poller.log')
INTERVAL      = 300  # seconds

os.environ['DATA_DIR'] = str(DATA_DIR)
sys.path.insert(0, str(SCRIPT_DIR))

from playwright.sync_api import sync_playwright

ESO_MAIN = 'https://www.eso.bg/index.php?lang=bg'
GEN_URL  = 'https://www.eso.bg/api/rabota_na_EEC_json.php?tovar'
FLOW_URL = 'https://www.eso.bg/api/scada_live_json_pure.php'


def log(msg):
    line = f"[{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, 'a') as f:
        f.write(line + '\n')


def fetch_via_browser(page):
    page.goto(ESO_MAIN, wait_until='domcontentloaded', timeout=30000)
    gen_data = page.evaluate(f"""async () => (await fetch('{GEN_URL}')).json()""")
    flows    = page.evaluate(f"""async () => (await fetch('{FLOW_URL}')).json()""")
    return gen_data, flows


def run_once(page):
    import fetch as f

    gen_data, flows = fetch_via_browser(page)

    def mock_fetch_json(url):
        if 'rabota_na_EEC' in url: return gen_data
        if 'scada_live'    in url: return flows
        raise RuntimeError(f'Unexpected URL in mock: {url}')

    orig_fetch, orig_session = f.fetch_json, f._eso_session
    f.fetch_json   = mock_fetch_json
    f._eso_session = lambda: None
    try:
        record = f.build_record()
    finally:
        f.fetch_json   = orig_fetch
        f._eso_session = orig_session

    f.append_day_file(record)
    f.write_today_alias(record['date_bg'])
    f.write_index()

    now = datetime.now(timezone.utc)
    f.update_prices(now.year, now.month)

    months = sorted({p.stem[:7] for p in DATA_DIR.glob('2026-??-??.jsonl')})
    for ym in months:
        y, m = int(ym[:4]), int(ym[5:7])
        for cc in ('ro', 'gr'):
            f.update_neighbor_prices(cc, y, m)

    log(f"load {record['load_mw']} MW  gen {record['gen_total_mw']} MW  "
        f"net_import {record['net_import_mw']} MW")

    for script in ['compute_records.py', 'update_records_history_jsonl.py']:
        r = subprocess.run([sys.executable, str(SCRIPT_DIR / script)],
                           env=os.environ.copy(), capture_output=True, text=True)
        if r.returncode != 0:
            log(f'{script} stderr: {r.stderr[:300]}')

    subprocess.run(['git', 'rebase', '--abort'], cwd=DATA_WORKTREE, capture_output=True)
    subprocess.run(['git', 'add', 'data/'], cwd=DATA_WORKTREE)
    if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=DATA_WORKTREE).returncode != 0:
        ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        subprocess.run(['git', 'commit', '-m', f'data: {ts}'], cwd=DATA_WORKTREE, check=True)
        pull = subprocess.run(['git', 'pull', '--rebase', 'origin', 'data'],
                              cwd=DATA_WORKTREE, capture_output=True, text=True)
        if pull.returncode != 0:
            log(f'pull failed: {pull.stderr[:200]}')
            subprocess.run(['git', 'rebase', '--abort'], cwd=DATA_WORKTREE, capture_output=True)
        push = subprocess.run(['git', 'push', 'origin', 'data'],
                              cwd=DATA_WORKTREE, capture_output=True, text=True)
        if push.returncode != 0:
            log(f'push failed: {push.stderr[:200]}')
        else:
            log(f'→ pushed {ts}')


def main():
    # Single-instance lock
    lock_fd = open(LOCK_FILE, 'w')
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('Already running, exiting.')
        sys.exit(0)

    PID_FILE.write_text(str(os.getpid()))
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    log(f'Local poller starting (pid={os.getpid()}, interval={INTERVAL}s)')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                       '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        )
        page = ctx.new_page()

        while True:
            try:
                run_once(page)
            except Exception as e:
                log(f'ERROR: {e}')
                # On page-level errors, reload context to recover session
                try:
                    page.goto(ESO_MAIN, wait_until='domcontentloaded', timeout=30000)
                except Exception:
                    pass
            time.sleep(INTERVAL)


if __name__ == '__main__':
    main()
