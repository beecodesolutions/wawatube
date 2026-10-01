"""Run with python3 scripts/test_setup_lan.py; never changes host services."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("setup_lan", Path(__file__).with_name("setup-lan.py"))
lan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lan)


class SetupLanTest(unittest.TestCase):
    def test_configuration_and_rollback(self):
        original = '# Keep this\nSECRET="$(do-not-execute)"\nHOST=0.0.0.0\nPORT=9999\nexport PUBLIC_ORIGIN="http://old"\n'
        configured = lan.env_config(original, "wawatube", 3100)
        self.assertIn('SECRET="$(do-not-execute)"', configured)
        self.assertEqual(configured.count("PUBLIC_ORIGIN="), 1)
        self.assertIn("HOST=127.0.0.1", configured)
        self.assertEqual(lan.env_config(configured, "wawatube", 3100), configured)
        avahi = lan.avahi_config('[server]\ndeny-interfaces=wlo1\n[publish]\npublish-workstation=no\n', 'wawatube', 'wlo1')
        self.assertIn('allow-interfaces=wlo1', avahi)
        self.assertNotIn('deny-interfaces', avahi)
        self.assertIn('publish-workstation=no', avahi)
        self.assertEqual(lan.avahi_config(avahi, 'wawatube', 'wlo1'), avahi)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = root / '.env'
            env.write_text(original)
            env.chmod(0o600)
            nginx = root / 'wawatube.conf'
            backup = root / 'backup'
            backup.mkdir()
            with patch.object(lan, 'run', side_effect=subprocess.CalledProcessError(1, 'nginx')), patch.object(lan.subprocess, 'run'):
                with self.assertRaises(subprocess.CalledProcessError):
                    lan.apply({env: configured, nginx: lan.nginx_config('wawatube', 3100)}, backup, 'wawatube')
            self.assertEqual(env.read_text(), original)
            self.assertEqual(env.stat().st_mode & 0o777, 0o600)
            self.assertFalse(nginx.exists())
            with patch.object(lan, 'run') as run, patch.object(lan.urllib.request, 'urlopen') as urlopen:
                response = urlopen.return_value.__enter__.return_value
                response.status = 200
                response.read.return_value = b'{"status":"ok"}'
                lan.apply({env: configured, nginx: lan.nginx_config('wawatube', 3100)}, backup, 'wawatube')
                self.assertEqual(urlopen.call_args.args[0].get_header('Host'), 'wawatube.local')
                self.assertEqual(run.call_args_list[0].args, ('nginx', '-t'))
            self.assertEqual(env.read_text(), configured)
            self.assertIn('listen [::]:80;', nginx.read_text())


if __name__ == '__main__':
    unittest.main()
