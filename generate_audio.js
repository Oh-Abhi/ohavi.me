const fs = require('fs');
const path = require('path');

const audioDir = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

function generateWav(filename, chordFreqs, durationSec = 30, sampleRate = 22050) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2; // 16-bit PCM
  const buffer = Buffer.alloc(44 + dataSize);

  // WAV Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(1, 22);  // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32);  // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Harmonic blend of chord frequencies
    chordFreqs.forEach((freq, idx) => {
      const envelope = Math.sin(Math.PI * (t % 3) / 3); // gentle breathing envelope
      sample += Math.sin(2 * Math.PI * freq * t) * 0.3 * (1 / (idx + 1)) * (0.8 + 0.2 * envelope);
    });

    // Fade in and fade out
    if (t < 1) sample *= t;
    if (t > durationSec - 1) sample *= (durationSec - t);

    // Clamp
    sample = Math.max(-1, Math.min(1, sample));
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  const filePath = path.join(audioDir, filename);
  fs.writeFileSync(filePath, buffer);
  console.log(`Generated sample audio: ${filePath}`);
}

// Generate 4 soothing ambient audio tracks
generateWav('video_games.wav', [220, 277.18, 329.63, 440], 35); // A Major ambient chord
generateWav('pink_and_white.wav', [261.63, 329.63, 392.00, 523.25], 30); // C Major 7 chord
generateWav('the_chain.wav', [196.00, 246.94, 293.66, 392.00], 32); // G Major chord
generateWav('sparks.wav', [174.61, 220.00, 261.63, 349.23], 35); // F Major chord

