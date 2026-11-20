// Create an account or log in. Talks to server.js.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var user = $('username'), disp = $('display'), pass = $('password'), photo = null, busy = false, mode = 'signup';
  var DEF = { u: '3–20 characters: letters, numbers, dots and underscores.', d: 'This is what people nearby will see.', p: 'Use at least 8 characters.' };
  function srvErr(msg) { var e = $('srvErr'); e.textContent = msg || ''; e.hidden = !msg; }
  function mark(box, hint, msg, def) { box.classList.toggle('bad', !!msg); hint.textContent = msg || def; return !msg; }
  function clearHints() { mark($('fUser'), $('uHint'), '', mode === 'signup' ? DEF.u : ''); mark($('fName'), $('dHint'), '', DEF.d); mark($('fPass'), $('pHint'), '', mode === 'signup' ? DEF.p : ''); }

  function setMode(m) {
    mode = m; $('form').dataset.mode = m;
    $('modeSignup').setAttribute('aria-pressed', m === 'signup'); $('modeLogin').setAttribute('aria-pressed', m === 'login');
    $('title').textContent = m === 'signup' ? 'Create your profile' : 'Welcome back';
    $('submit').textContent = m === 'signup' ? 'Create account' : 'Log in';
    pass.autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    srvErr(''); clearHints();
  }
  $('modeSignup').onclick = function () { setMode('signup'); }; $('modeLogin').onclick = function () { setMode('login'); };
  if (location.protocol === 'file:') srvErr('This page was opened as a file, so it cannot reach the server. Start the server (node server.js) and open the address it prints, e.g. http://localhost:3000.');

  function paint() {
    var p = $('preview'); p.style.backgroundImage = photo ? 'url(' + photo + ')' : '';
    p.textContent = photo ? '' : (disp.value.trim() || user.value.trim() || '?').charAt(0).toUpperCase();
  }
  user.addEventListener('input', function () { user.value = user.value.toLowerCase().replace(/[^a-z0-9._]/g, ''); paint(); });
  disp.addEventListener('input', paint);

  // Shrink the picture to 200px so it stays small on the server.
  $('photo').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f || f.type.indexOf('image/') !== 0) return;
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      var s = Math.min(200 / img.width, 200 / img.height, 1), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      photo = c.toDataURL('image/jpeg', 0.85); URL.revokeObjectURL(url); paint();
    };
    img.src = url;
  });

  $('form').addEventListener('submit', function (e) {
    e.preventDefault(); if (busy) return; srvErr('');
    var u = user.value.trim(), d = disp.value.trim(), p = pass.value, ok = true;
    ok = mark($('fUser'), $('uHint'), /^[a-z0-9._]{3,20}$/.test(u) ? '' : 'Use 3–20 letters, numbers, dots or underscores.', mode === 'signup' ? DEF.u : '') && ok;
    if (mode === 'signup') ok = mark($('fName'), $('dHint'), d ? '' : 'Enter a display name.', DEF.d) && ok;
    ok = mark($('fPass'), $('pHint'), (mode === 'signup' ? p.length >= 8 : p.length > 0) ? '' : (mode === 'signup' ? 'Use at least 8 characters.' : 'Enter your password.'), mode === 'signup' ? DEF.p : '') && ok;
    if (!ok) return;
    busy = true;
    fetch(mode === 'signup' ? '/api/signup' : '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'signup' ? { username: u, displayName: d, password: p, photo: photo } : { username: u, password: p }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        busy = false;
        if (!r.ok) {
          var f = r.j.field;
          if (f === 'displayName') mark($('fName'), $('dHint'), r.j.error, DEF.d);
          else if (f === 'password') mark($('fPass'), $('pHint'), r.j.error, DEF.p);
          else if (f === 'username') mark($('fUser'), $('uHint'), r.j.error, DEF.u);
          else srvErr(r.j.error);
          return;
        }
        localStorage.setItem('token', r.j.token); location.href = 'chat.html';
      })
      .catch(function () { busy = false; srvErr('Cannot reach the server at ' + location.origin + '. Make sure server.js is running and that you opened the address it printed.'); });
  });
  setMode('signup');
})();
