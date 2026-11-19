// Chat client: profiles, who is nearby, friends, messages, map — all live from server.js.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var token = null; try { token = localStorage.getItem('token'); } catch (e) {}
  if (!token) { location.replace('index.html'); return; }

  // ---------- state ----------
  var me = null, users = {}, rooms = {}, recent = {}, unread = {}, friends = {}, near = {};
  var view = 'map', current = null, profileId = null, expanded = null, showNew = false;
  var seen = {}, thread = [], lastOwn = null;
  var myPos = null, geoState = 'asking', geoWatch = null;

  // ---------- helpers ----------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function api(path, opts) {
    opts = opts || {}; opts.headers = Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, opts.headers);
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { signOut(); throw new Error('Signed out'); }
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; });
    });
  }
  function post(path, body) { return api(path, { method: 'POST', body: body }); }
  function signOut() { try { localStorage.removeItem('token'); } catch (e) {} location.replace('index.html'); }
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2400); }
  function avatar(node, u) {
    var url = u && u.photo ? '/avatar/' + u.id + '?v=' + u.photo : '';
    node.style.backgroundImage = url ? 'url(' + url + ')' : ''; node.textContent = url ? '' : (u ? u.displayName : '?').charAt(0).toUpperCase();
  }
  function roomAvatar(node, r) { node.style.backgroundImage = ''; node.textContent = r.name.charAt(0).toUpperCase(); }
  function keyOf(kind, id) { return (kind === 'room' ? 'r:' : 'u:') + id; }
  function allUsers() { return Object.keys(users).map(function (k) { return users[k]; }); }
  function allRooms() { return Object.keys(rooms).map(function (k) { return rooms[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); }); }
  function members(r) { return r.members || []; }
  function isMember(r) { return members(r).indexOf(me.id) >= 0; }

  // Nearby = what the server says is close to you (GPS), or everyone online while nobody has shared a location.
  function nearbyList() {
    return Object.keys(near).map(function (id) { return users[id]; }).filter(function (u) { return u && u.online && u.discoverable !== false; })
      .sort(function (a, b) { var da = near[a.id].dist, db = near[b.id].dist; return (da == null ? 1e9 : da) - (db == null ? 1e9 : db) || a.displayName.localeCompare(b.displayName); });
  }
  function band(id) { var d = near[id] && near[id].dist; return d == null ? 'Online' : d < 25 ? 'Very close' : d < 150 ? 'Nearby' : 'In range'; }
  function frStatus(u) { return friends[u.id] ? friends[u.id].status : 'none'; }
  function isFriend(u) { return frStatus(u) === 'friend'; }
  function nameOf(u) { return (isFriend(u) && friends[u.id].nickname) || u.displayName; }
  function sub(u) {
    var s = frStatus(u);
    if (s === 'incoming') return 'Wants to be friends';
    if (near[u.id] && u.online) return u.status === 'Available' ? 'Available · ' + band(u.id) : u.status;
    return u.online ? 'Online · over the internet' : 'Offline';
  }

  // ---------- mini bar ----------
  var ICON = {
    map: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', chats: '<path d="M4 5h16v11H9l-5 4z"/>',
    voice: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'
  };
  var TABS = [['map', 'Nearby'], ['chats', 'Chats'], ['voice', 'Voice rooms (coming later)'], ['me', 'Profile and privacy']];
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    TABS.forEach(function (t) {
      var b = el('button'); b.dataset.tab = t[0]; b.title = t[1]; b.setAttribute('aria-label', t[1]);
      b.innerHTML = '<svg viewBox="0 0 24 24">' + ICON[t[0]] + '</svg>';
      if (t[0] === 'voice') b.setAttribute('aria-disabled', 'true');
      b.onclick = function () { if (t[0] === 'voice') toast('Voice rooms are coming in a later phase.'); else setView(t[0] === 'chats' ? 'empty' : t[0]); };
      box.appendChild(b);
    });
  });
  function updateTabs() {
    var on = view === 'map' ? 'map' : view === 'me' ? 'me' : 'chats';
    document.querySelectorAll('[data-tabs] button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tab === on); });
    var pending = Object.keys(friends).some(function (id) { return friends[id].status === 'incoming'; });
    document.querySelectorAll('[data-tabs] button[data-tab=me]').forEach(function (b) {
      var d = b.querySelector('.dotbadge'); if (pending && !d) b.appendChild(el('i', 'dotbadge')); if (!pending && d) d.remove();
    });
  }

  // ---------- panes ----------
  var VIEWS = ['map', 'empty', 'chat', 'new', 'me', 'profile'];
  function setView(v) {
    view = v;
    VIEWS.forEach(function (k) { $('v-' + k).classList.toggle('on', k === v); });
    if (v !== 'chat') current = null;
    $('app').classList.add('chat-open');
    if (v === 'new') { $('newSearch').value = ''; }
    updateTabs(); renderAll();
    if (v === 'map') setTimeout(renderMap, 0);
  }
  $('home').onclick = function () { setView('map'); };
  $('profileBtn').onclick = function () { setView('me'); };
  $('newMsg').onclick = function () { setView('new'); };
  $('mback').onclick = function () { current = null; $('app').classList.remove('chat-open'); renderSide(); };

  // ---------- rows ----------
  function makeRow(kind, item) {
    var sel = current && current.kind === kind && current.id === item.id, incoming = kind === 'person' && frStatus(item) === 'incoming';
    var b = el('div', 'row' + (sel ? ' sel' : '')); b.setAttribute('role', 'button'); b.tabIndex = 0;
    var a = el('span', 'av'); if (kind === 'room') roomAvatar(a, item); else avatar(a, item);
    var t = el('span'); t.appendChild(el('b', '', kind === 'room' ? item.name : nameOf(item)));
    t.appendChild(el('small', '', kind === 'room' ? (item.desc || 'Open conversation') : sub(item)));
    b.appendChild(a); b.appendChild(t);
    if (incoming) {
      var acts = el('span', 'acts'), yes = el('button', '', 'Accept'), no = el('button', 'no', 'Decline');
      yes.onclick = function (e) { e.stopPropagation(); post('/api/friends/respond', { userId: item.id, accept: true }).catch(function (er) { toast(er.message); }); };
      no.onclick = function (e) { e.stopPropagation(); post('/api/friends/respond', { userId: item.id, accept: false }).catch(function (er) { toast(er.message); }); };
      acts.appendChild(yes); acts.appendChild(no); b.appendChild(acts);
    } else { var n = unread[keyOf(kind, item.id)]; if (n) b.appendChild(el('span', 'badge', n > 99 ? '99+' : n)); }
    if (kind === 'person') a.onclick = function (e) { e.stopPropagation(); openProfile(item.id); };
    var go = function () { if (incoming) openProfile(item.id); else openChat(kind, item.id); };
    b.onclick = go; b.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    return b;
  }
  function fill(box, list, kind) { box.innerHTML = ''; list.forEach(function (i) { box.appendChild(makeRow(kind, i)); }); }

  // ---------- sidebar ----------
  function renderSide() {
    var ppl = nearbyList(), rm = allRooms();
    var fr = Object.keys(friends).map(function (id) { return users[id]; }).filter(function (u) { return u && friends[u.id].status !== 'outgoing'; })
      .sort(function (a, b) { return (frStatus(a) === 'incoming' ? 0 : 1) - (frStatus(b) === 'incoming' ? 0 : 1) || nameOf(a).localeCompare(nameOf(b)); });
    $('cardFriends').hidden = !fr.length || expanded !== null; fill($('friends'), fr, 'person');
    $('cardPeople').hidden = expanded === 'rooms'; $('cardRooms').hidden = expanded === 'people';
    $('cardPeople').classList.toggle('grow', expanded === 'people'); $('cardRooms').classList.toggle('grow', expanded === 'rooms');
    var pb = $('people'); fill(pb, expanded === 'people' ? ppl : ppl.slice(0, 3), 'person');
    if (!ppl.length) pb.appendChild(el('div', 'hint', myPos ? 'Nobody nearby right now.' : 'Nobody nearby yet.'));
    var rb = $('rooms'); fill(rb, expanded === 'rooms' ? rm : rm.slice(0, 3), 'room');
    if (!rm.length) rb.appendChild(el('div', 'hint', 'No public conversations yet.'));
    $('morePeople').hidden = ppl.length <= 3 && expanded !== 'people'; $('moreRooms').hidden = rm.length <= 3 && expanded !== 'rooms';
    $('morePeople').textContent = expanded === 'people' ? 'Show less' : 'More…'; $('moreRooms').textContent = expanded === 'rooms' ? 'Show less' : 'More…';
    renderNewRoom();
  }
  $('morePeople').onclick = function () { expanded = expanded === 'people' ? null : 'people'; renderSide(); };
  $('moreRooms').onclick = function () { expanded = expanded === 'rooms' ? null : 'rooms'; renderSide(); };

  // Built only when its mode changes, so live updates never wipe what you are typing.
  function renderNewRoom() {
    var box = $('newRoomBox'), mode = showNew ? 'form' : 'btn';
    if (box.dataset.mode === mode) return;
    box.dataset.mode = mode; box.innerHTML = '';
    if (!showNew) { var nb = el('button', 'addbtn', '+ New conversation'); nb.onclick = function () { showNew = true; renderNewRoom(); box.querySelector('input').focus(); }; box.appendChild(nb); return; }
    var f = el('form', 'newroom'), n = el('input'), d = el('input'), bt = el('div', 'btns'), ok = el('button', '', 'Create'), no = el('button', 'cancel', 'Cancel');
    n.placeholder = 'Name'; n.maxLength = 24; n.setAttribute('aria-label', 'Conversation name');
    d.placeholder = 'What is it about? (optional)'; d.maxLength = 60; d.setAttribute('aria-label', 'Description');
    ok.type = 'submit'; no.type = 'button'; bt.appendChild(ok); bt.appendChild(no); f.appendChild(n); f.appendChild(d); f.appendChild(bt);
    no.onclick = function () { showNew = false; renderNewRoom(); };
    f.onsubmit = function (e) {
      e.preventDefault(); if (!n.value.trim()) return;
      post('/api/rooms', { name: n.value, desc: d.value }).then(function (r) { rooms[r.id] = r; showNew = false; renderNewRoom(); openChat('room', r.id); })
        .catch(function (er) { n.value = ''; n.placeholder = er.message; });
    };
    box.appendChild(f);
  }

  // ---------- map (Leaflet + dark tiles; positions come from the server, rounded) ----------
  var map = null, markers = {}, meMarker = null, centred = false, cfg = null;
  fetch('/api/config').then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (c) { cfg = c; renderMap(); });
  function ensureMap() {
    if (map) return true;
    if (!window.L || !cfg) return false;
    map = L.map('mapEl', { zoomControl: false, attributionControl: true }).setView([20, 0], 2);
    if (cfg.cartoKey) {           // CARTO Dark Matter (needs a free API key — see README)
      L.tileLayer('https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=' + encodeURIComponent(cfg.cartoKey), { maxZoom: 19, detectRetina: true, attribution: '© OpenStreetMap contributors © CARTO' }).addTo(map);
    } else {                      // no key set: OpenStreetMap tiles, darkened with CSS
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
      $('mapEl').classList.add('dark-osm');
    }
    return true;
  }
  function pinIcon(u) {
    var p = el('div', 'pin'), a = el('span', 'av'); avatar(a, u); p.appendChild(a);
    p.style.setProperty('--c', u.status === 'Looking for a conversation' ? 'var(--blue)' : 'var(--green)');
    return L.divIcon({ className: '', html: p, iconSize: [0, 0] });
  }
  function renderMap() {
    var msg = $('mapMsg');
    if (!window.L) { $('mapMsgText').textContent = 'The map could not load. Check your internet connection.'; $('mapMsgBtn').hidden = true; msg.hidden = false; return; }
    if (view !== 'map' || !ensureMap()) return;
    map.invalidateSize();
    if (myPos) {
      var ll = [myPos.lat, myPos.lng];
      if (!meMarker) meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: el('div', 'medot'), iconSize: [0, 0] }), interactive: false, zIndexOffset: 1000 }).addTo(map); else meMarker.setLatLng(ll);
      if (!centred) { map.setView(ll, 17); centred = true; }
    }
    var wanted = {};
    nearbyList().forEach(function (u) {
      var n = near[u.id]; if (n.lat == null) return; wanted[u.id] = true;
      if (!markers[u.id]) { markers[u.id] = L.marker([n.lat, n.lng], { icon: pinIcon(u), title: nameOf(u) }).addTo(map); (function (id) { markers[id].on('click', function () { openProfile(id); }); })(u.id); }
      else { markers[u.id].setLatLng([n.lat, n.lng]); markers[u.id].setIcon(pinIcon(u)); }
    });
    Object.keys(markers).forEach(function (id) { if (!wanted[id]) { map.removeLayer(markers[id]); delete markers[id]; } });
    var off = !myPos && (geoState === 'denied' || geoState === 'unavailable');
    msg.hidden = !off;
    if (off) {
      $('mapMsgText').textContent = geoState === 'denied' ? 'Location is off for this site. Turn it on in your browser or device settings to see people near you.' : 'This browser can’t share your location, or the page isn’t on HTTPS.';
      $('mapMsgBtn').hidden = geoState !== 'denied'; $('mapMsgBtn').textContent = 'Try again';
    }
  }
  $('locate').onclick = function () { if (myPos && map) map.setView([myPos.lat, myPos.lng], 17); else startGeo(); };
  $('mapMsgBtn').onclick = startGeo;

  // ---------- location sharing ----------
  function sendPos() { if (myPos) post('/api/location', { lat: myPos.lat, lng: myPos.lng }).catch(function () {}); }
  function startGeo() {
    if (!navigator.geolocation) { geoState = 'unavailable'; renderMap(); renderMe(); return; }
    if (geoWatch != null) navigator.geolocation.clearWatch(geoWatch);
    geoWatch = navigator.geolocation.watchPosition(function (p) {
      var first = !myPos; geoState = 'ok'; myPos = { lat: p.coords.latitude, lng: p.coords.longitude };
      if (first) sendPos(); renderMap(); renderMe(); renderSide();
    }, function (err) { geoState = err.code === 1 ? 'denied' : 'unavailable'; renderMap(); renderMe(); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  }
  setInterval(sendPos, 15000);

  // ---------- chats list, new message ----------
  function renderEmpty() {
    var card = $('emptyCard'); card.querySelectorAll('.row').forEach(function (r) { r.remove(); });
    var ppl = Object.keys(recent).map(function (id) { return users[id]; }).filter(Boolean), rm = allRooms().filter(isMember), any = ppl.length || rm.length;
    card.querySelector('h3').textContent = any ? 'Your conversations' : 'Nothing here';
    card.querySelector('p').textContent = any ? 'Pick up where you left off.' : 'You have no conversations yet. Start one!';
    ppl.forEach(function (u) { card.appendChild(makeRow('person', u)); }); rm.forEach(function (r) { card.appendChild(makeRow('room', r)); });
  }
  function renderNew() {
    if (view !== 'new') return;
    var q = $('newSearch').value.trim().toLowerCase(), box = $('newList'), dup = {}, list = [];
    box.innerHTML = '';
    var fr = allUsers().filter(isFriend);
    fr.concat(nearbyList()).forEach(function (u) {
      if (dup[u.id]) return; dup[u.id] = 1;
      if (!q || nameOf(u).toLowerCase().indexOf(q) >= 0 || u.username.indexOf(q) >= 0) list.push(u);
    });
    if (!list.length) box.appendChild(el('div', 'hint', q ? 'No one found.' : 'Friends and people nearby show up here.'));
    list.forEach(function (u) { box.appendChild(makeRow('person', u)); });
  }
  $('newSearch').oninput = renderNew;

  // ---------- profiles ----------
  function openProfile(id) { profileId = id; setView('profile'); }
  function renderProfile() {
    if (view !== 'profile') return;
    var box = $('profileBox'), u = users[profileId]; if (!u) return;
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    box.innerHTML = '';
    var s = frStatus(u), f = friends[u.id], top = el('div', 'top'), av = el('div', 'av'); avatar(av, u); top.appendChild(av);
    var who = el('div'); who.appendChild(el('h3', '', nameOf(u)));
    who.appendChild(el('span', 'sub', '@' + u.username + (nameOf(u) !== u.displayName ? ' · ' + u.displayName : '')));
    who.appendChild(el('span', 'sub', sub(u) + (s === 'friend' ? ' · Friend' : ''))); top.appendChild(who); box.appendChild(top);
    var row = el('div', 'seg');
    function btn(label, fn, cls) { var b = el('button', cls || '', label); b.onclick = fn; row.appendChild(b); return b; }
    function act(path, body) { return function () { post(path, body).catch(function (er) { toast(er.message); }); }; }
    btn('Message', function () { openChat('person', u.id); }, 'primary');
    if (s === 'none') btn('Add friend', act('/api/friends/request', { userId: u.id }));
    if (s === 'outgoing') { btn('Request sent', function () {}).disabled = true; btn('Cancel', act('/api/friends/remove', { userId: u.id })); }
    if (s === 'incoming') { btn('Accept', act('/api/friends/respond', { userId: u.id, accept: true }), 'primary'); btn('Decline', act('/api/friends/respond', { userId: u.id, accept: false })); }
    box.appendChild(row);
    if (s === 'friend') {
      box.appendChild(el('div', 'lbl', 'Name'));
      var nf = el('form', 'inline'), ni = el('input', 'pillin'), nb = el('button', '', 'Save');
      ni.value = f.nickname || ''; ni.placeholder = u.displayName; ni.maxLength = 30; ni.setAttribute('aria-label', 'Name for this friend'); nb.type = 'submit';
      nf.appendChild(ni); nf.appendChild(nb);
      nf.onsubmit = function (e) { e.preventDefault(); post('/api/friends/nickname', { userId: u.id, name: ni.value }).then(function () { ni.blur(); toast('Saved'); }).catch(function (er) { toast(er.message); }); };
      box.appendChild(nf); box.appendChild(el('span', 'sub', 'Only you see this name. You can chat with friends over the internet when they are not nearby.'));
      var rm = el('button', 'link', 'Remove friend'); rm.onclick = act('/api/friends/remove', { userId: u.id }); box.appendChild(rm);
    }
    var rp = el('button', 'link', 'Report'); rp.onclick = function () { post('/api/report', { userId: u.id }).then(function () { rp.textContent = 'Reported'; rp.disabled = true; }); }; box.appendChild(rp);
  }
  function renderMe() {
    if (!me) return;
    avatar($('sAv'), me); $('sName').textContent = me.displayName; $('sUser').textContent = '@' + me.username;
    $('seg').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.status === me.status); });
    $('disc').checked = me.discoverable !== false;
    $('geoText').textContent = myPos ? 'Sharing your location while this page is open' : geoState === 'denied' ? 'Off — allow it in your browser settings' : geoState === 'unavailable' ? 'Not available here' : 'Asking…';
    $('geoBtn').hidden = !!myPos;
  }
  $('seg').querySelectorAll('button').forEach(function (b) { b.onclick = function () { post('/api/status', { status: b.dataset.status }); }; });
  $('disc').onchange = function () { post('/api/privacy', { discoverable: $('disc').checked }); };
  $('geoBtn').onclick = startGeo; $('signout').onclick = signOut;

  // ---------- conversation ----------
  function renderHeader() {
    if (!current) return;
    var item = current.kind === 'room' ? rooms[current.id] : users[current.id]; if (!item) return;
    var cn = $('cName'); cn.textContent = '';
    if (current.kind === 'room') { roomAvatar($('cAv'), item); cn.textContent = item.name; var n = members(item).length; $('cSub').textContent = n + (n === 1 ? ' member' : ' members'); cn.removeAttribute('role'); }
    else { avatar($('cAv'), item); cn.appendChild(document.createTextNode(nameOf(item))); cn.appendChild(el('i', '', '›')); $('cSub').textContent = sub(item); cn.setAttribute('role', 'button'); }
  }
  $('cName').onclick = $('cAv').onclick = function () { if (current && current.kind === 'person') openProfile(current.id); };
  function stampText(ts) {
    var d = new Date(ts), t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + t;
  }
  function bubble(m) {
    var mine = m.from === me.id, d = el('div', 'msg' + (mine ? ' me' : ''));
    if (current.kind === 'room' && !mine) d.appendChild(el('span', 'by', users[m.from] ? nameOf(users[m.from]) : 'Someone'));
    d.appendChild(document.createTextNode(m.text)); return d;
  }
  function addMessage(m) {
    if (seen[m.id]) return; seen[m.id] = true; thread.push(m);
    var box = $('msgs'), first = box.querySelector('.note'); if (first) first.remove();
    var prev = thread[thread.length - 2];
    if (!prev || m.ts - prev.ts > 3600000) box.appendChild(el('div', 'stamp', stampText(m.ts)));
    box.appendChild(bubble(m));
    if (m.from === me.id && m.to) setLastOwn(m);
  }
  function setLastOwn(m) {
    if (lastOwn && lastOwn.el) lastOwn.el.remove();
    var s = el('div', 'status', m.status === 'delivered' ? 'Delivered' : 'Sent'); $('msgs').appendChild(s); lastOwn = { id: m.id, el: s };
  }
  function openChat(kind, id) {
    current = { kind: kind, id: id }; unread[keyOf(kind, id)] = 0;
    seen = {}; thread = []; lastOwn = null; var box = $('msgs'); box.innerHTML = '';
    if (kind === 'room' && rooms[id] && !isMember(rooms[id])) post('/api/rooms/join', { room: id }).catch(function () {});
    setView('chat');
    var mine = current;
    api('/api/history?' + (kind === 'room' ? 'room=' : 'with=') + id).then(function (list) {
      if (current !== mine) return;
      list.forEach(addMessage);
      if (!list.length) box.appendChild(el('div', 'note', kind === 'room' ? 'Be the first to say something here.' : 'No messages yet.'));
      box.scrollTop = box.scrollHeight;
    }).catch(function () {});
    $('text').focus({ preventScroll: true });
  }
  $('composer').onsubmit = function (e) {
    e.preventDefault();
    var v = $('text').value.trim(); if (!v || !current) return;
    var c = current, body = { text: v }; if (c.kind === 'room') body.room = c.id; else body.to = c.id;
    $('text').value = '';
    post('/api/message', body).then(function (m) {
      if (current !== c) return; addMessage(m); $('msgs').scrollTop = $('msgs').scrollHeight; if (c.kind === 'person') recent[c.id] = true;
    }).catch(function (er) { $('text').value = v; toast(er.message); });
  };

  function renderAll() { renderSide(); if (view === 'map') renderMap(); renderEmpty(); renderNew(); renderHeader(); renderMe(); renderProfile(); updateTabs(); }

  // ---------- live updates ----------
  function setNear(list) { near = {}; list.forEach(function (n) { near[n.id] = n; }); }
  function connect() {
    var es = new EventSource('/api/events?token=' + encodeURIComponent(token));
    es.addEventListener('init', function (e) {
      var d = JSON.parse(e.data); me = d.me; users = {}; d.users.forEach(function (u) { users[u.id] = u; });
      rooms = {}; d.rooms.forEach(function (r) { rooms[r.id] = r; });
      recent = {}; d.recent.forEach(function (id) { recent[id] = true; });
      friends = {}; d.friends.forEach(function (f) { friends[f.id] = f; }); setNear(d.nearby);
      avatar($('meAv'), me); $('loading').hidden = true; $('conn').hidden = true; renderAll();
      if (geoWatch == null) startGeo(); else sendPos();
    });
    es.addEventListener('user', function (e) { var u = JSON.parse(e.data); users[u.id] = u; if (me && u.id === me.id) { me = u; avatar($('meAv'), me); } renderAll(); });
    es.addEventListener('presence', function (e) { var p = JSON.parse(e.data); if (users[p.id]) users[p.id].online = p.online; renderAll(); });
    es.addEventListener('nearby', function (e) { setNear(JSON.parse(e.data)); renderAll(); });
    es.addEventListener('room', function (e) { var r = JSON.parse(e.data); rooms[r.id] = r; renderAll(); });
    es.addEventListener('friends', function (e) {
      var next = {}, old = friends; JSON.parse(e.data).forEach(function (f) { next[f.id] = f; });
      Object.keys(next).forEach(function (id) {
        var n = next[id], o = old[id], u = users[id]; if (!u) return;
        if (n.status === 'incoming' && !(o && o.status === 'incoming')) toast(u.displayName + ' sent you a friend request');
        if (n.status === 'friend' && o && o.status === 'outgoing') toast(u.displayName + ' accepted your friend request');
      });
      friends = next; renderAll();
    });
    es.addEventListener('message', function (e) {
      var m = JSON.parse(e.data), kind = m.room ? 'room' : 'person';
      var id = m.room ? m.room : (m.from === me.id ? m.to : m.from), key = keyOf(kind, id);
      if (kind === 'person') recent[id] = true;
      if (current && current.kind === kind && current.id === id) { addMessage(m); $('msgs').scrollTop = $('msgs').scrollHeight; }
      else if (m.from !== me.id && (kind === 'person' || (rooms[id] && isMember(rooms[id])))) unread[key] = (unread[key] || 0) + 1;
      renderAll();
    });
    es.addEventListener('status', function (e) {
      var s = JSON.parse(e.data); if (lastOwn && lastOwn.id === s.id) lastOwn.el.textContent = s.status === 'delivered' ? 'Delivered' : 'Sent';
    });
    es.onerror = function () { $('conn').hidden = false; };
  }
  connect();
})();
