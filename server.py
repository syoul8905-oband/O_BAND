"""
오늘부터 밴드부 (오뺀) - 전용 백엔드 서버
- 기존 배송스케줄 시스템과 100% 분리된 독립 서버
- 포트: 5500 (기존 8080 등과 충돌 방지)
- DB: SQLite (data/band_club.db 영구 보존)
- 무외부의존성: Python 3.11 표준 라이브러리(http.server, sqlite3, json)만으로 완벽 구동
"""

import http.server
import socketserver
import sqlite3
import json
import os
import sys
import urllib.parse
import base64
import plistlib
from datetime import datetime, timedelta, date

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = int(os.environ.get('PORT', 5500))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DB_PATH = os.path.join(DATA_DIR, "band_club.db")

# 디렉터리 보장
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def backup_db_snapshot():
    """데이터 유실 방지를 위한 물리 스냅샷 백업 (Zero Data-Loss)"""
    try:
        backup_dir = os.path.join(DATA_DIR, "backups")
        os.makedirs(backup_dir, exist_ok=True)
        backup_file = os.path.join(backup_dir, f"band_club_backup_{datetime.now().strftime('%Y%m%d')}.db")
        conn = get_db()
        backup_conn = sqlite3.connect(backup_file)
        conn.backup(backup_conn)
        backup_conn.close()
        conn.close()
    except Exception as e:
        print(f"⚠️ 백업 생성 중 경고: {e}")

def init_db():
    conn = get_db()
    cur = conn.cursor()
    backup_db_snapshot()
    
    # 1. 합주실 예약 테이블
    cur.execute('''
    CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        res_date TEXT NOT NULL,          -- YYYY-MM-DD
        start_time TEXT NOT NULL,        -- HH:MM (예: 18:00)
        end_time TEXT NOT NULL,          -- HH:MM (예: 20:00)
        member_name TEXT NOT NULL,       -- 예약자명
        band_team TEXT DEFAULT '전체합주', -- 팀명 / 유닛명
        part TEXT DEFAULT '기타',         -- 담당 파트
        purpose TEXT,                    -- 합주 목적 / 연습곡
        pin TEXT NOT NULL,               -- 4자리 간편 비밀번호
        created_at TEXT NOT NULL,
        status TEXT DEFAULT 'confirmed'  -- confirmed / cancelled
    )
    ''')
    
    # 2. 공지사항 테이블
    cur.execute('''
    CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        category TEXT DEFAULT '일반',     -- 필독, 합주, 회비, 행사, 일반
        is_pinned INTEGER DEFAULT 0,     -- 1: 상단고정, 0: 일반
        pin TEXT NOT NULL,               -- 작성자 PIN (수정/삭제용)
        created_at TEXT NOT NULL
    )
    ''')
    
    # 3. 합주곡 (세트리스트) 테이블
    cur.execute('''
    CREATE TABLE IF NOT EXISTS setlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,             -- 곡명
        artist TEXT NOT NULL,            -- 아티스트
        key_info TEXT,                   -- 원키/조정키 (예: Em, -1키)
        tempo TEXT,                      -- 템포 (예: 120 BPM)
        sheet_url TEXT,                  -- 악보/코드 링크
        youtube_url TEXT,                -- 유튜브 링크
        status TEXT DEFAULT '연습중',    -- 후보, 연습중, 합주완료
        memo TEXT,
        created_at TEXT NOT NULL
    )
    ''')

    # 4. 부원 명부 테이블
    cur.execute('''
    CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        part TEXT NOT NULL,              -- 보컬, 일렉기타, 어쿠스틱기타, 베이스, 드럼, 건반 등
        phone TEXT,
        role TEXT DEFAULT '회원',        -- 운영자, 운영진, 회원
        created_at TEXT NOT NULL
    )
    ''')

    # 기존 직책 데이터 마이그레이션 (밴드장->운영자, 총무/악기장->운영진, 부원->회원)
    cur.execute("UPDATE members SET role = '운영자' WHERE role IN ('밴드장', '리더')")
    cur.execute("UPDATE members SET role = '운영진' WHERE role IN ('총무', '악기장')")
    cur.execute("UPDATE members SET role = '회원' WHERE role IN ('부원', '일반 부원')")
    
    # 5. 시스템 환경설정 테이블 (예약 오픈 룰 등)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS system_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        description TEXT,
        updated_at TEXT NOT NULL
    )
    ''')
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute('''
        INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description, updated_at)
        VALUES 
        ('open_weeks', '2', '일요일 기준 예약 오픈 주차 수 (달력상 2줄)', ?),
        ('reset_day', '0', '리셋 기준 요일 (0: 일요일, 1: 월요일)', ?),
        ('admin_pin', '9999', '관리자 설정 변경 PIN', ?),
        ('quick_teams', '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습', '팀명 빠른 선택 메뉴 목록', ?),
        ('kakao_js_key', '', '카카오 JavaScript SDK 키', ?)
    ''', (now_str, now_str, now_str, now_str, now_str))
    
    # 초기 샘플 공지사항 및 곡 추가 (비어있을 때만)
    cur.execute("SELECT COUNT(*) FROM notices")
    if cur.fetchone()[0] == 0:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute('''
        INSERT INTO notices (title, content, author, category, is_pinned, pin, created_at)
        VALUES 
        ('🎸 [필독] 오늘부터 밴드부(오뺀) 모바일 합주실 예약 시스템 오픈!', 
         '안녕하세요 오뺀 부원 여러분!\n합주실 예약과 공지사항을 편리하게 확인할 수 있는 모바일 전용 페이지가 오픈되었습니다.\n\n- 예약 시 부원 이름과 4자리 비밀번호(PIN)를 입력하면 예약 완료!\n- 본인 예약 취소 시 등록했던 4자리 PIN을 입력하시면 됩니다.\n- 합주실 사용 후 정리정돈 및 전원 OFF 필수입니다 🎵',
         '밴드장', '필독', 1, '1234', ?)
        ''', (now_str,))
        
        cur.execute('''
        INSERT INTO notices (title, content, author, category, is_pinned, pin, created_at)
        VALUES 
        ('📢 정기 합주 안내 및 에티켓', 
         '매주 정기 합주 전 세트리스트 탭에서 연습곡 코드와 진행을 미리 숙지해 주세요!\n지각 시 벌금 3,000원입니다 🥁',
         '총무', '합주', 0, '1234', ?)
        ''', (now_str,))
        
    cur.execute("SELECT COUNT(*) FROM setlists")
    if cur.fetchone()[0] == 0:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute('''
        INSERT INTO setlists (title, artist, key_info, tempo, sheet_url, youtube_url, status, memo, created_at)
        VALUES 
        ('나는 나비', 'YB (윤도현밴드)', 'A', '132 BPM', '', 'https://www.youtube.com', '연습중', '인트로 드럼 필인 박자 주의', ?),
        ('한 페이지가 될 수 있게', 'DAY6 (데이식스)', 'C', '170 BPM', '', 'https://www.youtube.com', '연습중', '후렴구 떼창 및 기타 솔로', ?)
        ''', (now_str, now_str))

    cur.execute("SELECT COUNT(*) FROM members")
    if cur.fetchone()[0] == 0:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        samples = [
            ('김밴드', '보컬', '010-1111-2222', '운영자', now_str),
            ('이기타', '일렉기타', '010-3333-4444', '운영진', now_str),
            ('박베이스', '베이스', '010-5555-6666', '운영진', now_str),
            ('최드럼', '드럼', '010-7777-8888', '회원', now_str),
            ('정건반', '건반', '010-9999-0000', '회원', now_str)
        ]
        cur.executemany('INSERT INTO members (name, part, phone, role, created_at) VALUES (?, ?, ?, ?, ?)', samples)

    conn.commit()
    conn.close()

def get_booking_window():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT setting_key, setting_value FROM system_settings")
    settings = {row['setting_key']: row['setting_value'] for row in cur.fetchall()}
    conn.close()

    open_weeks = int(settings.get('open_weeks', 2))
    reset_day = int(settings.get('reset_day', 0)) # 0: 일요일
    quick_teams = settings.get('quick_teams', '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습')
    kakao_js_key = settings.get('kakao_js_key', '')
    
    today = datetime.now().date()
    # Python: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    # reset_day 0(일요일)일 때 일요일까지의 거리 = (today.weekday() + 1) % 7
    days_since_reset = (today.weekday() + 1) % 7 if reset_day == 0 else (today.weekday() - (reset_day - 1)) % 7
    this_reset_date = today - timedelta(days=days_since_reset)
    
    # 허용 종료일 = 이번 주 일요일 + (주차수 * 7일) - 1일 (다음 주 토요일)
    max_allowed_date = this_reset_date + timedelta(days=(open_weeks * 7) - 1)
    
    return {
        'today': today.isoformat(),
        'this_reset_date': this_reset_date.isoformat(),
        'max_allowed_date': max_allowed_date.isoformat(),
        'open_weeks': open_weeks,
        'reset_day': reset_day,
        'quick_teams': quick_teams,
        'kakao_js_key': kakao_js_key,
        'description': f"매주 일요일 기준 다음 주 토요일({max_allowed_date.isoformat()})까지 예약 가능"
    }

class BandClubRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        # 모바일 웹 및 CORS/캐싱 제어
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        raw = self.wfile if False else self.rfile.read(content_length).decode('utf-8')
        return json.loads(raw)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # ---------------- API 라우팅 ----------------
        if path == '/api/health':
            self.send_json({'status': 'ok', 'app': '오뺀 (오늘부터 밴드부)', 'time': datetime.now().isoformat()})
            return

        # 1. 예약 목록 조회: /api/reservations?date=YYYY-MM-DD
        if path == '/api/reservations':
            conn = get_db()
            cur = conn.cursor()
            date_filter = query.get('date', [None])[0]
            month_filter = query.get('month', [None])[0]
            
            if date_filter:
                cur.execute('''
                    SELECT id, res_date, start_time, end_time, member_name, band_team, part, purpose, created_at, status
                    FROM reservations
                    WHERE res_date = ? AND status = 'confirmed'
                    ORDER BY start_time ASC
                ''', (date_filter,))
            elif month_filter:
                cur.execute('''
                    SELECT id, res_date, start_time, end_time, member_name, band_team, part, purpose, created_at, status
                    FROM reservations
                    WHERE res_date LIKE ? AND status = 'confirmed'
                    ORDER BY res_date ASC, start_time ASC
                ''', (f"{month_filter}%",))
            else:
                cur.execute('''
                    SELECT id, res_date, start_time, end_time, member_name, band_team, part, purpose, created_at, status
                    FROM reservations
                    WHERE status = 'confirmed'
                    ORDER BY res_date DESC, start_time ASC
                    LIMIT 100
                ''')
            rows = [dict(row) for row in cur.fetchall()]
            conn.close()
            self.send_json({'success': True, 'reservations': rows})
            return

        # 2. 공지사항 조회: /api/notices
        if path == '/api/notices':
            conn = get_db()
            cur = conn.cursor()
            cur.execute('''
                SELECT id, title, content, author, category, is_pinned, created_at
                FROM notices
                ORDER BY is_pinned DESC, id DESC
            ''')
            rows = [dict(row) for row in cur.fetchall()]
            conn.close()
            self.send_json({'success': True, 'notices': rows})
            return

        # 3. 세트리스트 조회: /api/setlists
        if path == '/api/setlists':
            conn = get_db()
            cur = conn.cursor()
            cur.execute('''
                SELECT id, title, artist, key_info, tempo, sheet_url, youtube_url, status, memo, created_at
                FROM setlists
                ORDER BY id DESC
            ''')
            rows = [dict(row) for row in cur.fetchall()]
            conn.close()
            self.send_json({'success': True, 'setlists': rows})
            return

        # 4. 부원 목록 조회: /api/members
        if path == '/api/members':
            conn = get_db()
            cur = conn.cursor()
            cur.execute('''
                SELECT id, name, part, phone, role, created_at
                FROM members
                ORDER BY CASE role 
                    WHEN '운영자' THEN 1 
                    WHEN '운영진' THEN 2 
                    ELSE 3 END, name ASC
            ''')
            rows = [dict(row) for row in cur.fetchall()]
            conn.close()
            self.send_json({'success': True, 'members': rows})
            return

        # 5. 시스템 설정 및 예약 가능 윈도우 조회: /api/settings
        if path == '/api/settings':
            self.send_json({'success': True, 'window': get_booking_window()})
            return

        # 6. 아이폰(iOS) WebClip 구성 프로파일 다운로드: /install.mobileconfig
        if path == '/install.mobileconfig':
            icon_path = os.path.join(PUBLIC_DIR, 'icon-192.png')
            icon_bytes = b""
            if os.path.exists(icon_path):
                with open(icon_path, 'rb') as f:
                    icon_bytes = f.read()

            webclip_dict = {
                'PayloadType': 'com.apple.webClip.managed',
                'PayloadVersion': 1,
                'PayloadIdentifier': 'com.oband.webclip',
                'PayloadUUID': '5c7e3f20-8025-4a52-b8d1-7c981d3f4e22',
                'PayloadDisplayName': '오뺀',
                'PayloadDescription': '오늘부터 밴드부 홈 화면 바로가기',
                'PayloadOrganization': '오늘부터 밴드부',
                'URL': 'https://o-band.onrender.com/',
                'Label': '오뺀',
                'FullScreen': True,
                'IsRemovable': True,
                'Precomposed': True
            }
            if icon_bytes:
                webclip_dict['Icon'] = icon_bytes

            profile_data = {
                'PayloadType': 'Configuration',
                'PayloadVersion': 1,
                'PayloadIdentifier': 'com.oband.profile',
                'PayloadUUID': '9a3d4f10-1823-4e31-9f5a-3c1d2e4f5a6b',
                'PayloadDisplayName': '오뺀 (오늘부터 밴드부)',
                'PayloadDescription': '오늘부터 밴드부 홈 화면 바로가기 설치 프로파일',
                'PayloadOrganization': '오늘부터 밴드부',
                'PayloadContent': [webclip_dict]
            }
            content_bytes = plistlib.dumps(profile_data, fmt=plistlib.FMT_XML)
            self.send_response(200)
            self.send_header('Content-Type', 'application/x-apple-aspen-config; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename="oband.mobileconfig"')
            self.send_header('Content-Length', str(len(content_bytes)))
            self.end_headers()
            self.wfile.write(content_bytes)
            return

        # 7. PC 데스크톱 바로가기(.url) 직접 다운로드: /download-shortcut
        if path in ['/download-shortcut', '/oband.url']:
            shortcut_content = "[InternetShortcut]\r\nURL=https://o-band.onrender.com/\r\nIconIndex=0\r\nHotKey=0\r\nIDList=\r\n[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,11\r\n"
            content_bytes = shortcut_content.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream; charset=utf-8')
            self.send_header('Content-Disposition', "attachment; filename*=UTF-8''%EC%98%A4%EB%8A%98%EB%B6%80%ED%84%B0%EB%B0%B4%EB%93%9C%EB%B6%80_%EC%98%A4%EB%BE%AC.url")
            self.send_header('Content-Length', str(len(content_bytes)))
            self.end_headers()
            self.wfile.write(content_bytes)
            return

        # 기본 정적 파일 서빙 (public 디렉터리)
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        try:
            body = self.read_json_body()
        except Exception as e:
            self.send_json({'success': False, 'message': f'잘못된 JSON 형식: {str(e)}'}, 400)
            return

        # 1. 예약 등록: POST /api/reservations
        if path == '/api/reservations':
            res_date = body.get('res_date')
            start_time = body.get('start_time')
            end_time = body.get('end_time')
            member_name = body.get('member_name', '').strip()
            band_team = body.get('band_team', '전체합주').strip()
            part = body.get('part', '기타').strip()
            purpose = body.get('purpose', '').strip()
            pin = str(body.get('pin', '')).strip()

            if not res_date or not start_time or not end_time or not member_name or not pin:
                self.send_json({'success': False, 'message': '날짜, 시작/종료 시간, 예약자명, 4자리 비밀번호(PIN)는 필수입니다.'}, 400)
                return

            if start_time >= end_time:
                self.send_json({'success': False, 'message': '종료 시간은 시작 시간보다 늦어야 합니다.'}, 400)
                return

            if len(pin) != 4 or not pin.isdigit():
                self.send_json({'success': False, 'message': '비밀번호(PIN)는 숫자 4자리로 입력해 주세요.'}, 400)
                return

            # 예약 오픈 기간 (2주 윈도우) 검증 (관리자 PIN 9999 및 관리자 마스터 예외 허용)
            window = get_booking_window()
            today_str = window['today']
            max_date_str = window['max_allowed_date']

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_pin'")
            admin_row = cur.fetchone()
            admin_pin = admin_row['setting_value'] if admin_row else '9999'
            is_admin_req = (pin == '9999' or pin == admin_pin)
            
            if res_date < today_str and not is_admin_req:
                conn.close()
                self.send_json({'success': False, 'message': '지난 날짜는 예약할 수 없습니다.'}, 400)
                return

            if res_date > max_date_str and not is_admin_req:
                conn.close()
                self.send_json({
                    'success': False,
                    'message': f'해당 날짜는 아직 예약이 오픈되지 않았습니다.\n(현재 예약 가능 기간: {today_str} ~ {max_date_str})\n매주 일요일에 다음 주 예약이 순차 오픈됩니다.'
                }, 400)
                return

            # 중복 예약 검증 (동일 날짜에 겹치는 시간대 체크)
            conn = get_db()
            cur = conn.cursor()
            cur.execute('''
                SELECT id, member_name, start_time, end_time
                FROM reservations
                WHERE res_date = ? 
                  AND status = 'confirmed'
                  AND NOT (end_time <= ? OR start_time >= ?)
            ''', (res_date, start_time, end_time))
            overlap = cur.fetchone()
            if overlap:
                conn.close()
                self.send_json({
                    'success': False, 
                    'message': f'해당 시간대({start_time}~{end_time})에 이미 예약({overlap["member_name"]}님, {overlap["start_time"]}~{overlap["end_time"]})이 존재합니다.'
                }, 409)
                return

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute('''
                INSERT INTO reservations (res_date, start_time, end_time, member_name, band_team, part, purpose, pin, created_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
            ''', (res_date, start_time, end_time, member_name, band_team, part, purpose, pin, now_str))
            new_id = cur.lastrowid
            conn.commit()
            conn.close()

            self.send_json({'success': True, 'message': '합주실 예약이 완료되었습니다!', 'id': new_id})
            return

        # 2. 예약 취소: POST /api/reservations/cancel
        if path == '/api/reservations/cancel':
            res_id = body.get('id')
            pin = str(body.get('pin', '')).strip()

            if not res_id or not pin:
                self.send_json({'success': False, 'message': '예약 ID와 비밀번호(PIN)를 입력해 주세요.'}, 400)
                return

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT id, pin, member_name FROM reservations WHERE id = ? AND status = 'confirmed'", (res_id,))
            res = cur.fetchone()

            if not res:
                conn.close()
                self.send_json({'success': False, 'message': '해당 예약을 찾을 수 없거나 이미 취소되었습니다.'}, 404)
                return

            # 마스터 관리자 PIN '9999' 또는 등록된 PIN 검증
            cur.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_pin'")
            admin_row = cur.fetchone()
            admin_pin = admin_row['setting_value'] if admin_row else '9999'

            is_admin = (pin == admin_pin or pin == '9999')
            if res['pin'] != pin and not is_admin:
                conn.close()
                self.send_json({'success': False, 'message': '비밀번호(PIN)가 일치하지 않습니다.'}, 403)
                return

            cur.execute("UPDATE reservations SET status = 'cancelled' WHERE id = ?", (res_id,))
            conn.commit()
            conn.close()
            msg = f'[관리자 강제취소] {res["member_name"]}님의 예약이 취소되었습니다.' if is_admin else f'{res["member_name"]}님의 예약이 정상적으로 취소되었습니다.'
            self.send_json({'success': True, 'message': msg})
            return

        # 3. 공지사항 등록: POST /api/notices
        if path == '/api/notices':
            title = body.get('title', '').strip()
            content = body.get('content', '').strip()
            author = body.get('author', '').strip()
            category = body.get('category', '일반').strip()
            is_pinned = 1 if body.get('is_pinned') else 0
            pin = str(body.get('pin', '')).strip()

            if not title or not content or not author or not pin:
                self.send_json({'success': False, 'message': '제목, 내용, 작성자, 4자리 PIN은 필수입니다.'}, 400)
                return

            conn = get_db()
            cur = conn.cursor()
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute('''
                INSERT INTO notices (title, content, author, category, is_pinned, pin, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (title, content, author, category, is_pinned, pin, now_str))
            new_id = cur.lastrowid
            conn.commit()
            conn.close()
            self.send_json({'success': True, 'message': '공지사항이 등록되었습니다!', 'id': new_id})
            return

        # 4. 공지사항 삭제: POST /api/notices/delete
        if path == '/api/notices/delete':
            notice_id = body.get('id')
            pin = str(body.get('pin', '')).strip()

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT id, pin FROM notices WHERE id = ?", (notice_id,))
            row = cur.fetchone()

            if not row:
                conn.close()
                self.send_json({'success': False, 'message': '공지사항을 찾을 수 없습니다.'}, 404)
                return

            cur.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_pin'")
            admin_row = cur.fetchone()
            admin_pin = admin_row['setting_value'] if admin_row else '9999'

            if row['pin'] != pin and pin != admin_pin and pin != '9999':
                conn.close()
                self.send_json({'success': False, 'message': '비밀번호(PIN)가 일치하지 않습니다.'}, 403)
                return

            cur.execute("DELETE FROM notices WHERE id = ?", (notice_id,))
            conn.commit()
            conn.close()
            self.send_json({'success': True, 'message': '공지사항이 삭제되었습니다.'})
            return

        # 5. 세트리스트 추가: POST /api/setlists
        if path == '/api/setlists':
            title = body.get('title', '').strip()
            artist = body.get('artist', '').strip()
            key_info = body.get('key_info', '').strip()
            tempo = body.get('tempo', '').strip()
            sheet_url = body.get('sheet_url', '').strip()
            youtube_url = body.get('youtube_url', '').strip()
            status = body.get('status', '연습중').strip()
            memo = body.get('memo', '').strip()

            if not title or not artist:
                self.send_json({'success': False, 'message': '곡명과 아티스트는 필수입니다.'}, 400)
                return

            conn = get_db()
            cur = conn.cursor()
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute('''
                INSERT INTO setlists (title, artist, key_info, tempo, sheet_url, youtube_url, status, memo, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (title, artist, key_info, tempo, sheet_url, youtube_url, status, memo, now_str))
            new_id = cur.lastrowid
            conn.commit()
            conn.close()
            self.send_json({'success': True, 'message': '새로운 연습곡이 등록되었습니다!', 'id': new_id})
            return

        # 6. 부원 등록: POST /api/members
        if path == '/api/members':
            name = body.get('name', '').strip()
            part = body.get('part', '').strip()
            phone = body.get('phone', '').strip()
            role = body.get('role', '회원').strip()

            if not name or not part:
                self.send_json({'success': False, 'message': '이름과 담당 파트는 필수입니다.'}, 400)
                return

            conn = get_db()
            cur = conn.cursor()
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            try:
                cur.execute('''
                    INSERT INTO members (name, part, phone, role, created_at)
                    VALUES (?, ?, ?, ?, ?)
                ''', (name, part, phone, role, now_str))
                new_id = cur.lastrowid
                conn.commit()
                conn.close()
                self.send_json({'success': True, 'message': f'{name}님이 부원으로 등록되었습니다!', 'id': new_id})
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({'success': False, 'message': '이미 등록된 부원 이름입니다.'}, 409)
            return

        # 7. 시스템 설정 변경 (관리자 PIN 필요): POST /api/settings
        if path == '/api/settings':
            pin = str(body.get('pin', '')).strip()
            open_weeks = body.get('open_weeks')
            reset_day = body.get('reset_day')

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_pin'")
            row = cur.fetchone()
            admin_pin = row['setting_value'] if row else '9999'

            if pin != admin_pin and pin != '9999':
                conn.close()
                self.send_json({'success': False, 'message': '관리자 비밀번호가 일치하지 않습니다.'}, 403)
                return

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            if open_weeks is not None:
                cur.execute("UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE setting_key = 'open_weeks'", (str(open_weeks), now_str))
            if reset_day is not None:
                cur.execute("UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE setting_key = 'reset_day'", (str(reset_day), now_str))
            quick_teams = body.get('quick_teams')
            if quick_teams is not None:
                cur.execute("INSERT OR REPLACE INTO system_settings (setting_key, setting_value, description, updated_at) VALUES ('quick_teams', ?, '팀명 빠른 선택 메뉴 목록', ?)", (str(quick_teams).strip(), now_str))
            kakao_js_key = body.get('kakao_js_key')
            if kakao_js_key is not None:
                cur.execute("INSERT OR REPLACE INTO system_settings (setting_key, setting_value, description, updated_at) VALUES ('kakao_js_key', ?, '카카오 JavaScript SDK 키', ?)", (str(kakao_js_key).strip(), now_str))

            conn.commit()
            conn.close()
            self.send_json({'success': True, 'message': '예약 설정이 성공적으로 변경되었습니다!', 'window': get_booking_window()})
            return

        # 8. 관리자 PIN 검증: POST /api/admin/verify
        if path == '/api/admin/verify':
            pin = str(body.get('pin', '')).strip()
            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_pin'")
            row = cur.fetchone()
            admin_pin = row['setting_value'] if row else '9999'
            conn.close()

            if pin == admin_pin or pin == '9999':
                self.send_json({'success': True, 'message': '관리자 인증 완료'})
            else:
                self.send_json({'success': False, 'message': '관리자 비밀번호가 일치하지 않습니다.'}, 403)
            return

        # 9. 부원 정보 수정 (관리자 전용): POST /api/members/update
        if path == '/api/members/update':
            pin = str(body.get('pin', '')).strip()
            mem_id = body.get('id')
            name = body.get('name', '').strip()
            part = body.get('part', '').strip()
            phone = body.get('phone', '').strip()
            role = body.get('role', '회원').strip()

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_pin'")
            row = cur.fetchone()
            admin_pin = row['setting_value'] if row else '9999'

            if pin != admin_pin and pin != '9999':
                conn.close()
                self.send_json({'success': False, 'message': '관리자 권한이 필요합니다.'}, 403)
                return

            if not mem_id or not name or not part:
                conn.close()
                self.send_json({'success': False, 'message': '부원 ID, 이름, 파트는 필수입니다.'}, 400)
                return

            try:
                cur.execute('''
                    UPDATE members SET name = ?, part = ?, phone = ?, role = ?
                    WHERE id = ?
                ''', (name, part, phone, role, mem_id))
                conn.commit()
                conn.close()
                self.send_json({'success': True, 'message': f'{name} 부원 정보가 수정되었습니다.'})
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json({'success': False, 'message': '이미 동일한 이름의 다른 부원이 존재합니다.'}, 409)
            return

        # 10. 부원 삭제 (관리자 전용): POST /api/members/delete
        if path == '/api/members/delete':
            pin = str(body.get('pin', '')).strip()
            mem_id = body.get('id')

            conn = get_db()
            cur = conn.cursor()
            cur.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'admin_pin'")
            row = cur.fetchone()
            admin_pin = row['setting_value'] if row else '9999'

            if pin != admin_pin and pin != '9999':
                conn.close()
                self.send_json({'success': False, 'message': '관리자 권한이 필요합니다.'}, 403)
                return

            cur.execute("SELECT name FROM members WHERE id = ?", (mem_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                self.send_json({'success': False, 'message': '해당 부원을 찾을 수 없습니다.'}, 404)
                return

            mem_name = row['name']
            cur.execute("DELETE FROM members WHERE id = ?", (mem_id,))
            conn.commit()
            conn.close()
            self.send_json({'success': True, 'message': f'{mem_name} 부원이 명부에서 삭제되었습니다.'})
            return

        self.send_json({'success': False, 'message': '지원하지 않는 API 경로입니다.'}, 404)

def run():
    init_db()
    server_address = ('0.0.0.0', PORT)
    with socketserver.ThreadingTCPServer(server_address, BandClubRequestHandler) as httpd:
        httpd.allow_reuse_address = True
        print(f"=======================================================")
        print(f"🎸 [오늘부터 밴드부 (오뺀)] 모바일 전용 서버 가동")
        print(f"🔒 배송스케줄 시스템과 100% 분리된 독립 서버")
        print(f"📡 로컬 테스트 주소: http://localhost:{PORT}")
        print(f"💾 영구 DB 저장소: {DB_PATH}")
        print(f"=======================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n서버를 종료합니다.")

if __name__ == '__main__':
    run()
