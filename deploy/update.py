"""Almaz only: publish the existing CI deploy branch by an atomic symlink swap."""
import argparse
import fcntl
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile


IMMUTABLE = re.compile(r'(?:_astro/.+[.-][A-Za-z0-9_-]{8}\.[A-Za-z0-9]+|clpr/[a-f0-9]{40}/.+)')


def publish_assets(release, assets):
    # Hard links publish complete files atomically and outlive release pruning.
    # Stable manifests stay in the selected release, with revalidation headers.
    for namespace in ['_astro', 'clpr']:
        for source in (release / namespace).rglob('*'):
            relative = source.relative_to(release)
            if not source.is_file() or not IMMUTABLE.fullmatch(relative.as_posix()):
                continue
            target = assets / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.link(source, target)
            except FileExistsError:
                with source.open('rb') as original, target.open('rb') as published:
                    if hashlib.file_digest(original, 'sha256').digest() != hashlib.file_digest(published, 'sha256').digest():
                        raise RuntimeError(f'Immutable asset changed at the same URL: {relative}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-source', help='Refuse to activate any other source commit')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    os.chdir(root)
    lock = (root / '.update.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return
    env = os.environ.copy()
    env['GIT_SSH_COMMAND'] = f'ssh -i {Path.home()}/.ssh/patrickfanella-site-deploy -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o ControlMaster=no -o ControlPath=none'
    source = root / 'source.git'
    if not source.exists():
        subprocess.run(['git', 'init', '--bare', '-q', str(source)], check=True)
    subprocess.run(['git', '-C', str(source), 'fetch', '-q', '--depth', '1', 'git@github.com:PatrickFanella/patrickfanella-site.git', '+refs/heads/deploy:refs/heads/deploy'], env=env, check=True)
    build = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'refs/heads/deploy'], text=True).strip()
    if not re.fullmatch('[a-f0-9]{40}', build):
        raise RuntimeError('Invalid build commit')
    data = root / 'site-data'
    releases = data / 'releases'
    releases.mkdir(parents=True, exist_ok=True)
    release = releases / build
    if not release.exists():
        incoming = releases / f'.incoming-{build}'
        if incoming.exists():
            shutil.rmtree(incoming)
        incoming.mkdir()
        archive = subprocess.Popen(['git', '-C', str(source), 'archive', build], stdout=subprocess.PIPE)
        with tarfile.open(fileobj=archive.stdout, mode='r|') as tar:
            tar.extractall(incoming, filter='data')
        if archive.wait() != 0:
            raise RuntimeError('Build archive failed')
        for path in ['index.html', 'contact/index.html', 'desk/index.html', 'robots.txt', 'sitemap.xml', 'REVISION']:
            if not (incoming / path).is_file():
                raise RuntimeError(f'Incomplete release: {path}')
        incoming.rename(release)
    revision = (release / 'REVISION').read_text().strip()
    if not re.fullmatch('[a-f0-9]{40}', revision) or (args.expected_source and revision != args.expected_source):
        raise RuntimeError('The release is not the expected source revision')
    publish_assets(release, data / 'assets')
    target = f'releases/{build}'
    if (data / 'current').is_symlink() and os.readlink(data / 'current') == target:
        print(f'Already serving source {revision}')
        return
    if (data / 'current').is_symlink():
        (data / 'previous.next').unlink(missing_ok=True)
        (data / 'previous.next').symlink_to(os.readlink(data / 'current'))
        (data / 'previous.next').replace(data / 'previous')
    (data / 'current.next').unlink(missing_ok=True)
    (data / 'current.next').symlink_to(target)
    (data / 'current.next').replace(data / 'current')
    # Keep five releases and both named rollback/current selections.
    protected = {p.resolve() for p in [data / 'current', data / 'previous'] if p.is_symlink()}
    old = sorted((p for p in releases.iterdir() if p.is_dir() and re.fullmatch('[a-f0-9]{40}', p.name)), key=lambda p: p.stat().st_mtime, reverse=True)
    for path in old[5:]:
        if path.resolve() not in protected:
            shutil.rmtree(path)
    print(f'Production origin now serves source {revision}, build {build}')


if __name__ == '__main__':
    main()
