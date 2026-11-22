// ============================================================
//  코디 시스템: 의상·헤어 실시간 머티리얼 염색 + 3D 파츠 착탈 (등 · 머리 · 무기 · 오라)
//  - 파츠는 hero.js 가 만들어 둔 "슬롯" 그룹(rig.booster.group / rig.sword.group / rig.headSlot / rig.auraSlot)의
//    자식만 교체한다 → 뼈대 부착 위치·VRM0 방향 보정은 슬롯이 이미 갖고 있으므로 파츠는 캐릭터 기준 좌표(+Z 정면)로만 만든다.
//  - 게임 로직이 쓰는 인터페이스(booster.flames/flameMat/glows, sword.glow, gun.muzzle)는 그대로 유지
// ============================================================
import * as THREE from 'three';
import * as U from './units.js';
import { FX } from './fx.js';

const { GEO: G, part, toon, glowMat, addGlow } = U;

// ---------------- 염색 프리셋 6종 ----------------
// cloth/hair: 곱해지는 틴트 색 (null = 원본) · lift: 텍스처를 밝히는 발광 리프트 (흰색·금색 계열) · glow: 은은한 자체 발광
export const DYE_ORDER = ['default', 'blackSuit', 'whiteAngel', 'crimson', 'cyberBlue', 'gold'];
export const DYES = {
  default:    { name: '기본',       css: 'linear-gradient(135deg,#fff,#ffd6e6)', cloth: null, hair: null },
  blackSuit:  { name: '블랙슈트',   css: '#2a2a36', cloth: 0x34343f, hair: 0x3a3542, clothLift: 0, hairLift: 0 },
  whiteAngel: { name: '화이트엔젤', css: '#f4f2ff', cloth: 0xffffff, hair: 0xfff8ff, clothLift: 0.4, hairLift: 0.34 },
  crimson:    { name: '크림슨',     css: '#d0283a', cloth: 0xe0303f, hair: 0xc82434, clothLift: 0.05, hairLift: 0.04 },
  cyberBlue:  { name: '사이버블루', css: '#2a8cff', cloth: 0x3a90ff, hair: 0x5ae0ff, clothLift: 0.1, hairLift: 0.16, glow: 0x2a8cff },
  gold:       { name: '골드',       css: '#ffc340', cloth: 0xffc848, hair: 0xffe38a, clothLift: 0.2, hairLift: 0.16 },
};

// ---------------- 파츠 목록 ----------------
export const PART_SLOTS = {
  back:   { name: '등',   icon: 'rocket',   order: ['bear', 'rocket', 'wings', 'none'],
    opts: { bear: '곰인형 부스터', rocket: '로켓부스터', wings: '천사 날개', none: '없음 (노즐만)' } },
  head:   { name: '머리', icon: 'crown',    order: ['none', 'halo', 'crown', 'cat', 'ribbon'],
    opts: { none: '없음', halo: '천사 링', crown: '왕관', cat: '고양이 귀', ribbon: '큰 리본' } },
  weapon: { name: '무기', icon: 'sword',    order: ['default', 'great', 'laser', 'katana', 'hidden'],
    opts: { default: '기본 검 + 권총', great: '대검', laser: '레이저 블레이드', katana: '카타나', hidden: '숨김 (전투는 그대로)' } },
  aura:   { name: '오라', icon: 'sparkles', order: ['none', 'holy', 'flame', 'frost', 'void'],
    opts: { none: '없음', holy: '성광', flame: '화염', frost: '서리', void: '공허' } },
};
export const DEFAULT_COSMETIC = { dye: 'default', back: 'bear', head: 'none', weapon: 'default', aura: 'none' };

// ============================================================
//  염색
// ============================================================
const _c = new THREE.Color(), _t = new THREE.Color();
function matCategory(m, isVRM) {
  const n = (m.name || '').toUpperCase();
  if (n.includes('OUTLINE')) return null;                                 // 외곽선은 원래 색 유지
  if (!isVRM) return 'cloth';
  if (/HAIR/.test(n)) return 'hair';
  if (/CLOTH|TOPS|BOTTOMS|ONEPIECE|SHOES|ACCESSORY|ACCE/.test(n)) return 'cloth';
  return null;                                                            // 피부·얼굴·눈은 염색하지 않음
}
export function applyDye(rig, id) {
  const P = DYES[id] || DYES.default;
  const root = rig.vrm ? rig.vrm.scene : rig.model;
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.proxy) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.color) continue;
      const cat = matCategory(m, !!rig.vrm); if (!cat) continue;
      const u = m.userData;
      if (!u.dye0) u.dye0 = { color: m.color.clone(), shade: m.shadeColorFactor ? m.shadeColorFactor.clone() : null,
        em: m.emissive ? m.emissive.clone() : null, ei: m.emissiveIntensity ?? 1, emap: m.emissiveMap || null };
      const o0 = u.dye0, tint = P[cat], lift = (cat === 'hair' ? P.hairLift : P.clothLift) || 0;
      if (tint == null) {                                                 // 기본: 원본 복원
        m.color.copy(o0.color);
        if (o0.shade) m.shadeColorFactor.copy(o0.shade);
        if (o0.em) { m.emissive.copy(o0.em); m.emissiveIntensity = o0.ei; }
        if (m.emissiveMap !== o0.emap) { m.emissiveMap = o0.emap; m.needsUpdate = true; }
      } else {
        _t.setHex(tint);
        m.color.copy(o0.color).multiply(_t);
        if (o0.shade) m.shadeColorFactor.copy(_t).multiplyScalar(0.62);
        if (o0.em) {
          let wantMap = o0.emap;
          if (lift > 0 || P.glow) {
            // 발광 리프트: VRoid 머티리얼은 emissive 색이 0이 아닌 채 emissiveMap 으로 가려져 있는 경우가 많다
            // → 맵을 해제하고 원래 emissive 색은 버린 뒤 (틴트 × 리프트) 만 균일하게 더한다 (전신이 하얗게 타는 현상 방지)
            _c.copy(_t).multiplyScalar(lift);
            if (P.glow) _c.add(_t.setHex(P.glow).multiplyScalar(0.08));
            m.emissive.copy(_c); m.emissiveIntensity = 1; wantMap = null;
          } else { m.emissive.copy(o0.em); m.emissiveIntensity = o0.ei; }
          if (m.emissiveMap !== wantMap) { m.emissiveMap = wantMap; m.needsUpdate = true; }
        }
      }
      n++;
    }
  });
  return n;
}

// ============================================================
//  등 파츠 (모두 부스터 불꽃 인터페이스 제공 — 돌진·부양 연출은 파츠와 무관하게 동작)
// ============================================================
function addMat(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}
function addFlames(g, xs, y, z, s = 1) {
  const flameMat = addMat(0x2a7cff, 0.75), midMat = addMat(0x6fe0ff, 0.85), coreMat = addMat(0xffffff, 0.95);
  const flames = [], glows = [];
  for (const x of xs) {
    const f = new THREE.Group(); f.position.set(x, y, z); g.add(f);
    for (const [mat, w, len] of [[flameMat, 0.085, 0.56], [midMat, 0.055, 0.4], [coreMat, 0.03, 0.24]]) {
      const c = new THREE.Mesh(G.cone, mat); c.rotation.x = Math.PI; c.scale.set(w * s, len * s, w * s); c.position.y = -len * s / 2; c.castShadow = false; f.add(c);
    }
    const gl = addGlow(g, 0x6fd8ff, 0.5 * s, 0.8); gl.position.set(x, y - 0.04, z); glows.push(gl);
    flames.push(f);
  }
  return { flames, flameMat, midMat, glows };
}
function buildRocketPack() {
  const g = new THREE.Group();
  const red = toon(0xd8343f), white = toon(0xf2f2f6), metal = toon(0x8a93a6), dark = toon(0x2a2a34);
  part(G.box, dark, 0, 0.02, 0.1, 0.3, 0.4, 0.1, g);                        // 등판 · 하네스
  for (const x of [0.12, -0.12]) {
    part(G.cyl, white, x, 0.02, -0.02, 0.1, 0.5, 0.1, g);                   // 연료 탱크
    part(G.cyl, red, x, 0.13, -0.02, 0.104, 0.08, 0.104, g);                // 띠
    part(G.cone, red, x, 0.36, -0.02, 0.1, 0.18, 0.1, g);                   // 노즈콘
    part(G.box, red, x * 1.85, -0.12, -0.02, 0.02, 0.18, 0.12, g);          // 핀
    part(G.cyl, metal, x, -0.27, -0.02, 0.075, 0.1, 0.075, g);              // 노즐
    part(G.torus, glowMat(0x7fe8ff), x, -0.325, -0.02, 0.07, 0.07, 0.07, g).rotation.x = Math.PI / 2;
  }
  part(G.box, toon(0x3a4a6a), 0, 0.2, -0.08, 0.1, 0.07, 0.04, g);
  const lamp = part(G.sph, glowMat(0x6affc0), 0, 0.2, -0.105, 0.022, 0.022, 0.01, g); lamp.castShadow = false;
  return { group: g, ...addFlames(g, [0.12, -0.12], -0.33, -0.02) };
}
function buildWings() {
  const g = new THREE.Group();
  const feather = toon(0xfbfaff), tip = toon(0xdfe8ff), edge = addMat(0xbfe6ff, 0.35);
  const wings = [];
  for (const side of [1, -1]) {
    const w = new THREE.Group(); w.position.set(0.07 * side, 0.12, -0.04); g.add(w);
    // 깃털 6장: 위쪽 바깥으로 부채꼴
    for (let i = 0; i < 6; i++) {
      const a = 0.35 + i * 0.2, len = 0.62 - i * 0.065;
      const f = new THREE.Group(); f.rotation.z = -side * (Math.PI / 2 - a); w.add(f);
      part(G.sph, i < 3 ? feather : tip, 0, len * 0.5, 0, 0.075, len * 0.5, 0.02, f);
      const e = new THREE.Mesh(G.sph, edge); e.position.y = len * 0.5; e.scale.set(0.09, len * 0.54, 0.024); e.castShadow = false; f.add(e);
    }
    w.rotation.y = side * 0.35;
    wings.push({ obj: w, side });
  }
  part(G.sph, toon(0xd8c070), 0, 0.12, -0.02, 0.06, 0.06, 0.04, g);       // 중앙 보석 장식
  const gem = part(G.oct, glowMat(0x9ae8ff), 0, 0.12, -0.06, 0.03, 0.04, 0.02, g); gem.castShadow = false;
  return { group: g, wings, ...addFlames(g, [0.045, -0.045], -0.12, 0, 0.6) };
}
function buildNozzleOnly() {
  const g = new THREE.Group();
  part(G.cyl, toon(0x5a6070), 0, -0.05, 0.08, 0.05, 0.08, 0.05, g);
  return { group: g, ...addFlames(g, [0], -0.1, 0.08, 0.7) };
}
export function buildBackPart(type) {
  if (type === 'rocket') return buildRocketPack();
  if (type === 'wings') return buildWings();
  if (type === 'none') return buildNozzleOnly();
  return U.buildBearBooster();
}

// ============================================================
//  머리 파츠 (원점 = 정수리, +Z 정면)
// ============================================================
export function buildHeadPart(type) {
  const g = new THREE.Group();
  if (type === 'halo') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 8, 40), glowMat(0xfff2a0));
    ring.rotation.x = Math.PI / 2 - 0.18; ring.position.set(0, 0.13, -0.02); ring.castShadow = false; g.add(ring);
    const gl = addGlow(g, 0xffe080, 0.5, 0.55); gl.position.copy(ring.position);
    g.userData.spin = ring;
  } else if (type === 'crown') {
    const gold = toon(0xf0c040), gem = glowMat(0xff4a8a);
    part(G.cyl, gold, 0, 0.0, 0.01, 0.085, 0.045, 0.085, g);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(G.cone4, gold, Math.sin(a) * 0.075, 0.05, 0.01 + Math.cos(a) * 0.075, 0.022, 0.06, 0.022, g);
      part(G.sph, i === 0 ? gem : glowMat(0x6ad0ff), Math.sin(a) * 0.086, 0.0, 0.01 + Math.cos(a) * 0.086, 0.014, 0.014, 0.008, g).castShadow = false;
    }
    g.rotation.x = -0.12; g.position.y = -0.01;
  } else if (type === 'cat') {
    const fur = toon(0x2a2430), pink = toon(0xffb0c8);
    for (const s of [1, -1]) {
      const e = new THREE.Group(); e.position.set(0.075 * s, -0.02, -0.01); e.rotation.z = -0.32 * s; g.add(e);
      part(G.cone4, fur, 0, 0.055, 0, 0.055, 0.11, 0.028, e).rotation.y = Math.PI / 4;
      part(G.cone4, pink, 0, 0.05, 0.012, 0.03, 0.07, 0.012, e).rotation.y = Math.PI / 4;
    }
  } else if (type === 'ribbon') {
    const red = toon(0xe8344a), dk = toon(0xb01a30);
    const r = new THREE.Group(); r.position.set(0, -0.04, -0.1); r.rotation.x = 0.35; g.add(r);
    part(G.sph, red, 0.08, 0, 0, 0.085, 0.06, 0.025, r).rotation.z = 0.3;
    part(G.sph, red, -0.08, 0, 0, 0.085, 0.06, 0.025, r).rotation.z = -0.3;
    part(G.sph, dk, 0, 0, 0, 0.032, 0.035, 0.03, r);
    part(G.box, red, 0.03, -0.08, -0.005, 0.03, 0.12, 0.008, r).rotation.z = 0.25;
    part(G.box, red, -0.03, -0.08, -0.005, 0.03, 0.12, 0.008, r).rotation.z = -0.25;
  }
  return g;
}

// ============================================================
//  무기 스킨 (검 로컬 +Y = 칼날, 원점 = 손잡이) — 권총은 총구 위치 유지를 위해 표시 여부만 바꾼다
// ============================================================
export function buildSwordSkin(type) {
  if (type === 'great') {
    const g = new THREE.Group();
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    part(G.cyl, toon(0x2a1a1a), 0, -0.02, 0, 0.035, 0.32, 0.035, g);
    part(G.box, toon(0x5a5a6a), 0, 0.17, 0, 0.34, 0.07, 0.09, g);
    part(G.box, toon(0x9aa2b8), 0, 0.95, 0, 0.15, 1.5, 0.03, g);
    part(G.cone4, toon(0x9aa2b8), 0, 1.78, 0, 0.1, 0.18, 0.022, g).rotation.y = Math.PI / 4;
    const e = new THREE.Mesh(G.box, glow); e.position.set(0, 0.97, 0); e.scale.set(0.2, 1.56, 0.04); g.add(e);
    part(G.sph, toon(0xd8b050), 0, -0.2, 0, 0.05, 0.05, 0.05, g);
    return { group: g, glow };
  }
  if (type === 'laser') {
    const g = new THREE.Group();
    const glow = new THREE.MeshBasicMaterial({ color: 0x6ae8ff, toneMapped: false });
    part(G.cyl, toon(0x2a2e3a), 0, 0, 0, 0.032, 0.26, 0.032, g);
    part(G.cyl, toon(0x9aa0b0), 0, 0.14, 0, 0.042, 0.04, 0.042, g);
    const blade = new THREE.Mesh(G.cyl, glow); blade.position.y = 0.78; blade.scale.set(0.022, 1.22, 0.022); blade.castShadow = false; g.add(blade);
    const halo = new THREE.Mesh(G.cyl, addMat(0x8ae8ff, 0.35)); halo.position.y = 0.78; halo.scale.set(0.05, 1.26, 0.05); halo.castShadow = false; g.add(halo);
    return { group: g, glow };
  }
  if (type === 'katana') {
    const g = new THREE.Group();
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    part(G.cyl, toon(0x1a1a24), 0, 0, 0, 0.026, 0.28, 0.026, g);
    part(G.cyl, toon(0xc8a040), 0, 0.15, 0, 0.07, 0.015, 0.07, g);          // 츠바
    // 살짝 휘어진 칼날: 3마디
    for (let i = 0; i < 3; i++) {
      const seg = part(G.box, toon(0xf0f4ff), 0.012 * i * i, 0.38 + i * 0.4, 0, 0.042, 0.42, 0.012, g);
      seg.rotation.z = -0.03 * i;
    }
    const e = new THREE.Mesh(G.box, glow); e.position.set(0.02, 0.8, 0); e.scale.set(0.07, 1.25, 0.02); e.rotation.z = -0.03; g.add(e);
    return { group: g, glow };
  }
  return U.buildSword();
}

// ============================================================
//  오라 (주인공 루트 기준 발밑 · 회전 링 + 빛 기둥 + 떠오르는 입자)
// ============================================================
const AURA_COL = { holy: 0xffe27a, flame: 0xff5a2a, frost: 0x6ae0ff, void: 0x9a4dff };
export function buildAura(type) {
  const g = new THREE.Group();
  const col = AURA_COL[type];
  if (!col) return { group: g, update() {} };
  const ringMat = addMat(col, 0.7), colMat = addMat(col, 0.12);
  colMat.side = THREE.DoubleSide;
  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 48).rotateX(-Math.PI / 2), ringMat); r1.position.y = 0.04; g.add(r1);
  const r2 = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.46, 6).rotateX(-Math.PI / 2), ringMat); r2.position.y = 0.05; g.add(r2);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 2.0, 24, 1, true), colMat); pillar.position.y = 1.0; g.add(pillar);
  const gl = addGlow(g, col, 1.6, 0.35); gl.position.y = 0.2;
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  let acc = 0;
  return {
    group: g,
    update(dt, t, pos, intensity = 1) {
      r1.rotation.y += dt * 0.8; r2.rotation.y -= dt * 1.4;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ringMat.opacity = (0.45 + 0.3 * pulse) * intensity;
      colMat.opacity = (0.07 + 0.06 * pulse) * intensity;
      pillar.scale.set(1 + 0.05 * pulse, 1, 1 + 0.05 * pulse);
      acc += dt * (type === 'flame' ? 14 : 8) * intensity;
      while (acc > 1) {
        acc -= 1;
        const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.4;
        _v.set(pos.x + Math.cos(a) * r, pos.y + 0.1 + Math.random() * 0.6, pos.z + Math.sin(a) * r);
        FX.burst(_v, col, 1, 0.6, type === 'frost' ? 1.0 : 0.7, { up: type === 'void' ? 1 : 2.4 });
      }
    },
  };
}
const _v = new THREE.Vector3();

// ============================================================
//  슬롯 교체 + 전체 적용
// ============================================================
function swapContent(slot, src) {
  for (const c of [...slot.children]) if (!c.userData.slotKeep) slot.remove(c);
  while (src.children.length) slot.add(src.children[0]);
  slot.traverse((o) => { if (o.isMesh && o.castShadow !== false) o.castShadow = !(o.material && o.material.blending === THREE.AdditiveBlending); });
}
export function setBack(rig, type) {
  const bb = rig.booster; if (!bb) return;
  const n = buildBackPart(type);
  swapContent(bb.group, n.group);
  bb.flames = n.flames; bb.flameMat = n.flameMat; bb.midMat = n.midMat; bb.glows = n.glows; bb.wings = n.wings || null; bb.type = type;
}
export function setWeapon(rig, type) {
  if (!rig.sword) return;
  const hidden = type === 'hidden';
  const n = buildSwordSkin(hidden ? 'default' : type);
  swapContent(rig.sword.group, n.group);
  rig.sword.glow = n.glow;
  rig.sword.group.visible = !hidden;
  if (rig.gun) rig.gun.group.visible = !hidden;
}
export function setHead(rig, type) {
  const s = rig.headSlot; if (!s) return;
  for (const c of [...s.children]) s.remove(c);
  if (type && type !== 'none') s.add(buildHeadPart(type));
}
export function setAura(rig, type) {
  const s = rig.auraSlot; if (!s) return;
  for (const c of [...s.children]) s.remove(c);
  rig.aura = buildAura(type);
  s.add(rig.aura.group);
}
export function applyCosmetics(rig, cos) {
  const c = { ...DEFAULT_COSMETIC, ...(cos || {}) };
  setBack(rig, c.back); setWeapon(rig, c.weapon); setHead(rig, c.head); setAura(rig, c.aura);
  rig.dyed = applyDye(rig, c.dye);
}
// 매 프레임: 머리 장식 흔들림 · 날개 펄럭임 · 오라
export function updateCosmetics(rig, dt, t, pos, s) {
  const hs = rig.headSlot && rig.headSlot.children[0];
  if (hs && hs.userData.spin) { hs.userData.spin.rotation.z += dt * 1.2; hs.userData.spin.position.y = 0.13 + Math.sin(t * 2.2) * 0.012; }
  const w = rig.booster && rig.booster.wings;
  if (w) {
    const amp = s.dash ? 0.15 : s.hover ? 0.55 : s.air ? 0.4 : 0.08;
    const spd = s.hover ? 9 : s.air ? 6 : 2;
    const open = s.dash ? -0.25 : s.hover || s.air ? 0.15 : 0.35;
    for (const o of w) o.obj.rotation.y = o.side * (open + Math.sin(t * spd) * amp);
  }
  if (rig.aura) rig.aura.update(dt, t, pos, s.dead ? 0 : 1);
}
