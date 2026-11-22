// 입력: 키보드/마우스 + 모바일 가상 조이스틱/터치 버튼 (멀티터치)
export class Input {
  constructor(game) {
    this.g = game;
    this.keys = new Set();
    this.held = { attack: false, gun: false, boost: false };
    this.events = new Set();     // 1회성 이벤트: attack, dash, skill, burst
    this.joy = { active: false, id: null, x: 0, y: 0, ox: 0, oy: 0 };
    this.camDrag = { id: null, lx: 0 };
    this.camDelta = 0; this.pitchDelta = 0; this.zoomDelta = 0;
    this.lastManual = -99;
    this.boostDownAt = -1;
    this.pointer = { x: 0, y: 0, has: false };   // 건축 모드용 포인터 위치
    this.tap = null;                               // 건축 모드 탭/클릭 {x,y,place}
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this.joyEl = document.getElementById('joy');
    this.knobEl = document.getElementById('joyKnob');
    this._bind();
  }

  now() { return performance.now() / 1000; }
  mark() { this.lastManual = this.now(); }

  _bind() {
    const canvas = document.getElementById('touchLayer');
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'KeyJ') { this.held.attack = true; this.events.add('attack'); this.mark(); }
      if (k === 'KeyK') { this.held.gun = true; this.mark(); }
      if (k === 'Space') { this._boostDown(); }
      if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyL') { this.events.add('dash'); this.mark(); }
      if (k === 'KeyE') { this.events.add('skill'); this.mark(); }
      if (k === 'KeyR') { this.events.add(this.g.build.active ? 'rotateFurn' : 'burst'); this.mark(); }
      this.g.onKey(k);
    });
    addEventListener('keyup', (e) => {
      const k = e.code; this.keys.delete(k);
      if (k === 'KeyJ') this.held.attack = false;
      if (k === 'KeyK') this.held.gun = false;
      if (k === 'Space') this._boostUp();
    });
    addEventListener('blur', () => { this.keys.clear(); this.held.attack = this.held.gun = this.held.boost = false; });

    // ---- 캔버스 포인터 (마우스 + 터치) ----
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      if (e.pointerType === 'mouse') {
        this.touchMode = false;
        if (this.g.build.active && e.button === 0) { this.tap = { x: e.clientX, y: e.clientY, place: true }; return; }
        if (e.button === 0) { this.held.attack = true; this.events.add('attack'); this.mark(); }
        else if (e.button === 2) { this.held.gun = true; this.mark(); }
        else if (e.button === 1) { this.camDrag.id = e.pointerId; this.camDrag.lx = e.clientX; this.camDrag.ly = e.clientY; e.preventDefault(); }
        return;
      }
      this.touchMode = true;
      if (e.clientX < innerWidth * 0.45 && this.joy.id === null) {
        const j = this.joy; j.id = e.pointerId; j.active = true; j.ox = e.clientX; j.oy = e.clientY; j.x = j.y = 0;
        this.joyEl.style.left = e.clientX + 'px'; this.joyEl.style.top = e.clientY + 'px';
        this.joyEl.classList.add('on'); this.knobEl.style.transform = 'translate(-50%,-50%)';
        this.mark();
      } else if (this.camDrag.id === null) {
        this.camDrag.id = e.pointerId; this.camDrag.lx = e.clientX; this.camDrag.ly = e.clientY;
        this.camDrag.sx = e.clientX; this.camDrag.sy = e.clientY; this.camDrag.t = this.now();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.has = true;
      if (e.pointerId === this.joy.id) {
        const j = this.joy, R = 55;
        let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        j.x = dx / R; j.y = -dy / R;
        this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.mark();
      } else if (e.pointerId === this.camDrag.id) {
        this.camDelta -= (e.clientX - this.camDrag.lx) * 0.006;
        this.pitchDelta += (e.clientY - this.camDrag.ly) * 0.004;
        this.camDrag.lx = e.clientX; this.camDrag.ly = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === this.joy.id) {
        this.joy.id = null; this.joy.active = false; this.joy.x = this.joy.y = 0;
        this.joyEl.classList.remove('on');
      }
      if (e.pointerId === this.camDrag.id) {
        // 짧은 탭 → 건축 모드 위치 지정
        if (e.pointerType !== 'mouse' && this.g.build.active &&
            Math.hypot(e.clientX - this.camDrag.sx, e.clientY - this.camDrag.sy) < 12 && this.now() - this.camDrag.t < 0.35) {
          this.tap = { x: e.clientX, y: e.clientY, place: false };
        }
        this.camDrag.id = null;
      }
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.held.attack = false;
        if (e.button === 2) this.held.gun = false;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => { this.zoomDelta += Math.sign(e.deltaY) * 1.2; e.preventDefault(); }, { passive: false });

    // ---- 액션 버튼 ----
    document.querySelectorAll('[data-act]').forEach((b) => {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.setPointerCapture?.(e.pointerId);
        b.classList.add('down'); this.mark();
        if (act === 'attack') { this.held.attack = true; this.events.add('attack'); }
        else if (act === 'gun') this.held.gun = true;
        else if (act === 'boost') this._boostDown();
        else this.events.add(act);
      });
      const up = (e) => {
        b.classList.remove('down');
        if (act === 'attack') this.held.attack = false;
        else if (act === 'gun') this.held.gun = false;
        else if (act === 'boost') this._boostUp();
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  // 부스터: 짧게 탭 = 돌진, 길게 = 공중 부양
  _boostDown() { if (this.held.boost) return; this.held.boost = true; this.boostDownAt = this.now(); this.mark(); }
  _boostUp() {
    if (!this.held.boost) return;
    this.held.boost = false;
    if (this.now() - this.boostDownAt < 0.2) this.events.add('dash');
    this.mark();
  }
  // 부양 판정: 0.2초 이상 누르고 있는 중
  hovering() { return this.held.boost && this.now() - this.boostDownAt >= 0.2; }

  consume(name) { if (this.events.has(name)) { this.events.delete(name); return true; } return false; }

  getMove() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; this.mark(); }
    if (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.12) { x = this.joy.x; y = this.joy.y; }
    return { x, y };
  }

  // 수동 조작 감지 (AUTO 중 수동 우선)
  isManual() {
    const n = this.now();
    if (this.held.attack || this.held.gun || this.held.boost) this.lastManual = n;
    if (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.12) this.lastManual = n;
    return n - this.lastManual < 0.7;
  }

  frameCamera() {
    let d = this.camDelta; this.camDelta = 0;
    if (this.keys.has('KeyZ') || this.keys.has('KeyQ')) d += 0.035;
    if (this.keys.has('KeyX') || this.keys.has('KeyC')) d -= 0.035;
    const p = this.pitchDelta; this.pitchDelta = 0;
    const z = this.zoomDelta; this.zoomDelta = 0;
    return { yaw: d, pitch: p, zoom: z };
  }
}
