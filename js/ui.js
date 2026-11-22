// HUD · 패널(캐릭터/코디/정령/강화/가방/지도) · 하우징 건축 바
import * as D from './data.js';
import { DYES, DYE_ORDER, PART_SLOTS } from './cosmetics.js';
import { MAP_LEGEND } from './minimap.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n));
// Lucide 아이콘
export const ic = (name, color) => `<i data-lucide="${name}"${color ? ` style="color:${color}"` : ''}></i>`;
let _iconQ = false;
export function icons() {
  if (_iconQ || !window.lucide) return;
  _iconQ = true;
  requestAnimationFrame(() => { _iconQ = false; try { window.lucide.createIcons(); } catch (e) {} });
}
const MAT_IC = { gold: ['coins', '#ffd34a'], iron: ['pickaxe', '#c8d0dc'], mana: ['gem', '#4ad8ff'], spirit: ['sparkles', '#d890ff'], seal: ['scroll', '#ffb347'], wood: ['trees', '#c89060'] };
const matIc = (k) => ic(MAT_IC[k][0], MAT_IC[k][1]);

export class UI {
  constructor(game) {
    this.g = game;
    this.dirty = true; this.t = 0;
    this.panel = null;
    this.els = {
      hpFill: $('hpFill'), hpTxt: $('hpTxt'), shield: $('shieldFill'), boost: $('boostFill'), exp: $('expFill'), lv: $('lvTag'),
      spiritBar: $('spiritBar'), heroName: $('heroName'), matBar: $('matBar'), area: $('areaName'), obj: $('objective'),
      auto: $('autoBtn'), toasts: $('toasts'), banner: $('banner'), panelWrap: $('panel'), panelTitle: $('panelTitle'), panelBody: $('panelBody'),
      buildBar: $('buildBar'), boss: $('bossBar'), bossFill: $('bossFill'), bossName: $('bossName'), hurt: $('hurt'),
      burstBtn: document.querySelector('[data-act="burst"]'), skillBtn: document.querySelector('[data-act="skill"]'),
      homeBtn: $('homeBtn'), autoState: $('autoState'), gold: $('goldChip'),
      flash: $('screenFlash'), combo: $('combo'), comboN: document.querySelector('#combo b'),
      swordBtn: document.querySelector('[data-act="attack"]'), gunBtn: document.querySelector('[data-act="gun"]'),
      drawer: $('drawer'), menuToggle: $('menuToggle'), talk: $('talkBtn'), fps: $('fpsMeter'),
    };
    this.els.menuToggle.addEventListener('click', () => this.toggleDrawer());
    this.els.talk.addEventListener('click', () => { this.toggleDrawer(false); this.g.talkNPC(); });
    icons();
    this.els.auto.addEventListener('click', () => this.g.toggleAuto());
    this.els.homeBtn.addEventListener('click', () => { this.toggleDrawer(false); this.g.goHome(); });
    document.querySelectorAll('[data-panel]').forEach((b) => b.addEventListener('click', () => { this.toggleDrawer(false); this.togglePanel(b.dataset.panel); }));
    $('panelClose').addEventListener('click', () => this.closePanel());
    this.els.panelWrap.addEventListener('pointerdown', (e) => { if (e.target === this.els.panelWrap) this.closePanel(); });
    // 패널 내부 버튼 위임
    this.els.panelBody.addEventListener('click', (e) => {
      const b = e.target.closest('[data-do]'); if (!b) return;
      this.handle(b.dataset.do, b.dataset.arg);
    });
    this.els.buildBar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-do]'); if (!b) return;
      this.handle(b.dataset.do, b.dataset.arg);
    });
  }

  get panelOpen() { return !!this.panel; }

  toggleDrawer(open) {
    const d = this.els.drawer;
    const on = open === undefined ? d.classList.contains('closed') : open;
    d.classList.toggle('closed', !on);
    this.els.menuToggle.classList.toggle('open', on);
    this.els.menuToggle.innerHTML = ic(on ? 'x' : 'menu');
    icons();
  }
  setTalk(npc) {
    const t = this.els.talk;
    if (!npc) { t.classList.add('hidden'); return; }
    t.querySelector('span').textContent = `${npc.name} · ${npc.role}`;
    t.classList.remove('hidden');
  }

  // ---------------- 알림 ----------------
  toast(msg) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    this.els.toasts.appendChild(el);
    while (this.els.toasts.children.length > 4) this.els.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }
  banner(title, sub = '', dur = 2.6) {
    const b = this.els.banner;
    b.innerHTML = `<div class="bt">${title}</div>${sub ? `<div class="bs">${sub}</div>` : ''}`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), dur * 1000);
  }
  hurtFlash() { const h = this.els.hurt; h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
  shake(v) { this.g.shakeT = Math.max(this.g.shakeT || 0, v); }
  // 화면 플래시 (필살기 연출): strength 0~1, dur 초
  screenFlash(strength = 0.8, dur = 0.4) {
    const f = this.els.flash; if (!f) return;
    f.style.setProperty('--fs', strength); f.style.animationDuration = dur + 's';
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }
  // 콤보 카운터: 변할 때만 DOM 갱신
  setCombo(n) {
    const c = this.els.combo; if (!c) return;
    if (n <= 0) { c.classList.remove('show'); return; }
    this.els.comboN.textContent = n;
    c.dataset.tier = n >= 60 ? 3 : n >= 30 ? 2 : n >= 10 ? 1 : 0;
    c.classList.add('show');
    // Web Animations API: 강제 리플로우 없이 팝 애니메이션 재시작 (연사 중 매 타격마다 호출됨)
    if (this.els.comboN.animate) this.els.comboN.animate([{ transform: 'scale(1.5) rotate(-4deg)' }, { transform: 'scale(1)' }], { duration: 150, easing: 'ease-out' });
  }
  // 현재 자동 선택된 무기 표시 (검/권총 버튼 강조)
  setWeapon(w) {
    this.els.swordBtn.classList.toggle('active', w === 'sword');
    this.els.gunBtn.classList.toggle('active', w === 'gun');
  }

  setAuto(on) {
    this.els.auto.classList.toggle('on', on);
    this.els.auto.querySelector('b').textContent = on ? 'ON' : 'OFF';
    this.els.autoState.style.display = on ? '' : 'none';
  }
  setAutoManual(manual) { this.els.auto.classList.toggle('manual', manual); }

  onMapChange() {
    const w = this.g.world;
    this.els.area.textContent = w.def.name;
    this.els.homeBtn.innerHTML = this.g.mapId === 'home' ? ic('hammer') + '<span>건축</span>' : ic('house') + '<span>집</span>';
    icons();
    document.body.classList.toggle('atHome', this.g.mapId === 'home');
    this.banner(w.def.name, w.def.desc, 2.2);
    this.dirty = true;
    if (this.panel) this.renderPanel();
  }
  refreshAll() { this.dirty = true; if (this.panel) this.renderPanel(); }

  // ---------------- HUD 업데이트 ----------------
  update(dt) {
    const g = this.g, h = g.h, st = g.stats, e = this.els;
    // 매 프레임: 바 (주인공 1인)
    e.hpFill.style.width = (100 * Math.max(0, h.hp) / st.maxHp).toFixed(1) + '%';
    e.shield.style.width = (100 * Math.min(1, h.shield / st.maxHp)).toFixed(1) + '%';
    e.boost.style.width = (100 * h.gauge / st.boostMax).toFixed(1) + '%';
    e.boost.parentElement.classList.toggle('hover', h.hovering);
    // 쿨타임
    const sk = Math.max(0, g.cds.skill) / (6 * st.cdMult);
    e.skillBtn.style.setProperty('--cd', sk.toFixed(3));
    e.skillBtn.classList.toggle('cooling', sk > 0);
    const bu = Math.max(0, g.cds.burst) / (25 * st.cdMult);
    e.burstBtn.style.setProperty('--cd', bu.toFixed(3));
    e.burstBtn.classList.toggle('cooling', bu > 0);
    e.burstBtn.classList.toggle('hidden', !g.master);
    // 보스바
    const big = g.enemies.find((x) => (x.boss || x.elite) && !x.dead);
    e.boss.classList.toggle('show', !!big);
    if (big) { e.bossName.textContent = (big.boss ? '👑 ' : '⚔ ') + big.def.name; e.bossFill.style.width = (100 * big.hp / big.maxHp).toFixed(1) + '%'; }

    this.t -= dt;
    if (this.t > 0 && !this.dirty) return;
    this.t = 0.2;
    const s = g.state;
    e.hpTxt.textContent = `${Math.ceil(Math.max(0, h.hp))} / ${Math.round(st.maxHp)}`;
    e.lv.textContent = 'Lv.' + s.hero.lv;
    e.exp.style.width = (100 * s.hero.exp / D.expNeed(s.hero.lv)).toFixed(1) + '%';
    if (s.auto) e.autoState.textContent = e.auto.classList.contains('manual') ? '수동 조작 우선' : (g.autoState || '대기');
    // 목표
    e.obj.textContent = this.objective();
    if (!this.dirty) return;
    this.dirty = false;
    // 재료
    e.matBar.innerHTML = D.MAT_ORDER.map((k) => `<span title="${D.MATS[k].name}">${matIc(k)}${fmt(s.inv[k] || 0)}</span>`).join('');
    e.gold.innerHTML = matIc('gold') + fmt(s.inv.gold || 0);
    // 정령
    const act = g.activeSpirits();
    e.spiritBar.innerHTML = (g.master ? '<span class="master">🌈 ELEMENTAL</span>' : '') +
      act.map((el) => `<span class="sp" style="--c:${D.ELEMENTS[el].css}" title="${D.ELEMENTS[el].name}: ${D.ELEMENTS[el].buff}">${D.ELEMENTS[el].icon}</span>`).join('');
    // 주인공 이름 (선택 캐릭터)
    const hd = D.HEROES[s.settings.heroChar];
    if (e.heroName) e.heroName.textContent = s.settings.heroModel === 'cc0' ? '에코' : (hd ? hd.name : '에코');
    icons();
  }
  objective() {
    const g = this.g, id = g.mapId, s = g.state;
    if (id === 'home') return g.build.active ? '건축 모드: 가구를 선택해 배치하세요' : '내 집 · 오른쪽 게이트 = 모험 출발';
    const def = D.ISLANDS[id];
    const big = g.enemies.find((x) => (x.boss || x.elite) && !x.dead);
    if (big) return `${big.def.name}을(를) 쓰러뜨리세요!`;
    if (id === 3) return `처치 ${Math.min(g.mapKills, def.eliteAt)}/${def.eliteAt} → 공허룡 강림`;
    if (s.unlocked > id + 1) {
      const left = g.orbs.length;
      return left ? `정령 ${left}마리가 기다리고 있어요 · 북쪽 게이트 개방됨` : '북쪽 게이트 개방됨 → 다음 섬';
    }
    if (g.eliteCd > 0) return '수호자 재등장 대기 중…';
    return `처치 ${Math.min(g.mapKills, def.eliteAt)}/${def.eliteAt} → 섬의 수호자 등장`;
  }

  // ---------------- 패널 ----------------
  togglePanel(name) { if (this.panel === name) this.closePanel(); else this.openPanel(name); }
  openPanel(name) {
    this.panel = name;
    this.els.panelWrap.classList.remove('hidden');
    this.renderPanel();
  }
  closePanel() { this.panel = null; this.els.panelWrap.classList.add('hidden'); }
  renderPanel() {
    const T = { chars: ['users', '캐릭터 선택'], wardrobe: ['shirt', '코디 · 염색 / 파츠'], spirits: ['sparkles', '7대 정령'], enhance: ['hammer', '장비 강화'], bag: ['backpack', '가방 · 능력치 · 설정'], map: ['map', '월드맵 · 하늘섬 이동'] };
    this.els.panelTitle.innerHTML = ic(T[this.panel][0]) + ' ' + T[this.panel][1];
    this.els.panelBody.innerHTML = this['render_' + this.panel]();
    if (this.panel === 'map') { const cv = document.getElementById('worldMapCanvas'); if (cv && this.g.minimap) this.g.minimap.drawWorld(cv); }
    icons();
  }

  cost(c) {
    const inv = this.g.state.inv;
    return Object.entries(c).map(([k, v]) => `<span class="cost ${(inv[k] || 0) >= v ? '' : 'lack'}">${matIc(k)}${v}</span>`).join('');
  }

  render_spirits() {
    const g = this.g, s = g.state;
    const n = D.ELEMENT_ORDER.filter((e) => s.spirits[e]).length;
    let h = `<div class="note">${g.master
      ? '<b class="rainbow">🌈 엘레멘탈 마스터 발동 중!</b> 7속성 버프 1.5배 · 7정령 무지개 궤도 · 「엘레멘탈 버스트」 [R] 해금'
      : `수집 <b>${n}/7</b> · 동행 최대 ${D.SPIRIT_EQUIP_MAX}마리 (카드를 눌러 장착/해제). 7정령을 모두 모으면 숨겨진 시너지 <b>「엘레멘탈 마스터」</b> 자동 발동!`}</div><div class="grid">`;
    for (const el of D.ELEMENT_ORDER) {
      const d = D.ELEMENTS[el], has = s.spirits[el], eq = g.master || s.equipped.includes(el);
      const where = D.ISLANDS.find((i) => i.spirits.includes(el));
      h += `<div class="card ${has ? '' : 'locked'} ${eq && has ? 'eq' : ''}" style="--c:${d.css}" ${has ? `data-do="equip" data-arg="${el}"` : ''}>
        <div class="ci">${has ? d.icon : '❔'}</div>
        <div class="cn">${d.el} · ${d.name}</div>
        <div class="cd">💪 ${d.buff}</div><div class="cd">⚔ ${d.skill}</div>
        <div class="cs">${has ? (eq ? '✅ 동행 중' : '대기') : `🔒 ${where ? where.name : '처음부터 보유'}에서 발견`}</div></div>`;
    }
    return h + '</div>';
  }

  // ---------------- 캐릭터 선택 (VRM 3종) ----------------
  render_chars() {
    const g = this.g, st = g.state.settings, r = g.rig;
    const cur = st.heroModel === 'cc0' ? null : st.heroChar;
    let h = `<div class="note">주인공 VRM 캐릭터를 고르세요. <b>VRM 0.0 / 1.0 은 자동 판별</b>되어 0.0 모델만 정면 보정(rotateVRM0)이 적용됩니다.
      SpringBone(머리카락·옷자락), 검·권총, 등 파츠, 코디는 그대로 유지돼요. 선택은 자동 저장됩니다. [V]</div><div class="grid g3">`;
    for (const id of D.HERO_ORDER) {
      const d = D.HEROES[id], on = cur === id;
      const off = d.available === false;
      const live = off ? '🔒 로컬 전용 (라이선스상 웹 배포 제외)' : on && r.vrm ? `로드됨 · VRM ${r.vrmVer}${r.vrm0 ? ' (정면 보정)' : ''}` : `VRM ${d.ver}`;
      h += `<div class="card hero ${on ? 'eq' : ''} ${off ? 'locked' : ''}" style="--c:${d.color}" data-do="hero" data-arg="${id}">
        <div class="ci">${d.icon}</div><div class="cn">${d.name}</div>
        <div class="cd">${d.desc}</div><div class="cd">assets/models/${d.file}</div>
        <div class="cs">${on ? '✅ ' : ''}${live}</div></div>`;
    }
    h += '</div>';
    if (g._heroLoading) h += '<div class="note small">⏳ 모델 불러오는 중…</div>';
    h += `<div class="btns"><button data-do="heroPrev">${ic('chevron-left')} 이전</button><button data-do="heroNext">다음 ${ic('chevron-right')}</button>
      <button data-do="panel" data-arg="wardrobe">${ic('shirt')} 코디 열기 [F]</button></div>
      <div class="note small">현재 모델: ${r.source}</div>`;
    return h;
  }

  // ---------------- 코디: 염색 프리셋 + 3D 파츠 ----------------
  render_wardrobe() {
    const g = this.g, c = g.state.cosmetic;
    let h = `<div class="note">의상·헤어 머티리얼을 실시간으로 염색하고 등·머리·무기·오라 파츠를 착탈합니다. 모든 설정은 자동 저장돼요. [F]
      ${g.rig.vrm ? '' : '<br>※ 염색은 VRM 머티리얼(의상/헤어) 기준이며, 다른 모델은 전체 틴트로 적용됩니다.'}</div>`;
    h += `<h3>${ic('palette')} 염색 프리셋</h3><div class="swatches">`;
    for (const id of DYE_ORDER) {
      const d = DYES[id];
      h += `<button class="swatch ${c.dye === id ? 'on' : ''}" data-do="dye" data-arg="${id}"><i style="background:${d.css}"></i><span>${d.name}</span></button>`;
    }
    h += '</div>';
    for (const [slot, S] of Object.entries(PART_SLOTS)) {
      h += `<h3>${ic(S.icon)} ${S.name}</h3><div class="btns">`;
      for (const v of S.order) h += `<button class="${c[slot] === v ? 'on' : ''}" data-do="part" data-arg="${slot}:${v}">${S.opts[v]}</button>`;
      h += '</div>';
    }
    h += `<div class="note small">등 파츠는 모양만 바뀌며 부스터 돌진·부양 성능은 동일합니다. 무기 「숨김」 상태에서도 검·권총 공격은 그대로 나갑니다.</div>`;
    return h;
  }

  render_enhance() {
    const g = this.g, s = g.state;
    const bonus = g.stats.enhanceBonus;
    let h = `<div class="note">모은 재료로 +1 ~ +${D.GEAR_MAX} 강화. 실패해도 단계는 내려가지 않아요. ${bonus ? `<b>⚒️ 강화 작업대 보너스 +${Math.round(bonus * 100)}%</b>` : '집에 ⚒️ 강화 작업대를 두면 성공률 +5%'}</div><div class="grid g3">`;
    for (const p of D.GEAR_ORDER) {
      const d = D.GEAR[p], lv = s.gear[p];
      const c = D.GEAR_COLORS[lv];
      const css = c === -1 ? 'conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)' : '#' + c.toString(16).padStart(6, '0');
      const rate = Math.min(1, D.enhanceRate(lv) + bonus);
      h += `<div class="card gear" style="--c:${c === -1 ? '#fff' : css}">
        <div class="ci">${d.icon}<i class="gem" style="background:${css}"></i></div>
        <div class="cn">${d.name} <b>+${lv}</b></div>
        <div class="cd">${d.desc(lv)}</div>
        ${lv < D.GEAR_MAX ? `<div class="cd">다음: ${d.desc(lv + 1)}</div>
        <div class="cd">성공률 <b>${Math.round(rate * 100)}%</b></div>
        <div class="btns"><button data-do="enh" data-arg="${p}">✨ 강화 ${this.cost(D.enhanceCost(p, lv))}</button></div>` : '<div class="cs rainbow">★ MAX ★</div>'}
        <div class="res" id="res_${p}"></div></div>`;
    }
    return h + '</div>';
  }

  render_bag() {
    const g = this.g, s = g.state, st = g.stats, fb = st.fb;
    const pct = (v) => Math.round(v * 100) + '%';
    let h = '<div class="grid g3">' + D.MAT_ORDER.map((k) => `<div class="card mat"><div class="ci">${matIc(k)}</div><div class="cn">${D.MATS[k].name}</div><div class="cs">${s.inv[k] || 0}</div></div>`).join('') + '</div>';
    h += `<h3>능력치</h3><div class="stats">
      <span>최대 HP <b>${Math.round(st.maxHp)}</b></span><span>공격력 <b>${Math.round(st.atk)}</b></span><span>방어력 <b>${Math.round(st.def)}</b></span>
      <span>공격속도 <b>${pct(st.atkSpd)}</b></span><span>이동속도 <b>${st.moveSpd.toFixed(1)}</b></span><span>치명타 <b>${pct(st.crit)}</b></span>
      <span>흡혈 <b>${pct(st.lifesteal)}</b></span><span>드랍률 <b>${pct(st.drop)}</b></span><span>HP재생 <b>${(st.regen * 100).toFixed(1)}%/s</b></span>
      <span>정령 위력 <b>${pct(st.spiritPower)}</b></span><span>경직 <b>${st.stagger ? '있음' : '면역'}</b></span></div>`;
    h += `<h3>🏠 가구 보너스</h3><div class="stats">
      <span>최대 HP +${pct(fb.hp)}</span><span>공격력 +${pct(fb.atk)}</span><span>방어력 +${pct(fb.def || 0)}</span><span>정령 +${pct(fb.spirit)}</span>
      <span>드랍률 +${pct(fb.drop)}</span><span>재생 +${(fb.regen * 100).toFixed(1)}%/s</span><span>강화 성공 +${pct(fb.enhance)}</span></div>`;
    const st2 = s.settings, Q = { auto: '자동(60fps 목표)', high: '고품질', low: '저사양' };
    h += `<h3>${ic('settings')} 그래픽 · 모델 설정</h3><div class="btns">
      <button data-do="panel" data-arg="chars">${ic('users')} 캐릭터: ${st2.heroModel === 'cc0' ? 'CC0 Adventurer' : (D.HEROES[st2.heroChar] || {}).name}</button>
      <button data-do="heroModel" class="${st2.heroModel === 'cc0' ? 'on' : ''}">${ic('user')} 비교용 CC0 모델: ${st2.heroModel === 'cc0' ? 'ON' : 'OFF'}</button>
      <button data-do="bloom" class="${st2.bloom ? 'on' : ''}">${ic('sun')} 블룸 발광: ${st2.bloom ? 'ON' : 'OFF'}</button>
      <button data-do="quality">${ic('gauge')} 품질: ${Q[st2.quality] || Q.auto}</button>
      <button data-do="fps" class="${st2.fps ? 'on' : ''}">${ic('activity')} FPS 표시: ${st2.fps ? 'ON' : 'OFF'}</button>
      <button data-do="rotModel">${ic('rotate-cw')} GLB 방향 90° 보정 [F9]</button>
      <button data-do="paint">${ic('palette')} 화이트 메시 페인트: ${st2.paint ? 'ON' : 'OFF'}</button>
      <button data-do="reset" class="danger">${ic('trash-2')} 저장 초기화</button></div>
      <div class="note small">주인공 모델: ${g.rig.source === 'fallback' ? '기본 3D 파츠 캐릭터 (assets/models/eco-hero-girl.glb 없음)' : g.rig.source}</div>
      <h3>${ic('package')} 적용된 오픈소스 3D 모델 (CC0)</h3><div class="credits" id="creditList">불러오는 중…</div>`;
    setTimeout(() => this.fillCredits(), 0);
    return h;
  }

  render_map() {
    const g = this.g, s = g.state;
    let h = `<div class="worldmap"><canvas id="worldMapCanvas"></canvas>
      <div class="legend">${MAP_LEGEND.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div></div>`;
    h += '<h3>🌐 하늘섬 이동</h3><div class="note">해금된 섬과 내 집 사이를 자유롭게 이동할 수 있어요. 각 섬의 수호자를 쓰러뜨리면 다음 섬이 열립니다. [M] 지도 열기/닫기</div><div class="maplist">';
    h += `<button class="mapbtn home ${g.mapId === 'home' ? 'cur' : ''}" data-do="travel" data-arg="home">🏠 <b>내 집 · 하늘 정원</b><small>가구 제작/배치 · NPC (강화·정령·상점)</small></button>`;
    D.ISLANDS.forEach((isl, i) => {
      const open = i < s.unlocked;
      const sp = isl.spirits.map((e) => (s.spirits[e] ? D.ELEMENTS[e].icon : '❔')).join(' ');
      h += `<button class="mapbtn ${open ? '' : 'locked'} ${g.mapId === i ? 'cur' : ''}" ${open ? `data-do="travel" data-arg="${i}"` : ''}>
        ${open ? '🏝️' : '🔒'} <b>${i + 1}. ${isl.name}</b><small>${isl.desc}${sp ? ' · 정령 ' + sp : ''}${s.eliteDown[i] ? ' · ✅수호자 처치' : ''}${i === 3 && s.bossKills ? ` · 🏆${s.bossKills}` : ''}</small></button>`;
    });
    return h + '</div>';
  }

  async fillCredits() {
    const el = document.getElementById('creditList'); if (!el) return;
    try {
      const list = await (await fetch('./assets/models/CREDITS.json')).json();
      el.innerHTML = list.map((c) => `• ${c.file.split('/').slice(-2).join('/')} — ${c.author} · ${c.license}`).join('<br>')
        + '<br>• Lucide Icons — ISC · three.js Sky.js / UnrealBloomPass — MIT';
    } catch (e) { el.textContent = 'CREDITS.json 을 읽지 못했습니다'; }
  }

  // ---------------- 버튼 처리 ----------------
  handle(act, arg) {
    const g = this.g;
    switch (act) {
      case 'equip': g.equipSpirit(arg); break;
      case 'hero': g.selectHero(arg).then(() => this.refreshAll()); break;
      case 'heroPrev': g.cycleHero(-1).then(() => this.refreshAll()); break;
      case 'heroNext': g.cycleHero(1).then(() => this.refreshAll()); break;
      case 'panel': this.openPanel(arg); return;
      case 'dye': g.setDye(arg); break;
      case 'part': { const [slot, v] = arg.split(':'); g.setPart(slot, v); break; }
      case 'enh': {
        const ok = g.enhance(arg);
        this.dirty = true; this.renderPanel();
        const r = document.getElementById('res_' + arg);
        if (r && ok !== null) { r.textContent = ok ? `✨ 강화 성공! +${g.state.gear[arg]}` : '💥 강화 실패…'; r.className = 'res ' + (ok ? 'ok' : 'fail'); }
        return;
      }
      case 'travel': g.travel(arg === 'home' ? 'home' : +arg); return;
      case 'rotModel': g.rotateModel(); break;
      case 'paint': g.togglePaint(); break;
      case 'heroModel': g.state.settings.heroModel = g.state.settings.heroModel === 'cc0' ? 'custom' : 'cc0'; g.save(); g.rebuildHero(); break;
      case 'bloom': g.state.settings.bloom = !g.state.settings.bloom; g.save(); break;
      case 'quality': { const o = ['auto', 'high', 'low']; const s2 = g.state.settings; s2.quality = o[(o.indexOf(s2.quality) + 1) % 3]; g.save(); window.__quality && window.__quality.reset(); break; }
      case 'fps': g.state.settings.fps = !g.state.settings.fps; g.save(); break;
      case 'reset': if (confirm('정말 저장 데이터를 모두 초기화할까요?')) g.resetSave(); return;
      // 건축 바
      case 'craft': g.craftFurniture(arg); this.renderBuildBar(); break;
      case 'place': g.startPlace(arg); this.renderBuildBar(); break;
      case 'bRot': g.rotateGhost(); break;
      case 'bOk': g.confirmPlace(); break;
      case 'bCancel': g.clearGhost(); this.renderBuildBar(); break;
      case 'bStore': g.storeGhost(); break;
      case 'bExit': g.toggleBuild(false); break;
    }
    this.dirty = true;
    if (this.panel) this.renderPanel();
  }

  // ---------------- 하우징 건축 바 ----------------
  setBuild(on) {
    this.els.buildBar.classList.toggle('hidden', !on);
    document.body.classList.toggle('building', on);
    if (on) { this.closePanel(); this.renderBuildBar(); this.toast('🔨 건축 모드: 제작 → 배치 → 화면을 탭/클릭해 위치 지정 → ✔'); }
    this.dirty = true;
  }
  renderBuildBar() {
    const g = this.g, s = g.state, b = g.build;
    const inv = s.furnInv;
    let h = '<div class="bItems">';
    for (const t of D.FURN_ORDER) {
      const f = D.FURNITURE[t], n = inv[t] || 0, placed = s.furniture.filter((x) => x.type === t).length;
      h += `<div class="bItem ${b.type === t ? 'sel' : ''}"><div class="bi">${f.icon}</div><div class="bn">${f.name}</div>
        <div class="bd">${f.desc}</div><div class="bd">보유 ${n} · 배치 ${placed}</div>
        <button data-do="craft" data-arg="${t}">제작 ${this.cost(f.cost)}</button>
        <button data-do="place" data-arg="${t}" ${n > 0 ? '' : 'disabled'}>배치</button></div>`;
    }
    h += '</div><div class="bCtrl">';
    if (b.ghost) {
      h += `<button data-do="bRot">⟳ 회전 [R]</button><button data-do="bOk" class="ok">✔ 배치 [Enter]</button>
        ${b.moving >= 0 ? '<button data-do="bStore">📦 보관 [Del]</button>' : ''}<button data-do="bCancel">✖ 취소</button>`;
    } else h += '<span class="hint">가구를 탭/클릭하면 이동 · 회전 · 보관</span>';
    h += '<button data-do="bExit">완료</button></div>';
    this.els.buildBar.innerHTML = h;
    icons();
  }
}
