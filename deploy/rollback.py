"""Run from Kvant: one command to restore the retained legacy frontend."""
import subprocess
import urllib.request
import hashlib
import re
import time


def main():
    subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', 'almaz', 'rtk proxy sudo -n systemctl disable --now patrickfanella-site-update.timer'], check=True)
    subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', 'nuc', 'rtk proxy docker start patrickfanella-web'], check=True)
    subprocess.run(['ssh', '-T', '-o', 'BatchMode=yes', 'almaz', 'rtk proxy sudo -n python3 /opt/server/projects/patrickfanella-site/edge-route.py rollback'], check=True)
    expected = subprocess.check_output(['ssh', '-T', '-o', 'BatchMode=yes', 'almaz', 'rtk proxy sudo -n cat /opt/server/projects/patrickfanella-site/rollback/legacy-home.sha256'], text=True).strip()
    if not re.fullmatch('[a-f0-9]{64}', expected):
        raise RuntimeError('The retained legacy fingerprint is invalid')
    request = urllib.request.Request(f'https://patrickfanella.co/?rollback-check={time.time_ns()}', headers={'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0 (compatible; PatrickFanella-Site-Verification/1.0)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200 or hashlib.sha256(response.read()).hexdigest() != expected:
            raise RuntimeError('The public response does not match the retained legacy frontend')
    print('Legacy frontend restored and public HTML fingerprint matched; new-site updates are disabled. API and database were not changed.')


if __name__ == '__main__':
    main()
