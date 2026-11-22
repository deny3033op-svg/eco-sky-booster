// 주인공 리그: .glb 자동 로드 (없으면 프로시저럴 폴백) + 검/권총/곰인형 부스터 부착
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as U from './units.js';
import * as M from './models.js';
import { attachVRMGear } from './vrmHero.js';
import { HEROES, DEFAULT_HERO } from './data.js';

// 우선순위대로 탐색 — 첫 번째로 찾은 파일을 사용
// 1) 선택한 VRM 캐릭터(assets/models/<file> → models/<file>) 2) 기존 폴백 경로
// .vrm 파일은 @pixiv/three-vrm(MIT) 로더 플러그인으로 불러온다 (필요할 때만 지연 로드)
export const HERO_MODEL_PATHS = ['./assets/models/hero.vrm', './assets/models/eco-hero-girl.vrm', './models/eco-hero-girl.vrm', './assets/models/eco-hero-girl.glb', './models/eco-hero-girl.glb'];
export const HERO_HEIGHT = 1.75;
export function heroPaths(settings) {
  const h = HEROES[settings.heroChar] || HEROES[DEFAULT_HERO];
  return ['./assets/models/' + h.file, './models/' + h.file, ...HERO_MODEL_PATHS];
}
// 배포판(GitHub Pages)에는 재배포 금지 라이선스 VRM 이 빠져 있다 → 실제 파일이 있는 캐릭터만 선택 가능
export async function probeHeroes() {
  const ids = Object.keys(HEROES);
  const ok = await Promise.all(ids.map(async (id) => (await exists('./assets/models/' + HEROES[id].file)) || (await exists('./models/' + HEROES[id].file))));
  ids.forEach((id, i) => { HEROES[id].available = ok[i]; });
  return ids.filter((id, i) => ok[i]);
}

export async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return r.ok && !(r.headers.get('content-type') || '').includes('text/html');
  } catch (e) { return false; }
}

export async function buildHero(settings, onStatus = () => {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const rig = { root, body, source: 'fallback', paintTargets: [] };
  if (settings.heroModel === 'cc0' && M.has('hero_cc0')) return buildCC0Hero(rig);

  let loaded = null;
  for (const p of heroPaths(settings)) {
    if (!(await exists(p))) continue;
    try {
      onStatus(`주인공 모델 불러오는 중… (${p})`);
      const loader = new GLTFLoader();
      const isVRM = p.endsWith('.vrm');
      let VRM = null;
      if (isVRM) { VRM = await import('@pixiv/three-vrm'); loader.register((parser) => new VRM.VRMLoaderPlugin(parser)); }
      const gltf = await loader.loadAsync(p);
      if (isVRM && gltf.userData.vrm) {
        const vrm = gltf.userData.vrm;
        VRM.VRMUtils.removeUnnecessaryVertices(gltf.scene);
        // VRM 0.0 / 1.0 자동 판별 (VRMC_vrm 확장 = 1.0 · VRM 확장 = 0.x → three-vrm 이 meta.metaVersion 으로 노출)
        const ver = vrm.meta && vrm.meta.metaVersion === '0' ? '0.0' : '1.0';
        rig.vrm0 = ver === '0.0';
        if (rig.vrm0) VRM.VRMUtils.rotateVRM0(vrm);  // VRM0 만: -Z 정면 → +Z 정면 (씬 Y 180°)
        rig.vrm = vrm; rig.vrmVer = ver; rig.VRM = VRM; rig.keepMaterials = true;  // MToon 머티리얼 유지
        loaded = vrm.scene;
      } else loaded = gltf.scene;
      rig.source = p + (rig.vrm ? ` (VRM ${rig.vrmVer})` : ''); rig.animations = gltf.animations;
      break;
    } catch (e) { console.warn('GLB 로드 실패 → 다음 경로/폴백', p, e); }
  }

  if (loaded) {
    prepareModel(loaded, rig);
    buildProxies(loaded);
    const holder = new THREE.Group(); holder.add(loaded); body.add(holder);
    rig.holder = holder; rig.model = loaded;
    if (!rig.vrm && rig.animations && rig.animations.length) {
      rig.mixer = new THREE.AnimationMixer(loaded);
      rig.mixer.clipAction(rig.animations[0]).play();
    }
    if (rig.vrm) return finishVRMHero(rig, settings);
    rig.armR = new THREE.Group(); body.add(rig.armR);
    rig.armL = new THREE.Group(); body.add(rig.armL);
  } else {
    const fb = U.buildFallbackHero();
    body.add(fb.root);
    Object.assign(rig, { fallback: fb, armR: fb.armR, armL: fb.armL, legL: fb.legL, legR: fb.legR, head: fb.head, longHair: fb.longHair });
  }
  rig.armR.rotation.order = 'YXZ';
  rig.armL.rotation.order = 'YXZ';

  const sw = U.buildSword();
  sw.group.position.set(0, -0.47, 0.02);
  sw.group.rotation.x = Math.PI - 0.55;
  rig.armR.add(sw.group); rig.sword = sw;

  const gn = U.buildGun();
  gn.group.position.set(0, -0.47, 0.03);
  gn.group.rotation.x = Math.PI / 2;
  rig.armL.add(gn.group); rig.gun = gn;

  const bb = U.buildBearBooster();
  bb.group.position.set(0, 1.2, -0.3);
  body.add(bb.group); rig.booster = bb;
  addSlots(rig, body, HERO_HEIGHT - 0.03);

  root.traverse((o) => { if (o.isMesh && !o.userData.noCast) o.castShadow = !(o.material && o.material.blending === THREE.AdditiveBlending); });
  applyModelSettings(rig, settings);
  return rig;
}

// VRM 주인공 마무리: 무기(오른손)·곰인형 부스터(등 뼈대) 부착 + 뼈대 애니메이터
function finishVRMHero(rig, settings) {
  rig.holder.rotation.y = settings.modelRotY || 0;
  rig.root.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(rig.vrm.scene).max.y - rig.root.position.y;
  attachVRMGear(rig, U, { topY: Math.min(HERO_HEIGHT, top) - 0.03 });
  addSlots(rig, rig.body, HERO_HEIGHT - 0.03, !!rig.headSlot);
  rig.vrm.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });   // 스키닝으로 움직여도 잘리지 않게
  rig.root.traverse((o) => { if (o.isMesh && !o.userData.noCast) o.castShadow = !(o.material && o.material.blending === THREE.AdditiveBlending); });
  return rig;
}

// 코디 슬롯: 머리 장식(뼈대가 없으면 몸 기준 정수리) · 오라(발밑, 루트 기준)
function addSlots(rig, body, topY, hasHead = false) {
  if (!hasHead) { const hs = new THREE.Group(); hs.position.set(0, topY, 0.01); body.add(hs); rig.headSlot = hs; }
  const au = new THREE.Group(); rig.root.add(au); rig.auraSlot = au;
}

// 캐릭터 전환 시 이전 모델의 GPU 리소스 해제 (VRM 15MB 급 텍스처)
export function disposeHero(rig) {
  if (!rig) return;
  try {
    if (rig.vrm && rig.VRM) rig.VRM.VRMUtils.deepDispose(rig.vrm.scene);
    else if (rig.model) rig.model.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
  } catch (e) { console.warn('hero dispose', e); }
}

// ---------- 고폴리 모델용 저폴리 프록시 ----------
// 수십만 삼각형짜리 모델을 그림자맵 패스와 잔상에서 그대로 다시 그리면 모바일 GPU 가 버티지 못한다.
// 정점 클러스터링(격자 스냅)으로 실루엣만 남긴 프록시를 로딩 때 한 번 만들어 ① 그림자 캐스터 ② 잔상 지오메트리로 쓴다.
const PROXY_MIN_TRIS = 60000;
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
export function clusterDecimate(geo, cell) {
  const pos = geo.attributes.position, idx = geo.index, n = pos.count;
  const map = new Map(), remap = new Uint32Array(n), out = [];
  const inv = 1 / cell;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = (Math.round(x * inv) + 4096) + (Math.round(y * inv) + 4096) * 8192 + (Math.round(z * inv) + 4096) * 67108864;
    let k = map.get(key);
    if (k === undefined) { k = out.length / 3; map.set(key, k); out.push(x, y, z); }
    remap[i] = k;
  }
  const tris = [], cnt = idx ? idx.count : n;
  for (let i = 0; i < cnt; i += 3) {
    const a = remap[idx ? idx.getX(i) : i], b = remap[idx ? idx.getX(i + 1) : i + 1], c = remap[idx ? idx.getX(i + 2) : i + 2];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setIndex(tris);
  g.computeVertexNormals();
  return g;
}
function buildProxies(scene) {
  scene.updateMatrixWorld(true);
  const heavy = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const tris = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    if (tris >= PROXY_MIN_TRIS) heavy.push(o);
  });
  const ws = new THREE.Vector3();
  for (const o of heavy) {
    o.getWorldScale(ws);
    const g = clusterDecimate(o.geometry, 0.028 / Math.max(1e-6, ws.x));     // 월드 기준 약 2.8cm 격자
    const pm = new THREE.Mesh(g, SHADOW_ONLY);
    pm.castShadow = true; pm.userData.proxy = true; pm.userData.noCast = true;
    o.add(pm);
    o.castShadow = false; o.userData.noCast = true; o.userData.proxyMesh = pm;
  }
}

// 크기/바닥 정렬, 노멀 보정, 화이트 메시 판별
function prepareModel(scene, rig) {
  scene.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const s = HERO_HEIGHT / Math.max(0.001, size.y);
  scene.scale.multiplyScalar(s);
  scene.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(scene);
  const c = box.getCenter(new THREE.Vector3());
  scene.position.x -= c.x; scene.position.z -= c.z; scene.position.y -= box.min.y;
  scene.updateMatrixWorld(true);

  scene.traverse((o) => {
    if (!o.isMesh || o.userData.proxy) return;
    o.castShadow = true; o.receiveShadow = true;
    if (rig.keepMaterials) return;
    const geo = o.geometry;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const hasMap = !!(m && m.map);
    const hasVC = !!geo.attributes.color;
    const white = !hasMap && !hasVC && (!m || !m.color || (m.color.r > 0.85 && m.color.g > 0.85 && m.color.b > 0.85));
    if (hasMap) {
      m.map.colorSpace = THREE.SRGBColorSpace;
      o.material = new THREE.MeshToonMaterial({ map: m.map, gradientMap: U.gradientMap, color: 0xffffff });
    } else if (hasVC) {
      o.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: U.gradientMap });
    } else if (white) {
      rig.paintTargets.push(o);   // 화이트 메시 → 컬러 틴트/파트 페인트 대상
    } else {
      o.material = new THREE.MeshToonMaterial({ color: m.color, gradientMap: U.gradientMap });
    }
  });
}

// 화이트 메시용 높이 기반 컬러 페인트 (은발/피부/빨강 재킷/검은 스커트/부츠)
const C = {
  hair: new THREE.Color(0xe6eaf4), skin: new THREE.Color(0xffdcc8), jacket: new THREE.Color(0xc4202a),
  shirt: new THREE.Color(0xf4f0f0), skirt: new THREE.Color(0x1c1c26), boot: new THREE.Color(0x2e2024), eye: new THREE.Color(0x3a5aa8),
};
function paintMesh(mesh, rotY, rootInv) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const mtx = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
  const v = new THREE.Vector3();
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  // 1차: 바운딩
  let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, maxX = 0;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mtx);
    const x = v.x * cs + v.z * sn, z = -v.x * sn + v.z * cs;
    P[i * 3] = x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = z;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    if (Math.abs(x) > maxX) maxX = Math.abs(x);
  }
  const H = maxY - minY || 1, D = maxZ - minZ || 1, zc = (minZ + maxZ) / 2;
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], h = (P[i * 3 + 1] - minY) / H, z = P[i * 3 + 2];
    const front = (z - zc) / D;           // +: 앞쪽
    const ax = Math.abs(x) / maxX;
    let c;
    if (h > 0.875) c = C.hair;
    else if (h > 0.78) c = front > 0.12 && ax < 0.35 ? C.skin : C.hair;
    else if (h > 0.56) {
      if (front < -0.18 && h > 0.6) c = C.hair;                      // 등 뒤 긴 머리
      else if (front > 0.2 && ax < 0.1 && h > 0.66) c = C.shirt;
      else if (ax > 0.7 && h < 0.64) c = C.skin;                      // 손
      else c = C.jacket;
    } else if (h > 0.41) c = (front < -0.25 && h > 0.5) ? C.hair : C.skirt;
    else if (h > 0.075) c = C.skin;
    else c = C.boot;
    // 부드러운 음영 노이즈
    tmp.copy(c).multiplyScalar(0.94 + ((i * 2654435761) % 1000) / 1000 * 0.08);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { minY, maxY, minZ, maxZ, P };
}

// 설정(방향 보정·페인트 on/off) 적용 + 부착물 위치 자동 맞춤
export function applyModelSettings(rig, settings) {
  if (!rig.holder) return;
  const rotY = settings.modelRotY || 0;
  rig.holder.rotation.y = rotY;
  if (rig.vrm) return;               // VRM: 무기·부스터는 뼈대에 직접 붙어 있어 위치 보정 불필요
  rig.root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(rig.root.matrixWorld).invert();
  let backZ = -0.25, shoulderX = 0.24, shoulderY = 1.33;
  const hands = {};
  for (const m of rig.paintTargets) {
    if (settings.paint) {
      const info = paintMesh(m, 0, rootInv); // 이미 holder 회전 반영된 matrixWorld 사용
      m.material = M.addRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: U.gradientMap }), 0x9ad0ff, 0.22, 3.2);
      // 몸통 높이대에서 등 위치/어깨 폭 측정
      const P = info.P, H = info.maxY - info.minY;
      let bz = 0, bx = 0;
      for (let i = 0; i < P.length; i += 3) {
        const h = (P[i + 1] - info.minY) / H;
        if (h > 0.6 && h < 0.74 && Math.abs(P[i]) < 0.12) bz = Math.min(bz, P[i + 2]);
        if (h > 0.72 && h < 0.78) bx = Math.max(bx, Math.abs(P[i]));
      }
      if (bz < 0) backZ = bz;
      if (bx > 0.1) shoulderX = Math.min(0.4, bx - 0.05);
      shoulderY = info.minY + H * 0.76;
      // 손 소켓: 팔 바깥쪽 아래 끝(엉덩이 높이) 정점들의 중심
      let maxX = 0; for (let i = 0; i < P.length; i += 3) maxX = Math.max(maxX, Math.abs(P[i]));
      for (const side of [1, -1]) {
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let i = 0; i < P.length; i += 3) {
          const h = (P[i + 1] - info.minY) / H;
          if (h > 0.4 && h < 0.6 && P[i] * side > maxX * 0.62) { sx += P[i]; sy += P[i + 1]; sz += P[i + 2]; n++; }
        }
        if (n > 20) hands[side > 0 ? 'L' : 'R'] = new THREE.Vector3(sx / n, sy / n, sz / n);
      }
    } else {
      m.geometry.deleteAttribute?.('color');
      m.material = new THREE.MeshToonMaterial({ color: 0xf4efe8, gradientMap: U.gradientMap });
    }
  }
  rig.booster.group.position.set(0, 1.18, Math.max(-0.55, backZ - 0.16));
  rig.armR.position.set(-shoulderX, shoulderY, 0.02);
  rig.armL.position.set(shoulderX, shoulderY, 0.02);
  // 무기 소켓을 실제 손 위치에 정렬 (팔 피벗 → 손 방향/길이)
  rig.armRest = { R: { x: -0.25, z: 0.12 }, L: { x: -0.15, z: -0.12 } };
  for (const [k, arm, w] of [['R', rig.armR, rig.sword.group], ['L', rig.armL, rig.gun.group]]) {
    const hp = hands[k]; if (!hp) continue;
    const dx = hp.x - arm.position.x, dy = hp.y - arm.position.y, dz = hp.z - arm.position.z;
    const len = Math.hypot(dx, dy, dz);
    w.position.y = -Math.max(0.3, Math.min(0.75, len));
    rig.armRest[k] = { x: Math.atan2(-dz, -dy) * -1 * -1, z: Math.atan2(dx, -dy) };
  }
}

// ---------- CC0 애니메이션 주인공 (Quaternius Adventurer) — 비교용 ----------
function buildCC0Hero(rig) {
  const inst = M.instantiate('hero_cc0');
  rig.body.add(inst.root);
  rig.animator = inst.animator;
  rig.source = 'CC0 · Quaternius Adventurer (assets/models/chars/hero_adventurer.glb)';
  rig.armR = new THREE.Group(); rig.armL = new THREE.Group();          // 절차 애니메이션 호환용 더미
  rig.armR.rotation.order = rig.armL.rotation.order = 'YXZ';
  rig.root.updateMatrixWorld(true);
  const ws = new THREE.Vector3();
  const attach = (boneName, obj, pos, rot, size) => {
    const b = inst.find(boneName) || inst.root;
    b.getWorldScale(ws);
    obj.scale.setScalar(size / ws.x); obj.position.copy(pos).divideScalar(ws.x); obj.rotation.set(...rot);
    b.add(obj);
  };
  const sw = U.buildSword(); rig.sword = sw;
  attach('WristR', sw.group, new THREE.Vector3(0, 0.08, 0.02), [0, 0, Math.PI], 0.85);
  const gn = U.buildGun(); rig.gun = gn;
  attach('WristL', gn.group, new THREE.Vector3(0, 0.09, 0.02), [Math.PI / 2, 0, 0], 1);
  const bb = U.buildBearBooster(); rig.booster = bb;
  attach('Chest', bb.group, new THREE.Vector3(0, 0.05, -0.28), [0, 0, 0], 1);
  addSlots(rig, rig.body, HERO_HEIGHT - 0.05);
  rig.root.traverse((o) => { if (o.isMesh) o.castShadow = !(o.material && o.material.blending === THREE.AdditiveBlending); });
  return rig;
}
