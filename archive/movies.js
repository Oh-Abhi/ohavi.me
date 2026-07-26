/* ═══════════════════════════════════════════════
   MOVIES & WATCHLIST — App Controller v1.0
   Cinema room, playlists/collections, iTunes API, trailer modal
   ═══════════════════════════════════════════════ */

let moviesCatalog = [];
let moviePlaylists = [];
let activeMovieFilter = "all";
let movieSearchQuery = "";

// View state
let movieViewMode = localStorage.getItem("forher_movieViewMode") || "grid"; // "grid" | "list"
let movieCardSize = localStorage.getItem("forher_movieCardSize") || "md";   // "sm" | "md" | "lg"
let collectionMode = localStorage.getItem("forher_movieCollMode") || "cards"; // "cards" | "rows"

let selectedEditMovieId = null;

// Helpers
function showMovieToast(msg) {
  const t = document.getElementById("toastWidget");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// 1. DATA INITIALIZATION & BACKEND SYNC
async function loadMovieData() {
  try {
    const res = await fetch('/api/movies');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        moviesCatalog = data;
      } else {
        moviesCatalog = data.movies || [];
        moviePlaylists = data.playlists || [];
      }
    }
  } catch (e) {
    console.warn("Failed to fetch movies from server, using localStorage:", e);
    const localM = localStorage.getItem("forher_movies_catalog");
    const localP = localStorage.getItem("forher_movies_playlists");
    if (localM) moviesCatalog = JSON.parse(localM);
    if (localP) moviePlaylists = JSON.parse(localP);
  }

  renderAll();
}

async function saveMovieData() {
  localStorage.setItem("forher_movies_catalog", JSON.stringify(moviesCatalog));
  localStorage.setItem("forher_movies_playlists", JSON.stringify(moviePlaylists));

  try {
    await fetch('/api/movies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movies: moviesCatalog, playlists: moviePlaylists })
    });
  } catch (e) {
    console.warn("Error persisting movies to backend server:", e);
  }
}

// 2. RENDER FUNCTIONS
function renderAll() {
  renderStats();
  renderMovieGrid();
  renderCollections();
}

function renderStats() {
  const favCount = moviesCatalog.filter(m => m.favorite).length;
  const watchedCount = moviesCatalog.filter(m => m.watched).length;
  
  const favEl = document.getElementById("statFavMovies");
  const watEl = document.getElementById("statWatchedMovies");
  const totEl = document.getElementById("statTotalMovies");
  const colEl = document.getElementById("statCollections");

  if (favEl) favEl.textContent = favCount;
  if (watEl) watEl.textContent = watchedCount;
  if (totEl) totEl.textContent = moviesCatalog.length;
  if (colEl) colEl.textContent = moviePlaylists.length;
}

function getFilteredMovies() {
  return moviesCatalog.filter(m => {
    // Filter chip check
    if (activeMovieFilter === "favorites" && !m.favorite) return false;
    if (activeMovieFilter === "watched" && !m.watched) return false;
    if (activeMovieFilter === "towatch" && m.watched) return false;
    if (["Romance", "Drama", "Sci-Fi", "Animation"].includes(activeMovieFilter)) {
      if (!m.genre || !m.genre.toLowerCase().includes(activeMovieFilter.toLowerCase())) return false;
    }

    // Search query check
    if (movieSearchQuery.trim()) {
      const q = movieSearchQuery.toLowerCase();
      const titleMatch = m.title && m.title.toLowerCase().includes(q);
      const dirMatch = m.director && m.director.toLowerCase().includes(q);
      const genreMatch = m.genre && m.genre.toLowerCase().includes(q);
      const reviewMatch = m.review && m.review.toLowerCase().includes(q);
      if (!titleMatch && !dirMatch && !genreMatch && !reviewMatch) return false;
    }

    return true;
  });
}

function renderMovieGrid() {
  const grid = document.getElementById("moviesGrid");
  const empty = document.getElementById("moviesEmpty");
  if (!grid) return;

  const filtered = getFilteredMovies();

  // Apply View Mode & Card Size
  grid.className = `movie-grid size-${movieCardSize} ${movieViewMode === "list" ? "list-view" : ""}`;

  if (filtered.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.classList.add("show");
    return;
  }

  if (empty) empty.classList.remove("show");

  grid.innerHTML = filtered.map(m => {
    const poster = m.poster || "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop";
    const starsHtml = "★".repeat(m.rating || 5) + "☆".repeat(5 - (m.rating || 5));

    return `
      <div class="m-card" data-id="${m.id}">
        <div class="m-poster-w">
          <img src="${poster}" alt="${m.title}" loading="lazy" />
          
          <div class="m-badge-top-r">
            <button class="m-fav-btn ${m.favorite ? 'is-fav' : ''}" onclick="toggleMovieFav(event, '${m.id}')" title="Favorite">
              ${m.favorite ? '❤️' : '🤍'}
            </button>
          </div>

          <div class="m-badge-top-l">
            <button class="m-watched-btn ${m.watched ? 'is-watched' : ''}" onclick="toggleMovieWatched(event, '${m.id}')">
              ${m.watched ? '✓ Watched' : '+ Watch'}
            </button>
          </div>

          <div class="m-play-overlay" onclick="openTrailerModal(event, '${m.id}')">
            <button class="m-play-btn" title="Watch Trailer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <span class="m-play-lbl">Play Trailer</span>
          </div>
        </div>

        <div class="m-card-body" onclick="openEditMovieModal('${m.id}')">
          <div class="m-card-top-info">
            <div class="m-title">${m.title}</div>
          </div>
          
          <div class="m-meta">
            <span>${m.year || ''}</span>
            <span>•</span>
            <span>${m.genre || 'Film'}</span>
            ${m.recommendedBy ? `<span>•</span><span style="color:var(--warm);font-weight:700;">${m.recommendedBy}</span>` : ''}
          </div>

          <div class="m-rating">
            <span>${starsHtml}</span>
            <span class="m-rating-num">${m.rating || 5}.0</span>
          </div>

          ${m.review ? `<div class="m-review-box">"${m.review}"</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll(".m-card").forEach(setupTilt);
}

// Card Mouse Tracking Tilt Physics
function setupTilt(card) {
  if (!card) return;
  card.addEventListener("mousemove", e => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    card.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * 12}deg) rotateY(${(px - 0.5) * 12}deg) translateY(-5px) scale(1.02)`;
  });
  card.addEventListener("mouseleave", () => {
    card.style.transform = "";
  });
}

function renderCollections() {
  const container = document.getElementById("collectionsContainer");
  if (!container) return;

  if (moviePlaylists.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--muted);font-size:13px;background:rgba(255,255,255,0.6);border:1px solid var(--border-solid);border-radius:20px;">
        No collections yet. Click "+ New Collection" to organize your movies!
      </div>
    `;
    return;
  }

  if (collectionMode === "cards") {
    container.innerHTML = `
      <div class="pl-cards-grid">
        ${moviePlaylists.map(pl => {
          const mList = (pl.movieIds || []).map(id => moviesCatalog.find(m => m.id === id)).filter(Boolean);
          const posters = mList.map(m => m.poster).filter(Boolean);

          return `
            <div class="pl-card-item" style="cursor:pointer;" onclick="openCollectionDetail('${pl.id}')">
              <div class="m-coll-stack">
                ${posters.length > 0 ? posters.slice(0, 3).map((p, idx) => `
                  <div class="m-coll-poster">
                    <img src="${p}" alt="" />
                  </div>
                `).join('') : `
                  <div class="m-coll-poster" style="background:#222;display:flex;align-items:center;justify-content:center;color:#fff;">🍿</div>
                `}
              </div>
              <div class="pl-card-body">
                <div class="pl-card-title">${pl.name}</div>
                <div class="pl-card-count">${mList.length} Films</div>
                <div class="pl-card-desc">${pl.description || 'Curated movie playlist'}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else {
    // Row / Accordion View
    container.innerHTML = `
      <div class="pl-rows-list">
        ${moviePlaylists.map(pl => {
          const mList = (pl.movieIds || []).map(id => moviesCatalog.find(m => m.id === id)).filter(Boolean);
          return `
            <div class="pl-row-item">
              <div class="pl-row-header">
                <div>
                  <h4 style="font-family:var(--serif);font-size:16px;font-weight:700;color:var(--text);">${pl.name}</h4>
                  <p style="font-size:12px;color:var(--muted);">${pl.description || ''} • ${mList.length} films</p>
                </div>
              </div>
              <div class="pl-row-movies" style="display:flex;gap:12px;overflow-x:auto;padding:12px 0;">
                ${mList.map(m => `
                  <div style="width:100px;flex-shrink:0;cursor:pointer;" onclick="openEditMovieModal('${m.id}')">
                    <div style="width:100%;aspect-ratio:2/3;border-radius:10px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.1);">
                      <img src="${m.poster}" alt="" style="width:100%;height:100%;object-fit:cover;" />
                    </div>
                    <div style="font-size:11px;font-weight:700;color:var(--text);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.title}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}

// 3. EVENT ACTIONS & TOGGLES
function toggleMovieFav(event, id) {
  event.stopPropagation();
  const m = moviesCatalog.find(item => item.id === id);
  if (!m) return;
  m.favorite = !m.favorite;
  saveMovieData();
  renderAll();
  showMovieToast(m.favorite ? `Added "${m.title}" to Favorites ❤️` : `Removed "${m.title}" from Favorites`);
}

function toggleMovieWatched(event, id) {
  event.stopPropagation();
  const m = moviesCatalog.find(item => item.id === id);
  if (!m) return;
  m.watched = !m.watched;
  saveMovieData();
  renderAll();
  showMovieToast(m.watched ? `Marked "${m.title}" as Watched ✅` : `Marked "${m.title}" as To-Watch 🍿`);
}

// 4. API SEARCH & ADD MOVIE
let apiSearchTimer = null;
async function searchMoviesAPI(query) {
  const container = document.getElementById("apiSearchResults");
  if (!container) return;

  if (!query || !query.trim()) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px 0;font-size:13px;">
        Type a film name above to search iTunes Movie Database.
      </div>
    `;
    return;
  }

  container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);">Searching iTunes database…</div>`;

  try {
    const res = await fetch(`/api/search-movies?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const results = await res.json();
      if (!Array.isArray(results) || results.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);">No movies found for "${query}"</div>`;
        return;
      }

      container.innerHTML = results.map(item => `
        <div style="display:flex;gap:12px;padding:10px;background:rgba(255,255,255,0.7);border:1px solid var(--border-solid);border-radius:14px;align-items:center;">
          <img src="${item.poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop'}" style="width:50px;height:75px;object-fit:cover;border-radius:8px;flex-shrink:0;" alt="" />
          <div style="flex:1;min-width:0;">
            <div style="font-family:var(--serif);font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title}</div>
            <div style="font-size:11px;color:var(--muted);">${item.year ? item.year + ' • ' : ''}${item.director || 'Movie'}</div>
            <div style="font-size:11px;color:var(--warm);margin-top:2px;">${item.genre || ''}</div>
          </div>
          <button class="btn-s" onclick="addSearchedMovie(${JSON.stringify(item).replace(/"/g, '&quot;')})">
            + Add
          </button>
        </div>
      `).join('');
    }
  } catch (e) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted);">Error searching movies</div>`;
  }
}

function addSearchedMovie(item) {
  const newMovie = {
    id: `movie-${Date.now()}`,
    title: item.title,
    director: item.director || '',
    year: item.year || '',
    genre: item.genre || 'Film',
    rating: 5,
    poster: item.poster || '',
    overview: item.overview || '',
    previewUrl: item.previewUrl || '',
    favorite: false,
    watched: false,
    recommendedBy: 'Watchlist',
    review: '',
    addedAt: Date.now()
  };

  moviesCatalog.unshift(newMovie);
  saveMovieData();
  renderAll();
  closeAddMovieModal();
  showMovieToast(`Added "${newMovie.title}" to Movie Room! 🍿`);
}

// 5. MODAL HANDLERS & EVENTS
function openAddMovieModal() {
  const m = document.getElementById("addMovieModal");
  if (m) m.classList.add("open");
}
function closeAddMovieModal() {
  const m = document.getElementById("addMovieModal");
  if (m) m.classList.remove("open");
}

function openEditMovieModal(id) {
  selectedEditMovieId = id;
  const m = moviesCatalog.find(item => item.id === id);
  if (!m) return;

  const modal = document.getElementById("editMovieModal");
  const titleEl = document.getElementById("editModalTitle");
  const idEl = document.getElementById("editMovieId");
  const ratingEl = document.getElementById("editMovieRating");
  const reviewEl = document.getElementById("editMovieReview");
  const recEl = document.getElementById("editMovieRec");

  if (titleEl) titleEl.textContent = `Edit "${m.title}"`;
  if (idEl) idEl.value = m.id;
  if (ratingEl) ratingEl.value = m.rating || 5;
  if (reviewEl) reviewEl.value = m.review || '';
  if (recEl) recEl.value = m.recommendedBy || '';

  if (modal) modal.classList.add("open");
}

function closeEditMovieModal() {
  const m = document.getElementById("editMovieModal");
  if (m) m.classList.remove("open");
}

function openTrailerModal(event, id) {
  if (event) event.stopPropagation();
  const m = moviesCatalog.find(item => item.id === id);
  if (!m) return;

  const modal = document.getElementById("trailerModal");
  const titleEl = document.getElementById("trailerModalTitle");
  const metaEl = document.getElementById("trailerModalMeta");
  const container = document.getElementById("trailerVideoContainer");

  if (titleEl) titleEl.textContent = `${m.title} (${m.year || ''})`;
  if (metaEl) metaEl.textContent = `${m.director || ''} • ${m.genre || ''}`;

  if (container) {
    if (m.youtubeId) {
      container.innerHTML = `<iframe src="https://www.youtube.com/embed/${m.youtubeId}?autoplay=1" style="width:100%;height:100%;border:none;" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    } else if (m.previewUrl) {
      container.innerHTML = `<video src="${m.previewUrl}" controls autoplay style="width:100%;height:100%;object-fit:contain;"></video>`;
    } else {
      // Fallback YouTube trailer search embed
      const ytQuery = encodeURIComponent(`${m.title} ${m.year || ''} official trailer`);
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px;">
          <p style="font-size:16px;font-weight:700;margin-bottom:12px;">Official Trailer Search</p>
          <a href="https://www.youtube.com/results?search_query=${ytQuery}" target="_blank" class="btn-s" style="background:var(--warm);color:#fff;">
            ▶️ Watch Trailer on YouTube
          </a>
        </div>
      `;
    }
  }

  if (modal) modal.classList.add("open");
}

function closeTrailerModal() {
  const modal = document.getElementById("trailerModal");
  const container = document.getElementById("trailerVideoContainer");
  if (container) container.innerHTML = '';
  if (modal) modal.classList.remove("open");
}

// 6. INITIALIZATION & EVENT BINDINGS
document.addEventListener("DOMContentLoaded", () => {
  loadMovieData();

  // Filter chips
  const filterChips = document.getElementById("filterChips");
  if (filterChips) {
    filterChips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      filterChips.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
      btn.classList.add("on");
      activeMovieFilter = btn.dataset.filter || "all";
      renderMovieGrid();
    });
  }

  // Header movie search input
  const headerSearch = document.getElementById("movieSearchInput");
  if (headerSearch) {
    headerSearch.addEventListener("input", (e) => {
      movieSearchQuery = e.target.value;
      renderMovieGrid();
    });
  }

  // View Mode switcher (Grid vs List)
  const gridBtn = document.getElementById("viewModeGridBtn");
  const listBtn = document.getElementById("viewModeListBtn");

  if (gridBtn && listBtn) {
    gridBtn.addEventListener("click", () => {
      movieViewMode = "grid";
      localStorage.setItem("forher_movieViewMode", "grid");
      gridBtn.classList.add("on");
      listBtn.classList.remove("on");
      renderMovieGrid();
    });
    listBtn.addEventListener("click", () => {
      movieViewMode = "list";
      localStorage.setItem("forher_movieViewMode", "list");
      listBtn.classList.add("on");
      gridBtn.classList.remove("on");
      renderMovieGrid();
    });
  }

  // Card Size Group (S, M, L)
  const sizeGroup = document.getElementById("cardSizeGroup");
  if (sizeGroup) {
    sizeGroup.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn || !btn.dataset.size) return;
      sizeGroup.querySelectorAll("button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      movieCardSize = btn.dataset.size;
      localStorage.setItem("forher_movieCardSize", movieCardSize);
      renderMovieGrid();
    });
  }

  // Collection View Mode (Cards vs Rows)
  const plCardsBtn = document.getElementById("plViewCardsBtn");
  const plRowBtn = document.getElementById("plViewRowBtn");
  if (plCardsBtn && plRowBtn) {
    plCardsBtn.addEventListener("click", () => {
      collectionMode = "cards";
      localStorage.setItem("forher_movieCollMode", "cards");
      plCardsBtn.classList.add("on");
      plRowBtn.classList.remove("on");
      renderCollections();
    });
    plRowBtn.addEventListener("click", () => {
      collectionMode = "rows";
      localStorage.setItem("forher_movieCollMode", "rows");
      plRowBtn.classList.add("on");
      plCardsBtn.classList.remove("on");
      renderCollections();
    });
  }

  // Modal Open/Close Triggers
  const openAddBtn = document.getElementById("openAddMovieBtn");
  const closeAddBtn = document.getElementById("closeAddMovieModal");
  if (openAddBtn) openAddBtn.addEventListener("click", openAddMovieModal);
  if (closeAddBtn) closeAddBtn.addEventListener("click", closeAddMovieModal);

  const closeEditBtn = document.getElementById("closeEditMovieModal");
  if (closeEditBtn) closeEditBtn.addEventListener("click", closeEditMovieModal);

  const closeTrailerBtn = document.getElementById("closeTrailerModal");
  if (closeTrailerBtn) closeTrailerBtn.addEventListener("click", closeTrailerModal);

  // Live iTunes API Search
  const apiSearchInput = document.getElementById("apiMovieSearchInput");
  if (apiSearchInput) {
    apiSearchInput.addEventListener("input", (e) => {
      clearTimeout(apiSearchTimer);
      const q = e.target.value;
      apiSearchTimer = setTimeout(() => searchMoviesAPI(q), 350);
    });
  }

  // Manual Movie Form toggle
  const toggleManualBtn = document.getElementById("toggleManualAddBtn");
  const manualForm = document.getElementById("manualMovieForm");
  if (toggleManualBtn && manualForm) {
    toggleManualBtn.addEventListener("click", () => {
      manualForm.style.display = manualForm.style.display === "none" ? "flex" : "none";
    });
  }

  if (manualForm) {
    manualForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = document.getElementById("mAddTitle").value;
      const director = document.getElementById("mAddDirector").value;
      const year = document.getElementById("mAddYear").value;
      const genre = document.getElementById("mAddGenre").value;
      const rec = document.getElementById("mAddRec").value;
      const poster = document.getElementById("mAddPoster").value;
      const note = document.getElementById("mAddNote").value;

      const newMovie = {
        id: `movie-${Date.now()}`,
        title, director, year,
        genre: genre || 'Film',
        rating: 5,
        poster: poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop',
        overview: note || '',
        review: note || '',
        recommendedBy: rec || 'Watchlist',
        favorite: false,
        watched: false,
        addedAt: Date.now()
      };

      moviesCatalog.unshift(newMovie);
      saveMovieData();
      renderAll();
      closeAddMovieModal();
      showMovieToast(`Added "${title}" to Movie Room! 🍿`);
    });
  }

  // Save Edit Movie
  const saveEditBtn = document.getElementById("saveEditMovieBtn");
  if (saveEditBtn) {
    saveEditBtn.addEventListener("click", () => {
      if (!selectedEditMovieId) return;
      const m = moviesCatalog.find(item => item.id === selectedEditMovieId);
      if (!m) return;

      m.rating = parseInt(document.getElementById("editMovieRating").value, 10);
      m.review = document.getElementById("editMovieReview").value;
      m.recommendedBy = document.getElementById("editMovieRec").value;

      saveMovieData();
      renderAll();
      closeEditMovieModal();
      showMovieToast(`Updated "${m.title}" review! ✨`);
    });
  }

  // Delete Movie
  const delMovieBtn = document.getElementById("deleteMovieBtn");
  if (delMovieBtn) {
    delMovieBtn.addEventListener("click", () => {
      if (!selectedEditMovieId) return;
      const m = moviesCatalog.find(item => item.id === selectedEditMovieId);
      if (!m) return;

      moviesCatalog = moviesCatalog.filter(item => item.id !== selectedEditMovieId);
      saveMovieData();
      renderAll();
      closeEditMovieModal();
      showMovieToast(`Deleted "${m.title}"`);
    });
  }

  // Create Collection
  const openCreateCollBtn = document.getElementById("openCreateCollectionBtn");
  const createCollModal = document.getElementById("createCollectionModal");
  const closeCreateCollBtn = document.getElementById("closeCreateCollectionModal");
  const createCollForm = document.getElementById("createCollectionForm");

  if (openCreateCollBtn && createCollModal) {
    openCreateCollBtn.addEventListener("click", () => createCollModal.classList.add("open"));
  }
  if (closeCreateCollBtn && createCollModal) {
    closeCreateCollBtn.addEventListener("click", () => createCollModal.classList.remove("open"));
  }
  if (createCollForm) {
    createCollForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("newCollName").value;
      const desc = document.getElementById("newCollDesc").value;

      const newColl = {
        id: `pl-movie-${Date.now()}`,
        name,
        description: desc,
        movieIds: []
      };

      moviePlaylists.push(newColl);
      saveMovieData();
      renderCollections();
      if (createCollModal) createCollModal.classList.remove("open");
      showMovieToast(`Created collection "${name}"! 🍿`);
    });
  }
});
