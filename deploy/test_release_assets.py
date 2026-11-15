"""Exercise a release switch through the real, digest-pinned production Caddy."""
import importlib.util
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('updater', ROOT / 'update.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


def write(root, path, content):
    target = root / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


class AssetTests(unittest.TestCase):
    def test_built_worker_dependencies_have_retained_urls(self):
        dist = ROOT.parent / 'dist'
        paths = [p.relative_to(dist).as_posix() for namespace in ['_astro', 'clpr'] for p in (dist / namespace).rglob('*') if p.is_file()]
        self.assertTrue(paths, 'Build the site before testing its release assets')
        mutable = {'_astro/clpr-recording-build.json', 'clpr/manifest.json'}
        for path in paths:
            if path not in mutable:
                self.assertRegex(path, f'^{updater.IMMUTABLE.pattern}$')

    def test_reusing_an_immutable_url_with_different_bytes_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, body in [('old', 'original'), ('new', 'changed')]:
                write(root / name, '_astro/worker-aaaaaaaa.js', body)
            updater.publish_assets(root / 'old', root / 'assets')
            with self.assertRaisesRegex(RuntimeError, 'Immutable asset changed'):
                updater.publish_assets(root / 'new', root / 'assets')
            self.assertEqual((root / 'assets/_astro/worker-aaaaaaaa.js').read_text(), 'original')

    def test_old_worker_dependencies_survive_a_switch_and_release_pruning(self):
        image = re.search(r'image: (\S+)', (ROOT / 'compose.yml').read_text())[1]
        cached = subprocess.run(['docker', 'image', 'inspect', image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if cached.returncode:
            subprocess.run(['docker', 'pull', '--quiet', image], check=True, stdout=subprocess.DEVNULL)
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            data.chmod(0o755)
            old, new = data / 'releases/old', data / 'releases/new'
            pinned = f'clpr/{"a" * 40}/wasm_exec.js'
            write(old, 'index.html', 'old page')
            write(old, '_astro/worker-aaaaaaaa.js', 'old worker')
            write(old, '_astro/database-bbbbbbbb.wasm', 'old database')
            write(old, pinned, 'pinned runtime')
            write(new, 'index.html', 'new page')
            write(new, '_astro/worker-cccccccc.js', 'new worker')
            write(new, 'clpr/manifest.json', 'new manifest')
            write(new, '_astro/clpr-recording-build.json', 'new build metadata')
            updater.publish_assets(old, data / 'assets')
            updater.publish_assets(new, data / 'assets')
            (data / 'current').symlink_to('releases/old')
            config = Path(os.environ.get('ASSET_TEST_CADDYFILE', ROOT / 'origin.Caddyfile')).resolve()
            container = subprocess.check_output(['docker', 'run', '--rm', '--detach', '--read-only', '--user', f'{os.getuid()}:{os.getgid()}', '--publish', '127.0.0.1::8080', '--volume', f'{data}:/srv:ro', '--volume', f'{config}:/etc/caddy/Caddyfile:ro', image, 'caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'], text=True).strip()
            try:
                port = subprocess.check_output(['docker', 'inspect', '--format', '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}', container], text=True).strip()
                base = f'http://127.0.0.1:{port}'

                def get(path):
                    with urllib.request.urlopen(base + path, timeout=5) as response:
                        return response.read().decode(), response.headers

                for _ in range(100):
                    try:
                        get('/healthz')
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.1)
                self.assertEqual(get('/')[0], 'old page')
                self.assertEqual(get('/_astro/worker-aaaaaaaa.js')[0], 'old worker')
                (data / 'current.next').symlink_to('releases/new')
                (data / 'current.next').replace(data / 'current')
                self.assertEqual(get('/')[0], 'new page')
                shutil.rmtree(old)
                for path, body in [('_astro/worker-aaaaaaaa.js', 'old worker'), ('_astro/database-bbbbbbbb.wasm', 'old database'), (pinned, 'pinned runtime'), ('_astro/worker-cccccccc.js', 'new worker')]:
                    actual, headers = get('/' + path)
                    self.assertEqual(actual, body)
                    self.assertIn('immutable', headers['Cache-Control'])
                for path, body in [('clpr/manifest.json', 'new manifest'), ('_astro/clpr-recording-build.json', 'new build metadata')]:
                    actual, headers = get('/' + path)
                    self.assertEqual(actual, body)
                    self.assertEqual(headers['Cache-Control'], 'no-cache')
            finally:
                # Remove only the container this test started, by its recorded ID.
                subprocess.run(['docker', 'rm', '--force', container], check=True, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    unittest.main()
