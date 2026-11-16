// Physics helpers shared by all entities
const GRAV = 0.45, MAX_FALL = 11;
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ============ PLAYER ============
// One Player instance per racer. `game.sfx()` routes sounds so clients don't
// double-play predicted actions (host broadcasts sound events instead).
class Player {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.w = 14; this.h = 28;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.facing = 1;
    this.power = 0;              // 0 small, 1 big, 2 fire
    this.invuln = 0;             // frames of post-hit invincibility
    this.starTime = 0;           // star power frames
    this.dead = false;
    this.fireCooldown = 0;
    this.crouch = false;
    this.anim = 0;
    this.growTimer = 0;          // pause while growing/shrinking
    this.shifting = 0;           // 0 none, 1 growing, -1 shrinking
    this.ci = 0;                 // color palette index (multiplayer)
    this.local = true;           // false = simulated remote player on host
    this.wasStar = 0;
  }

  get big() { return this.power > 0; }

  hurt() {
    if (this.invuln > 0 || this.starTime > 0 || this.dead || this.shifting) return;
    if (this.power > 0) {
      this.power = 0;
      this.shifting = -1;
      this.growTimer = 40;
      this.invuln = 120;
      this.h = 28; this.y += 14;
      this.game.sfx('powerdown');
    } else {
      this.die();
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.vy = -11; this.vx = 0;
    this.game.sfx('die');
    this.game.onPlayerDeath(this);
  }

  update(input) {
    if (this.shifting) {
      this.growTimer--;
      if (this.growTimer <= 0) this.shifting = 0;
      return;
    }
    if (this.dead) {
      this.vy = Math.min(this.vy + GRAV, MAX_FALL);
      this.y += this.vy;
      return;
    }

    const accel = 0.28, maxRun = input.run ? 4.6 : 3.2, fric = 0.82;
    let move = 0;
    if (input.left) move = -1;
    if (input.right) move = 1;

    // big Mario crouches
    this.crouch = this.big && this.onGround && input.down && move === 0;

    if (move !== 0 && !this.crouch) {
      this.vx += accel * move;
      this.facing = move;
      if (Math.abs(this.vx) > maxRun) this.vx = maxRun * Math.sign(this.vx);
    } else if (this.onGround) {
      this.vx *= fric;
      if (Math.abs(this.vx) < 0.08) this.vx = 0;
    }

    // jump
    if (input.jump && this.onGround && !this.jumpHeld) {
      this.vy = -(8.1 + Math.abs(this.vx) * 0.2);
      this.onGround = false;
      this.game.sfx('jump', this.big);
    }
    this.jumpHeld = input.jump;
    // variable jump height
    if (!input.jump && this.vy < -3) this.vy = -3;

    // fireball
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (input.fire && this.power === 2 && this.fireCooldown === 0 && this.game.fireballs.length < 4) {
      const fb = new Fireball(this.game, this.x + (this.facing > 0 ? this.w : -8), this.y + 8, this.facing);
      this.game.fireballs.push(fb);
      this.fireCooldown = 22;
      this.game.sfx('fireball');
    }
    input.fire = false; // consume per-player

    if (this.invuln > 0) this.invuln--;
    if (this.starTime > 0) {
      if (this.wasStar === 0 && !this.game.isClient) this.game.audio.stopMusic();
      this.starTime--;
      if (this.starTime === 0) this.game.music(this.game.level.track || 'overworld');
    }
    this.wasStar = this.starTime;

    // physics
    this.vy = Math.min(this.vy + GRAV, MAX_FALL);
    this.moveX(this.vx);
    this.moveY(this.vy);

    // fell in pit
    if (this.y > this.game.levelHeight + 32) this.die();

    this.anim += Math.abs(this.vx) * 0.15;
  }

  moveX(dx) {
    this.x += dx;
    const g = this.game;
    if (this.x < 0) { this.x = 0; this.vx = 0; }
    // local player can't walk back past the camera edge (classic SMB rule);
    // remote players are free since they have their own camera on their device
    if (this.local && this.x < g.cameraX) { this.x = g.cameraX; this.vx = 0; }
    const maxX = g.levelWidth - this.w;
    if (this.x > maxX) { this.x = maxX; this.vx = 0; }
    // tile collisions (horizontal)
    const top = this.y + 2, bottom = this.y + this.h - 2;
    const ys = [top, (top + bottom) / 2, bottom];
    for (const yy of ys) {
      const tx = dx > 0 ? Math.floor((this.x + this.w) / TS) : Math.floor(this.x / TS);
      const ty = Math.floor(yy / TS);
      if (g.solidAt(tx, ty)) {
        if (dx > 0) this.x = tx * TS - this.w;
        else this.x = (tx + 1) * TS;
        this.vx = 0;
        break;
      }
    }
  }

  moveY(dy) {
    this.y += dy;
    const g = this.game;
    const left = this.x + 2, right = this.x + this.w - 2;
    const xs = [left, right];
    if (dy > 0) {
      this.onGround = false;
      for (const xx of xs) {
        const tx = Math.floor(xx / TS), ty = Math.floor((this.y + this.h) / TS);
        if (g.solidAt(tx, ty)) {
          this.y = ty * TS - this.h;
          this.vy = 0;
          this.onGround = true;
          break;
        }
      }
    } else if (dy < 0) {
      for (const xx of xs) {
        const tx = Math.floor(xx / TS), ty = Math.floor(this.y / TS);
        if (g.solidAt(tx, ty)) {
          this.y = (ty + 1) * TS;
          this.vy = 0;
          g.bumpBlock(tx, ty, this);
          break;
        }
      }
    }
  }

  grow(kind) {
    if (kind === 'mushroom') {
      if (this.power === 0) {
        this.power = 1;
        this.y -= 14; this.h = 42;
        this.shifting = 1; this.growTimer = 30;
      }
      this.game.addScore(1000, this);
      this.game.sfx('powerup');
    } else if (kind === 'flower') {
      if (this.power === 0) { this.y -= 14; this.h = 42; }
      this.power = 2;
      this.shifting = 1; this.growTimer = 30;
      this.game.addScore(1000, this);
      this.game.sfx('powerup');
    } else if (kind === 'star') {
      this.starTime = 600;
      this.game.addScore(1000, this);
      this.game.sfx('powerup');
    } else if (kind === '1up') {
      this.game.addLife(this);
      this.game.sfx('lifeUp');
    }
  }

  reset(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.power = 0; this.h = 28;
    this.dead = false;
    this.invuln = 120;
    this.starTime = 0; this.wasStar = 0;
    this.shifting = 0; this.growTimer = 0;
    this.fireCooldown = 0;
    this.crouch = false;
    this.onGround = false;
    this.facing = 1;
  }
}
window.Player = Player;
window.GRAV = GRAV; window.MAX_FALL = MAX_FALL; window.overlap = overlap;
