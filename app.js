// Chat client. Talks to server.js: profiles, who is online, messages — all live.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var token = null; try { token = localStorage.getItem('token'); } catch (e) {}
  if (!token) { location.replace('index.html'); return; }

  // ---- State ----
  var me = null, users = {}, rooms = {}, recent = {}, unread = {}, friends = {}, profileId = null;
  var current = null, view = 'map', seen = {}, lastOwn = null, expanded = null, thread = [], showNew = false;

  // ---- Helpers ----
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function api(path, opts) {
    opts = opts || {}; opts.headers = Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, opts.headers);
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { signOut(); throw new Error('Signed out'); }
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; });
    });
  }
  function signOut() { try { localStorage.removeItem('token'); } catch (e) {} location.replace('index.html'); }
  var toastTimer;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2200); }
  function avatar(node, u) {
    var url = u && u.photo ? '/avatar/' + u.id + '?v=' + u.photo : '';
    node.style.backgroundImage = url ? 'url(' + url + ')' : '';
    node.textContent = url ? '' : (u ? u.displayName : '?').charAt(0).toUpperCase();
  }
  function roomAvatar(node, r) { node.style.backgroundImage = ''; node.textContent = r.name.charAt(0).toUpperCase(); }
  function colorFor(u) { return u.status === 'Looking for a conversation' ? 'var(--blue)' : 'var(--green)'; }
  function keyOf(kind, id) { return (kind === 'room' ? 'r:' : 'u:') + id; }
  function others() { return Object.keys(users).map(function (k) { return users[k]; }).filter(function (u) { return u.id !== me.id; }); }
  function nearby() { return others().filter(function (u) { return u.online && u.discoverable !== false; }).sort(function (a, b) { return a.displayName.localeCompare(b.displayName); }); }
  function allRooms() { return Object.keys(rooms).map(function (k) { return rooms[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); }); }
  function members(r) { return r.members || []; }
  function isMember(r) { return members(r).indexOf(me.id) >= 0; }
  // Friends: a friend's name is the nickname you gave them. "Nearby" = in your Around You list right now;
  // otherwise chat goes over the internet. (Real Bluetooth/Wi-Fi proximity comes later; today every message uses the server.)
  function isFriend(u) { return friends[u.id] && friends[u.id].status === 'friend'; }
  function nameOf(u) { return (isFriend(u) && friends[u.id].nickname) || u.displayName; }
  function transport(u) { return nearby().some(function (x) { return x.id === u.id; }) ? 'Nearby' : (u.online ? 'Online · over the internet' : 'Offline'); }
  function personSub(u) {
    var f = friends[u.id];
    if (f && f.status === 'incoming') return 'Wants to be friends';
    if (f && f.status === 'friend') return transport(u) + (u.online && transport(u) === 'Nearby' ? ' · ' + u.status : '');
    return u.online ? u.status : 'Offline';
  }

  // ---- Mini bar (same on every page) ----
  var ICON = {
    map: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    chats: '<path d="M4 5h16v11H9l-5 4z"/>',
    voice: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
    me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'
  };
  var TABS = [{ id: 'map', label: 'Nearby' }, { id: 'chats', label: 'Conversations' }, { id: 'voice', label: 'Voice rooms (coming later)' }, { id: 'me', label: 'Profile and privacy' }];
  document.querySelectorAll('[data-tabs]').forEach(function (box) {
    TABS.forEach(function (t) {
      var b = el('button'); b.dataset.tab = t.id; b.title = t.label; b.setAttribute('aria-label', t.label);
      b.innerHTML = '<svg viewBox="0 0 24 24">' + ICON[t.id] + '</svg>';
      if (t.id === 'voice') b.setAttribute('aria-disabled', 'true');
      b.onclick = function () {
        if (t.id === 'voice') toast('Voice rooms are coming in a later phase.');
        else setView(t.id === 'chats' ? 'empty' : t.id);
      };
      box.appendChild(b);
    });
  });
  function updateTabs() {
    var on = (view === 'map' || view === 'profile') ? 'map' : view === 'me' ? 'me' : 'chats';
    document.querySelectorAll('[data-tabs] button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tab === on); });
  }

  // ---- Panes: map | empty (conversations) | chat | me ----
  function setView(v) {
    view = v;
    ['map', 'empty', 'chat', 'me', 'profile'].forEach(function (k) { $('v-' + k).classList.toggle('on', k === v); });
    if (v !== 'chat') current = null;
    $('app').classList.add('chat-open');            // phones only (see CSS)
    updateTabs(); renderAll();
  }

  // ---- Sidebar ----
  function badge(key) { return unread[key] ? el('span', 'badge', unread[key] > 99 ? '99+' : unread[key]) : null; }
  function makeRow(kind, item) {
    var sel = current && current.kind === kind && current.id === item.id;
    var b = el('button', 'row' + (sel ? ' sel' : ''));
    var a = el('span', 'av'); if (kind === 'room') roomAvatar(a, item); else avatar(a, item);
    var t = el('span'); t.appendChild(el('b', '', kind === 'room' ? item.name : nameOf(item)));
    t.appendChild(el('small', '', kind === 'room' ? (item.desc || 'Open conversation') : personSub(item)));
    b.appendChild(a); b.appendChild(t);
    var bd = badge(keyOf(kind, item.id)); if (bd) b.appendChild(bd);
    if (kind === 'person') { a.title = 'View profile'; a.onclick = function (e) { e.stopPropagation(); openProfile(item.id); }; }
    b.onclick = function () { openChat(kind, item.id); };
    return b;
  }
  function renderSide() {
    var ppl = nearby(), rm = allRooms();
    var fr = Object.keys(friends).map(function (id) { return users[id]; }).filter(function (u) { return u && friends[u.id].status !== 'outgoing'; })
      .sort(function (a, b) { return (friends[a.id].status === 'incoming' ? 0 : 1) - (friends[b.id].status === 'incoming' ? 0 : 1) || nameOf(a).localeCompare(nameOf(b)); });
    $('cardFriends').hidden = !fr.length || expanded !== null;
    var fb = $('friends'); fb.innerHTML = ''; fr.forEach(function (u) { fb.appendChild(makeRow('person', u)); });
    $('cardPeople').hidden = expanded === 'rooms';
    $('cardRooms').hidden = expanded === 'people';
    $('cardPeople').classList.toggle('grow', expanded === 'people');
    $('cardRooms').classList.toggle('grow', expanded === 'rooms');
    var pb = $('people'); pb.innerHTML = '';
    if (!ppl.length) pb.appendChild(el('div', 'hintrow', 'Nobody else is online yet. Open this page on another device and create a profile.'));
    (expanded === 'people' ? ppl : ppl.slice(0, 3)).forEach(function (u) { pb.appendChild(makeRow('person', u)); });
    var rb = $('rooms'); rb.innerHTML = '';
    if (!rm.length) rb.appendChild(el('div', 'hintrow', 'No public conversations yet. Start the first one!'));
    (expanded === 'rooms' ? rm : rm.slice(0, 3)).forEach(function (r) { rb.appendChild(makeRow('room', r)); });
    $('morePeople').hidden = ppl.length <= 3 && expanded !== 'people';
    $('moreRooms').hidden = rm.length <= 3 && expanded !== 'rooms';
    $('morePeople').textContent = expanded === 'people' ? 'Show less' : 'More…';
    $('moreRooms').textContent = expanded === 'rooms' ? 'Show less' : 'More…';
    renderNewRoom();
  }
  // Built only when it changes, so typing is never wiped by live updates.
  function renderNewRoom() {
    var box = $('newRoomBox'), mode = showNew ? 'form' : 'btn';
    if (box.dataset.mode === mode) return;
    box.dataset.mode = mode; box.innerHTML = '';
    if (!showNew) { var nb = el('button', 'newbtn', '+ New conversation'); nb.onclick = function () { showNew = true; renderNewRoom(); box.querySelector('input').focus(); }; box.appendChild(nb); return; }
    var f = el('form', 'newroom'), n = el('input'), d = el('input'), ok = el('button', '', 'Create'), no = el('button', 'cancel', 'Cancel');
    n.placeholder = 'Name'; n.maxLength = 24; n.setAttribute('aria-label', 'Conversation name');
    d.placeholder = 'What is it about? (optional)'; d.maxLength = 60; d.setAttribute('aria-label', 'Description');
    ok.type = 'submit'; no.type = 'button';
    [n, d, ok, no].forEach(function (x) { f.appendChild(x); });
    no.onclick = function () { showNew = false; renderNewRoom(); };
    f.onsubmit = function (e) {
      e.preventDefault(); if (!n.value.trim()) return;
      api('/api/rooms', { method: 'POST', body: { name: n.value, desc: d.value } })
        .then(function (r) { rooms[r.id] = r; showNew = false; renderNewRoom(); openChat('room', r.id); })
        .catch(function (er) { n.value = ''; n.placeholder = er.message; });
    };
    box.appendChild(f);
  }
  $('morePeople').onclick = function () { expanded = expanded === 'people' ? null : 'people'; renderSide(); };
  $('moreRooms').onclick = function () { expanded = expanded === 'rooms' ? null : 'rooms'; renderSide(); };
  $('showList').onclick = function () { expanded = 'people'; renderSide(); };

  // ---- Map (illustrative layout: each person always lands in the same spot) ----
  function spot(u) {
    var h = 0, s = u.id; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var x = 8 + (h % 84), y = 30 + ((h >>> 8) % 56);
    if (Math.abs(x - 50) < 8 && Math.abs(y - 50) < 10) x = x < 50 ? 30 : 70;
    return [x, y];
  }
  function renderPins() {
    var box = $('pins'); box.innerHTML = '';
    nearby().forEach(function (u) {
      var p = spot(u), b = el('button', 'pin'); b.style.left = p[0] + '%'; b.style.top = p[1] + '%';
      b.style.setProperty('--c', colorFor(u)); b.title = nameOf(u) + ' — ' + u.status; b.setAttribute('aria-label', nameOf(u) + ', ' + u.status);
      var a = el('span', 'av'); avatar(a, u); b.appendChild(a); b.onclick = function () { openProfile(u.id); };
      box.appendChild(b);
    });
  }
  function renderEmpty() {
    var card = $('emptyCard'); card.querySelectorAll('.row').forEach(function (r) { r.remove(); });
    var ppl = Object.keys(recent).map(function (id) { return users[id]; }).filter(Boolean);
    var rm = allRooms().filter(isMember), any = ppl.length || rm.length;
    card.querySelector('h3').textContent = any ? 'Your conversations' : 'Nothing here';
    card.querySelector('p').textContent = any ? 'Pick up where you left off.' : 'You have no conversations yet. Start one!';
    ppl.forEach(function (u) { card.appendChild(makeRow('person', u)); });
    rm.forEach(function (r) { card.appendChild(makeRow('room', r)); });
  }
  function renderMe() {
    if (!me) return;
    avatar($('sAv'), me); $('sName').textContent = me.displayName; $('sUser').textContent = '@' + me.username;
    $('seg').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.status === me.status); });
    $('disc').checked = me.discoverable !== false;
  }
  function openProfile(id) { profileId = id; setView('profile'); }
  function renderProfile() {
    if (view !== 'profile') return;
    var box = $('profileBox'), u = users[profileId]; if (!u) return;
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // don't wipe typing
    box.innerHTML = '';
    var f = friends[u.id], status = f ? f.status : 'none';
    var top = el('div', 'pic'), av = el('div', 'av'); avatar(av, u); top.appendChild(av);
    var who = el('div'); who.appendChild(el('h3', '', nameOf(u)));
    who.appendChild(el('small', '', '@' + u.username + (nameOf(u) !== u.displayName ? ' · ' + u.displayName : '')));
    who.appendChild(el('small', '', personSub(u) + (status === 'friend' ? ' · Friend' : '')));
    top.appendChild(who); box.appendChild(top);
    var row = el('div', 'seg');
    function btn(label, fn, cls) { var b = el('button', cls || '', label); b.onclick = fn; row.appendChild(b); return b; }
    function act(path, body) { return function () { api(path, { method: 'POST', body: body }).catch(function (er) { toast(er.message); }); }; }
    btn('Message', function () { openChat('person', u.id); }, 'primary');
    if (status === 'none') btn('Add friend', act('/api/friends/request', { userId: u.id }));
    if (status === 'outgoing') { btn('Request sent', function () {}).disabled = true; btn('Cancel', act('/api/friends/remove', { userId: u.id })); }
    if (status === 'incoming') { btn('Accept', act('/api/friends/respond', { userId: u.id, accept: true }), 'primary'); btn('Decline', act('/api/friends/respond', { userId: u.id, accept: false })); }
    box.appendChild(row);
    if (status === 'friend') {
      box.appendChild(el('div', 'lbl', 'Name'));
      var nf = el('form', 'nick'), ni = el('input'), nb = el('button', '', 'Save');
      ni.value = f.nickname || ''; ni.placeholder = u.displayName; ni.maxLength = 30; ni.setAttribute('aria-label', 'Name for this friend'); nb.type = 'submit';
      nf.appendChild(ni); nf.appendChild(nb);
      nf.onsubmit = function (e) { e.preventDefault(); api('/api/friends/nickname', { method: 'POST', body: { userId: u.id, name: ni.value } }).then(function () { ni.blur(); toast('Saved'); }).catch(function (er) { toast(er.message); }); };
      box.appendChild(nf);
      box.appendChild(el('small', '', 'Only you see this name. If they are not nearby, you can still chat over the internet.'));
      var rm = el('button', 'link', 'Remove friend'); rm.onclick = act('/api/friends/remove', { userId: u.id }); box.appendChild(rm);
    }
    var rp = el('button', 'link', 'Report'); rp.onclick = function () { api('/api/report', { method: 'POST', body: { userId: u.id } }).then(function () { rp.textContent = 'Reported'; rp.disabled = true; }); };
    box.appendChild(rp);
  }
  $('cName').setAttribute('role', 'button'); $('cName').tabIndex = 0;
  $('cName').onclick = $('cAv').onclick = function () { if (current && current.kind === 'person') openProfile(current.id); };
  function renderAll() { renderSide(); renderPins(); renderEmpty(); renderHeader(); renderMe(); renderProfile(); }

  $('home').onclick = $('newMsg').onclick = function () { setView('map'); };
  $('profileBtn').onclick = function () { setView('me'); };
  $('mback').onclick = function () { current = null; $('app').classList.remove('chat-open'); renderSide(); };
  $('seg').querySelectorAll('button').forEach(function (b) { b.onclick = function () { api('/api/status', { method: 'POST', body: { status: b.dataset.status } }); }; });
  $('disc').onchange = function () { api('/api/privacy', { method: 'POST', body: { discoverable: $('disc').checked } }); };
  $('signout').onclick = signOut;

  // ---- Conversation ----
  function renderHeader() {
    if (!current) return;
    var item = current.kind === 'room' ? rooms[current.id] : users[current.id]; if (!item) return;
    if (current.kind === 'room') { roomAvatar($('cAv'), item); $('cName').textContent = item.name; var n = members(item).length; $('cSub').textContent = n + (n === 1 ? ' member' : ' members'); }
    else { avatar($('cAv'), item); $('cName').textContent = nameOf(item) + ' ›'; $('cSub').textContent = personSub(item); }
  }
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
    var box = $('msgs'), first = box.querySelector('.note.first'); if (first) first.remove();
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
    if (kind === 'room' && rooms[id] && !isMember(rooms[id])) api('/api/rooms/join', { method: 'POST', body: { room: id } }).catch(function () {});
    setView('chat');
    var q = kind === 'room' ? 'room=' + id : 'with=' + id, mine = current;
    api('/api/history?' + q).then(function (list) {
      if (current !== mine) return;
      if (kind === 'person' && list.some(function (m) { return m.from === id; }) && !list.some(function (m) { return m.from === me.id; })) {
        var name = users[id] ? nameOf(users[id]) : 'This person';
        box.appendChild(el('div', 'note', 'You haven’t connected with ' + name + ' yet. If you didn’t expect this message, you can report it.'));
        var r = el('button', 'report', 'Report'); r.onclick = function () { api('/api/report', { method: 'POST', body: { userId: id } }).then(function () { r.textContent = 'Reported'; r.disabled = true; }); };
        box.appendChild(r);
      }
      list.forEach(addMessage);
      if (!list.length) box.appendChild(el('div', 'note first', kind === 'room' ? 'Be the first to say something here.' : 'No messages yet. Say hi!'));
      box.scrollTop = box.scrollHeight;
    }).catch(function () {});
    $('text').focus({ preventScroll: true });
  }
  $('composer').onsubmit = function (e) {
    e.preventDefault();
    var v = $('text').value.trim(); if (!v || !current) return;
    var c = current, body = { text: v }; if (c.kind === 'room') body.room = c.id; else body.to = c.id;
    $('text').value = '';
    api('/api/message', { method: 'POST', body: body }).then(function (m) {
      if (current !== c) return;
      addMessage(m); $('msgs').scrollTop = $('msgs').scrollHeight;
      if (c.kind === 'person') recent[c.id] = true;
    }).catch(function (er) { $('text').value = v; $('text').placeholder = er.message; });
  };

  // ---- Live updates from the server ----
  function connect() {
    var es = new EventSource('/api/events?token=' + encodeURIComponent(token));
    es.addEventListener('init', function (e) {
      var d = JSON.parse(e.data); me = d.me; users = {}; d.users.forEach(function (u) { users[u.id] = u; });
      rooms = {}; d.rooms.forEach(function (r) { rooms[r.id] = r; });
      recent = {}; d.recent.forEach(function (id) { recent[id] = true; });
      friends = {}; d.friends.forEach(function (f) { friends[f.id] = f; });
      avatar($('meAv'), me); $('loading').hidden = true; $('conn').hidden = true; updateTabs(); renderAll();
    });
    es.addEventListener('user', function (e) { var u = JSON.parse(e.data); users[u.id] = u; if (me && u.id === me.id) { me = u; avatar($('meAv'), me); } renderAll(); });
    es.addEventListener('presence', function (e) { var p = JSON.parse(e.data); if (users[p.id]) users[p.id].online = p.online; renderAll(); });
    es.addEventListener('friends', function (e) {
      var next = {}, old = friends; JSON.parse(e.data).forEach(function (f) { next[f.id] = f; });
      Object.keys(next).forEach(function (id) {
        var n = next[id], o = old[id], u = users[id]; if (!u) return;
        if (n.status === 'incoming' && !(o && o.status === 'incoming')) toast(u.displayName + ' sent you a friend request');
        if (n.status === 'friend' && o && o.status === 'outgoing') toast(u.displayName + ' accepted your friend request');
      });
      friends = next; renderAll();
    });
    es.addEventListener('room', function (e) { var r = JSON.parse(e.data); rooms[r.id] = r; renderAll(); });
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
