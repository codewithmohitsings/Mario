// Main game engine
const TS = 16;                 // tile size
const VW = 512, VH = 320;      // internal resolution (4x pixel-ish)
const ROWS = 20, GROUND_Y = VH - 32;   // 2 tile rows of ground at bottom
const W = VW, H = VH;
// expose shared constants/classes for cross-file access (needed for node tests too)
if (typeof window !== 'undefined') {
  window.TS = TS; window.VW = VW; window.VH = VH; window.ROWS = ROWS;
  window.GROUND_Y = GROUND_Y; window.W = W; window.H = H;
}

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
    this.state = 'title';        // title | playing | dying | levelclear | gameover | win
    this.stateTimer = 0;
    this.lives = 3;
    this.score = 0;
    this.coins = 0;
    this.levelIndex = 0;
    this.bindKeys();
  }

  // ---------- level construction ----------
  loadLevel(i) {
    this.levelIndex = i;
    const def = LEVELS[i];
    this.level = def;
    this.levelWidth = def.width * TS;
    this.levelHeight = VH;
    this.theme = i === 1 ? 'underground' : 'overworld';
    def.track = i === 1 ? 'underground' : 'overworld';

    // tile map: rows x cols
    this.map = [];
    for (let r = 0; r < ROWS; r++) this.map.push(new Array(def.width).fill(0));

    // ground (2 rows)
    for (const [a, b] of def.ground)
      for (let c = a; c <= b; c++) { this.map[ROWS - 2][c] = 1; this.map[ROWS - 1][c] = 1; }

    // blocks
    this.qContents = {};   // "tx,ty" -> 'coin' | 'mushroom' | ...
    for (const b of def.blocks) {
      this.map[b.y][b.x] = b.t;
      if (b.t === 3) this.qContents[b.x + ',' + b.y] = 'coin';
      if (b.t === 4) this.qContents[b.x + ',' + b.y] = 'mushroom';
    }

    // pipes
    for (const [px, ph] of def.pipes)
      for (let r = ROWS - 2 - ph; r < ROWS - 2; r++) this.map[r][px] = 7;
    this.pipeDefs = def.pipes;

    // stairs
    for (const s of def.stairs) {
      for (let k = 0; k < s.n; k++) {
        const col = s.dir > 0 ? s.x + k : s.x + (s.n - 1 - k);
        const height = s.dir > 0 ? k + 1 : s.n - k;
        for (let r = 0; r < height; r++) this.map[ROWS - 3 - r][col] = 6;
      }
    }

    // coins
    this.coinTiles = new Set();
    for (const [cx, cy] of def.coins) this.coinTiles.add(cx + ',' + cy);

    // entities
    this.player = new Player(this, 3 * TS, (ROWS - 4) * TS - 28);
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

    this.audio.startMusic(def.track || 'overworld');
  }

  solidAt(tx, ty) {
    if (tx < 0 || tx >= this.level.width) return true;   // level bounds solid
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
        this.collectCoin(false);
        this.addScore(200);
      } else {
        // spawn item above block
        const kind = content === 'mushroom'
          ? (this.player.power === 0 ? 'mushroom' : 'flower')
          : content;
        this.items.push(new Item(this, tx * TS, ty * TS - 16, kind));
      }
      this.map[ty][tx] = 5;
      this.audio.bump();
      // bounce animation via floater-like jiggle
      this.blockJiggle = { tx, ty, t: 12 };
    } else if (t === 2) {
      if (this.player.big) {
        this.map[ty][tx] = 0;
        this.audio.breakBlock();
        this.addScore(50);
        // debris
        for (let k = 0; k < 4; k++)
          this.explosions.push({ x: tx * TS + (k % 2) * 8, y: ty * TS + Math.floor(k / 2) * 8, life: 20, debris: true });
      } else {
        this.audio.bump();
        this.blockJiggle = { tx, ty, t: 8 };
      }
    } else if (t === 5 || t === 6 || t === 7 || t === 1) {
      this.audio.bump();
    }
    // enemies standing on bumped block get flipped
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dying') continue;
      if (Math.abs((e.y + e.h) - ty * TS) < 4 && e.x + e.w > tx * TS && e.x < (tx + 1) * TS) e.flipKill();
    }
  }

  addScore(n) { this.score += n; }
  collectCoin(real = true) {
    this.coins++;
    this.audio.coin();
    if (this.coins >= 100) { this.coins -= 100; this.lives++; this.audio.lifeUp(); }
    if (real) this.addScore(100);
  }
  addFloater(x, y, text) { this.floaters.push(new Floater(x, y, text)); }
  addExplosion(x, y) { this.explosions.push({ x, y, life: 14 }); }

  onPlayerDeath() {
    this.state = 'dying';
    this.stateTimer = 150;
    this.audio.stopMusic();
  }

  // ---------- main update ----------
  update() {
    this.frame++;
    if (this.state === 'title') {
      if (this.input.jump || this.input.fire) {
        this.lives = 3; this.score = 0; this.coins = 0;
        this.loadLevel(0);
        this.state = 'playing';
      }
      return;
    }
    if (this.state === 'gameover' || this.state === 'win') {
      this.stateTimer--;
      if (this.stateTimer <= 0) this.state = 'title';
      return;
    }
    if (this.state === 'dying') {
      this.player.update(this.input);
      this.stateTimer--;
      if (this.stateTimer <= 0) {
        this.lives--;
        if (this.lives <= 0) { this.state = 'gameover'; this.stateTimer = 240; }
        else { this.loadLevel(this.levelIndex); this.state = 'playing'; }
      }
      return;
    }
    if (this.state === 'levelclear') {
      this.stateTimer--;
      // flag slides down then walk to castle
      if (this.flagRaise < 128) this.flagRaise += 2;
      if (this.stateTimer < 90) {
        this.player.x += 1.2;
        this.player.anim += 0.25;
        this.player.facing = 1;
      }
      if (this.stateTimer <= 0) {
        if (this.levelIndex + 1 < LEVELS.length) {
          this.loadLevel(this.levelIndex + 1);
          this.state = 'playing';
        } else {
          this.state = 'win'; this.stateTimer = 300;
        }
      }
      return;
    }

    // playing
    this.player.update(this.input);
    this.cameraX = Math.max(this.cameraX, Math.min(this.player.x - VW * 0.38, this.levelWidth - VW));
    this.cameraX = Math.max(0, this.cameraX);

    // timer
    this.timeAcc++;
    if (this.timeAcc >= 24) { this.timeAcc = 0; this.timeLeft--; }
    if (this.timeLeft === 100 && !this.hurryPlayed) { this.hurryPlayed = true; this.audio.startMusic('underground'); }
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.player.die(); }

    // entities
    for (const e of this.enemies) {
      if (!e.activated && e.x < this.cameraX + W + 32) e.activate();
      e.update();
      this.enemyPlayerCollide(e);
      this.enemyEnemyCollide(e);
    }
    this.enemies = this.enemies.filter(e => !e.dead);

    for (const it of this.items) { it.update(); this.itemPlayerCollide(it); }
    this.items = this.items.filter(i => !i.dead);

    for (const fb of this.fireballs) { fb.update(); this.fireballEnemyCollide(fb); }
    this.fireballs = this.fireballs.filter(f => !f.dead);

    for (const cf of this.coinFx) cf.update();
    this.coinFx = this.coinFx.filter(c => !c.dead);

    for (const fl of this.floaters) fl.update();
    this.floaters = this.floaters.filter(f => !f.dead);

    for (const ex of this.explosions) ex.life--;
    this.explosions = this.explosions.filter(e => e.life > 0);

    // coin tile pickup
    const pl = this.player;
    for (let ty = Math.floor(pl.y / TS); ty <= Math.floor((pl.y + pl.h - 1) / TS); ty++) {
      for (let tx = Math.floor(pl.x / TS); tx <= Math.floor((pl.x + pl.w - 1) / TS); tx++) {
        if (this.coinTiles.has(tx + ',' + ty)) {
          this.coinTiles.delete(tx + ',' + ty);
          this.collectCoin();
        }
      }
    }

    // flag reach
    if (!this.flagDone && pl.x + pl.w > this.level.flagX * TS + 8) {
      this.flagDone = true;
      this.state = 'levelclear';
      this.stateTimer = 200;
      this.audio.flag();
      this.addScore(this.timeLeft * 50);
    }

    if (this.blockJiggle) {
      this.blockJiggle.t--;
      if (this.blockJiggle.t <= 0) this.blockJiggle = null;
    }
  }

  enemyPlayerCollide(e) {
    const p = this.player;
    if (e.dead || e.state === 'dying' || p.dead || this.state !== 'playing') return;
    if (!overlap(p, e)) return;
    if (p.starTime > 0) { e.flipKill(); return; }
    const falling = p.vy > 1;
    const above = p.y + p.h - e.y < 12;
    if (falling && above) {
      p.vy = this.input.jump ? -9 : -6;
      if (e.state === 'shell' ) {
        // kick shell
        e.state = 'sliding';
        e.vx = p.x + p.w / 2 < e.x + e.w / 2 ? 5 : -5;
        this.audio.kick();
        this.addScore(400);
      } else e.stomp();
    } else {
      if (e.state === 'shell') {
        e.state = 'sliding';
        e.vx = p.x + p.w / 2 < e.x + e.w / 2 ? 5 : -5;
        this.audio.kick();
      } else if (e.state !== 'sliding') {
        p.hurt();
      } else {
        p.hurt();
      }
    }
  }

  enemyEnemyCollide(e) {
    if (e.state !== 'sliding') return;
    for (const o of this.enemies) {
      if (o === e || o.dead || o.state === 'dying' || !o.activated) continue;
      if (overlap(e, o)) o.flipKill();
    }
  }

  itemPlayerCollide(it) {
    if (it.emerging || it.dead) return;
    if (!overlap(this.player, it)) return;
    it.dead = true;
    if (it.kind === 'mushroom') this.player.grow('mushroom');
    else if (it.kind === 'flower') this.player.grow('flower');
    else if (it.kind === 'star') this.player.grow('star');
    else if (it.kind === 'oneup') this.player.grow('1up');
    this.addFloater(it.x + 8, it.y, it.kind === 'oneup' ? '1UP' : '1000');
  }

  fireballEnemyCollide(fb) {
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dying' || !e.activated) continue;
      if (overlap(fb, e)) { fb.dead = true; this.addExplosion(fb.x, fb.y); e.flipKill(); return; }
    }
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx, r = this.renderer;
    if (this.state === 'title') { this.renderTitle(); return; }

    r.drawBackground(this.cameraX, { theme: this.theme });
    ctx.save();
    ctx.translate(-Math.round(this.cameraX), 0);

    // tiles
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
    // free coins
    for (const key of this.coinTiles) {
      const [cx, cy] = key.split(',').map(Number);
      if (cx >= x0 && cx <= x1) r.drawTile(8, cx * TS, cy * TS, this.frame);
    }
    // pipes lips drawn over tiles for proper shape
    for (const [px, ph] of this.pipeDefs) r.pipe(px * TS, (ROWS - 2 - ph) * TS, ph * TS);

    // flag + castle
    r.flag(this.level.flagX * TS, (ROWS - 2) * TS, this.flagRaise);
    r.castle(this.level.castleX * TS, (ROWS - 2) * TS);

    // entities
    for (const it of this.items) r.drawItem(it, this.frame);
    for (const e of this.enemies) r.drawEnemy(e, this.frame);
    for (const fb of this.fireballs) r.drawFireball(fb, this.frame);
    r.drawPlayer(this.player, this.frame);
    for (const cf of this.coinFx) r.coin(cf.x, cf.y, this.frame);
    for (const ex of this.explosions) r.drawExplosion(ex, this.frame);
    for (const fl of this.floaters) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(fl.text, fl.x - 8, fl.y);
    }
    ctx.restore();

    this.renderHUD();
    if (this.state === 'gameover') this.centerText('GAME OVER', '#fff');
    if (this.state === 'win') {
      this.centerText('YOU WIN!', '#f8b800');
      this.centerText('Thanks for playing', '#fff', 30);
    }
    if (this.state === 'levelclear') this.centerText('COURSE CLEAR!', '#fff');
  }

  renderHUD() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, VW, 22);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#fff';
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
    // ground strip
    for (let x = 0; x < VW; x += TS) this.renderer.drawTile(1, x, VH - 32, this.frame);
    for (let x = 0; x < VW; x += TS) this.renderer.drawTile(1, x, VH - 16, this.frame);
    // logo panel
    ctx.fillStyle = '#c84c0c';
    ctx.fillRect(96, 50, 320, 90);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeRect(96, 50, 320, 90);
    ctx.fillStyle = '#f8b800';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SUPER MARIO', VW / 2, 100);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('HTML5 EDITION', VW / 2, 126);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('ARROWS / WASD: move    Z / SPACE: jump', 120, 190);
    ctx.fillText('X / SHIFT: run & fireball    P: pause    M: mute', 120, 212);
    if (Math.floor(this.frame / 30) % 2 === 0) {
      ctx.fillStyle = '#f8b800';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('PRESS SPACE / Z TO START', 150, 258);
    }
    // decorative mario + goomba
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
      if (e.key === 'p' || e.key === 'P') { this.togglePause(); e.preventDefault(); return; }
      if (e.key === 'm' || e.key === 'M') { this.audio.toggleMute(); e.preventDefault(); return; }
      if (e.key === 'r' || e.key === 'R') { if (this.state !== 'title') { this.lives = 3; this.score = 0; this.coins = 0; this.loadLevel(0); this.state = 'playing'; } }
      const k = keymap[e.key];
      if (k) {
        this.input[k] = true;
        if (k === 'run') this.input.fire = true;   // X fires fireballs too
        if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
      }
    });
    window.addEventListener('keyup', e => {
      const k = keymap[e.key];
      if (k) this.input[k] = false;
      if (e.key === 'x' || e.key === 'X') this.input.run = false;
    });
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.audio.stopMusic(); }
    else if (this.state === 'paused') { this.state = 'playing'; this.audio.startMusic(this.level.track); }
  }
}

function r_coinIcon(ctx, x, y) {
  ctx.fillStyle = '#f8b800';
  ctx.beginPath(); ctx.ellipse(x + 4, y + 7, 3.5, 5, 0, 0, 7); ctx.fill();
}

// ---------- boot ----------
window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  canvas.width = VW; canvas.height = VH;
  const game = new Game(canvas);
  window.game = game;   // exposed for debugging / tests

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
