import { mkdir, writeFile } from 'node:fs/promises';
const rate = 44100;
const count = Math.floor(rate * 1.25);
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
for (let index = 0; index < count; index++) {
  const time = index / rate;
  let sample = 0;
  for (const [start, frequency, amplitude] of [[0, 659.255, 0.23], [0.19, 987.767, 0.19]]) {
    const age = time - start;
    if (age < 0) continue;
    const envelope = Math.min(age / 0.012, 1) * Math.exp(-age * 5.4);
    sample += amplitude * envelope * (Math.sin(2 * Math.PI * frequency * age) + 0.15 * Math.sin(4 * Math.PI * frequency * age));
  }
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2);
}
await mkdir('public/sounds', { recursive: true });
await writeFile('public/sounds/hibi-chime.wav', wav);
console.log('Generated original Hibi chime.');
