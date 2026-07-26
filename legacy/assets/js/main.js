/* ============================================================
   LOVE ARCHIVE — main.js
   Premium Apple-style interactions & animations
   ============================================================ */

'use strict';

// ── UTILITIES ──────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

// ── STATE ──────────────────────────────────────────────────
const state = {
  mouseX: 0,
  mouseY: 0,
  ringX: 0,
  ringY: 0,
  loaded: false,
  scrollY: 0,
  ticking: false,
};

// ── LOADING ─────────────────────────────────────────────────
function initLoader() {
  const loading = $('#loading');
  if (!loading) return;

  // Simulate asset loading
  setTimeout(() => {
    loading.classList.add('out');
    
    // Trigger hero reveals with stagger
    $$('.hero-text-overlay .reveal, #hero .reveal').forEach((el, i) => {
      const delay = el.dataset.delay ? parseInt(el.dataset.delay) : i * 120;
      setTimeout(() => el.classList.add('visible'), delay);
    });
    state.loaded = true;

    // Start ambient particles after load
    initParticles();

    // Trigger Polaroid shatter animation
    const collage = $('#hero-collage');
    if (collage) {
      setTimeout(() => {
        collage.classList.add('shattered');
      }, 100);
      
      // Enable floating physics once shatter is complete
      setTimeout(() => {
        collage.classList.add('floating');
      }, 2000);
    }

    // Compute coordinates for scroll transition after they shatter and settle
    setTimeout(() => {
      if (window.calculateCoordinates) {
        window.calculateCoordinates();
      }
      window.dispatchEvent(new Event('resize'));
    }, 2500);
  }, 2200);
}

// ── CURSOR ──────────────────────────────────────────────────
function initCursor() {
  const dot  = $('#cursor-dot');
  const ring = $('#cursor-ring');
  if (!dot || !ring) return;

  document.addEventListener('mousemove', e => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    dot.style.left = e.clientX + 'px';
    dot.style.top  = e.clientY + 'px';
  });

  document.addEventListener('mousedown', () => document.body.classList.add('clicking'));
  document.addEventListener('mouseup',   () => document.body.classList.remove('clicking'));

  // Smooth ring follow
  function animateRing() {
    state.ringX = lerp(state.ringX, state.mouseX, 0.11);
    state.ringY = lerp(state.ringY, state.mouseY, 0.11);
    ring.style.left = state.ringX + 'px';
    ring.style.top  = state.ringY + 'px';
    requestAnimationFrame(animateRing);
  }
  animateRing();

  // Hover states
  const interactives = 'a, button, .hero-polaroid';
  document.addEventListener('mouseover', e => {
    if (e.target.closest(interactives)) document.body.classList.add('hovering');
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(interactives)) document.body.classList.remove('hovering');
  });
}

// ── SCROLL PROGRESS ─────────────────────────────────────────
function initScrollProgress() {
  const bar = $('#scroll-progress');
  if (!bar) return;

  window.addEventListener('scroll', () => {
    const pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
    bar.style.width = clamp(pct, 0, 100) + '%';
  }, { passive: true });
}

// ── REVEAL ON SCROLL ────────────────────────────────────────
function initReveal() {
  const opts = { threshold: 0.12, rootMargin: '0px 0px -60px 0px' };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = el.dataset.delay ? parseInt(el.dataset.delay) : 0;
        setTimeout(() => el.classList.add('visible'), delay);
        observer.unobserve(el);
      }
    });
  }, opts);

  $$('.reveal').forEach(el => {
    if (!el.closest('#hero')) observer.observe(el);
  });
}

// ── NAV SECTION TRACKER ─────────────────────────────────────
function initNavTracker() {
  const nav = $('#nav');
  if (!nav) return;

  let lastScrollY = 0;
  nav.style.transform = 'translateY(-100%)';
  nav.style.transition = 'transform 0.4s var(--cinematic), opacity 0.4s ease';

  window.addEventListener('scroll', () => {
    const currentY = window.scrollY;
    const heroHeight = window.innerHeight;

    if (currentY < heroHeight - 80) {
      // Keep navbar hidden on the first page
      nav.style.transform = 'translateY(-100%)';
      nav.style.opacity = '0';
      nav.style.pointerEvents = 'none';
    } else {
      // Show/hide navbar based on scroll direction past the first page
      nav.style.opacity = '1';
      nav.style.pointerEvents = 'all';
      if (currentY < lastScrollY) {
        nav.style.transform = 'translateY(0)';
        nav.style.background = 'rgba(255,255,255,0.92)';
      } else {
        nav.style.transform = 'translateY(-100%)';
      }
    }
    lastScrollY = currentY;
  }, { passive: true });
}

// ── PARALLAX HERO ELEMENTS ─────────────────────────────────────
function initHeroParallax() {
  const blobs = $$('.hero-blob');

  window.addEventListener('scroll', () => {
    const y = window.scrollY;

    blobs.forEach((blob, i) => {
      const speed = (i + 1) * 0.12;
      blob.style.transform = `translateY(${y * speed * -0.3}px)`;
    });
  }, { passive: true });
}

// ── HERO POLAROID COLLAGE ─────────────────────────────────────
async function initHeroCollage() {
  const container = $('#hero-collage');
  if (!container) return;

  // 1. Hardcoded folder images to bypass local file protocol directory scanning restrictions
  let herImages = [
    'assets/images/her/1781014822480.png',
    'assets/images/her/1781014830273.png',
    'assets/images/her/1781014842250.png',
    'assets/images/her/1781014861379.png',
    'assets/images/her/1781014866056.png',
    'assets/images/her/IMG-20260610-WA0005.jpg',
    'assets/images/her/IMG-20260610-WA0006.jpg',
    'assets/images/her/IMG-20260610-WA0007.jpg',
    'assets/images/her/IMG-20260610-WA0008.jpg',
    'assets/images/her/IMG-20260610-WA0009.jpg',
    'assets/images/her/IMG-20260610-WA0010.jpg',
    'assets/images/her/IMG-20260610-WA0011.jpg',
    'assets/images/her/IMG-20260610-WA0012.jpg',
    'assets/images/her/IMG-20260610-WA0013.jpg',
    'assets/images/her/IMG-20260610-WA0014.jpg',
    'assets/images/her/IMG-20260610-WA0015.jpg',
    'assets/images/her/IMG_20251014_223629_171.jpg',
    'assets/images/her/IMG_20260112_232608_746.jpg',
    'assets/images/her/IMG_20260112_232614_708.jpg',
    'assets/images/her/IMG_20260112_232616_719.jpg',
    'assets/images/her/IMG_20260112_232759_510.jpg',
    'assets/images/her/IMG_20260112_232801_437.jpg',
    'assets/images/her/IMG_20260607_224640_645.jpg',
    'assets/images/her/IMG_20260607_224818_140.jpg',
    'assets/images/her/IMG_20260607_225253_267.jpg',
    'assets/images/her/IMG_20260607_225513_386.jpg',
    'assets/images/her/IMG_20260610_225715.jpg',
    'assets/images/her/IMG_20260610_225728.jpg',
    'assets/images/her/IMG_20260610_225840.jpg',
    'assets/images/her/IMG_20260610_225850.jpg',
    'assets/images/her/IMG_20260610_230008.png',
    'assets/images/her/Screenshot_20260610_003345.jpg',
    'assets/images/her/Screenshot_2026_0112_220908.png',
    'assets/images/her/Screenshot_2026_0112_220930.png',
    'assets/images/her/Screenshot_2026_0524_004252.png',
    'assets/images/her/Screenshot_2026_0524_004258.png',
    'assets/images/her/Screenshot_2026_0524_004305.png',
    'assets/images/her/TempDragFile_20260610_225404.png',
    'assets/images/her/TempDragFile_20260610_225424.png',
    'assets/images/her/TempDragFile_20260610_225443.png',
    'assets/images/her/TempDragFile_20260610_225455.png',
    'assets/images/her/file_00000000c7e4720799004e37df31c513.png'
  ];

  const photos = [
    // Column 1
    { w: 175, top: 10, left: 5,   rot: -8,  fa: -6,  fd: 6.2, z: 3 },
    { w: 190, top: 28, left: 3,   rot: 12,  fa: -8,  fd: 7.5, z: 4 },
    { w: 180, top: 48, left: 4,   rot: -5,  fa: -7,  fd: 8.4, z: 2 },
    { w: 170, top: 72, left: 3,   rot: 9,   fa: -5,  fd: 6.8, z: 5 },
    { w: 185, top: 90, left: 6,   rot: -11, fa: -9,  fd: 9.0, z: 3 },

    // Column 2
    { w: 180, top: 12, left: 17,  rot: 6,   fa: -7,  fd: 7.1, z: 4 },
    { w: 165, top: 32, left: 16,  rot: -9,  fa: -8,  fd: 8.2, z: 2 },
    { w: 195, top: 54, left: 15,  rot: 7,   fa: -6,  fd: 7.5, z: 6 },
    { w: 175, top: 76, left: 18,  rot: -6,  fa: -9,  fd: 8.8, z: 3 },
    { w: 190, top: 90, left: 16,  rot: 8,   fa: -5,  fd: 6.5, z: 5 },

    // Column 3
    { w: 200, top: 10, left: 30,  rot: -10, fa: -8,  fd: 7.2, z: 3 },
    { w: 170, top: 25, left: 28,  rot: 5,   fa: -6,  fd: 8.1, z: 4 },
    { w: 185, top: 45, left: 29,  rot: -7,  fa: -8,  fd: 7.9, z: 4 },
    { w: 165, top: 68, left: 31,  rot: 11,  fa: -5,  fd: 6.1, z: 2 },
    { w: 180, top: 88, left: 28,  rot: -8,  fa: -9,  fd: 8.6, z: 6 },

    // Column 4
    { w: 175, top: 14, left: 42,  rot: 7,   fa: -6,  fd: 6.9, z: 3 },
    { w: 195, top: 35, left: 43,  rot: -11, fa: -7,  fd: 7.2, z: 3 },
    { w: 180, top: 58, left: 41,  rot: 6,   fa: -6,  fd: 8.0, z: 5 },
    { w: 190, top: 78, left: 44,  rot: -9,  fa: -10, fd: 9.2, z: 4 },
    { w: 170, top: 88, left: 42,  rot: 5,   fa: -5,  fd: 6.7, z: 2 },

    // Column 5
    { w: 185, top: 10, left: 56,  rot: -6,  fa: -8,  fd: 8.3, z: 6 },
    { w: 170, top: 25, left: 54,  rot: 9,   fa: -6,  fd: 7.4, z: 3 },
    { w: 195, top: 47, left: 55,  rot: -8,  fa: -9,  fd: 8.9, z: 5 },
    { w: 175, top: 70, left: 57,  rot: 7,   fa: -6,  fd: 6.8, z: 4 },
    { w: 180, top: 90, left: 55,  rot: -5,  fa: -8,  fd: 7.8, z: 3 },

    // Column 6
    { w: 190, top: 13, left: 69,  rot: 11,  fa: -7,  fd: 7.6, z: 4 },
    { w: 175, top: 31, left: 68,  rot: -7,  fa: -8,  fd: 8.5, z: 2 },
    { w: 180, top: 52, left: 70,  rot: 8,   fa: -5,  fd: 6.3, z: 6 },
    { w: 195, top: 74, left: 67,  rot: -10, fa: -9,  fd: 9.1, z: 3 },
    { w: 170, top: 87, left: 69,  rot: 6,   fa: -6,  fd: 7.8, z: 5 },

    // Column 7
    { w: 180, top: 10, left: 81,  rot: -8,  fa: -8,  fd: 8.7, z: 4 },
    { w: 190, top: 24, left: 82,  rot: 5,   fa: -7,  fd: 7.1, z: 6 },
    { w: 170, top: 46, left: 80,  rot: -6,  fa: -8,  fd: 8.3, z: 3 },
    { w: 185, top: 67, left: 83,  rot: 9,   fa: -6,  fd: 7.6, z: 5 },
    { w: 200, top: 89, left: 81,  rot: -7,  fa: -8,  fd: 8.2, z: 3 },

    // Column 8
    { w: 170, top: 14, left: 93,  rot: 7,   fa: -7,  fd: 7.9, z: 4 },
    { w: 185, top: 33, left: 94,  rot: -9,  fa: -9,  fd: 8.5, z: 2 },
    { w: 175, top: 55, left: 92,  rot: 6,   fa: -5,  fd: 6.8, z: 5 },
    { w: 190, top: 77, left: 95,  rot: -11, fa: -8,  fd: 8.9, z: 3 },
    { w: 180, top: 89, left: 93,  rot: 8,   fa: -6,  fd: 7.4, z: 6 }
  ];

  // Filter photos in the upper rows (top < 52) to guarantee a long, dramatic scroll transition
  const eligibleIndices = [];
  photos.forEach((p, idx) => {
    if (p.top < 52) {
      eligibleIndices.push(idx);
    }
  });

  // Randomly select 20 distinct photo indices from eligible ones
  const transitionIndices = [];
  while (transitionIndices.length < 20 && eligibleIndices.length >= 20) {
    const randIdx = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
    if (!transitionIndices.includes(randIdx)) {
      transitionIndices.push(randIdx);
    }
  }
  // Fallback to any index if not enough eligible ones
  while (transitionIndices.length < 20) {
    const randIdx = Math.floor(Math.random() * photos.length);
    if (!transitionIndices.includes(randIdx)) {
      transitionIndices.push(randIdx);
    }
  }

  transitionIndices.forEach((idx, i) => {
    photos[idx].transition = `t${i + 1}`;
  });

  let maxZ = 10;

  // Add polaroids to the collage
  photos.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'hero-polaroid';
    if (p.transition) {
      wrap.classList.add('transition-' + p.transition);
    }
    
    // Set variables for transitions to hook onto
    wrap.style.cssText = [
      `width: ${p.w}px`,
      `height: ${p.w + 28}px`,
      `--target-top: calc(${p.top}vh + 5vh)`,
      `--target-left: ${p.left}%`,
      `--base-rot: ${p.rot}deg`,
      `--float-amt: ${p.fa}px`,
      `animation-duration: ${p.fd}s`,
      `animation-delay: ${-(p.fd * 0.5 * (i % 5) / 5)}s`,
      `z-index: ${p.z}`,
    ].join(';');

    const imgWrap = document.createElement('div');
    imgWrap.style.cssText = 'width:100%; height:calc(100% - 28px); overflow:hidden; position:relative;';

    const img = document.createElement('img');
    img.src = herImages[i % herImages.length];
    img.alt = '';
    img.loading = 'lazy';
    img.draggable = false;
    img.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';

    imgWrap.appendChild(img);
    wrap.appendChild(imgWrap);
    container.appendChild(wrap);

    makeDraggable(wrap);
  });

  // Drag-and-drop system for polaroids (supports Mouse & Touch)
  function makeDraggable(el) {
    let startX = 0, startY = 0;
    let dragX = 0, dragY = 0;
    let isDragging = false;

    el.addEventListener('mousedown', dragStart);
    el.addEventListener('touchstart', dragStart, { passive: true });

    function dragStart(e) {
      isDragging = true;
      maxZ++;
      el.style.zIndex = maxZ;
      el.classList.add('dragging');

      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

      startX = clientX - dragX;
      startY = clientY - dragY;

      if (e.type === 'mousedown') {
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);
      } else {
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
      }

      if (e.type === 'mousedown') {
        e.preventDefault();
      }
    }

    function dragMove(e) {
      if (!isDragging) return;

      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

      dragX = clientX - startX;
      dragY = clientY - startY;

      el.style.setProperty('--drag-x', `${dragX}px`);
      el.style.setProperty('--drag-y', `${dragY}px`);

      if (e.type === 'touchmove') {
        e.preventDefault();
      }
    }

    function dragEnd() {
      isDragging = false;
      el.classList.remove('dragging');

      // Update center of this dragged element
      const rect = el.getBoundingClientRect();
      const match = polaroidCenters.find(item => item.el === el);
      if (match) {
        match.x = rect.left + rect.width / 2 + window.scrollX;
        match.y = rect.top + rect.height / 2 + window.scrollY;
      }

      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', dragEnd);
      document.removeEventListener('touchmove', dragMove);
      document.removeEventListener('touchend', dragEnd);
    }
  }

  // Smooth mouse tilt & parallax (no repulsion)
  document.addEventListener('mousemove', (e) => {
    // Only apply parallax when we are on the first page
    if (window.scrollY > window.innerHeight) return;

    const cx = (e.clientX / window.innerWidth) - 0.5;
    const cy = (e.clientY / window.innerHeight) - 0.5;

    $$('.hero-polaroid').forEach((p, i) => {
      if (p.classList.contains('dragging')) return;

      // Parallax translation based on depth layer
      const depth = (i % 5 + 1) * 0.15;
      const px = cx * depth * 80;
      const py = cy * depth * 60;

      p.style.setProperty('--para-x', `${px}px`);
      p.style.setProperty('--para-y', `${py}px`);
      p.style.setProperty('--tilt-x', `${cx * 8}deg`);
    });
  });

  document.addEventListener('mouseleave', () => {
    $$('.hero-polaroid').forEach(p => {
      p.style.setProperty('--para-x', '0px');
      p.style.setProperty('--para-y', '0px');
      p.style.setProperty('--tilt-x', '0deg');
    });
  });
}

let polaroidCenters = [];

function updatePolaroidCenters() {
  polaroidCenters = $$('.hero-polaroid').map((p) => {
    const rect = p.getBoundingClientRect();
    return {
      el: p,
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + rect.height / 2 + window.scrollY
    };
  });
}

// ── 3D SCROLL DOCKING TRANSITION ─────────────────────────────
function initScrollTransition() {
  const collage = $('#hero-collage');
  if (!collage) return;

  const cards = [];
  const targets = [];
  const count = 20;

  for (let i = 1; i <= count; i++) {
    const card = $(`.hero-polaroid.transition-t${i}`);
    const target = $(`#transition-target-t${i}`);
    if (card && target) {
      cards.push(card);
      targets.push(target);
    }
  }

  if (cards.length !== count || targets.length !== count) return;

  let positions = [];
  // Target rotations to fit the tilted stamp grid (rotated by -6deg)
  const targetRots = [
    -7, -5, -6, -5, -7, -6, -8, -4, -6, -5,
    -7, -6, -8, -5, -7, -6, -7, -5, -6, -5
  ];

  function calculateCoordinates() {
    const curScrollY = window.scrollY;
    positions = [];

    // Save and clear dynamic properties to measure pure base positions
    const savedStyles = cards.map(card => {
      const style = {
        transition: card.style.getPropertyValue('transition'),
        animation: card.style.getPropertyValue('animation'),
        paraX: card.style.getPropertyValue('--para-x'),
        paraY: card.style.getPropertyValue('--para-y'),
        tiltX: card.style.getPropertyValue('--tilt-x'),
        scrollX: card.style.getPropertyValue('--scroll-x'),
        scrollY: card.style.getPropertyValue('--scroll-y'),
        scrollRot: card.style.getPropertyValue('--scroll-rot'),
        scrollScale: card.style.getPropertyValue('--scroll-scale'),
        scrollRotX: card.style.getPropertyValue('--scroll-rot-x'),
        scrollRotY: card.style.getPropertyValue('--scroll-rot-y')
      };

      card.style.setProperty('transition', 'none', 'important');
      card.style.setProperty('animation', 'none', 'important');
      card.style.setProperty('--para-x', '0px');
      card.style.setProperty('--para-y', '0px');
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--scroll-x', '0px');
      card.style.setProperty('--scroll-y', '0px');
      card.style.setProperty('--scroll-rot', '0deg');
      card.style.setProperty('--scroll-scale', '1');
      card.style.setProperty('--scroll-rot-x', '0deg');
      card.style.setProperty('--scroll-rot-y', '0deg');

      return style;
    });

    // Force style recalculation
    document.body.offsetHeight;

    for (let i = 0; i < count; i++) {
      const card = cards[i];
      const target = targets[i];

      const cardRect = card.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      // Calculate exact center coordinates relative to document
      const sourceAbs = {
        x: cardRect.left + cardRect.width / 2 + window.scrollX,
        y: cardRect.top + cardRect.height / 2 + curScrollY
      };

      const targetAbs = {
        x: targetRect.left + targetRect.width / 2 + window.scrollX,
        y: targetRect.top + targetRect.height / 2 + curScrollY
      };

      const sourceWidth = card.offsetWidth;
      const targetWidth = target.offsetWidth;

      // Retrieve the current base responsive scale
      const baseScale = parseFloat(window.getComputedStyle(card).getPropertyValue('--responsive-scale') || '1');

      positions.push({
        deltaX: targetAbs.x - sourceAbs.x,
        deltaY: targetAbs.y - sourceAbs.y,
        baseRot: parseFloat(card.style.getPropertyValue('--base-rot') || '0'),
        targetRot: targetRots[i],
        baseScale: baseScale,
        targetScale: targetWidth / sourceWidth
      });
    }

    // Restore saved properties
    cards.forEach((card, idx) => {
      const saved = savedStyles[idx];
      if (saved.transition) card.style.setProperty('transition', saved.transition); else card.style.removeProperty('transition');
      if (saved.animation) card.style.setProperty('animation', saved.animation); else card.style.removeProperty('animation');
      if (saved.paraX) card.style.setProperty('--para-x', saved.paraX); else card.style.removeProperty('--para-x');
      if (saved.paraY) card.style.setProperty('--para-y', saved.paraY); else card.style.removeProperty('--para-y');
      if (saved.tiltX) card.style.setProperty('--tilt-x', saved.tiltX); else card.style.removeProperty('--tilt-x');
      if (saved.scrollX) card.style.setProperty('--scroll-x', saved.scrollX); else card.style.removeProperty('--scroll-x');
      if (saved.scrollY) card.style.setProperty('--scroll-y', saved.scrollY); else card.style.removeProperty('--scroll-y');
      if (saved.scrollRot) card.style.setProperty('--scroll-rot', saved.scrollRot); else card.style.removeProperty('--scroll-rot');
      if (saved.scrollScale) card.style.setProperty('--scroll-scale', saved.scrollScale); else card.style.removeProperty('--scroll-scale');
      if (saved.scrollRotX) card.style.setProperty('--scroll-rot-x', saved.scrollRotX); else card.style.removeProperty('--scroll-rot-x');
      if (saved.scrollRotY) card.style.setProperty('--scroll-rot-y', saved.scrollRotY); else card.style.removeProperty('--scroll-rot-y');
    });

    updatePolaroidCenters();
  }

  // Make calculateCoordinates globally accessible so loader can call it once shatter completes
  window.calculateCoordinates = calculateCoordinates;

  window.addEventListener('resize', calculateCoordinates);

  window.addEventListener('scroll', () => {
    if (positions.length < count) return;

    const progress = clamp(window.scrollY / window.innerHeight, 0, 1);

    // Smooth background color interpolation
    // Interpolating from white rgb(255, 255, 255) to dark cherry red rgb(74, 3, 10)
    const r = Math.round(lerp(255, 74, progress));
    const g = Math.round(lerp(255, 3, progress));
    const b = Math.round(lerp(255, 10, progress));
    document.body.style.setProperty('--bg-color', `rgb(${r}, ${g}, ${b})`);

    // Toggle scroll status for nav styling
    const heroHeight = window.innerHeight;
    if (window.scrollY > heroHeight - 100) {
      document.body.classList.add('scrolled-past-hero');
    } else {
      document.body.classList.remove('scrolled-past-hero');
    }

    for (let i = 0; i < count; i++) {
      const card = cards[i];
      const target = targets[i];
      const pos = positions[i];

      const sx = pos.deltaX * progress;
      const sy = pos.deltaY * progress;
      const sRot = (pos.targetRot - pos.baseRot) * progress;
      const sScale = lerp(pos.baseScale, pos.targetScale, progress);

      // Dynamic 3D rotation flip on scroll
      const factor = (i % 2 === 0 ? 1 : -1);
      const rotX = factor * 360 * progress;
      const rotY = factor * 180 * progress;

      card.style.setProperty('--scroll-x', `${sx}px`);
      card.style.setProperty('--scroll-y', `${sy}px`);
      card.style.setProperty('--scroll-rot', `${sRot}deg`);
      card.style.setProperty('--scroll-scale', sScale);
      card.style.setProperty('--scroll-rot-x', `${rotX}deg`);
      card.style.setProperty('--scroll-rot-y', `${rotY}deg`);

      // Decrease saturation to make them black and white when docked
      card.style.filter = `grayscale(${progress}) contrast(${lerp(1.0, 1.05, progress)})`;

      // Fade targets visibility slightly as we dock
      target.style.opacity = progress;
    }
  }, { passive: true });
}

// ── AMBIENT PARTICLES ────────────────────────────────────────
function initParticles() {
  const container = $('#ambient-particles');
  if (!container) return;

  function createParticle() {
    const p = document.createElement('div');
    p.className = 'amb-particle';
    const size = Math.random() * 4 + 2;
    const isCherry = Math.random() > 0.6;
    const isGold   = Math.random() > 0.8;

    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${Math.random() * 100}vw;
      bottom: -10px;
      background: ${isCherry
        ? 'rgba(192,22,42,0.25)'
        : isGold
        ? 'rgba(201,168,76,0.2)'
        : 'rgba(200,190,180,0.3)'};
      animation-duration: ${12 + Math.random() * 10}s;
      animation-delay: ${Math.random() * 5}s;
      filter: blur(${Math.random() > 0.5 ? '1px' : '0px'});
    `;
    container.appendChild(p);
    setTimeout(() => p.remove(), 25000);
  }

  setInterval(createParticle, 1200);
}

// ── SMOOTH ANCHOR SCROLL ─────────────────────────────────────
function initSmoothAnchors() {
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ── AMBIENT AUDIO (Web Audio API) ────────────────────────────
let audioCtx = null, masterGain = null, audioPlaying = false;

function createAmbientAudio() {
  audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
  masterGain.gain.linearRampToValueAtTime(0.035, audioCtx.currentTime + 3);
  masterGain.connect(audioCtx.destination);

  // Soft warm drones
  [
    { freq: 110, det: 0,    gain: 0.25 },
    { freq: 165, det: -6,   gain: 0.12 },
    { freq: 220, det: 8,    gain: 0.07 },
    { freq: 55,  det: 0,    gain: 0.18 },
  ].forEach(({ freq, det, gain }) => {
    const osc  = audioCtx.createOscillator();
    const g    = audioCtx.createGain();
    const lpf  = audioCtx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value    = det;
    lpf.type = 'lowpass';
    lpf.frequency.value = 400;
    g.gain.value = gain;

    osc.connect(lpf); lpf.connect(g); g.connect(masterGain);
    osc.start();
  });

  // Warm pink noise texture
  const buf  = audioCtx.createBuffer(1, audioCtx.sampleRate * 4, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    data[i] = (b0 + b1 + b2) * 0.11;
  }
  const src    = audioCtx.createBufferSource();
  const nGain  = audioCtx.createGain();
  src.buffer   = buf;
  src.loop     = true;
  nGain.gain.value = 0.012;
  src.connect(nGain); nGain.connect(masterGain);
  src.start();
}

function toggleAudio() {
  const btn  = $('#audio-toggle');
  const bars = $$('.a-bar');

  if (!audioCtx) {
    createAmbientAudio();
    audioPlaying = true;
  } else if (audioPlaying) {
    masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
    audioPlaying = false;
    bars.forEach(b => b.style.animationPlayState = 'paused');
    if (btn) btn.title = 'Enable ambient sound';
  } else {
    masterGain.gain.linearRampToValueAtTime(0.035, audioCtx.currentTime + 0.6);
    audioPlaying = true;
    bars.forEach(b => b.style.animationPlayState = 'running');
    if (btn) btn.title = 'Disable ambient sound';
  }
}

// ── FLOWER SECTION (PAGE 3) WIPE & PARALLAX ──────────────────
function initScrollWipe() {
  const flowerSection = $('#flower-section');
  const lilySlide = $('.lily-slide');
  if (!flowerSection || !lilySlide) return;

  window.addEventListener('scroll', () => {
    const rect = flowerSection.getBoundingClientRect();
    const startY = rect.top + window.scrollY; // absolute top of the flower section
    const progress = clamp((window.scrollY - startY) / window.innerHeight, 0, 1);
    
    // Convert progress to horizontal clip-path inset percentage (100% -> 0%)
    const wipePercent = 100 - (progress * 100);
    lilySlide.style.clipPath = `inset(0 0 0 ${wipePercent}%)`;
  }, { passive: true });
}

function initMouseParallax() {
  const sunflowerBg = $('.sunflower-slide .slide-bg');
  const lilyBg = $('.lily-slide .slide-bg');
  
  const sunflowerPolaroid = $('.sunflower-slide .polaroid-wrapper');
  const lilyPolaroid = $('.lily-slide .polaroid-wrapper');

  const sunflowerText = $('.sunflower-slide .text-wrapper');
  const lilyText = $('.lily-slide .text-wrapper');

  const baseRotSunflower = -3;
  const baseRotLily = -3;

  const target = { cx: 0, cy: 0 };
  const current = { cx: 0, cy: 0 };

  document.addEventListener('mousemove', e => {
    target.cx = (e.clientX / window.innerWidth) - 0.5;
    target.cy = (e.clientY / window.innerHeight) - 0.5;
  });

  function animateParallax() {
    current.cx = lerp(current.cx, target.cx, 0.08);
    current.cy = lerp(current.cy, target.cy, 0.08);

    const cx = current.cx;
    const cy = current.cy;

    const bgTransform = `scale(1.02) translate(${cx * -22}px, ${cy * -22}px)`;
    if (sunflowerBg) sunflowerBg.style.transform = bgTransform;
    if (lilyBg) lilyBg.style.transform = bgTransform;

    const px = cx * 45;
    const py = cy * 35;
    const rx = cy * -14;
    const ry = cx * 14;

    if (sunflowerPolaroid) {
      sunflowerPolaroid.style.transform = `translate3d(${px}px, ${py}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${baseRotSunflower}deg)`;
    }
    if (lilyPolaroid) {
      lilyPolaroid.style.transform = `translate3d(${px}px, ${py}px, 0) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${baseRotLily}deg)`;
    }

    const tx = cx * 18;
    const ty = cy * 12;
    const textTransform = `translate(${tx}px, ${ty}px)`;
    if (sunflowerText) sunflowerText.style.transform = textTransform;
    if (lilyText) lilyText.style.transform = textTransform;

    requestAnimationFrame(animateParallax);
  }
  animateParallax();
}

/* ============================================================
   EXPANSION SECTIONS — Interactive Controllers
   ============================================================ */

// Add heart spray styles dynamically to guarantee correct visual presentation
const styleEl = document.createElement('style');
styleEl.innerHTML = `
  .spray-heart {
    position: absolute;
    pointer-events: none;
    font-size: 1.35rem;
    z-index: 1000;
    user-select: none;
    animation: heart-fly 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }
  @keyframes heart-fly {
    0% { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--vx), var(--vy)) scale(var(--scale)) rotate(var(--rot)); opacity: 0; }
  }
`;
document.head.appendChild(styleEl);

// ── 1. FLOATING NAV DOCK ──
function initDockNav() {
  const dock = $('#floating-dock');
  const dockItems = $$('.dock-item');
  const sections = $$('section, footer');
  
  if (!dock) return;
  
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const heroHeight = window.innerHeight;
    
    // Show/hide dock once past the first viewport
    if (y < heroHeight - 150) {
      dock.classList.remove('visible');
    } else {
      dock.classList.add('visible');
    }
    
    // Scroll spy: identify current section
    let activeId = 'hero';
    sections.forEach(sec => {
      const top = sec.offsetTop - 260;
      const height = sec.offsetHeight;
      if (y >= top && y < top + height) {
        activeId = sec.getAttribute('id') || 'hero';
      }
    });
    
    dockItems.forEach(item => {
      const href = item.getAttribute('href').slice(1);
      if (href === activeId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }, { passive: true });
  
  // macOS Dock magnification physics
  const dockContainer = $('.dock-container');
  if (dockContainer) {
    dockContainer.addEventListener('mousemove', (e) => {
      const items = $$('.dock-item', dockContainer);
      const mouseX = e.clientX;
      
      items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemX = rect.left + rect.width / 2;
        const dist = Math.abs(mouseX - itemX);
        
        if (dist < 150) {
          const factor = 1 - (dist / 150);
          const scale = 1 + (factor * 0.35); // Magnify up to 1.35x
          item.style.transform = `scale(${scale})`;
        } else {
          item.style.transform = 'scale(1)';
        }
      });
    });
    
    dockContainer.addEventListener('mouseleave', () => {
      const items = $$('.dock-item', dockContainer);
      items.forEach(item => {
        item.style.transform = '';
      });
    });
  }
}

// ── 2. THINGS I LOVE (HEART SPRAY ON CARD CLICK) ──
function initHeartsSpray() {
  const cards = $$('.love-card');
  cards.forEach(card => {
    card.addEventListener('click', (e) => {
      const rect = card.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        p.className = 'spray-heart';
        p.innerText = '❤️';
        p.style.left = `${clickX}px`;
        p.style.top = `${clickY}px`;
        
        // Upward spraying arc
        const angle = (Math.random() * Math.PI) + Math.PI; 
        const speed = Math.random() * 6 + 4;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        
        p.style.setProperty('--vx', `${vx}px`);
        p.style.setProperty('--vy', `${vy}px`);
        p.style.setProperty('--scale', Math.random() * 0.6 + 0.6);
        p.style.setProperty('--rot', `${Math.random() * 60 - 30}deg`);
        
        card.appendChild(p);
        setTimeout(() => p.remove(), 1200);
      }
    });
  });
}

// ── 3. BUCKET LIST POLAROID SWAPPING ──
function initBucketList() {
  const checkboxes = $$('.checkbox-container input');
  const cards = $$('.stack-card');
  let topZ = 10;
  
  checkboxes.forEach((cb, idx) => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        const targetCard = cards[idx];
        if (targetCard) {
          topZ++;
          targetCard.style.zIndex = topZ;
          // Trigger smooth slide and settle wiggle
          targetCard.style.transform = `rotate(${Math.random() * 10 - 5}deg) translate(30px, -30px) scale(0.95)`;
          setTimeout(() => {
            targetCard.style.transform = `rotate(${Math.random() * 8 - 4}deg) translate(0, 0) scale(0.95)`;
          }, 350);
        }
      }
    });
  });
}

// ── 4. SONG FOR YOU CUSTOM PLAYER ──
function initVinylPlayer() {
  const audio = $('#love-audio');
  const playBtn = $('#player-play-btn');
  const prevBtn = $('#player-prev-btn');
  const nextBtn = $('#player-next-btn');
  const vinyl = $('#player-vinyl');
  const tonearm = $('#player-tonearm');
  const progressBar = $('#player-progress-bar');
  const progressFill = $('#player-progress-fill');
  const progressHandle = $('#player-progress-handle');
  const elapsedText = $('#time-elapsed');
  const totalText = $('#time-total');
  const volumeSlider = $('#volume-slider');
  const lyricLines = $$('.lyric-line');
  const lyricsScroller = $('#lyrics-scroller');
  
  if (!audio) return;
  
  // Set volume from volume bar
  audio.volume = volumeSlider ? volumeSlider.value / 100 : 0.7;
  volumeSlider?.addEventListener('input', () => {
    audio.volume = volumeSlider.value / 100;
  });
  
  const formatTime = (secs) => {
    const min = Math.floor(secs / 60);
    const sec = Math.floor(secs % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };
  
  const togglePlay = () => {
    if (audio.paused) {
      audio.play().catch(e => console.log("Playback engine alert: ", e));
      playBtn.innerText = '⏸️';
      vinyl.style.animationPlayState = 'running';
      tonearm.classList.add('playing');
    } else {
      audio.pause();
      playBtn.innerText = '▶️';
      vinyl.style.animationPlayState = 'paused';
      tonearm.classList.remove('playing');
    }
  };
  
  playBtn?.addEventListener('click', togglePlay);
  
  prevBtn?.addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
  nextBtn?.addEventListener('click', () => { audio.currentTime = Math.min(audio.duration || 129, audio.currentTime + 10); });
  
  audio.addEventListener('timeupdate', () => {
    const cur = audio.currentTime;
    const dur = audio.duration || 129;
    const pct = (cur / dur) * 100;
    
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressHandle) progressHandle.style.left = `${pct}%`;
    if (elapsedText) elapsedText.innerText = formatTime(cur);
    if (totalText && audio.duration) totalText.innerText = formatTime(audio.duration);
    
    // Identify active lyric timestamp line
    let activeIdx = 0;
    lyricLines.forEach((line, i) => {
      const lineTime = parseFloat(line.dataset.time);
      if (cur >= lineTime) {
        activeIdx = i;
      }
    });
    
    lyricLines.forEach((line, i) => {
      if (i === activeIdx) {
        if (!line.classList.contains('active')) {
          line.classList.add('active');
          if (lyricsScroller) {
            const scrollerRect = lyricsScroller.getBoundingClientRect();
            const lineRect = line.getBoundingClientRect();
            const offset = (lineRect.top - scrollerRect.top) + lyricsScroller.scrollTop - (scrollerRect.height / 2) + (lineRect.height / 2);
            lyricsScroller.scrollTo({ top: offset, behavior: 'smooth' });
          }
        }
      } else {
        line.classList.remove('active');
      }
    });
  });
  
  // Scrubber Dragging Interactions
  let isDragging = false;
  
  const setProgress = (e) => {
    const rect = progressBar.getBoundingClientRect();
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clickX = clientX - rect.left;
    const pct = clamp(clickX / rect.width, 0, 1);
    audio.currentTime = pct * (audio.duration || 129);
  };
  
  progressBar?.addEventListener('mousedown', (e) => {
    isDragging = true;
    setProgress(e);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) setProgress(e);
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  progressBar?.addEventListener('touchstart', (e) => {
    isDragging = true;
    setProgress(e);
  }, { passive: true });
  
  progressBar?.addEventListener('touchmove', (e) => {
    if (isDragging) setProgress(e);
  }, { passive: true });
  
  progressBar?.addEventListener('touchend', () => {
    isDragging = false;
  });
}

// ── 5. THINGS I HATE BENTO CARDS ──
function initPlayfulBento() {
  const cards = $$('.hate-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
    });
  });
  
  const btnForgive = $('#btn-forgive');
  const forgiveResponse = $('#forgive-response');
  
  btnForgive?.addEventListener('click', () => {
    forgiveResponse.classList.add('show');
    
    // spray chocolates, roses, and hearts
    const emojis = ['🍫', '🌹', '💖', '🧸', '🍪', '🍨'];
    for (let i = 0; i < 25; i++) {
      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      const p = document.createElement('div');
      p.className = 'spray-heart';
      p.innerText = emoji;
      
      const rect = btnForgive.getBoundingClientRect();
      const clickX = rect.width / 2;
      const clickY = rect.height / 2;
      
      p.style.left = `${clickX}px`;
      p.style.top = `${clickY}px`;
      
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 4;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      p.style.setProperty('--vx', `${vx}px`);
      p.style.setProperty('--vy', `${vy}px`);
      p.style.setProperty('--scale', Math.random() * 0.7 + 0.7);
      p.style.setProperty('--rot', `${Math.random() * 360}deg`);
      
      btnForgive.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  });
}

// ── 6. LETTER ROOM & ENVELOPES ──
function initWaxLetters() {
  const envelopes = $$('.envelope-wrapper');
  const modal = $('#letter-modal');
  const modalHeading = $('#modal-letter-heading');
  const modalBody = $('#modal-letter-body');
  const closeBtn = $('.letter-close-btn');
  
  const letterContents = [
    {
      title: "When you need a smile...",
      body: `<p>My dearest Ananya,</p>
             <p>If you are reading this, I hope it brings a bright smile to your face. You have this magical ability to make everyone around you feel lighter, happier, and completely at peace. But sometimes, you need a reminder of how incredible you are.</p>
             <p>Remember that you are my favorite person to talk to, my favorite laugh to hear, and my absolute favorite thought. Keep smiling, because the world is much brighter when you do. I'm always here cheering you on.</p>`
    },
    {
      title: "When you miss me...",
      body: `<p>Hey cutie,</p>
             <p>I know the distance can feel heavy, and there are times when you just want a warm hug or to have me right next to you. Believe me, I feel exactly the same way every single second.</p>
             <p>But close your eyes for a second. Think of our conversations, the silly jokes, and how comfortable it feels when we speak. I am right there with you in spirit, counting down the days until we don't have to miss each other anymore. I love you so much.</p>`
    },
    {
      title: "When you doubt us...",
      body: `<p>My love,</p>
             <p>If there's ever a quiet evening where the doubts sneak in, or you feel worried about what the future holds—please read this carefully.</p>
             <p>What we share is real, rare, and completely worth fighting for. I am committed to you, to us, and to building our dream life. My heart belongs to you, and that is not going to change. We can face any storm as long as we face it together.</p>`
    }
  ];
  
  envelopes.forEach((envelope, idx) => {
    envelope.addEventListener('click', () => {
      const seal = envelope.querySelector('.envelope-wax-seal');
      const flap = envelope.querySelector('.envelope-flap');
      
      if (seal && flap) {
        seal.style.transform = 'translateX(-50%) scale(0.8) rotate(45deg)';
        seal.style.opacity = '0';
        flap.style.transform = 'rotateX(180deg)';
        flap.style.zIndex = '1';
      }
      
      // Open parchment reader overlay
      setTimeout(() => {
        if (modal && modalHeading && modalBody) {
          modalHeading.innerText = letterContents[idx].title;
          modalBody.innerHTML = letterContents[idx].body;
          modal.classList.add('open');
        }
      }, 550);
    });
  });
  
  const closeModal = () => {
    modal?.classList.remove('open');
    envelopes.forEach(env => {
      const seal = env.querySelector('.envelope-wax-seal');
      const flap = env.querySelector('.envelope-flap');
      if (seal && flap) {
        seal.style.transform = '';
        seal.style.opacity = '';
        flap.style.transform = '';
        flap.style.zIndex = '';
      }
    });
  };
  
  closeBtn?.addEventListener('click', closeModal);
  $('#letter-modal .letter-modal-bg')?.addEventListener('click', closeModal);
}

// ── 7. MOVIES & SHOWS LIST ──
function initMoviesWatchlist() {
  const form = $('#movie-suggest-form');
  const grid = $('#movies-grid');
  
  if (!form || !grid) return;
  
  const loadSavedMovies = () => {
    const saved = JSON.parse(localStorage.getItem('watchlist_suggestions') || '[]');
    saved.forEach(movie => {
      renderMovieCard(movie, true);
    });
  };
  
  const renderMovieCard = (movie) => {
    const card = document.createElement('div');
    card.className = 'movie-card glassmorphic reveal visible';
    
    const posterUrl = movie.poster || `https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=600&auto=format&fit=crop`;
    
    card.innerHTML = `
      <div class="movie-poster" style="background-image: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.8)), url('${posterUrl}');"></div>
      <div class="movie-info">
        <span class="movie-genre">${movie.genre}</span>
        <h3>${movie.title}</h3>
        <div class="movie-rating">★★★★★ <span class="rating-num">5.0</span></div>
        <p class="movie-desc">${movie.note}</p>
        <span class="movie-tag-recommended">${movie.recommendedBy || 'Our Pick'}</span>
      </div>
    `;
    
    grid.insertBefore(card, grid.firstChild);
  };
  
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const title = $('#suggest-title').value.trim();
    const genre = $('#suggest-genre').value.trim();
    const note = $('#suggest-note').value.trim();
    
    if (!title || !genre || !note) return;
    
    const newMovie = {
      title,
      genre,
      note,
      recommendedBy: "Ananya's Pick",
      poster: `https://images.unsplash.com/photo-1542204111-3d0962f459ec?q=80&w=600&auto=format&fit=crop`
    };
    
    const saved = JSON.parse(localStorage.getItem('watchlist_suggestions') || '[]');
    saved.push(newMovie);
    localStorage.setItem('watchlist_suggestions', JSON.stringify(saved));
    
    renderMovieCard(newMovie);
    form.reset();
  });
  
  loadSavedMovies();
}

// ── 8. CANVASES & THE PROPOSAL CLIMAX ──

// Fullscreen Firework Emitter
function initFireworks() {
  const canvas = $('#fireworks-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  function resize() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();
  
  const fireworks = [];
  
  class Firework {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.particles = [];
      const count = 70 + Math.random() * 40;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.particles.push({
          x: this.x,
          y: this.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          decay: Math.random() * 0.015 + 0.008
        });
      }
    }
    draw() {
      this.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
    update() {
      this.particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.045; // gravity
        p.vx *= 0.985; // drag
        p.vy *= 0.985;
        p.alpha -= p.decay;
      });
      this.particles = this.particles.filter(p => p.alpha > 0);
    }
  }
  
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (Math.random() < 0.04 && fireworks.length < 5) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * (canvas.height * 0.45) + 60;
      const colors = ['#e8294a', '#c0162a', '#ffcc00', '#ff66b2', '#ffffff', '#c9a84c'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      fireworks.push(new Firework(x, y, color));
    }
    
    fireworks.forEach((fw, idx) => {
      fw.update();
      fw.draw();
      if (fw.particles.length === 0) {
        fireworks.splice(idx, 1);
      }
    });
    
    requestAnimationFrame(loop);
  }
  
  loop();
}

// Falling rose petals visualizer
function initRosePetals() {
  const canvas = $('#rose-petals-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  function resize() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();
  
  const petals = [];
  
  class Petal {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = -20;
      this.size = Math.random() * 12 + 6;
      this.speed = Math.random() * 1.5 + 0.8;
      this.wind = Math.random() * 0.6 - 0.3;
      this.rotation = Math.random() * Math.PI;
      this.rotationSpeed = Math.random() * 0.02 - 0.01;
      this.color = Math.random() > 0.5 ? '#c0162a' : '#e8294a';
    }
    
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      // Curved heart-leaf petal
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-this.size/2, -this.size/2, -this.size, this.size/3, 0, this.size);
      ctx.bezierCurveTo(this.size, this.size/3, this.size/2, -this.size/2, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    
    update() {
      this.y += this.speed;
      this.x += this.wind;
      this.rotation += this.rotationSpeed;
    }
  }
  
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (petals.length < 60 && Math.random() < 0.12) {
      petals.push(new Petal());
    }
    
    petals.forEach((petal, idx) => {
      petal.update();
      petal.draw();
      if (petal.y > canvas.height + 20) {
        petals.splice(idx, 1);
      }
    });
    
    requestAnimationFrame(loop);
  }
  
  loop();
}

// Interactive Proposal evading engine
// Interactive Proposal evading engine
function initProposalCelebration() {
  const yesBtn = $('#prop-btn-yes');
  const maybeBtn = $('#prop-btn-maybe');
  const noBtn = $('#prop-btn-no');
  const yesPanel = $('#proposal-yes-panel');
  
  if (!yesBtn || !maybeBtn || !noBtn) return;
  
  let evadeCountMaybe = 0;
  let evadeCountNo = 0;
  
  const evade = (btn) => {
    // Generate translation values between -160px and +160px for X, and -60px and +60px for Y
    const rx = (Math.random() - 0.5) * 320;
    const ry = (Math.random() - 0.5) * 120;
    btn.style.transform = `translate(${rx}px, ${ry}px)`;
  };
  
  maybeBtn.addEventListener('mouseenter', () => {
    if (evadeCountMaybe < 3) {
      evade(maybeBtn);
      evadeCountMaybe++;
    }
  });
  maybeBtn.addEventListener('touchstart', (e) => {
    if (evadeCountMaybe < 3) {
      e.preventDefault();
      evade(maybeBtn);
      evadeCountMaybe++;
    }
  }, { passive: false });
  
  noBtn.addEventListener('mouseenter', () => {
    if (evadeCountNo < 3) {
      evade(noBtn);
      evadeCountNo++;
    }
  });
  noBtn.addEventListener('touchstart', (e) => {
    if (evadeCountNo < 3) {
      e.preventDefault();
      evade(noBtn);
      evadeCountNo++;
    }
  }, { passive: false });
  
  // Click actions for evasion buttons after they settle (3 moves)
  maybeBtn.addEventListener('click', () => {
    const card = $('#prop-response-maybe');
    if (card) card.classList.add('show');
  });
  
  noBtn.addEventListener('click', () => {
    const card = $('#prop-response-no');
    if (card) card.classList.add('show');
  });
  
  // Yes Button Click Action
  yesBtn.addEventListener('click', () => {
    // Save progression
    localStorage.setItem('said_yes', 'true');
    
    // Update Book 3 Lock Screen instantly
    if (window.checkBook3LockState) {
      window.checkBook3LockState();
    }
    
    // Show celebration panel
    yesPanel.classList.add('show');
    
    // Launch fireworks & rose petals
    initFireworks();
    initRosePetals();
    
    // Play audio
    const audio = $('#love-audio');
    if (audio) {
      audio.volume = 0.65;
      audio.play().catch(err => console.log("Audio play blocked by browser sandbox: ", err));
    }
    
    // Hearts spray on click
    for (let i = 0; i < 35; i++) {
      const p = document.createElement('div');
      p.className = 'spray-heart';
      p.innerText = '❤️';
      
      const rect = yesBtn.getBoundingClientRect();
      const clickX = rect.left + rect.width / 2 + window.scrollX;
      const clickY = rect.top + rect.height / 2 + window.scrollY;
      
      p.style.position = 'absolute';
      p.style.left = `${clickX}px`;
      p.style.top = `${clickY}px`;
      
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 12 + 6;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      p.style.setProperty('--vx', `${vx}px`);
      p.style.setProperty('--vy', `${vy}px`);
      p.style.setProperty('--scale', Math.random() * 0.8 + 0.6);
      p.style.setProperty('--rot', `${Math.random() * 360}deg`);
      
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  });
}

// ── BOOK 3 LOCK SYSTEM ───────────────────────────────────────
function initBook3Lock() {
  const outer = $('#book3-outer');
  const lockOverlay = $('#book3-lock-overlay');
  const needYesState = $('#lock-state-need-yes');
  const enterPassState = $('#lock-state-enter-password');
  const passwordInput = $('#book3-password');
  const unlockBtn = $('#book3-unlock-btn');
  const errorMsg = $('#book3-error-msg');
  
  if (!outer || !lockOverlay) return;
  
  function checkStates() {
    const saidYes = localStorage.getItem('said_yes') === 'true';
    const unlocked = localStorage.getItem('book3_unlocked') === 'true';
    
    if (unlocked) {
      outer.classList.remove('is-locked');
      lockOverlay.style.opacity = '0';
      setTimeout(() => { lockOverlay.style.display = 'none'; }, 500);
      // Scroll to top of book3 section so user can start flipping from cover
      setTimeout(() => { outer.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 600);
    } else {
      outer.classList.add('is-locked');
      lockOverlay.style.display = 'flex';
      lockOverlay.style.opacity = '1';
      
      if (saidYes) {
        needYesState.style.display = 'none';
        enterPassState.style.display = 'flex';
      } else {
        needYesState.style.display = 'flex';
        enterPassState.style.display = 'none';
      }
    }
  }
  
  checkStates();
  window.checkBook3LockState = checkStates;
  
  unlockBtn?.addEventListener('click', () => {
    const inputVal = passwordInput.value.trim().toLowerCase();
    const correctAnswers = [
      'your birthday',
      '1301',
      '13-01',
      '13/01',
      '13 jan',
      '13 january',
      'january 13',
      'january 13th',
      'jan 13'
    ];
    
    if (correctAnswers.includes(inputVal)) {
      localStorage.setItem('book3_unlocked', 'true');
      checkStates();
      // Smooth scroll back to cover page of book 3
      outer.scrollIntoView({ behavior: 'smooth' });
    } else {
      errorMsg.style.display = 'block';
      passwordInput.value = '';
      setTimeout(() => { errorMsg.style.display = 'none'; }, 3000);
    }
  });
  
  passwordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      unlockBtn.click();
    }
  });
}

// ── PROPOSAL FLOATING PARTICLES ──────────────────────────────
function initProposalParticles() {
  const container = $('#proposal-particles');
  if (!container) return;
  
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'proposal-particle';
    const size = Math.random() * 6 + 3;
    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${Math.random() * 100}vw;
      bottom: -20px;
      background: rgba(192, 22, 42, ${Math.random() * 0.12 + 0.05});
      animation-duration: ${8 + Math.random() * 10}s;
      animation-delay: ${Math.random() * 8}s;
      --wind: ${Math.random() * 80 - 40}px;
    `;
    container.appendChild(p);
  }
}

// ── BTS MODAL SYSTEM ─────────────────────────────────────────
function initBTSModal() {
  const btsBtn = $('#bts-btn');
  const btsModal = $('#bts-modal');
  const closeBtn = $('#bts-close-btn');
  
  if (!btsBtn || !btsModal || !closeBtn) return;
  
  btsBtn.addEventListener('click', () => {
    btsModal.classList.add('show');
  });
  
  closeBtn.addEventListener('click', () => {
    btsModal.classList.remove('show');
  });
  
  btsModal.addEventListener('click', (e) => {
    if (e.target === btsModal) {
      btsModal.classList.remove('show');
    }
  });
}


// ── SCROLL VIDEO REEL ─────────────────────────────────────────
function initReelScroll() {
  const section  = $('#reel-section');
  const track    = $('#reel-track');
  const fill     = $('#reel-progress-fill');

  if (!section || !track) return;

  // Build sprocket holes to fill the full width
  ['sprockets-top', 'sprockets-bottom'].forEach(id => {
    const inner = $(`#${id}`);
    if (!inner) return;
    const count = Math.ceil(window.innerWidth / 44) + 4;
    inner.innerHTML = Array.from({ length: count }, () => '<div class="sprocket-hole"></div>').join('');
  });

  window.addEventListener('scroll', () => {
    const rect       = section.getBoundingClientRect();
    const sectionTop = rect.top + window.scrollY;
    const scrollable = section.offsetHeight - window.innerHeight;
    const raw        = clamp((window.scrollY - sectionTop) / scrollable, 0, 1);

    // Total translateX needed = track total width minus one viewport width
    const trackW   = track.scrollWidth;
    const viewW    = window.innerWidth;
    const maxShift = trackW - viewW + viewW * 0.16; // leave some lead-in padding
    const shiftX   = raw * maxShift;

    track.style.transform = `translateX(-${shiftX}px)`;

    if (fill) fill.style.width = (raw * 100) + '%';
  }, { passive: true });
}


// ── SCROLL-DRIVEN PAGE-FLIP BOOK ─────────────────────────────
function initScrollBook(bookId) {
  const outer    = $(`#${bookId}-outer`);
  const sticky   = $(`#${bookId}-sticky`);
  const counter  = $(`#${bookId}-counter`);
  const dotsWrap = $(`#${bookId}-dots`);

  if (!outer || !sticky) return;

  const pages = [...sticky.querySelectorAll('.book-page')];
  const total = pages.length;

  // Per-page state tracking
  const pState = pages.map((el, i) => ({
    el,
    flipped: false,
    zBase: (total - i) * 10,
    timer: null
  }));

  // Set initial z-indices: page 0 on top
  pState.forEach(ps => { ps.el.style.zIndex = ps.zBase; });

  // Build progress dots
  if (dotsWrap) {
    pages.forEach((_, i) => {
      const d = document.createElement('div');
      d.className = 'bk-dot' + (i === 0 ? ' active' : '');
      dotsWrap.appendChild(d);
    });
  }

  function updateUI(idx) {
    if (counter) {
      counter.textContent =
        String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    }
    dotsWrap && [...dotsWrap.querySelectorAll('.bk-dot')].forEach((d, i) => {
      d.classList.toggle('active', i === idx);
    });
  }

  function flipForward(i) {
    const ps = pState[i];
    if (ps.flipped) return;
    ps.flipped = true;
    if (ps.timer) clearTimeout(ps.timer);

    ps.el.style.transition = '';
    ps.el.style.zIndex = ps.zBase;
    ps.el.classList.add('is-turning', 'flipped');

    ps.timer = setTimeout(() => {
      ps.el.classList.remove('is-turning');
      ps.el.style.zIndex = 0;       // send behind everything
    }, 900);
  }

  function flipBack(i) {
    const ps = pState[i];
    if (!ps.flipped) return;
    ps.flipped = false;
    if (ps.timer) clearTimeout(ps.timer);

    // Step 1 — snap to flipped without animation
    ps.el.style.transition = 'none';
    ps.el.style.zIndex = (total + 5) * 10;   // bring to very front
    ps.el.classList.add('flipped');
    void ps.el.offsetWidth;                   // force reflow

    // Step 2 — animate back to unflipped
    ps.el.style.transition = '';
    ps.el.classList.add('is-turning');
    ps.el.classList.remove('flipped');

    ps.timer = setTimeout(() => {
      ps.el.classList.remove('is-turning');
      ps.el.style.zIndex = ps.zBase;          // restore proper depth
    }, 900);
  }

  let lastTarget = 0;

  window.addEventListener('scroll', () => {
    const sectionTop = outer.getBoundingClientRect().top + window.scrollY;
    const scrollable = outer.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;

    const raw = clamp((window.scrollY - sectionTop) / scrollable, 0, 1);

    // Map raw 0..1 to 0..(total-1) page index
    const target = Math.min(Math.floor(raw * (total - 0.001)), total - 1);
    if (target === lastTarget) return;

    if (target > lastTarget) {
      for (let i = lastTarget; i < target; i++) flipForward(i);
    } else {
      for (let i = lastTarget - 1; i >= target; i--) flipBack(i);
    }

    lastTarget = target;
    updateUI(target);
  }, { passive: true });

  updateUI(0);
}


// ── MUSIC PILL (Barbaad) ─────────────────────────────────────
function initMusicPill() {
  const audio = $('#love-audio');
  const pill = $('#music-pill');
  const btn = $('#music-toggle-btn');
  const playSvg = $('#music-play-svg');
  const pauseSvg = $('#music-pause-svg');
  const proposalSection = $('#proposal-section');

  if (!audio || !pill || !btn) return;

  audio.volume = 0.12;
  let playing = false;

  function setPlaying(state) {
    playing = state;
    playSvg.style.display = state ? 'none' : 'block';
    pauseSvg.style.display = state ? 'block' : 'none';
    pill.classList.toggle('is-playing', state);
  }

  btn.addEventListener('click', () => {
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  });

  // Auto-play when proposal section enters viewport
  if (proposalSection) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting && !playing) {
          audio.play().then(() => {
            setPlaying(true);
            pill.classList.add('visible');
          }).catch(() => {});
        }
      });
    }, { threshold: 0.1 });
    obs.observe(proposalSection);
  }

  // Always show pill after scroll past hero
  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      pill.classList.add('visible');
    } else {
      pill.classList.remove('visible');
    }
  }, { passive: true });
}

// ── STARTUP COOKING POPUP ────────────────────────────────────
function initStartupPopup() {
  const modal = $('#startup-modal');
  const btn = $('#startup-modal-btn');
  if (!modal || !btn) return;

  // Show modal after loading finishes and a brief delay
  setTimeout(() => {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }, 3200);

  btn.addEventListener('click', () => {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    }
  });
}

// ── INIT ALL ─────────────────────────────────────────────────
async function init() {
  initLoader();
  initCursor();
  initScrollProgress();
  initReveal();
  initNavTracker();
  initHeroParallax();
  await initHeroCollage();
  initScrollTransition();
  initSmoothAnchors();
  initScrollWipe();
  initMouseParallax();
  initReelScroll();
  initScrollBook('book1');
  initScrollBook('book2');
  initScrollBook('proposal');
  initBTSModal();

  // New interactive elements init
  initDockNav();
  initHeartsSpray();
  initBucketList();
  initVinylPlayer();
  initPlayfulBento();
  initWaxLetters();
  initMoviesWatchlist();
  initProposalCelebration();
  initStartupPopup();

  // Barbaad music pill
  initMusicPill();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

