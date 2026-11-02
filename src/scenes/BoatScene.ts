import { VIEW_H, VIEW_W } from '../core/config';
import type { Game } from '../core/Game';
import { formatMoney } from '../core/math';
import { clearSave } from '../core/SaveSystem';
import type { Scene } from '../core/Scene';
import { createNewState, LOADOUT_SIZE } from '../model/GameState';
import { buyUpgrade, nextUpgrade, toggleLoadout, unlockWeapon, upgradeLevel } from '../model/Progression';
import { drawBoat } from '../render/Sprites';

type Tab = 'result' | 'gear' | 'weapons' | 'codex';

const TABS: { id: Tab; label: string }[] = [
  { id: 'result', label: '물질 결과' },
  { id: 'gear', label: '장비 강화' },
  { id: 'weapons', label: '무기' },
  { id: 'codex', label: '도감' },
];

/**
 * 다이브 사이의 배 위 정비 화면 (인게임 허브).
 * 아웃게임(경영) 콘텐츠는 기획 확정 후 별도 씬으로 추가 예정 — 지금은 귀환 시 자동 정산된 돈으로 장비만 강화한다.
 * Unity: Boat.unity + UI Toolkit 패널.
 */
export class BoatScene implements Scene {
  private tab: Tab = 'result';
  private time = 0;
  private panel: HTMLElement | null = null;
  private fade: HTMLElement | null = null;
  private notice: string | null = null;

  constructor(private readonly game: Game) {}

  enter(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.addEventListener('click', this.onClick);
    this.game.uiRoot.appendChild(panel);
    this.panel = panel;
    this.refresh();
    // 다이브에서 돌아왔으면 암전 상태에서 서서히 밝아진다 (DiveScene 귀환 연출의 후반부)
    if (this.game.lastDiveResult) {
      const fade = document.createElement('div');
      fade.className = 'scene-fade';
      fade.addEventListener('animationend', () => fade.remove());
      this.game.uiRoot.appendChild(fade);
      this.fade = fade;
    }
  }

  exit(): void {
    this.panel?.removeEventListener('click', this.onClick);
    this.panel?.remove();
    this.panel = null;
    this.fade?.remove();
    this.fade = null;
  }

  update(dt: number): void {
    this.time += dt;
  }

  private readonly onClick = (e: MouseEvent): void => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || el.hasAttribute('disabled')) return;
    const { state, db } = this.game;
    const arg = el.dataset.arg ?? '';
    this.notice = null;
    switch (el.dataset.action) {
      case 'tab':
        this.tab = arg as Tab;
        break;
      case 'upgrade':
        if (buyUpgrade(state, db, arg)) this.notice = '강화 완료!';
        break;
      case 'unlock':
        if (unlockWeapon(state, db, arg)) this.notice = `${db.weapon(arg).name} 구입!`;
        break;
      case 'equip':
        toggleLoadout(state, arg);
        break;
      case 'depart':
        this.game.lastDiveResult = null;
        this.game.save();
        this.game.loadScene('dive');
        return;
      case 'reset':
        if (!window.confirm('모든 진행 상황을 초기화할까요?')) return;
        clearSave();
        this.game.state = createNewState(db);
        this.game.lastDiveResult = null;
        this.tab = 'result';
        break;
    }
    this.game.save();
    this.refresh();
  };

  private refresh(): void {
    if (!this.panel) return;
    const { state } = this.game;
    this.panel.innerHTML = `
      <header class="panel-header">
        <div><span class="logo">숨비</span><span class="sub">${state.day}일차 · 배 위에서 정비 중</span></div>
        <div class="money" title="아웃게임 확정 전까지 수확물은 귀환 시 자동 정산됩니다">${formatMoney(state.money)}</div>
      </header>
      <nav class="tabs">
        ${TABS.map((t) => `<button class="tab ${t.id === this.tab ? 'active' : ''}" data-action="tab" data-arg="${t.id}">${t.label}</button>`).join('')}
      </nav>
      ${this.notice ? `<div class="notice">${this.notice}</div>` : ''}
      <section class="tab-body">${this.renderTab()}</section>
      <footer class="panel-footer">
        <button class="btn ghost small" data-action="reset">데이터 초기화</button>
        <span class="spacer"></span>
        <span class="stat-line">최고 수심 ${state.bestDepthM}m · 총 ${state.totalDives}회</span>
        <button class="btn primary" data-action="depart">물질 나가기 ▶</button>
      </footer>`;
  }

  private renderTab(): string {
    switch (this.tab) {
      case 'result':
        return this.renderResult();
      case 'gear':
        return this.renderGear();
      case 'weapons':
        return this.renderWeapons();
      case 'codex':
        return this.renderCodex();
    }
  }

  private spriteImg(id: string, cls = 'icon'): string {
    return `<img class="${cls}" src="${import.meta.env.BASE_URL}${this.game.db.sprites.basePath}${id}.png" alt="" onerror="this.remove()">`;
  }

  private renderResult(): string {
    const r = this.game.lastDiveResult;
    const db = this.game.db;
    if (!r) {
      return `
        <h2>물마루섬의 바다</h2>
        <p>할머니에게 배와 망사리를 물려받은 초보 잠수부 <b>해솔</b>. 섬 앞바다의 해구는 들어갈 때마다 모습이 바뀐다.</p>
        <ul class="tips">
          <li>깊이 내려갈수록 <b>산소가 빨리 닳고</b>, 더 강한 생물과 ★정예 개체가 나타난다.</li>
          <li>잠수복 한계 수심을 넘으면 수압으로 산소가 급격히 줄어든다 — <b>물숨</b>을 조심하자.</li>
          <li>산소가 바닥나면 기절해 구조되지만 그날의 수확물은 모두 잃는다.</li>
          <li>수면에 올라오면 숨을 고를 수 있고, <b>배</b>에 올라야 수확물이 정산된다.</li>
          <li>보급 상자에는 산소통·탄약·보물이 들어 있다.</li>
        </ul>`;
    }
    const modifier = db.modifiers.find((m) => m.id === r.modifierId);
    const rows = Object.entries(r.items)
      .map(([id, n]) => ({ c: db.catchable(id), n }))
      .sort((a, b) => b.c.value * b.n - a.c.value * a.n)
      .map(({ c, n }) => `<li><span>${c.name}</span><span>×${n}</span></li>`)
      .join('');
    const discoveries = r.newDiscoveries.map((id) => `<span class="chip">${db.catchable(id).name}</span>`).join('');
    return `
      <h2 class="${r.success ? 'ok' : 'fail'}">${r.success ? '무사히 귀환했다!' : '의식을 잃고 구조되었다…'}</h2>
      <div class="kv">
        <div><span>오늘의 바다</span><b>${modifier?.name ?? '-'}</b></div>
        <div><span>최대 수심</span><b>${Math.floor(r.maxDepthM)} m</b></div>
        <div><span>사냥</span><b>${r.kills}마리${r.eliteCatches ? ` (★${r.eliteCatches})` : ''}</b></div>
        <div><span>${r.success ? '정산 금액' : '잃은 수확물 가치'}</span><b>${formatMoney(r.success ? r.totalValue : r.lostValue)}</b></div>
      </div>
      ${rows ? `<ul class="list">${rows}</ul>` : r.success ? '<p class="muted">빈 망사리로 돌아왔다.</p>' : ''}
      ${discoveries ? `<h3>새로 발견</h3><div class="chips">${discoveries}</div>` : ''}
      <p class="muted small">※ 경영(아웃게임) 콘텐츠가 확정되기 전까지 수확물은 귀환 시 감정가로 자동 정산됩니다.</p>`;
  }

  private renderGear(): string {
    const { state, db } = this.game;
    return `<div class="cards">${db.upgrades
      .map((u) => {
        const lv = upgradeLevel(state, u);
        const cur = u.levels[lv].value;
        const next = nextUpgrade(state, u);
        const fmt = (v: number) => `${v}${u.unit}`;
        const btn = next
          ? `<button class="btn" data-action="upgrade" data-arg="${u.id}" ${state.money < next.cost ? 'disabled' : ''}>강화 ${formatMoney(next.cost)}</button>`
          : '<span class="max">MAX</span>';
        return `<div class="card">
          <div class="card-title">${u.name} <span class="lv">Lv ${lv + 1}/${u.levels.length}</span></div>
          <div class="muted small">${u.description}</div>
          <div class="value">${fmt(cur)}${next ? ` → <b>${fmt(next.value)}</b>` : ''}</div>
          ${btn}
        </div>`;
      })
      .join('')}</div>`;
  }

  private renderWeapons(): string {
    const { state, db } = this.game;
    return `<p class="muted small">최대 ${LOADOUT_SIZE}개 장착 · 다이브 중 1/2 또는 Q·휠로 전환 · 제한 탄약은 다이브마다 가득 채워진다</p>
      <div class="cards">${db.weapons
        .map((w) => {
          const owned = state.unlockedWeapons.includes(w.id);
          const equipped = state.loadout.includes(w.id);
          const stats = [`피해 ${w.damage || '-'}`, `재장전 ${w.reload}s`, `사거리 ${w.rangeM}m`, `탄약 ${w.ammo < 0 ? '∞' : w.ammo}`].join(' · ');
          const btn = !owned
            ? `<button class="btn" data-action="unlock" data-arg="${w.id}" ${state.money < w.cost ? 'disabled' : ''}>구입 ${formatMoney(w.cost)}</button>`
            : `<button class="btn ${equipped ? 'equipped' : ''}" data-action="equip" data-arg="${w.id}">${equipped ? '장착 중' : '장착'}</button>`;
          return `<div class="card ${equipped ? 'selected' : ''}">
            <div class="card-title">${this.spriteImg(`weapon_${w.id}`)}${w.name}</div>
            <div class="muted small">${w.description}</div>
            <div class="small">${stats}</div>
            ${btn}
          </div>`;
        })
        .join('')}</div>`;
  }

  private renderCodex(): string {
    const { state, db } = this.game;
    const fishFound = db.fish.filter((f) => state.codex[f.id]).length;
    const itemFound = db.items.filter((i) => state.codex[i.id]).length;
    const zones = db.zones
      .map((z) => {
        const list = db.fish.filter((f) => f.depthMin < z.depthMax && f.depthMax >= z.depthMin && f.depthMin >= z.depthMin);
        if (list.length === 0) return '';
        return `<h3>${z.name} <span class="muted small">${z.depthMin}–${z.depthMax}m</span></h3>
          <div class="codex">${list
            .map((f) => {
              const entry = state.codex[f.id];
              if (!entry) return `<div class="codex-card unknown"><div class="swatch"></div><b>???</b><span class="small muted">${f.depthMin}m~</span></div>`;
              const hostile = f.behavior === 'aggressive' || f.behavior === 'charger';
              return `<div class="codex-card"><div class="swatch" style="background:${f.color}">${this.spriteImg(`fish_${f.id}`, 'codex-img')}</div>
                <b>${f.name}${hostile ? ' <span class="danger">위험</span>' : ''}</b>
                <span class="small muted">${f.depthMin}–${f.depthMax}m · ${f.weight}kg</span>
                <span class="small">포획 ${entry.caught} · ${formatMoney(f.value)}</span></div>`;
            })
            .join('')}</div>`;
      })
      .join('');
    const items = db.items
      .map((i) => {
        const entry = state.codex[i.id];
        if (!entry) return `<div class="codex-card unknown"><div class="swatch"></div><b>???</b><span class="small muted">${i.depthMin}m~</span></div>`;
        return `<div class="codex-card"><div class="swatch" style="background:${i.color}">${this.spriteImg(`item_${i.id}`, 'codex-img')}</div>
          <b>${i.name}</b><span class="small muted">${i.depthMin}–${i.depthMax}m</span><span class="small">채집 ${entry.caught} · ${formatMoney(i.value)}</span></div>`;
      })
      .join('');
    return `<p class="muted small">바다 생물 ${fishFound}/${db.fish.length} · 채집물 ${itemFound}/${db.items.length}</p>
      ${zones}<h3>채집물</h3><div class="codex">${items}</div>`;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const t = this.time;
    const horizon = VIEW_H * 0.58;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#5aa9da');
    sky.addColorStop(1, '#ffdcae');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, horizon);

    const sunX = VIEW_W * 0.2;
    const sunY = horizon - 80;
    const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 120);
    glow.addColorStop(0, 'rgba(255,245,210,0.9)');
    glow.addColorStop(1, 'rgba(255,245,210,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 120, sunY - 120, 240, 240);
    ctx.fillStyle = '#fff4cf';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();

    // 섬 실루엣
    ctx.fillStyle = 'rgba(58,92,108,0.6)';
    ctx.beginPath();
    ctx.moveTo(-20, horizon);
    ctx.quadraticCurveTo(VIEW_W * 0.2, horizon - 40, VIEW_W * 0.38, horizon - 105);
    ctx.quadraticCurveTo(VIEW_W * 0.46, horizon - 118, VIEW_W * 0.54, horizon - 100);
    ctx.quadraticCurveTo(VIEW_W * 0.75, horizon - 35, VIEW_W + 20, horizon);
    ctx.closePath();
    ctx.fill();

    const sea = ctx.createLinearGradient(0, horizon, 0, VIEW_H);
    sea.addColorStop(0, '#4aa3c8');
    sea.addColorStop(1, '#0b3f63');
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, VIEW_W, VIEW_H - horizon);
    ctx.strokeStyle = 'rgba(255,240,200,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const y = horizon + 8 + i * 9;
      const w = 70 - i * 6 + Math.sin(t * 2 + i) * 8;
      ctx.beginPath();
      ctx.moveTo(sunX - w / 2, y);
      ctx.lineTo(sunX + w / 2, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    for (let row = 0; row < 6; row++) {
      const y = horizon + 30 + row * 34;
      ctx.beginPath();
      for (let x = 0; x <= VIEW_W; x += 16) {
        const yy = y + Math.sin(x * 0.03 + t * 1.5 + row) * 3;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    drawBoat(ctx, this.game.sprites, VIEW_W * 0.2, horizon + 95, t, 1.7);
  }
}
