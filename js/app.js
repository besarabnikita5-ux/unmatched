'use strict';
// ───────────── Головний екран, звичайна гра, турнір на одному пристрої, запуск ─────────────

const SHOW_LIMIT = 12;
const A = { showAllF: false, showAllM: false, showHist: false, onlyExcluded: false, search: '', collapsed: {}, installEvt: null };
let local = null, localPrep = null, resultDlg = null, rolling = false, timerIv = null;

const App = {
    user: () => P.get('currentUser'),
    refresh: () => render(),
    selfProfile() {
        const u = App.user();
        if (!u) return { nick: 'Player', reg: false, avatar: '', fc: '', fm: '', g: 0, w: 0 };
        const pr = ProfileStore.load(u), st = Stats.load(u), tot = Object.values(st.totals);
        const av = Avatars.get(u);
        return { nick: u, reg: true, avatar: av ? '' : '', fc: pr.fc, fm: pr.fm, g: tot.reduce((a, x) => a + x.games, 0), w: tot.reduce((a, x) => a + x.wins, 0), _avatarUrl: av };
    },
    updateNetChip() {
        const c = $('#net-chip'); if (!c) return;
        const on = Net.room.active;
        c.className = 'chip net ' + (on ? 'ok' : '');
        c.textContent = on ? '🌐 ' + t('Кімната') : '🌐 ' + t('Мережа');
    }
};

// ───────────── Допоміжне ─────────────

const avoid = () => P.bool('avoidRepeats', true);
const availableFighters = () => { const ex = new Set(Lists.excluded()), us = new Set(Lists.used()); return Lists.fighters().filter((f) => !ex.has(f) && (!avoid() || !us.has(f))); };
const addHistory = (rec) => HistoryStore.add(App.user(), rec);
const localLines = (players) => players.map((p) => `${p.name}: ${p.chars.join(' + ')} (№${[...p.nums].sort((a, b) => a - b).join(',')})`);
function markUsed(names) { if (!avoid()) return; const u = Lists.used(); names.forEach((n) => { if (!u.includes(n)) u.push(n); }); Lists.setUsed(u); }
const localName = (i) => ((P.get('localNames', '') || '').split('\n')[i] || '').trim() || `Гравець ${i + 1}`;

/** Спільна анімація, потім дія. */
function withRoll(plan) {
    if (rolling) return; rolling = true;
    showRoll(plan.map, plan.left, plan.right, {}, () => { rolling = false; plan.apply(); });
}

// ───────────── Звичайна гра (один пристрій) ─────────────

function openLocalDialog() {
    let count = Math.min(4, Math.max(2, P.int('localCount', 2)));
    let selfTeams = P.bool('localSelfTeams', false);
    const names = (P.get('localNames', '') || '').split('\n'); while (names.length < 4) names.push('');
    const teams = [0, 0, 1, 1];
    const msg = h('div', { class: 'err' }), body = h('div');
    const draw = () => {
        body.replaceChildren(
            h('p', { class: 'muted' }, t('Добір персонажів, поля й черговості ходу на одному пристрої. Статистика для таких ігор не ведеться, але битви потрапляють в історію.')),
            h('h3', null, t('Кількість гравців')),
            h('div', { class: 'row' }, [2, 3, 4].map((n) => h('button', { class: 'btn ' + (count === n ? '' : 'ghost'), onclick: () => { count = n; draw(); } }, String(n)))),
            h('p', { class: 'muted small' }, count === 2 ? '1 на 1' : '2 на 2'),
            ...Array.from({ length: count }, (_, i) => h('div', { class: 'row' },
                h('input', { class: 'input grow', maxlength: 16, placeholder: `Гравець ${i + 1}`, value: names[i], oninput: (e) => { names[i] = e.target.value; } }),
                (count >= 3 && selfTeams) ? h('button', { class: 'btn small ' + (teams[i] === 0 ? '' : 'ghost'), onclick: () => { teams[i] = 1 - teams[i]; draw(); } }, t('Команда') + ' ' + (teams[i] === 0 ? 'А' : 'Б')) : null)),
            count >= 3 ? h('label', { class: 'row check' }, h('input', { type: 'checkbox', checked: selfTeams, onchange: (e) => { selfTeams = e.target.checked; draw(); } }), h('span', null, t('Команди обирають гравці'))) : null, msg);
    };
    draw();
    const d = openDialog({
        title: 'ЗВИЧАЙНА ГРА', body, actions: [btn('Скасувати', () => d.close(), 'ghost'), btn('ЗІБРАТИ БИТВУ', () => {
            P.set('localCount', count); P.set('localSelfTeams', selfTeams); P.set('localNames', names.join('\n'));
            const err = buildLocalBattle(count, names.slice(0, count).map((n, i) => n.trim() || `Гравець ${i + 1}`), selfTeams, teams.slice(0, count));
            if (err) msg.textContent = t(err); else d.close();
        })]
    });
}

function buildLocalBattle(count, names, selfTeams, localTeams) {
    if (local && local.timerStart >= 0 && local.timerStop < 0) return 'Спочатку зупини таймер поточної гри.';
    const teamGame = count >= 3, needed = count === 2 ? 2 : 4;
    const avail = availableFighters(), availMaps = Lists.maps().filter((m) => !teamGame || m.team);
    const inT0 = localTeams.filter((x) => x === 0).length;
    const teamsOk = !(teamGame && selfTeams) || (count === 4 ? inT0 === 2 : (inT0 === 1 || inT0 === 2));
    if (!teamsOk) return count === 4 ? 'У кожній команді має бути по двоє гравців.' : 'Розподіли гравців так: двоє в одній команді й один в іншій.';
    if (avail.length < needed) return `Потрібно щонайменше ${needed} доступних персонажів.`;
    if (!availMaps.length) return teamGame ? 'Додай поле, яке підтримує 2 на 2.' : 'Спочатку додай поле битви.';
    const chosen = shuffle(avail).slice(0, needed), map = pick(availMaps).name;
    let players;
    if (count === 2) { const n = shuffle([1, 2]); players = [0, 1].map((i) => ({ name: names[i], chars: [chosen[i]], nums: [n[i]], team: i })); }
    else {
        let teamOf;
        if (selfTeams) teamOf = localTeams;
        else if (count === 3) { const solo = Math.floor(Math.random() * 3); teamOf = [0, 1, 2].map((i) => (i === solo ? 1 : 0)); }
        else { const first = shuffle([0, 1, 2, 3]).slice(0, 2); teamOf = [0, 1, 2, 3].map((i) => (first.includes(i) ? 0 : 1)); }
        const parity = shuffle([[1, 3], [2, 4]]), teamNums = [shuffle(parity[0]), shuffle(parity[1])];
        let ci = 0; players = [];
        for (let tm = 0; tm <= 1; tm++) {
            const mem = [0, 1, 2, 3].slice(0, count).filter((i) => teamOf[i] === tm);
            mem.forEach((pi, k) => {
                if (mem.length >= 2) players.push({ name: names[pi], chars: [chosen[ci++]], nums: [teamNums[tm][k]], team: tm });
                else { const c1 = chosen[ci++], c2 = chosen[ci++]; players.push({ name: names[pi], chars: [c1, c2], nums: teamNums[tm].slice().sort((a, b) => a - b), team: tm }); }
            });
        }
    }
    const left = players.filter((p) => p.team === 0).flatMap((p) => p.chars), right = players.filter((p) => p.team === 1).flatMap((p) => p.chars);
    withRoll({
        map, left, right, apply: () => {
            const mode = count === 2 ? '1 на 1' : '2 на 2';
            local = { players, map, mode, details: '', timerStart: -1, timerStop: -1, ts: Date.now(), vetoP: new Set(), vetoMap: false, tournament: false };
            markUsed(chosen);
            addHistory({ timestamp: local.ts, mode, fighters: localLines(players), mapName: map, details: '' });
            render(); openLocalResult();
        }
    });
    return '';
}

function updateLocalRecord() {
    const list = HistoryStore.load(App.user()), i = list.findIndex((r) => r.timestamp === local.ts);
    if (i >= 0) { list[i] = { ...list[i], fighters: localLines(local.players), mapName: local.map }; HistoryStore.save(App.user(), list); }
}

function vetoPlayer(i) {
    if (local.timerStart >= 0 || local.vetoP.has(i) || local.tournament) return;
    const cur = local.players[i], taken = new Set(local.players.flatMap((p) => p.chars));
    const pool = Lists.fighters().filter((f) => !Lists.excluded().includes(f) && !taken.has(f) && (!avoid() || !Lists.used().includes(f)));
    if (pool.length < cur.chars.length) return toast('Немає з кого обрати нового персонажа.');
    const fresh = shuffle(pool).slice(0, cur.chars.length);
    local.players[i] = { ...cur, chars: fresh };
    if (avoid()) { const u = Lists.used().filter((x) => !cur.chars.includes(x)); fresh.forEach((x) => { if (!u.includes(x)) u.push(x); }); Lists.setUsed(u); }
    local.vetoP.add(i); updateLocalRecord(); drawResult(); render();
}
function vetoMap() {
    if (local.timerStart >= 0 || local.vetoMap || local.tournament) return;
    const team = local.players.length >= 3, pool = Lists.maps().filter((m) => (!team || m.team) && m.name !== local.map);
    if (!pool.length) return toast('Немає іншого поля для заміни.');
    local.map = pick(pool).name; local.vetoMap = true; updateLocalRecord(); drawResult();
}
function startTimer() { if (local.timerStart >= 0) return; local.timerStart = mono(); drawResult(); }
function stopTimer() {
    if (!(local.timerStart >= 0 && local.timerStop < 0)) return;
    const ms = mono() - local.timerStart; local.timerStop = ms;
    const list = HistoryStore.load(App.user()), i = list.findIndex((r) => r.timestamp === local.ts);
    if (i >= 0) { list[i] = { ...list[i], details: (list[i].details + `\nТривалість: ${formatDuration(ms)}`).trim() }; HistoryStore.save(App.user(), list); }
    drawResult(); render();
}

function openLocalResult() {
    if (!local) return;
    if (resultDlg) resultDlg.close();
    resultDlg = openDialog({ title: 'РЕЗУЛЬТАТ', wide: true, body: [], onClose: () => { resultDlg = null; clearInterval(timerIv); } });
    drawResult();
    clearInterval(timerIv);
    timerIv = setInterval(() => { const el = $('#local-timer'); if (el && local && local.timerStart >= 0 && local.timerStop < 0) el.textContent = '⏱ ' + formatDuration(mono() - local.timerStart); }, 500);
}

function drawResult() {
    if (!resultDlg || !local) return;
    const L = local, canVeto = L.timerStart < 0 && !L.tournament, running = L.timerStart >= 0 && L.timerStop < 0;
    resultDlg.setBody([
        h('div', { class: 'muted center' }, L.mode === '1 на 1' && L.tournament ? 'Турнір 1 на 1' : L.mode),
        h('h3', { class: 'center' }, t('ПОЛЕ БИТВИ')), h('div', { class: 'row center' }, mapIcon(L.map, 220)), h('div', { class: 'center' }, h('b', null, Labels.map(L.map))),
        canVeto && !L.vetoMap ? h('div', { class: 'row center' }, btn('Відхилити', vetoMap, 'ghost small')) : null,
        L.details ? h('p', { class: 'center muted' }, t(L.details)) : null,
        h('h3', null, t('Гравці')),
        h('div', { class: 'list' }, L.players.map((p, i) => h('div', { class: 'row seat' + (p.team ? ' side1' : '') },
            h('div', { class: 'grow' }, h('b', null, p.name), L.players.length > 2 ? h('span', { class: 'muted small' }, ' • ' + t('команда') + ' ' + (p.team === 0 ? 'А' : 'Б')) : null,
                h('div', { class: 'assign' }, p.chars.map((c) => h('span', { class: 'ach' }, fighterIcon(c, 40), Labels.char(c))), h('span', { class: 'num' }, ' № ' + [...p.nums].sort((a, b) => a - b).join(',') + (p.nums.includes(1) ? ' (' + t('перший') + ')' : '')))),
            canVeto && !L.vetoP.has(i) ? btn('Відхилити', () => vetoPlayer(i), 'ghost small') : null))),
        h('div', { class: 'center timer', id: 'local-timer' }, L.timerStart < 0 ? '' : (running ? '⏱ ' + formatDuration(mono() - L.timerStart) : t('Час гри: ') + formatDuration(L.timerStop))),
        h('div', { class: 'row center' }, L.timerStart < 0 ? btn('Старт', startTimer) : (running ? btn('Стоп', stopTimer) : null)),
        h('div', { class: 'row end' }, btn('Нова партія', () => { if (running) return toast('Спочатку зупини таймер поточної гри.'); resultDlg.close(); openLocalDialog(); }, 'ghost'), btn('Закрити', () => resultDlg.close()))
    ]);
}

// ───────────── Турнір на одному пристрої ─────────────

function openTournament() {
    if (Net.room.active) return toast('Турнір у мережі запускає хост застосунку.');
    if (local && local.timerStart >= 0 && local.timerStop < 0) return toast('Спочатку зупини таймер поточної гри.');
    const avail = availableFighters(), maps = Lists.maps();
    if (avail.length < 8) return toast('Для турніру потрібно 8 доступних персонажів.');
    if (maps.length < 3) return toast('Для турніру потрібно щонайменше 3 поля битв.');
    localPrep = { phase: 0, pool: shuffle(avail).slice(0, 8), maps: shuffle(maps).slice(0, 3).map((m) => m.name), p1Chars: [], p1Map: '', p1First: 0, p2Choice: '', p1Name: localName(0), p2Name: localName(1), p1Seat: -1, p2Seat: -1 };
    const dlg = openTournamentDialog({
        prep: () => localPrep, canP1: () => true, canP2: () => true, icons: () => ({}),
        select: (c, m, f) => { localPrep.p1Chars = c; localPrep.p1Map = m; localPrep.p1First = f; },
        confirm: () => { localPrep.phase = 1; dlg.render(); },
        pick: (ch) => { localPrep.p2Choice = ch; runTournament(localPrep, dlg); },
        cancel: () => { localPrep = null; dlg.close(); }
    });
}

function runTournament(prep, dlg) {
    const c2 = prep.p2Choice, c1 = prep.p1Chars.find((x) => x !== c2); if (!c1) return;
    const map = prep.p1Map, first = prep.p1First;
    localPrep = null; dlg.close();
    withRoll({
        map, left: [c1], right: [c2], apply: () => {
            markUsed([c1, c2]);
            const players = [{ name: prep.p1Name, chars: [c1], nums: [first === 1 ? 1 : 2], team: 0 }, { name: prep.p2Name, chars: [c2], nums: [first === 2 ? 1 : 2], team: 1 }];
            const details = `Першим ходить ${first === 1 ? prep.p1Name : prep.p2Name}`;
            local = { players, map, mode: 'Турнір 1 на 1', details, timerStart: -1, timerStop: -1, ts: Date.now(), vetoP: new Set(), vetoMap: false, tournament: true };
            addHistory({ timestamp: local.ts, mode: local.mode, fighters: localLines(players), mapName: map, details });
            toast('Турнірну підготовку завершено!'); render(); openLocalResult();
        }
    });
}

// ───────────── Списки персонажів / полів ─────────────

function toggleExcluded(name) { const e = Lists.excluded(); const i = e.indexOf(name); if (i >= 0) e.splice(i, 1); else e.push(name); Lists.setExcluded(e); render(); }

function deleteFighter(name) {
    if (Official.isChar(name)) return toast('Офіційних персонажів видалити не можна.');
    const snap = { name, list: Lists.fighters(), box: Lists.boxes()[name], link: Links.chars()[name], icon: Icons.get(name), ex: Lists.excluded().includes(name), used: Lists.used().includes(name) };
    Lists.setFighters(snap.list.filter((x) => x !== name)); Lists.setExcluded(Lists.excluded().filter((x) => x !== name)); Lists.setUsed(Lists.used().filter((x) => x !== name));
    const b = Lists.boxes(); delete b[name]; Lists.setBoxes(b); const l = Links.chars(); delete l[name]; Links.saveChars(l); Icons.del(name); render();
    toast(`Видалено: ${name}`, 6000, {
        label: 'Скасувати', fn: () => {
            Lists.setFighters(snap.list); if (snap.box) { const bb = Lists.boxes(); bb[name] = snap.box; Lists.setBoxes(bb); } if (snap.link) { const ll = Links.chars(); ll[name] = snap.link; Links.saveChars(ll); }
            if (snap.icon) Icons.set(name, snap.icon); if (snap.ex) Lists.setExcluded([...Lists.excluded(), name]); if (snap.used) Lists.setUsed([...Lists.used(), name]); render();
        }
    });
}
function deleteMap(m) {
    if (Official.isMap(m.name)) return toast('Офіційні поля видалити не можна.');
    const all = Lists.maps(); Lists.setMaps(all.filter((x) => x.name !== m.name)); render();
    toast(`Видалено: ${m.name}`, 6000, { label: 'Скасувати', fn: () => { Lists.setMaps(all); render(); } });
}

function fighterRow(name) {
    const off = Lists.excluded().includes(name), used = avoid() && Lists.used().includes(name), id = Labels.charId(name);
    return h('div', { class: 'row fighter' + (off ? ' off' : '') },
        h('button', { class: 'row-main', onclick: () => toggleExcluded(name), title: t('Виключити / повернути') }, fighterIcon(name, 44),
            h('div', { class: 'grow' }, h('div', { class: 'name' }, Labels.char(name), id && Cat.charById(id) ? h('span', { class: 'off-badge' }, ' ✓') : null), used ? h('div', { class: 'muted small' }, t('вже було')) : null, off ? h('div', { class: 'muted small' }, t('Виключено')) : null)),
        h('button', { class: 'icon-btn', onclick: () => openFighterEdit(name), 'aria-label': t('Редагувати') }, '✎'),
        Official.isChar(name) ? h('span', { class: 'lock', title: t('Офіційний персонаж') }, '🔒') : h('button', { class: 'icon-btn', onclick: () => deleteFighter(name), 'aria-label': t('Видалити') }, '🗑'));
}

function mapRow(m) {
    return h('div', { class: 'row map-row' }, mapIcon(m.name, 96), h('div', { class: 'grow' }, h('div', { class: 'name' }, Labels.map(m.name)),
        h('button', { class: 'chip ' + (m.team ? 'win' : ''), title: t('Підходить для 2 на 2'), disabled: Official.isMap(m.name), onclick: () => { Lists.setMaps(Lists.maps().map((x) => (x.name === m.name ? { ...x, team: !x.team } : x))); render(); } }, m.team ? '1 на 1 та 2 на 2' : 'Тільки 1 на 1')),
        h('button', { class: 'icon-btn', onclick: () => promptDialog({ title: 'Власний підпис', label: 'Назва поля', value: Labels.map(m.name), maxlength: 30, onOk: (v) => { const id = Labels.mapId(m.name); if (id) { Labels.setMap(id, v.trim() === m.name ? '' : v.trim()); render(); } else toast('Підпис можна змінити лише для офіційних полів.'); } }), 'aria-label': t('Редагувати') }, '✎'),
        Official.isMap(m.name) ? h('span', { class: 'lock', title: t('Офіційне поле') }, '🔒') : h('button', { class: 'icon-btn', onclick: () => deleteMap(m), 'aria-label': t('Видалити') }, '🗑'));
}

function addFighterForm() {
    const nameI = h('input', { class: 'input', placeholder: t('Ім\'я персонажа'), maxlength: FIGHTER_MAX_NAME }), boxI = h('input', { class: 'input', placeholder: t('Коробка'), maxlength: FIGHTER_MAX_BOX, list: 'box-list' });
    let icon = null; const prev = h('span');
    const add = () => {
        let name = cleanName(nameI.value); if (!name) return toast('Введіть ім’я.');
        const list = Lists.fighters(); if (list.some((x) => x.toLowerCase() === name.toLowerCase())) return toast('Такий персонаж уже є.');
        const cc = Cat.charByName(name);
        if (cc && cc.name.toLowerCase() === name.toLowerCase()) { addOfficialChar(cc, cc.box); render(); nameI.value = ''; return; }
        list.push(name); Lists.setFighters(list); const bx = cleanBox(boxI.value); if (bx) { const b = Lists.boxes(); b[name] = bx; Lists.setBoxes(b); }
        if (icon) Icons.set(name, icon);
        nameI.value = ''; icon = null; prev.replaceChildren(); render();
    };
    nameI.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return h('div', { class: 'add-form' }, nameI, boxI,
        h('button', { class: 'btn ghost small', onclick: () => pickFile('image/*', async (f) => { try { icon = await fileToSquareDataUrl(f, ICON_SIZE); prev.replaceChildren(h('img', { class: 'icon', src: icon, style: { width: '28px', height: '28px' } })); } catch (_) { toast('Не вдалося завантажити зображення.'); } }) }, '🖼 ' + t('Іконка')), prev,
        h('button', { class: 'btn', onclick: add }, t('Додати')));
}

function addMapForm() {
    const nameI = h('input', { class: 'input', placeholder: t('Назва поля'), maxlength: 40 }), team = h('input', { type: 'checkbox' });
    const add = () => {
        const name = cleanName(nameI.value); if (!name) return toast('Введіть назву.');
        const list = Lists.maps(); if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) return toast('Таке поле вже є.');
        const cm = Cat.mapByName(name); if (cm && cm.name.toLowerCase() === name.toLowerCase()) { addOfficialMap(cm, cm.box); nameI.value = ''; render(); return; }
        list.push({ name, team: team.checked }); Lists.setMaps(list); nameI.value = ''; team.checked = false; render();
    };
    nameI.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return h('div', { class: 'add-form' }, nameI, h('label', { class: 'row check' }, team, h('span', null, t('Підходить для 2 на 2'))), h('button', { class: 'btn', onclick: add }, t('Додати')));
}

function historyCard() {
    const list = HistoryStore.load(App.user());
    const card = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, t(`Історія битв (${list.length})`)),
        h('button', { class: 'btn ghost small', onclick: () => { A.showHist = !A.showHist; render(); } }, t(A.showHist ? 'Сховати' : 'Показати'))));
    if (!A.showHist) return card;
    if (!list.length) card.append(h('p', { class: 'muted' }, t('Історія поки порожня.')));
    list.forEach((r, i) => card.append(h('details', { class: 'hist' }, h('summary', null, h('b', null, t(r.mode)), ' • ', Labels.map(r.mapName), h('span', { class: 'muted small' }, ' • ' + formatDate(r.timestamp))),
        h('div', { class: 'hist-body' }, r.fighters.map((l) => h('div', null, l)), r.details ? h('div', { class: 'muted', style: { whiteSpace: 'pre-line' } }, t(r.details)) : null,
            h('button', { class: 'link', onclick: () => { const l = HistoryStore.load(App.user()); l.splice(i, 1); HistoryStore.save(App.user(), l); render(); } }, t('Видалити'))))));
    if (list.length) card.append(h('div', { class: 'row end' }, btn('Очистити історію битв', () => confirmDialog('Очистити історію битв?', () => { HistoryStore.save(App.user(), []); render(); }), 'ghost small')));
    return card;
}

// ───────────── Рендер головного екрана ─────────────

function menuItems() {
    return [['📊', 'Статистика', openStatsDialog], ['📚', 'Каталог офіційних коробок', openCatalogDialog], ['🎨', 'Зміна теми', openThemeDialog], ['🌍', 'Мова', openLanguageDialog], ['💾', 'Резервна копія', openBackupDialog],
    ...(A.installEvt ? [['⬇', 'Встановити на пристрій', async () => { A.installEvt.prompt(); A.installEvt = null; render(); }]] : [])];
}

function render() {
    const root = $('#app'); if (!root) return;
    const scroll = window.scrollY, user = App.user(), fighters = Lists.fighters(), maps = Lists.maps(), boxes = Lists.boxes();
    ThemeStore.apply(ThemeStore.current());
    const us = new Set(Lists.used());
    const q = norm(A.search);
    const shown = fighters.filter((f) => (!q || norm(f).includes(q) || norm(Labels.char(f)).includes(q)) && (!A.onlyExcluded || Lists.excluded().includes(f)));
    const groups = Lists.grouped(shown, boxes);
    let counter = 0;
    const fighterCard = h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, t('ПЕРСОНАЖІ') + ` (${fighters.length})`),
            h('label', { class: 'row check small' }, h('input', { type: 'checkbox', checked: A.onlyExcluded, onchange: (e) => { A.onlyExcluded = e.target.checked; render(); } }), h('span', null, t('Лише виключені')))),
        addFighterForm(), h('input', { class: 'input', type: 'search', placeholder: t('Пошук персонажа чи поля'), value: A.search, oninput: (e) => { A.search = e.target.value; const p = e.target.selectionStart; render(); const n = $('#app input[type=search]'); if (n) { n.focus(); n.setSelectionRange(p, p); } } }),
        h('div', { class: 'list' }, groups.map(([box, names]) => {
            const items = A.showAllF || q ? names : names.filter(() => counter++ < SHOW_LIMIT);
            if (!items.length) return null;
            return h('div', { class: 'group' }, h('button', { class: 'group-head', onclick: () => { A.collapsed[box] = !A.collapsed[box]; render(); } }, (A.collapsed[box] ? '▸ ' : '▾ ') + (box || t('Без коробки')), h('span', { class: 'muted small' }, ` ${names.length}`)),
                A.collapsed[box] ? null : items.map(fighterRow));
        })),
        shown.length > SHOW_LIMIT && !q ? h('div', { class: 'row center' }, btn(A.showAllF ? 'Сховати' : `Показати всі персонажі (${shown.length})`, () => { A.showAllF = !A.showAllF; render(); }, 'ghost small')) : null);
    const mapCard = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, t('ПОЛЯ БИТВ') + ` (${maps.length})`)), addMapForm(),
        h('div', { class: 'list' }, (A.showAllM ? maps : maps.slice().reverse().slice(0, SHOW_LIMIT)).map(mapRow)),
        maps.length > SHOW_LIMIT ? h('div', { class: 'row center' }, btn(A.showAllM ? 'Сховати' : `Показати всі поля (${maps.length})`, () => { A.showAllM = !A.showAllM; render(); }, 'ghost small')) : null);

    const menu = h('div', { class: 'menu', id: 'menu', hidden: true }, menuItems().map(([ic, label, fn]) => h('button', { class: 'menu-item', onclick: () => { $('#menu').hidden = true; fn(); } }, ic + ' ' + t(label))));
    const header = h('header', { class: 'top' },
        h('div', { class: 'brand' }, h('h1', null, 'UNMATCHED'), h('div', { class: 'muted small' }, t('Випадковий вибір персонажів і поля'))),
        h('div', { class: 'top-actions' },
            h('button', { class: 'chip net', id: 'net-chip', onclick: () => (Net.room.active ? syncNet() : openJoinDialog()) }),
            h('button', { class: 'user-btn', onclick: openAccountDialog }, avatarEl(user ? Avatars.get(user) : null, user || '?', 32), h('span', null, user || t('Гість'))),
            h('div', { class: 'menu-wrap' }, h('button', { class: 'icon-btn', 'aria-label': t('Налаштування'), onclick: (e) => { e.stopPropagation(); const m = $('#menu'); m.hidden = !m.hidden; } }, '⚙'), menu)));
    const play = h('section', { class: 'card hero' },
        h('div', { class: 'btn-grid' }, h('button', { class: 'btn big', onclick: openLocalDialog }, '🎲 ' + t('ЗВИЧАЙНА ГРА')), h('button', { class: 'btn big ghost', onclick: openTournament }, '🏆 ' + t('ТУРНІРНИЙ РЕЖИМ')),
            h('button', { class: 'btn big ghost', onclick: () => (Net.room.active ? syncNet() : openJoinDialog()) }, '🌐 ' + t(Net.room.active ? 'КІМНАТА' : 'Приєднатися до гри'))),
        h('div', { class: 'row wrap' }, h('label', { class: 'row check' }, h('input', { type: 'checkbox', checked: avoid(), onchange: (e) => { P.set('avoidRepeats', e.target.checked); render(); } }), h('span', null, t('Без повторів'))),
            us.size && avoid() ? btn(`Скинути використаних (${us.size})`, () => { Lists.setUsed([]); render(); }, 'ghost small') : null,
            local ? btn('РЕЗУЛЬТАТ', openLocalResult, 'ghost small') : null),
        h('div', { class: 'muted small' }, `${t('Доступно персонажів')}: ${availableFighters().length} / ${fighters.length}`));
    root.replaceChildren(header, h('main', { class: 'grid' }, h('div', { class: 'col' }, play, fighterCard), h('div', { class: 'col' }, mapCard, historyCard())));
    $('#box-list').replaceChildren(...Lists.allBoxes(boxes).map((b) => h('option', { value: b })));
    App.updateNetChip();
    window.scrollTo(0, scroll);
}

// ───────────── Запуск ─────────────

function initApp() {
    // Файли сайту мають бути однієї версії: частково оновлений або застарілий кеш ламає запуск
    const missing = [];
    if (typeof Official === 'undefined') missing.push('Official');
    if (typeof AccountSync === 'undefined') missing.push('AccountSync');
    if (typeof openManualMatchDialog === 'undefined') missing.push('openManualMatchDialog');
    if (typeof detectHostedRoom === 'undefined') missing.push('detectHostedRoom');
    if (missing.length) throw new Error('Не збігаються версії файлів сайту (немає: ' + missing.join(', ') + ').');
    setLang(P.get('language', 'uk')); Labels.reload();
    try { if (Official.ensure()) Labels.reload(); } catch (e) { console.error(e); }   // усі офіційні коробки — автоматично
    ThemeStore.apply(ThemeStore.current());
    document.head.append(h('link', { rel: 'stylesheet', href: 'css/polish.css' }));
    window.addEventListener('message', AccountSync.onParentMessage);
    AccountSync.startChild();
    document.title = 'Unmatched';
    Net.subscribe(syncNet);
    document.addEventListener('click', () => { const m = $('#menu'); if (m) m.hidden = true; });
    setInterval(() => {   // секундомір у кімнаті
        const r = Net.room, b = r.battle, el = lobbyDlg && $('.timer', lobbyDlg.el);
        if (el && b && (b.startedAt >= 0 || b.stoppedMs >= 0)) el.textContent = (b.stoppedMs >= 0 ? t('Час гри: ') : '⏱ ') + formatDuration(b.stoppedMs >= 0 ? b.stoppedMs : Date.now() - b.startedAt);
    }, 1000);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); A.installEvt = e; render(); });
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => { });
    if (!P.has('fighters') && !P.has('maps')) { /* порожній старт: користувач додає все з каталогу або вручну */ }
    render();
    // Сторінку віддав застосунок-хост (http://IP:45679): одразу пропонуємо приєднатись до його кімнати
    detectHostedRoom().then((g) => { if (g && !Net.room.active) openJoinDialog(); });
    if (P.quota) toast('Сховище браузера заповнене: частину даних не збережено.');
}

/** Скидає службовий кеш сайту (service worker) і перезавантажує сторінку. */
async function hardReload() {
    try {
        if ('serviceWorker' in navigator) (await navigator.serviceWorker.getRegistrations()).forEach((r) => r.unregister());
        if (window.caches) (await caches.keys()).forEach((k) => caches.delete(k));
    } catch (_) { }
    location.reload();
}

/** Замість порожнього екрана показує причину збою й кнопку оновлення. */
function showLoadError(e) {
    const box = document.getElementById('app') || document.body;
    box.replaceChildren(h('div', { style: { maxWidth: '520px', margin: '48px auto', padding: '0 20px', fontFamily: 'sans-serif', lineHeight: '1.5', color: 'var(--text, #eee)' } },
        h('h2', null, 'Не вдалося запустити сайт'),
        h('p', null, 'Схоже, браузер завантажив файли різних версій (старий кеш). Натисніть кнопку нижче — вона скине кеш і перезавантажить сторінку.'),
        h('p', { style: { opacity: '.7', fontSize: '.85rem' } }, String((e && e.message) || e)),
        h('button', { style: { padding: '12px 20px', fontSize: '1rem', borderRadius: '10px', border: '0', cursor: 'pointer' }, onclick: hardReload }, 'Оновити сайт')));
}

function init() {
    try { initApp(); } catch (e) { console.error(e); showLoadError(e); }
}
document.addEventListener('DOMContentLoaded', init);
