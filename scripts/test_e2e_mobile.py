"""
오뺀 (오늘부터 밴드부) - Headless Chrome Mobile E2E Test Suite Runner
Python wrapper that executes scripts/test_e2e_mobile.js via bundled Playwright Node runtime.
"""

import sys
import os
import subprocess
import shutil

def find_node_executable():
    # 1. Bundled Playwright node in Python site-packages
    site_packages = os.path.dirname(os.path.dirname(subprocess.__file__))
    bundled_paths = [
        r"C:\Users\User\AppData\Local\Programs\Python\Python311\Lib\site-packages\playwright\driver\node.exe",
        os.path.join(site_packages, "site-packages", "playwright", "driver", "node.exe"),
        os.path.join(os.path.dirname(sys.executable), "Lib", "site-packages", "playwright", "driver", "node.exe")
    ]
    for p in bundled_paths:
        if os.path.exists(p):
            return p

    # 2. System node in PATH
    sys_node = shutil.which("node")
    if sys_node:
        return sys_node

    return None

def main():
    node_exe = find_node_executable()
    if not node_exe:
        print("[FATAL] Node executable could not be found. Please ensure Playwright or Node.js is installed.")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    js_runner = os.path.join(script_dir, "test_e2e_mobile.js")

    if not os.path.exists(js_runner):
        print(f"[FATAL] Test runner script not found: {js_runner}")
        sys.exit(1)

    cmd = [node_exe, js_runner] + sys.argv[1:]
    res = subprocess.run(cmd)
    sys.exit(res.returncode)

if __name__ == '__main__':
    main()
