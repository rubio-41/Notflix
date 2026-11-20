// Chat client: profiles, who is nearby, friends, messages, map — all live from server.js.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var token = null; try { token = localStorage.getItem('token'); } catch (e) {}
  if (!token) { location.replace('index.html'); return; }

  // ---------- state ----------
  var me = null, users = {}, rooms = {}, recent = {}, unread = {}, friends = {}, near = {};
  var view = 'map', current = null, profileId = null, expanded = null, showNew = false, voice = {}, session = null, incoming = null;
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
  function signOut() {
    fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(function () {}).then(function () { try { localStorage.removeItem('token'); } catch (e) {} location.replace('index.html'); });
  }
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
  var TABS = [['map', 'Nearby'], ['chats', 'Chats'], ['voice', 'Voice rooms'], ['me', 'Profile and privacy']];
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    TABS.forEach(function (t) {
      var b = el('button'); b.dataset.tab = t[0]; b.title = t[1]; b.setAttribute('aria-label', t[1]);
      b.innerHTML = '<svg viewBox="0 0 24 24">' + ICON[t[0]] + '</svg>';
      b.onclick = function () { setView(t[0] === 'chats' ? 'empty' : t[0]); };
      box.appendChild(b);
    });
  });
  function updateTabs() {
    var on = view === 'map' ? 'map' : view === 'me' ? 'me' : view === 'voice' ? 'voice' : 'chats';
    document.querySelectorAll('[data-tabs] button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tab === on); });
    var pending = Object.keys(friends).some(function (id) { return friends[id].status === 'incoming'; });
    document.querySelectorAll('[data-tabs] button[data-tab=me]').forEach(function (b) {
      var d = b.querySelector('.dotbadge'); if (pending && !d) b.appendChild(el('i', 'dotbadge')); if (!pending && d) d.remove();
    });
  }

  // ---------- panes ----------
  var VIEWS = ['map', 'empty', 'chat', 'new', 'me', 'profile', 'voice'];
  function setView(v) {
    view = v;
    VIEWS.forEach(function (k) { $('v-' + k).classList.toggle('on', k === v); });
    if (v !== 'chat') { current = null; stopRec(false); }
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
    p.style.setProperty('--c', u.status === 'In a voice room' ? '#bf5af2' : u.status === 'Looking for a conversation' ? 'var(--blue)' : 'var(--green)');
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
    $('geoBtn').hidden = !!myPos; renderPw();
  }
  $('seg').querySelectorAll('button').forEach(function (b) { b.onclick = function () { post('/api/status', { status: b.dataset.status }); }; });
  $('disc').onchange = function () { post('/api/privacy', { discoverable: $('disc').checked }); };
  $('geoBtn').onclick = startGeo; $('signout').onclick = signOut;

  // ---------- conversation ----------
  function renderHeader() {
    if (!current) return;
    var item = current.kind === 'room' ? rooms[current.id] : users[current.id]; if (!item) return;
    var cn = $('cName'), cb = $('callBtn'); cn.textContent = '';
    if (current.kind === 'room') {
      roomAvatar($('cAv'), item); cn.textContent = item.name; var n = members(item).length; $('cSub').textContent = n + (n === 1 ? ' member' : ' members'); cn.removeAttribute('role');
      var here = session && session.kind === 'room' && session.room === item.id;
      cb.innerHTML = I.mic; cb.title = here ? 'You are in the voice room' : 'Join voice'; cb.setAttribute('aria-label', cb.title); cb.disabled = !!session && !here; cb.className = 'ibtn vid' + (here ? ' ok' : '');
      cb.onclick = function () { if (here) setView('voice'); else joinVoice(item.id); };
    } else {
      avatar($('cAv'), item); cn.appendChild(document.createTextNode(nameOf(item))); cn.appendChild(el('i', '', '›')); $('cSub').textContent = sub(item); cn.setAttribute('role', 'button');
      cb.innerHTML = I.phone; cb.title = item.online ? 'Call' : 'They are offline'; cb.setAttribute('aria-label', cb.title); cb.disabled = !item.online || !!session; cb.className = 'ibtn vid';
      cb.onclick = function () { startCall(item.id); };
    }
  }
  $('cName').onclick = $('cAv').onclick = function () { if (current && current.kind === 'person') openProfile(current.id); };
  function stampText(ts) {
    var d = new Date(ts), t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + t;
  }
  function bubble(m) {
    var mine = m.from === me.id;
    if (m.voice) { var v = voiceBubble(m, mine); if (current.kind === 'room' && !mine) v.insertBefore(el('span', 'by', users[m.from] ? nameOf(users[m.from]) : 'Someone'), v.firstChild); return v; }
    var d = el('div', 'msg' + (mine ? ' me' : ''));
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

  // ---------- icons used by calls and voice ----------
  var SVG = function (inner, extra) { return '<svg viewBox="0 0 24 24"' + (extra || '') + '>' + inner + '</svg>'; };
  var I = {
    phone: SVG('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>'),
    hang: SVG('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>', ' style="transform:rotate(135deg)"'),
    mic: SVG('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
    micoff: SVG('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16"/>'),
    play: SVG('<path d="M8 5v14l11-7z" style="stroke:none"/>'), pause: SVG('<path d="M7 5h4v14H7zM13 5h4v14h-4z" style="stroke:none"/>')
  };
  function fmt(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  // ---------- audio plumbing (shared by calls and voice rooms) ----------
  var iceServers = null, localStream = null, peers = {}, pending = {}, remoteEls = {}, levels = {}, audioCtx = null;
  function ctxAudio() {
    if (!audioCtx) { var C = window.AudioContext || window.webkitAudioContext; if (C) audioCtx = new C(); }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); return audioCtx;
  }
  function watchLevel(key, stream) {
    var c = ctxAudio(); if (!c) return;
    try { var an = c.createAnalyser(); an.fftSize = 256; c.createMediaStreamSource(stream).connect(an); levels[key] = { an: an, buf: new Uint8Array(an.fftSize), speaking: false }; } catch (e) {}
  }
  setInterval(function () {
    var changed = false;
    Object.keys(levels).forEach(function (k) {
      var l = levels[k]; l.an.getByteTimeDomainData(l.buf); var sum = 0;
      for (var i = 0; i < l.buf.length; i++) { var v = (l.buf[i] - 128) / 128; sum += v * v; }
      var sp = Math.sqrt(sum / l.buf.length) > 0.04; if (k === 'me' && session && session.muted) sp = false;
      if (sp !== l.speaking) { l.speaking = sp; changed = true; }
    });
    if (changed) { renderCallUI(); renderVoice(); }
  }, 150);
  function getIce() { return iceServers ? Promise.resolve(iceServers) : api('/api/ice').then(function (j) { iceServers = j.iceServers; return iceServers; }); }
  function getMic() {
    if (localStream) return Promise.resolve(localStream);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('The microphone is not available here. The page must be on HTTPS.'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (s) { localStream = s; watchLevel('me', s); return s; })
      .catch(function () { throw new Error('Microphone permission is needed.'); });
  }
  function releaseMic() { if (localStream) { localStream.getTracks().forEach(function (t) { t.stop(); }); localStream = null; } delete levels.me; }
  function setMuted(m) { if (session) session.muted = m; if (localStream) localStream.getAudioTracks().forEach(function (t) { t.enabled = !m; }); }

  function sendSignal(to, ctx, data) { post('/api/signal', { to: to, id: ctx.id, room: ctx.room, data: data }).catch(function () {}); }
  function attachRemote(id, stream) {
    var a = remoteEls[id];
    if (!a) { a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); document.body.appendChild(a); remoteEls[id] = a; }
    a.srcObject = stream;
    var p = a.play(); if (p && p.catch) p.catch(function () { toast('Tap the screen to hear the call.'); document.addEventListener('click', function () { a.play(); }, { once: true }); });
    watchLevel(id, stream);
  }
  function ensurePeer(peerId, ctx, initiator) {
    if (peers[peerId]) return Promise.resolve(peers[peerId]);
    return Promise.all([getIce(), getMic()]).then(function (r) {
      if (peers[peerId]) return peers[peerId];
      var pc = new RTCPeerConnection({ iceServers: r[0] }); peers[peerId] = pc; pending[peerId] = pending[peerId] || [];
      r[1].getTracks().forEach(function (t) { pc.addTrack(t, r[1]); });
      pc.onicecandidate = function (e) { if (e.candidate) sendSignal(peerId, ctx, { candidate: e.candidate }); };
      pc.ontrack = function (e) { attachRemote(peerId, e.streams[0]); };
      pc.onconnectionstatechange = function () {
        if (pc.connectionState === 'connected' && session && session.kind === 'call') { session.state = 'active'; session.startedAt = session.startedAt || Date.now(); renderCallUI(); }
        if (pc.connectionState === 'failed') toast('The audio connection failed. Some networks block calls.');
      };
      if (!initiator) return pc;
      return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { sendSignal(peerId, ctx, { sdp: pc.localDescription }); return pc; });
    });
  }
  function flush(peerId, pc) { (pending[peerId] || []).forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); }); pending[peerId] = []; }
  function handleSignal(s) {
    if (!session) return;
    var ctx = s.room ? { room: s.room } : { id: s.id };
    if (s.room ? !(session.kind === 'room' && session.room === s.room) : !(session.kind === 'call' && session.id === s.id)) return;
    var d = s.data;
    if (d.sdp && d.sdp.type === 'offer') {
      ensurePeer(s.from, ctx, false).then(function (pc) {
        return pc.setRemoteDescription(d.sdp).then(function () { flush(s.from, pc); return pc.createAnswer(); })
          .then(function (a) { return pc.setLocalDescription(a); }).then(function () { sendSignal(s.from, ctx, { sdp: pc.localDescription }); });
      }).catch(function () {});
    } else if (d.sdp) {
      var pc = peers[s.from]; if (pc) pc.setRemoteDescription(d.sdp).then(function () { flush(s.from, pc); }).catch(function () {});
    } else if (d.candidate) {
      var p2 = peers[s.from];
      if (p2 && p2.remoteDescription) p2.addIceCandidate(d.candidate).catch(function () {}); else (pending[s.from] = pending[s.from] || []).push(d.candidate);
    }
  }
  function closePeer(id) {
    if (peers[id]) { try { peers[id].close(); } catch (e) {} delete peers[id]; }
    if (remoteEls[id]) { remoteEls[id].srcObject = null; remoteEls[id].remove(); delete remoteEls[id]; }
    delete pending[id]; delete levels[id];
  }
  function endSession(notify) {
    if (!session) return;
    var s = session; session = null;
    Object.keys(peers).forEach(closePeer); releaseMic();
    if (notify) { if (s.kind === 'call') post('/api/call/end', { id: s.id }).catch(function () {}); else post('/api/voice/leave', {}).catch(function () {}); }
    renderAll();
  }

  // ---------- calls (1:1) ----------
  var ringTimer = null;
  function startRing() {
    stopRing();
    function beep() { var c = ctxAudio(); if (!c || c.state !== 'running') return; var o = c.createOscillator(), g = c.createGain(); o.frequency.value = 440; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start(); setTimeout(function () { o.stop(); }, 350); }
    beep(); ringTimer = setInterval(beep, 1800); if (navigator.vibrate) navigator.vibrate([300, 200, 300]);
  }
  function stopRing() { clearInterval(ringTimer); ringTimer = null; }
  function startCall(userId) {
    if (session) { toast('You are already in a call.'); return; }
    var u = users[userId]; if (!u || !u.online) { toast('They are offline right now.'); return; }
    getMic().then(function () { return post('/api/call/start', { to: userId }); })
      .then(function (r) { session = { kind: 'call', id: r.id, peer: userId, state: 'ringing', muted: false }; renderAll(); })
      .catch(function (er) { releaseMic(); toast(er.message); });
  }
  function acceptCall() {
    var c = incoming; if (!c) return; stopRing(); incoming = null; renderCallUI();
    getMic().then(function () { session = { kind: 'call', id: c.id, peer: c.from, state: 'connecting', muted: false }; renderAll(); return post('/api/call/answer', { id: c.id, accept: true }); })
      .catch(function (er) { session = null; releaseMic(); post('/api/call/answer', { id: c.id, accept: false }).catch(function () {}); toast(er.message); renderAll(); });
  }
  function declineCall() { var c = incoming; incoming = null; stopRing(); if (c) post('/api/call/answer', { id: c.id, accept: false }).catch(function () {}); renderCallUI(); }
  function onCallEvent(e) {
    if (e.type === 'incoming') {
      if (session || incoming) { post('/api/call/answer', { id: e.id, accept: false }).catch(function () {}); return; }
      incoming = { id: e.id, from: e.from }; startRing(); renderCallUI();
    } else if (e.type === 'accepted') {
      if (session && session.kind === 'call' && session.id === e.id) { session.state = 'connecting'; ensurePeer(session.peer, { id: e.id }, true).catch(function (er) { toast(er.message); }); renderCallUI(); }
    } else if (e.type === 'ended') {
      if (incoming && incoming.id === e.id) { incoming = null; stopRing(); toast('Missed call'); renderCallUI(); }
      if (session && session.kind === 'call' && session.id === e.id) {
        toast(e.reason === 'declined' ? 'Call declined' : e.reason === 'noanswer' ? 'No answer' : 'Call ended'); endSession(false);
      }
    }
  }
  $('incoming').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; if (b.dataset.act === 'accept') acceptCall(); else if (b.dataset.act === 'decline') declineCall(); });

  // ---------- voice rooms ----------
  function joinVoice(roomId) {
    if (session) { toast('Leave your current call first.'); return; }
    getMic().then(function () { return post('/api/voice/join', { room: roomId }); }).then(function (r) {
      session = { kind: 'room', room: roomId, muted: false }; renderAll();
      r.participants.forEach(function (id) { ensurePeer(id, { room: roomId }, true).catch(function () {}); });
    }).catch(function (er) { releaseMic(); toast(er.message); });
  }
  function voiceNames(r) { return (voice[r.id] || []).map(function (id) { return id === me.id ? 'You' : (users[id] ? nameOf(users[id]) : '?'); }).join(', '); }
  function tile(id) {
    var u = id === me.id ? me : users[id], t = el('div', 'vp' + (levels[id === me.id ? 'me' : id] && levels[id === me.id ? 'me' : id].speaking ? ' speaking' : '')), a = el('span', 'av');
    avatar(a, u); t.appendChild(a); t.appendChild(el('span', '', id === me.id ? 'You' : (u ? nameOf(u) : '?'))); return t;
  }
  function renderVoice() {
    if (view !== 'voice') return;
    var box = $('voiceBox'); if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // don't wipe typing
    box.innerHTML = ''; box.appendChild(el('h3', '', 'Voice rooms'));
    if (session && session.kind === 'room') {
      var r = rooms[session.room]; box.appendChild(el('span', 'sub', 'You are in ' + (r ? r.name : 'a voice room')));
      var g = el('div', 'vgrid'); (voice[session.room] || []).forEach(function (id) { g.appendChild(tile(id)); }); box.appendChild(g);
      var row = el('div', 'seg'), mb = el('button', '', session.muted ? 'Unmute' : 'Mute'), lb = el('button', '', 'Leave');
      mb.onclick = function () { setMuted(!session.muted); renderAll(); }; lb.onclick = function () { endSession(true); };
      row.appendChild(mb); row.appendChild(lb); box.appendChild(row);
    }
    var rm = allRooms();
    if (!rm.length) box.appendChild(el('div', 'hint', 'No voice rooms yet. Every public conversation has one, so create a conversation to start.'));
    var list = el('div'); rm.forEach(function (r) {
      var here = session && session.kind === 'room' && session.room === r.id, n = (voice[r.id] || []).length;
      var row = el('div', 'row'), a = el('span', 'av'); roomAvatar(a, r); var t = el('span'); t.appendChild(el('b', '', r.name)); t.appendChild(el('small', '', n ? voiceNames(r) : 'Empty'));
      var acts = el('span', 'acts'), b = el('button', here ? 'no' : '', here ? 'Leave' : 'Join'); b.onclick = function () { if (here) endSession(true); else joinVoice(r.id); };
      acts.appendChild(b); row.appendChild(a); row.appendChild(t); row.appendChild(acts); list.appendChild(row);
    }); box.appendChild(list);
    var f = el('form', 'inline'), ni = el('input', 'pillin'), nb = el('button', '', 'Create'); ni.placeholder = 'New voice room name'; ni.maxLength = 24; ni.setAttribute('aria-label', 'New voice room name'); nb.type = 'submit';
    f.appendChild(ni); f.appendChild(nb);
    f.onsubmit = function (e) { e.preventDefault(); if (!ni.value.trim()) return; post('/api/rooms', { name: ni.value }).then(function (r) { rooms[r.id] = r; joinVoice(r.id); }).catch(function (er) { toast(er.message); }); };
    box.appendChild(f);
  }

  // ---------- the call bar and the incoming-call screen ----------
  function iconBtn(cls, icon, label, fn) { var b = el('button', 'ibtn ' + cls); b.innerHTML = icon; b.setAttribute('aria-label', label); b.title = label; b.onclick = fn; return b; }
  function renderCallUI() {
    $('app').classList.toggle('insession', !!session);
    var bar = $('callBar'); bar.hidden = !session; bar.innerHTML = '';
    if (session) {
      var av = el('div', 'cb-av'), ids = session.kind === 'call' ? [session.peer] : (voice[session.room] || []).filter(function (i) { return i !== me.id; }).slice(0, 3);
      ids.forEach(function (id) { var a = el('span', 'av' + (levels[id] && levels[id].speaking ? ' speaking' : '')); avatar(a, users[id]); av.appendChild(a); });
      if (!ids.length) { var a0 = el('span', 'av'); avatar(a0, me); av.appendChild(a0); }
      var tx = el('div', 'cb-text'), title = session.kind === 'call' ? (users[session.peer] ? nameOf(users[session.peer]) : 'Call') : (rooms[session.room] ? rooms[session.room].name : 'Voice room');
      var sub = session.kind === 'call' ? (session.state === 'ringing' ? 'Calling…' : session.state === 'connecting' ? 'Connecting…' : fmt(Math.floor((Date.now() - session.startedAt) / 1000)))
        : (voice[session.room] || []).length + ' in voice';
      tx.appendChild(el('b', '', title)); var sm = el('small', '', sub); sm.id = 'cbSub'; tx.appendChild(sm);
      bar.appendChild(av); bar.appendChild(tx);
      bar.appendChild(iconBtn(session.muted ? 'muted' : '', session.muted ? I.micoff : I.mic, session.muted ? 'Unmute' : 'Mute', function () { setMuted(!session.muted); renderAll(); }));
      bar.appendChild(iconBtn('hang', I.hang, session.kind === 'call' ? 'End call' : 'Leave voice room', function () { endSession(true); }));
    }
    var inc = $('incoming'); inc.hidden = !incoming; inc.innerHTML = '';
    if (incoming) {
      var u = users[incoming.from], box = el('div', 'box'), a = el('span', 'av'); avatar(a, u);
      box.appendChild(a); box.appendChild(el('h3', '', u ? nameOf(u) : 'Someone')); box.appendChild(el('p', '', 'Incoming call'));
      var bt = el('div', 'btns'), no = iconBtn('hang', I.hang, 'Decline', function () {}), yes = iconBtn('ok', I.phone, 'Accept', function () {});
      no.dataset.act = 'decline'; yes.dataset.act = 'accept'; no.onclick = yes.onclick = null; bt.appendChild(no); bt.appendChild(yes); box.appendChild(bt); inc.appendChild(box);
    }
  }
  setInterval(function () { var s = $('cbSub'); if (s && session && session.kind === 'call' && session.state === 'active') s.textContent = fmt(Math.floor((Date.now() - session.startedAt) / 1000)); }, 1000);

  // ---------- voice messages ----------
  var rec = null, activeAudio = null;
  function startRec() {
    if (!current || rec) return;
    if (!window.MediaRecorder || !navigator.mediaDevices) { toast('Voice messages need HTTPS and a newer browser.'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'], mime = '';
      for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) { mime = types[i]; break; }
      var mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      var r = { mr: mr, chunks: [], stream: stream, t0: Date.now(), mime: mr.mimeType || mime, target: current }; rec = r;
      mr.ondataavailable = function (e) { if (e.data && e.data.size) r.chunks.push(e.data); };
      mr.start(); $('composer').classList.add('rec'); r.timer = setInterval(tickRec, 250); tickRec();
    }).catch(function () { toast('Microphone permission is needed for voice messages.'); });
  }
  function tickRec() { if (!rec) return; var s = Math.floor((Date.now() - rec.t0) / 1000); $('recTime').textContent = fmt(s); if (s >= 180) stopRec(true); }
  function stopRec(send) {
    if (!rec) return; var r = rec; rec = null; clearInterval(r.timer); $('composer').classList.remove('rec');
    r.mr.onstop = function () {
      r.stream.getTracks().forEach(function (t) { t.stop(); }); if (!send) return;
      var dur = Math.max(1, Math.round((Date.now() - r.t0) / 1000)), blob = new Blob(r.chunks, { type: r.mime || 'audio/webm' });
      if (blob.size > 300) sendVoice(r.target, blob, dur);
    };
    try { r.mr.stop(); } catch (e) { r.stream.getTracks().forEach(function (t) { t.stop(); }); }
  }
  function sendVoice(target, blob, dur) {
    var q = (target.kind === 'room' ? 'room=' : 'to=') + target.id + '&dur=' + dur + '&mime=' + encodeURIComponent((blob.type || 'audio/webm').split(';')[0]);
    fetch('/api/voicemsg?' + q, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' }, body: blob })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not send'); return j; }); })
      .then(function (m) { if (current && current.kind === target.kind && current.id === target.id) { addMessage(m); $('msgs').scrollTop = $('msgs').scrollHeight; } if (target.kind === 'person') recent[target.id] = true; })
      .catch(function (er) { toast(er.message); });
  }
  $('micBtn').onclick = startRec; $('recCancel').onclick = function () { stopRec(false); }; $('recSend').onclick = function () { stopRec(true); };
  function voiceBubble(m, mine) {
    var d = el('div', 'msg voice' + (mine ? ' me' : '')), b = el('button', 'vplay'), tr = el('span', 'vtrack'), fill = el('i'), du = el('span', 'vdur', fmt(m.voice.dur)), audio = null;
    b.innerHTML = I.play; b.setAttribute('aria-label', 'Play voice message'); tr.appendChild(fill); d.appendChild(b); d.appendChild(tr); d.appendChild(du);
    function load() {
      if (audio) return Promise.resolve();
      return fetch('/api/voicemsg/' + m.voice.id, { headers: { Authorization: 'Bearer ' + token } }).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); }).then(function (bl) {
        audio = new Audio(URL.createObjectURL(bl));
        audio.ontimeupdate = function () { if (audio.duration) fill.style.width = Math.min(100, audio.currentTime / audio.duration * 100) + '%'; };
        audio.onplay = function () { b.innerHTML = I.pause; }; audio.onpause = function () { b.innerHTML = I.play; };
        audio.onended = function () { b.innerHTML = I.play; fill.style.width = '0'; };
      });
    }
    b.onclick = function () {
      if (audio && !audio.paused) { audio.pause(); return; }
      load().then(function () { if (activeAudio && activeAudio !== audio) activeAudio.pause(); activeAudio = audio; return audio.play(); }).catch(function () { toast('Could not play this voice message.'); });
    };
    return d;
  }

  // ---------- password for older accounts ----------
  function renderPw() {
    var box = $('pwBox'); if (!me) return;
    if (me.hasPassword !== false) { box.innerHTML = ''; delete box.dataset.built; return; }
    if (box.dataset.built) return; box.dataset.built = '1';
    box.appendChild(el('div', 'lbl', 'Set a password')); var f = el('form', 'inline'), i = el('input', 'pillin'), b = el('button', '', 'Save');
    i.type = 'password'; i.placeholder = 'At least 8 characters'; i.autocomplete = 'new-password'; i.setAttribute('aria-label', 'New password'); b.type = 'submit'; f.appendChild(i); f.appendChild(b); box.appendChild(f);
    box.appendChild(el('span', 'sub', 'You need a password to log in on other devices.'));
    f.onsubmit = function (e) { e.preventDefault(); post('/api/password', { password: i.value }).then(function () { me.hasPassword = true; renderPw(); toast('Password saved'); }).catch(function (er) { toast(er.message); }); };
  }
  window.__prox = { state: function () { return { session: session && { kind: session.kind, state: session.state }, peers: Object.keys(peers).map(function (k) { return peers[k].connectionState; }), incoming: !!incoming }; } };

  function renderAll() { renderSide(); if (view === 'map') renderMap(); renderEmpty(); renderNew(); renderHeader(); renderMe(); renderProfile(); renderVoice(); renderCallUI(); updateTabs(); }

  // ---------- live updates ----------
  function setNear(list) { near = {}; list.forEach(function (n) { near[n.id] = n; }); }
  function connect() {
    var es = new EventSource('/api/events?token=' + encodeURIComponent(token));
    es.addEventListener('init', function (e) {
      var d = JSON.parse(e.data); me = d.me; users = {}; d.users.forEach(function (u) { users[u.id] = u; });
      rooms = {}; d.rooms.forEach(function (r) { rooms[r.id] = r; });
      recent = {}; d.recent.forEach(function (id) { recent[id] = true; });
      friends = {}; d.friends.forEach(function (f) { friends[f.id] = f; }); setNear(d.nearby); voice = d.voice || {};
      if (session) { toast('Connection was interrupted.'); endSession(false); }
      avatar($('meAv'), me); $('loading').hidden = true; $('conn').hidden = true; renderAll();
      if (geoWatch == null) startGeo(); else sendPos();
    });
    es.addEventListener('user', function (e) { var u = JSON.parse(e.data); users[u.id] = u; if (me && u.id === me.id) { me = Object.assign({}, u, { hasPassword: me.hasPassword }); avatar($('meAv'), me); } renderAll(); });
    es.addEventListener('presence', function (e) { var p = JSON.parse(e.data); if (users[p.id]) users[p.id].online = p.online; renderAll(); });
    es.addEventListener('call', function (e) { onCallEvent(JSON.parse(e.data)); });
    es.addEventListener('signal', function (e) { handleSignal(JSON.parse(e.data)); });
    es.addEventListener('voice', function (e) {
      voice = JSON.parse(e.data);
      if (session && session.kind === 'room') {
        var ids = voice[session.room] || [];
        if (ids.indexOf(me.id) < 0) endSession(false); else Object.keys(peers).forEach(function (id) { if (ids.indexOf(id) < 0) closePeer(id); });
      }
      renderAll();
    });
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
