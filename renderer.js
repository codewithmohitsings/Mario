// Procedural sprite drawing - everything is drawn with canvas primitives
class Renderer {
  constructor(ctx) { this.ctx = ctx; }

  // ---------- background ----------
  drawBackground(cam, level) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (level.theme === 'underground') {
      g.addColorStop(0, '#000010'); g.addColorStop(1, '#000030');
    } else {
      g.addColorStop(0, '#5c94fc'); g.addColorStop(0.7, '#8bc0fc'); g.addColorStop(1, '#c8e0fc');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // clouds (parallax)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const cloudOff = (cam * 0.4) % (W + 200);
    for (let i = -1; i < 4; i++) {
      const cx = i * 220 - cloudOff + 60, cy = 40 + (i % 2) * 35;
      this.cloud(cx, cy);
    }
    // hills (parallax)
    const hillOff = (cam * 0.6) % (W + 300);
    for (let i = -1; i < 3; i++) {
      this.hill(i * 300 - hillOff + 80, GROUND_Y, level.theme === 'underground' ? '#123' : '#00a800');
    }
    // bushes
    const bushOff = (cam * 0.85) % (W + 400);
    for (let i = -1; i < 4; i++) {
      this.bush(i * 260 - bushOff + 150, GROUND_Y - 8, level.theme === 'underground' ? '#234' : '#00a800');
    }
  }
  cloud(x, y) {
    const c = this.ctx;
    c.fillStyle = '#fff';
    for (const [dx, dy, r] of [[0, 8, 12], [14, 2, 15], [30, 6, 12], [16, 12, 13]]) {
      c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill();
    }
  }
  hill(x, baseY, color) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x - 55, baseY);
    c.quadraticCurveTo(x, baseY - 75, x + 55, baseY);
    c.closePath(); c.fill();
  }
  bush(x, baseY, color) {
    const c = this.ctx;
    c.fillStyle = color;
    for (const [dx, r] of [[0, 10], [14, 13], [28, 10]]) {
      c.beginPath(); c.arc(x + dx, baseY, r, Math.PI, 0); c.fill();
    }
  }

  // ---------- tiles ----------
  drawTile(t, x, y, frame) {
    const c = this.ctx;
    switch (t) {
      case 1: // ground
        c.fillStyle = '#c84c0c'; c.fillRect(x, y, TS, TS);
        c.fillStyle = '#e89050';
        c.fillRect(x, y, TS, 2);
        c.fillRect(x + 2, y + 4, 6, 6); c.fillRect(x + 12, y + 6, 4, 4);
        c.fillStyle = '#000';
        c.fillRect(x, y + TS - 2, TS, 2);
        c.fillRect(x + 10, y + 14, 2, 6);
        break;
      case 2: // brick
        c.fillStyle = '#c84c0c'; c.fillRect(x, y, TS, TS);
        c.fillStyle = '#e89050'; c.fillRect(x, y, TS, 2);
        c.fillStyle = '#000';
        c.fillRect(x, y + 7, TS, 1); c.fillRect(x, y + 15, TS, 1);
        c.fillRect(x + 8, y, 1, 7); c.fillRect(x + 4, y + 8, 1, 7); c.fillRect(x + 12, y + 8, 1, 7);
        break;
      case 3: case 4: { // ? block
        const shine = frame % 60 < 30 ? '#f8b800' : '#e09000';
        c.fillStyle = shine; c.fillRect(x, y, TS, TS);
        c.fillStyle = '#000'; c.fillRect(x, y, TS, 1); c.fillRect(x, y + TS - 1, TS, 1);
        c.fillRect(x, y, 1, TS); c.fillRect(x + TS - 1, y, 1, TS);
        c.fillStyle = '#8c5a00';
        for (const [dx, dy] of [[3, 3], [12, 3], [3, 12], [12, 12]]) c.fillRect(x + dx, y + dy, 2, 2);
        c.fillStyle = '#fff';
        // "?" glyph
        c.fillRect(x + 5, y + 3, 6, 2); c.fillRect(x + 9, y + 5, 2, 3);
        c.fillRect(x + 7, y + 8, 2, 2); c.fillRect(x + 7, y + 12, 2, 2);
        break;
      }
      case 5: // used block
        c.fillStyle = '#a04000'; c.fillRect(x, y, TS, TS);
        c.fillStyle = '#c86818'; c.fillRect(x + 1, y + 1, TS - 2, TS - 2);
        c.fillStyle = '#7c3000';
        for (const [dx, dy] of [[2, 2], [12, 2], [2, 12], [12, 12]]) c.fillRect(x + dx, y + dy, 2, 2);
        break;
      case 6: // solid block
        c.fillStyle = '#f8f8f0'; c.fillRect(x, y, TS, TS);
        c.fillStyle = '#000'; c.fillRect(x, y + TS - 2, TS, 2); c.fillRect(x + TS - 2, y, 2, TS);
        c.fillStyle = '#d8d8d0'; c.fillRect(x + 2, y + 2, TS - 6, TS - 6);
        break;
      case 7: { // pipe body piece (drawn by pipe fn, this is fallback)
        c.fillStyle = '#00a800'; c.fillRect(x, y, TS, TS);
        break;
      }
      case 8: // free coin
        this.coin(x + 3, y + 1, frame);
        break;
    }
  }

  coin(x, y, frame) {
    const c = this.ctx;
    const wob = Math.abs(Math.sin(frame * 0.1)) * 5;
    c.fillStyle = '#f8b800';
    c.beginPath();
    c.ellipse(x + 5, y + 7, 6 - wob * 0.5, 7, 0, 0, 7);
    c.fill();
    c.fillStyle = '#ffe080';
    c.fillRect(x + 3, y + 3, 3, 8);
  }

  pipe(x, topY, height) {
    const c = this.ctx;
    // lip
    c.fillStyle = '#00a800';
    c.fillRect(x - 3, topY, TS + 6, 14);
    c.fillStyle = '#80d010';
    c.fillRect(x - 1, topY + 2, 4, 10);
    c.fillStyle = '#006000';
    c.fillRect(x - 3, topY + 12, TS + 6, 2); c.fillRect(x + TS, topY, 3, 14);
    // shaft
    for (let yy = topY + 14; yy < topY + height; yy += TS) {
      c.fillStyle = '#00a800'; c.fillRect(x, yy, TS, Math.min(TS, topY + height - yy));
      c.fillStyle = '#80d010'; c.fillRect(x + 2, yy, 4, Math.min(TS, topY + height - yy));
      c.fillStyle = '#006000'; c.fillRect(x + TS - 3, yy, 3, Math.min(TS, topY + height - yy));
    }
  }

  // mid-level checkpoint flag: red until any racer passes, then green
  checkpoint(x, baseY, active) {
    const c = this.ctx;
    c.fillStyle = '#909090';
    c.fillRect(x + 10, baseY - 48, 3, 48);
    c.fillStyle = '#606060';
    c.fillRect(x + 8, baseY - 52, 7, 5);
    const fy = active ? baseY - 44 : baseY - 30;
    c.fillStyle = active ? '#00c000' : '#f83800';
    c.beginPath();
    c.moveTo(x + 13, fy);
    c.lineTo(x + 30, fy + 7);
    c.lineTo(x + 13, fy + 14);
    c.closePath(); c.fill();
  }

  flag(x, baseY, raise) {    const c = this.ctx;
    // pole
    c.fillStyle = '#00e000';
    c.fillRect(x + 10, baseY - 160, 3, 160);
    c.fillStyle = '#f8f8f8';
    c.beginPath(); c.arc(x + 11.5, baseY - 163, 4, 0, 7); c.fill();
    // flag triangle slides with raise
    const fy = baseY - 150 + raise;
    c.fillStyle = '#f83800';
    c.beginPath();
    c.moveTo(x + 10, fy);
    c.lineTo(x - 8, fy + 8);
    c.lineTo(x + 10, fy + 16);
    c.closePath(); c.fill();
  }

  castle(x, baseY) {
    const c = this.ctx;
    const w = 80, hgt = 80;
    c.fillStyle = '#c84c0c';
    c.fillRect(x, baseY - hgt, w, hgt);
    // battlements
    for (let i = 0; i < 5; i++) c.fillRect(x + i * 16, baseY - hgt - 8, 10, 8);
    // towers
    c.fillRect(x + 8, baseY - hgt - 24, 12, 24);
    c.fillRect(x + 60, baseY - hgt - 24, 12, 24);
    c.fillRect(x + 34, baseY - hgt - 34, 12, 34);
    // door
    c.fillStyle = '#000';
    c.fillRect(x + 30, baseY - 24, 20, 24);
    c.beginPath(); c.arc(x + 40, baseY - 24, 10, Math.PI, 0); c.fill();
    // windows
    c.fillRect(x + 12, baseY - 52, 6, 8);
    c.fillRect(x + 62, baseY - 52, 6, 8);
  }

  // ---------- characters ----------
  drawPlayer(p, frame) {
    const c = this.ctx;
    if (p.invuln > 0 && Math.floor(frame / 3) % 2 === 0) return;
    const pal = p.starTime > 0
      ? (['#f83800', '#f8b800', '#00e000', '#f8f8f8'][Math.floor(frame / 4) % 4])
      : (p.power === 2 ? '#f8f8f8' : p.power === 1 ? '#f83800' : '#f83800');
    const skin = p.starTime > 0 ? pal : '#f8b070';
    const suit = p.starTime > 0 ? '#f8f8f8' : (p.power === 2 ? '#f83800' : '#3050c8');
    const shirt = p.starTime > 0 ? pal : (p.power === 2 ? '#f8f8f8' : '#f83800');
    const hgt = p.h, wid = p.w;
    const x = p.x, y = p.y;
    const f = p.facing;

    if (p.dead) {
      // simple dying pose
      c.fillStyle = shirt; c.fillRect(x + 2, y, wid - 4, 10);
      c.fillStyle = skin; c.fillRect(x + 3, y + 8, wid - 6, 8);
      c.fillStyle = suit; c.fillRect(x + 2, y + 16, wid - 4, hgt - 16);
      return;
    }
    if (p.shifting) {   // flicker while growing
      if (Math.floor(frame / 3) % 2 === 0) return;
    }

    const walkFrame = p.onGround && Math.abs(p.vx) > 0.3 ? Math.floor(p.anim) % 3 : -1;
    const jump = !p.onGround;

    // legs
    c.fillStyle = suit;
    if (jump) {
      c.fillRect(x, y + hgt - 10, wid, 10);
    } else if (walkFrame === 0) {
      c.fillRect(x, y + hgt - 8, wid, 8);
    } else if (walkFrame === 1) {
      c.fillRect(x + (f > 0 ? -2 : 4), y + hgt - 8, 8, 8);
      c.fillRect(x + (f > 0 ? 8 : 2), y + hgt - 8, 8, 8);
    } else {
      c.fillRect(x + (f > 0 ? 4 : -2), y + hgt - 9, 10, 9);
    }
    // shoes
    c.fillStyle = '#7c3000';
    c.fillRect(x + (f > 0 ? 1 : -1), y + hgt - 3, wid, 3);
    // torso
    c.fillStyle = shirt;
    c.fillRect(x + 1, y + (hgt > 30 ? 14 : 10), wid - 2, hgt > 30 ? 10 : 8);
    // overalls strap
    c.fillStyle = suit;
    c.fillRect(x + 3, y + (hgt > 30 ? 15 : 11), 3, 4);
    c.fillRect(x + wid - 6, y + (hgt > 30 ? 15 : 11), 3, 4);
    // head
    c.fillStyle = skin;
    c.fillRect(x + 2, y, wid - 4, hgt > 30 ? 12 : 9);
    // cap
    c.fillStyle = p.starTime > 0 ? pal : (p.power === 2 ? '#f8f8f8' : '#f83800');
    c.fillRect(x + 1, y, wid - 2, 4);
    c.fillRect(x + (f > 0 ? 6 : -1), y + 3, 9, 3);
    // eye
    c.fillStyle = '#000';
    c.fillRect(x + (f > 0 ? 8 : 4), y + 4, 2, 3);
    // mustache
    c.fillRect(x + (f > 0 ? 6 : 5), y + 7, 5, 2);
    // arm
    c.fillStyle = shirt;
    if (p.power === 2 && p.fireCooldown > 14) c.fillRect(x + (f > 0 ? wid - 2 : -2), y + 10, 4, 6);
    else c.fillRect(x + (f > 0 ? wid - 3 : -1), y + (hgt > 30 ? 16 : 12), 4, 6);
  }

  drawEnemy(e, frame) {
    const c = this.ctx;
    if (!e.activated && e.x > this.game.cameraX + W + 32) return;
    if (e.state === 'dying' && e.deadTimer < 10) return;

    if (e.type === 'goomba') {
      if (e.state === 'dying') {   // squashed
        c.fillStyle = '#8c4400';
        c.fillRect(e.x, e.y + e.h - 5, e.w, 5);
        return;
      }
      c.fillStyle = '#8c4400';
      c.beginPath(); c.arc(e.x + 8, e.y + 7, 8, Math.PI, 0); c.fill();
      c.fillRect(e.x, e.y + 7, 16, 6);
      // feet
      c.fillStyle = '#000';
      const step = Math.floor(e.anim) % 2;
      c.fillRect(e.x + (step ? 0 : 2), e.y + 13, 6, 3);
      c.fillRect(e.x + (step ? 10 : 8), e.y + 13, 6, 3);
      // eyes
      c.fillStyle = '#fff';
      c.fillRect(e.x + 3, e.y + 5, 4, 5); c.fillRect(e.x + 9, e.y + 5, 4, 5);
      c.fillStyle = '#000';
      c.fillRect(e.x + 5, e.y + 6, 2, 4); c.fillRect(e.x + 9, e.y + 6, 2, 4);
    } else { // koopa
      if (e.state === 'shell' || e.state === 'sliding') {
        const spin = e.state === 'sliding' ? Math.floor(frame / 3) % 2 : 0;
        c.fillStyle = '#00a800';
        c.fillRect(e.x, e.y + 2, 14, 12);
        c.fillStyle = '#80d010';
        c.fillRect(e.x + 2, e.y + 4, 10, 8);
        c.fillStyle = '#006000';
        if (spin) c.fillRect(e.x + 6, e.y + 3, 2, 10); else c.fillRect(e.x + 2, e.y + 7, 10, 2);
        return;
      }
      const step = Math.floor(e.anim) % 2;
      // shell
      c.fillStyle = '#00a800';
      c.fillRect(e.x + 1, e.y + 8, 12, 12);
      c.fillStyle = '#80d010';
      c.fillRect(e.x + 3, e.y + 10, 8, 8);
      // head
      c.fillStyle = '#e0d020';
      c.fillRect(e.x + (e.vx < 0 ? 0 : 9), e.y + (step ? 1 : 3), 6, 7);
      c.fillStyle = '#000';
      c.fillRect(e.x + (e.vx < 0 ? 1 : 11), e.y + (step ? 3 : 5), 1, 2);
      // feet
      c.fillStyle = '#e0d020';
      c.fillRect(e.x + (step ? 1 : 0), e.y + 20, 5, 2);
      c.fillRect(e.x + (step ? 8 : 9), e.y + 20, 5, 2);
    }
  }

  drawItem(it, frame) {
    const c = this.ctx;
    const x = it.x, y = it.y;
    if (it.kind === 'mushroom' || it.kind === 'oneup') {
      c.fillStyle = it.kind === 'oneup' ? '#00e000' : '#f83800';
      c.beginPath(); c.arc(x + 8, y + 6, 8, Math.PI, 0); c.fill();
      c.fillRect(x, y + 6, 16, 3);
      c.fillStyle = '#fff';
      c.fillRect(x + 2, y + 1, 4, 4); c.fillRect(x + 10, y + 1, 4, 4);
      c.fillStyle = '#f8d8a8';
      c.fillRect(x + 3, y + 9, 10, 7);
      c.fillStyle = '#000';
      c.fillRect(x + 5, y + 11, 2, 2); c.fillRect(x + 10, y + 11, 2, 2);
    } else if (it.kind === 'flower') {
      const spin = Math.floor(frame / 8) % 4;
      c.fillStyle = ['#f83800', '#f8b800', '#f83800', '#f8f8f8'][spin];
      c.beginPath(); c.arc(x + 8, y + 5, 5, 0, 7); c.fill();
      c.fillStyle = '#f8f8f8'; c.beginPath(); c.arc(x + 8, y + 5, 2, 0, 7); c.fill();
      c.fillStyle = '#00a800';
      c.fillRect(x + 6, y + 10, 4, 6);
      c.fillRect(x + 2, y + 12, 5, 2); c.fillRect(x + 9, y + 12, 5, 2);
    } else if (it.kind === 'star') {
      const blink = ['#f8b800', '#f8f8f8', '#f83800'][Math.floor(frame / 5) % 3];
      c.fillStyle = blink;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 === 0 ? 8 : 3.5;
        c.lineTo(x + 8 + Math.cos(ang) * r, y + 8 + Math.sin(ang) * r);
      }
      c.closePath(); c.fill();
      c.fillStyle = '#000';
      c.fillRect(x + 5, y + 7, 2, 2); c.fillRect(x + 9, y + 7, 2, 2);
    }
  }

  drawFireball(fb, frame) {
    const c = this.ctx;
    const col = ['#f83800', '#f8b800', '#fff'][Math.floor(fb.anim) % 3];
    c.fillStyle = col;
    c.beginPath(); c.arc(fb.x + 4, fb.y + 4, 4, 0, 7); c.fill();
  }

  drawExplosion(ex, frame) {
    const c = this.ctx;
    const r = 4 + (ex.life % 12);
    c.fillStyle = ['#f8b800', '#f83800', '#7c3000'][Math.floor(frame / 4) % 3];
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + frame * 0.1;
      c.fillRect(ex.x + Math.cos(a) * r, ex.y + Math.sin(a) * r, 3, 3);
    }
  }
}
window.Renderer = Renderer;
