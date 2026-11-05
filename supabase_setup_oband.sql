-- ========================================================
-- 오늘부터 밴드부 (오뺀) Supabase 클라우드 DB 통합 스키마
-- 프로젝트: https://gideypynmhpjucgszyce.supabase.co
-- ========================================================

-- 1. 기존 테이블 정리 (필요 시)
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS notices CASCADE;
DROP TABLE IF EXISTS setlists CASCADE;
DROP TABLE IF EXISTS members CASCADE;

-- 2. 시스템 설정 테이블 (system_settings)
CREATE TABLE system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Seoul', now()) NOT NULL
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on system_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);

-- 3. 예약 테이블 (reservations)
CREATE TABLE reservations (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  res_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  member_name TEXT NOT NULL,
  band_team TEXT DEFAULT '전체합주',
  part TEXT DEFAULT '기타',
  purpose TEXT DEFAULT '',
  pin TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Seoul', now()) NOT NULL,
  status TEXT DEFAULT 'confirmed'
);
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on reservations" ON reservations FOR ALL USING (true) WITH CHECK (true);

-- 4. 공지사항 테이블 (notices)
CREATE TABLE notices (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT DEFAULT '일반',
  is_pinned INTEGER DEFAULT 0,
  pin TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Seoul', now()) NOT NULL
);
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on notices" ON notices FOR ALL USING (true) WITH CHECK (true);

-- 5. 셋리스트 테이블 (setlists)
CREATE TABLE setlists (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  key_info TEXT,
  tempo TEXT,
  sheet_url TEXT,
  youtube_url TEXT,
  status TEXT DEFAULT '연습',
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Seoul', now()) NOT NULL
);
ALTER TABLE setlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on setlists" ON setlists FOR ALL USING (true) WITH CHECK (true);

-- 6. 멤버 테이블 (members)
CREATE TABLE members (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  part TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT '부원',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('Asia/Seoul', now()) NOT NULL
);
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access on members" ON members FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 초기 실데이터 적재 (Data Migration)
-- ========================================================

INSERT INTO system_settings (setting_key, setting_value, description, updated_at) VALUES ('open_weeks', '2', '일요일 기준 예약 오픈 주차 수 (달력상 2줄)', '2026-10-29 14:14:02');
INSERT INTO system_settings (setting_key, setting_value, description, updated_at) VALUES ('reset_day', '0', '리셋 기준 요일 (0: 일요일, 1: 월요일)', '2026-10-29 14:14:02');
INSERT INTO system_settings (setting_key, setting_value, description, updated_at) VALUES ('admin_pin', '9999', '관리자 설정 변경 PIN', '2026-10-29 14:14:02');
INSERT INTO system_settings (setting_key, setting_value, description, updated_at) VALUES ('quick_teams', '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습', '팀명 빠른 선택 메뉴 목록', '2026-10-29 15:39:38');
INSERT INTO system_settings (setting_key, setting_value, description, updated_at) VALUES ('kakao_js_key', '', '카카오 JavaScript SDK 키', '2026-10-29 16:10:31');
INSERT INTO notices (title, content, author, category, is_pinned, pin, created_at) VALUES ('🎸 [필독] 오늘부터 밴드부(오뺀) 모바일 합주실 예약 시스템 오픈!', '안녕하세요 오뺀 부원 여러분!
합주실 예약과 공지사항을 편리하게 확인할 수 있는 모바일 전용 페이지가 오픈되었습니다.

- 예약 시 부원 이름과 4자리 비밀번호(PIN)를 입력하면 예약 완료!
- 본인 예약 취소 시 등록했던 4자리 PIN을 입력하시면 됩니다.
- 합주실 사용 후 정리정돈 및 전원 OFF 필수입니다 🎵', '밴드장', '필독', 1, '1234', '2026-10-29 13:38:53');
INSERT INTO notices (title, content, author, category, is_pinned, pin, created_at) VALUES ('📢 정기 합주 안내 및 에티켓', '매주 정기 합주 전 세트리스트 탭에서 연습곡 코드와 진행을 미리 숙지해 주세요!
지각 시 벌금 3,000원입니다 🥁', '총무', '합주', 0, '1234', '2026-10-29 13:38:53');
INSERT INTO setlists (title, artist, key_info, tempo, sheet_url, youtube_url, status, memo, created_at) VALUES ('나는 나비', 'YB (윤도현밴드)', 'A', '132 BPM', '', 'https://www.youtube.com', '연습중', '인트로 드럼 필인 박자 주의', '2026-10-29 13:38:53');
INSERT INTO setlists (title, artist, key_info, tempo, sheet_url, youtube_url, status, memo, created_at) VALUES ('한 페이지가 될 수 있게', 'DAY6 (데이식스)', 'C', '170 BPM', '', 'https://www.youtube.com', '연습중', '후렴구 떼창 및 기타 솔로', '2026-10-29 13:38:53');
INSERT INTO members (name, part, phone, role, created_at) VALUES ('김밴드', '보컬', '010-1111-2222', '운영자', '2026-10-29 13:38:53');
INSERT INTO members (name, part, phone, role, created_at) VALUES ('이기타', '일렉기타', '010-3333-4444', '운영진', '2026-10-29 13:38:53');
INSERT INTO members (name, part, phone, role, created_at) VALUES ('박베이스', '베이스', '010-5555-6666', '운영진', '2026-10-29 13:38:53');
INSERT INTO members (name, part, phone, role, created_at) VALUES ('최드럼', '드럼', '010-8888-9999', '운영진', '2026-10-29 13:38:53');
INSERT INTO members (name, part, phone, role, created_at) VALUES ('정건반', '건반', '010-9999-0000', '회원', '2026-10-29 13:38:53');
INSERT INTO reservations (id, res_date, start_time, end_time, member_name, band_team, part, purpose, pin, created_at, status) OVERRIDING SYSTEM VALUE VALUES (93, '2026-11-04', '18:00', '20:00', '최두성', '1팀', '합주', '', '1234', '2026-11-04 18:22:45', 'confirmed');
INSERT INTO reservations (id, res_date, start_time, end_time, member_name, band_team, part, purpose, pin, created_at, status) OVERRIDING SYSTEM VALUE VALUES (99, '2026-11-04', '18:00', '20:30', '김보컬', '정기 1팀', '보컬', '연습곡 합주', '1234', '2026-11-04 10:21:42', 'confirmed');