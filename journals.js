/* Art Adventurer's Journal section on the Portfolio page.
   Content comes from content/journals.json (editable on the admin page). */
(function () {
  const root = document.getElementById('journals-section');      // journal.html: the full page
  const projects = document.getElementById('projects-container'); // portfolio.html: just the cover card
  if (!root && !projects) return;

  const esc = s => String(s ?? '').replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
  const src = u => (/^(\/|https:)/.test(u || '') ? u : '');

  fetch('content/journals.json', { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d || !d.title) return;
      if (root) render(d);
      else addCard(d);
    })
    .catch(() => {});

  // On journal.html, fill in the logo / LinkedIn links like the other pages do
  if (root && typeof updateSiteWide === 'function') {
    fetch('content/site-config.json').then(r => r.json()).then(updateSiteWide).catch(() => {});
  }

  // Portfolio page: a cover card in the same style as the other projects,
  // placed right after the first (featured) project once those have loaded.
  function addCard(d) {
    const card = document.createElement('div');
    card.className = 'project-card jr-card';
    card.dataset.order = '1';   // extra cards sit after the first project, in this order
    card.innerHTML = `
      <a class="project-card-image-wrapper" href="journal.html" aria-label="${esc(d.title)}: learn more">
        <img src="${esc(src(d.cover) || src(d.hero))}" alt="${esc(d.title)} cover" loading="lazy">
      </a>
      <div class="project-card-content">
        <h3 class="project-card-title">${esc(d.title)}</h3>
        ${d.subtitle ? `<p class="project-card-subtitle">${esc(d.subtitle)}</p>` : ''}
        ${d.cardDescription ? `<p class="project-card-description">${esc(d.cardDescription)}</p>` : ''}
        ${(d.tools || []).length ? `<div class="project-card-tools">${d.tools.map(t => `<span class="tool-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <a href="journal.html" class="btn btn-primary">Learn More</a>
      </div>`;
    const place = () => {
      const first = projects.querySelector('.project-card:not([data-order])');
      if (!first) return false;
      let anchor = first;
      projects.querySelectorAll('.project-card[data-order]').forEach(el => {
        if (+el.dataset.order < +card.dataset.order) anchor = el;
      });
      anchor.after(card);
      requestAnimationFrame(() => setTimeout(() => card.classList.add('visible'), 150));
      return true;
    };
    if (place()) return;
    const mo = new MutationObserver(() => { if (place()) mo.disconnect(); });
    mo.observe(projects, { childList: true });
    // if there are no projects at all, show the card on its own
    setTimeout(() => { if (!card.isConnected) { mo.disconnect(); projects.appendChild(card); card.classList.add('visible'); } }, 3000);
  }

  function render(d) {
    const editions = (d.editions || []).filter(e => e && e.name);
    const gallery = (d.gallery || []).filter(g => g && src(g.image));
    root.innerHTML = `
      <div class="container">
        <a class="jr-back" href="portfolio.html">&larr; Back to Portfolio</a>
        <header class="jr-head">
          ${d.eyebrow ? `<span class="jr-eyebrow">${esc(d.eyebrow)}</span>` : ''}
          <h1 class="jr-title">${esc(d.title)}</h1>
          ${d.subtitle ? `<p class="jr-subtitle">${esc(d.subtitle)}</p>` : ''}
          ${d.client ? `<p class="jr-client">Client: <strong>${esc(d.client)}</strong></p>` : ''}
        </header>

        ${src(d.hero) ? `<figure class="jr-hero" data-jr-group="hero">
          <img src="${esc(d.hero)}" alt="${esc(d.title)}: the four journals" loading="lazy">
        </figure>` : ''}

        ${(d.stats || []).length ? `<ul class="jr-stats">${d.stats.map(s => `
          <li><span class="jr-stat-value">${esc(s.value)}</span><span class="jr-stat-label">${esc(s.label)}</span></li>`).join('')}
        </ul>` : ''}

        ${(d.intro || []).length ? `<div class="jr-intro">${d.intro.map(p => `<p>${esc(p)}</p>`).join('')}</div>` : ''}

        ${editions.length ? `
        <h3 class="jr-subhead">Four editions, one adventure</h3>
        <div class="jr-editions" data-jr-group="editions">
          ${editions.map(e => `
          <article class="jr-edition" style="--ed:${/^#[0-9a-f]{3,8}$/i.test(e.color || '') ? e.color : '#7B1E2E'}">
            ${src(e.cover) ? `<button type="button" class="jr-cover" aria-label="View the ${esc(e.name)} cover larger">
              <img src="${esc(e.cover)}" alt="${esc(e.name)} cover" loading="lazy">
            </button>` : ''}
            <div class="jr-edition-body">
              <h4 class="jr-edition-name">${esc(e.name)}</h4>
              ${e.tagline ? `<p class="jr-edition-tagline">${esc(e.tagline)}</p>` : ''}
              ${e.description ? `<p class="jr-edition-desc">${esc(e.description)}</p>` : ''}
            </div>
          </article>`).join('')}
        </div>` : ''}

        ${gallery.length ? `
        <h3 class="jr-subhead">Look inside</h3>
        <div class="jr-gallery" data-jr-group="gallery">
          ${gallery.map(g => `
          <button type="button" class="jr-thumb" aria-label="View larger: ${esc(g.caption || d.title)}">
            <img src="${esc(g.image)}" alt="${esc(g.caption || d.title)}" loading="lazy">
          </button>`).join('')}
        </div>` : ''}

        <div class="jr-cta">
          <p>Want learning materials like these for your team or museum?</p>
          <a href="contact.html" class="btn btn-primary">Let's talk</a>
        </div>
      </div>`;
    document.title = `${d.title} | Portfolio`;
    document.querySelector('.navbar-nav a[href="portfolio.html"]')?.classList.add('active');
    root.hidden = false;
    setupLightbox();
  }

  // Simple lightbox: click any image in a group, then use the arrows or keyboard
  function setupLightbox() {
    const box = document.createElement('div');
    box.className = 'jr-lightbox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Image viewer');
    box.innerHTML = `
      <button type="button" class="jr-lb-close" aria-label="Close">&times;</button>
      <button type="button" class="jr-lb-nav jr-lb-prev" aria-label="Previous image">&#8249;</button>
      <figure><img alt=""><figcaption></figcaption></figure>
      <button type="button" class="jr-lb-nav jr-lb-next" aria-label="Next image">&#8250;</button>`;
    document.body.appendChild(box);
    const img = box.querySelector('img');
    const cap = box.querySelector('figcaption');
    let group = [], i = 0, opener = null;

    const show = n => {
      i = (n + group.length) % group.length;
      img.src = group[i].src;
      img.alt = group[i].alt;
      cap.textContent = group[i].alt;
      box.querySelectorAll('.jr-lb-nav').forEach(b => { b.hidden = group.length < 2; });
    };
    const close = () => { box.hidden = true; document.body.style.overflow = ''; opener && opener.focus(); };

    root.addEventListener('click', e => {
      const hit = e.target.closest('.jr-cover, .jr-thumb, .jr-hero');
      if (!hit) return;
      const g = hit.closest('[data-jr-group]');
      group = [...g.querySelectorAll('img')];
      opener = hit;
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      show(group.indexOf(hit.querySelector('img') || hit));
      box.querySelector('.jr-lb-close').focus();
    });
    box.querySelector('.jr-lb-close').addEventListener('click', close);
    box.querySelector('.jr-lb-prev').addEventListener('click', () => show(i - 1));
    box.querySelector('.jr-lb-next').addEventListener('click', () => show(i + 1));
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    });
  }
})();
