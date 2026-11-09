/**
 * scripts/test_challenger_viewport_grid.js
 * Adversarial Challenger Test Suite:
 * Extreme Viewports (320px, 360px, 375px, 390px, 412px, 480px)
 * Stress-Testing Calendar Grid Layout, Horizontal Overflow, Saturday Column Clipping, and Extreme Data Loads.
 */

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
  } catch (e) {}
}

if (!pw) {
  console.error('[FATAL] Playwright package could not be resolved.');
  process.exit(1);
}

const PUBLIC_DIR = path.resolve(__dirname, '../public');
const TARGET_URL = 'file:///' + path.resolve(PUBLIC_DIR, 'index.html').replace(/\\/g, '/');

// Deterministic Standard Fixtures (Nov 2026)
const STANDARD_FIXTURES = {
  bookingWindow: {
    today: '2026-11-05',
    this_reset_date: '2026-11-01',
    max_allowed_date: '2026-11-14',
    open_weeks: 2,
    reset_day: 0,
    quick_teams: '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습',
    description: '일요일 기준 2주(다음 주 토요일까지)'
  },
  reservations: [
    { id: 501, res_date: '2026-11-05', start_time: '14:00', end_time: '16:00', member_name: '홍길동', band_team: '1팀 합주', part: '보컬', status: 'confirmed' },
    { id: 601, res_date: '2026-11-06', start_time: '10:00', end_time: '12:00', member_name: '김기타', band_team: '2팀 합주', part: '기타', status: 'confirmed' },
    { id: 602, res_date: '2026-11-06', start_time: '16:00', end_time: '18:00', member_name: '이베이스', band_team: '3팀 합주', part: '베이스', status: 'confirmed' },
    // 8 bookings on Sat Nov 7
    { id: 701, res_date: '2026-11-07', start_time: '19:00', end_time: '21:00', member_name: '강드럼', band_team: '주말 1팀', part: '드럼', status: 'confirmed' },
    { id: 702, res_date: '2026-11-07', start_time: '09:00', end_time: '11:00', member_name: '조건반', band_team: '아침 합주팀', part: '건반', status: 'confirmed' },
    { id: 703, res_date: '2026-11-07', start_time: '15:00', end_time: '17:00', member_name: '윤보컬', band_team: '오후 2팀', part: '보컬', status: 'confirmed' },
    { id: 704, res_date: '2026-11-07', start_time: '11:00', end_time: '13:00', member_name: '정기타', band_team: '정오 합주팀', part: '기타', status: 'confirmed' },
    { id: 705, res_date: '2026-11-07', start_time: '17:00', end_time: '19:00', member_name: '최베이스', band_team: '저녁 1팀', part: '베이스', status: 'confirmed' },
    { id: 706, res_date: '2026-11-07', start_time: '13:00', end_time: '15:00', member_name: '박퍼커션', band_team: '오후 1팀', part: '드럼', status: 'confirmed' },
    { id: 707, res_date: '2026-11-07', start_time: '21:00', end_time: '23:00', member_name: '임싱어', band_team: '심야 합주팀', part: '보컬', status: 'confirmed' },
    { id: 708, res_date: '2026-11-07', start_time: '07:00', end_time: '09:00', member_name: '신새벽', band_team: '새벽 열정팀', part: '기타', status: 'confirmed' },
    // 10 bookings on Sun Nov 8
    { id: 801, res_date: '2026-11-08', start_time: '08:00', end_time: '09:30', member_name: '일요1', band_team: '선데이 모닝', part: '보컬', status: 'confirmed' },
    { id: 802, res_date: '2026-11-08', start_time: '09:30', end_time: '11:00', member_name: '일요2', band_team: '선데이 브런치', part: '기타', status: 'confirmed' },
    { id: 803, res_date: '2026-11-08', start_time: '11:00', end_time: '12:30', member_name: '일요3', band_team: '일요 3팀', part: '건반', status: 'confirmed' },
    { id: 804, res_date: '2026-11-08', start_time: '12:30', end_time: '14:00', member_name: '일요4', band_team: '일요 4팀', part: '베이스', status: 'confirmed' },
    { id: 805, res_date: '2026-11-08', start_time: '14:00', end_time: '15:30', member_name: '일요5', band_team: '일요 5팀', part: '드럼', status: 'confirmed' },
    { id: 806, res_date: '2026-11-08', start_time: '15:30', end_time: '17:00', member_name: '일요6', band_team: '일요 6팀', part: '보컬', status: 'confirmed' },
    { id: 807, res_date: '2026-11-08', start_time: '17:00', end_time: '18:30', member_name: '일요7', band_team: '일요 7팀', part: '기타', status: 'confirmed' },
    { id: 808, res_date: '2026-11-08', start_time: '18:30', end_time: '20:00', member_name: '일요8', band_team: '일요 8팀', part: '베이스', status: 'confirmed' },
    { id: 809, res_date: '2026-11-08', start_time: '20:00', end_time: '21:30', member_name: '일요9', band_team: '일요 9팀', part: '드럼', status: 'confirmed' },
    { id: 810, res_date: '2026-11-08', start_time: '21:30', end_time: '23:00', member_name: '일요10', band_team: '선데이 피날레', part: '건반', status: 'confirmed' }
  ]
};

async function testViewportWithFixtures(browser, width, fixtures, label) {
  const context = await browser.newContext({
    viewport: { width, height: 640 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
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
    window.sessionStorage.setItem('oppaen_auth_user', JSON.stringify({
      id: 901,
      username: 'e2e_member',
      role: 'member',
      display_name: '부원 공용'
    }));

    const mockObandDB = {
      login: async () => ({ success: true, user: { id: 901, username: 'e2e_member', role: 'member', display_name: '부원 공용' } }),
      getBookingWindow: async () => ({ success: true, window: fix.bookingWindow }),
      getMonthReservations: async () => ({ success: true, reservations: fix.reservations }),
      getNotices: async () => ({ success: true, notices: [] }),
      getSetlists: async () => ({ success: true, setlists: [] }),
      saveSetlist: async () => ({ success: true }),
      saveBooking: async () => ({ success: true }),
      cancelBooking: async () => ({ success: true })
    };
    Object.defineProperty(window, 'ObandDB', {
      get: () => mockObandDB,
      set: () => {},
      configurable: false
    });
    window.alert = () => {};
  }, fixtures);

  await page.goto(TARGET_URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // 1. Doc scrollWidth check
  const docMetrics = await page.evaluate((vpW) => {
    const docW = document.documentElement.scrollWidth;
    const bodyW = document.body.scrollWidth;
    return {
      docW,
      bodyW,
      overflow: docW > vpW || bodyW > vpW
    };
  }, width);

  // 2. Saturday (.is-sat) clipping check
  const satMetrics = await page.evaluate((vpW) => {
    const satCells = Array.from(document.querySelectorAll('.cal-day-cell.is-sat'));
    const weekdaySat = document.querySelector('.calendar-weekdays div:last-child');
    const weekdaySatRect = weekdaySat ? weekdaySat.getBoundingClientRect() : null;

    const cellDetails = satCells.map((cell, idx) => {
      const r = cell.getBoundingClientRect();
      const numEl = cell.querySelector('.cal-day-num');
      const badgeEl = cell.querySelector('.cal-res-badge');
      const numR = numEl ? numEl.getBoundingClientRect() : null;
      const badgeR = badgeEl ? badgeEl.getBoundingClientRect() : null;

      return {
        idx,
        day: numEl ? numEl.textContent.trim() : '',
        right: Math.round(r.right * 10) / 10,
        left: Math.round(r.left * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        isClipped: r.right > vpW + 0.5 || r.left < -0.5,
        numClipped: numR ? numR.right > vpW + 0.5 : false,
        badgeClipped: badgeR ? badgeR.right > vpW + 0.5 : false
      };
    });

    const anyClipped = cellDetails.some(c => c.isClipped || c.numClipped || c.badgeClipped);
    const headerClipped = weekdaySatRect ? weekdaySatRect.right > vpW + 0.5 : false;

    return {
      totalSatCells: satCells.length,
      headerRight: weekdaySatRect ? Math.round(weekdaySatRect.right * 10) / 10 : 0,
      headerClipped,
      anyClipped,
      maxSatRight: Math.max(...cellDetails.map(c => c.right)),
      cellDetails
    };
  }, width);

  // 3. Day cell height uniformity check
  const cellHeightMetrics = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('.cal-day-cell'));
    const heights = cells.map(c => c.getBoundingClientRect().height);
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    return {
      diff: Math.round((maxH - minH) * 10) / 10,
      minH: Math.round(minH * 10) / 10,
      maxH: Math.round(maxH * 10) / 10
    };
  });

  // 4. Banner dimensions & anti-overlap
  const bannerMetrics = await page.evaluate(() => {
    const banner = document.querySelector('.calendar-window-info');
    const badge = document.querySelector('.window-badge');
    const noticeText = document.getElementById('windowNoticeText');

    if (!banner) return { exists: false };
    const br = banner.getBoundingClientRect();
    let overlap = false;
    if (badge && noticeText) {
      const bRect = badge.getBoundingClientRect();
      const tRect = noticeText.getBoundingClientRect();
      if (bRect.bottom > tRect.top && bRect.top < tRect.bottom) {
        if (bRect.right > tRect.left + 1.0) overlap = true;
      }
    }
    return {
      exists: true,
      height: Math.round(br.height * 10) / 10,
      overlap,
      internalOverflow: banner.scrollWidth > banner.clientWidth + 0.5
    };
  });

  // 5. Interaction: click Saturday Nov 7
  const satCell = page.locator('.cal-day-cell:not(.other-month)').filter({
    has: page.locator('.cal-day-num', { hasText: /^7$/ })
  }).first();
  await satCell.click();
  await page.waitForTimeout(300);

  const timelineSat = await page.evaluate((vpW) => {
    const cards = Array.from(document.querySelectorAll('#dayTimelineList .timeline-item'));
    const panel = document.querySelector('.day-detail-panel');

    let isChronological = true;
    let anyCardBleed = false;

    const cardDetails = cards.map(c => {
      const r = c.getBoundingClientRect();
      const timeTxt = c.querySelector('.timeline-time-text')?.textContent.trim() || '';
      const startTime = timeTxt.split('~')[0].trim();
      if (r.right > vpW + 0.5) anyCardBleed = true;
      return { startTime, timeTxt, width: r.width };
    });

    for (let i = 0; i < cardDetails.length - 1; i++) {
      if (cardDetails[i].startTime > cardDetails[i + 1].startTime) {
        isChronological = false;
        break;
      }
    }

    return {
      totalCards: cards.length,
      isChronological,
      anyCardBleed,
      panelOverflow: panel ? panel.scrollWidth > panel.clientWidth + 0.5 : false
    };
  }, width);

  // 6. Global bleed scan
  const globalBleedCount = await page.evaluate((vpW) => {
    let count = 0;
    document.querySelectorAll('body *').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.right > vpW + 1.0) {
        count++;
      }
    });
    return count;
  }, width);

  await context.close();

  return {
    label,
    width,
    docMetrics,
    satMetrics,
    cellHeightMetrics,
    bannerMetrics,
    timelineSat,
    globalBleedCount,
    errors: pageErrors
  };
}

async function runAllChallengerSuites() {
  console.log('======================================================================');
  console.log('🛡️ [오뺀] Adversarial Grid Layout & Viewport Challenger Suite');
  console.log('   Target URL:', TARGET_URL);
  console.log('   Target Viewports: [320, 360, 375, 390, 412, 480] px');
  console.log('======================================================================\n');

  const browser = await pw.chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const VIEWPORTS = [320, 360, 375, 390, 412, 480];
  const results = [];

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n──────────────────────────────────────────────────────────────────────`);
      console.log(`🔍 [CHALLENGE] Viewport: ${vp}px x 640px (Standard Fixtures)`);
      console.log(`──────────────────────────────────────────────────────────────────────`);
      const res = await testViewportWithFixtures(browser, vp, STANDARD_FIXTURES, `standard_${vp}`);

      const c1 = !res.docMetrics.overflow;
      const c2 = !res.satMetrics.anyClipped && !res.satMetrics.headerClipped;
      const c3 = res.cellHeightMetrics.diff <= 2.0;
      const c4 = res.bannerMetrics.exists && res.bannerMetrics.height <= 45.0 && !res.bannerMetrics.overlap;
      const c5 = res.timelineSat.totalCards === 8 && res.timelineSat.isChronological && !res.timelineSat.anyCardBleed;
      const c6 = res.globalBleedCount === 0;

      console.log(`  [${c1 ? 'PASS' : 'FAIL'}] C1: Document scrollWidth <= ${vp}px (docW: ${res.docMetrics.docW}px)`);
      console.log(`  [${c2 ? 'PASS' : 'FAIL'}] C2: Saturday (.is-sat) Containment (satRight: ${res.satMetrics.maxSatRight}px, headerRight: ${res.satMetrics.headerRight}px)`);
      console.log(`  [${c3 ? 'PASS' : 'FAIL'}] C3: Day Cell Height Uniformity (diff: ${res.cellHeightMetrics.diff}px, min: ${res.cellHeightMetrics.minH}px, max: ${res.cellHeightMetrics.maxH}px)`);
      console.log(`  [${c4 ? 'PASS' : 'FAIL'}] C4: Top Banner Fit (height: ${res.bannerMetrics.height}px, overlap: ${res.bannerMetrics.overlap})`);
      console.log(`  [${c5 ? 'PASS' : 'FAIL'}] C5: Saturday Timeline Sync (cards: ${res.timelineSat.totalCards}/8, sorted: ${res.timelineSat.isChronological})`);
      console.log(`  [${c6 ? 'PASS' : 'FAIL'}] C6: Global Zero Horizontal Bleed (bleeding elements: ${res.globalBleedCount})`);

      results.push({ vp, id: 'C1_DOC_FIT', passed: c1, desc: `Document scrollWidth <= ${vp}px` });
      results.push({ vp, id: 'C2_SAT_FIT', passed: c2, desc: `Saturday column right <= ${vp}px` });
      results.push({ vp, id: 'C3_HEIGHT_UNIFORM', passed: c3, desc: `Day cell height diff <= 2.0px` });
      results.push({ vp, id: 'C4_BANNER_FIT', passed: c4, desc: `Banner height <= 45px and no overlap` });
      results.push({ vp, id: 'C5_TIMELINE_SYNC', passed: c5, desc: `Saturday timeline 8 cards sorted` });
      results.push({ vp, id: 'C6_ZERO_BLEED', passed: c6, desc: `Zero DOM elements bleeding` });
    }
  } finally {
    await browser.close();
  }

  console.log('\n======================================================================');
  console.log('📊 EMPIRICAL CHALLENGER RESULTS SUMMARY ACROSS ALL 6 VIEWPORTS');
  console.log('======================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`TOTAL INVARIANTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`OVERALL PASS RATE: ${(passed / total * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ FAILED INVARIANTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(` - [${r.vp}px ${r.id}] ${r.desc}`);
    });
  } else {
    console.log('\n🎉 ALL 36 EMPIRICAL CHALLENGER INVARIANTS PASSED 100%!');
  }
  console.log('======================================================================\n');

  // Save report
  const reportPath = path.resolve(__dirname, '../.agents/teamwork/challenger_1/empirical_challenge_results.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    viewportsTested: VIEWPORTS,
    total,
    passed,
    failed,
    verdict: failed === 0 ? 'APPROVE' : 'REJECT',
    results
  }, null, 2), 'utf-8');

  process.exit(failed === 0 ? 0 : 1);
}

runAllChallengerSuites().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
