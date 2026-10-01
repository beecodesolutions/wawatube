"""Offline check: python3 scripts/test_tunnel.py."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import unittest
from unittest.mock import MagicMock, patch

module = runpy.run_path(str(Path(__file__).with_name('tunnel.py')))
main = module['main']


class TunnelTest(unittest.TestCase):
    def test_proxy_and_cleanup_on_interrupt(self):
        config = module['proxy_config'](3188, 5173, 'http://localhost:3100', 'https://test.trycloudflare.com')
        self.assertIn('default $http_origin', config)
        self.assertIn('auth_basic_user_file', config)
        self.assertIn('proxy_set_header Upgrade $http_upgrade', config)
        calls = []

        def output(command, **kwargs):
            if command[0] == 'node':
                return json.dumps({'port': '3100', 'origin': 'http://localhost:3100'})
            if command[0] == 'openssl':
                return 'test-hash'
            return 'https://test.trycloudflare.com'

        process = MagicMock(pid=12345)
        process.poll.return_value = None
        with patch.dict(main.__globals__, {'run': lambda *a, **k: calls.append(a), 'wait_http': lambda *a: None, 'free_port': MagicMock(side_effect=[3188, 5173])}), \
             patch('sys.argv', ['tunnel.py']), patch('shutil.which', return_value='/bin/test'), \
             patch('subprocess.check_output', side_effect=output), \
             patch('subprocess.run') as stop, patch('subprocess.Popen', return_value=process) as popen, \
             patch('time.sleep', side_effect=KeyboardInterrupt), patch('os.killpg') as kill, \
             contextlib.redirect_stdout(io.StringIO()):
            stop.return_value.returncode = 0
            with self.assertRaises(KeyboardInterrupt):
                main()
            stopped = [c.args[0][2] for c in stop.call_args_list if c.args[0][:2] == ['docker', 'stop']]
            self.assertEqual(len(stopped), 2)
            self.assertTrue(stopped[0].startswith('wawatube-tunnel-'))
            self.assertTrue(stopped[1].startswith('wawatube-proxy-'))
            kill.assert_called_once()
            self.assertIn('"clientPort": 443', popen.call_args.args[0][-1])
            self.assertIn(('docker', 'exec', stopped[1], 'nginx', '-t'), calls)


if __name__ == '__main__':
    unittest.main()
