// ============================================================
//  오픈소스(CC0) 3D 모델 · 애니메이션 매니저
//  - GLB 프리로드 → 툰 셰이딩 + 림라이트 머티리얼로 변환
//  - SkeletonUtils.clone 으로 스킨드 캐릭터 인스턴싱 + AnimationMixer 상태머신
//  - 정적 소품은 InstancedMesh 로 묶어서 배치 (모바일 드로우콜 절감)
//  출처/라이선스: assets/models/CREDITS.json
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { gradientMap, addGlow, buildSword, glowMat, GEO } from './units.js';

const C = './assets/models/chars/', M = './assets/models/monsters/', P = './assets/models/props/', F = './assets/models/furniture/';

// height: 정규화 목표 키(m) · clips: 상태 → 클립명 · hide: 숨길 메시(무기 바리에이션 등)
export const DEFS = {
  // ---- 주인공 비교용 (Quaternius Ultimate Modular Women · Adventurer) ----
  hero_cc0: { url: C + 'hero_adventurer.glb', height: 1.75, rim: 0xbfe8ff,
    clips: { idle: 'Idle_Sword', idle2: 'Idle', run: 'Run', attack: 'Sword_Slash', shoot: 'Gun_Shoot', runShoot: 'Run_Shoot', dash: 'Roll', hit: 'HitRecieve', death: 'Death', cheer: 'Wave' },
    sockets: { handR: 'WristR', handL: 'WristL', back: 'Chest' } },
  // ---- 아지트 NPC ----
  npc_smith: { url: C + 'npc_blacksmith_barbarian.glb', height: 1.75, rim: 0xffc890,
    clips: { idle: 'Idle', work: '1H_Melee_Attack_Chop', cheer: 'Cheer', talk: 'Interact' },
    hide: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '2H_Axe', 'Mug'] },
  npc_spirit: { url: C + 'npc_spirit_witch.glb', height: 1.8, rim: 0xd8b0ff, clips: { idle: 'Idle', cheer: 'Wave', talk: 'Interact' } },
  npc_merchant: { url: C + 'npc_merchant_kimono.glb', height: 1.7, rim: 0xffd0e0, clips: { idle: 'Idle', cheer: 'Victory', talk: 'PickUp' } },
  // ---- 몬스터 (Quaternius Ultimate Monsters / Animals, KayKit Skeletons) ----
  slime: { url: M + 'slime_greenblob.glb', height: 1.1, rim: 0xc8ffb0, clips: { idle: 'Idle', run: 'Walk', attack: 'Bite_Front', hit: 'HitRecieve', death: 'Death' } },
  kingSlime: { url: M + 'kingslime_greenspikyblob.glb', height: 3.0, rim: 0xffe080, clips: { idle: 'Idle', run: 'Walk', attack: 'Bite_Front', slam: 'Jump', hit: 'HitRecieve', death: 'Death' } },
  wolf: { url: M + 'wolf.glb', height: 1.1, rim: 0xffd0a0, clips: { idle: 'Idle', run: 'Gallop', walk: 'Walk', attack: 'Attack', hit: 'Idle_HitReact1', death: 'Death' } },
  golem: { url: M + 'golem_goleling_evolved.glb', height: 2.0, rim: 0x8af0ff, clips: { idle: 'Flying_Idle', run: 'Fast_Flying', attack: 'Punch', attack2: 'Headbutt', hit: 'HitReact', death: 'Death' } },
  crystalKing: { url: M + 'crystalking_big_yeti.glb', height: 3.6, rim: 0x8af0ff, tint: [0x9ad8ff, 0.35],
    clips: { idle: 'Idle', run: 'Run', walk: 'Walk', attack: 'Punch', slam: 'Weapon', hit: 'HitReact', death: 'Death' } },
  bat: { url: M + 'bat.glb', height: 1.0, rim: 0xd8a0ff, clips: { idle: 'Flying', run: 'Flying', attack: 'Bite_Front', hit: 'HitRecieve', death: 'Death' } },
  wraith: { url: M + 'wraith_ghost.glb', height: 1.9, rim: 0xa0d0ff, opacity: 0.85, clips: { idle: 'Flying_Idle', run: 'Fast_Flying', attack: 'Punch', attack2: 'Headbutt', hit: 'HitReact', death: 'Death' } },
  knight: { url: M + 'knight_skeleton_warrior.glb', height: 2.0, rim: 0xb080ff, weapon: 'handslotr',
    clips: { idle: 'Idle_Combat', run: 'Running_A', attack: '1H_Melee_Attack_Chop', hit: 'Hit_A', death: 'Death_A' } },
  guardian: { url: M + 'guardian_big_demon.glb', height: 3.6, rim: 0xfff0b0, tint: [0xe8d0ff, 0.25],
    clips: { idle: 'Idle', run: 'Run', walk: 'Walk', attack: 'Punch', slam: 'Weapon', hit: 'HitReact', death: 'Death' } },
  dragon: { url: M + 'dragon_evolved.glb', height: 6.0, rim: 0xff60ff, clips: { idle: 'Flying_Idle', run: 'Fast_Flying', attack: 'Headbutt', slam: 'Punch', hit: 'HitReact', death: 'Death' } },
  // ---- 자연·건축 소품 (정적) ----
  tree_park: { url: P + 'tree_park.glb', height: 4.6, static: true },
  tree_park_large: { url: P + 'tree_park_large.glb', height: 6.2, static: true },
  tree_round_high: { url: P + 'tree_round_high.glb', height: 5.2, static: true },
  tree_pine_orange: { url: P + 'tree_pine_orange.glb', height: 5.6, static: true },
  tree_dead: { url: P + 'tree_dead.glb', height: 4.4, static: true },
  bush: { url: P + 'bush.glb', height: 0.9, static: true },
  bush_large: { url: P + 'bush_large.glb', height: 1.2, static: true },
  rock_large: { url: P + 'rock_large.glb', height: 1.6, static: true },
  rock_small: { url: P + 'rock_small.glb', height: 1.0, static: true },
  rock_wide: { url: P + 'rock_wide.glb', height: 1.0, static: true },
  pillar_decorated: { url: P + 'pillar_decorated.glb', height: 5.5, static: true },
  wall_arched: { url: P + 'wall_arched.glb', height: 5.5, static: true },
  obelisk: { url: P + 'obelisk.glb', height: 3.2, static: true },
  house: { url: P + 'house.glb', height: 8.0, static: true },
  fence: { url: P + 'fence.glb', width: 3.2, static: true },
  street_lantern: { url: P + 'street_lantern.glb', height: 3.4, static: true },
  well: { url: P + 'well.glb', height: 2.6, static: true },
  // ---- 하우징 가구 ----
  f_bed: { url: F + 'bed.glb', width: 2.4, static: true },
  f_rack: { url: F + 'weapon_rack.glb', width: 1.9, static: true },
  f_altar: { url: F + 'altar.glb', width: 2.2, static: true },
  f_training: { url: F + 'training_dummy.glb', height: 2.0, static: true },
  f_flower: { url: F + 'flowers.glb', width: 2.2, static: true },
};

const T = {};               // 로드된 템플릿
export const loaded = [];   // 실제로 적용된 파일 목록
export const has = (k) => !!T[k];

// ---------- 림라이트 (프레넬) 주입 ----------
export function addRim(mat, color = 0xffffff, strength = 0.55, power = 2.6) {
  mat.userData.rimColor = { value: new THREE.Color(color) };
  mat.userData.rimStr = { value: strength };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = mat.userData.rimColor;
    sh.uniforms.uRimStr = mat.userData.rimStr;
    sh.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimStr;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 rimV = normalize(vViewPosition);
        float rimF = 1.0 - clamp(dot(normalize(normal), rimV), 0.0, 1.0);
        totalEmissiveRadiance += uRimColor * pow(rimF, ${power.toFixed(2)}) * uRimStr;
      }`);
  };
  mat.customProgramCacheKey = () => 'rim' + power.toFixed(2);
  return mat;
}

// ---------- 소품용 높이 그라데이션 + 림라이트 (나무·바위의 단조로움 제거) ----------
// 밑동은 차갑고 어둡게, 윗부분은 따뜻하고 밝게 + 태양색 프레넬 림. 기존 onBeforeCompile(바람 등)과 체인된다.
let PROP_RIM = new THREE.Color(0xfff0d6);
export function setPropRim(hex) { PROP_RIM = new THREE.Color(hex); }
export function gradRim(mat, H = 4, rimStr = 0.22) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  const uRim = { value: PROP_RIM.clone() }, uH = { value: Math.max(0.2, H) };
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uGrH = uH; sh.uniforms.uGrRim = uRim;
    sh.vertexShader = 'uniform float uGrH;\nvarying float vGy;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vGy = clamp(position.y / uGrH, 0.0, 1.0);');
    sh.fragmentShader = 'uniform vec3 uGrRim;\nvarying float vGy;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(vec3(0.62, 0.68, 0.84), vec3(1.1, 1.07, 0.98), smoothstep(0.0, 0.9, vGy));')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float grF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uGrRim * pow(grF, 3.0) * ${rimStr.toFixed(2)} * (0.35 + 0.65 * vGy);
      }`);
  };
  mat.customProgramCacheKey = () => prevKey + '|grad' + rimStr.toFixed(2);
  return mat;
}

function toToon(m, d) {
  if (!m) return m;
  const base = {
    color: m.color ? m.color.clone() : new THREE.Color(0xffffff), map: m.map || null,
    transparent: !!m.transparent || d.opacity < 1, opacity: d.opacity ?? m.opacity ?? 1, alphaTest: m.alphaTest || 0,
    side: m.side, vertexColors: !!m.vertexColors, name: m.name,
  };
  if (base.map) base.map.colorSpace = THREE.SRGBColorSpace;
  let out;
  if (d.static) {
    out = new THREE.MeshLambertMaterial(base);           // 소품: 가벼운 램버트
  } else {
    out = new THREE.MeshToonMaterial({ ...base, gradientMap });
    if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) {
      out.emissive = m.emissive.clone(); out.emissiveMap = m.emissiveMap || null; out.emissiveIntensity = Math.max(1.5, m.emissiveIntensity || 1);
    }
    if (d.tint) out.color.lerp(new THREE.Color(d.tint[0]), d.tint[1]);
    addRim(out, d.rim ?? 0xffffff, 0.35);
  }
  return out;
}

function prep(key, gltf) {
  const d = DEFS[key];
  const scene = gltf.scene;
  const cache = new Map();
  scene.traverse((o) => {
    if (d.hide && d.hide.includes(o.name)) o.visible = false;
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = !!d.static;
    if (o.isSkinnedMesh) o.frustumCulled = false;
    const conv = (m) => { if (!cache.has(m)) cache.set(m, toToon(m, d)); return cache.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  // 보이는 메시 기준 바운딩 → 목표 크기로 정규화, 바닥(y=0)·중심 정렬
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3(), bb = new THREE.Box3();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
    if (!vis) return;
    o.geometry.computeBoundingBox();
    bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(bb);
  });
  const size = box.getSize(new THREE.Vector3());
  const s = d.width ? d.width / Math.max(size.x, size.z) : d.height / Math.max(0.001, size.y);
  const wrap = new THREE.Group();
  const holder = new THREE.Group(); holder.add(scene); wrap.add(holder);
  holder.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  holder.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const clips = {};
  for (const a of gltf.animations) clips[a.name] = a;
  return { wrap, clips, d, size: size.multiplyScalar(s) };
}

export async function preload(onStatus = () => {}) {
  const loader = new GLTFLoader();
  const keys = Object.keys(DEFS);
  let done = 0;
  await Promise.all(keys.map(async (k) => {
    try {
      const g = await loader.loadAsync(DEFS[k].url);
      T[k] = prep(k, g);
      loaded.push(DEFS[k].url);
    } catch (e) { console.warn('[models] 로드 실패 → 절차적 모델로 폴백:', k, e.message || e); }
    done++;
    onStatus(`오픈소스 3D 모델 불러오는 중… ${done}/${keys.length}`);
  }));
  return loaded.length;
}

// ============================================================
//  애니메이션 상태머신
// ============================================================
export class Animator {
  constructor(root, clips, map) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [st, name] of Object.entries(map)) if (clips[name]) this.actions[st] = this.mixer.clipAction(clips[name]);
    this.cur = null; this.loopState = 'idle'; this.loopScale = 1; this.one = null;
    this.mixer.addEventListener('finished', (e) => {
      if (!this.one || e.action !== this.one.action || this.one.hold) return;
      this.one = null;
      this._to(this.loopState, 0.18, this.loopScale);
    });
    this._to('idle', 0, 1);
  }
  has(s) { return !!this.actions[s]; }
  _to(state, fade, ts) {
    const a = this.actions[state] || this.actions.idle;
    if (!a) return;
    if (this.cur === a) { a.timeScale = ts; return; }
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = ts; a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (this.cur && fade > 0) this.cur.crossFadeTo(a, fade, false); else if (this.cur) this.cur.stop();
    this.cur = a;
  }
  loop(state, ts = 1) {
    if (!this.actions[state]) state = (state === 'run' && this.actions.walk) ? 'walk' : 'idle';
    this.loopState = state; this.loopScale = ts;
    if (!this.one) this._to(state, 0.2, ts);
  }
  trigger(state, { ts = 1, hold = false, force = true, fade = 0.08 } = {}) {
    const a = this.actions[state];
    if (!a) return false;
    if (this.one && (this.one.hold || !force)) return false;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = ts; a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (this.cur && this.cur !== a) this.cur.crossFadeTo(a, fade, false);
    this.cur = a; this.one = { action: a, hold };
    return true;
  }
  busy() { return !!this.one; }
  update(dt) { this.mixer.update(dt); }
}

function findNode(root, name) {
  let f = null;
  root.traverse((o) => { if (!f && o.name === name) f = o; });
  return f;
}

// 인스턴스 전용 머티리얼 (피격 림 플래시·틴트용)
function ownMaterials(root, rimColor) {
  const mats = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const one = (m) => {
      const c = m.clone();
      if (c.isMeshToonMaterial) addRim(c, rimColor, m.userData.rimStr ? m.userData.rimStr.value : 0.5);
      mats.push(c); return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
  });
  return mats;
}

export function instantiate(key, { own = false } = {}) {
  const t = T[key];
  if (!t) return null;
  const root = skClone(t.wrap);
  const animator = new Animator(root, t.clips, t.d.clips || {});
  const mats = own ? ownMaterials(root, t.d.rim ?? 0xffffff) : null;
  return { root, animator, mats, def: t.d, find: (n) => findNode(root, n), size: t.size };
}

export function cloneStatic(key) {
  const t = T[key];
  return t ? t.wrap.clone(true) : null;
}

// ---------- 몬스터 래퍼 ----------
export function buildEnemyModel(type, def) {
  // 모든 몬스터가 전용 머티리얼을 가진다 → 개체별 흰/붉은 피격 플래시 (셰이더 프로그램은 캐시 키로 공유)
  const inst = instantiate(type, { own: true });
  if (!inst) return null;
  for (const m of inst.mats) if (m.emissive) { m.userData.em0 = m.emissive.clone(); m.userData.ei0 = m.emissiveIntensity; }
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(inst.root);
  // 게임 로직은 root 를 size 배율로 스케일하므로 미리 역보정
  const rootScale = def.elite || def.boss ? def.size * (def.shape === 'slime' ? 1 : 0.75) : def.size;
  inst.root.scale.setScalar(1 / rootScale);
  root.updateMatrixWorld(true);
  if (inst.def.weapon) {
    const hand = inst.find(inst.def.weapon);
    if (hand) {
      const sw = buildSword();
      sw.glow.color.setHex(0xa060ff);
      sw.group.scale.setScalar(0.42 / Math.max(0.01, hand.getWorldScale(new THREE.Vector3()).x));
      hand.add(sw.group);
    }
  }
  return { root, body, flaps: [], animator: inst.animator, mats: inst.mats };
}

// ---------- NPC ----------
export function buildNPCModel(key) {
  const inst = instantiate(key);
  if (!inst) return null;
  return { root: inst.root, animator: inst.animator };
}

// ---------- 정적 소품 인스턴싱 ----------
// list: [{x,y,z,ry,s,c}]  → 템플릿의 각 메시를 InstancedMesh 로 (같은 변환 공유)
export function instancedProp(key, list, { cast = true, receive = true, matFn = null } = {}) {
  const t = T[key];
  if (!t || !list.length) return null;
  const g = new THREE.Group();
  t.wrap.updateMatrixWorld(true);
  const o = new THREE.Object3D(), m4 = new THREE.Matrix4(), col = new THREE.Color();
  const anyC = list.some((it) => it.c !== undefined);
  t.wrap.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    let mat = mesh.material;
    const look = (m) => gradRim(matFn ? matFn(m) : m.clone(), t.size.y);
    mat = Array.isArray(mat) ? mat.map(look) : look(mat);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      o.position.set(it.x, it.y, it.z); o.rotation.set(0, it.ry || 0, 0);
      const s = it.s ?? 1; o.scale.set(it.sx ?? s, it.sy ?? s, it.sz ?? s); o.updateMatrix();
      im.setMatrixAt(i, m4.copy(o.matrix));
      if (anyC) im.setColorAt(i, col.set(it.c ?? 0xffffff));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = receive;
    im.computeBoundingSphere();
    g.add(im);
  });
  return g;
}

// 이름표 스프라이트
export function nameTag(text, sub, color = '#ffe08a') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 46px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'; g.textAlign = 'center';
  g.lineWidth = 8; g.strokeStyle = 'rgba(10,14,30,0.85)';
  g.strokeText(text, 256, 56); g.fillStyle = color; g.fillText(text, 256, 56);
  if (sub) { g.font = 'bold 32px "Malgun Gothic", sans-serif'; g.strokeText(sub, 256, 104); g.fillStyle = '#ffffff'; g.fillText(sub, 256, 104); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(3.4, 0.85, 1); s.renderOrder = 20;
  return s;
}

// ---------- 하우징 가구 (CC0 GLB, 없는 항목은 null → 절차적 모델) ----------
const FMAP = { bed: 'f_bed', rack: 'f_rack', altar: 'f_altar', training: 'f_training', lamp: 'street_lantern', flower: 'f_flower' };
export function buildFurnitureModel(type) {
  const key = FMAP[type];
  if (!key || !T[key]) return null;
  const g = new THREE.Group();
  const m = T[key].wrap.clone(true);
  m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(m);
  const top = T[key].size.y;
  if (type === 'altar') {
    const cols = [0xff5a2a, 0x5dffb0, 0x3aa8ff, 0xffe14a, 0xc08a4a, 0xfff6c0, 0x9a4dff];
    cols.forEach((c, i) => {
      const a = (i / 7) * Math.PI * 2;
      const cr = new THREE.Mesh(GEO.oct, glowMat(c)); cr.scale.set(0.12, 0.2, 0.12);
      cr.position.set(Math.cos(a) * 0.75, top + 0.45, Math.sin(a) * 0.45); g.add(cr);
    });
    const orb = new THREE.Mesh(GEO.sph, glowMat(0xffffff)); orb.scale.setScalar(0.22); orb.position.y = top + 0.6; g.add(orb);
    addGlow(g, 0xffffff, 2.4, 0.6).position.y = top + 0.6;
  }
  if (type === 'lamp') addGlow(g, 0xffb860, 2.6, 0.7).position.y = top - 0.55;
  return g;
}
