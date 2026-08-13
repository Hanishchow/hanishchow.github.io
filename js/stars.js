/* ============================================================
   CHOW.DEV OS — live star counts on the builds list.

   One unauthenticated GitHub API call per repo, cached for the session.
   Anonymous callers get 60 requests an hour per address, so the cache is not
   an optimisation, it is what keeps a visitor who scrolls up and down from
   burning the allowance.

   Everything degrades quietly: rate-limited, offline, repo renamed, or the
   API simply down, and the control stays exactly as it is in the markup — a
   link to the stargazers page reading "star". Nothing here can leave a broken
   number on the page.
   ============================================================ */
(function () {
  'use strict';

  var nodes = [].slice.call(document.querySelectorAll('.star[data-repo]'));
  if (!nodes.length) return;

  var KEY = 'cd_stars';
  var cache = {};
  try { cache = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) {}

  function paint(el, n) {
    /* zero is not worth printing — the control keeps saying "star" instead,
       which is a request rather than a scoreboard */
    if (!(n > 0)) return;
    var em = el.querySelector('em');
    if (em) em.textContent = String(n);
    el.style.opacity = '';
  }

  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
  }

  nodes.forEach(function (el) {
    var repo = el.getAttribute('data-repo');
    if (!repo) return;

    if (Object.prototype.hasOwnProperty.call(cache, repo)) { paint(el, cache[repo]); return; }

    fetch('https://api.github.com/repos/' + repo, {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || typeof j.stargazers_count !== 'number') return;
        cache[repo] = j.stargazers_count;
        save();
        paint(el, j.stargazers_count);
      })
      .catch(function () { /* offline or blocked — the markup already reads */ });
  });
})();
