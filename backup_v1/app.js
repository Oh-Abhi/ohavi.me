/* ═══════════════════════════════════════════════
   SOUNDTRACKS — App Controller v19
   Add / Modify Playlist Option inside Details Modal & Player Bar
   ═══════════════════════════════════════════════ */

// Pure User Catalog
const DEFAULT_SONGS = [];

// App State
let catalog = [];
let playlists = [];
let currentTrack = null;
let playbackQueue = [];
let queueIndex = -1;
let isPlaying = false;
let shuffleMode = false;
let repeatMode = "off"; // "off" | "all" | "one"
let activeFilter = "all";
let searchQ = "";
let saveTimeout = null;
let selectedCurationTrack = null;

// YouTube Iframe Controller
let ytPlayer = null;
let ytProgressTimer = null;

// Helpers
function formatSeconds(secs) {
  if (isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function showToast(msg) {
  const t = document.getElementById("toastWidget");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// Global YouTube Iframe API Ready Callback
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player("player", {
    height: "100%", width: "100%", videoId: "",
    playerVars: { playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, origin: window.location.origin },
    events: {
      onStateChange: onYTStateChange,
      onError: onYTError
    }
  });
};

function onYTStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    isPlaying = true;
    updatePlayPauseUI(true);
    refreshCardPlayingState();
    startProgressTimer();
  } else if (event.data === YT.PlayerState.PAUSED) {
    isPlaying = false;
    updatePlayPauseUI(false);
    refreshCardPlayingState();
    stopProgressTimer();
  } else if (event.data === YT.PlayerState.ENDED) {
    isPlaying = false;
    updatePlayPauseUI(false);
    refreshCardPlayingState();
    stopProgressTimer();
    if (repeatMode === "one") {
      ytPlayer.seekTo(0);
      ytPlayer.playVideo();
    } else {
      playNextTrack();
    }
  }
}

function onYTError(event) {
  console.warn("YouTube player error code:", event.data);
  showToast("YouTube video error or playback restriction");
}

// Progress Timer Sync
function startProgressTimer() {
  stopProgressTimer();
  ytProgressTimer = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
    const cur = ytPlayer.getCurrentTime() || 0;
    const dur = ytPlayer.getDuration() || 0;
    if (dur <= 0) return;

    const pct = (cur / dur) * 100;
    
    // Bottom Bar UI
    const fill = document.getElementById("progressFill");
    const thumb = document.getElementById("progressThumb");
    const curTimeEl = document.getElementById("playerTimeCurrent");
    const totalTimeEl = document.getElementById("playerTimeTotal");

    if (fill) fill.style.width = `${pct}%`;
    if (thumb) thumb.style.left = `${pct}%`;
    if (curTimeEl) curTimeEl.textContent = formatSeconds(cur);
    if (totalTimeEl) totalTimeEl.textContent = formatSeconds(dur);

    // Modal UI
    const mFill = document.getElementById("mProgressFill");
    const mCurEl = document.getElementById("mDetailsTimeCur");
    const mDurEl = document.getElementById("mDetailsDuration");

    if (mFill) mFill.style.width = `${pct}%`;
    if (mCurEl) mCurEl.textContent = formatSeconds(cur);
    if (mDurEl) mDurEl.textContent = formatSeconds(dur);

    syncLyricsUI(cur);
  }, 250);
}

function stopProgressTimer() {
  if (ytProgressTimer) clearInterval(ytProgressTimer);
}

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  bindEvents();
});

// Fetch Real Synced Lyrics from LRCLIB
async function fetchTrackLyrics(title, artist) {
  try {
    const res = await fetch(`/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.warn("Error fetching lyrics:", e);
  }
  return [
    { time: 0, text: `${title} by ${artist}` },
    { time: 4, text: "Lyrics loading or unavailable for this track." }
  ];
}

// Persistent Data Handling
async function loadData() {
  let loadedCatalog = null;

  try {
    const res = await fetch("/api/songs");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        loadedCatalog = data;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch from /api/songs:", err);
  }

  if (loadedCatalog && Array.isArray(loadedCatalog)) {
    catalog = loadedCatalog;
    localStorage.setItem("local_music_catalog", JSON.stringify(catalog));
  } else {
    catalog = [];
    localStorage.removeItem("local_music_catalog");
  }

  // Extract unique playlists
  playlists = Array.from(new Set(catalog.flatMap(s => s.playlists || []).filter(Boolean)));

  renderPage();
  updateStats();
}

async function saveData() {
  localStorage.setItem("local_music_catalog", JSON.stringify(catalog));

  try {
    await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catalog)
    });
  } catch (err) {
    console.warn("Server sync error:", err);
  }
}

async function deleteTrack(songId) {
  if (!confirm("Are you sure you want to delete this soundtrack?")) return;

  catalog = catalog.filter(s => s.id !== songId);
  playlists = Array.from(new Set(catalog.flatMap(s => s.playlists || []).filter(Boolean)));
  await saveData();

  try {
    await fetch(`/api/songs/${songId}`, { method: "DELETE" });
  } catch (e) {}

  if (currentTrack && currentTrack.id === songId) {
    if (ytPlayer && typeof ytPlayer.pauseVideo === "function") ytPlayer.pauseVideo();
    currentTrack = null;
    document.getElementById("bottomPlayer").classList.remove("visible");
    document.getElementById("detailsModal").classList.remove("open");
  }

  renderPage();
  updateStats();
  showToast("Track deleted");
}

function updateStats() {
  const favEl = document.getElementById("statFavorites");
  const plEl = document.getElementById("statPlaylists");
  if (favEl) favEl.textContent = catalog.filter(s => s.isFav).length;
  if (plEl) plEl.textContent = playlists.length;
}

// Audio Controls via YouTube Player
function playTrack(track) {
  if (!track || !track.youtubeId) return;
  currentTrack = track;

  // Build playback queue
  playbackQueue = getFilteredSongs();
  queueIndex = playbackQueue.findIndex(s => s.id === track.id);
  if (queueIndex === -1) {
    playbackQueue.unshift(track);
    queueIndex = 0;
  }

  const playerBar = document.getElementById("bottomPlayer");
  if (playerBar) playerBar.classList.add("visible");

  document.getElementById("playerTitle").textContent = track.title;
  document.getElementById("playerArtist").textContent = track.artist;
  
  const img = document.getElementById("playerThumbImg");
  const bgImg = document.getElementById("cornerPosterBg");
  const thumbUrl = track.thumbnail || "https://i.ytimg.com/vi/" + track.youtubeId + "/hqdefault.jpg";

  if (img) {
    img.src = thumbUrl;
    img.onerror = () => { img.src = "https://i.ytimg.com/vi/" + track.youtubeId + "/hqdefault.jpg"; };
  }
  if (bgImg) {
    bgImg.src = thumbUrl;
  }

  updatePlayerLyric("...");

  if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
    ytPlayer.loadVideoById(track.youtubeId);
    ytPlayer.playVideo();
  } else {
    setTimeout(() => playTrack(track), 600);
  }

  // Ensure lyrics are fetched if missing
  if (!track.lyrics || track.lyrics.length <= 2) {
    fetchTrackLyrics(track.title, track.artist).then(lyrics => {
      track.lyrics = lyrics;
      saveData();
      if (currentTrack && currentTrack.id === track.id) {
        if (document.getElementById("detailsModal").classList.contains("open")) {
          renderModalLyrics();
        }
      }
    });
  }

  if (document.getElementById("detailsModal").classList.contains("open")) {
    renderModalDetails();
  }

  // Update playlist picker menus
  renderPlaylistPicker();
  renderModalPlaylistPicker();
}

function togglePlayPause() {
  if (!currentTrack) {
    const list = getFilteredSongs();
    if (list.length > 0) playTrack(list[0]);
    return;
  }
  if (!ytPlayer || typeof ytPlayer.playVideo !== "function") return;

  if (isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

function playNextTrack() {
  if (playbackQueue.length === 0) return;
  if (shuffleMode) {
    queueIndex = Math.floor(Math.random() * playbackQueue.length);
  } else {
    queueIndex = (queueIndex + 1) % playbackQueue.length;
  }
  playTrack(playbackQueue[queueIndex]);
}

function playPrevTrack() {
  if (playbackQueue.length === 0) return;
  const curTime = (ytPlayer && typeof ytPlayer.getCurrentTime === "function") ? ytPlayer.getCurrentTime() : 0;

  if (curTime > 3) {
    if (ytPlayer && typeof ytPlayer.seekTo === "function") ytPlayer.seekTo(0);
    return;
  }
  queueIndex = (queueIndex - 1 + playbackQueue.length) % playbackQueue.length;
  playTrack(playbackQueue[queueIndex]);
}

function updatePlayPauseUI(playing) {
  // Bottom Player Bar Play/Pause Icon
  const icon = document.getElementById("playPauseIcon");
  if (icon) {
    if (playing) {
      icon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
    } else {
      icon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }
  }

  // Modal Integrated Play/Pause Icon
  const mIcon = document.getElementById("mPlayIcon");
  if (mIcon) {
    if (playing) {
      mIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
    } else {
      mIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
    }
  }
}

function refreshCardPlayingState() {
  document.querySelectorAll(".card").forEach(c => {
    c.classList.toggle("playing", isPlaying && currentTrack && c.dataset.id === currentTrack.id);
  });
}

function updateVolumeUI(vol) {
  const fill = document.getElementById("volumeFill");
  if (fill) fill.style.width = `${vol * 100}%`;
}

// Synced Lyrics UI with Precision Active Dot
function syncLyricsUI(curTime) {
  if (!currentTrack || !currentTrack.lyrics || currentTrack.lyrics.length === 0) {
    updatePlayerLyric("No lyrics available");
    return;
  }

  const lyrics = currentTrack.lyrics;
  let activeIdx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (curTime >= lyrics[i].time) activeIdx = i;
    else break;
  }

  if (activeIdx !== -1) {
    updatePlayerLyric(lyrics[activeIdx].text);
    updateModalLyricHighlight(activeIdx);
  }
}

function updatePlayerLyric(text) {
  const el = document.getElementById("playerLyric");
  if (el && el.textContent !== text) {
    el.textContent = text;
  }
}

function updateModalLyricHighlight(activeIdx) {
  const lines = document.querySelectorAll(".lyric-line");
  const lyricsScroller = document.getElementById("lyricsScroller");

  lines.forEach((line, idx) => {
    const isActive = idx === activeIdx;
    const wasActive = line.classList.contains("active");
    line.classList.toggle("active", isActive);

    if (isActive && !wasActive && lyricsScroller) {
      const containerRect = lyricsScroller.getBoundingClientRect();
      const lineRect = line.getBoundingClientRect();
      const offset = lineRect.top - containerRect.top - (containerRect.height / 2) + (lineRect.height / 2);
      lyricsScroller.scrollBy({ top: offset, behavior: "smooth" });
    }
  });
}

// Rendering UI
function getFilteredSongs() {
  return catalog.filter(song => {
    if (activeFilter === "favorites" && !song.isFav) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      const matchTitle = song.title.toLowerCase().includes(q);
      const matchArtist = song.artist.toLowerCase().includes(q);
      const matchNote = (song.personalNote || "").toLowerCase().includes(q);
      return matchTitle || matchArtist || matchNote;
    }
    return true;
  });
}

function renderPage() {
  renderSongsGrid();
  renderPlaylistsAccordion();
}

function renderSongsGrid() {
  const grid = document.getElementById("songsGrid");
  const empty = document.getElementById("songsEmpty");
  if (!grid) return;

  const songs = getFilteredSongs();
  if (songs.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.classList.add("show");
    return;
  }
  if (empty) empty.classList.remove("show");

  grid.innerHTML = songs.map(song => {
    const isCurPlaying = isPlaying && currentTrack && currentTrack.id === song.id;
    return `
      <div class="cw">
        <div class="card ${isCurPlaying ? 'playing' : ''} ${song.isFav ? 'is-fav' : ''}" data-id="${song.id}">
          <button class="card-del-btn" data-delid="${song.id}" title="Delete soundtrack">✕</button>
          <div class="pw">
            <img src="${song.thumbnail || 'https://i.ytimg.com/vi/' + song.youtubeId + '/hqdefault.jpg'}" alt="${song.title}" loading="lazy" />
            <div class="card-play-overlay">
              <button class="cpo-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
            </div>
            ${song.isFav ? `<div class="card-fav-icon">♥</div>` : ''}
          </div>
          <div class="card-title">${song.title}</div>
          <div class="card-artist">${song.artist}</div>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => {
      const songId = card.dataset.id;
      const song = catalog.find(s => s.id === songId);
      if (song) {
        if (currentTrack && currentTrack.id === song.id) {
          openDetailsModal(song);
        } else {
          playTrack(song);
        }
      }
    });
  });

  // Delete button click listener
  grid.querySelectorAll(".card-del-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTrack(btn.dataset.delid);
    });
  });
}

function renderPlaylistsAccordion() {
  const container = document.getElementById("playlistsContainer");
  if (!container) return;

  if (playlists.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = playlists.map(plName => {
    const plSongs = catalog.filter(s => s.playlists && s.playlists.includes(plName));
    const ytmUrl = `https://music.youtube.com/search?q=${encodeURIComponent(plName)}`;
    const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(plName)}`;

    return `
      <div class="pl-accordion">
        <div class="pl-acc-header" data-pl="${plName}">
          <div class="pl-acc-left">
            <div class="pl-acc-title">
              <span>${plName}</span>
              <span class="pl-acc-count">(${plSongs.length} tracks)</span>
            </div>
            <div class="pl-actions" onclick="event.stopPropagation()">
              <a href="${ytmUrl}" target="_blank" class="plat-pill ytm" title="Listen playlist on YouTube Music">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l7.5 4.5-7.5 4.5z"/></svg>
                YT Music
              </a>
              <a href="${spotifyUrl}" target="_blank" class="plat-pill sp" title="Listen playlist on Spotify">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.308-1.758-8.793-.963-.335.077-.67-.133-.746-.467-.077-.334.132-.67.467-.746 3.808-.87 7.076-.496 9.722 1.115.293.18.386.563.207.854zm1.224-2.72c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.131-9.965-1.166-.413.126-.848-.106-.973-.519-.125-.413.106-.848.519-.973 3.632-1.102 8.147-.568 11.234 1.328.366.226.48.707.257 1.073zm.13-2.835c-3.224-1.915-8.54-2.092-11.62-1.157-.502.152-1.03-.136-1.183-.638-.153-.502.136-1.03.638-1.183 3.54-1.074 9.406-.867 13.116 1.336.452.268.601.854.333 1.306-.268.452-.854.601-1.306.336z"/></svg>
                Spotify
              </a>
            </div>
          </div>
          <svg class="pl-acc-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div class="pl-acc-body">
          <div class="grid">
            ${plSongs.length > 0 ? plSongs.map(song => `
              <div class="cw">
                <div class="card ${song.isFav ? 'is-fav' : ''}" data-id="${song.id}">
                  <button class="card-del-btn" data-delid="${song.id}" title="Delete soundtrack">✕</button>
                  <div class="pw">
                    <img src="${song.thumbnail || 'https://i.ytimg.com/vi/' + song.youtubeId + '/hqdefault.jpg'}" alt="${song.title}" loading="lazy" />
                  </div>
                  <div class="card-title">${song.title}</div>
                  <div class="card-artist">${song.artist}</div>
                </div>
              </div>
            `).join("") : `<div style="padding:20px;color:var(--muted);font-size:13px;">No tracks in this playlist yet.</div>`}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Accordion toggle events
  container.querySelectorAll(".pl-acc-header").forEach(header => {
    header.addEventListener("click", () => {
      const accordion = header.closest(".pl-accordion");
      accordion.classList.toggle("open");
    });
  });

  // Card click events in accordion
  container.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      const songId = card.dataset.id;
      const song = catalog.find(s => s.id === songId);
      if (song) playTrack(song);
    });
  });

  // Delete click events in accordion
  container.querySelectorAll(".card-del-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTrack(btn.dataset.delid);
    });
  });
}

// Render Playlist Manager Menu Inside Player Bar
function renderPlaylistPicker() {
  const listEl = document.getElementById("playlistPickerList");
  if (!listEl || !currentTrack) return;

  const trackPls = currentTrack.playlists || [];

  if (playlists.length === 0) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:4px 0;">No playlists yet. Create one below:</div>`;
    return;
  }

  listEl.innerHTML = playlists.map(plName => {
    const isChecked = trackPls.includes(plName);
    return `
      <label class="ppm-item">
        <input type="checkbox" data-pl="${plName}" ${isChecked ? 'checked' : ''} />
        <span>${plName}</span>
      </label>
    `;
  }).join("");

  listEl.querySelectorAll("input[type='checkbox']").forEach(box => {
    box.addEventListener("change", async () => {
      const plName = box.dataset.pl;
      if (!currentTrack.playlists) currentTrack.playlists = [];

      if (box.checked) {
        if (!currentTrack.playlists.includes(plName)) currentTrack.playlists.push(plName);
      } else {
        currentTrack.playlists = currentTrack.playlists.filter(p => p !== plName);
      }

      await saveData();
      renderPage();
      updateStats();
      renderModalPlaylistPicker();
      showToast(box.checked ? `Added to "${plName}"` : `Removed from "${plName}"`);
    });
  });
}

// Render Playlist Manager Checklist Inside Details Pop-Up Modal
function renderModalPlaylistPicker() {
  const listEl = document.getElementById("modalPlaylistPickerList");
  if (!listEl || !currentTrack) return;

  const trackPls = currentTrack.playlists || [];

  if (playlists.length === 0) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:4px 0;">No playlists created yet. Add one below:</div>`;
    return;
  }

  listEl.innerHTML = playlists.map(plName => {
    const isChecked = trackPls.includes(plName);
    return `
      <label class="ppm-item">
        <input type="checkbox" data-m-pl="${plName}" ${isChecked ? 'checked' : ''} />
        <span>${plName}</span>
      </label>
    `;
  }).join("");

  listEl.querySelectorAll("input[type='checkbox']").forEach(box => {
    box.addEventListener("change", async () => {
      const plName = box.dataset.mPl;
      if (!currentTrack.playlists) currentTrack.playlists = [];

      if (box.checked) {
        if (!currentTrack.playlists.includes(plName)) currentTrack.playlists.push(plName);
      } else {
        currentTrack.playlists = currentTrack.playlists.filter(p => p !== plName);
      }

      await saveData();
      renderPage();
      updateStats();
      renderPlaylistPicker();
      showToast(box.checked ? `Added to "${plName}"` : `Removed from "${plName}"`);
    });
  });
}

// Modal Details & Synced Lyrics
function openDetailsModal(song) {
  currentTrack = song;
  const modal = document.getElementById("detailsModal");
  if (!modal) return;

  renderModalDetails();
  modal.classList.add("open");
}

function renderModalDetails() {
  if (!currentTrack) return;
  document.getElementById("mDetailsTitle").textContent = currentTrack.title;
  document.getElementById("mDetailsArtist").textContent = currentTrack.artist;
  document.getElementById("mDetailsDuration").textContent = currentTrack.durationStr || "0:00";
  
  const cover = document.getElementById("mDetailsCover");
  if (cover) cover.src = currentTrack.thumbnail || "https://i.ytimg.com/vi/" + currentTrack.youtubeId + "/hqdefault.jpg";

  const favBtn = document.getElementById("mDetailsFavBtn");
  if (favBtn) favBtn.classList.toggle("active", !!currentTrack.isFav);

  const memInput = document.getElementById("mDetailsMemoryInput");
  if (memInput) memInput.value = currentTrack.personalNote || "";

  // YT Music & Spotify Links
  const ytmLink = document.getElementById("mDetailsYtMusicLink");
  if (ytmLink) {
    const q = encodeURIComponent(`${currentTrack.artist} ${currentTrack.title}`);
    ytmLink.href = currentTrack.youtubeId
      ? `https://music.youtube.com/watch?v=${currentTrack.youtubeId}`
      : `https://music.youtube.com/search?q=${q}`;
  }

  const spLink = document.getElementById("mDetailsSpotifyLink");
  if (spLink) {
    const q = encodeURIComponent(`${currentTrack.artist} ${currentTrack.title}`);
    spLink.href = `https://open.spotify.com/search/${q}`;
  }

  renderModalLyrics();
  renderModalPlaylistPicker();
}

function renderModalLyrics() {
  const trackContainer = document.getElementById("lyricsTrack");
  if (!trackContainer) return;

  if (!currentTrack || !currentTrack.lyrics || currentTrack.lyrics.length === 0) {
    trackContainer.innerHTML = `<div style="text-align:center;opacity:0.5;font-size:14px;padding:40px 0;">Fetching synced lyrics...</div>`;
    
    if (currentTrack) {
      fetchTrackLyrics(currentTrack.title, currentTrack.artist).then(lyrics => {
        currentTrack.lyrics = lyrics;
        saveData();
        renderModalLyrics();
      });
    }
    return;
  }

  trackContainer.innerHTML = currentTrack.lyrics.map((l, i) => `
    <div class="lyric-line" data-time="${l.time}" data-idx="${i}">${l.text}</div>
  `).join("");

  trackContainer.querySelectorAll(".lyric-line").forEach(line => {
    line.addEventListener("click", () => {
      const t = parseFloat(line.dataset.time);
      if (!isNaN(t) && ytPlayer && typeof ytPlayer.seekTo === "function") {
        ytPlayer.seekTo(t);
      }
    });
  });
}

// Search & Curation Modal Handler
function openSearchModal() {
  document.getElementById("searchSongInput").value = "";
  document.getElementById("searchResultsList").innerHTML = "";
  document.getElementById("curationEditor").style.display = "none";
  selectedCurationTrack = null;

  document.getElementById("searchModal").classList.add("open");
}

async function handleTrackSearch() {
  const query = document.getElementById("searchSongInput").value.trim();
  const listEl = document.getElementById("searchResultsList");
  if (!query || !listEl) return;

  listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">Searching YouTube for tracks...</div>`;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        renderSearchResults(data);
        return;
      }
    }
  } catch (e) {
    console.warn("Search error:", e);
  }

  listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">No results found. Try another search query.</div>`;
}

function renderSearchResults(results) {
  const listEl = document.getElementById("searchResultsList");
  if (!listEl) return;

  listEl.innerHTML = results.map((item, idx) => `
    <div class="sm-res-card" data-idx="${idx}">
      <div class="sm-res-left">
        <div class="sm-res-thumb">
          <img src="${item.thumbnail}" onerror="this.src='https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg'" />
        </div>
        <div class="sm-res-info">
          <div class="sm-res-title">${item.title}</div>
          <div class="sm-res-artist">${item.artist} · ${item.durationStr}</div>
        </div>
      </div>
      <button class="sm-res-select-btn">Select</button>
    </div>
  `).join("");

  listEl.querySelectorAll(".sm-res-card").forEach((el, idx) => {
    el.addEventListener("click", async () => {
      selectedCurationTrack = results[idx];
      document.getElementById("curationSelectedTitle").textContent = selectedCurationTrack.title;
      document.getElementById("curationSelectedArtist").textContent = selectedCurationTrack.artist;
      document.getElementById("curationSelectedThumb").src = selectedCurationTrack.thumbnail;
      document.getElementById("curationEditor").style.display = "block";
      showToast("Fetching synced lyrics...");

      const lyrics = await fetchTrackLyrics(selectedCurationTrack.title, selectedCurationTrack.artist);
      selectedCurationTrack.lyrics = lyrics;
    });
  });
}

async function handleSaveCuration() {
  if (!selectedCurationTrack) return;

  const note = document.getElementById("curationNote").value.trim();
  const newPlName = document.getElementById("curationNewPlaylistInput").value.trim();
  const trackPlaylists = newPlName ? [newPlName] : [];

  if (newPlName && !playlists.includes(newPlName)) {
    playlists.push(newPlName);
  }

  const lyrics = selectedCurationTrack.lyrics || await fetchTrackLyrics(selectedCurationTrack.title, selectedCurationTrack.artist);

  const newTrack = {
    id: selectedCurationTrack.youtubeId + "-" + Date.now(),
    title: selectedCurationTrack.title,
    artist: selectedCurationTrack.artist,
    youtubeId: selectedCurationTrack.youtubeId,
    thumbnail: selectedCurationTrack.thumbnail,
    personalNote: note,
    isFav: false,
    playlists: trackPlaylists,
    durationStr: selectedCurationTrack.durationStr || "3:30",
    lyrics: lyrics
  };

  catalog.unshift(newTrack);
  await saveData();

  document.getElementById("searchModal").classList.remove("open");
  renderPage();
  updateStats();
  showToast("Added to your soundtracks!");
  playTrack(newTrack);
}

// Event Bindings
function bindEvents() {
  // Floating Hover Video Card POPPING UP ABOVE THE PLAYER BAR
  const cornerCard = document.getElementById("cornerPosterCard");
  const hoverPopup = document.getElementById("cornerHoverVideoPopup");
  const cornerVideoFrame = document.getElementById("cornerVideoFrame");

  if (cornerCard) {
    cornerCard.addEventListener("mouseenter", () => {
      if (currentTrack && currentTrack.youtubeId && cornerVideoFrame) {
        cornerVideoFrame.innerHTML = `<iframe src="https://www.youtube.com/embed/${currentTrack.youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${currentTrack.youtubeId}&playsinline=1" frameborder="0" allow="autoplay"></iframe>`;
        if (hoverPopup) hoverPopup.classList.add("show");
      }
    });

    cornerCard.addEventListener("mouseleave", () => {
      if (hoverPopup) hoverPopup.classList.remove("show");
      setTimeout(() => {
        if (cornerVideoFrame && hoverPopup && !hoverPopup.classList.contains("show")) {
          cornerVideoFrame.innerHTML = "";
        }
      }, 300);
    });

    cornerCard.addEventListener("click", () => {
      if (currentTrack) openDetailsModal(currentTrack);
    });
  }

  // Playlist Picker Button inside Player Bar
  const plBtn = document.getElementById("playerPlaylistBtn");
  const plMenu = document.getElementById("playlistPickerMenu");
  const plClose = document.getElementById("closePlaylistPicker");

  if (plBtn && plMenu) {
    plBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!currentTrack) {
        showToast("Play a soundtrack first to manage playlists");
        return;
      }
      renderPlaylistPicker();
      plMenu.classList.toggle("open");
    });
  }

  if (plClose && plMenu) {
    plClose.addEventListener("click", () => {
      plMenu.classList.remove("open");
    });
  }

  // Create Inline Playlist inside Player Bar
  const createPlBtn = document.getElementById("createNewPlaylistBtn");
  const newPlInput = document.getElementById("newPlaylistInput");

  if (createPlBtn && newPlInput) {
    createPlBtn.addEventListener("click", async () => {
      const plName = newPlInput.value.trim();
      if (!plName) return;

      if (!playlists.includes(plName)) {
        playlists.push(plName);
      }

      if (currentTrack) {
        if (!currentTrack.playlists) currentTrack.playlists = [];
        if (!currentTrack.playlists.includes(plName)) currentTrack.playlists.push(plName);
      }

      newPlInput.value = "";
      await saveData();
      renderPage();
      updateStats();
      renderPlaylistPicker();
      renderModalPlaylistPicker();
      showToast(`Created playlist "${plName}"`);
    });
  }

  // Details Modal Playlist Button & Expand
  const mPlBtn = document.getElementById("mDetailsPlaylistBtn");
  const mPlExpand = document.getElementById("dockPlaylistExpand");

  if (mPlBtn && mPlExpand) {
    mPlBtn.addEventListener("click", () => {
      const isHidden = mPlExpand.style.display === "none";
      mPlExpand.style.display = isHidden ? "block" : "none";
      if (isHidden) renderModalPlaylistPicker();
    });
  }

  const mCreatePlBtn = document.getElementById("modalCreateNewPlaylistBtn");
  const mNewPlInput = document.getElementById("modalNewPlaylistInput");

  if (mCreatePlBtn && mNewPlInput) {
    mCreatePlBtn.addEventListener("click", async () => {
      const plName = mNewPlInput.value.trim();
      if (!plName) return;

      if (!playlists.includes(plName)) {
        playlists.push(plName);
      }

      if (currentTrack) {
        if (!currentTrack.playlists) currentTrack.playlists = [];
        if (!currentTrack.playlists.includes(plName)) currentTrack.playlists.push(plName);
      }

      mNewPlInput.value = "";
      await saveData();
      renderPage();
      updateStats();
      renderModalPlaylistPicker();
      renderPlaylistPicker();
      showToast(`Created playlist "${plName}"`);
    });
  }

  // Close playlist picker on outside click
  document.addEventListener("click", (e) => {
    if (plMenu && plMenu.classList.contains("open") && !plMenu.contains(e.target) && e.target !== plBtn) {
      plMenu.classList.remove("open");
    }
  });

  // Modal Integrated Control Events
  const mPlayBtn = document.getElementById("mPlayPauseBtn");
  if (mPlayBtn) mPlayBtn.addEventListener("click", togglePlayPause);

  const mNextBtn = document.getElementById("mNextBtn");
  if (mNextBtn) mNextBtn.addEventListener("click", playNextTrack);

  const mPrevBtn = document.getElementById("mPrevBtn");
  if (mPrevBtn) mPrevBtn.addEventListener("click", playPrevTrack);

  const mShuffleBtn = document.getElementById("mShuffleBtn");
  if (mShuffleBtn) {
    mShuffleBtn.addEventListener("click", () => {
      shuffleMode = !shuffleMode;
      mShuffleBtn.classList.toggle("active", shuffleMode);
      showToast(shuffleMode ? "Shuffle ON" : "Shuffle OFF");
    });
  }

  const mRepeatBtn = document.getElementById("mRepeatBtn");
  if (mRepeatBtn) {
    mRepeatBtn.addEventListener("click", () => {
      if (repeatMode === "off") repeatMode = "all";
      else if (repeatMode === "all") repeatMode = "one";
      else repeatMode = "off";

      mRepeatBtn.classList.toggle("active", repeatMode !== "off");
      mRepeatBtn.title = `Repeat: ${repeatMode}`;
      showToast(`Repeat: ${repeatMode.toUpperCase()}`);
    });
  }

  const mProgressContainer = document.getElementById("mProgressContainer");
  if (mProgressContainer) {
    mProgressContainer.addEventListener("click", (e) => {
      if (!ytPlayer || typeof ytPlayer.getDuration !== "function") return;
      const dur = ytPlayer.getDuration();
      if (!dur) return;
      const rect = mProgressContainer.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const seekTime = pct * dur;
      ytPlayer.seekTo(seekTime, true);
    });
  }

  // Toggle Expandable Memory Note in Dock
  const noteToggleBtn = document.getElementById("mDetailsNoteToggleBtn");
  if (noteToggleBtn) {
    noteToggleBtn.addEventListener("click", () => {
      const expandArea = document.getElementById("dockMemoryExpand");
      if (expandArea) {
        const isHidden = expandArea.style.display === "none";
        expandArea.style.display = isHidden ? "block" : "none";
      }
    });
  }

  // Search input
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQ = e.target.value;
      renderPage();
    });
  }

  // Filter chips
  document.querySelectorAll(".chip[data-filter]").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip[data-filter]").forEach(c => c.classList.remove("on"));
      chip.classList.add("on");
      activeFilter = chip.dataset.filter;
      renderPage();
    });
  });

  // Player Bar Controls
  const playBtn = document.getElementById("playerPlayPauseBtn");
  if (playBtn) playBtn.addEventListener("click", togglePlayPause);

  const nextBtn = document.getElementById("playerNextBtn");
  if (nextBtn) nextBtn.addEventListener("click", playNextTrack);

  const prevBtn = document.getElementById("playerPrevBtn");
  if (prevBtn) prevBtn.addEventListener("click", playPrevTrack);

  const shuffleBtn = document.getElementById("playerShuffleBtn");
  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      shuffleMode = !shuffleMode;
      shuffleBtn.classList.toggle("active", shuffleMode);
      showToast(shuffleMode ? "Shuffle ON" : "Shuffle OFF");
    });
  }

  const repeatBtn = document.getElementById("playerRepeatBtn");
  if (repeatBtn) {
    repeatBtn.addEventListener("click", () => {
      if (repeatMode === "off") repeatMode = "all";
      else if (repeatMode === "all") repeatMode = "one";
      else repeatMode = "off";

      repeatBtn.classList.toggle("active", repeatMode !== "off");
      repeatBtn.title = `Repeat: ${repeatMode}`;
      showToast(`Repeat: ${repeatMode.toUpperCase()}`);
    });
  }

  // Timeline Slider Dragging / Clicking
  const progressContainer = document.getElementById("progressContainer");
  if (progressContainer) {
    progressContainer.addEventListener("click", (e) => {
      if (!ytPlayer || typeof ytPlayer.getDuration !== "function") return;
      const dur = ytPlayer.getDuration();
      if (!dur) return;
      const rect = progressContainer.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const seekTime = pct * dur;
      ytPlayer.seekTo(seekTime, true);
    });
  }

  // Volume Slider Dragging / Clicking
  const volumeContainer = document.getElementById("volumeContainer");
  if (volumeContainer) {
    volumeContainer.addEventListener("click", (e) => {
      const rect = volumeContainer.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (ytPlayer && typeof ytPlayer.setVolume === "function") {
        ytPlayer.setVolume(pct * 100);
      }
      localStorage.setItem("local_volume", pct.toString());
      updateVolumeUI(pct);
    });
  }

  const muteBtn = document.getElementById("volumeMuteBtn");
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      if (ytPlayer && typeof ytPlayer.isMuted === "function") {
        if (ytPlayer.isMuted()) {
          ytPlayer.unMute();
          updateVolumeUI(0.8);
        } else {
          ytPlayer.mute();
          updateVolumeUI(0);
        }
      }
    });
  }

  // Details Modal
  const detailsCloseBtn = document.getElementById("detailsCloseBtn");
  if (detailsCloseBtn) {
    detailsCloseBtn.addEventListener("click", () => {
      document.getElementById("detailsModal").classList.remove("open");
    });
  }

  const favBtn = document.getElementById("mDetailsFavBtn");
  if (favBtn) {
    favBtn.addEventListener("click", () => {
      if (!currentTrack) return;
      currentTrack.isFav = !currentTrack.isFav;
      favBtn.classList.toggle("active", currentTrack.isFav);
      saveData();
      renderPage();
      updateStats();
    });
  }

  const delBtn = document.getElementById("mDetailsDeleteBtn");
  if (delBtn) {
    delBtn.addEventListener("click", () => {
      if (currentTrack) deleteTrack(currentTrack.id);
    });
  }

  const memInput = document.getElementById("mDetailsMemoryInput");
  if (memInput) {
    memInput.addEventListener("input", () => {
      if (!currentTrack) return;
      currentTrack.personalNote = memInput.value;
      const saveInd = document.getElementById("saveInd");
      if (saveInd) saveInd.classList.add("show");

      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveData();
        if (saveInd) saveInd.classList.remove("show");
      }, 600);
    });
  }

  // Search & Curate Modal
  const openAddTrackBtn = document.getElementById("openAddTrackBtn");
  if (openAddTrackBtn) {
    openAddTrackBtn.addEventListener("click", () => {
      openSearchModal();
    });
  }

  const searchModalCloseBtn = document.getElementById("searchModalCloseBtn");
  if (searchModalCloseBtn) {
    searchModalCloseBtn.addEventListener("click", () => {
      document.getElementById("searchModal").classList.remove("open");
    });
  }

  const searchSongBtn = document.getElementById("searchSongBtn");
  if (searchSongBtn) {
    searchSongBtn.addEventListener("click", handleTrackSearch);
  }

  const searchSongInput = document.getElementById("searchSongInput");
  if (searchSongInput) {
    searchSongInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleTrackSearch();
    });
  }

  const saveCurationBtn = document.getElementById("saveCurationBtn");
  if (saveCurationBtn) {
    saveCurationBtn.addEventListener("click", handleSaveCuration);
  }
}
