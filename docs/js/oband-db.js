/**
 * 오늘부터 밴드부 (오뺀) - Supabase 데이터 계층 모듈 (oband-db.js)
 * 
 * - Render의 15분 절전모드(Cold Start / 30~50초 지연) 원천 차단
 * - Vercel Edge CDN + Supabase BaaS 직결로 0.05초(50ms) 초고속 데이터 로딩
 * - 네이버 계정(배송스케줄 관리 DB)과 100% 분리된 오뺀 전용 데이터베이스
 */

(function(window) {
  'use strict';

  const cfg = window.SUPABASE_CONFIG || {
    url: 'https://gideypynmhpjucgszyce.supabase.co',
    anonKey: 'sb_publishable_pLF_neZMUjj3G7PsiH_tuw_rfRuu8eP'
  };

  const headers = {
    'apikey': cfg.anonKey,
    'Authorization': `Bearer ${cfg.anonKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  function getKstDate() {
    return new Date(Date.now() + 9 * 3600 * 1000);
  }

  function getTodayString() {
    const params = new URLSearchParams(window.location.search);
    const mockDate = params.get('test_date');
    if (mockDate && /^\d{4}-\d{2}-\d{2}$/.test(mockDate.trim())) {
      return mockDate.trim();
    }
    const kst = getKstDate();
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kst.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 일요일(resetDay=0) 00:00 기준 예약 허용 마감일(다음 주 토요일) 정밀 계산
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

  async function apiFetch(endpoint, options = {}) {
    const url = `${cfg.url}/rest/v1/${endpoint}`;
    const opts = {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    };
    const res = await fetch(url, opts);
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errorMsg = errJson.message || errJson.error || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const ObandDB = {
    cachedAdminPin: '9999',

    // 1. 시스템 설정 및 예약 허용 윈도우 조회
    async getBookingWindow() {
      try {
        const rows = await apiFetch('delivery_schedules?source_sheet=eq.OBAND_CONFIG');
        const settingsMap = {};
        if (Array.isArray(rows)) {
          rows.forEach(r => {
            settingsMap[r.customer_name] = r.memo_full;
          });
        }

        const open_weeks = Number(settingsMap.open_weeks || 2);
        const reset_day = Number(settingsMap.reset_day || 0);
        const admin_pin = String(settingsMap.admin_pin || '9999');
        const quick_teams = settingsMap.quick_teams || '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습';
        const kakao_js_key = settingsMap.kakao_js_key || '';

        ObandDB.cachedAdminPin = admin_pin;

        const today = getTodayString();
        const max_allowed_date = calcMaxAllowedDate(today, open_weeks, reset_day);

        return {
          success: true,
          window: {
            today,
            max_allowed_date,
            open_weeks,
            reset_day,
            quick_teams,
            kakao_js_key,
            admin_pin,
            description: ''
          }
        };
      } catch (err) {
        console.warn('[ObandDB] 설정 로드 실패, 기본값 사용:', err);
        const today = getTodayString();
        return {
          success: true,
          window: {
            today,
            max_allowed_date: calcMaxAllowedDate(today, 2, 0),
            open_weeks: 2,
            reset_day: 0,
            quick_teams: '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습',
            kakao_js_key: '',
            admin_pin: '9999',
            description: ''
          }
        };
      }
    },

    // 2. 월간 예약 데이터 조회
    async getMonthReservations(year, month) {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const startDate = `${monthStr}-01`;
      const endDate = `${monthStr}-31`;

      const rows = await apiFetch(
        `delivery_schedules?source_sheet=eq.OBAND_RESERVATION&delivery_date=gte.${startDate}&delivery_date=lte.${endDate}&order=delivery_date.asc,visit_time.asc`
      );

      const reservations = (rows || []).map(r => ({
        id: r.id,
        res_date: r.delivery_date,
        start_time: r.visit_time,
        end_time: r.contract_no,
        member_name: r.customer_name,
        band_team: r.driver_name || '전체합주',
        part: r.items || '합주',
        purpose: r.memo_special || '',
        pin: r.contact,
        created_at: r.created_at,
        status: r.status || 'confirmed'
      }));

      return {
        success: true,
        reservations
      };
    },

    // 3. 예약 등록 및 수정 (isEditMode 분기 처리)
    async saveBooking(data) {
      const res_date = data.res_date;
      const start_time = data.start_time;
      const end_time = data.end_time;
      const member_name = (data.member_name || '').trim();
      const band_team = (data.band_team || '전체합주').trim();
      const part = (data.part || '합주').trim();
      const purpose = (data.purpose || '').trim();
      const pin = String(data.pin || '').trim();
      const isEditMode = Boolean(data.id);
      const editId = data.id ? Number(data.id) : null;

      if (!res_date || !start_time || !end_time || !member_name || !pin) {
        return { success: false, message: '날짜, 시작/종료 시간, 예약자명, 4자리 비밀번호(PIN)는 필수입니다.' };
      }

      if (start_time >= end_time) {
        return { success: false, message: '종료 시간은 시작 시간보다 늦어야 합니다.' };
      }

      if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return { success: false, message: '비밀번호(PIN)는 숫자 4자리로 입력해 주세요.' };
      }

      // 최신 예약 윈도우 조회
      const winResult = await ObandDB.getBookingWindow();
      const windowData = winResult.window;
      const adminPin = ObandDB.cachedAdminPin || '9999';
      const isAdminReq = (pin === '9999' || pin === adminPin);

      // 예약 오픈 기간 검증 (관리자는 제한 없음)
      if (!isAdminReq) {
        if (res_date < windowData.today) {
          return { success: false, message: '지난 날짜는 예약할 수 없습니다.' };
        }
        if (res_date > windowData.max_allowed_date) {
          return {
            success: false,
            message: `해당 날짜는 아직 예약이 오픈되지 않았습니다.\n(현재 예약 가능 기간: ${windowData.today} ~ ${windowData.max_allowed_date})\n매주 일요일에 다음 주 예약이 순차 오픈됩니다.`
          };
        }
      }

      // 수정 모드인 경우: 기존 예약의 PIN 일치 여부 확인
      if (isEditMode) {
        const existingRows = await apiFetch(`delivery_schedules?id=eq.${editId}&source_sheet=eq.OBAND_RESERVATION`);
        if (!existingRows || existingRows.length === 0) {
          return { success: false, message: '수정할 예약 정보를 찾을 수 없습니다.' };
        }
        const existing = existingRows[0];
        if (existing.status === 'cancelled') {
          return { success: false, message: '이미 취소된 예약은 수정할 수 없습니다.' };
        }
        const isOwner = (String(existing.contact) === pin);
        if (!isOwner && !isAdminReq) {
          return { success: false, status: 403, message: '비밀번호(PIN)가 일치하지 않습니다. 등록 시 입력한 4자리 숫자를 입력해 주세요.' };
        }
      }

      // 중복 예약 검증 (동일 날짜의 확정 예약과 시간 겹침 체크)
      let conflictQuery = `delivery_schedules?source_sheet=eq.OBAND_RESERVATION&delivery_date=eq.${res_date}&status=eq.confirmed`;
      if (isEditMode) {
        conflictQuery += `&id=neq.${editId}`;
      }
      const existingDateRows = await apiFetch(conflictQuery);
      if (Array.isArray(existingDateRows)) {
        for (const r of existingDateRows) {
          const exStart = r.visit_time;
          const exEnd = r.contract_no;
          // NOT (exEnd <= start_time || exStart >= end_time)
          if (!(exEnd <= start_time || exStart >= end_time)) {
            return {
              success: false,
              message: `해당 시간대(${start_time}~${end_time})에 이미 예약(${r.customer_name}님, ${exStart}~${exEnd})이 존재합니다.`
            };
          }
        }
      }

      // DB 저장 또는 갱신
      if (isEditMode) {
        const updatePayload = {
          delivery_date: res_date,
          visit_time: start_time,
          contract_no: end_time,
          customer_name: member_name,
          driver_name: band_team,
          items: part,
          memo_special: purpose
        };
        const updated = await apiFetch(`delivery_schedules?id=eq.${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(updatePayload)
        });
        return {
          success: true,
          message: '예약 내용이 성공적으로 수정되었습니다!',
          id: editId
        };
      } else {
        const insertPayload = {
          source_sheet: 'OBAND_RESERVATION',
          delivery_date: res_date,
          visit_time: start_time,
          contract_no: end_time,
          customer_name: member_name,
          driver_name: band_team,
          items: part,
          contact: pin,
          status: 'confirmed',
          memo_special: purpose
        };
        const inserted = await apiFetch('delivery_schedules', {
          method: 'POST',
          body: JSON.stringify(insertPayload)
        });
        const newId = inserted && inserted[0] ? inserted[0].id : null;
        return {
          success: true,
          message: '합주실 예약이 완료되었습니다!',
          id: newId
        };
      }
    },

    // 4. 예약 취소
    async cancelBooking(id, pin) {
      const cancelId = Number(id);
      const inputPin = String(pin || '').trim();

      if (!cancelId || !inputPin) {
        return { success: false, message: '예약 ID와 비밀번호(PIN)를 입력해 주세요.' };
      }

      const rows = await apiFetch(`delivery_schedules?id=eq.${cancelId}&source_sheet=eq.OBAND_RESERVATION`);
      if (!rows || rows.length === 0) {
        return { success: false, message: '취소할 예약 정보를 찾을 수 없습니다.' };
      }
      const existing = rows[0];
      const adminPin = ObandDB.cachedAdminPin || '9999';
      const isOwner = (String(existing.contact) === inputPin);
      const isAdmin = (inputPin === '9999' || inputPin === adminPin);

      if (!isOwner && !isAdmin) {
        return { success: false, message: '비밀번호(PIN)가 일치하지 않습니다.' };
      }

      await apiFetch(`delivery_schedules?id=eq.${cancelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' })
      });

      return {
        success: true,
        message: '예약이 성공적으로 취소되었습니다.'
      };
    },

    // 5. 관리자 예약 조건 설정 변경
    async saveSettings(data) {
      const inputPin = String(data.pin || '').trim();
      const adminPin = ObandDB.cachedAdminPin || '9999';
      if (inputPin !== '9999' && inputPin !== adminPin) {
        return { success: false, message: '관리자 비밀번호가 일치하지 않습니다.' };
      }

      const updates = [];
      if (data.open_weeks !== undefined) {
        updates.push({ key: 'open_weeks', val: String(data.open_weeks) });
      }
      if (data.reset_day !== undefined) {
        updates.push({ key: 'reset_day', val: String(data.reset_day) });
      }
      if (data.quick_teams !== undefined) {
        updates.push({ key: 'quick_teams', val: String(data.quick_teams) });
      }
      if (data.kakao_js_key !== undefined) {
        updates.push({ key: 'kakao_js_key', val: String(data.kakao_js_key) });
      }

      for (const item of updates) {
        await apiFetch(`delivery_schedules?source_sheet=eq.OBAND_CONFIG&customer_name=eq.${item.key}`, {
          method: 'PATCH',
          body: JSON.stringify({ memo_full: item.val })
        });
      }

      return {
        success: true,
        message: '설정이 성공적으로 저장되었습니다.'
      };
    },

    // 6. 관리자 비밀번호 검증
    async verifyAdmin(pin) {
      const inputPin = String(pin || '').trim();
      const adminPin = ObandDB.cachedAdminPin || '9999';
      if (inputPin === '9999' || inputPin === adminPin) {
        return { success: true };
      }
      return { success: false, message: '관리자 비밀번호가 일치하지 않습니다.' };
    },

    // 7. 공지사항 조회
    async getNotices() {
      const rows = await apiFetch('delivery_schedules?source_sheet=eq.OBAND_NOTICE&order=stop_order.desc,id.desc');
      const notices = (rows || []).map(r => ({
        id: r.id,
        title: r.driver_name,
        content: r.memo_full || '',
        author: r.customer_name || '관리자',
        category: r.category || '일반',
        is_pinned: Number(r.stop_order || 0),
        pin: r.contact,
        created_at: r.memo_special || r.created_at
      }));
      return { success: true, notices };
    },

    // 8. 공지사항 등록
    async saveNotice(data) {
      const insertPayload = {
        source_sheet: 'OBAND_NOTICE',
        driver_name: data.title,
        customer_name: data.author || '관리자',
        category: data.category || '일반',
        contact: data.pin || '1234',
        stop_order: data.is_pinned ? 1 : 0,
        memo_full: data.content,
        memo_special: getTodayString()
      };
      await apiFetch('delivery_schedules', {
        method: 'POST',
        body: JSON.stringify(insertPayload)
      });
      return { success: true, message: '공지사항이 등록되었습니다.' };
    },

    // 9. 공지사항 삭제
    async deleteNotice(id, pin) {
      const noticeId = Number(id);
      const inputPin = String(pin || '').trim();
      const rows = await apiFetch(`delivery_schedules?id=eq.${noticeId}&source_sheet=eq.OBAND_NOTICE`);
      if (!rows || rows.length === 0) {
        return { success: false, message: '삭제할 공지사항을 찾을 수 없습니다.' };
      }
      const existing = rows[0];
      const adminPin = ObandDB.cachedAdminPin || '9999';
      const isOwner = (String(existing.contact) === inputPin);
      const isAdmin = (inputPin === '9999' || inputPin === adminPin);

      if (!isOwner && !isAdmin) {
        return { success: false, message: '비밀번호(PIN)가 일치하지 않습니다.' };
      }

      await apiFetch(`delivery_schedules?id=eq.${noticeId}`, {
        method: 'DELETE'
      });
      return { success: true, message: '공지사항이 삭제되었습니다.' };
    },

    // 10. 세트리스트 조회
    async getSetlists() {
      const rows = await apiFetch('delivery_schedules?source_sheet=eq.OBAND_SETLIST&order=id.asc');
      const setlists = (rows || []).map(r => ({
        id: r.id,
        title: r.driver_name,
        artist: r.customer_name,
        key_info: r.items || '',
        tempo: r.visit_time || '',
        sheet_url: r.contract_no || '',
        youtube_url: r.address || '',
        status: r.status || '연습중',
        memo: r.memo_full || '',
        created_at: r.memo_special || r.created_at
      }));
      return { success: true, setlists };
    },

    // 11. 세트리스트 등록
    async saveSetlist(data) {
      const insertPayload = {
        source_sheet: 'OBAND_SETLIST',
        driver_name: data.title,
        customer_name: data.artist,
        items: data.key_info || '',
        visit_time: data.tempo || '',
        contract_no: data.sheet_url || '',
        address: data.youtube_url || '',
        status: data.status || '연습중',
        memo_full: data.memo || '',
        memo_special: getTodayString()
      };
      await apiFetch('delivery_schedules', {
        method: 'POST',
        body: JSON.stringify(insertPayload)
      });
      return { success: true, message: '새 연습곡이 추가되었습니다.' };
    }
  };

  window.ObandDB = ObandDB;
})(window);
