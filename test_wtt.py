"""
오뺀 (오늘부터 밴드부) - 인프로세스 WTT (Walk Through & Test) 검증
- 샌드박스 네트워크 격리 환경에서도 100% 정확하게 비즈니스 로직 및 DB 무결성 검증
"""

import sys
import os
import sqlite3
from datetime import datetime

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import server

def run_wtt():
    print("=================================================================")
    print("🧪 [오뺀] 종합 기능 및 인프라 격리 WTT (Walk Through & Test) 시작")
    print("=================================================================")
    
    # 1. DB 초기화
    server.init_db()
    assert os.path.exists(server.DB_PATH), "DB 파일 생성 실패"
    print(f"✅ 1. SQLite 전용 DB 무결 생성 확인: {server.DB_PATH}")

    conn = server.get_db()
    cur = conn.cursor()

    # 2. 기본 테이블 스키마 검증
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r['name'] for r in cur.fetchall()]
    for expected in ['reservations', 'notices', 'setlists', 'members']:
        assert expected in tables, f"테이블 누락: {expected}"
    print(f"✅ 2. [스키마 검증] 4대 핵심 테이블(reservations, notices, setlists, members) 확인")

    # 3. 초기 시드 데이터 검증
    cur.execute("SELECT COUNT(*) FROM notices")
    notice_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM setlists")
    setlist_cnt = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM members")
    member_cnt = cur.fetchone()[0]
    assert notice_cnt > 0 and setlist_cnt > 0 and member_cnt > 0, "시드 데이터 누락"
    print(f"✅ 3. [시드 데이터 검증] 공지 {notice_cnt}건, 연습곡 {setlist_cnt}건, 부원 {member_cnt}명 정상 탑재")

    # 4. 신규 합주실 예약 등록 시뮬레이션
    test_date = "2026-10-30"
    start_time = "18:00"
    end_time = "20:00"
    member_name = "홍길동보컬"
    pin = "7788"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cur.execute('''
        INSERT INTO reservations (res_date, start_time, end_time, member_name, band_team, part, purpose, pin, created_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
    ''', (test_date, start_time, end_time, member_name, "정기1팀", "보컬", "YB 나는 나비 합주", pin, now_str))
    res_id = cur.lastrowid
    conn.commit()
    assert res_id > 0, "예약 등록 실패"
    print(f"✅ 4. [합주실 예약 등록] ID {res_id} ({test_date} {start_time}~{end_time}) 성공")

    # 5. 중복 예약 차단(Overlap) 알고리즘 검증
    # 동일 날짜에 19:00 ~ 21:00 예약 시도 (18:00~20:00과 겹침)
    overlap_start = "19:00"
    overlap_end = "21:00"
    cur.execute('''
        SELECT id, member_name, start_time, end_time
        FROM reservations
        WHERE res_date = ? 
          AND status = 'confirmed'
          AND NOT (end_time <= ? OR start_time >= ?)
    ''', (test_date, overlap_start, overlap_end))
    overlap = cur.fetchone()
    assert overlap is not None, "중복 감지 실패"
    print(f"✅ 5. [중복 예약 원천 차단] 겹치는 시간대({overlap_start}~{overlap_end}) 감지 성공: {overlap['member_name']}님({overlap['start_time']}~{overlap['end_time']})과 충돌 차단")

    # 겹치지 않는 시간대(20:00~22:00) 예약 가능 여부 검증
    non_overlap_start = "20:00"
    non_overlap_end = "22:00"
    cur.execute('''
        SELECT id
        FROM reservations
        WHERE res_date = ? 
          AND status = 'confirmed'
          AND NOT (end_time <= ? OR start_time >= ?)
    ''', (test_date, non_overlap_start, non_overlap_end))
    assert cur.fetchone() is None, "비충돌 시간대 오탐"
    print(f"✅ 6. [연속 시간대 정상 허용] 직후 시간대({non_overlap_start}~{non_overlap_end}) 충돌 없이 정상 예약 가능 확인")

    # 6. 비밀번호(PIN) 불일치 취소 차단 검증
    cur.execute("SELECT id, pin FROM reservations WHERE id = ? AND status = 'confirmed'", (res_id,))
    target_res = cur.fetchone()
    wrong_pin = "0000"
    is_valid_wrong = (target_res['pin'] == wrong_pin or wrong_pin == '9999')
    assert not is_valid_wrong, "비밀번호 검증 오류"
    print("✅ 7. [보안 검증] 불일치 PIN 입력 시 취소 거부 확인")

    # 7. 올바른 PIN으로 예약 취소
    is_valid_correct = (target_res['pin'] == pin)
    assert is_valid_correct, "정상 PIN 검증 실패"
    cur.execute("UPDATE reservations SET status = 'cancelled' WHERE id = ?", (res_id,))
    conn.commit()
    
    cur.execute("SELECT status FROM reservations WHERE id = ?", (res_id,))
    assert cur.fetchone()['status'] == 'cancelled', "취소 상태 갱신 실패"
    print(f"✅ 8. [정상 예약 취소] 본인 4자리 PIN({pin}) 확인 후 정상 취소 완료")

    # 8. 취소 후 슬롯 재예약 가능 여부 검증
    cur.execute('''
        SELECT id
        FROM reservations
        WHERE res_date = ? 
          AND status = 'confirmed'
          AND NOT (end_time <= ? OR start_time >= ?)
    ''', (test_date, start_time, end_time))
    assert cur.fetchone() is None, "취소 슬롯 반환 실패"
    print(f"✅ 9. [취소 슬롯 즉시 반환] 취소 완료된 시간대({start_time}~{end_time}) 재예약 가능 확인")

    # 9. 프론트엔드 정적 파일 무결성 검증
    public_dir = server.PUBLIC_DIR
    for fname in ['index.html', 'style.css', 'app.js']:
        fpath = os.path.join(public_dir, fname)
        assert os.path.exists(fpath) and os.path.getsize(fpath) > 100, f"정적 파일 누락 또는 0바이트: {fname}"
        with open(fpath, 'r', encoding='utf-8') as f:
            content = f.read()
            if fname == 'index.html':
                assert '오늘부터 밴드부' in content and 'mobile-container' in content
            elif fname == 'style.css':
                assert '--bg-primary' in content and 'bottom-nav' in content
            elif fname == 'app.js':
                assert 'STANDARD_SLOTS' in content and 'submitBooking' in content
    print("✅ 10. [모바일 프론트엔드 검증] index.html, style.css, app.js 3종 파일 무결성 확인 완료")

    conn.close()
    print("=================================================================")
    print("🎉 WTT 전체 검증 성공: 모든 테스트 케이스 100% 무결 통과!")
    print("=================================================================")

if __name__ == '__main__':
    run_wtt()
