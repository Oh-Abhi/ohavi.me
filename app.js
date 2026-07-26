/* ==========================================================
   SONGS — App Controller v19
   Add / Modify Playlist Option inside Details Modal & Player Bar
   ========================================================== */

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

// View Controls State & Persistence
let viewMode = localStorage.getItem("forher_viewMode") || "grid"; // "grid" | "list"
let cardSize = "sm";   // Permanently small size for grid view
let playlistViewMode = localStorage.getItem("forher_plViewMode") || "cards"; // "cards" | "rows"
let editingPlaylistName = null;

// Dual Audio Engine — YouTube IFrame Player (primary/Vercel) & Native Audio Element
let audioEl = null;
let ytPlayer = null;
let ytPlayerReady = false;
let audioProgressTimer = null;
let activeEngine = 'yt'; // 'yt' | 'native'
const streamCache = {};

// YouTube IFrame API Ready Callback
window.onYouTubeIframeAPIReady = function() {
  ytPlayer = new YT.Player('ytPlayer', {
    height: '1',
    width: '1',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      playsinline: 1
    },
    events: {
      onReady: () => {
        ytPlayerReady = true;
        const savedVol = parseFloat(localStorage.getItem('local_volume') || '0.8');
        ytPlayer.setVolume(Math.round(savedVol * 100));
      },
      onStateChange: (event) => {
        if (typeof YT !== 'undefined') {
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
            if (repeatMode === 'one') {
              ytPlayer.seekTo(0);
              ytPlayer.playVideo();
            } else {
              playNextTrack();
            }
          }
        }
      },
      onError: (e) => {
        console.warn('YT Player error, trying native stream fallback:', e);
        if (currentTrack) playNativeStreamFallback(currentTrack);
      }
    }
  });
};

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

// Native Audio Engine Setup
function initAudioEngine() {
  audioEl = new Audio();
  audioEl.preload = 'auto';

  const savedVol = parseFloat(localStorage.getItem('local_volume') || '0.8');
  audioEl.volume = Math.max(0, Math.min(1, savedVol));
  updateVolumeUI(audioEl.volume);

  audioEl.addEventListener('playing', () => {
    isPlaying = true;
    updatePlayPauseUI(true);
    refreshCardPlayingState();
    startProgressTimer();
  });

  audioEl.addEventListener('pause', () => {
    isPlaying = false;
    updatePlayPauseUI(false);
    refreshCardPlayingState();
    stopProgressTimer();
  });

  audioEl.addEventListener('ended', () => {
    isPlaying = false;
    updatePlayPauseUI(false);
    refreshCardPlayingState();
    stopProgressTimer();
    if (repeatMode === 'one') {
      audioEl.currentTime = 0;
      audioEl.play().catch(() => {});
    } else {
      playNextTrack();
    }
  });

  audioEl.addEventListener('error', (e) => {
    console.warn('[audio] Native audio element error:', e);
  });
}

// Progress Timer Sync for Dual Engines
function startProgressTimer() {
  stopProgressTimer();
  audioProgressTimer = setInterval(() => {
    let cur = 0;
    let dur = 0;

    if (activeEngine === 'yt' && ytPlayerReady && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      cur = ytPlayer.getCurrentTime() || 0;
      dur = ytPlayer.getDuration() || 0;
    } else if (audioEl) {
      cur = audioEl.currentTime || 0;
      dur = audioEl.duration || 0;
    }

    if (dur <= 0) return;

    const pct = (cur / dur) * 100;

    // Bottom Bar UI
    const fill = document.getElementById('progressFill');
    const thumb = document.getElementById('progressThumb');
    const curTimeEl = document.getElementById('playerTimeCurrent');
    const totalTimeEl = document.getElementById('playerTimeTotal');
    if (fill) fill.style.width = `${pct}%`;
    if (thumb) thumb.style.left = `${pct}%`;
    if (curTimeEl) curTimeEl.textContent = formatSeconds(cur);
    if (totalTimeEl) totalTimeEl.textContent = formatSeconds(dur);

    // Modal UI
    const mFill = document.getElementById('mProgressFill');
    const mCurEl = document.getElementById('mDetailsTimeCur');
    const mDurEl = document.getElementById('mDetailsDuration');
    if (mFill) mFill.style.width = `${pct}%`;
    if (mCurEl) mCurEl.textContent = formatSeconds(cur);
    if (mDurEl) mDurEl.textContent = formatSeconds(dur);

    syncLyricsUI(cur);
  }, 250);
}

function stopProgressTimer() {
  if (audioProgressTimer) clearInterval(audioProgressTimer);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initAudioEngine();
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
      if (Array.isArray(data) && data.length > 0) {
        loadedCatalog = data;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch from /api/songs:", err);
  }

  // Fallback 1: Static songs.json file
  if (!loadedCatalog || loadedCatalog.length === 0) {
    try {
      const staticRes = await fetch("songs.json");
      if (staticRes.ok) {
        const staticData = await staticRes.json();
        if (Array.isArray(staticData) && staticData.length > 0) {
          loadedCatalog = staticData;
        }
      }
    } catch (e) {}
  }

  // Fallback 2: localStorage
  if (!loadedCatalog || loadedCatalog.length === 0) {
    try {
      const localData = localStorage.getItem("local_music_catalog");
      if (localData) loadedCatalog = JSON.parse(localData);
    } catch (e) {}
  }

  if (loadedCatalog && Array.isArray(loadedCatalog)) {
    catalog = loadedCatalog;
    localStorage.setItem("local_music_catalog", JSON.stringify(catalog));
  } else {
    catalog = [];
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
  if (!confirm("Are you sure you want to delete this song?")) return;

  catalog = catalog.filter(s => s.id !== songId);
  playlists = Array.from(new Set(catalog.flatMap(s => s.playlists || []).filter(Boolean)));
  await saveData();

  try {
    await fetch(`/api/songs/${songId}`, { method: "DELETE" });
  } catch (e) {}

  if (currentTrack && currentTrack.id === songId) {
    if (audioEl) audioEl.pause();
    currentTrack = null;
    document.getElementById('bottomPlayer').classList.remove('visible');
    document.getElementById('detailsModal').classList.remove('open');
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

// Audio Playback Controller
async function playTrack(track) {
  if (!track || !track.youtubeId) return;
  currentTrack = track;

  // Build playback queue
  playbackQueue = getFilteredSongs();
  queueIndex = playbackQueue.findIndex(s => s.id === track.id);
  if (queueIndex === -1) {
    playbackQueue.unshift(track);
    queueIndex = 0;
  }

  const playerBar = document.getElementById('bottomPlayer');
  if (playerBar) playerBar.classList.add('visible');

  document.getElementById('playerTitle').textContent = track.title;
  document.getElementById('playerArtist').textContent = track.artist;

  const thumbUrl = track.thumbnail || `https://i.ytimg.com/vi/${track.youtubeId}/hqdefault.jpg`;

  const img = document.getElementById('playerThumbImg');
  if (img) { img.src = thumbUrl; img.onerror = () => { img.src = `https://i.ytimg.com/vi/${track.youtubeId}/hqdefault.jpg`; }; }

  const bgImg = document.getElementById('cornerPosterBg');
  if (bgImg) bgImg.src = thumbUrl;

  // Update ambient poster in modal
  const ambientBg = document.getElementById('ambientPosterBg');
  if (ambientBg) ambientBg.src = thumbUrl;

  updatePlayerLyric('...');

  // Primary: Use YouTube IFrame Player (100% reliable everywhere)
  if (ytPlayerReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    activeEngine = 'yt';
    if (audioEl) audioEl.pause();
    ytPlayer.loadVideoById(track.youtubeId);
  } else {
    // Fallback: Try native stream audio
    playNativeStreamFallback(track);
  }

  // Ensure lyrics are fetched if missing
  if (!track.lyrics || track.lyrics.length <= 2) {
    fetchTrackLyrics(track.title, track.artist).then(lyrics => {
      track.lyrics = lyrics;
      saveData();
      if (currentTrack && currentTrack.id === track.id) {
        if (document.getElementById('detailsModal').classList.contains('open')) {
          renderModalLyrics();
        }
      }
    });
  }

  if (document.getElementById('detailsModal').classList.contains('open')) {
    renderModalDetails();
  }

  renderPlaylistPicker();
  renderModalPlaylistPicker();
}

async function playNativeStreamFallback(track) {
  activeEngine = 'native';
  let streamObj = null;

  try {
    const res = await fetch(`/api/stream/${track.youtubeId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.url) streamObj = data;
    }
  } catch (err) {
    console.warn('[stream] Server stream fetch failed:', err);
  }

  if (streamObj && streamObj.url && audioEl) {
    audioEl.pause();
    audioEl.src = streamObj.url;
    audioEl.load();
    audioEl.play().catch(e => console.warn('Native playback error:', e));
  }
}

function togglePlayPause() {
  if (!currentTrack) {
    const list = getFilteredSongs();
    if (list.length > 0) playTrack(list[0]);
    return;
  }

  if (activeEngine === 'yt' && ytPlayerReady && ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
    const state = ytPlayer.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
    return;
  }

  if (audioEl) {
    if (isPlaying) {
      audioEl.pause();
    } else {
      audioEl.play().catch(e => console.warn('Play blocked:', e));
    }
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
  const curTime = audioEl ? audioEl.currentTime : 0;

  if (curTime > 3) {
    if (audioEl) audioEl.currentTime = 0;
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
  renderPlaylists();
  updateAllSongsCollapseUI();
  if (viewingPlaylistName) renderPlaylistDetailContents();
}


function renderSongsGrid() {
  const grid = document.getElementById("songsGrid");
  const empty = document.getElementById("songsEmpty");
  if (!grid) return;

  grid.className = "grid";
  if (viewMode === "list") {
    grid.classList.add("list-view");
  } else {
    grid.classList.add("size-sm");
  }

  const songs = getFilteredSongs();
  if (songs.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.classList.add("show");
    return;
  }
  if (empty) empty.classList.remove("show");

  if (viewMode === "list") {
    grid.innerHTML = songs.map(song => {
      const isCurPlaying = isPlaying && currentTrack && currentTrack.id === song.id;
      const byName = song.addedBy || "Avi";
      const isAwwnanya = byName.toLowerCase().includes("awwnanya");
      return `
        <div class="cw">
          <div class="card ${isCurPlaying ? 'playing' : ''} ${song.isFav ? 'is-fav' : ''}" data-id="${song.id}">
            <div class="pw">
              <img src="${song.thumbnail || 'https://i.ytimg.com/vi/' + song.youtubeId + '/hqdefault.jpg'}" alt="${song.title}" loading="lazy" />
              <div class="card-play-overlay">
                <button class="cpo-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
              </div>
            </div>
            <div class="card-info-wrap">
              <div class="card-title">${song.title}</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <span class="card-artist">${song.artist}</span>
                <span class="added-by-pill ${isAwwnanya ? 'awwnanya' : ''}">${byName}</span>
              </div>
            </div>
            ${song.isFav ? `<div class="card-fav-icon">♥</div>` : ''}
            <button class="card-del-btn" data-delid="${song.id}" title="Delete song">✕</button>
          </div>
        </div>
      `;
    }).join("");
  } else {
    grid.innerHTML = songs.map(song => {
      const isCurPlaying = isPlaying && currentTrack && currentTrack.id === song.id;
      const byName = song.addedBy || "Avi";
      const isAwwnanya = byName.toLowerCase().includes("awwnanya");
      return `
        <div class="cw">
          <div class="card ${isCurPlaying ? 'playing' : ''} ${song.isFav ? 'is-fav' : ''}" data-id="${song.id}">
            <button class="card-del-btn" data-delid="${song.id}" title="Delete song">✕</button>
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
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:4px;">
              <span class="card-artist" style="margin-top:0;">${song.artist}</span>
              <span class="added-by-pill ${isAwwnanya ? 'awwnanya' : ''}">${byName}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  grid.querySelectorAll(".card").forEach(card => {
    setupTilt(card);
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

  grid.querySelectorAll(".card-del-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTrack(btn.dataset.delid);
    });
  });
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

function renderPlaylists() {
  const container = document.getElementById("playlistsContainer");
  if (!container) return;

  if (playlists.length === 0) {
    container.innerHTML = "";
    return;
  }

  if (playlistViewMode === "cards") {
    container.className = "playlist-cards-grid";
    container.innerHTML = playlists.map(plName => {
      const plSongs = catalog.filter(s => s.playlists && s.playlists.includes(plName));
      const thumbs = plSongs.slice(0, 3).map(s => s.thumbnail || 'https://i.ytimg.com/vi/' + s.youtubeId + '/hqdefault.jpg');
      
      const thumbMarkup = thumbs.length > 0 
        ? thumbs.map((t, idx) => `<div class="stacked-thumb stacked-thumb-${idx + 1}"><img src="${t}" alt="" /></div>`).join("")
        : `<div class="stacked-thumb stacked-thumb-3"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:32px;">≡ƒÄ╡</div></div>`;

      const ytmUrl = `https://music.youtube.com/search?q=${encodeURIComponent(plName)}`;
      const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(plName)}`;

      return `
        <div class="pl-card" data-pl="${plName}">
          <div class="stacked-thumbnails-wrap">
            ${thumbMarkup}
          </div>
          <div class="pl-card-meta">
            <div class="pl-card-title-row">
              <span class="pl-card-name">${plName}</span>
              <span class="pl-card-count">${plSongs.length} tracks</span>
            </div>
          </div>
          <div class="pl-card-actions">
            <div style="display:flex;gap:6px;">
              <button class="plat-pill ytm pl-play-btn" data-pl="${plName}" title="Play All Tracks">
                ▶ Play All
              </button>
              <button class="btn-s pl-edit-btn" data-pl="${plName}" style="height:28px;padding:0 12px;font-size:11px;">
                ✏ Edit
              </button>
            </div>
            <div style="display:flex;gap:6px;">
              <a href="${ytmUrl}" target="_blank" class="plat-pill ytm" title="YouTube Music" onclick="event.stopPropagation()">YT</a>
              <a href="${spotifyUrl}" target="_blank" class="plat-pill sp" title="Spotify" onclick="event.stopPropagation()">Spotify</a>
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".pl-card").forEach(card => {
      card.addEventListener("click", () => {
        const plName = card.dataset.pl;
        openPlaylistDetailModal(plName);
      });
    });

    container.querySelectorAll(".pl-play-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        playPlaylistTracks(btn.dataset.pl);
      });
    });

    container.querySelectorAll(".pl-edit-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openPlaylistEditModal(btn.dataset.pl);
      });
    });
  } else {
    container.className = "";
    renderPlaylistsAccordion();
  }
}




function renderPlaylistsAccordion() {
  const container = document.getElementById("playlistsContainer");
  if (!container) return;

  container.innerHTML = playlists.map(plName => {
    const plSongs = catalog.filter(s => s.playlists && s.playlists.includes(plName));
    const ytmUrl = `https://music.youtube.com/search?q=${encodeURIComponent(plName)}`;
    const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(plName)}`;

    return `
      <div class="pl-accordion">
        <div class="pl-acc-header" data-pl="${plName}">
          <div class="pl-acc-left">
            <div class="pl-acc-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span>${plName}</span>
              <span class="pl-acc-count">(${plSongs.length} tracks)</span>
            </div>

            <div class="pl-actions" onclick="event.stopPropagation()">
              <button class="btn-s pl-edit-btn" data-pl="${plName}" style="height:26px;padding:0 10px;font-size:11px;">
                ✏ Edit
              </button>
              <a href="${ytmUrl}" target="_blank" class="plat-pill ytm" title="Listen playlist on YouTube Music">
                YT Music
              </a>
              <a href="${spotifyUrl}" target="_blank" class="plat-pill sp" title="Listen playlist on Spotify">
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
                  <button class="card-del-btn" data-delid="${song.id}" title="Delete song">✕</button>
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

  container.querySelectorAll(".pl-acc-header").forEach(header => {
    header.addEventListener("click", () => {
      const accordion = header.closest(".pl-accordion");
      accordion.classList.toggle("open");
    });
  });

  container.querySelectorAll(".pl-edit-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openPlaylistEditModal(btn.dataset.pl);
    });
  });

  container.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      const songId = card.dataset.id;
      const song = catalog.find(s => s.id === songId);
      if (song) playTrack(song);
    });
  });

  container.querySelectorAll(".card-del-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTrack(btn.dataset.delid);
    });
  });
}

function playPlaylistTracks(plName) {
  const plSongs = catalog.filter(s => s.playlists && s.playlists.includes(plName));
  if (plSongs.length > 0) {
    playbackQueue = [...plSongs];
    queueIndex = 0;
    playTrack(playbackQueue[0]);
    showToast(`Playing playlist: ${plName}`);
  } else {
    showToast(`No tracks in ${plName}`);
  }
}

/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
   VIEW CONTROL LISTENERS & PERSISTENCE
   ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */
function initViewControlListeners() {
  const gridBtn = document.getElementById("viewModeGridBtn");
  const listBtn = document.getElementById("viewModeListBtn");
  const plCardsBtn = document.getElementById("plViewCardsBtn");
  const plRowBtn = document.getElementById("plViewRowBtn");

  if (gridBtn && listBtn) {
    gridBtn.addEventListener("click", () => {
      viewMode = "grid";
      localStorage.setItem("forher_viewMode", "grid");
      updateViewControlUI();
      renderSongsGrid();
    });
    listBtn.addEventListener("click", () => {
      viewMode = "list";
      localStorage.setItem("forher_viewMode", "list");
      updateViewControlUI();
      renderSongsGrid();
    });
  }

  if (plCardsBtn && plRowBtn) {
    plCardsBtn.addEventListener("click", () => {
      playlistViewMode = "cards";
      localStorage.setItem("forher_plViewMode", "cards");
      updateViewControlUI();
      renderPlaylists();
    });
    plRowBtn.addEventListener("click", () => {
      playlistViewMode = "rows";
      localStorage.setItem("forher_plViewMode", "rows");
      updateViewControlUI();
      renderPlaylists();
    });
  }

  updateViewControlUI();
}

function updateViewControlUI() {
  const gridBtn = document.getElementById("viewModeGridBtn");
  const listBtn = document.getElementById("viewModeListBtn");
  const plCardsBtn = document.getElementById("plViewCardsBtn");
  const plRowBtn = document.getElementById("plViewRowBtn");

  if (gridBtn && listBtn) {
    gridBtn.classList.toggle("on", viewMode === "grid");
    listBtn.classList.toggle("on", viewMode === "list");
  }

  if (plCardsBtn && plRowBtn) {
    plCardsBtn.classList.toggle("on", playlistViewMode === "cards");
    plRowBtn.classList.toggle("on", playlistViewMode === "rows");
  }
}

/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
   PLAYLIST DETAIL VIEW MODAL
   ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */
let viewingPlaylistName = null;

function openPlaylistDetailModal(plName) {
  viewingPlaylistName = plName;
  const modal = document.getElementById("playlistDetailModal");
  if (!modal) return;

  renderPlaylistDetailContents();
  modal.classList.add("open");
}

function closePlaylistDetailModal() {
  const modal = document.getElementById("playlistDetailModal");
  if (modal) modal.classList.remove("open");
  viewingPlaylistName = null;
}

function renderPlaylistDetailContents() {
  if (!viewingPlaylistName) return;
  const plName = viewingPlaylistName;
  const plSongs = catalog.filter(s => s.playlists && s.playlists.includes(plName));

  const nameEl = document.getElementById("plDetailName");
  if (nameEl) nameEl.textContent = plName;

  const countEl = document.getElementById("plDetailCount");
  if (countEl) countEl.textContent = `${plSongs.length} song${plSongs.length === 1 ? '' : 's'}`;

  // Stack thumbnails
  const stackEl = document.getElementById("plDetailStack");
  if (stackEl) {
    const thumbs = plSongs.slice(0, 3).map(s => s.thumbnail || 'https://i.ytimg.com/vi/' + s.youtubeId + '/hqdefault.jpg');
    stackEl.innerHTML = thumbs.length > 0
      ? thumbs.map((t, idx) => `<div class="stacked-thumb stacked-thumb-${idx + 1}"><img src="${t}" alt="" /></div>`).join("")
      : `<div class="stacked-thumb stacked-thumb-3"><div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:28px;">≡ƒÄ╡</div></div>`;
  }

  // Buttons & Links
  const playAllBtn = document.getElementById("plDetailPlayAllBtn");
  if (playAllBtn) {
    playAllBtn.onclick = () => {
      playPlaylistTracks(plName);
    };
  }
  const editBtn = document.getElementById("plDetailEditBtn");
  if (editBtn) {
    editBtn.onclick = () => {
      closePlaylistDetailModal();
      openPlaylistEditModal(plName);
    };
  }

  const ytLink = document.getElementById("plDetailYtLink");
  if (ytLink) ytLink.href = `https://music.youtube.com/search?q=${encodeURIComponent(plName)}`;
  const spLink = document.getElementById("plDetailSpLink");
  if (spLink) spLink.href = `https://open.spotify.com/search/${encodeURIComponent(plName)}`;

  // Tracklist
  const tracklistEl = document.getElementById("plDetailTracklist");
  if (tracklistEl) {
    if (plSongs.length === 0) {
      tracklistEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px;">No songs in this playlist yet.</div>`;
    } else {
      tracklistEl.innerHTML = plSongs.map((song, idx) => {
        const isCurPlaying = isPlaying && currentTrack && currentTrack.id === song.id;
        const byName = song.addedBy || "Avi";
        const isAwwnanya = byName.toLowerCase().includes("awwnanya");
        return `
          <div class="pl-detail-track-row ${isCurPlaying ? 'playing' : ''}" data-id="${song.id}">
            <div class="pl-detail-track-left">
              <span class="pl-detail-track-num">${idx + 1}</span>
              <div class="pl-detail-track-thumb"><img src="${song.thumbnail || 'https://i.ytimg.com/vi/' + song.youtubeId + '/hqdefault.jpg'}" alt="" /></div>
              <div class="pl-detail-track-info">
                <div class="pl-detail-track-t" style="${isCurPlaying ? 'color:var(--warm);font-weight:700;' : ''}">${song.title}</div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                  <span class="pl-detail-track-a">${song.artist}</span>
                  <span class="added-by-pill ${isAwwnanya ? 'awwnanya' : ''}">${byName}</span>
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:11px;color:var(--muted);">${song.durationStr || '3:30'}</span>
              <button class="cpo-btn" style="width:30px;height:30px;box-shadow:none;border:1px solid rgba(0,0,0,0.06);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
            </div>
          </div>
        `;
      }).join("");

      tracklistEl.querySelectorAll(".pl-detail-track-row").forEach(row => {
        row.addEventListener("click", () => {
          const songId = row.dataset.id;
          const song = catalog.find(s => s.id === songId);
          if (song) playTrack(song);
        });
      });
    }
  }
}

/* ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ
   PLAYLIST EDITOR MODAL & TRACK MANAGEMENT
   ΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉ */
function openPlaylistEditModal(plName) {
  editingPlaylistName = plName;
  const modal = document.getElementById("playlistEditModal");
  const renameInput = document.getElementById("plRenameInput");
  if (!modal) return;

  if (renameInput) renameInput.value = plName;
  renderPlaylistEditContents();
  modal.classList.add("open");
}

function closePlaylistEditModal() {
  const modal = document.getElementById("playlistEditModal");
  if (modal) modal.classList.remove("open");
  editingPlaylistName = null;
}

function renderPlaylistEditContents() {
  if (!editingPlaylistName) return;
  const plName = editingPlaylistName;
  const plSongs = catalog.filter(s => s.playlists && s.playlists.includes(plName));
  
  const countSpan = document.getElementById("plEditTrackCount");
  if (countSpan) countSpan.textContent = `${plSongs.length} tracks`;

  const songsList = document.getElementById("plEditSongsList");
  if (songsList) {
    if (plSongs.length === 0) {
      songsList.innerHTML = `<div style="padding:14px;color:var(--muted);font-size:13px;text-align:center;">No songs in this playlist. Select songs below to add!</div>`;
    } else {
      songsList.innerHTML = plSongs.map((song, idx) => `
        <div class="pl-song-item" data-id="${song.id}">
          <div class="pl-song-left">
            <span class="pl-drag-handle" title="Move">:::</span>
            <div class="pl-song-thumb"><img src="${song.thumbnail || 'https://i.ytimg.com/vi/' + song.youtubeId + '/hqdefault.jpg'}" alt="" /></div>
            <div class="pl-song-details">
              <div class="pl-song-t">${song.title}</div>
              <div class="pl-song-a">${song.artist}</div>
            </div>
          </div>
          <div class="pl-song-actions">
            ${idx > 0 ? `<button class="btn-icon-s" onclick="movePlaylistSong('${song.id}', ${idx}, ${idx - 1})" title="Move Up">↑</button>` : ''}
            ${idx < plSongs.length - 1 ? `<button class="btn-icon-s" onclick="movePlaylistSong('${song.id}', ${idx}, ${idx + 1})" title="Move Down">↓</button>` : ''}
            <button class="btn-icon-s danger" onclick="removeSongFromPlaylist('${song.id}', '${plName.replace(/'/g, "\\'")}')" title="Remove from playlist">✕</button>
          </div>
        </div>
      `).join("");
    }
  }

  const pickerList = document.getElementById("plEditPickerList");
  if (pickerList) {
    pickerList.innerHTML = catalog.map(song => {
      const inPl = song.playlists && song.playlists.includes(plName);
      return `
        <label class="pl-picker-item">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <input type="checkbox" ${inPl ? 'checked' : ''} onchange="toggleSongInPlaylist('${song.id}', '${plName.replace(/'/g, "\\'")}', this.checked)" />
            <span style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${song.title}</span>
            <span style="font-size:11px;color:var(--muted);white-space:nowrap;">- ${song.artist}</span>
          </div>
        </label>
      `;
    }).join("");
  }
}

function handlePlaylistRename() {
  if (!editingPlaylistName) return;
  const renameInput = document.getElementById("plRenameInput");
  if (!renameInput) return;
  const newName = renameInput.value.trim();
  if (!newName || newName === editingPlaylistName) return;

  const oldName = editingPlaylistName;
  playlists = playlists.map(p => p === oldName ? newName : p);
  catalog.forEach(song => {
    if (song.playlists) {
      song.playlists = song.playlists.map(p => p === oldName ? newName : p);
    }
  });

  editingPlaylistName = newName;
  saveData();
  renderPage();
  renderPlaylistEditContents();
  showToast(`Renamed playlist to: ${newName}`);
}

function removeSongFromPlaylist(songId, plName) {
  const song = catalog.find(s => s.id === songId);
  if (song && song.playlists) {
    song.playlists = song.playlists.filter(p => p !== plName);
    saveData();
    renderPage();
    renderPlaylistEditContents();
    showToast(`Removed from ${plName}`);
  }
}

function toggleSongInPlaylist(songId, plName, isChecked) {
  const song = catalog.find(s => s.id === songId);
  if (!song) return;
  if (!song.playlists) song.playlists = [];
  
  if (isChecked) {
    if (!song.playlists.includes(plName)) song.playlists.push(plName);
  } else {
    song.playlists = song.playlists.filter(p => p !== plName);
  }
  saveData();
  renderPage();
  renderPlaylistEditContents();
}

function movePlaylistSong(songId, fromIdx, toIdx) {
  if (!editingPlaylistName) return;
  const plName = editingPlaylistName;
  const plSongs = catalog.filter(s => s.playlists && s.playlists.includes(plName));
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= plSongs.length || toIdx >= plSongs.length) return;

  const songA = plSongs[fromIdx];
  const songB = plSongs[toIdx];
  const idxA = catalog.findIndex(s => s.id === songA.id);
  const idxB = catalog.findIndex(s => s.id === songB.id);

  if (idxA !== -1 && idxB !== -1) {
    const temp = catalog[idxA];
    catalog[idxA] = catalog[idxB];
    catalog[idxB] = temp;
    saveData();
    renderPage();
    renderPlaylistEditContents();
  }
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
  
  const addedByEl = document.getElementById("mDetailsAddedBy");
  if (addedByEl) {
    const byName = currentTrack.addedBy || "Avi";
    addedByEl.textContent = byName;
    addedByEl.classList.toggle("awwnanya", byName.toLowerCase().includes("awwnanya"));
  }

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

  trackContainer.querySelectorAll('.lyric-line').forEach(line => {
    line.addEventListener('click', () => {
      const t = parseFloat(line.dataset.time);
      if (!isNaN(t) && audioEl) {
        audioEl.currentTime = t;
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
          <div class="sm-res-artist">${item.artist} ┬╖ ${item.durationStr}</div>
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

      // Render existing playlists checkboxes
      const plContainer = document.getElementById("curationPlaylistsList");
      if (plContainer) {
        if (playlists.length === 0) {
          plContainer.innerHTML = `<span style="font-size:12px;color:var(--muted);">No playlists created yet. Type below to create one!</span>`;
        } else {
          plContainer.innerHTML = playlists.map(pl => `
            <label class="curation-pl-chip" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:16px;background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.08);font-size:12px;font-weight:600;cursor:pointer;user-select:none;">
              <input type="checkbox" value="${pl}" class="curation-pl-checkbox" style="accent-color:var(--text);cursor:pointer;" />
              <span>${pl}</span>
            </label>
          `).join('');
        }
      }

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
  const addedByInput = document.getElementById("curationAddedByInput");
  const addedByVal = addedByInput ? addedByInput.value.trim() : "Avi";

  // Gather checked playlists
  const checkedPls = Array.from(document.querySelectorAll(".curation-pl-checkbox:checked")).map(cb => cb.value);

  // If a new playlist name was entered, include it
  if (newPlName) {
    if (!playlists.includes(newPlName)) {
      playlists.push(newPlName);
    }
    if (!checkedPls.includes(newPlName)) {
      checkedPls.push(newPlName);
    }
  }

  const lyrics = selectedCurationTrack.lyrics || await fetchTrackLyrics(selectedCurationTrack.title, selectedCurationTrack.artist);

  const newTrack = {
    id: selectedCurationTrack.youtubeId + "-" + Date.now(),
    title: selectedCurationTrack.title,
    artist: selectedCurationTrack.artist,
    youtubeId: selectedCurationTrack.youtubeId,
    thumbnail: selectedCurationTrack.thumbnail,
    personalNote: note,
    addedBy: addedByVal || "Avi",
    isFav: false,
    playlists: checkedPls,
    durationStr: selectedCurationTrack.durationStr || "3:30",
    lyrics: lyrics
  };

  catalog.unshift(newTrack);
  await saveData();

  document.getElementById("searchModal").classList.remove("open");
  renderPage();
  updateStats();
  showToast("Added to your songs!");

  // Keep currently playing track if active; only play newTrack if no song is playing!
  if (!currentTrack || !isPlaying) {
    playTrack(newTrack);
  } else {
    refreshCardPlayingState();
  }
}

// Background Preloader for Next Track
async function preloadNextTrack() {
  if (playbackQueue.length === 0 || queueIndex === -1) return;
  let nextIdx = (queueIndex + 1) % playbackQueue.length;
  if (shuffleMode) nextIdx = Math.floor(Math.random() * playbackQueue.length);
  const nextTrack = playbackQueue[nextIdx];
  if (!nextTrack || !nextTrack.youtubeId) return;

  // Don't re-preload if already preloaded
  if (preloadedVideoId === nextTrack.youtubeId && streamCache[nextTrack.youtubeId]) return;

  preloadedVideoId = nextTrack.youtubeId;

  try {
    if (streamCache[nextTrack.youtubeId]) {
      const data = streamCache[nextTrack.youtubeId];
      if (preloaderAudioEl && data.url) {
        preloaderAudioEl.src = data.url;
        preloaderAudioEl.load();
      }
      return;
    }

    const res = await fetch(`/api/stream/${nextTrack.youtubeId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.url) {
        streamCache[nextTrack.youtubeId] = data;
        if (preloaderAudioEl) {
          preloaderAudioEl.src = data.url;
          preloaderAudioEl.load();
        }
        console.log('[preload] Successfully preloaded next track:', nextTrack.title);
      }
    }
  } catch (err) {
    console.warn('[preload] Preload error:', err);
  }
}

// Event Bindings
function bindEvents() {
  const cornerCard = document.getElementById("cornerPosterCard");
  if (cornerCard) {
    cornerCard.addEventListener('click', () => {
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
        showToast("Play a song first to manage playlists");
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

  const handleSeek = (e, container) => {
    const rect = container.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (activeEngine === 'yt' && ytPlayerReady && ytPlayer && typeof ytPlayer.getDuration === 'function') {
      const dur = ytPlayer.getDuration();
      if (dur > 0) ytPlayer.seekTo(pct * dur);
    } else if (audioEl && audioEl.duration) {
      audioEl.currentTime = pct * audioEl.duration;
    }
  };

  const mProgressContainer = document.getElementById('mProgressContainer');
  if (mProgressContainer) {
    mProgressContainer.addEventListener('click', (e) => handleSeek(e, mProgressContainer));
  }

  const progressContainer = document.getElementById('progressContainer');
  if (progressContainer) {
    progressContainer.addEventListener('click', (e) => handleSeek(e, progressContainer));
  }

  const volumeContainer = document.getElementById('volumeContainer');
  if (volumeContainer) {
    volumeContainer.addEventListener('click', (e) => {
      const rect = volumeContainer.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (activeEngine === 'yt' && ytPlayerReady && ytPlayer && typeof ytPlayer.setVolume === 'function') {
        ytPlayer.setVolume(Math.round(pct * 100));
      }
      if (audioEl) audioEl.volume = pct;
      localStorage.setItem('local_volume', pct.toString());
      updateVolumeUI(pct);
    });
  }
      if (audioEl) audioEl.volume = pct;
      localStorage.setItem('local_volume', pct.toString());
      updateVolumeUI(pct);
    });
  }

  const muteBtn = document.getElementById('volumeMuteBtn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      if (!audioEl) return;
      audioEl.muted = !audioEl.muted;
      updateVolumeUI(audioEl.muted ? 0 : audioEl.volume);
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

  // Playlist Editor Modal Events
  const closePlEditModalBtn = document.getElementById("closePlEditModalBtn");
  if (closePlEditModalBtn) {
    closePlEditModalBtn.addEventListener("click", closePlaylistEditModal);
  }

  const plRenameSaveBtn = document.getElementById("plRenameSaveBtn");
  if (plRenameSaveBtn) {
    plRenameSaveBtn.addEventListener("click", handlePlaylistRename);
  }

  const plEditModal = document.getElementById("playlistEditModal");
  if (plEditModal) {
    plEditModal.addEventListener("click", (e) => {
      if (e.target === plEditModal) closePlaylistEditModal();
    });
  }

  // Playlist Detail Modal Events
  const closePlDetailModalBtn = document.getElementById("closePlDetailModalBtn");
  if (closePlDetailModalBtn) {
    closePlDetailModalBtn.addEventListener("click", closePlaylistDetailModal);
  }

  const plDetailModal = document.getElementById("playlistDetailModal");
  if (plDetailModal) {
    plDetailModal.addEventListener("click", (e) => {
      if (e.target === plDetailModal) closePlaylistDetailModal();
    });
  }

  // Collapsible All Songs Header
  const allSongsHeader = document.getElementById("allSongsHeader");
  if (allSongsHeader) {
    allSongsHeader.addEventListener("click", toggleAllSongsCollapse);
  }

  // Import Playlist Modal Events
  const openImportModalBtn = document.getElementById("openImportModalBtn");
  if (openImportModalBtn) {
    openImportModalBtn.addEventListener("click", openImportPlaylistModal);
  }

  const openImportModalHeaderBtn = document.getElementById("openImportModalHeaderBtn");
  if (openImportModalHeaderBtn) {
    openImportModalHeaderBtn.addEventListener("click", openImportPlaylistModal);
  }

  const importModalCloseBtn = document.getElementById("importModalCloseBtn");
  if (importModalCloseBtn) {
    importModalCloseBtn.addEventListener("click", closeImportPlaylistModal);
  }

  const importModal = document.getElementById("importPlaylistModal");
  if (importModal) {
    importModal.addEventListener("click", (e) => {
      if (e.target === importModal) closeImportPlaylistModal();
    });
  }

  const startImportBtn = document.getElementById("startImportBtn");
  if (startImportBtn) {
    startImportBtn.addEventListener("click", handleImportPlaylist);
  }

  // In-Playlist Direct Search Events
  const plInlineSearchBtn = document.getElementById("plInlineSearchBtn");
  if (plInlineSearchBtn) {
    plInlineSearchBtn.addEventListener("click", handleInlinePlaylistSearch);
  }

  const plInlineSearchInput = document.getElementById("plInlineSearchInput");
  if (plInlineSearchInput) {
    plInlineSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleInlinePlaylistSearch();
    });
  }

  // Page Info Modal Handlers
  const openPageInfoBtn = document.getElementById("openPageInfoBtn");
  const pageInfoModal = document.getElementById("pageInfoModal");
  const closePageInfoModalBtn = document.getElementById("closePageInfoModalBtn");
  const startListeningBtn = document.getElementById("startListeningBtn");

  const hasSeenSongsInfo = localStorage.getItem("has_seen_songs_info");
  if (!hasSeenSongsInfo && pageInfoModal) {
    setTimeout(() => pageInfoModal.classList.add("open"), 600);
  }

  function closeSongsInfoModal() {
    if (pageInfoModal) pageInfoModal.classList.remove("open");
    localStorage.setItem("has_seen_songs_info", "true");
  }

  if (openPageInfoBtn && pageInfoModal) {
    openPageInfoBtn.addEventListener("click", () => pageInfoModal.classList.add("open"));
  }
  if (closePageInfoModalBtn) {
    closePageInfoModalBtn.addEventListener("click", closeSongsInfoModal);
  }
  if (startListeningBtn) {
    startListeningBtn.addEventListener("click", closeSongsInfoModal);
  }
  if (pageInfoModal) {
    pageInfoModal.addEventListener("click", (e) => {
      if (e.target === pageInfoModal) closeSongsInfoModal();
    });
  }

  // Rooms Navigation Modal Handlers
  const openRoomsModalBtn = document.getElementById("openRoomsModalBtn");
  const roomsNavigationModal = document.getElementById("roomsNavigationModal");
  const closeRoomsModalBtn = document.getElementById("closeRoomsModalBtn");

  if (openRoomsModalBtn && roomsNavigationModal) {
    openRoomsModalBtn.addEventListener("click", () => roomsNavigationModal.classList.add("open"));
  }
  if (closeRoomsModalBtn && roomsNavigationModal) {
    closeRoomsModalBtn.addEventListener("click", () => roomsNavigationModal.classList.remove("open"));
  }
  if (roomsNavigationModal) {
    roomsNavigationModal.addEventListener("click", (e) => {
      if (e.target === roomsNavigationModal) roomsNavigationModal.classList.remove("open");
    });
  }

  // Initialize View Controls Toolbar
  initViewControlListeners();
}

// Collapsible Section State
let isAllSongsCollapsed = localStorage.getItem("forher_allSongsCollapsed") === "true";

function updateAllSongsCollapseUI() {
  const section = document.getElementById("allSongsSection");
  const chevron = document.getElementById("allSongsChevron");
  const label = document.getElementById("allSongsToggleLabel");
  const countBadge = document.getElementById("allSongsCountBadge");

  const songs = getFilteredSongs();
  if (countBadge) countBadge.textContent = `${songs.length} track${songs.length === 1 ? '' : 's'}`;

  if (!section) return;

  if (isAllSongsCollapsed) {
    section.classList.add("collapsed");
    if (chevron) chevron.style.transform = "rotate(-90deg)";
    if (label) label.textContent = `Show All (${songs.length})`;
  } else {
    section.classList.remove("collapsed");
    if (chevron) chevron.style.transform = "rotate(0deg)";
    if (label) label.textContent = "Collapse";
  }
}

function toggleAllSongsCollapse() {
  isAllSongsCollapsed = !isAllSongsCollapsed;
  localStorage.setItem("forher_allSongsCollapsed", isAllSongsCollapsed ? "true" : "false");
  updateAllSongsCollapseUI();
}

// Importer Modal Handlers
function openImportPlaylistModal() {
  const modal = document.getElementById("importPlaylistModal");
  if (modal) modal.classList.add("open");
}

function closeImportPlaylistModal() {
  const modal = document.getElementById("importPlaylistModal");
  if (modal) modal.classList.remove("open");
}

async function handleImportPlaylist() {
  const urlInput = document.getElementById("importUrlInput");
  const nameInput = document.getElementById("importNameInput");
  const ownerInput = document.getElementById("importOwnerInput");
  const statusMsg = document.getElementById("importStatusMsg");
  const btnText = document.getElementById("startImportBtnText");
  const startBtn = document.getElementById("startImportBtn");

  const url = urlInput ? urlInput.value.trim() : "";
  const name = nameInput ? nameInput.value.trim() : "";
  const owner = ownerInput ? ownerInput.value.trim() : "Awwnanya";

  if (!url) {
    showToast("Please enter a playlist URL");
    return;
  }
  if (!name) {
    showToast("Please enter a playlist name");
    return;
  }

  if (statusMsg) {
    statusMsg.style.display = "block";
    statusMsg.textContent = "⏳ Extracting tracks and resolving stream IDs... Please wait.";
  }
  if (startBtn) startBtn.disabled = true;
  if (btnText) btnText.textContent = "Importing...";

  try {
    const res = await fetch("/api/import-playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, playlistName: name, addedBy: owner })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      if (statusMsg) {
        statusMsg.textContent = `✅ Successfully imported ${data.importedCount} tracks into "${name}"!`;
      }
      showToast(`Imported ${data.importedCount} tracks into ${name}!`);
      if (urlInput) urlInput.value = "";
      if (nameInput) nameInput.value = "";

      await loadData();

      setTimeout(() => {
        closeImportPlaylistModal();
        if (statusMsg) statusMsg.style.display = "none";
        if (startBtn) startBtn.disabled = false;
        if (btnText) btnText.textContent = "Import All Tracks";
      }, 1200);
    } else {
      if (statusMsg) {
        statusMsg.textContent = `❌ ${data.error || "Failed to import playlist. Please check playlist privacy."}`;
      }
      if (startBtn) startBtn.disabled = false;
      if (btnText) btnText.textContent = "Import All Tracks";
    }
  } catch (err) {
    console.error("Import playlist error:", err);
    if (statusMsg) {
      if (window.location.protocol === 'file:') {
        statusMsg.textContent = "❌ Server not active! Please run 'npm start' and open http://localhost:3000 to import playlists.";
      } else {
        statusMsg.textContent = "❌ Could not reach server. Please ensure Node.js server is running.";
      }
    }
    if (startBtn) startBtn.disabled = false;
    if (btnText) btnText.textContent = "Import All Tracks";
  }
}


// In-Playlist Inline YouTube Search Handler
function escapeHtml(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function handleInlinePlaylistSearch() {
  const input = document.getElementById("plInlineSearchInput");
  const resultsContainer = document.getElementById("plInlineSearchResults");
  if (!input || !resultsContainer || !editingPlaylistName) return;

  const query = input.value.trim();
  if (!query) return;

  resultsContainer.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:8px;">Searching YouTube...</div>`;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        resultsContainer.innerHTML = data.map(item => `
          <div class="pl-inline-result-card">
            <img src="${item.thumbnail}" class="pl-inline-thumb" alt="" />
            <div class="pl-inline-info">
              <div class="pl-inline-title">${escapeHtml(item.title)}</div>
              <div class="pl-inline-artist">${escapeHtml(item.artist)}</div>
            </div>
            <button class="btn-s pl-inline-add-btn" data-ytid="${item.youtubeId}" data-title="${escapeHtml(item.title)}" data-artist="${escapeHtml(item.artist)}" data-thumb="${item.thumbnail}" style="height:26px;padding:0 10px;font-size:11px;background:var(--text);color:var(--bg);">
              + Add
            </button>
          </div>
        `).join("");

        resultsContainer.querySelectorAll(".pl-inline-add-btn").forEach(btn => {
          btn.addEventListener("click", async () => {
            const ytid = btn.dataset.ytid;
            const title = btn.dataset.title;
            const artist = btn.dataset.artist;
            const thumb = btn.dataset.thumb;

            let existingTrack = catalog.find(s => s.youtubeId === ytid);
            if (existingTrack) {
              if (!existingTrack.playlists) existingTrack.playlists = [];
              if (!existingTrack.playlists.includes(editingPlaylistName)) {
                existingTrack.playlists.push(editingPlaylistName);
              }
            } else {
              const lyrics = await fetchTrackLyrics(title, artist);
              const newTrack = {
                id: `${ytid}-${Date.now()}`,
                title,
                artist,
                youtubeId: ytid,
                thumbnail: thumb,
                personalNote: "",
                addedBy: "Avi",
                isFav: false,
                playlists: [editingPlaylistName],
                durationStr: "3:30",
                lyrics
              };
              catalog.unshift(newTrack);
            }

            await saveData();
            renderPage();
            renderPlaylistEditContents();
            showToast(`Added "${title}" to ${editingPlaylistName}`);
          });
        });
        return;
      }
    }
    resultsContainer.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:8px;">No matching tracks found.</div>`;
  } catch (e) {
    console.error("Inline search error:", e);
    resultsContainer.innerHTML = `<div style="font-size:12px;color:var(--muted);padding:8px;">Search failed.</div>`;
  }
}

