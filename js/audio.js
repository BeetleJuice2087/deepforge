/* Deepforge: every sound is made on the spot with Web Audio (no sound files), like Sand Alchemy.
   Browsers only allow sound after the first tap or key press, so it wakes up then. */
(function (DF) {
  'use strict';
  const KEY = 'deepforge.sound';
  let on = true, vol = 0.6, music = true, mvol = 0.5, kind = 'tracks'; // kind: 'tracks' (the soundtrack files) or 'synth' (made on the spot)
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) { on = s.on !== false; music = s.music !== false; vol = Math.max(0, Math.min(1, +s.vol >= 0 ? +s.vol : 0.6)); mvol = Math.max(0, Math.min(1, +s.mvol >= 0 ? +s.mvol : 0.5)); if (s.kind === 'synth') kind = 'synth'; }
  } catch (e) { /* defaults */ }
  let ctx = null, out = null, noise = null, brown = null, grit = null, voices = 0, mbus = null, msoft = null;
  const last = {};
  function wake() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(ctx.destination);
      out = ctx.createGain(); out.gain.value = on ? vol * vol : 0; out.connect(comp);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      brown = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const bd = brown.getChannelData(0); let lb = 0;
      for (let i = 0; i < bd.length; i++) { lb = (lb + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = lb * 3.5; }
      grit = ctx.createWaveShaper(); const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.2); } grit.curve = curve; grit.connect(out);
      // Music has its own volume, separate from the sound effects.
      mbus = ctx.createGain(); mbus.gain.value = 0.0001; mbus.connect(comp);
      msoft = ctx.createBiquadFilter(); msoft.type = 'lowpass'; msoft.frequency.value = 2400; msoft.Q.value = 0.4; msoft.connect(mbus);
    }
    if (ctx.state === 'suspended') ctx.resume().then(resumeMusic).catch(() => {});
    else resumeMusic();
    return ctx;
  }
  const ready = () => on && vol > 0 && ctx && ctx.state === 'running' && voices < 16;
  const often = (k, ms) => { const t = performance.now(); if (t - (last[k] || 0) < ms) return false; last[k] = t; return true; };
  function chain(pan) {
    const g = ctx.createGain();
    if (pan != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(out); } else g.connect(out);
    return g;
  }
  function env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function track(node, end) { voices++; node.onended = () => { voices--; }; node.stop(end); }
  function tone(type, f0, f1, t, len, peak, pan) {
    const o = ctx.createOscillator(), g = chain(pan); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len);
    env(g, t, peak, 0.006, len); o.connect(g); o.start(t); track(o, t + len + 0.05);
  }
  function hiss(kind, f0, f1, q, t, len, peak, pan) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = kind; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = chain(pan); env(g, t, peak, 0.004, len);
    s.connect(f); f.connect(g); s.start(t, Math.random() * 1.5); track(s, t + len + 0.05);
  }
  const P = (x) => (x == null ? 0 : Math.max(-0.8, Math.min(0.8, (x - 0.5) * 1.4)));

  /* ---------------- Music ----------------
     Composed on the spot for each floor: the floor's name picks the key, the chords, the bass line
     and two melodies; its element picks the scale (fire is spicy, ice is dreamy, shadow is dark).
     Exploring is calm; when the doors lock, drums and the melody come in; bosses push the tempo. */
  const MODES = { ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11] };
  const EL_MODE = { fire: 'harmonic', ice: 'lydian', lightning: 'mixolydian', poison: 'phrygian', earth: 'dorian', light: 'ionian', shadow: 'aeolian', nature: 'dorian' };
  const PROGS = [[0, 5, 3, 4], [0, 3, 4, 0], [0, 6, 5, 4], [0, 4, 5, 3], [0, 2, 3, 4], [0, 5, 6, 4], [0, 3, 0, 4]];
  const BASS = [[1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1], [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0]];
  const song = { spec: null, s: null, playing: false, timer: 0, nextT: 0, step: 0, mood: 0 };
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function buildSong(spec) {
    const r = DF.seeded(String(spec.seed || 'deep'));
    const camp = !!spec.camp, sc = MODES[camp ? 'dorian' : (EL_MODE[spec.element] || 'aeolian')];
    const melody = () => {
      const notes = []; let deg = 7 + r(3);
      for (let i = 0; i < 64; i++) {
        const strong = i % 4 === 0;
        if (!(strong ? r(10) < 7 : r(10) < 2)) { notes.push(null); continue; }
        deg = Math.max(4, Math.min(14, deg + [-2, -1, -1, 0, 1, 1, 2][r(7)]));
        notes.push({ deg, len: strong && r(3) === 0 ? 4 : 2 });
      }
      return notes;
    };
    return { sc, camp, root: 45 + r(7), prog: PROGS[r(PROGS.length)], bass: BASS[r(BASS.length)], bpm: camp ? 68 : (spec.fast ? 116 : 90 + r(14)), mel: [melody(), melody()] };
  }
  const pitch = (S, deg, oct) => S.root + 12 * oct + S.sc[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  function mnote(type, f, t, len, peak, att, soft) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(soft ? msoft : mbus); o.start(t); o.stop(t + len + 0.05);
  }
  function mnoise(kind, f, q, t, len, peak) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const fl = ctx.createBiquadFilter(); fl.type = kind; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(fl); fl.connect(g); g.connect(mbus); s.start(t, Math.random()); s.stop(t + len + 0.02);
  }
  function playStep(i, t, spb) {
    const S = song.s, s16 = i % 16, bar = Math.floor(i / 16) % 4, chord = S.prog[bar], mood = S.camp ? 0 : song.mood;
    if (s16 === 0) [0, 2, 4].forEach((k) => mnote('triangle', hz(pitch(S, chord + k, 1)), t, spb * 15.5, S.camp ? 0.035 : 0.026, 0.35)); // soft chord
    if (S.bass[s16] && (!S.camp || s16 % 8 === 0)) mnote('triangle', hz(pitch(S, chord + (s16 === 14 && S.bass[15] ? 4 : 0), 0)), t, spb * (S.camp ? 7 : 1.8), 0.13, 0.01);
    if (s16 % 2 === 0) { // arpeggio
      const seq = [0, 2, 4, 7, 4, 2, 0, 4], k = seq[(s16 / 2) % 8];
      if (S.camp) mnote('triangle', hz(pitch(S, chord + k, 2)), t, spb * 3, 0.04, 0.005);
      else mnote('square', hz(pitch(S, chord + k, 2)), t, spb * 1.6, mood ? 0.03 : 0.022, 0.005, true);
    }
    if (mood >= 1) { // the fight: melody and drums
      const n = S.mel[Math.floor(i / 64) % 2][i % 64];
      if (n) mnote('square', hz(pitch(S, n.deg, 2)), t, spb * n.len, 0.045, 0.01, true);
      if (s16 % 8 === 0 || (mood === 2 && s16 === 10)) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g); g.connect(mbus); o.start(t); o.stop(t + 0.2); }
      if (s16 === 4 || s16 === 12) mnoise('bandpass', 1800, 0.8, t, 0.13, 0.1);
      if (mood === 2 ? true : s16 % 2 === 0) mnoise('highpass', 7000, 0.7, t, 0.03, s16 % 4 === 2 ? 0.035 : 0.02);
    } else if (!S.camp && s16 % 4 === 2) mnoise('highpass', 8000, 0.7, t, 0.025, 0.01); // a quiet shaker while exploring
  }
  function schedule() {
    if (!song.playing || !ctx || ctx.state !== 'running') return;
    const spb = 60 / (song.s.bpm * (song.mood === 2 && !song.s.camp ? 1.18 : 1)) / 4;
    if (song.nextT < ctx.currentTime - 0.2) song.nextT = ctx.currentTime + 0.05; // after a pause, don't rush to catch up
    while (song.nextT < ctx.currentTime + 0.15) { playStep(song.step, song.nextT, spb); song.nextT += spb; song.step++; }
  }
  function musicLevel() { return music ? Math.max(0.0001, mvol * mvol * 0.9) : 0.0001; }
  function startSong() {
    if (!ctx || ctx.state !== 'running' || !music || !song.spec) return;
    clearInterval(song.timer);
    song.s = buildSong(song.spec); song.step = 0; song.nextT = ctx.currentTime + 0.1; song.playing = true;
    const t = ctx.currentTime; mbus.gain.cancelScheduledValues(t); mbus.gain.setValueAtTime(0.0001, t); mbus.gain.exponentialRampToValueAtTime(musicLevel(), t + 1.5);
    song.timer = setInterval(schedule, 40); schedule();
  }
  function stopSong() { clearInterval(song.timer); song.playing = false; if (mbus) mbus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); }

  /* ---------------- The soundtrack (music files) ----------------
     Each floor gets one of the explore tracks and one of the battle tracks (picked from its name),
     the boss has its own, camp has its own. Tracks crossfade when the doors lock and open again,
     and the explore track picks up where it left off after a fight. If the files can't be loaded
     (say, playing from a file on your computer), the made-on-the-spot music takes over. */
  const TRACKS = {
    explore1: { dur: 85.3333, gain: 1.6, title: 'The Catacombs' }, explore2: { dur: 96, gain: 1.0, title: 'Accurate NES looping track' }, explore3: { dur: 42.6667, gain: 1.25, title: 'No Enemies Here' },
    battle1: { dur: 26.65, gain: 1.0, title: '8-Bit Battle Loop' }, battle2: { dur: 65.291, gain: 1.0, title: 'RPG Battle Theme' },
    boss: { dur: 88, gain: 0.62, title: 'Suez Crisis Remade' }, camp: { dur: 31.032, gain: 1.8, title: 'Spooky Dungeon' }, victory: { gain: 1.4, title: 'Victory' },
  };
  const files = { cur: null, want: null, pos: {}, cache: new Map(), failed: false, quietUntil: 0, key: '' };
  const useFiles = () => kind === 'tracks' && !files.failed;
  function decode(ab) { return new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); }
  function loadTrack(name) {
    if (files.cache.has(name)) { const t = files.cache.get(name); files.cache.delete(name); files.cache.set(name, t); return t; } // most recent last
    const t = fetch('music/' + name + '.mp3').then((r) => { if (!r.ok) throw new Error('missing'); return r.arrayBuffer(); }).then(decode).then((buf) => {
      // MP3s carry a sliver of silence at the start; skip it so the loop is seamless.
      const d = buf.getChannelData(0), max = Math.min(d.length, Math.round(buf.sampleRate * 0.08));
      let i = 0; while (i < max && Math.abs(d[i]) < 0.0008) i++;
      const loopStart = i < max ? i / buf.sampleRate : 0, info = TRACKS[name] || {};
      const loopEnd = info.dur ? Math.min(buf.duration, loopStart + info.dur) : buf.duration;
      return { buf, loopStart, loopEnd };
    });
    files.cache.set(name, t);
    t.catch(() => files.cache.delete(name));
    // Decoded music is big, so only the last few tracks stay in memory.
    while (files.cache.size > 3) { const old = files.cache.keys().next().value; if (files.cur && files.cur.name === old) { const v = files.cache.get(old); files.cache.delete(old); files.cache.set(old, v); continue; } files.cache.delete(old); }
    return t;
  }
  function trackPos(c) {
    const p = c.off + (ctx.currentTime - c.t0), L = c.t.loopEnd - c.t.loopStart;
    return p < c.t.loopEnd ? p : c.t.loopStart + ((p - c.t.loopStart) % L);
  }
  function fadeOutCur(fade) {
    const c = files.cur; if (!c) return; files.cur = null;
    if (/^explore/.test(c.name)) files.pos[c.name] = trackPos(c);
    const t = ctx.currentTime; c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(Math.max(0.0001, c.g.gain.value), t); c.g.gain.linearRampToValueAtTime(0.0001, t + fade);
    try { c.src.stop(t + fade + 0.05); } catch (e) { /* already stopped */ }
  }
  function playTrack(name, fade) {
    files.want = name;
    if (files.cur && files.cur.name === name) return;
    loadTrack(name).then((t) => {
      if (files.want !== name || !music || !useFiles() || !ctx || ctx.state !== 'running') return;
      if (files.cur && files.cur.name === name) return;
      fadeOutCur(fade);
      const now = ctx.currentTime, info = TRACKS[name];
      mbus.gain.cancelScheduledValues(now); mbus.gain.setTargetAtTime(musicLevel(), now, 0.1);
      const src = ctx.createBufferSource(); src.buffer = t.buf; src.loop = true; src.loopStart = t.loopStart; src.loopEnd = t.loopEnd;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now);
      const quiet = now < files.quietUntil ? 0.25 : 1;
      g.gain.linearRampToValueAtTime(info.gain * quiet, now + fade);
      if (quiet < 1) { g.gain.setValueAtTime(info.gain * quiet, files.quietUntil); g.gain.linearRampToValueAtTime(info.gain, files.quietUntil + 1.2); }
      src.connect(g); g.connect(mbus);
      let off = files.pos[name] || t.loopStart; if (off >= t.loopEnd) off = t.loopStart;
      src.start(now + 0.02, off);
      files.cur = { name, src, g, t0: now + 0.02, off, t };
      song.playing = true;
    }).catch(() => {
      // No music files here: fall back to the music made on the spot.
      if (files.failed) return; files.failed = true; files.want = null;
      if (song.spec && music) { clearInterval(song.timer); song.playing = false; startSong(); }
    });
  }
  function trackFor(level) {
    const sp = song.spec; if (!sp) return null;
    if (sp.camp) return 'camp';
    let h = 7; for (const ch of String(sp.seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    if (level === 2) return 'boss';
    if (level === 1) return ['battle1', 'battle2'][(h >> 3) % 2];
    return ['explore1', 'explore2', 'explore3'][h % 3];
  }
  function playFor(level, fade) {
    const name = trackFor(level); if (!name) return;
    playTrack(name, fade == null ? 1.2 : fade);
    if (level === 0 && !song.spec.camp) loadTrack(trackFor(1)).catch(() => {}); // ready for the first fight
  }
  function stopFiles() { files.want = null; if (ctx) fadeOutCur(0.6); }
  function resumeMusic() {
    if (!song.spec || !music || !ctx || ctx.state !== 'running') return;
    if (useFiles()) { if (!files.cur) playFor(song.mood); }
    else if (!song.playing) startSong();
  }
  const S = {
    get on() { return on; }, get vol() { return vol; }, get music() { return music; }, get mvol() { return mvol; },
    set(o, v, m, mv) {
      on = o; vol = v; if (m != null) music = m; if (mv != null) mvol = mv;
      try { localStorage.setItem(KEY, JSON.stringify({ on, vol, music, mvol, kind })); } catch (e) { /* fine */ }
      if (out) out.gain.setTargetAtTime(on ? vol * vol : 0, ctx.currentTime, 0.05);
      wake();
      if (!music) { stopSong(); stopFiles(); song.playing = false; }
      else if (!song.playing || (useFiles() && !files.cur)) resumeMusic();
      else if (mbus) mbus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.1);
    },
    get kind() { return kind; },
    // Switch between the soundtrack and the music made on the spot.
    setKind(k) {
      kind = k === 'synth' ? 'synth' : 'tracks'; files.failed = false;
      try { localStorage.setItem(KEY, JSON.stringify({ on, vol, music, mvol, kind })); } catch (e) { /* fine */ }
      stopFiles(); clearInterval(song.timer); song.playing = false; files.cur = null;
      wake(); resumeMusic();
    },
    // A short fanfare (after a boss), with the music ducking under it.
    victory() {
      if (!music || !useFiles() || !ctx || ctx.state !== 'running') return;
      files.quietUntil = ctx.currentTime + 4.6;
      if (files.cur) { const g = files.cur.g.gain, t = ctx.currentTime, full = TRACKS[files.cur.name].gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(full * 0.25, t + 0.3); g.setValueAtTime(full * 0.25, files.quietUntil); g.linearRampToValueAtTime(full, files.quietUntil + 1.2); }
      loadTrack('victory').then((t) => {
        const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = t.buf; g.gain.value = TRACKS.victory.gain;
        src.connect(g); g.connect(mbus); mbus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.05); src.start(ctx.currentTime + 0.05, t.loopStart);
      }).catch(() => {});
    },
    credits: TRACKS,
    // Play a floor's song ({ seed, element, fast }) or the camp tune ({ camp: true }); null stops the music.
    song(spec) {
      const same = spec && song.spec && song.spec.seed === spec.seed && !!song.spec.camp === !!spec.camp;
      song.spec = spec || null;
      if (!spec) { stopSong(); stopFiles(); song.playing = false; return; }
      if (useFiles()) {
        if (!same) { files.pos = {}; song.mood = 0; }
        if (!music || !ctx || ctx.state !== 'running') return; // starts on the first tap
        playFor(song.mood, same ? 1.2 : 1.6); return;
      }
      if (same && song.playing) return;
      song.mood = 0; startSong();
    },
    // 0 exploring, 1 fighting, 2 boss.
    mood(level) {
      const was = song.mood; song.mood = level;
      if (was !== level && useFiles() && song.spec && music && ctx && ctx.state === 'running') playFor(level, level > was ? 0.6 : 1.8);
    },
    get songInfo() { return { track: files.cur && files.cur.name, kind: useFiles() ? 'tracks' : 'synth', playing: song.playing, step: song.step, mood: song.mood, bpm: song.s && song.s.bpm, camp: !!(song.s && song.s.camp), seed: song.spec && song.spec.seed }; },
    wake,
    sleep(s) { if (!ctx) return; if (s) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); },
    swing(x) { if (!ready() || !often('swing', 60)) return; const t = ctx.currentTime; hiss('bandpass', 900, 3200, 1.2, t, 0.12, 0.22, P(x)); },
    hit(x, big) {
      if (!ready() || !often('hit', 40)) return; const t = ctx.currentTime;
      tone('square', big ? 220 : 320, big ? 90 : 140, t, 0.09, 0.16, P(x)); hiss('highpass', 2500, 1500, 0.8, t, 0.05, 0.22, P(x));
    },
    weak(x) { if (!ready()) return; const t = ctx.currentTime; tone('triangle', 880, 1320, t, 0.08, 0.12, P(x)); tone('triangle', 1320, 1760, t + 0.06, 0.08, 0.1, P(x)); },
    hurt() { if (!ready() || !often('hurt', 120)) return; const t = ctx.currentTime; tone('sawtooth', 260, 70, t, 0.25, 0.22); hiss('lowpass', 1200, 200, 0.7, t, 0.18, 0.2); },
    kill(x) {
      if (!ready() || !often('kill', 50)) return; const t = ctx.currentTime;
      hiss('bandpass', 1400, 300, 1.4, t, 0.22, 0.26, P(x)); tone('square', 180, 60, t, 0.18, 0.12, P(x));
    },
    coin(x) { if (!ready() || !often('coin', 45)) return; const t = ctx.currentTime; tone('square', 988, 988, t, 0.05, 0.08, P(x)); tone('square', 1319, 1319, t + 0.05, 0.12, 0.08, P(x)); },
    heart() { if (!ready()) return; const t = ctx.currentTime; [523, 659, 784].forEach((f, i) => tone('triangle', f, f, t + i * 0.06, 0.12, 0.14)); },
    pickup() { if (!ready()) return; const t = ctx.currentTime; [392, 523, 659, 1047].forEach((f, i) => tone('square', f, f, t + i * 0.07, 0.1, 0.09)); },
    chest() { if (!ready()) return; const t = ctx.currentTime; tone('triangle', 196, 392, t, 0.25, 0.2); [659, 784, 988, 1319].forEach((f, i) => tone('triangle', f, f, t + 0.2 + i * 0.08, 0.2, 0.12)); },
    bash(x) { if (!ready()) return; const t = ctx.currentTime; tone('sine', 110, 50, t, 0.2, 0.35, P(x)); hiss('lowpass', 1800, 300, 0.8, t, 0.15, 0.3, P(x)); },
    shoot(x) { if (!ready() || !often('shoot', 70)) return; const t = ctx.currentTime; tone('square', 660, 260, t, 0.12, 0.07, P(x)); },
    wave(x) { if (!ready() || !often('wave', 70)) return; const t = ctx.currentTime; tone('sawtooth', 520, 1040, t, 0.1, 0.06, P(x)); hiss('bandpass', 2000, 5000, 2, t, 0.1, 0.1, P(x)); },
    zap(x) { if (!ready() || !often('zap', 80)) return; const t = ctx.currentTime; for (let i = 0; i < 4; i++) hiss('bandpass', 3000 + Math.random() * 3000, 2000, 3, t + i * 0.025, 0.03, 0.15, P(x)); },
    door() { if (!ready()) return; const t = ctx.currentTime; tone('sine', 90, 60, t, 0.3, 0.3); hiss('lowpass', 600, 150, 0.6, t, 0.3, 0.25); },
    clear() { if (!ready()) return; const t = ctx.currentTime; [392, 494, 587, 784].forEach((f, i) => tone('triangle', f, f, t + i * 0.09, 0.22, 0.13)); },
    stairs() { if (!ready()) return; const t = ctx.currentTime; [784, 659, 523, 392, 330, 262].forEach((f, i) => tone('triangle', f, f, t + i * 0.08, 0.2, 0.13)); },
    blink(x) { if (!ready()) return; const t = ctx.currentTime; tone('sine', 1500, 300, t, 0.15, 0.1, P(x)); },
    summon(x) { if (!ready()) return; const t = ctx.currentTime; tone('triangle', 200, 600, t, 0.3, 0.12, P(x)); },
    heal(x) { if (!ready() || !often('heal', 200)) return; const t = ctx.currentTime; tone('sine', 660, 990, t, 0.3, 0.08, P(x)); },
    shield(x) { if (!ready() || !often('shield', 150)) return; const t = ctx.currentTime; tone('sine', 1200, 1250, t, 0.25, 0.08, P(x)); tone('sine', 1800, 1850, t, 0.25, 0.05, P(x)); },
    clink(x) { if (!ready() || !often('clink', 60)) return; const t = ctx.currentTime; tone('square', 2400, 2200, t, 0.05, 0.08, P(x)); },
    boom(power, x) {
      if (!ready() || !often('boom', 90)) return;
      const t = ctx.currentTime, p = Math.min(4, power), pan = P(x), len = 0.6 + p * 0.35;
      hiss('bandpass', 1800, 700, 0.9, t, 0.07, Math.min(0.8, 0.35 + p * 0.12), pan);
      const s = ctx.createBufferSource(); s.buffer = brown; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.5;
      f.frequency.setValueAtTime(900 + p * 250, t); f.frequency.exponentialRampToValueAtTime(90, t + len);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.min(1, 0.5 + p * 0.15), t + 0.02);
      g.gain.setTargetAtTime(0.0001, t + 0.05, len / 3.2);
      s.connect(f); f.connect(g); g.connect(grit); s.start(t, Math.random() * 2); track(s, t + len + 0.3);
      tone('sine', 55, 28, t, 0.5, Math.min(0.3, 0.1 + p * 0.05), pan);
    },
    // The forge: hammer strikes, then a rising shimmer when it's done.
    anvil(i) { if (!ready()) return; const t = ctx.currentTime; tone('square', 1800 + (i % 2) * 200, 1500, t, 0.12, 0.1); tone('sine', 3600, 3400, t, 0.4, 0.05); hiss('highpass', 4000, 3000, 1, t, 0.06, 0.15); },
    forged() {
      if (!ready()) return; const t = ctx.currentTime;
      tone('sine', 110, 55, t, 0.6, 0.3); hiss('lowpass', 3000, 200, 0.6, t, 0.5, 0.3);
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone('triangle', f, f, t + 0.15 + i * 0.07, 0.4, 0.11));
    },
    die() { if (!ready()) return; const t = ctx.currentTime; [392, 330, 262, 196, 131].forEach((f, i) => tone('triangle', f, f * 0.98, t + i * 0.18, 0.4, 0.16)); },
    bossRoar() { if (!ready()) return; const t = ctx.currentTime; tone('sawtooth', 90, 45, t, 1.1, 0.25); hiss('lowpass', 900, 120, 0.8, t, 1.0, 0.35); },
  };
  DF.SND = S;
}(window.DF));
