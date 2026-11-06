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
  const page = await context.newPage();
  
  let dialogMessage = '';
  page.on('dialog', async dialog => {
    dialogMessage = dialog.message();
    console.log('[DIALOG INTERCEPTED]:', dialogMessage);
    await dialog.dismiss();
  });
  
  const filePath = 'file:///' + path.resolve(__dirname, '../public/index.html').replace(/\\/g, '/');
  console.log('Opening local file:', filePath);
  await page.goto(filePath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // 1. Verify Top Banner
  const bannerText = await page.innerText('#windowNoticeText');
  console.log('Banner Text:', bannerText);
  if (!bannerText.includes('~2026-11-14 오픈')) {
    throw new Error(`Expected banner to contain ~2026-11-14 오픈, got: ${bannerText}`);
  }
  
  // 2. Check Nov 14 and Nov 15 cells
  const cellStates = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('.cal-day-cell'));
    const results = {};
    for (const c of cells) {
      const numEl = c.querySelector('.cal-day-num');
      const headerEl = c.querySelector('.cal-day-header');
      if (numEl && headerEl) {
        const num = numEl.innerText.trim();
        if (num === '14' || num === '15') {
          const afterContent = window.getComputedStyle(headerEl, '::after').content;
          results[num] = {
            isLocked: c.classList.contains('is-locked'),
            afterContent: afterContent,
            hasLockPseudo: afterContent && afterContent !== 'none' && afterContent !== '""',
            text: c.innerText
          };
        }
      }
    }
    return results;
  });
  
  console.log('Cell States for 14 and 15:', JSON.stringify(cellStates, null, 2));
  
  if (cellStates['14'].isLocked) {
    throw new Error('Nov 14 should NOT be locked!');
  }
  if (!cellStates['15'].isLocked) {
    throw new Error('Nov 15 MUST BE LOCKED!');
  }
  if (!cellStates['15'].hasLockPseudo) {
    throw new Error('Nov 15 MUST HAVE A LOCK PSEUDO-ELEMENT!');
  }
  
  // 3. Click Nov 15 (Locked Day) -> MUST POP UP LOCK ALERT
  dialogMessage = '';
  const cells = await page.$$('.cal-day-cell');
  for (const c of cells) {
    const numEl = await c.$('.cal-day-num');
    if (numEl && (await numEl.innerText()).trim() === '15') {
      await c.click();
      break;
    }
  }
  await page.waitForTimeout(300);
  
  console.log('Alert text caught on clicking Nov 15:', dialogMessage);
  if (!dialogMessage.includes('아직 예약이 오픈되지 않은 기간')) {
    throw new Error(`Expected lock alert on Nov 15 click, but got: '${dialogMessage}'`);
  }
  if (!dialogMessage.includes('~ 2026-11-14까지')) {
    throw new Error(`Expected alert to show ~ 2026-11-14, got: '${dialogMessage}'`);
  }
  
  // 4. Click Nov 14 (Open Day) -> MUST NOT SHOW DIALOG, MUST SELECT
  dialogMessage = '';
  for (const c of cells) {
    const numEl = await c.$('.cal-day-num');
    if (numEl && (await numEl.innerText()).trim() === '14') {
      await c.click();
      break;
    }
  }
  await page.waitForTimeout(300);
  
  if (dialogMessage) {
    throw new Error(`Unexpected dialog on Nov 14 click: ${dialogMessage}`);
  }
  
  const nov14Selected = await page.$eval('.cal-day-cell.selected .cal-day-num', el => el.innerText.trim());
  const nov14Sub = await page.innerText('#selectedDateSub');
  const nov14BtnDisabled = await page.$eval('#btnBookSlot', b => b.disabled);
  console.log('Nov 14 Selected Day:', nov14Selected);
  console.log('Nov 14 Subtitle:', nov14Sub);
  console.log('Nov 14 Book Button Disabled:', nov14BtnDisabled);
  
  if (nov14Selected !== '14') {
    throw new Error(`Expected day 14 to be selected, got: ${nov14Selected}`);
  }
  if (!nov14Sub.includes('자유롭게 예약 가능')) {
    throw new Error('Nov 14 subtitle should indicate freely bookable!');
  }
  if (nov14BtnDisabled) {
    throw new Error('Nov 14 book button should NOT be disabled!');
  }
  
  console.log('🎉 ALL LOCAL UI LOCK ASSERTIONS PASSED PERFECTLY!');
  await browser.close();
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
