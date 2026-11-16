// Audio engine - procedural sound effects + music via WebAudio (no assets)
class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.track = 'overworld';
  }
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  toggleMute() { this.muted = !this.muted; return this.muted; }

  tone(freq, dur, type = 'square', vol = 0.15, when = 0, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.2, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  }

  // ---- SFX ----
  jump(big)    { this.tone(big ? 200 : 260, 0.18, 'square', 0.15, 0, big ? 300 : 400); }
  coin()       { this.tone(988, 0.07, 'square', 0.13); this.tone(1319, 0.25, 'square', 0.13, 0.07); }
  stomp()      { this.tone(240, 0.1, 'square', 0.16, 0, -160); }
  bump()       { this.tone(120, 0.09, 'square', 0.18); }
  breakBlock() { this.noise(0.2, 0.25); this.tone(180, 0.12, 'square', 0.1, 0, -100); }
  powerup()    { const n = [392, 523, 659, 784, 1047]; n.forEach((f, i) => this.tone(f, 0.1, 'square', 0.13, i * 0.06)); }
  powerdown()  { const n = [784, 659, 523]; n.forEach((f, i) => this.tone(f, 0.1, 'square', 0.12, i * 0.07)); }
  die()        { this.stopMusic(); const n = [523, 392, 330, 262, 196]; n.forEach((f, i) => this.tone(f, 0.16, 'square', 0.14, i * 0.12)); }
  kick()       { this.tone(400, 0.08, 'square', 0.15, 0, -200); }
  checkpoint() { this.tone(660, 0.08, 'square', 0.13); this.tone(880, 0.14, 'square', 0.13, 0.08); }
  fireball()   { this.tone(600, 0.1, 'sawtooth', 0.1, 0, -300); }
  flag()       { const n = [262, 330, 392, 523, 659, 784]; n.forEach((f, i) => this.tone(f, 0.12, 'square', 0.12, i * 0.09)); }
  lifeUp()     { const n = [523, 659, 784, 1047, 784, 1047]; n.forEach((f, i) => this.tone(f, 0.11, 'square', 0.13, i * 0.08)); }
  levelClear() { this.stopMusic(); const n = [392, 523, 659, 784, 1047, 988, 1047]; n.forEach((f, i) => this.tone(f, 0.15, 'square', 0.13, i * 0.14)); }

  // ---- Music (simple looping bassline+melody) ----
  startMusic(track = 'overworld') {
    this.init();
    if (!this.ctx || this.muted) return;
    this.stopMusic();
    this.track = track;
    this.musicStep = 0;
    this.musicTimer = setInterval(() => this._musicTick(), 150);
  }
  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
  _musicTick() {
    const m = this._getScore()[this.track];
    if (!m) return;
    const i = this.musicStep % m.length;
    const note = m[i];
    if (note > 0) this.tone(note, 0.13, 'square', 0.05);
    const bass = this._bass();
    if (bass) this.tone(bass, 0.14, 'triangle', 0.07);
    this.musicStep++;
  }
  _getScore() {
    const C4 = 262, D4 = 294, E4 = 330, F4 = 349, G4 = 392, A4 = 440, B4 = 494;
    const C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784, A5 = 880, B5 = 988, C6 = 1047;
    return {
      overworld: [
        E5, E5, 0, E5, 0, C5, E5, 0, G5, 0, 0, 0, G4, 0, 0, 0,
        C5, 0, 0, G4, 0, 0, E4, 0, 0, A4, 0, B4, 0, A4, A4, 0,
        G4, E5, G5, A5, 0, F5, G5, 0, E5, 0, C5, D5, B4, 0, 0, 0,
        0, C5, 0, G4, 0, 0, E4, 0, 0, A4, 0, B4, 0, A4, A4, 0
      ],
      underground: [
        C5, C6, A5, A4, B4, B5, A4, 0, A4, A5, C5, 0,
        C5, C6, A5, A4, B4, B5, A4, 0, A4, A5, C5, 0
      ]
    };
  }
  _bass() {
    const t = this.track;
    const i = this.musicStep % 16;
    if (t === 'overworld') {
      const seq = [131, 0, 196, 0, 131, 0, 165, 175, 196, 0, 165, 0, 131, 0, 98, 0];
      return seq[i];
    }
    const seq = [65, 0, 65, 0, 87, 0, 87, 0];
    return seq[this.musicStep % 8];
  }
}
window.AudioSys = AudioSys;
