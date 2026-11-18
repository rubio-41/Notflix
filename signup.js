// Sign-up: username + display name + optional picture, sent to the server.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var user = $('username'), disp = $('display'), photo = null, busy = false;
  function srvErr(msg) { var e = $('srvErr'); e.textContent = msg || ''; e.hidden = !msg; }
  if (location.protocol === 'file:') srvErr('This page was opened as a file, so it cannot reach the server. Start the server (node server.js) and open the address it prints, e.g. http://localhost:3000.');
  var U_DEF = '3–20 characters: letters, numbers, dots and underscores.', D_DEF = 'This is what people nearby will see.';
  $('uHint').textContent = U_DEF; $('dHint').textContent = D_DEF;

  function paint() {
    var p = $('preview');
    p.style.backgroundImage = photo ? 'url(' + photo + ')' : '';
    p.textContent = photo ? '' : (disp.value.trim() || user.value.trim() || '?').charAt(0).toUpperCase();
  }
  user.addEventListener('input', function () { user.value = user.value.toLowerCase().replace(/[^a-z0-9._]/g, ''); paint(); });
  disp.addEventListener('input', paint);

  // Shrink the picture to 200px so it stays small on the server.
  $('photo').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f || f.type.indexOf('image/') !== 0) return;
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      var s = Math.min(200 / img.width, 200 / img.height, 1), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      photo = c.toDataURL('image/jpeg', 0.85); URL.revokeObjectURL(url); paint();
    };
    img.src = url;
  });

  function check(box, hint, bad, msg, def) { box.classList.toggle('bad', bad); hint.textContent = bad ? msg : def; return !bad; }
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var u = user.value.trim(), d = disp.value.trim();
    var a = check($('fUser'), $('uHint'), !/^[a-z0-9._]{3,20}$/.test(u), 'Use 3–20 letters, numbers, dots or underscores.', U_DEF);
    var b = check($('fName'), $('dHint'), !d, 'Enter a display name.', D_DEF);
    if (!a || !b) return;
    srvErr(''); busy = true;
    fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, displayName: d, photo: photo }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        busy = false;
        if (!r.ok) {
          if (r.j.field === 'displayName') check($('fName'), $('dHint'), true, r.j.error, D_DEF);
          else check($('fUser'), $('uHint'), true, r.j.error, U_DEF);
          return;
        }
        localStorage.setItem('token', r.j.token);
        location.href = 'chat.html';
      })
      .catch(function () { busy = false; srvErr('Cannot reach the server at ' + location.origin + '. Make sure server.js is running and that you opened the address it printed.'); });
  });
})();
