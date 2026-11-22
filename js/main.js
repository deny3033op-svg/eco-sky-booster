// 엔트리: 렌더러 생성 → 게임 초기화 → 루프
import * as THREE from 'three';
import { Game } from './game.js';
import { FX } from './fx.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as COS from './cosmetics.js';
window.__cos = COS;

const msg = document.getElementById('loadMsg');
const startBtn = document.getElementById('startBtn');
const status = (t) => { msg.textContent = t; };

window.addEventListener('error', (e) => { status('⚠ 오류: ' + e.message); console.error(e.error || e); });
window.addEventListener('unhandledrejection', (e) => { status('⚠ 오류: ' + (e.reason && e.reason.message || e.reason)); console.error(e.reason); });

const mobile = matchMedia('(pointer: coarse)').matches;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const game = new Game(renderer);
window.__game = game; // 디버그용
{ const q0 = new URLSearchParams(location.search); if (q0.has('hero')) game.state.settings.heroModel = q0.get('hero');
  if (q0.has('char')) { game.state.settings.heroChar = q0.get('char'); game.state.settings.heroModel = 'custom'; } }   // ?char=ophelia|female_saiyan|the_sister

// ---- 포스트프로세싱: UnrealBloomPass (검기·마법·정령·수정 발광) ----
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(game.scene, game.camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.42, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---- 자동 품질 (60fps 목표): 해상도 배율 → 블룸 → 그림자 순으로 조절 ----
const DPR = Math.min(devicePixelRatio, 2);
const LEVELS = [
  { pr: Math.min(DPR, 0.85), bloom: false, shadow: false },
  { pr: Math.min(DPR, 1.0), bloom: false, shadow: true },
  { pr: Math.min(DPR, 1.25), bloom: true, shadow: true, bloomScale: 0.5 },
  { pr: Math.min(DPR, mobile ? 1.5 : 2), bloom: true, shadow: true, bloomScale: 1 },
];
const quality = {
  level: mobile ? 2 : 3, frames: 0, acc: 0, good: 0, fps: 60,
  target() { const q = game.state.settings.quality; return q === 'high' ? 3 : q === 'low' ? 1 : null; },
  apply() {
    const L = LEVELS[this.level];
    renderer.setPixelRatio(L.pr); composer.setPixelRatio(L.pr);
    resize();
    if (game.sun) game.sun.castShadow = L.shadow;
    bloom.strength = 0.6;
    this.useBloom = L.bloom;
    if (L.bloomScale) bloom.resolution.set(innerWidth * L.bloomScale, innerHeight * L.bloomScale);
  },
  reset() { const t = this.target(); this.level = t ?? (mobile ? 2 : 3); this.good = 0; this.apply(); },
  tick(dt) {
    this.frames++; this.acc += dt;
    if (this.acc < 2) return;
    this.fps = this.frames / this.acc; this.frames = 0; this.acc = 0;
    const fixed = this.target();
    if (fixed !== null) { if (fixed !== this.level) { this.level = fixed; this.apply(); } }
    else if (this.fps < 50 && this.level > 0) { this.level--; this.good = 0; this.apply(); }
    else if (this.fps > 58.5 && this.level < LEVELS.length - 1) { if (++this.good >= 4) { this.level++; this.good = 0; this.apply(); } }
    else this.good = 0;
    const m = document.getElementById('fpsMeter');
    const show = game.state.settings.fps || new URLSearchParams(location.search).has('fps');
    m.classList.toggle('hidden', !show);
    if (show) m.textContent = `${this.fps.toFixed(0)} fps · Q${this.level} · x${LEVELS[this.level].pr.toFixed(2)}${this.useBloom && game.state.settings.bloom ? ' · bloom' : ''}`;
  },
};
window.__quality = quality;

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  game.camera.aspect = innerWidth / innerHeight;
  game.camera.updateProjectionMatrix();
  const top = document.getElementById('topBar');
  if (top) document.documentElement.style.setProperty('--topH', Math.ceil(top.getBoundingClientRect().height + 6) + 'px');
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

let last = performance.now();
let started = false;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (started) { game.update(dt); quality.tick(dt); }
  else if (game.h) { game.updateCamera(dt); game.animateHero(dt); }
  if (quality.useBloom && game.state.settings.bloom) composer.render();
  else renderer.render(game.scene, game.camera);
}

(async () => {
  await game.init(status);
  FX.warmup(renderer, game.camera);
  quality.reset();
  requestAnimationFrame(loop);
  startBtn.disabled = false;
  const go = () => {
    if (started) return;
    started = true;
    document.getElementById('loading').classList.add('gone');
    setTimeout(() => document.getElementById('loading').remove(), 600);
    game.ui.banner(game.world.def.name, game.world.def.desc, 2.4);
  };
  startBtn.addEventListener('click', go);
  const q = new URLSearchParams(location.search);
  if (q.has('autostart')) go();
  // 디버그 맵: ?map=0~3|home
  if (q.has('map')) { const m = q.get('map'); game.state.unlocked = 4; game.loadMap(m === 'home' ? 'home' : +m); }
  // 디버그: ?pos=x,z (주인공 위치) · ?spawn=slime,wolf (전방에 몬스터 소환, 정지 상태)
  if (q.has('pos')) { const [x, z] = q.get('pos').split(',').map(Number); game.h.pos.set(x, 0, z); }
  if (q.has('spawn')) q.get('spawn').split(',').forEach((t, i, arr) => {
    const a = Math.PI + (i - (arr.length - 1) / 2) * 0.55, h = game.h.pos;
    const sd = +(q.get('spawnd') || 6);
    const e = game.spawnEnemy(t, new THREE.Vector3(h.x + Math.sin(a) * sd, 0, h.z + Math.cos(a) * sd));
    e.def = { ...e.def, speed: 0, atk: 0 }; e.yaw = a + Math.PI;
  });
  // 디버그 입력: ?hold=attack,gun (누르고 있기) · ?ev=dash@1500,skill@2000 (ms 뒤 1회 입력) · ?auto=1
  if (q.has('hold')) q.get('hold').split(',').forEach((a) => { game.input.held[a] = true; });
  if (q.has('ev')) q.get('ev').split(',').forEach((s) => { const [n, ms] = s.split('@'); setTimeout(() => game.input.events.add(n), +ms || 0); });
  if (q.has('auto') && !game.state.auto) game.toggleAuto();
  if (q.has('drawer')) game.ui.toggleDrawer(true);
  // 디버그 카메라: ?camyaw=3.14&camdist=5&campitch=0.2
  if (q.has('camyaw')) game.cam.yaw = +q.get('camyaw');
  if (q.has('camdist')) game.cam.dist = +q.get('camdist');
  if (q.has('campitch')) game.cam.pitch = +q.get('campitch');
  if (q.has('selftest')) selfTest();
})();

// VRM 검증: 루트 로컬 좌표에서 왼어깨가 +X(=+Z 정면), 팔이 내려와 있음(뼈 축 변환 정상), 검=오른손 · 권총=왼손 · 등 파츠=등 뒤 · 머리 장식=머리 위
function vrmProbe(g) {
  const r = g.rig, v = r.vrm; if (!v) return { source: r.source };
  r.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(r.root.matrixWorld).invert();
  const L = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const raw = (n) => v.humanoid.getRawBoneNode(n);
  const ls = L(raw('leftUpperArm')), rs = L(raw('rightUpperArm')), rh = L(raw('rightHand')), lh = L(raw('leftHand')), chest = L(raw('chest') || raw('spine')), head = L(raw('head'));
  const sw = L(r.sword.group), gn = L(r.gun.group), bb = L(r.booster.group), hs = L(r.headSlot);
  const f = (x) => +x.toFixed(3);
  return {
    ver: r.vrmVer, rotateVRM0: r.vrm0, sceneRotY: f(v.scene.rotation.y), springJoints: v.springBoneManager ? v.springBoneManager.joints.size ?? [...v.springBoneManager.joints].length : 0,
    facesPlusZ: ls.x > 0 && rs.x < 0, leftShoulderX: f(ls.x),
    armsDown: rh.y < rs.y - 0.2 && lh.y < ls.y - 0.2, rHandDrop: f(rs.y - rh.y), lHandDrop: f(ls.y - lh.y),
    swordInRightHand: f(sw.distanceTo(rh)), gunInLeftHand: f(gn.distanceTo(lh)),
    boosterBehind: bb.z < chest.z - 0.05, boosterDz: f(bb.z - chest.z), headSlotAbove: f(hs.y - head.y),
  };
}

// ?selftest : 헤드리스 자가 진단 (AUTO 전투 → 패널 렌더 → 집/건축 → 결과를 DOM에 기록)
function selfTest() {
  const errs = [];
  addEventListener('error', (e) => errs.push(String(e.message)));
  const g = game, out = {}; const q2 = new URLSearchParams(location.search);
  const step = (ms, fn) => new Promise((r) => setTimeout(() => { try { fn(); } catch (e) { errs.push('step: ' + e.message + ' ' + e.stack); } r(); }, ms));
  (async () => {
    let frames = 0; const f0 = performance.now();
    const count = () => { frames++; if (performance.now() - f0 < 4000) requestAnimationFrame(count); };
    requestAnimationFrame(count);
    await step(50, () => { g.state.auto = false; g.toggleAuto(); if (!q2.has('sim')) { g.state.inv.seal = 9; g.state.inv.gold = 99999; }
      if (!q2.has('sim')) for (const k of ['iron', 'mana', 'spirit', 'wood']) g.state.inv[k] = 999; });
    await step(4000, () => { out.fps = frames / 4; out.source = g.rig.source; out.enemies = g.enemies.length; out.kills = g.mapKills;
      out.autoState = g.autoState; out.heroPos = g.h.pos.toArray().map((v) => +v.toFixed(1)); out.hp = Math.round(g.h.hp);
      out.inv = { ...g.state.inv }; out.lv = g.state.hero.lv; });
    if (q2.has('sim')) await step(10, () => {
      // 렌더 없이 90초 AUTO 전투 고속 시뮬레이션
      g.noAutoDodge = q2.has('nododge'); g.metric = { dmg: 0, hits: 0, minR: 1, kills: 0, bigKills: 0 }; const lv0 = g.state.hero.lv;
      const inv0 = { ...g.state.inv }; let deaths = 0, wasDead = false, minHp = 1e9, states = {};
      for (let i = 0; i < 2700; i++) {
        g.update(1 / 30);
        if (g.h.dead && !wasDead) deaths++; wasDead = g.h.dead; minHp = Math.min(minHp, g.h.hp);
        states[g.autoState] = (states[g.autoState] || 0) + 1;
      }
      const gained = {}; for (const k in g.state.inv) gained[k] = g.state.inv[k] - inv0[k];
      out.sim = { kills: g.mapKills, lv: g.state.hero.lv, deaths, minHp: Math.round(minHp), gained, states,
        elite: g.enemies.some((e) => e.elite), eliteDown: g.state.eliteDown, unlocked: g.state.unlocked, orbs: g.orbs.length,
        projs: g.projs.length, dodges: g.dodges || 0, maxBusy: g._maxBusy || 0, metric: g.metric, lv0 };
    });
    await step(10, () => { out.noSupport = !('summons' in g) && !('party' in g.state) && !('summons' in g.state) && !document.getElementById('partyBar'); });
    // ---- 코디: 염색 6종 · 파츠 전 옵션 착탈 → 저장 확인 ----
    if (!q2.has('sim')) await step(10, () => {
      const C = window.__cos; const cnt = {};
      for (const id of C.DYE_ORDER) { g.setDye(id); cnt[id] = g.rig.dyed; }
      for (const [slot, S] of Object.entries(C.PART_SLOTS)) for (const v of S.order) g.setPart(slot, v);
      g.update(1 / 30);
      g.setDye('crimson'); g.setPart('back', 'wings'); g.setPart('head', 'halo'); g.setPart('weapon', 'laser'); g.setPart('aura', 'holy');
      for (let i = 0; i < 10; i++) g.update(1 / 30);
      const saved = JSON.parse(localStorage.getItem('eco-sky-booster-save-v1')).cosmetic;
      out.cosmetic = { dyeTargets: cnt, saved, wings: !!(g.rig.booster.wings && g.rig.booster.wings.length), flames: g.rig.booster.flames.length,
        head: g.rig.headSlot.children.length, aura: g.rig.auraSlot.children.length, swordGlow: !!g.rig.sword.glow };
    });
    // ---- VRM 3종 전환 + 방향/포즈/부착 검증 ----
    if (!q2.has('sim')) for (const id of ['female_saiyan', 'the_sister', 'ophelia']) {
      try {
        await g.selectHero(id);
        const au = g.state.auto; g.state.auto = false; g.h.firingT = 0;    // 대기 자세에서 측정 (AUTO 사격 중이면 왼팔이 올라감)
        for (let i = 0; i < 45; i++) g.update(1 / 30);
        g.state.auto = au;
        out['vrm_' + id] = vrmProbe(g);
      } catch (e) { errs.push('vrm ' + id + ': ' + e.message + ' ' + e.stack); }
    }
    if (!q2.has('sim')) await step(10, () => { out.heroSaved = JSON.parse(localStorage.getItem('eco-sky-booster-save-v1')).settings.heroChar; });
    await step(10, () => { for (const p of ['sword', 'gun', 'booster']) for (let i = 0; i < 4; i++) g.enhance(p); out.gear = { ...g.state.gear }; });
    await step(10, () => { for (const e of ['wind', 'water', 'thunder', 'earth', 'light', 'dark']) g.state.spirits[e] = true; g.rebuildSpirits(); out.master = g.master; out.spirits = g.spirits.length; });
    await step(10, () => { for (const p of ['chars', 'wardrobe', 'spirits', 'enhance', 'bag', 'map']) { g.ui.openPanel(p); } });
    await step(300, () => {
      const wm = document.getElementById('worldMapCanvas'), mm = document.getElementById('miniCanvas');
      const ink = (cv) => { if (!cv || !cv.width) return 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++; return n; };
      out.maps = { world: wm ? [wm.width, ink(wm)] : null, mini: [mm.width, ink(mm)] };
      g.ui.closePanel();
    });
    await step(10, () => { g.input.events.add('burst'); g.input.events.add('skill'); g.input.events.add('dash'); });
    await step(1500, () => { out.kills2 = g.mapKills; out.enemies2 = g.enemies.length; out.pickups = g.pickups.length; });
    await step(10, () => g.loadMap(1));
    await step(800, () => g.loadMap(3));
    await step(800, () => { g.mapKills = 99; });
    await step(1200, () => { out.boss = !!g.boss; g.loadMap('home'); });
    await step(300, () => { g.toggleBuild(true); g.craftFurniture('bed'); g.startPlace('bed'); g.rotateGhost(); g.confirmPlace(); out.furniture = g.state.furniture.length; out.fb = g.stats.fb; g.toggleBuild(false); });
    await step(500, () => { out.saved = !!localStorage.getItem('eco-sky-booster-save-v1'); });
    const pre = document.createElement('pre'); pre.id = 'testOut';
    pre.textContent = 'SELFTEST ' + JSON.stringify({ errs, ...out });
    document.body.appendChild(pre);
  })();
}
