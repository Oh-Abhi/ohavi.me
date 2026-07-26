const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const songs = require('./songs.json');
const audioDir = path.join(__dirname, 'audio');

if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

console.log(`Starting audio download for ${songs.length} catalog songs...`);

let downloadedCount = 0;

for (let i = 0; i < songs.length; i++) {
  const song = songs[i];
  if (!song.youtubeId) continue;

  const targetFile = path.join(audioDir, `${song.youtubeId}.mp3`);
  
  if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 10000) {
    console.log(`[${i + 1}/${songs.length}] Already exists: ${song.title}`);
    downloadedCount++;
    continue;
  }

  console.log(`[${i + 1}/${songs.length}] Downloading: ${song.title} (${song.youtubeId})...`);
  try {
    const url = `https://www.youtube.com/watch?v=${song.youtubeId}`;
    execSync(`yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${targetFile}" "${url}"`, {
      stdio: 'inherit',
      timeout: 45000
    });
    downloadedCount++;
  } catch (err) {
    console.warn(`Could not download ${song.title}:`, err.message);
  }
}

console.log(`Download complete! ${downloadedCount}/${songs.length} audio files ready in ${audioDir}`);
