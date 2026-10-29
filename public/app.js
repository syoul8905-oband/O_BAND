/**
 * 오늘부터 밴드부 (오뺀) - 모바일 전용 캘린더 & 합주실 예약 시스템
 */

const API_BASE = '';
let todayStr = getTodayString();
let selectedDate = todayStr;

// 캘린더 표시 상태
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1; // 1 ~ 12

// 데이터 캐시
let bookingWindow = {
  today: todayStr,
  max_allowed_date: todayStr,
  open_weeks: 2,
  reset_day: 0,
  quick_teams: '전체합주, 정기 1팀, 공연 2팀, 어쿠스틱 유닛, 개인연습',
  description: ''
};
let monthReservations = [];

// 관리자 모드 상태
let adminPin = sessionStorage.getItem('oppaen_admin_pin') || '';
let isAdmin = Boolean(adminPin);

function updateAdminHeaderUI() {
  const btnLogin = document.getElementById('btnAdminLogin');
  const badgeActive = document.getElementById('adminHeaderBadge');
  if (!btnLogin || !badgeActive) return;

  if (isAdmin) {
    btnLogin.style.display = 'none';
    badgeActive.style.display = 'flex';
  } else {
    btnLogin.style.display = 'flex';
    badgeActive.style.display = 'none';
  }
}

// 앱 시작 즉시 초기화
document.addEventListener('DOMContentLoaded', async () => {
  try {
    updateAdminHeaderUI();
    initCalendarSwipe();
    initSleepModeTracker();

    // 1. 달력 및 오늘 현황 즉시 동기 렌더링 (접속하자마자 0초 만에 달력 표출)
    renderCalendar();
    renderDayTimeline(selectedDate);
    refreshTimeSlotsForDate(selectedDate);
    renderTeamQuickChips();

    // 2. 비동기 데이터 로드 및 달력 실시간 업데이트
    await loadBookingWindow();
    await loadMonthData(calYear, calMonth);
    renderCalendar();
    renderDayTimeline(selectedDate);

    // 3. 기타 탭 데이터 백그라운드 프리로드
    loadNotices();
    loadSetlists();
  } catch (err) {
    console.error('초기 로딩 중 오류 발생:', err);
    // 오류가 발생해도 달력은 무조건 표출
    renderCalendar();
    renderDayTimeline(selectedDate);
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

// 날짜 헬퍼
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const d = new Date();
  const day = d.getDay(); // 0(일) ~ 6(토)
  const diff = day === 0 ? 7 : (7 - day);
  const nextSun = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  const m = String(nextSun.getMonth() + 1).padStart(2, '0');
  const dd = String(nextSun.getDate()).padStart(2, '0');
  return `${m}월 ${dd}일(일)`;
}

async function loadBookingWindow() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    const data = await res.json();
    if (data.success && data.window) {
      bookingWindow = data.window;
      renderTeamQuickChips();
      initKakaoSDK();
      const noticeEl = document.getElementById('windowNoticeText');
      if (noticeEl) {
        if (isAdmin) {
          noticeEl.innerHTML = `👑 <strong>관리자 모드</strong>: 모든 날짜 선예약 가능 &nbsp;|&nbsp; <span style="text-decoration:underline; cursor:pointer;" onclick="openSettingsModal()">[⚙️ 오픈기간 설정]</span>`;
        } else {
          const nextReset = getNextResetDateStr();
          noticeEl.textContent = `매주 일요일 리셋 (현재 ${bookingWindow.max_allowed_date}까지 오픈 / 다음 오픈: ${nextReset})`;
        }
      }
    }
  } catch (err) {
    console.warn('설정 로드 실패, 기본값 사용:', err);
  }
}

// 2. 월간 예약 데이터 불러오기
async function loadMonthData(year, month) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  try {
    const res = await fetch(`${API_BASE}/api/reservations?month=${monthStr}`);
    const data = await res.json();
    if (data.success) {
      monthReservations = data.reservations || [];
    }
  } catch (err) {
    console.error('월간 예약 로드 실패:', err);
  }
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

  // 당일 예약 현황 칩들
  const dayRes = monthReservations.filter(r => r.res_date === dateStr);
  const resContainer = document.createElement('div');
  resContainer.className = 'cal-res-container';

  if (dayRes.length > 0) {
    // 최대 2건까지 칩으로 표출
    dayRes.slice(0, 2).forEach(r => {
      const pill = document.createElement('div');
      pill.className = 'cal-res-pill';
      pill.textContent = `${r.start_time} ${r.band_team || r.member_name}`;
      resContainer.appendChild(pill);
    });

    if (dayRes.length > 2) {
      const more = document.createElement('div');
      more.className = 'cal-res-more';
      more.textContent = `+${dayRes.length - 2}건`;
      resContainer.appendChild(more);
    }
  }

  cell.appendChild(resContainer);

  // 셀 클릭 이벤트
  cell.onclick = () => {
    if (isLocked) {
      if (isAdmin) {
        // 관리자 모드 가동 시 잠긴 날짜 프리패스 선택 허용
        console.log(`[Admin Bypass] 잠긴 날짜(${dateStr}) 관리자 권한 선택`);
      } else {
        alert(`🔒 아직 예약이 오픈되지 않은 기간입니다.\n\n매주 일요일에 다음 주 예약이 오픈됩니다!\n(현재 예약 가능 기간: ~ ${bookingWindow.max_allowed_date}까지)`);
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
  renderCalendar();
}

async function goToToday() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
  selectedDate = todayStr;
  await loadMonthData(calYear, calMonth);
  renderCalendar();
  renderDayTimeline(selectedDate);
}

// 4. 선택된 날짜 상세 타임라인 렌더링
function renderDayTimeline(dateStr) {
  const info = formatDateDisplay(dateStr);
  document.getElementById('selectedDateTitle').textContent = `📅 ${info.full} 합주 현황`;
  
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
  const dayRes = monthReservations.filter(r => r.res_date === dateStr);

  if (dayRes.length === 0) {
    let emptyHint = '';
    if (isAdmin) {
      emptyHint = '<span style="color:#fbbf24;">[➕ 합주 예약] 버튼을 눌러 관리자 선예약을 등록할 수 있습니다.</span>';
    } else if (isLocked) {
      emptyHint = '<span style="color:#f87171;">🔒 매주 일요일에 예약이 순차 오픈됩니다.</span>';
    } else if (!isPast) {
      emptyHint = '<span style="color:#c084fc;">[➕ 합주 예약] 버튼을 눌러 먼저 예약해 보세요!</span>';
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

  // 당일 예약 건수 조회 (확정 건만)
  currentDayBookings = monthReservations.filter(r => r.res_date === targetDate && r.status === 'confirmed');
  currentDayBookings.sort((a, b) => a.start_time.localeCompare(b.start_time));

  // 상단 예약 완료 알림 박스 표출
  if (alertBox) {
    if (currentDayBookings.length === 0) {
      alertBox.style.background = 'rgba(16, 185, 129, 0.1)';
      alertBox.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      alertBox.innerHTML = '<span style="color:var(--success); font-weight:800;">✨ 해당 날짜는 모든 시간대(06:00 ~ 24:00) 예약 가능합니다.</span>';
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

// 팀명 빠른 선택 메뉴 관리자 수정 모달
function openTeamChipsModal() {
  const inputTeams = document.getElementById('inputQuickTeams');
  const inputPin = document.getElementById('inputTeamChipsPin');
  if (inputTeams) {
    inputTeams.value = bookingWindow.quick_teams || '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습';
  }
  if (inputPin) {
    inputPin.value = isAdmin ? (adminPin || '9999') : '';
  }
  openModal('teamChipsModal');
}

async function submitTeamChips(e) {
  e.preventDefault();
  const teamsVal = document.getElementById('inputQuickTeams').value.trim();
  const pinVal = document.getElementById('inputTeamChipsPin').value.trim();

  if (!teamsVal) {
    alert('최소 1개 이상의 팀명을 입력해 주세요.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quick_teams: teamsVal,
        pin: pinVal
      })
    });
    const result = await res.json();
    if (!result.success) {
      alert(result.message || '저장 실패');
      return;
    }

    bookingWindow.quick_teams = teamsVal;
    renderTeamOptions();
    closeModal('teamChipsModal');
    alert('🎉 팀명 메뉴가 성공적으로 변경되었습니다!');
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

// 6. 예약 모달 열기 및 제출
function openBookingModalForSelectedDate() {
  document.getElementById('bookDate').value = selectedDate;
  document.getElementById('bookMemberName').value = '';
  document.getElementById('bookPin').value = isAdmin ? (adminPin || '9999') : '';
  
  renderTeamOptions();
  refreshTimeSlotsForDate(selectedDate);
  openModal('bookingModal');
}

async function submitBooking(e) {
  e.preventDefault();
  const teamEl = document.getElementById('bookBandTeam');
  const selectedTeam = teamEl ? teamEl.value.trim() : '전체합주';

  const body = {
    res_date: document.getElementById('bookDate').value,
    start_time: document.getElementById('bookStartTime').value,
    end_time: document.getElementById('bookEndTime').value,
    member_name: document.getElementById('bookMemberName').value.trim(),
    band_team: selectedTeam === '__custom__' ? '전체합주' : selectedTeam,
    part: '합주',
    purpose: '',
    pin: document.getElementById('bookPin').value.trim()
  };

  if (body.start_time >= body.end_time) {
    alert('종료 시간은 시작 시간보다 늦어야 합니다.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();
    if (!result.success) {
      alert(result.message || '예약 실패');
      return;
    }
    closeModal('bookingModal');

    // 캘린더 데이터 갱신
    await loadMonthData(calYear, calMonth);
    renderCalendar();
    renderDayTimeline(selectedDate);

    // 예약 완료 & 카톡 공유 모달 표출
    openBookingSuccessModal({
      res_date: body.res_date,
      start_time: body.start_time,
      end_time: body.end_time,
      band_team: body.band_team,
      member_name: body.member_name
    });
  } catch (err) {
    alert(`오류 발생: ${err.message}`);
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
    const res = await fetch(`${API_BASE}/api/reservations/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), pin: pin })
    });
    const result = await res.json();
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

// 8. 관리자 예약 조건 설정 모달
function openSettingsModal() {
  document.getElementById('cfgOpenWeeks').value = String(bookingWindow.open_weeks || 2);
  document.getElementById('cfgResetDay').value = String(bookingWindow.reset_day || 0);
  const kakaoInput = document.getElementById('cfgKakaoJsKey');
  if (kakaoInput) kakaoInput.value = bookingWindow.kakao_js_key || '';
  document.getElementById('cfgAdminPin').value = isAdmin ? (adminPin || '9999') : '';
  openModal('settingsModal');
}

async function submitSettings(e) {
  e.preventDefault();
  const kakaoInput = document.getElementById('cfgKakaoJsKey');
  const body = {
    open_weeks: Number(document.getElementById('cfgOpenWeeks').value),
    reset_day: Number(document.getElementById('cfgResetDay').value),
    kakao_js_key: kakaoInput ? kakaoInput.value.trim() : '',
    pin: document.getElementById('cfgAdminPin').value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();
    if (!result.success) {
      alert(result.message || '설정 저장 실패');
      return;
    }
    alert('⚙️ 관리자 예약 기간 조건이 저장되었습니다!');
    closeModal('settingsModal');

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
    const res = await fetch(`${API_BASE}/api/notices`);
    const data = await res.json();
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
    const res = await fetch(`${API_BASE}/api/notices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();
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
    pin = adminPin;
  } else {
    pin = prompt('공지 작성 시 입력했던 4자리 비밀번호(PIN)를 입력하세요:');
    if (!pin) return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/notices/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, pin: pin })
    });
    const result = await res.json();
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
// 관리자 전용 제어 함수들 (Admin Mode Functions)
// -------------------------------------------------------------
function openAdminLoginModal() {
  document.getElementById('adminInputPin').value = '';
  openModal('adminLoginModal');
}

async function submitAdminLogin(e) {
  e.preventDefault();
  const pin = document.getElementById('adminInputPin').value.trim();
  try {
    const res = await fetch(`${API_BASE}/api/admin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || '관리자 비밀번호가 일치하지 않습니다.');
      return;
    }
    adminPin = pin;
    isAdmin = true;
    sessionStorage.setItem('oppaen_admin_pin', pin);
    updateAdminHeaderUI();
    closeModal('adminLoginModal');
    alert('👑 관리자 모드가 활성화되었습니다!\n합주 강제 취소 및 전체 날짜 선예약/기간 설정 권한이 부여되었습니다.');
    await loadBookingWindow();
    renderCalendar();
    renderDayTimeline(selectedDate);
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

async function logoutAdmin() {
  if (!confirm('관리자 모드를 해제하시겠습니까?')) return;
  sessionStorage.removeItem('oppaen_admin_pin');
  adminPin = '';
  isAdmin = false;
  updateAdminHeaderUI();
  alert('관리자 모드가 해제되었습니다.');
  await loadBookingWindow();
  renderCalendar();
  renderDayTimeline(selectedDate);
}

async function adminForceCancel(id, timeRange, name) {
  if (!confirm(`[관리자 권한 강제 취소]\n\n${name}님의 예약(${timeRange})을 강제 취소하시겠습니까?\n취소 시 해당 타임슬롯이 즉시 반환됩니다.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/reservations/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), pin: adminPin })
    });
    const result = await res.json();
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
    const res = await fetch(`${API_BASE}/api/setlists`);
    const data = await res.json();
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
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('곡 로드 실패:', err);
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
    const res = await fetch(`${API_BASE}/api/setlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();
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

function shareReservationKakao(info) {
  const isKakaoReady = ensureKakaoInitialized();

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

  const shareUrl = window.location.origin && window.location.origin.startsWith('http')
    ? window.location.origin
    : 'https://o-band.onrender.com';

  const shareText = `[오늘부터 밴드부 🎸 합주실 예약 안내]\n\n📅 일시: ${info.res_date}${dayStr} ${info.start_time} ~ ${info.end_time}${durationText}\n🎸 팀명: ${info.band_team || '전체합주'}\n👤 예약자: ${info.member_name} 님\n📍 장소: 오뺀 합주실\n\n👉 일정 및 세부 사항 확인:\n${shareUrl}`;

  // 1. 카카오톡 공식 SDK 직접 연동 (카톡 앱 즉시 실행 및 채팅방/친구 선택 창 바로 띄우기)
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
      // PC에서 브라우저 팝업이 차단된 경우 명확하게 안내
      if (err && err.message && err.message.includes('focus')) {
        alert('⚠️ PC 브라우저의 [팝업 차단]으로 인해 카카오톡 공유창이 열리지 못했습니다!\n브라우저 주소창 우측 상단의 팝업 차단 아이콘을 눌러 "팝업 항상 허용"을 선택해 주세요.');
        return;
      }
      alert(`⚠️ 카카오톡 연결 실패: ${err.message || err}`);
      return;
    }
  }

  // 2. SDK 로드 실패 시 명확한 경고
  alert('⚠️ 카카오톡 SDK를 로드할 수 없습니다. 네트워크 연결을 확인해 주세요.');
}

function copyShareTextFallback(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 카톡 공유 문구가 복사되었습니다!\n단톡방에 붙여넣기(Ctrl+V)하세요.');
    }).catch(() => {
      legacyCopyText(text);
    });
  } else {
    legacyCopyText(text);
  }
}

function legacyCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('📋 카톡 공유 문구가 복사되었습니다!\n단톡방에 붙여넣기(Ctrl+V)하세요.');
  } catch (e) {
    prompt('아래 문구를 복사하여 카카오톡에 붙여넣으세요:', text);
  }
  document.body.removeChild(ta);
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
  if (isSleeping) return;
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = setTimeout(enterSleepMode, SLEEP_TIMEOUT_MS);
}

function enterSleepMode() {
  isSleeping = true;
  const overlay = document.getElementById('sleepModeOverlay');
  if (overlay) overlay.classList.add('active');
  console.log('🌙 오뺀 절전 모드 가동 (트래픽 차단)');
}

async function wakeFromSleep() {
  const overlay = document.getElementById('sleepModeOverlay');
  if (overlay) overlay.classList.remove('active');
  isSleeping = false;
  resetSleepTimer();

  // 최신 데이터 갱신
  try {
    await loadMonthData(calYear, calMonth);
    renderCalendar();
    renderDayTimeline(selectedDate);
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

// 16. 바탕화면 바로가기 / 홈 화면에 앱 추가 시스템
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('btnAutoInstallText');
  if (btn) btn.textContent = '✨ 홈 화면 / 바탕화면에 추가하기';
  const icon = document.getElementById('btnAutoInstallIcon');
  if (icon) icon.textContent = '📱';
});

function handleShortcutNavClick() {
  const userAgent = navigator.userAgent || '';
  const isKakao = /KAKAOTALK/i.test(userAgent);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(userAgent);

  // 1) 지원 브라우저(PWA install prompt)인 경우 즉시 프롬프트 실행
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('🎉 바탕화면에 바로가기가 추가되었습니다!');
      }
      deferredInstallPrompt = null;
    });
    return;
  }

  // 2) 카카오톡 인앱 브라우저인 경우: 외부 브라우저 탈출 우선 시도
  if (isKakao) {
    escapeKakaoToExternalBrowser();
    openShortcutModal();
    return;
  }

  // 3) PC 환경인 경우 .url 파일 즉각 다운로드
  if (!isMobile) {
    downloadDesktopShortcut();
    showToast('📥 바탕화면 바로가기 파일이 다운로드되었습니다!');
  }

  // 4) 모달 안내창 표출
  openShortcutModal();
}

function openShortcutModal() {
  const userAgent = navigator.userAgent || '';
  const isKakao = /KAKAOTALK/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isMobile = isAndroid || isIOS;

  const btnText = document.getElementById('btnAutoInstallText');
  const btnIcon = document.getElementById('btnAutoInstallIcon');
  const kakaoTip = document.getElementById('shortcutKakaoTip');

  if (isKakao) {
    if (btnText) btnText.textContent = '🚀 크롬 / 기본 브라우저로 열기';
    if (btnIcon) btnIcon.textContent = '🌐';
    if (kakaoTip) kakaoTip.style.display = 'block';
  } else {
    if (kakaoTip) kakaoTip.style.display = 'none';
    if (deferredInstallPrompt) {
      if (btnText) btnText.textContent = '✨ 홈 화면에 앱 추가하기 (원클릭)';
      if (btnIcon) btnIcon.textContent = '📱';
    } else if (!isMobile) {
      if (btnText) btnText.textContent = '💾 바탕화면 바로가기 (.url) 다운로드';
      if (btnIcon) btnIcon.textContent = '🖥️';
    } else {
      if (btnText) btnText.textContent = '📲 스마트폰 홈 화면에 추가';
      if (btnIcon) btnIcon.textContent = '⚡';
    }
  }

  openModal('shortcutModal');
}

function executeShortcutCreation() {
  const userAgent = navigator.userAgent || '';
  const isKakao = /KAKAOTALK/i.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isMobile = isAndroid || isIOS;

  // 1. 카카오톡 인앱 브라우저: 외부 브라우저(크롬/사파리)로 탈출 실행
  if (isKakao) {
    showToast('🌐 크롬 / 기본 브라우저로 이동합니다...');
    escapeKakaoToExternalBrowser();
    return;
  }

  // 2. 모바일 브라우저(크롬/삼성인터넷 등)에서 PWA 설치 프롬프트가 대기 중인 경우
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('🎉 홈 화면에 앱 바로가기가 추가되었습니다!');
        closeModal('shortcutModal');
      }
      deferredInstallPrompt = null;
    });
    return;
  }

  // 3. 모바일 환경인데 프롬프트가 지원되지 않는 경우 (절대 .url 파일 다운로드 금지!)
  if (isMobile) {
    if (isIOS) {
      alert('📱 아이폰에서는 사파리 하단의 [공유 📤] 버튼을 누른 후 [홈 화면에 추가 ➕]를 선택해 주세요!');
    } else {
      alert('📱 브라우저 우측 상단 메뉴 [⋮]을 누른 후 [홈 화면에 추가] 또는 [앱 설치]를 선택해 주세요!');
    }
    return;
  }

  // 4. 오직 PC 데스크톱 환경에서만 .url 파일 다운로드 실행
  downloadDesktopShortcut();
  showToast('📥 바탕화면 바로가기 파일이 다운로드되었습니다!');
}

function escapeKakaoToExternalBrowser() {
  const userAgent = navigator.userAgent || '';
  const isAndroid = /Android/i.test(userAgent);
  const host = window.location.host;
  const path = window.location.pathname + window.location.search;
  const fullUrl = window.location.href;

  if (isAndroid) {
    // 안드로이드 크롬 패키지 지정 인텐트 (갤럭시/안드로이드 카톡 탈출 표준)
    const chromeIntent = `intent://${host}${path}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;end`;
    const genericIntent = `intent://${host}${path}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;

    // 1차 크롬 인텐트 실행
    window.location.href = chromeIntent;

    // 반응 없을 시 대비 0.5초 후 일반 브라우저 인텐트
    setTimeout(() => {
      window.location.href = genericIntent;
    }, 500);
  } else {
    // iOS 사파리 탈출 스킴
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(fullUrl)}`;
  }
}

function downloadDesktopShortcut() {
  const targetUrl = window.location.origin || 'https://o-band.onrender.com';
  const fileContent = `[InternetShortcut]\r\nURL=${targetUrl}/\r\nIconIndex=0\r\nHotKey=0\r\nIDList=\r\n[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,11\r\n`;
  const blob = new Blob([fileContent], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '오늘부터밴드부_오뺀.url';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
