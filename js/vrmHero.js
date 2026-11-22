// VRM 주인공(VRM 0.0 / 1.0 공용): 뼈대 직접 제어 애니메이션 + SpringBone 바람 + 눈 깜빡임 + 무기(오른손 검·왼손 권총)/등 파츠/머리 장식 뼈대 부착
// (@pixiv/three-vrm 정규화 휴머노이드 리그 사용)
//
// 정규화 리그 좌표계 (VRM 1.0, 캐릭터는 +Z 를 바라봄 · 캐릭터 왼쪽 = +X)
//  - 모든 뼈의 휴식 자세 = T 포즈, 회전 = 0
//  - 오른팔은 -X 로 뻗어 있음 → UpperArm.z(+) 내림 / (-) 올림, y(+) 앞→왼쪽으로 휘두름, x(-) 앞으로 들기
//  - 왼팔은 부호 반대 (z, y)
//  - 다리 UpperLeg.x(-) 앞으로, LowerLeg.x(+) 무릎 굽힘 · 척추/머리 x(+) 앞으로 숙임, y(+) 왼쪽으로 비틀기
import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (x) => x * x * (3 - 2 * x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

const BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
];
const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const SEGS = ['Proximal', 'Intermediate', 'Distal'];

// ---------- 무기·부스터·머리 장식 뼈대 부착 ----------
// VRM 0.0 은 정규화 뼈대의 로컬 좌표계가 원본 모델(-Z 정면) 기준이다 (rotateVRM0 는 씬 전체만 180° 돌림).
// → 아래 오프셋/회전은 VRM 1.0 기준(+Z 정면)으로 작성하고, VRM0 일 때만 Y축 180° 로 변환해 붙인다.
const _QFLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
export function attachVRMGear(rig, U, opts = {}) {
  const vrm = rig.vrm, hum = vrm.humanoid, v0 = !!rig.vrm0;
  const node = (n) => hum.getNormalizedBoneNode(n);
  const F = (v) => (v0 ? v.set(-v.x, v.y, -v.z) : v);                       // 위치 오프셋 변환
  const FQ = (q) => (v0 ? q.premultiply(_QFLIP) : q);                        // 회전 변환
  rig.root.updateMatrixWorld(true);
  const ws = new THREE.Vector3();
  const hand = node('rightHand');
  hand.getWorldScale(ws);
  const inv = 1 / ws.x;                                   // 무기는 월드 미터 기준으로 만들어져 있음 → 부모 스케일 상쇄

  // 주먹 중심: 손목 → 중지 첫마디 방향 85% 지점 (실제 뼈 위치라 변환 불필요), 손바닥 쪽으로 2.5cm
  const mid = node('rightMiddleProximal');
  const grip = mid ? mid.position.clone().multiplyScalar(0.85) : F(new THREE.Vector3(-0.08 * inv, 0, 0));
  grip.y -= 0.025 * inv;

  // 검: 칼날(+Y)을 엄지 쪽(+Z)에서 손가락 방향(-X)으로 약 30° 기울여 쥔다
  const sw = U.buildSword();
  sw.group.scale.setScalar(inv);
  sw.group.position.copy(grip);
  {
    // 칼 로컬 +Y(칼날) → blade, 칼 너비 X → 손등 방향(+Y): 칼날 면이 휘두르는 방향을 가른다
    const by = new THREE.Vector3(-Math.sin(0.5), 0, Math.cos(0.5));
    const bx = new THREE.Vector3(0, 1, 0), bz = new THREE.Vector3().crossVectors(bx, by);
    FQ(sw.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz)));
  }
  hand.add(sw.group); rig.sword = sw;

  // 권총 (왼손): 왼손은 +X 로 뻗어 있음 → 총열(+Z) → 손가락 방향(+X), 총 윗면(+Y) → 엄지 쪽(+Z)
  const handL = node('leftHand');
  handL.getWorldScale(ws);
  const invL = 1 / ws.x;
  const midL = node('leftMiddleProximal');
  const gripL = midL ? midL.position.clone().multiplyScalar(0.85) : F(new THREE.Vector3(0.08 * invL, 0, 0));
  gripL.y -= 0.025 * invL;
  const gn = U.buildGun();
  gn.group.scale.setScalar(invL);
  gn.group.position.copy(gripL).add(F(new THREE.Vector3(-0.01 * invL, 0, -0.01 * invL)));
  FQ(gn.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))));
  handL.add(gn.group); rig.gun = gn;
  gn.group.userData.pos0 = gn.group.position.clone();
  gn.group.userData.recoilDir = F(new THREE.Vector3(-1, 0, 0));              // 반동: 손목 쪽

  // 등 파츠 슬롯 (기본 곰인형 로켓부스터): 윗가슴(없으면 가슴) 뼈의 등 뒤
  const back = node('upperChest') || node('chest') || node('spine');
  back.getWorldScale(ws);
  const bInv = 1 / ws.x;
  const bb = U.buildBearBooster();
  bb.group.scale.setScalar(bInv);
  const bw = back.getWorldPosition(new THREE.Vector3());
  const rootY = rig.root.getWorldPosition(new THREE.Vector3()).y;
  // 등 표면 추정: 가슴 뼈 뒤 약 0.12m → 곰 몸통 반지름(0.19)만큼 더 뒤
  bb.group.position.copy(F(new THREE.Vector3(0, (1.14 - (bw.y - rootY)) * bInv, -0.25 * bInv)));
  FQ(bb.group.quaternion.identity());
  back.add(bb.group); rig.booster = bb;

  // 머리 장식 슬롯: 머리 뼈 → 모델 정수리 높이
  const head = node('head');
  if (head) {
    head.getWorldScale(ws);
    const hInv = 1 / ws.x;
    const hw = head.getWorldPosition(new THREE.Vector3());
    const top = (opts.topY ?? 1.72) - (hw.y - rootY);
    const slot = new THREE.Group();
    slot.scale.setScalar(hInv);
    slot.position.copy(F(new THREE.Vector3(0, Math.max(0.08, top - 0.02) * hInv, 0.01 * hInv)));
    FQ(slot.quaternion.identity());
    head.add(slot); rig.headSlot = slot;
  }

  rig.armR = new THREE.Group(); rig.armL = new THREE.Group();   // 기존 절차 코드 호환용 더미
  rig.vrmAnim = new VRMAnimator(vrm, v0);
}

// ---------- 애니메이터 ----------
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _wind = new THREE.Vector3(), _g = new THREE.Vector3();

export class VRMAnimator {
  constructor(vrm, vrm0 = false) {
    this.vrm = vrm;
    this.flip = vrm0 ? -1 : 1;          // VRM0: 정규화 뼈대 로컬 축이 Y축 180° 반대 → Euler (x, y, z) → (-x, y, -z)
    this.b = {};
    for (const n of BONES) this.b[n] = vrm.humanoid.getNormalizedBoneNode(n);
    this.fingers = { L: [], R: [] };
    for (const side of ['left', 'right']) for (const f of FINGERS) for (const s of SEGS) {
      const node = vrm.humanoid.getNormalizedBoneNode(side + f + s);
      if (node) this.fingers[side === 'left' ? 'L' : 'R'].push(node);
    }
    this.thumbR = ['rightThumbProximal', 'rightThumbDistal'].map((n) => vrm.humanoid.getNormalizedBoneNode(n)).filter(Boolean);
    this.thumbL = ['leftThumbProximal', 'leftThumbDistal'].map((n) => vrm.humanoid.getNormalizedBoneNode(n)).filter(Boolean);
    this.pose = {}; for (const n of BONES) this.pose[n] = [0, 0, 0];
    this.phase = 0;
    this.blinkT = 2 + Math.random() * 1.5; this.blinkP = -1;
    this.prevPos = null;
    // SpringBone: 원래 중력 설정을 보관하고 매 프레임 바람을 더한다
    this.joints = [];
    const sbm = vrm.springBoneManager;
    if (sbm) for (const j of sbm.joints) this.joints.push({ j, dir: j.settings.gravityDir.clone(), pow: j.settings.gravityPower, drag: j.settings.dragForce });
  }

  // s: { t, mv, air, dash, hover, swingT, swingDur, combo, spinT, firingT, recoil, weapon, lean, dead, pos, yaw }
  update(dt, s) {
    const P = this.pose, t = s.t;
    for (const n of BONES) { const p = P[n]; p[0] = p[1] = p[2] = 0; }
    const set = (n, x, y, z, w = 1) => { const p = P[n]; p[0] += x * w; p[1] += y * w; p[2] += z * w; };

    const mv = clamp(s.mv, 0, 1);
    const breathe = Math.sin(t * 2.1), inhale = 0.5 + 0.5 * breathe;
    const ground = s.air ? 0 : 1;
    const run = mv * ground * (s.dash ? 0 : 1);
    this.phase += dt * (6 + 6 * mv) * (run > 0.05 ? 1 : 0.3);
    const ph = this.phase, sn = Math.sin(ph), cs = Math.cos(ph);
    const idle = (1 - mv) * ground * (s.dash ? 0 : 1);

    // ===== 하체 =====
    // 대기: 살짝 벌린 스탠스 + 호흡에 맞춰 무릎 미세 굽힘
    set('leftUpperLeg', -0.04 - inhale * 0.02, 0.05, 0.06, idle);
    set('rightUpperLeg', -0.02 - inhale * 0.02, -0.08, -0.06, idle);
    set('leftLowerLeg', 0.08 + inhale * 0.04, 0, 0, idle);
    set('rightLowerLeg', 0.06 + inhale * 0.04, 0, 0, idle);
    set('leftFoot', -0.04, 0, 0, idle); set('rightFoot', -0.04, 0, 0, idle);
    // 달리기: 속도에 비례한 보폭 · 앞으로 차고 나가는 무릎
    const stride = 0.45 + 0.4 * mv;
    set('leftUpperLeg', -sn * stride - 0.12, 0, 0.03, run);
    set('rightUpperLeg', sn * stride - 0.12, 0, -0.03, run);
    set('leftLowerLeg', 0.2 + Math.max(0, cs) * (0.6 + 0.8 * mv), 0, 0, run);
    set('rightLowerLeg', 0.2 + Math.max(0, -cs) * (0.6 + 0.8 * mv), 0, 0, run);
    set('leftFoot', 0.1 + sn * 0.25, 0, 0, run);
    set('rightFoot', 0.1 - sn * 0.25, 0, 0, run);
    set('hips', 0, sn * 0.12, 0, run);
    // 공중(부양): 한쪽 무릎을 당긴 비행 자세 · 돌진: 다리를 뒤로 쭉 뻗는 슈퍼히어로 자세
    const airW = (1 - ground) * (s.dash ? 0 : 1);
    const kick = Math.sin(t * 3) * 0.06;
    set('leftUpperLeg', -0.55 + kick, 0, 0.06, airW); set('leftLowerLeg', 0.95, 0, 0, airW);
    set('rightUpperLeg', -0.1 - kick, 0, -0.04, airW); set('rightLowerLeg', 0.45, 0, 0, airW);
    set('leftFoot', 0.35, 0, 0, airW); set('rightFoot', 0.35, 0, 0, airW);
    const dashW = s.dash ? 1 : 0;
    set('leftUpperLeg', 0.25, 0, 0.05, dashW); set('rightUpperLeg', 0.05, 0, -0.05, dashW);
    set('leftLowerLeg', 0.35, 0, 0, dashW); set('rightLowerLeg', 0.7, 0, 0, dashW);
    set('leftFoot', 0.5, 0, 0, dashW); set('rightFoot', 0.5, 0, 0, dashW);

    // ===== 상체 =====
    // 호흡: 가슴이 들리고 어깨가 살짝 오르내림 · 달리면 상체를 살짝 숙이고 반대로 비틈
    set('spine', 0.03 + 0.16 * run + 0.38 * dashW + 0.1 * airW, -sn * 0.08 * run, s.lean * -0.3);
    set('chest', -breathe * 0.025 * idle + 0.05 * run, -sn * 0.14 * run, 0);
    set('upperChest', -breathe * 0.02 * idle, 0, 0);
    set('neck', 0, 0, 0);
    // 고개: 대기 중 천천히 두리번 · 달릴 때는 숙인 만큼 들어 정면 유지
    set('head', Math.sin(t * 0.7) * 0.04 * idle - 0.14 * run - 0.3 * dashW, (Math.sin(t * 0.43) * 0.12 + Math.sin(t * 1.1) * 0.03) * idle + sn * 0.06 * run, Math.sin(t * 0.37) * 0.04 * idle);
    set('rightShoulder', 0, 0, -0.04 * inhale * idle);
    set('leftShoulder', 0, 0, 0.04 * inhale * idle);

    // 팔 (기본: 대기/달리기/공중) — 오른손은 무기를 쥐고 있어 살짝 앞으로
    const armIdleR = [-0.12 + Math.sin(t * 1.1) * 0.04, 0.12, 1.18 + Math.sin(t * 1.3 + 0.5) * 0.03 + inhale * 0.02];
    const armIdleL = [0.04 + Math.sin(t * 1.2 + 1) * 0.05, 0, -1.22 - Math.sin(t * 1.3) * 0.03 - inhale * 0.02];
    const armSwing = 0.35 + 0.45 * mv;
    let R = [
      armIdleR[0] * idle + (-sn * armSwing - 0.1) * run + 0.15 * airW + 0.6 * dashW,
      armIdleR[1] * idle + 0.1 * run + 0.2 * airW,
      armIdleR[2] * idle + 1.3 * run + 0.75 * airW + 1.15 * dashW,
    ];
    let L = [
      armIdleL[0] * idle + (sn * armSwing - 0.1) * run + 0.15 * airW + 0.6 * dashW,
      -0.1 * run - 0.2 * airW,
      armIdleL[2] * idle - 1.3 * run - 0.75 * airW - 1.15 * dashW,
    ];
    let elbowR = 0.35 * idle + (1.0 + 0.3 * mv) * run + 0.5 * airW + 0.25 * dashW;
    let elbowL = -(0.2 * idle + (1.0 + 0.3 * mv) * run + 0.5 * airW + 0.25 * dashW);
    let wristR = [0, 0, 0], wristL = [0, 0, 0];

    // ----- 근접 검: 3연타 베기 -----
    let fast = false;
    if (s.swingT > 0) {
      fast = true;
      const p = clamp(1 - s.swingT / s.swingDur, 0, 1), e = easeOut(p);
      const c = s.combo;
      // 각 타: [팔 높이 z 시작→끝, 휘두름 y 시작→끝, 팔꿈치, 손목, 척추 비틀기]
      let az, ay, ax = 0, el, wy, tw, lean = 0.08;
      if (c === 0) {           // ① 우상 → 좌하 대각 베기
        az = lerp(-0.95, 0.55, e); ay = lerp(-0.35, 1.95, e); el = lerp(1.1, 0.15, e); wy = lerp(0.5, -0.5, e); tw = lerp(-0.55, 0.6, e);
      } else if (c === 1) {    // ② 좌상 → 우하 역방향 베기
        az = lerp(-0.7, 0.65, e); ay = lerp(2.05, -0.25, e); el = lerp(1.25, 0.1, e); wy = lerp(-0.6, 0.45, e); tw = lerp(0.6, -0.6, e);
      } else {                 // ③ 크게 휘감는 가로 피니시 (몸 전체 회전 + 앞으로 숙임)
        az = lerp(-0.2, 0.15, e); ay = lerp(-0.9, 2.45, e); el = lerp(0.9, 0.05, e); wy = lerp(0.7, -0.7, e); tw = lerp(-0.85, 0.85, e); lean = 0.12 + 0.18 * e;
      }
      R = [ax, ay, az]; elbowR = el; wristR = [0, wy, 0];
      // 왼팔은 반대쪽으로 균형을 잡는다
      L = [0.1, lerp(0.3, -0.5, e) * (c === 1 ? -1 : 1), -0.75];
      elbowL = -0.6;
      set('spine', lean, tw * 0.45, 0); set('chest', 0.04, tw * 0.35, 0); set('upperChest', 0, tw * 0.2, 0);
      set('head', -0.05, -tw * 0.5, 0);
      set('hips', 0, tw * 0.15, 0);
      // 베기 순간 앞발 내딛기
      const st = Math.sin(p * Math.PI) * ground;
      set('leftUpperLeg', -0.35 * st, 0, 0); set('leftLowerLeg', 0.35 * st, 0, 0);
      set('rightUpperLeg', 0.2 * st, 0, 0); set('rightLowerLeg', 0.25 * st, 0, 0);
    } else if (s.spinT > 0) {
      // 회전베기: 양팔을 벌리고 칼을 수평으로
      fast = true;
      R = [0, 0.55, 0.12]; elbowR = 0.1; wristR = [0, -0.4, 0];
      L = [0, -0.3, -0.25]; elbowL = -0.2;
      set('spine', 0.15, 0, 0);
    } else if (s.firingT > 0) {
      // ----- 원거리 총: 왼팔을 곧게 뻗어 조준 + 반동 -----
      fast = true;
      const rc = s.recoil;
      L = [-1.5708 - rc * 0.28, 0.08, -1.5708]; elbowL = -(0.04 + rc * 0.22); wristL = [0, 0, rc * 0.35];
      // 오른손은 검을 낮게 겨눈 채 대기
      R = [-0.35, 0.25, 1.1]; elbowR = 0.7;
      set('spine', 0.04 - rc * 0.03, 0.18, 0); set('chest', -rc * 0.04, 0.12, 0); set('upperChest', 0, 0.06, 0);
      set('head', 0.03, -0.32, -0.04);
      set('leftShoulder', 0, 0, 0.06 + rc * 0.04);
    }
    set('rightUpperArm', R[0], R[1], R[2]); set('rightLowerArm', 0, elbowR, 0); set('rightHand', wristR[0], wristR[1], wristR[2]);
    set('leftUpperArm', L[0], L[1], L[2]); set('leftLowerArm', 0, elbowL, 0);
    set('leftHand', wristL[0], wristL[1], wristL[2] + Math.sin(t * 1.7) * 0.05 * idle);
    if (s.dead) for (const n of BONES) { const p = P[n]; p[0] *= 0.3; p[1] *= 0.3; p[2] *= 0.3; }

    // ===== 적용 (부드러운 보간: 공격 중에는 빠르게) =====
    const k = 1 - Math.exp(-dt * (fast ? 38 : 13));
    for (const n of BONES) {
      const node = this.b[n]; if (!node) continue;
      const p = P[n];
      _q.setFromEuler(_e.set(p[0] * this.flip, p[1], p[2] * this.flip, 'XYZ'));
      node.quaternion.slerp(_q, k);
    }
    // 손가락: 오른손은 검, 왼손은 권총을 꽉 쥔다
    const grip = 1.25, fl = this.flip;
    for (const f of this.fingers.R) f.rotation.set(0, 0, grip * fl);
    for (const f of this.fingers.L) f.rotation.set(0, 0, -grip * fl);
    for (const f of this.thumbR) f.rotation.set(0, 0.5, 0.3 * fl);
    for (const f of this.thumbL) f.rotation.set(0, -0.5, -0.3 * fl);
    return { fast };
  }

  // 눈 깜빡임: 3~4초 간격, 가끔 두 번 연속
  updateBlink(dt) {
    const em = this.vrm.expressionManager; if (!em) return;
    if (this.blinkP < 0) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) { this.blinkP = 0; }
    }
    let w = 0;
    if (this.blinkP >= 0) {
      this.blinkP += dt / 0.16;                     // 0.16초 동안 감았다 뜬다
      w = Math.sin(clamp(this.blinkP, 0, 1) * Math.PI);
      w = smooth(w);
      if (this.blinkP >= 1) {
        this.blinkP = -1;
        this.blinkT = Math.random() < 0.15 ? 0.18 : 3 + Math.random();   // 15% 확률로 연속 깜빡임
      }
    }
    em.setValue('blink', w);
  }

  // 머리카락·옷자락: 원래 중력 + 흔들리는 바람 + 이동 반대 방향 맞바람 (SpringBone gravityDir 은 월드 공간)
  updateWind(dt, t, vel, boost) {
    if (!this.joints.length) return;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.9) * Math.sin(t * 2.3 + 1.3) + 0.25 * Math.sin(t * 5.1);
    _wind.set(0.55 + 0.25 * Math.sin(t * 0.31), 0.05 * Math.sin(t * 1.7), 0.3 + 0.2 * Math.cos(t * 0.23)).multiplyScalar(0.18 + 0.22 * gust);
    const sp = Math.hypot(vel.x, vel.z);
    if (sp > 0.01) _wind.addScaledVector(_g.set(-vel.x, 0, -vel.z).normalize(), Math.min(0.9, sp * 0.06) * (boost ? 1.4 : 1));
    if (boost) _wind.y -= 0.25;                     // 부스터 분사 기류
    for (const o of this.joints) {
      _g.copy(o.dir).multiplyScalar(o.pow).add(_wind);
      const len = _g.length();
      if (len < 1e-5) { o.j.settings.gravityPower = 0; continue; }
      o.j.settings.gravityDir.copy(_g).divideScalar(len);
      o.j.settings.gravityPower = len;
    }
  }

  // 순간이동(맵 이동·부활)으로 스프링이 크게 튀지 않도록 리셋
  checkTeleport(pos) {
    if (this.prevPos && this.prevPos.distanceToSquared(pos) > 9) this.vrm.springBoneManager?.reset();
    if (!this.prevPos) this.prevPos = pos.clone(); else this.prevPos.copy(pos);
  }
}
