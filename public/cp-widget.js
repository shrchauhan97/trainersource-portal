// Community Pulse storefront widget. Served from Vercel; included on the BC
// store via a single <script src="..."> in the Script Manager. Hosting it
// remotely (vs pasting the code into BC) avoids BC's script editor hard-
// wrapping long strings inside string literals (which causes SyntaxError
// because JS string literals cannot span lines).
//
// Spec: docs/superpowers/specs/2026-04-26-community-pulse-forum-ingest-design.md
// Reversibility: docs/runbooks/community-pulse-reversibility.md
(function () {
  if (!window.UP_COMMUNITY_PULSE_ENABLED &&
      (typeof localStorage === 'undefined' || localStorage.getItem('UP_COMMUNITY_PULSE_ENABLED') !== '1')) {
    return;
  }
  if (window.UP_COMMUNITY_PULSE_LOADED) return;
  window.UP_COMMUNITY_PULSE_LOADED = true;

  var apiBase = window.UP_PORTAL_BASE || 'https://trainersource-app.vercel.app';

  function init() {
    var path = location.pathname.replace(/^\/+|\/+$/g, '');
    var slug = path.split('/').filter(Boolean).pop();
    if (!slug) return;

    var anchorSel = ['.productView-description', '[data-product-description]', '.productView'].join(',');
    var fallbackSel = ['main', '#main-content', 'body'].join(',');
    var anchor = document.querySelector(anchorSel) || document.querySelector(fallbackSel);
    if (!anchor) return;

    if (document.getElementById('community-pulse')) return;

    var section = document.createElement('section');
    section.id = 'community-pulse';
    section.style.cssText = 'margin: 2rem 0; display: none;';

    var title = document.createElement('h3');
    title.style.cssText = 'font-size: 1.125rem; margin-bottom: 0.5rem;';
    title.textContent = 'What the community is saying';
    section.appendChild(title);

    var grid = document.createElement('div');
    grid.id = 'community-pulse-cards';
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.75rem;';
    section.appendChild(grid);

    var disclaimer = document.createElement('p');
    disclaimer.style.cssText = 'font-size: 0.75rem; color: #6b7280; margin-top: 0.75rem;';
    disclaimer.textContent = 'Community discussion. Not a UP claim. Not medical advice.';
    section.appendChild(disclaimer);

    anchor.parentNode.insertBefore(section, anchor.nextSibling);

    fetch(apiBase + '/api/community-pulse/' + encodeURIComponent(slug))
      .then(function (r) { return r.ok ? r.json() : { cards: [] }; })
      .then(function (data) {
        var cards = (data && data.cards) || [];
        if (cards.length === 0) return;
        section.style.display = 'block';
        cards.forEach(function (c) { grid.appendChild(buildCard(c)); });
      })
      .catch(function () { /* silent */ });
  }

  function buildCard(c) {
    var card = document.createElement('div');
    card.style.cssText = 'border:1px solid #e5e7eb; border-radius:0.5rem; padding:0.75rem; background:#fafafa;';

    var quote = document.createElement('p');
    quote.style.cssText = 'font-size:0.875rem; line-height:1.4; margin:0 0 0.5rem;';
    quote.textContent = String(c.quote || '');
    card.appendChild(quote);

    var link = document.createElement('a');
    var url = String(c.thread_url || '');
    if (/^https?:\/\//i.test(url)) link.setAttribute('href', url);
    else link.setAttribute('href', '#');
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.style.cssText = 'font-size:0.75rem; color:#0369a1;';
    link.textContent = 'Source: ' + String(c.source || 'forum') + ' →';
    card.appendChild(link);

    return card;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
