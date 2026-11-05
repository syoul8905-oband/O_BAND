# Project: 오뺀 360px 모바일 반응형 캘린더 및 다건 예약 UI/UX 개선

## Architecture
- **Client**: Vanilla HTML5, CSS3 (CSS Grid & Flexbox), Vanilla JavaScript (`public/index.html`, `public/style.css`, `public/app.js`, `public/js/oband-db.js`).
- **Server**: Python 3.11 lightweight HTTP/Socket server (`server.py`, port 8080 or test runner).
- **Dual Track Orchestration**:
  1. **E2E Testing Track**: Autonomous test runner validating 360px/375px/390px viewports, 5~10 multi-booking weekend scenarios, DOM geometry (scrollWidth, Saturday rect, cell height uniformity), and detail timeline synchronization. Published `TEST_READY.md`.
  2. **Implementation Track**: Refactored CSS Grid tracks, day cell dimensions, compact dot/count badges, timeline sorting/count header, top banner layout, and global overflow-x defense.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 7-Column Grid 100% Fit | 360px 모바일 화면에서 7열 그리드가 가로 잘림 없이 100% 화면 폭에 핏 (`repeat(7, minmax(0, 1fr))`, `min-width: 0`) | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Saturday Column Visibility | 토요일 열이 우측 화면 밖으로 밀려나지 않고 360px 내에 온전히 표출 | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Uniform Day Cell Height | 주말 등 5~10건 다건 예약 시에도 모든 날짜 셀이 균일한 높이(56px) 유지 | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Compact Booking Indicator | 날짜 셀에 텍스트 긴 알약 대신 도트 / 카운트 배지(`● N건`, 3건 이상 `.is-heavy`) 표시 | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Detail Timeline Sync & Sorting | 날짜 셀 탭 시 하단 타임라인에 해당 일자의 전체 예약(시간순 정렬, 총 N건 표시) 연동 | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Top Banner Responsive Refinement | 상단 '예약 오픈' 배너의 부자연스러운 줄바꿈, 텍스트 겹침 정돈 및 컴팩트화 (높이 33px) | M1 | ORIGINAL_REQUEST §R2 |
| 7 | Global Overflow-X Prevention | 전체 페이지에서 360px 뷰포트 기준 가로 스크롤(overflow-x) 0px 방어 | M1 | ORIGINAL_REQUEST §R2 |
| 8 | E2E Programmatic Verification Suite | 360px/375px/390px 뷰포트 렌더링 무결성 및 5~10건 다건 예약 시나리오 자동화 검증 | M-TEST | ORIGINAL_REQUEST §R3 |
| 9 | Zero Regression & Backward Compatibility | 기존 예약 등록/조회/수정/취소 및 `test_wtt.py` 100% 통과 보존 | M-FINAL | ORIGINAL_REQUEST §R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-TEST | E2E Test Suite Creation | `scripts/test_e2e_mobile.py`: 360px/375px/390px 뷰포트, 5~10건 주말 예약 DOM 기하구조 및 타임라인 동기화 전수 검증 -> `TEST_READY.md` 발행 | Survey | DONE |
| M1 | Responsive Calendar, Indicators & Banner Refactor | `public/style.css`, `public/app.js`, `public/index.html`: 7열 그리드 핏, 컴팩트 인디케이터, 셀 높이 고정, 타임라인 정렬/카운트, 배너 정돈, 전역 overflow-x 방어 | Survey | DONE |
| M-FINAL | E2E 100% Pass & Adversarial Hardening | M-TEST의 E2E 테스트 스위트 100% 통과 검증 및 적대적(Adversarial) 엣지 케이스 점검 | M-TEST, M1 | DONE |

## Interface Contracts
### Calendar Grid & Cell Contract
- Grid Container: `.calendar-days-grid` uses `grid-template-columns: repeat(7, minmax(0, 1fr));`
- Day Cell: `.cal-day-cell` has `min-width: 0; box-sizing: border-box; overflow: hidden; height: 56px; min-height: 56px; max-height: 56px;`
- Compact Badge: `.cal-res-container` with child `.cal-res-pill.cal-res-badge` displaying `● N건` to maintain locator compatibility with `.cal-res-pill`.
- Detail Timeline: `#dayTimelineList` receives sorted `dayRes` array with `(총 N건)` header in `#selectedDateTitle`.

## Code Layout
- Verified & Passed Deliverables:
  - `public/style.css`, `public/app.js`, `public/index.html`
  - `scripts/test_e2e_mobile.py`, `scripts/test_e2e_mobile.js`, `TEST_INFRA.md`, `TEST_READY.md`
  - `test_wtt.py` (Regression suite, 10/10 passed)
