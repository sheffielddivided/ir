/* ------------------------------------------------------------------
   CMS light – in-page editor for the IR book.
   Edits the <article> of the current page and commits the change back
   to GitHub via the REST Contents API.

   Activation (hidden from normal readers):
     - add ?edit (or ?edit=1) to the URL, or
     - press Ctrl/Cmd + Shift + E
   The GitHub token is entered at runtime, kept only in sessionStorage,
   and is never written to the repo.
------------------------------------------------------------------- */
(function () {
  'use strict';

  var CONFIG = { owner: 'sheffielddivided', repo: 'ir', branch: 'main' };
  var TOKEN_KEY = 'ir_gh_token';

  var article =
    document.querySelector('main.content > article') ||
    document.querySelector('article');
  if (!article) return; // nothing editable on this page

  function currentPath() {
    var p = location.pathname.split('/').pop();
    return p || 'index.html';
  }

  /* ---------- styles ---------- */
  var css = [
    '#ir-editbtn{display:none}',
    'body.ir-can-edit #ir-editbtn{display:inline-flex;align-items:center;gap:6px;',
      'font:600 13px var(--sans);cursor:pointer;border:1px solid var(--border);',
      'background:var(--bg-soft);color:var(--text);border-radius:8px;padding:6px 12px}',
    'body.ir-can-edit #ir-editbtn:hover{border-color:var(--brand-2)}',
    'body.ir-editing #ir-editbtn{background:var(--brand);color:#fff;border-color:var(--brand)}',
    'body.ir-editing main.content>article,body.ir-editing article{',
      'outline:2px dashed var(--brand-2);outline-offset:14px;border-radius:4px}',
    'body.ir-editing{padding-bottom:64px}',
    /* toolbar */
    '#ir-toolbar{position:fixed;left:0;right:0;bottom:0;z-index:1000;display:none;',
      'gap:8px;align-items:center;flex-wrap:wrap;padding:10px 16px;',
      'background:var(--bg);border-top:1px solid var(--border);',
      'box-shadow:0 -4px 16px rgba(0,0,0,.08);font-family:var(--sans)}',
    'body.ir-editing #ir-toolbar{display:flex}',
    '#ir-toolbar .grp{display:flex;gap:4px;align-items:center}',
    '#ir-toolbar .sep{width:1px;height:24px;background:var(--border);margin:0 4px}',
    '#ir-toolbar button{font:600 13px var(--sans);cursor:pointer;border:1px solid var(--border);',
      'background:var(--bg-soft);color:var(--text);border-radius:6px;padding:6px 10px}',
    '#ir-toolbar button:hover{border-color:var(--brand-2)}',
    '#ir-toolbar button.primary{background:var(--brand);color:#fff;border-color:var(--brand)}',
    '#ir-toolbar button.primary:disabled{opacity:.55;cursor:default}',
    '#ir-toolbar .spacer{flex:1 1 auto}',
    '#ir-toolbar .path{font:600 12px var(--sans);color:var(--muted)}',
    '#ir-status{font:13px var(--sans);min-width:90px}',
    '#ir-status.ok{color:var(--aker-bd)}#ir-status.err{color:#c0392b}#ir-status.busy{color:var(--muted)}',
    /* auth modal */
    '#ir-auth{position:fixed;inset:0;z-index:1100;display:none;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,.45);padding:16px;font-family:var(--sans)}',
    '#ir-auth.show{display:flex}',
    '#ir-auth .card{background:var(--bg);color:var(--text);border:1px solid var(--border);',
      'border-radius:12px;max-width:440px;width:100%;padding:22px 24px;box-shadow:0 10px 40px rgba(0,0,0,.3)}',
    '#ir-auth h3{margin:0 0 6px;font-size:17px}',
    '#ir-auth p{margin:0 0 14px;font-size:13px;line-height:1.5;color:var(--muted)}',
    '#ir-auth label{display:block;font-size:12px;font-weight:700;margin:0 0 4px}',
    '#ir-auth input{width:100%;box-sizing:border-box;font:14px var(--sans);padding:9px 11px;',
      'border:1px solid var(--border);border-radius:8px;background:var(--bg-soft);color:var(--text)}',
    '#ir-auth .row{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}',
    '#ir-auth button{font:600 13px var(--sans);cursor:pointer;border-radius:8px;padding:9px 16px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)}',
    '#ir-auth button.primary{background:var(--brand);color:#fff;border-color:var(--brand)}',
    '#ir-auth .note{font-size:12px;color:var(--muted);margin-top:12px;line-height:1.45}'
  ].join('');
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- token storage ---------- */
  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  /* ---------- UTF-8 safe base64 ---------- */
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(b64) { return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, '')))); }

  /* ---------- GitHub REST ---------- */
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers || {});
    return fetch('https://api.github.com' + path, opts);
  }
  function contentsUrl(path) {
    return '/repos/' + CONFIG.owner + '/' + CONFIG.repo + '/contents/' + encodeURIComponent(path);
  }

  /* ---------- light cleanup of edited HTML ---------- */
  function cleanHTML(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    // strip inline styles and editing artifacts, keep structure (incl. callout divs)
    tmp.querySelectorAll('[style]').forEach(function (el) { el.removeAttribute('style'); });
    tmp.querySelectorAll('[contenteditable]').forEach(function (el) { el.removeAttribute('contenteditable'); });
    // drop trailing empty <br> some browsers leave behind
    tmp.querySelectorAll('br').forEach(function (br) {
      if (!br.nextSibling && br.parentNode && br.parentNode.lastChild === br) br.remove();
    });
    return tmp.innerHTML.trim();
  }

  /* ---------- build UI ---------- */
  var editBtn = document.createElement('button');
  editBtn.id = 'ir-editbtn';
  editBtn.type = 'button';
  editBtn.title = 'Rediger denne siden (Ctrl/Cmd+Shift+E)';
  editBtn.innerHTML = '\u270E Rediger';
  var topRight = document.querySelector('.topbar-right');
  if (topRight) topRight.insertBefore(editBtn, topRight.firstChild);
  else document.body.appendChild(editBtn);

  var toolbar = document.createElement('div');
  toolbar.id = 'ir-toolbar';
  toolbar.innerHTML =
    '<div class="grp">' +
      '<button type="button" data-cmd="formatBlock" data-val="h2" title="Overskrift">H2</button>' +
      '<button type="button" data-cmd="formatBlock" data-val="p" title="Avsnitt">\u00B6</button>' +
      '<span class="sep"></span>' +
      '<button type="button" data-cmd="bold" title="Fet"><b>B</b></button>' +
      '<button type="button" data-cmd="italic" title="Kursiv"><i>I</i></button>' +
      '<button type="button" data-cmd="insertUnorderedList" title="Punktliste">&bull; Liste</button>' +
      '<button type="button" data-cmd="createLink" title="Lenke">\u{1F517} Lenke</button>' +
      '<button type="button" data-cmd="removeFormat" title="Fjern formatering">\u2715</button>' +
    '</div>' +
    '<span class="sep"></span>' +
    '<span class="path"></span>' +
    '<div class="spacer"></div>' +
    '<span id="ir-status"></span>' +
    '<button type="button" id="ir-logout" title="Glem token">Logg ut</button>' +
    '<button type="button" id="ir-cancel">Avbryt</button>' +
    '<button type="button" id="ir-save" class="primary">Lagre</button>';
  document.body.appendChild(toolbar);
  toolbar.querySelector('.path').textContent = currentPath();

  var statusEl = toolbar.querySelector('#ir-status');
  function status(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = kind || '';
  }

  /* auth modal */
  var auth = document.createElement('div');
  auth.id = 'ir-auth';
  auth.innerHTML =
    '<div class="card">' +
      '<h3>Koble til GitHub</h3>' +
      '<p>For \u00E5 lagre endringer trenger editoren et GitHub-token med skrivetilgang ' +
        '(<em>Contents: Read and write</em>) til <code>' + CONFIG.owner + '/' + CONFIG.repo + '</code>.</p>' +
      '<label for="ir-token">Personal access token</label>' +
      '<input id="ir-token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_\u2026 eller ghp_\u2026">' +
      '<div class="note">Tokenet lagres kun i denne fanen (sessionStorage) og forsvinner n\u00E5r du lukker den. ' +
        'Det skrives aldri til nettsiden eller repoet.</div>' +
      '<div class="row">' +
        '<button type="button" id="ir-auth-cancel">Avbryt</button>' +
        '<button type="button" id="ir-auth-ok" class="primary">Koble til</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(auth);
  var tokenInput = auth.querySelector('#ir-token');

  function showAuth() {
    return new Promise(function (resolve) {
      tokenInput.value = getToken();
      auth.classList.add('show');
      tokenInput.focus();
      function close(ok) {
        auth.classList.remove('show');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        tokenInput.removeEventListener('keydown', onKey);
        resolve(ok);
      }
      function onOk() {
        var t = tokenInput.value.trim();
        if (!t) { tokenInput.focus(); return; }
        setToken(t);
        close(true);
      }
      function onCancel() { close(false); }
      function onKey(e) { if (e.key === 'Enter') onOk(); else if (e.key === 'Escape') onCancel(); }
      var okBtn = auth.querySelector('#ir-auth-ok');
      var cancelBtn = auth.querySelector('#ir-auth-cancel');
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      tokenInput.addEventListener('keydown', onKey);
    });
  }

  /* ---------- edit mode ---------- */
  var editing = false;

  function revealEditing() {
    document.body.classList.add('ir-can-edit');
  }

  function enterEdit() {
    revealEditing();
    if (editing) return;
    editing = true;
    document.body.classList.add('ir-editing');
    article.setAttribute('contenteditable', 'true');
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
    } catch (e) {}
    article.focus();
    status('', '');
  }

  function exitEdit(reloadToDiscard) {
    editing = false;
    article.removeAttribute('contenteditable');
    document.body.classList.remove('ir-editing');
    if (reloadToDiscard) location.reload();
  }

  function exec(cmd, val) {
    if (cmd === 'createLink') {
      var url = prompt('Lenke til (URL):', 'https://');
      if (!url) return;
      document.execCommand('createLink', false, url);
    } else if (cmd === 'formatBlock') {
      document.execCommand('formatBlock', false, '<' + val + '>');
    } else {
      document.execCommand(cmd, false, null);
    }
    article.focus();
  }

  /* ---------- save ---------- */
  var saveBtn = toolbar.querySelector('#ir-save');

  function save() {
    if (!getToken()) {
      showAuth().then(function (ok) { if (ok) save(); });
      return;
    }
    var path = currentPath();
    var editedInner = cleanHTML(article.innerHTML);
    saveBtn.disabled = true;
    status('Lagrer \u2026', 'busy');

    api(contentsUrl(path) + '?ref=' + CONFIG.branch)
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('Mangler tilgang \u2013 sjekk at tokenet har skrivetilgang.');
        if (!r.ok) throw new Error('Kunne ikke hente filen (' + r.status + ').');
        return r.json();
      })
      .then(function (file) {
        var raw = b64decode(file.content);
        var next = raw.replace(/<article>[\s\S]*?<\/article>/, '<article>' + editedInner + '</article>');
        if (next === raw) throw new Error('Fant ikke <article> i filen.');
        return api(contentsUrl(path), {
          method: 'PUT',
          body: JSON.stringify({
            message: 'Rediger ' + path + ' via editor',
            content: b64encode(next),
            sha: file.sha,
            branch: CONFIG.branch
          })
        });
      })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error((j && j.message) || ('Lagring feilet (' + r.status + ').'));
          return j;
        });
      })
      .then(function () {
        status('Lagret \u2713', 'ok');
        saveBtn.disabled = false;
        exitEdit(false); // keep current DOM, leave edit mode
        setTimeout(function () { status('', ''); }, 4000);
      })
      .catch(function (err) {
        status(err.message || 'Noe gikk galt', 'err');
        saveBtn.disabled = false;
      });
  }

  /* ---------- wire up ---------- */
  editBtn.addEventListener('click', function () {
    if (editing) exitEdit(true); else enterEdit();
  });
  toolbar.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-cmd]');
    if (b) { e.preventDefault(); exec(b.getAttribute('data-cmd'), b.getAttribute('data-val')); }
  });
  toolbar.querySelector('#ir-save').addEventListener('click', save);
  toolbar.querySelector('#ir-cancel').addEventListener('click', function () { exitEdit(true); });
  toolbar.querySelector('#ir-logout').addEventListener('click', function () {
    clearToken(); status('Token glemt', 'busy'); setTimeout(function () { status('', ''); }, 2500);
  });

  document.addEventListener('keydown', function (e) {
    var key = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'e') {
      e.preventDefault();
      if (editing) exitEdit(true); else enterEdit();
    }
  });

  // warn before leaving with unsaved edits
  window.addEventListener('beforeunload', function (e) {
    if (editing) { e.preventDefault(); e.returnValue = ''; }
  });

  // reveal the button automatically when ?edit is present
  if (/[?&]edit\b/.test(location.search)) revealEditing();
})();
