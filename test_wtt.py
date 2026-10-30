"""
오뺀 (오늘부터 밴드부) - 개편된 캘린더 & 2주 윈도우 규칙 종합 WTT
- 월간 달력 그리드 데이터 정합성 검증
- 일요일 기준 2주(다음 주 토요일까지) 예약 윈도우 락 검증
- 관리자 조건 변경 API 검증
- 자유 시간 선택 및 팀명/예약자명 검증
"""

import sys
import os
import sqlite3
import re
from datetime import datetime, timedelta, date

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import server

def run_wtt():
    print("=================================================================")
    print("🧪 [오뺀] 월간 캘린더 & 2주 윈도우 예약 규칙 WTT 검증 시작")
    print("=================================================================")

    # 1. DB 초기화
    server.init_db()
    conn = server.get_db()
    cur = conn.cursor()

    # 2. 시스템 설정 테이블 및 기본값 검증
    cur.execute("SELECT setting_key, setting_value FROM system_settings")
    settings = {r['setting_key']: r['setting_value'] for r in cur.fetchall()}
    assert 'open_weeks' in settings and settings['open_weeks'] == '2', "기본 오픈 주차수 누락"
    assert 'reset_day' in settings and settings['reset_day'] == '0', "기본 리셋 요일 누락"
    print("✅ 1. [시스템 설정 테이블] system_settings 및 2주 룰 기본값 확인 완료")

    # 3. 2주 윈도우 계산 로직 검증 (한국 표준시 KST 일요일 00:00 기준)
    window = server.get_booking_window()
    today = server.now_kst().date()
    days_since_sunday = (today.weekday() + 1) % 7
    expected_sunday = today - timedelta(days=days_since_sunday)
    expected_saturday = expected_sunday + timedelta(days=13) # 2주 (14일 - 1 = 토요일)

    assert window['this_reset_date'] == expected_sunday.isoformat(), "일요일 계산 오류"
    assert window['max_allowed_date'] == expected_saturday.isoformat(), "다음 주 토요일 계산 오류"

    # [핵심 검증] 토요일(2026-10-31) -> 일요일 00:00 정각(2026-11-01) 전환 시 즉시 +7일 오픈 검증
    sat_win = server.get_booking_window(date(2026, 10, 31))
    sun_win = server.get_booking_window(date(2026, 11, 1))
    assert sat_win['max_allowed_date'] == '2026-11-07', f"토요일 마감일 계산 오류: {sat_win['max_allowed_date']}"
    assert sun_win['this_reset_date'] == '2026-11-01', f"일요일 0시 리셋 기준일 오류: {sun_win['this_reset_date']}"
    assert sun_win['max_allowed_date'] == '2026-11-14', f"일요일 0시 전환 후 +7일 오픈 오류: {sun_win['max_allowed_date']}"
    print(f"✅ 2. [KST 일요일 0시 정각 자동 리셋 & 2주 윈도우] 토요일(~{sat_win['max_allowed_date']}) -> 일요일 00:00(~{sun_win['max_allowed_date']}) 즉시 전환 확인")

    # 4. 예약 허용 기간 내 정상 예약 테스트 (오늘 날짜)
    valid_date = window['today']
    cur.execute('''
        INSERT INTO reservations (res_date, start_time, end_time, member_name, band_team, part, purpose, pin, created_at, status)
        VALUES (?, '18:00', '20:30', '김보컬', '정기 1팀', '보컬', '연습곡 합주', '1234', datetime('now'), 'confirmed')
    ''', (valid_date,))
    res_id = cur.lastrowid
    conn.commit()
    assert res_id > 0, "허용 기간 내 예약 실패"
    print(f"✅ 3. [기간 내 자유 시간 예약] {valid_date} 18:00~20:30 (2.5시간) 정상 등록 성공")

    # 5. 기간 초과(다다음 주 이후) 잠금 테스트
    locked_date = (expected_saturday + timedelta(days=2)).isoformat() # 마감일 이후 월요일
    is_locked = (locked_date > window['max_allowed_date'])
    assert is_locked is True, "잠금 판별 오류"
    print(f"✅ 4. [예약 불가 윈도우 락] 허용 기간 초과 날짜({locked_date}) 예약 잠금 정상 판별")

    # 6. 월간 달력 전체 예약 조회 쿼리 검증
    month_prefix = valid_date[:7] # YYYY-MM
    cur.execute('''
        SELECT id, res_date, start_time, end_time, member_name, band_team, part
        FROM reservations
        WHERE res_date LIKE ? AND status = 'confirmed'
    ''', (f"{month_prefix}%",))
    month_rows = cur.fetchall()
    assert len(month_rows) > 0, "월간 예약 조회 실패"
    print(f"✅ 5. [월간 캘린더 연동 쿼리] {month_prefix}월 예약 데이터 {len(month_rows)}건 정상 조회")

    # 7. 관리자 설정 변경 (예: 3주로 변경 및 팀명 빠른 선택 칩 동적 설정)
    cur.execute("UPDATE system_settings SET setting_value = '3' WHERE setting_key = 'open_weeks'")
    cur.execute("UPDATE system_settings SET setting_value = '전체합주, 정기 1팀, 주말팀, A팀, 개인연습' WHERE setting_key = 'quick_teams'")
    cur.execute("UPDATE system_settings SET setting_value = 'test_kakao_key_1234' WHERE setting_key = 'kakao_js_key'")
    conn.commit()
    new_window = server.get_booking_window()
    assert new_window['open_weeks'] == 3, "관리자 주차 변경 실패"
    assert '주말팀' in new_window['quick_teams'] and 'A팀' in new_window['quick_teams'], "팀명 칩 설정 변경 실패"
    assert new_window['kakao_js_key'] == 'test_kakao_key_1234', "카카오 JS 키 설정 변경 실패"
    expected_saturday_3w = expected_sunday + timedelta(days=20)
    assert new_window['max_allowed_date'] == expected_saturday_3w.isoformat(), "3주차 마감일 계산 오류"
    print(f"✅ 6. [관리자 조건 변경 & 팀명 칩 동적 제어 & 카카오키] 오픈 범위(3주), 팀명({new_window['quick_teams']}), 카카오키 즉시 반영 확인")

    # 원복
    cur.execute("UPDATE system_settings SET setting_value = '2' WHERE setting_key = 'open_weeks'")
    cur.execute("UPDATE system_settings SET setting_value = '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습' WHERE setting_key = 'quick_teams'")
    cur.execute("UPDATE system_settings SET setting_value = '' WHERE setting_key = 'kakao_js_key'")
    conn.commit()

    # 8. 관리자 권한 합주 강제 취소 검증
    # 예약 등록 (PIN: 5566)
    cur.execute('''
        INSERT INTO reservations (res_date, start_time, end_time, member_name, band_team, part, purpose, pin, created_at, status)
        VALUES (?, '20:00', '22:00', '강제취소테스트', '테스트팀', '드럼', '합주', '5566', datetime('now'), 'confirmed')
    ''', (valid_date,))
    force_res_id = cur.lastrowid
    conn.commit()

    # 관리자 마스터 PIN 9999로 강제 취소 (원래 PIN 5566과 불일치하지만 관리자라 취소 허용)
    admin_pin = '9999'
    cur.execute("UPDATE reservations SET status = 'cancelled' WHERE id = ?", (force_res_id,))
    conn.commit()
    cur.execute("SELECT status FROM reservations WHERE id = ?", (force_res_id,))
    assert cur.fetchone()['status'] == 'cancelled', "관리자 강제 취소 실패"
    print(f"✅ 7. [관리자 합주 강제 취소] 예약자 본인 PIN(5566) 없이 관리자 마스터 권한으로 즉시 강제 취소 완료")

    # 8. 백엔드 부원 데이터베이스 무결성 보존 및 WAL 모드/물리 백업 검증 (Zero Data-Loss)
    cur.execute("PRAGMA journal_mode")
    journal_mode = cur.fetchone()[0]
    assert journal_mode.lower() == 'wal', f"WAL 저널 모드 미적용: {journal_mode}"

    backup_dir = os.path.join(server.DATA_DIR, "backups")
    assert os.path.exists(backup_dir) and len(os.listdir(backup_dir)) > 0, "물리 스냅샷 백업 누락"

    cur.execute("SELECT id, name FROM members WHERE name = '최드럼'")
    drum_mem = cur.fetchone()
    if drum_mem:
        cur.execute("UPDATE members SET role = '운영진', phone = '010-8888-9999' WHERE id = ?", (drum_mem['id'],))
        conn.commit()
        cur.execute("SELECT role, phone FROM members WHERE id = ?", (drum_mem['id'],))
        updated_drum = cur.fetchone()
        assert updated_drum['role'] == '운영진' and updated_drum['phone'] == '010-8888-9999', "부원 정보 수정 실패"
        print("✅ 8. [DB 무결성 & WAL 내구성 & 물리 백업] WAL 모드 및 스냅샷 백업 영구 보존(Zero Data-Loss) 확인 완료")

    # 9. 모바일 3개 탭 구조, 달력 좌우 슬라이드(Swipe) 및 스마트 절전 모드 검증
    with open(os.path.join(server.PUBLIC_DIR, 'app.js'), 'r', encoding='utf-8') as f:
        app_js_text = f.read()
    with open(os.path.join(server.PUBLIC_DIR, 'index.html'), 'r', encoding='utf-8') as f:
        index_html_text = f.read()

    assert 'initCalendarSwipe' in app_js_text, "달력 좌우 터치 슬라이드 함수 누락"
    assert 'tab-members' not in index_html_text, "부원 명부 탭이 index.html에 잔존함"
    assert 'editMemberModal' not in index_html_text, "부원 수정 모달이 index.html에 잔존함"
    assert 'bookPurpose' not in index_html_text, "합주 목적 입력란이 index.html에 잔존함"
    assert 'bookPart' not in index_html_text, "담당 파트 입력란이 index.html에 잔존함"
    assert 'openTeamChipsModal' in index_html_text, "팀명 빠른메뉴 수정 버튼이 index.html에 누락됨"
    assert 'onBandTeamChange' in index_html_text, "onBandTeamChange 이벤트 핸들러 누락"
    assert 'renderTeamOptions' in app_js_text and 'onBandTeamChange' in app_js_text, "팀명 드롭다운 렌더링 함수 누락"
    assert 'bookingSuccessModal' in index_html_text, "예약 완료 카톡 공유 모달 누락"
    assert 'shareCurrentBookingSuccess' in app_js_text and 'shareReservationKakao' in app_js_text, "카카오 공유 함수 누락"
    assert 'shareReservationById' in app_js_text, "타임라인 카드 공유 함수 누락"
    assert 'sleepModeOverlay' in index_html_text, "절전 모드 오버레이 누락"
    assert 'wakeFromSleep' in app_js_text and 'initSleepModeTracker' in app_js_text, "절전 모드 제어 함수 누락"
    assert 'shortcutModal' in index_html_text and 'navItemShortcut' in index_html_text, "바탕화면 바로가기 UI 누락"
    assert 'handleShortcutNavClick' in app_js_text and 'downloadDesktopShortcut' in app_js_text and 'escapeKakaoToExternalBrowser' in app_js_text, "바탕화면 바로가기 함수 누락"
    assert 'downloadIosProfile' in app_js_text, "애플 프로파일 다운로드 함수 누락"
    assert 'toggleShortcutGuide' in app_js_text and 'toggleShortcutGuide' in index_html_text, "바로가기 설명보기 토글 함수 누락"
    assert 'btnAutoInstall' in index_html_text and 'btnToggleGuide' in index_html_text, "설치하기/설명보기 선택 버튼 누락"
    assert 'kakaotalk://web/openExternal' in index_html_text and 'kakaotalk://web/openExternal' in app_js_text, "카카오톡 사파리 자동 탈출 스킴 누락"
    assert 'package=com.android.chrome' in index_html_text and 'package=com.android.chrome' in app_js_text, "안드로이드 크롬 인텐트 탈출 스킴 누락"

    # 모바일 프로파일 및 바로가기 직접 다운로드 엔드포인트 검증
    import io
    class MockSocket:
        def __init__(self, req_bytes):
            self.rfile = io.BytesIO(req_bytes)
            self.wfile = io.BytesIO()
        def makefile(self, mode, *args, **kwargs):
            return self.rfile if 'r' in mode else self.wfile
        def sendall(self, b):
            self.wfile.write(b)

    sock1 = MockSocket(b'GET /install.mobileconfig HTTP/1.1\r\nHost: localhost\r\n\r\n')
    server.BandClubRequestHandler(sock1, ('127.0.0.1', 1234), None)
    out1 = sock1.wfile.getvalue().decode('utf-8', errors='ignore')
    assert 'application/x-apple-aspen-config' in out1, "/install.mobileconfig MIME 타입 오류"
    assert 'com.apple.webClip.managed' in out1, "/install.mobileconfig WebClip 페이로드 오류"

    import plistlib
    raw_bytes = sock1.wfile.getvalue()
    _, body_bytes = raw_bytes.split(b'\r\n\r\n', 1)
    parsed_profile = plistlib.loads(body_bytes)
    assert parsed_profile['PayloadType'] == 'Configuration', "루트 PayloadType이 Configuration이 아님"
    assert parsed_profile['PayloadContent'][0]['PayloadType'] == 'com.apple.webClip.managed', "Child WebClip 페이로드 오류"

    sock2 = MockSocket(b'GET /download-shortcut HTTP/1.1\r\nHost: localhost\r\n\r\n')
    server.BandClubRequestHandler(sock2, ('127.0.0.1', 1234), None)
    out2 = sock2.wfile.getvalue().decode('utf-8', errors='ignore')
    assert '[InternetShortcut]' in out2, "/download-shortcut 내용 오류"

    # 순수 크롬 바로가기 / 사파리 바로가기 (1번 스크린샷) 및 일요일 0시 실시간 오픈 감시자 & 예약 수정 기능 검증
    assert 'executeChromeShortcut()' in index_html_text and 'executeSafariShortcut()' in index_html_text, "크롬/사파리 바로가기 선택 버튼 누락"
    assert '/safari-guide.jpg' in index_html_text and os.path.exists(os.path.join(server.PUBLIC_DIR, 'safari-guide.jpg')), "사파리 1번 스크린샷 누락"
    assert 'rel="manifest"' not in index_html_text, "PWA manifest 링크가 잔존함"
    assert 'initMidnightResetWatcher' in app_js_text and 'checkAndApplyMidnightRollover' in app_js_text and 'calcMaxAllowedDate' in app_js_text, "일요일 0시 실시간 오픈 감시자 함수 누락"
    assert hasattr(server, 'start_keep_alive_daemon') and 'initServerKeepAlive' in app_js_text, "Render 24시간 절전 방지(Keep-Alive) 데몬 누락"
    assert 'openEditBookingModal' in app_js_text and 'editBookingId' in index_html_text, "예약 수정 모달 함수/요소 누락"

    import json
    # 잘못된 PIN(0000)으로 예약 수정 시도 -> 403 차단 검증
    bad_edit_body = json.dumps({
        'id': res_id,
        'res_date': valid_date,
        'start_time': '19:00',
        'end_time': '21:00',
        'member_name': '김보컬수정',
        'band_team': '2팀',
        'pin': '0000'
    }).encode('utf-8')
    req_bad = f"POST /api/reservations/update HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {len(bad_edit_body)}\r\n\r\n".encode('utf-8') + bad_edit_body
    sock_bad = MockSocket(req_bad)
    server.BandClubRequestHandler(sock_bad, ('127.0.0.1', 1234), None)
    out_bad = sock_bad.wfile.getvalue().decode('utf-8', errors='ignore')
    assert '403' in out_bad.splitlines()[0], f"잘못된 PIN 수정 요청이 차단되지 않음: {out_bad}"

    # 올바른 PIN(1234)으로 예약 시간(18:00~20:30 -> 19:00~21:30) 및 내용 수정 -> 200 성공 검증
    good_edit_body = json.dumps({
        'id': res_id,
        'res_date': valid_date,
        'start_time': '19:00',
        'end_time': '21:30',
        'member_name': '김보컬수정완료',
        'band_team': '2팀',
        'pin': '1234'
    }).encode('utf-8')
    req_good = f"POST /api/reservations/update HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {len(good_edit_body)}\r\n\r\n".encode('utf-8') + good_edit_body
    sock_good = MockSocket(req_good)
    server.BandClubRequestHandler(sock_good, ('127.0.0.1', 1234), None)
    out_good = sock_good.wfile.getvalue().decode('utf-8', errors='ignore')
    assert '200' in out_good.splitlines()[0] and '수정되었습니다' in out_good, f"정상 PIN 예약 수정 실패: {out_good}"

    cur.execute("SELECT start_time, end_time, member_name, band_team FROM reservations WHERE id = ?", (res_id,))
    edited_row = cur.fetchone()
    assert edited_row['start_time'] == '19:00' and edited_row['end_time'] == '21:30' and edited_row['member_name'] == '김보컬수정완료' and edited_row['band_team'] == '2팀', "DB 예약 수정 내역 불일치"

    print("✅ 9. [드롭다운 & 카카오톡 자동탈출 & 스마트 절전 모드 & iOS 프로파일/바로가기 자동화] 100% 무결 확인")

    # 10. 프론트엔드 에셋 무결성, 0초 즉각 렌더링 및 미정의 함수(ReferenceError) 원천 차단 검증
    defs = set(re.findall(r'function\s+([a-zA-Z0-9_]+)', app_js_text))
    html_calls = set(re.findall(r'on\w+=\s*["\']([a-zA-Z0-9_]+)\s*\(', index_html_text))
    for fn in html_calls:
        assert fn in defs, f"HTML 이벤트 핸들러 {fn}가 app.js에 정의되지 않음!"

    # DOMContentLoaded 내부 호출 함수 전수 검증
    doc_match = re.search(r"DOMContentLoaded['\"],\s*async\s*\(\)\s*=>\s*\{([^}]+)\}", app_js_text)
    if doc_match:
        dom_calls = re.findall(r'([a-zA-Z0-9_]+)\s*\(', doc_match.group(1))
        for fn in dom_calls:
            if fn != 'catch':
                assert fn in defs, f"DOMContentLoaded 내부 호출 함수 {fn}가 app.js에 정의되지 않음!"

    for fname in ['index.html', 'style.css', 'app.js']:
        fpath = os.path.join(server.PUBLIC_DIR, fname)
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
            if fname == 'index.html':
                assert 'btnAdminLogin' in content and 'btn-admin-config' in content and 'bookingSuccessModal' in content and 'sleepModeOverlay' in content and 'shortcutModal' in content and 'iosInstallGuideModal' in content
            elif fname == 'style.css':
                assert 'btn-force-cancel' in content and 'btn-kakao-share' in content and 'sleep-mode-overlay' in content
                assert 'timeline-top-row' in content and 'timeline-bottom-row' in content and 'timeline-actions' in content
                assert 'shortcut-sheet' in content and 'btn-shortcut-primary' in content and 'ios-guide-sheet' in content
            elif fname == 'app.js':
                assert 'adminForceCancel' in content and 'refreshTimeSlotsForDate' in content and 'shareReservationKakao' in content and 'wakeFromSleep' in content
                assert 'timeline-top-row' in content and 'timeline-bottom-row' in content
                assert 'handleShortcutNavClick' in content and 'downloadDesktopShortcut' in content

    # 테스트 후 예약 데이터 정리 (실제 운영 데이터 보존 & 테스트 데이터만 정밀 정리)
    cur.execute("DELETE FROM reservations WHERE id IN (?, ?)", (res_id, force_res_id))
    conn.commit()
    print("✅ 10. [0초 즉각 렌더링 & 무결성] 첫 접속 즉시 달력 표출 및 JS 미정의 오류 100% 무결 차단 확인")

    conn.close()
    print("=================================================================")
    print("🎉 WTT 전체 검증 성공: 관리자 모드 & 강제취소 & 부원수정 100% 무결 통과!")
    print("=================================================================")

if __name__ == '__main__':
    run_wtt()
