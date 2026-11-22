// ============================================================
//  하늘섬 환경 렌더링 — 스카이돔 · 대기 · 지형 · 판타지 소품 · 앰비언트 파티클
//  (게임 로직과 분리: buildMap()이 heightAt / update / applyEnv 를 함께 반환)
// ============================================================
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, part, GEO as G, glowMat, addGlow, buildGate } from './units.js';
import { Sky } from 'three/addons/objects/Sky.js';
import * as Models from './models.js';
import { createNoise2D, createNoise3D } from 'simplex-noise';   // MIT · assets/vendor/simplex-noise

const MOBILE = matchMedia('(pointer: coarse)').matches;
const QTY = MOBILE ? 0.42 : 1;              // 인스턴스 밀도 (모바일 감축)
const WIND = { value: 0 };                  // 공용 바람 시간 유니폼
const _c = new THREE.Color();
const _o = new THREE.Object3D();

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
// 지형 노이즈: simplex-noise (시드 고정 → 매번 같은 지형). n3 = 3D 단일 옥타브, fbm2 = 2D 프랙탈
const SN3 = createNoise3D(rng(90210)), SN2 = createNoise2D(rng(31337));
const n3 = (x, y, z) => SN3(x * 0.42, y * 0.42, z * 0.42);
const fbm2 = (x, z, oct = 4) => { let a = 0.5, f = 1, v = 0, n = 0; for (let i = 0; i < oct; i++) { v += SN2(x * f, z * f) * a; n += a; a *= 0.5; f *= 2.03; } return v / n; };
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

// ============================================================
//  섬별 테마 (낮 / 신비한 밤 / 노을 / 핏빛 밤 / 아지트 황금빛 오후)
// ============================================================
const THEMES = {
  0: { // 초원 섬 — 맑은 낮
    top: 0x2a6fd6, horizon: 0xd2ecff, bottom: 0x9ccaf0, sunCol: 0xfff0c8, sunDir: [0.55, 0.62, 0.55], stars: 0,
    sky: { turbidity: 4, rayleigh: 1.3, mie: 0.004, g: 0.8, gain: 0.5 },
    fog: 0xc8e4f8, fogD: 0.0052, hemiSky: 0xd8ecff, hemiGround: 0x6f8a4a, hemiI: 1.1, sunI: 2.6, sunLight: 0xfff0d6, exposure: 1.0,
    grass: [0x5aa845, 0x86c858], grassTip: 0x9fdc6a, grassN: 1, cliff: 0x8a6a4c, rock: 0x8f8a84, cloud: 0xffffff, cloudShade: 0xc8daf0,
    water: 0x2f9ccf, waterGlow: 0xc0f6ff, leaves: [0x4c9e44, 0x62b852, 0xffb4cc, 0x7cc65e, 0xffc8da], flowers: [0xff7aa8, 0xfff070, 0xffffff, 0xb89aff, 0xff9a5a],
    circle: 0x9affd0, fall: 0xbff0ff,
    particles: [{ mode: 1, count: 220, colA: 0xffb8d0, colB: 0xffffff, size: 0.16, blend: 'normal', opacity: 0.9 },
      { mode: 0, count: 90, colA: 0xfff6b0, colB: 0xd8ffe8, size: 0.2 }] },
  1: { // 수정 동굴 섬 — 신비한 밤
    top: 0x050a26, horizon: 0x3a4aa8, bottom: 0x0a1236, sunCol: 0x9ab8ff, sunDir: [-0.35, 0.55, -0.45], stars: 1,
    fog: 0x1e2a62, fogD: 0.0078, hemiSky: 0x7a8aff, hemiGround: 0x20163a, hemiI: 0.95, sunI: 1.25, sunLight: 0xb0c4ff, exposure: 1.2,
    grass: [0x2a4a6a, 0x3a6a7a], grassTip: 0x6ad8d0, grassN: 0.55, cliff: 0x3a3a5a, rock: 0x4a4a6a, cloud: 0x5a6ab0, cloudShade: 0x2a3a8a,
    water: 0x1a4aa8, waterGlow: 0x6af0ff, leaves: [0x6af0ff, 0x9a8aff, 0x4ad8ff], flowers: [0x6af0ff, 0xb08aff, 0xffffff],
    circle: 0x7ad8ff, fall: 0x8ae8ff, pathTint: 0x9aa4d8,
    particles: [{ mode: 0, count: 200, colA: 0x7af0ff, colB: 0xc8a0ff, size: 0.24 },
      { mode: 2, count: 80, colA: 0x9ad8ff, colB: 0xffffff, size: 0.12, height: 10 },
      { mode: 1, count: 90, colA: 0x8af0ff, colB: 0xd0b0ff, size: 0.13, opacity: 0.7 }] },          // 빛나는 수정 꽃잎
  2: { // 빛과 어둠의 유적 — 노을
    top: 0x2e2462, horizon: 0xffa878, bottom: 0x6a4a72, sunCol: 0xffb070, sunDir: [0.75, 0.2, -0.5], stars: 0.25,
    sky: { turbidity: 9, rayleigh: 3, mie: 0.012, g: 0.88, gain: 0.55 },
    fog: 0xe0a294, fogD: 0.006, hemiSky: 0xffc8a8, hemiGround: 0x4a3050, hemiI: 1.0, sunI: 2.4, sunLight: 0xffbe8a, exposure: 1.05,
    grass: [0xb09a58, 0xc8b070], grassTip: 0xf0d890, grassN: 0.75, cliff: 0x7a5a4a, rock: 0x9a8a80, cloud: 0xffd8c0, cloudShade: 0xb07a9a,
    water: 0x6a4a8a, waterGlow: 0xffd0a0, leaves: [0xe89a3a, 0xd8682a, 0xffc04a, 0xc04a3a], flowers: [0xffd060, 0xffffff, 0xd890ff],
    circle: 0xffe0a0, fall: 0xffd8c0,
    particles: [{ mode: 2, count: 140, colA: 0xffd080, colB: 0xd0a0ff, size: 0.14, height: 12 },
      { mode: 0, count: 70, colA: 0xffe8a0, colB: 0xffffff, size: 0.18 },
      { mode: 1, count: 150, colA: 0xe8822a, colB: 0xffc04a, size: 0.17, blend: 'normal', opacity: 0.9 }] },   // 단풍잎
  3: { // 보스 섬 — 핏빛 달밤
    top: 0x05020e, horizon: 0x6a1a4a, bottom: 0x12041a, sunCol: 0xff4a7a, sunDir: [0.1, 0.38, -0.85], stars: 0.6,
    fog: 0x2a0e2c, fogD: 0.0085, hemiSky: 0xa86ac8, hemiGround: 0x3a1a2a, hemiI: 1.15, sunI: 1.9, sunLight: 0xffb0d0, exposure: 1.3,
    grass: [0x5a3a4e, 0x6a3a50], grassTip: 0x6a3a4a, grassN: 0, cliff: 0x2a1a2a, rock: 0x2a1e2a, cloud: 0x4a2a5a, cloudShade: 0x2a0a2a,
    water: 0xff3a10, waterGlow: 0xffd040, leaves: [0x3a1a3a], flowers: [0xff3a6a],
    circle: 0xc060ff, fall: 0xff6a20, pathTint: 0x8a6a80,
    particles: [{ mode: 2, count: 260, colA: 0xff5a2a, colB: 0xc04aff, size: 0.16, height: 14 },
      { mode: 1, count: 110, colA: 0x5a4a58, colB: 0xff6a4a, size: 0.12, blend: 'normal', opacity: 0.75 }] },  // 재·불티
  home: { // 아지트 — 황금빛 오후
    top: 0x3a7ed8, horizon: 0xffdcb0, bottom: 0xa8bce0, sunCol: 0xffd090, sunDir: [0.65, 0.32, 0.45], stars: 0,
    sky: { turbidity: 7, rayleigh: 2.2, mie: 0.008, g: 0.85, gain: 0.5 },
    fog: 0xf2dcc8, fogD: 0.0055, hemiSky: 0xffe8d0, hemiGround: 0x6a7a4a, hemiI: 1.05, sunI: 2.5, sunLight: 0xffd8a8, exposure: 1.02,
    grass: [0x6cb44c, 0x98d460], grassTip: 0xc8ec80, grassN: 0.9, cliff: 0x9a7a58, rock: 0x9a9088, cloud: 0xfff4ea, cloudShade: 0xe0b8b0,
    water: 0x3aa8d0, waterGlow: 0xe0fbff, leaves: [0xffb4cc, 0x62b852, 0xffc8da, 0x7cc65e], flowers: [0xff7aa8, 0xfff070, 0xffffff, 0xb89aff, 0xff9a5a],
    circle: 0xffe0a0, fall: 0xd0f4ff,
    particles: [{ mode: 0, count: 110, colA: 0xffe28a, colB: 0xfff6d0, size: 0.2 },
      { mode: 1, count: 140, colA: 0xffb8d0, colB: 0xffffff, size: 0.15, blend: 'normal', opacity: 0.9 }] },
};

// ============================================================
//  절차적 Canvas 텍스처
// ============================================================
const TEX = {};
function canvasTex(size, draw, repeat = true, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = MOBILE ? 2 : 8;
  return t;
}
function grassTex() {
  return TEX.grass ||= canvasTex(256, (g, S) => {
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, S, S);
    const r = rng(11);
    for (let i = 0; i < 40; i++) { // 부드러운 얼룩
      const x = r() * S, y = r() * S, rad = 20 + r() * 50, v = 200 + r() * 55 | 0;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 2600; i++) { // 잔디 결
      const x = r() * S, y = r() * S, len = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 0.9, v = 150 + r() * 105 | 0;
      g.strokeStyle = `rgba(${v},${v},${v},0.55)`; g.lineWidth = 1 + r();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
  });
}
function stoneTex() {
  return TEX.stone ||= canvasTex(256, (g, S) => {
    g.fillStyle = '#5a544c'; g.fillRect(0, 0, S, S);
    const r = rng(7), N = 5, cell = S / N;
    for (let yy = -1; yy <= N; yy++) for (let xx = -1; xx <= N; xx++) {
      const cx = (xx + 0.5 + (yy % 2 ? 0.5 : 0)) * cell + (r() - 0.5) * 8, cy = (yy + 0.5) * cell + (r() - 0.5) * 8;
      const w = cell * (0.42 + r() * 0.06), h = cell * (0.4 + r() * 0.06), v = 160 + r() * 60 | 0;
      g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      g.beginPath(); g.ellipse(cx, cy, w, h, r() * 0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath(); g.ellipse(cx - w * 0.2, cy - h * 0.25, w * 0.55, h * 0.4, 0, 0, Math.PI * 2); g.fill();
      if (r() < 0.35) { g.fillStyle = 'rgba(90,140,60,0.35)'; g.beginPath(); g.ellipse(cx + w * 0.5, cy + h * 0.5, w * 0.35, h * 0.2, 0, 0, Math.PI * 2); g.fill(); }
    }
  });
}
function woodTex() {
  return TEX.wood ||= canvasTex(128, (g, S) => {
    g.fillStyle = '#a8784a'; g.fillRect(0, 0, S, S);
    const r = rng(5);
    for (let i = 0; i < 70; i++) {
      const x = r() * S, v = r() < 0.5 ? 'rgba(90,50,20,0.25)' : 'rgba(255,220,170,0.15)';
      g.strokeStyle = v; g.lineWidth = 1 + r() * 2;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 4, S * 0.3, x - 4, S * 0.6, x + 2, S); g.stroke();
    }
    g.fillStyle = 'rgba(60,30,10,0.5)'; g.fillRect(0, 0, 3, S);
  });
}
function roofTex() {
  return TEX.roof ||= canvasTex(256, (g, S) => {
    g.fillStyle = '#7a2222'; g.fillRect(0, 0, S, S);
    const rows = 10, h = S / rows, r = rng(3);
    for (let y = 0; y < rows; y++) for (let x = -1; x < 9; x++) {
      const v = 170 + r() * 50 | 0;
      g.fillStyle = `rgb(${v},${(v * 0.3) | 0},${(v * 0.28) | 0})`;
      const px = (x + (y % 2) * 0.5) * (S / 8);
      g.fillRect(px + 1, y * h + 1, S / 8 - 2, h * 0.85);
      g.beginPath(); g.ellipse(px + S / 16, y * h + h * 0.85, S / 16 - 1, h * 0.22, 0, 0, Math.PI); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + 1, y * h + h * 0.9, S / 8 - 2, 3);
    }
  });
}
function runeTex() {
  return TEX.rune ||= canvasTex(512, (g, S) => {
    const c = S / 2;
    g.clearRect(0, 0, S, S);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 12;
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
    ring(S * 0.47, 5); ring(S * 0.43, 2); ring(S * 0.3, 3); ring(S * 0.16, 2);
    const r = rng(9);
    for (let i = 0; i < 36; i++) { // 룬 문자
      const a = (i / 36) * Math.PI * 2, rr = S * 0.365;
      g.save(); g.translate(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.rotate(a + Math.PI / 2);
      g.lineWidth = 2.5; g.beginPath();
      for (let k = 0; k < 3; k++) { g.moveTo((r() - 0.5) * 18, (r() - 0.5) * 22); g.lineTo((r() - 0.5) * 18, (r() - 0.5) * 22); }
      g.stroke(); g.restore();
    }
    g.lineWidth = 3;
    for (const off of [0, Math.PI / 6]) { // 육망성
      g.beginPath();
      for (let k = 0; k <= 3; k++) { const a = off + k * (Math.PI * 2 / 3); const x = c + Math.cos(a) * S * 0.3, y = c + Math.sin(a) * S * 0.3; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * S * 0.43, c + Math.sin(a) * S * 0.43, 9, 0, Math.PI * 2); g.fill(); }
  }, false);
}
function cloudTex() {
  return TEX.cloud ||= canvasTex(256, (g, S) => {
    g.clearRect(0, 0, S, S);
    const r = rng(21);
    for (let i = 0; i < 70; i++) {
      const x = r() * S, y = r() * S, rad = 14 + r() * 40;
      for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
  });
}

// ============================================================
//  셰이더 머티리얼
// ============================================================
export function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2a6fd6) }, horizon: { value: new THREE.Color(0xd2ecff) }, bottom: { value: new THREE.Color(0x9ccaf0) },
      sunColor: { value: new THREE.Color(0xfff0c8) }, sunDir: { value: new THREE.Vector3(0.5, 0.6, 0.5).normalize() },
      stars: { value: 0 }, time: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir;
      uniform float stars; uniform float time;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 1.0, h), 0.55))
                           : mix(horizon, bottom, pow(smoothstep(0.0, -0.6, h), 0.6));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 900.0) * 2.5 + pow(s, 64.0) * 0.45 + pow(s, 8.0) * 0.22 + pow(s, 2.0) * 0.08);
        col += horizon * 0.18 * exp(-abs(h) * 10.0);
        if (stars > 0.0 && h > 0.02) {
          vec3 g = floor(d * 260.0);
          float r = hash(g);
          float tw = 0.55 + 0.45 * sin(time * 2.0 + r * 60.0);
          col += vec3(0.9, 0.95, 1.0) * step(0.9965, r) * stars * tw * smoothstep(0.02, 0.35, h);
          // 은하수 띠
          float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.5, -0.8))) * 4.0, 2.0));
          col += vec3(0.35, 0.3, 0.6) * band * stars * 0.18 * smoothstep(0.0, 0.4, h);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 20), mat);
  m.renderOrder = -100; m.frustumCulled = false;
  return m;
}

// 하늘 시스템: 낮/노을/아지트 = three.js 공식 Sky.js(대기 산란), 밤 테마 = 별이 뜨는 그라디언트 돔
export class SkySystem extends THREE.Group {
  constructor() {
    super();
    this.grad = buildSky(); this.add(this.grad);
    const sky = new Sky();
    sky.scale.setScalar(1400);
    const m = sky.material;
    m.depthWrite = false; m.depthTest = false;
    m.uniforms.uGain = { value: 0.5 };
    m.uniforms.uSkirt = { value: new THREE.Color(0xc8e4f8) };
    m.fragmentShader = 'uniform float uGain;\nuniform vec3 uSkirt;\n' + m.fragmentShader.replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      'vec3 skyC = retColor * uGain; skyC = mix(skyC, uSkirt, smoothstep(0.03, -0.1, direction.y)); gl_FragColor = vec4( skyC, 1.0 );');
    m.needsUpdate = true;
    sky.renderOrder = -100; sky.frustumCulled = false;
    this.sky = sky; this.add(sky);
  }
  setTheme(T, sd) {
    const u = this.grad.material.uniforms;
    u.top.value.setHex(T.top); u.horizon.value.setHex(T.horizon); u.bottom.value.setHex(T.bottom);
    u.sunColor.value.setHex(T.sunCol); u.sunDir.value.copy(sd); u.stars.value = T.stars;
    const useSky = !!T.sky;
    this.sky.visible = useSky; this.grad.visible = !useSky;
    if (useSky) {
      const su = this.sky.material.uniforms;
      su.turbidity.value = T.sky.turbidity; su.rayleigh.value = T.sky.rayleigh;
      su.mieCoefficient.value = T.sky.mie; su.mieDirectionalG.value = T.sky.g;
      su.sunPosition.value.copy(sd); su.uGain.value = T.sky.gain; su.uSkirt.value.setHex(T.fog);
    }
  }
  update(t) { this.grad.material.uniforms.time.value = t; }
}

// 물: mode 0 = 연못(방사형 가장자리 빛), mode 1 = 흐르는 물(시냇물/폭포)
function waterMat(col, glow, mode = 0, speed = 1, alpha = 0.85) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    defines: { MODE: mode },
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uCol: { value: new THREE.Color(col) }, uGlow: { value: new THREE.Color(glow) }, uSpeed: { value: speed }, uAlpha: { value: alpha },
    }]),
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uCol; uniform vec3 uGlow; uniform float uSpeed; uniform float uAlpha;
      varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        #if MODE == 0
          float r = length(vUv - 0.5) * 2.0;
          float w = sin(vW.x * 1.3 + uTime * 1.2) * sin(vW.z * 1.1 - uTime * 0.9) + 0.5 * sin((vW.x + vW.z) * 2.3 + uTime * 2.0);
          float caust = smoothstep(0.55, 1.2, w);
          vec3 col = uCol * (0.8 + 0.2 * w) + uGlow * caust * 0.55;
          float edge = smoothstep(0.72, 0.98, r);
          col += uGlow * edge * 0.7;
          float a = mix(uAlpha, 0.95, edge) * (1.0 - smoothstep(0.96, 1.0, r));
        #else
          float st = 0.5 + 0.5 * sin(vUv.x * 31.0 + 3.0 * sin(vUv.x * 9.0));
          float mv = 0.5 + 0.5 * sin((vUv.y * 22.0 + uTime * uSpeed * 6.0) * (0.8 + st * 0.4));
          vec3 col = mix(uCol, uGlow, mv * st * 0.9);
          float ex = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float a = uAlpha * ex * (0.6 + 0.4 * mv);
        #endif
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// GPU 앰비언트 파티클: mode 0 반딧불이 / 1 흩날리는 꽃잎 / 2 떠오르는 빛·불씨 / 3 굴뚝 연기
function ambient(o) {
  const n = Math.max(8, Math.round(o.count * (MOBILE ? 0.55 : 1)));
  const [cx, cz] = o.center || [0, 0];
  const radius = o.radius, base = o.base ?? 0.3, H = o.height ?? 7;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    pos[i * 3] = cx + Math.cos(a) * r; pos[i * 3 + 1] = base + Math.random() * H; pos[i * 3 + 2] = cz + Math.sin(a) * r;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, base + H / 2, cz), radius + H + 4);
  const scale = innerHeight * Math.min(devicePixelRatio, MOBILE ? 1.5 : 2) * 0.95;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: o.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
    defines: { MODE: o.mode },
    uniforms: {
      uTime: { value: 0 }, uSize: { value: o.size * scale }, uBase: { value: base }, uH: { value: H },
      uA: { value: new THREE.Color(o.colA) }, uB: { value: new THREE.Color(o.colB ?? o.colA) }, uOpacity: { value: o.opacity ?? 1 },
    },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uSize; uniform float uBase; uniform float uH;
      attribute float aSeed; varying float vS; varying float vA;
      void main(){
        vec3 p = position; float t = uTime; float s = aSeed; float sz = 1.0;
        #if MODE == 0
          p.x += sin(t * 0.45 + s * 20.0) * 1.6; p.z += cos(t * 0.38 + s * 13.0) * 1.6; p.y += sin(t * 0.7 + s * 7.0) * 0.7;
          vA = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(t * 2.2 + s * 40.0), 2.0);
        #elif MODE == 1
          float k = mod(position.y - uBase - t * (0.45 + s * 0.5), uH);
          p.y = uBase + k;
          p.x += sin(t * 0.8 + s * 30.0) * 1.4 + sin(t * 0.25 + s) * 2.0; p.z += cos(t * 0.6 + s * 10.0) * 1.4;
          vA = smoothstep(0.0, 0.8, k) * smoothstep(uH, uH - 1.5, k);
        #else
          float k = mod(position.y - uBase + t * (0.5 + s * 0.8), uH);
          p.y = uBase + k;
          float f = k / uH;
          p.x += sin(t * 0.9 + s * 20.0) * 0.6 * (f + 0.3); p.z += cos(t * 0.7 + s * 9.0) * 0.6 * (f + 0.3);
          vA = (1.0 - f) * smoothstep(0.0, 0.6, k);
          #if MODE == 3
            sz = 1.0 + f * 3.0;
          #endif
        #endif
        vS = s;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * sz * (0.6 + s * 0.8) / max(0.5, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uA; uniform vec3 uB; uniform float uOpacity;
      varying float vS; varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        #if MODE == 1
          c.x *= 1.7;
          float a = smoothstep(0.5, 0.3, length(c));
        #else
          float a = smoothstep(0.5, 0.0, length(c)); a *= a;
        #endif
        vec3 col = mix(uA, uB, step(0.5, vS));
        gl_FragColor = vec4(col, a * vA * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 4;
  return pts;
}

// 바람 흔들림 (InstancedMesh 정점 셰이더 주입)
function addWind(mat, strength, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = WIND;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float wh = max(position.y, 0.0);
      vec3 ip = vec3(0.0);
      #ifdef USE_INSTANCING
        ip = instanceMatrix[3].xyz;
      #endif
      float wv = sin(uWind * 1.6 + ip.x * 0.35 + ip.z * 0.27) + 0.5 * sin(uWind * 3.3 + ip.z * 0.6 + ip.x * 0.2);
      transformed.x += wv * ${strength.toFixed(4)} * wh * wh;
      transformed.z += wv * ${(strength * 0.6).toFixed(4)} * wh * wh;`);
  };
  mat.customProgramCacheKey = () => 'wind_' + key;
  return mat;
}

// ============================================================
//  지오메트리 (모듈 캐시)
// ============================================================
const GC = {};
function vcolor(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function lumpy(geo, jit, freq = 3) {
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + n3(x * freq, y * freq, z * freq) * jit, y + n3(y * freq + 1.3, z * freq, x * freq) * jit, z + n3(z * freq + 2.1, x * freq, y * freq) * jit);
  }
  geo.computeVertexNormals();
  return geo;
}
function blob(r, x, y, z, d = 1) { return new THREE.IcosahedronGeometry(r, d).translate(x, y, z); }

function tuftGeo() {
  if (GC.tuft) return GC.tuft;
  const pos = [], col = [], nor = [];
  const blades = 5;
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI + k * 0.4, ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.055, h = 0.3 + (k % 3) * 0.1, lean = 0.12 + (k % 2) * 0.08;
    const ox = Math.cos(a * 2.3) * 0.08, oz = Math.sin(a * 2.3) * 0.08;
    const L = [ox - ca * w, 0, oz - sa * w], Rr = [ox + ca * w, 0, oz + sa * w], Tp = [ox - sa * lean, h, oz + ca * lean];
    pos.push(...L, ...Rr, ...Tp, ...Rr, ...L, ...Tp);           // 앞/뒤 두 면 (법선은 모두 위쪽 → 역광 검은 잎 방지)
    for (let q = 0; q < 2; q++) { col.push(0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 1.12, 1.12, 1.12); nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return (GC.tuft = g);
}
function flowerGeo() {
  if (GC.flower) return GC.flower;
  const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.36, 4).translate(0, 0.18, 0);
  vcolor(stem, () => [0.25, 0.55, 0.22]);
  const head = new THREE.IcosahedronGeometry(0.075, 0).scale(1, 0.55, 1).translate(0, 0.38, 0);
  vcolor(head, () => [1, 1, 1]);
  const core = new THREE.IcosahedronGeometry(0.03, 0).translate(0, 0.41, 0);
  vcolor(core, () => [1.0, 0.85, 0.3]);
  for (const g of [stem, head, core]) g.deleteAttribute('uv');
  GC.flower = mergeGeometries([stem.toNonIndexed(), head, core]);
  return GC.flower;
}
function mossGeo() {
  if (GC.moss) return GC.moss;
  const g = new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 1; i < p.count; i++) { const k = 0.72 + ((i * 7919) % 13) / 13 * 0.5; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  return (GC.moss = g);
}
function rockGeo() {
  return GC.rock ||= lumpy(new THREE.DodecahedronGeometry(1, 1), 0.18, 1.6);
}
function trunkGeo(kind) {
  const key = 'trunk_' + kind;
  if (GC[key]) return GC[key];
  const parts = [new THREE.CylinderGeometry(0.2, 0.36, 3.0, 7, 3).translate(0, 1.5, 0)];
  const br = (len, ang, y, rz) => { const b = new THREE.CylinderGeometry(0.06, 0.12, len, 5).translate(0, len / 2, 0); b.rotateZ(rz); b.rotateY(ang); b.translate(0, y, 0); return b; };
  parts.push(br(1.2, 0.3, 2.2, 0.8), br(1.0, 2.5, 2.5, 0.75), br(0.9, 4.4, 2.0, 0.9));
  if (kind === 'dead') parts.push(br(1.6, 1.3, 2.8, 1.0), br(1.3, 3.6, 3.0, 0.6), br(0.8, 5.5, 2.4, 1.2));
  const g = lumpy(mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; })), 0.05, 2);
  vcolor(g, (x, y) => { const v = 0.55 + Math.min(1, y / 3) * 0.3; return [v, v, v]; });
  return (GC[key] = g);
}
function foliageGeo(kind) {
  const key = 'fol_' + kind;
  if (GC[key]) return GC[key];
  let parts;
  if (kind === 'crystal') {
    parts = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, r = i ? 0.9 : 0;
      const o = new THREE.OctahedronGeometry(0.55, 0).scale(0.7, 1.9, 0.7);
      o.rotateZ(i ? 0.5 : 0); o.rotateY(a); o.translate(Math.cos(a) * r, 3.4 + (i % 3) * 0.4, Math.sin(a) * r);
      parts.push(o);
    }
    const g = mergeGeometries(parts);
    vcolor(g, (x, y) => { const v = 0.6 + Math.min(1, (y - 2.6) / 2.2) * 0.6; return [v, v, v]; });
    return (GC[key] = g);
  }
  // 2~3단 풍성한 둥근 잎
  parts = [
    blob(1.55, 0, 3.0, 0), blob(1.15, 1.05, 2.7, 0.3), blob(1.1, -0.95, 2.8, -0.35), blob(1.05, 0.2, 2.6, 1.0), blob(1.0, -0.2, 2.7, -1.0),
    blob(1.2, 0.15, 4.0, 0.1), blob(0.85, 0.7, 3.8, -0.5), blob(0.8, -0.65, 3.9, 0.45),
    blob(0.75, 0, 4.85, 0),
  ];
  const g = lumpy(mergeGeometries(parts), 0.16, 1.4);
  vcolor(g, (x, y, z) => {
    const v = 0.55 + Math.min(1, Math.max(0, (y - 1.8) / 3.4)) * 0.55 + n3(x * 2, y * 2, z * 2) * 0.06;
    return [v, v, v];
  });
  return (GC[key] = g);
}
function bushGeo() {
  if (GC.bush) return GC.bush;
  const g = lumpy(mergeGeometries([blob(0.8, 0, 0.5, 0), blob(0.6, 0.6, 0.38, 0.2), blob(0.55, -0.55, 0.35, -0.1), blob(0.5, 0.1, 0.35, 0.6)]), 0.1, 1.8);
  vcolor(g, (x, y) => { const v = 0.6 + Math.min(1, y / 1.2) * 0.5; return [v, v, v]; });
  return (GC.bush = g);
}
function crystalGeo() {
  if (GC.crystal) return GC.crystal;
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1, r = i ? 0.35 : 0, h = i ? 0.9 + (i % 3) * 0.35 : 1.6;
    const o = new THREE.OctahedronGeometry(0.3, 0).scale(0.8, h * 1.5, 0.8);
    o.rotateZ(i ? 0.45 : 0); o.rotateY(a); o.translate(Math.cos(a) * r, h * 0.6, Math.sin(a) * r);
    parts.push(o);
  }
  const g = mergeGeometries(parts);
  vcolor(g, (x, y) => { const v = 0.55 + Math.min(1, y / 2.2) * 0.75; return [v, v, v]; });
  return (GC.crystal = g);
}
function pillarGeo() {
  if (GC.pillar) return GC.pillar;
  const g = new THREE.CylinderGeometry(0.5, 0.58, 1, 10, 6).translate(0, 0.5, 0);
  g.deleteAttribute('uv');
  const m = mergeVertices(g), p = m.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fl = 1 + 0.06 * Math.cos(Math.atan2(z, x) * 10);                 // 세로 홈
    const top = y > 0.99 ? n3(x * 4, 0, z * 4) * 0.12 - 0.05 : 0;          // 부서진 윗면
    p.setXYZ(i, x * fl, y + top, z * fl);
  }
  m.computeVertexNormals();
  vcolor(m, (x, y, z) => { const v = 0.75 + n3(x * 3, y * 6, z * 3) * 0.12; return [v, v, v]; });
  return (GC.pillar = m);
}
function mushroomGeo() {
  if (GC.mush) return GC.mush;
  const stem = new THREE.CylinderGeometry(0.06, 0.09, 0.4, 6).translate(0, 0.2, 0);
  const cap = new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.38, 0);
  GC.mush = { stem, cap };
  return GC.mush;
}

function instanced(geo, mat, list, { cast = false, receive = false } = {}) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => {
    _o.position.set(it.x, it.y, it.z);
    _o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    const s = it.s ?? 1;
    _o.scale.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
    _o.updateMatrix();
    m.setMatrixAt(i, _o.matrix);
    if (it.c !== undefined) m.setColorAt(i, _c.set(it.c));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = cast; m.receiveShadow = receive;
  m.computeBoundingSphere();
  return m;
}

// 지면 높이 (완만한 언덕 + 연못 오목 + 나무다리 아치)
function makeHeight({ hills = [], pond = null, bridge = null, flat = false }) {
  const f = (x, z) => heightFn(x, z, true);
  f.ground = (x, z) => heightFn(x, z, false);     // 다리 아치를 뺀 실제 지면 (지면 메시용 — 다리 위로 잔디가 솟지 않게)
  return f;
  function heightFn(x, z, withBridge) {
    if (flat && !pond) return 0;
    let h = 0;
    for (const k of hills) { const dx = x - k.x, dz = z - k.z; h += k.h * Math.exp(-(dx * dx + dz * dz) / (k.r * k.r)); }
    if (pond) {
      const d = Math.hypot(x - pond.x, z - pond.z);
      h -= 0.38 * Math.min(1, Math.max(0, (pond.r + 1.2 - d) / 2.4));
    }
    if (bridge && withBridge) {
      const dx = x - bridge.x, dz = z - bridge.z, cb = Math.cos(bridge.ang), sb = Math.sin(bridge.ang);
      const u = dx * cb + dz * sb, v = -dx * sb + dz * cb;
      if (Math.abs(u) < bridge.L / 2 && Math.abs(v) < bridge.W / 2) h = Math.max(h, 0.1 + bridge.H * Math.cos((u / (bridge.L / 2)) * Math.PI / 2));
    }
    return h;
  };
}

// ============================================================
//  섬 본체 (잔디 텍스처 지면 · 지층 절벽 · 울퉁불퉁 하부)
// ============================================================
function islandBody(ctx) {
  const { group, R, T, heightAt } = ctx;
  const seg = MOBILE ? 72 : 110, rings = MOBILE ? 26 : 44;
  const top = new THREE.RingGeometry(0.01, R, seg, rings).rotateX(-Math.PI / 2);
  const p = top.attributes.position, uv = top.attributes.uv;
  const cols = new Float32Array(p.count * 3);
  const a = new THREE.Color(T.grass[0]), b = new THREE.Color(T.grass[1]), cl = new THREE.Color(T.cliff), c = new THREE.Color();
  const mossC = mixHex(T.grass[0], 0x1e4a2a, 0.55), dryC = mixHex(T.grass[1], T.grassTip ?? T.grass[1], 0.7);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z);
    const hh = (heightAt.ground || heightAt)(x, z);
    p.setY(i, hh + (d < R - 1 ? n3(x * 0.4, 0, z * 0.4) * 0.05 : -0.02));
    const n = fbm2(x * 0.045, z * 0.045, 4) * 0.5 + 0.5;
    c.copy(a).lerp(b, Math.min(1, Math.max(0, n * 1.1 - 0.05 + hh * 0.25)));
    // 프랙탈 얼룩: 짙은 이끼 패치 · 햇볕에 바랜 밝은 패치
    const moss = fbm2(x * 0.11 + 40, z * 0.11 - 17, 3);
    if (moss > 0.18) c.lerp(mossC, Math.min(0.55, (moss - 0.18) * 1.6));
    else if (moss < -0.3) c.lerp(dryC, Math.min(0.35, (-0.3 - moss) * 1.2));
    if (hh < -0.05) c.multiplyScalar(0.8);                          // 물가 젖은 흙
    if (d > R - 0.8) c.lerp(cl, 0.25);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    uv.setXY(i, x / 4.5, z / 4.5);
  }
  top.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  top.computeVertexNormals();
  const ground = new THREE.Mesh(top, new THREE.MeshLambertMaterial({ map: grassTex(), vertexColors: true }));
  ground.receiveShadow = true;
  group.add(ground);
  // 부드러운 잔디 가장자리
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R - 0.15, 0.42, 6, seg), new THREE.MeshLambertMaterial({ color: mixHex(T.grass[0], T.cliff, 0.3) }));
  lip.rotation.x = Math.PI / 2; lip.scale.z = 0.55; lip.position.y = -0.12; group.add(lip);
  // 지층 절벽
  const cliffG = new THREE.CylinderGeometry(R, R * 0.9, 5, seg, 6, true);
  const cp = cliffG.attributes.position;
  const ca = new Float32Array(cp.count * 3), base = new THREE.Color(T.cliff);
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), ang = Math.atan2(z, x);
    const k = y > 2.45 ? 0 : (n3(Math.cos(ang) * 6, y * 0.8, Math.sin(ang) * 6) * 0.7);
    const rr = Math.hypot(x, z), s = (rr + k) / rr;
    cp.setXYZ(i, x * s, y, z * s);
    const band = 0.78 + 0.22 * Math.sin(y * 2.6 + n3(ang * 3, 0, 0) * 1.5);
    c.copy(base).multiplyScalar(band * (y > 2.2 ? 1.1 : 1));
    ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b;
  }
  cliffG.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  cliffG.computeVertexNormals();
  const cliff = new THREE.Mesh(cliffG, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  cliff.position.y = -2.5; cliff.receiveShadow = true; group.add(cliff);
  // 하부 바위 덩어리
  const bot = new THREE.ConeGeometry(R * 0.9, R * 0.85, 30, 8);
  const bp = bot.attributes.position, bc = new Float32Array(bp.count * 3), rock = new THREE.Color(T.rock);
  const hb = R * 0.85;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const atRim = y < -hb / 2 + 0.01;
    const k = atRim ? 0 : n3(x * 0.15, y * 0.15, z * 0.15) * 3.2;
    const rr = Math.hypot(x, z) || 1;
    bp.setXYZ(i, x + (x / rr) * k, y + n3(z * 0.2, x * 0.2, 0) * 1.5 * (atRim ? 0 : 1), z + (z / rr) * k);
    const t = (y + hb / 2) / hb;                       // 0=상단 테두리(뒤집기 전) … 1=꼭짓점
    c.copy(rock).multiplyScalar(0.95 - t * 0.45);
    bc[i * 3] = c.r; bc[i * 3 + 1] = c.g; bc[i * 3 + 2] = c.b;
  }
  bot.setAttribute('color', new THREE.BufferAttribute(bc, 3));
  bot.computeVertexNormals();
  const bottom = new THREE.Mesh(bot, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  bottom.rotation.x = Math.PI; bottom.position.y = -5 - hb / 2; group.add(bottom);
  // 매달린 종유석 바위 + 덩굴
  const r = ctx.r, stal = [], vines = [];
  for (let i = 0; i < 14; i++) {
    const ang = r() * Math.PI * 2, d = R * (0.25 + r() * 0.55), hh = 5 + r() * 9;
    stal.push({ x: Math.cos(ang) * d, y: -5 - hh / 2 - r() * R * 0.25, z: Math.sin(ang) * d, rx: Math.PI, ry: r() * 3, sx: 1.6 + r() * 2.4, sy: hh, sz: 1.6 + r() * 2.4, c: mixHex(T.rock, 0x000000, r() * 0.3) });
  }
  ctx.add(instanced(G.cone4, new THREE.MeshLambertMaterial({ flatShading: true }), stal));
  for (let i = 0; i < 46 * QTY + 10; i++) {
    const ang = r() * Math.PI * 2, len = 1.5 + r() * 5;
    vines.push({ x: Math.cos(ang) * (R + 0.15), y: -0.2 - len / 2, z: Math.sin(ang) * (R + 0.15), sx: 0.06, sy: len, sz: 0.06, c: mixHex(0x3a7a3a, T.cliff, r() * 0.5) });
  }
  ctx.add(instanced(G.cyl, new THREE.MeshLambertMaterial(), vines));
}

// ============================================================
//  공용 장식 빌더
// ============================================================
function makeCtx(group, R, T, seed, heightAt) {
  const ctx = {
    group, R, T, r: rng(seed), heightAt, anim: [], waters: [], particles: [], circles: [], blockers: [], taken: [],
    add(o) { if (o) group.add(o); return o; },
    blocked(x, z, pad = 0) {
      if (Math.hypot(x, z) > R - 1.2) return true;
      for (const b of this.blockers) {
        if (b.seg) { if (b.seg.some((q) => Math.hypot(x - q.x, z - q.z) < b.r + pad)) return true; }
        else if (b.box) { if (x > b.box[0] - pad && x < b.box[1] + pad && z > b.box[2] - pad && z < b.box[3] + pad) return true; }
        else if (Math.hypot(x - b.x, z - b.z) < b.r + pad) return true;
      }
      return false;
    },
    free(minD, inner = 4, margin = 3, pad = 1) {
      for (let t = 0; t < 80; t++) {
        const ang = this.r() * Math.PI * 2, d = inner + this.r() * (R - inner - margin);
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        if (this.blocked(x, z, pad)) continue;
        if (this.taken.every((q) => Math.hypot(q.x - x, q.z - z) > minD)) { const p = new THREE.Vector3(x, heightAt(x, z), z); this.taken.push(p); return p; }
      }
      const a = this.r() * 6.28, p = new THREE.Vector3(Math.cos(a) * R * 0.5, 0, Math.sin(a) * R * 0.5);
      p.y = heightAt(p.x, p.z); return p;
    },
  };
  return ctx;
}

function ribbon(points, width, heightAt, yOff, uvScale = 1) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0, p.z)));
  const len = curve.getLength(), n = Math.max(8, Math.ceil(len / 0.8));
  const pts = curve.getSpacedPoints(n);
  const pos = [], uv = [], idx = [];
  let dist = 0;
  for (let i = 0; i <= n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    if (i) dist += p.distanceTo(pts[i - 1]);
    for (const s of [-1, 1]) {
      const x = p.x + nx * width / 2 * s, z = p.z + nz * width / 2 * s;
      pos.push(x, heightAt(x, z) + yOff, z);
      uv.push(s < 0 ? 0 : 1, (dist / width) * uvScale);
    }
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return { geo: g, samples: pts, len };
}

function stonePath(ctx, points, width = 2.2) {
  const rb = ribbon(points, width, ctx.heightAt, 0.04, 0.6);
  const mat = new THREE.MeshLambertMaterial({ map: stoneTex(), color: ctx.T.pathTint ?? 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(rb.geo, mat); m.receiveShadow = true; ctx.add(m);
  ctx.blockers.push({ seg: rb.samples.filter((_, i) => i % 2 === 0), r: width / 2 + 0.3 });
  // 가장자리 돌멩이
  const stones = [];
  rb.samples.forEach((p, i) => {
    if (i % 3 || ctx.r() < 0.3) return;
    const s = ctx.r() < 0.5 ? -1 : 1, a = ctx.r() * 6.28;
    const q = rb.samples[Math.min(rb.samples.length - 1, i + 1)];
    const tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
    const x = p.x + (-tz / tl) * (width / 2 + 0.25) * s, z = p.z + (tx / tl) * (width / 2 + 0.25) * s;
    stones.push({ x, y: ctx.heightAt(x, z), z, ry: a, sx: 0.25 + ctx.r() * 0.2, sy: 0.15 + ctx.r() * 0.12, sz: 0.2 + ctx.r() * 0.2, c: mixHex(0xb8b0a0, ctx.T.rock, ctx.r() * 0.5) });
  });
  ctx.add(instanced(rockGeo(), new THREE.MeshLambertMaterial({ flatShading: true }), stones, { cast: false, receive: true }));
  // 돌 틈·가장자리 이끼 (납작한 인스턴스 패치)
  const moss = [], mc = mixHex(ctx.T.grass[0], 0x24502c, 0.5), mc2 = mixHex(ctx.T.grass[1], 0x3a6a34, 0.4);
  rb.samples.forEach((p, i) => {
    const q = rb.samples[Math.min(rb.samples.length - 1, i + 1)];
    const tx = q.x - p.x, tz = q.z - p.z, tl = Math.hypot(tx, tz) || 1;
    for (let k = 0; k < (MOBILE ? 1 : 2); k++) {
      if (ctx.r() < 0.35) continue;
      const edge = ctx.r() < 0.7, off = (edge ? width / 2 - 0.1 + ctx.r() * 0.3 : ctx.r() * width * 0.35) * (ctx.r() < 0.5 ? -1 : 1);
      const x = p.x + (-tz / tl) * off + (ctx.r() - 0.5) * 0.5, z = p.z + (tx / tl) * off + (ctx.r() - 0.5) * 0.5;
      const sc = edge ? 0.35 + ctx.r() * 0.55 : 0.15 + ctx.r() * 0.25;
      moss.push({ x, y: ctx.heightAt(x, z) + 0.055, z, ry: ctx.r() * 6.28, sx: sc * (0.8 + ctx.r() * 0.7), sy: 1, sz: sc, c: (ctx.r() < 0.5 ? mc : mc2).getHex() });
    }
  });
  ctx.add(instanced(mossGeo(), new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), moss, { receive: true }));
  return rb;
}

function magicCircle(ctx, x, z, radius, color, speed = 0.15, y = null, opacity = 0.75) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: runeTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.position.set(x, (y ?? ctx.heightAt(x, z)) + 0.06, z);
  ctx.add(m);
  ctx.circles.push({ m, speed, base: opacity });
  return m;
}

function pond(ctx, P, opts = {}) {
  const T = ctx.T;
  const mat = waterMat(opts.water ?? T.water, opts.glow ?? T.waterGlow, 0, 1, opts.alpha ?? 0.82);
  const w = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.3, 48).rotateX(-Math.PI / 2), mat);
  w.position.set(P.x, -0.16, P.z); w.renderOrder = 2;
  ctx.add(w); ctx.waters.push(mat);
  ctx.blockers.push({ x: P.x, z: P.z, r: P.r + 0.5 });
  // 물가 돌
  const rim = [];
  const n = Math.round(P.r * 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ctx.r() * 0.3, rr = P.r + 0.4 + ctx.r() * 0.5;
    const x = P.x + Math.cos(a) * rr, z = P.z + Math.sin(a) * rr;
    if (P.skip && P.skip(x, z)) continue;
    rim.push({ x, y: ctx.heightAt(x, z) - 0.05, z, ry: ctx.r() * 6, sx: 0.35 + ctx.r() * 0.45, sy: 0.22 + ctx.r() * 0.25, sz: 0.35 + ctx.r() * 0.4, c: mixHex(T.rock, 0xffffff, ctx.r() * 0.25) });
  }
  ctx.add(instanced(rockGeo(), new THREE.MeshLambertMaterial({ flatShading: true }), rim, { cast: true, receive: true }));
  return w;
}

function woodBridge(ctx, B) {
  const wood = new THREE.MeshLambertMaterial({ map: woodTex() });
  const cb = Math.cos(B.ang), sb = Math.sin(B.ang);
  const at = (u, v) => ({ x: B.x + u * cb - v * sb, z: B.z + u * sb + v * cb });
  const archY = (u) => 0.1 + B.H * Math.cos((u / (B.L / 2)) * Math.PI / 2);
  const planks = [], posts = [];
  const N = 16;
  for (let i = 0; i < N; i++) {
    const u = -B.L / 2 + (i + 0.5) * (B.L / N);
    const p = at(u, 0);
    const slope = Math.atan((archY(u + 0.05) - archY(u - 0.05)) / 0.1);
    planks.push({ x: p.x, y: archY(u) - 0.06, z: p.z, ry: -B.ang, rz: 0, sx: B.L / N * 0.92, sy: 0.1, sz: B.W, c: mixHex(0xffffff, 0xc8a080, (i % 3) * 0.25), slope });
  }
  // 경사 반영: ry 회전 후 z축 기울기 → Euler 'YXZ' 대신 행렬 직접 구성
  const pm = new THREE.InstancedMesh(G.box, wood, planks.length);
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  planks.forEach((it, i) => {
    qa.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -B.ang);
    qb.setFromAxisAngle(new THREE.Vector3(0, 0, 1), it.slope);
    q.copy(qa).multiply(qb);
    _o.position.set(it.x, it.y, it.z); _o.quaternion.copy(q); _o.scale.set(it.sx, it.sy, it.sz); _o.updateMatrix();
    pm.setMatrixAt(i, _o.matrix); pm.setColorAt(i, _c.set(it.c));
  });
  pm.castShadow = true; pm.receiveShadow = true; pm.computeBoundingSphere();
  ctx.add(pm);
  for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) {
    const u = -B.L / 2 + 0.3 + i * (B.L - 0.6) / 4;
    const p = at(u, s * (B.W / 2 - 0.08));
    posts.push({ x: p.x, y: archY(u) + 0.35, z: p.z, sx: 0.12, sy: 0.85, sz: 0.12 });
  }
  ctx.add(instanced(G.box, wood, posts, { cast: true }));
  // 난간 (곡선 튜브)
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const u = -B.L / 2 + 0.3 + i * (B.L - 0.6) / 10; const p = at(u, s * (B.W / 2 - 0.08)); pts.push(new THREE.Vector3(p.x, archY(u) + 0.75, p.z)); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.05, 5), wood);
    tube.castShadow = true; ctx.add(tube);
  }
}

function waterfall(ctx, ang, width = 2.4, color, glow) {
  const R = ctx.R;
  const mat = waterMat(color, glow, 1, 1.3, 0.75);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(width, 40), mat);
  const ox = Math.cos(ang), oz = Math.sin(ang);
  pl.position.set(ox * (R + 0.55), -19.8, oz * (R + 0.55));
  pl.rotation.y = Math.atan2(ox, oz);
  pl.renderOrder = 2;
  ctx.add(pl); ctx.waters.push(mat);
  // 물보라 안개
  ctx.particles.push(ctx.add(ambient({ mode: 3, count: 30, center: [ox * (R + 1), oz * (R + 1)], radius: 1.2, base: -2, height: 3, colA: glow, colB: 0xffffff, size: 0.5, blend: 'normal', opacity: 0.35 })));
}

// 하늘에서 내려오는 빛기둥 (가산 블렌딩 원통 · 세로 그라데이션 · 가장자리 소프트 · 천천히 흐르는 줄무늬)
function lightShaft(ctx, x, z, color, radius = 1.4, height = 26, opacity = 0.5) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: WIND, uOp: { value: opacity }, uSeed: { value: ctx.r() * 10 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vF;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vF = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uOp; uniform float uSeed; varying vec2 vUv; varying float vF;
      void main(){
        float v = vUv.y;
        float a = pow(1.0 - v, 1.6) * smoothstep(0.0, 0.05, v);
        float stripes = 0.65 + 0.35 * sin(vUv.x * 37.7 + uSeed + sin(uTime * 0.5 + vUv.x * 9.0) * 1.5);
        float pulse = 0.85 + 0.15 * sin(uTime * 1.3 + uSeed);
        a *= stripes * pulse * pow(vF, 1.6) * uOp;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const gy = ctx.heightAt(x, z);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.9, radius, height, MOBILE ? 10 : 16, 1, true), mat);
  m.position.set(x, gy + height / 2 - 0.1, z); m.renderOrder = 3;
  ctx.add(m);
  // 바닥 빛 웅덩이 + 떠오르는 빛 입자
  const pool = new THREE.Mesh(shaftPoolGeo(),
    new THREE.MeshBasicMaterial({ map: shaftGlowTex(), color, transparent: true, opacity: Math.min(1, opacity * 1.1), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  pool.scale.setScalar(radius * 2.1); pool.position.set(x, gy + 0.07, z); ctx.add(pool);
  // 모바일: 빛기둥마다 붙는 입자 시스템(드로우콜 1개씩)은 생략
  if (!MOBILE) ctx.particles.push(ctx.add(ambient({ mode: 2, count: 14, center: [x, z], radius: radius * 0.9, base: gy + 0.2, height: 7, colA: color, colB: 0xffffff, size: 0.11 })));
  return m;
}
function shaftPoolGeo() { return GC.shaftPool || (GC.shaftPool = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2)); }
function shaftGlowTex() {
  return TEX.shaftGlow || (TEX.shaftGlow = canvasTex(64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }, false));
}

// 섬 가장자리의 작은 샘 → 실개천 → 보조 폭포
function sideFall(ctx, ang, T, width = 1.5) {
  const R = ctx.R, ox = Math.cos(ang), oz = Math.sin(ang);
  const a = { x: ox * (R - 4.2), z: oz * (R - 4.2) }, b = { x: ox * (R - 2) - oz * 0.5, z: oz * (R - 2) + ox * 0.5 }, c = { x: ox * (R + 0.4), z: oz * (R + 0.4) };
  if (ctx.blocked(a.x, a.z, 1)) return false;
  const st = ribbon([a, b, c], width * 0.75, ctx.heightAt, 0.05);
  const mat = waterMat(T.water, T.waterGlow, 1, -0.9, 0.8);
  const m = new THREE.Mesh(st.geo, mat); m.renderOrder = 2; ctx.add(m); ctx.waters.push(mat);
  ctx.blockers.push({ seg: st.samples, r: 0.9 }, { x: a.x, z: a.z, r: 1.6 });
  // 샘 (작은 원형 수면 + 돌 테두리)
  const sm = waterMat(T.water, T.waterGlow, 0, 0.6, 0.85);
  const spring = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20).rotateX(-Math.PI / 2), sm);
  spring.position.set(a.x, ctx.heightAt(a.x, a.z) + 0.06, a.z); spring.renderOrder = 2; ctx.add(spring); ctx.waters.push(sm);
  const ring = [];
  for (let i = 0; i < 9; i++) {
    const t = (i / 9) * 6.28 + ctx.r() * 0.3;
    if (Math.abs(Math.atan2(Math.sin(t - ang), Math.cos(t - ang))) < 0.5) continue;
    const x = a.x + Math.cos(t) * 1.25, z = a.z + Math.sin(t) * 1.25;
    ring.push({ x, y: ctx.heightAt(x, z) + 0.02, z, ry: ctx.r() * 6, sx: 0.32 + ctx.r() * 0.2, sy: 0.22 + ctx.r() * 0.12, sz: 0.3, c: mixHex(0xb8b0a0, ctx.T.rock, ctx.r() * 0.6) });
  }
  ctx.add(instanced(rockGeo(), new THREE.MeshLambertMaterial({ flatShading: true }), ring, { cast: true, receive: true }));
  waterfall(ctx, ang, width, T.water, T.fall);
  return true;
}

function cloudsAndSky(ctx, seed) {
  const { group, T, R } = ctx;
  const r = rng(seed + 99);
  // 1) 입체 구름 덩어리 (InstancedMesh)
  const blobGeo = GC.cloud ||= (() => { const g = new THREE.IcosahedronGeometry(1, MOBILE ? 1 : 2); return g; })();
  const cmat = new THREE.MeshLambertMaterial({ color: T.cloud, emissive: T.cloudShade, emissiveIntensity: 0.45 });
  const list = [];
  const clusters = Math.round(22 * (MOBILE ? 0.6 : 1));
  for (let k = 0; k < clusters; k++) {
    const ang = r() * Math.PI * 2, high = r() < 0.3;
    const d = high ? 90 + r() * 140 : R + 12 + r() * 110;
    const cx = Math.cos(ang) * d, cz = Math.sin(ang) * d, cy = high ? 30 + r() * 35 : -10 - r() * 26;
    const n = 6 + (r() * 6 | 0), sc = 3 + r() * 4;
    for (let i = 0; i < n; i++) {
      const s = sc * (0.6 + r() * 0.7);
      list.push({ x: cx + (i - n / 2) * sc * 0.75 + r() * 2, y: cy + r() * sc * 0.4, z: cz + (r() - 0.5) * sc * 1.5, sx: s * 1.35, sy: s * 0.75, sz: s });
    }
  }
  const cloudGroup = new THREE.Group(); group.add(cloudGroup);
  const ci = instanced(blobGeo, cmat, list); cloudGroup.add(ci);
  ctx.anim.push((dt) => { cloudGroup.rotation.y += dt * 0.006; });
  // 2) 구름 바다 (스크롤 텍스처 2겹)
  for (const [y, op, sp, rep] of [[-26, 0.55, 0.004, 7], [-44, 0.8, 0.0025, 4]]) {
    const tex = cloudTex().clone(); tex.needsUpdate = true; tex.repeat.set(rep, rep);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, color: mixHex(T.cloud, T.fog, 0.3), transparent: true, opacity: op, depthWrite: false }));
    m.position.y = y; m.renderOrder = 1; group.add(m);
    ctx.anim.push((dt) => { tex.offset.x += dt * sp; tex.offset.y += dt * sp * 0.4; });
  }
  // 3) 저 멀리 떠 있는 거대 하늘섬 실루엣 (대기 원근 색)
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + r() * 0.5, d = 260 + r() * 180, s = 25 + r() * 45;
    const t = Math.min(0.85, 0.5 + (d - 260) / 400);
    const topC = mixHex(T.grass[0], T.horizon, t), rockC = mixHex(T.cliff, T.horizon, t + 0.05);
    const g = new THREE.Group();
    g.position.set(Math.cos(ang) * d, -20 + r() * 70, Math.sin(ang) * d);
    const mt = new THREE.MeshBasicMaterial({ color: topC, fog: false }), mr = new THREE.MeshBasicMaterial({ color: rockC, fog: false });
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.92, s * 0.12, 14), mt); g.add(tp);
    const cone = new THREE.Mesh(lumpyCone(s * 0.92, s * 1.3), mr); cone.position.y = -s * 0.65 - s * 0.06; g.add(cone);
    for (let k = 0; k < 4; k++) {
      const a2 = r() * 6.28, rr = r() * s * 0.6;
      const tr = new THREE.Mesh(G.sphLo, new THREE.MeshBasicMaterial({ color: mixHex(T.leaves[0], T.horizon, t), fog: false }));
      tr.position.set(Math.cos(a2) * rr, s * 0.12 + s * 0.1, Math.sin(a2) * rr); tr.scale.set(s * 0.18, s * 0.22, s * 0.18); g.add(tr);
    }
    if (r() < 0.6) { // 멀리 보이는 폭포
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.08, s * 1.6), new THREE.MeshBasicMaterial({ color: mixHex(T.fall, T.horizon, t * 0.6), transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
      fall.position.set(0, -s * 0.8, s * 0.93); g.add(fall);
    }
    g.rotation.y = r() * 6;
    group.add(g);
  }
  // 4) 가까운 소형 부유섬
  for (let i = 0; i < 8; i++) {
    const ang = r() * Math.PI * 2, d = R + 25 + r() * 70, s = 2.5 + r() * 6;
    const g = new THREE.Group();
    g.position.set(Math.cos(ang) * d, -8 + r() * 26, Math.sin(ang) * d);
    part(new THREE.CylinderGeometry(s, s * 0.85, 1.2, 10), new THREE.MeshLambertMaterial({ color: T.grass[1] }), 0, 0, 0, 1, 1, 1, g);
    const cn = new THREE.Mesh(lumpyCone(s * 0.85, s * 1.8), new THREE.MeshLambertMaterial({ color: T.cliff, flatShading: true }));
    cn.position.y = -s * 0.9 - 0.6; g.add(cn);
    if (r() < 0.7 && T.grassN > 0) { const f = new THREE.Mesh(foliageGeo('round'), new THREE.MeshLambertMaterial({ vertexColors: true, color: T.leaves[i % T.leaves.length] })); f.scale.setScalar(s * 0.22); f.position.y = -0.2; g.add(f); }
    const bob = r() * 6;
    ctx.anim.push((dt, t) => { g.position.y += Math.sin(t * 0.4 + bob) * 0.004; });
    g.traverse((o) => { o.castShadow = false; });
    group.add(g);
  }
}
function lumpyCone(rad, h) {
  const g = new THREE.ConeGeometry(rad, h, 10, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > h / 2 - 0.01) continue;
    const k = n3(x * 0.3, y * 0.3, z * 0.3) * rad * 0.18;
    const rr = Math.hypot(x, z) || 1;
    p.setXYZ(i, x + x / rr * k, y, z + z / rr * k);
  }
  g.rotateX(Math.PI);
  g.computeVertexNormals();
  return g;
}

// ---------- 식생 ----------
function grassField(ctx, density = 1, colors = null) {
  const T = ctx.T;
  if (!T.grassN || density <= 0) return;
  const n = Math.round(Math.PI * ctx.R * ctx.R * 1.25 * T.grassN * density * QTY);
  const r = ctx.r, list = [];
  const tip = new THREE.Color(T.grassTip), g0 = new THREE.Color(T.grass[0]);
  for (let i = 0; i < n * 1.4 && list.length < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (ctx.R - 1.4);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (ctx.blocked(x, z, 0)) continue;
    const s = 0.6 + r() * 0.65;
    list.push({ x, y: ctx.heightAt(x, z), z, ry: r() * 6.28, sx: s, sy: s * (0.7 + r() * 0.5), sz: s, c: _c.copy(g0).lerp(tip, r()).getHex() });
  }
  const mat = addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.45, 'grass');
  ctx.add(instanced(tuftGeo(), mat, list, { receive: !MOBILE }));
}
function flowerField(ctx, count, palette) {
  const r = ctx.r, list = [];
  const n = Math.round(count * QTY);
  // 군락 단위로 피어남
  for (let k = 0; list.length < n && k < n; k++) {
    const a = r() * 6.28, d = 4 + r() * (ctx.R - 6), cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    const col = palette[(r() * palette.length) | 0], m = 6 + (r() * 10 | 0);
    for (let i = 0; i < m && list.length < n; i++) {
      const x = cx + (r() - 0.5) * 3.2, z = cz + (r() - 0.5) * 3.2;
      if (ctx.blocked(x, z, 0)) continue;
      const s = 0.9 + r() * 0.8;
      list.push({ x, y: ctx.heightAt(x, z), z, ry: r() * 6, s, c: col });
    }
  }
  const mat = addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.9, 'flower');
  ctx.add(instanced(flowerGeo(), mat, list));
}
function trees(ctx, count, kind = 'round', palette = ctx.T.leaves, minD = 6, scale = [0.9, 1.4]) {
  const r = ctx.r, trunks = [], fols = [];
  for (let i = 0; i < count; i++) {
    const p = ctx.free(minD, 6, 3, 1.6);
    const s = scale[0] + r() * (scale[1] - scale[0]), ry = r() * 6.28;
    trunks.push({ x: p.x, y: p.y - 0.1, z: p.z, ry, s, c: kind === 'dead' ? 0x5a4a5a : kind === 'crystal' ? 0x5a5a7a : 0xa07850 });
    if (kind !== 'dead') fols.push({ x: p.x, y: p.y - 0.1, z: p.z, ry, s, c: palette[(r() * palette.length) | 0] });
    ctx.blockers.push({ x: p.x, z: p.z, r: 0.8 * s });
  }
  ctx.add(instanced(trunkGeo(kind), new THREE.MeshLambertMaterial({ vertexColors: true }), trunks, { cast: true, receive: true }));
  if (fols.length) {
    const mat = kind === 'crystal'
      ? new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88 })
      : Models.gradRim(addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.0045, 'tree'), 5.5, 0.24);
    ctx.add(instanced(foliageGeo(kind), mat, fols, { cast: true, receive: kind !== 'crystal' }));
    if (kind === 'crystal') fols.forEach((f) => { const gl = addGlow(ctx.group, f.c, 6 * f.s, 0.35); gl.position.set(f.x, f.y + 3.8 * f.s, f.z); });
  }
}
function bushes(ctx, count, palette) {
  const r = ctx.r, list = [];
  for (let i = 0; i < count * QTY + 4; i++) {
    const p = ctx.free(3, 5, 2.5, 0.8);
    list.push({ x: p.x, y: p.y - 0.1, z: p.z, ry: r() * 6, s: 0.8 + r() * 0.8, c: palette[(r() * palette.length) | 0] });
  }
  ctx.add(instanced(bushGeo(), addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.02, 'bush'), list, { cast: true, receive: true }));
}
function rocks(ctx, count, color, sMin = 0.5, sMax = 1.6) {
  const r = ctx.r, list = [];
  for (let i = 0; i < count; i++) {
    const p = ctx.free(3, 5, 2, 0.6);
    const s = sMin + r() * (sMax - sMin);
    list.push({ x: p.x, y: p.y - s * 0.25, z: p.z, ry: r() * 6, rx: (r() - 0.5) * 0.4, sx: s * (0.9 + r() * 0.5), sy: s * (0.6 + r() * 0.4), sz: s, c: mixHex(color, 0xffffff, r() * 0.25) });
  }
  ctx.add(instanced(rockGeo(), Models.gradRim(new THREE.MeshLambertMaterial({ flatShading: true }), 0.9, 0.28), list, { cast: true, receive: true }));
}
function rimRocks(ctx, skipAng = []) {
  const r = ctx.r, list = [], R = ctx.R;
  const n = Math.round(R * 1.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.08;
    if (skipAng.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.1)) continue;
    const rr = R - 0.1 + r() * 0.6, s = 0.35 + r() * 0.7;
    list.push({ x: Math.cos(a) * rr, y: -0.2 - r() * 0.25, z: Math.sin(a) * rr, ry: r() * 6, sx: s * 1.3, sy: s * (0.7 + r() * 0.6), sz: s, c: mixHex(ctx.T.rock, ctx.T.grass[0], r() < 0.3 ? 0.35 : 0) });
  }
  if (Models.has('rock_small') && Models.has('rock_wide')) {
    const a = [], b = [];
    list.forEach((it, i) => (i % 2 ? a : b).push({ x: it.x, y: it.y - 0.1, z: it.z, ry: it.ry, s: it.sx * 0.9, c: _c.set(it.c).getHex() }));
    ctx.add(Models.instancedProp('rock_small', a));
    ctx.add(Models.instancedProp('rock_wide', b));
    return;
  }
  ctx.add(instanced(rockGeo(), new THREE.MeshLambertMaterial({ flatShading: true }), list, { cast: true, receive: true }));
}

// CC0 GLB 소품 흩뿌리기 (InstancedMesh). 모델이 없으면 false → 절차적 폴백
function glbScatter(ctx, keys, count, o = {}) {
  const avail = keys.filter((k) => Models.has(k));
  if (!avail.length || count <= 0) return false;
  const { minD = 6, inner = 6, margin = 3, pad = 1.4, scale = [0.9, 1.3], tints = null, wind = 0, blockR = 0.8, sink = 0.05, cast = true } = o;
  const lists = Object.fromEntries(avail.map((k) => [k, []]));
  for (let i = 0; i < count; i++) {
    const p = ctx.free(minD, inner, margin, pad);
    const k = avail[i % avail.length], s = scale[0] + ctx.r() * (scale[1] - scale[0]);
    lists[k].push({ x: p.x, y: p.y - sink, z: p.z, ry: ctx.r() * 6.28, s, c: tints ? tints[(ctx.r() * tints.length) | 0] : undefined });
    if (blockR) ctx.blockers.push({ x: p.x, z: p.z, r: blockR * s });
  }
  for (const k of avail) {
    ctx.add(Models.instancedProp(k, lists[k], { cast, matFn: wind ? (m) => addWind(m.clone(), wind, 'glb_' + k) : null }));
  }
  return true;
}
function crystalClusters(ctx, count, palette, glowEvery = 2, sRange = [0.8, 1.8]) {
  const r = ctx.r, list = [];
  for (let i = 0; i < count; i++) {
    const p = ctx.free(3.5, 6, 2.5, 0.8);
    const s = sRange[0] + r() * (sRange[1] - sRange[0]), c = palette[i % palette.length];
    list.push({ x: p.x, y: p.y - 0.15, z: p.z, ry: r() * 6, rx: (r() - 0.5) * 0.3, s, c });
    if (i % glowEvery === 0) { const gl = addGlow(ctx.group, c, 4.5 * s, 0.4); gl.position.set(p.x, p.y + 1.2 * s, p.z); }
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  const m = ctx.add(instanced(crystalGeo(), mat, list, { cast: true }));
  if (m) ctx.anim.push((dt, t) => { mat.opacity = 0.82 + Math.sin(t * 1.5) * 0.08; });
}
function mushrooms(ctx, count, palette) {
  const r = ctx.r, list = [];
  for (let k = 0; k < count / 5; k++) {
    const p = ctx.free(4, 6, 2.5, 0.5);
    const c = palette[k % palette.length];
    for (let i = 0; i < 5; i++) {
      const x = p.x + (r() - 0.5) * 1.8, z = p.z + (r() - 0.5) * 1.8, s = 0.7 + r() * 1.3;
      list.push({ x, y: ctx.heightAt(x, z), z, ry: r() * 6, s, c });
    }
    const gl = addGlow(ctx.group, c, 3, 0.4); gl.position.set(p.x, p.y + 0.5, p.z);
  }
  const { stem, cap } = mushroomGeo();
  ctx.add(instanced(stem, new THREE.MeshLambertMaterial({ color: 0xe8e0f0 }), list.map((l) => ({ ...l, c: 0xffffff }))));
  ctx.add(instanced(cap, new THREE.MeshBasicMaterial({}), list));
}

// ---------- 고대 석조물 ----------
function stoneArch(ctx, x, z, ry, scale = 1, glow = ctx.T.circle) {
  const g = new THREE.Group(); g.position.set(x, ctx.heightAt(x, z) - 0.05, z); g.rotation.y = ry; g.scale.setScalar(scale);
  const stone = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo(), stone); p.position.set(s * 2, 0, 0); p.scale.set(0.9, 3.6, 0.9); p.castShadow = p.receiveShadow = true; g.add(p);
    part(G.box, toon(0xb8b0a8), s * 2, 0.15, 0, 1.4, 0.3, 1.4, g);
  }
  const archG = lumpy(new THREE.TorusGeometry(2, 0.42, 6, 14, Math.PI), 0.06, 2);
  vcolor(archG, (x2, y2, z2) => { const v = 0.72 + n3(x2 * 3, y2 * 3, z2 * 3) * 0.12; return [v, v, v]; });
  const arch = new THREE.Mesh(archG, stone); arch.position.y = 3.55; arch.castShadow = true; g.add(arch);
  const key = part(G.oct, glowMat(glow), 0, 5.6, 0.3, 0.28, 0.4, 0.15, g);
  addGlow(g, glow, 2.4, 0.6).position.set(0, 5.6, 0.35);
  ctx.anim.push((dt, t) => { key.rotation.y = t; });
  ctx.add(g);
  ctx.blockers.push({ x: x + Math.cos(ry) * 2, z: z - Math.sin(ry) * 2, r: 0.9 }, { x: x - Math.cos(ry) * 2, z: z + Math.sin(ry) * 2, r: 0.9 });
  return g;
}
function ruinPillars(ctx, count, colors, hRange = [1.5, 6]) {
  const r = ctx.r, list = [], caps = [], fallen = [];
  for (let i = 0; i < count; i++) {
    const p = ctx.free(4, 8, 3, 1);
    const h = hRange[0] + r() * (hRange[1] - hRange[0]), c = colors[i % colors.length];
    if (r() < 0.25) { // 쓰러진 기둥
      fallen.push({ x: p.x, y: p.y + 0.45, z: p.z, rz: Math.PI / 2, ry: r() * 6, sx: 0.85, sy: h * 0.8, sz: 0.85, c });
      continue;
    }
    list.push({ x: p.x, y: p.y - 0.1, z: p.z, ry: r() * 6, sx: 1, sy: h, sz: 1, c });
    if (r() < 0.45) caps.push({ x: p.x, y: p.y + h - 0.05, z: p.z, ry: r() * 6, sx: 1.5, sy: 0.35, sz: 1.5, c });
    ctx.blockers.push({ x: p.x, z: p.z, r: 0.8 });
  }
  const stone = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  ctx.add(instanced(pillarGeo(), stone, list, { cast: true, receive: true }));
  ctx.add(instanced(pillarGeo(), stone, fallen, { cast: true, receive: true }));
  ctx.add(instanced(G.box, new THREE.MeshLambertMaterial({ flatShading: true }), caps, { cast: true }));
}
function stairsUpHill(ctx, hill, towardAng, color = 0xc8c0b0) {
  const steps = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const d = hill.r * 1.25 - i * (hill.r * 1.1 / n);
    const x = hill.x + Math.cos(towardAng) * d, z = hill.z + Math.sin(towardAng) * d;
    const y = ctx.heightAt(x, z);
    steps.push({ x, y: y - 0.05, z, ry: -towardAng + Math.PI / 2, sx: 2.4, sy: 0.32, sz: 0.85, c: mixHex(color, 0x888888, (i % 2) * 0.15) });
  }
  ctx.add(instanced(G.box, new THREE.MeshLambertMaterial({ map: stoneTex() }), steps, { cast: true, receive: true }));
}
function standingStones(ctx, x, z, radius, n, color) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
    list.push({ x: px, y: ctx.heightAt(px, pz) - 0.1, z: pz, ry: -a, sx: 0.5, sy: 1.2 + ctx.r() * 1.2, sz: 0.35, c: color });
  }
  ctx.add(instanced(pillarGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), list, { cast: true }));
}
function plaza(ctx, x, z, radius, tint = 0xffffff) {
  const g = new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3); p.setY(i, ctx.heightAt(p.getX(i) + x, p.getZ(i) + z) + 0.03); }
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: stoneTex(), color: tint, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.position.set(x, 0, z); m.receiveShadow = true; ctx.add(m);
  ctx.blockers.push({ x, z, r: radius + 0.2 });
}

// ============================================================
//  섬 맵
// ============================================================
export function buildMap(id) {
  const group = new THREE.Group();
  if (id === 'home') return buildHome(group);
  const def = { ...ISL[id] };
  const T = THEMES[id];
  const R = def.radius;
  Models.setPropRim(T.sunLight);

  const spawn = new THREE.Vector3(0, 0, R - 7);
  const gatePos = new THREE.Vector3(0, 0, -R + 5);
  // 지형 레이아웃
  const pondP = { x: R * 0.45, z: R * 0.1, r: id === 3 ? 4.8 : 4.2 };
  const pondAng = Math.atan2(pondP.z, pondP.x);
  const bridge = id === 3 ? null : { x: pondP.x, z: pondP.z, ang: pondAng + Math.PI / 2, L: pondP.r * 2 + 3.6, W: 1.9, H: 0.8 };
  const hills = [
    { x: R * 0.5, z: -R * 0.45, r: 8, h: 1.4 },
    { x: -R * 0.62, z: 0, r: 7, h: 1.0 },
    { x: R * 0.12, z: R * 0.55, r: 6, h: 0.8 },
    { x: -R * 0.3, z: -R * 0.64, r: 6, h: 0.9 },
  ].map((h) => (id === 3 ? { ...h, h: h.h * 0.6 } : h));
  const heightAt = makeHeight({ hills, pond: pondP, bridge });
  const ctx = makeCtx(group, R, T, 1000 + id * 77, heightAt);

  // 게임 오브젝트 자리 (정령 오브 / 소환 비석)
  const orbPos = def.spirits.map((_, i) => {
    const ang = (i === 0 ? -0.6 : 0.6) + Math.PI / 2 * (i === 0 ? -1 : 1);
    const x = Math.cos(ang) * R * 0.62, z = Math.sin(ang) * R * 0.62 * 0.6;
    return new THREE.Vector3(x, heightAt(x, z), z);
  });
  const sealPos = new THREE.Vector3(-R * 0.35, 0, R * 0.45); sealPos.y = heightAt(sealPos.x, sealPos.z);
  ctx.taken.push(spawn.clone(), gatePos.clone(), new THREE.Vector3(), sealPos.clone(), ...orbPos.map((p) => p.clone()));
  ctx.blockers.push({ x: gatePos.x, z: gatePos.z, r: 3.2 }, { x: sealPos.x, z: sealPos.z, r: 1.6 }, ...orbPos.map((p) => ({ x: p.x, z: p.z, r: 2 })));
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28; ctx.taken.push(new THREE.Vector3(pondP.x + Math.cos(a) * pondP.r * 0.8, 0, pondP.z + Math.sin(a) * pondP.r * 0.8)); }

  islandBody(ctx);
  cloudsAndSky(ctx, id);

  // 돌길: 시작 지점 → 중앙 → 게이트
  stonePath(ctx, [spawn, { x: -R * 0.12, z: R * 0.42 }, { x: R * 0.05, z: R * 0.12 }, { x: 0, z: 0 }, { x: R * 0.1, z: -R * 0.42 }, { x: gatePos.x, z: gatePos.z + 2.5 }], id === 2 ? 2.8 : 2.2);
  // 연못 + 시냇물 + 폭포 (+ 나무다리)
  const lava = id === 3;
  pond(ctx, pondP, lava ? { alpha: 0.95 } : {});
  if (bridge) woodBridge(ctx, bridge);
  const sStart = { x: pondP.x + Math.cos(pondAng) * (pondP.r - 0.4), z: pondP.z + Math.sin(pondAng) * (pondP.r - 0.4) };
  const sEnd = { x: Math.cos(pondAng) * (R + 0.4), z: Math.sin(pondAng) * (R + 0.4) };
  const sMid = { x: (sStart.x + sEnd.x) / 2 - Math.sin(pondAng) * 1.2, z: (sStart.z + sEnd.z) / 2 + Math.cos(pondAng) * 1.2 };
  const st = ribbon([sStart, sMid, sEnd], 1.5, heightAt, 0.05);
  const sMat = waterMat(T.water, T.waterGlow, 1, -0.8, 0.8);
  const stream = new THREE.Mesh(st.geo, sMat); stream.renderOrder = 2; ctx.add(stream); ctx.waters.push(sMat);
  ctx.blockers.push({ seg: st.samples, r: 1.1 });
  waterfall(ctx, pondAng, 2.6, T.water, T.fall);
  // 가장자리 보조 폭포 2줄기 (샘 → 실개천 → 낙수)
  const fallAngs = [pondAng];
  for (const fa of [pondAng + 2.25, pondAng - 2.05]) if (sideFall(ctx, fa, T, lava ? 1.2 : 1.6)) fallAngs.push(fa);
  if (!lava) magicCircle(ctx, pondP.x, pondP.z, pondP.r * 0.8, T.waterGlow, -0.05, -0.13, 0.25);

  // 언덕 위 고대 성소 (돌계단 + 아치 + 마법진)
  const h0 = hills[0];
  const towardC = Math.atan2(-h0.z, -h0.x);
  stairsUpHill(ctx, h0, towardC);
  stoneArch(ctx, h0.x - Math.cos(towardC) * 1.5, h0.z - Math.sin(towardC) * 1.5, -towardC + Math.PI / 2, 0.9);
  magicCircle(ctx, h0.x, h0.z, 2.8, T.circle, 0.2);
  standingStones(ctx, h0.x, h0.z, 3.6, 7, mixHex(T.rock, 0xffffff, 0.3).getHex());
  ctx.blockers.push({ x: h0.x, z: h0.z, r: 3.2 });
  rimRocks(ctx, fallAngs);
  // 빛기둥: 언덕 성소 · 정령 제단 · 소환 비석 · 게이트 + 섬 가장자리
  lightShaft(ctx, h0.x, h0.z, T.circle, 1.9, 30, 0.5);
  orbPos.forEach((p, i) => lightShaft(ctx, p.x, p.z, [0x9affd0, 0xffe9a0, 0x9ad0ff][(id + i) % 3], 1.2, 22, 0.42));
  lightShaft(ctx, sealPos.x, sealPos.z, 0xffc870, 1.0, 18, 0.4);
  lightShaft(ctx, gatePos.x, gatePos.z, 0x8af0ff, 2.2, 34, 0.38);
  for (let i = 0; i < (MOBILE ? 3 : 5); i++) {
    const a = pondAng + 0.9 + i * (6.28 / (MOBILE ? 3 : 5)), rr = R - 2.6;
    if (!ctx.blocked(Math.cos(a) * rr, Math.sin(a) * rr, 0.5)) lightShaft(ctx, Math.cos(a) * rr, Math.sin(a) * rr, T.sunLight, 1.5, 38, 0.3);
  }

  // 섬 테마별 소품
  if (def.deco === 'meadow') {
    if (!glbScatter(ctx, ['tree_park', 'tree_park_large', 'tree_round_high'], Math.round(15 * (MOBILE ? 0.7 : 1)), { scale: [0.85, 1.25], wind: 0.003, pad: 1.6 }))
      trees(ctx, Math.round(16 * (MOBILE ? 0.7 : 1)), 'round', T.leaves);
    trees(ctx, 4, 'round', [0xffb4cc, 0xffc8da], 8);                         // 벚꽃 나무 포인트
    if (!glbScatter(ctx, ['bush', 'bush_large'], 18, { minD: 3, inner: 5, margin: 2.5, pad: 0.8, scale: [1.1, 1.7], wind: 0.02, blockR: 0 }))
      bushes(ctx, 18, [0x4c9e44, 0x5aae4a, 0xffb4cc]);
    if (!glbScatter(ctx, ['rock_large', 'rock_small', 'rock_wide'], 12, { minD: 3, inner: 5, margin: 2, pad: 0.6, scale: [0.7, 1.4], blockR: 0.7, sink: 0.15 }))
      rocks(ctx, 12, T.rock);
    grassField(ctx, 1);
    flowerField(ctx, 900, T.flowers);
    // 수련잎
    const pads = [];
    for (let i = 0; i < 9; i++) { const a = ctx.r() * 6.28, rr = ctx.r() * (pondP.r - 0.6); pads.push({ x: pondP.x + Math.cos(a) * rr, y: -0.12, z: pondP.z + Math.sin(a) * rr, ry: ctx.r() * 6, s: 0.6 + ctx.r() * 0.5, c: i % 4 === 0 ? 0xffb4d0 : 0x4aa84a }); }
    ctx.add(instanced(new THREE.CircleGeometry(0.5, 10, 0.3, Math.PI * 1.85).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), pads));
  } else if (def.deco === 'crystal') {
    trees(ctx, 9, 'crystal', [0x6af0ff, 0xa08aff, 0x5ad8ff], 8);
    crystalClusters(ctx, Math.round(34 * (MOBILE ? 0.7 : 1)), [0x5ae0ff, 0x9a7aff, 0x6af0ff, 0xc08aff]);
    mushrooms(ctx, 45, [0x5affd0, 0x8a9aff, 0xff7af0]);
    if (!glbScatter(ctx, ['rock_large', 'rock_small', 'rock_wide'], 18, { minD: 3, inner: 5, margin: 2, pad: 0.6, scale: [0.9, 1.9], blockR: 0.8, sink: 0.2, tints: [0x7a80c0, 0x6a6aa8, 0x8a7ad0] }))
      rocks(ctx, 18, 0x3a3a58, 0.7, 2.2);
    grassField(ctx, 0.8);
    flowerField(ctx, 300, T.flowers);
  } else if (def.deco === 'ruins') {
    plaza(ctx, 0, 0, 9.5, 0xfff0e0);
    magicCircle(ctx, 0, 0, 8.5, T.circle, 0.06);
    stoneArch(ctx, -R * 0.25, R * 0.05, 0.4, 1.2, 0xfff0b0);
    stoneArch(ctx, R * 0.18, -R * 0.15, -0.9, 1.1, 0xb080ff);
    if (!glbScatter(ctx, ['pillar_decorated', 'obelisk'], 14, { minD: 4, inner: 8, scale: [0.55, 1.0], tints: [0xfff4e8, 0x9a8ab0, 0xe8dcc8], blockR: 0.9, sink: 0.1 }))
      ruinPillars(ctx, 20, [0xeae2d2, 0x5a4a6a, 0xd8ccb8], [1.5, 6.5]);
    else ruinPillars(ctx, 8, [0xeae2d2, 0x5a4a6a, 0xd8ccb8], [1.2, 3.5]);   // 부서진 기둥 잔해
    glbScatter(ctx, ['wall_arched'], 3, { minD: 9, inner: 12, scale: [0.7, 0.9], tints: [0xf0e8dc, 0xb8a8c8], blockR: 2.2 });
    if (!glbScatter(ctx, ['tree_pine_orange'], 9, { scale: [0.8, 1.2], wind: 0.003, minD: 7 }))
      trees(ctx, 9, 'round', T.leaves, 7);
    crystalClusters(ctx, 8, [0xfff0b0, 0xb080ff], 1, [0.6, 1.2]);
    rocks(ctx, 12, T.rock);
    grassField(ctx, 0.9);
    flowerField(ctx, 260, T.flowers);
  } else if (def.deco === 'boss') {
    plaza(ctx, 0, 0, 15, 0x9a7a90);
    magicCircle(ctx, 0, 0, 14, T.circle, 0.08, null, 0.8);
    magicCircle(ctx, 0, 0, 7, 0xff4a8a, -0.15, null, 0.6);
    const spikes = [];
    for (let i = 0; i < 16; i++) {
      const p = ctx.free(6, 17, 4, 1), h = 2 + ctx.r() * 5;
      spikes.push({ x: p.x, y: p.y + h / 2 - 0.3, z: p.z, ry: ctx.r() * 3, rz: (ctx.r() - 0.5) * 0.3, sx: 0.5 + ctx.r() * 0.6, sy: h, sz: 0.5 + ctx.r() * 0.6, c: mixHex(0x1a0a1a, 0x4a1a3a, ctx.r()) });
      if (i % 3 === 0) { const gl = addGlow(group, 0xff3a6a, 2, 0.35); gl.position.set(p.x, p.y + h - 0.6, p.z); }
    }
    ctx.add(instanced(G.cone4, new THREE.MeshLambertMaterial({ flatShading: true }), spikes, { cast: true }));
    if (!glbScatter(ctx, ['tree_dead'], 8, { scale: [0.9, 1.5], tints: [0x5a3a5a, 0x4a2a3a, 0x6a4a5a], minD: 8 }))
      trees(ctx, 7, 'dead', [], 8, [0.9, 1.3]);
    if (!glbScatter(ctx, ['rock_large', 'rock_small', 'rock_wide'], 14, { minD: 3, inner: 6, margin: 2, pad: 0.6, scale: [0.8, 1.8], blockR: 0.8, sink: 0.2, tints: [0x5a4050, 0x4a3044, 0x6a4a5a] }))
      rocks(ctx, 14, 0x2a1e2a, 0.6, 2);
    // 용암 균열
    const cracks = [];
    for (let i = 0; i < 22; i++) {
      const a = ctx.r() * 6.28, d = 16 + ctx.r() * (R - 20), x = Math.cos(a) * d, z = Math.sin(a) * d;
      cracks.push({ x, y: heightAt(x, z) + 0.05, z, ry: ctx.r() * 3, sx: 0.35, sy: 1, sz: 3 + ctx.r() * 6 });
    }
    const crackMat = new THREE.MeshBasicMaterial({ color: 0xff4a1a, toneMapped: false });
    ctx.add(instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), crackMat, cracks));
    ctx.anim.push((dt, t) => crackMat.color.setRGB(1, 0.25 + Math.sin(t * 2) * 0.1, 0.08));
    mushrooms(ctx, 20, [0xff3a6a, 0xa040ff]);
  }

  // 앰비언트 파티클
  for (const p of T.particles) ctx.particles.push(ctx.add(ambient({ ...p, radius: R + 6, base: p.mode === 2 ? -1 : 0.4, height: p.height ?? (p.mode === 1 ? 9 : 5) })));

  // 채집 노드 / 몬스터 스폰
  const nodes = [];
  for (const [type, n] of Object.entries(def.nodes)) for (let i = 0; i < n; i++) nodes.push({ type, pos: ctx.free(3.4, 7, 3, 0.5) });
  const enemySpawns = [];
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2, d = R * (0.3 + (i % 3) * 0.18);
    enemySpawns.push(new THREE.Vector3(Math.cos(ang) * d, 0, Math.sin(ang) * d));
  }
  // 게이트 + 마법진
  const gate = buildGate(0x8af0ff);
  gate.group.position.copy(gatePos);
  group.add(gate.group);
  magicCircle(ctx, gatePos.x, gatePos.z, 3, 0x8af0ff, 0.3);
  // 소환 비석
  const seal = new THREE.Group();
  const slab = new THREE.Mesh(lumpy(new THREE.BoxGeometry(0.95, 2.1, 0.45, 2, 3, 1), 0.05, 2), new THREE.MeshLambertMaterial({ color: 0x9a96a8, flatShading: true }));
  slab.position.y = 1.0; slab.castShadow = true; seal.add(slab);
  part(G.box, glowMat(0xffb347), 0, 1.2, 0.24, 0.42, 0.42, 0.02, seal);
  const sealGlow = addGlow(seal, 0xffb347, 3, 0.7); sealGlow.position.y = 1.2;
  seal.position.copy(sealPos); group.add(seal);
  magicCircle(ctx, sealPos.x, sealPos.z, 1.6, 0xffb347, 0.4);

  return finishMap(ctx, {
    id, def, group, R, spawn, spawnYaw: Math.PI, gatePos, gate, nodes, enemySpawns, orbPos, sealPos, seal, sealGlow,
  });
}

function finishMap(ctx, m) {
  const T = ctx.T;
  const sd = new THREE.Vector3(...T.sunDir).normalize();
  const sl = sd.clone(); sl.y = Math.max(sl.y, 0.45); sl.normalize();
  m.heightAt = ctx.heightAt;
  m.sunOffset = sl.multiplyScalar(48);
  m.applyEnv = (g) => {
    g.sky.setTheme(T, sd);
    if (g.scene.fog.isFogExp2) g.scene.fog.density = T.fogD;
    g.scene.fog.color.setHex(T.fog);
    g.hemi.color.setHex(T.hemiSky); g.hemi.groundColor.setHex(T.hemiGround); g.hemi.intensity = T.hemiI;
    g.sun.color.setHex(T.sunLight); g.sun.intensity = T.sunI;
    g.renderer.toneMappingExposure = T.exposure;
  };
  m.update = (dt, t) => {
    WIND.value = t;
    for (const w of ctx.waters) w.uniforms.uTime.value = t;
    for (const p of ctx.particles) p.material.uniforms.uTime.value = t;
    for (const c of ctx.circles) { c.m.rotation.y += dt * c.speed; c.m.material.opacity = c.base * (0.8 + 0.2 * Math.sin(t * 2 + c.speed * 10)); }
    for (const f of ctx.anim) f(dt, t);
  };
  return m;
}

// ============================================================
//  내 집 · 하늘 정원 (따뜻한 등불 · 나무 울타리 · 아늑한 정원)
// ============================================================
function buildHome(group) {
  const R = 26, T = THEMES.home;
  Models.setPropRim(T.sunLight);
  const pondP = { x: -15.5, z: 9, r: 3.2 };
  const bridge = { x: pondP.x, z: pondP.z, ang: 0.5, L: pondP.r * 2 + 2.8, W: 1.6, H: 0.55 };
  const heightAt = makeHeight({ pond: pondP, bridge, flat: true });
  const ctx = makeCtx(group, R, T, 4242, heightAt);
  const house = { box: [-5.6, 5.6, -18.6, -11.6] };
  ctx.blockers.push(house);
  islandBody(ctx);
  cloudsAndSky(ctx, 77);

  // ---- 오두막 (CC0 Isa Lousberg 'Homely House' GLB, 없으면 절차적) ----
  let houseBox = house.box;
  const houseGLB = Models.cloneStatic('house');
  if (houseGLB) {
    houseGLB.position.set(0, 0, -15); group.add(houseGLB);
    houseGLB.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    houseGLB.updateMatrixWorld(true);
    const hb = new THREE.Box3().setFromObject(houseGLB);
    houseBox = [hb.min.x - 0.3, hb.max.x + 0.3, hb.min.z - 0.3, hb.max.z + 0.3];
    house.box = houseBox;
    const porch = new THREE.PointLight(0xffb060, 9, 16, 2); porch.position.set(0, 3.0, hb.max.z + 0.8); group.add(porch);
    addGlow(group, 0xffb060, 3.4, 0.6).position.set(0, 3.0, hb.max.z + 0.5);
  }
  const beam = new THREE.MeshLambertMaterial({ map: woodTex(), color: 0x8a5a3a });
  const H = new THREE.Group(); H.position.set(0, 0, -15);
  if (!houseGLB) {
  group.add(H);
  const plaster = new THREE.MeshLambertMaterial({ color: 0xfff1dc });
  const stoneM = new THREE.MeshLambertMaterial({ map: stoneTex() });
  part(G.box, stoneM, 0, 0.3, 0, 9.4, 0.6, 5.4, H);                       // 석조 기단
  part(G.box, plaster, 0, 2.35, 0, 9, 3.5, 5, H);
  for (const x of [-4.45, -1.5, 1.5, 4.45]) part(G.box, beam, x, 2.35, 2.53, 0.25, 3.5, 0.12, H);   // 목조 프레임
  part(G.box, beam, 0, 4.0, 2.53, 9.1, 0.25, 0.12, H);
  part(G.box, beam, 0, 0.75, 2.53, 9.1, 0.2, 0.12, H);
  const roofT = roofTex().clone(); roofT.needsUpdate = true; roofT.repeat.set(3, 2);
  const roofG = new THREE.ConeGeometry(6.9, 3.4, 4, 1);
  const roof = new THREE.Mesh(roofG, new THREE.MeshLambertMaterial({ map: roofT, flatShading: true }));
  roof.position.y = 5.75; roof.rotation.y = Math.PI / 4; roof.scale.z = 0.66; roof.castShadow = true; H.add(roof);
  part(G.box, beam, 0, 1.45, 2.6, 1.6, 2.7, 0.12, H);                     // 문
  part(G.sph, toon(0xffd040), 0.55, 1.45, 2.7, 0.08, 0.08, 0.08, H);
  const winM = glowMat(0xffd890);
  for (const x of [-3, 3]) {
    part(G.box, winM, x, 2.6, 2.52, 1.4, 1.2, 0.06, H);
    part(G.box, beam, x, 2.6, 2.58, 1.5, 0.08, 0.06, H); part(G.box, beam, x, 2.6, 2.58, 0.08, 1.3, 0.06, H);
    part(G.box, beam, x, 1.9, 2.75, 1.6, 0.25, 0.35, H);                   // 창가 화분
    for (let k = 0; k < 5; k++) part(G.sph, toon([0xff7aa8, 0xfff070, 0xffffff, 0xb89aff, 0xff9a5a][k]), x - 0.6 + k * 0.3, 2.1, 2.78, 0.1, 0.08, 0.1, H);
    addGlow(H, 0xffc870, 2.4, 0.45).position.set(x, 2.6, 2.7);
  }
  const chim = new THREE.Mesh(lumpy(new THREE.BoxGeometry(0.9, 2.4, 0.9, 1, 3, 1), 0.04, 2), stoneM); chim.position.set(2.8, 6.4, -0.6); chim.castShadow = true; H.add(chim);
  ctx.particles.push(ctx.add(ambient({ mode: 3, count: 40, center: [2.8, -15.6], radius: 0.25, base: 7.6, height: 6, colA: 0xe8e0e0, colB: 0xffffff, size: 0.55, blend: 'normal', opacity: 0.45 })));
  // 현관 등불 (포인트 라이트 1개만 사용)
  const porch = new THREE.PointLight(0xffb060, 9, 16, 2); porch.position.set(0, 3.3, -11.9); group.add(porch);
  part(G.box, glowMat(0xffd080), 0, 3.25, -12.2, 0.35, 0.45, 0.35, group);
  addGlow(group, 0xffb060, 3.4, 0.7).position.set(0, 3.25, -12.1);
  H.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // ---- 길 ----
  const gatePos = new THREE.Vector3(R - 4, 0, 0);
  stonePath(ctx, [{ x: 0, z: 8 }, { x: 0.5, z: 0 }, { x: 0, z: houseBox[3] }], 2.0);
  stonePath(ctx, [{ x: 0.5, z: 0 }, { x: 9, z: 1.2 }, { x: gatePos.x - 2.5, z: 0 }], 1.8);
  // ---- 연못 + 작은 다리 ----
  pond(ctx, pondP, { skip: () => false });
  woodBridge(ctx, bridge);
  magicCircle(ctx, pondP.x, pondP.z, pondP.r * 0.8, T.waterGlow, -0.05, -0.13, 0.2);

  // ---- 나무 울타리 ----
  const wood = new THREE.MeshLambertMaterial({ map: woodTex() });
  const posts = [], rails = [];
  const nF = 52, rF = R - 1.3;
  for (let i = 0; i < nF; i++) {
    const a = (i / nF) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.14) continue;     // 게이트 쪽 입구
    const x = Math.cos(a) * rF, z = Math.sin(a) * rF;
    posts.push({ x, y: 0.55, z, ry: -a, sx: 0.2, sy: 1.1, sz: 0.2 });
    const a2 = ((i + 0.5) / nF) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a2), Math.cos(a2))) < 0.14) continue;
    const seg = 2 * Math.PI * rF / nF;
    for (const y of [0.45, 0.85]) rails.push({ x: Math.cos(a2) * rF, y, z: Math.sin(a2) * rF, ry: -a2, sx: 0.08, sy: 0.12, sz: seg });
  }
  if (Models.has('fence')) {
    const fl = [], nG = Math.round(2 * Math.PI * rF / 3.15);
    for (let i = 0; i < nG; i++) {
      const a = ((i + 0.5) / nG) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.16) continue;
      fl.push({ x: Math.cos(a) * rF, y: 0, z: Math.sin(a) * rF, ry: -(a + Math.PI / 2) });
    }
    ctx.add(Models.instancedProp('fence', fl));
  } else {
    ctx.add(instanced(G.box, wood, posts, { cast: true }));
    ctx.add(instanced(G.box, wood, rails, { cast: true }));
  }
  for (let i = 0; i < 3; i++) part(G.sph, toon(0xfff0d0), Math.cos(i * 2.1) * rF, 1.15, Math.sin(i * 2.1) * rF, 0.12, 0.12, 0.12, group);

  // ---- 가로등 + 줄 전구 ----
  const lampPts = [[-2.2, 6], [2.2, 6], [-2.4, -4], [2.6, -4], [12, 3], [12, -2.2], [-9, -6], [8, -10]];
  const lampM = glowMat(0xffd080);
  const iron = new THREE.MeshLambertMaterial({ color: 0x2a2630 });
  const lampPosts = [], lampHeads = [];
  const glbLamp = Models.has('street_lantern');
  for (const [x, z] of lampPts) {
    lampPosts.push({ x, y: 1.5, z, sx: 0.07, sy: 3, sz: 0.07 });
    lampHeads.push({ x, y: 3.05, z, s: 0.32 });
    addGlow(group, 0xffb860, glbLamp ? 2.6 : 3.2, 0.65).position.set(x, glbLamp ? 2.85 : 3.05, z);
  }
  if (glbLamp) ctx.add(Models.instancedProp('street_lantern', lampPts.map(([x, z]) => ({ x, y: 0, z, ry: 0 }))));
  else {
    ctx.add(instanced(G.cyl, iron, lampPosts, { cast: true }));
    ctx.add(instanced(G.box, lampM, lampHeads));
    ctx.add(instanced(G.cone4, iron, lampPts.map(([x, z]) => ({ x, y: 3.35, z, ry: Math.PI / 4, sx: 0.32, sy: 0.25, sz: 0.32 }))));
  }
  const bulbs = [], bc = [0xffe08a, 0xffa0b0, 0xa0e0ff, 0xc8ffb0];
  const hz = houseBox[3] - 0.2, hx0 = houseBox[0] + 1, hx1 = houseBox[1] - 1;
  const strands = [[[hx0, 4.2, hz], [-2.2, 3.0, -4]], [[hx1, 4.2, hz], [2.6, 3.0, -4]], [[-2.4, 3.0, -4], [-2.2, 3.0, 6]], [[2.6, 3.0, -4], [2.2, 3.0, 6]], [[12, 3.0, 3], [12, 3.0, -2.2]]];
  for (const [a, b] of strands) {
    const n = 12;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      bulbs.push({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.6, z: a[2] + (b[2] - a[2]) * t, s: 0.07, c: bc[i % 4] });
    }
  }
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  ctx.add(instanced(G.sphLo, bulbMat, bulbs));
  ctx.anim.push((dt, t) => { const k = 0.85 + 0.15 * Math.sin(t * 3); bulbMat.color.setRGB(k, k, k); });

  // ---- 정원 ----
  ctx.taken.push(new THREE.Vector3(0, 0, 6), gatePos.clone(), new THREE.Vector3(0, 0, 0));
  ctx.blockers.push({ x: gatePos.x, z: gatePos.z, r: 3 });
  for (const [x, z] of [[-9.5, -7.5], [9.5, -7.5], [12.5, 6.5]]) { ctx.blockers.push({ x, z, r: 3.4 }); ctx.taken.push(new THREE.Vector3(x, 0, z)); }  // NPC 자리
  if (glbScatter(ctx, ['tree_park_large', 'tree_park'], 6, { scale: [0.8, 1.1], wind: 0.003, minD: 7, pad: 1.8 })) trees(ctx, 3, 'round', [0xffb4cc, 0xffc8da], 7, [1, 1.3]);
  else trees(ctx, 7, 'round', T.leaves, 7, [1, 1.4]);
  const wellObj = Models.cloneStatic('well');
  if (wellObj) { wellObj.position.set(-8.5, 0, -2.5); wellObj.rotation.y = 0.6; wellObj.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); group.add(wellObj); ctx.blockers.push({ x: -8.5, z: -2.5, r: 1.6 }); }
  // 울타리 안쪽 생울타리
  const hedges = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + 0.06;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.25) continue;
    const x = Math.cos(a) * (R - 2.6), z = Math.sin(a) * (R - 2.6);
    if (ctx.blocked(x, z, -0.3)) continue;
    hedges.push({ x, y: -0.05, z, ry: -a, s: 0.9 + ctx.r() * 0.4, c: i % 5 === 0 ? 0xffb4cc : 0x4f9e48 });
  }
  ctx.add(instanced(bushGeo(), addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.02, 'bush'), hedges, { cast: true, receive: true }));
  // 화단 (집 앞)
  const bed = [];
  for (const [cx, cz] of [[-6.5, -9.5], [6.5, -9.5]]) {
    for (let i = 0; i < 40; i++) {
      const x = cx + (ctx.r() - 0.5) * 4, z = cz + (ctx.r() - 0.5) * 2.2;
      bed.push({ x, y: 0.12, z, ry: ctx.r() * 6, s: 1 + ctx.r() * 0.6, c: T.flowers[i % T.flowers.length] });
    }
    part(G.box, beam, cx, 0.08, cz, 4.6, 0.25, 2.8, group).receiveShadow = true;
  }
  ctx.add(instanced(flowerGeo(), addWind(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.9, 'flower'), bed));
  grassField(ctx, 0.85);
  flowerField(ctx, 500, T.flowers);

  // ---- 게이트 ----
  const gate = buildGate(0xffd080);
  gate.group.position.copy(gatePos); gate.group.rotation.y = -Math.PI / 2; group.add(gate.group);
  magicCircle(ctx, gatePos.x, gatePos.z, 3, 0xffd080, 0.3);
  const furnGroup = new THREE.Group(); group.add(furnGroup);

  for (const p of T.particles) ctx.particles.push(ctx.add(ambient({ ...p, radius: R + 4, base: 0.4, height: p.mode === 1 ? 8 : 4.5 })));
  // 정원 가장자리 빛기둥 + 보조 폭포
  for (const a of [0.9, 2.7, 4.4]) { const x = Math.cos(a) * (R - 2.8), z = Math.sin(a) * (R - 2.8); if (!ctx.blocked(x, z, 0.5)) lightShaft(ctx, x, z, T.sunLight, 1.4, 30, 0.28); }
  sideFall(ctx, 5.4, T, 1.4);

  return finishMap(ctx, {
    id: 'home', def: { name: '내 집 · 하늘 정원', desc: '나만의 아지트' }, group, R, spawn: new THREE.Vector3(0, 0, 6), spawnYaw: Math.PI,
    gatePos, gate, nodes: [], enemySpawns: [], orbPos: [], furnGroup, houseBox,
    npcSpots: { smith: [-9.5, -7.5, 0.9], spirit: [9.5, -7.5, -0.9], merchant: [12.5, 6.5, -2.2] },
  });
}

import { ISLANDS as ISL } from './data.js';
