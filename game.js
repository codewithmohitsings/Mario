// Main game engine — single player + host-authoritative multiplayer race
const TS = 16;                 // tile size
const VW = 512, VH = 320;      // internal resolution (4x pixel-ish)
const ROWS = 20, GROUND_Y = VH - 32;   // 2 tile rows of ground at bottom
const W = VW, H = VH;
// expose shared constants/classes for cross-file access (needed for node tests too)
if (typeof window !== 'undefined') {
  window.TS = TS; window.VW = VW; window.VH = VH; window.ROWS = ROWS;
  window.GROUND_Y = GROUND_Y; window.W = W; window.H = H;
}

const RACE_LIVES = 3;
const COUNTDOWN_FRAMES = 180;
const SNAP_EVERY = 4;          // ~15Hz snapshots
const INPUT_EVERY = 3;         // ~20Hz input sends

// merge second map pack (levels2.js) -> 10 maps total
if (typeof window !== 'undefined' && window.LEVELS && window.LEVELS2) window.LEVELS.push(...window.LEVELS2);

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('imageSmoothingEnabled' in canvas ? '2d' : '2d');
    this.ctx.imageSmoothingEnabled = false;
    this.audio = new AudioSys();
    this.renderer = new Renderer(this.ctx);
    this.renderer.game = this;
    this.input = { left: false, right: false, up: false, down: false, jump: false, run: false, fire: false };
    this.frame = 0;
    this.state = 'title';        // title|lobby|countdown|playing|dying|levelclear|results|gameover|win|paused
    this.stateTimer = 0;
    this.lives = 3;
    this.score = 0;
    this.coins = 0;
    this.levelIndex = 0;
    this.mp = {
      mode: 'off',               // off | host | client
      session: null,
      racers: [],                // {id,name,ci,player,lives,finished,rank,eliminated,respawnT}
      order: [],                 // final finish order (ids)
      levelOrder: [],            // per-level finish order
      levels: [],                // race level indices (host's selection)
      levelPos: 0,
      countdown: 0,
      levelChoice: 0,
      spectating: false,
      events: [],                // outgoing events (host)
      snap: null,                // latest snapshot (client)
      prevSnap: null,
      enemyId: 1,
      itemIds: new Map(),
    };
    this.bindKeys();
  }

  // ---------- sound routing ----------
  // racer: whose action caused this sound (null = world event)
  sfx(name, a, racer) {
    const local = !racer || racer.local !== false;
    if (local || this.mp.mode === 'off') this.audio[name] && this.audio[name](a);
    // host relays non-local audible events to clients (jump/fire are predicted client-side)
    if (this.mp.mode === 'host' && racer && racer.local === false && name !== 'jump' && name !== 'fireball') return;
    if (this.mp.mode === 'host') {
      const r = racer ? this.mp.racers.find(rr => rr.player === racer) : null;
      this.mp.events.push({ e: name, p: r ? r.id : null, a });
    }
  }
  music(track) {
    if (this.mp.mode !== 'client') this.audio.startMusic(track);
    else this.audio.stopMusic();
  }

  // ---------- level construction ----------
  buildMap(def) {
    this.level = def;
    this.levelWidth = def.width * TS;
    this.levelHeight = VH;
    this.theme = def.theme || 'overworld';
    def.track = this.theme === 'underground' ? 'underground' : 'overworld';

    this.map = [];
    for (let r = 0; r < ROWS; r++) this.map.push(new Array(def.width).fill(0));
    for (const [a, b] of def.ground)
      for (let c = a; c <= b; c++) { this.map[ROWS - 2][c] = 1; this.map[ROWS - 1][c] = 1; }

    this.qContents = {};
    for (const [bx, by, bt] of def.blocks) {
      this.map[by][bx] = bt;
      if (bt === 3) this.qContents[bx + ',' + by] = 'coin';
      if (bt === 4) this.qContents[bx + ',' + by] = 'mushroom';
    }
    for (const [px, ph] of def.pipes)
      for (let r = ROWS - 2 - ph; r < ROWS - 2; r++) this.map[r][px] = 7;
    this.pipeDefs = def.pipes;

    for (const s of def.stairs) {
      for (let k = 0; k < s.n; k++) {
        const col = s.dir > 0 ? s.x + k : s.x + (s.n - 1 - k);
        const height = s.dir > 0 ? k + 1 : s.n - k;
        for (let r = 0; r < height; r++) this.map[ROWS - 3 - r][col] = 6;
      }
    }
    this.coinTiles = new Set();
    for (const [cx, cy] of def.coins) this.coinTiles.add(cx + ',' + cy);
  }

  loadLevel(i, mpSpawn = false) {
    this.levelIndex = i;
    const def = LEVELS[i];
    this.buildMap(def);

    this.enemies = def.enemies.map(e => new Enemy(this, e.x, e.y !== undefined ? e.y : ROWS - 3, e.t));
    this.items = [];
    this.fireballs = [];
    this.coinFx = [];
    this.floaters = [];
    this.explosions = [];
    this.cameraX = 0;
    this.flagRaise = 0;
    this.flagDone = false;
    this.timeLeft = def.time;
    this.timeAcc = 0;
    this.hurryPlayed = false;
    this.mp.enemyId = 1;

    if (!mpSpawn) {
      this.player = new Player(this, 3 * TS, (ROWS - 4) * TS - 28);
      this.racerSolo = { id: 'me', name: 'MARIO', ci: 0, player: this.player, lives: RACE_LIVES, finished: false, rank: 0, eliminated: false, respawnT: 0 };
      this.racerSolo.cp = { x: 3 * TS, y: this.spawnYAt(3) };
      this.racerSolo.cpDone = false;
      this.racers = [this.racerSolo];
      this.cpActive = false;
    }
    this.music(def.track || 'overworld');
  }

  // ground surface y at a column (used for checkpoint spawns)
  spawnYAt(tx) {
    for (let ty = 4; ty < ROWS; ty++) if (this.solidAt(tx, ty)) return ty * TS;
    return (ROWS - 2) * TS;
  }

  // activate a racer's mid-level checkpoint when they pass it
  racerPassesCheckpoint(r) {
    const cpX = this.level.checkpointX;
    if (!cpX || r.cpDone || r.player.dead) return;
    if (r.player.x + r.player.w > cpX * TS + 4) {
      r.cpDone = true;
      r.cp = { x: cpX * TS, y: this.spawnYAt(cpX) };
      this.cpActive = true;
      if (r.player.local !== false) {
        this.addFloater(r.player.x, r.player.y - 16, 'CHECKPOINT!');
        this.audio.checkpoint();
      }
      if (this.mp.mode === 'host') this.mp.events.push({ e: 'cp' });
    }
  }

  // multiplayer spawn: create/reset racers from session roster
  mpSetupRacers(roster) {
    this.racers = roster.map((p, i) => ({
      id: p.id, name: p.name, ci: p.ci !== undefined ? p.ci : (i + 1) % 5,
      lives: RACE_LIVES, finished: false, rank: 0, eliminated: false, respawnT: 0,
      ghost: null, ox: 0, oy: 0, ix: 0, iy: 0,   // interp state (client)
    }));
    const me = this.mp.mode === 'host' ? this.mp.session.myId : this.mp.session.myId;
    for (const r of this.racers) {
      const x = 3 * TS - (roster.findIndex(q => q.id === r.id)) * 18;
      r.player = new Player(this, x, (ROWS - 4) * TS - 28);
      r.player.ci = r.ci;
      r.player.local = (r.id === me);
      r.cp = { x, y: (ROWS - 2) * TS };
      r.cpDone = false;
      r.points = 0;
      if (r.id === me) this.player = r.player;
      else r.input = { left: false, right: false, up: false, down: false, jump: false, run: false, fire: false };
    }
  }

  solidAt(tx, ty) {
    if (tx < 0 || tx >= this.level.width) return true;
    if (ty < 0 || ty >= ROWS) return false;
    const t = this.map[ty][tx];
    return t === 1 || t === 2 || t === 3 || t === 4 || t === 5 || t === 6 || t === 7;
  }

  tileAt(tx, ty) {
    if (tx < 0 || tx >= this.level.width || ty < 0 || ty >= ROWS) return 0;
    return this.map[ty][tx];
  }

  bumpBlock(tx, ty, byPlayer) {
    const t = this.map[ty][tx];
    if (t === 3 || t === 4) {
      const key = tx + ',' + ty;
      const content = this.qContents[key] || 'coin';
      if (content === 'coin') {
        this.coinFx.push(new CoinFx(this, tx * TS + 3, ty * TS - 14));
        if (byPlayer && byPlayer.local !== false) this.collectCoin(false);
        else this.collectCoin(false, true);
        if (byPlayer) this.addScore(200, byPlayer);
        this.sfx('coin', null, byPlayer);
      } else {
        const kind = content === 'mushroom'
          ? (byPlayer && byPlayer.power === 0 ? 'mushroom' : 'flower')
          : content;
        this.items.push(new Item(this, tx * TS, ty * TS - 16, kind));
      }
      this.map[ty][tx] = 5;
      this.sfx('bump', null, byPlayer);
      this.blockJiggle = { tx, ty, t: 12 };
      if (this.mp.mode === 'host') this.mp.events.push({ e: 'used', tx, ty });
      if (this.mp.mode === 'host' && content !== 'coin')
        this.mp.events.push({ e: 'item', kind, x: tx * TS, y: ty * TS - 16 });
    } else if (t === 2) {
      if (byPlayer && byPlayer.big) {
        this.map[ty][tx] = 0;
        this.sfx('breakBlock', null, byPlayer);
        if (byPlayer) this.addScore(50, byPlayer);
        for (let k = 0; k < 4; k++)
          this.explosions.push({ x: tx * TS + (k % 2) * 8, y: ty * TS + Math.floor(k / 2) * 8, life: 20, debris: true });
        if (this.mp.mode === 'host') this.mp.events.push({ e: 'break', tx, ty });
      } else {
        this.sfx('bump', null, byPlayer);
        this.blockJiggle = { tx, ty, t: 8 };
      }
    } else if (t === 5 || t === 6 || t === 7 || t === 1) {
      this.sfx('bump', null, byPlayer);
    }
    if (this.mp.mode !== 'client') {
      for (const e of this.enemies) {
        if (e.dead || e.state === 'dying') continue;
        if (Math.abs((e.y + e.h) - ty * TS) < 4 && e.x + e.w > tx * TS && e.x < (tx + 1) * TS) e.flipKill();
      }
    }
  }

  addScore(n, byPlayer) {
    if (this.mp.mode === 'off' || !byPlayer || this.racerSolo === undefined) {
      if (this.mp.mode === 'off') this.score += n;
      return;
    }
    const r = byPlayer.__racer || (this.mp.mode === 'host' ? this.racers.find(x => x.player === byPlayer) : null);
    if (r) r.score = (r.score || 0) + n;
    if (byPlayer.local !== false) this.score += n;
  }
  addLife(byPlayer) {
    if (byPlayer) {
      const r = this.racers.find(x => x.player === byPlayer);
      if (r) r.lives++;
      if (byPlayer.local !== false) this.lives++;
    } else this.lives++;
  }
  collectCoin(real = true, silent = false) {
    this.coins++;
    if (!silent) this.audio.coin();
    if (this.coins >= 100) { this.coins -= 100; this.lives++; this.audio.lifeUp(); }
    if (real) this.score += 100;
  }
  addFloater(x, y, text) { this.floaters.push(new Floater(x, y, text)); }
  addExplosion(x, y) { this.explosions.push({ x, y, life: 14 }); }

  // ---------- death / respawn ----------
  onPlayerDeath(p) {
    if (this.mp.mode === 'off') {
      this.state = 'dying';
      this.stateTimer = 150;
      this.audio.stopMusic();
      return;
    }
    // multiplayer: world keeps running; this racer handles itself
    const r = this.racers.find(x => x.player === p);
    if (!r) return;
    if (this.mp.mode === 'host') this.mp.events.push({ e: 'die', p: r.id });
    r.respawnT = 100;
    if (p.local !== false) this.audio.stopMusic();
  }

  mpUpdateRacer(r) {
    const p = r.player;
    if (p.dead) {
      r.respawnT--;
      if (r.respawnT <= 0) {
        r.lives--;
        if (r.lives <= 0) {
          r.eliminated = true;
          if (p.local !== false && this.mp.mode === 'client') this.mp.spectating = true;
          if (this.mp.mode === 'host') this.mp.events.push({ e: 'out', p: r.id });
          this.checkRaceEnd();
        } else {
          // respawn at this racer's checkpoint
          const cp = r.cp || { x: 3 * TS - this.racers.indexOf(r) * 18, y: (ROWS - 2) * TS };
          p.reset(cp.x, cp.y - 28);
          if (this.mp.mode === 'host') this.mp.events.push({ e: 'respawn', p: r.id, x: p.x });
          if (p.local !== false) this.music(this.level.track);
        }
      }
    }
  }

  // ---------- race flow ----------
  mpStartRace(levels) {
    const roster = [...this.mp.session.players.values()];
    this.mp.levels = levels;
    this.mp.levelPos = 0;
    this.mpSetupRacers(roster);
    this.buildRaceLevel(levels[0]);
    this.score = 0; this.coins = 0; this.lives = RACE_LIVES;
    this.state = 'countdown';
    this.stateTimer = COUNTDOWN_FRAMES;
    this.audio.stopMusic();
  }

  // (re)build the current race level and reset racers to its start
  buildRaceLevel(idx) {
    this.levelIndex = idx;
    const def = LEVELS[idx];
    this.buildMap(def);
    this.timeLeft = def.time;
    this.hurryPlayed = false;
    this.timeAcc = 0;
    this.enemies = def.enemies.map(e => new Enemy(this, e.x, e.y !== undefined ? e.y : ROWS - 3, e.t));
    this.items = []; this.fireballs = []; this.coinFx = []; this.floaters = []; this.explosions = [];
    this.cameraX = 0; this.flagRaise = 0; this.flagDone = false;
    this.cpActive = false;
    this.mp.levelOrder = [];
    this.mp.enemyId = 1;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      r.finished = false; r.rank = 0; r.dnf = false;
      const sx = 3 * TS - i * 18;
      r.cp = { x: sx, y: (ROWS - 2) * TS };
      r.cpDone = false;
      r.player.reset(sx, (ROWS - 4) * TS - 28);
    }
  }

  checkRaceEnd() {
    if (this.mp.mode !== 'host') return;
    const pending = this.racers.filter(r => !r.finished && !r.eliminated);
    if (pending.length > 0) return;
    // everyone finished (or is out): advance to the next level or end the race
    if (this.mp.levelPos < this.mp.levels.length - 1) this.advanceLevel();
    else this.mpFinishRace();
  }

  advanceLevel() {
    this.mp.levelPos++;
    const idx = this.mp.levels[this.mp.levelPos];
    this.buildRaceLevel(idx);
    this.send({ t: 'level', pos: this.mp.levelPos, level: idx });
    this.state = 'countdown';
    this.stateTimer = 90;
    this.audio.stopMusic();
  }

  mpFinishRace() {
    // final ranking: most level-finish points wins
    const sorted = [...this.racers].sort((a, b) => (b.points || 0) - (a.points || 0));
    const order = [];
    sorted.forEach((r, i) => { r.rank = i + 1; order.push(r.id); });
    this.mp.order = order;
    this.state = 'results';
    this.stateTimer = 600;
    this.audio.stopMusic();
    this.sfx('levelClear');
    this.send({ t: 'done', order, pts: Object.fromEntries(sorted.map(r => [r.id, r.points || 0])) });
  }

  // ---------- snapshots (host -> clients) ----------
  buildSnapshot() {
    const pl = this.racers.map(r => ({
      i: r.id, x: Math.round(r.player.x), y: Math.round(r.player.y),
      f: r.player.facing, pw: r.player.power, st: r.player.dead ? 3 : (r.eliminated ? 4 : (r.finished ? 2 : 0)),
      lv: r.lives, sc: r.score || 0, pt: r.points || 0, sh: r.player.shifting, iv: r.player.invuln > 0 ? 1 : 0,
      sr: r.player.starTime > 0 ? 1 : 0,
    }));
    const en = [];
    for (const e of this.enemies) {
      if (!e.activated || e.dead) continue;
      en.push({ i: e.mpId, x: Math.round(e.x), y: Math.round(e.y), t: e.type === 'koopa' ? 1 : 0, s: e.state === 'walk' ? 0 : e.state === 'shell' ? 1 : e.state === 'sliding' ? 2 : 3, f: e.vx < 0 ? 0 : 1 });
    }
    const it = this.items.filter(i => !i.dead).map(i => ({ k: i.kind === 'oneup' ? '1up' : i.kind[0], x: Math.round(i.x), y: Math.round(i.y) }));
    const fb = this.fireballs.filter(f => !f.dead).map(f => ({ x: Math.round(f.x), y: Math.round(f.y) }));
    return {
      t: 'snap', f: this.frame, tm: this.timeLeft,
      pl, en, it, fb,
      ev: this.mp.events.splice(0, this.mp.events.length),
      cam: Math.round(this.cameraX),
    };
  }

  applySnapshot(snap) {
    const myId = this.mp.session.myId;
    this.mp.prevSnap = this.mp.snap;
    this.mp.snap = snap;
    this.timeLeft = snap.tm;
    if (snap.tm <= 100 && !this.hurryPlayed) { this.hurryPlayed = true; this.music('underground'); }

    // players
    for (const s of snap.pl) {
      const r = this.racers.find(x => x.id === s.i);
      if (!r) continue;
      r.lives = s.lv; r.score = s.sc; r.points = s.pt || 0;
      if (s.i === myId) {
        // soft-correct own prediction; hard snap if far off
        const p = r.player;
        const dx = s.x - p.x, dy = s.y - p.y;
        const far = Math.abs(dx) > 48 || Math.abs(dy) > 96;
        if (s.st === 3) { if (!p.dead) { p.dead = true; p.vy = -11; } }
        else {
          if (far) { p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0; }
          else { p.x += dx * 0.18; p.y += dy * 0.25; }
          p.power = s.pw; p.h = s.pw > 0 ? 42 : 28;
          p.facing = s.f; p.shifting = s.sh;
        }
        r.finished = s.st === 2;
      } else {
        // remote ghost: set interp targets
        r.ox = r.ix !== undefined ? r.ix : s.x;
        r.oy = r.iy !== undefined ? r.iy : s.y;
        r.ix = s.x; r.iy = s.y;
        r.interpT = 0;
        r.finished = s.st === 2;
        r.eliminated = s.st === 4;
        if (!r.ghost) r.ghost = {};
        r.ghost.f = s.f; r.ghost.pw = s.pw; r.ghost.sh = s.sh; r.ghost.iv = s.iv; r.ghost.sr = s.sr;
      }
    }

    // enemies: match by id, else create render-only
    for (const s of snap.en) {
      let e = this.enemies.find(x => x.mpId === s.i);
      if (!e) {
        e = new Enemy(this, s.x / TS, ROWS - 3, s.t ? 'koopa' : 'goomba');
        e.mpId = s.i; e.activated = true; e.renderOnly = true;
        e.x = s.x; e.y = s.y;
        this.enemies.push(e);
      }
      e.ox = e.ix !== undefined ? e.ix : s.x;
      e.oy = e.iy !== undefined ? e.iy : s.y;
      e.ix = s.x; e.iy = s.y;
      e.interpT = 0;
      e.vx = s.f ? 1 : -1;
      e.state = ['walk', 'shell', 'sliding', 'dying'][s.s];
      e.dead = false;
    }
    const ids = new Set(snap.en.map(e => e.i));
    this.enemies = this.enemies.filter(e => e.renderOnly ? ids.has(e.mpId) : false);

    // items & fireballs (render-only on client)
    this.items = snap.it.map(s => ({ kind: s.k === 'm' ? 'mushroom' : s.k === 'f' ? 'flower' : s.k === 's' ? 'star' : s.k === '1' ? 'oneup' : s.k, x: s.x, y: s.y, w: 16, h: 16, renderOnly: true }));
    this.fireballs = snap.fb.map(s => ({ x: s.x, y: s.y, w: 8, h: 8, renderOnly: true, anim: this.frame * 0.4 }));

    // events
    for (const ev of snap.ev) this.applyEvent(ev);
  }

  applyEvent(ev) {
    const mine = ev.p === (this.mp.session ? this.mp.session.myId : null);
    switch (ev.e) {
      case 'jump': if (!mine) this.audio.jump(ev.a); break;
      case 'fireball': if (!mine) this.audio.fireball(); break;
      case 'coin': this.audio.coin(); break;
      case 'bump': this.audio.bump(); break;
      case 'breakBlock': this.audio.breakBlock(); break;
      case 'powerdown': if (!mine || true) this.audio.powerdown(); break;
      case 'powerup': this.audio.powerup(); break;
      case 'lifeUp': this.audio.lifeUp(); break;
      case 'stomp': this.audio.stomp(); break;
      case 'kick': this.audio.kick(); break;
      case 'die': this.audio.die(); break;
      case 'used': this.map[ev.ty][ev.tx] = 5; break;
      case 'break': this.map[ev.ty][ev.tx] = 0; break;
      case 'item': this.items.push({ kind: ev.kind, x: ev.x, y: ev.y, w: 16, h: 16, renderOnly: true }); break;
      case 'coinTile': if (ev.tx !== undefined) this.coinTiles.delete(ev.tx + ',' + ev.ty); break;
      case 'flag': this.flagRaise = 128; this.audio.flag(); break;
      case 'out': break;
      case 'respawn':
        if (mine) { this.player.reset(ev.x || 3 * TS, (ROWS - 4) * TS - 28); this.music(this.level.track); }
        break;
    }
  }

  // ---------- main update ----------
  update() {
    this.frame++;
    const mp = this.mp.mode;

    if (this.state === 'title') {
      // solo start via jump/fire only in single-player menu context
      return;
    }
    if (this.state === 'countdown') {
      this.stateTimer--;
      if (mp === 'client') {
        // keep sending inputs & receiving snaps during countdown
        this.clientTick();
      }
      if (this.stateTimer <= 0) {
        this.state = 'playing';
        if (mp !== 'client') this.music(this.level.track);
      }
      return;
    }
    if (this.state === 'results') {
      this.stateTimer--;
      this.updateFx();
      if (mp === 'client') this.clientTick();
      if (this.stateTimer <= 0 && mp === 'host') this.leaveRace();
      return;
    }
    if (this.state === 'gameover' || this.state === 'win') {
      this.stateTimer--;
      if (this.stateTimer <= 0 && mp === 'off') { this.state = 'title'; this.showMenu(true); }
      return;
    }
    if (this.state === 'dying') {
      this.player.update(this.input);
      this.stateTimer--;
      if (this.stateTimer <= 0) {
        this.lives--;
        if (this.lives <= 0) { this.state = 'gameover'; this.stateTimer = 240; }
        else {
          // respawn at last checkpoint; map keeps its state (used blocks etc.)
          const cp = this.racerSolo.cp || { x: 3 * TS, y: (ROWS - 2) * TS };
          this.player.reset(cp.x, cp.y - 28);
          this.timeLeft = this.level.time;
          this.timeAcc = 0;
          this.state = 'playing';
          this.music(this.level.track);
        }
      }
      return;
    }
    if (this.state === 'levelclear') {
      this.stateTimer--;
      if (this.flagRaise < 128) this.flagRaise += 2;
      if (this.stateTimer < 90) { this.player.x += 1.2; this.player.anim += 0.25; this.player.facing = 1; }
      if (this.stateTimer <= 0) {
        if (this.levelIndex + 1 < LEVELS.length) { this.loadLevel(this.levelIndex + 1); this.state = 'playing'; }
        else { this.state = 'win'; this.stateTimer = 300; }
      }
      return;
    }
    if (this.state !== 'playing') return;

    if (mp === 'client') { this.clientTick(); this.updateFx(); return; }

    // ---- host / solo simulation ----
    const isMp = mp === 'host';
    for (const r of this.racers) {
      if (r.eliminated) continue;
      const inp = r.player.local !== false ? this.input : (r.input || {});
      if (r.player.dead) {
        r.player.update(inp);       // death arc
        this.mpUpdateRacer(r);
        continue;
      }
      if (r.finished) {             // victory walk to castle
        r.player.x += 1.2; r.player.anim += 0.25; r.player.facing = 1;
        continue;
      }
      r.player.update(inp);
      if (isMp) this.mpUpdateRacer(r);
    }

    // camera: follow local player; in mp spectate leader if eliminated
    const focus = isMp && this.spectateTarget ? this.spectateTarget.player : this.player;
    this.cameraX = Math.max(this.cameraX, Math.min(focus.x - VW * 0.38, this.levelWidth - VW));
    this.cameraX = Math.max(0, this.cameraX);
    if (isMp && this.player.eliminatedFlag) { /* handled below */ }
    if (isMp) {
      const me = this.racers.find(r => r.player.local !== false);
      if (me && me.eliminated) {
        const leader = this.racers.filter(r => !r.eliminated).sort((a, b) => b.player.x - a.player.x)[0];
        if (leader) this.cameraX = Math.max(0, Math.min(leader.player.x - VW * 0.38, this.levelWidth - VW));
      }
    }

    // timer
    this.timeAcc++;
    if (this.timeAcc >= 24) { this.timeAcc = 0; this.timeLeft--; }
    if (this.timeLeft === 100 && !this.hurryPlayed) { this.hurryPlayed = true; this.music('underground'); }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      if (isMp) { for (const r of this.racers) if (!r.finished && !r.eliminated && !r.player.dead) r.player.die(); this.checkRaceEnd(); }
      else this.player.die();
    }

    // entities
    for (const e of this.enemies) {
      if (!e.activated && e.x < this.cameraX + W + 32) e.activate();
      e.update();
      if (isMp) {
        for (const r of this.racers) {
          if (!r.eliminated && !r.finished && !r.player.dead) this.enemyRacerCollide(e, r);
        }
        this.enemyEnemyCollide(e);
      } else {
        this.enemyPlayerCollide(e);
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead);

    for (const it of this.items) { it.update(); this.itemRacerCollide(it); }
    this.items = this.items.filter(i => !i.dead);

    for (const fb of this.fireballs) {
      fb.update();
      for (const e of this.enemies) {
        if (e.dead || e.state === 'dying' || !e.activated) continue;
        if (overlap(fb, e)) { fb.dead = true; this.addExplosion(fb.x, fb.y); e.flipKill(); if (isMp) this.mp.events.push({ e: 'kick' }); break; }
      }
    }
    this.fireballs = this.fireballs.filter(f => !f.dead);

    this.updateFx();

    // coin tile pickup per racer
    for (const r of this.racers) {
      if (r.eliminated || r.finished || r.player.dead) continue;
      const pl = r.player;
      for (let ty = Math.floor(pl.y / TS); ty <= Math.floor((pl.y + pl.h - 1) / TS); ty++) {
        for (let tx = Math.floor(pl.x / TS); tx <= Math.floor((pl.x + pl.w - 1) / TS); tx++) {
          if (this.coinTiles.has(tx + ',' + ty)) {
            this.coinTiles.delete(tx + ',' + ty);
            if (pl.local !== false) this.collectCoin();
            else { this.audio.coin(); r.score = (r.score || 0) + 100; }
            if (isMp) this.mp.events.push({ e: 'coinTile', tx, ty });
          }
        }
      }
    }

    // flag reach per racer
    for (const r of this.racers) {
      if (r.eliminated || r.finished || r.player.dead) continue;
      this.racerPassesCheckpoint(r);
      if (r.player.x + r.player.w > this.level.flagX * TS + 8) {
        r.finished = true;
        this.flagRaise = 128;
        this.sfx('flag');
        if (r.player.local !== false) this.addScore(this.timeLeft * 50);
        if (this.mp.mode !== 'off') {
          // level finish: award points by finishing order (1st=alive count, then down)
          r.rank = this.mp.levelOrder.length + 1;
          this.mp.levelOrder.push(r.id);
          const alive = this.racers.filter(x => !x.eliminated).length;
          const pts = Math.max(1, alive - this.mp.levelOrder.length + 1);
          r.points = (r.points || 0) + pts;
          this.addFloater(r.player.x, r.player.y - 20, `FINISH! +${pts}PTS`);
          this.mp.events.push({ e: 'flag' });
          this.checkRaceEnd();
        } else {
          this.addFloater(r.player.x, r.player.y - 20, 'FINISH!');
          // classic solo flow: course-clear sequence, next level or win
          this.state = 'levelclear';
          this.stateTimer = 200;
          this.addScore(this.timeLeft * 50);
        }
      }
    }

    if (this.blockJiggle) { this.blockJiggle.t--; if (this.blockJiggle.t <= 0) this.blockJiggle = null; }

    // broadcast snapshot
    if (isMp && this.frame % SNAP_EVERY === 0) this.send(this.buildSnapshot());
  }

  updateFx() {
    for (const cf of this.coinFx) cf.update();
    this.coinFx = this.coinFx.filter(c => !c.dead);
    for (const fl of this.floaters) fl.update();
    this.floaters = this.floaters.filter(f => !f.dead);
    for (const ex of this.explosions) ex.life--;
    this.explosions = this.explosions.filter(e => e.life > 0);
    if (this.blockJiggle) { this.blockJiggle.t--; if (this.blockJiggle.t <= 0) this.blockJiggle = null; }
  }

  // client per-frame: predict own player, interp ghosts, send input
  clientTick() {
    const me = this.racers.find(r => r.player.local !== false);
    if (me && !me.eliminated && this.state === 'playing') {
      me.player.update(this.input);
      const myRacer = me;
      if (myRacer.player.dead) this.mpUpdateRacer(myRacer);
    }
    // camera follows me, or spectate
    if (me && !me.eliminated) {
      this.cameraX = Math.max(0, Math.min(me.player.x - VW * 0.38, this.levelWidth - VW));
    } else {
      const leader = this.racers.filter(r => !r.eliminated && !r.finished)
        .sort((a, b) => (b.ix || 0) - (a.ix || 0))[0];
      if (leader && leader.ix) this.cameraX = Math.max(0, Math.min(leader.ix - VW * 0.38, this.levelWidth - VW));
    }
    // advance interp
    for (const r of this.racers) {
      if (r.interpT !== undefined) r.interpT += 1 / SNAP_EVERY;
      for (const e of this.enemies) if (e.interpT !== undefined) e.interpT += 1 / SNAP_EVERY;
    }
    // send input
    if (this.frame % INPUT_EVERY === 0 && me && !me.eliminated && !me.finished) {
      this.send({
        t: 'input', L: !!this.input.left, R: !!this.input.right, D: !!this.input.down,
        J: !!this.input.jump, Rn: !!this.input.run, F: !!this.input.fire,
      });
      this.input.fire = false;
    }
  }

  // ---------- collisions (multi-racer aware) ----------
  enemyRacerCollide(e, r) {
    const p = r.player;
    if (e.dead || e.state === 'dying' || p.dead || this.state !== 'playing') return;
    if (!overlap(p, e)) return;
    if (p.starTime > 0) { e.flipKill(); this.mp.events.push({ e: 'kick' }); return; }
    const falling = p.vy > 1;
    const above = p.y + p.h - e.y < 12;
    if (falling && above) {
      p.vy = (p.local !== false ? this.input : r.input || {}).jump ? -9 : -6;
      if (e.state === 'shell') {
        e.state = 'sliding';
        e.vx = p.x + p.w / 2 < e.x + e.w / 2 ? 5 : -5;
        this.sfx('kick', null, p);
        if (p.local !== false) this.addScore(400, p); else r.score = (r.score || 0) + 400;
      } else {
        e.stomp();
        this.mp.events.push({ e: 'stomp' });
        if (p.local !== false) this.addScore(100, p); else r.score = (r.score || 0) + 100;
        this.addFloater(e.x + e.w / 2, e.y, '100');
      }
    } else {
      if (e.state === 'shell') {
        e.state = 'sliding';
        e.vx = p.x + p.w / 2 < e.x + e.w / 2 ? 5 : -5;
        this.sfx('kick', null, p);
      } else if (e.state !== 'sliding') {
        p.hurt();
      } else p.hurt();
    }
  }

  enemyPlayerCollide(e) {
    const r = this.racers[0];
    if (r) this.enemyRacerCollide(e, r);
  }

  enemyEnemyCollide(e) {
    if (e.state !== 'sliding') return;
    for (const o of this.enemies) {
      if (o === e || o.dead || o.state === 'dying' || !o.activated) continue;
      if (overlap(e, o)) o.flipKill();
    }
  }

  itemRacerCollide(it) {
    if (it.emerging || it.dead) return;
    for (const r of this.racers) {
      if (r.eliminated || r.finished || r.player.dead) continue;
      if (!overlap(r.player, it)) continue;
      it.dead = true;
      const kind = it.kind;
      if (kind === 'mushroom') r.player.grow('mushroom');
      else if (kind === 'flower') r.player.grow('flower');
      else if (kind === 'star') r.player.grow('star');
      else if (kind === 'oneup') r.player.grow('1up');
      this.addFloater(it.x + 8, it.y, kind === 'oneup' ? '1UP' : '1000');
      break;
    }
  }

  // ---------- networking glue ----------
  send(obj) { if (this.mp.session) this.mp.session.send(obj); }

  hostRace(code) {
    const session = new NetSession('host', {
      name: this.playerName || 'MARIO',
      transport: new TrysteroTransport(code),
    });
    this.mp.mode = 'host';
    this.mp.session = session;
    this.state = 'lobby';
    session.onEvent = ev => this.onNetEvent(ev);
  }

  joinRace(code, name) {
    const session = new NetSession('client', {
      name: (name || 'LUIGI').toUpperCase().slice(0, 10),
      transport: new TrysteroTransport(code),
    });
    this.mp.mode = 'client';
    this.mp.session = session;
    this.state = 'lobby';
    session.onEvent = ev => this.onNetEvent(ev);
  }

  onNetEvent(ev) {
    if (ev.t === 'input') {
      const r = this.racers.find(x => x.id === ev.id);
      if (r && r.input) {
        r.input.left = ev.input.L; r.input.right = ev.input.R; r.input.down = ev.input.D;
        r.input.jump = ev.input.J; r.input.run = ev.input.Rn; r.input.fire = ev.input.F;
      }
      return;
    }
    if (ev.t === 'snap') { this.applySnapshot(ev.snap); return; }
    if (ev.t === 'start') {
      this.mp.levels = ev.levels;
      this.mp.levelPos = 0;
      this.mpSetupForClient(ev.levels[0]);
      this.state = 'countdown';
      this.stateTimer = COUNTDOWN_FRAMES;
      this.audio.stopMusic();
      return;
    }
    if (ev.t === 'level') {
      // host moved the race to the next level
      this.mp.levelPos = ev.pos;
      this.buildRaceLevel(ev.level);
      this.enemies = [];                       // repopulated from snapshots
      this.state = 'countdown';
      this.stateTimer = 90;
      this.audio.stopMusic();
      return;
    }
    if (ev.t === 'done') {
      this.mp.order = ev.order;
      for (let i = 0; i < ev.order.length; i++) {
        const r = this.racers.find(x => x.id === ev.order[i]);
        if (r) { r.rank = i + 1; r.points = (ev.pts && ev.pts[r.id]) || r.points || 0; }
      }
      this.state = 'results';
      this.stateTimer = 600;
      this.audio.stopMusic();
      return;
    }
    if (ev.t === 'peer-leave') {
      if (this.mp.mode === 'host' && this.state === 'playing') {
        const r = this.racers.find(x => x.id === ev.id);
        if (r && !r.eliminated && !r.finished) { r.eliminated = true; this.addFloater(r.player.x, r.player.y, 'LEFT'); this.checkRaceEnd(); }
      }
      return;
    }
    UI.onNetEvent && UI.onNetEvent(ev);
  }

  mpSetupForClient(levelIdx) {
    this.mpSetupRacers([...this.mp.session.players.values()]);
    this.buildRaceLevel(levelIdx);
    this.enemies = [];                       // clients get enemies via snapshots
    this.score = 0; this.coins = 0; this.lives = RACE_LIVES;
    document.getElementById('overlayUI').style.display = 'none';
  }

  leaveRace() {
    if (this.mp.session) this.mp.session.dispose();
    this.mp = { ...this.mp, mode: 'off', session: null, racers: [], order: [], levelOrder: [],
      levels: [], levelPos: 0, spectating: false, events: [], snap: null, prevSnap: null };
    this.racers = [];
    this.showMenu(true);
    this.state = 'title';
  }

  showMenu(show) {
    if (show && typeof UI !== 'undefined' && UI.showScreen) UI.showScreen('menu');
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx, r = this.renderer;
    if (this.state === 'title') { this.renderTitle(); return; }
    if (!this.level) { this.renderTitle(); return; }

    r.drawBackground(this.cameraX, { theme: this.theme });
    ctx.save();
    ctx.translate(-Math.round(this.cameraX), 0);

    const x0 = Math.floor(this.cameraX / TS) - 1, x1 = x0 + W / TS + 3;
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = Math.max(0, x0); tx < Math.min(this.level.width, x1); tx++) {
        const t = this.map[ty][tx];
        if (!t) continue;
        let yy = ty * TS;
        if (this.blockJiggle && this.blockJiggle.tx === tx && this.blockJiggle.ty === ty)
          yy -= Math.sin(this.blockJiggle.t / 12 * Math.PI) * 5;
        r.drawTile(t, tx * TS, yy, this.frame);
      }
    }
    for (const key of this.coinTiles) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx >= x0 && cx <= x1) r.drawTile(8, cx * TS, cy * TS, this.frame);
    }
    for (const [px, ph] of this.pipeDefs) r.pipe(px * TS, (ROWS - 2 - ph) * TS, ph * TS);

    r.flag(this.level.flagX * TS, (ROWS - 2) * TS, this.flagRaise);
    r.castle(this.level.castleX * TS, (ROWS - 2) * TS);
    if (this.level.checkpointX) r.checkpoint(this.level.checkpointX * TS, (ROWS - 2) * TS, !!this.cpActive);

    // items / fireballs (client render-only objects or simulated)
    for (const it of this.items) if (it.renderOnly) r.drawItem(it, this.frame); else r.drawItem(it, this.frame);
    for (const fb of this.fireballs) r.drawFireball(fb, this.frame);

    // remote racers (interpolated ghosts)
    const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
    if (this.mp.mode !== 'off') {
      for (const rc of this.racers) {
        if (rc.player.local !== false || rc.eliminated) continue;
        const t = rc.interpT || 0;
        const gx = lerp(rc.ox || rc.ix || 0, rc.ix || 0, t);
        const gy = lerp(rc.oy || rc.iy || 0, rc.iy || 0, t);
        const g = rc.ghost || {};
        const fake = {
          x: gx, y: gy, w: 14, h: g.pw > 0 ? 42 : 28, vx: 0, vy: 0,
          facing: g.f || 1, power: g.pw || 0, onGround: true, anim: this.frame * 0.1,
          invuln: g.iv ? 1 : 0, starTime: g.sr ? 1 : 0, shifting: g.sh || 0,
          dead: false, fireCooldown: 0, ci: rc.ci,
        };
        if (rc.finished) fake.dead = false;
        r.drawPlayer(fake, this.frame);
        // name tag
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(gx - 6, gy - 12, rc.name.length * 6 + 10, 10);
        ctx.fillStyle = ['#f8b800', '#40d040', '#f8f800', '#808080'][rc.ci % 4] || '#fff';
        ctx.font = 'bold 8px monospace';
        ctx.fillText(rc.name, gx - 1, gy - 4);
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (e.renderOnly && e.interpT !== undefined) {
        const ex = lerp(e.ox || e.ix, e.ix, e.interpT), ey = lerp(e.oy || e.iy, e.iy, e.interpT);
        r.drawEnemy({ ...e, x: ex, y: ey }, this.frame);
      } else r.drawEnemy(e, this.frame);
    }
    // local player(s) simulated on this device
    for (const rc of this.racers) {
      if (rc.player.local !== false && !rc.eliminated) r.drawPlayer(rc.player, this.frame);
    }
    for (const cf of this.coinFx) r.coin(cf.x, cf.y, this.frame);
    for (const ex of this.explosions) r.drawExplosion(ex, this.frame);
    for (const fl of this.floaters) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(fl.text, fl.x - 8, fl.y);
    }
    ctx.restore();

    this.renderHUD();
    if (this.state === 'countdown') this.renderCountdown();
    if (this.state === 'results') this.renderResults();
    if (this.state === 'gameover') this.centerText('GAME OVER', '#fff');
    if (this.state === 'win') {
      this.centerText('YOU WIN!', '#f8b800');
      this.centerText('Thanks for playing', '#fff', 30);
    }
    if (this.state === 'levelclear') this.centerText('COURSE CLEAR!', '#fff');
  }

  renderCountdown() {
    const ctx = this.ctx;
    const isStart = this.stateTimer > COUNTDOWN_FRAMES - 30;
    const label = this.stateTimer < 30 ? 'GO!' : String(Math.ceil(this.stateTimer / 60));
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, VH / 2 - 50, VW, 90);
    ctx.fillStyle = '#f8b800';
    ctx.font = 'bold 56px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, VW / 2, VH / 2 + 12);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#fff';
    if (this.mp.levels.length > 1 && isStart)
      ctx.fillText(`RACE: ${this.mp.levels.length} LEVELS — FIRST TO THE FLAG WINS EACH!`, VW / 2, VH / 2 + 34);
    else
      ctx.fillText('FIRST TO THE FLAG WINS!', VW / 2, VH / 2 + 34);
    ctx.textAlign = 'left';
  }

  renderResults() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8b800';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('🏁 RACE RESULTS', VW / 2, 60);
    const ranked = [...this.racers].sort((a, b) => (a.rank || 99) - (b.rank || 99));
    const medals = ['🥇', '🥈', '🥉', '4th'];
    ranked.forEach((r, i) => {
      const y = 110 + i * 42;
      const isMe = r.player.local !== false;
      ctx.fillStyle = isMe ? 'rgba(248,184,0,0.25)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(90, y - 20, VW - 180, 34);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px monospace';
      const status = r.eliminated ? ' ❌' : '';
      ctx.fillText(`${medals[i] || i + 1 + 'th'}  ${r.name}${isMe ? ' (you)' : ''}${status}`, VW / 2, y + 2);
      ctx.fillStyle = '#f8b800';
      ctx.fillText(`${r.points || 0} PTS`, 380, y + 2);
    });
    ctx.font = '12px monospace';
    ctx.fillStyle = '#9cd0fc';
    if (this.mp.mode === 'host') ctx.fillText('press SPACE for a rematch lobby', VW / 2, VH - 24);
    else ctx.fillText('waiting for host…', VW / 2, VH - 24);
    ctx.textAlign = 'left';
    // host: space -> back to lobby for rematch
    if (this.mp.mode === 'host' && this.state === 'results' && this.input.jump) {
      this.input.jump = false;
      this.backToLobby();
    }
  }

  backToLobby() {
    if (this.mp.mode === 'host') {
      this.mp.session.broadcastRoster();
      this.state = 'lobby';
    }
  }

  renderHUD() {
    const ctx = this.ctx;
    const isMp = this.mp.mode !== 'off';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, VW, isMp ? 34 : 22);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#fff';
    if (isMp) {
      // race HUD: per-player progress bars
      const flagX = this.level ? this.level.flagX * TS : 1000;
      this.racers.forEach((r, i) => {
        const y = 6 + i * 8;
        const prog = Math.min(1, Math.max(0, (r.player ? r.player.x : (r.ix || 0)) / flagX));
        const isMe = r.player.local !== false;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(12, y, 200, 5);
        ctx.fillStyle = ['#f83800', '#40d040', '#f8f800', '#e0e0e0'][r.ci % 4] || '#fff';
        ctx.fillRect(12, y, 200 * prog, 5);
        ctx.fillStyle = isMe ? '#fff' : '#bbb';
        const tag = r.eliminated ? ' ✗' : r.finished ? ' 🏁' : '';
        ctx.fillText(`${r.name}${tag}${isMe ? ' ◄' : ''}`, 220, y + 5);
        if (isMe) {
          ctx.fillText(`♥${r.lives}`, 390, y + 5);
          ctx.fillText(`⏱${String(Math.max(0, this.timeLeft)).padStart(3, '0')}`, 430, y + 5);
          ctx.fillText(`${r.score || 0}`, 480, y + 5);
        }
      });
      // race progress indicator (level x/y in the sequence)
      if (this.mp.levels.length > 0) {
        ctx.fillStyle = '#f8b800';
        ctx.fillText(`LVL ${this.mp.levelPos + 1}/${this.mp.levels.length}  ·  ${this.level ? this.level.name : ''}`, 12, 31);
      }
      return;
    }
    ctx.fillText(`MARIO  ${String(this.score).padStart(6, '0')}`, 12, 15);
    r_coinIcon(ctx, 160, 4);
    ctx.fillText(`×${String(this.coins).padStart(2, '0')}`, 174, 15);
    ctx.fillText(`WORLD ${this.level ? this.level.name : '1-1'}`, 230, 15);
    ctx.fillText(`TIME ${String(Math.max(0, this.timeLeft)).padStart(3, '0')}`, 330, 15);
    ctx.fillText(`LIVES ${this.lives}`, 430, 15);
    if (this.player && this.player.starTime > 0) {
      ctx.fillStyle = '#f8b800';
      ctx.fillText('★ STAR!', 240, 15);
    }
  }

  renderTitle() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#5c94fc'); g.addColorStop(1, '#9cd0fc');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    for (let x = 0; x < VW; x += TS) this.renderer.drawTile(1, x, VH - 32, this.frame);
    for (let x = 0; x < VW; x += TS) this.renderer.drawTile(1, x, VH - 16, this.frame);
    ctx.fillStyle = '#c84c0c';
    ctx.fillRect(96, 40, 320, 90);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeRect(96, 40, 320, 90);
    ctx.fillStyle = '#f8b800';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SUPER MARIO', VW / 2, 90);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('HTML5 EDITION', VW / 2, 116);
    ctx.textAlign = 'left';
    if (Math.floor(this.frame / 30) % 2 === 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '14px monospace';
      ctx.fillText('use the buttons below to play', 170, 170);
    }
    this.renderer.drawPlayer({ x: 150, y: VH - 60, w: 14, h: 28, vx: 0, vy: 0, facing: 1, power: 1, onGround: true, anim: this.frame * 0.15, invuln: 0, starTime: 0, shifting: 0, dead: false, fireCooldown: 0 }, this.frame);
    this.renderer.drawEnemy({ type: 'goomba', x: 340, y: VH - 48, w: 16, h: 16, state: 'walk', anim: this.frame * 0.12, activated: true, vx: -1, deadTimer: 99, vy: 0 }, this.frame);
    ctx.fillStyle = '#000';
    ctx.font = '11px monospace';
    ctx.fillText('© 2026 - fan-made tribute, drawn with canvas', 130, VH - 8);
  }

  centerText(text, color, dy = 0) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, VH / 2 - 30 + dy, VW, 40);
    ctx.fillStyle = color;
    ctx.font = 'bold 26px monospace';
    ctx.fillText(text, VW / 2, VH / 2 + dy);
    ctx.textAlign = 'left';
  }

  // ---------- input ----------
  bindKeys() {
    const keymap = {
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      z: 'jump', Z: 'jump', ' ': 'jump',
      x: 'run', X: 'run', Shift: 'run',
    };
    window.addEventListener('keydown', e => {
      this.audio.init();
      if (e.key === 'm' || e.key === 'M') { this.audio.toggleMute(); e.preventDefault(); return; }
      const mp = this.mp.mode;
      if ((e.key === 'p' || e.key === 'P') && mp === 'off') { this.togglePause(); e.preventDefault(); return; }
      if ((e.key === 'r' || e.key === 'R') && mp === 'off' && this.state !== 'title') {
        this.lives = 3; this.score = 0; this.coins = 0; this.loadLevel(0); this.state = 'playing';
      }
      const k = keymap[e.key];
      if (k) {
        this.input[k] = true;
        if (k === 'run') this.input.fire = true;
        if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
      }
      // solo start from title (space/z) unless the HTML menu is visible
      if (this.state === 'title' && (e.key === ' ' || e.key === 'z' || e.key === 'Z') && !UI.menuVisible()) {
        this.startSolo();
      }
    });
    window.addEventListener('keyup', e => {
      const k = keymap[e.key];
      if (k) this.input[k] = false;
      if (e.key === 'x' || e.key === 'X') this.input.run = false;
    });
  }

  startSolo() {
    this.mp.mode = 'off';
    this.lives = 3; this.score = 0; this.coins = 0;
    this.loadLevel(0);
    this.state = 'playing';
    UI.hideMenu();
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.audio.stopMusic(); }
    else if (this.state === 'paused') { this.state = 'playing'; this.music(this.level.track); }
  }
}

function r_coinIcon(ctx, x, y) {
  ctx.fillStyle = '#f8b800';
  ctx.beginPath(); ctx.ellipse(x + 4, y + 7, 3.5, 5, 0, 0, 7); ctx.fill();
}

// ---------- minimal UI glue (overlays live in index.html) ----------
const UI = {
  el: id => document.getElementById(id),
  menuVisible() {
    const m = document.getElementById('overlayUI');
    return m && m.style.display !== 'none' && m.dataset.screen !== 'hidden';
  },
  hideMenu() {
    const m = document.getElementById('overlayUI');
    if (m) { m.style.display = 'none'; m.dataset.screen = 'hidden'; }
  },
  showScreen(name) {
    const m = document.getElementById('overlayUI');
    if (!m) return;
    m.style.display = 'flex';
    m.dataset.screen = name;
    for (const s of m.querySelectorAll('.screen')) s.style.display = s.dataset.screen === name ? 'flex' : 'none';
  },
  onNetEvent: null,
};

window.UI = UI;
window.Game = Game;

// ---------- boot ----------
window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  canvas.width = VW; canvas.height = VH;
  const game = new Game(canvas);
  window.game = game;

  UI.onNetEvent = ev => {
    // lobby roster updates -> refresh lobby list
    if (ev.t === 'roster' && game.mp.session) UI.refreshLobby();
    if (ev.t === 'peer-join' || ev.t === 'peer-leave') UI.refreshLobby();
  };

  UI.refreshLobby = () => {
    const s = game.mp.session;
    if (!s) return;
    const players = [...s.players.values()];
    const html = players.map((p, i) => {
      const isHost = i === 0;
      const isMe = p.id === s.myId;
      return `<div class="player-row">${isHost ? '👑 ' : '🎮 '}${p.name}${isMe ? ' (you)' : ''} <span class="ci ci${p.ci}"></span></div>`;
    }).join('');
    const list = UI.el('playerList');
    if (list) list.innerHTML = html;
    const listJ = UI.el('playerListJoin');
    if (listJ) listJ.innerHTML = html;
    const startBtn = UI.el('btnStart');
    if (startBtn) startBtn.disabled = players.length < 1;
  };

  // menu buttons
  UI.el('btnSolo') && (UI.el('btnSolo').onclick = () => { game.audio.init(); game.startSolo(); });
  UI.el('btnHost') && (UI.el('btnHost').onclick = () => UI.showScreen('host'));
  UI.el('btnJoin') && (UI.el('btnJoin').onclick = () => UI.showScreen('join'));
  UI.el('btnBackHost') && (UI.el('btnBackHost').onclick = () => UI.showScreen('menu'));
  UI.el('btnBackJoin') && (UI.el('btnBackJoin').onclick = () => UI.showScreen('menu'));

  UI.el('btnCreate') && (UI.el('btnCreate').onclick = () => {
    const code = makeCode();
    game.playerName = (UI.el('hostName').value || 'MARIO').toUpperCase().slice(0, 10);
    game.hostRace(code);
    UI.el('roomCode').textContent = code;
    UI.el('hostLink').textContent = location.origin + location.pathname + '?room=' + code;
    UI.showScreen('hostLobby');
    // wait for WebRTC signaling then refresh
    game.mp.session.transport.ready.then(() => UI.refreshLobby()).catch(() => {});
    setTimeout(UI.refreshLobby, 1500);
  });

  UI.el('btnJoinGo') && (UI.el('btnJoinGo').onclick = () => {
    const code = (UI.el('joinCode').value || '').trim().toUpperCase();
    if (code.length < 3) { UI.el('joinErr').textContent = 'Enter the 5-letter code'; return; }
    UI.el('joinErr').textContent = 'Connecting…';
    const name = (UI.el('joinName').value || 'LUIGI').toUpperCase().slice(0, 10);
    try {
      game.joinRace(code, name);
      game.mp.session.transport.ready.then(() => {
        UI.showScreen('joinLobby');
        UI.el('joinCodeShow').textContent = code;
        UI.refreshLobby();
      }).catch(() => { UI.el('joinErr').textContent = 'Could not reach the room. Check the code / your network.'; });
    } catch (e) {
      UI.el('joinErr').textContent = 'Connection failed: ' + e.message;
    }
  });

  // build the host's level picker (checkbox per map + quick presets)
  const picker = UI.el('lvlPicker');
  if (picker) {
    picker.innerHTML = LEVELS.map((l, i) =>
      `<label class="lvl-item"><input type="checkbox" class="lvlchk" value="${i}" checked>${l.name}${l.theme === 'underground' ? ' 🕳️' : ' ⛰️'}</label>`
    ).join('');
    document.querySelectorAll('.preset-row button').forEach(b => {
      b.onclick = () => {
        const n = parseInt(b.dataset.n, 10);
        document.querySelectorAll('.lvlchk').forEach((cb, i) => { cb.checked = i < n; });
      };
    });
  }
  UI.selectedLevels = () =>
    [...document.querySelectorAll('.lvlchk')].filter(cb => cb.checked).map(cb => parseInt(cb.value, 10));

  UI.el('btnStart') && (UI.el('btnStart').onclick = () => {
    const levels = UI.selectedLevels();
    if (!levels.length) levels.push(0);
    game.send({ t: 'start', levels });
    game.mpStartRace(levels);
    UI.hideMenu();
  });

  UI.el('btnLeave') && (UI.el('btnLeave').onclick = () => { game.leaveRace(); UI.showScreen('menu'); });
  UI.el('btnLeaveJoin') && (UI.el('btnLeaveJoin').onclick = () => { game.leaveRace(); UI.showScreen('menu'); });

  // ?room=CODE deep link
  const params = new URLSearchParams(location.search);
  if (params.get('room')) {
    UI.showScreen('join');
    UI.el('joinCode').value = params.get('room').toUpperCase();
  } else {
    UI.showScreen('menu');
  }

  function loop() {
    if (game.state !== 'paused') game.update();
    game.render();
    if (game.state === 'paused') {
      const ctx = game.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, VW, VH);
      game.centerText('PAUSED', '#fff');
    }
    requestAnimationFrame(loop);
  }
  loop();
});
