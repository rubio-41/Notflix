// Proximity Messenger — small server with ZERO dependencies (Node 18+).
// It stores profiles and messages, and pushes live updates to every open page
// using Server-Sent Events (SSE). Run:  node server.js
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
// Only these files are ever served as web pages (keeps server.js and data/ private).
const STATIC = new Set(['index.html', 'chat.html', 'styles.css', 'signup.js', 'app.js']);

// ---------- storage (one JSON file; fine for a small group) ----------
let db = { users: {}, rooms: {}, messages: [], reports: [], friends: {}, nicknames: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) {}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Public conversations are created by users. Remove the built-in ones from earlier versions.
Object.values(db.rooms).forEach(r => { if (r.createdBy === null) { delete db.rooms[r.id]; db.messages = db.messages.filter(m => m.room !== r.id); } });
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); }
    catch (e) { console.error('Could not save data:', e.message); }
  }, 300);
}
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const rid = n => crypto.randomBytes(n).toString('hex');

// ---------- live connections ----------
// ---------- location: kept in memory only (never saved), used to work out who is nearby ----------
const RADIUS = Number(process.env.NEARBY_RADIUS_M) || 500;   // metres
const locs = new Map();                                       // userId -> { lat, lng, ts }
function haversine(a, b) {
  const R = 6371000, t = x => x * Math.PI / 180, dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const r4 = n => Math.round(n * 1e4) / 1e4;   // ~11 m: other people never get your exact coordinates
function nearbyFor(id) {
  const mine = locs.get(id), out = [];
  Object.values(db.users).forEach(u => {
    if (u.id === id || !isOnline(u.id) || u.discoverable === false) return;
    const l = locs.get(u.id);
    if (mine && l) { const d = haversine(mine, l); if (d <= RADIUS) out.push({ id: u.id, dist: Math.round(d / 5) * 5, lat: r4(l.lat), lng: r4(l.lng) }); }
    else if (!mine && !l) out.push({ id: u.id });   // nobody has shared a location (e.g. testing on http): show everyone online
  });
  return out;
}
const pushAllNearby = () => clients.forEach((_, id) => toUser(id, 'nearby', nearbyFor(id)));
setInterval(() => { let c = false; const old = Date.now() - 120000; locs.forEach((l, id) => { if (l.ts < old) { locs.delete(id); c = true; } }); if (c) pushAllNearby(); }, 30000);

const clients = new Map(); // userId -> Set of open SSE responses
const isOnline = id => clients.has(id) && clients.get(id).size > 0;
function emit(res, event, data) { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); }
function toUser(id, event, data) { (clients.get(id) || []).forEach(r => emit(r, event, data)); }
function toAll(event, data) { clients.forEach(set => set.forEach(r => emit(r, event, data))); }
const pub = u => ({ id: u.id, username: u.username, displayName: u.displayName, status: u.status, discoverable: u.discoverable !== false, photo: u.photo ? u.photoVer : 0, online: isOnline(u.id) });

// ---------- helpers ----------
const STATUSES = ['Available', 'Looking for a conversation'];
function body(req, limit = 400000) {
  return new Promise((ok, no) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > limit) { no(new Error('Too large')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(new Error('Bad JSON')); } });
  });
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function authUser(req, url) {
  const t = (req.headers.authorization || '').replace('Bearer ', '') || url.searchParams.get('token') || '';
  if (!t) return null; const h = hash(t);
  return Object.values(db.users).find(u => u.tokenHash === h) || null;
}
// ---------- friends: a request, accepted by the other person; nicknames are private to the one who sets them ----------
const pairKey = (x, y) => [x, y].sort().join('|');
function friendsFor(id) {
  const out = [];
  Object.values(db.friends).forEach(f => {
    if (f.a !== id && f.b !== id) return;
    const other = f.a === id ? f.b : f.a;
    out.push({ id: other, status: f.status === 'accepted' ? 'friend' : (f.a === id ? 'outgoing' : 'incoming'), nickname: db.nicknames[id + ':' + other] || '' });
  });
  return out;
}
const pushFriends = (...ids) => ids.forEach(i => toUser(i, 'friends', friendsFor(i)));

function partnersOf(id) {
  const s = new Set();
  db.messages.forEach(m => { if (m.to === id) s.add(m.from); else if (m.from === id && m.to) s.add(m.to); });
  return [...s];
}

// ---------- API ----------
async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  try {
    if (route === 'GET /api/health') return json(res, 200, { ok: true });

    if (route === 'POST /api/signup') {
      const b = await body(req);
      const username = String(b.username || '').trim().toLowerCase(), displayName = String(b.displayName || '').trim();
      if (!/^[a-z0-9._]{3,20}$/.test(username)) return json(res, 400, { error: 'Use 3–20 letters, numbers, dots or underscores.', field: 'username' });
      if (!displayName || displayName.length > 30) return json(res, 400, { error: 'Enter a display name (up to 30 characters).', field: 'displayName' });
      if (Object.values(db.users).some(u => u.username === username)) return json(res, 409, { error: 'That username is taken.', field: 'username' });
      let photo = null;
      if (b.photo) {
        if (typeof b.photo !== 'string' || b.photo.length > 200000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.photo)) return json(res, 400, { error: 'That picture could not be used.', field: 'photo' });
        photo = b.photo;
      }
      const token = rid(24), id = rid(6);
      const u = db.users[id] = { id, username, displayName, status: 'Available', photo, photoVer: Date.now(), tokenHash: hash(token), createdAt: Date.now() };
      save(); toAll('user', pub(u));
      return json(res, 200, { token, me: pub(u) });
    }

    const me = authUser(req, url);
    if (!me) return json(res, 401, { error: 'Not signed in.' });

    if (route === 'GET /api/me') return json(res, 200, pub(me));

    if (route === 'POST /api/status') {
      const b = await body(req);
      if (!STATUSES.includes(b.status)) return json(res, 400, { error: 'Unknown status.' });
      me.status = b.status; save(); toAll('user', pub(me)); return json(res, 200, pub(me));
    }

    if (route === 'GET /api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      const wasOnline = isOnline(me.id);
      if (!clients.has(me.id)) clients.set(me.id, new Set());
      clients.get(me.id).add(res);
      emit(res, 'init', { me: pub(me), users: Object.values(db.users).map(pub), rooms: Object.values(db.rooms), recent: partnersOf(me.id), friends: friendsFor(me.id), nearby: nearbyFor(me.id) });
      if (!wasOnline) {
        toAll('presence', { id: me.id, online: true }); pushAllNearby();
        // anything sent to me while I was away is now delivered
        db.messages.forEach(m => { if (m.to === me.id && m.status === 'sent') { m.status = 'delivered'; toUser(m.from, 'status', { id: m.id, status: 'delivered' }); } });
        save();
      }
      const beat = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(beat); const set = clients.get(me.id); if (set) { set.delete(res); if (!set.size) { clients.delete(me.id); locs.delete(me.id); toAll('presence', { id: me.id, online: false }); pushAllNearby(); } }
      });
      return;
    }

    if (route === 'GET /api/history') {
      const w = url.searchParams.get('with'), r = url.searchParams.get('room');
      const list = r ? db.messages.filter(m => m.room === r)
        : db.messages.filter(m => (m.from === me.id && m.to === w) || (m.from === w && m.to === me.id));
      return json(res, 200, list.slice(-200));
    }

    if (route === 'POST /api/message') {
      const b = await body(req), text = String(b.text || '').trim();
      if (!text || text.length > 2000) return json(res, 400, { error: 'Message must be 1–2000 characters.' });
      const m = { id: rid(8), from: me.id, ts: Date.now(), text };
      if (b.room) {
        const rm = db.rooms[b.room]; if (!rm) return json(res, 404, { error: 'No such conversation.' });
        m.room = b.room; rm.members = rm.members || [];
        if (!rm.members.includes(me.id)) { rm.members.push(me.id); toAll('room', rm); }
      }
      else { if (!db.users[b.to] || b.to === me.id) return json(res, 404, { error: 'No such person.' }); m.to = b.to; m.status = isOnline(b.to) ? 'delivered' : 'sent'; }
      db.messages.push(m); save();
      if (m.room) toAll('message', m); else { toUser(m.to, 'message', m); toUser(me.id, 'message', m); }
      return json(res, 200, m);
    }

    if (route === 'POST /api/rooms') {
      const b = await body(req), name = String(b.name || '').trim(), desc = String(b.desc || '').trim().slice(0, 60);
      if (name.length < 2 || name.length > 24) return json(res, 400, { error: 'Name must be 2–24 characters.' });
      if (Object.values(db.rooms).some(r => r.name.toLowerCase() === name.toLowerCase())) return json(res, 409, { error: 'That conversation already exists.' });
      const id = 'r_' + slug(name) + '_' + rid(2), room = db.rooms[id] = { id, name, desc: desc || 'Open conversation', createdBy: me.id, members: [me.id] };
      save(); toAll('room', room); return json(res, 200, room);
    }

    if (route === 'POST /api/rooms/join') {
      const b = await body(req), rm = db.rooms[b.room]; if (!rm) return json(res, 404, { error: 'No such conversation.' });
      rm.members = rm.members || []; if (!rm.members.includes(me.id)) { rm.members.push(me.id); save(); toAll('room', rm); }
      return json(res, 200, rm);
    }

    if (route === 'POST /api/location') {
      const b = await body(req), lat = Number(b.lat), lng = Number(b.lng);
      if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return json(res, 400, { error: 'Bad location.' });
      const prev = locs.get(me.id); locs.set(me.id, { lat, lng, ts: Date.now() });
      if (!prev || haversine(prev, { lat, lng }) > 3) pushAllNearby();   // only re-announce real movement
      return json(res, 200, { ok: true });
    }

    if (route === 'POST /api/privacy') {
      const b = await body(req); me.discoverable = b.discoverable !== false; save(); toAll('user', pub(me)); pushAllNearby(); return json(res, 200, pub(me));
    }

    if (route.startsWith('POST /api/friends/')) {
      const b = await body(req), other = db.users[b.userId];
      if (!other || other.id === me.id) return json(res, 404, { error: 'No such person.' });
      const k = pairKey(me.id, other.id), f = db.friends[k], action = url.pathname.split('/').pop();
      if (action === 'request') {
        if (!f) db.friends[k] = { a: me.id, b: other.id, status: 'pending', ts: Date.now() };
        else if (f.status === 'pending' && f.b === me.id) f.status = 'accepted';   // they had already asked: accept
      } else if (action === 'respond') {
        if (!f || f.status !== 'pending' || f.b !== me.id) return json(res, 400, { error: 'No request to answer.' });
        if (b.accept) f.status = 'accepted'; else delete db.friends[k];
      } else if (action === 'remove') {
        delete db.friends[k]; delete db.nicknames[me.id + ':' + other.id]; delete db.nicknames[other.id + ':' + me.id];
      } else if (action === 'nickname') {
        if (!f || f.status !== 'accepted') return json(res, 400, { error: 'Only friends can be given a name.' });
        const n = String(b.name || '').trim().slice(0, 30), nk = me.id + ':' + other.id;
        if (n) db.nicknames[nk] = n; else delete db.nicknames[nk];
      } else return json(res, 404, { error: 'Not found.' });
      save(); pushFriends(me.id, other.id); return json(res, 200, { ok: true });
    }

    if (route === 'POST /api/report') {
      const b = await body(req);
      if (!db.users[b.userId]) return json(res, 404, { error: 'No such person.' });
      db.reports.push({ by: me.id, user: b.userId, ts: Date.now() }); save(); return json(res, 200, { ok: true });
    }
    json(res, 404, { error: 'Not found.' });
  } catch (e) { json(res, 400, { error: e.message }); }
}

// ---------- static files ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function serve(req, res, url) {
  const av = url.pathname.match(/^\/avatar\/([a-f0-9]+)$/);
  if (av) {
    const u = db.users[av[1]], m = u && u.photo && u.photo.match(/^data:(image\/[a-z]+);base64,(.*)$/);
    if (!m) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=31536000, immutable' }); return res.end(Buffer.from(m[2], 'base64'));
  }
  const p = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  if (!STATIC.has(p)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  const file = path.join(__dirname, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  serve(req, res, url);
}).listen(PORT, '0.0.0.0', () => {
  console.log('\nProximity Messenger is running.\n  On this computer:  http://localhost:' + PORT);
  Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).forEach(i => console.log('  On your network:   http://' + i.address + ':' + PORT));
  console.log('\nOpen the network address on another device that is on the same Wi-Fi.\n');
});
