// 프로시저럴 3D 모델 (주인공 폴백, 무기, 곰인형 부스터, 정령, 몬스터, 채집물, 가구)
import * as THREE from 'three';
import { glowTex } from './fx.js';
import { ELEMENTS } from './data.js';

// ---------- 공용 재질 ----------
export const gradientMap = (() => {
  const d = new Uint8Array([70, 150, 220, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
const _mats = new Map();
export function toon(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (_mats.has(key)) return _mats.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap, ...o });
  _mats.set(key, m);
  return m;
}
export function glowMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
}
export function addGlow(parent, color, scale = 1, opacity = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.scale.setScalar(scale); parent.add(s);
  return s;
}

const G = {
  sph: new THREE.SphereGeometry(1, 20, 14),
  sphLo: new THREE.SphereGeometry(1, 10, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 14),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  oct: new THREE.OctahedronGeometry(1),
  ico: new THREE.IcosahedronGeometry(1, 0),
  dode: new THREE.DodecahedronGeometry(1, 0),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 28),
};
export const GEO = G;

export function part(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, parent = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = false;
  if (parent) parent.add(m);
  return m;
}

// ============================================================
//  주인공 폴백 (은발 롱헤어 소녀 · 빨강 가죽 재킷 · 검은 주름 스커트)
// ============================================================
export function buildFallbackHero() {
  const root = new THREE.Group();
  const skin = toon(0xffe2d0), red = toon(0xc8222c), redD = toon(0x8a1018), black = toon(0x1b1b24),
    silver = toon(0xe8ecf6), boot = toon(0x2a1e22), white = toon(0xffffff), eye = toon(0x3a5aa8);
  // 다리
  const mkLeg = (x) => {
    const p = new THREE.Group(); p.position.set(x, 0.86, 0); root.add(p);
    part(G.cyl, skin, 0, -0.22, 0, 0.065, 0.44, 0.065, p);
    part(G.cyl, boot, 0, -0.66, 0.01, 0.078, 0.4, 0.085, p);
    part(G.box, boot, 0, -0.84, 0.05, 0.14, 0.06, 0.24, p);
    return p;
  };
  const legL = mkLeg(0.1), legR = mkLeg(-0.1);
  // 주름 스커트
  const skirtGeo = new THREE.CylinderGeometry(0.19, 0.38, 0.34, 12, 1, true);
  const skirt = part(skirtGeo, toon(0x1b1b24, { side: THREE.DoubleSide, flatShading: true }), 0, 0.84, 0);
  root.add(skirt);
  // 몸통 (재킷)
  const torso = part(G.cyl, red, 0, 1.2, 0, 0.18, 0.44, 0.15, root);
  torso.scale.set(0.18, 0.44, 0.15);
  part(G.box, white, 0, 1.27, 0.12, 0.1, 0.22, 0.04, root); // 이너 셔츠
  part(G.box, redD, 0.07, 1.27, 0.135, 0.04, 0.26, 0.03, root); // 라펠
  part(G.box, redD, -0.07, 1.27, 0.135, 0.04, 0.26, 0.03, root);
  part(G.cyl, black, 0, 1.0, 0, 0.19, 0.05, 0.16, root); // 벨트
  // 팔 (피벗: 어깨)
  const mkArm = (x) => {
    const p = new THREE.Group(); p.position.set(x, 1.38, 0); root.add(p);
    p.rotation.order = 'YXZ';
    part(G.sph, red, 0, 0, 0, 0.085, 0.085, 0.085, p);
    part(G.cyl, red, 0, -0.18, 0, 0.06, 0.34, 0.06, p);
    part(G.cyl, redD, 0, -0.37, 0, 0.065, 0.06, 0.065, p);
    part(G.sph, skin, 0, -0.45, 0, 0.05, 0.06, 0.05, p);
    return p;
  };
  const armL = mkArm(0.25), armR = mkArm(-0.25);
  // 머리
  const head = new THREE.Group(); head.position.set(0, 1.66, 0); root.add(head);
  part(G.sph, skin, 0, 0, 0, 0.19, 0.2, 0.18, head);
  part(G.sph, eye, 0.068, 0.0, 0.155, 0.035, 0.05, 0.02, head);
  part(G.sph, eye, -0.068, 0.0, 0.155, 0.035, 0.05, 0.02, head);
  part(G.sph, white, 0.075, 0.015, 0.168, 0.012, 0.016, 0.01, head);
  part(G.sph, white, -0.061, 0.015, 0.168, 0.012, 0.016, 0.01, head);
  // 은발
  part(G.sph, silver, 0, 0.05, -0.02, 0.215, 0.21, 0.205, head);
  part(G.box, silver, 0, 0.13, 0.13, 0.34, 0.1, 0.08, head);        // 앞머리
  part(G.box, silver, 0.15, -0.08, 0.06, 0.07, 0.26, 0.12, head);   // 옆머리
  part(G.box, silver, -0.15, -0.08, 0.06, 0.07, 0.26, 0.12, head);
  const longHair = part(new THREE.CylinderGeometry(0.2, 0.12, 0.9, 8), silver, 0, -0.45, -0.13, 1, 1, 0.45, head);
  longHair.rotation.x = 0.12;
  part(G.cone, silver, 0.03, 0.27, 0.02, 0.025, 0.12, 0.025, head).rotation.z = -0.5; // 아호게
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, legL, legR, armL, armR, head, longHair };
}

// ---------- 곰인형 로켓 부스터 ----------
export function buildBearBooster() {
  const g = new THREE.Group();
  const white = toon(0xf8f5f0), pink = toon(0xffb0c4), dark = toon(0x2a2230), metal = toon(0x8a93a6);
  part(G.sph, white, 0, 0, 0, 0.24, 0.27, 0.19, g);              // 몸
  part(G.sph, white, 0, 0.33, -0.02, 0.2, 0.18, 0.17, g);         // 머리
  part(G.sph, white, 0.14, 0.48, -0.02, 0.07, 0.07, 0.05, g);     // 귀
  part(G.sph, white, -0.14, 0.48, -0.02, 0.07, 0.07, 0.05, g);
  part(G.sph, pink, 0.14, 0.48, -0.06, 0.04, 0.04, 0.02, g);
  part(G.sph, pink, -0.14, 0.48, -0.06, 0.04, 0.04, 0.02, g);
  part(G.sph, white, 0, 0.29, -0.17, 0.08, 0.06, 0.05, g);        // 주둥이
  part(G.sph, dark, 0, 0.31, -0.215, 0.03, 0.022, 0.02, g);       // 코
  part(G.sph, dark, 0.065, 0.37, -0.165, 0.022, 0.028, 0.015, g); // 눈
  part(G.sph, dark, -0.065, 0.37, -0.165, 0.022, 0.028, 0.015, g);
  part(G.sph, pink, 0, 0.0, -0.16, 0.1, 0.12, 0.04, g);           // 배
  part(G.sph, white, 0.23, 0.04, -0.04, 0.07, 0.09, 0.07, g);     // 팔
  part(G.sph, white, -0.23, 0.04, -0.04, 0.07, 0.09, 0.07, g);
  part(G.box, toon(0x5a3a2a), 0, 0.05, 0.17, 0.32, 0.06, 0.03, g); // 하네스
  const flames = [];
  // 플라즈마 불꽃 3겹: 바깥(파랑, 강화 색) · 중간(하늘빛) · 코어(백색) + 노즐 글로우
  const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flameMat = add(0x2a7cff, 0.75), midMat = add(0x6fe0ff, 0.85), coreMat = add(0xffffff, 0.95);
  const glows = [];
  for (const x of [0.12, -0.12]) {
    part(G.cyl, metal, x, -0.27, 0.05, 0.065, 0.16, 0.065, g);
    part(G.cyl, dark, x, -0.36, 0.05, 0.075, 0.04, 0.075, g);
    part(G.torus, glowMat(0x7fe8ff), x, -0.385, 0.05, 0.062, 0.062, 0.062, g).rotation.x = Math.PI / 2;   // 노즐 링
    const f = new THREE.Group(); f.position.set(x, -0.38, 0.05); g.add(f);
    for (const [mat, w, len] of [[flameMat, 0.085, 0.56], [midMat, 0.055, 0.4], [coreMat, 0.03, 0.24]]) {
      const c = new THREE.Mesh(G.cone, mat); c.rotation.x = Math.PI; c.scale.set(w, len, w); c.position.y = -len / 2; c.castShadow = false; f.add(c);
    }
    const gl = addGlow(g, 0x6fd8ff, 0.5, 0.8); gl.position.set(x, -0.42, 0.05); glows.push(gl);
    flames.push(f);
  }
  return { group: g, flames, flameMat, midMat, glows };
}

// ---------- 검 ----------
export function buildSword() {
  const g = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  part(G.cyl, toon(0x3a2a2a), 0, 0, 0, 0.03, 0.22, 0.03, g);
  part(G.box, toon(0xd8b050), 0, 0.12, 0, 0.24, 0.04, 0.06, g);
  part(G.box, toon(0xeef2ff), 0, 0.78, 0, 0.07, 1.25, 0.018, g);
  part(G.cone4, toon(0xeef2ff), 0, 1.47, 0, 0.05, 0.14, 0.013, g).rotation.y = Math.PI / 4;
  const edge = new THREE.Mesh(G.box, glow); edge.position.set(0, 0.8, 0); edge.scale.set(0.12, 1.32, 0.03); g.add(edge);
  part(G.sph, toon(0xd8b050), 0, -0.13, 0, 0.04, 0.04, 0.04, g);
  return { group: g, glow };
}

// ---------- 권총 ----------
export function buildGun() {
  const g = new THREE.Group();
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  part(G.box, toon(0x2a2a34), 0, 0.04, 0.08, 0.07, 0.1, 0.32, g);
  part(G.box, toon(0x5a3a2a), 0, -0.06, 0.0, 0.06, 0.16, 0.08, g).rotation.x = -0.3;
  part(G.cyl, toon(0x9aa0b0), 0, 0.06, 0.28, 0.025, 0.12, 0.025, g).rotation.x = Math.PI / 2;
  const stripe = new THREE.Mesh(G.box, glow); stripe.position.set(0, 0.095, 0.08); stripe.scale.set(0.075, 0.015, 0.26); g.add(stripe);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.06, 0.36); g.add(muzzle);
  return { group: g, glow, muzzle };
}

// ============================================================
//  정령
// ============================================================
export function buildSpirit(el) {
  const d = ELEMENTS[el];
  const g = new THREE.Group();
  const core = new THREE.Group(); g.add(core);
  const bm = glowMat(d.color);
  const eye = toon(0x1a1a2a);
  switch (el) {
    case 'fire':
      part(G.sph, bm, 0, 0, 0, 0.17, 0.17, 0.17, core);
      part(G.cone, glowMat(0xffc040), 0, 0.2, -0.02, 0.12, 0.3, 0.12, core);
      break;
    case 'wind':
      part(G.sph, bm, 0, 0, 0, 0.15, 0.15, 0.15, core);
      { const t = part(G.torus, glowMat(0xc0fff0), 0, 0, 0, 0.26, 0.26, 0.26, core); t.rotation.x = Math.PI / 2.3; }
      break;
    case 'water':
      part(G.sph, bm, 0, 0, 0, 0.17, 0.17, 0.17, core);
      part(G.cone, bm, 0, 0.19, 0, 0.12, 0.2, 0.12, core);
      break;
    case 'thunder':
      part(G.oct, bm, 0, 0, 0, 0.2, 0.26, 0.2, core);
      break;
    case 'earth':
      part(G.dode, toon(0xa87a4a), 0, 0, 0, 0.19, 0.19, 0.19, core);
      part(G.oct, glowMat(0x9aff7a), 0, 0.22, 0, 0.06, 0.1, 0.06, core);
      break;
    case 'light':
      part(G.oct, glowMat(0xffffff), 0, 0, 0, 0.16, 0.24, 0.16, core);
      { const t = part(G.torus, glowMat(0xffe880), 0, 0.3, 0, 0.12, 0.12, 0.12, core); t.rotation.x = Math.PI / 2; }
      break;
    case 'dark':
      part(G.sph, toon(0x2a1840), 0, 0, 0, 0.17, 0.17, 0.17, core);
      part(G.cone, toon(0x2a1840), 0.1, 0.17, 0, 0.05, 0.14, 0.05, core).rotation.z = -0.3;
      part(G.cone, toon(0x2a1840), -0.1, 0.17, 0, 0.05, 0.14, 0.05, core).rotation.z = 0.3;
      break;
  }
  const eyeCol = el === 'dark' ? glowMat(0xd080ff) : eye;
  part(G.sph, eyeCol, 0.06, 0.02, 0.15, 0.025, 0.035, 0.02, core);
  part(G.sph, eyeCol, -0.06, 0.02, 0.15, 0.025, 0.035, 0.02, core);
  addGlow(g, d.color, 1.1, 0.75);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, core };
}

// ============================================================
//  몬스터
// ============================================================
export function buildEnemy(def) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const r = { root, body, flaps: [] };
  const c = def.color;
  const col = toon(c), colD = toon(new THREE.Color(c).multiplyScalar(0.6).getHex());
  const dark = toon(0x1a1a22), red = glowMat(0xff3040);
  switch (def.shape) {
    case 'slime': {
      const m = new THREE.MeshToonMaterial({ color: c, gradientMap, transparent: true, opacity: 0.88 });
      part(G.sph, m, 0, 0.42, 0, 0.55, 0.45, 0.55, body);
      part(G.sph, toon(0xffffff), 0, 0.5, 0, 0.3, 0.25, 0.3, body).material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
      part(G.sph, dark, 0.15, 0.55, 0.45, 0.06, 0.09, 0.04, body);
      part(G.sph, dark, -0.15, 0.55, 0.45, 0.06, 0.09, 0.04, body);
      if (def.elite) part(G.cone, toon(0xffd040), 0, 0.98, 0, 0.22, 0.3, 0.22, body);
      break;
    }
    case 'beast': {
      part(G.box, col, 0, 0.6, 0, 0.45, 0.42, 0.85, body);
      part(G.box, col, 0, 0.82, 0.5, 0.36, 0.34, 0.36, body);
      part(G.box, colD, 0, 0.74, 0.74, 0.2, 0.16, 0.2, body);
      part(G.cone4, colD, 0.12, 1.06, 0.46, 0.07, 0.16, 0.07, body);
      part(G.cone4, colD, -0.12, 1.06, 0.46, 0.07, 0.16, 0.07, body);
      part(G.sph, red, 0.1, 0.88, 0.68, 0.03, 0.03, 0.02, body);
      part(G.sph, red, -0.1, 0.88, 0.68, 0.03, 0.03, 0.02, body);
      for (const [x, z] of [[0.15, 0.3], [-0.15, 0.3], [0.15, -0.3], [-0.15, -0.3]]) part(G.box, colD, x, 0.2, z, 0.1, 0.4, 0.1, body);
      part(G.box, col, 0, 0.75, -0.55, 0.1, 0.1, 0.4, body).rotation.x = 0.6;
      break;
    }
    case 'golem': {
      part(G.box, colD, 0, 0.9, 0, 0.9, 0.8, 0.6, body);
      part(G.box, colD, 0, 1.5, 0.05, 0.45, 0.4, 0.4, body);
      part(G.sph, glowMat(0x80ffff), 0.1, 1.52, 0.26, 0.05, 0.04, 0.02, body);
      part(G.sph, glowMat(0x80ffff), -0.1, 1.52, 0.26, 0.05, 0.04, 0.02, body);
      part(G.box, colD, 0.6, 0.75, 0, 0.3, 0.8, 0.3, body);
      part(G.box, colD, -0.6, 0.75, 0, 0.3, 0.8, 0.3, body);
      part(G.box, colD, 0.25, 0.25, 0, 0.3, 0.5, 0.3, body);
      part(G.box, colD, -0.25, 0.25, 0, 0.3, 0.5, 0.3, body);
      const cm = glowMat(c);
      part(G.oct, cm, 0.25, 1.45, -0.2, 0.12, 0.35, 0.12, body).rotation.z = -0.4;
      part(G.oct, cm, -0.2, 1.4, -0.25, 0.1, 0.3, 0.1, body).rotation.z = 0.5;
      part(G.oct, cm, 0, 1.75, 0, 0.1, 0.3, 0.1, body);
      if (def.elite) part(G.oct, glowMat(0xffffff), 0, 2.0, 0, 0.12, 0.4, 0.12, body);
      break;
    }
    case 'bat': {
      part(G.sph, col, 0, 0, 0, 0.3, 0.3, 0.3, body);
      part(G.sph, red, 0.1, 0.05, 0.26, 0.04, 0.04, 0.02, body);
      part(G.sph, red, -0.1, 0.05, 0.26, 0.04, 0.04, 0.02, body);
      part(G.cone4, col, 0.15, 0.3, 0, 0.06, 0.18, 0.06, body);
      part(G.cone4, col, -0.15, 0.3, 0, 0.06, 0.18, 0.06, body);
      for (const s of [1, -1]) {
        const w = new THREE.Group(); w.position.set(0.25 * s, 0.05, 0); body.add(w);
        part(G.box, colD, 0.35 * s, 0, 0, 0.7, 0.03, 0.45, w);
        part(G.oct, glowMat(0xd0a0ff), 0.6 * s, 0.03, 0, 0.06, 0.06, 0.06, w);
        w.userData.side = s; r.flaps.push(w);
      }
      break;
    }
    case 'wraith': {
      const m = new THREE.MeshToonMaterial({ color: c, gradientMap, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
      part(new THREE.ConeGeometry(0.5, 1.5, 12, 1, true), m, 0, 0.6, 0, 1, 1, 1, body).rotation.x = Math.PI;
      part(G.sph, m, 0, 1.45, 0, 0.32, 0.36, 0.32, body);
      part(G.sph, dark, 0, 1.43, 0.12, 0.25, 0.25, 0.22, body);
      part(G.sph, glowMat(0x80d0ff), 0.09, 1.45, 0.3, 0.04, 0.05, 0.02, body);
      part(G.sph, glowMat(0x80d0ff), -0.09, 1.45, 0.3, 0.04, 0.05, 0.02, body);
      for (const s of [1, -1]) {
        const w = new THREE.Group(); w.position.set(0.4 * s, 1.1, 0.1); body.add(w);
        part(G.cone, m, 0, -0.25, 0, 0.1, 0.5, 0.1, w);
        w.userData.side = s; r.flaps.push(w);
      }
      addGlow(body, 0xa0c0ff, 1.8, 0.35).position.y = 1.2;
      break;
    }
    case 'knight': {
      const armor = def.elite ? toon(0xe8e0ff) : col;
      const trim = def.elite ? toon(0x2a1a3a) : toon(0xb08a3a);
      part(G.box, armor, 0, 1.05, 0, 0.62, 0.6, 0.4, body);
      part(G.box, trim, 0, 0.72, 0, 0.66, 0.1, 0.44, body);
      part(G.cyl, dark, 0, 0.55, 0, 0.32, 0.3, 0.26, body);
      part(G.box, armor, 0.16, 0.25, 0, 0.18, 0.5, 0.2, body);
      part(G.box, armor, -0.16, 0.25, 0, 0.18, 0.5, 0.2, body);
      part(G.box, armor, 0, 1.6, 0, 0.36, 0.4, 0.38, body);
      part(G.box, dark, 0, 1.6, 0.18, 0.28, 0.06, 0.04, body);
      part(G.sph, def.elite ? glowMat(0xffe080) : red, 0.07, 1.6, 0.2, 0.035, 0.02, 0.02, body);
      part(G.sph, def.elite ? glowMat(0xffe080) : red, -0.07, 1.6, 0.2, 0.035, 0.02, 0.02, body);
      part(G.cone, trim, 0, 1.92, 0, 0.06, 0.3, 0.06, body);
      part(G.sph, armor, 0.42, 1.25, 0, 0.18, 0.15, 0.2, body);
      part(G.sph, armor, -0.42, 1.25, 0, 0.18, 0.15, 0.2, body);
      const sw = new THREE.Group(); sw.position.set(0.48, 0.95, 0.2); body.add(sw);
      part(G.box, def.elite ? glowMat(0xfff0c0) : toon(0x8a80a0), 0, 0, 0.55, 0.08, 0.08, 1.2, sw);
      r.weapon = sw;
      if (def.elite) {
        // 빛/어둠 쌍날개
        for (const s of [1, -1]) {
          const w = new THREE.Group(); w.position.set(0.3 * s, 1.3, -0.25); body.add(w);
          part(G.box, glowMat(s > 0 ? 0xfff0b0 : 0x8a40ff, 0.8), 0.5 * s, 0.2, -0.1, 0.9, 0.06, 0.35, w).rotation.z = 0.5 * s;
          w.userData.side = s; r.flaps.push(w);
        }
      }
      break;
    }
    case 'dragon': {
      const scale = toon(0x3a1a5a), belly = toon(0x7a4a8a), glowP = glowMat(0xc060ff);
      part(G.sph, scale, 0, 1.4, 0, 0.9, 0.75, 1.3, body);
      part(G.sph, belly, 0, 1.15, 0.3, 0.7, 0.55, 0.9, body);
      const neck = part(G.cyl, scale, 0, 2.1, 1.1, 0.32, 1.2, 0.32, body); neck.rotation.x = 0.8;
      const head = new THREE.Group(); head.position.set(0, 2.55, 1.65); body.add(head); r.head = head;
      part(G.box, scale, 0, 0, 0.2, 0.55, 0.42, 0.8, head);
      part(G.box, scale, 0, -0.15, 0.6, 0.4, 0.2, 0.5, head);
      part(G.sph, glowMat(0xff60ff), 0.2, 0.12, 0.45, 0.07, 0.05, 0.05, head);
      part(G.sph, glowMat(0xff60ff), -0.2, 0.12, 0.45, 0.07, 0.05, 0.05, head);
      part(G.cone, toon(0xe0d0c0), 0.18, 0.35, -0.1, 0.06, 0.5, 0.06, head).rotation.x = -0.7;
      part(G.cone, toon(0xe0d0c0), -0.18, 0.35, -0.1, 0.06, 0.5, 0.06, head).rotation.x = -0.7;
      for (const s of [1, -1]) {
        const w = new THREE.Group(); w.position.set(0.6 * s, 1.9, -0.1); body.add(w);
        part(G.box, toon(0x2a103a), 1.3 * s, 0.1, 0, 2.6, 0.06, 1.2, w);
        part(G.box, glowP, 1.3 * s, 0.14, 0.3, 2.4, 0.02, 0.06, w);
        w.userData.side = s; r.flaps.push(w);
      }
      const tail = part(G.cone, scale, 0, 1.1, -1.9, 0.35, 1.8, 0.35, body); tail.rotation.x = -Math.PI / 2 - 0.2;
      for (const [x, z] of [[0.55, 0.6], [-0.55, 0.6], [0.55, -0.6], [-0.55, -0.6]]) part(G.cyl, scale, x, 0.4, z, 0.2, 0.8, 0.2, body);
      for (let i = 0; i < 5; i++) part(G.cone4, glowP, 0, 2.05 - i * 0.05, 0.6 - i * 0.5, 0.08, 0.35, 0.08, body);
      addGlow(body, 0x9a40ff, 6, 0.25).position.y = 1.5;
      break;
    }
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return r;
}

// HP 바 (빌보드)
const hpGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
export function buildHpBar(width = 1.2, color = 0xff4a5a) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(hpGeo, new THREE.MeshBasicMaterial({ color: 0x101018, transparent: true, opacity: 0.7, depthTest: false }));
  bg.scale.set(width + 0.06, 0.16, 1); bg.position.x = -(width + 0.06) / 2; bg.renderOrder = 10;
  const fill = new THREE.Mesh(hpGeo, new THREE.MeshBasicMaterial({ color, depthTest: false }));
  fill.scale.set(width, 0.1, 1); fill.position.set(-width / 2, 0, 0.001); fill.renderOrder = 11;
  g.add(bg, fill);
  return { group: g, fill, width };
}

// ============================================================
//  채집 오브젝트
// ============================================================
export function buildNode(type) {
  const g = new THREE.Group();
  if (type === 'tree') {
    // 열매가 달린 채집용 판타지 나무 (2~3단 풍성한 잎)
    const bark = toon(0x8a5a34), l1 = toon(0x3f8f3e), l2 = toon(0x58ae4c), l3 = toon(0x78c860);
    const trunk = part(new THREE.CylinderGeometry(0.2, 0.34, 2.4, 8), bark, 0, 1.2, 0, 1, 1, 1, g);
    trunk.rotation.z = 0.04;
    for (const [a, rz] of [[0.4, 0.8], [2.6, 0.7], [4.5, 0.9]]) {
      const br = part(new THREE.CylinderGeometry(0.05, 0.1, 1.0, 5).translate(0, 0.5, 0), bark, 0, 1.8, 0, 1, 1, 1, g);
      br.rotation.set(0, a, rz);
    }
    for (const [x, y, z, s, m] of [[0, 2.6, 0, 1.35, l1], [0.9, 2.4, 0.3, 0.95, l1], [-0.85, 2.45, -0.3, 0.9, l1], [0.1, 2.35, 0.9, 0.85, l1],
      [0.1, 3.4, 0.05, 1.05, l2], [0.6, 3.25, -0.45, 0.7, l2], [-0.55, 3.3, 0.4, 0.7, l2], [0, 4.15, 0, 0.65, l3]]) {
      part(new THREE.IcosahedronGeometry(1, 1), m, x, y, z, s, s * 0.85, s, g);
    }
    const fruit = glowMat(0xff5a4a);
    for (let i = 0; i < 7; i++) { const a = i * 0.9; part(G.sph, fruit, Math.cos(a) * 1.05, 2.3 + (i % 3) * 0.55, Math.sin(a) * 1.05, 0.11, 0.11, 0.11, g); }
  } else if (type === 'ore') {
    part(G.dode, toon(0x7a7a84, { flatShading: true }), 0, 0.5, 0, 0.8, 0.65, 0.75, g);
    part(G.dode, toon(0x6a6a74, { flatShading: true }), 0.5, 0.3, 0.3, 0.45, 0.4, 0.4, g);
    for (let i = 0; i < 5; i++) part(G.oct, toon(0xc8d0dc), Math.cos(i * 1.3) * 0.6, 0.5 + (i % 2) * 0.3, Math.sin(i * 1.3) * 0.55, 0.1, 0.1, 0.1, g);
  } else if (type === 'crystal' || type === 'spiritOre') {
    const c = type === 'crystal' ? 0x4ad8ff : 0xd070ff;
    part(G.dode, toon(0x4a4a5a, { flatShading: true }), 0, 0.2, 0, 0.6, 0.3, 0.6, g);
    const cm = new THREE.MeshToonMaterial({ color: c, gradientMap, emissive: c, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 });
    const spikes = [[0, 0.9, 0, 0.22, 0.9, 0], [0.35, 0.6, 0.1, 0.14, 0.6, -0.5], [-0.3, 0.6, 0.15, 0.15, 0.6, 0.5], [0.05, 0.55, -0.35, 0.12, 0.5, 0.4]];
    for (const [x, y, z, w, h, rz] of spikes) { const s = part(G.oct, cm, x, y, z, w, h, w, g); s.rotation.z = rz; }
    addGlow(g, c, 2.2, 0.45).position.y = 0.8;
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ============================================================
//  하우징 가구
// ============================================================
export function buildFurniture(type) {
  const g = new THREE.Group();
  const wood = toon(0xb07a48), woodD = toon(0x7a4a28), iron = toon(0x8a92a0), white = toon(0xfaf6f0);
  switch (type) {
    case 'bed':
      part(G.box, woodD, 0, 0.3, 0, 1.4, 0.4, 2.3, g);
      part(G.box, white, 0, 0.58, 0.05, 1.3, 0.18, 2.1, g);
      part(G.box, toon(0xff8aa8), 0, 0.68, -0.2, 1.32, 0.08, 1.4, g);
      part(G.box, white, 0, 0.75, 0.8, 0.8, 0.16, 0.36, g);
      part(G.box, woodD, 0, 0.75, 1.15, 1.4, 0.95, 0.12, g);
      break;
    case 'rack':
      part(G.box, woodD, 0, 0.1, 0, 1.6, 0.2, 0.5, g);
      part(G.box, wood, 0.7, 0.9, 0, 0.12, 1.6, 0.12, g);
      part(G.box, wood, -0.7, 0.9, 0, 0.12, 1.6, 0.12, g);
      part(G.box, wood, 0, 1.2, 0, 1.5, 0.08, 0.1, g);
      part(G.box, wood, 0, 0.7, 0, 1.5, 0.08, 0.1, g);
      for (const x of [-0.4, 0, 0.4]) {
        part(G.box, toon(0xe8eef8), x, 1.1, 0.1, 0.06, 1.3, 0.02, g);
        part(G.box, toon(0xd8b050), x, 0.5, 0.1, 0.22, 0.04, 0.05, g);
      }
      break;
    case 'altar': {
      part(G.cyl, toon(0xd8d0c8), 0, 0.2, 0, 1.6, 0.4, 1.6, g);
      part(G.cyl, toon(0xe8e0d8), 0, 0.55, 0, 1.0, 0.3, 1.0, g);
      const colors = [0xff5a2a, 0x5dffb0, 0x3aa8ff, 0xffe14a, 0xc08a4a, 0xfff6c0, 0x9a4dff];
      colors.forEach((c, i) => {
        const a = (i / 7) * Math.PI * 2;
        part(G.cyl, toon(0xd8d0c8), Math.cos(a) * 1.35, 0.7, Math.sin(a) * 1.35, 0.12, 1.0, 0.12, g);
        part(G.oct, glowMat(c), Math.cos(a) * 1.35, 1.35, Math.sin(a) * 1.35, 0.14, 0.2, 0.14, g);
      });
      const orb = part(G.sph, glowMat(0xffffff), 0, 1.2, 0, 0.3, 0.3, 0.3, g);
      orb.userData.spin = true;
      addGlow(g, 0xffffff, 2.5, 0.6).position.y = 1.2;
      break;
    }
    case 'training':
      part(G.cyl, toon(0xd8c090), 0, 0.05, 0, 2.2, 0.1, 2.2, g);
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1;
        const d = new THREE.Group(); d.position.set(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3); g.add(d);
        part(G.cyl, wood, 0, 0.6, 0, 0.08, 1.2, 0.08, d);
        part(G.cyl, toon(0xe8d8a8), 0, 1.0, 0, 0.3, 0.6, 0.3, d);
        part(G.sph, toon(0xe8d8a8), 0, 1.45, 0, 0.22, 0.22, 0.22, d);
      }
      part(G.cyl, toon(0xffffff), 0, 1.0, 0, 0.5, 0.06, 0.5, g).rotation.x = Math.PI / 2;
      part(G.cyl, toon(0xff3a3a), 0, 1.0, 0.01, 0.35, 0.065, 0.35, g).rotation.x = Math.PI / 2;
      part(G.cyl, wood, 0, 0.5, -0.05, 0.06, 1.0, 0.06, g);
      break;
    case 'lamp':
      part(G.cyl, toon(0x2a2a34), 0, 0.1, 0, 0.3, 0.2, 0.3, g);
      part(G.cyl, toon(0x2a2a34), 0, 1.4, 0, 0.06, 2.6, 0.06, g);
      part(G.box, toon(0x2a2a34), 0, 2.75, 0, 0.45, 0.06, 0.45, g);
      part(G.box, glowMat(0xffd080), 0, 2.55, 0, 0.32, 0.35, 0.32, g);
      part(G.cone4, toon(0x2a2a34), 0, 2.9, 0, 0.34, 0.25, 0.34, g).rotation.y = Math.PI / 4;
      addGlow(g, 0xffc060, 3.2, 0.7).position.y = 2.55;
      break;
    case 'flower': {
      part(G.cyl, toon(0x6a4a2a), 0, 0.1, 0, 1.2, 0.2, 1.2, g);
      part(G.cyl, toon(0x5aa040), 0, 0.22, 0, 1.1, 0.05, 1.1, g);
      const fc = [0xff6a8a, 0xffd040, 0xffffff, 0xb07aff, 0xff9a4a];
      for (let i = 0; i < 16; i++) {
        const a = i * 2.4, rr = 0.2 + (i % 4) * 0.22;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        part(G.cyl, toon(0x3a8a3a), x, 0.38, z, 0.02, 0.3, 0.02, g);
        part(G.sph, toon(fc[i % 5]), x, 0.55, z, 0.1, 0.07, 0.1, g);
      }
      break;
    }
    case 'forge':
      part(G.box, toon(0x4a4a54), 0, 0.45, 0, 1.6, 0.9, 1.0, g);
      part(G.box, toon(0x2a2a30), 0, 0.95, 0, 1.7, 0.1, 1.1, g);
      part(G.box, iron, 0.3, 1.15, 0, 0.6, 0.3, 0.3, g);
      part(G.box, iron, 0.3, 1.32, 0, 0.8, 0.06, 0.3, g);
      part(G.box, glowMat(0xff6a20), -0.45, 0.45, 0.51, 0.5, 0.35, 0.02, g);
      addGlow(g, 0xff7a30, 1.6, 0.7).position.set(-0.45, 0.5, 0.6);
      part(G.cyl, woodD, -0.4, 1.1, 0.1, 0.03, 0.4, 0.03, g).rotation.z = 0.8;
      part(G.box, iron, -0.55, 1.22, 0.1, 0.18, 0.1, 0.1, g);
      break;
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// 게이트 포탈
export function buildGate(color = 0x8af0ff) {
  const g = new THREE.Group();
  const stone = toon(0xd8d0e0);
  part(G.box, stone, 2.0, 1.8, 0, 0.5, 3.6, 0.6, g);
  part(G.box, stone, -2.0, 1.8, 0, 0.5, 3.6, 0.6, g);
  part(G.box, stone, 0, 3.8, 0, 4.8, 0.5, 0.7, g);
  part(G.cone4, stone, 0, 4.4, 0, 0.6, 0.8, 0.4, g).rotation.y = Math.PI / 4;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), mat);
  disc.position.y = 1.85; disc.scale.y = 1.05; g.add(disc);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 6, 40), mat);
  swirl.position.y = 1.85; g.add(swirl);
  const glow = addGlow(g, color, 5, 0.5); glow.position.y = 1.85;
  return { group: g, mat, disc, swirl, glow };
}

// 상인 노점 (NPC 소품)
export function buildStall() {
  const g = new THREE.Group();
  const wood = toon(0xb07a48), woodD = toon(0x7a4a28), pink = toon(0xff8aa8), cream = toon(0xfff2e6);
  part(G.box, wood, 0, 0.5, 0, 2.6, 1.0, 0.9, g);
  part(G.box, woodD, 0, 1.02, 0, 2.8, 0.08, 1.0, g);
  for (const [x, z] of [[-1.3, -0.4], [1.3, -0.4], [-1.3, 0.4], [1.3, 0.4]]) part(G.box, woodD, x, 1.25, z, 0.1, 2.5, 0.1, g);
  for (let i = 0; i < 7; i++) {
    const s = part(G.box, i % 2 ? cream : pink, -1.2 + i * 0.4, 2.55, 0.05, 0.4, 0.06, 1.4, g);
    s.rotation.x = 0.25;
  }
  const fruit = [0xff5a4a, 0xffd040, 0x7ad04a, 0xff9a3a];
  for (let i = 0; i < 12; i++) part(G.sph, toon(fruit[i % 4]), -1.0 + (i % 6) * 0.4, 1.15, -0.2 + Math.floor(i / 6) * 0.35, 0.12, 0.12, 0.12, g);
  part(G.box, toon(0xc8a070), 1.7, 0.3, 0.3, 0.6, 0.6, 0.6, g);
  part(G.box, toon(0xc8a070), 1.75, 0.85, 0.3, 0.45, 0.45, 0.45, g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
