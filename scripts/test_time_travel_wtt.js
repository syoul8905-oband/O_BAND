const path = require('path');
const pw = require('C:/Users/User/AppData/Local/Programs/Python/Python311/Lib/site-packages/playwright/driver/package');

async function main() {
  const browser = await pw.chromium.launch({
    channel: 'chrome',
    headless: true
  });
  
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 }
  });
  await context.addInitScript(() => {
    window.sessionStorage.setItem('oppaen_auth_user', JSON.stringify({
      id: 901,
      username: 'e2e_member',
      role: 'member',
      display_name: '부원 공용'
    }));
  });
  const page = await context.newPage();
  
  const basePath = 'file:///' + path.resolve(__dirname, '../public/index.html').replace(/\\/g, '/');
  
  console.log('=== TEST 1: Current Day (2026-11-06) ===');
  await page.goto(`${basePath}?test_date=2026-11-06`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  let banner = await page.innerText('#windowNoticeText');
  let is14Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("14"))', el => el.classList.contains('is-locked'));
  let is15Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("15"))', el => el.classList.contains('is-locked'));
  let hasWttBar = await page.isVisible('#wttTimeTravelBar');
  
  console.log('11/6 Banner:', banner);
  console.log('11/6 Day 14 locked:', is14Locked, '| Day 15 locked:', is15Locked, '| WTT bar visible:', hasWttBar);
  if (!banner.includes('~2026-11-14 오픈') || is14Locked || !is15Locked || !hasWttBar) {
    throw new Error('Test 1 Failed for 2026-11-06');
  }
  
  console.log('\n=== TEST 2: Saturday Before Reset (2026-11-07) ===');
  await page.goto(`${basePath}?test_date=2026-11-07`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  banner = await page.innerText('#windowNoticeText');
  is14Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("14"))', el => el.classList.contains('is-locked'));
  is15Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("15"))', el => el.classList.contains('is-locked'));
  console.log('11/7 Banner:', banner);
  console.log('11/7 Day 14 locked:', is14Locked, '| Day 15 locked:', is15Locked);
  if (!banner.includes('~2026-11-14 오픈') || is14Locked || !is15Locked) {
    throw new Error('Test 2 Failed for 2026-11-07');
  }
  
  console.log('\n=== TEST 3: Sunday 1st Reset Moment (2026-11-08) ===');
  await page.goto(`${basePath}?test_date=2026-11-08`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  banner = await page.innerText('#windowNoticeText');
  is14Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("14"))', el => el.classList.contains('is-locked'));
  is15Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("15"))', el => el.classList.contains('is-locked'));
  let is21Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("21"))', el => el.classList.contains('is-locked'));
  let is22Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("22"))', el => el.classList.contains('is-locked'));
  console.log('11/8 Banner:', banner);
  console.log('11/8 Day 14 locked:', is14Locked, '| Day 15 locked:', is15Locked, '| Day 21 locked:', is21Locked, '| Day 22 locked:', is22Locked);
  
  if (!banner.includes('~2026-11-21 오픈') || is14Locked || is15Locked || is21Locked || !is22Locked) {
    throw new Error('Test 3 Failed for 2026-11-08');
  }
  
  console.log('\n=== TEST 4: Sunday 2nd Reset Moment (2026-11-15) ===');
  await page.goto(`${basePath}?test_date=2026-11-15`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  banner = await page.innerText('#windowNoticeText');
  is21Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("21"))', el => el.classList.contains('is-locked'));
  is22Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("22"))', el => el.classList.contains('is-locked'));
  let is28Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("28"))', el => el.classList.contains('is-locked'));
  let is29Locked = await page.$eval('.cal-day-cell:has(.cal-day-num:text-is("29"))', el => el.classList.contains('is-locked'));
  console.log('11/15 Banner:', banner);
  console.log('11/15 Day 21 locked:', is21Locked, '| Day 22 locked:', is22Locked, '| Day 28 locked:', is28Locked, '| Day 29 locked:', is29Locked);
  
  if (!banner.includes('~2026-11-28 오픈') || is21Locked || is22Locked || is28Locked || !is29Locked) {
    throw new Error('Test 4 Failed for 2026-11-15');
  }
  
  console.log('\n=== TEST 5: Normal Mode (No test_date) ===');
  await page.goto(basePath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  hasWttBar = await page.isVisible('#wttTimeTravelBar');
  console.log('Normal mode WTT bar visible:', hasWttBar);
  if (hasWttBar) {
    throw new Error('WTT Bar should NOT be visible in normal mode without test_date!');
  }
  
  console.log('\n🎉 ALL 5 TIME-TRAVEL WTT SCENARIOS PASSED PERFECTLY!');
  await browser.close();
}

main().catch(err => {
  console.error('WTT TEST ERROR:', err);
  process.exit(1);
});
