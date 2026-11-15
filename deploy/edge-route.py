"""Root on Almaz: replace only the portfolio host block, preserving other sites."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import re
import subprocess

CONFIG = Path('/mnt/spektr/server/management/config/caddy/Caddyfile')
STATE = Path('/opt/server/projects/patrickfanella-site/rollback')
HOST = re.compile(r'^http://patrickfanella\.co \{\n.*?^\}', re.M | re.S)
CSP = "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests"


def sha(value):
    return hashlib.sha256(value.encode()).hexdigest()


def replace_host(config, expected, replacement):
    blocks = HOST.findall(config)
    if len(blocks) != 1 or blocks[0] != expected:
        raise RuntimeError('Portfolio host block changed; refusing to overwrite it')
    return HOST.sub(lambda _: replacement, config, count=1)


def production(block):
    if block.count('reverse_proxy 10.0.0.56:3016') != 1:
        raise RuntimeError('The expected legacy frontend route is absent')
    block = block.replace('reverse_proxy 10.0.0.56:3016', 'reverse_proxy patrickfanella-site:8080')
    block, count = re.subn(r'Content-Security-Policy "[^"]*"', f'Content-Security-Policy "{CSP}"', block)
    if count != 1 or 'reverse_proxy 10.0.0.56:3017' not in block:
        raise RuntimeError('Unexpected CSP or API route')
    return block


def caddy(command, content=None):
    args = ['docker', 'exec'] + (['-i'] if content is not None else []) + ['caddy', 'caddy', command, '--config', '-' if content is not None else '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']
    result = subprocess.run(args, input=content, text=True, capture_output=True)
    if result.returncode:
        # Config errors can quote private configuration. Keep details private.
        path = STATE / f'{command}-error.log'
        path.write_text(result.stdout + result.stderr); path.chmod(0o600)
        raise RuntimeError(f'Caddy {command} failed; private details: {path}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['apply', 'rollback'])
    parser.add_argument('--expected-source')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = Path('/run/lock/patrickfanella-cutover.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX)
    before = CONFIG.read_text()
    blocks = HOST.findall(before)
    if len(blocks) != 1:
        raise RuntimeError('Expected one portfolio host block')
    current = blocks[0]
    if args.action == 'apply':
        if not args.expected_source or not re.fullmatch('[a-f0-9]{40}', args.expected_source):
            raise RuntimeError('Apply requires the exact qualified source revision')
        revision = subprocess.check_output(['docker', 'exec', 'caddy', 'wget', '-qO-', 'http://patrickfanella-site:8080/REVISION'], text=True, timeout=15).strip()
        if revision != args.expected_source:
            raise RuntimeError('The production origin is not the qualified source')
        if (STATE / 'legacy.caddy').exists():
            legacy = (STATE / 'legacy.caddy').read_text()
        else:
            legacy = current
        active = production(legacy)
        if current == active:
            print('Portfolio route already selects the production origin')
            return
        candidate = replace_host(before, legacy, active)
    else:
        legacy = (STATE / 'legacy.caddy').read_text()
        active = (STATE / 'active.caddy').read_text()
        if current == legacy:
            print('Portfolio route already selects the legacy frontend')
            return
        candidate = replace_host(before, active, legacy)
    caddy('validate', candidate)
    if args.dry_run:
        print(f'Validated {args.action}; no route changed')
        return
    if args.action == 'apply':
        for name, content in [('legacy.caddy', legacy), ('active.caddy', active)]:
            path = STATE / name; path.write_text(content); path.chmod(0o600)
        fingerprint = STATE / 'legacy-home.sha256'
        if not fingerprint.exists():
            body = subprocess.check_output(['docker', 'exec', 'caddy', 'wget', '-qO-', 'http://10.0.0.56:3016/'], timeout=20)
            fingerprint.write_text(hashlib.sha256(body).hexdigest() + '\n'); fingerprint.chmod(0o600)
    if CONFIG.read_text() != before:
        raise RuntimeError('Another writer changed Caddy during validation; retry from fresh state')
    # Keep the bind-mounted inode, owner and mode. Never restore a whole old file.
    CONFIG.write_text(candidate)
    try:
        caddy('reload')
    except Exception:
        if CONFIG.read_text() == candidate:
            CONFIG.write_text(before)
            caddy('reload')
        raise
    receipt = {'at': datetime.now(timezone.utc).isoformat(), 'action': args.action, 'source': args.expected_source,
               'beforeHostSha256': sha(current), 'afterHostSha256': sha(HOST.findall(candidate)[0])}
    path = STATE / f'{args.action}-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}.json'
    path.write_text(json.dumps(receipt, indent=2) + '\n'); path.chmod(0o600)
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
