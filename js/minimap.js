// ============================================================
//  미니맵(화면 우상단 원형, 카메라 방향 기준 회전) + 전체 월드맵(지도 패널, 북쪽 고정)
//  표시: 주인공·시선 방향 · 몬스터 · 수호자/보스(범위 밖이면 가장자리 화살표) · 포탈(게이트) · 정령 · 비석 · 채집물 · NPC
// ============================================================
import * as D from './data.js';

const TAU = Math.PI * 2;
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const MINI_RANGE = 30;              // 미니맵 반경이 보여주는 월드 거리(m)
const NODE_COL = { tree: '#7ad04a', ore: '#c8d0dc', crystal: '#4ad8ff', spiritOre: '#d070ff' };

export class Minimap {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById('minimap');
    this.cv = document.getElementById('miniCanvas');
    this.ctx = this.cv.getContext('2d');
    this.t = 0; this.wt = 0; this.size = 0;
    this.el.addEventListener('click', () => this.g.ui.togglePanel('map'));
    addEventListener('resize', () => { this.size = 0; });
  }

  fit(cv) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(40, Math.round(cv.clientWidth * dpr));
    if (cv.width !== w || cv.height !== w) { cv.width = w; cv.height = w; }
    return w;
  }

  update(dt) {
    this.t -= dt;
    if (this.t <= 0) { this.t = 1 / 20; this.drawMini(); }
    if (this.g.ui.panel === 'map') {
      this.wt -= dt;
      if (this.wt <= 0) { this.wt = 1 / 12; const cv = document.getElementById('worldMapCanvas'); if (cv) this.drawWorld(cv); }
    }
  }

  // 공통: 엔티티 목록 수집
  collect() {
    const g = this.g, w = g.world, out = [];
    if (!w) return out;
    if (w.gatePos) out.push({ k: 'gate', x: w.gatePos.x, z: w.gatePos.z, open: g.gateOpen() });
    if (w.seal && w.seal.visible && w.sealPos) out.push({ k: 'seal', x: w.sealPos.x, z: w.sealPos.z });
    for (const o of g.orbs) out.push({ k: 'orb', x: o.pos.x, z: o.pos.z, c: D.ELEMENTS[o.el].css, locked: o.locked });
    for (const n of g.nodes) if (n.alive) out.push({ k: 'node', x: n.pos.x, z: n.pos.z, c: NODE_COL[n.type] || '#ccc' });
    for (const n of g.npcs || []) out.push({ k: 'npc', x: n.pos.x, z: n.pos.z, name: n.name });
    for (const e of g.enemies) if (!e.dead) out.push({ k: e.boss ? 'boss' : e.elite ? 'elite' : 'mob', x: e.pos.x, z: e.pos.z, aggro: e.windup > 0 });
    return out;
  }

  // ---------------- 미니맵 ----------------
  drawMini() {
    const g = this.g, h = g.h, w = g.world, cv = this.cv, ctx = this.ctx;
    if (!h || !w || !cv.clientWidth) return;
    const S = this.fit(cv), r = S / 2, sc = (r - 4) / MINI_RANGE, now = performance.now() / 1000;
    const yaw = g.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const toS = (x, z) => { const dx = x - h.pos.x, dz = z - h.pos.z; return [r + (dx * rx + dz * rz) * sc, r - (dx * fx + dz * fz) * sc]; };
    const clampE = (p, m = 7) => { const dx = p[0] - r, dy = p[1] - r, d = Math.hypot(dx, dy); if (d <= r - m) return [p, false]; const k = (r - m) / d; return [[r + dx * k, r + dy * k], true]; };
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(r, r, r - 1, 0, TAU); ctx.clip();
    ctx.fillStyle = 'rgba(8,14,34,.78)'; ctx.fillRect(0, 0, S, S);
    // 섬 지면
    const c0 = toS(0, 0), gcol = hex(w.def.ground ?? 0x7ac860);
    ctx.beginPath(); ctx.arc(c0[0], c0[1], w.R * sc, 0, TAU);
    ctx.fillStyle = gcol + '66'; ctx.fill();
    ctx.lineWidth = 2 * (S / 130); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
    // 집 건물
    if (w.houseBox) this.house(ctx, w.houseBox, toS);
    // 시야 부채꼴
    ctx.beginPath(); ctx.moveTo(r, r); ctx.arc(r, r, r * 0.55, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
    const u = S / 130;
    for (const it of this.collect()) {
      let p = toS(it.x, it.z), edge = false;
      if (it.k === 'boss' || it.k === 'elite' || it.k === 'gate') [p, edge] = clampE(p);
      else if (Math.hypot(p[0] - r, p[1] - r) > r - 2) continue;
      this.marker(ctx, it, p[0], p[1], u, now, edge, r);
    }
    // 주인공 화살표
    const hx = Math.sin(h.yaw), hz = Math.cos(h.yaw);
    const ang = Math.atan2(hx * rx + hz * rz, hx * fx + hz * fz);    // 화면 위쪽 기준 시계 방향 각
    this.arrow(ctx, r, r, ang, 7 * u, '#ffffff', '#ff4a6a');
    ctx.restore();
    // 테두리 + 북쪽 표시 (게이트 방향 = 북쪽 = -Z)
    ctx.beginPath(); ctx.arc(r, r, r - 1.5 * u, 0, TAU); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
    const na = Math.atan2(-rz, -fz);
    const nx = r + Math.sin(na) * (r - 9 * u), ny = r - Math.cos(na) * (r - 9 * u);
    ctx.font = `900 ${10 * u}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff7a8a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3 * u; ctx.strokeText('N', nx, ny); ctx.fillText('N', nx, ny);
  }

  house(ctx, b, toS) {
    const pts = [toS(b[0], b[2]), toS(b[1], b[2]), toS(b[1], b[3]), toS(b[0], b[3])];
    ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.closePath();
    ctx.fillStyle = 'rgba(200,140,90,.75)'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
  }

  arrow(ctx, x, y, a, s, fill, stroke) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.75); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.7, s * 0.75); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = Math.max(1.5, s * 0.22); ctx.strokeStyle = stroke; ctx.stroke();
    ctx.restore();
  }

  marker(ctx, it, x, y, u, now, edge, r) {
    const dot = (rad, fill, line) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.lineWidth = u * 1.2; ctx.strokeStyle = line; ctx.stroke(); } };
    switch (it.k) {
      case 'mob': dot(2.6 * u, it.aggro ? '#ffd040' : '#ff4a5a', 'rgba(0,0,0,.6)'); break;
      case 'elite': dot((4.6 + Math.sin(now * 6) * 0.6) * u, '#ff9a2a', '#fff'); break;
      case 'boss': {
        const s = (6 + Math.sin(now * 5) * 1) * u;
        dot(s, '#b040ff', '#fff');
        ctx.font = `900 ${s * 1.3}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('★', x, y + 0.5);
        break;
      }
      case 'gate': {
        ctx.beginPath(); ctx.arc(x, y, 4.5 * u, 0, TAU); ctx.lineWidth = 2.4 * u;
        ctx.strokeStyle = it.open ? `rgba(138,240,255,${0.65 + 0.35 * Math.sin(now * 4)})` : 'rgba(150,160,180,.8)'; ctx.stroke();
        dot(1.6 * u, it.open ? '#8af0ff' : '#8890a0');
        break;
      }
      case 'orb':
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = it.c; ctx.fillRect(-3 * u, -3 * u, 6 * u, 6 * u);
        ctx.lineWidth = u; ctx.strokeStyle = it.locked ? '#666' : '#fff'; ctx.strokeRect(-3 * u, -3 * u, 6 * u, 6 * u); ctx.restore();
        break;
      case 'seal': dot(3 * u, '#ffb347', '#fff'); break;
      case 'node': dot(1.5 * u, it.c); break;
      case 'npc': dot(3 * u, '#6aff8a', '#fff'); break;
    }
    if (edge) {                          // 범위 밖: 가장자리 방향 표시
      const a = Math.atan2(x - r, -(y - r));
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, -7 * u); ctx.lineTo(3 * u, -3.5 * u); ctx.lineTo(-3 * u, -3.5 * u); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    }
  }

  // ---------------- 전체 월드맵 (북쪽 = 위 = -Z 고정) ----------------
  drawWorld(cv) {
    const g = this.g, h = g.h, w = g.world, ctx = cv.getContext('2d');
    if (!h || !w || !cv.clientWidth) return;
    const S = this.fit(cv), c = S / 2, sc = (c - 14 * (S / 520)) / w.R, u = S / 520, now = performance.now() / 1000;
    const toS = (x, z) => [c + x * sc, c + z * sc];
    ctx.clearRect(0, 0, S, S);
    // 하늘 + 섬
    ctx.fillStyle = '#0c1634'; ctx.fillRect(0, 0, S, S);
    const gcol = hex(w.def.ground ?? 0x7ac860), g2 = hex(w.def.ground2 ?? w.def.ground ?? 0x9adb6a);
    const grd = ctx.createRadialGradient(c, c, 0, c, c, w.R * sc);
    grd.addColorStop(0, g2); grd.addColorStop(0.85, gcol); grd.addColorStop(1, hex(w.def.cliff ?? 0x8a6a48));
    ctx.beginPath(); ctx.arc(c, c, w.R * sc, 0, TAU); ctx.fillStyle = grd; ctx.fill();
    ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.stroke();
    // 격자 (10m)
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, w.R * sc, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
    for (let v = -60; v <= 60; v += 10) { const a = toS(v, -60), b = toS(v, 60); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); const d = toS(-60, v), e = toS(60, v); ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); }
    ctx.restore();
    if (w.houseBox) this.house(ctx, w.houseBox, toS);
    // 시작 지점
    const sp = toS(w.spawn.x, w.spawn.z);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `800 ${12 * u}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⌂ 시작', sp[0], sp[1] + 14 * u);
    const label = (t, x, y, col = '#fff') => { ctx.font = `800 ${12 * u}px sans-serif`; ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
    for (const it of this.collect()) {
      const [x, y] = toS(it.x, it.z);
      const uu = it.k === 'node' ? u * 1.4 : u * 1.9;
      this.marker(ctx, it, x, y, uu, now, false, c);
      if (it.k === 'gate') label(it.open ? (g.mapId === 'home' ? '모험 게이트' : g.mapId === 3 ? '귀환 게이트' : '다음 섬 게이트') : '게이트 (봉인)', x, y - 16 * u, it.open ? '#8af0ff' : '#aab');
      if (it.k === 'boss' || it.k === 'elite') label(it.k === 'boss' ? '보스' : '수호자', x, y - 16 * u, it.k === 'boss' ? '#e0a0ff' : '#ffc080');
      if (it.k === 'seal') label('각성의 비석', x, y - 12 * u, '#ffd080');
      if (it.k === 'orb') label(it.locked ? '봉인된 정령' : '정령', x, y - 12 * u, it.c);
      if (it.k === 'npc') label(it.name, x, y - 12 * u, '#9affb0');
    }
    // 주인공 + 시야
    const [hx, hy] = toS(h.pos.x, h.pos.z);
    const cy = g.cam.yaw, va = Math.atan2(-Math.cos(cy), -Math.sin(cy));    // 카메라 전방 (-sin,-cos) → 캔버스 각
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.arc(hx, hy, 60 * u, va - 0.5, va + 0.5); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
    this.arrow(ctx, hx, hy, Math.atan2(Math.sin(h.yaw), -Math.cos(h.yaw)), 11 * u, '#ffffff', '#ff4a6a');
    label('나', hx, hy + 20 * u, '#fff');
    // 나침반
    label('N ▲', S - 30 * u, 22 * u, '#ff8a9a');
  }
}

// 지도 패널 범례 HTML
export const MAP_LEGEND = [
  ['#ffffff', '나 (화살표 = 바라보는 방향)'], ['#ff4a5a', '몬스터 (노랑 = 공격 준비)'], ['#ff9a2a', '섬의 수호자'], ['#b040ff', '보스'],
  ['#8af0ff', '포탈 · 게이트'], ['#d070ff', '정령'], ['#ffb347', '각성의 비석'], ['#7ad04a', '채집물'], ['#6aff8a', 'NPC'],
];
