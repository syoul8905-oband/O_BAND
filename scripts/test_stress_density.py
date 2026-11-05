"""
Adversarial Multi-Booking Density Stress Test Runner
Invokes scripts/test_stress_density.js via bundled Playwright Node runtime.
"""

import sys
import os
import subprocess
import shutil

def find_node_executable():
    site_packages = os.path.dirname(os.path.dirname(subprocess.__file__))
    bundled_paths = [
        r"C:\Users\User\AppData\Local\Programs\Python\Python311\Lib\site-packages\playwright\driver\node.exe",
        os.path.join(site_packages, "site-packages", "playwright", "driver", "node.exe"),
        os.path.join(os.path.dirname(sys.executable), "Lib", "site-packages", "playwright", "driver", "node.exe")
    ]
    for p in bundled_paths:
        if os.path.exists(p):
            return p

    sys_node = shutil.which("node")
    if sys_node:
        return sys_node

    return None

def main():
    node_exe = find_node_executable()
    if not node_exe:
        print("[FATAL] Node executable could not be found.")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    js_runner = os.path.join(script_dir, "test_stress_density.js")

    if not os.path.exists(js_runner):
        print(f"[FATAL] Test runner script not found: {js_runner}")
        sys.exit(1)

    cmd = [node_exe, js_runner] + sys.argv[1:]
    res = subprocess.run(cmd)
    sys.exit(res.returncode)

if __name__ == '__main__':
    main()
