// Enemies, items and projectiles

class Enemy {
  constructor(game, x, y, type) {
    this.game = game;
    this.x = x * TS; this.y = y * TS;
    this.type = type;                    // 'goomba' | 'koopa'
    this.w = type === 'koopa' ? 14 : 16;
    this.h = type === 'koopa' ? 22 : 16;
    this.y = (y + 1) * TS - this.h;      // stand on tile row bottom
    this.vx = -0.55; this.vy = 0;
    this.onGround = false;
    this.dead = false;
    this.deadTimer = 0;
    this.state = 'walk';                 // walk | shell | sliding | dying
    this.shellTimer = 0;
    this.anim = 0;
    this.activated = false;
  }
  activate() { if (!this.activated) this.activated = true; }

  stomp() {
    if (this.type === 'koopa' && this.state === 'walk') {
      this.state = 'shell';
      this.shellTimer = 480;
      this.vx = 0;
      this.w = 14; this.h = 14;
      this.y += 8;
    } else if (this.state === 'sliding') {
      this.state = 'shell';
      this.shellTimer = 480;
      this.vx = 0;
    } else {
      this.state = 'dying';
      this.deadTimer = 30;
      this.vy = 0;
    }
    this.game.audio.stomp();
    this.game.addScore(100);
    this.game.addFloater(this.x + this.w / 2, this.y, '100');
  }

  flipKill() {   // hit by fireball / star / shell from side
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.deadTimer = 60;
    this.vy = -5;
    this.vx = 0;
    this.game.audio.kick();
    this.game.addScore(200);
    this.game.addFloater(this.x + this.w / 2, this.y, '200');
  }

  update() {
    if (!this.activated) return;
    const g = this.game;

    if (this.state === 'dying') {
      this.deadTimer--;
      if (this.deadTimer > 10) { this.vy += GRAV; this.y += this.vy; }
      return;
    }

    if (this.state === 'shell') {
      this.shellTimer--;
      if (this.shellTimer <= 0) {   // wake up
        this.state = 'walk';
        this.h = 22; this.y -= 8;
        this.vx = -0.55;
      }
    }

    // gravity
    this.vy = Math.min(this.vy + GRAV, MAX_FALL);

    // horizontal move + wall bounce
    this.x += this.vx;
    const dir = Math.sign(this.vx) || 1;
    const edgeX = dir > 0 ? this.x + this.w : this.x;
    const tx = Math.floor(edgeX / TS);
    if (g.solidAt(tx, Math.floor((this.y + this.h / 2) / TS)) ||
        g.solidAt(tx, Math.floor((this.y + 2) / TS))) {
      this.x = dir > 0 ? tx * TS - this.w : (tx + 1) * TS;
      this.vx *= -1;
      if (this.state === 'sliding') g.audio.bump();
    }

    // vertical
    this.y += this.vy;
    this.onGround = false;
    const left = Math.floor((this.x + 2) / TS), right = Math.floor((this.x + this.w - 2) / TS);
    if (this.vy > 0) {
      const ty = Math.floor((this.y + this.h) / TS);
      if (g.solidAt(left, ty) || g.solidAt(right, ty)) {
        this.y = ty * TS - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    } else if (this.vy < 0) {
      const ty = Math.floor(this.y / TS);
      if (g.solidAt(left, ty) || g.solidAt(right, ty)) {
        this.y = (ty + 1) * TS;
        this.vy = 0;
      }
    }

    // walk off ledge check (turn around at cliff only for goombas on ground)
    if (this.onGround && this.state === 'walk') {
      const aheadX = Math.floor((this.vx < 0 ? this.x - 2 : this.x + this.w + 2) / TS);
      const belowY = Math.floor((this.y + this.h + 2) / TS);
      if (!g.solidAt(aheadX, belowY)) {
        // goomba walks off, koopa turns around
        if (this.type === 'koopa') this.vx *= -1;
      }
    }

    // fell into pit
    if (this.y > g.levelHeight + 32) this.dead = true;

    this.anim += 0.12;
  }
}

// Mushroom / flower / star / 1up
class Item {
  constructor(game, x, y, kind) {
    this.game = game;
    this.x = x; this.y = y;
    this.w = 16; this.h = 16;
    this.kind = kind;           // mushroom | flower | star | oneup
    this.vx = kind === 'mushroom' || kind === 'oneup' ? 0.9 : 0;
    this.vy = 0;
    this.rise = 16;             // pixels to rise out of block
    this.spawnY = y;
    this.emerging = true;
    this.bouncing = kind === 'star';
    this.anim = 0;
  }
  update() {
    const g = this.game;
    this.anim += 0.1;
    if (this.emerging) {
      this.y -= 0.5;
      if (this.spawnY - this.y >= this.rise) this.emerging = false;
      return;
    }
    if (this.kind === 'flower') return;   // static

    this.vy = Math.min(this.vy + GRAV, MAX_FALL);
    this.x += this.vx;
    const dir = Math.sign(this.vx) || 1;
    const tx = Math.floor((dir > 0 ? this.x + this.w : this.x) / TS);
    if (g.solidAt(tx, Math.floor((this.y + this.h / 2) / TS))) {
      this.x = dir > 0 ? tx * TS - this.w : (tx + 1) * TS;
      this.vx *= -1;
    }
    this.y += this.vy;
    const l = Math.floor((this.x + 2) / TS), r = Math.floor((this.x + this.w - 2) / TS);
    if (this.vy > 0) {
      const ty = Math.floor((this.y + this.h) / TS);
      if (g.solidAt(l, ty) || g.solidAt(r, ty)) {
        this.y = ty * TS - this.h;
        if (this.bouncing) this.vy = -6; else this.vy = 0;
      }
    } else if (this.vy < 0) {
      const ty = Math.floor(this.y / TS);
      if (g.solidAt(l, ty) || g.solidAt(r, ty)) { this.y = (ty + 1) * TS; this.vy = 0; }
    }
    if (this.y > g.levelHeight + 32) this.dead = true;
  }
}

class Fireball {
  constructor(game, x, y, dir) {
    this.game = game;
    this.x = x; this.y = y;
    this.w = 8; this.h = 8;
    this.vx = 4.2 * dir;
    this.vy = 0;
    this.dead = false;
    this.anim = 0;
    this.life = 240;
  }
  update() {
    const g = this.game;
    this.anim += 0.4;
    this.life--;
    if (this.life <= 0) this.dead = true;
    this.vy = Math.min(this.vy + 0.3, 7);
    this.x += this.vx;
    const tx = Math.floor((this.vx > 0 ? this.x + this.w : this.x) / TS);
    if (g.solidAt(tx, Math.floor((this.y + this.h / 2) / TS))) {
      this.dead = true;
      g.addExplosion(this.x, this.y);
      return;
    }
    this.y += this.vy;
    const l = Math.floor((this.x + 1) / TS), r = Math.floor((this.x + this.w - 1) / TS);
    if (this.vy > 0) {
      const ty = Math.floor((this.y + this.h) / TS);
      if (g.solidAt(l, ty) || g.solidAt(r, ty)) { this.y = ty * TS - this.h; this.vy = -4.5; }
    }
    if (this.x < g.cameraX - 16 || this.x > g.cameraX + W + 16 || this.y > g.levelHeight + 16) this.dead = true;
  }
}

class CoinFx {  // coin popping out of a block
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.vy = -8;
    this.dead = false;
    this.anim = 0;
  }
  update() {
    this.vy += 0.4;
    this.y += this.vy;
    this.anim += 0.3;
    if (this.vy > 4) this.dead = true;
  }
}

class Floater {  // score text
  constructor(x, y, text) { this.x = x; this.y = y; this.text = text; this.life = 50; this.dead = false; }
  update() { this.y -= 0.7; this.life--; if (this.life <= 0) this.dead = true; }
}
window.Enemy = Enemy; window.Item = Item; window.Fireball = Fireball;
window.CoinFx = CoinFx; window.Floater = Floater;
