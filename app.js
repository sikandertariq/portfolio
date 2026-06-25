/* ===================================================================
   PORTFOLIO WEBSITE — Dynamic Content Loader & Interactions
   Reads from JSON files in /content/ folder for easy management
   =================================================================== */

// ── Utility: fetch JSON ──────────────────────────────────────────────
async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    return await res.json();
  } catch (err) {
    console.warn(`Could not load ${path}:`, err.message);
    return null;
  }
}

// ── SVG Icons ────────────────────────────────────────────────────────
const ICONS = {
  linkedin: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  arrowBackSmall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  email: `<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};


// ── Helper: create image with placeholder fallback ───────────────────
function createImage(src, alt, className = '', placeholderClass = 'placeholder-image') {
  if (!src || src.includes('placeholder')) {
    const div = document.createElement('div');
    div.className = `${className} ${placeholderClass}`;
    div.textContent = alt || 'Image';
    div.setAttribute('role', 'img');
    div.setAttribute('aria-label', alt || 'Placeholder image');
    return div;
  }
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || '';
  img.loading = 'lazy';
  if (className) img.className = className;
  img.onerror = function () {
    const div = document.createElement('div');
    div.className = `${className} ${placeholderClass}`;
    div.textContent = alt || 'Image';
    div.setAttribute('role', 'img');
    div.setAttribute('aria-label', alt || 'Placeholder image');
    this.replaceWith(div);
  };
  return img;
}


// ── Navbar: scroll effect & mobile menu ──────────────────────────────
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.navbar-nav');

  // Scroll shadow
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  // Mobile menu
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      nav.classList.toggle('open');
    });
    // Close on link click
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        toggle.classList.remove('active');
        nav.classList.remove('open');
      });
    });
  }

  // Active link highlight
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-nav a:not(.nav-social)').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}


// ── Intersection Observer for scroll animations ──────────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll('.fade-in-up, .project-card').forEach(el => {
    observer.observe(el);
  });
}


// ── Lightbox for images ──────────────────────────────────────────────
function initLightbox() {
  // Create lightbox overlay
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.id = 'lightbox';
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Close lightbox">${ICONS.close}</button>
    <img src="" alt="" />
  `;
  document.body.appendChild(overlay);

  const overlayImg = overlay.querySelector('img');
  const closeBtn = overlay.querySelector('.lightbox-close');

  // Open lightbox on image click
  document.addEventListener('click', (e) => {
    const galleryImg = e.target.closest('.project-gallery img, .gallery-item img');
    if (galleryImg) {
      overlayImg.src = galleryImg.src;
      overlayImg.alt = galleryImg.alt;
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  });

  // Close lightbox
  function closeLightbox() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeLightbox);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });
}


// ===================================================================
//  PAGE-SPECIFIC RENDERERS
// ===================================================================

// ── HOME PAGE ────────────────────────────────────────────────────────
async function renderHomePage() {
  const config = await loadJSON('content/site-config.json');
  const projectsData = await loadJSON('content/projects.json');
  const testimonialsData = await loadJSON('content/testimonials.json');
  const projects = projectsData?.projects;
  const testimonials = testimonialsData?.testimonials;

  if (!config) return;

  // Hero
  const heroHeading = document.getElementById('hero-heading');
  const heroTagline = document.getElementById('hero-tagline');
  const heroImage = document.getElementById('hero-image-container');

  if (heroHeading) heroHeading.innerHTML = `<span class="underline-accent">${config.heroHeading}</span>`;
  if (heroTagline) heroTagline.innerHTML = config.tagline;
  if (heroImage) {
    const img = createImage(config.headshot, `Photo of ${config.name}`, 'hero-image', 'hero-image placeholder-headshot');
    heroImage.appendChild(img);
  }

  // Featured project
  if (projects) {
    const featured = projects.find(p => p.featured);
    if (featured) {
      const featuredTitle = document.getElementById('featured-title');
      const featuredSubtitle = document.getElementById('featured-subtitle');
      const featuredDesc = document.getElementById('featured-description');
      const featuredImg = document.getElementById('featured-image');
      const featuredLink = document.getElementById('featured-link');

      if (featuredTitle) featuredTitle.textContent = featured.title;
      if (featuredSubtitle) featuredSubtitle.textContent = featured.subtitle;
      if (featuredDesc) featuredDesc.innerHTML = featured.description;
      if (featuredImg) {
        const img = createImage(featured.thumbnail, featured.title, '', 'placeholder-project');
        img.style.width = '100%';
        img.style.borderRadius = 'var(--radius-md)';
        img.style.boxShadow = 'var(--shadow-xl)';
        if (img.tagName !== 'IMG') {
          img.style.aspectRatio = '4/3';
        }
        featuredImg.appendChild(img);
      }
      if (featuredLink) featuredLink.href = `project.html?id=${featured.id}`;
    }
  }

  // Testimonials
  if (testimonials) {
    renderTestimonials(testimonials);
  }

  // Update navbar/footer with config
  updateSiteWide(config);
}


// ── Render Testimonials ──────────────────────────────────────────────
function renderTestimonials(testimonials) {
  const track = document.getElementById('testimonials-track');
  if (!track || !testimonials) return;

  track.innerHTML = testimonials.map(t => `
    <div class="testimonial-card">
      <div class="testimonial-quote">${t.quote}</div>
      <div class="testimonial-author">- ${t.author}</div>
      <div class="testimonial-title">${t.title}</div>
    </div>
  `).join('');

  // Navigation arrows
  const prevBtn = document.querySelector('.testimonial-nav.prev');
  const nextBtn = document.querySelector('.testimonial-nav.next');
  const cardWidth = 350;

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      track.scrollBy({ left: -cardWidth, behavior: 'smooth' });
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      track.scrollBy({ left: cardWidth, behavior: 'smooth' });
    });
  }
}


// ── PORTFOLIO PAGE ───────────────────────────────────────────────────
async function renderPortfolioPage() {
  const config = await loadJSON('content/site-config.json');
  const projectsData = await loadJSON('content/projects.json');
  const projects = projectsData?.projects;

  if (config) updateSiteWide(config);
  if (!projects) return;

  const container = document.getElementById('projects-container');
  if (!container) return;

  // Separate featured and other projects
  const featured = projects.find(p => p.featured);
  const otherProjects = projects.filter(p => !p.featured);

  // Render featured project first
  if (featured) {
    container.appendChild(createProjectCard(featured));
  }

  // Render other projects
  otherProjects.forEach(project => {
    container.appendChild(createProjectCard(project));
  });

  // Trigger scroll animations after rendering
  setTimeout(initScrollAnimations, 100);
}

function createProjectCard(project) {
  const card = document.createElement('div');
  card.className = 'project-card';

  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'project-card-image-wrapper';
  const img = createImage(project.thumbnail, project.title, '', 'placeholder-project');
  if (img.tagName !== 'IMG') {
    img.style.aspectRatio = '4/3';
    img.style.width = '100%';
  }
  imageWrapper.appendChild(img);

  const content = document.createElement('div');
  content.className = 'project-card-content';
  content.innerHTML = `
    <h3 class="project-card-title">${project.title}</h3>
    <p class="project-card-subtitle">${project.subtitle}</p>
    <p class="project-card-description">${project.description}</p>
    <div class="project-card-tools">
      ${project.tools.map(t => `<span class="tool-tag">${t}</span>`).join('')}
    </div>
    <a href="project.html?id=${project.id}" class="btn btn-primary">Learn More</a>
  `;

  card.appendChild(imageWrapper);
  card.appendChild(content);
  return card;
}


// ── ABOUT PAGE ───────────────────────────────────────────────────────
async function renderAboutPage() {
  const config = await loadJSON('content/site-config.json');
  if (!config) return;

  updateSiteWide(config);

  // Bio text
  const bioContainer = document.getElementById('about-bio');
  if (bioContainer && config.aboutBio) {
    bioContainer.innerHTML = config.aboutBio.map(p => `<p>${p}</p>`).join('');
  }

  // About photo
  const photoContainer = document.getElementById('about-photo-container');
  if (photoContainer) {
    const img = createImage(config.aboutPhoto, `Photo of ${config.name}`, 'about-photo', 'about-photo placeholder-headshot');
    photoContainer.appendChild(img);
  }

  // Skills
  const skillsGrid = document.getElementById('skills-grid');
  if (skillsGrid && config.skills) {
    skillsGrid.innerHTML = config.skills.map(skill => `
      <div class="skill-badge">${skill}</div>
    `).join('');
  }
}


// ── CONTACT PAGE ─────────────────────────────────────────────────────
async function renderContactPage() {
  const config = await loadJSON('content/site-config.json');
  if (!config) return;

  updateSiteWide(config);

  // Email link
  const emailLink = document.getElementById('contact-email');
  if (emailLink) {
    emailLink.href = `mailto:${config.email}`;
    emailLink.textContent = config.email;
  }

  // LinkedIn link
  const linkedinLink = document.getElementById('contact-linkedin');
  if (linkedinLink) {
    linkedinLink.href = config.linkedin;
    linkedinLink.textContent = 'View LinkedIn Profile';
  }

  // Form handler
  const form = document.getElementById('contact-form');
  const successMsg = document.getElementById('form-success');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // In a real scenario, you'd send the form data to a server
      // For now, just show a success message
      if (successMsg) successMsg.classList.add('show');
      form.reset();
      setTimeout(() => {
        if (successMsg) successMsg.classList.remove('show');
      }, 5000);
    });
  }
}


// ── PROJECT DETAIL PAGE ──────────────────────────────────────────────
async function renderProjectPage() {
  const config = await loadJSON('content/site-config.json');
  const projectsData = await loadJSON('content/projects.json');
  const projects = projectsData?.projects;

  if (config) updateSiteWide(config);
  if (!projects) return;

  // Get project ID from URL
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id');

  if (!projectId) {
    document.getElementById('project-detail-content').innerHTML =
      '<p style="text-align:center;padding:4rem;">Project not found. <a href="portfolio.html" style="color:var(--color-accent)">Return to Portfolio</a></p>';
    return;
  }

  const project = projects.find(p => p.id === projectId);
  if (!project) {
    document.getElementById('project-detail-content').innerHTML =
      '<p style="text-align:center;padding:4rem;">Project not found. <a href="portfolio.html" style="color:var(--color-accent)">Return to Portfolio</a></p>';
    return;
  }

  // Populate project details
  const titleEl = document.getElementById('project-title');
  const subtitleEl = document.getElementById('project-subtitle');
  const typeEl = document.getElementById('project-type');
  const heroImg = document.getElementById('project-hero-image');
  const overviewEl = document.getElementById('project-overview');
  const problemEl = document.getElementById('project-problem');
  const solutionEl = document.getElementById('project-solution');
  const resultsEl = document.getElementById('project-results');
  const processEl = document.getElementById('project-process');
  const toolsEl = document.getElementById('project-tools');
  const galleryEl = document.getElementById('project-gallery');
  const pdfEl = document.getElementById('project-pdf');

  if (titleEl) titleEl.textContent = project.title;
  if (subtitleEl) subtitleEl.textContent = project.subtitle;
  if (typeEl) typeEl.textContent = project.type;

  // Set page title
  document.title = `${project.title} | Portfolio`;

  // Hero image
  if (heroImg) {
    const img = createImage(
      project.images && project.images[0] ? project.images[0] : project.thumbnail,
      project.title,
      'project-detail-hero-image',
      'project-detail-hero-image placeholder-project'
    );
    if (img.tagName !== 'IMG') {
      img.style.aspectRatio = '16/9';
      img.style.width = '100%';
      img.style.borderRadius = 'var(--radius-lg)';
    }
    heroImg.appendChild(img);
  }

  // Content sections
  if (overviewEl && project.overview) overviewEl.textContent = project.overview;
  if (problemEl && project.problem) problemEl.textContent = project.problem;
  if (solutionEl && project.solution) solutionEl.textContent = project.solution;
  if (resultsEl && project.results) resultsEl.textContent = project.results;

  // Process steps
  if (processEl && project.process) {
    processEl.innerHTML = project.process.map(step => `<li>${step}</li>`).join('');
  }

  // Sidebar tools
  if (toolsEl && project.tools) {
    toolsEl.innerHTML = project.tools.map(t => `<span class="tool-tag">${t}</span>`).join('');
  }

  // Image gallery (skip first if used as hero)
  if (galleryEl && project.images && project.images.length > 1) {
    const galleryImages = project.images.slice(1);
    galleryImages.forEach(src => {
      const img = createImage(src, `${project.title} screenshot`, '', 'placeholder-project');
      if (img.tagName !== 'IMG') {
        img.style.aspectRatio = '16/9';
        img.style.borderRadius = 'var(--radius-md)';
      }
      galleryEl.appendChild(img);
    });
  }

  // PDF viewer
  if (pdfEl && project.pdf) {
    pdfEl.innerHTML = `
      <h2>Project Document</h2>
      <div class="pdf-viewer-wrapper">
        <iframe src="${project.pdf}" title="${project.title} PDF"></iframe>
      </div>
    `;
    pdfEl.style.display = 'block';
  }
}


// ── Update site-wide elements (logo, footer, nav social links) ───────
function updateSiteWide(config) {
  // Logo initials
  document.querySelectorAll('.logo-initials').forEach(el => {
    el.textContent = config.initials;
  });

  // LinkedIn links
  document.querySelectorAll('.social-linkedin').forEach(el => {
    el.href = config.linkedin;
  });
}


// ===================================================================
//  INITIALIZATION
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initLightbox();

  // Determine which page we're on and render accordingly
  const page = document.body.dataset.page;

  switch (page) {
    case 'home':
      renderHomePage().then(() => setTimeout(initScrollAnimations, 100));
      break;
    case 'portfolio':
      renderPortfolioPage();
      break;
    case 'about':
      renderAboutPage().then(() => setTimeout(initScrollAnimations, 100));
      break;
    case 'contact':
      renderContactPage();
      break;
    case 'project':
      renderProjectPage().then(() => {
        setTimeout(initScrollAnimations, 100);
        initLightbox();
      });
      break;
  }
});
