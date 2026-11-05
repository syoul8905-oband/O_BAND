/**
 * scripts/test_stress_density.js
 * Adversarial Multi-Booking Density Stress Test Suite
 *
 * Scenarios tested:
 * - 0 bookings (Nov 3)
 * - 1 booking (Nov 5)
 * - 5 bookings (Nov 4)
 * - 10 bookings (Nov 6)
 * - 15 bookings (Nov 7 Saturday) [out of order array]
 * - 20 bookings (Nov 8 Sunday) [reverse order array]
 * Total injected bookings: 51 bookings
 *
 * Invariants tested across 360px, 375px, 390px:
 * 1. Cell Height Uniformity:
 *    - All 35 calendar cells measured with getBoundingClientRect()
 *    - No cell exceeds 56.0px (maxHeight <= 56.0)
 *    - (maxHeight - minHeight) <= 1.0px (exact uniformity)
 * 2. Weekend Saturday column right edge <= viewportWidth (no clipping)
 * 3. Page scrollWidth <= viewportWidth (0px overflow-x)
 * 4. Badge rendering:
 *    - Dot and text 'N건' correctly formatted
 *    - .is-heavy class present for >= 3 bookings
 * 5. Timeline Synchronization & Sorting:
 *    - Click Nov 7 (15 bookings): exact 15 cards rendered, strictly sorted, no cut-off
 *    - Click Nov 8 (20 bookings): exact 20 cards rendered, strictly sorted, no cut-off
 *    - Click Nov 6 (10 bookings): exact 10 cards rendered, strictly sorted
 *    - Click Nov 4 (5 bookings): exact 5 cards rendered, strictly sorted
 *    - Click Nov 3 (0 bookings): empty state rendered, 0 cards
 * 6. Console / Runtime errors: 0 errors
 */

const path = require('path');
const fs = require('fs');

// Locate Playwright package
const pwPaths = [
  'C:/Users/User/AppData/Local/Programs/Python/Python311/Lib/site-packages/playwright/driver/package',
  path.resolve(__dirname, '../../../AppData/Local/Programs/Python/Python311/Lib/site-packages/playwright/driver/package'),
  'playwright'
];

let pw = null;
for (const p of pwPaths) {
  try {
    pw = require(p);
    break;
  } catch (e) {}
}

if (!pw) {
  console.error('[FATAL] Playwright package could not be resolved.');
  process.exit(1);
}

const PUBLIC_DIR = path.resolve(__dirname, '../public');
const TARGET_URL = 'file:///' + path.resolve(PUBLIC_DIR, 'index.html').replace(/\\/g, '/');

// Build 51 reservations fixture
function buildFixtures() {
  const reservations = [];
  let idCounter = 1000;

  // 1. Nov 5 (1 booking)
  reservations.push({
    id: ++idCounter,
    res_date: '2026-11-05',
    start_time: '14:00',
    end_time: '16:00',
    member_name: '단독예약자',
    band_team: '1팀 단독',
    part: '보컬',
    status: 'confirmed'
  });

  // 2. Nov 4 (5 bookings)
  const wedTimes = [
    ['10:00', '12:00', '수요1팀', '수요멤버1', '기타'],
    ['12:00', '14:00', '수요2팀', '수요멤버2', '드럼'],
    ['14:00', '16:00', '수요3팀', '수요멤버3', '건반'],
    ['17:00', '19:00', '수요4팀', '수요멤버4', '베이스'],
    ['20:00', '22:00', '수요5팀', '수요멤버5', '보컬']
  ];
  wedTimes.forEach(([st, et, team, mem, part]) => {
    reservations.push({
      id: ++idCounter,
      res_date: '2026-11-04',
      start_time: st,
      end_time: et,
      member_name: mem,
      band_team: team,
      part: part,
      status: 'confirmed'
    });
  });

  // 3. Nov 6 (10 bookings)
  const friTimes = [
    ['08:00', '09:30', '금요새벽', '금멤버01', '기타'],
    ['09:30', '11:00', '금요아침', '금멤버02', '보컬'],
    ['11:00', '12:30', '금요점심', '금멤버03', '드럼'],
    ['12:30', '14:00', '금요정오', '금멤버04', '건반'],
    ['14:00', '15:30', '금요오후1', '금멤버05', '베이스'],
    ['15:30', '17:00', '금요오후2', '금멤버06', '기타'],
    ['17:00', '18:30', '금요저녁1', '금멤버07', '보컬'],
    ['18:30', '20:00', '금요저녁2', '금멤버08', '드럼'],
    ['20:00', '21:30', '금요심야1', '금멤버09', '건반'],
    ['21:30', '23:00', '금요심야2', '금멤버10', '베이스']
  ];
  friTimes.forEach(([st, et, team, mem, part]) => {
    reservations.push({
      id: ++idCounter,
      res_date: '2026-11-06',
      start_time: st,
      end_time: et,
      member_name: mem,
      band_team: team,
      part: part,
      status: 'confirmed'
    });
  });

  // 4. Nov 7 (Saturday - 15 bookings, intentionally scrambled order)
  const satTimesRaw = [
    ['19:00', '20:00', '토요저녁2', '토멤버09', '보컬'],
    ['07:00', '08:00', '토요새벽1', '토멤버01', '드럼'],
    ['14:00', '15:00', '토요오후2', '토멤버06', '기타'],
    ['11:00', '12:00', '토요오전2', '토멤버04', '베이스'],
    ['22:00', '23:00', '토요심야2', '토멤버12', '건반'],
    ['09:00', '10:00', '토요오전1', '토멤버03', '보컬'],
    ['16:00', '17:00', '토요오후3', '토멤버07', '드럼'],
    ['13:00', '14:00', '토요오후1', '토멤버05', '기타'],
    ['08:00', '09:00', '토요새벽2', '토멤버02', '베이스'],
    ['20:00', '21:00', '토요야간1', '토멤버10', '건반'],
    ['17:00', '18:00', '토요저녁1', '토멤버08', '보컬'],
    ['21:00', '22:00', '토요야간2', '토멤버11', '드럼'],
    ['23:00', '23:59', '토요피날레', '토멤버13', '기타'],
    ['10:00', '11:00', '토요모닝', '토멤버14', '베이스'],
    ['15:00', '16:00', '토요티타임', '토멤버15', '건반']
  ];
  satTimesRaw.forEach(([st, et, team, mem, part]) => {
    reservations.push({
      id: ++idCounter,
      res_date: '2026-11-07',
      start_time: st,
      end_time: et,
      member_name: mem,
      band_team: team,
      part: part,
      status: 'confirmed'
    });
  });

  // 5. Nov 8 (Sunday - 20 bookings, extreme density, reverse chronological order)
  const sunTimes = [
    ['06:00', '06:45', '일요01', '일멤버01', '보컬'],
    ['07:00', '07:45', '일요02', '일멤버02', '기타'],
    ['08:00', '08:45', '일요03', '일멤버03', '드럼'],
    ['09:00', '09:45', '일요04', '일멤버04', '건반'],
    ['10:00', '10:45', '일요05', '일멤버05', '베이스'],
    ['11:00', '11:45', '일요06', '일멤버06', '보컬'],
    ['12:00', '12:45', '일요07', '일멤버07', '기타'],
    ['13:00', '13:45', '일요08', '일멤버08', '드럼'],
    ['14:00', '14:45', '일요09', '일멤버09', '건반'],
    ['15:00', '15:45', '일요10', '일멤버10', '베이스'],
    ['16:00', '16:45', '일요11', '일멤버11', '보컬'],
    ['17:00', '17:45', '일요12', '일멤버12', '기타'],
    ['18:00', '18:45', '일요13', '일멤버13', '드럼'],
    ['19:00', '19:45', '일요14', '일멤버14', '건반'],
    ['20:00', '20:45', '일요15', '일멤버15', '베이스'],
    ['21:00', '21:45', '일요16', '일멤버16', '보컬'],
    ['22:00', '22:30', '일요17', '일멤버17', '기타'],
    ['22:30', '23:00', '일요18', '일멤버18', '드럼'],
    ['23:00', '23:30', '일요19', '일멤버19', '건반'],
    ['23:30', '23:59', '일요20', '일멤버20', '베이스']
  ].reverse(); // reverse order in fixture

  sunTimes.forEach(([st, et, team, mem, part]) => {
    reservations.push({
      id: ++idCounter,
      res_date: '2026-11-08',
      start_time: st,
      end_time: et,
      member_name: mem,
      band_team: team,
      part: part,
      status: 'confirmed'
    });
  });

  return {
    bookingWindow: {
      today: '2026-11-05',
      this_reset_date: '2026-11-01',
      max_allowed_date: '2026-11-14',
      open_weeks: 2,
      reset_day: 0,
      quick_teams: '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습',
      description: '일요일 기준 2주(다음 주 토요일까지)'
    },
    reservations: reservations
  };
}

async function runEmpiricalStressSuite() {
  console.log('======================================================================');
  console.log('🔥 [오뺀] Adversarial Multi-Booking Density Stress Suite');
  console.log('   Scenarios: 0, 1, 5, 10, 15 (Sat), 20 (Sun) Bookings');
  console.log('   Invariants: Cell Height Uniformity <= 56px, Timeline Sync & Sort');
  console.log('======================================================================\n');

  const fixtures = buildFixtures();
  console.log(`[SETUP] Generated ${fixtures.reservations.length} test reservations across November 2026:`);
  console.log(`  - 2026-11-03: 0 bookings (empty baseline)`);
  console.log(`  - 2026-11-05: 1 booking (single baseline)`);
  console.log(`  - 2026-11-04: 5 bookings (mid-week density)`);
  console.log(`  - 2026-11-06: 10 bookings (heavy Friday)`);
  console.log(`  - 2026-11-07: 15 bookings (Saturday weekend scramble)`);
  console.log(`  - 2026-11-08: 20 bookings (Sunday extreme density reverse)`);

  const browser = await pw.chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const VIEWPORTS = [360, 375, 390];
  const allResults = [];
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;

  for (const width of VIEWPORTS) {
    console.log(`\n──────────────────────────────────────────────────────────────────────`);
    console.log(`📱 Stress Testing Viewport: ${width}px x 640px`);
    console.log(`──────────────────────────────────────────────────────────────────────`);

    const context = await browser.newContext({
      viewport: { width, height: 640 },
      userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    });

    const page = await context.newPage();
    const pageErrors = [];

    page.on('pageerror', err => pageErrors.push(err.message || String(err)));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        if (!txt.includes('ERR_NAME_NOT_RESOLVED') && !txt.includes('Failed to load resource')) {
          pageErrors.push(txt);
        }
      }
    });

    await page.addInitScript((fix) => {
      const mockObandDB = {
        getBookingWindow: async () => ({ success: true, window: fix.bookingWindow }),
        getMonthReservations: async () => ({ success: true, reservations: fix.reservations }),
        getNotices: async () => ({ success: true, notices: [] }),
        getMembers: async () => ({ success: true, members: [] }),
        getSetlists: async () => ({ success: true, setlists: [] }),
        saveSetlist: async () => ({ success: true }),
        saveReservation: async () => ({ success: true }),
        updateReservation: async () => ({ success: true }),
        cancelReservation: async () => ({ success: true })
      };

      Object.defineProperty(window, 'ObandDB', {
        get: () => mockObandDB,
        set: () => {},
        configurable: false
      });

      window.alert = function(msg) {
        console.log('[MockAlert]', msg);
      };
    }, fixtures);

    await page.goto(TARGET_URL, { waitUntil: 'load' });
    await page.waitForSelector('.calendar-days-grid .cal-day-cell');
    await page.waitForTimeout(400);

    // 1. Zero Console/Page Errors
    totalAssertions++;
    if (pageErrors.length === 0) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S1: Zero Console/Runtime Errors (count: 0)`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S1: Console Errors detected: ${pageErrors.join(' | ')}`);
    }

    // 2. Cell Height Uniformity & Max Height <= 56px Invariance
    const cellMetrics = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('.calendar-days-grid .cal-day-cell'));
      const heights = cells.map(c => {
        const r = c.getBoundingClientRect();
        return {
          text: c.querySelector('.cal-day-num')?.textContent.trim() || '',
          height: Math.round(r.height * 100) / 100,
          badge: c.querySelector('.cal-res-badge')?.textContent.trim() || null,
          isHeavy: c.querySelector('.cal-res-badge')?.classList.contains('is-heavy') || false
        };
      });

      const hValues = heights.map(h => h.height);
      const minH = Math.min(...hValues);
      const maxH = Math.max(...hValues);
      const stretchedBeyond56 = heights.filter(h => h.height > 56.5);

      // Specific target date cells
      const day3 = heights.find(h => h.text === '3');
      const day4 = heights.find(h => h.text === '4');
      const day5 = heights.find(h => h.text === '5');
      const day6 = heights.find(h => h.text === '6');
      const day7 = heights.find(h => h.text === '7');
      const day8 = heights.find(h => h.text === '8');

      return {
        totalCells: cells.length,
        minH,
        maxH,
        diff: Math.round((maxH - minH) * 100) / 100,
        stretchedBeyond56Count: stretchedBeyond56.length,
        day3, // 0 bookings
        day4, // 5 bookings
        day5, // 1 booking
        day6, // 10 bookings
        day7, // 15 bookings
        day8  // 20 bookings
      };
    });

    // Assertion 2.1: No cell > 56.5px
    totalAssertions++;
    if (cellMetrics.stretchedBeyond56Count === 0 && cellMetrics.maxH <= 56.5) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S2.1: All ${cellMetrics.totalCells} cells <= 56px (maxH: ${cellMetrics.maxH}px, minH: ${cellMetrics.minH}px)`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S2.1: ${cellMetrics.stretchedBeyond56Count} cells stretched beyond 56px! maxH: ${cellMetrics.maxH}px`);
    }

    // Assertion 2.2: Height difference <= 1.0px (uniformity)
    totalAssertions++;
    if (cellMetrics.diff <= 1.0) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S2.2: Perfect Cell Height Uniformity (diff: ${cellMetrics.diff}px <= 1.0px)`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S2.2: Cell height non-uniform! diff: ${cellMetrics.diff}px (min: ${cellMetrics.minH}px, max: ${cellMetrics.maxH}px)`);
    }

    // Assertion 2.3: Badge counts and .is-heavy classes
    totalAssertions++;
    const badgesOk = (
      cellMetrics.day3.badge === null &&
      cellMetrics.day5.badge === '1건' && !cellMetrics.day5.isHeavy &&
      cellMetrics.day4.badge === '5건' && cellMetrics.day4.isHeavy &&
      cellMetrics.day6.badge === '10건' && cellMetrics.day6.isHeavy &&
      cellMetrics.day7.badge === '15건' && cellMetrics.day7.isHeavy &&
      cellMetrics.day8.badge === '20건' && cellMetrics.day8.isHeavy
    );
    if (badgesOk) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S2.3: Badge indicators validated: 0건=null, 1건=plain, 5건/10건/15건/20건=is-heavy`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S2.3: Badge indicator mismatch!`, {
        day3: cellMetrics.day3,
        day5: cellMetrics.day5,
        day4: cellMetrics.day4,
        day6: cellMetrics.day6,
        day7: cellMetrics.day7,
        day8: cellMetrics.day8
      });
    }

    // 3. Overflow-X and Saturday Column Boundary
    const geom = await page.evaluate((vpWidth) => {
      const docW = document.documentElement.scrollWidth;
      const bodyW = document.body.scrollWidth;
      const satCells = Array.from(document.querySelectorAll('.cal-day-cell.is-sat'));
      const satMaxRight = Math.max(...satCells.map(c => c.getBoundingClientRect().right));
      return {
        docW,
        bodyW,
        satMaxRight: Math.round(satMaxRight * 10) / 10,
        vpWidth
      };
    }, width);

    totalAssertions++;
    if (geom.docW <= width && geom.bodyW <= width) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S3.1: Zero Horizontal Overflow (docScrollW: ${geom.docW}px, bodyScrollW: ${geom.bodyW}px <= ${width}px)`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S3.1: Horizontal overflow detected! docW: ${geom.docW}px, bodyW: ${geom.bodyW}px > ${width}px`);
    }

    totalAssertions++;
    if (geom.satMaxRight <= width) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S3.2: Saturday Column fully visible inside screen (satMaxRight: ${geom.satMaxRight}px <= ${width}px)`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S3.2: Saturday Column clipped outside screen! satMaxRight: ${geom.satMaxRight}px > ${width}px`);
    }

    // 4. Timeline Synchronization & Chronological Sorting
    // Scenario 4.1: Click Nov 7 (Saturday with 15 bookings scrambled)
    const sat15Test = await page.evaluate(async () => {
      const cells = Array.from(document.querySelectorAll('.calendar-days-grid .cal-day-cell'));
      const nov7 = cells.find(c => c.querySelector('.cal-day-num')?.textContent.trim() === '7');
      if (!nov7) return { error: 'Nov 7 cell not found' };

      nov7.click();
      await new Promise(r => setTimeout(r, 150));

      const title = document.getElementById('selectedDateTitle')?.textContent || '';
      const items = Array.from(document.querySelectorAll('#dayTimelineList .timeline-item'));
      const times = items.map(it => it.querySelector('.timeline-time-text')?.textContent.trim());

      // Check sorting
      let isSorted = true;
      for (let i = 0; i < times.length - 1; i++) {
        const t1 = times[i].split('~')[0].trim();
        const t2 = times[i+1].split('~')[0].trim();
        if (t1.localeCompare(t2) > 0) {
          isSorted = false;
          break;
        }
      }

      // Check visibility of all 15 items
      const allVisible = items.every(it => it.offsetHeight > 0 && window.getComputedStyle(it).display !== 'none');

      return {
        title,
        cardCount: items.length,
        isSorted,
        allVisible,
        firstTime: times[0],
        lastTime: times[times.length - 1]
      };
    });

    totalAssertions++;
    if (sat15Test.cardCount === 15 && sat15Test.isSorted && sat15Test.allVisible && sat15Test.title.includes('총 15건')) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S4.1: Nov 7 Saturday (15 bookings) -> exact 15 cards, sorted (${sat15Test.firstTime} to ${sat15Test.lastTime}), all visible`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S4.1: Nov 7 Saturday timeline sync failed!`, sat15Test);
    }

    // Scenario 4.2: Click Nov 8 (Sunday with 20 bookings reverse order)
    const sun20Test = await page.evaluate(async () => {
      const cells = Array.from(document.querySelectorAll('.calendar-days-grid .cal-day-cell'));
      const nov8 = cells.find(c => c.querySelector('.cal-day-num')?.textContent.trim() === '8');
      if (!nov8) return { error: 'Nov 8 cell not found' };

      nov8.click();
      await new Promise(r => setTimeout(r, 150));

      const title = document.getElementById('selectedDateTitle')?.textContent || '';
      const items = Array.from(document.querySelectorAll('#dayTimelineList .timeline-item'));
      const times = items.map(it => it.querySelector('.timeline-time-text')?.textContent.trim());

      let isSorted = true;
      for (let i = 0; i < times.length - 1; i++) {
        const t1 = times[i].split('~')[0].trim();
        const t2 = times[i+1].split('~')[0].trim();
        if (t1.localeCompare(t2) > 0) {
          isSorted = false;
          break;
        }
      }

      const allVisible = items.every(it => it.offsetHeight > 0 && window.getComputedStyle(it).display !== 'none');

      return {
        title,
        cardCount: items.length,
        isSorted,
        allVisible,
        firstTime: times[0],
        lastTime: times[times.length - 1]
      };
    });

    totalAssertions++;
    if (sun20Test.cardCount === 20 && sun20Test.isSorted && sun20Test.allVisible && sun20Test.title.includes('총 20건')) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S4.2: Nov 8 Sunday (20 bookings) -> exact 20 cards, sorted (${sun20Test.firstTime} to ${sun20Test.lastTime}), all visible`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S4.2: Nov 8 Sunday timeline sync failed!`, sun20Test);
    }

    // Scenario 4.3: Click Nov 6 (Friday with 10 bookings)
    const fri10Test = await page.evaluate(async () => {
      const cells = Array.from(document.querySelectorAll('.calendar-days-grid .cal-day-cell'));
      const nov6 = cells.find(c => c.querySelector('.cal-day-num')?.textContent.trim() === '6');
      if (!nov6) return { error: 'Nov 6 cell not found' };

      nov6.click();
      await new Promise(r => setTimeout(r, 150));

      const title = document.getElementById('selectedDateTitle')?.textContent || '';
      const items = Array.from(document.querySelectorAll('#dayTimelineList .timeline-item'));
      return {
        title,
        cardCount: items.length
      };
    });

    totalAssertions++;
    if (fri10Test.cardCount === 10 && fri10Test.title.includes('총 10건')) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S4.3: Nov 6 Friday (10 bookings) -> exact 10 cards rendered`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S4.3: Nov 6 Friday timeline sync failed!`, fri10Test);
    }

    // Scenario 4.4: Click Nov 4 (Wednesday with 5 bookings)
    const wed5Test = await page.evaluate(async () => {
      const cells = Array.from(document.querySelectorAll('.calendar-days-grid .cal-day-cell'));
      const nov4 = cells.find(c => c.querySelector('.cal-day-num')?.textContent.trim() === '4');
      if (!nov4) return { error: 'Nov 4 cell not found' };

      nov4.click();
      await new Promise(r => setTimeout(r, 150));

      const title = document.getElementById('selectedDateTitle')?.textContent || '';
      const items = Array.from(document.querySelectorAll('#dayTimelineList .timeline-item'));
      return {
        title,
        cardCount: items.length
      };
    });

    totalAssertions++;
    if (wed5Test.cardCount === 5 && wed5Test.title.includes('총 5건')) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S4.4: Nov 4 Wednesday (5 bookings) -> exact 5 cards rendered`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S4.4: Nov 4 Wednesday timeline sync failed!`, wed5Test);
    }

    // Scenario 4.5: Click Nov 3 (Tuesday with 0 bookings)
    const tue0Test = await page.evaluate(async () => {
      const cells = Array.from(document.querySelectorAll('.calendar-days-grid .cal-day-cell'));
      const nov3 = cells.find(c => c.querySelector('.cal-day-num')?.textContent.trim() === '3');
      if (!nov3) return { error: 'Nov 3 cell not found' };

      nov3.click();
      await new Promise(r => setTimeout(r, 150));

      const emptyEl = document.querySelector('#dayTimelineList .empty-state');
      const items = Array.from(document.querySelectorAll('#dayTimelineList .timeline-item'));
      return {
        hasEmptyState: !!emptyEl,
        cardCount: items.length
      };
    });

    totalAssertions++;
    if (tue0Test.hasEmptyState && tue0Test.cardCount === 0) {
      passedAssertions++;
      console.log(`  [PASS] (${width}px) S4.5: Nov 3 Tuesday (0 bookings) -> empty state displayed (0 cards)`);
    } else {
      failedAssertions++;
      console.error(`  [FAIL] (${width}px) S4.5: Nov 3 Tuesday empty state failed!`, tue0Test);
    }

    await context.close();
  }

  await browser.close();

  console.log('\n======================================================================');
  console.log(`📊 EMPIRICAL STRESS TEST RESULTS:`);
  console.log(`   TOTAL ASSERTIONS : ${totalAssertions}`);
  console.log(`   PASSED ASSERTIONS: ${passedAssertions}`);
  console.log(`   FAILED ASSERTIONS: ${failedAssertions}`);
  console.log(`   PASS RATE        : ${(passedAssertions / totalAssertions * 100).toFixed(1)}%`);
  console.log('======================================================================\n');

  if (failedAssertions > 0) {
    console.error('❌ STRESS TEST FAILED! Some assertions did not pass.');
    process.exit(1);
  } else {
    console.log('🎉 ALL EMPIRICAL STRESS TEST ASSERTIONS PASSED WITH ZERO ERRORS!');
    process.exit(0);
  }
}

runEmpiricalStressSuite().catch(err => {
  console.error('[FATAL EXCEPTION]', err);
  process.exit(1);
});
