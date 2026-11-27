/* Case-study projects kept in their own files (content/cases.json + content/cases/<id>.json).
   portfolio.html: adds a cover card for each case, after the first project and the journal card.
   case.html?c=<id>: renders the full case study. */
(function () {
  const page = document.getElementById('case-study');
  const projects = document.getElementById('projects-container');
  if (!page && !projects) return;

  const esc = s => String(s ?? '').replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
  const src = u => (/^(\/|https:)/.test(u || '') ? u : '');
  const okId = id => /^[a-z0-9-]+$/.test(id || '');
  const load = id => fetch(`content/cases/${id}.json`, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null));

  if (projects) {
    fetch('content/cases.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then(list => (list?.cases || []).filter(okId).forEach((id, i) =>
        load(id).then(c => c && c.title && addCard(c, id, 2 + i))))
      .catch(() => {});
  } else {
    const id = new URLSearchParams(location.search).get('c');
    if (okId(id)) load(id).then(c => (c && c.title ? render(c) : notFound())).catch(notFound);
    else notFound();
    if (typeof updateSiteWide === 'function') {
      fetch('content/site-config.json').then(r => r.json()).then(updateSiteWide).catch(() => {});
    }
  }

  function addCard(c, id, order) {
    const href = `case.html?c=${encodeURIComponent(id)}`;
    const card = document.createElement('div');
    card.className = 'project-card cs-card';
    card.dataset.order = String(order);
    card.innerHTML = `
      <a class="project-card-image-wrapper" href="${href}" aria-label="${esc(c.title)}: learn more">
        <img src="${esc(src(c.cover) || src(c.hero))}" alt="${esc(c.title)} cover" loading="lazy">
      </a>
      <div class="project-card-content">
        <h3 class="project-card-title">${esc(c.title)}</h3>
        ${c.subtitle ? `<p class="project-card-subtitle">${esc(c.subtitle)}</p>` : ''}
        ${c.cardDescription ? `<p class="project-card-description">${esc(c.cardDescription)}</p>` : ''}
        ${(c.tools || []).length ? `<div class="project-card-tools">${c.tools.map(t => `<span class="tool-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <a href="${href}" class="btn btn-primary">Learn More</a>
      </div>`;
    const place = () => {
      const first = projects.querySelector('.project-card:not([data-order])');
      if (!first) return false;
      let anchor = first;
      projects.querySelectorAll('.project-card[data-order]').forEach(el => {
        if (+el.dataset.order < order) anchor = el;
      });
      anchor.after(card);
      setTimeout(() => card.classList.add('visible'), 150);
      return true;
    };
    if (place()) return;
    const mo = new MutationObserver(() => { if (place()) mo.disconnect(); });
    mo.observe(projects, { childList: true });
    setTimeout(() => { if (!card.isConnected) { mo.disconnect(); projects.appendChild(card); card.classList.add('visible'); } }, 3000);
  }

  function notFound() {
    page.innerHTML = `<div class="container"><a class="jr-back" href="portfolio.html">&larr; Back to Portfolio</a>
      <p class="cs-missing">Sorry, that project couldn't be found.</p></div>`;
    page.hidden = false;
  }

  function section(s) {
    const h = s.heading ? `<h2 class="cs-h2">${esc(s.heading)}</h2>` : '';
    const intro = s.intro ? `<p class="cs-intro">${esc(s.intro)}</p>` : '';
    switch (s.type) {
      case 'text':
        return `<section class="cs-block cs-narrow">${h}${(s.paragraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}</section>`;
      case 'list':
        return `<section class="cs-block cs-narrow">${h}${intro}<ul class="cs-list">${(s.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>`;
      case 'groups':
        return `<section class="cs-block">${h}${intro}<div class="cs-groups">${(s.groups || []).map((g, i) => `
          <article class="cs-group"><span class="cs-num">${String(i + 1).padStart(2, '0')}</span>
            <h3>${esc(g.title)}</h3><ul>${(g.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></article>`).join('')}</div></section>`;
      case 'features':
        return `<section class="cs-block">${h}${intro}<div class="cs-features">${(s.items || []).map(f => `
          <div class="cs-feature"><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div>`).join('')}</div></section>`;
      case 'table':
        return `<section class="cs-block cs-narrow">${h}<div class="cs-table-wrap"><table class="cs-table">
          <thead><tr>${(s.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${(s.rows || []).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
      case 'steps':
        return `<section class="cs-block">${h}<ol class="cs-steps">${(s.items || []).map((st, i) => `
          <li><span class="cs-step-num">${i + 1}</span><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p></li>`).join('')}</ol></section>`;
      case 'chips':
        return `<section class="cs-block cs-narrow">${h}<ul class="cs-chips">${(s.items || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul></section>`;
      case 'gallery':
        return `<section class="cs-block">${h}<div class="jr-gallery" data-jr-group="gallery">${(s.images || []).filter(g => src(g.image)).map(g => `
          <button type="button" class="jr-thumb" aria-label="View larger: ${esc(g.caption || '')}">
            <img src="${esc(g.image)}" alt="${esc(g.caption || '')}" loading="lazy"></button>`).join('')}</div></section>`;
      case 'note':
        return `<p class="cs-note cs-narrow">${esc(s.text)}</p>`;
      default:
        return '';
    }
  }

  function render(c) {
    page.innerHTML = `
      <div class="container">
        <a class="jr-back" href="portfolio.html">&larr; Back to Portfolio</a>
        <header class="jr-head">
          ${c.eyebrow ? `<span class="jr-eyebrow">${esc(c.eyebrow)}</span>` : ''}
          <h1 class="jr-title">${esc(c.title)}</h1>
          ${c.subtitle ? `<p class="jr-subtitle">${esc(c.subtitle)}</p>` : ''}
        </header>
        ${src(c.hero) ? `<figure class="jr-hero" data-jr-group="hero"><img src="${esc(c.hero)}" alt="${esc(c.title)}"></figure>` : ''}
        ${(c.facts || []).length ? `<dl class="cs-facts">${c.facts.map(f => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>` : ''}
        ${(c.sections || []).map(section).join('')}
        <div class="jr-cta">
          <p>Want a learning experience like this for your learners?</p>
          <a href="contact.html" class="btn btn-primary">Let's talk</a>
        </div>
      </div>`;
    document.title = `${c.title} | Portfolio`;
    document.querySelector('.navbar-nav a[href="portfolio.html"]')?.classList.add('active');
    page.hidden = false;
    setupLightbox();
  }

  // same viewer as the journal page (styles in journals.css)
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
    const img = box.querySelector('img'), cap = box.querySelector('figcaption');
    let group = [], i = 0, opener = null;
    const show = n => {
      i = (n + group.length) % group.length;
      img.src = group[i].src; img.alt = group[i].alt; cap.textContent = group[i].alt;
      box.querySelectorAll('.jr-lb-nav').forEach(b => { b.hidden = group.length < 2; });
    };
    const close = () => { box.hidden = true; document.body.style.overflow = ''; opener && opener.focus(); };
    page.addEventListener('click', e => {
      const hit = e.target.closest('.jr-thumb, .jr-hero');
      if (!hit) return;
      group = [...hit.closest('[data-jr-group]').querySelectorAll('img')];
      opener = hit; box.hidden = false; document.body.style.overflow = 'hidden';
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
