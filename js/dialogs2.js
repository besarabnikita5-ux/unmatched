'use strict';
// ───────────── Діалоги гри: турнір, приєднання до мережі, кімната, звичайна гра, результат ─────────────

// ───────────── Турнірна підготовка (однакова для одного пристрою та мережі) ─────────────
// src: { prep(), canP1(), canP2(), icons(), select(chars,map,first), confirm(), pick(ch), cancel() }

function openTournamentDialog(src) {
    let draft = { phase: -1, chars: [], map: '', first: 0, pick: '' };
    const tile = (name, selected, enabled, onclick, big) => h('button', { class: 'tile' + (selected ? ' on' : '') + (big ? ' big' : ''), disabled: !enabled, onclick },
        fighterIcon(name, big ? 96 : 56, src.icons()), h('div', { class: 'tile-name' }, Labels.char(name)), selected ? h('span', { class: 'tile-ok' }, '✓') : null);
    const mapTile = (name, selected, enabled, onclick) => h('button', { class: 'tile map' + (selected ? ' on' : ''), disabled: !enabled, onclick }, mapIcon(name, 120), h('div', { class: 'tile-name' }, Labels.map(name)), selected ? h('span', { class: 'tile-ok' }, '✓') : null);

    const render = () => {
        const prep = src.prep();
        if (!prep) { d.close(); return; }
        if (draft.phase !== prep.phase) draft = { phase: prep.phase, chars: prep.p1Chars.slice(), map: prep.p1Map, first: prep.p1First, pick: '' };
        const live0 = prep.phase === 0 && src.canP1(), canP2 = prep.phase === 1 && src.canP2();
        const chars = live0 ? draft.chars : prep.p1Chars, map = live0 ? draft.map : prep.p1Map, first = live0 ? draft.first : prep.p1First;
        const push = () => src.select(draft.chars.slice(), draft.map, draft.first);
        const hint = prep.phase === 0 ? (live0 ? `${prep.p1Name}, обери 2 персонажів, поле й хто ходить першим` : `${prep.p1Name} обирає персонажів і поле…`)
            : (canP2 ? `${prep.p2Name}, обери, за кого гратимеш` : `${prep.p2Name} обирає персонажа…`);
        const kids = [h('p', { class: 'hint' }, t(hint))];
        if (prep.phase === 0) {
            kids.push(h('h3', null, t(`ПЕРСОНАЖІ: ${chars.length} / 2`)),
                h('div', { class: 'tiles' }, prep.pool.map((n) => tile(n, chars.includes(n), live0, () => {
                    draft.chars = chars.includes(n) ? chars.filter((x) => x !== n) : (chars.length < 2 ? [...chars, n] : chars); push(); render();
                }))),
                h('h3', null, t('ПОЛЕ БИТВИ')),
                h('div', { class: 'tiles maps' }, prep.maps.map((n) => mapTile(n, map === n, live0, () => { draft.map = n; push(); render(); }))),
                h('h3', null, t('ХТО ХОДИТЬ ПЕРШИМ')),
                h('div', { class: 'row' }, [1, 2].map((i) => h('button', { class: 'btn ' + (first === i ? '' : 'ghost'), disabled: !live0, onclick: () => { draft.first = i; push(); render(); } }, i === 1 ? prep.p1Name : prep.p2Name))),
                h('div', { class: 'row end' }, h('button', { class: 'btn', disabled: !(live0 && chars.length === 2 && map && (first === 1 || first === 2)), onclick: () => src.confirm() }, t('ПІДТВЕРДИТИ ВИБІР'))));
        } else {
            kids.push(h('h3', null, t('ПОЛЕ БИТВИ')), h('div', { class: 'row center' }, mapIcon(prep.p1Map, 200)), h('div', { class: 'center' }, Labels.map(prep.p1Map)),
                h('p', { class: 'center' }, t('Першим ходить: ') + (prep.p1First === 2 ? prep.p2Name : prep.p1Name)),
                h('h3', null, t('ОБЕРИ ПЕРСОНАЖА')),
                h('div', { class: 'tiles two' }, prep.p1Chars.map((n) => tile(n, draft.pick === n, canP2, () => { draft.pick = n; render(); }, true))),
                h('p', { class: 'muted center' }, t(`Другий персонаж дістанеться: ${prep.p1Name}`)),
                h('div', { class: 'row end' }, h('button', { class: 'btn', disabled: !(canP2 && draft.pick), onclick: () => src.pick(draft.pick) }, t('ПІДТВЕРДИТИ ВИБІР'))));
        }
        if (src.cancel) kids.push(h('div', { class: 'row center' }, h('button', { class: 'link', onclick: () => src.cancel() }, t('Скасувати турнір'))));
        d.setBody(kids);
    };
    const d = openDialog({ title: 'ТУРНІРНИЙ РЕЖИМ', noClose: true, wide: true, body: [] });
    d.render = render; render();
    return d;
}

// ───────────── Підключення до мережевої гри ─────────────
// Без мосту: браузер напряму відкриває WebSocket до застосунку-хоста (ws://IP:45679/ws).
// Браузер дозволяє це лише зі сторінки http://… . Сайт на GitHub Pages — це https, тому з нього людина
// відкриває сторінку кімнати, яку віддає сам застосунок (http://IP:45679): там усе вже налаштовано.

const DEFAULT_WEB_PORT = 45679;
let hostedGame = null;

/** Якщо сторінку віддав застосунок-хост, повертає його кімнату (інакше null). */
async function detectHostedRoom() {
    if (location.protocol !== 'http:' || !location.port) return null;
    try {
        const r = await fetch('room.json', { cache: 'no-store' });
        if (!r.ok) return null;
        const j = await r.json();
        if (!j || j.app !== 'unmatched') return null;
        hostedGame = { host: location.hostname, port: parseInt(location.port, 10), mode: j.mode || '1 на 1', hostNick: j.host || '', tournament: !!j.tour, name: j.name || location.host };
        return hostedGame;
    } catch (_) { return null; }
}

/** "192.168.43.1:45679", "http://192.168.43.1:45679/" → {host, port}; порт за замовчуванням — 45679. */
function parseRoomAddress(text) {
    const s = String(text || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const m = /^([^:\s]+)(?::(\d{1,5}))?$/.exec(s);
    if (!m) return null;
    const port = m[2] ? parseInt(m[2], 10) : DEFAULT_WEB_PORT;
    return port >= 1 && port <= 65535 ? { host: m[1], port } : null;
}

function openJoinDialog() {
    const secure = location.protocol === 'https:';
    const addrI = h('input', { class: 'input', placeholder: '192.168.43.1:45679', inputMode: 'url', autocapitalize: 'off', autocomplete: 'off' });
    const err = h('div', { class: 'err' });
    let busy = false;

    async function doJoin(g) {
        if (busy) return; busy = true; err.textContent = t('Приєднуємось…');
        try {
            const me = App.selfProfile();
            if (me._avatarUrl) me.avatar = b64FromDataUrl(await resizeDataUrl(me._avatarUrl, 96, 96, 'image/jpeg', 0.8));
            await Net.join(g, me); err.textContent = ''; d.close();
        } catch (e) { err.textContent = t(String(e.message || e)); } finally { busy = false; }
    }

    function go() {
        const a = parseRoomAddress(addrI.value);
        if (!a) { err.textContent = t('Введіть адресу кімнати, як у застосунку.'); return; }
        if (secure) { location.href = `http://${a.host}:${a.port}/`; return; }   // сторінку кімнати віддає застосунок
        doJoin({ host: a.host, port: a.port, mode: '1 на 1', tournament: false, name: a.host });
    }
    addrI.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

    const kids = [];
    if (hostedGame) {
        const g = hostedGame;
        kids.push(h('h3', null, t('Кімната')),
            h('button', { class: 'row pick', onclick: () => doJoin(g) },
                h('div', { class: 'grow' }, h('b', null, g.hostNick || g.name), h('div', { class: 'muted small' }, `${g.mode}${g.tournament ? ' • ' + t('Турнірна гра') : ''}`)), chip('Приєднатися')));
    }
    kids.push(h('h3', null, t('Вхід за адресою')),
        h('p', { class: 'muted small' }, t(secure
            ? 'Введіть адресу з рядка «Адреса для сайту» в застосунку хоста. Відкриється сторінка кімнати з телефона хоста — далі приєднання в один дотик. Потрібна та сама Wi-Fi мережа або точка доступу хоста.'
            : 'Введіть адресу з рядка «Адреса для сайту» в застосунку хоста.')),
        h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', null, t('Адреса кімнати')), addrI)),
        h('div', { class: 'row end' }, btn(secure ? 'Відкрити сторінку кімнати' : 'Приєднатися', go)), err);

    const d = openDialog({ title: 'Приєднатися до гри', wide: true, body: kids });
}

// ───────────── Кімната (клієнт) ─────────────

let lobbyDlg = null, tourDlg = null, lastRollToken = 0, lastResultCount = 0;

function openPlayerProfile(seat) {
    const s = seat; const rec = s.registered && App.user() ? Stats.versus(App.user(), s.nick) : null;
    openDialog({
        title: 'Профіль гравця', body: h('div', { class: 'center' }, avatarEl(dataUrlFromB64(s.avatar, 'image/jpeg'), s.nick, 96), h('h3', null, s.nick), s.registered ? chip('Акаунт') : chip('Гість'),
            h('p', null, t('Ігор') + `: ${s.games} • ` + t('Перемог') + `: ${s.wins} • ${pct(s.games, s.wins)}`),
            s.favChar ? h('p', null, t(`Улюблений персонаж: ${Labels.char(s.favChar)}`)) : null, s.favMap ? h('p', null, t(`Улюблене поле: ${Labels.map(s.favMap)}`)) : null,
            rec && rec.games ? h('p', null, t('Ваші зустрічі') + `: ${rec.wins} / ${rec.games}`) : null)
    });
}

function lobbyBody() {
    const r = Net.room, kids = [];
    if (r.notice) kids.push(h('div', { class: 'notice' }, t(r.notice)));
    if (r.reconnecting) kids.push(h('div', { class: 'notice' }, t('Перепідключення…')));
    kids.push(h('div', { class: 'muted' }, `${r.format}${r.tournament ? ' • ' + t('Турнірна гра') : ''}`));
    kids.push(h('h3', null, t('Гравці')));
    kids.push(h('div', { class: 'list' }, r.seats.map((s, i) => {
        if (!s) return h('div', { class: 'row seat empty' }, h('div', { class: 'muted' }, t('Очікування…')));
        const side = Net.sideOf(i), b = r.battle, a = b && b.assign[i];
        return h('button', { class: 'row seat pick' + (side ? ' side1' : ''), onclick: () => openPlayerProfile(s) },
            avatarEl(dataUrlFromB64(s.avatar, 'image/jpeg'), s.nick, 44),
            h('div', { class: 'grow' }, h('div', null, h('b', null, s.nick), s.id === r.myId ? t(' (ви)') : '', s.id === r.hostId ? ' ' : '', s.id === r.hostId ? chip('Хост') : null, !s.connected ? chip('Не в мережі', 'lose') : null),
                a ? h('div', { class: 'assign' }, a.chars.map((c, k) => h('span', { class: 'ach' }, fighterIcon(c, 32, iconMap(a, c)), Labels.char(c))), h('span', { class: 'num' }, ' № ' + [...a.nums].sort((x, y) => x - y).join(',') + (a.nums.includes(1) ? ' (' + t('перший') + ')' : ''))) : null));
    })));
    const b = r.battle;
    if (b) {
        let elapsed = -1;
        if (b.stoppedMs >= 0) elapsed = b.stoppedMs; else if (b.startedAt >= 0) elapsed = Date.now() - b.startedAt;
        kids.push(h('h3', null, t('ПОЛЕ БИТВИ')), h('div', { class: 'row center' }, mapIcon(b.mapName, 200)), h('div', { class: 'center' }, h('b', null, Labels.map(b.mapName))));
        if (b.details) kids.push(h('p', { class: 'center muted' }, t(b.details)));
        kids.push(h('div', { class: 'center timer' }, b.startedAt < 0 && b.stoppedMs < 0 ? t('Підготовка до гри. Таймер піде, коли хост запустить гру.') : (b.stoppedMs >= 0 ? t('Час гри: ') : '⏱ ') + formatDuration(elapsed)));
        if (Net.pendingForMe()) {
            kids.push(h('div', { class: 'confirm-box' }, h('h3', null, t('Підтвердження результату')), h('p', null, t(`Хост вказав переможцем: ${Net.sideName(b.proposal)}. Підтвердити результат?`)),
                h('div', { class: 'row end' }, btn('Заперечити', () => Net.answerResult(false), 'ghost'), btn('Підтвердити', () => Net.answerResult(true)))));
        } else if (r.recorded) kids.push(h('p', { class: 'center ok' }, '✓ ' + t('Результат занесено в статистику.')));
        else if (b.proposal >= 0 && !Net.isOpponentOfHost()) kids.push(h('p', { class: 'center muted' }, t('Очікуємо підтвердження суперника…')));
    } else kids.push(h('p', { class: 'center muted' }, t('Очікуємо, поки хост розпочне бій.')));
    kids.push(h('div', { class: 'row center' }, btn('Вийти з кімнати', () => confirmDialog('Вийти з кімнати?', () => Net.leave(), 'Вийти'), 'ghost')));
    return kids;
}
const iconMap = (a, c) => { const i = a.chars.indexOf(c); return a.icons && a.icons[i] ? { [c]: a.icons[i] } : undefined; };

/** Викликається при кожній зміні мережевого стану. */
function syncNet() {
    const r = Net.room;
    if (r.active) {
        if (!lobbyDlg) { lobbyDlg = openDialog({ title: 'КІМНАТА', wide: true, noClose: true, body: lobbyBody(), onClose: () => { lobbyDlg = null; } }); }
        else lobbyDlg.setBody(lobbyBody());
        if (r.rollIntro && r.rollIntro.token !== lastRollToken) { lastRollToken = r.rollIntro.token; showRoll(r.rollIntro.mapName, r.rollIntro.left, r.rollIntro.right, r.rollIntro.icons); }
        if (!r.rollIntro) hideRoll();
        if (r.tourPrep) {
            if (!tourDlg) {
                const idx = () => Net.mySeat();
                tourDlg = openTournamentDialog({
                    prep: () => Net.room.tourPrep, canP1: () => idx() >= 0 && idx() === Net.room.tourPrep.p1Seat, canP2: () => idx() >= 0 && idx() === Net.room.tourPrep.p2Seat,
                    icons: () => Net.room.tourIcons, select: Net.tourSelect, confirm: Net.tourConfirm, pick: Net.tourPick, cancel: null
                });
                const c = tourDlg.close; tourDlg.close = () => { tourDlg = null; c(); };
            } else tourDlg.render();
        } else if (tourDlg) { const d = tourDlg; tourDlg = null; d.close(); }
        if (r.resultCounter !== lastResultCount) { lastResultCount = r.resultCounter; toast('Результат мережевої гри занесено.'); App.refresh(); }
    } else {
        if (lobbyDlg) { const d = lobbyDlg; lobbyDlg = null; d.close(); }
        if (tourDlg) { const d = tourDlg; tourDlg = null; d.close(); }
        hideRoll();
        if (r.notice) { toast(r.notice, 5000); Net.clearNotice(); }
        if (r.resultCounter !== lastResultCount) { lastResultCount = r.resultCounter; App.refresh(); }
    }
    App.updateNetChip();
}
