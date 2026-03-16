"use client";

let audioCtx: AudioContext | null = null;
let _muted = false;

export function isMuted() { return _muted; }
export function setMuted(v: boolean) { _muted = v; }
export function toggleMute() {
  _muted = !_muted;
  if (_muted) stopBgm();
  return _muted;
}

function getCtx(): AudioContext | null {
  if (_muted) return null;
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

/** Short ascending jingle — correct answer */
export function playCorrect() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, now + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 0.3);
  });
}

/** Descending buzzer — wrong answer */
export function playWrong() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.4);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

/** Single tick for countdown (last 5 seconds) */
export function playTick() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

/** Drumroll for leaderboard reveal */
export function playDrumroll(durationMs = 2000) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = durationMs / 1000;
  const count = Math.floor(dur * 25);
  for (let i = 0; i < count; i++) {
    const t = now + (i / count) * dur;
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * 0.3;
    noise.buffer = buffer;
    const gain = ctx.createGain();
    const vol = 0.05 + (i / count) * 0.15;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    noise.connect(gain).connect(ctx.destination);
    noise.start(t);
  }
}

/** Fanfare for podium — triumphant chord */
export function playFanfare() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [261.63, 329.63, 392, 523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i < 3 ? "triangle" : "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.08;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.2, start + 0.05);
    gain.gain.setValueAtTime(0.2, start + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 1.5);
  });
}

/* ------------------------------------------------------------------ */
/*  Background music (host only) — synthesized loop                    */
/* ------------------------------------------------------------------ */

let bgmInterval: ReturnType<typeof setInterval> | null = null;
let bgmGain: GainNode | null = null;
let bgmPlaying = false;

/** Start a looping background melody (game-show style) */
export function startBgm() {
  if (bgmPlaying || _muted) return;
  const ctx = getCtx();
  if (!ctx) return;
  bgmPlaying = true;

  // Master gain for BGM (low volume so it doesn't overwhelm)
  bgmGain = ctx.createGain();
  bgmGain.gain.value = 0.07;
  bgmGain.connect(ctx.destination);

  // Melody pattern (pentatonic, upbeat game-show feel)
  const melody = [
    392, 440, 523.25, 440, 392, 523.25, 587.33, 523.25,  // G4 A4 C5 A4 G4 C5 D5 C5
    440, 523.25, 587.33, 659.25, 587.33, 523.25, 440, 392, // A4 C5 D5 E5 D5 C5 A4 G4
  ];
  const bassNotes = [196, 196, 220, 220, 196, 196, 220, 220]; // G3 G3 A3 A3 ...
  const noteDuration = 0.25; // seconds per note
  let noteIndex = 0;

  const playNote = () => {
    if (!bgmPlaying || _muted || !bgmGain) return;
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime;

    // Melody note
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = melody[noteIndex % melody.length];
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + noteDuration * 0.9);
    osc.connect(g).connect(bgmGain!);
    osc.start(now);
    osc.stop(now + noteDuration);

    // Bass note (every 2 beats)
    if (noteIndex % 2 === 0) {
      const bassOsc = c.createOscillator();
      const bassG = c.createGain();
      bassOsc.type = "sine";
      bassOsc.frequency.value = bassNotes[(noteIndex / 2) % bassNotes.length];
      bassG.gain.setValueAtTime(0.4, now);
      bassG.gain.exponentialRampToValueAtTime(0.01, now + noteDuration * 1.8);
      bassOsc.connect(bassG).connect(bgmGain!);
      bassOsc.start(now);
      bassOsc.stop(now + noteDuration * 2);
    }

    noteIndex++;
  };

  // Play first note immediately, then loop
  playNote();
  bgmInterval = setInterval(playNote, noteDuration * 1000);
}

/** Stop background music */
export function stopBgm() {
  bgmPlaying = false;
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
  if (bgmGain) {
    bgmGain.gain.exponentialRampToValueAtTime(0.001, (audioCtx?.currentTime ?? 0) + 0.3);
    bgmGain = null;
  }
}

/** Check if BGM is playing */
export function isBgmPlaying() { return bgmPlaying; }

/* ------------------------------------------------------------------ */

/** Time's up — urgent double beep */
export function playTimeUp() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  [0, 0.15].forEach((delay) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.2, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.15);
  });
}
