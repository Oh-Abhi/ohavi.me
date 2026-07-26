/* ═══════════════════════════════════════════════
   11:11 TIMELINE COLLECTION — Controller v21
   Light Cream Glassmorphism, 18 Real Screenshots, Lightbox & Purpose Modal
   ═══════════════════════════════════════════════ */

let collectionData = [];

document.addEventListener("DOMContentLoaded", () => {
  initStarsCanvas();
  initScrollEffects();
  initPurposeModal();
  fetchCollection();
});

// Ambient Star Field Canvas FX (Tuned for Warm Light Mode)
function initStarsCanvas() {
  const canvas = document.getElementById("starsCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const stars = Array.from({ length: 50 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: Math.random() * 2 + 0.8,
    alpha: Math.random() * 0.6 + 0.2,
    speed: Math.random() * 0.006 + 0.002,
    offset: Math.random() * Math.PI * 2
  }));

  function animate(t) {
    ctx.clearRect(0, 0, width, height);

    stars.forEach(star => {
      star.alpha = 0.25 + Math.sin(t * star.speed + star.offset) * 0.35;
      ctx.fillStyle = `rgba(233, 169, 144, ${Math.max(0.1, star.alpha)})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

// Scroll Effects (Scroll Text Banner + Parallax)
function initScrollEffects() {
  const banner = document.getElementById("scrollTextBanner");

  window.addEventListener("scroll", () => {
    if (banner) {
      const rect = banner.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.85) {
        banner.classList.add("visible");
      }
    }
  });
}

// Purpose Modal (First Time Auto + Header Info Button Toggle)
function initPurposeModal() {
  const modal = document.getElementById("purposeModal");
  const closeBtn = document.getElementById("closePurposeModalBtn");
  const openBtn = document.getElementById("openPurposeBtn");

  const hasSeen = localStorage.getItem("has_seen_1111_purpose");

  if (!hasSeen && modal) {
    setTimeout(() => modal.classList.add("open"), 800);
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.remove("open");
      localStorage.setItem("has_seen_1111_purpose", "true");
    });
  }

  if (openBtn && modal) {
    openBtn.addEventListener("click", () => {
      modal.classList.add("open");
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.remove("open");
    });
  }
}

const FALLBACK_1111 = [
  { filename: "Screenshot_20260724_231108.jpg", date: "Jul 24, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260724_111111.jpg", date: "Jul 24, 2026", time: "11:11 AM" },
  { filename: "Screenshot_20260724_111105.jpg", date: "Jul 24, 2026", time: "11:11 AM" },
  { filename: "Screenshot_20260723_111102.jpg", date: "Jul 23, 2026", time: "11:11 AM" },
  { filename: "Screenshot_20260721_231108.jpg", date: "Jul 21, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260719_231105.jpg", date: "Jul 19, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260718_231123.jpg", date: "Jul 18, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260716_231103.jpg", date: "Jul 16, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260713_111110.jpg", date: "Jul 13, 2026", time: "11:11 AM" },
  { filename: "Screenshot_20260712_231147.jpg", date: "Jul 12, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260709_231107.jpg", date: "Jul 09, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260707_111106_com.supercell.clashroyale.jpg", date: "Jul 07, 2026", time: "11:11 AM" },
  { filename: "Screenshot_20260706_231123.jpg", date: "Jul 06, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260630_111142.jpg", date: "Jun 30, 2026", time: "11:11 AM" },
  { filename: "Screenshot_20260628_111122.jpg", date: "Jun 28, 2026", time: "11:11 AM" },
  { filename: "Screenshot_20260622_231113.jpg", date: "Jun 22, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260620_231118.jpg", date: "Jun 20, 2026", time: "11:11 PM" },
  { filename: "Screenshot_20260619_231134.jpg", date: "Jun 19, 2026", time: "11:11 PM" }
].map((item, i) => ({
  id: `1111-${i}`,
  url: `/111/${item.filename}`,
  date: item.date,
  time: item.time,
  note: "A quiet moment saved at 11:11."
}));

// Fetch 11:11 Collection from API (/api/11-11)
async function fetchCollection() {
  const grid = document.getElementById("timelineGrid");
  const counter = document.getElementById("totalWishesCount");

  try {
    const res = await fetch("/api/11-11");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        collectionData = data;
      }
    }
  } catch (e) {
    console.warn("Could not load /api/11-11:", e);
  }

  if (!collectionData || collectionData.length === 0) {
    collectionData = FALLBACK_1111;
  }

  if (counter) counter.textContent = collectionData.length;
  renderTimeline(collectionData);
}

// Render Timeline Grid
function renderTimeline(items) {
  const grid = document.getElementById("timelineGrid");
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = `<div style="padding:40px;text-align:center;color:var(--muted);grid-column:1/-1;">No 11:11 screenshots found in folder.</div>`;
    return;
  }

  grid.innerHTML = items.map((item, idx) => {
    return `
      <div class="shot-card" data-idx="${idx}">
        <div class="shot-preview-wrap">
          <img src="${item.url}" alt="11:11 Wish" loading="lazy" />
        </div>
        <div class="shot-meta">
          <div class="shot-date-row">
            <span class="shot-date">${item.date}</span>
            <span class="shot-badge">${item.time}</span>
          </div>
          ${item.note ? `<div class="shot-note">${item.note}</div>` : `<div class="shot-note">Wish #${items.length - idx} made for her.</div>`}
        </div>
      </div>
    `;
  }).join("");

  // Staggered Fade-Up Animation
  const cards = grid.querySelectorAll(".shot-card");
  cards.forEach((card, idx) => {
    setTimeout(() => {
      card.classList.add("appear");
    }, idx * 60);

    card.addEventListener("click", () => {
      openLightbox(items[card.dataset.idx]);
    });
  });
}

// Fullscreen Lightbox Modal Handler
function openLightbox(item) {
  const modal = document.getElementById("lightboxModal");
  const imgWrap = document.getElementById("lightboxImgWrap");
  const clockEl = document.getElementById("lightboxClock");
  const dateEl = document.getElementById("lightboxDate");
  const noteEl = document.getElementById("lightboxNote");
  const closeBtn = document.getElementById("closeLightboxBtn");

  if (!modal || !item) return;

  imgWrap.innerHTML = `<img src="${item.url}" alt="11:11 Screenshot" />`;

  if (clockEl) clockEl.textContent = item.time || "11:11 PM";
  if (dateEl) dateEl.textContent = item.date || "November 11";
  if (noteEl) noteEl.textContent = item.note || "A silent wish made for the same person at 11:11.";

  modal.classList.add("open");

  if (closeBtn) {
    closeBtn.onclick = () => modal.classList.remove("open");
  }

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove("open");
  };
}
