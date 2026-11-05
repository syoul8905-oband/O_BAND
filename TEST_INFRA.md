# Test Infrastructure & Automation Architecture (TEST_INFRA.md)

## 1. Test Architecture Overview
오뺀 (오늘부터 밴드부) 모바일 웹앱의 360px~390px 뷰포트 반응형 달력 및 다건 예약 UI/UX 무결성을 검증하기 위한 자동화된 E2E(End-to-End) 테스트 인프라입니다.

- **Primary Runner**: `scripts/test_e2e_mobile.js` (Playwright v24 Node Driver 기반)
- **CLI Wrapper**: `scripts/test_e2e_mobile.py` (Python 3.11 `subprocess` 브릿지)
- **Browser Engine**: Google Chrome Headless (`C:\Program Files\Google\Chrome\Application\chrome.exe`, version 156.0.8078.80)
- **Node Runtime**: Python 번들 Node (`C:\Users\User\AppData\Local\Programs\Python\Python311\Lib\site-packages\playwright\driver\node.exe`, v24.21.0)
- **Execution Target**: `file:///C:/antigravity/오뺀/public/index.html` (또는 환경변수 `TEST_URL`을 통한 라이브 서버)

---

## 2. Test Execution Tiers & Contracts

테스트 스위트는 3개 모바일 뷰포트(`360px`, `375px`, `390px` x `640px`)에 걸쳐 4단계 계층(Tiers)을 전수 측정합니다.

| Tier | Name | Target Elements & Methods | Pass Criteria & Invariants |
|------|------|---------------------------|----------------------------|
| **Tier 1** | Basic Viewport Rendering | `#calDaysGrid`, `.cal-day-cell`, `.app-header`, `.calendar-window-info`, `#dayTimelineList` | 달력 그리드 셀 >= 28개 렌더링, 런타임 ReferenceError/TypeError 0건 |
| **Tier 2** | Boundary Bookings Matrix | 0건(11/03), 1건(11/05), 2건(11/06), 8건(11/07 토), 10건(11/08 일) | 날짜별 인디케이터(도트 / 건수 배지) 정상 바인딩 및 렌더링 |
| **Tier 3** | DOM Geometry Assertions | `document.documentElement.scrollWidth`, `.cal-day-cell.is-sat`, `getBoundingClientRect()` | 1) `scrollWidth <= viewportWidth` (0px overflow-x)<br>2) 토요일 열 `right <= viewportWidth`<br>3) 셀 높이 편차 `maxHeight - minHeight <= 2px`<br>4) 배너 높이 `height <= 45px` 및 텍스트 겹침 0건 |
| **Tier 4** | Real-World Interaction | 날짜 셀 클릭 (`.click()`), `#dayTimelineList`, `.timeline-item` | 1) 토요일(8건) 클릭 시 카드 8개 렌더링<br>2) 카드 시작 시간순 오름차순(시간순 정렬) 검증<br>3) 팀명, 예약자명, 액션 버튼(공유/수정/취소) 표출<br>4) 일요일(10건) 카드 10개 정렬 표출<br>5) 빈 날짜(0건) `.empty-state` 표출 |

---

## 3. Deterministic Test Isolation & Fixtures

외부 Supabase 원격 네트워크 지연, 레이트 리밋, DB 변동에 영향을 받지 않도록 `page.addInitScript()`를 통해 `window.ObandDB` 데이터 계층을 제어형 픽스처로 완벽 격리 주입합니다.

- **Booking Window**: 2026-11-05 기준, 2주 오픈(~2026-11-14까지 허용)
- **Shuffled Input Test**: 주말 8건 예약 데이터를 비연속/역순 시간대(`19:00`, `09:00`, `15:00` 등)로 주입하여 클라이언트 정렬 로직이 정상 작동하는지 적대적(Adversarial)으로 검증
- **Modal Block Prevention**: `window.alert`를 모의 함수로 치환하여 Headless 브라우저 정지 방어

---

## 4. Execution Commands

### A. Python CLI Wrapper 실행 (권장)
```powershell
python scripts/test_e2e_mobile.py
```

### B. Bundled Node 러너 직접 실행
```powershell
& "C:\Users\User\AppData\Local\Programs\Python\Python311\Lib\site-packages\playwright\driver\node.exe" scripts/test_e2e_mobile.js
```

### C. 라이브 서버 대상 실행
```powershell
$env:TEST_URL="http://localhost:8080/index.html"
python scripts/test_e2e_mobile.py
```

### D. 기존 WTT 회귀 검증 동시 실행
```powershell
python test_wtt.py
```
