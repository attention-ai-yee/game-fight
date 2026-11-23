/**
 * 浏览器原型：把战斗核心（Battle）画出来，并把事件变成特效。
 * 只负责"演"：胜负、伤害、连锁全部由 core 决定。
 */
import { Battle, STEP } from '../client/assets/scripts/core/battle/Battle';
import { BattleConfig, DEFAULT_CONFIG } from '../client/assets/scripts/core/battle/config';
import { BattleEvent, Enemy, HERO_MARK, MARKS, MarkKind } from '../client/assets/scripts/core/battle/types';
import { Sfx } from './audio';
import * as D from './draw';
import { H, Layout, LayoutKind, makeLayout, Projected, W } from './layout';

/** 伤害显示倍数：逻辑里的小数字放大十倍显示，看着更爽。 */
const DISPLAY = 10;
/** 连锁到第几跳触发高光全屏（设计文档 2.4）。 */
export const HIGHLIGHT_HOPS = 15;

interface Txt { x: number; y: number; vy: number; life: number; max: number; s: string; size: number; color: string; big?: boolean }
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; w: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Corpse { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number; r: number; color: string; elite: boolean }
interface Line { x0: number; y0: number; x1: number; y1: number; life: number; max: number; color: string; w: number }
interface Flyer { x: number; y: number; vx: number; vy: number; t: number; delay: number; phase: 'fall' | 'fly' }
interface Banner { s: string; life: number; max: number; color: string }
interface Vis { flash: number; knock: number; kind: string; elite: boolean; size: number; numCd: number }
interface Button { x: number; y: number; w: number; h: number; tap: () => void }

export interface GameOptions {
  layout: LayoutKind;
  seed: number;
  record?: boolean;
  caption?: string;
  cfg?: BattleConfig;
}

export class Game {
  battle: Battle;
  layout: Layout;
  readonly sfx = new Sfx();
  readonly opts: GameOptions;
  started: boolean;
  showHelp: boolean;
  /** 录素材模式：每一步之前调用（用来按计划换人）。 */
  stepHook: ((stepIndex: number) => void) | null = null;
  stepIndex = 0;
  /** 录素材模式：在这个英雄头像上显示点击手势（剩余秒数）。 */
  finger: { hero: number; t: number } | null = null;

  private t = 0;
  private acc = 0;
  private hitstop = 0;
  private shake = 0;
  private texts: Txt[] = [];
  private rings: Ring[] = [];
  private sparks: Spark[] = [];
  private corpses: Corpse[] = [];
  private lines: Line[] = [];
  private flyers: Flyer[] = [];
  private banners: Banner[] = [];
  private vis = new Map<number, Vis>();
  private buttons: Button[] = [];
  private shownGold = 0;
  private coinSound = 0;
  private heroDrop = 0;
  private heroSwing = 0;
  private counter = { hop: 0, pop: 0, alpha: 0, final: false, best: false, gold: 0 };
  private hl = 0;
  private hlTarget = 0;
  private hlHold = 0;
  private focus = { x: W / 2, y: 300 };
  private chests = [0, 0, 0];
  private chestPop: { tier: number; life: number } | null = null;

  constructor(opts: GameOptions) {
    this.opts = opts;
    this.layout = makeLayout(opts.layout);
    this.battle = new Battle(opts.cfg ?? DEFAULT_CONFIG, opts.seed);
    this.started = !!opts.record;
    this.showHelp = !opts.record;
  }

  get cfg(): BattleConfig {
    return this.battle.cfg;
  }

  setLayout(kind: LayoutKind): void {
    this.layout = makeLayout(kind);
    this.clearFx();
  }

  restart(): void {
    this.battle = new Battle(this.cfg, this.opts.seed + Math.floor(Math.random() * 1000));
    this.battle.setAuto(this.autoOn);
    this.chests = [0, 0, 0];
    this.shownGold = 0;
    this.clearFx();
  }

  autoOn = false;

  private clearFx(): void {
    this.texts = [];
    this.rings = [];
    this.sparks = [];
    this.corpses = [];
    this.lines = [];
    this.flyers = [];
    this.vis.clear();
    this.hl = this.hlTarget = 0;
    this.counter.alpha = 0;
  }

  /** 不渲染地快进（录素材时跳过开头）。 */
  fastForward(steps: number): void {
    for (let i = 0; i < steps; i++) {
      this.stepHook?.(this.stepIndex);
      this.battle.step();
      this.stepIndex++;
      this.battle.drainEvents();
    }
    this.shownGold = this.battle.gold;
  }

  // ---------- 输入 ----------

  tap(x: number, y: number): void {
    this.sfx.unlock();
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        b.tap();
        return;
      }
    }
  }

  switchHero(i: number): void {
    if (this.battle.switchTo(i)) this.afterSwitch();
  }

  // ---------- 更新 ----------

  update(dt: number): void {
    this.t += dt;
    if (this.started && !this.showHelp) {
      if (this.hitstop > 0) this.hitstop -= dt;
      else {
        this.acc += dt;
        let n = 0;
        while (this.acc >= STEP && n++ < 6) {
          this.acc -= STEP;
          this.stepHook?.(this.stepIndex);
          this.battle.step();
          this.stepIndex++;
          for (const e of this.battle.drainEvents()) this.onEvent(e);
          if (this.hitstop > 0) {
            this.acc = 0;
            break;
          }
        }
        if (n >= 6) this.acc = 0;
      }
    }
    const fdt = this.hitstop > 0 ? dt * 0.25 : dt;
    this.updateFx(fdt, dt);
  }

  private afterSwitch(): void {
    this.heroDrop = 1;
    this.sfx.swish();
  }

  private p(x: number, y: number): Projected {
    return this.layout.project(x, y);
  }

  private visOf(e: Enemy): Vis {
    let v = this.vis.get(e.id);
    if (!v) {
      v = { flash: 0, knock: 0, kind: e.kind, elite: e.elite, size: e.size, numCd: 0 };
      this.vis.set(e.id, v);
    }
    return v;
  }

  private onEvent(e: BattleEvent): void {
    const b = this.battle;
    const L = this.layout;
    switch (e.t) {
      case 'hit': {
        const en = b.byId(e.id);
        if (!en) return;
        const v = this.visOf(en);
        v.flash = 0.09;
        if (e.src !== 'chain') {
          v.knock = Math.min(10, v.knock + 4);
          if (e.crit && v.numCd <= 0) {
            const pp = this.p(en.x, en.y);
            this.texts.push({ x: pp.sx, y: pp.sy - 16, vy: -40, life: 0.5, max: 0.5, s: String(Math.round(e.dmg * DISPLAY)), size: e.crit ? 15 : 11, color: e.crit ? '#ffe14d' : '#fff' });
            v.numCd = 0.45;
          }
          this.sfx.hit();
        }
        return;
      }
      case 'kill': {
        const v = this.vis.get(e.id);
        const pp = this.p(e.x, e.y);
        const r = 13 * pp.s * (v?.size ?? 1);
        const away = L.kind === 'h' ? 1 : 0;
        const power = e.byChain ? 1.6 : 1;
        this.corpses.push({
          x: pp.sx,
          y: pp.sy,
          vx: (away ? 120 + Math.random() * 140 : (Math.random() - 0.5) * 160) * power,
          vy: (away ? -180 - Math.random() * 120 : -260 - Math.random() * 120) * power,
          rot: 0,
          vr: (Math.random() - 0.5) * 14,
          life: 0.7,
          max: 0.7,
          r,
          color: D.enemyColor(v?.kind ?? 'grunt', v?.elite ?? false),
          elite: v?.elite ?? false,
        });
        const coins = Math.min(3, 1 + Math.floor(e.gold / 4));
        for (let i = 0; i < coins; i++) this.flyers.push({ x: pp.sx, y: pp.sy, vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 80, t: 0, delay: 0.25 + i * 0.05, phase: 'fall' });
        this.vis.delete(e.id);
        return;
      }
      case 'attack': {
        this.heroSwing = 1;
        return;
      }
      case 'freeze': {
        const en = b.byId(e.id);
        if (!en) return;
        const pp = this.p(en.x, en.y);
        for (let i = 0; i < 6; i++) this.sparks.push({ x: pp.sx, y: pp.sy, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.4, max: 0.4, color: '#bff0ff', size: 2.5 });
        return;
      }
      case 'switch':
        return;
      case 'chainStart': {
        this.hitstop = 0.08;
        this.counter = { hop: 0, pop: 0, alpha: 1, final: false, best: false, gold: 0 };
        const pp = this.p(e.x, e.y);
        this.focus = { x: pp.sx, y: pp.sy };
        this.rings.push({ x: pp.sx, y: pp.sy, r0: 4, r1: 60, life: 0.35, max: 0.35, color: '#fff', w: 4 });
        this.sfx.start();
        return;
      }
      case 'explode': {
        const pp = this.p(e.x, e.y);
        const rr = e.r * L.unit * pp.s;
        const col = e.marks.burn > 0 ? D.MARK_COLOR.burn : e.marks.frost > 0 ? D.MARK_COLOR.frost : '#e8e2c8';
        this.rings.push({ x: pp.sx, y: pp.sy, r0: rr * 0.25, r1: rr, life: 0.32, max: 0.32, color: col, w: 5 });
        this.rings.push({ x: pp.sx, y: pp.sy, r0: 2, r1: rr * 0.55, life: 0.16, max: 0.16, color: '#fff7c8', w: 10 });
        const n = 6 + Math.min(14, e.hop);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 80 + Math.random() * 200;
          this.sparks.push({ x: pp.sx, y: pp.sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.45, max: 0.45, color: Math.random() < 0.5 ? col : '#ffe14d', size: 2 + Math.random() * 2.5 });
        }
        for (const s of e.shards) {
          const q = this.p(s.x, s.y);
          this.lines.push({ x0: pp.sx, y0: pp.sy, x1: q.sx, y1: q.sy, life: 0.25, max: 0.25, color: D.MARK_COLOR.frost, w: 4 });
        }
        if (e.pulled) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const R = 125 * L.unit;
            this.lines.push({ x0: pp.sx + Math.cos(a) * R, y0: pp.sy + Math.sin(a) * R * 0.6, x1: pp.sx + Math.cos(a) * R * 0.35, y1: pp.sy + Math.sin(a) * R * 0.2, life: 0.22, max: 0.22, color: '#e8e2c8', w: 3 });
          }
        }
        if (e.hop <= 10 || e.hop % 3 === 0) this.texts.push({ x: pp.sx, y: pp.sy - 20, vy: -60, life: 0.55, max: 0.55, s: String(Math.round(e.dmg * DISPLAY)), size: 12 + Math.min(10, e.hop * 0.3), color: D.C.orange });
        this.counter.hop = e.hop;
        this.counter.pop = 1;
        this.counter.alpha = 1;
        this.shake = Math.min(10, this.shake + 1.2 + Math.min(40, e.hop) * 0.08);
        this.focus.x += (pp.sx - this.focus.x) * 0.25;
        this.focus.y += (pp.sy - this.focus.y) * 0.25;
        if (e.hop >= HIGHLIGHT_HOPS) {
          this.hlTarget = 1;
          this.hlHold = 99;
        }
        this.sfx.hop(e.hop);
        return;
      }
      case 'chainEnd': {
        this.counter.final = true;
        this.counter.gold = e.gold;
        this.counter.best = e.hops >= 5 && e.hops >= b.bestChain && b.bestChain > 0 && e.hops > this.prevBest;
        this.prevBest = b.bestChain;
        this.counter.alpha = 1;
        this.counter.pop = 1;
        if (e.hops >= HIGHLIGHT_HOPS) this.hitstop = 0.12;
        if (this.hlTarget > 0) this.hlHold = 0.7;
        const rain = Math.min(30, 4 + e.hops);
        const bt = L.battle;
        for (let i = 0; i < rain; i++) this.flyers.push({ x: bt.x + 30 + Math.random() * (bt.w - 60), y: bt.y - 10 - Math.random() * 60, vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 120, t: 0, delay: 0.5 + Math.random() * 0.5, phase: 'fall' });
        if (e.chest > 0) {
          this.chests[e.chest - 1]++;
          this.chestPop = { tier: e.chest, life: 1.6 };
        }
        if (e.hops >= 3) this.sfx.finish(e.hops);
        return;
      }
      case 'stageClear':
        this.banners.push({ s: `第 ${e.stage} 关 通过！`, life: 1.4, max: 1.4, color: D.C.gold });
        return;
      case 'wallBroken':
        this.banners.push({ s: `城墙被打穿了！退回第 ${b.stage} 关`, life: 2, max: 2, color: '#ff6b6b' });
        this.shake = 12;
        this.sfx.bad();
        this.clearFxKeepBanners();
        return;
      case 'waveStart':
        if (e.wave === b.cfg.stage.waves) this.banners.push({ s: '最后一波：精英来了', life: 1.2, max: 1.2, color: '#fff' });
        return;
      default:
        return;
    }
  }

  private prevBest = 0;

  private clearFxKeepBanners(): void {
    const keep = this.banners;
    this.clearFx();
    this.banners = keep;
  }

  private updateFx(dt: number, realDt: number): void {
    const step = <T extends { life: number }>(arr: T[]) => {
      for (const o of arr) o.life -= dt;
      return arr.filter((o) => o.life > 0);
    };
    for (const v of this.vis.values()) {
      v.flash = Math.max(0, v.flash - dt);
      v.knock *= Math.pow(0.002, dt);
      v.numCd -= dt;
    }
    for (const o of this.texts) o.y += o.vy * dt;
    this.texts = step(this.texts);
    this.rings = step(this.rings);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 400 * dt;
      s.vx *= Math.pow(0.1, dt);
    }
    this.sparks = step(this.sparks);
    for (const c of this.corpses) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 900 * dt;
      c.rot += c.vr * dt;
    }
    this.corpses = step(this.corpses);
    this.lines = step(this.lines);
    this.banners = step(this.banners);
    // 金币：先弹一下，再飞向顶栏
    const target = this.goldIconPos();
    const keep: Flyer[] = [];
    for (const f of this.flyers) {
      f.t += dt;
      if (f.t < f.delay) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += (f.phase === 'fall' ? 300 : 0) * dt;
        keep.push(f);
        continue;
      }
      f.phase = 'fly';
      const dx = target.x - f.x;
      const dy = target.y - f.y;
      const d = Math.hypot(dx, dy);
      const sp = 500 + (f.t - f.delay) * 1400;
      if (d < sp * dt + 4) {
        if (this.coinSound++ % 3 === 0) this.sfx.coin();
        continue;
      }
      f.x += (dx / d) * sp * dt;
      f.y += (dy / d) * sp * dt;
      keep.push(f);
    }
    this.flyers = keep;
    this.shownGold += (this.battle.gold - this.shownGold) * Math.min(1, realDt * 6);
    this.shake = Math.max(0, this.shake - realDt * 18);
    this.heroDrop = Math.max(0, this.heroDrop - realDt * 4);
    this.heroSwing = Math.max(0, this.heroSwing - realDt * 5);
    this.counter.pop = Math.max(0, this.counter.pop - realDt * 6);
    if (this.counter.final) this.counter.alpha = Math.max(0, this.counter.alpha - realDt * 0.7);
    if (this.chestPop) {
      this.chestPop.life -= realDt;
      if (this.chestPop.life <= 0) this.chestPop = null;
    }
    if (this.hlHold < 99) {
      this.hlHold -= realDt;
      if (this.hlHold <= 0) this.hlTarget = 0;
    }
    this.hl += (this.hlTarget - this.hl) * Math.min(1, realDt * 7);
    if (this.finger) {
      this.finger.t -= realDt;
      if (this.finger.t <= 0) this.finger = null;
    }
  }

  // ---------- 绘制 ----------

  private goldIconPos(): { x: number; y: number } {
    return { x: 150 + 0, y: 25 - this.hl * 70 };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    this.buttons = [];
    ctx.save();
    ctx.fillStyle = D.C.panel2;
    ctx.fillRect(0, 0, W, H);

    // 镜头：高光时拉近到连锁区域
    const z = 1 + (L.zoom - 1) * this.hl;
    const cx = W / 2;
    const cy = L.kind === 'h' ? 330 : 300;
    const fx = Math.max(L.kind === 'h' ? 110 : 120, Math.min(L.kind === 'h' ? 300 : 255, this.focus.x));
    const fy = Math.max(200, Math.min(L.kind === 'h' ? 330 : 400, this.focus.y));
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save();
    ctx.translate(sx + (cx - fx * z) * this.hl, sy + (cy - fy * z) * this.hl);
    ctx.scale(z, z);
    this.drawWorld(ctx);
    ctx.restore();

    this.drawCounter(ctx);
    this.drawUi(ctx);
    for (const f of this.flyers) D.coin(ctx, f.x, f.y, f.phase === 'fly' ? 5 : 6);
    this.drawOverlays(ctx);
    ctx.restore();
  }

  private drawWorld(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    const b = this.battle;
    if (L.kind === 'h') this.drawBackgroundH(ctx);
    else this.drawBackgroundV(ctx);

    // 地面上的火光
    for (const e of b.enemies) {
      if (!e.alive || e.marks.burn <= 0) continue;
      const pp = this.p(e.x, e.y);
      ctx.fillStyle = `rgba(255,140,40,${0.12 + 0.05 * e.marks.burn + 0.05 * Math.sin(this.t * 12 + e.id)})`;
      ctx.beginPath();
      ctx.ellipse(pp.sx, pp.sy + 9 * pp.s, 16 * pp.s, 6 * pp.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 按深度画：怪 + 英雄
    type Item = { sy: number; draw: () => void };
    const items: Item[] = [];
    for (const e of b.enemies) {
      if (!e.alive) continue;
      const v = this.visOf(e);
      const pp = this.p(e.x + v.knock, e.y);
      const r = 13 * pp.s * e.size;
      const moving = !e.atWall && e.frozen <= 0;
      const bobY = moving ? -Math.abs(Math.sin(this.t * 9 + e.id)) * 2.5 : 0;
      const squash = e.atWall && e.frozen <= 0 ? Math.max(0, Math.sin(this.t * 10 + e.id)) * 0.12 : 0;
      items.push({
        sy: pp.sy,
        draw: () => {
          D.enemy(ctx, pp.sx, pp.sy + bobY, r, D.enemyColor(e.kind, e.elite), { flash: v.flash, frozen: e.frozen > 0, elite: e.elite, squash, facing: L.kind === 'h' ? -1 : 0 });
          let k = 0;
          const marks = MARKS.filter((m) => e.marks[m] > 0);
          for (const m of marks) {
            const ox = (k - (marks.length - 1) / 2) * 12 * pp.s;
            D.markIcon(ctx, m, pp.sx + ox, pp.sy + bobY - r - 9 * pp.s, (0.42 + 0.07 * e.marks[m]) * pp.s);
            k++;
          }
          if (e.elite || e.kind === 'tank') {
            const w = r * 2;
            ctx.fillStyle = D.C.ink;
            ctx.fillRect(pp.sx - w / 2, pp.sy + r + 3, w, 4);
            ctx.fillStyle = '#ff5a4f';
            ctx.fillRect(pp.sx - w / 2 + 1, pp.sy + r + 4, (w - 2) * Math.max(0, e.hp / e.maxHp), 2);
          }
        },
      });
    }
    const hp = this.p(b.cfg.heroX, b.cfg.heroY);
    items.push({
      sy: hp.sy,
      draw: () => {
        D.hero(ctx, b.activeHero, hp.sx, hp.sy, hp.s, { t: this.t, drop: this.easeDrop(), swing: this.heroSwing, back: L.kind === 'v' });
        if (b.activeHero === 'sword' && this.heroSwing > 0.3) this.drawSlash(ctx, hp);
      },
    });
    items.sort((a, c) => a.sy - c.sy);
    for (const it of items) it.draw();

    // 弹道
    for (const pr of b.projectiles) {
      const pp = this.p(pr.x, pr.y);
      if (pr.hero === 'mage') {
        ctx.fillStyle = 'rgba(255,138,31,.45)';
        ctx.beginPath();
        ctx.arc(pp.sx, pp.sy - 14, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = D.C.orange;
        ctx.beginPath();
        ctx.arc(pp.sx, pp.sy - 14, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.arc(pp.sx, pp.sy - 15, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const q = this.p(pr.x - 40, pr.y);
        ctx.strokeStyle = 'rgba(190,240,255,.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(q.sx, q.sy - 12);
        ctx.lineTo(pp.sx, pp.sy - 12);
        ctx.stroke();
        ctx.strokeStyle = '#2a6a8a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 特效
    for (const c of this.corpses) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life / c.max);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      D.enemy(ctx, 0, 0, c.r, c.color, { elite: c.elite, facing: -1 });
      ctx.restore();
    }
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = Math.max(0, r.life / r.max);
      ctx.lineWidth = r.w * (1 - k * 0.6);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, (r.r0 + (r.r1 - r.r0) * k) * (L.kind === 'h' ? 0.62 : 0.8), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const l of this.lines) {
      ctx.globalAlpha = Math.max(0, l.life / l.max);
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(l.x0, l.y0 - 8);
      ctx.lineTo(l.x1, l.y1 - 8);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.max(0, s.life / s.max);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    ctx.globalAlpha = 1;
    for (const tx of this.texts) {
      ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 2);
      D.text(ctx, tx.s, tx.x, tx.y, tx.size, tx.color, { sw: Math.max(2.5, tx.size / 5) });
    }
    ctx.globalAlpha = 1;
  }

  private easeDrop(): number {
    const d = this.heroDrop;
    return d * d;
  }

  private drawSlash(ctx: CanvasRenderingContext2D, hp: Projected): void {
    const L = this.layout;
    const a = this.heroSwing;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6 * a;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (L.kind === 'h') ctx.ellipse(hp.sx + 40, hp.sy - 4, 80, 70, 0, -1.2, 1.2);
    else ctx.ellipse(hp.sx, hp.sy - 50, 90, 70, 0, Math.PI + 0.5, Math.PI * 2 - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  private drawBackgroundH(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, -300, 0, 230);
    g.addColorStop(0, '#5fb0ef');
    g.addColorStop(1, D.C.sky2);
    ctx.fillStyle = g;
    ctx.fillRect(-400, -400, W + 800, 640);
    ctx.fillStyle = '#fff4b0';
    ctx.beginPath();
    ctx.arc(300, 100, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9fd88f';
    ctx.beginPath();
    ctx.ellipse(90, 232, 170, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8acb7b';
    ctx.beginPath();
    ctx.ellipse(310, 236, 190, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = D.C.grass;
    ctx.fillRect(-400, 226, W + 800, 700);
    ctx.fillStyle = D.C.road;
    ctx.beginPath();
    ctx.moveTo(-400, 248);
    ctx.lineTo(W + 400, 244);
    ctx.lineTo(W + 400, 362);
    ctx.lineTo(-400, 360);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = D.C.roadEdge;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-400, 248);
    ctx.lineTo(W + 400, 244);
    ctx.moveTo(-400, 360);
    ctx.lineTo(W + 400, 362);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = 'rgba(201,168,116,.35)';
      ctx.beginPath();
      ctx.ellipse(60 + i * 48, 300 + (i % 2) * 30, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 城墙（往左延伸成城堡）
    const b = this.battle;
    const top = 150;
    const bottom = 362;
    ctx.fillStyle = '#a39b8c';
    ctx.fillRect(-400, top + 20, 400, bottom - top);
    ctx.fillStyle = '#b9b2a3';
    ctx.strokeStyle = D.C.ink;
    ctx.lineWidth = 2;
    ctx.fillRect(0, top, 42, bottom - top);
    ctx.strokeRect(0, top, 42, bottom - top);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(2 + i * 14, top - 10, 9, 12);
      ctx.strokeRect(2 + i * 14, top - 10, 9, 12);
    }
    ctx.strokeStyle = '#958d7e';
    ctx.lineWidth = 1.5;
    for (let y = top + 16; y < bottom - 4; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(42, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#5a4636';
    ctx.strokeStyle = D.C.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, bottom);
    ctx.lineTo(8, bottom - 34);
    ctx.quadraticCurveTo(21, bottom - 50, 34, bottom - 34);
    ctx.lineTo(34, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 城墙血条
    const pct = Math.max(0, b.wallHp / b.wallMax);
    ctx.fillStyle = D.C.ink;
    ctx.fillRect(-1, top - 26, 44, 7);
    ctx.fillStyle = pct > 0.5 ? '#5fd35f' : pct > 0.25 ? '#ffc93c' : '#ff5a4f';
    ctx.fillRect(1, top - 24, 40 * pct, 3);
    // 城墙被打时的裂纹闪烁
    if (b.enemies.some((e) => e.alive && e.atWall) && Math.sin(this.t * 20) > 0.6) {
      ctx.fillStyle = 'rgba(255,80,60,.18)';
      ctx.fillRect(0, top, 42, bottom - top);
    }
  }

  private drawBackgroundV(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = D.C.grass;
    ctx.fillRect(-400, -400, W + 800, 1200);
    ctx.fillStyle = D.C.road;
    ctx.beginPath();
    ctx.moveTo(120, -400);
    ctx.lineTo(255, -400);
    ctx.lineTo(300, 460);
    ctx.lineTo(75, 460);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = D.C.roadEdge;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(120, -400);
    ctx.lineTo(75, 460);
    ctx.moveTo(255, -400);
    ctx.lineTo(300, 460);
    ctx.stroke();
    for (const [x, y] of [[30, 110], [345, 170], [25, 260], [350, 330], [40, 390], [338, 80]]) {
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.beginPath();
      ctx.ellipse(x, y + 14, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a4a26';
      ctx.fillRect(x - 3, y, 6, 14);
      ctx.fillStyle = '#3f9a4c';
      ctx.strokeStyle = D.C.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y - 4, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const b = this.battle;
    const y0 = 452;
    ctx.fillStyle = '#a39b8c';
    ctx.fillRect(-400, y0 + 16, W + 800, 400);
    ctx.fillStyle = '#b9b2a3';
    ctx.strokeStyle = D.C.ink;
    ctx.lineWidth = 2;
    ctx.fillRect(10, y0, W - 20, 18);
    ctx.strokeRect(10, y0, W - 20, 18);
    for (let x = 14; x < W - 20; x += 22) {
      ctx.fillRect(x, y0 - 8, 12, 10);
      ctx.strokeRect(x, y0 - 8, 12, 10);
    }
    const pct = Math.max(0, b.wallHp / b.wallMax);
    ctx.fillStyle = D.C.ink;
    ctx.fillRect(W - 92, y0 + 3, 78, 9);
    ctx.fillStyle = pct > 0.5 ? '#5fd35f' : pct > 0.25 ? '#ffc93c' : '#ff5a4f';
    ctx.fillRect(W - 90, y0 + 5, 74 * pct, 5);
    if (b.enemies.some((e) => e.alive && e.atWall) && Math.sin(this.t * 20) > 0.6) {
      ctx.fillStyle = 'rgba(255,80,60,.18)';
      ctx.fillRect(10, y0, W - 20, 18);
    }
  }

  private drawCounter(ctx: CanvasRenderingContext2D): void {
    const c = this.counter;
    if (c.alpha <= 0.01 || c.hop <= 0) return;
    const L = this.layout;
    const y = L.battle.y + 60 + this.hl * 70;
    const s = 1 + c.pop * 0.35 + this.hl * 0.35 + (c.final ? 0.15 : 0);
    const heat = Math.min(1, c.hop / 40);
    const col = c.hop >= 30 ? '#ff4d4d' : c.hop >= HIGHLIGHT_HOPS ? D.C.orange : '#ffe14d';
    ctx.save();
    ctx.globalAlpha = c.alpha;
    ctx.translate(W / 2, y);
    ctx.scale(s, s);
    ctx.rotate(-0.06 + (c.pop > 0 ? (Math.random() - 0.5) * 0.06 * heat : 0));
    D.text(ctx, `连锁 ×${c.hop}`, 0, 0, 30, col, { stroke: '#3a1a10', sw: 6 });
    if (c.final) {
      D.text(ctx, `+${c.gold} 金币`, 0, 34, 15, '#fff', { stroke: '#3a1a10', sw: 4 });
      if (c.best) D.text(ctx, '新纪录！', 0, -32, 16, '#ff6bd6', { stroke: '#3a1a10', sw: 4 });
    }
    ctx.restore();
  }

  private drawUi(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    const b = this.battle;
    const slide = this.hl;
    // 顶栏
    ctx.save();
    ctx.translate(0, -slide * 70);
    ctx.fillStyle = D.C.panel;
    ctx.fillRect(0, 0, W, 50);
    D.rr(ctx, 10, 12, 116, 26, 13);
    ctx.fillStyle = '#3e4366';
    ctx.fill();
    D.text(ctx, `第${b.stage}关 · ${Math.max(1, b.wave)}/${b.cfg.stage.waves}波`, 68, 25, 13, '#fff', { stroke: null });
    D.coin(ctx, 150, 25, 9);
    D.text(ctx, String(Math.round(this.shownGold)), 162, 26, 15, D.C.gold, { stroke: null, align: 'left' });
    D.text(ctx, `最长 ×${b.bestChain}`, 362, 26, 14, '#fff', { stroke: null, align: 'right' });
    ctx.restore();

    // 英雄栏
    ctx.save();
    ctx.translate(0, slide * 320);
    const hb = L.heroBar;
    ctx.fillStyle = D.C.panel;
    ctx.fillRect(0, hb.y, W, H - hb.y);
    ctx.fillStyle = '#141626';
    ctx.fillRect(0, hb.y, W, 3);
    const cd = b.switchCooldown / b.cfg.switchCooldown;
    b.heroes.forEach((h, i) => {
      const x = 42 + i * 60;
      const y = hb.y + 38;
      const active = i === b.active;
      const n = active ? 0 : b.detonatable(i);
      const glow = !active && n >= b.cfg.glowCount ? 1 : 0;
      D.portrait(ctx, h.kind, x, y, 23, { active, cd: active ? 0 : cd, glow, t: this.t });
      if (active) {
        D.rr(ctx, x - 17, y - 35, 34, 15, 7.5);
        ctx.fillStyle = D.C.gold;
        ctx.fill();
        D.text(ctx, '场上', x, y - 27.5, 10, D.C.ink, { stroke: null });
      } else if (n > 0) {
        D.rr(ctx, x - 22, y - 37, 44, 16, 8);
        ctx.fillStyle = glow ? D.C.gold : 'rgba(255,255,255,.15)';
        ctx.fill();
        D.text(ctx, `引爆${n}`, x, y - 29, 10, glow ? D.C.ink : '#dfe2f5', { stroke: null });
      }
      D.text(ctx, D.HERO_NAME[h.kind], x, y + 31, 10, active ? D.C.gold : '#9ea3c7', { stroke: null });
      if (!active) this.buttons.push({ x: x - 28, y: y - 30, w: 56, h: 64, tap: () => this.switchHero(i) });
    });
    // 城墙状态 + 印记说明
    const pct = Math.max(0, b.wallHp / b.wallMax);
    D.text(ctx, '城墙', 214, hb.y + 22, 12, '#9ea3c7', { stroke: null, align: 'left' });
    D.rr(ctx, 246, hb.y + 16, 110, 12, 6);
    ctx.fillStyle = '#141626';
    ctx.fill();
    D.rr(ctx, 248, hb.y + 18, 106 * pct, 8, 4);
    ctx.fillStyle = pct > 0.5 ? '#5fd35f' : pct > 0.25 ? '#ffc93c' : '#ff5a4f';
    ctx.fill();
    const mk = HERO_MARK[b.activeHero];
    D.markIcon(ctx, mk, 222, hb.y + 50, 0.85);
    D.text(ctx, `${D.HERO_NAME[b.activeHero]}在挂「${D.MARK_NAME[mk]}」`, 234, hb.y + 50, 12, '#dfe2f5', { stroke: null, align: 'left' });
    D.text(ctx, b.chain.active ? '连锁中……' : '怪越挤，连锁越长', 214, hb.y + 70, 11, '#9ea3c7', { stroke: null, align: 'left' });

    this.drawGrowth(ctx);
    this.drawNav(ctx);
    ctx.restore();
  }

  private drawGrowth(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    const b = this.battle;
    const g = L.growth;
    ctx.fillStyle = D.C.cream;
    ctx.fillRect(0, g.y, W, g.h);
    const upgrades: { kind: 'atk' | 'wall'; name: string; lv: number; d: string }[] = [
      { kind: 'atk', name: '攻击', lv: b.atkLevel, d: '+12%' },
      { kind: 'wall', name: '城墙', lv: b.wallLevel, d: '+15%' },
    ];
    if (L.kind === 'h') {
      D.text(ctx, `本次 ×${b.lastChain}`, 16, g.y + 22, 14, D.C.ink, { stroke: null, align: 'left' });
      D.text(ctx, `最长 ×${b.bestChain}`, 100, g.y + 22, 14, D.C.orange, { stroke: '#fff', sw: 3, align: 'left' });
      const labels = ['木', '银', '金'];
      for (let i = 0; i < 3; i++) {
        D.chest(ctx, 222 + i * 50, g.y + 22, 0.55, i + 1);
        D.text(ctx, `${labels[i]}×${this.chests[i]}`, 240 + i * 50, g.y + 30, 10, D.C.ink, { stroke: '#fff', sw: 3, align: 'left' });
      }
      upgrades.forEach((u, i) => {
        const y = g.y + 44 + i * 46;
        const cost = b.upgradeCost(u.kind);
        const ok = b.gold >= cost;
        D.rr(ctx, 10, y, W - 20, 40, 10);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = '#e0d9cb';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        D.text(ctx, u.name, 26, y + 20, 15, D.C.ink, { stroke: null, align: 'left' });
        D.text(ctx, `Lv.${u.lv}`, 68, y + 20, 12, '#8a8296', { stroke: null, align: 'left' });
        D.text(ctx, `${u.d}/级`, 112, y + 20, 12, '#3f9a4c', { stroke: null, align: 'left' });
        D.rr(ctx, 252, y + 6, 108, 28, 14);
        ctx.fillStyle = ok ? D.C.gold : '#e2ddd2';
        ctx.fill();
        D.coin(ctx, 272, y + 20, 6.5);
        D.text(ctx, String(cost), 284, y + 21, 14, ok ? D.C.ink : '#a49c8c', { stroke: null, align: 'left' });
        this.buttons.push({ x: 252, y: y + 2, w: 108, h: 36, tap: () => this.buy(u.kind) });
      });
      D.text(ctx, '符文宝箱：M1 再做，现在先记数', W / 2, g.y + g.h - 6, 10, '#a49c8c', { stroke: null });
    } else {
      upgrades.forEach((u, i) => {
        const x = 10 + i * 182;
        const cost = b.upgradeCost(u.kind);
        const ok = b.gold >= cost;
        D.rr(ctx, x, g.y + 6, 173, 34, 10);
        ctx.fillStyle = ok ? D.C.gold : '#e2ddd2';
        ctx.fill();
        D.text(ctx, `${u.name} Lv.${u.lv}`, x + 12, g.y + 23, 13, D.C.ink, { stroke: null, align: 'left' });
        D.coin(ctx, x + 108, g.y + 23, 6);
        D.text(ctx, String(cost), x + 118, g.y + 24, 13, ok ? D.C.ink : '#a49c8c', { stroke: null, align: 'left' });
        this.buttons.push({ x, y: g.y + 6, w: 173, h: 34, tap: () => this.buy(u.kind) });
      });
    }
  }

  private buy(kind: 'atk' | 'wall'): void {
    if (this.battle.upgrade(kind)) this.sfx.coin();
  }

  /** 底部：原型用的控制按钮；录素材时显示成正式游戏的导航。 */
  private drawNav(ctx: CanvasRenderingContext2D): void {
    const n = this.layout.nav;
    ctx.fillStyle = D.C.panel2;
    ctx.fillRect(0, n.y, W, n.h);
    if (this.opts.record) {
      ['战斗', '英雄', '符文', '宝箱', '更多'].forEach((s, i) => {
        const x = 37.5 + i * 75;
        const col = i === 0 ? D.C.gold : '#9ea3c7';
        ctx.fillStyle = col;
        ctx.globalAlpha = i === 0 ? 1 : 0.7;
        ctx.beginPath();
        ctx.arc(x, n.y + 24, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        D.text(ctx, s, x, n.y + 50, 12, col, { stroke: null });
      });
      return;
    }
    const items: { s: string; on?: boolean; tap: () => void }[] = [
      { s: this.layout.kind === 'h' ? '横版' : '竖向', tap: () => this.setLayout(this.layout.kind === 'h' ? 'v' : 'h') },
      { s: this.autoOn ? '自动:开' : '自动:关', on: this.autoOn, tap: () => this.toggleAuto() },
      { s: this.sfx.enabled ? '声音:开' : '声音:关', on: this.sfx.enabled, tap: () => (this.sfx.enabled = !this.sfx.enabled) },
      { s: '重开', tap: () => this.restart() },
      { s: '说明', tap: () => (this.showHelp = true) },
    ];
    items.forEach((it, i) => {
      const x = 6 + i * 73;
      D.rr(ctx, x, n.y + 12, 67, 40, 10);
      ctx.fillStyle = it.on ? '#3f6f4a' : '#3e4366';
      ctx.fill();
      D.text(ctx, it.s, x + 33.5, n.y + 32, 13, '#fff', { stroke: null });
      this.buttons.push({ x, y: n.y + 8, w: 67, h: 50, tap: it.tap });
    });
  }

  toggleAuto(): void {
    this.autoOn = !this.autoOn;
    this.battle.setAuto(this.autoOn);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    const L = this.layout;
    // 横幅
    let by = L.battle.y + 110;
    for (const bn of this.banners) {
      const a = Math.min(1, bn.life / 0.3, (bn.max - bn.life) / 0.15 + 0.2);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = 'rgba(20,22,40,.6)';
      ctx.fillRect(0, by - 18, W, 36);
      D.text(ctx, bn.s, W / 2, by, 18, bn.color, { sw: 4 });
      by += 40;
    }
    ctx.globalAlpha = 1;
    // 宝箱弹出
    if (this.chestPop) {
      const k = this.chestPop.life;
      const s = Math.min(1, (1.6 - k) * 6) * (1 + Math.max(0, Math.sin((1.6 - k) * 10)) * 0.1);
      const y = L.battle.y + 185 + this.hl * 150;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2);
      D.star(ctx, W / 2, y, 46 * s, 12, 'rgba(255,230,120,.6)', 'rgba(255,200,60,.8)');
      D.chest(ctx, W / 2, y, 1.3 * s, this.chestPop.tier);
      D.text(ctx, ['', '木宝箱！', '银宝箱！', '金宝箱！'][this.chestPop.tier], W / 2, y + 38, 18, '#fff', { sw: 4 });
      ctx.restore();
    }
    // 高光录制提示
    if (this.hl > 0.5) {
      ctx.globalAlpha = (this.hl - 0.5) * 2;
      D.rr(ctx, 12, 14, 110, 26, 13);
      ctx.fillStyle = 'rgba(20,22,40,.7)';
      ctx.fill();
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(28, 27, 6, 0, Math.PI * 2);
      ctx.fill();
      D.text(ctx, '高光录制中', 76, 27, 12, '#fff', { stroke: null });
      ctx.globalAlpha = 1;
    }
    // 录素材：投放字幕 + 点击手势
    if (this.opts.record && this.opts.caption) {
      // 字幕只在"憋"的时候显示，连锁开始后让位给连锁计数。
      const a = 1 - Math.max(this.hl, this.counter.hop > 0 ? this.counter.alpha : 0);
      if (a > 0.02) {
        ctx.globalAlpha = a;
        const lines = this.opts.caption.split('|');
        lines.forEach((ln, i) => D.text(ctx, ln, W / 2, 92 + i * 34, 26, '#fff', { stroke: D.C.ink, sw: 6 }));
        ctx.globalAlpha = 1;
      }
    }
    if (this.finger) {
      const i = this.finger.hero;
      const x = 42 + i * 60;
      const y = L.heroBar.y + 38;
      const k = this.finger.t;
      const press = k < 0.25 ? 1 : 0;
      ctx.save();
      ctx.translate(x + 10, y + 16 - press * 4);
      ctx.rotate(-0.35);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(-6, -20, 14 + press * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = D.C.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-5, -16);
      ctx.quadraticCurveTo(0, -22, 5, -16);
      ctx.lineTo(5, 2);
      ctx.lineTo(12, 0);
      ctx.quadraticCurveTo(17, 2, 14, 8);
      ctx.lineTo(6, 24);
      ctx.lineTo(-10, 24);
      ctx.lineTo(-14, 6);
      ctx.quadraticCurveTo(-14, 0, -8, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (this.showHelp) this.drawHelp(ctx);
  }

  private drawHelp(ctx: CanvasRenderingContext2D): void {
    this.buttons = [];
    ctx.fillStyle = 'rgba(10,12,24,.78)';
    ctx.fillRect(0, 0, W, H);
    D.rr(ctx, 24, 120, W - 48, 420, 18);
    ctx.fillStyle = D.C.cream;
    ctx.fill();
    D.text(ctx, '连锁守城 · 原型', W / 2, 158, 24, D.C.ink, { stroke: null });
    const lines = [
      '怪会从右边冲向城墙。',
      '英雄自动打，给怪挂上印记。',
      '',
      '下面的头像亮起来时，点它换人：',
      '从城下开始，连锁引爆一整片。',
      '',
      '憋得越久，怪越挤，连锁越长，',
      '但城墙一直在挨打。',
      '',
      '燃烧会蔓延　冰霜沿一排传得远',
      '破甲会把怪吸到一起',
    ];
    lines.forEach((s, i) => D.text(ctx, s, W / 2, 202 + i * 24, 15, '#4a4458', { stroke: null }));
    D.rr(ctx, W / 2 - 80, 478, 160, 46, 23);
    ctx.fillStyle = D.C.gold;
    ctx.fill();
    ctx.strokeStyle = D.C.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    D.text(ctx, this.started ? '继续' : '开始', W / 2, 501, 20, D.C.ink, { stroke: null });
    this.buttons.push({
      x: 0,
      y: 0,
      w: W,
      h: H,
      tap: () => {
        this.showHelp = false;
        this.started = true;
        this.sfx.unlock();
      },
    });
  }
}
