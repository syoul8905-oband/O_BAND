/**
 * 오늘부터 밴드부 (오뺀) - 모바일 전용 프론트엔드 로직
 */

const API_BASE = ''; // 로컬 서버 또는 클라우드 API 직결
let currentDate = getTodayString();
let reservationsCache = [];

// 8개 표준 합주 타임슬롯 정의
const STANDARD_SLOTS = [
  { start: '08:00', end: '10:00', label: '오전 1 (08:00 ~ 10:00)' },
  { start: '10:00', end: '12:00', label: '오전 2 (10:00 ~ 12:00)' },
  { start: '12:00', end: '14:00', label: '점심 (12:00 ~ 14:00)' },
  { start: '14:00', end: '16:00', label: '오후 1 (14:00 ~ 16:00)' },
  { start: '16:00', end: '18:00', label: '오후 2 (16:00 ~ 18:00)' },
  { start: '18:00', end: '20:00', label: '저녁 1 (18:00 ~ 20:00)' },
  { start: '20:00', end: '22:00', label: '저녁 2 (20:00 ~ 22:00) 🎸 메인' },
  { start: '22:00', end: '24:00', label: '심야 (22:00 ~ 24:00)' },
];

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  renderDateSelector();
  initTimeOptions();
  loadReservations(currentDate);
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
    dayNum: date,
    dayName: dayName,
    isWeekend: d.getDay() === 0 || d.getDay() === 6
  };
}

// 1. 날짜 퀵 셀렉터 렌더링 (오늘부터 14일)
function renderDateSelector() {
  const container = document.getElementById('datePillContainer');
  container.innerHTML = '';
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const info = formatDateDisplay(dateStr);

    const pill = document.createElement('div');
    pill.className = `date-pill ${dateStr === currentDate ? 'active' : ''} ${i === 0 ? 'is-today' : ''}`;
    pill.innerHTML = `
      <span class="day-name">${i === 0 ? '오늘' : (i === 1 ? '내일' : info.dayName)}</span>
      <span class="day-num">${info.dayNum}</span>
    `;
    pill.onclick = () => selectDate(dateStr, pill);
    container.appendChild(pill);
  }

  updateDateTitle(currentDate);
}

function selectDate(dateStr, element) {
  currentDate = dateStr;
  document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
  if (element) element.classList.add('active');
  updateDateTitle(dateStr);
  loadReservations(dateStr);
}

function updateDateTitle(dateStr) {
  const info = formatDateDisplay(dateStr);
  document.getElementById('currentDateTitle').textContent = `📅 ${info.full} 합주 예약`;
  document.getElementById('currentDateSub').textContent = `선택된 일자의 합주실 타임슬롯 현황`;
}

// 2. 예약 목록 불러오기 및 타임슬롯 매핑
async function loadReservations(dateStr) {
  const listEl = document.getElementById('timeslotList');
  listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><div class="empty-text">예약 일정을 조회하고 있습니다...</div></div>';

  try {
    const res = await fetch(`${API_BASE}/api/reservations?date=${dateStr}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || '조회 실패');

    reservationsCache = data.reservations || [];
    renderTimeslots(reservationsCache);
  } catch (err) {
    console.error('예약 로드 실패:', err);
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-text">예약 데이터를 불러오지 못했습니다.<br><span style="font-size:12px;color:var(--text-dim);">${err.message}</span></div>
      </div>
    `;
  }
}

function renderTimeslots(reservations) {
  const listEl = document.getElementById('timeslotList');
  listEl.innerHTML = '';

  STANDARD_SLOTS.forEach(slot => {
    // 겹치는 예약 찾기
    const booked = reservations.find(r => {
      return !(r.end_time <= slot.start || r.start_time >= slot.end);
    });

    const card = document.createElement('div');
    card.className = `timeslot-card ${booked ? 'booked' : ''}`;

    if (booked) {
      card.innerHTML = `
        <div class="timeslot-info">
          <div class="timeslot-time">
            <span>⏰ ${slot.start} ~ ${slot.end}</span>
            <span class="badge-part">${booked.part || '파트미지정'}</span>
            <span class="badge-team">${booked.band_team || '전체합주'}</span>
          </div>
          <div class="timeslot-booked-details">
            <span>👤 ${escapeHtml(booked.member_name)}</span>
            ${booked.purpose ? `<span style="color:var(--text-sub); font-size:12px;">| ${escapeHtml(booked.purpose)}</span>` : ''}
          </div>
        </div>
        <div>
          <button class="slot-action-btn cancel" onclick="openCancelModal(${booked.id}, '${booked.start_time}~${booked.end_time}', '${escapeHtml(booked.member_name)}')">
            취소
          </button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="timeslot-info">
          <div class="timeslot-time">
            <span>⏰ ${slot.start} ~ ${slot.end}</span>
          </div>
          <div class="timeslot-desc" style="color:var(--success);">✨ 예약 가능</div>
        </div>
        <div>
          <button class="slot-action-btn book" onclick="openSlotBooking('${slot.start}', '${slot.end}')">
            예약하기
          </button>
        </div>
      `;
    }
    listEl.appendChild(card);
  });
}

// 3. 예약 모달 열기 / 제출
function openSlotBooking(start, end) {
  document.getElementById('bookDate').value = currentDate;
  document.getElementById('bookStartTime').value = start;
  document.getElementById('bookEndTime').value = end;
  document.getElementById('bookMemberName').value = '';
  document.getElementById('bookPurpose').value = '';
  document.getElementById('bookPin').value = '';
  openModal('bookingModal');
}

function openCustomBookingModal() {
  document.getElementById('bookDate').value = currentDate;
  document.getElementById('bookStartTime').value = '18:00';
  document.getElementById('bookEndTime').value = '20:00';
  document.getElementById('bookMemberName').value = '';
  document.getElementById('bookPurpose').value = '';
  document.getElementById('bookPin').value = '';
  openModal('bookingModal');
}

async function submitBooking(e) {
  e.preventDefault();
  const body = {
    res_date: document.getElementById('bookDate').value,
    start_time: document.getElementById('bookStartTime').value,
    end_time: document.getElementById('bookEndTime').value,
    member_name: document.getElementById('bookMemberName').value.trim(),
    part: document.getElementById('bookPart').value,
    band_team: document.getElementById('bookBandTeam').value,
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
    selectDate(body.res_date);
  } catch (err) {
    alert(`오류 발생: ${err.message}`);
  }
}

// 4. 예약 취소 모달 / 제출
function openCancelModal(id, timeRange, name) {
  document.getElementById('cancelResId').value = id;
  document.getElementById('cancelPin').value = '';
  document.getElementById('cancelTargetDesc').textContent = `[${currentDate} ${timeRange}] ${name}님의 예약을 취소하시겠습니까?`;
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
    loadReservations(currentDate);
  } catch (err) {
    alert(`취소 오류: ${err.message}`);
  }
}

// 5. 공지사항 로드 및 렌더링
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
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">공지사항을 불러오지 못했습니다.</div></div>';
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
  const pin = prompt('공지 작성 시 입력했던 4자리 비밀번호(PIN)를 입력하세요:');
  if (!pin) return;

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

// 6. 세트리스트 로드
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

// 7. 부원 명부 로드
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

    container.innerHTML = members.map(m => `
      <div class="member-card">
        <div class="member-avatar">${partIcons[m.part] || '🎵'}</div>
        <div class="member-details">
          <div class="member-name">
            ${escapeHtml(m.name)}
            ${m.role && m.role !== '부원' ? `<span class="member-role">[${m.role}]</span>` : ''}
          </div>
          <div class="member-part">${m.part}</div>
        </div>
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

// 8. 탭 전환
function switchTab(tabId, element) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
  if (element) element.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 9. 모달 제어
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

function openShareModal() {
  openModal('shareModal');
}

// 모달 바깥 배경 클릭 시 닫기
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

// 10. 시간대 셀렉트 옵션 초기화 (08:00 ~ 24:00, 30분 단위)
function initTimeOptions() {
  const startSelect = document.getElementById('bookStartTime');
  const endSelect = document.getElementById('bookEndTime');
  if (!startSelect || !endSelect) return;

  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  for (let h = 8; h <= 24; h++) {
    ['00', '30'].forEach(m => {
      if (h === 24 && m === '30') return;
      const timeStr = `${String(h).padStart(2, '0')}:${m}`;
      
      const opt1 = document.createElement('option');
      opt1.value = timeStr;
      opt1.textContent = timeStr;
      startSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = timeStr;
      opt2.textContent = timeStr;
      endSelect.appendChild(opt2);
    });
  }

  startSelect.value = '18:00';
  endSelect.value = '20:00';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
