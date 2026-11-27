/* Homepage intro: the illustration leans toward the mouse, and the big word drifts the other way.
   Phones / no mouse: a gentle idle sway (CSS). Turned off for people who prefer reduced motion. */
(function () {
  const wrap = document.getElementById('hero-image-container');
  if (!wrap) return;
  const word = wrap.querySelector('.hero-bigword');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reduce) return;
  if (!finePointer) { wrap.classList.add('hero-sway'); return; }

  let tx = 0, ty = 0;   // where we want to be (-1..1)
  let x = 0, y = 0;     // where we are now (eased)
  let raf = 0;

  function onMove(e) {
    const r = wrap.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.35;          // roughly face height
    tx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
    ty = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    const img = wrap.querySelector('.hero-image');
    if (img) {
      img.style.transform =
        `perspective(900px) rotateY(${x * 9}deg) rotateX(${-y * 5}deg) rotate(${x * 2.5}deg) translate3d(${x * 14}px, ${y * 8}px, 0)`;
    }
    if (word) word.style.transform = `translate(calc(-50% + ${-x * 28}px), calc(-50% + ${-y * 12}px))`;
    raf = (Math.abs(tx - x) > 0.001 || Math.abs(ty - y) > 0.001) ? requestAnimationFrame(tick) : 0;
  }

  window.addEventListener('mousemove', onMove, { passive: true });
  document.addEventListener('mouseleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
})();
