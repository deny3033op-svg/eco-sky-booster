// ============================================================
//  ECO: Sky Booster — 게임 로직 코어
// ============================================================
import * as THREE from 'three';
import * as D from './data.js';
import { FX, rainbowColor } from './fx.js';
import { loadState, saveState, resetState } from './save.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { buildHero, applyModelSettings, disposeHero, probeHeroes } from './hero.js';
import { applyCosmetics, updateCosmetics, setBack, setWeapon, setHead, setAura, applyDye, DEFAULT_COSMETIC } from './cosmetics.js';
import { Minimap } from './minimap.js';
import * as U from './units.js';
import { buildMap, SkySystem } from './world.js';
import * as Models from './models.js';

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(t, 0, 1);
}
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _col = new THREE.Color();
const FLASH_T = 0.16;                 // 피격 플래시 지속
const KNOCK_DAMP = 12;                // 넉백 감쇠 계수 (임펄스 = 거리 × 감쇠)
const SWITCH_RANGE = 3.5;             // 이 거리(적 표면 기준) 이내 = 검, 초과 = 권총
const C_WHITE = new THREE.Color(0xffffff), C_RED = new THREE.Color(0xff2a2a);
const MOBILE = matchMedia('(pointer: coarse)').matches;

export class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
    this.state = loadState();
    this.time = 0;
    this.cam = { yaw: 0, pitch: 0.55, dist: 12 };
    this.enemies = []; this.spirits = [];
    this.projs = []; this.pickups = []; this.nodes = []; this.orbs = []; this.delayed = [];
    this.build = { active: false, ghost: null, type: null, rot: 0, moving: -1 };
    this.cds = { skill: 0, burst: 0 };
    this.autoCmd = null;
    this.saveT = 0;
    this.mapKills = 0; this.eliteCd = 0; this.spawnT = 0;
    this.hitStop = 0; this.slowT = 0; this.slowK = 1;          // 히트스톱 · 슬로모션 (실시간 초)
    this.combo = { n: 0, t: 0 };                                // 콤보 카운터
    this.metric = { dmg: 0, hits: 0, minR: 1, kills: 0, bigKills: 0 };   // 자가진단용 전투 계측
    this.camFx = { look: new THREE.Vector3(), lookInit: false, zoom: 1, fov: 55, burstT: 0, punch: 0 };
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  // ---------------------------------------------------------
  async init(status) {
    const s = this.scene;
    s.fog = new THREE.FogExp2(0xc8e4f8, 0.0052);
    this.sky = new SkySystem(); s.add(this.sky);
    this.hemi = new THREE.HemisphereLight(0xdff0ff, 0x6a5a48, 1.35); s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
    this.sun.castShadow = true;
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.03;
    s.add(this.sun, this.sun.target);

    FX.init(s, this.camera, document.getElementById('floatLayer'));
    this.input = new Input(this);
    this.ui = new UI(this);

    status('오픈소스 3D 모델 불러오는 중…');
    await Models.preload(status);
    status('주인공 준비 중…');
    const avail = await probeHeroes();
    const hc = this.state.settings.heroChar;
    if (!D.HEROES[hc] || !D.HEROES[hc].available) this.state.settings.heroChar = avail.includes(D.DEFAULT_HERO) ? D.DEFAULT_HERO : (avail[0] || D.DEFAULT_HERO);
    this.state.cosmetic = { ...DEFAULT_COSMETIC, ...(this.state.cosmetic || {}) };
    this.rig = await buildHero(this.state.settings, status);
    applyCosmetics(this.rig, this.state.cosmetic);
    s.add(this.rig.root);
    this.minimap = new Minimap(this);
    this.bindGhosts();
    this.h = {
      pos: new THREE.Vector3(), yaw: Math.PI, vy: 0, hp: 1, shield: 0, gauge: 100, grounded: true, hovering: false,
      dashT: 0, dashDir: new THREE.Vector3(), dashCd: 0,
      swingT: 0, swingDur: 0.25, combo: -1, comboT: 0, queued: false, hitDone: true,
      gunCd: 0, firingT: 0, recoil: 0, weapon: 'sword', ghostT: 0, lean: 0, pyaw: Math.PI, spinT: 0, iframe: 0, lastHurt: -99, shieldT: 0, dead: false, deadT: 0, moving: 0,
      dodgeCd: 0, dodgeBuff: 0,                                    // 부스터 대시 회피 (저스트 회피 버프)
    };
    this.recompute();
    this.h.hp = this.stats.maxHp; this.h.gauge = this.stats.boostMax;

    // 엘레멘탈 마스터 무지개 고리
    const tg = new THREE.TorusGeometry(2.25, 0.035, 6, 96);
    const cols = new Float32Array(tg.attributes.position.count * 3);
    for (let i = 0; i < tg.attributes.position.count; i++) {
      const a = Math.atan2(tg.attributes.position.getY(i), tg.attributes.position.getX(i));
      rainbowColor(a / (Math.PI * 2), _col);
      cols[i * 3] = _col.r; cols[i * 3 + 1] = _col.g; cols[i * 3 + 2] = _col.b;
    }
    tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.masterRing = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.masterRing.rotation.x = Math.PI / 2;
    s.add(this.masterRing);

    this.rebuildSpirits();
    const startMap = this.state.map === 'home' ? 'home' : clamp(this.state.map | 0, 0, this.state.unlocked - 1);
    this.loadMap(startMap);
    this.ui.setAuto(this.state.auto);
    this.ui.setWeapon(this.h.weapon);
    this.ui.refreshAll();
    status(this.rig.source === 'fallback' ? '기본 3D 파츠 캐릭터 사용 (GLB 없음)' : `주인공 모델 로드: ${this.rig.source}`);
    addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
  }

  save() { if (!this._noSave) saveState(this.state); }

  // ---------------------------------------------------------
  // 스탯 계산 (정령 버프 · 엘레멘탈 · 장비 · 가구)
  get master() { return D.ELEMENT_ORDER.every((e) => this.state.spirits[e]); }
  activeSpirits() {
    return this.master ? D.ELEMENT_ORDER.slice() : this.state.equipped.filter((e) => this.state.spirits[e]);
  }
  furnBonus() {
    const b = { hp: 0, atk: 0, def: 0, spirit: 0, drop: 0, regen: 0, enhance: 0 };
    const cnt = {};
    for (const f of this.state.furniture) {
      cnt[f.type] = (cnt[f.type] || 0) + 1;
      if (cnt[f.type] > D.FURN_BONUS_CAP || !D.FURNITURE[f.type]) continue;
      for (const [k, v] of Object.entries(D.FURNITURE[f.type].bonus)) b[k] = (b[k] || 0) + v;
    }
    return b;
  }
  recompute() {
    const st = this.state, lv = st.hero.lv;
    const fb = this.furnBonus();
    const s = {
      // v0.5 1인 전투: 가디언 방패 오라(-20%)·메이지 회복이 사라진 만큼 기본 체력·방어를 소폭 상향
      maxHp: 360 + (lv - 1) * 46, atk: 22 + (lv - 1) * 4.2, def: 9 + (lv - 1) * 1.7,
      atkSpd: 1, moveSpd: 9, crit: 0.1, critDmg: 1.8, lifesteal: 0, drop: 1, regen: 0.004,
      heal: 1, cdMult: 1, defShred: 0, shieldPct: 0, stagger: true, fb,
    };
    s.maxHp *= 1 + fb.hp; s.atk *= 1 + fb.atk; s.def *= 1 + fb.def; s.drop += fb.drop; s.regen += fb.regen;
    const m = (this.master ? 1.5 : 1) * (1 + fb.spirit);
    s.spiritPower = m;
    for (const e of this.activeSpirits()) {
      if (e === 'fire') s.atk *= 1 + 0.2 * m;
      if (e === 'wind') { s.atkSpd *= 1 + 0.25 * m; s.moveSpd *= 1 + 0.25 * m; s.cdMult *= Math.max(0.5, 1 - 0.2 * m); }
      if (e === 'water') { s.regen += 0.008 * m; s.shieldPct = 0.12 * m; }
      if (e === 'thunder') s.crit += 0.2 * m;
      if (e === 'earth') { s.def *= 1 + 0.3 * m; s.maxHp *= 1 + 0.3 * m; s.stagger = false; }
      if (e === 'light') { s.heal *= 1 + 0.25 * m; s.drop *= 1 + 0.25 * m; }
      if (e === 'dark') { s.defShred = Math.min(0.8, 0.3 * m); s.lifesteal += 0.1 * m; }
    }
    const g = st.gear;
    s.swordMul = 1 + 0.12 * g.sword;
    s.gunMul = 1 + 0.1 * g.gun; s.gunRate = 11 * (1 + 0.06 * g.gun);   // 고속 연사 (발당 피해는 낮춰 DPS 유지)
    s.boostMax = 100 * (1 + 0.12 * g.booster); s.dashMul = 1 + 0.05 * g.booster;
    s.enhanceBonus = fb.enhance;
    this.stats = s;
    if (this.h) { this.h.hp = Math.min(this.h.hp, s.maxHp); this.h.gauge = Math.min(this.h.gauge, s.boostMax); }
    this.updateGearColors();
  }
  gearColor(part) {
    const lv = this.state.gear[part];
    const c = D.GEAR_COLORS[lv];
    if (c === -1) return rainbowColor(this.time * 0.4, new THREE.Color()).getHex();
    return c;
  }
  updateGearColors() {
    if (!this.rig) return;
    this.rig.sword.glow.color.setHex(this.gearColor('sword'));
    this.rig.gun.glow.color.setHex(this.gearColor('gun'));
    const bc = this.state.gear.booster;
    this.rig.booster.flameMat.color.setHex(bc === 0 ? 0x2a7cff : this.gearColor('booster'));
  }

  // ---------------------------------------------------------
  // 재화
  canAfford(cost) { return Object.entries(cost).every(([k, v]) => (this.state.inv[k] || 0) >= v); }
  pay(cost) {
    if (!this.canAfford(cost)) return false;
    for (const [k, v] of Object.entries(cost)) this.state.inv[k] -= v;
    return true;
  }
  give(mat, n, pos) {
    this.state.inv[mat] = (this.state.inv[mat] || 0) + n;
    if (pos) FX.text(pos, `+${n} ${D.MATS[mat].icon}`, '#' + new THREE.Color(D.MATS[mat].color).getHexString(), 15, 0.9, 'loot');
    this.ui.dirty = true;
  }

  // ---------------------------------------------------------
  // 맵 로드
  loadMap(id) {
    if (this.build.active) this.toggleBuild(false);
    if (this.world) { this.scene.remove(this.world.group); }
    for (const e of this.enemies) { this.scene.remove(e.root); this.scene.remove(e.bar.group); }
    for (const p of this.projs) if (p.mesh) this.scene.remove(p.mesh);
    for (const e of this.enemies) this.disposeEnemy(e);
    for (const d of this.dying || []) this.disposeEnemy(d.e);
    for (const p of this.pickups) this.scene.remove(p.mesh);
    for (const n of this.nodes) this.scene.remove(n.obj);
    for (const o of this.orbs) this.scene.remove(o.obj);
    for (const d of this.dying || []) this.scene.remove(d.e.root);
    for (const n of this.npcs || []) this.scene.remove(n.root);
    this.dying = []; this.npcs = []; this.talkTarget = null;
    this.enemies = []; this.projs = []; this.pickups = []; this.nodes = []; this.orbs = []; this.delayed = [];
    FX.clearAll();

    const m = buildMap(id);
    this.world = m; this.mapId = id;
    this.scene.add(m.group);
    m.applyEnv(this);   // 섬별 하늘·안개·조명 테마

    const h = this.h;
    h.pos.copy(m.spawn); h.yaw = m.spawnYaw; h.vy = 0; h.dashT = 0; h.dead = false;
    this.cam.yaw = 0; this.camFx.lookInit = false;
    this.combo.n = 0; this.combo.t = 0; this.hitStop = 0; this.slowT = 0;
    this.camera.position.set(h.pos.x, 8, h.pos.z + 12);
    this.mapKills = 0; this.eliteCd = 0; this.spawnT = 1;
    this.boss = null;

    if (id === 'home') {
      this.rebuildFurniture();
      this.spawnNPCs();
      h.hp = this.stats.maxHp;
    } else {
      this.state.island = id;
      const def = m.def;
      for (const n of m.nodes) this.addNode(n.type, n.pos);
      def.spirits.forEach((el, i) => { if (!this.state.spirits[el]) this.addOrb(el, m.orbPos[i], i === 1 && !this.state.eliteDown[id]); });
      for (let i = 0; i < Math.ceil(def.count * D.SOLO.initRatio); i++) this.spawnEnemy(def.enemies[i % def.enemies.length]);
      m.seal.visible = !this.state.claimed['seal' + id];
    }
    this.state.map = id;
    this.updateGateLook();
    this.ui.onMapChange();
    this.save();
  }

  updateGateLook() {
    const g = this.world.gate; if (!g) return;
    const open = this.gateOpen();
    g.mat.opacity = open ? 0.75 : 0.15;
    g.glow.material.opacity = open ? 0.5 : 0.08;
  }
  gateOpen() {
    if (this.mapId === 'home') return true;
    if (this.mapId === 3) return true; // 보스섬 게이트 = 귀환
    return this.state.unlocked > this.mapId + 1;
  }
  gateTarget() {
    if (this.mapId === 'home') return clamp(this.state.island | 0, 0, this.state.unlocked - 1);
    if (this.mapId === 3) return 'home';
    return this.mapId + 1;
  }

  // ---------------------------------------------------------
  // 정령
  rebuildSpirits() {
    for (const s of this.spirits) this.scene.remove(s.group);
    this.spirits = this.activeSpirits().map((el, i) => {
      const b = U.buildSpirit(el);
      this.scene.add(b.group);
      b.group.position.copy(this.h.pos).add(_v.set(0, 2, 0));
      return { el, group: b.group, core: b.core, cd: 1 + i * 0.3, trail: 0 };
    });
    this.masterRing.visible = this.master;
    const wasMaster = this._wasMaster;
    this._wasMaster = this.master;
    this.recompute();
    if (this.master && wasMaster === false) {
      this.ui.banner('🌈 엘레멘탈 마스터 발동!', '7대 정령 버프 1.5배 · 필살기 「엘레멘탈 버스트」 해금 [R]');
      for (let k = 0; k < 7; k++) FX.burst(_v.copy(this.h.pos).setY(1.5), new THREE.Color(D.ELEMENTS[D.ELEMENT_ORDER[k]].color), 30, 9, 1.2, { big: k % 2 === 0 });
    }
    this.ui.dirty = true;
  }

  // ---------------------------------------------------------
  // 몬스터
  spawnEnemy(type, pos, opts = {}) {
    const def = D.ENEMIES[type];
    const r = Models.buildEnemyModel(type, def) || U.buildEnemy(def);
    const sz = def.size;
    r.root.scale.setScalar(def.elite || def.boss ? sz * (def.shape === 'slime' ? 1 : 0.75) : sz);
    let p = pos;
    if (!p) {
      const sp = this.world.enemySpawns.filter((q) => d2(q, this.h.pos) > 14);
      p = (sp.length ? sp : this.world.enemySpawns)[randi(0, (sp.length || this.world.enemySpawns.length) - 1)].clone();
      p.x += rand(-3, 3); p.z += rand(-3, 3);
    }
    const bar = U.buildHpBar(def.boss ? 0 : def.elite ? 2.6 : 1.2, def.elite ? 0xffb030 : 0xff4a5a);
    this.scene.add(bar.group);
    const e = {
      type, def, ...r, bar, pos: p.clone(), yaw: rand(0, 6.28), hp: def.hp, maxHp: def.hp,
      radius: 0.5 * sz + 0.2, height: 1.2 * sz, atkCd: rand(0.5, 1.5), windup: 0, slowT: 0, stunT: 0,
      flash: 0, kx: 0, kz: 0, lean: 0, home: p.clone(), wanderT: 0, wanderTo: p.clone(), atkN: 0, phase: 0, dead: false, fly: def.fly || 0,
      elite: !!def.elite, boss: !!def.boss, summonedAdds: false, ...opts,
    };
    if (e.boss) { e.radius = 2.4; e.height = 4; this.boss = e; }
    if (e.elite) { e.radius = 0.5 * sz + 0.4; e.height = 1.5 * sz; }
    e.root.position.copy(e.pos);
    this.scene.add(e.root);
    this.enemies.push(e);
    FX.burst(_v.copy(e.pos).setY(0.5), 0x9a6aff, 14, 4, 0.6);
    return e;
  }

  // ---------------------------------------------------------
  // 채집물 / 정령 오브
  addNode(type, pos) {
    const obj = U.buildNode(type);
    obj.position.copy(pos); obj.rotation.y = rand(0, 6.28);
    this.scene.add(obj);
    this.nodes.push({ type, obj, pos: pos.clone(), hits: D.NODE_TYPES[type].hits, alive: true, respawnT: 0, shake: 0 });
  }
  addOrb(el, pos, locked) {
    const b = U.buildSpirit(el);
    const g = new THREE.Group(); g.add(b.group); b.group.scale.setScalar(2.2); b.group.position.y = 1.6;
    const ped = U.part(U.GEO.cyl, U.toon(0xe0d8f0), 0, 0.3, 0, 0.9, 0.6, 0.9, g);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.6, 48).rotateX(-Math.PI / 2), U.glowMat(D.ELEMENTS[el].color, 0.6));
    ring.position.y = 0.05; g.add(ring);
    const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshBasicMaterial({ color: 0x404050, wireframe: true, transparent: true, opacity: 0.8 }));
    cage.position.y = 1.6; g.add(cage);
    g.position.copy(pos);
    this.scene.add(g);
    this.orbs.push({ el, obj: g, spirit: b.group, cage, pos: pos.clone(), locked, ped });
  }

  // ---------------------------------------------------------
  // 전투: 피해 처리
  damageEnemy(e, base, o = {}) {
    if (e.dead) return 0;
    const st = this.stats;
    let crit = false;
    let dmg = base * rand(0.9, 1.1);
    if (o.canCrit !== false && Math.random() < st.crit) { crit = true; dmg *= st.critDmg; }
    if (this.h.dodgeBuff > 0 && (o.src === 'hero' || o.src === 'spirit')) dmg *= 1.25;   // 저스트 회피 반격 버프
    const def = e.def.def * (1 - st.defShred);
    dmg *= 100 / (100 + def * 2);
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    // 피격 플래시(흰→붉은색) · 스쿼시 · 부드러운 넉백 임펄스
    e.flash = Math.max(e.flash, o.src === 'hero' ? FLASH_T : FLASH_T * 0.6);
    if (o.slow) e.slowT = Math.max(e.slowT, o.slow);
    if (o.stun && !e.boss) e.stunT = Math.max(e.stunT, e.elite ? o.stun * 0.4 : o.stun);
    if (o.knock && !e.boss) {
      const k = _v.copy(e.pos).sub(o.from || this.h.pos).setY(0).normalize().multiplyScalar(o.knock * (e.elite ? 0.3 : 1) * KNOCK_DAMP);
      e.kx += k.x; e.kz += k.z;
    }
    if (o.src === 'hero') {
      this.combo.n++; this.combo.t = 2.6; this.ui.setCombo(this.combo.n);
      if (o.stop) this.hitStop = Math.max(this.hitStop, o.stop);
    }
    if (o.src === 'hero' && st.lifesteal > 0) this.healHero(dmg * st.lifesteal * 0.5, true);
    const tp = _v2.copy(e.pos).setY(e.pos.y + e.fly + e.height + 0.3);
    if (o.agg) {
      // 고속 연사: 탄마다 숫자를 띄우지 않고 0.15초 단위로 합산 표시 (DOM 노드 수 절감 + 가독성)
      e.aggD = (e.aggD || 0) + dmg; e.aggC = e.aggC || crit;
      if (e.aggT === undefined) e.aggT = this.time;
      if (e.hp <= 0 || this.time - e.aggT > 0.15) this.flushDmg(e);
    }
    else if (crit) FX.text(tp, dmg + '!', '#ffe040', 24, 0.9, 'crit');
    else FX.text(tp, String(dmg), o.color || (o.src === 'hero' ? '#ffffff' : '#bfe0ff'), o.src === 'hero' ? 18 : 15, 0.75);
    if (e.hp <= 0) this.killEnemy(e);
    else if (e.animator && e.windup <= 0 && Math.random() < 0.5) e.animator.trigger('hit', { force: false, ts: 1.6 });
    return dmg;
  }

  flushDmg(e) {
    if (!e.aggD) return;
    const tp = _v2.copy(e.pos).setY(e.pos.y + e.fly + e.height + 0.3);
    if (e.aggC) FX.text(tp, e.aggD + '!', '#ffe040', 22, 0.9, 'crit'); else FX.text(tp, String(e.aggD), '#fff8d0', 17, 0.7);
    e.aggD = 0; e.aggC = false; e.aggT = undefined;
  }
  // 피격 플래시: 인스턴스 전용 머티리얼의 emissive 를 흰색→붉은색으로 (폴백 모델은 깜빡임)
  flashEnemy(e, dt) {
    if (e.flash <= 0 && !e._fl) return;
    e.flash -= dt;
    const k = Math.max(0, e.flash / FLASH_T);
    if (e.mats) {
      const c = k > 0.55 ? C_WHITE : C_RED, a = Math.min(0.62, k * 0.9);   // 블룸에 타지 않을 정도로만
      for (const m of e.mats) {
        if (!m.emissive) continue;
        m.emissive.copy(m.userData.em0).lerp(c, a);
        m.emissiveIntensity = m.userData.ei0 + (1 - m.userData.ei0) * a;
      }
    } else e.root.visible = !(k > 0 && Math.floor(this.time * 40) % 2 === 0);
    // 맞는 순간 살짝 부풀었다 돌아오는 스쿼시
    if (e.animator) e.body.scale.setScalar(1 + 0.1 * k);
    e._fl = k > 0;
  }
  disposeEnemy(e) {
    if (e.mats) for (const m of e.mats) m.dispose();
    e.bar.fill.material.dispose(); e.bar.fill.parent.children[0].material.dispose();
  }

  killEnemy(e) {
    e.dead = true;
    this.scene.remove(e.bar.group);
    e.flash = FLASH_T * 1.4;
    if (e.animator && e.animator.has('death')) { e.root.visible = true; e.animator.trigger('death', { hold: true, ts: 1.3 }); this.dying.push({ e, t: 0 }); }
    else { this.scene.remove(e.root); this.disposeEnemy(e); }
    FX.flash(_v.copy(e.pos).setY(e.pos.y + e.fly + e.height * 0.5), e.def.color, e.boss ? 9 : e.elite ? 5 : 2.4, 0.14);
    const p = _v.copy(e.pos).setY(e.pos.y + e.fly + 0.8);
    FX.burst(p, e.def.color, e.boss ? 120 : e.elite ? 60 : 22, e.boss ? 14 : 7, 0.8, { big: e.elite || e.boss });
    FX.ring(e.pos, 0xffffff, e.boss ? 12 : e.elite ? 6 : 2.5, 0.5);
    // 보상
    const def = e.def, st = this.stats;
    this.dropLoot(e.pos, 'gold', randi(def.gold[0], def.gold[1]));
    for (const [mat, v] of Object.entries(def.drops)) {
      if (v >= 1) this.dropLoot(e.pos, mat, v);
      else if (Math.random() < v * st.drop) this.dropLoot(e.pos, mat, 1);
    }
    this.gainExp(def.exp);
    this.mapKills++; this.metric.kills++; if (e.elite || e.boss) this.metric.bigKills++;
    if (e.elite) {
      this.eliteCd = 45; this.mapKills = 0;
      const id = this.mapId;
      if (!this.state.eliteDown[id]) {
        this.state.eliteDown[id] = true;
        this.state.unlocked = Math.max(this.state.unlocked, id + 2);
        this.ui.banner(`${def.name} 처치!`, `북쪽 게이트 개방 → ${D.ISLANDS[id + 1].name}`);
        for (const o of this.orbs) if (o.locked) { o.locked = false; o.cage.visible = false; }
        this.updateGateLook();
      } else this.ui.toast(`${def.name} 처치! 보상 획득`);
    }
    if (e.boss) {
      this.state.bossKills++;
      this.boss = null; this.eliteCd = 90; this.mapKills = 0;
      this.ui.banner('🏆 공허룡 니힐 토벌!', `하늘섬에 평화가… (토벌 ${this.state.bossKills}회) · 게이트로 귀환 가능`);
    }
    this.save();
  }

  dropLoot(pos, mat, n) {
    // 골드는 한 덩이, 재료는 개수만큼 (최대 6)
    const pieces = mat === 'gold' ? 1 : Math.min(6, n);
    const per = mat === 'gold' ? n : 1;
    for (let i = 0; i < pieces; i++) {
      const amt = i === pieces - 1 && mat !== 'gold' ? n - (pieces - 1) : per;
      const col = D.MATS[mat].color;
      const g = new THREE.Group();
      const m = new THREE.Mesh(mat === 'gold' ? U.GEO.cyl : U.GEO.oct, U.glowMat(col));
      m.scale.set(0.2, mat === 'gold' ? 0.06 : 0.26, 0.2);
      if (mat === 'gold') m.rotation.x = Math.PI / 2;
      g.add(m); U.addGlow(g, col, 0.9, 0.7);
      g.position.copy(pos).setY(0.8);
      this.scene.add(g);
      this.pickups.push({ mesh: g, inner: m, pos: g.position, vel: new THREE.Vector3(rand(-3, 3), rand(5, 8), rand(-3, 3)), mat, amt, t: 0, magnet: false });
    }
  }

  gainExp(n) {
    const hs = this.state.hero;
    hs.exp += n;
    let up = false;
    while (hs.exp >= D.expNeed(hs.lv)) { hs.exp -= D.expNeed(hs.lv); hs.lv++; up = true; }
    if (up) {
      this.recompute();
      this.h.hp = this.stats.maxHp;
      this.ui.banner(`LEVEL UP! Lv.${hs.lv}`, '체력 완전 회복 · 능력치 상승');
      FX.burst(_v.copy(this.h.pos).setY(1), 0xffe060, 50, 7, 1.0, { up: 3 });
      FX.ring(this.h.pos, 0xffe060, 5, 0.6);
    }
    this.ui.dirty = true;
  }

  healHero(n, silent = false) {
    const h = this.h, st = this.stats;
    if (h.dead) return;
    const v = n * st.heal;
    const before = h.hp;
    h.hp = Math.min(st.maxHp, h.hp + v);
    if (!silent && h.hp - before >= 1) FX.text(_v.copy(h.pos).setY(2.3), '+' + Math.round(h.hp - before), '#6aff8a', 16);
  }

  // 주인공 피격 (서포터 제거 후 유일한 아군) — 부스터 돌진 무적 중 피격 = 저스트 회피
  hurtAlly(t, raw, from) {
    const h = this.h;
    if (t !== h || h.dead) return;
    if (h.iframe > 0) { if (h.dashT > 0) this.perfectDodge(from); return; }
    let dmg = raw * rand(0.9, 1.1) * (100 / (100 + this.stats.def * 1.5));
    dmg = Math.max(1, Math.round(dmg));
    if (h.shield > 0) { const a = Math.min(h.shield, dmg); h.shield -= a; dmg -= a; if (a > 0) FX.burst(_v.copy(h.pos).setY(1.2), 0x4ab0ff, 6, 3, 0.3); }
    h.hp -= dmg; h.lastHurt = this.time;
    this.metric.dmg += dmg; this.metric.hits++; this.metric.minR = Math.min(this.metric.minR, Math.max(0, h.hp) / this.stats.maxHp);
    if (dmg > 0) FX.text(_v.copy(h.pos).setY(2.2), '-' + dmg, '#ff5a6a', 18);
    if (this.stats.stagger && from && dmg > 0 && h.dashT <= 0) {
      h.pos.add(_v.copy(h.pos).sub(from).setY(0).normalize().multiplyScalar(0.35));
    }
    this.ui.hurtFlash();
    if (this.rig.animator && dmg > 0) this.rig.animator.trigger('hit', { force: false, ts: 1.5 });
    if (h.hp <= 0) this.heroDie();
    this.ui.dirty = true;
  }
  // 저스트 회피: 돌진 무적 시간에 공격을 흘리면 부스터 게이지 회복 + 2초간 피해 +25% + 짧은 슬로모션
  perfectDodge(from) {
    const h = this.h;
    if (h.dodgeCd > 0) return;
    h.dodgeCd = 0.9; h.dodgeBuff = 2;
    h.gauge = Math.min(this.stats.boostMax, h.gauge + 14);
    if (this.slowT <= 0) { this.slowT = 0.14; this.slowK = 0.35; }
    FX.text(_v.copy(h.pos).setY(2.5), '회피!', '#7fe8ff', 22, 0.8, 'crit');
    FX.ring(h.pos, 0x7fe8ff, 3, 0.35);
    this.dodges = (this.dodges || 0) + 1;
  }

  heroDie() {
    const h = this.h;
    h.dead = true; h.deadT = 3; h.hp = 0;
    this.rig.root.visible = false;
    FX.burst(_v.copy(h.pos).setY(1), 0xffffff, 50, 8, 1);
    this.ui.banner('쓰러졌다…', '3초 후 섬 입구에서 부활합니다');
  }

  // ---------------------------------------------------------
  // 메인 업데이트
  update(dt) {
    // 히트스톱(명중 시 0.03초 미세 정지) · 필살기 슬로모션 — 카메라/UI 는 실시간으로 계속 돈다
    const real = dt;
    if (this.hitStop > 0) { this.hitStop -= real; dt *= 0.04; }
    else if (this.slowT > 0) { this.slowT -= real; dt *= this.slowK; }
    if (this.combo.n > 0) { this.combo.t -= real; if (this.combo.t <= 0) { this.combo.n = 0; this.ui.setCombo(0); } }
    this.time += dt;
    const h = this.h;
    if (this.build.active) this.updateBuild();
    if (h.dead) {
      h.deadT -= dt;
      if (h.deadT <= 0) {
        h.dead = false; h.hp = this.stats.maxHp; h.pos.copy(this.world.spawn); h.iframe = 2;
        this.rig.root.visible = true;
        FX.burst(_v.copy(h.pos).setY(1), 0xfff0a0, 40, 6, 1, { up: 2 });
      }
    } else {
      this.updateAuto(dt);
      this.updateHero(dt);
    }
    this.updateSpirits(dt);
    this.updateEnemies(dt);
    this.updateDying(dt);
    if (this.mapId === 'home') this.updateNPCs(dt);
    this.updateProjectiles(dt);
    this.updateDelayed(dt);
    this.updatePickups(dt);
    this.updateNodes(dt);
    this.updateInteract(dt);
    this.updateSpawner(dt);
    this.updateCamera(real);
    this.animateHero(dt);
    this.updateShadows();
    FX.update(dt);
    this.sky.update(this.time);
    this.world.update(dt, this.time);
    if (this.rig.mixer) this.rig.mixer.update(dt);
    if (this.rig.vrm) this.rig.vrm.update(dt);
    if (this.state.gear.sword === 10 || this.state.gear.gun === 10 || this.state.gear.booster === 10) this.updateGearColors();
    this.ui.update(real);
    this.minimap.update(real);
    this.saveT += real;
    if (this.saveT > 10) { this.saveT = 0; this.save(); }
  }

  // 발밑 접촉 그림자 (주인공·소환수·몬스터·NPC) — InstancedMesh 한 번에 갱신
  updateShadows() {
    const h = this.h, w = this.world;
    FX.shadowBegin();
    if (!h.dead) {
      const gy = w.heightAt(h.pos.x, h.pos.z), air = Math.max(0, h.pos.y - gy);
      FX.shadow(h.pos.x, gy, h.pos.z, 0.62 * Math.max(0.35, 1 - air * 0.09));
    }
    for (const e of this.enemies) if (!e.dead) FX.shadow(e.pos.x, e.pos.y, e.pos.z, (e.radius + 0.25) * (e.fly ? 0.75 : 1.05));
    for (const d of this.dying) if (d.t < 1.4) FX.shadow(d.e.pos.x, d.e.pos.y, d.e.pos.z, (d.e.radius + 0.25) * (1 - d.t / 1.4));
    for (const n of this.npcs) FX.shadow(n.pos.x, w.heightAt(n.pos.x, n.pos.z), n.pos.z, 0.6);
    FX.shadowEnd();
  }

  // ---------------------------------------------------------
  // AUTO 모드 AI
  updateAuto(dt) {
    this.autoCmd = null;
    if (!this.state.auto || this.mapId === 'home' || this.build.active) return;
    const manual = this.input.isManual();
    this.ui.setAutoManual(manual);
    if (manual) return;
    const h = this.h, st = this.stats;
    const cmd = { move: null, attack: false, gun: false, dash: false, hover: false, skill: false, burst: false, face: null };
    const hpR = h.hp / st.maxHp;
    let near = null, nd = 1e9, cnt4 = 0, cnt12 = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = d2(e.pos, h.pos);
      if (d < 4.8) cnt4++;
      if (d < 12) cnt12++;
      // 강적 우선 가중치
      const w = d - (e.elite || e.boss ? 4 : 0);
      if (w < nd) { nd = w; near = e; }
    }
    const nearD = near ? d2(near.pos, h.pos) : 1e9;
    // 4) HP 낮으면 후퇴/회복 우선
    if (hpR < 0.3) this.autoRetreat = true;
    if (hpR > 0.65) this.autoRetreat = false;
    if (this.autoRetreat && near && nearD < 14) {
      const away = _v.copy(h.pos).sub(near.pos).setY(0).normalize();
      const toC = _v2.set(-h.pos.x, 0, -h.pos.z).normalize().multiplyScalar(h.pos.length() / this.world.R);
      away.add(toC).normalize();
      cmd.move = away.clone();
      if (nearD < 6 && h.gauge > 25 && h.dashCd <= 0) cmd.dash = true;
      if (nearD < 12) { cmd.gun = true; cmd.face = near.pos; }
      if (this.cds.skill <= 0 && cnt4 >= 1) cmd.skill = true;
      this.autoCmd = cmd; this.autoState = '회피·회복';
      return;
    }
    // 3) 주변 드랍 아이템 수거
    let pk = null, pd = 1e9;
    for (const p of this.pickups) { const d = d2(p.pos, h.pos); if (d < pd) { pd = d; pk = p; } }
    if (pk && pd < 16 && nearD > 6) {
      cmd.move = _v.copy(pk.pos).sub(h.pos).setY(0).normalize().clone();
      this.autoCmd = cmd; this.autoState = '아이템 수거';
      return;
    }
    // 0) 부스터 대시 회피: 근접 공격 직전(예고 0.18초 이내)이면 옆으로 돌진해 무적 시간으로 흘린다
    if (h.gauge >= 18 && h.dashCd <= 0 && !this.noAutoDodge) {
      for (const e of this.enemies) {
        if (e.dead || e.windup <= 0 || e.windup > 0.18) continue;
        const slam = e.pattern === 'slam' || (e.boss && e.pattern === 2);
        if (e.def.ranged && !slam) continue;
        const R2 = slam ? (e.boss ? 8 : 4.5) + 0.5 : e.def.range + 1.8 + e.radius;
        const d = d2(e.pos, h.pos);
        if (d > R2) continue;
        const away = _v.copy(h.pos).sub(e.pos).setY(0).normalize();
        const side = _v2.set(away.z, 0, -away.x).multiplyScalar(((this.time * 7) | 0) % 2 ? 1 : -1);
        cmd.move = (slam ? away : side.add(away.multiplyScalar(0.4))).normalize().clone();
        cmd.dash = true; cmd.face = e.pos;
        this.autoCmd = cmd; this.autoState = '부스터 회피';
        return;
      }
    }
    // 1)~2) 몬스터 추적 및 전투
    if (near && nearD < 40) {
      const dir = _v.copy(near.pos).sub(h.pos).setY(0).normalize().clone();
      const surf = nearD - near.radius;
      cmd.target = near;
      if (nearD > 15) {
        cmd.move = dir;
        if (h.gauge > 35 && h.dashCd <= 0) cmd.dash = true;  // 곰인형 부스터 고속 돌진
        this.autoState = '부스터 추적';
      } else {
        // 거리 기반 자동 무기 전환: 3.5m 초과 = 권총 연사하며 접근, 이내 = 검 3연타
        cmd.attack = true; cmd.face = near.pos;
        if (surf > 2.4) cmd.move = dir;
        this.autoState = surf > SWITCH_RANGE ? '권총 연사' : '검 3연타';
      }
      if (near.fly > 1 && nearD < 10) cmd.move = nearD < 5 ? null : dir;   // 공중 몬스터는 권총으로 (updateHero 에서 판정)
      if (this.cds.skill <= 0 && cnt4 >= 2) cmd.skill = true;
      if (this.master && this.cds.burst <= 0 && ((near.elite || near.boss) && nearD < 12 || cnt12 >= 3)) cmd.burst = true;
      this.autoCmd = cmd;
      return;
    }
    // 3) 채집
    let nn = null, ndd = 1e9;
    for (const n of this.nodes) { if (!n.alive) continue; const d = d2(n.pos, h.pos); if (d < ndd) { ndd = d; nn = n; } }
    if (nn) {
      if (ndd > 2.4) {
        cmd.move = _v.copy(nn.pos).sub(h.pos).setY(0).normalize().clone();
        if (ndd > 16 && h.gauge > 50 && h.dashCd <= 0) cmd.dash = true;
      } else { cmd.attack = true; cmd.face = nn.pos; }
      this.autoCmd = cmd; this.autoState = '채집';
      return;
    }
    // 정령 오브 수집
    const orb = this.orbs.find((o) => !o.locked);
    if (orb) { cmd.move = _v.copy(orb.pos).sub(h.pos).setY(0).normalize().clone(); this.autoCmd = cmd; this.autoState = '정령 찾기'; return; }
    this.autoState = '대기';
    this.autoCmd = cmd;
  }

  // ---------------------------------------------------------
  // 주인공
  updateHero(dt) {
    const h = this.h, st = this.stats, inp = this.input, A = this.autoCmd;
    h.iframe -= dt; h.dashCd -= dt; this.cds.skill -= dt; this.cds.burst -= dt;
    h.dodgeCd -= dt; if (h.dodgeBuff > 0) h.dodgeBuff -= dt;
    // 이동 입력 (카메라 기준)
    const mv = inp.getMove();
    const fwd = _v.set(-Math.sin(this.cam.yaw), 0, -Math.cos(this.cam.yaw));
    const right = _v2.set(Math.cos(this.cam.yaw), 0, -Math.sin(this.cam.yaw));
    const move = new THREE.Vector3();
    if (mv.x || mv.y) move.addScaledVector(fwd, mv.y).addScaledVector(right, mv.x);
    else if (A && A.move) move.copy(A.move);
    const mlen = Math.min(1, move.length());
    if (mlen > 0.01) move.normalize();

    const atkHeld = inp.consume('attack') || inp.held.attack || (A && A.attack);
    let gunHeld = inp.held.gun || (A && A.gun);
    // ---- 거리 기반 자동 무기 전환 ----
    // 공격 입력 하나로: 적 표면까지 3.5m 초과 → 왼손 권총 연사 / 이내 → 오른손 검 3연타 (경계에서 떨림 방지 히스테리시스 0.4m)
    let atkPress = false, aim = null;
    if (atkHeld) {
      aim = (A && A.target && !A.target.dead) ? A.target : this.aimTarget(22, 1.6);
      if (!aim) atkPress = true;                                   // 적 없음 → 검 (채집·허공 베기)
      else {
        const surf = d2(aim.pos, h.pos) - aim.radius;
        const lim = SWITCH_RANGE + (h.weapon === 'sword' ? 0.4 : 0);
        let useGun = surf > lim || aim.fly > 1.5;
        if (useGun && surf > 8 && !A) {                            // 수동: 바로 앞 채집물이 있으면 검 우선
          for (const n of this.nodes) if (n.alive && d2(n.pos, h.pos) < 3) { useGun = false; break; }
        }
        if (useGun) gunHeld = true; else atkPress = true;
      }
    }
    const dashPress = inp.consume('dash') || (A && A.dash);
    const hoverHeld = inp.hovering() || (A && A.hover);
    const skillPress = inp.consume('skill') || (A && A.skill);
    const burstPress = inp.consume('burst') || (A && A.burst);

    // 부스터 돌진
    if (dashPress && h.dashCd <= 0 && h.gauge >= 18) {
      h.gauge -= 18; h.dashT = 0.28; h.dashCd = 0.4; h.iframe = Math.max(h.iframe, 0.34);   // 1인 전투: 회피 무적 0.3 → 0.34초
      h.dashDir.copy(mlen > 0.01 ? move : _v3.set(Math.sin(h.yaw), 0, Math.cos(h.yaw)));
      FX.ring(h.pos, this.plasmaColor(), 2.5, 0.3);
      h.ghostT = 0; this.camFx.punch = 1;
    }
    // 공중 부양 (지면 높이 기준)
    const gy = this.world.heightAt(h.pos.x, h.pos.z);
    h.hovering = hoverHeld && h.gauge > 0;
    if (h.hovering) {
      h.vy += (8 - h.vy) * Math.min(1, dt * 6);
      h.gauge -= 26 * dt;
      if (h.pos.y > gy + 5) h.vy = Math.min(h.vy, 0);
    } else {
      h.vy -= 26 * dt;
    }
    h.pos.y += h.vy * dt;
    if (h.pos.y <= gy || (h.grounded && !h.hovering && h.vy <= 0 && h.pos.y - gy < 0.45)) { h.pos.y = gy; h.vy = 0; h.grounded = true; } else h.grounded = false;
    // 게이지 회복
    if (!h.hovering && h.dashT <= 0) h.gauge = Math.min(st.boostMax, h.gauge + (h.grounded ? 32 : 10) * dt);

    // 이동
    const swinging = h.swingT > 0;
    let spd = st.moveSpd * (swinging ? 0.4 : 1) * (h.firingT > 0 ? 0.85 : 1) * (h.hovering ? 1.25 : 1);
    if (h.dashT > 0) {
      h.dashT -= dt;
      h.pos.addScaledVector(h.dashDir, 30 * st.dashMul * dt);
      h.yaw = angLerp(h.yaw, Math.atan2(h.dashDir.x, h.dashDir.z), dt * 20);
      const back = _v3.set(-Math.sin(h.yaw) * 0.4, 1.0 + h.pos.y, -Math.cos(h.yaw) * 0.4).add(_v.set(h.pos.x, 0, h.pos.z));
      FX.burst(back, Math.random() < 0.5 ? 0x7fe8ff : this.plasmaColor(), MOBILE ? 2 : 4, 2, 0.35);
    } else if (mlen > 0.01) {
      h.pos.addScaledVector(move, spd * mlen * dt);
    }
    h.moving = h.dashT > 0 ? 2 : mlen;

    // 방향
    let faceTarget = null;
    if (A && A.face && !(mv.x || mv.y)) faceTarget = A.face;
    // 사격 (자동 조준 보조)
    h.firingT -= dt; h.gunCd -= dt; h.recoil = Math.max(0, h.recoil - dt * 9);
    if (gunHeld && !swinging) {
      const tgt = aim || this.aimTarget(22, 1.4);
      if (tgt) faceTarget = tgt.pos;
      h.firingT = 0.22; this.setWeapon('gun');
      if (h.gunCd <= 0) { this.fireGun(tgt); h.gunCd = 1 / (st.gunRate * st.atkSpd); }
    }
    // 검 3연타
    h.comboT -= dt;
    if (atkPress) {
      if (h.swingT <= 0) this.startSwing();
      else if (h.swingT < h.swingDur * 0.6) h.queued = true;
    }
    if (h.swingT > 0) {
      h.swingT -= dt;
      if (!h.hitDone && h.swingT <= h.swingDur * 0.5) { h.hitDone = true; this.swordHit(); }
      if (h.swingT <= 0 && h.queued) { h.queued = false; this.startSwing(); }
    }
    // 회전베기
    if (skillPress && this.cds.skill <= 0) this.spinSkill();
    if (h.spinT > 0) h.spinT -= dt;
    // 엘레멘탈 버스트
    if (burstPress) {
      if (!this.master) { if (inp.keys.has('KeyR')) this.ui.toast('🌈 7대 정령을 모두 모으면 엘레멘탈 버스트가 해금됩니다'); }
      else if (this.cds.burst <= 0) this.elementalBurst();
    }

    if (h.swingT > 0 && h.swingTarget) faceTarget = h.swingTarget;
    if (faceTarget) h.yaw = angLerp(h.yaw, yawTo(h.pos, faceTarget), dt * 18);
    else if (mlen > 0.01 && h.dashT <= 0) h.yaw = angLerp(h.yaw, Math.atan2(move.x, move.z), dt * 14);

    // 섬 경계
    const R = this.world.R - 1.2;
    const hd = Math.hypot(h.pos.x, h.pos.z);
    if (hd > R) { h.pos.x *= R / hd; h.pos.z *= R / hd; }
    if (this.mapId === 'home') this.collideHouse(h.pos);

    // 재생 / 물 정령 보호막
    const combat = this.time - h.lastHurt < 5;
    this.healHero(st.maxHp * (st.regen + (combat ? 0 : 0.03)) * dt, true);
    if (st.shieldPct > 0) {
      h.shieldT -= dt;
      if (h.shieldT <= 0) { h.shieldT = 10; h.shield = st.maxHp * st.shieldPct; FX.ring(h.pos, 0x4ab0ff, 2, 0.4); }
    } else h.shield = 0;
  }

  collideHouse(p) {
    const b = this.world.houseBox;
    if (b) {
      if (p.x > b[0] && p.x < b[1] && p.z > b[2] && p.z < b[3]) {
        const d = [p.x - b[0], b[1] - p.x, p.z - b[2], b[3] - p.z], m = Math.min(...d);
        if (m === d[0]) p.x = b[0]; else if (m === d[1]) p.x = b[1]; else if (m === d[2]) p.z = b[2]; else p.z = b[3];
      }
      return;
    }
    // 오두막 (x:-4.7~4.7, z:-17.7~-12.3)
    if (p.x > -5.2 && p.x < 5.2 && p.z > -18 && p.z < -12) {
      const dz = p.z - -12, dx1 = p.x + 5.2, dx2 = 5.2 - p.x;
      const m = Math.min(Math.abs(dz), dx1, dx2);
      if (m === Math.abs(dz)) p.z = -12; else if (m === dx1) p.x = -5.2; else p.x = 5.2;
    }
  }

  aimTarget(range, cone) {
    const h = this.h;
    let best = null, bs = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = d2(e.pos, h.pos);
      if (d > range) continue;
      let da = Math.abs(angLerp(0, yawTo(h.pos, e.pos) - h.yaw, 1));
      const score = d + (da > cone ? 8 : da * 3);
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }

  setWeapon(w) {
    if (this.h.weapon === w) return;
    this.h.weapon = w; this.ui.setWeapon(w);
  }
  // 부스터 플라즈마 색 (기본 파랑, 강화 시 강화 색)
  plasmaColor() { return this.state.gear.booster ? this.gearColor('booster') : 0x3a9cff; }
  bindGhosts() {
    const r = this.rig, list = [];
    // 고폴리 메시는 저폴리 프록시 지오메트리로 잔상을 그린다 (hero.js buildProxies)
    if (r.model) r.model.traverse((o) => {
      if (!o.isMesh || o.userData.proxy) return;
      const pm = o.userData.proxyMesh;
      list.push(pm ? { geometry: pm.geometry, matrixWorld: o.matrixWorld, updateWorldMatrix: (a, b) => o.updateWorldMatrix(a, b) } : o);
    });
    FX.setGhostSources(list.some((m) => !m.isSkinnedMesh) ? list : [r.body]);
  }

  startSwing() {
    const h = this.h, st = this.stats;
    h.combo = h.comboT > 0 ? (h.combo + 1) % 3 : 0;
    // 초고속 3연타: 0.15s · 0.15s · 0.21s (공속 버프로 더 빨라짐)
    h.swingDur = (h.combo === 2 ? 0.21 : 0.15) / st.atkSpd;
    h.swingT = h.swingDur; h.comboT = h.swingDur + 0.4; h.hitDone = false;
    this.setWeapon('sword');
    // 소프트 락온
    const t = this.aimTarget(5, 1.6);
    h.swingTarget = t ? t.pos.clone() : null;
    if (!t) {
      let nn = null, nd = 3.2;
      for (const n of this.nodes) if (n.alive) { const d = d2(n.pos, h.pos); if (d < nd) { nd = d; nn = n; } }
      if (nn) h.swingTarget = nn.pos.clone();
    }
    // 전진 스텝
    const step = h.combo === 2 ? 0.9 : 0.45;
    h.pos.x += Math.sin(h.yaw) * step; h.pos.z += Math.cos(h.yaw) * step;
  }

  swordHit() {
    const h = this.h, st = this.stats, c = h.combo;
    const range = c === 2 ? 3.6 : 3.0, arc = c === 2 ? Math.PI * 0.75 : Math.PI * 0.5;
    const mult = [0.8, 0.92, 1.55][c];   // 스윙이 약 45% 빨라진 만큼 타당 배율을 낮춰 DPS 는 소폭(+12%) 상승에 그치게
    const color = this.gearColor('sword');
    const center = _v.set(h.pos.x, h.pos.y + 1.05, h.pos.z);
    // 타마다 다른 초승달 검기: ① 우상→좌하 대각선 ② 좌상→우하 대각선 ③ 넓은 가로 베기 + 전방으로 날아가는 검기
    const life = Math.max(0.14, h.swingDur * 1.15);
    if (c === 0) FX.crescent(center, h.yaw, color, range, -0.62, 1, { life });
    else if (c === 1) FX.crescent(center, h.yaw, color, range, 0.62, -1, { life });
    else {
      FX.crescent(center, h.yaw, color, range * 1.08, 0.06, 1, { life: life * 1.2, wide: true });
      FX.crescent(center, h.yaw, color, range * 0.8, -0.06, 1, { life: 0.3, fly: 16, sweep: 0.25, grow: 0.5, alpha: 2.2 });
    }
    // 바람 가르는 궤적 파티클
    const sd = c === 1 ? -1 : 1, fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
    FX.burst(_v2.set(h.pos.x + fx * range * 0.7, h.pos.y + 1.05, h.pos.z + fz * range * 0.7), 0xffffff, MOBILE ? 3 : 6, 3, 0.22,
      { dir: _v3.set(fz * 9 * sd, c === 2 ? 0 : -3, -fx * 9 * sd), spread: 1.2 });
    let hit = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = d2(e.pos, h.pos) - e.radius;
      if (d > range || Math.abs(e.pos.y + e.fly - h.pos.y) > 3.2) continue;
      const da = Math.abs(angLerp(0, yawTo(h.pos, e.pos) - h.yaw, 1));
      if (da > arc && d > 0.8) continue;
      this.damageEnemy(e, st.atk * st.swordMul * mult, { src: 'hero', knock: c === 2 ? 1.5 : 0.45, stop: c === 2 ? 0.055 : 0.03 });
      const hp = _v2.copy(e.pos).setY(e.pos.y + e.fly + e.height * 0.6);
      FX.burst(hp, color, MOBILE ? 5 : 8, 6, 0.35);
      FX.flash(hp, color, c === 2 ? 1.7 : 1.1, 0.08);
      hit++;
    }
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const d = d2(n.pos, h.pos);
      if (d > range + 0.6) continue;
      const da = Math.abs(angLerp(0, yawTo(h.pos, n.pos) - h.yaw, 1));
      if (da > arc + 0.3 && d > 1.4) continue;
      this.hitNode(n);
    }
    if (hit && c === 2) this.ui.shake(0.15);
  }

  hitNode(n) {
    n.hits--; n.shake = 0.25;
    const col = { tree: 0x7ad04a, ore: 0xc8d0dc, crystal: 0x4ad8ff, spiritOre: 0xd070ff }[n.type];
    FX.burst(_v.copy(n.pos).setY(1), col, 10, 5, 0.4);
    if (n.hits <= 0) {
      n.alive = false; n.obj.visible = false; n.respawnT = 25;
      for (const [mat, [a, b]] of Object.entries(D.NODE_TYPES[n.type].gives)) this.dropLoot(n.pos, mat, randi(a, b));
      FX.burst(_v.copy(n.pos).setY(1), col, 24, 7, 0.6);
      this.gainExp(3);
    }
  }

  fireGun(tgt) {
    const h = this.h, st = this.stats;
    const muzzle = this.rig.gun.muzzle.getWorldPosition(new THREE.Vector3());
    let dir;
    if (tgt) dir = _v.copy(tgt.pos).setY(tgt.pos.y + tgt.fly + tgt.height * 0.55).sub(muzzle).normalize();
    else dir = _v.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    dir.x += rand(-0.03, 0.03); dir.z += rand(-0.03, 0.03); dir.normalize();
    const color = this.gearColor('gun') === 0xffffff ? 0xffd870 : this.gearColor('gun');
    // 총구 화염 + 빛나는 탄환 트레일(인스턴스 풀) — 탄속 72m/s 고속탄
    FX.muzzle(muzzle, dir, color);
    this.spawnProj({ pos: muzzle, vel: dir.multiplyScalar(72), team: 'ally', dmg: st.atk * 0.24 * st.gunMul, color, size: 0.09, life: 0.42, src: 'hero', tracer: true });
    h.recoil = 1;
  }

  spinSkill() {
    const h = this.h, st = this.stats;
    this.cds.skill = 6 * st.cdMult;
    h.spinT = 0.45;
    const color = this.gearColor('sword');
    FX.slash(_v.set(h.pos.x, h.pos.y + 0.9, h.pos.z), h.yaw, color, 4.8, 0, true);
    FX.ring(h.pos, color, 5, 0.4);
    for (const e of this.enemies) {
      if (e.dead || d2(e.pos, h.pos) - e.radius > 4.8) continue;
      this.damageEnemy(e, st.atk * st.swordMul * 2.4, { src: 'hero', knock: 2, stop: 0.05 });
      FX.flash(_v2.copy(e.pos).setY(e.pos.y + e.fly + e.height * 0.6), color, 1.8, 0.09);
    }
    FX.crescent(_v.set(h.pos.x, h.pos.y + 1.0, h.pos.z), h.yaw, color, 4.6, 0.12, 1, { life: 0.3, wide: true });
    FX.crescent(_v.set(h.pos.x, h.pos.y + 1.0, h.pos.z), h.yaw + Math.PI, color, 4.6, -0.12, 1, { life: 0.3, wide: true });
    for (const n of this.nodes) if (n.alive && d2(n.pos, h.pos) < 4.5) this.hitNode(n);
    this.ui.shake(0.2);
  }

  elementalBurst() {
    const h = this.h, st = this.stats;
    this.cds.burst = 25 * st.cdMult;
    h.iframe = 1.2;
    this.ui.banner('🌈 엘레멘탈 버스트!', '', 1.2);
    // 연출: ① 줌인 + 슬로모션 + 화면 플래시(기 모으기) → ② 0.22초 뒤 폭발: 강한 플래시 · 줌아웃 펀치 · 흔들림
    this.camFx.burstT = 1.15;
    this.slowT = 0.32; this.slowK = 0.22;
    this.ui.screenFlash(0.55, 0.35);
    FX.flash(_v.copy(h.pos).setY(h.pos.y + 1.3), 0xffffff, 5, 0.3);
    D.ELEMENT_ORDER.forEach((el, i) => {
      const c = D.ELEMENTS[el].color;
      this.delayed.push({ t: 0.05 + i * 0.03, fn: () => FX.ring(this.h.pos, c, 6 + i * 1.6, 0.7) });
      FX.burst(_v.copy(h.pos).setY(h.pos.y + 1.5), c, MOBILE ? 10 : 20, 12, 1.0, { big: true });
    });
    this.delayed.push({ t: 0.085, fn: () => {
      this.ui.screenFlash(0.9, 0.5);
      this.ui.shake(0.55);
      this.camFx.punch = 1.6;
      const targets = this.enemies.filter((e) => !e.dead && d2(e.pos, this.h.pos) < 16);
      targets.forEach((e, i) => {
        const el = D.ELEMENT_ORDER[i % 7];
        FX.pillar(e.pos, D.ELEMENTS[el].color, 1.2, 18, 0.7);
        FX.flash(_v2.copy(e.pos).setY(e.pos.y + e.fly + e.height * 0.5), D.ELEMENTS[el].color, 3.5, 0.2);
        this.damageEnemy(e, st.atk * 7 * st.spiritPower, { src: 'hero', stun: 1.5, color: D.ELEMENTS[el].css, stop: 0.08 });
      });
    } });
  }

  // ---------------------------------------------------------
  // 정령 (궤도 공전 + 보조 공격)
  updateSpirits(dt) {
    const h = this.h, n = this.spirits.length, master = this.master;
    const base = this.time * (master ? 1.6 : 1.1);
    const R = master ? 2.25 : 1.35;
    this.masterRing.position.set(h.pos.x, h.pos.y + 1.6 + Math.sin(this.time * 2) * 0.05, h.pos.z);
    this.masterRing.rotation.z += dt * 1.6;
    this.masterRing.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.25;
    this.spirits.forEach((s, i) => {
      const a = base + (i / n) * Math.PI * 2;
      const tx = h.pos.x + Math.cos(a) * R, tz = h.pos.z + Math.sin(a) * R;
      const ty = h.pos.y + 1.6 + Math.sin(this.time * 2.4 + i) * 0.18;
      s.group.position.x += (tx - s.group.position.x) * Math.min(1, dt * 8);
      s.group.position.y += (ty - s.group.position.y) * Math.min(1, dt * 8);
      s.group.position.z += (tz - s.group.position.z) * Math.min(1, dt * 8);
      s.core.rotation.y = this.time * 2 + i;
      s.trail -= dt;
      if (s.trail <= 0) { s.trail = 0.06; FX.burst(s.group.position, D.ELEMENTS[s.el].color, 1, 0.4, 0.5); }
      if (h.dead || this.mapId === 'home') return;
      s.cd -= dt;
      if (s.cd <= 0) {
        const t = this.nearestEnemy(s.group.position, 16);
        if (t) this.spiritAttack(s, t); else s.cd = 0.3;
      }
    });
  }
  nearestEnemy(p, range, exclude) {
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (e.dead || (exclude && exclude.has(e))) continue;
      const d = d2(e.pos, p);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  spiritAttack(s, t) {
    const st = this.stats, P = st.spiritPower, atk = st.atk * P;
    const from = s.group.position.clone();
    const tp = t.pos.clone().setY(t.pos.y + t.fly + t.height * 0.5);
    const dir = tp.clone().sub(from).normalize();
    const c = D.ELEMENTS[s.el].color;
    const cdm = st.cdMult;
    switch (s.el) {
      case 'fire':
        this.spawnProj({ pos: from, vel: dir.multiplyScalar(20), team: 'ally', dmg: atk * 0.55, color: c, size: 0.22, life: 1.2, aoe: 2.2, src: 'spirit', trail: 0xffa040 });
        s.cd = 1.6 * cdm; break;
      case 'wind':
        this.spawnProj({ pos: from.setY(0.8), vel: dir.setY(0).normalize().multiplyScalar(13), team: 'ally', dmg: atk * 0.45, color: c, size: 0.4, life: 1.4, pierce: 5, src: 'spirit', spin: true, trail: c });
        s.cd = 2.4 * cdm; break;
      case 'water':
        this.spawnProj({ pos: from, vel: dir.multiplyScalar(16), team: 'ally', dmg: atk * 0.4, color: c, size: 0.2, life: 1.3, slow: 2.5, src: 'spirit', trail: c });
        s.cd = 1.8 * cdm; break;
      case 'thunder': {
        const hit = new Set(); let cur = t, prev = from;
        for (let k = 0; k < 4 && cur; k++) {
          const p = cur.pos.clone().setY(cur.pos.y + cur.fly + cur.height * 0.5);
          FX.beam(prev, p, c, 0.08, 0.2, true);
          this.damageEnemy(cur, atk * 0.5, { src: 'spirit', color: '#ffe14a' });
          hit.add(cur); prev = p;
          cur = this.nearestEnemy(cur.pos, 7, hit);
        }
        s.cd = 2.2 * cdm; break;
      }
      case 'earth':
        FX.telegraph(t.pos, c, 3.2, 0.35);
        this.delayed.push({ t: 0.35, fn: () => {
          FX.ring(t.pos, c, 3.6, 0.4); FX.burst(_v.copy(t.pos).setY(0.3), c, 18, 6, 0.5, { up: 3, grav: 12 });
          for (const e of this.enemies) if (!e.dead && d2(e.pos, t.pos) < 3.4) this.damageEnemy(e, atk * 0.7, { src: 'spirit', stun: 1.2, color: '#d09a5a' });
        } });
        s.cd = 4 * cdm; break;
      case 'light': {
        const end = from.clone().addScaledVector(dir, 20);
        FX.beam(from, end, c, 0.16, 0.3);
        const line = new THREE.Line3(from, end), cp = new THREE.Vector3();
        for (const e of this.enemies) {
          if (e.dead) continue;
          line.closestPointToPoint(_v.copy(e.pos).setY(e.pos.y + e.fly + e.height * 0.5), true, cp);
          if (cp.distanceTo(_v) < e.radius + 0.6) this.damageEnemy(e, atk * 0.8, { src: 'spirit', color: '#fff2a0' });
        }
        s.cd = 2.8 * cdm; break;
      }
      case 'dark':
        this.spawnProj({ pos: from, vel: dir.multiplyScalar(11), team: 'ally', dmg: atk * 0.5, color: c, size: 0.2, life: 2.5, homing: t, src: 'spirit', trail: 0x5a2aa0 });
        s.cd = 1.5 * cdm; break;
    }
  }

  // ---------------------------------------------------------
  // 몬스터 AI
  updateEnemies(dt) {
    const h = this.h;
    const camQ = this.camera.quaternion;
    // 1인 전투 공격 슬롯: 일반 몬스터는 동시에 최대 SOLO.maxAttackers 마리만 공격 예고에 들어간다 (수호자·보스 제외)
    let busy = 0;
    for (const e of this.enemies) if (!e.dead && e.windup > 0 && !e.elite && !e.boss) busy++;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.atkCd -= dt; e.slowT -= dt;
      const def = e.def;
      let speed = def.speed * (e.slowT > 0 ? 0.5 : 1);
      // 타겟 선정
      let target = null, td = 1e9;
      const aggro = e.boss ? 40 : e.elite ? 24 : D.SOLO.aggro;
      if (!h.dead) { const d = d2(e.pos, h.pos); if (d < aggro || (e.hp < e.maxHp && d < aggro * 1.6)) { target = h; td = d; } }
      let moving = false;
      if (e.stunT > 0) {
        e.stunT -= dt;
        if (Math.random() < 0.2) FX.burst(_v.copy(e.pos).setY(e.pos.y + e.fly + e.height + 0.3), 0xffe080, 1, 1, 0.4);
      } else if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) this.enemyAttack(e, target);
      } else if (target) {
        const reach = def.range + (target === h ? 0.4 : 0.6) + (e.boss ? 1 : 0);
        if (td > reach) {
          const dir = _v.copy(target.pos).sub(e.pos).setY(0).normalize();
          e.pos.addScaledVector(dir, speed * dt); moving = true;
        } else if (def.ranged && td < 4 && !e.boss) {
          const dir = _v.copy(e.pos).sub(target.pos).setY(0).normalize();
          e.pos.addScaledVector(dir, speed * 0.6 * dt); moving = true;
        }
        e.yaw = angLerp(e.yaw, yawTo(e.pos, target.pos), dt * 8);
        if (td <= reach + 0.3 && e.atkCd <= 0 && !e.elite && !e.boss && busy >= D.SOLO.maxAttackers) {
          e.atkCd = rand(0.3, 0.7);                                   // 슬롯이 빌 때까지 대기 (포위 시 동시 타격 방지)
        } else if (td <= reach + 0.3 && e.atkCd <= 0) {
          if (!e.elite && !e.boss) busy++;
          e.windup = e.boss ? 0.7 : e.elite ? 0.55 : 0.45;
          e.atkCd = def.atkCd; e.atkN++;
          e.curTarget = target;
          this.enemyWindupFx(e);
        }
      } else {
        e.wanderT -= dt;
        if (e.wanderT <= 0) { e.wanderT = rand(2, 5); e.wanderTo.copy(e.home).add(_v.set(rand(-5, 5), 0, rand(-5, 5))); }
        if (d2(e.pos, e.wanderTo) > 0.5) {
          const dir = _v.copy(e.wanderTo).sub(e.pos).setY(0).normalize();
          e.pos.addScaledVector(dir, speed * 0.35 * dt); moving = true;
          e.yaw = angLerp(e.yaw, Math.atan2(dir.x, dir.z), dt * 4);
        }
      }
      // 보스 페이즈: 50% 이하에서 기사 소환
      if (e.boss && !e.summonedAdds && e.hp < e.maxHp * 0.5) {
        e.summonedAdds = true;
        this.ui.banner('공허룡의 포효!', '어둠 기사들이 소환되었다');
        for (let k = 0; k < D.SOLO.bossAdds; k++) this.spawnEnemy('knight', e.pos.clone().add(_v.set(rand(-6, 6), 0, rand(-6, 6))));
      }
      if (e.aggD && this.time - e.aggT > 0.15) this.flushDmg(e);
      // 넉백 임펄스 (살짝 밀려났다가 감쇠)
      if (e.kx || e.kz) {
        e.pos.x += e.kx * dt; e.pos.z += e.kz * dt;
        const kd = Math.exp(-KNOCK_DAMP * dt); e.kx *= kd; e.kz *= kd;
        if (Math.abs(e.kx) + Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
      }
      // 분리
      for (const o of this.enemies) {
        if (o === e || o.dead) continue;
        const dd = d2(o.pos, e.pos), min = o.radius + e.radius;
        if (dd < min && dd > 0.001) e.pos.addScaledVector(_v.copy(e.pos).sub(o.pos).setY(0).normalize(), (min - dd) * 0.5);
      }
      const R = this.world.R - 1.5, ed = Math.hypot(e.pos.x, e.pos.z);
      if (ed > R) { e.pos.x *= R / ed; e.pos.z *= R / ed; }
      // 비주얼
      e.pos.y = this.world.heightAt(e.pos.x, e.pos.z);
      e.root.position.set(e.pos.x, e.pos.y + e.fly + (e.fly ? Math.sin(this.time * 3 + e.home.x) * 0.25 : 0), e.pos.z);
      e.root.rotation.y = e.yaw;
      const t = this.time + e.home.x;
      if (e.animator) {
        e.animator.loop(moving ? 'run' : 'idle', moving ? (e.slowT > 0 ? 0.6 : 1.1) : 1);
        e.animator.update(e.stunT > 0 ? dt * 0.25 : dt);
      } else if (def.shape === 'slime') { const sq = moving ? Math.abs(Math.sin(t * 8)) : Math.sin(t * 3) * 0.3 + 0.3; e.body.scale.set(1 + sq * 0.12, 1 - sq * 0.15, 1 + sq * 0.12); e.body.position.y = moving ? Math.abs(Math.sin(t * 8)) * 0.3 : 0; }
      else e.body.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.08 : 0;
      for (const w of e.flaps) w.rotation.z = Math.sin(t * (def.shape === 'bat' ? 18 : 4)) * 0.5 * w.userData.side;
      if (e.animator) {
        // 추격 시 앞으로 기울고, 피격 순간 뒤로 젖혀짐
        e.lean += ((moving && target ? 0.13 : 0) - e.lean) * Math.min(1, dt * 8);
        e.body.rotation.x = e.lean - Math.max(0, e.flash / FLASH_T) * 0.28;
        e.atkFlashT = Math.max(0, (e.atkFlashT || 0) - dt);
      }
      else if (e.windup > 0) { e.body.rotation.x = -0.25; }
      else if (e.atkFlashT > 0) { e.atkFlashT -= dt; e.body.rotation.x = 0.35; }
      else e.body.rotation.x = 0;
      if (e.weapon) e.weapon.rotation.x = e.windup > 0 ? -1.2 : (e.atkFlashT > 0 ? 0.6 : 0);
      this.flashEnemy(e, dt);
      // HP 바
      if (e.bar.width > 0) {
        e.bar.group.position.set(e.pos.x, e.root.position.y + e.height + 0.9 * (e.elite ? 2.2 : 1), e.pos.z);
        e.bar.group.quaternion.copy(camQ);
        e.bar.fill.scale.x = e.bar.width * Math.max(0, e.hp / e.maxHp);
        e.bar.group.visible = e.hp < e.maxHp || e.elite;
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (busy > (this._maxBusy || 0)) this._maxBusy = busy;          // 자가진단용: 동시 공격 슬롯 최대치
  }
  enemyWindupFx(e) {
    const def = e.def;
    if (e.animator) {
      const big = (e.elite && e.atkN % 3 === 0) || (e.boss && e.atkN % 3 === 2);
      const st = big && e.animator.has('slam') ? 'slam' : (e.animator.has('attack2') && e.atkN % 2 ? 'attack2' : 'attack');
      const a = e.animator.actions[st];
      const ts = a ? Math.min(2.4, Math.max(0.7, (a.getClip().duration * 0.5) / Math.max(0.2, e.windup))) : 1;
      e.animator.trigger(st, { ts });
    }
    if (e.boss) {
      const pat = e.atkN % 3;
      e.pattern = pat;
      if (pat === 2) { FX.telegraph(e.pos, 0xff3a8a, 8, 0.7); }
    } else if (e.elite && e.atkN % 3 === 0) {
      e.pattern = 'slam';
      FX.telegraph(e.pos, 0xff6a3a, 4.5, e.windup);
    } else e.pattern = null;
    if (!def.ranged) FX.burst(_v.copy(e.pos).setY(e.pos.y + e.fly + e.height), 0xff4040, 4, 1.5, 0.3);
  }
  enemyAttack(e, target) {
    const def = e.def, h = this.h;
    e.atkFlashT = 0.2;
    target = e.curTarget || target;
    if (!target || h.dead) return;
    const tpos = target.pos;
    if (e.pattern === 'slam' || (e.boss && e.pattern === 2)) {
      const R = e.boss ? 8 : 4.5;
      FX.ring(e.pos, 0xff6a3a, R, 0.5); FX.burst(_v.copy(e.pos).setY(0.4), def.color, 30, 9, 0.6, { up: 3, grav: 14 });
      this.ui.shake(0.25);
      if (!h.dead && d2(h.pos, e.pos) < R && h.pos.y - e.pos.y < 2.5) this.hurtAlly(h, def.atk * 1.4, e.pos);
      return;
    }
    if (e.boss && e.pattern === 1) {
      // 화염구 3연발
      for (let k = -1; k <= 1; k++) {
        const from = _v.copy(e.pos).setY(2.6).clone();
        const dir = _v2.copy(tpos).setY(1).sub(from).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), k * 0.25);
        this.spawnProj({ pos: from, vel: dir.multiplyScalar(14), team: 'enemy', dmg: def.atk * 0.8, color: 0xc040ff, size: 0.5, life: 3, aoe: 2.5 });
      }
      return;
    }
    if (def.ranged) {
      const from = _v.copy(e.pos).setY(e.pos.y + e.fly + e.height * 0.7).clone();
      const dir = _v2.copy(tpos).setY(tpos.y + 1).sub(from).normalize();
      this.spawnProj({ pos: from, vel: dir.multiplyScalar(13), team: 'enemy', dmg: def.atk, color: def.shape === 'bat' ? 0xc080ff : 0x9ad0ff, size: 0.25, life: 2.2 });
      return;
    }
    const reach = def.range + 1.2 + (e.boss ? 1.2 : 0);
    if (d2(tpos, e.pos) <= reach + (target.radius || 0.4) && (target !== h || h.pos.y - e.pos.y < 2.5)) {
      this.hurtAlly(target, def.atk, e.pos);
      FX.burst(_v.copy(tpos).setY(1), 0xff6060, 8, 4, 0.3);
    }
  }

  // ---------------------------------------------------------
  // 투사체
  spawnProj(o) {
    if (o.tracer) {
      // 주인공 탄환: 메시 없이 FX 트레일 인스턴스로만 그린다 (머티리얼 생성/파기 0)
      const p = { mesh: null, pos: o.pos.clone(), vel: o.vel.clone(), team: o.team, dmg: o.dmg, life: o.life || 1, r: 0.3,
        pierce: 0, hit: new Set(), homing: null, aoe: 0, slow: 0, src: o.src, color: o.color, tracer: true, age: 0, tt: 0 };
      this.projs.push(p);
      return p;
    }
    const geo = o.arrow ? U.GEO.box : U.GEO.sphLo;
    const mesh = new THREE.Mesh(geo, U.glowMat(o.color));
    if (o.arrow) mesh.scale.set(0.05, 0.05, 0.8);
    else if (o.stretch) mesh.scale.set(o.size, o.size, o.size * o.stretch);
    else mesh.scale.setScalar(o.size);
    if (o.spin) {
      mesh.geometry = U.GEO.cone; mesh.scale.set(o.size, o.size * 2.4, o.size);
      mesh.material = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      mesh.rotation.x = Math.PI;
    }
    mesh.position.copy(o.pos);
    this.scene.add(mesh);
    const p = { mesh, pos: mesh.position, vel: o.vel.clone(), team: o.team, dmg: o.dmg, life: o.life || 1, r: Math.max(0.3, o.size || 0.2),
      pierce: o.pierce || 0, hit: new Set(), homing: o.homing || null, aoe: o.aoe || 0, slow: o.slow || 0, src: o.src, color: o.color,
      trail: o.trail, spin: o.spin, arrow: o.arrow || o.stretch, tt: 0 };
    if (p.arrow) mesh.lookAt(_v.copy(p.pos).add(p.vel));
    this.projs.push(p);
    return p;
  }
  updateProjectiles(dt) {
    const h = this.h;
    FX.tracerBegin();
    for (const p of this.projs) {
      p.life -= dt;
      if (p.tracer) { this.stepTracer(p, dt); continue; }
      if (p.homing && !p.homing.dead) {
        const want = _v.copy(p.homing.pos).setY(p.homing.pos.y + p.homing.fly + p.homing.height * 0.5).sub(p.pos).normalize().multiplyScalar(p.vel.length());
        p.vel.lerp(want, Math.min(1, dt * 5));
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.spin) p.mesh.rotation.y += dt * 20;
      if (p.trail) { p.tt -= dt; if (p.tt <= 0) { p.tt = 0.03; FX.burst(p.pos, p.trail, 1, 0.5, 0.35); } }
      if (p.team === 'ally') {
        for (const e of this.enemies) {
          if (e.dead || p.hit.has(e)) continue;
          const ey = e.pos.y + e.fly + e.height * 0.5;
          if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.radius + p.r && Math.abs(ey - p.pos.y) < e.height * 0.8 + 0.8) {
            p.hit.add(e);
            if (p.aoe) { this.explode(p); p.life = 0; break; }
            this.damageEnemy(e, p.dmg, { src: p.src, slow: p.slow, color: p.src === 'hero' ? '#fff8d0' : undefined, knock: p.src === 'hero' ? 0.05 : 0 });
            FX.burst(p.pos, p.color, 4, 3, 0.25);
            if (p.pierce > 0) p.pierce--; else { p.life = 0; break; }
          }
        }
      } else {
        const near = !h.dead && p.pos.distanceTo(_v.copy(h.pos).setY(h.pos.y + 1)) < 0.9 + p.r * 0.5;
        if (near && h.iframe <= 0) {
          if (p.aoe) this.explode(p); else this.hurtAlly(h, p.dmg, p.pos);
          p.life = 0;
        } else if (near && h.dashT > 0 && !p.dodged) { p.dodged = true; this.perfectDodge(p.pos); }   // 탄환을 돌진으로 흘림
      }
      if (p.pos.y < this.world.heightAt(p.pos.x, p.pos.z) + 0.05 && p.life > 0) { if (p.aoe) this.explode(p); p.life = 0; }
      if (p.life <= 0) { this.scene.remove(p.mesh); p.mesh.material.dispose(); }
    }
    FX.tracerEnd();
    this.projs = this.projs.filter((p) => p.life > 0);
  }
  // 고속탄: 터널링 방지 서브스텝 충돌 + 트레일 + 피격 스파크
  stepTracer(p, dt) {
    const speed = p.vel.length(), steps = Math.max(1, Math.ceil(speed * dt / 0.7)), sdt = dt / steps;
    outer:
    for (let i = 0; i < steps; i++) {
      p.pos.addScaledVector(p.vel, sdt); p.age += sdt;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const ey = e.pos.y + e.fly + e.height * 0.5;
        if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.radius + p.r && Math.abs(ey - p.pos.y) < e.height * 0.8 + 0.8) {
          this.damageEnemy(e, p.dmg, { src: 'hero', agg: true, knock: 0.12, from: _v3.copy(p.pos).sub(p.vel) });
          FX.sparks(p.pos, _v3.copy(p.vel).normalize(), p.color, 6);
          p.life = 0; break outer;
        }
      }
      if (p.pos.y < this.world.heightAt(p.pos.x, p.pos.z) + 0.05) { FX.sparks(p.pos, _v3.copy(p.vel).normalize(), p.color, 3); p.life = 0; break; }
    }
    if (p.life > 0) FX.tracer(p.pos, p.vel, p.color, Math.min(3, p.age * speed), 0.17);
  }
  explode(p) {
    FX.burst(p.pos, p.color, 22, 7, 0.5, { big: p.aoe > 2 });
    FX.ring(_v.copy(p.pos).setY(0), p.color, p.aoe, 0.35);
    if (p.team === 'ally') {
      for (const e of this.enemies) if (!e.dead && d2(e.pos, p.pos) < p.aoe + e.radius) this.damageEnemy(e, p.dmg, { src: p.src, color: '#ffb080' });
    } else {
      const h = this.h;
      if (!h.dead && p.pos.distanceTo(_v.copy(h.pos).setY(h.pos.y + 1)) < p.aoe + 0.5) this.hurtAlly(h, p.dmg, p.pos);
    }
  }
  updateDelayed(dt) {
    for (const d of this.delayed) { d.t -= dt; if (d.t <= 0) d.fn(); }
    this.delayed = this.delayed.filter((d) => d.t > 0);
  }

  // ---------------------------------------------------------
  // 드랍 아이템 (자석 수거)
  updatePickups(dt) {
    const h = this.h;
    const magnetR = this.state.auto ? 7 : 4.5;
    for (const p of this.pickups) {
      p.t += dt;
      const hp = _v.copy(h.pos).setY(h.pos.y + 1);
      const d = p.pos.distanceTo(hp);
      if (p.t > 0.5 && (d < magnetR || p.magnet || p.t > 20) && !h.dead) p.magnet = true;
      if (p.magnet) {
        const dir = hp.sub(p.pos);
        const len = dir.length();
        p.pos.addScaledVector(dir.normalize(), Math.min(len, (12 + p.t * 4) * dt));
        if (len < 0.7) {
          this.give(p.mat, p.amt, h.pos.clone().setY(2.2)); p.done = true; this.scene.remove(p.mesh);
          p.mesh.traverse((o) => { if (o.material) o.material.dispose(); });
        }
      } else {
        p.vel.y -= 20 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const fy = this.world.heightAt(p.pos.x, p.pos.z) + 0.35;
        if (p.pos.y < fy) { p.pos.y = fy; p.vel.set(p.vel.x * 0.4, Math.abs(p.vel.y) * 0.3, p.vel.z * 0.4); }
        p.pos.y += Math.sin(p.t * 4) * 0.004;
      }
      p.inner.rotation.y += dt * 4;
    }
    this.pickups = this.pickups.filter((p) => !p.done);
  }

  updateNodes(dt) {
    for (const n of this.nodes) {
      if (!n.alive) {
        n.respawnT -= dt;
        if (n.respawnT <= 0) { n.alive = true; n.hits = D.NODE_TYPES[n.type].hits; n.obj.visible = true; FX.burst(_v.copy(n.pos).setY(1), 0xffffff, 10, 3, 0.5); }
      } else if (n.shake > 0) {
        n.shake -= dt;
        n.obj.position.x = n.pos.x + Math.sin(n.shake * 60) * 0.08 * (n.shake / 0.25);
      }
    }
  }

  // 정령 오브 / 소환 비석 / 게이트
  updateInteract(dt) {
    const h = this.h, w = this.world;
    for (const o of this.orbs) {
      o.spirit.position.y = 1.6 + Math.sin(this.time * 2) * 0.2;
      o.spirit.rotation.y += dt;
      o.cage.rotation.y -= dt * 0.5;
      o.cage.visible = o.locked;
      if (Math.random() < 0.1) FX.burst(_v.copy(o.pos).setY(1.6), D.ELEMENTS[o.el].color, 1, 1.5, 0.8, { up: 1 });
      if (d2(o.pos, h.pos) < 2) {
        if (o.locked) { if (!o.warned) { o.warned = true; this.ui.toast(`🔒 ${D.ELEMENTS[o.el].name}의 봉인 — 섬의 수호자를 쓰러뜨리면 해제됩니다`); } }
        else this.collectSpirit(o);
      } else o.warned = false;
    }
    this.orbs = this.orbs.filter((o) => !o.done);
    if (w.seal && w.seal.visible) {
      w.sealGlow.material.opacity = 0.5 + Math.sin(this.time * 3) * 0.3;
      if (d2(w.sealPos, h.pos) < 2.2) {
        this.state.claimed['seal' + this.mapId] = true;
        w.seal.visible = false;
        this.give('seal', 1, w.sealPos.clone().setY(2));
        this.ui.toast('📜 비석에서 「각성의 인장」을 얻었다! (+7 이상 장비 강화 재료)');
        FX.burst(_v.copy(w.sealPos).setY(1.2), 0xffb347, 40, 6, 1, { up: 2 });
        this.save();
      }
    }
    // 게이트
    if (w.gate) {
      w.gate.swirl.rotation.z += dt * 2;
      w.gate.disc.material.opacity = this.gateOpen() ? 0.55 + Math.sin(this.time * 3) * 0.15 : 0.12;
      const near = h.pos.distanceTo(w.gatePos) < 2.4;
      if (near && !this._gateWarned) {
        this._gateWarned = true;
        if (this.gateOpen()) {
          const tgt = this.gateTarget();
          this.ui.toast(`🌀 ${tgt === 'home' ? '내 집' : D.ISLANDS[tgt].name}(으)로 이동!`);
          this.loadMap(tgt);
          return;
        }
        this.ui.toast('🔒 게이트 봉인 — 이 섬의 수호자를 쓰러뜨리세요');
      }
      if (!near) this._gateWarned = false;
    }
  }

  collectSpirit(o) {
    o.done = true; this.scene.remove(o.obj);
    const st = this.state;
    st.spirits[o.el] = true;
    if (st.equipped.length < D.SPIRIT_EQUIP_MAX && !st.equipped.includes(o.el)) st.equipped.push(o.el);
    const d = D.ELEMENTS[o.el];
    FX.burst(_v.copy(o.pos).setY(1.6), d.color, 60, 8, 1.2, { big: true });
    FX.ring(o.pos, d.color, 6, 0.8);
    const total = D.ELEMENT_ORDER.filter((e) => st.spirits[e]).length;
    this.ui.banner(`${d.icon} ${d.el}의 정령 「${d.name}」 획득!`, `${d.buff} · ${d.skill} (수집 ${total}/7)`);
    this.rebuildSpirits();
    this.save();
  }

  updateSpawner(dt) {
    if (this.mapId === 'home') return;
    const def = this.world.def;
    this.spawnT -= dt; this.eliteCd -= dt;
    const normal = this.enemies.filter((e) => !e.elite && !e.boss).length;
    if (normal < def.count && this.spawnT <= 0) {
      this.spawnT = D.SOLO.respawn;
      this.spawnEnemy(def.enemies[randi(0, def.enemies.length - 1)]);
    }
    const bigType = def.boss || def.elite;
    const bigAlive = this.enemies.some((e) => e.elite || e.boss);
    if (bigType && !bigAlive && this.mapKills >= def.eliteAt && this.eliteCd <= 0) {
      const p = def.boss ? new THREE.Vector3(0, 0, 0) : this.world.enemySpawns[randi(0, this.world.enemySpawns.length - 1)].clone();
      this.spawnEnemy(bigType, p);
      const nm = D.ENEMIES[bigType].name;
      this.ui.banner(def.boss ? `⚠ 보스 등장: ${nm}` : `⚔ 섬의 수호자 등장: ${nm}`, def.boss ? '중앙 제단으로!' : '쓰러뜨리면 다음 섬 게이트와 정령 봉인이 열립니다');
      this.ui.shake(0.4);
    }
  }

  // ---------------------------------------------------------
  // 카메라
  updateCamera(dt) {
    const c = this.input.frameCamera(), cam = this.cam;
    cam.yaw += c.yaw; cam.pitch = clamp(cam.pitch + c.pitch, 0.15, 1.25); cam.dist = clamp(cam.dist + c.zoom, 6, 22);
    if (this.build.active) cam.pitch = Math.max(cam.pitch, 0.8);
    const h = this.h, fx = this.camFx;
    let tx = h.pos.x, ty = h.pos.y * 0.6 + 1.3, tz = h.pos.z;
    // ---- 전투 추적: 가장 가까운 적 쪽으로 시선을 살짝 당기고(룩어헤드), 근접전에서는 약간 줌인 ----
    let foe = null, fd = 13;
    if (!h.dead && this.mapId !== 'home') for (const e of this.enemies) { if (e.dead) continue; const d = d2(e.pos, h.pos); if (d < fd) { fd = d; foe = e; } }
    const fighting = foe && (h.swingT > 0 || h.firingT > 0 || this.combo.n > 0 || this.time - h.lastHurt < 2.5);
    let wantZoom = 1, wantFov = 55;
    if (fighting) {
      const k = Math.min(1, 3.2 / Math.max(0.5, fd)) * 0.34;
      tx += (foe.pos.x - h.pos.x) * k; tz += (foe.pos.z - h.pos.z) * k;
      wantZoom = fd < 6 ? 0.9 : 1.04;
      // AUTO: 적이 화면 안쪽에 오도록 카메라가 천천히 주인공 뒤로 돌아간다 (수동 조작 중에는 개입하지 않음)
      if (this.state.auto && this.autoCmd && !this.input.isManual() && this.input.camDrag.id === null && fd > 1.5) {
        cam.yaw = angLerp(cam.yaw, Math.atan2(h.pos.x - foe.pos.x, h.pos.z - foe.pos.z), dt * 0.55);
      }
    }
    if (h.dashT > 0) wantFov = 61;
    // ---- 필살기 연출: 줌인(기 모으기) → 폭발과 함께 줌아웃 ----
    if (fx.burstT > 0) {
      fx.burstT -= dt;
      const p = 1 - fx.burstT / 1.15;
      if (p < 0.35) { wantZoom = 0.62; wantFov = 47; } else { wantZoom = 1.16; wantFov = 60; }
    }
    if (fx.punch > 0) fx.punch = Math.max(0, fx.punch - dt * 4.5);
    fx.zoom += (wantZoom - fx.zoom) * (1 - Math.exp(-dt * (fx.burstT > 0 ? 9 : 3.5)));
    fx.fov += (wantFov + fx.punch * 5 - fx.fov) * (1 - Math.exp(-dt * 8));
    if (Math.abs(this.camera.fov - fx.fov) > 0.02) { this.camera.fov = fx.fov; this.camera.updateProjectionMatrix(); }
    if (!fx.lookInit) { fx.look.set(tx, ty, tz); fx.lookInit = true; }
    fx.look.x += (tx - fx.look.x) * (1 - Math.exp(-dt * 6)); fx.look.z += (tz - fx.look.z) * (1 - Math.exp(-dt * 6));
    fx.look.y += (ty - fx.look.y) * (1 - Math.exp(-dt * 12));
    // 주인공이 시선 중심에서 너무 멀어지지 않게 제한
    const ox = fx.look.x - h.pos.x, oz = fx.look.z - h.pos.z, ol = Math.hypot(ox, oz);
    if (ol > 2.6) { fx.look.x = h.pos.x + ox / ol * 2.6; fx.look.z = h.pos.z + oz / ol * 2.6; }
    tx = fx.look.x; ty = fx.look.y; tz = fx.look.z;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const dist = cam.dist * (innerHeight > innerWidth ? 1.25 : 1) * fx.zoom;
    _v.set(tx + Math.sin(cam.yaw) * cp * dist, ty + sp * dist, tz + Math.cos(cam.yaw) * cp * dist);
    this.camera.position.lerp(_v, 1 - Math.exp(-dt * 10));
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.camera.position.x += rand(-1, 1) * this.shakeT * 1.2;
      this.camera.position.y += rand(-1, 1) * this.shakeT * 1.2;
    }
    this.camera.lookAt(tx, ty, tz);
    this.sky.position.copy(this.camera.position);
    const so = this.world.sunOffset;
    this.sun.position.set(tx + so.x, so.y, tz + so.z);
    this.sun.target.position.set(tx, 0, tz);
  }

  // ---------------------------------------------------------
  // 주인공 애니메이션 (프로시저럴)
  animateHero(dt) {
    const h = this.h, r = this.rig, t = this.time;
    r.root.position.copy(h.pos);
    r.root.rotation.y = h.yaw;
    const mv = Math.min(1, h.moving);
    const air = !h.grounded;
    // 상하 바운스 · 전진 기울기 · 선회 시 몸 기울어짐(롤) · 대기 호흡
    const sp = h.swingT > 0 ? 1 - h.swingT / h.swingDur : 0, se = 1 - Math.pow(1 - sp, 3);
    let dy = h.yaw - h.pyaw; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    h.pyaw = h.yaw;
    const roll = dt > 0 ? clamp(-dy / dt * 0.035, -0.3, 0.3) * Math.min(1, mv + 0.2) : 0;
    h.lean += (roll - h.lean) * Math.min(1, dt * 9);
    const breathe = Math.sin(t * 2.1);
    r.body.position.y = air ? Math.sin(t * 3) * 0.06 : Math.abs(Math.sin(t * 11)) * 0.07 * mv + (mv < 0.1 ? breathe * 0.012 : 0);
    r.body.rotation.x = (h.dashT > 0 ? 0.5 : air ? 0.15 + mv * 0.15 : 0.12 * mv) + (h.swingT > 0 ? 0.1 + (h.combo === 2 ? 0.14 * se : 0) : 0) - h.recoil * 0.03;
    r.body.rotation.z = h.lean + (h.swingT > 0 && h.combo < 2 ? (h.combo === 0 ? -0.1 : 0.1) * Math.sin(sp * Math.PI) : 0);
    // 베기에 맞춰 상체를 비튼다 (①왼쪽으로 ②오른쪽으로)
    const twist = h.swingT > 0 ? (h.combo === 0 ? -0.55 + 1.1 * se : h.combo === 1 ? 0.55 - 1.1 * se : 0) : 0;
    r.body.rotation.y = h.spinT > 0 ? (1 - h.spinT / 0.45) * Math.PI * 2 : twist;
    if (r.holder) r.holder.scale.y = 1 + (mv < 0.1 && !air ? breathe * 0.006 : 0);
    if (r.legL) {
      const sw = air ? 0 : Math.sin(t * 12) * 0.7 * mv;
      r.legL.rotation.x = air ? -0.35 : sw; r.legR.rotation.x = air ? 0.25 : -sw;
      if (r.longHair) r.longHair.rotation.x = 0.12 + mv * 0.35 + (air ? 0.4 : 0) + Math.sin(t * 6) * 0.05;
    }
    if (r.animator) this.animateHeroClips(dt, mv, air);
    if (r.vrmAnim) this.animateHeroVRM(dt, mv, air);
    else this.animateHeroArms(dt, mv, breathe);
    this.animateBooster(dt, air);
    updateCosmetics(r, dt, t, h.pos, { dash: h.dashT > 0, hover: h.hovering, air, dead: h.dead });
    r.root.visible = !h.dead && !(h.iframe > 0 && h.dashT <= 0 && Math.floor(t * 20) % 2 === 0 && h.iframe < 1.9);
  }

  // VRM 주인공: 뼈대 직접 제어 (대기·달리기·검 3연타·권총 조준) + 눈 깜빡임 + SpringBone 바람
  animateHeroVRM(dt, mv, air) {
    const h = this.h, r = this.rig, A = r.vrmAnim;
    A.checkTeleport(h.pos);
    // 몸 전체 기울기는 척추 뼈가 담당하므로 루트 기울기는 약하게
    r.body.rotation.x = h.dashT > 0 ? 0.32 : air ? 0.06 : 0;
    r.body.rotation.z = h.lean * 0.6;
    r.body.rotation.y = h.spinT > 0 ? (1 - h.spinT / 0.45) * Math.PI * 2 : 0;
    const run = air ? 0 : Math.min(1, mv);
    r.body.position.y = air ? Math.sin(this.time * 3) * 0.06 : Math.abs(Math.cos(A.phase)) * 0.05 * run - 0.02 * run;
    A.update(dt, {
      t: this.time, mv: h.moving, air, dash: h.dashT > 0, swingT: h.swingT, swingDur: h.swingDur, combo: h.combo,
      spinT: h.spinT, firingT: h.firingT, recoil: h.recoil, lean: h.lean, dead: h.dead,
    });
    A.updateBlink(dt);
    if (!this._vrmPrev) this._vrmPrev = h.pos.clone();
    const vel = _v3.copy(h.pos).sub(this._vrmPrev).divideScalar(Math.max(dt, 1e-3));
    this._vrmPrev.copy(h.pos);
    if (vel.lengthSq() > 2500) vel.set(0, 0, 0);
    A.updateWind(dt, this.time, vel, h.hovering || h.dashT > 0);
    // 오른손 검 · 왼손 권총 (항상 양손에 쥐고 있음)
    const g0 = r.gun.group.userData.pos0;
    const rd = r.gun.group.userData.recoilDir, rk = h.recoil * 0.04 * r.gun.group.scale.x;
    if (g0) r.gun.group.position.set(g0.x + (rd ? rd.x : -1) * rk, g0.y, g0.z + (rd ? rd.z : 0) * rk);   // 반동: 총이 손목 쪽으로 밀림
  }

  // 기존 GLB/폴백 주인공: 팔 피벗 절차 애니메이션
  animateHeroArms(dt, mv, breathe) {
    const h = this.h, r = this.rig, t = this.time;
    // 오른팔: 검
    const aR = r.armR;
    const rest = r.armRest || { R: { x: -0.3, z: 0.12 }, L: { x: -0.15, z: -0.12 } };
    if (h.swingT > 0) {
      const p = 1 - h.swingT / h.swingDur, e = 1 - Math.pow(1 - p, 3);
      if (h.combo === 0) aR.rotation.set(-1.45, 1.3 - 2.7 * e, 0);
      else if (h.combo === 1) aR.rotation.set(-1.45, -1.4 + 2.7 * e, 0);
      else aR.rotation.set(-2.9 + 2.5 * e, 0, 0);
    } else if (h.spinT > 0) aR.rotation.set(-1.5, 1.2, 0);
    else {
      // 무기 대기 모션: 호흡에 맞춰 검 끝이 살짝 오르내리고, 달릴 때는 팔이 흔들린다
      const idleX = rest.R.x + breathe * 0.05 * (1 - mv) - Math.sin(t * 11) * 0.22 * mv;
      aR.rotation.x += (idleX - aR.rotation.x) * Math.min(1, dt * 10);
      aR.rotation.y += (0 - aR.rotation.y) * Math.min(1, dt * 10);
      aR.rotation.z = rest.R.z + Math.sin(t * 1.3) * 0.03 + (r.legL ? Math.sin(t * 12) * 0.1 * mv : 0);
    }
    // 왼팔: 권총 (조준 + 연사 반동)
    const aL = r.armL;
    const aimX = h.firingT > 0 ? -1.5 - h.recoil * 0.22 : rest.L.x + Math.sin(t * 2.1 + 1) * 0.04 * (1 - mv) + Math.sin(t * 11) * 0.2 * mv;
    aL.rotation.x += (aimX - aL.rotation.x) * Math.min(1, dt * (h.firingT > 0 ? 30 : 12));
    aL.rotation.z = h.firingT > 0 ? 0 : rest.L.z;
    if (r.gun.group.userData.z0 === undefined) r.gun.group.userData.z0 = r.gun.group.position.z;
    if (!r.animator) r.gun.group.position.z = r.gun.group.userData.z0 - h.recoil * 0.05;
  }

  // 부스터: 양쪽 노즐 파란/하늘빛 플라즈마 불꽃 + 잔상
  animateBooster(dt, air) {
    const h = this.h, r = this.rig, mv = Math.min(1, h.moving);
    const boosting = h.hovering || h.dashT > 0;
    const fl = h.dashT > 0 ? 2.1 : h.hovering ? 1.3 : air ? 0.6 : 0.22 + mv * 0.15;
    const bb = r.booster;
    bb.flames.forEach((f, i) => {
      const fk = 0.82 + Math.random() * 0.36;
      f.scale.set(boosting ? 1.25 : 1, fl * fk, boosting ? 1.25 : 1);
      if (bb.glows) { bb.glows[i].scale.setScalar((0.3 + fl * 0.42) * fk); bb.glows[i].material.opacity = Math.min(1, 0.35 + fl * 0.4); }
    });
    if (boosting && dt > 0) {
      if (Math.random() < (MOBILE ? 0.5 : 0.85)) {
        const fp = bb.flames[(Math.random() * bb.flames.length) | 0].getWorldPosition(_v);
        FX.burst(fp.setY(fp.y - 0.35), Math.random() < 0.5 ? 0x8fecff : this.plasmaColor(), 2, 2, 0.4, { dir: _v2.set(0, -6, 0) });
      }
      h.ghostT -= dt;
      if (h.ghostT <= 0 && !h.dead) {
        h.ghostT = h.dashT > 0 ? (MOBILE ? 0.085 : 0.045) : 0.16;
        FX.ghost(h.dashT > 0 ? 0x5ac8ff : 0x3a8cff, h.dashT > 0 ? 0.65 : 0.3, h.dashT > 0 ? 0.3 : 0.22);
      }
    }
  }

  // CC0 애니메이션 주인공: 클립 상태머신 (검 베기·권총·달리기·부양·돌진)
  animateHeroClips(dt, mv, air) {
    const h = this.h, A = this.rig.animator, st = this.stats;
    if (h.swingT > (this._pSwing ?? 0) + 0.001) A.trigger('attack', { ts: 2.7 * st.atkSpd });
    this._pSwing = h.swingT;
    if (h.spinT > 0 && !(this._pSpin > 0)) A.trigger('attack', { ts: 2.6 });
    this._pSpin = h.spinT;
    let state = 'idle', ts = 1;
    if (h.firingT > 0) { state = mv > 0.1 ? 'runShoot' : 'shoot'; ts = 1.4; }
    else if (h.dashT > 0) { state = 'run'; ts = 2; }
    else if (mv > 0.1) { state = 'run'; ts = Math.min(1.6, 0.8 + mv * 0.6); }
    else if (air) state = 'idle2';
    A.loop(state, ts);
    A.update(dt);
  }

  // ---------------------------------------------------------
  // 사망 연출 (시각 전용: 로직상 이미 제거된 몬스터)
  updateDying(dt) {
    for (const d of this.dying) {
      d.t += dt; d.e.animator.update(dt);
      this.flashEnemy(d.e, dt);
      if (d.t > 1.4) d.e.root.position.y -= dt * 1.6;
      if (d.t > 2.4) { this.scene.remove(d.e.root); this.disposeEnemy(d.e); d.done = true; }
    }
    this.dying = this.dying.filter((d) => !d.done);
  }

  // ---------------------------------------------------------
  // 아지트 NPC (대장장이 · 정령사 · 상인)
  spawnNPCs() {
    const spots = this.world.npcSpots; if (!spots) return;
    const defs = [
      { key: 'npc_smith', spot: 'smith', name: '대장장이 볼칸', role: '장비 강화', panel: 'enhance', loop: 'work', prop: 'forge' },
      { key: 'npc_spirit', spot: 'spirit', name: '정령사 엘리아', role: '7대 정령', panel: 'spirits', loop: 'idle', prop: 'altar' },
      { key: 'npc_merchant', spot: 'merchant', name: '상인 미라', role: '가구 제작·배치', action: 'build', loop: 'idle', prop: 'stall' },
    ];
    for (const d of defs) {
      const [x, z, yaw] = spots[d.spot];
      const m = Models.buildNPCModel(d.key);
      const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = yaw;
      if (m) root.add(m.root); else { const f = U.buildFallbackHero(); root.add(f.root); }
      const tag = Models.nameTag(d.name, d.role); tag.position.y = 2.45; root.add(tag);
      const ox = Math.sin(yaw), oz = Math.cos(yaw);
      if (d.prop === 'forge' || d.prop === 'altar') {
        const p = Models.buildFurnitureModel(d.prop) || U.buildFurniture(d.prop);
        p.position.set(x + ox * 1.6, 0, z + oz * 1.6); p.rotation.y = yaw + Math.PI; this.world.group.add(p);
      } else {
        const st = U.buildStall(); st.position.set(x + ox * 1.3, 0, z + oz * 1.3); st.rotation.y = yaw; this.world.group.add(st);
      }
      this.scene.add(root);
      const npc = { ...d, root, animator: m ? m.animator : null, pos: root.position, baseYaw: yaw };
      if (npc.animator) npc.animator.loop(d.loop);
      this.npcs.push(npc);
    }
  }
  updateNPCs(dt) {
    const h = this.h;
    let near = null;
    for (const n of this.npcs) {
      const d = d2(n.pos, h.pos);
      if (d < 3.4 && (!near || d < d2(near.pos, h.pos))) near = n;
      const want = d < 5 ? yawTo(n.pos, h.pos) : n.baseYaw;
      n.root.rotation.y = angLerp(n.root.rotation.y, want, dt * 4);
      if (n.animator) { n.animator.loop(d < 5 && n.loop === 'work' ? 'idle' : n.loop); n.animator.update(dt); }
      // 대기 모션: 호흡에 맞춘 미세한 상하·좌우 흔들림
      const nb = n.root.children[0], ph = this.time * 1.7 + n.pos.x;
      nb.position.y = Math.sin(ph) * 0.012; nb.rotation.z = Math.sin(ph * 0.6) * 0.018;
    }
    if (near !== this.talkTarget) { this.talkTarget = near; this.ui.setTalk(near); }
  }
  talkNPC() {
    const n = this.talkTarget; if (!n) return;
    if (n.animator) n.animator.trigger(n.animator.has('talk') ? 'talk' : 'cheer', { ts: 1.2 });
    if (n.action === 'build') this.toggleBuild(true);
    else this.ui.openPanel(n.panel);
  }
  async rebuildHero() {
    if (this._heroLoading) return this._heroLoading;
    this.ui.toast('주인공 모델 불러오는 중…');
    this._heroLoading = (async () => {
      const rig = await buildHero(this.state.settings, () => {});
      applyCosmetics(rig, this.state.cosmetic);
      const old = this.rig;
      this.scene.remove(old.root); disposeHero(old);
      this.rig = rig; this._vrmPrev = null;
      this.scene.add(rig.root);
      this.animateHero(0);
      this.bindGhosts();
      this.updateGearColors();
      this.ui.refreshAll();
      FX.burst(_v.copy(this.h.pos).setY(1.2), 0xfff0a0, 40, 6, 0.9, { up: 2 });
    })();
    try { await this._heroLoading; } finally { this._heroLoading = null; }
  }
  // VRM 캐릭터 3종 전환 (localStorage 저장)
  async selectHero(id) {
    if (!D.HEROES[id] || this._heroLoading) return;
    if (D.HEROES[id].available === false) { this.ui.toast(`${D.HEROES[id].name}: 라이선스상 웹 배포판에는 포함되지 않은 캐릭터예요 (PC 로컬 전용)`); return; }
    const st = this.state.settings;
    if (st.heroChar === id && st.heroModel !== 'cc0' && this.rig.vrm) return;
    st.heroChar = id; st.heroModel = 'custom';
    this.save();
    await this.rebuildHero();
    const d = D.HEROES[id];
    this.ui.toast(`${d.icon} ${d.name}(으)로 전환 · ${this.rig.vrm ? 'VRM ' + this.rig.vrmVer + (this.rig.vrm0 ? ' → 정면 보정 적용' : '') : this.rig.source}`);
  }
  cycleHero(dir = 1) {
    const o = D.HERO_ORDER.filter((id) => D.HEROES[id].available !== false), i = o.indexOf(this.state.settings.heroChar);
    return o.length ? this.selectHero(o[(i + dir + o.length) % o.length]) : Promise.resolve();
  }
  // 코디: 염색 · 파츠 착탈 (즉시 반영 + 저장)
  setDye(id) { this.state.cosmetic.dye = id; applyDye(this.rig, id); this.save(); }
  setPart(slot, val) {
    const c = this.state.cosmetic; c[slot] = val;
    if (slot === 'back') { setBack(this.rig, val); this.updateGearColors(); }
    else if (slot === 'weapon') { setWeapon(this.rig, val); this.updateGearColors(); }
    else if (slot === 'head') setHead(this.rig, val);
    else if (slot === 'aura') setAura(this.rig, val);
    this.save();
  }

  // ---------------------------------------------------------
  // UI 액션들
  toggleAuto() {
    this.state.auto = !this.state.auto;
    this.ui.setAuto(this.state.auto);
    this.ui.toast(this.state.auto ? '🤖 AUTO ON — 조작하면 즉시 수동 우선, 손을 떼면 자동 복귀' : 'AUTO OFF');
    this.save();
  }
  goHome() {
    if (this.mapId === 'home') { this.toggleBuild(); return; }
    this.loadMap('home');
    this.ui.toast('🏠 내 집에 도착! [🔨 건축] 버튼으로 가구를 배치하세요');
  }
  travel(id) { this.ui.closePanel(); this.loadMap(id); }

  equipSpirit(el) {
    const st = this.state;
    if (!st.spirits[el]) return;
    if (this.master) { this.ui.toast('🌈 엘레멘탈 마스터: 7정령 전원 자동 출전 중'); return; }
    const i = st.equipped.indexOf(el);
    if (i >= 0) st.equipped.splice(i, 1);
    else {
      if (st.equipped.length >= D.SPIRIT_EQUIP_MAX) { this.ui.toast(`정령은 최대 ${D.SPIRIT_EQUIP_MAX}마리까지 동행할 수 있어요`); return; }
      st.equipped.push(el);
    }
    this.rebuildSpirits(); this.save();
  }
  enhance(part) {
    const lv = this.state.gear[part];
    if (lv >= D.GEAR_MAX) return null;
    const cost = D.enhanceCost(part, lv);
    if (!this.pay(cost)) { this.ui.toast('재료가 부족합니다'); return null; }
    const rate = Math.min(1, D.enhanceRate(lv) + this.stats.enhanceBonus);
    const ok = Math.random() < rate;
    if (ok) {
      this.state.gear[part]++;
      this.recompute();
      FX.burst(_v.copy(this.h.pos).setY(1.2), this.gearColor(part), 50, 7, 1, { up: 2 });
      FX.ring(this.h.pos, this.gearColor(part), 4, 0.6);
    }
    this.save();
    return ok;
  }
  craftFurniture(type) {
    const f = D.FURNITURE[type];
    if (!this.pay(f.cost)) { this.ui.toast('재료가 부족합니다'); return; }
    this.state.furnInv[type] = (this.state.furnInv[type] || 0) + 1;
    this.ui.toast(`${f.icon} ${f.name} 제작 완료! 배치해 보세요`);
    this.save();
  }

  // ---------------------------------------------------------
  // 하우징 (건축 모드)
  rebuildFurniture() {
    const fg = this.world.furnGroup; if (!fg) return;
    while (fg.children.length) fg.remove(fg.children[0]);
    this.state.furniture.forEach((f, i) => {
      const m = Models.buildFurnitureModel(f.type) || U.buildFurniture(f.type);
      m.position.set(f.x, 0, f.z); m.rotation.y = f.rot;
      m.userData.furnIndex = i;
      m.visible = this.build.moving !== i;
      fg.add(m);
    });
    this.recompute();
  }
  toggleBuild(on = !this.build.active) {
    if (on && this.mapId !== 'home') return;
    this.build.active = on;
    if (!on) this.clearGhost();
    this.ui.setBuild(on);
  }
  clearGhost() {
    const b = this.build;
    if (b.ghost) this.scene.remove(b.ghost);
    b.ghost = null; b.type = null;
    if (b.moving >= 0) { b.moving = -1; this.rebuildFurniture(); }
  }
  startPlace(type) {
    if (!(this.state.furnInv[type] > 0)) { this.ui.toast('먼저 가구를 제작하세요'); return; }
    this.clearGhost();
    this.makeGhost(type, 0);
    const h = this.h;
    this.build.ghost.position.set(h.pos.x + Math.sin(h.yaw) * 3, 0, h.pos.z + Math.cos(h.yaw) * 3);
  }
  makeGhost(type, rot) {
    const g = Models.buildFurnitureModel(type) || U.buildFurniture(type);
    g.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.6; o.castShadow = false; } });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 40).rotateX(-Math.PI / 2), U.glowMat(0x8affb0, 0.8));
    ring.position.y = 0.05; g.add(ring);
    g.rotation.y = rot;
    this.scene.add(g);
    this.build.ghost = g; this.build.type = type; this.build.rot = rot;
  }
  rotateGhost() { const b = this.build; if (!b.ghost) return; b.rot += Math.PI / 4; b.ghost.rotation.y = b.rot; }
  confirmPlace() {
    const b = this.build; if (!b.ghost) return;
    const p = b.ghost.position;
    const hb = this.world.houseBox || [-5.2, 5.2, -18, -12];
    if (p.x > hb[0] - 0.8 && p.x < hb[1] + 0.8 && p.z > hb[2] - 0.8 && p.z < hb[3] + 0.8) { this.ui.toast('집 건물과 겹쳐요'); return; }
    const rec = { type: b.type, x: +p.x.toFixed(2), z: +p.z.toFixed(2), rot: b.rot };
    if (b.moving >= 0) { this.state.furniture[b.moving] = rec; b.moving = -1; }
    else { this.state.furniture.push(rec); this.state.furnInv[b.type]--; }
    FX.burst(_v.copy(p).setY(0.5), 0x8affb0, 24, 4, 0.6, { up: 2 });
    this.scene.remove(b.ghost); b.ghost = null;
    const type = b.type; b.type = null;
    this.rebuildFurniture();
    this.ui.toast(`${D.FURNITURE[type].icon} 배치 완료 — ${D.FURNITURE[type].desc}`);
    this.ui.renderBuildBar();
    this.save();
  }
  storeGhost() {
    const b = this.build;
    if (b.moving < 0) { this.clearGhost(); this.ui.renderBuildBar(); return; }
    const f = this.state.furniture[b.moving];
    this.state.furniture.splice(b.moving, 1);
    this.state.furnInv[f.type] = (this.state.furnInv[f.type] || 0) + 1;
    this.scene.remove(b.ghost); b.ghost = null; b.type = null; b.moving = -1;
    this.rebuildFurniture(); this.ui.renderBuildBar(); this.save();
    this.ui.toast('📦 가구를 보관함에 넣었어요');
  }
  screenToGround(x, y) {
    const ndc = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? p : null;
  }
  updateBuild() {
    const b = this.build, inp = this.input;
    if (inp.consume('rotateFurn')) this.rotateGhost();
    const clampHome = (p) => { const R = this.world.R - 2.5, d = Math.hypot(p.x, p.z); if (d > R) { p.x *= R / d; p.z *= R / d; } return p; };
    if (b.ghost && !inp.touchMode && inp.pointer.has) {
      const p = this.screenToGround(inp.pointer.x, inp.pointer.y);
      if (p) b.ghost.position.copy(clampHome(p)).setY(0);
    }
    const tap = inp.tap; inp.tap = null;
    if (!tap) return;
    if (b.ghost) {
      const p = this.screenToGround(tap.x, tap.y);
      if (p) b.ghost.position.copy(clampHome(p)).setY(0);
      if (tap.place) this.confirmPlace();
      return;
    }
    // 기존 가구 선택 → 이동
    const ndc = new THREE.Vector2((tap.x / innerWidth) * 2 - 1, -(tap.y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.furnGroup.children, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && o.userData.furnIndex === undefined) o = o.parent;
      if (o) {
        const i = o.userData.furnIndex, f = this.state.furniture[i];
        b.moving = i; o.visible = false;
        this.makeGhost(f.type, f.rot);
        b.ghost.position.set(f.x, 0, f.z);
        this.ui.renderBuildBar();
        this.ui.toast('가구 이동: 위치를 지정하고 ✔ (📦 = 보관)');
      }
    }
  }

  // ---------------------------------------------------------
  onKey(k) {
    if (this.ui.panelOpen && k === 'Escape') { this.ui.closePanel(); return; }
    const map = { KeyM: 'map', KeyO: 'spirits', KeyV: 'chars', KeyF: 'wardrobe', KeyU: 'enhance', KeyI: 'bag', KeyB: 'bag' };
    if (map[k]) { this.ui.togglePanel(map[k]); return; }
    if (k === 'KeyT') this.toggleAuto();
    if (k === 'KeyH') this.goHome();
    if (k === 'KeyG' && this.mapId === 'home') this.toggleBuild();
    if (this.build.active) {
      if (k === 'Enter') this.confirmPlace();
      if (k === 'Escape') { this.clearGhost(); this.ui.renderBuildBar(); }
      if (k === 'Delete' || k === 'Backspace') this.storeGhost();
    }
    if (k === 'F9') this.rotateModel();
  }
  rotateModel() {
    if (!this.rig.holder) { this.ui.toast('GLB 모델을 사용할 때만 방향 보정이 가능합니다'); return; }
    this.state.settings.modelRotY = ((this.state.settings.modelRotY || 0) + Math.PI / 2) % (Math.PI * 2);
    applyModelSettings(this.rig, this.state.settings);
    this.ui.toast(`모델 방향 보정: ${Math.round(this.state.settings.modelRotY * 180 / Math.PI)}°`);
    this.save();
  }
  togglePaint() {
    this.state.settings.paint = !this.state.settings.paint;
    applyModelSettings(this.rig, this.state.settings);
    this.save();
  }
  resetSave() {
    resetState();
    this._noSave = true;
    location.reload();
  }
}
