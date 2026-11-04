'use strict';
// ───────────── Мережа: клієнт кімнати Android-застосунку (через міст WebSocket ⇄ TCP) ─────────────
// Протокол той самий, що в NetGame.kt: рядки JSON; challenge → join → welcome; далі state/roll/result/closed,
// heartbeat кожні 3 с (хост вважає гравця відключеним, якщо від нього немає повідомлень 10 с),
// повернення на місце після обриву — rejoin з HMAC-доказом (токен видано при вході).

const Net = (() => {
    const TICK_MS = 3000, TIMEOUT_MS = 10000, RECONNECT_MS = 120000, ROLL_MS = 3800, SESSION_TIMEOUT = 12000;

    // ── міст ──
    const bridge = { url: '', status: 'off', error: '', games: [], mdns: false };
    let ws = null, session = null;

    // ── кімната ──
    const fresh = () => ({
        active: false, myId: '', hostId: '', format: '1 на 1', tournament: false, seats: [], battle: null, recorded: false,
        tourPrep: null, tourIcons: {}, rollIntro: null, reconnecting: false, notice: '', resultCounter: 0, lastGame: null,
        lastToken: '', lastRx: 0, answeredKey: '', sessionId: 0
    });
    let room = fresh();
    let tickTimer = null, rollTimer = null, sidCounter = 0;
    const subs = new Set();
    const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

    // ───────────── WebSocket до мосту ─────────────

    function connectBridge(url) {
        return new Promise((resolve, reject) => {
            closeBridge(true);
            bridge.url = url; bridge.status = 'connecting'; bridge.error = ''; emit();
            let settled = false;
            try { ws = new WebSocket(url); } catch (e) { bridge.status = 'off'; bridge.error = 'bad url'; emit(); return reject(e); }
            const sock = ws;
            const timer = setTimeout(() => { if (!settled) { settled = true; try { sock.close(); } catch (_) { } fail(new Error('timeout')); } }, 6000);
            const fail = (e) => { clearTimeout(timer); bridge.status = 'off'; bridge.error = String((e && e.message) || e); emit(); reject(e); };
            sock.onopen = () => { /* чекаємо hello */ };
            sock.onmessage = (ev) => {
                if (sock !== ws) return;
                if (!settled) { /* перше повідомлення — hello */ settled = true; clearTimeout(timer); bridge.status = 'ready'; emit(); resolve(); }
                onWsText(String(ev.data));
            };
            sock.onerror = () => { if (!settled) { settled = true; fail(new Error('connect')); } };
            sock.onclose = () => {
                if (sock !== ws) return;
                ws = null;
                const was = bridge.status;
                bridge.status = 'off'; bridge.games = [];
                if (!settled) { settled = true; fail(new Error('closed')); return; }
                if (session) { const s = session; session = null; s.reject(new Error('bridge closed')); }
                if (room.active && !room.reconnecting && was === 'ready') onDisconnected(room.sessionId);
                emit();
            };
        });
    }

    function closeBridge(silent) {
        if (ws) { const s = ws; ws = null; try { s.onclose = null; s.close(); } catch (_) { } }
        bridge.status = 'off'; bridge.games = [];
        if (!silent) emit();
    }

    const wsSend = (o) => { if (ws && ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };

    function scan() { wsSend({ bridge: 'scan' }); }

    // ───────────── Розбір повідомлень ─────────────

    function onWsText(text) {
        let o; try { o = JSON.parse(text); } catch (_) { return; }
        if (o && typeof o.bridge === 'string') return onBridgeMsg(o);
        if (session && (session.stage === 'challenge' || session.stage === 'resp')) return onSessionMsg(o);
        if (session) return;                // чужі рядки під час підключення ігноруємо
        room.lastRx = Date.now();
        onRoomMsg(o);
    }

    function onBridgeMsg(o) {
        if (o.bridge === 'hello') { bridge.mdns = !!o.mdns; emit(); }
        else if (o.bridge === 'games') { bridge.games = o.list || []; emit(); }
        else if (o.bridge === 'connected') { if (session && session.stage === 'connect') session.stage = 'challenge'; }
        else if (o.bridge === 'error') { if (session) { const s = session; session = null; s.reject(new Error(o.message || 'error')); } else { room.notice = o.message || ''; emit(); } }
        else if (o.bridge === 'closed') {
            if (session) { const s = session; session = null; s.reject(new Error('closed')); }
            else if (room.active && !room.reconnecting) onDisconnected(room.sessionId);
        }
    }

    /** Відкриває TCP-сесію до хоста й проходить handshake. Повертає відповідь хоста (welcome | denied). */
    function openSession(game, makeAuth) {
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== 1) return reject(new Error('Міст не підключено.'));
            const timer = setTimeout(() => { if (session && session.timer === timer) { session = null; wsSend({ bridge: 'close' }); reject(new Error('timeout')); } }, SESSION_TIMEOUT);
            session = {
                stage: 'connect', timer, makeAuth,
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject: (e) => { clearTimeout(timer); reject(e); }
            };
            wsSend({ bridge: 'connect', host: game.host, port: game.port });
        });
    }

    async function onSessionMsg(o) {
        const s = session; if (!s) return;
        if (s.stage === 'challenge') {
            if (o.t !== 'challenge') { session = null; s.reject(new Error('protocol')); return; }
            s.stage = 'auth';
            try { wsSend(await s.makeAuth(String(o.nonce))); } catch (e) { session = null; s.reject(e); return; }
            if (session === s) s.stage = 'resp';
        } else if (s.stage === 'resp') {
            session = null; s.resolve(o);
        }
    }

    // ───────────── Вхід у кімнату ─────────────

    /** me: {nick, reg, avatar(base64), fc, fm, g, w} */
    async function join(game, me) {
        leave(true);
        const resp = await openSession(game, async () => ({ t: 'join', nick: me.nick, reg: !!me.reg, avatar: me.avatar || '', fc: me.fc || '', fm: me.fm || '', g: me.g || 0, w: me.w || 0 }));
        if (resp.t !== 'welcome') { wsSend({ bridge: 'close' }); throw new Error(resp.reason || 'Відмовлено у вході.'); }
        const sid = ++sidCounter;
        room = fresh();
        Object.assign(room, {
            active: true, sessionId: sid, myId: resp.id, hostId: resp.hostId || '', format: resp.format || game.mode || '1 на 1',
            tournament: resp.tour !== undefined ? !!resp.tour : !!game.tournament, lastGame: game, lastToken: resp.token || '', lastRx: Date.now()
        });
        startTick(); emit();
    }

    function startTick() {
        clearInterval(tickTimer);
        tickTimer = setInterval(() => {
            if (!room.active) return;
            if (!room.reconnecting) {
                wsSend({ t: 'hb' });
                if (Date.now() - room.lastRx > TIMEOUT_MS) { wsSend({ bridge: 'close' }); onDisconnected(room.sessionId); }
            }
            emit();   // оновлення таймерів
        }, TICK_MS);
    }

    // ───────────── Обрив і повернення на місце ─────────────

    function onDisconnected(sid) {
        if (sid !== room.sessionId || !room.active || room.reconnecting) return;
        if (!room.lastGame) { leaveWith("З'єднання втрачено."); return; }
        room.reconnecting = true; room.notice = "З'єднання втрачено. Перепідключення…"; emit();
        const token = room.lastToken, id = room.myId, g = room.lastGame;
        (async () => {
            const deadline = Date.now() + RECONNECT_MS;
            while (Date.now() < deadline) {
                if (sid !== room.sessionId || !room.active) return;
                try {
                    if (!ws || ws.readyState !== 1) await connectBridge(bridge.url);
                    const resp = await openSession(g, async (nonce) => ({ t: 'rejoin', id, proof: await hmacHex(token, `rejoin|${nonce}|${id}`) }));
                    if (resp.t === 'welcome') {
                        if (sid !== room.sessionId) { wsSend({ bridge: 'close' }); return; }
                        room.reconnecting = false; room.notice = ''; room.lastRx = Date.now(); emit(); return;
                    }
                    wsSend({ bridge: 'close' });
                    if (sid === room.sessionId) leaveWith(resp.reason || "З'єднання втрачено.");
                    return;
                } catch (_) { /* повторимо */ }
                await sleep(3000);
            }
            if (sid === room.sessionId) leaveWith("З'єднання втрачено.");
        })();
    }

    // ───────────── Повідомлення кімнати ─────────────

    function onRoomMsg(o) {
        switch (o.t) {
            case 'state': applyState(o); break;
            case 'roll': showRollIntro(o); break;
            case 'ticons': room.tourIcons = (o.icons && typeof o.icons === 'object') ? { ...o.icons } : {}; break;
            case 'result': deliverResult(payloadFromJson(o)); break;
            case 'closed': leaveWith(o.reason || 'Хост закрив кімнату.', true); return;
            default: break;   // hb
        }
        emit();
    }

    const strList = (a) => (Array.isArray(a) ? a.map(String) : []);
    const intList = (a) => (Array.isArray(a) ? a.map((x) => parseInt(x, 10) || 0) : []);

    function applyState(o) {
        room.tourPrep = o.tp ? {
            phase: o.tp.ph | 0, pool: strList(o.tp.pool), maps: strList(o.tp.maps), p1Chars: strList(o.tp.c), p1Map: o.tp.m || '',
            p1First: o.tp.f | 0, p2Choice: o.tp.p2 || '', p1Name: o.tp.n1 || 'Гравець 1', p2Name: o.tp.n2 || 'Гравець 2',
            p1Seat: o.tp.s1 === undefined ? -1 : o.tp.s1, p2Seat: o.tp.s2 === undefined ? -1 : o.tp.s2
        } : null;
        room.format = o.format || room.format;
        room.tournament = !!o.tour;
        room.recorded = !!o.recorded;
        room.hostId = o.hostId || room.hostId;
        room.seats = (o.seats || []).map((s) => (s ? {
            id: s.id, nick: s.nick, registered: !!s.reg, avatar: s.avatar || '', connected: s.on !== false,
            favChar: s.fc || '', favMap: s.fm || '', games: s.g | 0, wins: s.w | 0
        } : null));
        const b = o.battle;
        if (b) {
            const assign = {};
            (b.assign || []).forEach((a) => { assign[a.seat] = { chars: strList(a.chars), nums: intList(a.nums), icons: strList(a.icons) }; });
            const el = b.el === undefined ? -1 : Number(b.el);
            room.battle = {
                mapName: b.map || '', details: b.details || '', matchId: b.mid || '', proposal: b.proposal === undefined ? -1 : b.proposal | 0,
                seq: b.seq | 0, startedAt: el < 0 ? -1 : Date.now() - el, stoppedMs: b.stopped === undefined ? -1 : Number(b.stopped), assign
            };
        } else room.battle = null;
    }

    function showRollIntro(o) {
        const intro = { token: Date.now(), mapName: o.map || '', left: strList(o.left), right: strList(o.right), icons: (o.icons && typeof o.icons === 'object') ? o.icons : {} };
        room.rollIntro = intro;
        clearTimeout(rollTimer);
        rollTimer = setTimeout(() => { if (room.rollIntro === intro) { room.rollIntro = null; emit(); } }, ROLL_MS);
    }

    function payloadFromJson(o) {
        return {
            matchId: o.mid || '', timestamp: Number(o.ts) || Date.now(), historyMode: o.hm || '', statMode: o.sm || '', mapName: o.map || '',
            details: o.details || '', durationMs: o.dur === undefined ? -1 : Number(o.dur),
            participants: (o.parts || []).map((p) => ({ id: p.id || '', nick: p.nick, registered: !!p.reg, chars: strList(p.chars), nums: intList(p.nums), win: !!p.win, side: p.side | 0 }))
        };
    }

    function deliverResult(p) { if (recordResult(room.myId, p)) room.resultCounter++; }

    // ───────────── Дії гравця ─────────────

    const mySeat = () => room.seats.findIndex((s) => s && s.id === room.myId);
    const hostSeat = () => room.seats.findIndex((s) => s && s.id === room.hostId);
    const sideOf = (seat) => (room.format === '1 на 1' ? seat : Math.floor(seat / 2));
    const sideName = (side) => room.seats.map((s, i) => (s && sideOf(i) === side ? s.nick : null)).filter(Boolean).join(' + ');
    const isOpponentOfHost = () => { const m = mySeat(), h = hostSeat(); return m >= 0 && h >= 0 && sideOf(m) !== sideOf(h); };
    const keyOf = (b) => `${b.matchId}:${b.seq}`;
    const pendingForMe = () => { const b = room.battle; return !!b && !room.recorded && b.proposal >= 0 && isOpponentOfHost() && room.answeredKey !== keyOf(b); };

    function answerResult(ok) {
        const b = room.battle; if (!b) return;
        room.answeredKey = keyOf(b);
        wsSend({ t: 'confirm', matchId: b.matchId, seq: b.seq, ok: !!ok }); emit();
    }
    const tourSelect = (chars, map, first) => wsSend({ t: 'tsel', chars, map, first });
    const tourConfirm = () => wsSend({ t: 'tok' });
    const tourPick = (ch) => wsSend({ t: 'tpick', char: ch });

    function leaveWith(msg, fromHost) {
        if (!room.active) return;
        if (!fromHost) wsSend({ t: 'leave' });
        wsSend({ bridge: 'close' });
        clearInterval(tickTimer); clearTimeout(rollTimer);
        const counter = room.resultCounter;
        room = fresh(); room.resultCounter = counter; room.notice = msg || '';
        emit();
    }
    function leave(silent) { if (room.active) leaveWith(silent ? '' : ''); }

    return {
        get bridge() { return bridge; }, get room() { return room; }, subscribe(f) { subs.add(f); return () => subs.delete(f); },
        connectBridge, closeBridge, scan, join, leave: (m) => leaveWith(m || ''), answerResult, tourSelect, tourConfirm, tourPick,
        mySeat, hostSeat, sideOf, sideName, isOpponentOfHost, pendingForMe, ROLL_MS,
        clearNotice() { room.notice = ''; emit(); }
    };
})();

if (typeof module !== 'undefined') module.exports = { Net };
