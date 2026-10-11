/* ------------------------------------------------------------------
   Live races against a friend. One phone hosts and shows a four letter
   room code, the other types it in. The two phones then talk directly
   (WebRTC through PeerJS; the free PeerJS broker only introduces them).
   Later this can move to TIC's Supabase Realtime.
   ------------------------------------------------------------------ */
const PEER_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'tisland-race-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export class Live {
  constructor({ onMsg, onStatus }) {
    this.onMsg = onMsg; this.onStatus = onStatus;
    this.peer = null; this.conn = null; this.role = null; this.code = ''; this.friend = null;
  }
  get connected() { return !!(this.conn && this.conn.open); }
  async _load() {
    if (window.Peer) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = PEER_URL; s.onload = res;
      s.onerror = () => rej(new Error('Could not reach the live race service. Check your connection.'));
      document.head.appendChild(s);
    });
  }
  async host(tries = 3) {
    this.close(); this.role = 'host';
    try { await this._load(); } catch (e) { this.onStatus('error', e.message); return; }
    this.code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    const peer = this.peer = new window.Peer(PREFIX + this.code);
    peer.on('open', () => this.onStatus('waiting', this.code));
    peer.on('connection', c => { if (this.conn) { c.close(); return; } this._bind(c); });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && tries > 0) return this.host(tries - 1);
      this.onStatus('error', 'The live race service had a problem. Try again.');
    });
  }
  async join(code) {
    this.close(); this.role = 'guest'; this.code = code.toUpperCase().trim();
    try { await this._load(); } catch (e) { this.onStatus('error', e.message); return; }
    const peer = this.peer = new window.Peer();
    this.onStatus('joining', this.code);
    peer.on('open', () => this._bind(peer.connect(PREFIX + this.code, { reliable: true })));
    peer.on('error', e => this.onStatus('error', e.type === 'peer-unavailable' ? `No race found with code ${this.code}.` : 'The live race service had a problem. Try again.'));
  }
  _bind(c) {
    this.conn = c;
    c.on('open', () => this.onStatus('connected'));
    c.on('data', d => { if (d && d.t === 'hello') this.friend = d; this.onMsg(d); });
    c.on('close', () => { if (this.conn !== c) return; this.conn = null; this.friend = null; this.onStatus('closed'); });
  }
  send(d) { if (this.connected) this.conn.send(d); }
  close() {
    const c = this.conn; this.conn = null;
    if (c) { try { c.close(); } catch (e) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.conn = null; this.peer = null; this.friend = null; this.role = null;
  }
}
