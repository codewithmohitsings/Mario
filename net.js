// net.js — multiplayer transport & protocol
//
// Host-authoritative shared world over WebRTC DataChannels (Trystero).
// Signaling happens over public Nostr relays — no server of your own needed.
//
// Protocol messages (all JSON, one action namespace 'm'):
//   hello  {name}                       joiner -> host : introduce
//   roster {players:[{id,name,ci}]}     host  -> all   : lobby list
//   start  {level}                      host  -> all   : begin race
//   input  {L,R,D,J,Rn,F}               joiner-> host  : input state 20Hz
//   snap   {t,pl[],en[],ev[],tm}        host  -> all   : world snapshot 15Hz
//   done   {order[]}                    host  -> all   : race finished
//   bye    {}                           anyone -> all  : leaving
const MP_APP_ID = 'super-mario-html5-race-v1';

// free public TURN relay (openrelay project) so strict-NAT pairs can connect
const MP_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// ---------- transport interface ----------
// send(obj, targetPeerId?)   broadcast or targeted
// onMessage(cb(data, from))  incoming
// onPeerJoin(cb(id)), onPeerLeave(cb(id))
// peers() -> [id], leave(), selfId

class TrysteroTransport {
  constructor(roomCode) {
    const { joinRoom } = window.Trystero;
    this.room = joinRoom(
      { appId: MP_APP_ID, rtcConfig: { iceServers: MP_ICE } },
      roomCode.toUpperCase()
    );
    this.selfId = this.room.selfId;
    const action = this.room.makeAction('m');
    this._send = (data, target) => action.send(data, target ? { target } : {});
    action.onMessage((data, ctx) => { if (this._onMsg) this._onMsg(data, ctx.peerId); });
    this._peers = new Set();
    this.room.onPeerJoin(ctx => {
      const id = ctx.peerId || ctx;   // tolerate both context styles
      this._peers.add(id);
      if (this._onJoin) this._onJoin(id);
    });
    this.room.onPeerLeave(ctx => {
      const id = ctx.peerId || ctx;
      this._peers.delete(id);
      if (this._onLeave) this._onLeave(id);
    });
    this.ready = this.room.ready;
  }
  send(obj, target) { try { this._send(obj, target); } catch (e) { /* peer gone */ } }
  onMessage(cb) { this._onMsg = cb; }
  onPeerJoin(cb) { this._onJoin = cb; }
  onPeerLeave(cb) { this._onLeave = cb; }
  peers() { return [...this.room.getPeers ? Object.keys(this.room.getPeers()) : this._peers]; }
  async leave() { try { await this.room.leave(); } catch (e) {} }
}

// in-process transport for tests & same-machine play
class LoopbackHub {
  constructor() { this.clients = new Set(); }
  add(client) { this.clients.add(client); return this; }
  remove(client) { this.clients.delete(client); }
}

class LoopbackTransport {
  constructor(hub, id) {
    this.hub = hub; this.selfId = id;
    this._peers = new Set();
    hub.add(this);
    // joins fire async (next tick) so sessions can subscribe first —
    // mirrors real WebRTC signaling timing
    setTimeout(() => {
      for (const c of [...hub.clients]) {
        if (c === this || this._peers.has(c.selfId)) continue;
        this._peers.add(c.selfId); c._peers.add(this.selfId);
        if (c._onJoin) c._onJoin(this.selfId);
        if (this._onJoin) this._onJoin(c.selfId);
      }
    }, 0);
  }
  send(obj, target) {
    for (const c of this.hub.clients) {
      if (c === this) continue;
      if (target && c.selfId !== target) continue;
      // deliver async so test flow resembles real transport
      setTimeout(() => c._onMsg && c._onMsg(JSON.parse(JSON.stringify(obj)), this.selfId), 0);
    }
  }
  onMessage(cb) { this._onMsg = cb; }
  onPeerJoin(cb) { this._onJoin = cb; }
  onPeerLeave(cb) { this._onLeave = cb; }
  peers() { return [...this._peers]; }
  async leave() {
    for (const c of this.hub.clients) if (c !== this) {
      c._peers.delete(this.selfId);
      if (c._onLeave) c._onLeave(this.selfId);
    }
    this.hub.remove(this);
  }
}

// ---------- protocol helpers ----------
const CI_MAX = 4;   // palettes: red, green, yellow, black

class NetSession {
  // mode: 'host' | 'client'
  constructor(mode, opts = {}) {
    this.mode = mode;
    this.name = (opts.name || 'MARIO').slice(0, 10);
    this.transport = opts.transport;
    this.loopback = opts.loopback || null;
    this.code = opts.code || '';
    this.onEvent = opts.onEvent || (() => {});   // session-level events: {t:'peer-join',...}
    this.myId = this.transport.selfId;
    this.players = new Map();   // id -> {name, ci}
    this.connected = false;

    this.transport.onMessage((data, from) => this._msg(data, from));
    this.transport.onPeerJoin(id => this._join(id));
    this.transport.onPeerLeave(id => this._leave(id));

    if (mode === 'host') {
      this.players.set(this.myId, { id: this.myId, name: this.name, ci: 0 });
    } else {
      this.myCi = null;
    }
  }

  _join(id) {
    this.connected = true;
    if (this.mode === 'client') {
      this.send({ t: 'hello', name: this.name });
    }
    this.onEvent({ t: 'peer-join', id });
  }

  _leave(id) {
    this.players.delete(id);
    this.onEvent({ t: 'peer-leave', id });
  }

  _msg(data, from) {
    if (!data || typeof data !== 'object') return;
    switch (data.t) {
      case 'hello':
        if (this.mode !== 'host') break;
        // assign next free palette
        const used = new Set([...this.players.values()].map(p => p.ci));
        let ci = 1;
        while (used.has(ci) && ci < CI_MAX) ci++;
        this.players.set(from, { id: from, name: (data.name || 'LUIGI').slice(0, 10), ci: Math.min(ci, CI_MAX) });
        this.broadcastRoster();
        this.onEvent({ t: 'peer-join', id: from, name: data.name });
        break;
      case 'roster':
        if (this.mode !== 'client') break;
        this.players = new Map(data.players.map(p => [p.id, p]));
        this.myCi = (this.players.get(this.myId) || {}).ci;
        this.onEvent({ t: 'roster' });
        break;
      case 'start':
        this.onEvent({ t: 'start', levels: data.levels });
        break;
      case 'level':
        this.onEvent({ t: 'level', pos: data.pos, level: data.level });
        break;
      case 'input':
        if (this.mode === 'host') this.onEvent({ t: 'input', id: from, input: data });
        break;
      case 'snap':
        if (this.mode === 'client') this.onEvent({ t: 'snap', snap: data, from });
        break;
      case 'done':
        this.onEvent({ t: 'done', order: data.order, dnf: data.dnf, pts: data.pts });
        break;
      case 'bye':
        this._leave(from);
        break;
    }
  }

  broadcastRoster() {
    const players = [...this.players.values()];
    this.send({ t: 'roster', players });
    this.players = new Map(players.map(p => [p.id, p]));
    this.onEvent({ t: 'roster' });
  }

  send(obj, target) { this.transport.send(obj, target); }
  broadcast(obj) { this.transport.send(obj); }
  peerCount() { return this.transport.peers().length; }

  async dispose() {
    try { this.broadcast({ t: 'bye' }); } catch (e) {}
    await this.transport.leave();
  }
}

function makeCode() {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

window.NetSession = NetSession;
window.TrysteroTransport = TrysteroTransport;
window.LoopbackHub = LoopbackHub;
window.LoopbackTransport = LoopbackTransport;
window.makeCode = makeCode;
window.MP_APP_ID = MP_APP_ID;
