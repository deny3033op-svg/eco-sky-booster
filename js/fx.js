// 파티클 / 베기 궤적 / 충격파 / 빔 / 데미지 숫자
import * as THREE from 'three';

let scene, camera, layer;
let _glow = null;
export function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

class Particles {
  constructor(max, size) {
    this.max = max; this.list = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    const mat = new THREE.PointsMaterial({
      size, map: glowTex(), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  emit(x, y, z, color, n, speed, life, o = {}) {
    const c = _c.set(color);
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.max) return;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.65);
      let vx = Math.sin(ph) * Math.cos(th) * sp, vy = Math.cos(ph) * sp, vz = Math.sin(ph) * Math.sin(th) * sp;
      if (o.up) vy = Math.abs(vy) + o.up;
      if (o.dir) { vx += o.dir.x; vy += o.dir.y; vz += o.dir.z; }
      const s = o.spread || 0;
      this.list.push({
        x: x + (Math.random() - 0.5) * s, y: y + (Math.random() - 0.5) * s, z: z + (Math.random() - 0.5) * s,
        vx, vy, vz, life: life * (0.6 + Math.random() * 0.4), max: life,
        r: c.r, g: c.g, b: c.b, grav: o.grav ?? 0, drag: o.drag ?? 1.5,
      });
    }
  }
  update(dt) {
    const L = this.list; let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.min(1, (p.life / p.max) * 1.6);
      const j = w * 3;
      this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
      this.col[j] = p.r * k; this.col[j + 1] = p.g * k; this.col[j + 2] = p.b * k;
      L[w++] = p;
    }
    L.length = w;
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.list.length = 0; }
}
const _c = new THREE.Color();

const MOBILE = matchMedia('(pointer: coarse)').matches;
let small, big;
const temps = [];
const texts = [];
const geos = {};

function addTemp(obj, life, fn) {
  scene.add(obj);
  temps.push({ obj, t: 0, life, fn });
}

function basicAdd(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

export function rainbowColor(t, out = new THREE.Color()) {
  return out.setHSL(((t % 1) + 1) % 1, 0.9, 0.6);
}

export const FX = {
  init(_scene, _camera, _layer) {
    scene = _scene; camera = _camera; layer = _layer;
    // 모바일: 파티클 상한을 낮춰 CPU 버퍼 갱신 비용 절감
    small = new Particles(MOBILE ? 1400 : 2600, 0.32);
    big = new Particles(MOBILE ? 380 : 700, 0.9);
    scene.add(small.points, big.points);
    initPools();
    const half = Math.PI * 0.42;
    geos.slash = new THREE.RingGeometry(0.7, 1.0, 32, 1, -Math.PI / 2 - half, half * 2).rotateX(-Math.PI / 2);
    geos.slashWide = new THREE.RingGeometry(0.6, 1.0, 48, 1, 0, Math.PI * 2).rotateX(-Math.PI / 2);
    geos.ring = new THREE.RingGeometry(0.88, 1.0, 64).rotateX(-Math.PI / 2);
    geos.disc = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
    geos.beam = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    geos.pillar = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
  },

  // 파티클
  burst(p, color, n = 12, speed = 4, life = 0.5, o = {}) {
    (o.big ? big : small).emit(p.x, p.y, p.z, color, n, speed, life, o);
  },

  // 검 궤적
  slash(p, yaw, color, scale = 2.6, tilt = 0, wide = false) {
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z); g.rotation.y = yaw;
    const inner = new THREE.Group(); inner.rotation.z = tilt; g.add(inner);
    const m = new THREE.Mesh(wide ? geos.slashWide : geos.slash, basicAdd(color, 0.95));
    const m2 = new THREE.Mesh(wide ? geos.slashWide : geos.slash, basicAdd(0xffffff, 0.8));
    m2.scale.setScalar(0.92);
    inner.add(m, m2);
    g.scale.setScalar(scale * 0.7);
    addTemp(g, wide ? 0.32 : 0.22, (o, k) => {
      o.scale.setScalar(scale * (0.7 + k * 0.45));
      m.material.opacity = 0.95 * (1 - k); m2.material.opacity = 0.8 * (1 - k) * (1 - k);
      inner.rotation.y = (wide ? 1 : 0.35) * k * (wide ? 6 : 1);
    });
  },

  // 초승달 검기 아크 (풀링 · 셰이더 스윕). dir: +1 = 오른쪽→왼쪽, -1 = 반대
  crescent(p, yaw, color, scale = 3, tilt = 0, dir = 1, o = {}) { spawnCrescent(p, yaw, color, scale, tilt, dir, o); },
  // 총구 화염 / 피격 섬광 / 스파크
  muzzle(p, dir, color) { spawnMuzzle(p, dir, color); },
  flash(p, color, size = 1.2, life = 0.08) { spawnFlash(p, color, size, life); },
  sparks(p, dir, color, n = 6) {
    _sd.copy(dir).multiplyScalar(-5); _sd.y += 2.5;
    small.emit(p.x, p.y, p.z, color, MOBILE ? Math.ceil(n * 0.6) : n, 7, 0.32, { dir: _sd, grav: 16, drag: 2.2 });
    small.emit(p.x, p.y, p.z, 0xffffff, 2, 3, 0.18);
    spawnFlash(p, color, 0.9, 0.07);
  },
  // 탄환 트레일 (InstancedMesh 1 드로우콜) — 매 프레임 begin → tracer… → end
  tracerBegin() { tracerN = 0; },
  tracer(pos, vel, color, len, width = 0.07) {
    if (tracerN >= TRACER_MAX) return;
    _o.position.copy(pos); _o.lookAt(_v.copy(pos).add(vel)); _o.scale.set(width, width, len); _o.updateMatrix();
    tracers.setMatrixAt(tracerN, _o.matrix); tracers.setColorAt(tracerN, _c.set(color)); tracerN++;
  },
  tracerEnd() {
    tracers.count = tracerN; tracers.instanceMatrix.needsUpdate = true;
    if (tracers.instanceColor) tracers.instanceColor.needsUpdate = true;
  },
  // 발밑 접촉 그림자 (InstancedMesh 1 드로우콜)
  shadowBegin() { shadowN = 0; },
  shadow(x, y, z, r) {
    if (shadowN >= SHADOW_MAX || r <= 0.02) return;
    _o.position.set(x, y + 0.045, z); _o.rotation.set(0, 0, 0); _o.scale.set(r, 1, r); _o.updateMatrix();
    shadows.setMatrixAt(shadowN++, _o.matrix);
  },
  shadowEnd() { shadows.count = shadowN; shadows.instanceMatrix.needsUpdate = true; },
  // 풀링 이펙트의 셰이더를 로딩 중에 미리 컴파일 → 전투 첫 타격 때 끊김(컴파일 히치) 방지
  warmup(renderer, cam) {
    const all = [...crescents.map((x) => x.g), ...flashes.map((x) => x.sp), ...muzzles.map((x) => x.g), ...ghosts.map((x) => x.group)];
    for (const o of all) o.visible = true;
    const tc = tracers.count, sc = shadows.count; tracers.count = 1; shadows.count = 1;
    try { renderer.compile(scene, cam); } catch (e) { console.warn('warmup', e); }
    for (const o of all) o.visible = false;
    tracers.count = tc; shadows.count = sc;
  },
  // 잔상 (Afterimage): 원본 메시의 지오메트리를 공유하고 월드 행렬만 복사
  setGhostSources(list) { setGhostSources(list); },
  ghost(color, opacity = 0.6, life = 0.3) { spawnGhost(color, opacity, life); },

  // 바닥 충격파 링
  ring(p, color, radius = 3, life = 0.45, opacity = 0.9) {
    const m = new THREE.Mesh(geos.ring, basicAdd(color, opacity));
    m.position.set(p.x, (p.y || 0) + 0.08, p.z);
    addTemp(m, life, (o, k) => {
      o.scale.setScalar(0.2 + radius * Math.sqrt(k));
      o.material.opacity = opacity * (1 - k);
    });
  },

  // 공격 예고(텔레그래프) 원판
  telegraph(p, color, radius, life) {
    const m = new THREE.Mesh(geos.disc, basicAdd(color, 0.18));
    const r = new THREE.Mesh(geos.ring, basicAdd(color, 0.7));
    const g = new THREE.Group(); g.add(m, r);
    g.position.set(p.x, (p.y || 0) + 0.06, p.z); m.scale.setScalar(radius); r.scale.setScalar(radius);
    addTemp(g, life, (o, k) => {
      m.scale.setScalar(radius * k);
      m.material.opacity = 0.15 + 0.25 * k;
      r.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(k * 12));
    });
  },

  // 빔 (번개, 레이저)
  beam(a, b, color, width = 0.12, life = 0.25, jitter = false) {
    const g = new THREE.Group();
    const pts = [];
    const segs = jitter ? 6 : 1;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const v = new THREE.Vector3().lerpVectors(a, b, t);
      if (jitter && i > 0 && i < segs) v.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
      pts.push(v);
    }
    const mats = [];
    for (let i = 0; i < segs; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const len = p0.distanceTo(p1);
      const mm = basicAdd(color, 1); mats.push(mm);
      const m = new THREE.Mesh(geos.beam, mm);
      m.position.copy(p0); m.lookAt(p1); m.scale.set(width, width, len);
      const core = new THREE.Mesh(geos.beam, basicAdd(0xffffff, 1)); mats.push(core.material);
      core.position.copy(p0); core.lookAt(p1); core.scale.set(width * 0.4, width * 0.4, len);
      g.add(m, core);
    }
    addTemp(g, life, (o, k) => { for (const mm of mats) mm.opacity = 1 - k; });
  },

  // 하늘에서 내리꽂는 빛기둥
  pillar(p, color, radius = 1, height = 14, life = 0.6) {
    const m = new THREE.Mesh(geos.pillar, basicAdd(color, 0.8));
    m.position.set(p.x, 0, p.z); m.scale.set(radius, height, radius);
    addTemp(m, life, (o, k) => {
      o.scale.set(radius * (1 - k * 0.7), height, radius * (1 - k * 0.7));
      o.material.opacity = 0.8 * (1 - k);
    });
  },

  // 떠오르는 텍스트 (데미지, 획득)
  text(p, str, color = '#fff', size = 18, life = 0.9, cls = '') {
    const el = document.createElement('div');
    el.className = 'ftext ' + cls; el.textContent = str;
    el.style.color = color; el.style.fontSize = size + 'px';
    layer.appendChild(el);
    texts.push({ el, x: p.x + (Math.random() - 0.5) * 0.6, y: p.y, z: p.z + (Math.random() - 0.5) * 0.6, t: 0, life });
    if (texts.length > 70) { const o = texts.shift(); o.el.remove(); }
  },

  update(dt) {
    small.update(dt); big.update(dt);
    updatePools(dt);
    for (let i = temps.length - 1; i >= 0; i--) {
      const t = temps[i]; t.t += dt;
      const k = Math.min(1, t.t / t.life);
      t.fn(t.obj, k);
      if (k >= 1) {
        scene.remove(t.obj);
        t.obj.traverse((o) => { if (o.material) o.material.dispose(); });
        temps.splice(i, 1);
      }
    }
    const w = innerWidth, h = innerHeight;
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i]; t.t += dt;
      const k = t.t / t.life;
      if (k >= 1) { t.el.remove(); texts.splice(i, 1); continue; }
      _v.set(t.x, t.y + k * 1.2, t.z).project(camera);
      if (_v.z > 1) { t.el.style.opacity = 0; continue; }
      const sx = (_v.x * 0.5 + 0.5) * w, sy = (-_v.y * 0.5 + 0.5) * h;
      const sc = k < 0.15 ? 0.6 + k / 0.15 * 0.7 : 1.3 - Math.min(0.3, (k - 0.15) * 0.8);
      t.el.style.transform = `translate(${sx | 0}px,${sy | 0}px) translate(-50%,-50%) scale(${sc.toFixed(2)})`;
      t.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
    }
  },

  clearAll() {
    small.clear(); big.clear();
    clearPools();
    for (const t of temps) scene.remove(t.obj);
    temps.length = 0;
    for (const t of texts) t.el.remove();
    texts.length = 0;
  },
};
const _v = new THREE.Vector3();
const _sd = new THREE.Vector3();
const _o = new THREE.Object3D();

// ============================================================
//  풀링 이펙트 (할당 없는 고빈도 전투 연출)
// ============================================================
const TRACER_MAX = 64, SHADOW_MAX = 72;
let tracers, tracerN = 0, shadows, shadowN = 0;
const crescents = [], flashes = [], muzzles = [], ghosts = [];
let ghostSources = [], ghostGeo = null;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 초승달 지오메트리: XZ 평면, 중심이 +Z(전방), u = 호 진행도, v = 안쪽(0)→바깥 날(1)
function crescentGeo(half, thick, n = 28) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = -half + t * half * 2;
    const th = Math.pow(Math.sin(Math.PI * t), 0.75) * thick;
    const sx = Math.sin(a), cz = Math.cos(a);
    pos.push(sx * (1 - th), 0, cz * (1 - th), sx, 0, cz);
    uv.push(t, 0, t, 1);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function crescentMat(wind) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color() }, uK: { value: 0 }, uDir: { value: 1 }, uAlpha: { value: 1 } },
    defines: wind ? { WIND: 1 } : {},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uK; uniform float uDir; uniform float uAlpha; varying vec2 vUv;
      void main(){
        float t = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
        float head = uK * 1.5 + 0.12;
        float reveal = smoothstep(head, head - 0.18, t);
        float tail = smoothstep(head - 1.05, head - 0.25, t);
        float fade = 1.0 - uK * uK;
        #ifdef WIND
          float line = smoothstep(0.82, 0.9, vUv.y) * smoothstep(1.0, 0.94, vUv.y) + 0.6 * smoothstep(0.3, 0.36, vUv.y) * smoothstep(0.46, 0.4, vUv.y);
          float a = reveal * tail * line * fade * 0.55;
          gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.7) * a * uAlpha, a * uAlpha);
        #else
          float edge = pow(vUv.y, 3.0);
          float a = reveal * tail * (edge * 1.25 + vUv.y * 0.35) * fade;
          vec3 col = mix(uColor, vec3(1.0), edge * 0.85);
          gl_FragColor = vec4(col * a * 1.5 * uAlpha, a * uAlpha);
        #endif
      }`,
  });
}

function initPools() {
  // --- 초승달 검기 ---
  const gN = crescentGeo(1.2, 0.42), gW = crescentGeo(1.95, 0.34, 40), gL = crescentGeo(1.25, 0.9);
  for (let i = 0; i < (MOBILE ? 5 : 8); i++) {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const main = new THREE.Mesh(gN, crescentMat(false)), wind = new THREE.Mesh(gL, crescentMat(true));
    wind.scale.setScalar(1.16);
    inner.add(main, wind);
    main.frustumCulled = wind.frustumCulled = false; main.renderOrder = 6; wind.renderOrder = 6;
    g.visible = false; scene.add(g);
    crescents.push({ g, inner, main, wind, gN, gW, t: 0, life: 1, on: false, vel: new THREE.Vector3(), scale: 1, grow: 0, sweep: 1 });
  }
  // --- 섬광 스프라이트 (4갈래 별) ---
  const star = canvasTex(128, 128, (c) => {
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
    c.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[124, 9], [9, 124]]) {
      const g2 = c.createRadialGradient(64, 64, 0, 64, 64, 62);
      g2.addColorStop(0, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g2; c.beginPath(); c.ellipse(64, 64, w / 2, h / 2, 0, 0, 6.3); c.fill();
    }
  });
  for (let i = 0; i < 10; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sp.visible = false; sp.renderOrder = 7; scene.add(sp);
    flashes.push({ sp, t: 0, life: 1, size: 1, on: false });
  }
  // --- 총구 화염 (전방으로 뻗는 십자 화염 + 별 섬광) ---
  const tongue = canvasTex(32, 128, (c) => {
    const gr = c.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.beginPath(); c.moveTo(16, 128); c.quadraticCurveTo(34, 80, 16, 0); c.quadraticCurveTo(-2, 80, 16, 128); c.fill();
  });
  const tg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);      // +Z 로 뻗음
  const tg2 = tg.clone().rotateZ(Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: tongue, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const a = new THREE.Mesh(tg, mat), b = new THREE.Mesh(tg2, mat);
    a.renderOrder = b.renderOrder = 7;
    g.add(a, b);
    g.visible = false; scene.add(g);
    muzzles.push({ g, mat, t: 0, on: false, len: 1 });
  }
  // --- 탄환 트레일 ---
  const tr = canvasTex(16, 64, (c) => {
    const gr = c.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 16, 64);
    const g2 = c.createLinearGradient(0, 0, 16, 0);
    g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = g2; c.fillRect(0, 0, 16, 64);
  });
  // 머리(z=0, v=1) → 꼬리(z=-1, v=0): 십자 평면 2장
  const p1 = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
  const p2 = p1.clone().rotateZ(Math.PI / 2);
  tracers = new THREE.InstancedMesh(mergeSimple([p1, p2]),
    new THREE.MeshBasicMaterial({ map: tr, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }), TRACER_MAX);
  tracers.setColorAt(0, _c.set(0xffffff));
  tracers.count = 0; tracers.frustumCulled = false; tracers.renderOrder = 6; scene.add(tracers);
  // --- 접촉 그림자 ---
  const sh = canvasTex(64, 64, (c) => {
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  });
  shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), SHADOW_MAX);
  shadows.count = 0; shadows.frustumCulled = false; shadows.renderOrder = 1; scene.add(shadows);
}

function mergeSimple(list) {
  const pos = [], uv = [], idx = []; let off = 0;
  for (const g of list) {
    pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  o.setIndex(idx);
  return o;
}

function spawnCrescent(p, yaw, color, scale, tilt, dir, o) {
  let c = crescents.find((x) => !x.on);
  if (!c) c = crescents.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
  c.on = true; c.t = 0; c.life = o.life || 0.2; c.scale = scale; c.grow = o.grow ?? 0.18; c.sweep = o.sweep ?? 1;
  c.g.visible = true; c.g.position.set(p.x, p.y, p.z); c.g.rotation.set(0, yaw, 0);
  c.inner.rotation.set(o.pitch || 0, 0, tilt);
  c.main.geometry = o.wide ? c.gW : c.gN;
  c.wind.visible = !o.noWind;
  for (const m of [c.main, c.wind]) {
    const u = m.material.uniforms;
    u.uColor.value.set(color); u.uDir.value = dir; u.uK.value = 0; u.uAlpha.value = o.alpha ?? 1;
  }
  if (o.fly) c.vel.set(Math.sin(yaw) * o.fly, 0, Math.cos(yaw) * o.fly); else c.vel.set(0, 0, 0);
  c.g.scale.setScalar(scale);
}
function spawnFlash(p, color, size, life) {
  const f = flashes.find((x) => !x.on) || flashes[0];
  f.on = true; f.t = 0; f.life = life; f.size = size;
  f.sp.visible = true; f.sp.position.set(p.x, p.y, p.z);
  f.sp.material.color.set(color).lerp(_c.set(0xffffff), 0.45); f.sp.material.rotation = Math.random() * Math.PI;
}
function spawnMuzzle(p, dir, color) {
  const m = muzzles.find((x) => !x.on) || muzzles[0];
  m.on = true; m.t = 0; m.g.visible = true;
  m.g.position.set(p.x, p.y, p.z); m.g.lookAt(_v.set(p.x + dir.x, p.y + dir.y, p.z + dir.z));
  m.g.rotateZ(Math.random() * Math.PI);
  m.len = 0.75 + Math.random() * 0.45;
  m.mat.color.set(color).lerp(_c.set(0xffffff), 0.35);
  spawnFlash(p, color, 0.95, 0.055);
}

// ---- 잔상 ----
function ghostMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0x66ccff) }, uOpacity: { value: 0 } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; void main(){ float f = 1.0 - abs(normalize(vN).z); float a = (0.22 + 0.9 * f * f) * uOpacity; gl_FragColor = vec4(uColor * a, a); }',
  });
}
function setGhostSources(list) {
  for (const g of ghosts) { scene.remove(g.group); g.mat.dispose(); }
  ghosts.length = 0;
  ghostSources = list.filter((m) => m && m.geometry && !m.isSkinnedMesh && m.geometry.attributes.normal);
  if (!ghostSources.length) {
    // 스킨드/폴백 캐릭터: 실루엣 캡슐로 대체
    if (!ghostGeo) ghostGeo = new THREE.CapsuleGeometry(0.3, 1.05, 4, 10).translate(0, 0.88, 0);
    ghostSources = list.filter((m) => m && !m.geometry).slice(0, 1)
      .map((root) => ({ geometry: ghostGeo, matrixWorld: root.matrixWorld, updateWorldMatrix: (a, b) => root.updateWorldMatrix(a, b) }));
  }
  if (!ghostSources.length) return;
  for (let i = 0; i < (MOBILE ? 3 : 6); i++) {
    const group = new THREE.Group(), mat = ghostMat(), meshes = [];
    for (const src of ghostSources) {
      const m = new THREE.Mesh(src.geometry, mat);
      m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 3;
      group.add(m); meshes.push(m);
    }
    group.visible = false; scene.add(group);
    ghosts.push({ group, mat, meshes, t: 0, life: 1, op: 0, on: false });
  }
}
function spawnGhost(color, opacity, life) {
  if (!ghosts.length) return;
  let g = ghosts.find((x) => !x.on);
  if (!g) g = ghosts.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
  g.on = true; g.t = 0; g.life = life; g.op = opacity; g.group.visible = true;
  g.mat.uniforms.uColor.value.set(color); g.mat.uniforms.uOpacity.value = opacity;
  ghostSources.forEach((src, i) => {
    src.updateWorldMatrix(true, false);
    g.meshes[i].matrix.copy(src.matrixWorld); g.meshes[i].matrixWorldNeedsUpdate = true;
  });
}

function updatePools(dt) {
  for (const c of crescents) {
    if (!c.on) continue;
    c.t += dt; const k = Math.min(1, c.t / c.life);
    const e = 1 - (1 - k) * (1 - k);
    c.main.material.uniforms.uK.value = Math.min(1, e * c.sweep + (1 - c.sweep));
    c.wind.material.uniforms.uK.value = Math.min(1, k * c.sweep + (1 - c.sweep));
    c.g.scale.setScalar(c.scale * (1 + c.grow * e));
    c.g.position.addScaledVector(c.vel, dt);
    if (k >= 1) { c.on = false; c.g.visible = false; }
  }
  for (const f of flashes) {
    if (!f.on) continue;
    f.t += dt; const k = Math.min(1, f.t / f.life);
    f.sp.scale.setScalar(f.size * (0.55 + k * 0.9)); f.sp.material.opacity = 1 - k * k;
    if (k >= 1) { f.on = false; f.sp.visible = false; }
  }
  for (const m of muzzles) {
    if (!m.on) continue;
    m.t += dt; const k = Math.min(1, m.t / 0.06);
    const w = 0.26 * (1 + k * 0.5);
    m.g.scale.set(w, w, m.len * (0.6 + k * 0.6)); m.mat.opacity = 1 - k;
    if (k >= 1) { m.on = false; m.g.visible = false; }
  }
  for (const g of ghosts) {
    if (!g.on) continue;
    g.t += dt; const k = Math.min(1, g.t / g.life);
    g.mat.uniforms.uOpacity.value = g.op * (1 - k) * (1 - k);
    if (k >= 1) { g.on = false; g.group.visible = false; }
  }
}
function clearPools() {
  for (const a of [crescents, flashes, muzzles, ghosts]) for (const x of a) { x.on = false; (x.g || x.sp || x.group).visible = false; }
  if (tracers) tracers.count = 0;
  if (shadows) shadows.count = 0;
}
