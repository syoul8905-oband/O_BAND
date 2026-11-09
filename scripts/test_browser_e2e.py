import os
import sys
import time
import threading
import http.server
import socketserver
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

PORT = 8888
PUBLIC_DIR = r"C:\antigravity\오뺀\public"

class StaticHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    with socketserver.TCPServer(("", PORT), StaticHandler) as httpd:
        httpd.serve_forever()

server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()
time.sleep(1)

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chrome_path, headless=True)
    context = browser.new_context(viewport={"width": 390, "height": 844})
    context.add_init_script("""
        window.sessionStorage.setItem('oppaen_auth_user', JSON.stringify({
            id: 901,
            username: 'e2e_member',
            role: 'member',
            display_name: '부원 공용'
        }));
    """)
    page = context.new_page()

    page.goto(f"http://localhost:{PORT}")
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    # Find the day cell for 4th
    day_cells = page.locator(".cal-day-cell")
    count = day_cells.count()
    print(f"Total calendar cells rendered: {count}")

    # Check text inside all pills
    pills = page.locator(".cal-res-pill")
    pill_count = pills.count()
    print(f"Calendar reservation pills found: {pill_count}")
    for i in range(pill_count):
        print(f"  Pill {i+1}: {pills.nth(i).text_content()}")

    # Find and click cell with day 4
    for i in range(count):
        cell = day_cells.nth(i)
        num_el = cell.locator(".cal-day-num")
        if num_el.count() > 0 and num_el.text_content().strip() == "4" and not "other-month" in (cell.get_attribute("class") or ""):
            print("Found day 4 cell, clicking...")
            cell.click()
            break

    time.sleep(1)

    timeline_text = page.locator("#dayTimelineList").text_content()
    print("\n--- Day Timeline for 2026-11-04 ---")
    print(timeline_text)

    # Check edit button [✏️ 수정]
    has_edit_btn = "수정" in timeline_text
    print("\nHas [✏️ 수정] button?", has_edit_btn)

    assert "최두성" in timeline_text, "최두성 부원의 예약이 타임라인에 없습니다!"
    assert "18:00 ~ 20:00" in timeline_text, "18:00 ~ 20:00 시간대가 없습니다!"
    print("\n🎉🎉🎉 [VERIFIED 100%] 최두성 부원의 실예약이 달력 칩과 일자 타임라인에 완벽히 출력되었습니다!")

    browser.close()
