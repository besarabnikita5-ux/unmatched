'use strict';
// ───────────── Допоміжні функції (DOM, випадковість, час, криптографія) ─────────────

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Мінімальний «hyperscript»: h('div', {class:'a', onclick: fn}, 'текст', іншийЕлемент) */
function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
            else if (k === 'html') el.innerHTML = v;
            else if (k in el && k !== 'list') { try { el[k] = v; } catch (_) { el.setAttribute(k, v); } }
            else el.setAttribute(k, v === true ? '' : v);
        }
    }
    const add = (c) => {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) return c.forEach(add);
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
}

function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const nowMs = () => Date.now();
const mono = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatDuration(ms) {
    const total = Math.floor(Math.max(0, ms) / 1000);
    const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
    const p = (n) => String(n).padStart(2, '0');
    return hh > 0 ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

function formatDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ───────────── Hex / байти ─────────────

const Hex = {
    enc: (bytes) => [...bytes].map((v) => v.toString(16).padStart(2, '0')).join(''),
    dec: (s) => { const o = new Uint8Array(s.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16); return o; },
    random: (n) => Hex.enc(crypto.getRandomValues(new Uint8Array(n)))
};
const utf8 = (s) => new TextEncoder().encode(s);

// ───────────── SHA-256 / HMAC / PBKDF2 ─────────────
// WebCrypto доступний лише в «захищеному контексті» (https або localhost). Коли сайт відкрито з
// телефона через http://IP-комп'ютера, його немає — тоді працює запасна реалізація нижче.

const SHA_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function sha256js(data) {
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const len = data.length;
    const padLen = Math.ceil((len + 9) / 64) * 64;
    const buf = new Uint8Array(padLen);
    buf.set(data); buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(padLen - 8, Math.floor((len * 8) / 0x100000000));
    dv.setUint32(padLen - 4, (len * 8) >>> 0);
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padLen; off += 64) {
        for (let t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
        for (let t = 16; t < 64; t++) {
            const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
            const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
            w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, hh] = H;
        for (let t = 0; t < 64; t++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (hh + S1 + ch + SHA_K[t] + w[t]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += hh;
    }
    const out = new Uint8Array(32);
    const o = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) o.setUint32(i * 4, H[i]);
    return out;
}

function concatBytes(...arrs) {
    const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
    let p = 0; for (const a of arrs) { out.set(a, p); p += a.length; }
    return out;
}

function hmacKeys(key) {
    let k = key.length > 64 ? sha256js(key) : key;
    const kk = new Uint8Array(64); kk.set(k);
    return [kk.map((v) => v ^ 0x36), kk.map((v) => v ^ 0x5c)];
}
function hmacSha256js(key, msg) {
    const [ip, op] = hmacKeys(key);
    return sha256js(concatBytes(op, sha256js(concatBytes(ip, msg))));
}
function pbkdf2Sha256js(pass, salt, iter, dkLen) {
    const [ip, op] = hmacKeys(pass);
    const hm = (m) => sha256js(concatBytes(op, sha256js(concatBytes(ip, m))));
    const out = new Uint8Array(dkLen);
    let pos = 0, block = 1;
    while (pos < dkLen) {
        let u = hm(concatBytes(salt, new Uint8Array([block >>> 24, block >>> 16, block >>> 8, block])));
        const t = u.slice();
        for (let r = 1; r < iter; r++) { u = hm(u); for (let j = 0; j < 32; j++) t[j] ^= u[j]; }
        const n = Math.min(32, dkLen - pos);
        out.set(t.subarray(0, n), pos); pos += n; block++;
    }
    return out;
}

const hasSubtle = () => typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.importKey === 'function';

/** hex(HMAC-SHA256(key, msg)); key і msg — рядки (UTF-8), як в Android-версії. */
async function hmacHex(key, msg) {
    if (hasSubtle()) {
        const k = await crypto.subtle.importKey('raw', utf8(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return Hex.enc(new Uint8Array(await crypto.subtle.sign('HMAC', k, utf8(msg))));
    }
    return Hex.enc(hmacSha256js(utf8(key), utf8(msg)));
}

/** hex(PBKDF2(pass, salt, iter, 256 біт)); algo — як в Android: PBKDF2WithHmacSHA256 / SHA1. */
async function pbkdf2Hex(pass, saltHex, iter, algo) {
    const hash = algo === 'PBKDF2WithHmacSHA1' ? 'SHA-1' : 'SHA-256';
    const salt = Hex.dec(saltHex);
    if (hasSubtle()) {
        const k = await crypto.subtle.importKey('raw', utf8(pass), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash, salt, iterations: iter }, k, 256);
        return Hex.enc(new Uint8Array(bits));
    }
    if (hash !== 'SHA-256') throw new Error('Старий формат акаунта потребує https або localhost.');
    return Hex.enc(pbkdf2Sha256js(utf8(pass), salt, iter, 32));
}

async function sha256Hex(str) {
    if (hasSubtle()) return Hex.enc(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(str))));
    return Hex.enc(sha256js(utf8(str)));
}

const ctEq = (a, b) => {
    if (a.length !== b.length) return false;
    let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
};

// ───────────── Зображення ─────────────

/** Файл → квадратний dataURL side×side (обрізка по центру). */
function fileToSquareDataUrl(file, side, type = 'image/png', quality = 0.9) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const s = Math.min(img.naturalWidth, img.naturalHeight);
            const c = document.createElement('canvas');
            c.width = c.height = side;
            const g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, side, side);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL(type, quality));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
        img.src = url;
    });
}

/** dataURL/URL → dataURL іншого розміру. */
function resizeDataUrl(src, w, h, type = 'image/jpeg', quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
            g.drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL(type, quality));
        };
        img.onerror = () => resolve('');
        img.src = src;
    });
}

const b64FromDataUrl = (u) => (u && u.includes(',') ? u.split(',')[1] : '');
const dataUrlFromB64 = (b, mime = 'image/png') => (b ? `data:${mime};base64,${b}` : '');

if (typeof module !== 'undefined') module.exports = { sha256js, hmacSha256js, pbkdf2Sha256js, hmacHex, pbkdf2Hex, Hex, formatDuration, utf8 };
