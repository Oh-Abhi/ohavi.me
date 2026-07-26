const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static assets
app.use('/photos', express.static(path.join(__dirname, 'photos')));
app.use(express.static(__dirname));

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
