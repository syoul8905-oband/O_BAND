/**
 * 오뺀 (오늘부터 밴드부) - Headless Chrome Mobile E2E Test Suite
 *
 * Tier 1: Viewports 360px, 375px, 390px basic rendering
 * Tier 2: Boundary test with 0 bookings, 1 booking, 2 bookings, and 5~10 multi-bookings on Saturday/Sunday
 * Tier 3: DOM Geometry assertions:
 *   - document.documentElement.scrollWidth <= viewportWidth (0px horizontal overflow)
 *   - Saturday column getBoundingClientRect().right <= viewportWidth (no clipping)
 *   - Cell height uniformity: all .cal-day-cell heights uniform (maxHeight - minHeight <= 2px)
 *   - Top banner: height <= 45px and no text/badge overlap
 * Tier 4: Real-world interaction:
 *   - Click weekend date with multi-bookings (8 / 10 bookings)
 *   - Timeline list (#dayTimelineList) renders exact count of cards
 *   - Chronological sorting verified (earliest start_time to latest)
 *   - Full card metadata: time, team, member, and action buttons verified
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

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
  } catch (e) {
    // try next
  }
}

if (!pw) {
  console.error('[FATAL] Playwright package could not be resolved from known locations.');
  process.exit(1);
}

const PUBLIC_DIR = path.resolve(__dirname, '../public');
const DEFAULT_FILE_URL = 'file:///' + path.resolve(PUBLIC_DIR, 'index.html').replace(/\\/g, '/');


// Deterministic Test Fixtures for November 2026
const TEST_FIXTURES = {
  bookingWindow: {
    today: '2026-11-05', // Thursday
    this_reset_date: '2026-11-01',
    max_allowed_date: '2026-11-14',
    open_weeks: 2,
    reset_day: 0,
    quick_teams: '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습',
    description: '일요일 기준 2주(다음 주 토요일까지)'
  },
  // Multi-booking boundary scenarios:
  // - 2026-11-03 (Tue): 0 bookings
  // - 2026-11-05 (Thu): 1 booking
  // - 2026-11-06 (Fri): 2 bookings
  // - 2026-11-07 (Sat): 8 bookings (intentionally shuffled in array to test sorting)
  // - 2026-11-08 (Sun): 10 bookings (staggered morning to evening)
  reservations: [
    // 1 booking on Thu Nov 5
    {
      id: 501,
      res_date: '2026-11-05',
      start_time: '14:00',
      end_time: '16:00',
      member_name: '홍길동',
      band_team: '1팀 합주',
      part: '보컬',
      status: 'confirmed'
    },
    // 2 bookings on Fri Nov 6
    {
      id: 601,
      res_date: '2026-11-06',
      start_time: '10:00',
      end_time: '12:00',
      member_name: '김기타',
      band_team: '2팀 합주',
      part: '기타',
      status: 'confirmed'
    },
    {
      id: 602,
      res_date: '2026-11-06',
      start_time: '16:00',
      end_time: '18:00',
      member_name: '이베이스',
      band_team: '3팀 합주',
      part: '베이스',
      status: 'confirmed'
    },
    // 8 bookings on Sat Nov 7 (out of order to verify chronological sorting assertion)
    {
      id: 701,
      res_date: '2026-11-07',
      start_time: '19:00',
      end_time: '21:00',
      member_name: '강드럼',
      band_team: '주말 1팀',
      part: '드럼',
      status: 'confirmed'
    },
    {
      id: 702,
      res_date: '2026-11-07',
      start_time: '09:00',
      end_time: '11:00',
      member_name: '조건반',
      band_team: '아침 합주팀',
      part: '건반',
      status: 'confirmed'
    },
    {
      id: 703,
      res_date: '2026-11-07',
      start_time: '15:00',
      end_time: '17:00',
      member_name: '윤보컬',
      band_team: '오후 2팀',
      part: '보컬',
      status: 'confirmed'
    },
    {
      id: 704,
      res_date: '2026-11-07',
      start_time: '11:00',
      end_time: '13:00',
      member_name: '정기타',
      band_team: '정오 합주팀',
      part: '기타',
      status: 'confirmed'
    },
    {
      id: 705,
      res_date: '2026-11-07',
      start_time: '17:00',
      end_time: '19:00',
      member_name: '최베이스',
      band_team: '저녁 1팀',
      part: '베이스',
      status: 'confirmed'
    },
    {
      id: 706,
      res_date: '2026-11-07',
      start_time: '13:00',
      end_time: '15:00',
      member_name: '박퍼커션',
      band_team: '오후 1팀',
      part: '드럼',
      status: 'confirmed'
    },
    {
      id: 707,
      res_date: '2026-11-07',
      start_time: '21:00',
      end_time: '23:00',
      member_name: '임싱어',
      band_team: '심야 합주팀',
      part: '보컬',
      status: 'confirmed'
    },
    {
      id: 708,
      res_date: '2026-11-07',
      start_time: '07:00',
      end_time: '09:00',
      member_name: '신새벽',
      band_team: '새벽 열정팀',
      part: '기타',
      status: 'confirmed'
    },
    // 10 bookings on Sun Nov 8
    {
      id: 801,
      res_date: '2026-11-08',
      start_time: '08:00',
      end_time: '09:30',
      member_name: '일요1',
      band_team: '선데이 모닝',
      part: '보컬',
      status: 'confirmed'
    },
    {
      id: 802,
      res_date: '2026-11-08',
      start_time: '09:30',
      end_time: '11:00',
      member_name: '일요2',
      band_team: '선데이 브런치',
      part: '기타',
      status: 'confirmed'
    },
    {
      id: 803,
      res_date: '2026-11-08',
      start_time: '11:00',
      end_time: '12:30',
      member_name: '일요3',
      band_team: '일요 3팀',
      part: '건반',
      status: 'confirmed'
    },
    {
      id: 804,
      res_date: '2026-11-08',
      start_time: '12:30',
      end_time: '14:00',
      member_name: '일요4',
      band_team: '일요 4팀',
      part: '베이스',
      status: 'confirmed'
    },
    {
      id: 805,
      res_date: '2026-11-08',
      start_time: '14:00',
      end_time: '15:30',
      member_name: '일요5',
      band_team: '일요 5팀',
      part: '드럼',
      status: 'confirmed'
    },
    {
      id: 806,
      res_date: '2026-11-08',
      start_time: '15:30',
      end_time: '17:00',
      member_name: '일요6',
      band_team: '일요 6팀',
      part: '보컬',
      status: 'confirmed'
    },
    {
      id: 807,
      res_date: '2026-11-08',
      start_time: '17:00',
      end_time: '18:30',
      member_name: '일요7',
      band_team: '일요 7팀',
      part: '기타',
      status: 'confirmed'
    },
    {
      id: 808,
      res_date: '2026-11-08',
      start_time: '18:30',
      end_time: '20:00',
      member_name: '일요8',
      band_team: '일요 8팀',
      part: '베이스',
      status: 'confirmed'
    },
    {
      id: 809,
      res_date: '2026-11-08',
      start_time: '20:00',
      end_time: '21:30',
      member_name: '일요9',
      band_team: '일요 9팀',
      part: '드럼',
      status: 'confirmed'
    },
    {
      id: 810,
      res_date: '2026-11-08',
      start_time: '21:30',
      end_time: '23:00',
      member_name: '일요10',
      band_team: '선데이 피날레',
      part: '건반',
      status: 'confirmed'
    }
  ]
};

async function runTestSuite() {
  const isBaseline = process.argv.includes('--baseline');
  const targetUrl = process.env.TEST_URL || DEFAULT_FILE_URL;
  console.log('======================================================================');
  console.log('🧪 [오뺀] Mobile E2E Test Suite (Playwright Headless Chrome)');
  console.log('   Tiers: Tier 1 (Render) | Tier 2 (Boundary) | Tier 3 (Geometry) | Tier 4 (Timeline)');
  console.log(`   Target URL: ${targetUrl}`);
  console.log('======================================================================\n');


  const browser = await pw.chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const VIEWPORTS = [360, 375, 390];
  const results = [];

  try {
    for (const width of VIEWPORTS) {
      console.log(`\n──────────────────────────────────────────────────────────────────────`);
      console.log(`📱 Executing Test Suite on Viewport: ${width}px x 640px`);
      console.log(`──────────────────────────────────────────────────────────────────────`);

      const context = await browser.newContext({
        viewport: { width, height: 640 },
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      });

      const page = await context.newPage();

      const pageErrors = [];
      page.on('pageerror', err => {
        pageErrors.push(err.message || String(err));
      });
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const txt = msg.text();
          // Ignore offline sandbox network failures for external remote origins
          if (!txt.includes('ERR_NAME_NOT_RESOLVED') && !txt.includes('Failed to load resource')) {
            pageErrors.push(txt);
          }
        }
      });

      // Inject deterministic mock data before page load
      await page.addInitScript((fixtures) => {
        // Complete Mock ObandDB matching interface contract
        const mockObandDB = {
          getBookingWindow: async () => ({
            success: true,
            window: fixtures.bookingWindow
          }),
          getMonthReservations: async (year, month) => ({
            success: true,
            reservations: fixtures.reservations
          }),
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

        // Mock window.alert to prevent modal dialog blocks
        window.alert = function(msg) {
          console.log('[MockAlert]', msg);
        };
      }, TEST_FIXTURES);

      await page.goto(targetUrl, { waitUntil: 'load' });
      await page.waitForTimeout(600); // Allow DOM layout to stabilize

      // ===================================================================
      // TIER 1: Basic Viewport Rendering
      // ===================================================================
      const tier1 = await page.evaluate(() => {
        const grid = document.getElementById('calDaysGrid');
        const cells = document.querySelectorAll('.cal-day-cell');
        const header = document.querySelector('.app-header');
        const banner = document.querySelector('.calendar-window-info');
        const bannerText = document.getElementById('windowNoticeText');
        const timelineList = document.getElementById('dayTimelineList');
        const timelineTitle = document.getElementById('selectedDateTitle');

        return {
          gridExists: !!grid,
          cellCount: cells.length,
          headerExists: !!header,
          bannerExists: !!banner,
          bannerTextExists: !!bannerText,
          timelineListExists: !!timelineList,
          timelineTitleExists: !!timelineTitle
        };
      });

      const t1_render_pass = tier1.gridExists && tier1.cellCount >= 28 && tier1.bannerExists && tier1.timelineListExists;
      const t1_error_pass = pageErrors.length === 0;

      recordResult(results, {
        viewport: width,
        tier: 'Tier 1',
        id: 'T1.1',
        title: 'Basic Mobile Viewport Rendering',
        passed: t1_render_pass,
        details: `Grid: ${tier1.gridExists}, CellCount: ${tier1.cellCount} (>=28), Banner: ${tier1.bannerExists}, Timeline: ${tier1.timelineListExists}`
      });

      recordResult(results, {
        viewport: width,
        tier: 'Tier 1',
        id: 'T1.2',
        title: 'Zero Console/Page Runtime Errors',
        passed: t1_error_pass,
        details: t1_error_pass ? 'No uncaught exceptions' : `Errors: ${pageErrors.join('; ')}`
      });

      // ===================================================================
      // TIER 2: Boundary Test (0, 1, 2, 8, 10 bookings)
      // ===================================================================
      const tier2 = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('.cal-day-cell:not(.other-month)'));

        function findCellByDay(dayNum) {
          return cells.find(c => {
            const numEl = c.querySelector('.cal-day-num');
            return numEl && numEl.textContent.trim() === String(dayNum);
          });
        }

        const cell0 = findCellByDay(3);  // Nov 3: 0 bookings
        const cell1 = findCellByDay(5);  // Nov 5: 1 booking
        const cell2 = findCellByDay(6);  // Nov 6: 2 bookings
        const cellSat = findCellByDay(7); // Nov 7 (Sat): 8 bookings
        const cellSun = findCellByDay(8); // Nov 8 (Sun): 10 bookings

        function inspectCell(cell) {
          if (!cell) return null;
          const pills = Array.from(cell.querySelectorAll('.cal-res-pill')).map(p => p.textContent.trim());
          const more = cell.querySelector('.cal-res-more')?.textContent.trim() || null;
          const badge = cell.querySelector('.cal-res-badge')?.textContent.trim() || null;
          const rect = cell.getBoundingClientRect();
          return {
            day: cell.querySelector('.cal-day-num')?.textContent.trim(),
            pillsCount: pills.length,
            moreText: more,
            badgeText: badge,
            totalRenderedItems: cell.querySelectorAll('.cal-res-container > *').length,
            rectWidth: Math.round(rect.width),
            rectHeight: Math.round(rect.height)
          };
        }

        return {
          cell0: inspectCell(cell0),
          cell1: inspectCell(cell1),
          cell2: inspectCell(cell2),
          cellSat: inspectCell(cellSat),
          cellSun: inspectCell(cellSun)
        };
      });

      const t2_pass = !!(tier2.cell0 && tier2.cell1 && tier2.cell2 && tier2.cellSat && tier2.cellSun);
      recordResult(results, {
        viewport: width,
        tier: 'Tier 2',
        id: 'T2.1',
        title: 'Boundary Bookings Grid Presence (0, 1, 2, 8, 10 bookings)',
        passed: t2_pass,
        details: `Nov3(0): ${tier2.cell0 ? 'Found' : 'Missing'}, Nov5(1): ${tier2.cell1 ? 'Found' : 'Missing'}, Nov6(2): ${tier2.cell2 ? 'Found' : 'Missing'}, Nov7(8): ${tier2.cellSat ? 'Found' : 'Missing'}, Nov8(10): ${tier2.cellSun ? 'Found' : 'Missing'}`
      });

      // ===================================================================
      // TIER 3: DOM Geometry Assertions (Strict Physical Measurements)
      // ===================================================================
      const tier3 = await page.evaluate((vpWidth) => {
        const docScrollW = document.documentElement.scrollWidth;
        const bodyScrollW = document.body.scrollWidth;

        // 1. Find overflowing elements
        const overflowing = [];
        document.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.right > vpWidth + 0.5) {
            overflowing.push({
              tag: el.tagName.toLowerCase(),
              className: el.className,
              right: Math.round(r.right),
              width: Math.round(r.width)
            });
          }
        });

        // 2. Saturday cells geometry
        const satCells = Array.from(document.querySelectorAll('.cal-day-cell.is-sat'));
        const satOverflows = satCells.map(c => {
          const r = c.getBoundingClientRect();
          return {
            right: r.right,
            width: r.width,
            overflows: r.right > vpWidth + 0.5
          };
        });

        // 3. Cell height uniformity
        const allCells = Array.from(document.querySelectorAll('.cal-day-cell'));
        const heights = allCells.map(c => c.getBoundingClientRect().height);
        const minH = Math.min(...heights);
        const maxH = Math.max(...heights);
        const heightDiff = maxH - minH;

        // Specific comparison: Sat Nov 7 (8 bookings) vs Tue Nov 3 (0 bookings)
        const cell3 = allCells.find(c => c.querySelector('.cal-day-num')?.textContent.trim() === '3');
        const cell7 = allCells.find(c => c.querySelector('.cal-day-num')?.textContent.trim() === '7');
        const specificDiff = (cell3 && cell7)
          ? Math.abs(cell7.getBoundingClientRect().height - cell3.getBoundingClientRect().height)
          : null;

        // 4. Banner layout and dimensions
        const banner = document.querySelector('.calendar-window-info');
        const badge = document.querySelector('.window-badge');
        const noticeText = document.getElementById('windowNoticeText');

        let bannerH = 0;
        let bannerScrollW = 0;
        let bannerClientW = 0;
        let textOverlap = false;

        if (banner) {
          const br = banner.getBoundingClientRect();
          bannerH = br.height;
          bannerScrollW = banner.scrollWidth;
          bannerClientW = banner.clientWidth;

          if (badge && noticeText) {
            const badger = badge.getBoundingClientRect();
            const textr = noticeText.getBoundingClientRect();
            // Check if badge and text rects intersect horizontally when on same line
            if (badger.bottom > textr.top && badger.top < textr.bottom) {
              if (badger.right > textr.left + 1.0) {
                textOverlap = true;
              }
            }
          }
        }

        return {
          docScrollW,
          bodyScrollW,
          hasDocOverflow: docScrollW > vpWidth || bodyScrollW > vpWidth,
          overflowCount: overflowing.length,
          sampleOverflows: overflowing.slice(0, 5),
          satCellCount: satCells.length,
          satOverflowCount: satOverflows.filter(s => s.overflows).length,
          satSample: satOverflows[0] || null,
          minHeight: Math.round(minH * 10) / 10,
          maxHeight: Math.round(maxH * 10) / 10,
          heightDiff: Math.round(heightDiff * 10) / 10,
          specificDiff: specificDiff !== null ? Math.round(specificDiff * 10) / 10 : null,
          bannerHeight: Math.round(bannerH * 10) / 10,
          bannerScrollW,
          bannerClientW,
          bannerHasInternalOverflow: bannerScrollW > bannerClientW + 0.5,
          textOverlap
        };
      }, width);

      // T3.1: Zero Page Horizontal Overflow
      const t3_1_pass = !tier3.hasDocOverflow && tier3.overflowCount === 0;
      recordResult(results, {
        viewport: width,
        tier: 'Tier 3',
        id: 'T3.1',
        title: 'Zero Page-Wide Horizontal Overflow (scrollWidth <= viewportWidth)',
        passed: t3_1_pass,
        details: `docScrollW: ${tier3.docScrollW}px, bodyScrollW: ${tier3.bodyScrollW}px, limit: ${width}px, overflowingElements: ${tier3.overflowCount}`
      });

      // T3.2: Saturday Column Visibility (No Clipping)
      const t3_2_pass = tier3.satOverflowCount === 0 && (tier3.satSample ? tier3.satSample.right <= width + 0.5 : true);
      recordResult(results, {
        viewport: width,
        tier: 'Tier 3',
        id: 'T3.2',
        title: 'Saturday Column Right Boundary (right <= viewportWidth)',
        passed: t3_2_pass,
        details: `satCount: ${tier3.satCellCount}, overflowingSat: ${tier3.satOverflowCount}, satRight: ${tier3.satSample ? Math.round(tier3.satSample.right) : 0}px, limit: ${width}px`
      });

      // T3.3: Cell Height Strict Uniformity (diff <= 2px)
      const t3_3_pass = tier3.heightDiff <= 2.0;
      recordResult(results, {
        viewport: width,
        tier: 'Tier 3',
        id: 'T3.3',
        title: 'Day Cell Height Uniformity (maxHeight - minHeight <= 2px)',
        passed: t3_3_pass,
        details: `minHeight: ${tier3.minHeight}px, maxHeight: ${tier3.maxHeight}px, diff: ${tier3.heightDiff}px (threshold: <= 2.0px), 8-vs-0-diff: ${tier3.specificDiff}px`
      });

      // T3.4: Top Banner Height and Layout
      const t3_4_pass = tier3.bannerHeight <= 45.0 && !tier3.textOverlap && !tier3.bannerHasInternalOverflow;
      recordResult(results, {
        viewport: width,
        tier: 'Tier 3',
        id: 'T3.4',
        title: 'Top Banner Compact Layout (height <= 45px & no overlap)',
        passed: t3_4_pass,
        details: `bannerHeight: ${tier3.bannerHeight}px (limit: <= 45px), textOverlap: ${tier3.textOverlap}, internalOverflow: ${tier3.bannerHasInternalOverflow}`
      });

      // ===================================================================
      // TIER 4: Real-world Interaction & Timeline Synchronization
      // ===================================================================

      // 4.1: Click Saturday Nov 7 (8 bookings)
      const satCellLocator = page.locator('.cal-day-cell:not(.other-month)').filter({
        has: page.locator('.cal-day-num', { hasText: /^7$/ })
      });
      await satCellLocator.first().click();
      await page.waitForTimeout(400);

      const timelineSat = await page.evaluate(() => {
        const title = document.getElementById('selectedDateTitle')?.textContent || '';
        const items = Array.from(document.querySelectorAll('#dayTimelineList .timeline-item'));
        const parsedItems = items.map(item => {
          const timeText = item.querySelector('.timeline-time-text')?.textContent.trim() || '';
          const team = item.querySelector('.badge-team')?.textContent.trim() || '';
          const member = item.querySelector('.timeline-member, .timeline-user-name')?.textContent.trim() || '';
          const buttons = Array.from(item.querySelectorAll('.timeline-actions button')).map(b => b.textContent.trim());
          const startTime = timeText.split('~')[0].trim();
          return { timeText, startTime, team, member, buttonsCount: buttons.length };
        });

        // Check chronological sorting
        let isSorted = true;
        for (let i = 0; i < parsedItems.length - 1; i++) {
          if (parsedItems[i].startTime > parsedItems[i + 1].startTime) {
            isSorted = false;
            break;
          }
        }

        return {
          title,
          totalCards: items.length,
          isSorted,
          items: parsedItems
        };
      });

      const t4_1_pass = timelineSat.totalCards === 8;
      recordResult(results, {
        viewport: width,
        tier: 'Tier 4',
        id: 'T4.1',
        title: 'Saturday Multi-Booking Timeline Card Count (Expected: 8)',
        passed: t4_1_pass,
        details: `Rendered: ${timelineSat.totalCards} cards for Saturday 2026-11-07 (Expected: 8)`
      });

      const t4_2_pass = timelineSat.isSorted && timelineSat.totalCards === 8;
      const startTimesList = timelineSat.items.map(it => it.startTime).join(' -> ');
      recordResult(results, {
        viewport: width,
        tier: 'Tier 4',
        id: 'T4.2',
        title: 'Saturday Timeline Chronological Sorting',
        passed: t4_2_pass,
        details: `isSorted: ${timelineSat.isSorted}, timelineOrder: [${startTimesList}]`
      });

      const t4_3_pass = timelineSat.items.length > 0 && timelineSat.items.every(it => it.team && it.member && it.buttonsCount >= 2);
      recordResult(results, {
        viewport: width,
        tier: 'Tier 4',
        id: 'T4.3',
        title: 'Saturday Timeline Card Metadata & Action Buttons',
        passed: t4_3_pass,
        details: `All cards have valid team, member, and >=2 action buttons: ${t4_3_pass}`
      });

      // 4.2: Click Sunday Nov 8 (10 bookings)
      const sunCellLocator = page.locator('.cal-day-cell:not(.other-month)').filter({
        has: page.locator('.cal-day-num', { hasText: /^8$/ })
      });
      await sunCellLocator.first().click();
      await page.waitForTimeout(400);

      const timelineSun = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('#dayTimelineList .timeline-item'));
        const parsedItems = items.map(item => {
          const timeText = item.querySelector('.timeline-time-text')?.textContent.trim() || '';
          return timeText.split('~')[0].trim();
        });

        let isSorted = true;
        for (let i = 0; i < parsedItems.length - 1; i++) {
          if (parsedItems[i] > parsedItems[i + 1]) {
            isSorted = false;
            break;
          }
        }

        return {
          totalCards: items.length,
          isSorted,
          parsedItems
        };
      });

      const t4_4_pass = timelineSun.totalCards === 10 && timelineSun.isSorted;
      recordResult(results, {
        viewport: width,
        tier: 'Tier 4',
        id: 'T4.4',
        title: 'Sunday Multi-Booking (10 bookings) Timeline Sync & Sorting',
        passed: t4_4_pass,
        details: `totalCards: ${timelineSun.totalCards} (Expected: 10), isSorted: ${timelineSun.isSorted}`
      });

      // 4.3: Click Tuesday Nov 3 (0 bookings) -> Empty State
      const emptyCellLocator = page.locator('.cal-day-cell:not(.other-month)').filter({
        has: page.locator('.cal-day-num', { hasText: /^3$/ })
      });
      await emptyCellLocator.first().click();
      await page.waitForTimeout(400);

      const timelineEmpty = await page.evaluate(() => {
        const emptyState = document.querySelector('#dayTimelineList .empty-state');
        const items = document.querySelectorAll('#dayTimelineList .timeline-item');
        return {
          hasEmptyState: !!emptyState,
          itemsCount: items.length
        };
      });

      const t4_5_pass = timelineEmpty.hasEmptyState && timelineEmpty.itemsCount === 0;
      recordResult(results, {
        viewport: width,
        tier: 'Tier 4',
        id: 'T4.5',
        title: 'Empty Day (0 bookings) Empty State Rendering',
        passed: t4_5_pass,
        details: `hasEmptyState: ${timelineEmpty.hasEmptyState}, itemsCount: ${timelineEmpty.itemsCount}`
      });

      await context.close();
    }

    await browser.close();
  } catch (err) {
    console.error('[TEST ERROR]', err);
    throw err;
  }


  // Print Comprehensive Summary Report
  console.log('\n======================================================================');
  console.log('📊 TEST EXECUTION SUMMARY TABLE');
  console.log('======================================================================');

  let passedCount = 0;
  let failedCount = 0;

  for (const r of results) {
    const statusLabel = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
    if (r.passed) passedCount++; else failedCount++;
    console.log(`${statusLabel} (${r.viewport}px) ${r.tier} ${r.id}: ${r.title}`);
    console.log(`         └─ ${r.details}`);
  }

  console.log('======================================================================');
  console.log(`TOTAL CHECKS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log(`COMPLIANCE RATE: ${Math.round((passedCount / results.length) * 100)}%`);
  console.log('======================================================================');

  if (isBaseline) {
    console.log('[BASELINE MODE] Baseline measurement complete. Exiting 0 as requested.');
    process.exit(0);
  } else {
    if (failedCount > 0) {
      console.log(`[VERDICT] ❌ Test suite detected ${failedCount} failures against specification.`);
      process.exit(1);
    } else {
      console.log('[VERDICT] 🎉 All E2E test assertions passed successfully!');
      process.exit(0);
    }
  }
}

function recordResult(results, item) {
  results.push(item);
  const mark = item.passed ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${item.tier} ${item.id} (${item.viewport}px): ${item.title}`);
  if (!item.passed) {
    console.log(`         └─ Cause: ${item.details}`);
  }
}

runTestSuite().catch(err => {
  console.error('[FATAL RUNNER ERROR]', err);
  process.exit(1);
});
