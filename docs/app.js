/**
 * 오늘부터 밴드부 (오뺀) - 모바일 전용 캘린더 & 합주실 예약 시스템
 */

const API_BASE = '';
let todayStr = getTodayString();
let selectedDate = todayStr;

// 캘린더 표시 상태 (한국 표준시 KST 또는 WTT 테스트 기준일)
const [initY, initM] = todayStr.split('-').map(Number);
let calYear = initY;
let calMonth = initM; // 1 ~ 12

// 데이터 캐시 (0초 즉시 렌더링 시에도 일요일 기준 2주 마감일을 즉시 계산하여 잠금 오작동 원천 차단)
let bookingWindow = {
  today: todayStr,
  max_allowed_date: calcMaxAllowedDate(todayStr, 2, 0),
  open_weeks: 2,
  reset_day: 0,
  quick_teams: '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습',
  description: ''
};
let monthReservations = [];

// 인증 및 권한 상태 (sessionStorage 전용: 브라우저 종료 시 자동 로그아웃)
const SAVED_CREDS_KEY = 'oppaen_saved_creds';
const SAVED_CREDS_CHK_KEY = 'oppaen_save_creds_checked';

function loadAuthSessionUser() {
  try {
    const raw = sessionStorage.getItem('oppaen_auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

let currentUser = loadAuthSessionUser();
let isAdmin = Boolean(currentUser && currentUser.role === 'admin');
let appInitialized = false;

function refreshAuthStateFromStorage() {
  currentUser = loadAuthSessionUser();
  isAdmin = Boolean(currentUser && currentUser.role === 'admin');
}

function prefillSavedCredentials() {
  const userEl = document.getElementById('loginUsername');
  const pwEl = document.getElementById('loginPassword');
  const chkEl = document.getElementById('chkSaveCreds');
  const errEl = document.getElementById('gateLoginError');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  try {
    const isSaved = localStorage.getItem(SAVED_CREDS_CHK_KEY) === 'true';
    const rawCreds = localStorage.getItem(SAVED_CREDS_KEY);
    if (isSaved && rawCreds) {
      const creds = JSON.parse(rawCreds);
      if (userEl) userEl.value = creds.username || '';
      if (pwEl) pwEl.value = creds.password || '';
      if (chkEl) chkEl.checked = true;
      return;
    }
  } catch (e) {}

  if (userEl) userEl.value = '';
  if (pwEl) pwEl.value = '';
  if (chkEl) chkEl.checked = false;
}

function showLoginGateScreen() {
  const gate = document.getElementById('loginGateScreen');
  const appContainer = document.getElementById('mainAppContainer');
  const wttBar = document.getElementById('wttTimeTravelBar');
  if (wttBar) wttBar.remove();
  if (appContainer) appContainer.style.display = 'none';
  if (gate) gate.style.display = 'flex';
  prefillSavedCredentials();
}

function toggleGatePasswordVisibility() {
  const pwEl = document.getElementById('loginPassword');
  const btnEl = document.querySelector('.pw-toggle-btn');
  if (!pwEl) return;
  if (pwEl.type === 'password') {
    pwEl.type = 'text';
    if (btnEl) btnEl.textContent = '🙈';
  } else {
    pwEl.type = 'password';
    if (btnEl) btnEl.textContent = '👁️';
  }
}

async function submitGateLogin(e) {
  e.preventDefault();
  const userEl = document.getElementById('loginUsername');
  const pwEl = document.getElementById('loginPassword');
  const chkEl = document.getElementById('chkSaveCreds');
  const errEl = document.getElementById('gateLoginError');
  const submitBtn = document.getElementById('btnGateLoginSubmit');

  const username = userEl ? userEl.value.trim() : '';
  const password = pwEl ? pwEl.value : '';
  const saveCreds = Boolean(chkEl && chkEl.checked);

  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 로그인 확인 중...';
  }

  try {
    if (!window.ObandDB) {
      throw new Error('데이터 연결 모듈이 준비되지 않았습니다.');
    }
    const result = await window.ObandDB.login(username, password);
    if (!result || !result.success) {
      if (errEl) {
        errEl.textContent = (result && result.message) || '아이디 또는 비밀번호가 일치하지 않습니다.';
        errEl.style.display = 'block';
      }
      return;
    }

    sessionStorage.setItem('oppaen_auth_user', JSON.stringify(result.user));
    currentUser = result.user;
    isAdmin = (result.user.role === 'admin');

    if (saveCreds) {
      localStorage.setItem(SAVED_CREDS_CHK_KEY, 'true');
      localStorage.setItem(SAVED_CREDS_KEY, JSON.stringify({ username, password }));
    } else {
      localStorage.removeItem(SAVED_CREDS_CHK_KEY);
      localStorage.removeItem(SAVED_CREDS_KEY);
    }

    await enterAuthenticatedApp();
  } catch (err) {
    if (errEl) {
      errEl.textContent = `로그인 중 오류가 발생했습니다: ${err.message}`;
      errEl.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '🔓 로그인';
    }
  }
}

function logoutAuthSession() {
  if (!confirm('로그아웃 하시겠습니까?')) return;

  stopRealtimeSync();
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
  lastMonthSyncAt = 0;

  sessionStorage.removeItem('oppaen_auth_user');
  currentUser = null;
  isAdmin = false;
  appInitialized = false;
  monthReservations = [];

  if (midnightWatcherTimer) {
    clearInterval(midnightWatcherTimer);
    midnightWatcherTimer = null;
  }
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }

  document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  const tl = document.getElementById('dayTimelineList');
  if (tl) tl.innerHTML = '';
  const nl = document.getElementById('noticeList');
  if (nl) nl.innerHTML = '';
  const sl = document.getElementById('setlistContainer');
  if (sl) sl.innerHTML = '';

  showLoginGateScreen();
}

function updateAdminHeaderUI() {
  refreshAuthStateFromStorage();
  const btnAdminHub = document.getElementById('btnOpenAdminHub');
  const memberBadge = document.getElementById('memberUserBadge');

  if (btnAdminHub) {
    btnAdminHub.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  if (memberBadge) {
    if (!isAdmin && currentUser) {
      memberBadge.style.display = 'inline-flex';
      memberBadge.textContent = `👤 ${currentUser.display_name || currentUser.username}`;
    } else {
      memberBadge.style.display = 'none';
    }
  }

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}

// 카카오톡 브라우저 감지 시 상단 안내 바 표출
function checkKakaoBanner() {
  const ua = navigator.userAgent || '';
  if (/KAKAOTALK/i.test(ua)) {
    const topBar = document.getElementById('kakaoTopNoticeBar');
    if (topBar) topBar.style.display = 'flex';
  }
}

// 상단 1초 앱 설치 배너 비활성화 (사용자 지시로 삭제 완료)
function checkPwaInstallBanner() {}

function dismissPwaBanner() {}

// WTT 타임머신 모드 컨트롤러 (?test_date= 활성화 시 표출)
function initTimeTravelWTTBar() {
  const params = new URLSearchParams(window.location.search);
  const testDate = params.get('test_date');
  if (!testDate) return;

  const existing = document.getElementById('wttTimeTravelBar');
  if (existing) existing.remove();

  const bar = document.createElement('div');
  bar.id = 'wttTimeTravelBar';
  bar.className = 'wtt-bar';
  bar.innerHTML = `
    <div class="wtt-bar-content">
      <div class="wtt-header">
        <span class="wtt-badge">🧪 WTT 타임머신</span>
        <span class="wtt-current-date">가상 기준일: <strong>${escapeHtml(testDate)}</strong></span>
        <button type="button" class="wtt-btn-exit" onclick="exitTimeTravelMode()">✕ 해제(현재로)</button>
      </div>
      <div class="wtt-quick-pills">
        <button type="button" class="wtt-pill ${testDate === '2026-11-06' ? 'is-active' : ''}" onclick="setTimeTravelDate('2026-11-06')">11/6(금 현재)</button>
        <button type="button" class="wtt-pill ${testDate === '2026-11-07' ? 'is-active' : ''}" onclick="setTimeTravelDate('2026-11-07')">11/7(토 마감)</button>
        <button type="button" class="wtt-pill ${testDate === '2026-11-08' ? 'is-active' : ''}" onclick="setTimeTravelDate('2026-11-08')">11/8(일 1차리셋)</button>
        <button type="button" class="wtt-pill ${testDate === '2026-11-15' ? 'is-active' : ''}" onclick="setTimeTravelDate('2026-11-15')">11/15(일 2차리셋)</button>
        <button type="button" class="wtt-pill" onclick="promptCustomDate()">📅 날짜선택</button>
      </div>
    </div>
  `;
  document.body.appendChild(bar);
}

function setTimeTravelDate(dateStr) {
  const url = new URL(window.location.href);
  url.searchParams.set('test_date', dateStr);
  window.location.href = url.toString();
}

function exitTimeTravelMode() {
  const url = new URL(window.location.href);
  url.searchParams.delete('test_date');
  window.location.href = url.pathname;
}

function promptCustomDate() {
  const val = prompt('테스트할 기준일자를 입력하세요 (형식: YYYY-MM-DD):', getTodayString());
  if (val && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    setTimeTravelDate(val.trim());
  }
}

async function enterAuthenticatedApp() {
  refreshAuthStateFromStorage();
  const gate = document.getElementById('loginGateScreen');
  const appContainer = document.getElementById('mainAppContainer');
  if (gate) gate.style.display = 'none';
  if (appContainer) appContainer.style.display = 'flex';

  initTimeTravelWTTBar();
  updateAdminHeaderUI();

  if (!appInitialized) {
    appInitialized = true;
    initCalendarSwipe();
    initSleepModeTracker();
  }
  initMidnightResetWatcher();
  initServerKeepAlive();

  // 1. 달력 및 오늘 현황 즉시 동기 렌더링
  renderCalendar();
  renderDayTimeline(selectedDate);
  refreshTimeSlotsForDate(selectedDate);
  renderTeamQuickChips();

  // 2. 비동기 데이터 로드 및 달력 실시간 업데이트
  await loadBookingWindow();
  await loadMonthData(calYear, calMonth);
  renderCalendar();
  renderDayTimeline(selectedDate);

  // 3. 실시간 Broadcast 동기화 시작 및 기타 탭 데이터 백그라운드 프리로드
  startRealtimeSync();
  loadNotices();
  loadSetlists();
}

// 앱 시작 즉시 초기화 (로그인 게이트 우선 검사)
document.addEventListener('DOMContentLoaded', async () => {
  try {
    checkKakaoBanner();
    checkPwaInstallBanner();
    refreshAuthStateFromStorage();

    if (currentUser && currentUser.username) {
      await enterAuthenticatedApp();
    } else {
      showLoginGateScreen();
    }
  } catch (err) {
    console.error('초기 로딩 중 오류 발생:', err);
    if (currentUser && currentUser.username) {
      renderCalendar();
      renderDayTimeline(selectedDate);
    } else {
      showLoginGateScreen();
    }
  }
});

function initTimeOptions() {
  refreshTimeSlotsForDate(selectedDate);
}

// 달력 모바일 좌우 터치 슬라이드 (Swipe Gesture)
function initCalendarSwipe() {
  const calCard = document.querySelector('.calendar-card');
  if (!calCard) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  calCard.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  calCard.addEventListener('touchend', (e) => {
    if (e.changedTouches.length !== 1) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const elapsed = Date.now() - touchStartTime;

    const diffX = endX - touchStartX;
    const diffY = endY - touchStartY;

    // 수평 이동 거리가 50px 이상이고, 수평 이동이 수직 이동의 1.3배 이상이며 600ms 이내 스와이프인 경우
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.3 && elapsed < 600) {
      if (diffX < 0) {
        // 오른쪽 -> 왼쪽: 다음 달 (▶)
        changeMonth(1);
      } else {
        // 왼쪽 -> 오른쪽: 이전 달 (◀)
        changeMonth(-1);
      }
    }
  }, { passive: true });
}

// 날짜 헬퍼 (한국 표준시 KST UTC+9 기준 고정 / WTT ?test_date= 지원)
function getTodayString() {
  const params = new URLSearchParams(window.location.search);
  const mockDate = params.get('test_date');
  if (mockDate && /^\d{4}-\d{2}-\d{2}$/.test(mockDate.trim())) {
    return mockDate.trim();
  }
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 일요일(resetDay=0) 00:00 기준 예약 허용 마감일(다음 주 토요일) 로컬 즉시 계산
function calcMaxAllowedDate(baseDateStr, openWeeks = 2, resetDay = 0) {
  const [y, m, d] = baseDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jsDay = dt.getUTCDay(); // 0: 일요일 ~ 6: 토요일
  const daysSinceReset = (jsDay - Number(resetDay) + 7) % 7;
  const maxDt = new Date(Date.UTC(y, m - 1, d - daysSinceReset + (Number(openWeeks) * 7) - 1));
  const my = maxDt.getUTCFullYear();
  const mm = String(maxDt.getUTCMonth() + 1).padStart(2, '0');
  const md = String(maxDt.getUTCDate()).padStart(2, '0');
  return `${my}-${mm}-${md}`;
}

// 매주 일요일 00:00:00 정각 실시간 자동 오픈 감시자 (새로고침 없이도 0시 정각 즉시 잠금 해제)
let midnightWatcherTimer = null;

async function checkAndApplyMidnightRollover() {
  const currentToday = getTodayString();
  if (currentToday !== todayStr) {
    const prevMax = bookingWindow.max_allowed_date;
    todayStr = currentToday;
    bookingWindow.today = currentToday;
    bookingWindow.max_allowed_date = calcMaxAllowedDate(
      currentToday,
      bookingWindow.open_weeks || 2,
      bookingWindow.reset_day || 0
    );

    // 즉시 화면 잠금 해제 반영 후 서버 설정 동기화
    renderCalendar();
    renderDayTimeline(selectedDate);
    await loadBookingWindow();
    renderCalendar();
    renderDayTimeline(selectedDate);

    if (bookingWindow.max_allowed_date > prevMax) {
      showToast(`🎉 일요일 0시 정각! 새로운 예약 가능 날짜(~${bookingWindow.max_allowed_date})가 오픈되었습니다!`);
    }
    return true;
  }
  return false;
}

let isLifecycleSyncListenersBound = false;

function initMidnightResetWatcher() {
  if (midnightWatcherTimer) clearInterval(midnightWatcherTimer);
  midnightWatcherTimer = setInterval(() => {
    if (!isSleeping && currentUser) {
      checkAndApplyMidnightRollover();
    }
  }, 1000);

  if (isLifecycleSyncListenersBound) return;
  isLifecycleSyncListenersBound = true;

  const onAppForeground = () => {
    if (!currentUser || isSleeping) return;
    checkAndApplyMidnightRollover();
    if (Date.now() - lastMonthSyncAt > 3500) {
      syncLiveAppData({ source: 'focus', silent: true });
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      onAppForeground();
    }
  });
  window.addEventListener('focus', onAppForeground);
}

function formatDateDisplay(dateStr) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const dayName = days[d.getDay()];
  return {
    full: `${month}월 ${date}일 (${dayName})`,
    year: d.getFullYear(),
    month: month,
    dayNum: date,
    dayName: dayName,
    dayOfWeek: d.getDay()
  };
}

// 1. 예약 윈도우 규칙 불러오기
function getNextResetDateStr() {
  const [y, m, d] = getTodayString().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0(일) ~ 6(토)
  const diff = day === 0 ? 7 : (7 - day);
  const nextSun = new Date(Date.UTC(y, m - 1, d + diff));
  const mm = String(nextSun.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(nextSun.getUTCDate()).padStart(2, '0');
  return `${mm}월 ${dd}일(일) 00:00`;
}

async function loadBookingWindow() {
  try {
    let data;
    if (window.ObandDB) {
      data = await window.ObandDB.getBookingWindow();
    } else {
      const res = await fetch(`${API_BASE}/api/settings`);
      data = await res.json();
    }
    if (data.success && data.window) {
      bookingWindow = data.window;
      renderTeamQuickChips();
      initKakaoSDK();
      const noticeEl = document.getElementById('windowNoticeText');
      if (noticeEl) {
        if (isAdmin) {
          noticeEl.innerHTML = `👑 <strong>관리자</strong>: 모든 날짜 선예약 가능 · <span style="text-decoration:underline; cursor:pointer; color:var(--accent-cyan);" onclick="openAdminHubModal('tab-settings')">⚙️ 기간설정</span>`;
        } else {
          const nextReset = getNextResetDateStr();
          noticeEl.textContent = `현재 ~${bookingWindow.max_allowed_date} 오픈 (다음: ${nextReset})`;
        }
      }
    }
  } catch (err) {
    console.warn('설정 로드 실패, 기본값 사용:', err);
  }
}

// 2. 월간 예약 데이터 불러오기 & 실시간 다중 기기 동기화 엔진
let lastMonthSyncAt = 0;
let monthFetchSeq = 0;
let syncDebounceTimer = null;
let isSyncInFlight = false;
let pendingSyncOpts = null;

async function loadMonthData(year, month) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const mySeq = ++monthFetchSeq;
  try {
    if (window.ObandDB) {
      const data = await window.ObandDB.getMonthReservations(year, month);
      if (data.success && mySeq === monthFetchSeq) {
        monthReservations = data.reservations || [];
        lastMonthSyncAt = Date.now();
      }
    } else {
      const res = await fetch(`${API_BASE}/api/reservations?month=${monthStr}`);
      const data = await res.json();
      if (data.success && mySeq === monthFetchSeq) {
        monthReservations = data.reservations || [];
        lastMonthSyncAt = Date.now();
      }
    }
  } catch (err) {
    console.error('월간 예약 로드 실패:', err);
  }
}

function updateConnectionStatusBadge(connected) {
  const textEl = document.getElementById('statusText');
  if (textEl) {
    textEl.textContent = connected ? '실시간' : 'LTE/5G';
  }
}

function syncOpenBookingModalNonDestructive() {
  const modal = document.getElementById('bookingModal');
  if (!modal || !modal.classList.contains('active')) return;

  const modalDateEl = document.getElementById('bookDate');
  const startSelect = document.getElementById('bookStartTime');
  const endSelect = document.getElementById('bookEndTime');
  const modalDate = modalDateEl ? modalDateEl.value : selectedDate;
  if (!modalDate || !startSelect || !endSelect) return;

  const prevStart = startSelect.value;
  const prevEnd = endSelect.value;

  refreshTimeSlotsForDate(modalDate);

  let conflictDetected = false;
  const startOpt = prevStart
    ? Array.from(startSelect.options).find(o => o.value === prevStart && !o.disabled)
    : null;

  if (startOpt) {
    startSelect.value = prevStart;
    updateEndTimeOptions();
    const endOpt = prevEnd
      ? Array.from(endSelect.options).find(o => o.value === prevEnd && !o.disabled)
      : null;
    if (endOpt) {
      endSelect.value = prevEnd;
    } else if (prevEnd) {
      conflictDetected = true;
    }
  } else if (prevStart) {
    conflictDetected = true;
  }

  validateSelectedTimeRange();

  if (conflictDetected) {
    const msgEl = document.getElementById('timeValidationMessage');
    if (msgEl) {
      msgEl.style.color = '#f87171';
      msgEl.textContent = '⚠️ 방금 다른 부원이 선택한 시간대를 먼저 예약했습니다! 빈 시간대를 다시 선택해 주세요.';
    }
    showToast('⚠️ 방금 다른 부원이 해당 시간대를 먼저 예약했습니다.\n시간대를 다시 선택해 주세요!');
  }
}

function buildRemoteSyncToast(ev) {
  if (!ev || ev.kind !== 'reservation') return '';
  const dateLabel = ev.res_date ? ev.res_date.slice(5).replace('-', '/') : '';
  const timeLabel = ev.start_time ? ` ${ev.start_time}` : '';
  if (ev.action === 'create') {
    return `🔄 실시간 반영: ${dateLabel}${timeLabel} 새 예약이 등록되었습니다.`;
  }
  if (ev.action === 'update') {
    return `🔄 실시간 반영: ${dateLabel}${timeLabel} 예약이 수정되었습니다.`;
  }
  if (ev.action === 'cancel') {
    return `🔄 실시간 반영: ${dateLabel}${timeLabel} 예약이 취소되었습니다.`;
  }
  return '🔄 실시간 예약 일정이 업데이트되었습니다.';
}

async function syncLiveAppData(opts = {}) {
  if (!currentUser || isSleeping) return;
  if (isSyncInFlight) {
    pendingSyncOpts = opts;
    return;
  }
  isSyncInFlight = true;
  try {
    const source = opts.source || 'remote';
    if (source === 'config' || source === 'focus' || source === 'reconnected') {
      await loadBookingWindow();
    }
    if (source === 'notice') {
      await loadNotices();
    } else if (source === 'setlist') {
      await loadSetlists();
    } else {
      await loadMonthData(calYear, calMonth);
      renderCalendar();
      renderDayTimeline(selectedDate);
      syncOpenBookingModalNonDestructive();
    }

    if (!opts.silent && opts.notifyText) {
      showToast(opts.notifyText);
    }
  } catch (err) {
    console.warn('[LiveSync] 동기화 실패:', err);
  } finally {
    isSyncInFlight = false;
    if (pendingSyncOpts) {
      const nextOpts = pendingSyncOpts;
      pendingSyncOpts = null;
      syncLiveAppData(nextOpts);
    }
  }
}

function handleRealtimeSyncEvent(ev) {
  if (!currentUser || isSleeping || !ev) return;
  if (ev.kind === 'reservation') {
    const activePrefix = `${calYear}-${String(calMonth).padStart(2, '0')}`;
    if (ev.month && ev.month !== activePrefix) {
      const notice = buildRemoteSyncToast(ev);
      if (notice) showToast(notice);
      return;
    }
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      syncLiveAppData({
        source: 'reservation',
        silent: false,
        notifyText: buildRemoteSyncToast(ev)
      });
    }, 80);
  } else if (ev.kind === 'notice') {
    syncLiveAppData({ source: 'notice', silent: false, notifyText: '📢 공지사항이 실시간 업데이트되었습니다.' });
  } else if (ev.kind === 'setlist') {
    syncLiveAppData({ source: 'setlist', silent: false, notifyText: '🎵 합주곡 목록이 실시간 업데이트되었습니다.' });
  } else if (ev.kind === 'config') {
    syncLiveAppData({ source: 'config', silent: false, notifyText: '⚙️ 예약 운영 설정이 실시간 반영되었습니다.' });
  } else if (ev.kind === 'reconnected') {
    syncLiveAppData({ source: 'reconnected', silent: true });
  }
}

function startRealtimeSync() {
  if (!currentUser || !window.ObandDB || typeof window.ObandDB.connectRealtime !== 'function') {
    return;
  }
  window.ObandDB.connectRealtime(handleRealtimeSyncEvent, updateConnectionStatusBadge);
}

function stopRealtimeSync() {
  if (window.ObandDB && typeof window.ObandDB.disconnectRealtime === 'function') {
    window.ObandDB.disconnectRealtime();
  }
  updateConnectionStatusBadge(false);
}

// 3. 월간 캘린더 그리드 렌더링
function renderCalendar() {
  document.getElementById('calMonthTitle').textContent = `${calYear}년 ${calMonth}월`;

  const container = document.getElementById('calDaysGrid');
  container.innerHTML = '';

  const firstDayOfMonth = new Date(calYear, calMonth - 1, 1).getDay(); // 0(일) ~ 6(토)
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth - 1, 0).getDate();

  // (1) 이전 달 날짜 채우기
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const prevMonthDate = new Date(calYear, calMonth - 2, dayNum);
    const dateStr = formatDateToStr(prevMonthDate);
    container.appendChild(createDayCell(dayNum, dateStr, true));
  }

  // (2) 이번 달 날짜 채우기
  for (let d = 1; d <= daysInMonth; d++) {
    const thisDate = new Date(calYear, calMonth - 1, d);
    const dateStr = formatDateToStr(thisDate);
    container.appendChild(createDayCell(d, dateStr, false));
  }

  // (3) 다음 달 날짜 채우기 (달력 7열 정렬용)
  const totalRendered = firstDayOfMonth + daysInMonth;
  const remainingCells = (7 - (totalRendered % 7)) % 7;
  for (let d = 1; d <= remainingCells; d++) {
    const nextMonthDate = new Date(calYear, calMonth, d);
    const dateStr = formatDateToStr(nextMonthDate);
    container.appendChild(createDayCell(d, dateStr, true));
  }
}

function formatDateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 달력 날짜 셀 엘리먼트 생성
function createDayCell(dayNum, dateStr, isOtherMonth) {
  const cell = document.createElement('div');
  cell.className = 'cal-day-cell';

  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 0) cell.classList.add('is-sun');
  if (dayOfWeek === 6) cell.classList.add('is-sat');
  if (isOtherMonth) cell.classList.add('other-month');
  if (dateStr === todayStr) cell.classList.add('is-today');
  if (dateStr === selectedDate) cell.classList.add('selected');

  // 기간 조건: 지난 날짜인가?
  const isPast = dateStr < todayStr;
  if (isPast) cell.classList.add('is-past');

  // 기간 조건: 예약 허용 범위(일요일 기준 2주 토요일까지)를 초과한 잠금 날짜인가?
  const isLocked = dateStr > bookingWindow.max_allowed_date;
  if (isLocked) cell.classList.add('is-locked');

  // 날짜 헤더
  const header = document.createElement('div');
  header.className = 'cal-day-header';
  header.innerHTML = `<span class="cal-day-num">${dayNum}</span>`;
  cell.appendChild(header);

  // 당일 예약 현황 컴팩트 인디케이터 (도트 + 건수 배지)
  const dayRes = monthReservations.filter(r => r.res_date === dateStr && r.status !== 'cancelled');
  const resContainer = document.createElement('div');
  resContainer.className = 'cal-res-container';

  if (dayRes.length > 0) {
    const badge = document.createElement('div');
    badge.className = 'cal-res-pill cal-res-badge';
    if (dayRes.length >= 3) {
      badge.classList.add('is-heavy');
    }
    badge.innerHTML = `<span class="badge-dot"></span><span class="badge-num">${dayRes.length}건</span>`;
    resContainer.appendChild(badge);
  }

  cell.appendChild(resContainer);

  // 셀 클릭 이벤트
  cell.onclick = async () => {
    // 0시 정각 자정 경과 즉시 감지 및 잠금 실시간 해제
    if (getTodayString() !== todayStr) {
      await checkAndApplyMidnightRollover();
    }
    const nowLocked = dateStr > bookingWindow.max_allowed_date;
    if (nowLocked) {
      if (isAdmin) {
        // 관리자 모드 가동 시 잠긴 날짜 프리패스 선택 허용
        console.log(`[Admin Bypass] 잠긴 날짜(${dateStr}) 관리자 권한 선택`);
      } else {
        alert(`🔒 아직 예약이 오픈되지 않은 기간입니다.\n\n매주 일요일 0시에 다음 주 예약이 오픈됩니다!\n(현재 예약 가능 기간: ~ ${bookingWindow.max_allowed_date}까지)`);
        return;
      }
    }
    selectedDate = dateStr;
    document.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    renderDayTimeline(dateStr);
  };

  return cell;
}

// 달 변경
async function changeMonth(delta) {
  calMonth += delta;
  if (calMonth > 12) {
    calMonth = 1;
    calYear++;
  } else if (calMonth < 1) {
    calMonth = 12;
    calYear--;
  }
  await loadMonthData(calYear, calMonth);
  const activePrefix = `${calYear}-${String(calMonth).padStart(2, '0')}`;
  if (!selectedDate.startsWith(activePrefix)) {
    selectedDate = `${activePrefix}-01`;
  }
  renderCalendar();
  renderDayTimeline(selectedDate);
}

async function goToToday() {
  todayStr = getTodayString();
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  calYear = kst.getUTCFullYear();
  calMonth = kst.getUTCMonth() + 1;
  selectedDate = todayStr;
  await loadBookingWindow();
  await loadMonthData(calYear, calMonth);
  renderCalendar();
  renderDayTimeline(selectedDate);
}

// 4. 선택된 날짜 상세 타임라인 렌더링
function renderDayTimeline(dateStr) {
  const info = formatDateDisplay(dateStr);
  const dayRes = monthReservations.filter(r => r.res_date === dateStr && r.status !== 'cancelled');
  dayRes.sort((a, b) => a.start_time.localeCompare(b.start_time));

  const titleEl = document.getElementById('selectedDateTitle');
  if (titleEl) {
    titleEl.innerHTML = `
      <span class="day-date-text">📅 ${escapeHtml(info.full)}</span>
      ${dayRes.length > 0
        ? `<span class="day-count-badge">총 ${dayRes.length}건</span>`
        : `<span class="day-count-badge is-empty">합주 현황</span>`}
    `;
  }
  
  const isLocked = dateStr > bookingWindow.max_allowed_date;
  const isPast = dateStr < todayStr;
  const btnBook = document.getElementById('btnBookSlot');

  if (isLocked) {
    if (isAdmin) {
      document.getElementById('selectedDateSub').innerHTML = `<span style="color:#fbbf24; font-weight:800;">👑 [관리자 권한] 미오픈 날짜 선예약/스케줄 등록 가능</span>`;
      btnBook.disabled = false;
    } else {
      document.getElementById('selectedDateSub').innerHTML = `<span style="color:#f87171;">🔒 미오픈 (매주 일요일에 다음 주 순차 오픈)</span>`;
      btnBook.disabled = true;
    }
  } else if (isPast) {
    if (isAdmin) {
      document.getElementById('selectedDateSub').innerHTML = `<span style="color:#fbbf24;">👑 [관리자 권한] 지난 일정 관리</span>`;
      btnBook.disabled = false;
    } else {
      document.getElementById('selectedDateSub').innerHTML = `<span style="color:var(--text-dim);">지난 일정입니다</span>`;
      btnBook.disabled = true;
    }
  } else {
    document.getElementById('selectedDateSub').innerHTML = `<span style="color:var(--success);">✨ 원하는 시간에 자유롭게 예약 가능</span>`;
    btnBook.disabled = false;
  }

  const listEl = document.getElementById('dayTimelineList');

  if (dayRes.length === 0) {
    let emptyHint = '';
    if (isAdmin) {
      emptyHint = '<span style="color:#fbbf24;">[+ 합주 예약] 버튼을 눌러 관리자 선예약을 등록할 수 있습니다.</span>';
    } else if (isLocked) {
      emptyHint = '<span style="color:#f87171;">🔒 매주 일요일에 예약이 순차 오픈됩니다.</span>';
    } else if (!isPast) {
      emptyHint = '<span style="color:#c084fc;">[+ 합주 예약] 버튼을 눌러 먼저 예약해 보세요!</span>';
    }

    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎵</div>
        <div class="empty-text">
          등록된 합주 예약이 없습니다.<br>
          ${emptyHint}
        </div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = dayRes.map(r => `
    <div class="timeline-item">
      <div class="timeline-top-row">
        <div class="timeline-time-badge">
          <span class="timeline-clock-icon">⏰</span>
          <span class="timeline-time-text">${r.start_time} ~ ${r.end_time}</span>
        </div>
        <span class="badge-team">${escapeHtml(r.band_team || '전체합주')}</span>
      </div>
      <div class="timeline-bottom-row">
        <div class="timeline-member">
          <span class="timeline-user-icon">👤</span>
          <span class="timeline-user-name">${escapeHtml(r.member_name)} 님 예약</span>
        </div>
        <div class="timeline-actions">
          <button type="button" class="btn-share-icon" onclick="shareReservationById(${r.id})">
            💬 공유
          </button>
          <button type="button" class="btn-edit-res" onclick="openEditBookingModal(${r.id})">
            ✏️ 수정
          </button>
          ${isAdmin ? `
            <button class="btn-force-cancel" onclick="adminForceCancel(${r.id}, '${r.start_time}~${r.end_time}', '${escapeHtml(r.member_name)}')">
              👑 강제취소
            </button>
          ` : `
            <button class="btn-cancel-res" onclick="openCancelModal(${r.id}, '${r.start_time}~${r.end_time}', '${escapeHtml(r.member_name)}')">
              취소
            </button>
          `}
        </div>
      </div>
      ${r.purpose ? `<div class="timeline-sub">💡 ${escapeHtml(r.purpose)}</div>` : ''}
    </div>
  `).join('');
}

// 5. 스마트 시간대 생성 및 예약 마감 자동 차단 시스템
let currentDayBookings = [];

function onBookingDateChange() {
  const dateVal = document.getElementById('bookDate').value;
  if (dateVal) {
    refreshTimeSlotsForDate(dateVal);
  }
}

function refreshTimeSlotsForDate(targetDate) {
  const alertBox = document.getElementById('modalBookedSlotsAlert');
  const startSelect = document.getElementById('bookStartTime');
  const endSelect = document.getElementById('bookEndTime');
  if (!startSelect || !endSelect) return;

  // 당일 예약 건수 조회 (확정 건만, 수정 모드일 때는 수정 중인 본인 예약 제외하여 시간 재선택 허용)
  const editIdEl = document.getElementById('editBookingId');
  const editingId = (editIdEl && editIdEl.value) ? Number(editIdEl.value) : 0;
  currentDayBookings = monthReservations.filter(
    r => r.res_date === targetDate && r.status === 'confirmed' && Number(r.id) !== editingId
  );
  currentDayBookings.sort((a, b) => a.start_time.localeCompare(b.start_time));

  // 상단 예약 완료 알림 박스 표출
  if (alertBox) {
    if (currentDayBookings.length === 0) {
      alertBox.style.background = 'rgba(16, 185, 129, 0.1)';
      alertBox.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      alertBox.innerHTML = '<span style="color:var(--success); font-weight:800;">✨ 전 시간대(06:00 ~ 24:00) 예약 가능</span>';
    } else {
      alertBox.style.background = 'rgba(239, 68, 68, 0.12)';
      alertBox.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      const listHtml = currentDayBookings.map(b => 
        `<div>🚫 <strong>${b.start_time} ~ ${b.end_time}</strong> [${escapeHtml(b.band_team)}] ${escapeHtml(b.member_name)}</div>`
      ).join('');
      alertBox.innerHTML = `
        <div style="color:#f87171; font-weight:800; margin-bottom:4px;">⚠️ 이미 예약된 시간대 (선택 불가):</div>
        <div style="font-size:11px; color:#e2e8f0; line-height:1.6;">${listHtml}</div>
      `;
    }
  }

  // 1) 시작 시간 옵션 채우기 (06:00 ~ 23:30, 30분 단위)
  startSelect.innerHTML = '';
  let firstAvailableStart = null;

  for (let h = 6; h <= 23; h++) {
    ['00', '30'].forEach(m => {
      const timeStr = `${String(h).padStart(2, '0')}:${m}`;
      // 해당 시간이 기존 예약 구간에 포함되는지 확인: b.start_time <= time < b.end_time
      const isBooked = currentDayBookings.some(b => b.start_time <= timeStr && timeStr < b.end_time);

      const opt = document.createElement('option');
      opt.value = timeStr;
      if (isBooked) {
        opt.disabled = true;
        opt.textContent = `${timeStr} (❌ 마감)`;
        opt.style.color = '#64748b';
        opt.style.background = '#1e293b';
      } else {
        opt.textContent = timeStr;
        if (!firstAvailableStart) {
          firstAvailableStart = timeStr;
        }
      }
      startSelect.appendChild(opt);
    });
  }

  // 기본 시작 시간 설정 (18:00이 가능하면 18:00, 안 되면 첫 번째 가능한 시간)
  if (Array.from(startSelect.options).some(o => o.value === '18:00' && !o.disabled)) {
    startSelect.value = '18:00';
  } else if (firstAvailableStart) {
    startSelect.value = firstAvailableStart;
  }

  // 2) 종료 시간 옵션 갱신
  updateEndTimeOptions();
}

function onStartTimeChange() {
  updateEndTimeOptions();
}

function updateEndTimeOptions() {
  const startSelect = document.getElementById('bookStartTime');
  const endSelect = document.getElementById('bookEndTime');
  if (!startSelect || !endSelect) return;

  const startVal = startSelect.value;
  if (!startVal) return;

  // 시작 시간 이후에 존재하는 가장 빠른 예약 찾기 (마감 상한선)
  const nextBooking = currentDayBookings.find(b => b.start_time > startVal);
  const maxAllowedEnd = nextBooking ? nextBooking.start_time : '24:00';

  endSelect.innerHTML = '';
  const [sh, sm] = startVal.split(':').map(Number);
  const startMinutes = sh * 60 + sm;

  let defaultEndVal = null;
  const targetEndMins = startMinutes + 120; // 기본 2시간

  for (let mins = startMinutes + 30; mins <= 24 * 60; mins += 30) {
    const eh = Math.floor(mins / 60);
    const em = mins % 60;
    const timeStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

    const opt = document.createElement('option');
    opt.value = timeStr;

    // 상한선(다음 예약 시작 시간)을 초과하는 종료 시간은 비활성화
    if (timeStr > maxAllowedEnd) {
      opt.disabled = true;
      opt.textContent = `${timeStr} (❌ ${nextBooking.band_team} 예약과 겹침)`;
      opt.style.color = '#64748b';
      opt.style.background = '#1e293b';
    } else {
      opt.textContent = timeStr;
      if (!defaultEndVal) {
        defaultEndVal = timeStr;
      }
      if (mins === targetEndMins && timeStr <= maxAllowedEnd) {
        defaultEndVal = timeStr;
      }
    }
    endSelect.appendChild(opt);
  }

  if (defaultEndVal) {
    endSelect.value = defaultEndVal;
  }

  validateSelectedTimeRange();
}

function validateSelectedTimeRange() {
  const start = document.getElementById('bookStartTime').value;
  const end = document.getElementById('bookEndTime').value;
  const msgEl = document.getElementById('timeValidationMessage');
  const btnSubmit = document.getElementById('btnSubmitBooking');

  if (!start || !end) return;

  if (start >= end) {
    if (msgEl) {
      msgEl.style.color = '#f87171';
      msgEl.textContent = '❌ 종료 시간은 시작 시간보다 늦어야 합니다.';
    }
    if (btnSubmit) btnSubmit.disabled = true;
    return;
  }

  // 중복 겹침 정밀 검사
  const conflict = currentDayBookings.find(b => !(b.end_time <= start || b.start_time >= end));
  if (conflict) {
    if (msgEl) {
      msgEl.style.color = '#f87171';
      msgEl.textContent = `❌ 선택하신 시간대(${start}~${end})에 기존 예약(${conflict.start_time}~${conflict.end_time} [${conflict.band_team}])이 포함되어 선택할 수 없습니다!`;
    }
    if (btnSubmit) btnSubmit.disabled = true;
    return;
  }

  // 정상
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
  const hours = durationMinutes / 60;

  if (msgEl) {
    msgEl.style.color = 'var(--success)';
    msgEl.textContent = `✅ ${hours}시간 합주 예약 가능 (${start} ~ ${end})`;
  }
  if (btnSubmit) btnSubmit.disabled = false;
}

function setQuickDuration(minutes) {
  const startStr = document.getElementById('bookStartTime').value;
  if (!startStr) return;

  const [sh, sm] = startStr.split(':').map(Number);
  const totalMins = sh * 60 + sm + minutes;

  const eh = Math.min(24, Math.floor(totalMins / 60));
  const em = totalMins % 60;
  const endStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

  const endSelect = document.getElementById('bookEndTime');
  // 다음 예약 상한선 체크
  const nextBooking = currentDayBookings.find(b => b.start_time > startStr);
  const maxAllowedEnd = nextBooking ? nextBooking.start_time : '24:00';

  if (endStr > maxAllowedEnd) {
    alert(`⚠️ 선택하신 시작 시간(${startStr}) 이후에 기존 예약(${nextBooking.start_time} ${nextBooking.band_team})이 있어 ${maxAllowedEnd}까지만 예약 가능합니다.`);
    endSelect.value = maxAllowedEnd;
  } else {
    if (Array.from(endSelect.options).some(o => o.value === endStr && !o.disabled)) {
      endSelect.value = endStr;
    }
  }

  validateSelectedTimeRange();
}

function setTeamName(name) {
  const selectEl = document.getElementById('bookBandTeam');
  if (!selectEl) return;
  let opt = Array.from(selectEl.options).find(o => o.value === name);
  if (!opt) {
    opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectEl.insertBefore(opt, selectEl.lastElementChild);
  }
  opt.selected = true;
}

// 팀명 드롭다운 옵션 동적 렌더링
function renderTeamOptions() {
  const selectEl = document.getElementById('bookBandTeam');
  if (!selectEl) return;

  const raw = bookingWindow.quick_teams || '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습';
  const teams = raw.split(',').map(t => t.trim()).filter(Boolean);

  selectEl.innerHTML = teams.map(t => 
    `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
  ).join('') + '<option value="__custom__">✏️ 직접 입력...</option>';
}

function renderTeamQuickChips() {
  renderTeamOptions();
}

// 팀명 드롭다운 직접 입력 핸들러
function onBandTeamChange() {
  const selectEl = document.getElementById('bookBandTeam');
  if (!selectEl) return;

  if (selectEl.value === '__custom__') {
    const customName = prompt('팀명을 직접 입력해 주세요:');
    if (customName && customName.trim()) {
      const trimmed = customName.trim();
      const opt = document.createElement('option');
      opt.value = trimmed;
      opt.textContent = trimmed;
      opt.selected = true;
      selectEl.insertBefore(opt, selectEl.lastElementChild);
    } else {
      selectEl.selectedIndex = 0;
    }
  }
}

function focusDateInput() {
  const el = document.getElementById('bookDate');
  if (!el) return;
  try {
    if (typeof el.showPicker === 'function') {
      el.showPicker();
    } else {
      el.focus();
    }
  } catch (e) {
    el.focus();
  }
}

// 팀명 빠른 선택 메뉴 관리자 수정 (통합 관리자 센터 연결)
function openTeamChipsModal() {
  openAdminHubModal('tab-teams');
}

async function submitTeamChips(e) {
  e.preventDefault();
  if (!isAdmin) {
    alert('관리자 계정으로만 변경할 수 있습니다.');
    return;
  }
  const teamsVal = document.getElementById('inputQuickTeams').value.trim();

  if (!teamsVal) {
    alert('최소 1개 이상의 팀명을 입력해 주세요.');
    return;
  }

  try {
    let result;
    if (window.ObandDB) {
      result = await window.ObandDB.saveSettings({
        quick_teams: teamsVal,
        isAdminBypass: true
      });
    } else {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quick_teams: teamsVal
        })
      });
      result = await res.json();
    }
    if (!result.success) {
      alert(result.message || '저장 실패');
      return;
    }

    bookingWindow.quick_teams = teamsVal;
    renderTeamOptions();
    closeModal('adminHubModal');
    alert('🎉 팀명 메뉴가 성공적으로 변경되었습니다!');
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

// 6. 예약 모달 열기(신규 등록 / 기존 예약 수정) 및 제출
let isSubmittingBooking = false;

function openBookingModalForSelectedDate() {
  const editIdEl = document.getElementById('editBookingId');
  const titleEl = document.getElementById('bookingModalTitle');
  const noticeEl = document.getElementById('editBookingNotice');
  const pinLabelEl = document.getElementById('bookingPinLabel');
  const pinInputEl = document.getElementById('bookPin');
  const submitBtnEl = document.getElementById('btnSubmitBooking');

  if (editIdEl) editIdEl.value = '';
  if (titleEl) titleEl.textContent = '🎸 합주실 예약 등록';
  if (noticeEl) noticeEl.style.display = 'none';
  if (pinLabelEl) {
    pinLabelEl.textContent = isAdmin
      ? '👑 관리자 예약 비밀번호 (생략 시 0000 자동 처리)'
      : '🔒 본인 확인 비밀번호 (PIN 숫자 4자리)';
  }
  if (pinInputEl) {
    pinInputEl.required = !isAdmin;
    pinInputEl.value = '';
    pinInputEl.placeholder = isAdmin
      ? '생략 가능 (필요 시 4자리 숫자 입력)'
      : '수정·취소 시 사용할 숫자 4자리';
  }
  if (submitBtnEl) submitBtnEl.textContent = '예약 완료하기';

  document.getElementById('bookDate').value = selectedDate;
  document.getElementById('bookMemberName').value = '';
  
  renderTeamOptions();
  updateAdminHeaderUI();
  refreshTimeSlotsForDate(selectedDate);
  openModal('bookingModal');

  // 모달 오픈 직후 최신 서버 예약 현황 온디맨드 동기화 (비파괴)
  if (currentUser && !isSleeping && window.ObandDB && (Date.now() - lastMonthSyncAt > 1500)) {
    syncLiveAppData({ source: 'modal_open', silent: true });
  }
}

function openEditBookingModal(id) {
  const r = monthReservations.find(item => Number(item.id) === Number(id));
  if (!r) {
    alert('수정할 예약 정보를 찾을 수 없습니다.');
    return;
  }

  const editIdEl = document.getElementById('editBookingId');
  const titleEl = document.getElementById('bookingModalTitle');
  const noticeEl = document.getElementById('editBookingNotice');
  const pinLabelEl = document.getElementById('bookingPinLabel');
  const pinInputEl = document.getElementById('bookPin');
  const submitBtnEl = document.getElementById('btnSubmitBooking');

  if (editIdEl) editIdEl.value = String(r.id);
  if (titleEl) titleEl.textContent = '✏️ 합주실 예약 내용 수정';
  if (noticeEl) {
    noticeEl.style.display = isAdmin ? 'none' : 'block';
  }
  if (pinLabelEl) {
    pinLabelEl.textContent = isAdmin
      ? '👑 관리자 권한 수정 (PIN 생략 가능)'
      : '🔑 예약 시 등록한 4자리 비밀번호(PIN) 입력';
  }
  if (pinInputEl) {
    pinInputEl.required = !isAdmin;
    pinInputEl.value = '';
    pinInputEl.placeholder = isAdmin
      ? '관리자 로그인 상태 (PIN 없이 바로 수정 가능)'
      : '예약 시 설정한 숫자 4자리 입력';
  }
  if (submitBtnEl) submitBtnEl.textContent = '✏️ 예약 수정 완료하기';

  document.getElementById('bookDate').value = r.res_date;
  document.getElementById('bookMemberName').value = r.member_name || '';

  renderTeamOptions();
  updateAdminHeaderUI();
  setTeamName(r.band_team || '전체합주');
  refreshTimeSlotsForDate(r.res_date);

  const startSelect = document.getElementById('bookStartTime');
  const endSelect = document.getElementById('bookEndTime');
  if (startSelect) {
    startSelect.value = r.start_time;
    updateEndTimeOptions();
  }
  if (endSelect) {
    endSelect.value = r.end_time;
    validateSelectedTimeRange();
  }

  openModal('bookingModal');
}

async function submitBooking(e) {
  e.preventDefault();
  if (isSubmittingBooking) return;

  const teamEl = document.getElementById('bookBandTeam');
  const selectedTeam = teamEl ? teamEl.value.trim() : '전체합주';
  const editIdEl = document.getElementById('editBookingId');
  const editId = editIdEl ? editIdEl.value.trim() : '';
  const isEditMode = Boolean(editId);
  let pinVal = document.getElementById('bookPin').value.trim();
  if (isAdmin && !pinVal) {
    pinVal = '0000';
  }

  const body = {
    res_date: document.getElementById('bookDate').value,
    start_time: document.getElementById('bookStartTime').value,
    end_time: document.getElementById('bookEndTime').value,
    member_name: document.getElementById('bookMemberName').value.trim(),
    band_team: selectedTeam === '__custom__' ? '전체합주' : selectedTeam,
    part: '합주',
    purpose: '',
    pin: pinVal,
    isAdminBypass: isAdmin
  };

  if (isEditMode) {
    body.id = Number(editId);
  }

  if (body.start_time >= body.end_time) {
    alert('종료 시간은 시작 시간보다 늦어야 합니다.');
    return;
  }

  const submitBtn = document.getElementById('btnSubmitBooking');
  const prevBtnText = submitBtn ? submitBtn.textContent : '';
  isSubmittingBooking = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 예약 확인 중...';
  }

  try {
    let result;
    if (window.ObandDB) {
      result = await window.ObandDB.saveBooking(body);
    } else {
      const endpoint = isEditMode ? `${API_BASE}/api/reservations/update` : `${API_BASE}/api/reservations`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      result = await res.json();
      result.status = res.status;
    }

    if (!result.success) {
      if (result.status === 409) {
        const [ry, rm] = body.res_date.split('-').map(Number);
        if (ry && rm) {
          calYear = ry;
          calMonth = rm;
          selectedDate = body.res_date;
        }
        await loadMonthData(calYear, calMonth);
        renderCalendar();
        renderDayTimeline(selectedDate);
        syncOpenBookingModalNonDestructive();
      }
      alert(result.message || (isEditMode ? '예약 수정 실패' : '예약 실패'));
      if (result.status === 403) {
        const pinInput = document.getElementById('bookPin');
        if (pinInput) pinInput.focus();
      }
      return;
    }
    if (editIdEl) editIdEl.value = '';
    closeModal('bookingModal');

    // 날짜가 변경된 경우 해당 날짜/월로 포커스 이동
    selectedDate = body.res_date;
    const [ry, rm] = body.res_date.split('-').map(Number);
    if (ry && rm) {
      calYear = ry;
      calMonth = rm;
    }

    // 캘린더 데이터 갱신
    await loadMonthData(calYear, calMonth);
    renderCalendar();
    renderDayTimeline(selectedDate);

    if (isEditMode) {
      showToast('✏️ 예약 내용이 성공적으로 수정되었습니다!');
    } else {
      // 신규 예약 완료 시 카톡 공유 모달 표출
      openBookingSuccessModal({
        res_date: body.res_date,
        start_time: body.start_time,
        end_time: body.end_time,
        band_team: body.band_team,
        member_name: body.member_name
      });
    }
  } catch (err) {
    alert(`오류 발생: ${err.message}`);
  } finally {
    isSubmittingBooking = false;
    if (submitBtn) {
      submitBtn.textContent = prevBtnText || (isEditMode ? '✏️ 예약 수정 완료하기' : '예약 완료하기');
      validateSelectedTimeRange();
    }
  }
}

// 7. 예약 취소 모달 및 제출
function openCancelModal(id, timeRange, name) {
  document.getElementById('cancelResId').value = id;
  document.getElementById('cancelPin').value = '';
  document.getElementById('cancelTargetDesc').textContent = `[${selectedDate} ${timeRange}] ${name}님의 예약을 취소하시겠습니까?`;
  openModal('cancelModal');
}

async function submitCancel(e) {
  e.preventDefault();
  const id = document.getElementById('cancelResId').value;
  const pin = document.getElementById('cancelPin').value.trim();

  try {
    let result;
    if (window.ObandDB) {
      result = await window.ObandDB.cancelBooking(id, pin);
    } else {
      const res = await fetch(`${API_BASE}/api/reservations/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id), pin: pin })
      });
      result = await res.json();
    }
    if (!result.success) {
      alert(result.message || '취소 실패');
      return;
    }
    alert(result.message);
    closeModal('cancelModal');

    await loadMonthData(calYear, calMonth);
    renderCalendar();
    renderDayTimeline(selectedDate);
  } catch (err) {
    alert(`취소 오류: ${err.message}`);
  }
}

// 8. 통합 관리자 센터 & 예약 조건 설정
function openSettingsModal() {
  openAdminHubModal('tab-settings');
}

function openAdminHubModal(initialTab = 'tab-accounts') {
  if (!isAdmin) {
    alert('관리자 계정으로 로그인해야 접근할 수 있습니다.');
    return;
  }
  switchAdminHubTab(initialTab);
  openModal('adminHubModal');
}

function switchAdminHubTab(tabName) {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.adminTab === tabName);
  });
  document.querySelectorAll('.admin-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `adminTab-${tabName}`);
  });

  if (tabName === 'tab-accounts') {
    loadAdminAccounts();
  } else if (tabName === 'tab-settings') {
    const openEl = document.getElementById('cfgOpenWeeks');
    const resetEl = document.getElementById('cfgResetDay');
    const kakaoInput = document.getElementById('cfgKakaoJsKey');
    if (openEl) openEl.value = String(bookingWindow.open_weeks || 2);
    if (resetEl) resetEl.value = String(bookingWindow.reset_day || 0);
    if (kakaoInput) kakaoInput.value = bookingWindow.kakao_js_key || '';
  } else if (tabName === 'tab-teams') {
    const inputTeams = document.getElementById('inputQuickTeams');
    if (inputTeams) {
      inputTeams.value = bookingWindow.quick_teams || '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습';
    }
  }
}

async function loadAdminAccounts() {
  const listEl = document.getElementById('adminAccountList');
  if (!listEl || !window.ObandDB) return;

  listEl.innerHTML = '<div class="empty-text" style="padding:12px 0;">계정 목록을 불러오는 중...</div>';
  try {
    const res = await window.ObandDB.getUsers();
    if (!res || !res.success) {
      listEl.innerHTML = `<div class="empty-text" style="color:#f87171;">${escapeHtml((res && res.message) || '목록 조회 실패')}</div>`;
      return;
    }
    const users = res.users || [];
    if (users.length === 0) {
      listEl.innerHTML = '<div class="empty-text">등록된 계정이 없습니다.</div>';
      return;
    }

    listEl.innerHTML = users.map(u => {
      const isSelf = Boolean(currentUser && currentUser.username === u.username);
      const roleLabel = u.role === 'admin' ? '👑 관리자' : '🎸 부원 공용';
      const roleClass = u.role === 'admin' ? 'role-admin' : 'role-member';
      return `
        <div class="admin-account-card">
          <div class="admin-account-info">
            <div class="admin-account-id-row">
              <span class="admin-account-username">${escapeHtml(u.username)}</span>
              <span class="admin-account-role-badge ${roleClass}">${roleLabel}</span>
              ${isSelf ? '<span style="font-size:10px; color:#38bdf8; font-weight:800;">(접속중)</span>' : ''}
            </div>
            <div class="admin-account-sub">${escapeHtml(u.display_name || '')}${u.created_at ? ' · ' + escapeHtml(u.created_at) : ''}</div>
          </div>
          <div class="admin-account-actions">
            <button type="button" class="btn-acct-pw" onclick="resetAccountPassword(${u.id}, '${escapeHtml(u.username)}')">🔑 비번</button>
            ${!isSelf ? `<button type="button" class="btn-acct-del" onclick="deleteAccount(${u.id}, '${escapeHtml(u.username)}')">🗑️ 삭제</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="empty-text" style="color:#f87171;">오류: ${escapeHtml(err.message)}</div>`;
  }
}

async function submitCreateAccount(e) {
  e.preventDefault();
  if (!isAdmin || !window.ObandDB) {
    alert('관리자 계정으로만 계정을 생성할 수 있습니다.');
    return;
  }

  const roleEl = document.getElementById('newAccountRole');
  const displayEl = document.getElementById('newAccountDisplayName');
  const userEl = document.getElementById('newAccountUsername');
  const pwEl = document.getElementById('newAccountPassword');

  const payload = {
    role: roleEl ? roleEl.value : 'member',
    display_name: displayEl ? displayEl.value.trim() : '',
    username: userEl ? userEl.value.trim() : '',
    password: pwEl ? pwEl.value : ''
  };

  try {
    const res = await window.ObandDB.createUser(payload);
    if (!res || !res.success) {
      alert((res && res.message) || '계정 생성 실패');
      return;
    }
    alert(res.message);
    if (displayEl) displayEl.value = '';
    if (userEl) userEl.value = '';
    if (pwEl) pwEl.value = '';
    await loadAdminAccounts();
  } catch (err) {
    alert(`계정 생성 오류: ${err.message}`);
  }
}

async function resetAccountPassword(userId, username) {
  if (!isAdmin || !window.ObandDB) return;
  const newPw = prompt(`[${username}] 계정의 새 비밀번호를 입력하세요 (4자 이상):`);
  if (newPw === null) return;
  if (newPw.length < 4) {
    alert('비밀번호는 최소 4자 이상 입력해 주세요.');
    return;
  }

  try {
    const res = await window.ObandDB.updateUserPassword(userId, newPw);
    if (!res || !res.success) {
      alert((res && res.message) || '비밀번호 변경 실패');
      return;
    }
    alert(`✅ [${username}] 계정의 비밀번호가 변경되었습니다.`);
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

async function deleteAccount(userId, username) {
  if (!isAdmin || !window.ObandDB) return;
  if (!confirm(`계정 [${username}]을(를) 정말 삭제하시겠습니까?\n삭제 시 해당 아이디로는 더 이상 로그인할 수 없습니다.`)) return;

  try {
    const res = await window.ObandDB.deleteUser(userId);
    if (!res || !res.success) {
      alert((res && res.message) || '계정 삭제 실패');
      return;
    }
    alert(res.message);
    await loadAdminAccounts();
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

async function submitSettings(e) {
  e.preventDefault();
  if (!isAdmin) {
    alert('관리자 계정으로만 설정을 변경할 수 있습니다.');
    return;
  }
  const kakaoInput = document.getElementById('cfgKakaoJsKey');
  const body = {
    open_weeks: Number(document.getElementById('cfgOpenWeeks').value),
    reset_day: Number(document.getElementById('cfgResetDay').value),
    kakao_js_key: kakaoInput ? kakaoInput.value.trim() : '',
    isAdminBypass: true
  };

  try {
    let result;
    if (window.ObandDB) {
      result = await window.ObandDB.saveSettings(body);
    } else {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      result = await res.json();
    }
    if (!result.success) {
      alert(result.message || '설정 저장 실패');
      return;
    }
    alert('⚙️ 관리자 예약 기간 조건이 저장되었습니다!');
    closeModal('adminHubModal');

    await loadBookingWindow();
    renderCalendar();
    renderDayTimeline(selectedDate);
  } catch (err) {
    alert(`설정 오류: ${err.message}`);
  }
}

// 9. 공지사항 로드 및 등록
async function loadNotices() {
  const container = document.getElementById('noticeList');
  try {
    let data;
    if (window.ObandDB) {
      data = await window.ObandDB.getNotices();
    } else {
      const res = await fetch(`${API_BASE}/api/notices`);
      data = await res.json();
    }
    if (!data.success) throw new Error(data.message);

    const notices = data.notices || [];
    if (notices.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📢</div><div class="empty-text">등록된 공지사항이 없습니다.</div></div>';
      return;
    }

    container.innerHTML = notices.map(n => `
      <div class="notice-card ${n.is_pinned ? 'pinned' : ''}">
        <div class="notice-header">
          <span class="notice-badge ${n.is_pinned ? 'pinned-badge' : 'cat-' + n.category}">
            ${n.is_pinned ? '📌 필독' : '#' + n.category}
          </span>
          <span class="notice-meta">${n.created_at ? n.created_at.substring(0, 10) : ''}</span>
        </div>
        <div class="notice-title">${escapeHtml(n.title)}</div>
        <div class="notice-content">${escapeHtml(n.content)}</div>
        <div class="notice-footer">
          <span class="notice-author">작성자: ${escapeHtml(n.author)}</span>
          <button class="notice-delete-btn" onclick="deleteNotice(${n.id})">삭제</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('공지 로드 실패:', err);
  }
}

function openNoticeModal() {
  document.getElementById('noticeTitle').value = '';
  document.getElementById('noticeContent').value = '';
  document.getElementById('noticeAuthor').value = '';
  document.getElementById('noticePin').value = '';
  document.getElementById('noticeIsPinned').checked = false;
  openModal('noticeModal');
}

async function submitNotice(e) {
  e.preventDefault();
  const body = {
    title: document.getElementById('noticeTitle').value.trim(),
    content: document.getElementById('noticeContent').value.trim(),
    author: document.getElementById('noticeAuthor').value.trim(),
    category: document.getElementById('noticeCategory').value,
    is_pinned: document.getElementById('noticeIsPinned').checked ? 1 : 0,
    pin: document.getElementById('noticePin').value.trim()
  };

  try {
    let result;
    if (window.ObandDB) {
      result = await window.ObandDB.saveNotice(body);
    } else {
      const res = await fetch(`${API_BASE}/api/notices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      result = await res.json();
    }
    if (!result.success) {
      alert(result.message || '등록 실패');
      return;
    }
    alert('📢 공지사항이 등록되었습니다!');
    closeModal('noticeModal');
    loadNotices();
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

async function deleteNotice(id) {
  let pin = '';
  if (isAdmin) {
    if (!confirm('관리자 권한으로 이 공지사항을 삭제하시겠습니까?')) return;
  } else {
    pin = prompt('공지 작성 시 입력했던 4자리 비밀번호(PIN)를 입력하세요:');
    if (!pin) return;
  }

  try {
    let result;
    if (window.ObandDB) {
      result = await window.ObandDB.deleteNotice(id, pin, isAdmin);
    } else {
      const res = await fetch(`${API_BASE}/api/notices/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, pin: pin })
      });
      result = await res.json();
    }
    if (!result.success) {
      alert(result.message || '삭제 실패');
      return;
    }
    alert(result.message);
    loadNotices();
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 관리자 전용 제어 함수 (강제 취소 & 연습곡 삭제)
// -------------------------------------------------------------
async function adminForceCancel(id, timeRange, name) {
  if (!isAdmin) return;
  if (!confirm(`[관리자 권한 강제 취소]\n\n${name}님의 예약(${timeRange})을 강제 취소하시겠습니까?\n취소 시 해당 타임슬롯이 즉시 반환됩니다.`)) {
    return;
  }

  try {
    let result;
    if (window.ObandDB) {
      result = await window.ObandDB.cancelBooking(id, '', true);
    } else {
      const res = await fetch(`${API_BASE}/api/reservations/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id) })
      });
      result = await res.json();
    }
    if (!result.success) {
      alert(result.message || '취소 실패');
      return;
    }
    alert(result.message);
    await loadMonthData(calYear, calMonth);
    renderCalendar();
    renderDayTimeline(selectedDate);
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

// 10. 세트리스트 로드
async function loadSetlists() {
  const container = document.getElementById('setlistContainer');
  try {
    let data;
    if (window.ObandDB) {
      data = await window.ObandDB.getSetlists();
    } else {
      const res = await fetch(`${API_BASE}/api/setlists`);
      data = await res.json();
    }
    if (!data.success) throw new Error(data.message);

    const songs = data.setlists || [];
    if (songs.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🎵</div><div class="empty-text">등록된 연습곡이 없습니다.</div></div>';
      return;
    }

    container.innerHTML = songs.map(s => `
      <div class="setlist-card">
        <div class="song-info">
          <div class="song-title">🎶 ${escapeHtml(s.title)}</div>
          <div class="song-artist">${escapeHtml(s.artist)}</div>
          <div class="song-tags">
            ${s.key_info ? `<span class="tag-pill">Key: ${escapeHtml(s.key_info)}</span>` : ''}
            ${s.tempo ? `<span class="tag-pill">${escapeHtml(s.tempo)}</span>` : ''}
            <span class="tag-pill" style="color:var(--accent-cyan);">${escapeHtml(s.status || '연습중')}</span>
          </div>
          ${s.memo ? `<div style="font-size:11px; color:var(--text-dim); margin-top:4px;">💡 ${escapeHtml(s.memo)}</div>` : ''}
        </div>
        <div class="song-actions">
          ${s.youtube_url ? `<a href="${s.youtube_url}" target="_blank" class="btn-link">▶ 영상</a>` : ''}
          ${s.sheet_url ? `<a href="${s.sheet_url}" target="_blank" class="btn-link" style="color:var(--accent-cyan); border-color:rgba(0,223,216,0.3); background:rgba(0,223,216,0.1);">📄 악보</a>` : ''}
          ${isAdmin ? `<button type="button" class="btn-setlist-del" onclick="deleteSetlistItem(${s.id}, '${escapeHtml(s.title)}')">🗑️ 삭제</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('곡 로드 실패:', err);
  }
}

async function deleteSetlistItem(id, title) {
  if (!isAdmin || !window.ObandDB) return;
  if (!confirm(`[관리자 권한] 연습곡 "${title}"을(를) 삭제하시겠습니까?`)) return;
  try {
    const res = await window.ObandDB.deleteSetlist(id);
    if (!res || !res.success) {
      alert((res && res.message) || '삭제 실패');
      return;
    }
    showToast('🗑️ 연습곡이 삭제되었습니다.');
    await loadSetlists();
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

function openSetlistModal() {
  document.getElementById('songTitle').value = '';
  document.getElementById('songArtist').value = '';
  document.getElementById('songKey').value = '';
  document.getElementById('songTempo').value = '';
  document.getElementById('songYoutube').value = '';
  document.getElementById('songSheet').value = '';
  document.getElementById('songMemo').value = '';
  openModal('setlistModal');
}

async function submitSetlist(e) {
  e.preventDefault();
  const body = {
    title: document.getElementById('songTitle').value.trim(),
    artist: document.getElementById('songArtist').value.trim(),
    key_info: document.getElementById('songKey').value.trim(),
    tempo: document.getElementById('songTempo').value.trim(),
    youtube_url: document.getElementById('songYoutube').value.trim(),
    sheet_url: document.getElementById('songSheet').value.trim(),
    memo: document.getElementById('songMemo').value.trim()
  };

  try {
    let result;
    if (window.ObandDB) {
      result = await window.ObandDB.saveSetlist(body);
    } else {
      const res = await fetch(`${API_BASE}/api/setlists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      result = await res.json();
    }
    if (!result.success) {
      alert(result.message || '등록 실패');
      return;
    }
    alert('🎵 새 연습곡이 추가되었습니다!');
    closeModal('setlistModal');
    loadSetlists();
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

// 11. 탭 전환
function switchTab(tabId, element) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
  if (element) element.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 13. 모달 제어
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');

  if (id === 'iosInstallGuideModal') {
    const isKakao = /KAKAOTALK/i.test(navigator.userAgent || '');
    const alertBox = document.getElementById('iosKakaoAlert');
    if (alertBox) alertBox.style.display = isKakao ? 'block' : 'none';
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

function openShareModal() {
  document.getElementById('cloudUrlDisplay').textContent = window.location.href;
  openModal('shareModal');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 14. 카카오톡 예약 내용 공유 시스템
const MASTER_KAKAO_KEY = '9c7896446460c61031857bb22b4c3d02';
let lastBookingInfo = null;
let toastTimer = null;

function ensureKakaoInitialized() {
  if (typeof window.Kakao === 'undefined') {
    return false;
  }
  if (!Kakao.isInitialized()) {
    const key = (bookingWindow && bookingWindow.kakao_js_key && bookingWindow.kakao_js_key.trim())
      ? bookingWindow.kakao_js_key.trim()
      : MASTER_KAKAO_KEY;
    try {
      Kakao.init(key);
      console.log('✅ Kakao SDK 초기화 완료:', key);
    } catch (e) {
      console.error('Kakao init error:', e);
    }
  }
  return Kakao.isInitialized();
}

function initKakaoSDK() {
  ensureKakaoInitialized();
}

function openBookingSuccessModal(info) {
  lastBookingInfo = info;
  const summaryEl = document.getElementById('bookingSuccessSummary');
  if (!summaryEl) return;

  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(info.res_date + 'T00:00:00');
  const dayStr = isNaN(d.getDay()) ? '' : ` (${days[d.getDay()]})`;

  let durationText = '';
  if (info.start_time && info.end_time) {
    const [sh, sm] = info.start_time.split(':').map(Number);
    const [eh, em] = info.end_time.split(':').map(Number);
    const durHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    if (durHours > 0) durationText = ` (${durHours}시간)`;
  }

  summaryEl.innerHTML = `
    <div class="success-card-row">
      <span class="success-card-label">📅 일시</span>
      <span class="success-card-val">${info.res_date}${dayStr} ${info.start_time} ~ ${info.end_time}${durationText}</span>
    </div>
    <div class="success-card-row">
      <span class="success-card-label">🎸 팀명</span>
      <span class="success-card-val">${escapeHtml(info.band_team || '전체합주')}</span>
    </div>
    <div class="success-card-row">
      <span class="success-card-label">👤 예약자</span>
      <span class="success-card-val">${escapeHtml(info.member_name)} 님</span>
    </div>
    <div class="success-card-row">
      <span class="success-card-label">📍 장소</span>
      <span class="success-card-val">오뺀 합주실</span>
    </div>
  `;

  openModal('bookingSuccessModal');
}

function shareCurrentBookingSuccess() {
  if (!lastBookingInfo) return;
  shareReservationKakao(lastBookingInfo);
}

function shareReservationById(id) {
  const r = monthReservations.find(item => Number(item.id) === Number(id));
  if (r) {
    shareReservationKakao({
      res_date: r.res_date,
      start_time: r.start_time,
      end_time: r.end_time,
      band_team: r.band_team,
      member_name: r.member_name
    });
  }
}

function shareReservationDirect(resDate, startTime, endTime, bandTeam, memberName) {
  shareReservationKakao({
    res_date: resDate,
    start_time: startTime,
    end_time: endTime,
    band_team: bandTeam,
    member_name: memberName
  });
}

function canDirectLaunchKakaoTalkApp() {
  const ua = (navigator.userAgent || '').toLowerCase();
  const isKakaoInApp = /kakaotalk/.test(ua);
  if (isKakaoInApp) return true;

  // 카카오 JS SDK 2.7.4 yo() / Kt() 분기 기준과 100% 일치시킴
  // (모바일 앱 직결이 불가능한 PC/Opera/Huawei/안드로이드 데스크톱 보기에서는 웹 로그인 팝업 대신 즉시 복사 폴백 사용)
  const isBlockedMobileBrowser = /opr\/|opt\/|huawei/.test(ua);
  if (isBlockedMobileBrowser) return false;

  const isIosMobileOrTablet = /iphone|ipod|ipad/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroidMobile = /android.+mobile/.test(ua);
  return isIosMobileOrTablet || isAndroidMobile;
}

function canUseKakaoSdkShareOnCurrentHost() {
  // 카카오 디벨로퍼스 [웹 도메인] 허용 호스트만 SDK 직접 호출 (미등록 호스트 o-band.onrender.com / localhost 등에서 -401 -> 4019 페이지 이탈 원천 차단)
  const host = (window.location.hostname || '').toLowerCase();
  return host === 'syoul8905-oband.github.io';
}

function getCanonicalShareUrl() {
  if (window.location.hostname === 'syoul8905-oband.github.io') {
    return window.location.origin + window.location.pathname;
  }
  return 'https://syoul8905-oband.github.io/O_BAND/';
}

function shareReservationKakao(info) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(info.res_date + 'T00:00:00');
  const dayStr = isNaN(d.getDay()) ? '' : ` (${days[d.getDay()]})`;

  let durationText = '';
  if (info.start_time && info.end_time) {
    const [sh, sm] = info.start_time.split(':').map(Number);
    const [eh, em] = info.end_time.split(':').map(Number);
    const durHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    if (durHours > 0) durationText = ` (${durHours}시간)`;
  }

  const shareUrl = getCanonicalShareUrl();
  const safeTeam = (info && info.band_team) ? info.band_team : '전체합주';
  const safeMember = (info && info.member_name) ? info.member_name : '부원';

  const shareText = `[오늘부터 밴드부 🎸 합주실 예약 안내]\n\n📅 일시: ${info.res_date}${dayStr} ${info.start_time} ~ ${info.end_time}${durationText}\n🎸 팀명: ${safeTeam}\n👤 예약자: ${safeMember} 님\n📍 장소: 오뺀 합주실\n\n👉 일정 및 세부 사항 확인:\n${shareUrl}`;

  // 1. A안: PC 브라우저 · 모바일 데스크톱 사이트 모드 · 태블릿/차단 모바일 브라우저에서는 카카오 웹 로그인 팝업 없이 즉시 공유/복사
  if (!canDirectLaunchKakaoTalkApp()) {
    const ua = navigator.userAgent || '';
    const isCoarsePointer = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const isAndroidDesktopSite = /Linux/i.test(ua) && !/Android/i.test(ua) && (navigator.maxTouchPoints > 1 || (navigator.maxTouchPoints > 0 && isCoarsePointer));
    const isMobileOrTabletOs = /Android|iPhone|iPad|iPod/i.test(ua);

    if (isMobileOrTabletOs && navigator.share) {
      navigator.share({
        title: `오늘부터 밴드부 합주 예약 (${safeTeam})`,
        text: shareText
      }).catch(err => {
        if (!err || err.name !== 'AbortError') {
          copyShareTextFallback(shareText, '📋 카톡 공유 문구가 복사되었습니다!\n채팅 입력창을 길게 눌러 붙여넣기하세요.');
        }
      });
      return;
    }

    let toastMsg = '📋 카톡 공유 문구가 복사되었습니다!\nPC 카카오톡 채팅방에 붙여넣기(Ctrl+V)하세요.';
    if (isAndroidDesktopSite) {
      toastMsg = '📋 카톡 공유 문구가 복사되었습니다!\n모바일 카톡 앱 바로 열기는 크롬 ⋮ [데스크톱 사이트]를 꺼 주세요.';
    } else if (isMobileOrTabletOs) {
      toastMsg = '📋 카톡 공유 문구가 복사되었습니다!\n채팅 입력창을 길게 눌러 붙여넣기하세요.';
    }
    copyShareTextFallback(shareText, toastMsg);
    return;
  }

  // 2. 스마트폰 모바일 브라우저 (허용 호스트): 카카오톡 공식 SDK 직접 연동 (카톡 앱 즉시 실행 및 채팅방/친구 선택 창 바로 띄우기)
  if (canUseKakaoSdkShareOnCurrentHost()) {
    const isKakaoReady = ensureKakaoInitialized();
    if (isKakaoReady) {
      try {
        Kakao.Share.sendDefault({
          objectType: 'text',
          text: shareText,
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl
          },
          buttons: [
            {
              title: '📅 합주실 일정 확인하기',
              link: {
                mobileWebUrl: shareUrl,
                webUrl: shareUrl
              }
            }
          ]
        });
        return; // 카카오톡 공유 호출 완료
      } catch (err) {
        console.error('Kakao.Share.sendDefault 에러:', err);
      }
    }
  }

  // 3. SDK 미로드/동기 오류/비허용 호스트 시 OS 공유 시트 또는 자동 복사 폴백으로 4019 완전 차단
  if (navigator.share) {
    navigator.share({
      title: `오늘부터 밴드부 합주 예약 (${safeTeam})`,
      text: shareText
    }).catch(err => {
      if (!err || err.name !== 'AbortError') {
        copyShareTextFallback(shareText, '📋 카톡 공유 문구가 복사되었습니다!\n채팅 입력창을 길게 눌러 붙여넣기하세요.');
      }
    });
    return;
  }

  copyShareTextFallback(shareText, '📋 카톡 공유 문구가 복사되었습니다!\n채팅 입력창을 길게 눌러 붙여넣기하세요.');
}

function copyShareTextFallback(text, successToastMsg = '📋 카톡 공유 문구가 복사되었습니다!\n단톡방에 붙여넣기(Ctrl+V)하세요.') {
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successToastMsg);
    }).catch(() => {
      legacyCopyText(text, successToastMsg);
    });
  } else {
    legacyCopyText(text, successToastMsg);
  }
}

function legacyCopyText(text, successToastMsg = '📋 카톡 공유 문구가 복사되었습니다!\n단톡방에 붙여넣기(Ctrl+V)하세요.') {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-9999px';
  ta.style.left = '-9999px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (e) {
    copied = false;
  }
  document.body.removeChild(ta);

  if (copied) {
    showToast(successToastMsg);
  } else {
    prompt('아래 문구를 복사하여 카카오톡에 붙여넣으세요:', text);
  }
}

function showToast(msg) {
  const el = document.getElementById('toastAlert');
  if (!el) return;
  el.innerHTML = msg.replace(/\n/g, '<br>');
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 3000);
}

// 15. 스마트 절전 모드 (10분 미조작 시 서버 트래픽 및 배터리 절약)
const SLEEP_TIMEOUT_MS = 10 * 60 * 1000; // 10분
let sleepTimer = null;
let isSleeping = false;

function resetSleepTimer() {
  if (isSleeping || !currentUser) return;
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = setTimeout(enterSleepMode, SLEEP_TIMEOUT_MS);
}

function enterSleepMode() {
  if (!currentUser) return;
  isSleeping = true;
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  stopRealtimeSync();
  const overlay = document.getElementById('sleepModeOverlay');
  if (overlay) overlay.classList.add('active');
  console.log('🌙 오뺀 절전 모드 가동 (트래픽 & 소켓 차단)');
}

async function wakeFromSleep() {
  const overlay = document.getElementById('sleepModeOverlay');
  if (overlay) overlay.classList.remove('active');
  isSleeping = false;
  resetSleepTimer();
  initServerKeepAlive();
  startRealtimeSync();

  // 최신 데이터 및 자정(0시) 경과 시 오픈 기간 즉시 갱신
  try {
    await checkAndApplyMidnightRollover();
    await loadBookingWindow();
    await loadMonthData(calYear, calMonth);
    renderCalendar();
    renderDayTimeline(selectedDate);
    syncOpenBookingModalNonDestructive();
    showToast('⚡ 절전 모드가 해제되었습니다.');
  } catch (e) {
    console.warn('Wake update failed:', e);
  }
}

function initSleepModeTracker() {
  ['touchstart', 'click', 'mousemove', 'keydown', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetSleepTimer, { passive: true });
  });
  resetSleepTimer();
}

// Render.com 15분 무료 서버 절전(Spin-down) 방지용 클라이언트 하트비트
// Supabase 직결 모드(window.ObandDB)에서는 백엔드 핑이 불필요하므로 트래픽 완전 0(0%)으로 차단
let keepAliveInterval = null;
function initServerKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (window.ObandDB) {
    // Supabase BaaS 직결 체제에서는 클라이언트 핑 원천 배제 (트래픽 및 배터리 절약)
    return;
  }
  keepAliveInterval = setInterval(() => {
    if (!isSleeping) {
      fetch(`${API_BASE}/api/health?t=${Date.now()}`, { cache: 'no-store' }).catch(() => {});
    }
  }, 4 * 60 * 1000);
}

// 16. 바탕화면 바로가기 (앱 설치/PWA 완전 제거 ➔ 100% 순수 크롬/사파리 바로가기 전용)
let deferredInstallPrompt = null;

function isAppleMobile() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

// 기존 등록된 PWA 서비스워커가 있다면 즉시 해제하여 '앱 설치' 창 원천 차단
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister());
    }).catch(() => {});

    if (currentUser && window.location.search.indexOf('action=safari_guide') !== -1) {
      setTimeout(() => executeSafariShortcut(), 300);
    } else if (currentUser && window.location.search.indexOf('action=chrome_shortcut') !== -1) {
      setTimeout(() => openModal('iosProfileCompleteModal'), 300);
    }
  });
}

// 브라우저의 자동 앱 설치(PWA) 배너 완전 차단
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
});

function handleShortcutNavClick() {
  openShortcutModal();
}

function openShortcutModal() {
  const userAgent = navigator.userAgent || '';
  const isKakao = /KAKAOTALK/i.test(userAgent);

  const kakaoTip = document.getElementById('shortcutKakaoTip');
  const guideBox = document.getElementById('shortcutGuideBox');
  const arrow = document.getElementById('guideArrowIcon');

  if (guideBox) guideBox.style.display = 'none';
  if (arrow) arrow.textContent = '▼';

  if (isKakao) {
    if (kakaoTip) kakaoTip.style.display = 'block';
  } else {
    if (kakaoTip) kakaoTip.style.display = 'none';
  }

  openModal('shortcutModal');
}

function toggleShortcutGuide() {
  const guideBox = document.getElementById('shortcutGuideBox');
  const arrow = document.getElementById('guideArrowIcon');
  if (!guideBox) return;

  const isHidden = (guideBox.style.display === 'none' || !guideBox.style.display);
  if (isHidden) {
    guideBox.style.display = 'flex';
    if (arrow) arrow.textContent = '▲';
  } else {
    guideBox.style.display = 'none';
    if (arrow) arrow.textContent = '▼';
  }
}

function executeShortcutCreation() {
  executeChromeShortcut();
}

// 1. 크롬 바로가기 (첨부된 3단계 스크린샷 표출 & 카톡/삼성인터넷 시 크롬 자동 연결)
function executeChromeShortcut() {
  const userAgent = navigator.userAgent || '';
  const isKakao = /KAKAOTALK/i.test(userAgent);
  const isSamsung = /SamsungBrowser/i.test(userAgent);

  closeModal('shortcutModal');

  // 카카오톡 또는 삼성 인터넷에서는 크롬(com.android.chrome)으로 즉시 이동하여 스크린샷 안내 표출
  if (isKakao || isSamsung) {
    showToast('🌐 크롬(Chrome) 브라우저로 이동합니다...');
    escapeKakaoToExternalBrowser('chrome');
    return;
  }

  openModal('iosProfileCompleteModal');
}

// 2. 사파리 바로가기 (첨부된 1번 스크린샷 표출)
function executeSafariShortcut() {
  const userAgent = navigator.userAgent || '';
  const isKakao = /KAKAOTALK/i.test(userAgent);

  closeModal('shortcutModal');

  const kakaoAlert = document.getElementById('iosKakaoAlert');
  if (kakaoAlert) {
    kakaoAlert.style.display = isKakao ? 'block' : 'none';
  }

  openModal('iosInstallGuideModal');
}

function executePcShortcut() {
  downloadDesktopShortcut();
  closeModal('shortcutModal');
}

function downloadIosProfile() {
  executeSafariShortcut();
}

function openIosSettingsApp() {
  executeSafariShortcut();
}

function switchToSafariGuideFromProfile() {
  closeModal('iosProfileCompleteModal');
  executeSafariShortcut();
}

function escapeKakaoToExternalBrowser(targetBrowser) {
  const userAgent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(userAgent);
  const host = window.location.host;
  const path = window.location.pathname;
  const fullUrl = window.location.href;
  const actionParam = targetBrowser === 'safari' ? 'action=safari_guide' : 'action=chrome_shortcut';
  const targetUrl = `${host}${path}?${actionParam}`;

  if (isAndroid) {
    const chromeIntent = `intent://${targetUrl}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;end`;
    window.location.href = chromeIntent;
  } else {
    if (targetBrowser === 'chrome') {
      window.location.href = `googlechrome://${targetUrl}`;
      setTimeout(() => {
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent('https://' + targetUrl)}`;
      }, 500);
    } else {
      const safariTarget = targetBrowser === 'safari' ? `https://${targetUrl}` : fullUrl;
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(safariTarget)}`;
      setTimeout(() => {
        try { window.location.href = 'kakaoweb://closeBrowser'; } catch(e) {}
      }, 200);
    }
  }
}

function downloadDesktopShortcut() {
  const a = document.createElement('a');
  a.href = '/download-shortcut';
  a.download = '오늘부터밴드부_오뺀.url';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('📥 바탕화면 바로가기 파일이 다운로드되었습니다!');
}

// 17. 매뉴얼 사진 전체화면 확대/축소/이동 뷰어
let currentImageZoom = 1;
let pinchStartDist = 0;
let pinchStartZoom = 1;

function openImageZoom(src, title, initialScale = 1.8, focusArea = 'center') {
  const modal = document.getElementById('imageZoomModal');
  const img = document.getElementById('imageZoomTarget');
  const titleEl = document.getElementById('imageZoomTitle');
  if (!modal || !img) return;

  if (titleEl) {
    titleEl.textContent = `🔍 ${title || '매뉴얼 크게 보기'}`;
  }

  img.onload = () => {
    setImageZoom(initialScale, focusArea);
  };
  img.src = src;
  modal.classList.add('active');
  setImageZoom(initialScale, focusArea);
  initPinchZoomGesture();
}

function closeImageZoom() {
  const modal = document.getElementById('imageZoomModal');
  if (modal) modal.classList.remove('active');
}

function setImageZoom(scale, focusArea = null) {
  currentImageZoom = Math.max(1, Math.min(4, Number(scale) || 1));
  const img = document.getElementById('imageZoomTarget');
  const canvas = document.getElementById('imageZoomCanvas');
  const viewport = document.getElementById('imageZoomViewport');
  const btnText = document.getElementById('btnZoomLevelText');

  if (img) {
    img.style.width = `${Math.round(currentImageZoom * 100)}%`;
  }
  if (canvas) {
    canvas.style.justifyContent = currentImageZoom > 1 ? 'flex-start' : 'center';
    canvas.style.alignItems = currentImageZoom > 1 ? 'flex-start' : 'center';
  }
  if (btnText) {
    btnText.textContent = `${Math.round(currentImageZoom * 100)}%`;
  }

  if (viewport && currentImageZoom > 1) {
    setTimeout(() => {
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      if (focusArea === 'right' || focusArea === 'top-right') {
        viewport.scrollLeft = maxScrollLeft;
        viewport.scrollTop = 0;
      } else if (focusArea === 'bottom') {
        viewport.scrollLeft = Math.round(maxScrollLeft * 0.5);
        viewport.scrollTop = maxScrollTop;
      } else if (focusArea === 'center') {
        viewport.scrollLeft = Math.round(maxScrollLeft * 0.5);
        viewport.scrollTop = Math.round(maxScrollTop * 0.35);
      }
    }, 30);
  }
}

function adjustImageZoom(delta) {
  setImageZoom(Math.round((currentImageZoom + delta) * 10) / 10);
}

function toggleDoubleTapZoom(e) {
  if (e) e.preventDefault();
  if (currentImageZoom > 1.2) {
    setImageZoom(1);
  } else {
    setImageZoom(2.2, 'right');
  }
}

let isPinchListenerBound = false;
function initPinchZoomGesture() {
  if (isPinchListenerBound) return;
  const viewport = document.getElementById('imageZoomViewport');
  if (!viewport) return;
  isPinchListenerBound = true;

  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist = Math.hypot(dx, dy);
      pinchStartZoom = currentImageZoom;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartDist;
      setImageZoom(pinchStartZoom * ratio);
    }
  }, { passive: true });
}
