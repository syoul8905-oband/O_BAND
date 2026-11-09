import os
import sys
import time
import threading
import http.server
import socketserver
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

PORT = 8891
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

    # Automatically accept dialogs/alerts
    page.on("dialog", lambda dialog: dialog.accept())

    print("Navigating to http://localhost:8891 ...")
    page.goto(f"http://localhost:{PORT}")
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    # 1. Open booking modal
    print("1. Opening booking modal...")
    page.click("#btnBookSlot")
    time.sleep(1)

    # 2. Fill out booking form for upcoming evening hours (20:00~22:00)
    print("2. Filling form: 20:00~22:00, 부원 '자동검증부원', PIN '7788'...")
    page.select_option("#bookStartTime", "20:00")
    time.sleep(0.5)
    page.select_option("#bookEndTime", "22:00")
    page.fill("#bookMemberName", "자동검증부원")
    page.fill("#bookPin", "7788")

    # 3. Submit booking
    print("3. Submitting booking...")
    page.click("#btnSubmitBooking")
    time.sleep(3)

    # Close success modal if opened
    page.evaluate("() => { if (typeof closeModal === 'function') closeModal('bookingSuccessModal'); }")
    time.sleep(1)

    # 4. Check timeline for new booking
    timeline_text = page.locator("#dayTimelineList").text_content()
    print("\nTimeline after booking:")
    print(timeline_text)
    assert "자동검증부원" in timeline_text, "신규 예약이 타임라인에 표시되지 않았습니다!"
    assert "20:00 ~ 22:00" in timeline_text, "20:00 ~ 22:00 시간이 표시되지 않았습니다!"
    print("✅ 신규 예약 등록 성공!")

    # 5. Test Cancel booking
    print("\n5. Testing Cancel booking...")
    cancel_btn = page.locator("#dayTimelineList button.btn-cancel-res:has-text('취소')").last
    cancel_btn.click()
    time.sleep(1)

    page.fill("#cancelPin", "7788")
    page.click("#cancelModal button[type='submit']")
    time.sleep(3)

    timeline_after_cancel = page.locator("#dayTimelineList").text_content()
    print("\nTimeline after cancel:")
    print(timeline_after_cancel)
    assert "자동검증부원" not in timeline_after_cancel, "취소된 예약이 아직 타임라인에 남아있습니다!"
    print("✅ 예약 취소 성공 및 타임라인 자동 갱신 확인 완료!")

    print("\n🎉🎉🎉 [ALL E2E WORKFLOWS 100% PASSED] 신규 예약 -> 타임라인 표출 -> 취소 -> 슬롯 반환 완벽 작동!")
    browser.close()
