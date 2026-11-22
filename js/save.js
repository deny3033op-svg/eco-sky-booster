// localStorage 자동 저장
const KEY = 'eco-sky-booster-save-v1';

export function defaultState() {
  return {
    ver: 1,
    hero: { lv: 1, exp: 0 },
    inv: { gold: 300, iron: 0, mana: 0, spirit: 0, seal: 0, wood: 0 },
    spirits: { fire: true },          // 해금된 정령
    equipped: ['fire'],               // 장착 정령 (최대 3)
    gear: { sword: 0, gun: 0, booster: 0 },
    furnInv: {},                      // 제작했지만 배치 안 한 가구
    furniture: [                      // 배치된 가구 {type,x,z,rot}
      { type: 'flower', x: -6, z: 4, rot: 0 },
      { type: 'lamp', x: 5, z: 6, rot: 0 },
    ],
    map: 0,          // 현재 맵 (0~3 | 'home')
    island: 0,       // 마지막 모험 섬
    unlocked: 1,     // 해금된 섬 수
    eliteDown: {},   // 섬별 수호자 최초 처치
    claimed: {},     // 1회성 보상 (소환 비석)
    bossKills: 0,
    auto: false,
    settings: { modelRotY: 0, paint: true, heroModel: 'custom', heroChar: 'ophelia', bloom: true, quality: 'auto', fps: false },
    // 코디: 염색 프리셋 + 3D 파츠 (등/머리/무기/오라) — localStorage 에 함께 저장
    cosmetic: { dye: 'default', back: 'bear', head: 'none', weapon: 'default', aura: 'none' },
  };
}

function merge(base, src) {
  if (src === null || typeof src !== 'object' || Array.isArray(src)) return src === undefined ? base : src;
  const out = Array.isArray(base) ? [] : { ...base };
  for (const k of Object.keys(src)) {
    const b = base ? base[k] : undefined;
    out[k] = (b && typeof b === 'object' && !Array.isArray(b)) ? merge(b, src[k]) : src[k];
  }
  return out;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const st = merge(defaultState(), JSON.parse(raw));
      delete st.summons; delete st.party;          // v0.5: 동료/서포터 소환 시스템 제거 → 구 세이브 정리
      return st;
    }
  } catch (e) { console.warn('save load failed', e); }
  return defaultState();
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode 등 */ }
}

export function resetState() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
