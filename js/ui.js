'use strict';
// ───────────── Загальні компоненти інтерфейсу: діалоги, іконки, сповіщення ─────────────

const dlgStack = [];

function toast(msg, ms = 3200, action) {
    const box = $('#toasts');
    const el = h('div', { class: 'toast' }, t(msg));
    if (action) el.append(h('button', { class: 'link', onclick: () => { action.fn(); el.remove(); } }, t(action.label)));
    box.append(el);
    setTimeout(() => el.remove(), ms);
}

/** Модальне вікно. opts: {title, body (Node|Node[]), actions (Node[]), onClose, wide, noClose} → {el, close, body} */
function openDialog(opts) {
    const back = h('div', { class: 'backdrop' });
    const bodyBox = h('div', { class: 'dlg-body' });
    const close = () => {
        const i = dlgStack.indexOf(api); if (i >= 0) dlgStack.splice(i, 1);
        back.remove(); if (opts.onClose) opts.onClose();
        document.body.classList.toggle('modal-open', dlgStack.length > 0);
    };
    const box = h('div', { class: 'dialog' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'dlg-head' }, h('h2', null, t(opts.title || '')), opts.noClose ? null : h('button', { class: 'icon-btn', 'aria-label': t('Закрити'), onclick: close }, '✕')),
        bodyBox,
        opts.actions && opts.actions.length ? h('div', { class: 'dlg-actions' }, opts.actions) : null);
    const api = { el: box, close, body: bodyBox, setBody(n) { bodyBox.replaceChildren(...[].concat(n)); } };
    api.setBody(opts.body || []);
    back.append(box);
    if (!opts.noClose) back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.body.append(back); dlgStack.push(api);
    document.body.classList.add('modal-open');
    return api;
}

function confirmDialog(text, onYes, yesLabel = 'Підтвердити') {
    const d = openDialog({
        title: 'Підтвердження', body: h('p', null, t(text)),
        actions: [h('button', { class: 'btn ghost', onclick: () => d.close() }, t('Скасувати')),
        h('button', { class: 'btn', onclick: () => { d.close(); onYes(); } }, t(yesLabel))]
    });
    return d;
}

function messageDialog(text, title = 'Повідомлення') {
    const d = openDialog({ title, body: h('p', { style: { whiteSpace: 'pre-line' } }, t(text)), actions: [h('button', { class: 'btn', onclick: () => d.close() }, 'OK')] });
    return d;
}

function promptDialog({ title, label, value = '', maxlength = 40, type = 'text', okLabel = 'Зберегти', onOk }) {
    const inp = h('input', { type, value, maxlength, class: 'input', autofocus: true });
    const go = () => { const r = onOk(inp.value); if (r !== false) d.close(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const d = openDialog({
        title, body: h('label', { class: 'field' }, h('span', null, t(label)), inp),
        actions: [h('button', { class: 'btn ghost', onclick: () => d.close() }, t('Скасувати')), h('button', { class: 'btn', onclick: go }, t(okLabel))]
    });
    setTimeout(() => inp.focus(), 30);
    return d;
}

// ───────────── Іконки ─────────────

function letterIcon(name, size, cls = '') {
    return h('div', { class: 'icon letter ' + cls, style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.45) + 'px' } },
        (Labels.char(name) || '?').trim().charAt(0).toUpperCase());
}

function fighterIcon(name, size = 44, hostIcons) {
    const hosted = hostIcons && hostIcons[name];
    const url = hosted ? dataUrlFromB64(hosted) : Icons.url(name);
    if (!url) return letterIcon(name, size);
    const img = h('img', { class: 'icon', src: url, alt: '', loading: 'lazy', style: { width: size + 'px', height: size + 'px' } });
    img.addEventListener('error', () => img.replaceWith(letterIcon(name, size)));
    return img;
}

function mapIcon(name, w = 88) {
    const url = Icons.officialMapUrl(name);
    const ph = () => h('div', { class: 'map-ph', style: { width: w + 'px', height: Math.round(w / 2) + 'px' } }, Labels.map(name));
    if (!url) return ph();
    const img = h('img', { class: 'map-img', src: url, alt: '', loading: 'lazy', style: { width: w + 'px', height: Math.round(w / 2) + 'px' } });
    img.addEventListener('error', () => img.replaceWith(ph()));
    return img;
}

function avatarEl(src, nick, size = 40) {
    if (src) return h('img', { class: 'avatar', src, alt: '', style: { width: size + 'px', height: size + 'px' } });
    return h('div', { class: 'avatar letter', style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.45) + 'px' } }, (nick || '?').charAt(0).toUpperCase());
}

// ───────────── Анімація перед боєм: поле → персонажі → VS ─────────────

let rollEl = null;
function showRoll(mapName, left, right, icons, done) {
    hideRoll();
    const col = (names) => h('div', { class: 'roll-col' }, names.map((n) => h('div', { class: 'roll-char' }, fighterIcon(n, 96, icons), h('div', null, Labels.char(n)))));
    rollEl = h('div', { class: 'roll' },
        h('div', { class: 'roll-map' }, mapIcon(mapName, 220), h('div', { class: 'roll-map-name' }, Labels.map(mapName))),
        h('div', { class: 'roll-row' }, col(left), h('div', { class: 'roll-vs' }, 'VS'), col(right)));
    document.body.append(rollEl);
    if (done) setTimeout(() => { hideRoll(); done(); }, Net.ROLL_MS);
}
function hideRoll() { if (rollEl) { rollEl.remove(); rollEl = null; } }

// ───────────── Невеликі будівельники ─────────────

const btn = (label, onclick, cls = '') => h('button', { class: 'btn ' + cls, onclick }, t(label));
const chip = (label, cls = '') => h('span', { class: 'chip ' + cls }, t(label));

function tabs(items, initial, render) {
    const bar = h('div', { class: 'tabs' }), body = h('div', { class: 'tab-body' });
    let cur = initial;
    const draw = () => {
        bar.replaceChildren(...items.map(([key, label]) => h('button', { class: 'tab' + (key === cur ? ' on' : ''), onclick: () => { cur = key; draw(); } }, t(label))));
        body.replaceChildren(render(cur));
    };
    draw();
    return h('div', null, bar, body);
}

function pct(g, w) { return g ? Math.round((w * 100) / g) + '%' : '—'; }

function downloadText(filename, text) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function pickFile(accept, cb) {
    const inp = h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { if (inp.files && inp.files[0]) cb(inp.files[0]); inp.remove(); });
    document.body.append(inp); inp.click();
}
