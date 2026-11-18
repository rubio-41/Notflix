// Chat client. Talks to server.js: profiles, who is online, messages — all live.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var token = null; try { token = localStorage.getItem('token'); } catch (e) {}
  if (!token) { location.replace('index.html'); return; }

  // ---- State ----
  var me = null, users = {}, rooms = {}, recent = {}, unread = {};
  var current = null;          // { kind: 'person'|'room', id }
  var seen = {}, lastOwn = null, expanded = null, thread = [];

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
  function avatar(node, u) {
    var url = u && u.photo ? '/avatar/' + u.id + '?v=' + u.photo : '';
    node.style.backgroundImage = url ? 'url(' + url + ')' : '';
    node.textContent = url ? '' : (u ? u.displayName : '?').charAt(0).toUpperCase();
  }
  function roomAvatar(node, r) { node.style.backgroundImage = ''; node.textContent = r.name.charAt(0).toUpperCase(); }
  function colorFor(u) { return u.status === 'Looking for a conversation' ? 'var(--blue)' : 'var(--green)'; }
  function keyOf(kind, id) { return (kind === 'room' ? 'r:' : 'u:') + id; }
  function others() { return Object.keys(users).map(function (k) { return users[k]; }).filter(function (u) { return u.id !== me.id; }); }
  function onlineOthers() { return others().filter(function (u) { return u.online; }).sort(function (a, b) { return a.displayName.localeCompare(b.displayName); }); }
  function allRooms() { return Object.keys(rooms).map(function (k) { return rooms[k]; }); }
  function personSub(u) { return u.online ? u.status : 'Offline'; }

  // ---- Which pane is showing: map | empty | chat ----
  function setView(v) {
    ['map', 'empty', 'chat'].forEach(function (k) { $('v-' + k).classList.toggle('on', k === v); });
    $('tabMap').setAttribute('aria-pressed', v === 'map');
    $('tabChats').setAttribute('aria-pressed', v === 'empty');
    if (v !== 'chat') current = null;
    $('app').classList.add('chat-open');            // phones only (see CSS)
    renderAll();
  }

  // ---- Sidebar ----
  function badge(key) { return unread[key] ? el('span', 'badge', unread[key] > 99 ? '99+' : unread[key]) : null; }
  function makeRow(kind, item) {
    var sel = current && current.kind === kind && current.id === item.id;
    var b = el('button', 'row' + (sel ? ' sel' : ''));
    var a = el('span', 'av'); if (kind === 'room') roomAvatar(a, item); else avatar(a, item);
    var t = el('span'); t.appendChild(el('b', '', kind === 'room' ? item.name : item.displayName));
    t.appendChild(el('small', '', kind === 'room' ? item.desc : personSub(item)));
    b.appendChild(a); b.appendChild(t);
    var bd = badge(keyOf(kind, item.id)); if (bd) b.appendChild(bd);
    b.onclick = function () { openChat(kind, item.id); };
    return b;
  }
  function renderSide() {
    var ppl = onlineOthers(), rm = allRooms();
    $('cardPeople').hidden = expanded === 'rooms';
    $('cardRooms').hidden = expanded === 'people';
    $('cardPeople').classList.toggle('grow', expanded === 'people');
    $('cardRooms').classList.toggle('grow', expanded === 'rooms');
    var pb = $('people'); pb.innerHTML = '';
    if (!ppl.length) pb.appendChild(el('div', 'hintrow', 'Nobody else is online yet. Open this page on another device and create a profile.'));
    (expanded === 'people' ? ppl : ppl.slice(0, 3)).forEach(function (u) { pb.appendChild(makeRow('person', u)); });
    var rb = $('rooms'); rb.innerHTML = '';
    (expanded === 'rooms' ? rm : rm.slice(0, 3)).forEach(function (r) { rb.appendChild(makeRow('room', r)); });
    $('morePeople').hidden = ppl.length <= 3 && expanded !== 'people';
    $('moreRooms').hidden = rm.length <= 3 && expanded !== 'rooms';
    $('morePeople').textContent = expanded === 'people' ? 'Show less' : 'More…';
    $('moreRooms').textContent = expanded === 'rooms' ? 'Show less' : 'More…';
    renderNewRoom();
  }
  function renderNewRoom() {
    var box = $('newRoomBox'); box.innerHTML = '';
    if (expanded !== 'rooms') return;
    var f = el('form', 'newroom'), i = el('input'); i.placeholder = 'New conversation name'; i.maxLength = 24; i.setAttribute('aria-label', 'New conversation name');
    var b = el('button', '', 'Create'); b.type = 'submit'; f.appendChild(i); f.appendChild(b);
    f.onsubmit = function (e) {
      e.preventDefault(); var n = i.value.trim(); if (!n) return;
      api('/api/rooms', { method: 'POST', body: { name: n } }).then(function (r) { rooms[r.id] = r; openChat('room', r.id); }).catch(function (er) { i.value = ''; i.placeholder = er.message; });
    };
    box.appendChild(f);
  }
  $('morePeople').onclick = function () { expanded = expanded === 'people' ? null : 'people'; renderSide(); };
  $('moreRooms').onclick = function () { expanded = expanded === 'rooms' ? null : 'rooms'; renderSide(); };
  $('showList').onclick = function () { expanded = 'people'; renderSide(); };

  // ---- Map (illustrative layout: each person always lands in the same spot) ----
  function spot(u) {
    var h = 0, s = u.id; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var x = 8 + (h % 84), y = 26 + ((h >>> 8) % 58);
    if (Math.abs(x - 50) < 8 && Math.abs(y - 50) < 10) x = x < 50 ? 30 : 70;
    return [x, y];
  }
  function renderPins() {
    var box = $('pins'); box.innerHTML = '';
    onlineOthers().forEach(function (u) {
      var p = spot(u), b = el('button', 'pin'); b.style.left = p[0] + '%'; b.style.top = p[1] + '%';
      b.style.setProperty('--c', colorFor(u)); b.title = u.displayName + ' — ' + u.status; b.setAttribute('aria-label', u.displayName + ', ' + u.status);
      var a = el('span', 'av'); avatar(a, u); b.appendChild(a); b.onclick = function () { openChat('person', u.id); };
      box.appendChild(b);
    });
  }
  function renderEmpty() {
    var card = $('emptyCard'); card.querySelectorAll('.row').forEach(function (r) { r.remove(); });
    var list = Object.keys(recent).map(function (id) { return users[id]; }).filter(Boolean);
    card.querySelector('h3').textContent = list.length ? 'Your conversations' : 'Nothing here';
    card.querySelector('p').textContent = list.length ? 'Pick up where you left off.' : 'You have no conversations yet. Start one!';
    list.forEach(function (u) { card.appendChild(makeRow('person', u)); });
  }
  function renderAll() { renderSide(); renderPins(); renderEmpty(); renderHeader(); }

  $('tabMap').onclick = function () { setView('map'); };
  $('tabChats').onclick = function () { setView('empty'); };
  $('home').onclick = $('newMsg').onclick = function () { setView('map'); };
  $('mback').onclick = function () { current = null; $('app').classList.remove('chat-open'); renderSide(); };

  // ---- Conversation ----
  function renderHeader() {
    if (!current) return;
    var item = current.kind === 'room' ? rooms[current.id] : users[current.id]; if (!item) return;
    if (current.kind === 'room') { roomAvatar($('cAv'), item); $('cName').textContent = item.name; $('cSub').textContent = others().filter(function (u) { return u.online; }).length + 1 + ' people online'; }
    else { avatar($('cAv'), item); $('cName').textContent = item.displayName; $('cSub').textContent = personSub(item); }
  }
  function stampText(ts) {
    var d = new Date(ts), t = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' + t;
  }
  function bubble(m) {
    var mine = m.from === me.id, d = el('div', 'msg' + (mine ? ' me' : ''));
    if (current.kind === 'room' && !mine) d.appendChild(el('span', 'by', users[m.from] ? users[m.from].displayName : 'Someone'));
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
    setView('chat');
    var q = kind === 'room' ? 'room=' + id : 'with=' + id, mine = current;
    api('/api/history?' + q).then(function (list) {
      if (current !== mine) return;
      var started = false;
      if (kind === 'person') {                                  // someone you haven't replied to yet
        var theirs = list.some(function (m) { return m.from === id; }), yours = list.some(function (m) { return m.from === me.id; });
        if (theirs && !yours) started = true;
      }
      if (started) {
        var name = users[id] ? users[id].displayName : 'This person';
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
      if (c.kind === 'person') { recent[c.id] = true; }
    }).catch(function (er) { $('text').value = v; $('text').placeholder = er.message; });
  };

  // ---- Profile menu ----
  $('profileBtn').onclick = function (e) {
    e.stopPropagation(); var m = $('menu'); m.hidden = !m.hidden;
    $('menuWho').innerHTML = ''; $('menuWho').appendChild(document.createTextNode(me.displayName));
    $('menuWho').appendChild(el('small', '', '@' + me.username));
    m.querySelectorAll('button[data-status]').forEach(function (b) { b.style.fontWeight = b.dataset.status === me.status ? '700' : '400'; });
  };
  document.addEventListener('click', function () { $('menu').hidden = true; });
  $('menu').querySelectorAll('button[data-status]').forEach(function (b) {
    b.onclick = function () { api('/api/status', { method: 'POST', body: { status: b.dataset.status } }); };
  });
  $('signout').onclick = signOut;

  // ---- Live updates from the server ----
  function connect() {
    var es = new EventSource('/api/events?token=' + encodeURIComponent(token));
    es.addEventListener('init', function (e) {
      var d = JSON.parse(e.data); me = d.me; users = {}; d.users.forEach(function (u) { users[u.id] = u; });
      rooms = {}; d.rooms.forEach(function (r) { rooms[r.id] = r; });
      recent = {}; d.recent.forEach(function (id) { recent[id] = true; });
      avatar($('meAv'), me); $('loading').hidden = true; $('conn').hidden = true; renderAll();
    });
    es.addEventListener('user', function (e) { var u = JSON.parse(e.data); users[u.id] = u; if (me && u.id === me.id) { me = u; avatar($('meAv'), me); } renderAll(); });
    es.addEventListener('presence', function (e) { var p = JSON.parse(e.data); if (users[p.id]) users[p.id].online = p.online; renderAll(); });
    es.addEventListener('room', function (e) { var r = JSON.parse(e.data); rooms[r.id] = r; renderSide(); });
    es.addEventListener('message', function (e) {
      var m = JSON.parse(e.data), kind = m.room ? 'room' : 'person';
      var id = m.room ? m.room : (m.from === me.id ? m.to : m.from), key = keyOf(kind, id);
      if (kind === 'person') recent[id] = true;
      if (current && current.kind === kind && current.id === id) { addMessage(m); $('msgs').scrollTop = $('msgs').scrollHeight; }
      else if (m.from !== me.id) { unread[key] = (unread[key] || 0) + 1; }
      renderAll();
    });
    es.addEventListener('status', function (e) {
      var s = JSON.parse(e.data); if (lastOwn && lastOwn.id === s.id) lastOwn.el.textContent = s.status === 'delivered' ? 'Delivered' : 'Sent';
    });
    es.onerror = function () { $('conn').hidden = false; };
  }
  connect();
})();
