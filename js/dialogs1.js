'use strict';
// ───────────── Діалоги: статистика, акаунт, профіль, теми, мова, резервні копії, каталог, редагування ─────────────

// ───────────── Статистика ─────────────

function statTable(map, mode, nameFn = (x) => x, labelHead = 'Назва') {
    const rows = Object.entries(map).filter(([k]) => k.startsWith(mode + '|')).map(([k, v]) => [k.slice(mode.length + 1), v])
        .sort((a, b) => b[1].games - a[1].games || a[0].localeCompare(b[0]));
    if (!rows.length) return h('p', { class: 'muted' }, t('Немає даних.'));
    return h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, t(labelHead)), h('th', null, t('Ігор')), h('th', null, t('Перемог')), h('th', null, '%'))),
        h('tbody', null, rows.map(([n, v]) => h('tr', null, h('td', null, nameFn(n)), h('td', null, v.games), h('td', null, v.wins), h('td', null, pct(v.games, v.wins)))))));
}

function openStatsDialog() {
    const user = App.user(), owner = user || null;
    const drawStats = () => {
        const s = Stats.load(owner), matches = MatchStore.load(owner);
        const modes = Object.keys(s.totals).sort();
        if (!modes.length) return h('p', { class: 'muted' }, t('Статистика поки порожня. Зіграйте мережеву гру або додайте матч вручну.'));
        return tabs(modes.map((m) => [m, m]), modes[0], (mode) => {
            const tot = s.totals[mode];
            const month = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };
            const mm = {}; matches.filter((m) => m.mode === mode).forEach((m) => { const k = month(m.ts); (mm[k] = mm[k] || { g: 0, w: 0 }); mm[k].g++; if (m.win) mm[k].w++; });
            const dyn = Object.keys(mm).map(Number).sort((a, b) => a - b).slice(-12);
            const sec = (title, node) => h('section', { class: 'stat-sec' }, h('h3', null, t(title)), node);
            return h('div', null,
                h('div', { class: 'stat-total' }, h('b', null, tot.games), ' ', t('Ігор'), ' • ', h('b', null, tot.wins), ' ', t('Перемог'), ' • ', h('b', null, pct(tot.games, tot.wins))),
                sec('Персонажі', statTable(s.chars, mode, (n) => Labels.char(n), 'Персонаж')),
                sec('Поля', statTable(s.maps, mode, (n) => Labels.map(n), 'Поле')),
                sec('Номер ходу', statTable(s.turns, mode, (n) => '№ ' + n, 'Номер')),
                sec('Суперники', statTable(s.opps, mode, (n) => n, 'Суперник')),
                sec('Матчапи', statTable(s.matchups, mode, (n) => n.split('\t').map((x) => Labels.char(x)).join(' → '), 'Мій → суперника')),
                dyn.length ? sec('Динаміка за місяцями', h('div', { class: 'bars' }, dyn.map((k) => {
                    const v = mm[k], y = Math.floor(k / 12), mo = (k % 12) + 1, p = Math.round((v.w * 100) / v.g);
                    return h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { height: Math.max(4, p) + '%' }, title: `${p}% (${v.w}/${v.g})` }), h('div', { class: 'bar-l' }, `${String(mo).padStart(2, '0')}.${String(y).slice(2)}`));
                }))) : null,
                sec('Матчі', h('div', { class: 'list' }, matches.filter((m) => m.mode === mode).slice(0, 100).map((m) =>
                    h('div', { class: 'row' },
                        h('div', { class: 'grow' }, h('div', null, m.id.startsWith('manual-') ? h('span', { class: 'muted', title: t('Внесено вручну') }, '✎ ') : null, m.chars.map(Labels.char).join(' + '), ' • ', Labels.map(m.map)), h('div', { class: 'muted small' }, formatDate(m.ts), m.dur >= 0 ? ' • ' + formatDuration(m.dur) : '', m.opp.length ? ' • vs ' + m.opp.join(', ') : '')),
                        h('button', { class: 'chip ' + (m.win ? 'win' : 'lose'), title: t('Змінити результат'), onclick: () => { MatchStore.toggleWin(owner, m.id); d.setBody(draw()); } }, m.win ? t('Перемога') : t('Поразка')),
                        h('button', { class: 'icon-btn', title: t('Видалити'), onclick: () => confirmDialog('Видалити цей матч зі статистики?', () => { MatchStore.remove(owner, m.id); d.setBody(draw()); }) }, '🗑'))))));
        });
    };
    // Кнопка ручного внесення завжди зверху, навіть коли статистика порожня
    const draw = () => [
        h('div', { class: 'row end manual-add' }, btn('＋ Додати матч вручну', () => openManualMatchDialog(owner, () => d.setBody(draw())))),
        drawStats()
    ];
    const d = openDialog({ title: user ? `Статистика • ${user}` : 'Статистика (гість)', wide: true, body: draw() });
}

// ───────────── Акаунт ─────────────

function openAccountDialog() {
    const draw = () => {
        const user = App.user();
        if (!user) return loginForm();
        return accountPanel(user);
    };
    const finish = () => { App.refresh(); d.setBody(draw()); };

    const loginForm = () => {
        const nick = h('input', { class: 'input', maxlength: 16, autocomplete: 'username', placeholder: t('Нікнейм') });
        const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: t('Пароль') });
        const err = h('div', { class: 'err' });
        let reg = false;
        const go = h('button', { class: 'btn' }, t('Увійти'));
        const sw = h('button', { class: 'link' }, t('Створити акаунт'));
        const sync = () => { go.textContent = t(reg ? 'Створити акаунт' : 'Увійти'); sw.textContent = reg ? t('Увійти') : t('Створити акаунт'); err.textContent = ''; };
        sw.addEventListener('click', () => { reg = !reg; sync(); });
        go.addEventListener('click', async () => {
            err.textContent = ''; go.disabled = true;
            try {
                const n = nick.value.trim();
                if (reg) {
                    if (!Accounts.isValidNick(n)) { err.textContent = t('Нікнейм: 2–16 символів (літери, цифри, _ та -).'); return; }
                    if (pass.value.length < 4) { err.textContent = t('Пароль має містити щонайменше 4 символи.'); return; }
                    if (!(await Accounts.register(n, pass.value))) { err.textContent = t('Такий нікнейм уже існує.'); return; }
                }
                const r = await Accounts.login(n, pass.value);
                if (!r.ok) { err.textContent = t(Accounts.message(r)); return; }
                P.set('currentUser', r.nick); finish();
            } catch (e) { err.textContent = String(e.message || e); } finally { go.disabled = false; }
        });
        return h('div', null, h('label', { class: 'field' }, h('span', null, t('Нікнейм')), nick), h('label', { class: 'field' }, h('span', null, t('Пароль')), pass), err, h('div', { class: 'row end' }, sw, go),
            h('p', { class: 'muted small' }, t('Акаунт зберігається лише в цьому браузері.')));
    };

    const accountPanel = (user) => {
        const av = Avatars.get(user), guest = GuestStore.count();
        return h('div', null,
            h('div', { class: 'row' }, avatarEl(av, user, 72), h('div', { class: 'grow' }, h('h3', null, user), h('div', { class: 'muted' }, `${MatchStore.count(user)} ${t('матчів')}`))),
            h('div', { class: 'btn-grid' },
                btn('Змінити аватар', () => pickFile('image/*', async (f) => { try { Avatars.set(user, await fileToSquareDataUrl(f, 256, 'image/jpeg', 0.85)); finish(); } catch (_) { toast('Не вдалося завантажити зображення.'); } }), 'ghost'),
                av ? btn('Прибрати аватар', () => { Avatars.del(user); finish(); }, 'ghost') : null,
                btn('Профіль', () => openProfileDialog(), 'ghost'),
                btn('Змінити нікнейм', () => promptDialog({
                    title: 'Змінити нікнейм', label: 'Новий нікнейм', value: user, maxlength: 16, onOk: (v) => {
                        v = v.trim(); if (!Accounts.isValidNick(v)) { toast('Нікнейм: 2–16 символів (літери, цифри, _ та -).'); return false; }
                        if (!Accounts.rename(user, v)) { toast('Такий нікнейм уже існує.'); return false; } finish();
                    }
                }), 'ghost'),
                btn('Змінити пароль', () => changePassDialog(user), 'ghost'),
                guest > 0 ? btn(`Прив'язати гостьові матчі (${guest})`, () => { const n = GuestStore.linkTo(user); toast(`Прив'язано матчів: ${n}.`); finish(); }, 'ghost') : null,
                btn('Вийти', () => { P.del('currentUser'); finish(); }),
                btn('Видалити акаунт', () => confirmDialog(`Видалити акаунт «${user}» разом зі статистикою та історією? Цю дію не можна скасувати.`, () => { Accounts.remove(user); finish(); }), 'danger')));
    };

    const d = openDialog({ title: 'Акаунт', body: draw() });
}

function changePassDialog(user) {
    const o = h('input', { class: 'input', type: 'password', placeholder: t('Поточний пароль'), autocomplete: 'current-password' });
    const n = h('input', { class: 'input', type: 'password', placeholder: t('Новий пароль'), autocomplete: 'new-password' });
    const err = h('div', { class: 'err' });
    const d = openDialog({
        title: 'Змінити пароль', body: [o, n, err],
        actions: [btn('Скасувати', () => d.close(), 'ghost'), btn('Зберегти', async () => {
            if (n.value.length < 4) { err.textContent = t('Пароль має містити щонайменше 4 символи.'); return; }
            if (await Accounts.changePassword(user, o.value, n.value)) { d.close(); toast('Пароль змінено.'); } else err.textContent = t('Невірний поточний пароль.');
        })]
    });
}

function openProfileDialog() {
    const user = App.user(); if (!user) return;
    const p = ProfileStore.load(user);
    const sel = (opts, val) => { const s = h('select', { class: 'input' }, h('option', { value: '' }, '—'), opts.map((o) => h('option', { value: o, selected: o === val }, o))); return s; };
    const fc = sel(Lists.fighters(), p.fc), fm = sel(Lists.maps().map((m) => m.name), p.fm);
    const d = openDialog({
        title: 'Профіль', body: [h('p', { class: 'muted' }, t('Цей профіль бачать інші гравці в мережевій кімнаті.')),
        h('label', { class: 'field' }, h('span', null, t('Улюблений персонаж')), fc), h('label', { class: 'field' }, h('span', null, t('Улюблене поле')), fm)],
        actions: [btn('Скасувати', () => d.close(), 'ghost'), btn('Зберегти', () => { ProfileStore.save(user, { fc: fc.value, fm: fm.value }); d.close(); toast('Збережено.'); })]
    });
}

// ───────────── Теми, мова ─────────────

function themeCard(th, on, onclick) {
    return h('button', { class: 'theme-card' + (on ? ' on' : ''), onclick, style: { background: th.surface, color: th.text, borderColor: on ? th.primary : th.secondary } },
        h('div', { class: 'theme-sw' }, [th.background, th.surface, th.primary, th.secondary, th.excluded].map((c) => h('i', { style: { background: c } }))),
        h('div', { class: 'theme-name' }, t(th.name)), on ? h('div', { class: 'theme-ok', style: { color: th.primary } }, '✓') : null);
}

function openThemeDialog() {
    const draw = () => {
        const custom = P.bool('themeCustom', false) && ThemeStore.customExists(), idx = P.int('themeIndex', 0);
        const cards = THEMES.map((th, i) => themeCard(th, !custom && idx === i, () => { P.set('themeIndex', i); P.set('themeCustom', false); ThemeStore.apply(THEMES[i]); d.setBody(draw()); }));
        const ct = ThemeStore.loadCustom();
        cards.push(themeCard({ ...ct, name: CUSTOM_THEME_NAME }, custom, () => {
            if (!ThemeStore.customExists()) return openThemeBuilder(() => d.setBody(draw()));
            P.set('themeCustom', true); ThemeStore.apply(ct); d.setBody(draw());
        }));
        return [h('div', { class: 'theme-grid' }, cards), h('div', { class: 'row end' }, btn('Редагувати власну тему', () => openThemeBuilder(() => d.setBody(draw())), 'ghost'))];
    };
    const d = openDialog({ title: 'Зміна теми', wide: true, body: draw() });
}

function openThemeBuilder(done) {
    const t0 = ThemeStore.loadCustom();
    const FIELDS = [['background', 'Фон екрана'], ['surface', 'Картки, вікна'], ['primary', 'Кнопки, акценти'], ['secondary', 'Рамки, розділювачі'], ['text', 'Основний текст'], ['muted', 'Другорядний текст'], ['excluded', 'Вимкнені елементи'], ['onPrimary', 'Текст на кнопках']];
    const cur = { ...t0 };
    const prev = h('div', { class: 'theme-prev' });
    const paint = () => {
        prev.style.background = cur.background; prev.style.color = cur.text;
        prev.replaceChildren(h('div', { class: 'tp-card', style: { background: cur.surface, borderColor: cur.secondary } },
            h('b', null, 'Unmatched'), h('div', { style: { color: cur.muted } }, t('Другорядний текст')),
            h('span', { class: 'tp-btn', style: { background: cur.primary, color: cur.onPrimary } }, t('Кнопка')),
            h('span', { class: 'tp-btn', style: { background: cur.excluded, color: cur.text } }, t('Вимкнено'))));
        ThemeStore.apply(cur);
    };
    const inputs = FIELDS.map(([k, label]) => h('label', { class: 'color-row' }, h('span', null, t(label)),
        h('input', { type: 'color', value: cur[k], oninput: (e) => { cur[k] = e.target.value; paint(); } })));
    const d = openDialog({
        title: 'Власна тема', body: [prev, h('div', { class: 'color-grid' }, inputs)], onClose: () => ThemeStore.apply(ThemeStore.current()),
        actions: [btn('Скинути', () => { THEMES[0] && Object.assign(cur, THEMES[0]); inputs.forEach((l, i) => { l.querySelector('input').value = cur[FIELDS[i][0]]; }); paint(); }, 'ghost'), btn('Скасувати', () => d.close(), 'ghost'),
        btn('Зберегти', () => { ThemeStore.saveCustom(cur); P.set('themeCustom', true); d.close(); ThemeStore.apply(ThemeStore.current()); if (done) done(); })]
    });
    paint();
}

function openLanguageDialog() {
    const d = openDialog({
        title: 'Мова', body: h('div', { class: 'list' }, LANGUAGES.map((l) => h('button', { class: 'row pick' + (l.code === LANG ? ' on' : ''), onclick: () => { P.set('language', l.code); setLang(l.code); d.close(); App.refresh(); } }, l.title, l.code === LANG ? ' ✓' : '')))
    });
}

// ───────────── Резервна копія ─────────────

function sectionPicker(sections, selected) {
    return h('div', { class: 'list' }, [...sections].map((s) => h('label', { class: 'row check' },
        h('input', { type: 'checkbox', checked: selected.has(s), onchange: (e) => { e.target.checked ? selected.add(s) : selected.delete(s); } }), h('span', null, t(SECTION_TITLES[s] || s)))));
}

function openBackupDialog() {
    const body = h('div', null,
        h('p', { class: 'muted' }, t('Файл сумісний з резервними копіями Android-застосунку: їх можна переносити в обидва боки.')),
        h('div', { class: 'btn-grid' }, btn('Експорт', exportFlow), btn('Імпорт', importFlow, 'ghost')));
    const d = openDialog({ title: 'Резервна копія', body });
    function exportFlow() {
        const sel = new Set(BackupSection.ALL);
        const dd = openDialog({
            title: 'Експорт', body: sectionPicker(BackupSection.ALL, sel),
            actions: [btn('Скасувати', () => dd.close(), 'ghost'), btn('Експорт', () => {
                if (!sel.size) return toast('Оберіть хоча б один розділ.');
                downloadText(`unmatched-${new Date().toISOString().slice(0, 10)}.json`, Backup.export(App.user(), sel)); dd.close(); toast('Резервну копію збережено.');
            })]
        });
    }
    function importFlow() {
        pickFile('application/json,.json', async (file) => {
            const text = await file.text(); const found = Backup.inspect(text);
            if (!found || !found.size) return messageDialog('Файл не підходить.');
            const sel = new Set(found);
            const dd = openDialog({
                title: 'Імпорт', body: sectionPicker(found, sel),
                actions: [btn('Скасувати', () => dd.close(), 'ghost'), btn('Імпорт', () => {
                    try { const rep = Backup.import(text, App.user(), sel); dd.close(); d.close(); App.refresh(); messageDialog(rep || 'Готово.'); } catch (e) { messageDialog('Файл пошкоджено.'); }
                })]
            });
        });
    }
}

// ───────────── Редагування персонажа ─────────────

function renameFighter(old, nw) {
    const list = Lists.fighters().map((x) => (x === old ? nw : x)); Lists.setFighters(list);
    const boxes = Lists.boxes(); if (boxes[old]) { boxes[nw] = boxes[old]; delete boxes[old]; Lists.setBoxes(boxes); }
    const links = Links.chars(); if (links[old]) { links[nw] = links[old]; delete links[old]; Links.saveChars(links); }
    Lists.setExcluded(Lists.excluded().map((x) => (x === old ? nw : x))); Lists.setUsed(Lists.used().map((x) => (x === old ? nw : x)));
    Icons.rename(old, nw); remapNames({ [old]: nw }, {});
}

function openFighterEdit(name) {
    const boxes = Lists.boxes();
    const nameI = h('input', { class: 'input', value: name, maxlength: FIGHTER_MAX_NAME });
    const boxI = h('input', { class: 'input', value: boxes[name] || '', maxlength: FIGHTER_MAX_BOX, list: 'box-list' });
    const id = Labels.charId(name);
    const labelI = id ? h('input', { class: 'input', value: Labels.chars[id] || '', maxlength: 30, placeholder: t('Власний підпис') }) : null;
    if (Official.isChar(name)) { nameI.disabled = true; boxI.disabled = true; }   // офіційні записи не змінюються
    let newIcon = null, removeIcon = false;
    const prev = h('div', { class: 'row' });
    const paint = () => prev.replaceChildren(newIcon ? h('img', { class: 'icon', src: newIcon, style: { width: '64px', height: '64px' } }) : (removeIcon ? letterIcon(name, 64) : fighterIcon(name, 64)),
        btn('Обрати іконку з галереї', () => pickFile('image/*', async (f) => { try { newIcon = await fileToSquareDataUrl(f, ICON_SIZE); removeIcon = false; paint(); } catch (_) { toast('Не вдалося завантажити зображення.'); } }), 'ghost'),
        (Icons.has(name) || newIcon) ? btn('Прибрати іконку', () => { newIcon = null; removeIcon = true; paint(); }, 'ghost') : null);
    paint();
    const d = openDialog({
        title: 'Редагувати персонажа', body: [h('label', { class: 'field' }, h('span', null, t('Ім’я персонажа')), nameI), h('label', { class: 'field' }, h('span', null, t('Коробка')), boxI), labelI ? h('label', { class: 'field' }, h('span', null, t('Власний підпис')), labelI) : null, prev],
        actions: [btn('Скасувати', () => d.close(), 'ghost'), btn('Зберегти', () => {
            let nw = cleanName(nameI.value); if (!nw) return toast('Введіть ім’я.');
            if (nw.toLowerCase() !== name.toLowerCase() && Lists.fighters().some((x) => x.toLowerCase() === nw.toLowerCase())) return toast('Такий персонаж уже є.');
            if (nw !== name) renameFighter(name, nw);
            const b = Lists.boxes(); const bx = cleanBox(boxI.value); if (bx) b[nw] = bx; else delete b[nw]; Lists.setBoxes(b);
            if (newIcon) Icons.set(nw, newIcon); else if (removeIcon) Icons.del(nw);
            if (labelI) Labels.setChar(id, labelI.value.trim().slice(0, 30));
            d.close(); App.refresh();
        })]
    });
}

// ───────────── Каталог офіційних коробок ─────────────

function addOfficialChar(c, boxName) {
    const list = Lists.fighters(), links = Links.chars(), has = (n) => list.find((x) => x.toLowerCase() === n.toLowerCase());
    let existing = has(c.name);
    if (!existing) { const al = c.aliases.map(has).find(Boolean); if (al) { return confirmDialog(`Об'єднати з вашим записом «${al}»? Статистика й історія «${al}» перейдуть на «${c.name}».`, () => mergeChar(al, c, boxName), 'Об’єднати'); } }
    if (existing) { links[existing] = c.id; Links.saveChars(links); Labels.reload(); toast('Прив’язано до каталогу.'); return; }
    list.push(c.name); Lists.setFighters(list); const b = Lists.boxes(); b[c.name] = boxName; Lists.setBoxes(b); links[c.name] = c.id; Links.saveChars(links); Labels.reload(); toast('Додано: ' + c.name);
}
function mergeChar(old, c, boxName) {
    renameFighter(old, c.name); Aliases.add('c', old, c.name);
    const links = Links.chars(); links[c.name] = c.id; Links.saveChars(links);
    const b = Lists.boxes(); if (!b[c.name]) b[c.name] = boxName; Lists.setBoxes(b); Labels.reload(); App.refresh(); toast('Об\'єднано.');
}
function addOfficialMap(m, boxName) {
    const list = Lists.maps(), links = Links.maps(), has = (n) => list.find((x) => x.name.toLowerCase() === n.toLowerCase());
    const existing = has(m.name);
    if (!existing) { const al = m.aliases.map(has).find(Boolean); if (al) return confirmDialog(`Об'єднати з вашим записом «${al.name}»? Статистика й історія «${al.name}» перейдуть на «${m.name}».`, () => {
        Lists.setMaps(Lists.maps().map((x) => (x.name === al.name ? { ...x, name: m.name } : x))); remapNames({}, { [al.name]: m.name }); Aliases.add('m', al.name, m.name);
        const l = Links.maps(); l[m.name] = m.id; Links.saveMaps(l); Labels.reload(); App.refresh(); toast('Об\'єднано.');
    }, 'Об’єднати'); }
    if (existing) { links[existing.name] = m.id; Links.saveMaps(links); Labels.reload(); toast('Прив’язано до каталогу.'); return; }
    list.push({ name: m.name, team: m.team }); Lists.setMaps(list); links[m.name] = m.id; Links.saveMaps(links);
    const mb = Links.mapBoxes(); mb[m.name] = boxName; Links.saveMapBoxes(mb); Labels.reload(); toast('Додано: ' + m.name);
}

function openCatalogDialog() {
    const search = h('input', { class: 'input', type: 'search', placeholder: t('Пошук персонажа чи поля') });
    const out = h('div', { class: 'list' });
    const draw = () => {
        const q = norm(search.value); out.replaceChildren();
        CATALOG.forEach((b) => {
            const cs = b.characters.filter((c) => !q || [c.name, ...c.aliases].some((x) => norm(x).includes(q)));
            const ms = b.maps.filter((m) => !q || [m.name, ...m.aliases].some((x) => norm(x).includes(q)));
            if (!cs.length && !ms.length && !(q && norm(b.name).includes(q))) return;
            out.append(h('details', { class: 'box', open: !!q },
                h('summary', null, b.name, h('span', { class: 'muted small' }, ` ${b.characters.length} / ${b.maps.length}`)),
                cs.map((c) => h('div', { class: 'row' }, fighterIcon(c.name, 32), h('div', { class: 'grow' }, Labels.char(c.name)), chip('✓'))),
                ms.map((m) => h('div', { class: 'row' }, h('div', { class: 'grow' }, '🗺 ', Labels.map(m.name), m.team ? h('span', { class: 'muted small' }, ' • 2 на 2') : null), chip('✓')))));
        });
        if (!out.children.length) out.append(h('p', { class: 'muted' }, t('Нічого не знайдено.')));
    };
    search.addEventListener('input', draw); draw();
    openDialog({ title: 'Каталог офіційних коробок', wide: true, body: [h('p', { class: 'muted small' }, t('Усі офіційні коробки додано автоматично, їх не можна видалити чи змінити.')), search, out] });
}


// ───────────── Ручне внесення матчу ─────────────
// Для ігор, зіграних без застосунку (звичайна гра, настільна гра): формат, свої персонажі, поле, результат
// та додаткові дані вносяться одразу після гри. Такі матчі потрапляють у ту саму статистику, що й мережеві
// (їхній id починається з "manual-").

/** Плитки з пошуком. selected() — поточний вибір, onChange(новий вибір). */
function manualPicker({ options, display, selected, max, onChange, icon }) {
    const q = h('input', { class: 'input', type: 'search', placeholder: t('Пошук') });
    const box = h('div', { class: 'tiles manual-tiles' });
    const sum = h('div', { class: 'muted small manual-sum' });
    const draw = () => {
        const k = q.value.trim().toLowerCase();
        const shown = options.filter((o) => !k || o.toLowerCase().includes(k) || display(o).toLowerCase().includes(k));
        sum.textContent = selected().map(display).join(' + ') || t('Не обрано');
        box.replaceChildren(...shown.map((o) => {
            const on = selected().includes(o);
            return h('button', {
                type: 'button', class: 'tile' + (on ? ' on' : ''),
                onclick: () => {
                    const s = selected();
                    onChange(max === 1 ? [o] : on ? s.filter((x) => x !== o) : (s.length < max ? [...s, o] : s));
                    draw();
                }
            }, icon(o), h('div', { class: 'tile-name' }, display(o)), on ? h('span', { class: 'tile-ok' }, '✓') : null);
        }));
        if (!shown.length) box.append(h('p', { class: 'muted small' }, t('Нічого не знайдено.')));
    };
    q.addEventListener('input', draw); draw();
    return h('div', { class: 'manual-picker' }, sum, q, box);
}

function openManualMatchDialog(owner, onSaved) {
    const pad = (n) => String(n).padStart(2, '0');
    const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const S = { mode: '1 на 1', chars: [], map: '', win: null, nums: [], opp: '', oppChars: [], date: local(new Date()), minutes: '', imported: false };
    const applyImport = (m) => {
        S.mode = m.mode; S.chars = m.chars.slice(0, m.mode === '1 на 1' ? 1 : 2); S.map = Names.map(m.map || '');
        const maxN = m.mode === '1 на 1' ? 2 : 4, ns = m.nums.filter((n) => n <= maxN);
        S.nums = ns.length === S.chars.length ? ns : []; S.win = m.win; S.opp = m.opp.join(', '); S.oppChars = m.oppChars;
        S.date = local(new Date(m.ts)); S.minutes = m.minutes === null ? '' : String(m.minutes); S.imported = true; err.textContent = ''; render();
    };
    const err = h('div', { class: 'err' });
    const fail = (m) => { err.textContent = t(m); };
    const field = (label, node) => h('div', { class: 'field' }, h('span', null, t(label)), node);

    const save = () => {
        err.textContent = '';
        if (!S.chars.length) return fail('Обери свого персонажа.');
        if (!S.map) return fail('Обери поле.');
        if (S.win === null) return fail('Вкажи результат: перемога чи поразка.');
        if (S.nums.length && S.nums.length !== S.chars.length) return fail('Вкажи номер ходу для кожного персонажа або прибери вибір.');
        const ts = new Date(S.date).getTime();
        if (!Number.isFinite(ts)) return fail('Вкажіть дату й час.');
        if (ts > Date.now() + 86400000) return fail('Дата не може бути в майбутньому.');
        let dur = -1;
        if (S.minutes !== '') {
            const m = parseInt(S.minutes, 10);
            if (!(m >= 0 && m <= 600)) return fail('Тривалість — число хвилин від 0 до 600.');
            dur = m * 60000;
        }
        const opp = S.opp.split(/[,;\n]/).map((x) => x.trim().slice(0, 16)).filter(Boolean)
            .filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).slice(0, 3);
        MatchStore.add(owner, {
            id: 'manual-' + uuid(), ts, mode: S.mode, map: Names.map(S.map), chars: S.chars.map(Names.character),
            nums: [...S.nums].sort((a, b) => a - b), win: S.win, opp, oc: S.oppChars.map(Names.character), dur
        });
        toast('Матч додано до статистики.');
        d.close();
        if (onSaved) onSaved();
        if (typeof AccountSync !== 'undefined') AccountSync.pushBack();
    };

    const render = () => {
        const one = S.mode === '1 на 1', maxChars = one ? 1 : 2, maxNum = one ? 2 : 4;
        S.chars = S.chars.slice(0, maxChars);
        const known = Lists.fighters();
        const fighters = [...known, ...[...S.chars, ...S.oppChars].filter((n, i, a) => !known.includes(n) && a.indexOf(n) === i)];
        const mapOpts = Lists.maps().filter((m) => one || m.team).map((m) => m.name);
        if (S.map && !mapOpts.includes(S.map) && !S.imported) S.map = '';
        if (S.map && !mapOpts.includes(S.map)) mapOpts.unshift(S.map);
        S.chars = S.chars.slice(0, maxChars); S.nums = S.nums.filter((n) => n <= maxNum).slice(0, Math.max(S.chars.length, 1));

        const modeRow = h('div', { class: 'row' }, ['1 на 1', '2 на 2'].map((m) =>
            h('button', { type: 'button', class: 'btn ' + (S.mode === m ? '' : 'ghost'), onclick: () => { S.mode = m; render(); } }, m)));

        const resRow = h('div', { class: 'row' });
        const paintRes = () => resRow.replaceChildren(...[[true, 'Перемога'], [false, 'Поразка']].map(([v, l]) =>
            h('button', { type: 'button', class: 'btn ' + (S.win === v ? '' : 'ghost'), onclick: () => { S.win = v; paintRes(); } }, t(l))));
        paintRes();

        const numRow = h('div', { class: 'row wrap' });
        const paintNums = () => numRow.replaceChildren(...Array.from({ length: maxNum }, (_, i) => i + 1).map((n) => {
            const on = S.nums.includes(n);
            return h('button', {
                type: 'button', class: 'btn small ' + (on ? '' : 'ghost'),
                onclick: () => {
                    if (on) S.nums = S.nums.filter((x) => x !== n);
                    else if (S.nums.length < Math.max(S.chars.length, 1)) S.nums = [...S.nums, n];
                    paintNums();
                }
            }, one ? (n === 1 ? t('Перший') : t('Другий')) : '№ ' + n);
        }));
        paintNums();

        d.setBody([
            S.imported ? h('div', { class: 'notice' }, t('Дані перенесено з історії. Перевірте їх і виправте, що потрібно.')) : null,
            h('p', { class: 'muted small' }, t('Внесіть гру, зіграну без застосунку, щоб статистика була повнішою.')),
            h('div', { class: 'row end' }, btn('📋 Взяти з історії', () => openHistoryImportDialog(owner, applyImport), 'ghost small')),
            h('h3', null, t('Формат')), modeRow,
            h('h3', null, t(one ? 'Мій персонаж' : 'Мої персонажі (1–2)')),
            manualPicker({ options: fighters, display: (n) => Labels.char(n), max: maxChars, selected: () => S.chars, onChange: (v) => { S.chars = v; S.nums = S.nums.slice(0, Math.max(v.length, 1)); paintNums(); }, icon: (n) => fighterIcon(n, 44) }),
            h('h3', null, t('Поле')),
            manualPicker({ options: mapOpts, display: (n) => Labels.map(n), max: 1, selected: () => (S.map ? [S.map] : []), onChange: (v) => { S.map = v[0] || ''; }, icon: (n) => mapIcon(n, 96) }),
            h('h3', null, t('Результат')), resRow,
            h('h3', null, t(one ? 'Порядок ходу (необов’язково)' : 'Номер ходу для кожного персонажа (необов’язково)')), numRow,
            h('h3', null, t('Додатково (необов’язково)')),
            field('Суперники (нікнейми, через кому)', h('input', { class: 'input', maxlength: 60, value: S.opp, oninput: (e) => { S.opp = e.target.value; } })),
            h('details', { class: 'manual-opp' }, h('summary', null, t('Персонажі суперників')),
                manualPicker({ options: fighters, display: (n) => Labels.char(n), max: 2, selected: () => S.oppChars, onChange: (v) => { S.oppChars = v; }, icon: (n) => fighterIcon(n, 44) })),
            h('div', { class: 'row wrap' },
                h('div', { class: 'grow' }, field('Дата й час', h('input', { class: 'input', type: 'datetime-local', value: S.date, max: local(new Date()), oninput: (e) => { S.date = e.target.value; } }))),
                h('div', { class: 'grow' }, field('Тривалість, хвилин', h('input', { class: 'input', type: 'number', min: 0, max: 600, inputMode: 'numeric', value: S.minutes, oninput: (e) => { S.minutes = e.target.value; } })))),
            err,
            h('div', { class: 'row end' }, btn('Скасувати', () => d.close(), 'ghost'), btn('Зберегти матч', save))
        ]);
    };
    const d = openDialog({ title: 'Додати матч', wide: true, body: [] });
    render();
}


// ───────────── Перенесення даних з історії битв у ручний матч ─────────────
// Запис історії: режим, поле, час і рядки «Нік: Персонаж + Персонаж (№1,2)» + «Перемога: …», «Тривалість: …».
// Користувач обирає битву, вказує, хто в ній був він, союзник і суперник, а потім правит усе у формі матчу.

function parseHistoryLine(line) {
    const m = /^([^:]+):\s*(.+?)(?:\s*\(№([\d,\s]*)\))?\s*$/.exec(String(line));
    if (!m) return { nick: '', chars: [String(line).trim()].filter(Boolean), nums: [] };
    return {
        nick: m[1].trim(), chars: m[2].split(' + ').map((x) => x.trim()).filter(Boolean),
        nums: (m[3] || '').split(',').map((x) => parseInt(x, 10)).filter((n) => n > 0)
    };
}

function parseHistoryRecord(r) {
    const win = /Перемога:\s*([^\n]*)/.exec(r.details || '');
    const dur = /Тривалість:\s*(\d+):(\d+)(?::(\d+))?/.exec(r.details || '');
    let ms = -1;
    if (dur) ms = (dur[3] !== undefined ? (+dur[1] * 3600 + +dur[2] * 60 + +dur[3]) : (+dur[1] * 60 + +dur[2])) * 1000;
    return {
        mode: /2 на 2/.test(r.mode) ? '2 на 2' : '1 на 1', map: r.mapName, ts: r.timestamp,
        lines: (r.fighters || []).map(parseHistoryLine),
        winners: win ? win[1].split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : null, durMs: ms
    };
}

/** Вікно вибору битви з історії → onPick({mode, map, ts, chars, nums, win, opp, oppChars, minutes}). */
function openHistoryImportDialog(owner, onPick) {
    const list = HistoryStore.load(owner).slice(0, 50);
    const myNick = (owner || '').toLowerCase();
    const ROLES = [['me', 'Я'], ['mate', 'Союзник'], ['opp', 'Суперник']];

    const pickStep = () => {
        if (!list.length) return [h('p', { class: 'muted' }, t('Історія битв порожня.'))];
        return [h('p', { class: 'muted small' }, t('Оберіть битву, дані якої треба перенести. Потім усе можна виправити.')),
            h('div', { class: 'list' }, list.map((r) => h('button', { type: 'button', class: 'row pick', onclick: () => d.setBody(roleStep(r)) },
                h('div', { class: 'grow' }, h('b', null, t(r.mode)), ' • ', Labels.map(r.mapName), h('div', { class: 'muted small' }, formatDate(r.timestamp)),
                    (r.fighters || []).map((l) => h('div', { class: 'small' }, l))), chip('Обрати'))))];
    };

    const roleStep = (rec) => {
        const p = parseHistoryRecord(rec), n = p.lines.length;
        let meIdx = p.lines.findIndex((l) => myNick && l.nick.toLowerCase() === myNick);
        const roles = p.lines.map((_, i) => (i === meIdx ? 'me' : (p.mode === '2 на 2' && meIdx >= 0 && i === (meIdx ^ 1) ? 'mate' : 'opp')));
        const box = h('div', { class: 'list' }), go = h('button', { type: 'button', class: 'btn' }, t('Перенести в матч')), hint = h('div', { class: 'muted small' });
        const paint = () => {
            const ok = roles.filter((r) => r === 'me').length === 1;
            go.disabled = !ok; hint.textContent = ok ? '' : t('Позначте, який рядок — ваш.');
            box.replaceChildren(...p.lines.map((l, i) => h('div', { class: 'row wrap' },
                h('div', { class: 'grow' }, h('b', null, l.nick || '—'), h('div', { class: 'muted small' }, l.chars.map((c) => Labels.char(c)).join(' + '), l.nums.length ? ' • № ' + l.nums.join(',') : '')),
                h('div', { class: 'row' }, ROLES.map(([k, label]) => h('button', {
                    type: 'button', class: 'btn small ' + (roles[i] === k ? '' : 'ghost'),
                    onclick: () => { if (k === 'me') roles.forEach((r, j) => { if (r === 'me') roles[j] = 'opp'; }); roles[i] = k; paint(); }
                }, t(label)))))));
        };
        go.addEventListener('click', () => {
            const mi = roles.indexOf('me'); if (mi < 0) return;
            const me = p.lines[mi], opps = p.lines.filter((_, i) => roles[i] === 'opp');
            const oppNicks = opps.map((l) => l.nick).filter((x) => x && x.toLowerCase() !== myNick && !/^Гравець \d+$/.test(x));
            const oppChars = [...new Set(opps.flatMap((l) => l.chars))].slice(0, 2);
            const win = p.winners ? p.winners.includes(me.nick.toLowerCase()) : null;
            d.close();
            onPick({ mode: p.mode, map: p.map, ts: p.ts, chars: me.chars, nums: me.nums, win, opp: oppNicks, oppChars, minutes: p.durMs >= 0 ? Math.round(p.durMs / 60000) : null });
        });
        paint();
        return [h('p', { class: 'muted small' }, `${t(rec.mode)} • ${Labels.map(rec.mapName)} • ${formatDate(rec.timestamp)}`),
            h('h3', null, t('Хто є хто в цій битві?')), box, hint,
            h('div', { class: 'row end' }, btn('Назад', () => d.setBody(pickStep()), 'ghost'), go)];
    };
    const d = openDialog({ title: 'Взяти з історії', wide: true, body: pickStep() });
}
