// ============================================================
//  ECO: Sky Booster — 게임 데이터 정의
// ============================================================

export const ELEMENT_ORDER = ['fire', 'wind', 'water', 'thunder', 'earth', 'light', 'dark'];

export const ELEMENTS = {
  fire:    { name: '이그니스', el: '불',   icon: '🔥', color: 0xff5a2a, css: '#ff6a3a', buff: '공격력 +20%',                skill: '화염탄 보조 공격(폭발)' },
  wind:    { name: '실피',     el: '바람', icon: '💨', color: 0x5dffb0, css: '#5dffb0', buff: '공속·이속 +25%, 쿨타임 감소', skill: '회오리 보조 공격(관통)' },
  water:   { name: '아쿠아',   el: '물',   icon: '💧', color: 0x3aa8ff, css: '#4ab0ff', buff: 'HP 지속 회복 + 보호막',       skill: '슬로우 물방울' },
  thunder: { name: '볼트',     el: '번개', icon: '⚡', color: 0xffe14a, css: '#ffe14a', buff: '치명타율 +20%',              skill: '연쇄 번개' },
  earth:   { name: '테라',     el: '땅',   icon: '🌍', color: 0xc08a4a, css: '#d09a5a', buff: '방어력·최대HP +30%, 경직 면역', skill: '암석 충격파(범위 스턴)' },
  light:   { name: '루미나',   el: '빛',   icon: '✨', color: 0xfff6c0, css: '#fff2a0', buff: '치유량·드랍률 +25%',          skill: '성광 레이저(관통)' },
  dark:    { name: '녹스',     el: '어둠', icon: '🌑', color: 0x9a4dff, css: '#b07aff', buff: '적 방어력 감소 + 흡혈 10%',    skill: '그림자 추적탄' },
};
export const SPIRIT_EQUIP_MAX = 3;

export const MAT_ORDER = ['gold', 'iron', 'mana', 'spirit', 'seal', 'wood'];
export const MATS = {
  gold:   { name: '골드',        icon: '🪙', color: 0xffd34a },
  iron:   { name: '철광석',      icon: '⛓️', color: 0xb8c0cc },
  mana:   { name: '마력석',      icon: '💠', color: 0x4ad8ff },
  spirit: { name: '속성 정령석', icon: '🔮', color: 0xd070ff },
  seal:   { name: '각성의 인장', icon: '📜', color: 0xffb347 },
  wood:   { name: '목재',        icon: '🪵', color: 0xb07a40 },
};

// ---------------- 장비 강화 ----------------
export const GEAR_ORDER = ['sword', 'gun', 'booster'];
export const GEAR_MAX = 10;
export const GEAR = {
  sword:   { name: '검',            icon: '🗡️', desc: (lv) => `근접 공격력 +${lv * 12}%` },
  gun:     { name: '권총',          icon: '🔫', desc: (lv) => `사격 피해 +${lv * 10}% · 연사 속도 +${lv * 6}%` },
  booster: { name: '곰인형 부스터', icon: '🧸', desc: (lv) => `부스터 지속(게이지) +${lv * 12}% · 돌진 속도 +${lv * 5}%` },
};
export function enhanceCost(part, lv) {
  const n = lv + 1;
  const c = { gold: Math.round(80 * Math.pow(n, 1.6)), mana: n * 2 };
  if (part === 'sword') c.iron = n * 3;
  if (part === 'gun') { c.iron = n * 2; c.mana += n; }
  if (part === 'booster') { c.wood = n * 3; c.iron = n; }
  if (n >= 5) c.spirit = n - 3;
  if (n >= 7) c.seal = n - 6;          // 각성의 인장: +7 이상 강화 재료
  return c;
}
export function enhanceRate(lv) {
  return [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3][lv] ?? 0;
}
// 강화 단계별 무기 이펙트 색 (10 = 무지개)
export const GEAR_COLORS = [0xffffff, 0xaef6ff, 0x6ae0ff, 0x3a9bff, 0x7a6bff, 0xb05aff, 0xff5ad0, 0xff7a3a, 0xffa020, 0xffe040, -1];

// ---------------- 주인공 VRM 캐릭터 (3종) ----------------
// ver: 파일 메타 기준 VRM 버전 (로딩 시 vrm.meta.metaVersion 으로 다시 자동 판별 — 0.x 만 rotateVRM0 정면 보정)
export const HERO_ORDER = ['ophelia', 'female_saiyan', 'the_sister'];
export const HEROES = {
  ophelia:       { name: '오필리아',     file: 'ophelia.vrm',       ver: '1.0', icon: '🌸', color: '#ff9ad0', desc: '부드러운 단발 · 셔츠 차림의 검사' },
  female_saiyan: { name: '사이어 소녀',   file: 'female_saiyan.vrm', ver: '0.0', icon: '⚡', color: '#ffb84a', desc: '전투복 차림의 격투가 스타일' },
  the_sister:    { name: '더 시스터',     file: 'the_sister.vrm',    ver: '0.0', icon: '✝️', color: '#b0a0ff', desc: '원피스 수녀복의 성기사 스타일' },
};
export const DEFAULT_HERO = 'ophelia';

// ---------------- 하우징 가구 ----------------
export const FURN_ORDER = ['bed', 'rack', 'altar', 'training', 'lamp', 'flower', 'forge'];
export const FURN_BONUS_CAP = 2; // 같은 가구는 최대 2개까지 보너스 적용
export const FURNITURE = {
  bed:      { name: '포근한 침대',   icon: '🛏️', cost: { wood: 12, gold: 150 },           bonus: { hp: 0.10 },     desc: '최대 HP +10%' },
  rack:     { name: '무기 거치대',   icon: '🗡️', cost: { iron: 10, wood: 6, gold: 200 },  bonus: { atk: 0.06 },    desc: '공격력 +6%' },
  altar:    { name: '7대 정령 제단', icon: '⛩️', cost: { spirit: 3, mana: 8, gold: 400 }, bonus: { spirit: 0.15 }, desc: '정령 능력 +15%' },
  training: { name: '전투 훈련장',   icon: '🎯', cost: { wood: 15, iron: 8, gold: 300 },  bonus: { def: 0.12 },    desc: '방어력 +12%' },
  lamp:     { name: '가로등',        icon: '🏮', cost: { iron: 4, mana: 2, gold: 80 },    bonus: { drop: 0.05 },   desc: '드랍률 +5%' },
  flower:   { name: '꽃밭',          icon: '🌷', cost: { wood: 3, gold: 50 },             bonus: { regen: 0.003 }, desc: 'HP 재생 +0.3%/초' },
  forge:    { name: '강화 작업대',   icon: '⚒️', cost: { iron: 15, wood: 10, gold: 350 }, bonus: { enhance: 0.05 },desc: '강화 성공률 +5%' },
};

// ---------------- 몬스터 ----------------
// drops: 값 >= 1 이면 확정 개수, < 1 이면 확률(드랍률 보정)
// v0.5 주인공 1인 전투 밸런스 (서포터 제거): 기존 대비 일반 HP -15~18% · 공격 -12~15%, 수호자/보스 HP -23~28%
//   + 동시 공격 슬롯(SOLO.maxAttackers) · 스폰 수/간격 조정 · 보스 페이즈 소환 3 → 2
export const SOLO = { maxAttackers: 3, respawn: 3.0, initRatio: 0.6, aggro: 13, bossAdds: 2 };
export const ENEMIES = {
  slime:       { name: '젤리 슬라임',     hp: 60,    atk: 8,  def: 2,  speed: 3.2, range: 1.7, atkCd: 1.5, exp: 11,   size: 0.9, color: 0x7be05a, shape: 'slime',  gold: [4, 10],     drops: { wood: 0.25, iron: 0.15 } },
  wolf:        { name: '초원 늑대',       hp: 92,    atk: 11, def: 4,  speed: 5.6, range: 1.9, atkCd: 1.2, exp: 17,   size: 1.0, color: 0x9a8a7a, shape: 'beast',  gold: [6, 14],     drops: { wood: 0.2, iron: 0.25 } },
  golem:       { name: '수정 골렘',       hp: 235,   atk: 17, def: 14, speed: 3.2, range: 2.4, atkCd: 1.9, exp: 32,   size: 1.3, color: 0x7ad0ff, shape: 'golem',  gold: [12, 25],    drops: { iron: 0.5, mana: 0.4 } },
  bat:         { name: '수정 박쥐',       hp: 110,   atk: 12, def: 4,  speed: 6.2, range: 10,  atkCd: 2.0, exp: 21,   size: 0.8, color: 0xb07aff, shape: 'bat',    ranged: true, fly: 1.6, gold: [8, 16], drops: { mana: 0.4 } },
  wraith:      { name: '유적의 망령',     hp: 200,   atk: 19, def: 8,  speed: 4.8, range: 11,  atkCd: 2.1, exp: 36,   size: 1.1, color: 0xd8e0ff, shape: 'wraith', ranged: true, fly: 0.6, gold: [14, 28], drops: { mana: 0.3, spirit: 0.15 } },
  knight:      { name: '어둠 기사',       hp: 370,   atk: 26, def: 20, speed: 4.4, range: 2.4, atkCd: 1.6, exp: 50,   size: 1.25,color: 0x4a3a6a, shape: 'knight', gold: [20, 40],    drops: { iron: 0.5, spirit: 0.2, seal: 0.03 } },
  kingSlime:   { name: '킹 슬라임',       hp: 1150,  atk: 20, def: 8,  speed: 3.4, range: 3.2, atkCd: 1.8, exp: 170,  size: 2.4, color: 0x4ad04a, shape: 'slime',  elite: true, gold: [150, 220], drops: { seal: 1, wood: 4, iron: 3 } },
  crystalKing: { name: '크리스탈 골렘 킹', hp: 2500,  atk: 30, def: 23, speed: 3.6, range: 3.4, atkCd: 1.9, exp: 420,  size: 2.3, color: 0x5ab8ff, shape: 'golem',  elite: true, gold: [300, 420], drops: { seal: 1, mana: 6, iron: 5, spirit: 1 } },
  guardian:    { name: '빛과 어둠의 수호자', hp: 4100, atk: 37, def: 26, speed: 4.4, range: 3.4, atkCd: 1.7, exp: 820,  size: 2.1, color: 0xe8d8ff, shape: 'knight', elite: true, gold: [500, 700], drops: { seal: 1, spirit: 4, mana: 6 } },
  dragon:      { name: '공허룡 니힐',     hp: 13000, atk: 45, def: 28, speed: 5.0, range: 4.6, atkCd: 2.1, exp: 3000, size: 3.2, color: 0x3a1a5a, shape: 'dragon', boss: true, gold: [1500, 2200], drops: { seal: 2, spirit: 6, mana: 10, iron: 10 } },
};

// ---------------- 하늘섬 ----------------
export const ISLANDS = [
  { id: 0, name: '초원 섬',          desc: '바람이 머무는 푸른 하늘섬',   ground: 0x74c85a, ground2: 0x9adb6a, cliff: 0x8a6a48, rock: 0x7a6a5a, skyTop: 0x3a8cff, skyBot: 0xcfeeff, fog: 0xbfe6ff, sun: 0xfff2dd,
    enemies: ['slime', 'slime', 'wolf'], count: 9, elite: 'kingSlime', eliteAt: 10, spirits: ['wind', 'earth'], nodes: { tree: 9, ore: 6, crystal: 2 }, deco: 'meadow', radius: 46 },
  { id: 1, name: '수정 동굴 섬',      desc: '마력이 맺힌 푸른 수정의 섬',   ground: 0x5a6680, ground2: 0x7a88a8, cliff: 0x4a4a68, rock: 0x3a3a58, skyTop: 0x1a2a6a, skyBot: 0x8ab0ff, fog: 0x6a88c8, sun: 0xc8dcff,
    enemies: ['golem', 'bat', 'bat'], count: 9, elite: 'crystalKing', eliteAt: 12, spirits: ['water', 'thunder'], nodes: { crystal: 9, ore: 7, spiritOre: 2 }, deco: 'crystal', radius: 46 },
  { id: 2, name: '빛과 어둠의 유적',  desc: '빛과 그림자가 교차하는 고대 유적', ground: 0xb8a888, ground2: 0x8a7a6a, cliff: 0x6a5a4a, rock: 0x5a4a5a, skyTop: 0x5a2a7a, skyBot: 0xffc89a, fog: 0xd8a8b8, sun: 0xffe0c0,
    enemies: ['wraith', 'knight', 'wraith'], count: 9, elite: 'guardian', eliteAt: 12, spirits: ['light', 'dark'], nodes: { spiritOre: 6, crystal: 4, tree: 4 }, deco: 'ruins', radius: 48 },
  { id: 3, name: '보스 섬 · 공허의 둥지', desc: '공허룡 니힐이 잠든 마지막 섬', ground: 0x3a2a3a, ground2: 0x5a2a3a, cliff: 0x2a1a2a, rock: 0x1a101a, skyTop: 0x0a0418, skyBot: 0x6a2a4a, fog: 0x3a1a3a, sun: 0xffb0b0,
    enemies: ['knight', 'wraith', 'golem'], count: 7, boss: 'dragon', eliteAt: 6, spirits: [], nodes: { spiritOre: 4, ore: 5 }, deco: 'boss', radius: 50 },
];

export const NODE_TYPES = {
  tree:      { name: '나무',      gives: { wood: [2, 4] },             hits: 3 },
  ore:       { name: '철광석',    gives: { iron: [2, 3] },             hits: 3 },
  crystal:   { name: '마력 수정', gives: { mana: [1, 3] },             hits: 3 },
  spiritOre: { name: '정령석 광맥', gives: { spirit: [1, 1], mana: [1, 2] }, hits: 4 },
};

export function expNeed(lv) { return Math.round(40 * Math.pow(lv, 1.55)); }
