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

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  updateAdminHeaderUI();
  initTimeOptions();
  await loadBookingWindow();
  await loadMonthData(calYear, calMonth);
  renderCalendar();
  renderDayTimeline(selectedDate);
  loadNotices();
  loadSetlists();
  loadMembers();
});

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
async function loadBookingWindow() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    const data = await res.json();
    if (data.success && data.window) {
      bookingWindow = data.window;
      document.getElementById('windowNoticeText').textContent = 
        `매주 일요일 기준 ${bookingWindow.open_weeks}주 (다음 주 토요일 ${bookingWindow.max_allowed_date}까지 예약 오픈)`;
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
      alert(`🔒 아직 예약이 오픈되지 않은 기간입니다.\n\n매주 일요일에 다음 주 예약이 오픈됩니다!\n(현재 예약 가능 기간: ~ ${bookingWindow.max_allowed_date}까지)`);
      return;
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
    document.getElementById('selectedDateSub').innerHTML = `<span style="color:#f87171;">🔒 미오픈 (매주 일요일에 다음 주 순차 오픈)</span>`;
    btnBook.disabled = true;
  } else if (isPast) {
    document.getElementById('selectedDateSub').innerHTML = `<span style="color:var(--text-dim);">지난 일정입니다</span>`;
    btnBook.disabled = true;
  } else {
    document.getElementById('selectedDateSub').innerHTML = `<span style="color:var(--success);">✨ 원하는 시간에 자유롭게 예약 가능</span>`;
    btnBook.disabled = false;
  }

  const listEl = document.getElementById('dayTimelineList');
  const dayRes = monthReservations.filter(r => r.res_date === dateStr);

  if (dayRes.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎵</div>
        <div class="empty-text">
          등록된 합주 예약이 없습니다.<br>
          ${!isLocked && !isPast ? '<span style="color:#c084fc;">[➕ 합주 예약] 버튼을 눌러 먼저 예약해 보세요!</span>' : ''}
        </div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = dayRes.map(r => `
    <div class="timeline-item">
      <div class="timeline-info">
        <div class="timeline-time">
          <span>⏰ ${r.start_time} ~ ${r.end_time}</span>
          <span class="badge-team">${escapeHtml(r.band_team || '전체합주')}</span>
          <span class="badge-part">${escapeHtml(r.part || '파트')}</span>
        </div>
        <div class="timeline-team">
          👤 ${escapeHtml(r.member_name)} 님 예약
        </div>
        ${r.purpose ? `<div class="timeline-sub">💡 ${escapeHtml(r.purpose)}</div>` : ''}
      </div>
      <div>
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
  document.getElementById('bookBandTeam').value = name;
}

// 6. 예약 모달 열기 및 제출
function openBookingModalForSelectedDate() {
  document.getElementById('bookDate').value = selectedDate;
  document.getElementById('bookMemberName').value = '';
  document.getElementById('bookBandTeam').value = '';
  document.getElementById('bookPurpose').value = '';
  document.getElementById('bookPin').value = '';
  
  refreshTimeSlotsForDate(selectedDate);
  openModal('bookingModal');
}

async function submitBooking(e) {
  e.preventDefault();
  const body = {
    res_date: document.getElementById('bookDate').value,
    start_time: document.getElementById('bookStartTime').value,
    end_time: document.getElementById('bookEndTime').value,
    member_name: document.getElementById('bookMemberName').value.trim(),
    band_team: document.getElementById('bookBandTeam').value.trim() || '전체합주',
    part: document.getElementById('bookPart').value,
    purpose: document.getElementById('bookPurpose').value.trim(),
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
    alert('🎉 합주실 예약이 성공적으로 완료되었습니다!');
    closeModal('bookingModal');

    // 캘린더 데이터 갱신
    await loadMonthData(calYear, calMonth);
    renderCalendar();
    renderDayTimeline(selectedDate);
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
  document.getElementById('cfgAdminPin').value = '';
  openModal('settingsModal');
}

async function submitSettings(e) {
  e.preventDefault();
  const body = {
    open_weeks: Number(document.getElementById('cfgOpenWeeks').value),
    reset_day: Number(document.getElementById('cfgResetDay').value),
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
    alert('👑 관리자 모드가 활성화되었습니다!\n합주 강제 취소 및 부원 수정/삭제 권한이 부여되었습니다.');
    renderDayTimeline(selectedDate);
    loadMembers();
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

function logoutAdmin() {
  if (!confirm('관리자 모드를 해제하시겠습니까?')) return;
  sessionStorage.removeItem('oppaen_admin_pin');
  adminPin = '';
  isAdmin = false;
  updateAdminHeaderUI();
  alert('관리자 모드가 해제되었습니다.');
  renderDayTimeline(selectedDate);
  loadMembers();
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

function openEditMemberModal(id, name, part, phone, role) {
  document.getElementById('editMemId').value = id;
  document.getElementById('editMemName').value = name;
  document.getElementById('editMemPart').value = part;
  document.getElementById('editMemPhone').value = phone || '';
  document.getElementById('editMemRole').value = role || '회원';
  openModal('editMemberModal');
}

async function submitEditMember(e) {
  e.preventDefault();
  const body = {
    id: Number(document.getElementById('editMemId').value),
    name: document.getElementById('editMemName').value.trim(),
    part: document.getElementById('editMemPart').value,
    phone: document.getElementById('editMemPhone').value.trim(),
    role: document.getElementById('editMemRole').value,
    pin: adminPin
  };

  try {
    const res = await fetch(`${API_BASE}/api/members/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();
    if (!result.success) {
      alert(result.message || '수정 실패');
      return;
    }
    alert(result.message);
    closeModal('editMemberModal');
    loadMembers();
  } catch (err) {
    alert(`수정 오류: ${err.message}`);
  }
}

async function deleteMember(id, name) {
  if (!confirm(`정말 '${name}' 부원을 명부에서 삭제하시겠습니까?`)) return;

  try {
    const res = await fetch(`${API_BASE}/api/members/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, pin: adminPin })
    });
    const result = await res.json();
    if (!result.success) {
      alert(result.message || '삭제 실패');
      return;
    }
    alert(result.message);
    loadMembers();
  } catch (err) {
    alert(`삭제 오류: ${err.message}`);
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

// 11. 부원 명부 로드
async function loadMembers() {
  const container = document.getElementById('memberGrid');
  try {
    const res = await fetch(`${API_BASE}/api/members`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const members = data.members || [];
    if (members.length === 0) {
      container.innerHTML = '<div class="empty-state" style="grid-column:span 2;"><div class="empty-icon">👥</div><div class="empty-text">등록된 부원이 없습니다.</div></div>';
      return;
    }

    const partIcons = {
      '보컬': '🎤', '일렉기타': '🎸', '어쿠스틱기타': '🪕',
      '베이스': '🎸', '드럼': '🥁', '건반': '🎹'
    };

    function getRoleBadge(role) {
      if (role === '운영자') return '<span class="member-role" style="color:#f59e0b; font-weight:800;">[운영자 👑]</span>';
      if (role === '운영진') return '<span class="member-role" style="color:#00dfd8; font-weight:700;">[운영진 ⭐]</span>';
      return '<span class="member-role" style="color:var(--text-dim);">[회원]</span>';
    }

    container.innerHTML = members.map(m => `
      <div class="member-card">
        <div class="member-avatar">${partIcons[m.part] || '🎵'}</div>
        <div class="member-details">
          <div class="member-name">
            ${escapeHtml(m.name)}
            ${getRoleBadge(m.role || '회원')}
          </div>
          <div class="member-part">${m.part} ${m.phone ? `<span style="font-size:10px;color:var(--text-dim);">(${escapeHtml(m.phone)})</span>` : ''}</div>
        </div>
        ${isAdmin ? `
          <div class="member-card-admin-actions">
            <button class="btn-mem-action edit" title="부원 수정" onclick="openEditMemberModal(${m.id}, '${escapeHtml(m.name)}', '${escapeHtml(m.part)}', '${escapeHtml(m.phone || '')}', '${escapeHtml(m.role || '회원')}')">✏️</button>
            <button class="btn-mem-action del" title="부원 삭제" onclick="deleteMember(${m.id}, '${escapeHtml(m.name)}')">🗑️</button>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('부원 로드 실패:', err);
  }
}

function openMemberModal() {
  document.getElementById('memName').value = '';
  document.getElementById('memPhone').value = '';
  openModal('memberModal');
}

async function submitMember(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('memName').value.trim(),
    part: document.getElementById('memPart').value,
    phone: document.getElementById('memPhone').value.trim(),
    role: document.getElementById('memRole').value
  };

  try {
    const res = await fetch(`${API_BASE}/api/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await res.json();
    if (!result.success) {
      alert(result.message || '등록 실패');
      return;
    }
    alert(result.message);
    closeModal('memberModal');
    loadMembers();
  } catch (err) {
    alert(`오류: ${err.message}`);
  }
}

// 12. 탭 전환
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
