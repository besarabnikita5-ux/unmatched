#!/usr/bin/env node
/**
 * Міст між браузером і Android-застосунком Unmatched.
 *
 * Браузер не вміє відкривати «чисті» TCP-з'єднання та шукати пристрої в локальній мережі (mDNS),
 * а застосунок на Android саме так і працює (TCP, порт 45678, JSON-рядки). Цей маленький сервер:
 *   1) віддає файли сайту (щоб можна було відкрити сайт з телефону/планшета в тій самій Wi-Fi мережі);
 *   2) приймає WebSocket від сайту й пересилає рядки в TCP кімнати Android-хоста (і назад);
 *   3) шукає ігри в мережі (Bonjour/mDNS, службa _unmatchedrz._tcp) і показує їх на сайті.
 *
 * Запуск:   node server.js            — лише цей комп'ютер (http://localhost:8765)
 *           node server.js --lan      — також для інших пристроїв у вашій Wi-Fi мережі
 *           node server.js --allow https://ІМ'Я.github.io   — дозволити сайту з GitHub Pages
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');
const { WebSocketServer } = require('ws');

let Bonjour = null;
try { ({ Bonjour } = require('bonjour-service')); } catch (_) { /* mDNS необов'язковий */ }

const args = process.argv.slice(2);
const PORT = Number(process.env.PORT) || 8765;
const LAN = args.includes('--lan') || process.env.LAN === '1';
const BIND = LAN ? '0.0.0.0' : '127.0.0.1';
const ROOT = path.resolve(__dirname, '..');
const SERVICE_TYPE = 'unmatchedrz';

const allowed = new Set(
    (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
);
args.forEach((a, i) => { if (a === '--allow' && args[i + 1]) allowed.add(args[i + 1].replace(/\/+$/, '')); });

// ───────────── допоміжне ─────────────

function isPrivateHost(h) {
    if (h === 'localhost') return true;
    if (!net.isIPv4(h)) return false;
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 169 && b === 254);
}

function lanAddresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
    return out;
}

function originOk(req) {
    const origin = req.headers.origin;
    if (!origin) return true;                                   // не з браузера
    let u;
    try { u = new URL(origin); } catch (_) { return false; }
    if (allowed.has(origin.replace(/\/+$/, ''))) return true;
    if (u.host === req.headers.host) return true;               // той самий сайт (його віддає цей міст)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return false;
}

// ───────────── пошук ігор (mDNS) ─────────────

const games = new Map();   // name -> {name, host, port, mode, hostNick, tournament}
const listeners = new Set();
let bonjour = null;

function gamesList() { return [...games.values()]; }
function pushGames() {
    const msg = JSON.stringify({ bridge: 'games', list: gamesList() });
    listeners.forEach((ws) => { if (ws.readyState === 1) ws.send(msg); });
}

function startMdns() {
    if (!Bonjour) return false;
    try {
        bonjour = new Bonjour();
        const browser = bonjour.find({ type: SERVICE_TYPE });
        browser.on('up', (s) => {
            const ip = (s.addresses || []).find((a) => net.isIPv4(a));
            if (!ip) return;
            const txt = s.txt || {};
            games.set(s.name, {
                name: s.name, host: ip, port: s.port,
                mode: String(txt.mode || ''), hostNick: String(txt.host || ''),
                tournament: String(txt.tour || '') === 'true'
            });
            pushGames();
        });
        browser.on('down', (s) => { if (games.delete(s.name)) pushGames(); });
        return true;
    } catch (e) {
        console.warn('mDNS недоступний:', e.message);
        return false;
    }
}
const mdnsOk = startMdns();

// ───────────── HTTP: файли сайту ─────────────

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { p = '/'; }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    const rel = path.relative(ROOT, file);
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some((s) => s.startsWith('.')) ||
        rel.split(path.sep)[0] === 'bridge') {
        res.writeHead(404); return res.end('Not found');
    }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

// ───────────── WebSocket ⇄ TCP ─────────────

const wss = new WebSocketServer({
    server,
    maxPayload: 2 * 1024 * 1024,
    verifyClient: (info, cb) => {
        if (originOk(info.req)) return cb(true);
        console.warn('Відхилено з’єднання з джерела:', info.req.headers.origin,
            '— додайте його через --allow, якщо це ваш сайт.');
        cb(false, 403, 'Origin not allowed');
    }
});

wss.on('connection', (ws) => {
    let tcp = null;
    const send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
    listeners.add(ws);
    send({ bridge: 'hello', version: 1, mdns: mdnsOk });
    send({ bridge: 'games', list: gamesList() });

    const closeTcp = () => {
        if (tcp) { try { tcp.destroy(); } catch (_) { } tcp = null; }
    };

    ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        const text = data.toString('utf8');
        let o = null;
        try { o = JSON.parse(text); } catch (_) { return; }

        if (o && typeof o.bridge === 'string') {
            if (o.bridge === 'scan') return send({ bridge: 'games', list: gamesList() });
            if (o.bridge === 'close') { closeTcp(); return; }
            if (o.bridge === 'connect') {
                closeTcp();
                const host = String(o.host || '').trim();
                const port = Number(o.port) || 45678;
                if (!isPrivateHost(host) || port < 1 || port > 65535) {
                    return send({ bridge: 'error', message: 'Дозволені лише адреси локальної мережі.' });
                }
                const sock = net.connect({ host, port });
                tcp = sock;
                sock.setNoDelay(true);
                sock.setKeepAlive(true, 10000);
                sock.setTimeout(6000);
                let buf = '';
                sock.on('connect', () => { sock.setTimeout(0); send({ bridge: 'connected' }); });
                sock.on('timeout', () => { send({ bridge: 'error', message: 'Хост не відповідає.' }); sock.destroy(); });
                sock.on('data', (chunk) => {
                    buf += chunk.toString('utf8');
                    if (buf.length > 4 * 1024 * 1024) { sock.destroy(); return; }
                    let i;
                    while ((i = buf.indexOf('\n')) >= 0) {
                        const line = buf.slice(0, i).trim();
                        buf = buf.slice(i + 1);
                        if (line && ws.readyState === 1) ws.send(line);
                    }
                });
                sock.on('error', (e) => send({ bridge: 'error', message: 'Помилка з’єднання: ' + e.code }));
                sock.on('close', () => { if (tcp === sock) { tcp = null; send({ bridge: 'closed' }); } });
            }
            return;
        }
        // усе інше — рядок протоколу кімнати для хоста
        if (tcp && !tcp.destroyed) tcp.write(text.replace(/[\r\n]+/g, ' ') + '\n');
    });

    ws.on('close', () => { listeners.delete(ws); closeTcp(); });
    ws.on('error', () => { listeners.delete(ws); closeTcp(); });
});

server.listen(PORT, BIND, () => {
    console.log('────────────────────────────────────────────');
    console.log(' Unmatched bridge запущено');
    console.log(`  На цьому комп'ютері:  http://localhost:${PORT}`);
    if (LAN) lanAddresses().forEach((ip) => console.log(`  З інших пристроїв:    http://${ip}:${PORT}`));
    else console.log('  Для телефонів/планшетів у мережі запустіть з параметром --lan');
    console.log(`  Пошук ігор (mDNS):    ${mdnsOk ? 'увімкнено' : 'вимкнено (введіть IP хоста вручну)'}`);
    if (allowed.size) console.log('  Дозволені сайти:      ' + [...allowed].join(', '));
    console.log(' Зупинити: Ctrl+C');
    console.log('────────────────────────────────────────────');
});
server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE'
        ? `Порт ${PORT} уже зайнятий. Закрийте інший екземпляр або змініть PORT.` : e.message);
    process.exit(1);
});
process.on('SIGINT', () => { try { bonjour && bonjour.destroy(); } catch (_) { } process.exit(0); });
