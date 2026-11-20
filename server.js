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
Object.values(db.users).forEach(u => { if (u.tokenHash) { u.tokens = (u.tokens || []).concat(u.tokenHash); delete u.tokenHash; } u.tokens = u.tokens || []; });
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
function hashPw(pw) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); }
function checkPw(pw, stored) {
  if (!stored) return false; const [salt, h] = stored.split(':');
  const x = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 32), y = Buffer.from(h, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const tries = new Map();   // very small brute-force guard for logins
function limited(key) { const now = Date.now(), t = tries.get(key) || { n: 0, ts: now }; if (now - t.ts > 600000) { t.n = 0; t.ts = now; } t.n++; tries.set(key, t); return t.n > 8; }
function issueToken(u) { const t = rid(24); u.tokens = (u.tokens || []).slice(-9).concat(hash(t)); return t; }

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
const calls = new Map();        // callId -> { id, from, to, state: 'ringing'|'active' }
const voiceRooms = new Map();   // roomId -> Set(userId)  (every public conversation has a voice room)
const callOf = id => { for (const c of calls.values()) if (c.from === id || c.to === id) return c; return null; };
const inVoice = id => { for (const [r, set] of voiceRooms) if (set.has(id)) return r; return null; };
const busy = id => !!callOf(id) || !!inVoice(id);
const voiceState = () => { const o = {}; voiceRooms.forEach((set, r) => { if (set.size) o[r] = [...set]; }); return o; };
const liveStatus = u => inVoice(u.id) ? 'In a voice room' : (callOf(u.id) && callOf(u.id).state === 'active') ? 'On a call' : u.status;
const pub = u => ({ id: u.id, username: u.username, displayName: u.displayName, status: liveStatus(u), discoverable: u.discoverable !== false, photo: u.photo ? u.photoVer : 0, online: isOnline(u.id) });

// ---------- helpers ----------
const STATUSES = ['Available', 'Looking for a conversation'];
function body(req, limit = 400000) {
  return new Promise((ok, no) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > limit) { no(new Error('Too large')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(new Error('Bad JSON')); } });
  });
}
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
const tokenOf = (req, url) => (req.headers.authorization || '').replace('Bearer ', '') || url.searchParams.get('token') || '';
function authUser(req, url) {
  const t = tokenOf(req, url); if (!t) return null; const h = hash(t);
  return Object.values(db.users).find(u => u.tokens.includes(h)) || null;
}
function rawBody(req, limit) {
  return new Promise((ok, no) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { no(new Error('That recording is too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', no);
  });
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

const touch = id => { if (db.users[id]) toAll('user', pub(db.users[id])); };
function leaveVoice(id) {
  let ch = false; voiceRooms.forEach((set, r) => { if (set.delete(id)) { ch = true; if (!set.size) voiceRooms.delete(r); } });
  if (ch) { toAll('voice', voiceState()); touch(id); }
}
function dropUser(id) {   // their last connection closed
  for (const c of [...calls.values()]) if (c.from === id || c.to === id) {
    calls.delete(c.id); const other = c.from === id ? c.to : c.from; toUser(other, 'call', { type: 'ended', id: c.id, reason: 'dropped' }); touch(other);
  }
  leaveVoice(id);
}
function iceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URLS) list.push({ urls: process.env.TURN_URLS.split(',').map(x => x.trim()), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' });
  return list;
}
function partnersOf(id) {
  const s = new Set();
  db.messages.forEach(m => { if (m.to === id) s.add(m.from); else if (m.from === id && m.to) s.add(m.to); });
  return [...s];
}

function createMessage(me, b, extra, beforeSave) {
  const m = Object.assign({ id: rid(8), from: me.id, ts: Date.now() }, extra);
  if (b.room) {
    const rm = db.rooms[b.room]; if (!rm) return { error: 'No such conversation.', code: 404 };
    m.room = b.room; rm.members = rm.members || [];
    if (!rm.members.includes(me.id)) { rm.members.push(me.id); toAll('room', rm); }
  } else {
    if (!db.users[b.to] || b.to === me.id) return { error: 'No such person.', code: 404 };
    m.to = b.to; m.status = isOnline(b.to) ? 'delivered' : 'sent';
  }
  if (beforeSave) beforeSave();
  db.messages.push(m); save();
  if (m.room) toAll('message', m); else { toUser(m.to, 'message', m); toUser(me.id, 'message', m); }
  return { m };
}

// ---------- API ----------
async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  try {
    if (route === 'GET /api/health') return json(res, 200, { ok: true });


    if (route === 'POST /api/signup') {
      const b = await body(req);
      const username = String(b.username || '').trim().toLowerCase(), displayName = String(b.displayName || '').trim(), password = String(b.password || '');
      if (!/^[a-z0-9._]{3,20}$/.test(username)) return json(res, 400, { error: 'Use 3–20 letters, numbers, dots or underscores.', field: 'username' });
      if (!displayName || displayName.length > 30) return json(res, 400, { error: 'Enter a display name (up to 30 characters).', field: 'displayName' });
      if (password.length < 8 || password.length > 100) return json(res, 400, { error: 'Use a password of at least 8 characters.', field: 'password' });
      if (Object.values(db.users).some(u => u.username === username)) return json(res, 409, { error: 'That username is taken.', field: 'username' });
      let photo = null;
      if (b.photo) {
        if (typeof b.photo !== 'string' || b.photo.length > 200000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.photo)) return json(res, 400, { error: 'That picture could not be used.', field: 'photo' });
        photo = b.photo;
      }
      const id = rid(6);
      const u = db.users[id] = { id, username, displayName, status: 'Available', photo, photoVer: Date.now(), tokens: [], pw: hashPw(password), createdAt: Date.now() };
      const token = issueToken(u);
      save(); toAll('user', pub(u));
      return json(res, 200, { token, me: pub(u) });
    }

    if (route === 'POST /api/login') {
      const b = await body(req), username = String(b.username || '').trim().toLowerCase(), password = String(b.password || '');
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (limited(ip + ':' + username)) return json(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' });
      const u = Object.values(db.users).find(x => x.username === username);
      if (u && !u.pw) return json(res, 403, { error: 'This account has no password yet. Open it on the device where you made it and set one in Profile.' });
      if (!u || !checkPw(password, u.pw)) return json(res, 401, { error: 'Wrong username or password.' });
      return json(res, 200, { token: issueToken(u), me: pub(u) });
    }
    if (route === 'GET /api/config') return json(res, 200, { cartoKey: process.env.CARTO_API_KEY || '' });

    const me = authUser(req, url);
    if (!me) return json(res, 401, { error: 'Not signed in.' });

    if (route === 'GET /api/me') return json(res, 200, Object.assign(pub(me), { hasPassword: !!me.pw }));

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
      emit(res, 'init', { me: Object.assign(pub(me), { hasPassword: !!me.pw }), users: Object.values(db.users).map(pub), rooms: Object.values(db.rooms), recent: partnersOf(me.id), friends: friendsFor(me.id), nearby: nearbyFor(me.id), voice: voiceState() });
      if (!wasOnline) {
        toAll('presence', { id: me.id, online: true }); pushAllNearby();
        // anything sent to me while I was away is now delivered
        db.messages.forEach(m => { if (m.to === me.id && m.status === 'sent') { m.status = 'delivered'; toUser(m.from, 'status', { id: m.id, status: 'delivered' }); } });
        save();
      }
      const beat = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(beat); const set = clients.get(me.id); if (set) { set.delete(res); if (!set.size) { clients.delete(me.id); locs.delete(me.id); dropUser(me.id); toAll('presence', { id: me.id, online: false }); pushAllNearby(); } }
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
      const r = createMessage(me, b, { text }); return r.error ? json(res, r.code, { error: r.error }) : json(res, 200, r.m);
    }

    if (route === 'POST /api/voicemsg') {            // a recorded voice message (raw audio bytes in the body)
      const to = url.searchParams.get('to'), room = url.searchParams.get('room'), dur = Math.round(Number(url.searchParams.get('dur')));
      const mime = String(url.searchParams.get('mime') || '');
      if (!/^audio\/(webm|mp4|ogg|mpeg|aac|x-m4a)$/.test(mime) || !(dur >= 1 && dur <= 180)) return json(res, 400, { error: 'Bad voice message.' });
      const buf = await rawBody(req, 3 * 1024 * 1024); if (buf.length < 200) return json(res, 400, { error: 'That recording is empty.' });
      const fid = rid(10), r = createMessage(me, to ? { to } : { room }, { text: '', voice: { id: fid, dur, mime } }, () => {
        fs.mkdirSync(path.join(DATA_DIR, 'voice'), { recursive: true }); fs.writeFileSync(path.join(DATA_DIR, 'voice', fid + '.bin'), buf);
      });
      return r.error ? json(res, r.code, { error: r.error }) : json(res, 200, r.m);
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/voicemsg/')) {
      const fid = url.pathname.split('/').pop(), m = db.messages.find(x => x.voice && x.voice.id === fid);
      if (!m || !/^[a-f0-9]+$/.test(fid) || !(m.room || m.from === me.id || m.to === me.id)) return json(res, 404, { error: 'Not found.' });
      try { const data = fs.readFileSync(path.join(DATA_DIR, 'voice', fid + '.bin')); res.writeHead(200, { 'Content-Type': m.voice.mime, 'Content-Length': data.length, 'Cache-Control': 'private, max-age=86400' }); return res.end(data); }
      catch (e) { return json(res, 404, { error: 'That recording is no longer available.' }); }
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

    if (route === 'POST /api/logout') { const h = hash(tokenOf(req, url)); me.tokens = me.tokens.filter(x => x !== h); save(); return json(res, 200, { ok: true }); }
    if (route === 'POST /api/password') {
      const b = await body(req), pw = String(b.password || '');
      if (me.pw && !checkPw(String(b.current || ''), me.pw)) return json(res, 400, { error: 'Your current password is wrong.' });
      if (pw.length < 8 || pw.length > 100) return json(res, 400, { error: 'Use a password of at least 8 characters.' });
      me.pw = hashPw(pw); save(); return json(res, 200, { ok: true });
    }
    if (route === 'GET /api/ice') return json(res, 200, { iceServers: iceServers() });

    // ----- calls (1:1) and voice rooms: the server only introduces people; audio goes directly between devices (WebRTC) -----
    if (route === 'POST /api/call/start') {
      const b = await body(req), to = db.users[b.to];
      if (!to || to.id === me.id) return json(res, 404, { error: 'No such person.' });
      if (!isOnline(to.id)) return json(res, 409, { error: 'They are offline right now.' });
      if (busy(me.id)) return json(res, 409, { error: 'You are already in a call or voice room.' });
      if (busy(to.id)) return json(res, 409, { error: 'They are busy right now.' });
      const c = { id: rid(6), from: me.id, to: to.id, state: 'ringing' }; calls.set(c.id, c);
      toUser(to.id, 'call', { type: 'incoming', id: c.id, from: me.id });
      setTimeout(() => { const x = calls.get(c.id); if (x && x.state === 'ringing') { calls.delete(x.id); toUser(x.from, 'call', { type: 'ended', id: x.id, reason: 'noanswer' }); toUser(x.to, 'call', { type: 'ended', id: x.id, reason: 'missed' }); } }, 45000);
      return json(res, 200, { id: c.id });
    }
    if (route === 'POST /api/call/answer') {
      const b = await body(req), c = calls.get(b.id);
      if (!c || c.to !== me.id || c.state !== 'ringing') return json(res, 404, { error: 'That call is no longer available.' });
      if (b.accept) { c.state = 'active'; toUser(c.from, 'call', { type: 'accepted', id: c.id }); touch(c.from); touch(c.to); }
      else { calls.delete(c.id); toUser(c.from, 'call', { type: 'ended', id: c.id, reason: 'declined' }); }
      return json(res, 200, { ok: true });
    }
    if (route === 'POST /api/call/end') {
      const b = await body(req), c = calls.get(b.id);
      if (c && (c.from === me.id || c.to === me.id)) { calls.delete(c.id); const other = c.from === me.id ? c.to : c.from; toUser(other, 'call', { type: 'ended', id: c.id, reason: 'ended' }); touch(c.from); touch(c.to); }
      return json(res, 200, { ok: true });
    }
    if (route === 'POST /api/voice/join') {
      const b = await body(req); if (!db.rooms[b.room]) return json(res, 404, { error: 'No such conversation.' });
      if (callOf(me.id)) return json(res, 409, { error: 'Finish your call first.' });
      const set = voiceRooms.get(b.room) || new Set();
      if (!set.has(me.id) && set.size >= 8) return json(res, 409, { error: 'This voice room is full (8 people).' });
      const existing = [...set].filter(id => id !== me.id);
      leaveVoice(me.id); const cur = voiceRooms.get(b.room) || set; cur.add(me.id); voiceRooms.set(b.room, cur); toAll('voice', voiceState()); touch(me.id);
      return json(res, 200, { participants: existing });
    }
    if (route === 'POST /api/voice/leave') { leaveVoice(me.id); return json(res, 200, { ok: true }); }
    if (route === 'POST /api/signal') {   // relay WebRTC offers/answers/candidates between two people in the same call or voice room
      const b = await body(req), to = b.to;
      if (!db.users[to] || !b.data || typeof b.data !== 'object') return json(res, 400, { error: 'Bad signal.' });
      let ok = false;
      if (b.id) { const c = calls.get(b.id); ok = !!c && ((c.from === me.id && c.to === to) || (c.to === me.id && c.from === to)); }
      else if (b.room) { const set = voiceRooms.get(b.room); ok = !!set && set.has(me.id) && set.has(to); }
      if (!ok) return json(res, 400, { error: 'Not in the same call.' });
      toUser(to, 'signal', { from: me.id, id: b.id, room: b.room, data: b.data }); return json(res, 200, { ok: true });
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
