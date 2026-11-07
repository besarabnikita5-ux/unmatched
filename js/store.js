'use strict';
// ───────────── Сховище даних (localStorage). Ключі та формати збігаються з Android-версією, ─────────────
// тому резервні копії з застосунку можна імпортувати на сайті й навпаки.

const PFX = 'um_';
const P = {
    get(k, d = null) { try { const v = localStorage.getItem(PFX + k); return v === null ? d : v; } catch (_) { return d; } },
    set(k, v) {
        try { localStorage.setItem(PFX + k, String(v)); return true; } catch (e) { P.quota = true; return false; }
    },
    del(k) { try { localStorage.removeItem(PFX + k); } catch (_) { } },
    has(k) { try { return localStorage.getItem(PFX + k) !== null; } catch (_) { return false; } },
    keys() {
        const out = [];
        try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PFX)) out.push(k.slice(PFX.length)); } } catch (_) { }
        return out;
    },
    bool(k, d = false) { const v = P.get(k); return v === null ? d : v === 'true'; },
    int(k, d = 0) { const v = parseInt(P.get(k), 10); return Number.isNaN(v) ? d : v; },
    json(k, d) { try { const v = P.get(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    setJson(k, o) { return P.set(k, JSON.stringify(o)); },
    lines(k) { return (P.get(k, '') || '').split('\n').filter((s) => s.trim()); },
    setLines(k, a) { P.set(k, a.join('\n')); }
};

const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// ───────────── Каталог (пошук за назвою / псевдонімом) ─────────────

const Cat = {
    chars: CATALOG.flatMap((b) => b.characters.map((c) => ({ ...c, box: b.name }))),
    maps: CATALOG.flatMap((b) => b.maps.map((m) => ({ ...m, box: b.name }))),
    charByName(n) { const k = norm(n); return Cat.chars.find((c) => norm(c.name) === k || c.aliases.some((a) => norm(a) === k)) || null; },
    mapByName(n) { const k = norm(n); return Cat.maps.find((c) => norm(c.name) === k || c.aliases.some((a) => norm(a) === k)) || null; },
    charById: (id) => Cat.chars.find((c) => c.id === id) || null,
    mapById: (id) => Cat.maps.find((c) => c.id === id) || null,
    boxIndex(name) { const i = CATALOG.findIndex((b) => b.name.toLowerCase() === String(name).toLowerCase()); return i < 0 ? 1e9 : i; }
};

// ───────────── Прив'язки, підписи, відповідності назв ─────────────

const NameMaps = {
    load(key) { const o = P.json(key, {}); const out = {}; for (const [k, v] of Object.entries(o || {})) if (String(v).trim()) out[k] = v; return out; },
    save(key, m) { const o = {}; for (const [k, v] of Object.entries(m)) if (String(v).trim()) o[k] = v; P.setJson(key, o); }
};
const Links = {
    chars: () => NameMaps.load('fighterCatalog'), saveChars: (m) => NameMaps.save('fighterCatalog', m),
    maps: () => NameMaps.load('mapCatalog'), saveMaps: (m) => NameMaps.save('mapCatalog', m),
    mapBoxes: () => NameMaps.load('mapBoxes'), saveMapBoxes: (m) => NameMaps.save('mapBoxes', m)
};
const Labels = {
    chars: {}, maps: {}, charLinks: {}, mapLinks: {},
    reload() { Labels.chars = NameMaps.load('charLabels'); Labels.maps = NameMaps.load('mapLabels'); Labels.charLinks = Links.chars(); Labels.mapLinks = Links.maps(); },
    charId: (n) => Labels.charLinks[n] || (Cat.charByName(n) || {}).id || null,
    mapId: (n) => Labels.mapLinks[n] || (Cat.mapByName(n) || {}).id || null,
    char(n) { const id = Labels.charId(n); return (id && Labels.chars[id]) || n; },
    map(n) { const id = Labels.mapId(n); return (id && Labels.maps[id]) || n; },
    setChar(id, label) { if (!label.trim()) delete Labels.chars[id]; else Labels.chars[id] = label; NameMaps.save('charLabels', Labels.chars); },
    setMap(id, label) { if (!label.trim()) delete Labels.maps[id]; else Labels.maps[id] = label; NameMaps.save('mapLabels', Labels.maps); }
};
const Aliases = {
    root: () => P.json('nameAliases', {}) || {},
    load: (kind) => (Aliases.root()[kind] || {}),
    add(kind, old, nw) {
        if (old.toLowerCase() === nw.toLowerCase()) return;
        const r = Aliases.root(); const o = r[kind] || {};
        for (const k of Object.keys(o)) if (o[k].toLowerCase() === old.toLowerCase()) o[k] = nw;
        o[old] = nw; r[kind] = o; P.setJson('nameAliases', r);
    },
    resolve(kind, name) { const m = Aliases.load(kind); const k = Object.keys(m).find((x) => x.toLowerCase() === name.toLowerCase()); return k ? m[k] : null; }
};
const Names = {
    character(name) {
        const a = Aliases.resolve('c', name); if (a) return a;
        const cc = Cat.charByName(name); if (!cc) return name;
        return Object.values(Links.chars()).includes(cc.id) ? cc.name : name;
    },
    map(name) {
        const a = Aliases.resolve('m', name); if (a) return a;
        const cm = Cat.mapByName(name); if (!cm) return name;
        return Object.values(Links.maps()).includes(cm.id) ? cm.name : name;
    }
};

// ───────────── Персонажі, поля, коробки ─────────────

const FIGHTER_MAX_NAME = 40, FIGHTER_MAX_BOX = 30, ICON_SIZE = 192, NET_ICON_SIZE = 72;
const cleanName = (s) => s.replace(/[\n\t]/g, ' ').trim().slice(0, FIGHTER_MAX_NAME);
const cleanBox = (s) => s.replace(/[\n\t]/g, ' ').trim().slice(0, FIGHTER_MAX_BOX);

const Lists = {
    fighters: () => P.lines('fighters'),
    setFighters: (a) => P.setLines('fighters', a),
    maps() {
        return (P.get('maps', '') || '').split('\n').filter((l) => l.trim() && l.includes('\t'))
            .map((l) => { const i = l.indexOf('\t'); return { name: l.slice(0, i), team: l.slice(i + 1) === 'true' }; });
    },
    setMaps: (a) => P.set('maps', a.map((m) => `${m.name}\t${m.team}`).join('\n')),
    used: () => P.lines('used'), setUsed: (a) => P.setLines('used', a),
    excluded: () => P.lines('excluded'), setExcluded: (a) => P.setLines('excluded', a),
    boxes() { const o = P.json('fighterBoxes', {}) || {}; const out = {}; for (const [k, v] of Object.entries(o)) if (String(v).trim()) out[k] = v; return out; },
    setBoxes(b) { const o = {}; for (const [k, v] of Object.entries(b)) if (String(v).trim()) o[k] = v; P.setJson('fighterBoxes', o); },
    allBoxes(boxes) {
        const seen = new Set(); const out = [];
        Object.values(boxes).filter((b) => b.trim()).forEach((b) => { const k = b.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(b); } });
        return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    },
    /** Групи для списку: коробки за порядком каталогу/алфавітом, без коробки — в кінці; новіші зверху. */
    grouped(fighters, boxes) {
        const all = Lists.allBoxes(boxes); const groups = new Map();
        fighters.slice().reverse().forEach((f) => {
            const b = (boxes[f] || '').trim();
            const key = all.find((x) => x.toLowerCase() === b.toLowerCase()) || b;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(f);
        });
        return [...groups.entries()].sort((a, b) =>
            (a[0] === '') - (b[0] === '') || Cat.boxIndex(a[0]) - Cat.boxIndex(b[0]) || a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
    }
};

// ───────────── Іконки персонажів (власні — у localStorage як dataURL) ─────────────

const Icons = {
    key: (name) => 'icon_' + Hex.enc(utf8(name.toLowerCase())),
    get: (name) => P.get(Icons.key(name)),
    has: (name) => P.has(Icons.key(name)),
    set: (name, dataUrl) => P.set(Icons.key(name), dataUrl),
    del: (name) => P.del(Icons.key(name)),
    rename(old, nw) { const v = Icons.get(old); if (v) { Icons.set(nw, v); Icons.del(old); } },
    /** Шлях до офіційної іконки з папки assets (її можна скопіювати з Android-проєкту). */
    officialUrl(name) { const id = Labels.charId(name); return id ? `assets/catalog/characters/${id}.png` : null; },
    officialMapUrl(name) { const id = Labels.mapId(name); return id ? `assets/catalog/maps/${id}.png` : null; },
    /** Що показувати: власна іконка → офіційна (якщо файл є) → null (буде літера). */
    url: (name) => Icons.get(name) || Icons.officialUrl(name),
    b64Small(name) { /* для мережі лише у хоста; клієнт іконок не надсилає */ return ''; }
};

// ───────────── Акаунти ─────────────

const Accounts = {
    MAX_FAILS: 5, LOCK_MS: 5 * 60000, ITER: 120000, NICK_RE: /^[\p{L}\p{N}_\-]{2,16}$/u,
    isValidNick: (n) => Accounts.NICK_RE.test(n),
    all: () => P.json('accounts', {}) || {},
    saveAll: (o) => P.setJson('accounts', o),
    canonical(nick) { return Object.keys(Accounts.all()).find((k) => k.toLowerCase() === nick.toLowerCase()) || null; },
    async makeEntry(pass) {
        const salt = Hex.random(16), algo = 'PBKDF2WithHmacSHA256';
        return { salt, algo, iter: Accounts.ITER, hash: await pbkdf2Hex(pass, salt, Accounts.ITER, algo) };
    },
    async verify(e, pass) {
        let actual;
        if (!e.algo) actual = await sha256Hex(e.salt + pass);
        else actual = await pbkdf2Hex(pass, e.salt, e.iter || Accounts.ITER, e.algo);
        return ctEq(e.hash, actual);
    },
    lockId: (nick) => (Accounts.canonical(nick) || nick.trim().slice(0, 32)).toLowerCase(),
    lockSeconds(id) { const left = (P.json('lock_' + id, {}).until || 0) - Date.now(); return left > 0 ? Math.ceil(left / 1000) : 0; },
    recordFail(id) {
        const o = P.json('lock_' + id, {}) || {};
        let fails = (o.fails || 0) + 1, until = 0;
        if (fails >= Accounts.MAX_FAILS) { fails = 0; until = Date.now() + Accounts.LOCK_MS; }
        P.setJson('lock_' + id, { fails, until });
        return until > 0 ? 0 : Accounts.MAX_FAILS - fails;
    },
    async register(nick, pass) {
        if (Accounts.canonical(nick)) return false;
        const o = Accounts.all(); o[nick] = await Accounts.makeEntry(pass); Accounts.saveAll(o); return true;
    },
    /** → {ok:true,nick} | {ok:false,wrong:n} | {ok:false,locked:sec} */
    async login(nick, pass) {
        const id = Accounts.lockId(nick), left = Accounts.lockSeconds(id);
        if (left > 0) return { ok: false, locked: left };
        const key = Accounts.canonical(nick);
        if (key) {
            const accounts = Accounts.all(), e = accounts[key];
            if (await Accounts.verify(e, pass)) {
                P.del('lock_' + id);
                if (!e.algo) { accounts[key] = await Accounts.makeEntry(pass); Accounts.saveAll(accounts); }
                return { ok: true, nick: key };
            }
        }
        const a = Accounts.recordFail(id);
        return a === 0 ? { ok: false, locked: Accounts.lockSeconds(id) } : { ok: false, wrong: a };
    },
    message(r) {
        if (r.ok) return '';
        if (r.locked) return `Забагато невдалих спроб. Спробуйте через ${r.locked} с.`;
        return `Невірний нікнейм або пароль. Залишилось спроб: ${r.wrong}.`;
    },
    async changePassword(nick, oldPass, newPass) {
        const key = Accounts.canonical(nick); if (!key) return false;
        const accounts = Accounts.all();
        if (!(await Accounts.verify(accounts[key], oldPass))) return false;
        accounts[key] = await Accounts.makeEntry(newPass); Accounts.saveAll(accounts); return true;
    },
    rename(oldNick, newNick) {
        const key = Accounts.canonical(oldNick); if (!key) return false;
        const other = Accounts.canonical(newNick); if (other && other.toLowerCase() !== key.toLowerCase()) return false;
        const accounts = Accounts.all(); const e = accounts[key]; delete accounts[key]; accounts[newNick] = e; Accounts.saveAll(accounts);
        const o = key.toLowerCase(), n = newNick.toLowerCase();
        for (const pre of ['matches_', 'history_', 'profile_', 'stats_', 'avatar_']) {
            const v = P.get(pre + o); if (v !== null && o !== n) { P.set(pre + n, v); P.del(pre + o); }
        }
        if (P.get('currentUser') === key) P.set('currentUser', newNick);
        return true;
    },
    remove(nick) {
        const key = Accounts.canonical(nick); if (!key) return;
        const accounts = Accounts.all(); delete accounts[key]; Accounts.saveAll(accounts);
        const o = key.toLowerCase();
        for (const pre of ['matches_', 'history_', 'profile_', 'stats_', 'avatar_', 'lock_']) P.del(pre + o);
        if (P.get('currentUser') === key) P.del('currentUser');
    }
};

const Avatars = {
    get: (nick) => P.get('avatar_' + nick.toLowerCase()),
    set: (nick, dataUrl) => P.set('avatar_' + nick.toLowerCase(), dataUrl),
    del: (nick) => P.del('avatar_' + nick.toLowerCase())
};

// ───────────── Матчі, статистика, історія, профіль ─────────────

const MatchStore = {
    MAX: 3000,
    key: (owner) => (owner ? 'matches_' + owner.toLowerCase() : 'matches_guest'),
    load(owner) {
        const a = P.json(MatchStore.key(owner), []) || [];
        return a.map((o) => ({
            id: String(o.id), ts: Number(o.ts) || 0, mode: o.mode || '', map: o.map || '', chars: o.chars || [], nums: o.nums || [],
            win: !!o.win, opp: o.opp || [], oc: o.oc || [], dur: o.dur === undefined ? -1 : o.dur
        }));
    },
    save(owner, list) { P.setJson(MatchStore.key(owner), list.slice(0, MatchStore.MAX)); },
    add(owner, m) {
        const list = MatchStore.load(owner);
        if (list.some((x) => x.id === m.id)) return;
        list.unshift(m); list.sort((a, b) => b.ts - a.ts); MatchStore.save(owner, list);
    },
    merge(owner, incoming) {
        const list = MatchStore.load(owner), ids = new Set(list.map((x) => x.id)); let n = 0;
        incoming.forEach((m) => { if (!ids.has(m.id)) { list.push(m); ids.add(m.id); n++; } });
        list.sort((a, b) => b.ts - a.ts); MatchStore.save(owner, list); return n;
    },
    remove(owner, id) { MatchStore.save(owner, MatchStore.load(owner).filter((m) => m.id !== id)); },
    toggleWin(owner, id) { MatchStore.save(owner, MatchStore.load(owner).map((m) => (m.id === id ? { ...m, win: !m.win } : m))); },
    deleteAll(owner) { P.del(MatchStore.key(owner)); },
    count: (owner) => MatchStore.load(owner).length
};

const Stats = {
    legacy(nick) {
        const o = P.json('stats_' + nick.toLowerCase(), {}) || {};
        const rd = (j) => { const m = {}; for (const [k, a] of Object.entries(j || {})) m[k] = { games: a[0] || 0, wins: a[1] || 0 }; return m; };
        return { chars: rd(o.chars), totals: rd(o.totals), maps: rd(o.maps), turns: rd(o.turns), opps: rd(o.opps), matchups: {} };
    },
    aggregate(matches, base) {
        const s = base || { chars: {}, totals: {}, maps: {}, turns: {}, opps: {}, matchups: {} };
        const bump = (m, k, win) => { const o = m[k] || { games: 0, wins: 0 }; m[k] = { games: o.games + 1, wins: o.wins + (win ? 1 : 0) }; };
        for (const m of matches) {
            m.chars.forEach((c) => bump(s.chars, `${m.mode}|${c}`, m.win));
            bump(s.totals, m.mode, m.win);
            bump(s.maps, `${m.mode}|${m.map}`, m.win);
            m.nums.forEach((n) => bump(s.turns, `${m.mode}|${n}`, m.win));
            m.opp.forEach((o) => bump(s.opps, `${m.mode}|${o}`, m.win));
            m.chars.forEach((mine) => m.oc.forEach((th) => bump(s.matchups, `${m.mode}|${mine}\t${th}`, m.win)));
        }
        return s;
    },
    load: (nick) => Stats.aggregate(MatchStore.load(nick), nick ? Stats.legacy(nick) : null),
    versus(user, opponent) {
        let g = 0, w = 0;
        MatchStore.load(user).forEach((m) => { if (m.opp.some((o) => o.toLowerCase() === opponent.toLowerCase())) { g++; if (m.win) w++; } });
        return { games: g, wins: w };
    }
};

const HistoryStore = {
    MAX: 30,
    key: (owner) => (owner ? 'history_' + owner.toLowerCase() : 'history_guest'),
    load(owner) { return (P.json(HistoryStore.key(owner), []) || []).map((o) => ({ timestamp: o.timestamp || 0, mode: o.mode || '', fighters: o.fighters || [], mapName: o.mapName || '', details: o.details || '' })); },
    save(owner, list) { P.setJson(HistoryStore.key(owner), list.slice(0, HistoryStore.MAX)); },
    add(owner, rec) { HistoryStore.save(owner, [rec, ...HistoryStore.load(owner)]); },
    merge(...lists) {
        const seen = new Set(), out = [];
        lists.flat().sort((a, b) => b.timestamp - a.timestamp).forEach((r) => { const k = r.timestamp + '|' + r.mode + '|' + r.fighters.join(); if (!seen.has(k)) { seen.add(k); out.push(r); } });
        return out.slice(0, HistoryStore.MAX);
    }
};

const ProfileStore = {
    load(nick) { const o = P.json('profile_' + nick.toLowerCase(), {}) || {}; return { fc: o.fc || '', fm: o.fm || '' }; },
    save(nick, p) { P.setJson('profile_' + nick.toLowerCase(), p); }
};

const GuestStore = {
    count: () => MatchStore.count(null),
    linkTo(user) {
        const n = MatchStore.merge(user, MatchStore.load(null)); MatchStore.deleteAll(null);
        const merged = HistoryStore.merge(HistoryStore.load(user), HistoryStore.load(null));
        HistoryStore.save(user, merged); P.del(HistoryStore.key(null));
        return n;
    }
};

const MatchLog = {
    list: () => P.json('recorded_matches', []) || [],
    seen: (id) => MatchLog.list().includes(id),
    mark(id) { const l = MatchLog.list(); if (!l.includes(id)) { l.push(id); P.setJson('recorded_matches', l.slice(-500)); } }
};

/** Запис результату мережевого матчу (аналог ResultRecorder). Повертає false, якщо вже було записано. */
function recordResult(myId, payload) {
    const p = {
        ...payload, mapName: Names.map(payload.mapName),
        participants: payload.participants.map((pt) => ({ ...pt, chars: pt.chars.map(Names.character) }))
    };
    if (MatchLog.seen(p.matchId)) return false;
    MatchLog.mark(p.matchId);
    const user = P.get('currentUser');
    const me = p.participants.find((x) => x.id === myId);
    if (me) {
        const others = p.participants.filter((x) => x.side !== me.side);
        const rec = {
            id: p.matchId, ts: p.timestamp, mode: p.statMode, map: p.mapName, chars: me.chars, nums: me.nums, win: me.win,
            opp: [...new Set(others.filter((x) => x.registered).map((x) => x.nick))], oc: others.flatMap((x) => x.chars), dur: p.durationMs
        };
        if (user && me.registered && me.nick.toLowerCase() === user.toLowerCase()) MatchStore.add(user, rec);
        else if (!me.registered) MatchStore.add(null, rec);
    }
    const winners = p.participants.filter((x) => x.win).map((x) => x.nick).join(', ');
    const lines = p.participants.map((x) => `${x.nick}: ${x.chars.join(' + ')} (№${[...x.nums].sort((a, b) => a - b).join(',')})`);
    let details = `Перемога: ${winners}`;
    if (p.durationMs >= 0) details += `\nТривалість: ${formatDuration(p.durationMs)}`;
    if (p.details.trim()) details += `\n${p.details}`;
    HistoryStore.add(user, { timestamp: p.timestamp, mode: p.historyMode, fighters: lines, mapName: p.mapName, details });
    return true;
}

// ───────────── Теми ─────────────

const CUSTOM_THEME_NAME = 'Власна тема';
const argbToHex = (n) => '#' + ((n >>> 0) & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
const hexToArgb = (hex) => (0xFF000000 | parseInt(hex.slice(1), 16)) | 0;
const ThemeStore = {
    KEYS: { background: 'bg', surface: 'sf', primary: 'pr', secondary: 'se', text: 'tx', muted: 'mu', excluded: 'ex', onPrimary: 'op' },
    loadCustom() {
        const o = P.json('customTheme', null), base = THEMES[0], t = { name: CUSTOM_THEME_NAME };
        for (const [field, k] of Object.entries(ThemeStore.KEYS)) t[field] = o && k in o ? argbToHex(o[k]) : base[field];
        return t;
    },
    saveCustom(t) { const o = {}; for (const [field, k] of Object.entries(ThemeStore.KEYS)) o[k] = hexToArgb(t[field]); P.setJson('customTheme', o); },
    customExists: () => P.has('customTheme'),
    current() {
        if (P.bool('themeCustom', false) && ThemeStore.customExists()) return ThemeStore.loadCustom();
        return THEMES[Math.min(Math.max(P.int('themeIndex', 0), 0), THEMES.length - 1)];
    },
    apply(t) {
        const r = document.documentElement.style;
        r.setProperty('--bg', t.background); r.setProperty('--surface', t.surface); r.setProperty('--primary', t.primary);
        r.setProperty('--secondary', t.secondary); r.setProperty('--text', t.text); r.setProperty('--muted', t.muted);
        r.setProperty('--excluded', t.excluded); r.setProperty('--on-primary', t.onPrimary);
        const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t.background;
    }
};

// ───────────── Резервні копії (формат Android, version 3) ─────────────

const BackupSection = { HISTORY: 'history', STATS: 'stats', MAPS: 'maps', FIGHTERS: 'fighters', LABELS: 'labels', SETTINGS: 'settings', ALL: ['history', 'stats', 'maps', 'fighters', 'labels', 'settings'] };
const SECTION_TITLES = { history: 'Історія битв', stats: 'Статистика', maps: 'Поля', fighters: 'Персонажі', labels: 'Власні підписи', settings: 'Налаштування і тема' };

const Backup = {
    export(nick, sections) {
        const o = { app: 'unmatched', version: 3, exported: Date.now(), nick: nick || '', sections: BackupSection.ALL.filter((s) => sections.has(s)) };
        if (sections.has('stats')) {
            if (nick) { const lg = P.json('stats_' + nick.toLowerCase(), null); if (lg) o.legacy = lg; }
            o.matches = MatchStore.load(nick || null);
        }
        if (sections.has('history')) o.history = HistoryStore.load(nick || null);
        if (sections.has('maps')) {
            const mb = Links.mapBoxes(), ml = Links.maps();
            o.maps = Lists.maps().map((m) => { const it = { name: m.name, team: m.team }; if (mb[m.name]) it.box = mb[m.name]; if (ml[m.name]) it.catalogId = ml[m.name]; return it; });
        }
        if (sections.has('fighters')) {
            const boxes = Lists.boxes(), links = Links.chars();
            o.fighters = Lists.fighters().map((n) => {
                const it = { name: n, box: boxes[n] || '' }; if (links[n]) it.catalogId = links[n];
                const ic = Icons.get(n); if (ic) it.icon = b64FromDataUrl(ic); return it;
            });
        }
        if (sections.has('maps') || sections.has('fighters')) o.aliases = Aliases.root();
        if (sections.has('labels')) o.labels = { chars: NameMaps.load('charLabels'), maps: NameMaps.load('mapLabels') };
        if (sections.has('settings')) {
            const s = { excluded: Lists.excluded(), used: Lists.used(), avoidRepeats: P.bool('avoidRepeats', false), themeCustom: P.bool('themeCustom', false), themeName: (THEMES[P.int('themeIndex', 0)] || {}).name || '' };
            const ct = P.json('customTheme', null); if (ct) s.customTheme = ct;
            o.settings = s;
        }
        return JSON.stringify(o, null, 2);
    },
    inspect(text) {
        let o; try { o = JSON.parse(text); } catch (_) { return null; }
        if (!o || o.app !== 'unmatched') return null;
        const out = new Set();
        if (Array.isArray(o.history)) out.add('history');
        if (Array.isArray(o.matches) || (o.legacy && typeof o.legacy === 'object')) out.add('stats');
        if (Array.isArray(o.maps)) out.add('maps');
        if (Array.isArray(o.fighters)) out.add('fighters');
        if (o.labels && typeof o.labels === 'object') out.add('labels');
        if (o.settings && typeof o.settings === 'object') out.add('settings');
        return out;
    },
    /** Додає дані з файлу до наявних; повертає текстовий звіт. */
    import(text, nick, sections) {
        const o = JSON.parse(text), report = [];
        if (o.aliases && typeof o.aliases === 'object') {
            for (const kind of ['c', 'm']) for (const [k, v] of Object.entries(o.aliases[kind] || {})) Aliases.add(kind, k, v);
        }
        if (sections.has('stats') && Array.isArray(o.matches)) {
            const list = o.matches.map((m) => ({
                id: String(m.id), ts: m.ts || 0, mode: m.mode || '', map: Names.map(m.map || ''), chars: (m.chars || []).map(Names.character),
                nums: m.nums || [], win: !!m.win, opp: m.opp || [], oc: (m.oc || []).map(Names.character), dur: m.dur === undefined ? -1 : m.dur
            }));
            report.push(`Імпортовано матчів: ${MatchStore.merge(nick || null, list)}.`);
            if (o.legacy && nick && !P.has('stats_' + nick.toLowerCase())) P.setJson('stats_' + nick.toLowerCase(), o.legacy);
        }
        if (sections.has('history') && Array.isArray(o.history)) {
            const inc = o.history.map((r) => ({ timestamp: r.timestamp || 0, mode: r.mode || '', fighters: r.fighters || [], mapName: Names.map(r.mapName || ''), details: r.details || '' }));
            const before = HistoryStore.load(nick || null).length;
            HistoryStore.save(nick || null, HistoryStore.merge(HistoryStore.load(nick || null), inc));
            report.push(`Імпортовано записів історії: ${Math.max(0, HistoryStore.load(nick || null).length - before)}.`);
        }
        if (sections.has('maps') && Array.isArray(o.maps)) {
            const cur = Lists.maps(), have = new Set(cur.map((m) => m.name.toLowerCase())), mb = Links.mapBoxes(), ml = Links.maps(); let n = 0;
            o.maps.forEach((m) => {
                const name = Names.map(String(m.name || '').trim()); if (!name || have.has(name.toLowerCase())) return;
                cur.push({ name, team: !!m.team }); have.add(name.toLowerCase()); if (m.box) mb[name] = m.box; if (m.catalogId) ml[name] = m.catalogId; n++;
            });
            Lists.setMaps(cur); Links.saveMapBoxes(mb); Links.saveMaps(ml); report.push(`Додано полів битв: ${n}.`);
        }
        if (sections.has('fighters') && Array.isArray(o.fighters)) {
            const cur = Lists.fighters(), have = new Set(cur.map((x) => x.toLowerCase())), boxes = Lists.boxes(), links = Links.chars(); let n = 0;
            o.fighters.forEach((f) => {
                const name = cleanName(Names.character(String(f.name || ''))); if (!name || have.has(name.toLowerCase())) return;
                cur.push(name); have.add(name.toLowerCase()); if (f.box) boxes[name] = cleanBox(f.box); if (f.catalogId) links[name] = f.catalogId;
                if (f.icon) Icons.set(name, dataUrlFromB64(f.icon)); n++;
            });
            Lists.setFighters(cur); Lists.setBoxes(boxes); Links.saveChars(links); report.push(`Додано персонажів: ${n}.`);
        }
        if (sections.has('labels') && o.labels) {
            const c = { ...NameMaps.load('charLabels'), ...(o.labels.chars || {}) }, m = { ...NameMaps.load('mapLabels'), ...(o.labels.maps || {}) };
            NameMaps.save('charLabels', c); NameMaps.save('mapLabels', m); report.push('Підписи імпортовано.');
        }
        if (sections.has('settings') && o.settings) {
            const s = o.settings;
            if (Array.isArray(s.excluded)) Lists.setExcluded([...new Set([...Lists.excluded(), ...s.excluded])]);
            if (Array.isArray(s.used)) Lists.setUsed([...new Set([...Lists.used(), ...s.used])]);
            if (typeof s.avoidRepeats === 'boolean') P.set('avoidRepeats', s.avoidRepeats);
            if (s.customTheme) P.setJson('customTheme', s.customTheme);
            if (s.themeCustom && s.customTheme) P.set('themeCustom', true);
            else if (s.themeName) { const i = THEMES.findIndex((t) => t.name === s.themeName); if (i >= 0) { P.set('themeIndex', i); P.set('themeCustom', false); } }
            report.push('Налаштування імпортовано.');
        }
        Labels.reload();
        return report.join('\n');
    }
};

/** Заміна назв у всіх збережених даних (після об'єднання «Медуза» → «Medusa»). Повертає кількість змінених матчів. */
function remapNames(chars, maps) {
    const lk = (m) => { const l = {}; for (const [k, v] of Object.entries(m)) l[k.toLowerCase()] = v; return (s) => l[s.toLowerCase()] || s; };
    const fc = lk(chars), fm = lk(maps); let changed = 0;
    const LINE = /^(.*?): (.+) \(№(.*)\)$/;
    const hline = (s) => { const m = LINE.exec(s); if (!m) return fc(s); return `${m[1]}: ${m[2].split(' + ').map(fc).join(' + ')} (№${m[3]})`; };
    for (const k of P.keys()) {
        if (k.startsWith('matches_')) {
            const list = MatchStore.load(k === 'matches_guest' ? null : k.slice(8)); let ch = false;
            const nl = list.map((m) => { const x = { ...m, chars: m.chars.map(fc), oc: m.oc.map(fc), map: fm(m.map) }; if (JSON.stringify(x) !== JSON.stringify(m)) { ch = true; changed++; } return x; });
            if (ch) P.setJson(k, nl);
        } else if (k.startsWith('history_')) {
            const list = P.json(k, []) || [];
            P.setJson(k, list.map((r) => ({ ...r, fighters: (r.fighters || []).map(hline), mapName: fm(r.mapName || '') })));
        } else if (k.startsWith('profile_')) {
            const o = P.json(k, {}) || {}; if (o.fc) { o.fc = fc(o.fc); P.setJson(k, o); } if (o.fm) { o.fm = fm(o.fm); P.setJson(k, o); }
        } else if (k.startsWith('stats_')) {
            const o = P.json(k, null); if (!o) continue;
            const re = (j, f) => { if (!j) return j; const out = {}; for (const [kk, a] of Object.entries(j)) { const i = kk.indexOf('|'); const nk = i >= 0 ? kk.slice(0, i + 1) + f(kk.slice(i + 1)) : kk; const c = out[nk] || [0, 0]; out[nk] = [c[0] + (a[0] || 0), c[1] + (a[1] || 0)]; } return out; };
            if (o.chars) o.chars = re(o.chars, fc); if (o.maps) o.maps = re(o.maps, fm); P.setJson(k, o);
        }
    }
    Lists.setUsed(Lists.used().map(fc)); Lists.setExcluded(Lists.excluded().map(fc));
    return changed;
}

if (typeof module !== 'undefined') module.exports = { P };

// ───────────── Офіційні коробки: додаються автоматично й не видаляються ─────────────

const Official = {
    isChar(name) { const id = Labels.charId(name); return !!(id && Cat.charById(id)); },
    isMap(name) { const id = Labels.mapId(name); return !!(id && Cat.mapById(id)); },
    /** Додає все з каталогу (персонажів, поля, коробки), якщо цього ще немає. Записи користувача зберігаються. */
    ensure() {
        const fighters = Lists.fighters(), boxes = Lists.boxes(), links = Links.chars();
        const maps = Lists.maps(), mlinks = Links.maps(), mboxes = Links.mapBoxes();
        const fl = new Map(fighters.map((n) => [n.toLowerCase(), n]));
        const ml = new Map(maps.map((m) => [m.name.toLowerCase(), m.name]));
        let fc = false, mc = false;
        const find = (idx, item) => { let ex = idx.get(item.name.toLowerCase()); if (!ex) for (const a of item.aliases) { const x = idx.get(a.toLowerCase()); if (x) { ex = x; break; } } return ex; };
        for (const b of CATALOG) {
            for (const c of b.characters) {
                const ex = find(fl, c);
                if (ex) {   // уже є запис (за назвою чи псевдонімом) — прив'язуємо до каталогу
                    if (!links[ex]) { links[ex] = c.id; fc = true; }
                    if (!boxes[ex]) { boxes[ex] = b.name; fc = true; }
                } else {
                    fighters.push(c.name); fl.set(c.name.toLowerCase(), c.name); boxes[c.name] = b.name; links[c.name] = c.id; fc = true;
                }
            }
            for (const m of b.maps) {
                const ex = find(ml, m);
                if (ex) {
                    if (!mlinks[ex]) { mlinks[ex] = m.id; mc = true; }
                    if (!mboxes[ex]) { mboxes[ex] = b.name; mc = true; }
                } else {
                    maps.push({ name: m.name, team: m.team }); ml.set(m.name.toLowerCase(), m.name); mlinks[m.name] = m.id; mboxes[m.name] = b.name; mc = true;
                }
            }
        }
        if (fc) { Lists.setFighters(fighters); Lists.setBoxes(boxes); Links.saveChars(links); }
        if (mc) { Lists.setMaps(maps); Links.saveMaps(mlinks); Links.saveMapBoxes(mboxes); }
        return fc || mc;
    }
};

// ───────────── Перенесення акаунта: сайт (https) → сторінка кімнати (http://IP:порт) і назад ─────────────
// localStorage окремий для кожної адреси сайту, тому дані передаються між вікнами через postMessage.
// Сторінка кімнати відкривається з сайту кнопкою «Відкрити сторінку кімнати» (window.open) і просить
// дані в сайту; після кожної мережевої гри оновлений акаунт (матчі, історія) повертається назад.
// Дані ходять лише між двома вікнами браузера і нікуди не надсилаються.

const AccountSync = {
    SITE_ORIGINS: ['https://besarabnikita5-ux.github.io'],   // звідки сторінка кімнати приймає акаунт
    roomWin: null, roomOrigin: '', parentOrigin: '',

    snapshot() {
        const nick = P.get('currentUser'); if (!nick) return null;
        const entry = Accounts.all()[nick]; if (!entry) return null;
        return {
            v: 1, nick, entry, matches: MatchStore.load(nick), history: HistoryStore.load(nick), profile: ProfileStore.load(nick),
            avatar: Avatars.get(nick) || '', legacy: P.get('stats_' + nick.toLowerCase()) || '',
            theme: { themeIndex: P.get('themeIndex'), themeCustom: P.get('themeCustom'), customTheme: P.get('customTheme'), language: P.get('language') }
        };
    },

    /** Зливає знімок у локальне сховище. → 'ok' | 'bad' | 'conflict' (такий нікнейм уже є з іншим паролем). */
    apply(s) {
        try {
            if (!s || s.v !== 1 || !Accounts.isValidNick(String(s.nick))) return 'bad';
            const e = s.entry;
            if (!e || typeof e.salt !== 'string' || typeof e.hash !== 'string') return 'bad';
            const nick = String(s.nick), key = Accounts.canonical(nick), accounts = Accounts.all();
            if (key) { if (accounts[key].hash !== e.hash) return 'conflict'; }
            else { accounts[nick] = { salt: e.salt, algo: e.algo, iter: e.iter, hash: e.hash }; Accounts.saveAll(accounts); }
            const owner = key || nick;
            const arr = (a) => (Array.isArray(a) ? a : []);
            const ms = arr(s.matches).filter((m) => m && m.id !== undefined).map((m) => ({
                id: String(m.id), ts: Number(m.ts) || 0, mode: String(m.mode || ''), map: String(m.map || ''), chars: arr(m.chars).map(String),
                nums: arr(m.nums).map((x) => parseInt(x, 10) || 0), win: !!m.win, opp: arr(m.opp).map(String), oc: arr(m.oc).map(String),
                dur: Number.isFinite(Number(m.dur)) ? Number(m.dur) : -1
            }));
            MatchStore.merge(owner, ms);
            const hs = arr(s.history).filter((r) => r && typeof r === 'object').map((o) => ({
                timestamp: Number(o.timestamp) || 0, mode: String(o.mode || ''), fighters: arr(o.fighters).map(String), mapName: String(o.mapName || ''), details: String(o.details || '')
            }));
            HistoryStore.save(owner, HistoryStore.merge(HistoryStore.load(owner), hs));
            const pr = ProfileStore.load(owner);
            if (s.profile && !pr.fc && !pr.fm) ProfileStore.save(owner, { fc: String(s.profile.fc || ''), fm: String(s.profile.fm || '') });
            if (typeof s.avatar === 'string' && s.avatar.startsWith('data:image/') && s.avatar.length < 400000 && !Avatars.get(owner)) Avatars.set(owner, s.avatar);
            if (typeof s.legacy === 'string' && s.legacy && !P.has('stats_' + owner.toLowerCase())) P.set('stats_' + owner.toLowerCase(), s.legacy);
            const th = s.theme || {};
            if (!P.has('themeIndex') && th.themeIndex !== null && th.themeIndex !== undefined) {
                P.set('themeIndex', th.themeIndex);
                if (th.themeCustom !== null && th.themeCustom !== undefined) P.set('themeCustom', th.themeCustom);
                if (typeof th.customTheme === 'string') P.set('customTheme', th.customTheme);
            }
            if (!P.has('language') && typeof th.language === 'string' && th.language) P.set('language', th.language);
            if (!P.get('currentUser')) P.set('currentUser', owner);
            return 'ok';
        } catch (_) { return 'bad'; }
    },

    // ── сторона сайту ──
    /** Відкриває сторінку кімнати у новому вікні й дозволяє їй забрати акаунт. false — браузер заблокував вікно. */
    openRoom(url, origin) {
        let w = null;
        try { w = window.open(url, 'unmatched-room'); } catch (_) { }
        if (!w) { location.href = url; return false; }
        AccountSync.roomWin = w; AccountSync.roomOrigin = origin;
        return true;
    },
    onParentMessage(e) {
        const A = AccountSync;
        if (!A.roomWin || e.source !== A.roomWin || e.origin !== A.roomOrigin) return;
        const d = e.data; if (!d || typeof d !== 'object') return;
        if (d.unmatched === 'hello') A.roomWin.postMessage({ unmatched: 'data', snapshot: A.snapshot() }, A.roomOrigin);
        else if (d.unmatched === 'sync' && A.apply(d.snapshot) === 'ok') { Labels.reload(); App.refresh(); }
    },

    // ── сторона сторінки кімнати ──
    startChild() {
        if (!window.opener || location.protocol !== 'http:') return;
        let done = false, tries = 0;
        const iv = setInterval(() => {
            if (done || ++tries > 20) { clearInterval(iv); return; }
            try { window.opener.postMessage({ unmatched: 'hello' }, '*'); } catch (_) { }
        }, 500);
        window.addEventListener('message', (e) => {
            if (e.source !== window.opener || !AccountSync.SITE_ORIGINS.includes(e.origin)) return;
            const d = e.data; if (!d || d.unmatched !== 'data') return;
            done = true; AccountSync.parentOrigin = e.origin;
            if (!d.snapshot) return;
            const r = AccountSync.apply(d.snapshot);
            if (r === 'ok') { Labels.reload(); App.refresh(); toast('Акаунт перенесено з сайту.'); }
            else if (r === 'conflict') toast('На цьому пристрої вже є акаунт з таким нікнеймом, але з іншим паролем.', 6000);
        });
    },
    /** Повертає оновлений акаунт на сайт (якщо вікно сайту ще відкрите). */
    pushBack() {
        if (!window.opener || !AccountSync.parentOrigin) return;
        const s = AccountSync.snapshot(); if (!s) return;
        try { window.opener.postMessage({ unmatched: 'sync', snapshot: s }, AccountSync.parentOrigin); } catch (_) { }
    }
};
