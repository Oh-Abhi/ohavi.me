const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ytdl = require('@distube/ytdl-core');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static assets
app.use('/photos', express.static(path.join(__dirname, 'photos')));
app.use('/111', express.static(path.join(__dirname, '111')));
app.use('/legacy', express.static(path.join(__dirname, 'legacy')));
app.use(express.static(__dirname));

app.get('/legacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'legacy', 'index.html'));
});


// Songs API
const songsFilePath = path.join(__dirname, 'songs.json');


app.get('/api/songs', (req, res) => {
  try {
    if (fs.existsSync(songsFilePath)) {
      const data = fs.readFileSync(songsFilePath, 'utf8');
      return res.json(JSON.parse(data));
    }
    res.json([]);
  } catch (err) {
    console.error('Error reading songs.json:', err);
    res.status(500).json({ error: 'Failed to read songs catalog' });
  }
});

app.post('/api/songs', (req, res) => {
  try {
    const songs = req.body;
    fs.writeFileSync(songsFilePath, JSON.stringify(songs, null, 2), 'utf8');
    res.json({ success: true, count: songs.length });
  } catch (err) {
    console.error('Error saving songs.json:', err);
    res.status(500).json({ error: 'Failed to save songs catalog' });
  }
});

app.delete('/api/songs/:id', (req, res) => {
  try {
    const songId = req.params.id;
    if (fs.existsSync(songsFilePath)) {
      let songs = JSON.parse(fs.readFileSync(songsFilePath, 'utf8'));
      songs = songs.filter(s => s.id !== songId);
      fs.writeFileSync(songsFilePath, JSON.stringify(songs, null, 2), 'utf8');
      return res.json({ success: true, remaining: songs.length });
    }
    res.json({ success: true, remaining: 0 });
  } catch (err) {
    console.error('Error deleting song:', err);
    res.status(500).json({ error: 'Failed to delete song' });
  }
});

// Audio Stream URL Extractor — uses yt-dlp (always up to date with YouTube)
const { execFile } = require('child_process');
app.get('/api/stream/:videoId', (req, res) => {
  const { videoId } = req.params;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Use yt-dlp to get the best audio-only stream URL
  // -f bestaudio: best audio-only, -g: print URL only, --no-playlist: single video
  execFile('yt-dlp', ['-f', 'bestaudio', '-g', '--no-playlist', url], (err, stdout, stderr) => {
    if (err || !stdout.trim()) {
      console.error('[yt-dlp error]', stderr || err?.message);

      // Fallback: try any audio-capable format
      execFile('yt-dlp', ['-f', 'best[ext=mp4]', '-g', '--no-playlist', url], (err2, stdout2) => {
        if (err2 || !stdout2.trim()) {
          return res.status(500).json({ error: 'Failed to extract audio stream' });
        }
        console.log(`[stream] fallback mp4 for ${videoId}`);
        res.json({ url: stdout2.trim(), mimeType: 'video/mp4' });
      });
      return;
    }

    const streamUrl = stdout.trim();
    console.log(`[stream] got audio URL for ${videoId}`);
    res.json({ url: streamUrl, mimeType: 'audio/webm' });
  });
});

// Movies API
const moviesFilePath = path.join(__dirname, 'movies.json');

app.get('/api/movies', (req, res) => {
  try {
    if (fs.existsSync(moviesFilePath)) {
      const data = fs.readFileSync(moviesFilePath, 'utf8');
      return res.json(JSON.parse(data));
    }
    res.json({ movies: [], playlists: [] });
  } catch (err) {
    console.error('Error reading movies.json:', err);
    res.status(500).json({ error: 'Failed to read movies catalog' });
  }
});

app.post('/api/movies', (req, res) => {
  try {
    const data = req.body;
    fs.writeFileSync(moviesFilePath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, count: data.movies ? data.movies.length : 0 });
  } catch (err) {
    console.error('Error saving movies.json:', err);
    res.status(500).json({ error: 'Failed to save movies catalog' });
  }
});

app.delete('/api/movies/:id', (req, res) => {
  try {
    const movieId = req.params.id;
    if (fs.existsSync(moviesFilePath)) {
      let catalogData = JSON.parse(fs.readFileSync(moviesFilePath, 'utf8'));
      if (Array.isArray(catalogData)) {
        catalogData = catalogData.filter(m => m.id !== movieId);
      } else if (catalogData.movies) {
        catalogData.movies = catalogData.movies.filter(m => m.id !== movieId);
      }
      fs.writeFileSync(moviesFilePath, JSON.stringify(catalogData, null, 2), 'utf8');
      return res.json({ success: true });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting movie:', err);
    res.status(500).json({ error: 'Failed to delete movie' });
  }
});

// iTunes Movie Search API
app.get('/api/search-movies', async (req, res) => {
  const query = req.query.q;
  if (!query || !query.trim()) return res.json([]);

  const cleanQuery = query.trim();

  try {
    // 1. Try movie specific entity
    let itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&media=movie&limit=10`);
    let data = null;
    if (itunesRes.ok) {
      data = await itunesRes.json();
    }

    // 2. Fallback to general search if movie specific entity returns no items
    if (!data || !data.results || data.results.length === 0) {
      itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&limit=10`);
      if (itunesRes.ok) {
        data = await itunesRes.json();
      }
    }

    if (data && data.results && data.results.length > 0) {
      const movies = data.results.map(item => {
        const yearStr = item.releaseDate ? item.releaseDate.substring(0, 4) : '2023';
        let poster = item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : '';
        return {
          title: item.trackName || item.collectionName || cleanQuery,
          director: item.artistName || 'Film Director',
          year: yearStr,
          genre: item.primaryGenreName || (item.kind === 'feature-movie' ? 'Movie' : 'Cinema'),
          poster: poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=800&auto=format&fit=crop',
          overview: item.longDescription || item.shortDescription || '',
          previewUrl: item.previewUrl || '',
          contentRating: item.contentAdvisoryRating || 'PG-13',
          rating: 5,
          youtubeId: ''
        };
      });
      return res.json(movies);
    }

    res.json([]);
  } catch (err) {
    console.error('Search Movies API Error:', err);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

// Responses API for Chapter IV
const responsesFilePath = path.join(__dirname, 'responses.json');

app.get('/api/responses', (req, res) => {
  try {
    if (fs.existsSync(responsesFilePath)) {
      const data = fs.readFileSync(responsesFilePath, 'utf8');
      return res.json(JSON.parse(data));
    }
    res.json({ replies: [], questions: {}, choices: {} });
  } catch (err) {
    console.error('Error reading responses.json:', err);
    res.status(500).json({ error: 'Failed to read responses' });
  }
});

app.post('/api/responses', (req, res) => {
  try {
    const payload = req.body;
    let existing = { replies: [], questions: {}, choices: {}, lastUpdated: new Date().toISOString() };
    if (fs.existsSync(responsesFilePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(responsesFilePath, 'utf8'));
      } catch (e) {}
    }
    const updated = {
      ...existing,
      ...payload,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(responsesFilePath, JSON.stringify(updated, null, 2), 'utf8');
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Error saving responses.json:', err);
    res.status(500).json({ error: 'Failed to save responses' });
  }
});

function formatSeconds(secs) {
  if (isNaN(secs) || secs < 0) return "3:30";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function parseLRC(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split(/\r?\n/);
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msStr = match[3].length === 2 ? match[3] + '0' : match[3];
      const ms = parseInt(msStr, 10);
      const totalTime = min * 60 + sec + ms / 1000;
      const text = match[4].trim();
      if (text) {
        result.push({ time: parseFloat(totalTime.toFixed(2)), text });
      }
    }
  }
  return result;
}

// REAL SYNCED LYRICS API VIA LRCLIB
app.get('/api/lyrics', async (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.json([]);

  try {
    // 1. Try exact match on LRCLIB
    const lrclibGetUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist || '')}`;
    const getRes = await fetch(lrclibGetUrl);
    if (getRes.ok) {
      const data = await getRes.json();
      if (data.syncedLyrics) {
        const parsed = parseLRC(data.syncedLyrics);
        if (parsed.length > 0) return res.json(parsed);
      }
      if (data.plainLyrics) {
        const plainLines = data.plainLyrics.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const spaced = plainLines.map((text, i) => ({ time: i * 4, text }));
        return res.json(spaced);
      }
    }

    // 2. Try search fallback on LRCLIB
    const lrclibSearchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${artist || ''} ${title}`)}`;
    const searchRes = await fetch(lrclibSearchUrl);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (Array.isArray(searchData) && searchData.length > 0) {
        const match = searchData.find(item => item.syncedLyrics) || searchData[0];
        if (match.syncedLyrics) {
          const parsed = parseLRC(match.syncedLyrics);
          if (parsed.length > 0) return res.json(parsed);
        }
        if (match.plainLyrics) {
          const plainLines = match.plainLyrics.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const spaced = plainLines.map((text, i) => ({ time: i * 4, text }));
          return res.json(spaced);
        }
      }
    }

    res.json([]);
  } catch (err) {
    console.error('Lyrics API error:', err);
    res.json([]);
  }
});

// TARGETED YOUTUBE VIDEO SEARCH & RESOLUTION API (100% PAIRED MATCHES)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query || !query.trim()) return res.json([]);

  const cleanQuery = query.trim();

  // 1. If YouTube URL was passed directly
  const ytMatch = cleanQuery.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        return res.json([{
          title: data.title || "YouTube Track",
          artist: data.author_name || "YouTube",
          youtubeId: videoId,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationStr: "3:30"
        }]);
      }
    } catch (e) {}

    return res.json([{
      title: "YouTube Track",
      artist: "YouTube",
      youtubeId: videoId,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationStr: "3:30"
    }]);
  }

  try {
    // 2. Fetch iTunes metadata
    let itunesTracks = [];
    try {
      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=song&limit=6`);
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        if (itunesData.results) {
          itunesTracks = itunesData.results.map(r => ({
            title: r.trackName,
            artist: r.artistName,
            thumbnail: r.artworkUrl100 ? r.artworkUrl100.replace("100x100bb", "600x600bb") : null,
            durationStr: formatSeconds((r.trackTimeMillis || 210000) / 1000)
          }));
        }
      }
    } catch (e) {}

    if (itunesTracks.length === 0) {
      return res.json([]);
    }

    // 3. Resolve exact YouTube video ID for each specific track: `${artist} ${title} audio`
    const resolvedResults = await Promise.all(itunesTracks.map(async (song) => {
      const searchQuery = `${song.artist} ${song.title} audio`;
      try {
        const ytRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (ytRes.ok) {
          const html = await ytRes.text();
          const matches = Array.from(html.matchAll(/"videoId":"([\w-]{11})"/g)).map(m => m[1]);
          if (matches.length > 0) {
            return {
              ...song,
              youtubeId: matches[0], // Top matching YouTube video for this specific song!
              thumbnail: song.thumbnail || `https://i.ytimg.com/vi/${matches[0]}/hqdefault.jpg`
            };
          }
        }
      } catch (e) {}
      return null;
    }));

    const validResults = resolvedResults.filter(Boolean);
    if (validResults.length > 0) {
      return res.json(validResults);
    }

    res.json([]);
  } catch (err) {
    console.error('Search API error:', err);
    res.status(500).json({ error: 'Search resolution failed' });
  }
});

// IMPORT PLAYLIST API (Spotify & YouTube / YT Music)
app.post('/api/import-playlist', async (req, res) => {
  const { url, playlistName, addedBy } = req.body;
  if (!url || !url.trim() || !playlistName || !playlistName.trim()) {
    return res.status(400).json({ error: 'Playlist URL and Playlist Name are required' });
  }

  const cleanUrl = url.trim();
  const cleanName = playlistName.trim();
  const owner = addedBy || 'Awwnanya';

  try {
    let tracksToImport = [];

    // A. Check YouTube / YT Music Playlist
    if (cleanUrl.includes('list=') || cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
      await new Promise((resolve) => {
        execFile('yt-dlp', ['-j', '--flat-playlist', cleanUrl], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err || !stdout.trim()) {
            console.error('[import-playlist] yt-dlp playlist error:', stderr || err?.message);
            resolve();
            return;
          }

          const lines = stdout.trim().split(/\r?\n/);
          for (const line of lines) {
            try {
              const item = JSON.parse(line);
              const ytId = item.id || item.url;
              if (ytId && /^[a-zA-Z0-9_-]{11}$/.test(ytId)) {
                tracksToImport.push({
                  title: item.title || 'Untitled Track',
                  artist: item.uploader || item.channel || 'YouTube Track',
                  youtubeId: ytId,
                  thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
                  durationStr: formatSeconds(item.duration || 210)
                });
              }
            } catch (e) {}
          }
          resolve();
        });
      });
    }

    // B. Check Spotify Playlist
    if (cleanUrl.includes('spotify.com/playlist/')) {
      const match = cleanUrl.match(/playlist\/([a-zA-Z0-9]+)/);
      if (match) {
        const spotifyId = match[1];
        try {
          const spRes = await fetch(`https://open.spotify.com/embed/playlist/${spotifyId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          });
          if (spRes.ok) {
            const html = await spRes.text();
            const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s) ||
                              html.match(/<script id="initial-state" type="text\/plain">(.*?)<\/script>/s);
            let spotifyTracks = [];
            if (jsonMatch) {
              try {
                const rawJson = jsonMatch[1].startsWith('%') ? decodeURIComponent(jsonMatch[1]) : jsonMatch[1];
                const parsed = JSON.parse(rawJson);
                const itemsList = parsed?.props?.pageProps?.state?.data?.entity?.trackList ||
                                  parsed?.embedList || [];
                for (const it of itemsList) {
                  const title = it.title || it.name;
                  const artist = it.subtitle || (it.artists ? it.artists.map(a => a.name).join(', ') : '');
                  if (title) spotifyTracks.push({ title, artist: artist || 'Spotify Track' });
                }
              } catch (e) {}
            }

            if (spotifyTracks.length === 0) {
              const trackMatches = Array.from(html.matchAll(/"title":"([^"]+)".*?"subtitle":"([^"]+)"/g));
              for (const m of trackMatches) {
                spotifyTracks.push({ title: m[1], artist: m[2] });
              }
            }

            for (const spTrack of spotifyTracks.slice(0, 50)) {
              try {
                const searchQuery = `${spTrack.artist} ${spTrack.title} audio`;
                const ytRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, {
                  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                if (ytRes.ok) {
                  const ytHtml = await ytRes.text();
                  const matches = Array.from(ytHtml.matchAll(/"videoId":"([\w-]{11})"/g)).map(m => m[1]);
                  if (matches.length > 0) {
                    tracksToImport.push({
                      title: spTrack.title,
                      artist: spTrack.artist,
                      youtubeId: matches[0],
                      thumbnail: `https://i.ytimg.com/vi/${matches[0]}/hqdefault.jpg`,
                      durationStr: "3:30"
                    });
                  }
                }
              } catch (e) {}
            }
          }
        } catch (e) {
          console.error('[import-playlist] Spotify scrape error:', e);
        }
      }
    }

    if (tracksToImport.length === 0) {
      return res.status(404).json({ error: 'Could not extract tracks from playlist URL. Please make sure the playlist is public.' });
    }

    let existingCatalog = [];
    if (fs.existsSync(songsFilePath)) {
      try {
        existingCatalog = JSON.parse(fs.readFileSync(songsFilePath, 'utf8'));
      } catch (e) {}
    }

    let addedCount = 0;
    for (const t of tracksToImport) {
      const matchIndex = existingCatalog.findIndex(s => s.youtubeId === t.youtubeId || (s.title.toLowerCase() === t.title.toLowerCase() && s.artist.toLowerCase() === t.artist.toLowerCase()));
      if (matchIndex >= 0) {
        const existing = existingCatalog[matchIndex];
        if (!existing.playlists) existing.playlists = [];
        if (!existing.playlists.includes(cleanName)) {
          existing.playlists.push(cleanName);
        }
      } else {
        existingCatalog.push({
          id: `${t.youtubeId}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          title: t.title,
          artist: t.artist,
          youtubeId: t.youtubeId,
          thumbnail: t.thumbnail,
          personalNote: "",
          addedBy: owner,
          isFav: false,
          playlists: [cleanName],
          durationStr: t.durationStr || "3:30",
          lyrics: []
        });
        addedCount++;
      }
    }

    fs.writeFileSync(songsFilePath, JSON.stringify(existingCatalog, null, 2), 'utf8');
    res.json({
      success: true,
      importedCount: tracksToImport.length,
      newTracksAdded: addedCount,
      playlistName: cleanName,
      addedBy: owner,
      catalog: existingCatalog
    });
  } catch (err) {
    console.error('Import Playlist API Error:', err);
    res.status(500).json({ error: 'Failed to import playlist' });
  }
});


// 11:11 SCREENSHOTS API (Reads from /111 folder or /photos/11-11)
app.get('/api/11-11', (req, res) => {
  const dirPath111 = path.join(__dirname, '111');
  const dirPathPhotos = path.join(__dirname, 'photos', '11-11');
  const dirPath = fs.existsSync(dirPath111) ? dirPath111 : dirPathPhotos;
  const webPrefix = fs.existsSync(dirPath111) ? '/111/' : '/photos/11-11/';

  try {
    let images = [];
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      images = files
        .filter(f => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(f))
        .map((f, i) => {
          const stats = fs.statSync(path.join(dirPath, f));
          let dateStr = stats.mtime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          let timeStr = "11:11 PM";
          let ts = stats.mtimeMs;

          const match = f.match(/Screenshot_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
          if (match) {
            const year = match[1];
            const month = parseInt(match[2], 10) - 1;
            const day = match[3];
            const hour = parseInt(match[4], 10);
            const dt = new Date(year, month, day);
            dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            timeStr = hour >= 12 ? "11:11 PM" : "11:11 AM";
            ts = dt.getTime();
          }

          return {
            id: `1111-${i}`,
            url: `${webPrefix}${f}`,
            filename: f,
            date: dateStr,
            time: timeStr,
            timestamp: ts,
            note: ""
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
    }
    res.json(images);
  } catch (err) {
    console.error('11-11 API error:', err);
    res.json([]);
  }
});



// Serve main page on GET /
app.get('/', (req, res) => {
  if (fs.existsSync(path.join(__dirname, 'index.html'))) {
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'music.html'));
  }
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`  Soundtracks server running on http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
