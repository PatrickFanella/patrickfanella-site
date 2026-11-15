import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('edge_route', Path(__file__).with_name('edge-route.py'))
edge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)


class RouteTests(unittest.TestCase):
    def test_cutover_and_rollback_touch_only_the_portfolio(self):
        legacy = 'http://patrickfanella.co {\n\theader {\n\t\tContent-Security-Policy "old"\n\t}\n\thandle /api/* {\n\t\treverse_proxy 10.0.0.56:3017\n\t}\n\thandle {\n\t\treverse_proxy 10.0.0.56:3016\n\t}\n}'
        other = '\nhttp://other.invalid {\n\trespond "unchanged"\n}\n'
        config = '# global config\n' + legacy + other
        active = edge.production(legacy)
        result = edge.replace_host(config, legacy, active)
        self.assertIn('reverse_proxy patrickfanella-site:8080', result)
        self.assertIn('reverse_proxy 10.0.0.56:3017', result)
        self.assertTrue(result.endswith(other))
        self.assertEqual(edge.replace_host(result, active, legacy), config)
        with self.assertRaises(RuntimeError):
            edge.replace_host(result.replace('reverse_proxy 10.0.0.56:3017', 'reverse_proxy changed:3017'), active, legacy)


if __name__ == '__main__':
    unittest.main()
