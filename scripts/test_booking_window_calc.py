import sys
import os
import subprocess

def test_calc_dates():
    # Node script to verify calcMaxAllowedDate across all dates
    js_code = """
    function calcMaxAllowedDate(baseDateStr, openWeeks = 2, resetDay = 0) {
      const [y, m, d] = baseDateStr.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      const jsDay = dt.getUTCDay();
      const daysSinceReset = (jsDay - Number(resetDay) + 7) % 7;
      const maxDt = new Date(Date.UTC(y, m - 1, d - daysSinceReset + (Number(openWeeks) * 7) - 1));
      const my = maxDt.getUTCFullYear();
      const mm = String(maxDt.getUTCMonth() + 1).padStart(2, '0');
      const md = String(maxDt.getUTCDate()).padStart(2, '0');
      return `${my}-${mm}-${md}`;
    }

    const cases = [
      { date: '2026-11-01', day: 'Sun', expected: '2026-11-14' },
      { date: '2026-11-02', day: 'Mon', expected: '2026-11-14' },
      { date: '2026-11-03', day: 'Tue', expected: '2026-11-14' },
      { date: '2026-11-04', day: 'Wed', expected: '2026-11-14' },
      { date: '2026-11-05', day: 'Thu', expected: '2026-11-14' },
      { date: '2026-11-06', day: 'Fri', expected: '2026-11-14' },
      { date: '2026-11-07', day: 'Sat', expected: '2026-11-14' },
      { date: '2026-11-08', day: 'Sun (Next Reset)', expected: '2026-11-21' },
      { date: '2026-11-14', day: 'Sat (Next Sat)', expected: '2026-11-21' },
      { date: '2026-11-15', day: 'Sun (2nd Reset)', expected: '2026-11-28' },
    ];

    let passed = 0;
    for (const c of cases) {
      const actual = calcMaxAllowedDate(c.date, 2, 0);
      if (actual !== c.expected) {
        console.error(`FAIL: For ${c.date} (${c.day}), expected ${c.expected}, got ${actual}`);
        process.exit(1);
      } else {
        console.log(`PASS: ${c.date} (${c.day}) -> ${actual}`);
        passed++;
      }
    }
    console.log(`All ${passed} date calculation test cases PASSED!`);
    """
    
    node_exe = r"C:\Users\User\AppData\Local\Programs\Python\Python311\Lib\site-packages\playwright\driver\node.exe"
    res = subprocess.run([node_exe, "-e", js_code], capture_output=True, text=True)
    print(res.stdout)
    if res.returncode != 0:
        print(res.stderr)
        sys.exit(1)

if __name__ == '__main__':
    test_calc_dates()
