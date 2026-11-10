/**
 * 오늘부터 밴드부 (오뺀) - Supabase 데이터 계층 모듈 (oband-db.js)
 * 
 * - Render의 15분 절전모드(Cold Start / 30~50초 지연) 원천 차단
 * - GitHub Pages Edge CDN + Supabase BaaS 직결로 0.05초(50ms) 초고속 데이터 로딩
 * - 네이버 계정(배송스케줄 관리 DB)과 100% 분리된 오뺀 전용 데이터베이스
 * - 외부 차단 로그인 게이트 + 통합 관리자 계정 및 계정 생성/관리 지원
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

  // 순수 JS 동기 SHA-256 해시 (HTTP/HTTPS/file 모두 동일 동작)
  function sha256(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), lengthProperty = 'length', i, j, result = '';
    var words = [], asciiBitLength = ascii[lengthProperty] * 8;
    var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], primeCounter = k[lengthProperty];
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = asciiBitLength;
    for (j = 0; j < words[lengthProperty];) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        var temp1 = hash[7] + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  function hashPassword(rawPassword) {
    const utf8Str = unescape(encodeURIComponent('OBAND_SALT_2026:' + String(rawPassword || '')));
    return sha256(utf8Str);
  }

  function getSessionUser() {
    try {
      const raw = window.sessionStorage.getItem('oppaen_auth_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function isAdminSession() {
    const user = getSessionUser();
    return Boolean(user && user.role === 'admin');
  }

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

  // =========================================================================
  // 경량 네이티브 실시간 동기화 엔진 (Supabase Realtime Broadcast + Tab Sync)
  // =========================================================================
  const REALTIME_TOPIC = 'realtime:oband-live-sync';
  const CLIENT_INSTANCE_ID = 'ob_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
  let rtSocket = null;
  let rtHeartbeatTimer = null;
  let rtReconnectTimer = null;
  let rtRefSeq = 0;
  let rtJoined = false;
  let rtShouldStayConnected = false;
  let rtReconnectDelayMs = 1500;
  let rtNeedCatchUpSync = false;
  let rtSyncHandler = null;
  let rtStatusHandler = null;
  let tabChannel = null;
  const recentEventIds = new Set();

  function rememberEventId(evtId) {
    if (!evtId) return false;
    if (recentEventIds.has(evtId)) return true;
    recentEventIds.add(evtId);
    if (recentEventIds.size > 100) {
      const firstKey = recentEventIds.values().next().value;
      recentEventIds.delete(firstKey);
    }
    return false;
  }

  function handleIncomingSyncPayload(payload) {
    if (!payload || payload.senderId === CLIENT_INSTANCE_ID) return;
    if (payload.eventId && rememberEventId(payload.eventId)) return;
    if (typeof rtSyncHandler === 'function') {
      try {
        rtSyncHandler(payload);
      } catch (err) {
        console.warn('[ObandDB Realtime] 핸들러 오류:', err);
      }
    }
  }

  function initSameBrowserTabChannel() {
    if (tabChannel || typeof window.BroadcastChannel !== 'function') return;
    try {
      tabChannel = new window.BroadcastChannel('oband_tab_sync_v1');
      tabChannel.onmessage = (e) => {
        if (e && e.data) handleIncomingSyncPayload(e.data);
      };
    } catch (e) {
      tabChannel = null;
    }
  }

  function buildRealtimeWsUrl() {
    const base = String(cfg.url || '').trim();
    if (!/^https?:\/\//i.test(base) || !cfg.anonKey) return '';
    const wsBase = base.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://').replace(/\/+$/, '');
    return `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(cfg.anonKey)}&vsn=1.0.0`;
  }

  function notifyRealtimeStatus(connected) {
    if (typeof rtStatusHandler === 'function') {
      try {
        rtStatusHandler(Boolean(connected));
      } catch (e) {}
    }
  }

  function clearRealtimeTimers() {
    if (rtHeartbeatTimer) {
      clearInterval(rtHeartbeatTimer);
      rtHeartbeatTimer = null;
    }
    if (rtReconnectTimer) {
      clearTimeout(rtReconnectTimer);
      rtReconnectTimer = null;
    }
  }

  function openRealtimeSocket() {
    if (!rtShouldStayConnected || typeof window.WebSocket !== 'function') return;
    const wsUrl = buildRealtimeWsUrl();
    if (!wsUrl) return;

    if (rtSocket && (rtSocket.readyState === 0 || rtSocket.readyState === 1)) {
      return;
    }

    try {
      const ws = new window.WebSocket(wsUrl);
      rtSocket = ws;

      ws.onopen = () => {
        if (rtSocket !== ws || !rtShouldStayConnected) {
          try { ws.close(); } catch (e) {}
          return;
        }
        rtRefSeq++;
        ws.send(JSON.stringify({
          topic: REALTIME_TOPIC,
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { self: false },
              presence: { key: '' }
            }
          },
          ref: String(rtRefSeq)
        }));

        if (rtHeartbeatTimer) clearInterval(rtHeartbeatTimer);
        rtHeartbeatTimer = setInterval(() => {
          if (rtSocket && rtSocket.readyState === 1) {
            rtRefSeq++;
            rtSocket.send(JSON.stringify({
              topic: 'phoenix',
              event: 'heartbeat',
              payload: {},
              ref: String(rtRefSeq)
            }));
          }
        }, 28000);
      };

      ws.onmessage = (ev) => {
        if (!ev || !ev.data) return;
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (msg.topic === REALTIME_TOPIC && msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
          const wasReconnect = rtNeedCatchUpSync;
          rtJoined = true;
          rtReconnectDelayMs = 1500;
          rtNeedCatchUpSync = false;
          notifyRealtimeStatus(true);
          if (wasReconnect && typeof rtSyncHandler === 'function') {
            try {
              rtSyncHandler({ kind: 'reconnected', ts: Date.now() });
            } catch (e) {}
          }
          return;
        }
        if (msg.event === 'broadcast' && msg.payload && msg.payload.event === 'oband_sync') {
          handleIncomingSyncPayload(msg.payload.payload);
        }
      };

      ws.onclose = () => {
        const wasJoined = rtJoined;
        rtJoined = false;
        if (rtHeartbeatTimer) {
          clearInterval(rtHeartbeatTimer);
          rtHeartbeatTimer = null;
        }
        if (rtSocket === ws) {
          rtSocket = null;
        }
        notifyRealtimeStatus(false);
        if (rtShouldStayConnected) {
          if (wasJoined) rtNeedCatchUpSync = true;
          const waitMs = rtReconnectDelayMs;
          rtReconnectDelayMs = Math.min(30000, Math.round(rtReconnectDelayMs * 1.8));
          if (rtReconnectTimer) clearTimeout(rtReconnectTimer);
          rtReconnectTimer = setTimeout(() => {
            openRealtimeSocket();
          }, waitMs);
        }
      };

      ws.onerror = () => {
        // WebSocket 종료 처리는 onclose에서 백오프 재연결 수행
      };
    } catch (err) {
      console.warn('[ObandDB Realtime] 소켓 생성 실패:', err);
    }
  }

  function connectRealtime(onSyncEvent, onStatusChange) {
    rtSyncHandler = onSyncEvent || rtSyncHandler;
    rtStatusHandler = onStatusChange || rtStatusHandler;
    rtShouldStayConnected = true;
    initSameBrowserTabChannel();
    openRealtimeSocket();
  }

  function disconnectRealtime() {
    rtShouldStayConnected = false;
    rtJoined = false;
    rtNeedCatchUpSync = false;
    clearRealtimeTimers();
    if (rtSocket) {
      const ws = rtSocket;
      rtSocket = null;
      try {
        if (ws.readyState === 1) {
          rtRefSeq++;
          ws.send(JSON.stringify({
            topic: REALTIME_TOPIC,
            event: 'phx_leave',
            payload: {},
            ref: String(rtRefSeq)
          }));
        }
        ws.close();
      } catch (e) {}
    }
    notifyRealtimeStatus(false);
  }

  function publishSyncEvent(kind, meta = {}) {
    const payload = {
      kind,
      ...meta,
      senderId: CLIENT_INSTANCE_ID,
      eventId: CLIENT_INSTANCE_ID + '_' + (++rtRefSeq) + '_' + Date.now(),
      ts: Date.now()
    };
    rememberEventId(payload.eventId);

    if (tabChannel) {
      try {
        tabChannel.postMessage(payload);
      } catch (e) {}
    }

    if (rtSocket && rtSocket.readyState === 1 && rtJoined) {
      try {
        rtRefSeq++;
        rtSocket.send(JSON.stringify({
          topic: REALTIME_TOPIC,
          event: 'broadcast',
          payload: {
            type: 'broadcast',
            event: 'oband_sync',
            payload
          },
          ref: String(rtRefSeq)
        }));
      } catch (e) {}
    }
  }

  const ObandDB = {
    // 0. 초기 관리자 계정 시드 확인 (admin / 123456789)
    async ensureDefaultAdmin() {
      const existing = await apiFetch('delivery_schedules?source_sheet=eq.OBAND_USERS&limit=1');
      if (!existing || existing.length === 0) {
        const adminPayload = {
          source_sheet: 'OBAND_USERS',
          customer_name: 'admin',
          contact: hashPassword('123456789'),
          category: 'admin',
          driver_name: '총괄 관리자',
          status: 'active',
          memo_special: getTodayString()
        };
        await apiFetch('delivery_schedules', {
          method: 'POST',
          body: JSON.stringify(adminPayload)
        });
      }
    },

    // 0-1. 로그인 인증 (외부 차단 게이트)
    async login(username, password) {
      const cleanId = String(username || '').trim().toLowerCase();
      const rawPw = String(password || '');

      if (!cleanId || !rawPw) {
        return { success: false, message: '아이디와 비밀번호를 모두 입력해 주세요.' };
      }

      await ObandDB.ensureDefaultAdmin();

      const rows = await apiFetch(
        `delivery_schedules?source_sheet=eq.OBAND_USERS&customer_name=eq.${encodeURIComponent(cleanId)}`
      );

      if (!rows || rows.length === 0) {
        return { success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' };
      }

      const account = rows[0];

      // 휴식 계정 (비밀번호 일치 여부와 무관하게 로그인 원천 차단)
      if (account.category === 'rest' || account.status === 'rest' || account.status === 'inactive') {
        return { success: false, message: '현재 휴식 중인 계정입니다. 관리자에게 문의해 주세요.' };
      }

      const inputHash = hashPassword(rawPw);
      if (account.contact !== inputHash) {
        return { success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' };
      }

      const role = account.category === 'admin' ? 'admin' : (account.category === 'staff' ? 'staff' : (account.category === 'rest' ? 'rest' : 'member'));

      return {
        success: true,
        user: {
          id: account.id,
          username: account.customer_name,
          role: role,
          display_name: account.driver_name || account.customer_name
        }
      };
    },

    // 0-2. 계정 목록 조회 (관리자 전용)
    async getUsers() {
      if (!isAdminSession()) {
        return { success: false, message: '관리자 권한이 필요합니다.' };
      }
      const rows = await apiFetch('delivery_schedules?source_sheet=eq.OBAND_USERS&order=category.asc,id.asc');
      const users = (rows || []).map(r => ({
        id: r.id,
        username: r.customer_name,
        role: r.category === 'admin' ? 'admin' : (r.category === 'staff' ? 'staff' : (r.category === 'rest' || r.status === 'rest' ? 'rest' : 'member')),
        display_name: r.driver_name || r.customer_name,
        status: r.status || 'active',
        created_at: r.memo_special || (r.created_at ? r.created_at.substring(0, 10) : '')
      }));

      // 계정 정렬 규칙: 1) admin 최상단 -> 2) 이윤형 -> 3) 가입일자 없는 계정 -> 4) 가입일자 빠른 순서(오름차순)
      users.sort((a, b) => {
        if (a.username === 'admin') return -1;
        if (b.username === 'admin') return 1;
        if (a.username === '이윤형') return -1;
        if (b.username === '이윤형') return 1;

        const dateA = String(a.created_at || '').trim();
        const dateB = String(b.created_at || '').trim();
        const hasDateA = Boolean(dateA && dateA !== '-');
        const hasDateB = Boolean(dateB && dateB !== '-');

        if (!hasDateA && hasDateB) return -1;
        if (hasDateA && !hasDateB) return 1;
        if (!hasDateA && !hasDateB) {
          return a.id - b.id;
        }

        const normA = dateA.replace(/\./g, '-');
        const normB = dateB.replace(/\./g, '-');
        if (normA !== normB) {
          return normA.localeCompare(normB);
        }
        return a.id - b.id;
      });

      return { success: true, users };
    },

    // 0-3. 새 계정(관리자/운영진/회원/휴식) 생성 (관리자 전용)
    async createUser(data) {
      if (!isAdminSession()) {
        return { success: false, message: '관리자 권한이 필요합니다.' };
      }
      const username = String(data.username || '').trim().toLowerCase();
      const password = String(data.password || '');
      const validRoles = ['admin', 'staff', 'member', 'rest'];
      const role = validRoles.includes(data.role) ? data.role : 'member';

      let defaultName = '회원';
      if (role === 'admin') defaultName = '관리자';
      else if (role === 'staff') defaultName = '운영진';
      else if (role === 'rest') defaultName = '휴식';

      const display_name = String(data.display_name || '').trim() || defaultName;

      if (username.length < 2 || /\s/.test(username)) {
        return { success: false, message: '아이디는 공백 없이 2글자 이상 입력해 주세요.' };
      }
      if (password.length < 4) {
        return { success: false, message: '비밀번호는 최소 4자 이상 입력해 주세요.' };
      }

      const dup = await apiFetch(
        `delivery_schedules?source_sheet=eq.OBAND_USERS&customer_name=eq.${encodeURIComponent(username)}`
      );
      if (dup && dup.length > 0) {
        return { success: false, message: `이미 존재하는 아이디(${username})입니다.` };
      }

      const insertPayload = {
        source_sheet: 'OBAND_USERS',
        customer_name: username,
        contact: hashPassword(password),
        category: role,
        driver_name: display_name,
        status: role === 'rest' ? 'rest' : 'active',
        memo_special: getTodayString()
      };

      const inserted = await apiFetch('delivery_schedules', {
        method: 'POST',
        body: JSON.stringify(insertPayload)
      });

      return {
        success: true,
        message: `새 계정 [${username}]이 성공적으로 생성되었습니다.`,
        id: inserted && inserted[0] ? inserted[0].id : null
      };
    },

    // 0-4. 계정 정보(구분, 표시이름, 아이디) 수정 (관리자 전용)
    async updateAccount(userId, data) {
      if (!isAdminSession()) {
        return { success: false, message: '관리자 권한이 필요합니다.' };
      }
      const targetRows = await apiFetch(`delivery_schedules?id=eq.${Number(userId)}&source_sheet=eq.OBAND_USERS`);
      if (!targetRows || targetRows.length === 0) {
        return { success: false, message: '수정할 계정을 찾을 수 없습니다.' };
      }
      const target = targetRows[0];

      const patchPayload = {};
      if (data.role) {
        const validRoles = ['admin', 'staff', 'member', 'rest'];
        if (!validRoles.includes(data.role)) {
          return { success: false, message: '올바른 계정 구분을 선택해 주세요.' };
        }
        if (target.category === 'admin' && data.role !== 'admin') {
          const allAdmins = await apiFetch('delivery_schedules?source_sheet=eq.OBAND_USERS&category=eq.admin&status=eq.active');
          if (!allAdmins || allAdmins.length <= 1) {
            return { success: false, message: '마지막 관리자 계정의 권한은 변경할 수 없습니다.' };
          }
        }
        patchPayload.category = data.role;
        patchPayload.status = (data.role === 'rest') ? 'rest' : 'active';
      }
      if (typeof data.display_name !== 'undefined') {
        patchPayload.driver_name = String(data.display_name).trim();
      }
      if (data.username) {
        const cleanId = String(data.username).trim();
        if (cleanId.length < 2 || /\s/.test(cleanId)) {
          return { success: false, message: '아이디는 공백 없이 2글자 이상 입력해 주세요.' };
        }
        if (target.customer_name === 'admin' && cleanId.toLowerCase() !== 'admin') {
          return { success: false, message: '기본 admin 아이디는 변경할 수 없습니다.' };
        }
        const dup = await apiFetch(
          `delivery_schedules?source_sheet=eq.OBAND_USERS&customer_name=eq.${encodeURIComponent(cleanId)}&id=neq.${Number(userId)}`
        );
        if (dup && dup.length > 0) {
          return { success: false, message: `이미 존재하는 아이디(${cleanId})입니다.` };
        }
        patchPayload.customer_name = cleanId;
      }

      await apiFetch(`delivery_schedules?id=eq.${Number(userId)}&source_sheet=eq.OBAND_USERS`, {
        method: 'PATCH',
        body: JSON.stringify(patchPayload)
      });

      return { success: true, message: '계정 정보가 성공적으로 수정되었습니다.' };
    },

    // 0-4. 계정 비밀번호 변경 (관리자 전용)
    async updateUserPassword(userId, newPassword) {
      if (!isAdminSession()) {
        return { success: false, message: '관리자 권한이 필요합니다.' };
      }
      const pw = String(newPassword || '');
      if (pw.length < 4) {
        return { success: false, message: '새 비밀번호는 최소 4자 이상 입력해 주세요.' };
      }

      await apiFetch(`delivery_schedules?id=eq.${Number(userId)}&source_sheet=eq.OBAND_USERS`, {
        method: 'PATCH',
        body: JSON.stringify({ contact: hashPassword(pw) })
      });

      return { success: true, message: '비밀번호가 성공적으로 변경되었습니다.' };
    },

    // 0-4b. 일반 부원 본인 비밀번호 변경 (본인 세션 + 현재 비밀번호 검증 + CAS 일치 시에만 수정)
    async changeOwnPassword(currentPassword, newPassword) {
      const sessionUser = getSessionUser();
      if (!sessionUser || !sessionUser.id || !sessionUser.username) {
        return { success: false, message: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.' };
      }

      const curPw = String(currentPassword || '');
      const nextPw = String(newPassword || '');
      if (!curPw) {
        return { success: false, message: '현재 비밀번호를 입력해 주세요.' };
      }
      if (nextPw.length < 4) {
        return { success: false, message: '새 비밀번호는 최소 4자 이상 입력해 주세요.' };
      }
      if (nextPw === curPw) {
        return { success: false, message: '현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.' };
      }

      const cleanId = String(sessionUser.username).trim().toLowerCase();
      const rows = await apiFetch(
        `delivery_schedules?select=id,customer_name,contact,category,status&id=eq.${Number(sessionUser.id)}&source_sheet=eq.OBAND_USERS&customer_name=eq.${encodeURIComponent(cleanId)}&status=eq.active`
      );
      if (!rows || rows.length === 0) {
        return {
          success: false,
          code: 'ACCOUNT_NOT_FOUND',
          message: '계정 정보를 찾을 수 없거나 관리자에 의해 삭제되었습니다. 다시 로그인해 주세요.'
        };
      }

      const account = rows[0];
      const currentHash = hashPassword(curPw);
      if (account.contact !== currentHash) {
        return { success: false, message: '현재 비밀번호가 일치하지 않습니다.' };
      }

      const nextHash = hashPassword(nextPw);
      const updated = await apiFetch(
        `delivery_schedules?id=eq.${Number(account.id)}&source_sheet=eq.OBAND_USERS&customer_name=eq.${encodeURIComponent(account.customer_name)}&contact=eq.${encodeURIComponent(currentHash)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ contact: nextHash })
        }
      );

      if (!Array.isArray(updated) || updated.length === 0) {
        return {
          success: false,
          message: '비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        };
      }

      return { success: true, message: '비밀번호가 성공적으로 변경되었습니다.' };
    },

    // 0-5. 계정 삭제 (관리자 전용 / 마지막 관리자 및 본인 계정 보호)
    async deleteUser(userId) {
      if (!isAdminSession()) {
        return { success: false, message: '관리자 권한이 필요합니다.' };
      }
      const sessionUser = getSessionUser();
      const targetRows = await apiFetch(`delivery_schedules?id=eq.${Number(userId)}&source_sheet=eq.OBAND_USERS`);
      if (!targetRows || targetRows.length === 0) {
        return { success: false, message: '삭제할 계정을 찾을 수 없습니다.' };
      }
      const target = targetRows[0];

      if (sessionUser && sessionUser.username === target.customer_name) {
        return { success: false, message: '현재 로그인 중인 본인 계정은 삭제할 수 없습니다.' };
      }

      if (target.category === 'admin') {
        const allAdmins = await apiFetch('delivery_schedules?source_sheet=eq.OBAND_USERS&category=eq.admin&status=eq.active');
        if (!allAdmins || allAdmins.length <= 1) {
          return { success: false, message: '최소 1명의 관리자 계정은 유지되어야 하므로 삭제할 수 없습니다.' };
        }
      }

      await apiFetch(`delivery_schedules?id=eq.${Number(userId)}&source_sheet=eq.OBAND_USERS`, {
        method: 'DELETE'
      });

      return { success: true, message: `계정 [${target.customer_name}]이 삭제되었습니다.` };
    },

    // 1. 시스템 설정 및 예약 허용 윈도우 조회
    async getBookingWindow() {
      try {
        const rows = await apiFetch('delivery_schedules?select=customer_name,memo_full&source_sheet=eq.OBAND_CONFIG');
        const settingsMap = {};
        if (Array.isArray(rows)) {
          rows.forEach(r => {
            settingsMap[r.customer_name] = r.memo_full;
          });
        }

        const open_weeks = Number(settingsMap.open_weeks || 2);
        const reset_day = Number(settingsMap.reset_day || 0);
        const quick_teams = settingsMap.quick_teams || '1팀, 2팀, 3팀, 4팀, 5팀, 6팀, 개인연습';
        const kakao_js_key = settingsMap.kakao_js_key || '';

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
            description: ''
          }
        };
      }
    },

    // 2. 월간 예약 데이터 조회 (Rule 7 페이로드 다이어트: 필수 컬럼만 선택)
    async getMonthReservations(year, month) {
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const startDate = `${monthStr}-01`;
      const endDate = `${monthStr}-31`;

      const rows = await apiFetch(
        `delivery_schedules?select=id,delivery_date,visit_time,contract_no,customer_name,driver_name,items,memo_special,status,created_at&source_sheet=eq.OBAND_RESERVATION&delivery_date=gte.${startDate}&delivery_date=lte.${endDate}&status=eq.confirmed&order=delivery_date.asc,visit_time.asc`
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
        created_at: r.created_at,
        status: r.status || 'confirmed'
      }));

      return {
        success: true,
        reservations
      };
    },

    // 3. 예약 등록 및 수정 (isEditMode 분기 처리 & 관리자 세션 권한 반영)
    async saveBooking(data) {
      const res_date = data.res_date;
      const start_time = data.start_time;
      const end_time = data.end_time;
      const member_name = (data.member_name || '').trim();
      const band_team = (data.band_team || '전체합주').trim();
      const part = (data.part || '합주').trim();
      const purpose = (data.purpose || '').trim();
      const isAdminReq = Boolean(data.isAdminBypass || isAdminSession());
      let pin = String(data.pin || '').trim();
      if (isAdminReq && !pin) {
        pin = '0000';
      }
      const isEditMode = Boolean(data.id);
      const editId = data.id ? Number(data.id) : null;

      if (!res_date || !start_time || !end_time || !member_name || (!isAdminReq && !pin)) {
        return { success: false, message: '날짜, 시작/종료 시간, 예약자명, 4자리 비밀번호(PIN)는 필수입니다.' };
      }

      if (start_time >= end_time) {
        return { success: false, message: '종료 시간은 시작 시간보다 늦어야 합니다.' };
      }

      if (!isAdminReq && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
        return { success: false, message: '비밀번호(PIN)는 숫자 4자리로 입력해 주세요.' };
      }

      // 최신 예약 윈도우 조회
      const winResult = await ObandDB.getBookingWindow();
      const windowData = winResult.window;

      // 예약 오픈 기간 검증 (관리자 계정 로그인 시 제한 없음)
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

      // 수정 모드인 경우: 기존 예약의 PIN 일치 여부 확인 (관리자는 우회)
      let existingRecordForRollback = null;
      if (isEditMode) {
        const existingRows = await apiFetch(
          `delivery_schedules?select=id,delivery_date,visit_time,contract_no,customer_name,driver_name,items,memo_special,contact,status&id=eq.${editId}&source_sheet=eq.OBAND_RESERVATION`
        );
        if (!existingRows || existingRows.length === 0) {
          return { success: false, message: '수정할 예약 정보를 찾을 수 없습니다.' };
        }
        const existing = existingRows[0];
        existingRecordForRollback = existing;
        if (existing.status === 'cancelled') {
          return { success: false, message: '이미 취소된 예약은 수정할 수 없습니다.' };
        }
        const isOwner = (String(existing.contact) === pin);
        if (!isOwner && !isAdminReq) {
          return { success: false, status: 403, message: '비밀번호(PIN)가 일치하지 않습니다. 등록 시 입력한 4자리 숫자를 입력해 주세요.' };
        }
      }

      // 중복 예약 검증 (동일 날짜의 확정 예약과 시간 겹침 체크)
      let conflictQuery = `delivery_schedules?select=id,visit_time,contract_no,customer_name,status&source_sheet=eq.OBAND_RESERVATION&delivery_date=eq.${res_date}&status=eq.confirmed`;
      if (isEditMode) {
        conflictQuery += `&id=neq.${editId}`;
      }
      const existingDateRows = await apiFetch(conflictQuery);
      if (Array.isArray(existingDateRows)) {
        for (const r of existingDateRows) {
          const exStart = r.visit_time;
          const exEnd = r.contract_no;
          if (!(exEnd <= start_time || exStart >= end_time)) {
            return {
              success: false,
              status: 409,
              message: `해당 시간대(${start_time}~${end_time})에 이미 예약(${r.customer_name}님, ${exStart}~${exEnd})이 존재합니다.`
            };
          }
        }
      }

      // DB 저장 또는 갱신 + 동시성 경합(TOCTOU) 사후 검증 및 자동 롤백
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
        await apiFetch(`delivery_schedules?id=eq.${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(updatePayload)
        });

        // 0.05초 동시 수정/등록 경합 검증
        const postRows = await apiFetch(
          `delivery_schedules?select=id,visit_time,contract_no,customer_name&source_sheet=eq.OBAND_RESERVATION&delivery_date=eq.${res_date}&status=eq.confirmed&id=neq.${editId}&order=id.asc`
        );
        const raced = Array.isArray(postRows)
          ? postRows.find(r => !(r.contract_no <= start_time || r.visit_time >= end_time))
          : null;
        if (raced && existingRecordForRollback) {
          await apiFetch(`delivery_schedules?id=eq.${editId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              delivery_date: existingRecordForRollback.delivery_date,
              visit_time: existingRecordForRollback.visit_time,
              contract_no: existingRecordForRollback.contract_no,
              customer_name: existingRecordForRollback.customer_name,
              driver_name: existingRecordForRollback.driver_name,
              items: existingRecordForRollback.items,
              memo_special: existingRecordForRollback.memo_special
            })
          }).catch(() => {});
          return {
            success: false,
            status: 409,
            message: `⚠️ 방금 다른 부원(${raced.customer_name}님, ${raced.visit_time}~${raced.contract_no})이 해당 시간대를 먼저 예약했습니다. 다른 시간대를 선택해 주세요.`
          };
        }

        publishSyncEvent('reservation', {
          action: 'update',
          month: res_date.slice(0, 7),
          res_date,
          start_time,
          end_time,
          member_name
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
        const newId = inserted && inserted[0] ? Number(inserted[0].id) : null;

        // Post-Insert Tie-Breaker: 0.05초 동시 클릭 시 먼저 발급된 최소 ID만 생존
        if (newId) {
          const priorRows = await apiFetch(
            `delivery_schedules?select=id,visit_time,contract_no,customer_name&source_sheet=eq.OBAND_RESERVATION&delivery_date=eq.${res_date}&status=eq.confirmed&id=lt.${newId}&order=id.asc`
          );
          const winner = Array.isArray(priorRows)
            ? priorRows.find(r => !(r.contract_no <= start_time || r.visit_time >= end_time))
            : null;
          if (winner) {
            await apiFetch(`delivery_schedules?id=eq.${newId}&source_sheet=eq.OBAND_RESERVATION`, {
              method: 'DELETE'
            }).catch(() => {});
            return {
              success: false,
              status: 409,
              message: `⚠️ 방금 다른 부원(${winner.customer_name}님, ${winner.visit_time}~${winner.contract_no})이 먼저 예약을 완료했습니다. 다른 시간대를 선택해 주세요!`
            };
          }
        }

        publishSyncEvent('reservation', {
          action: 'create',
          month: res_date.slice(0, 7),
          res_date,
          start_time,
          end_time,
          member_name
        });
        return {
          success: true,
          message: '합주실 예약이 완료되었습니다!',
          id: newId
        };
      }
    },

    // 4. 예약 취소
    async cancelBooking(id, pin, isAdminBypass = false) {
      const cancelId = Number(id);
      const inputPin = String(pin || '').trim();
      const isAdminReq = Boolean(isAdminBypass || isAdminSession());

      if (!cancelId || (!isAdminReq && !inputPin)) {
        return { success: false, message: '예약 ID와 비밀번호(PIN)를 입력해 주세요.' };
      }

      const rows = await apiFetch(`delivery_schedules?select=id,contact,delivery_date,visit_time,contract_no,customer_name&id=eq.${cancelId}&source_sheet=eq.OBAND_RESERVATION`);
      if (!rows || rows.length === 0) {
        return { success: false, message: '취소할 예약 정보를 찾을 수 없습니다.' };
      }
      const existing = rows[0];
      const isOwner = (String(existing.contact) === inputPin);

      if (!isOwner && !isAdminReq) {
        return { success: false, message: '비밀번호(PIN)가 일치하지 않습니다.' };
      }

      await apiFetch(`delivery_schedules?id=eq.${cancelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' })
      });

      publishSyncEvent('reservation', {
        action: 'cancel',
        month: existing.delivery_date ? existing.delivery_date.slice(0, 7) : '',
        res_date: existing.delivery_date || '',
        start_time: existing.visit_time || '',
        end_time: existing.contract_no || '',
        member_name: existing.customer_name || ''
      });

      return {
        success: true,
        message: '예약이 성공적으로 취소되었습니다.'
      };
    },

    // 5. 관리자 예약 조건 설정 변경 (관리자 계정 전용)
    async saveSettings(data) {
      if (!isAdminSession() && !data.isAdminBypass) {
        return { success: false, message: '관리자 계정으로 로그인해야 설정을 변경할 수 있습니다.' };
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

      publishSyncEvent('config', { action: 'update' });

      return {
        success: true,
        message: '설정이 성공적으로 저장되었습니다.'
      };
    },

    // 7. 공지사항 조회 (PIN 컬럼 contact 제외)
    async getNotices() {
      const rows = await apiFetch('delivery_schedules?select=id,driver_name,memo_full,customer_name,category,stop_order,memo_special,created_at&source_sheet=eq.OBAND_NOTICE&order=stop_order.desc,id.desc');
      const notices = (rows || []).map(r => ({
        id: r.id,
        title: r.driver_name,
        content: r.memo_full || '',
        author: r.customer_name || '관리자',
        category: r.category || '일반',
        is_pinned: Number(r.stop_order || 0),
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
      publishSyncEvent('notice', { action: 'create' });
      return { success: true, message: '공지사항이 등록되었습니다.' };
    },

    // 9. 공지사항 삭제
    async deleteNotice(id, pin, isAdminBypass = false) {
      const noticeId = Number(id);
      const inputPin = String(pin || '').trim();
      const isAdminReq = Boolean(isAdminBypass || isAdminSession());

      const rows = await apiFetch(`delivery_schedules?select=id,contact&id=eq.${noticeId}&source_sheet=eq.OBAND_NOTICE`);
      if (!rows || rows.length === 0) {
        return { success: false, message: '삭제할 공지사항을 찾을 수 없습니다.' };
      }
      const existing = rows[0];
      const isOwner = (String(existing.contact) === inputPin);

      if (!isOwner && !isAdminReq) {
        return { success: false, message: '비밀번호(PIN)가 일치하지 않습니다.' };
      }

      await apiFetch(`delivery_schedules?id=eq.${noticeId}`, {
        method: 'DELETE'
      });
      publishSyncEvent('notice', { action: 'delete' });
      return { success: true, message: '공지사항이 삭제되었습니다.' };
    },

    // 10. 세트리스트 조회
    async getSetlists() {
      const rows = await apiFetch('delivery_schedules?select=id,driver_name,customer_name,items,visit_time,contract_no,address,status,memo_full,memo_special,created_at&source_sheet=eq.OBAND_SETLIST&order=id.asc');
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
      publishSyncEvent('setlist', { action: 'create' });
      return { success: true, message: '새 연습곡이 추가되었습니다.' };
    },

    // 12. 세트리스트 삭제 (관리자 계정 전용)
    async deleteSetlist(id) {
      if (!isAdminSession()) {
        return { success: false, message: '관리자 계정으로만 삭제할 수 있습니다.' };
      }
      await apiFetch(`delivery_schedules?id=eq.${Number(id)}&source_sheet=eq.OBAND_SETLIST`, {
        method: 'DELETE'
      });
      publishSyncEvent('setlist', { action: 'delete' });
      return { success: true, message: '연습곡이 삭제되었습니다.' };
    },

    // 13. 실시간 동기화 제어 API
    connectRealtime,
    disconnectRealtime,
    publishSyncEvent,
    isRealtimeConnected: () => Boolean(rtJoined)
  };

  window.ObandDB = ObandDB;
})(window);
