import { Rng } from '../rng';
import { BattleConfig, DEFAULT_CONFIG } from './config';
import {
  BattleEvent,
  ChainState,
  Enemy,
  EnemyKind,
  HERO_MARK,
  HeroKind,
  HeroState,
  MARKS,
  MarkKind,
  Projectile,
} from './types';

/** 固定步长：每秒 30 次。画面按真实时间累加，够一步就推一步。 */
export const STEP = 1 / 30;

export const HERO_ORDER: HeroKind[] = ['sword', 'mage', 'archer'];

export interface BattleOptions {
  /** 是否自动出怪（测试里关掉，手动摆怪）。默认 true。 */
  spawn?: boolean;
  /** 开局场上的英雄下标。默认 0（剑士）。 */
  active?: number;
}

export interface AddEnemyOptions {
  kind?: EnemyKind;
  x: number;
  row?: number;
  y?: number;
  hp?: number;
  marks?: Partial<Record<MarkKind, number>>;
}

function zeroMarks(): Record<MarkKind, number> {
  return { armor: 0, burn: 0, frost: 0 };
}

/**
 * 一场守城战斗（设计文档第 4 节）。纯逻辑：不依赖 Cocos、不依赖抖音接口、不读时钟，
 * 所有随机都走 Rng，所以同样的种子 + 同样的操作一定得到同样的结果。
 *
 * 用法：每帧按真实时间累加，够一个 STEP 就调一次 step()；画面从 enemies / projectiles 等字段读位置，
 * 用 drainEvents() 取事件做特效。
 */
export class Battle {
  readonly cfg: BattleConfig;
  readonly rng: Rng;
  readonly heroes: HeroState[];

  active: number;
  switchCooldown = 0;
  auto = false;
  /** 智能换人：印记够了才换（设计文档 6.5）。 */
  smart = false;
  autoTimer = 0;

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  chain: ChainState;

  stage = 1;
  wave = 0;
  waveTimer = 0;
  pauseTimer = 0;
  wallHp: number;

  gold = 0;
  bestChain = 0;
  lastChain = 0;
  time = 0;
  atkLevel = 0;
  wallLevel = 0;

  private nextId = 1;
  private events: BattleEvent[] = [];
  private readonly spawnOn: boolean;
  private archerShot = 0;
  private spreadTimer = 0;

  constructor(cfg: BattleConfig = DEFAULT_CONFIG, seed = 1, opts: BattleOptions = {}) {
    this.cfg = cfg;
    this.rng = new Rng(seed);
    this.heroes = HERO_ORDER.map((kind) => ({ kind, attackTimer: 0.3 }));
    this.active = opts.active ?? 0;
    this.spawnOn = opts.spawn ?? true;
    this.wallHp = this.wallMax;
    this.chain = this.idleChain();
    if (this.spawnOn) this.spawnWave();
  }

  // ---------- 派生数值 ----------

  get atkMult(): number {
    return 1 + this.atkLevel * this.cfg.upgrades.atk.step;
  }

  get wallMax(): number {
    return Math.round(this.cfg.wallMaxHp * (1 + this.wallLevel * this.cfg.upgrades.wall.step));
  }

  get goldMult(): number {
    return Math.pow(this.cfg.stage.goldGrowth, this.stage - 1);
  }

  get activeHero(): HeroKind {
    return this.heroes[this.active].kind;
  }

  upgradeCost(kind: 'atk' | 'wall'): number {
    const u = this.cfg.upgrades[kind];
    const lv = kind === 'atk' ? this.atkLevel : this.wallLevel;
    return Math.round(u.base * Math.pow(u.growth, lv));
  }

  upgrade(kind: 'atk' | 'wall'): boolean {
    const cost = this.upgradeCost(kind);
    if (this.gold < cost) return false;
    this.gold -= cost;
    if (kind === 'atk') this.atkLevel++;
    else {
      const before = this.wallMax;
      this.wallLevel++;
      this.wallHp += this.wallMax - before;
    }
    return true;
  }

  /** 一只怪身上"能被 exclude 以外的英雄引爆"的印记层数。 */
  liveStacks(e: Enemy, exclude: MarkKind): number {
    let n = 0;
    for (const k of MARKS) if (k !== exclude) n += e.marks[k];
    return n;
  }

  /** 如果现在换上第 i 个英雄，有几只怪带着能被它引爆的印记（待命头像发光提示用）。连锁最长就这么多跳。 */
  detonatable(i: number): number {
    const ex = HERO_MARK[this.heroes[i].kind];
    let n = 0;
    for (const e of this.enemies) if (e.alive && this.liveStacks(e, ex) > 0) n++;
    return n;
  }

  canSwitch(i: number): boolean {
    return i !== this.active && i >= 0 && i < this.heroes.length && this.switchCooldown <= 0 && !this.chain.active && this.pauseTimer <= 0;
  }

  /** 换人：换上来的英雄立即从离城墙最近的、带别人印记的怪开始连锁（设计文档 4.2、4.4）。 */
  switchTo(i: number): boolean {
    if (!this.canSwitch(i)) return false;
    const from = this.active;
    this.active = i;
    this.switchCooldown = this.cfg.switchCooldown;
    this.autoTimer = 0;
    this.heroes[i].attackTimer = 0.45;
    this.events.push({ t: 'switch', from, to: i });
    this.startChain(this.heroes[i].kind);
    return true;
  }

  setAuto(on: boolean, smart = false): void {
    this.auto = on;
    this.smart = smart;
    this.autoTimer = 0;
  }

  drainEvents(): BattleEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  byId(id: number): Enemy | undefined {
    for (const e of this.enemies) if (e.id === id) return e;
    return undefined;
  }

  aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** 测试和录素材用：直接摆一只怪。 */
  addEnemy(o: AddEnemyOptions): Enemy {
    const kind = o.kind ?? 'grunt';
    const ec = this.cfg.enemies[kind];
    const row = o.row ?? 1;
    const e: Enemy = {
      id: this.nextId++,
      kind,
      elite: false,
      x: o.x,
      y: o.y ?? row * this.cfg.rowGap,
      row,
      hp: o.hp ?? ec.hp,
      maxHp: o.hp ?? ec.hp,
      speed: ec.speed,
      dps: ec.dps,
      size: ec.size,
      gold: ec.gold,
      alive: true,
      marks: { ...zeroMarks(), ...o.marks },
      markAge: zeroMarks(),
      frozen: 0,
      atWall: false,
    };
    this.enemies.push(e);
    return e;
  }

  // ---------- 主循环 ----------

  step(dt: number = STEP): void {
    this.time += dt;
    if (this.switchCooldown > 0) this.switchCooldown = Math.max(0, this.switchCooldown - dt);

    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      if (this.pauseTimer <= 0 && this.spawnOn) {
        this.wave = 0;
        this.waveTimer = 0;
        this.spawnWave();
      }
      return;
    }

    this.updateChain(dt);
    this.updateMarks(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    if (!this.chain.active) this.updateHero(dt);
    this.updateAuto(dt);
    if (this.wallHp <= 0) {
      this.breakWall();
      return;
    }
    this.updateWaves(dt);
    if (!this.chain.active) this.enemies = this.enemies.filter((e) => e.alive);
  }

  // ---------- 波次 ----------

  private spawnWave(): void {
    const s = this.cfg.stage;
    this.wave++;
    const count = Math.min(s.waveCap, s.waveBase + s.wavePerIndex * (this.wave - 1) + Math.floor(s.wavePerStage * (this.stage - 1)));
    const hpMult = Math.pow(s.hpGrowth, this.stage - 1);
    const dpsMult = Math.pow(s.dpsGrowth, this.stage - 1);
    const tankW = this.stage >= 2 ? 15 : this.wave >= 3 ? 8 : 0;
    let x = this.cfg.laneLength + 20;
    for (let i = 0; i < count; i++) {
      const kind = this.rng.weighted<EnemyKind>([
        ['grunt', 62],
        ['runner', 30],
        ['tank', tankW],
      ]);
      const ec = this.cfg.enemies[kind];
      const elite = this.wave === s.waves && i === 0;
      const row = this.rng.int(0, this.cfg.rows - 1);
      const hp = ec.hp * hpMult * (elite ? s.eliteHpMult : 1);
      x += 14 + this.rng.next() * 22;
      const e: Enemy = {
        id: this.nextId++,
        kind,
        elite,
        x,
        y: row * this.cfg.rowGap + (this.rng.next() - 0.5) * 16,
        row,
        hp,
        maxHp: hp,
        speed: ec.speed,
        dps: ec.dps * dpsMult * (elite ? 2 : 1),
        size: ec.size * (elite ? s.eliteSize : 1),
        gold: Math.round(ec.gold * (elite ? 5 : 1)),
        alive: true,
        marks: zeroMarks(),
        markAge: zeroMarks(),
        frozen: 0,
        atWall: false,
      };
      this.enemies.push(e);
      this.events.push({ t: 'spawn', id: e.id });
    }
    this.waveTimer = 0;
    this.events.push({ t: 'waveStart', wave: this.wave, stage: this.stage });
  }

  private updateWaves(dt: number): void {
    if (!this.spawnOn) return;
    const s = this.cfg.stage;
    if (this.wave < s.waves) {
      this.waveTimer += dt;
      if (!this.chain.active && (this.aliveCount() <= s.nextWaveAlive || this.waveTimer >= s.nextWaveTime)) this.spawnWave();
      return;
    }
    if (!this.chain.active && this.aliveCount() === 0) {
      this.events.push({ t: 'stageClear', stage: this.stage });
      this.stage++;
      this.wallHp = Math.min(this.wallMax, this.wallHp + this.wallMax * 0.3);
      this.pauseTimer = s.pause;
    }
  }

  private breakWall(): void {
    this.events.push({ t: 'wallBroken', stage: this.stage });
    this.stage = Math.max(1, this.stage - 1);
    this.enemies = [];
    this.projectiles = [];
    this.chain = this.idleChain();
    this.wallHp = this.wallMax;
    this.pauseTimer = this.cfg.stage.pause * 1.5;
  }

  // ---------- 怪 ----------

  private updateMarks(dt: number): void {
    const c = this.cfg;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      for (const k of MARKS) {
        if (e.marks[k] <= 0) continue;
        e.markAge[k] += dt;
        if (e.markAge[k] >= c.markDecay) e.marks[k] = 0;
      }
      if (e.marks.burn > 0) this.damage(e, c.burnDpsPerStack * e.marks.burn * this.atkMult * dt, 'burn', false, false);
    }
    // 燃烧蔓延：火会在挤成一堆的怪之间慢慢烧开（"憋"的看点）。
    this.spreadTimer += dt;
    if (this.spreadTimer < c.burnSpreadInterval) return;
    this.spreadTimer -= c.burnSpreadInterval;
    const sources = this.enemies.filter((e) => e.alive && e.marks.burn >= c.burnSpreadMin);
    for (const src of sources) {
      let best: Enemy | undefined;
      let bestD = c.burnSpreadRadius;
      for (const o of this.enemies) {
        if (!o.alive || o.marks.burn > 0) continue;
        const d = Math.hypot(o.x - src.x, o.y - src.y);
        if (d <= bestD) {
          best = o;
          bestD = d;
        }
      }
      if (best) this.addMark(best, 'burn');
    }
  }

  private updateEnemies(dt: number): void {
    const c = this.cfg;
    const mult = this.chain.active ? c.chain.slow : 1;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.frozen > 0) {
        e.frozen = Math.max(0, e.frozen - dt * mult);
        continue;
      }
      const slow = Math.max(0.1, 1 - c.frostSlowPerStack * e.marks.frost);
      if (e.x > c.wallStopX) e.x = Math.max(c.wallStopX, e.x - e.speed * slow * mult * dt);
    }
    // 排队：同一排里不能穿过前面的怪，城下会挤成一串（"憋"的来源）。
    const alive = this.enemies.filter((e) => e.alive).sort((a, b) => a.x - b.x || a.id - b.id);
    for (let i = 0; i < alive.length; i++) {
      const e = alive[i];
      let minX = c.wallStopX;
      for (let j = 0; j < i; j++) {
        const o = alive[j];
        if (Math.abs(o.y - e.y) < c.rowGap * 0.4) minX = Math.max(minX, o.x + (c.sepDist * (o.size + e.size)) / 2);
      }
      if (e.x < minX) e.x = minX;
      e.atWall = e.x <= c.wallStopX + 0.5;
      if (e.atWall && e.frozen <= 0) this.wallHp -= e.dps * mult * dt;
    }
  }

  private addMark(e: Enemy, k: MarkKind): void {
    const c = this.cfg;
    e.marks[k] = Math.min(c.markMax, e.marks[k] + 1);
    e.markAge[k] = 0;
    if (k === 'frost' && e.marks.frost >= c.markMax && e.frozen <= 0) {
      e.frozen = c.freezeTime;
      this.events.push({ t: 'freeze', id: e.id });
    }
  }

  private damage(e: Enemy, amount: number, src: HeroKind | 'burn' | 'chain', crit: boolean, byChain: boolean): number {
    if (!e.alive) return 0;
    const dmg = amount * (1 + this.cfg.armorTakenPerStack * e.marks.armor);
    e.hp -= dmg;
    if (src !== 'burn') this.events.push({ t: 'hit', id: e.id, dmg, crit, src });
    if (e.hp <= 0) {
      e.alive = false;
      const bonus = byChain ? 1 + 0.05 * this.chain.hops : 1;
      const gold = Math.max(1, Math.round(e.gold * this.goldMult * bonus));
      this.gold += gold;
      this.events.push({ t: 'kill', id: e.id, x: e.x, y: e.y, gold, byChain });
    }
    return dmg;
  }

  // ---------- 英雄 ----------

  private updateHero(dt: number): void {
    const h = this.heroes[this.active];
    h.attackTimer -= dt;
    if (h.attackTimer > 0) return;
    const c = this.cfg;
    const hc = c.heroes[h.kind];
    const crit = this.rng.chance(c.critChance);
    const dmg = hc.dmg * this.atkMult * (crit ? c.critMult : 1);
    const onScreen = (e: Enemy) => e.alive && e.x < c.laneLength - 10;

    if (h.kind === 'sword') {
      const range = c.heroX + (hc.range ?? 150);
      const targets = this.enemies.filter((e) => onScreen(e) && e.x <= range);
      if (targets.length === 0) {
        h.attackTimer = 0.1;
        return;
      }
      for (const e of targets) {
        this.damage(e, dmg, 'sword', crit, false);
        this.addMark(e, 'armor');
      }
      this.events.push({ t: 'attack', hero: 'sword', targets: targets.map((e) => e.id) });
    } else if (h.kind === 'mage') {
      // 法师优先打还没着火的怪，让燃烧铺开。
      let target: Enemy | undefined;
      for (const e of this.enemies) if (onScreen(e) && e.marks.burn === 0 && (!target || e.x < target.x)) target = e;
      if (!target) for (const e of this.enemies) if (onScreen(e) && (!target || e.x < target.x)) target = e;
      if (!target) {
        h.attackTimer = 0.1;
        return;
      }
      this.projectiles.push({
        id: this.nextId++,
        hero: 'mage',
        x: c.heroX + 20,
        y: c.heroY - 10,
        tx: target.x,
        ty: target.y,
        speed: hc.projSpeed ?? 700,
        targets: [target.id],
        crit,
      });
      this.events.push({ t: 'attack', hero: 'mage', targets: [target.id] });
    } else {
      // 射手：轮流射有怪的几排，沿一排穿透前几只。
      const rows: { row: number; x: number }[] = [];
      for (let r = 0; r < c.rows; r++) {
        let nearest = Infinity;
        for (const e of this.enemies) if (onScreen(e) && Math.abs(e.y - r * c.rowGap) < c.rowGap / 2) nearest = Math.min(nearest, e.x);
        if (nearest < Infinity) rows.push({ row: r, x: nearest });
      }
      if (rows.length === 0) {
        h.attackTimer = 0.1;
        return;
      }
      const pick = rows[this.archerShot++ % rows.length];
      const ry = pick.row * c.rowGap;
      const targets = this.enemies
        .filter((e) => onScreen(e) && Math.abs(e.y - ry) < c.rowGap / 2)
        .sort((a, b) => a.x - b.x)
        .slice(0, hc.pierce ?? 1);
      this.projectiles.push({
        id: this.nextId++,
        hero: 'archer',
        x: c.heroX + 20,
        y: ry,
        tx: c.laneLength + 60,
        ty: ry,
        speed: hc.projSpeed ?? 1000,
        targets: targets.map((e) => e.id),
        crit,
      });
      this.events.push({ t: 'attack', hero: 'archer', targets: targets.map((e) => e.id) });
    }
    h.attackTimer = hc.interval;
  }

  private updateProjectiles(dt: number): void {
    const c = this.cfg;
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      const hc = c.heroes[p.hero];
      const dmg = hc.dmg * this.atkMult * (p.crit ? c.critMult : 1);
      if (p.hero === 'mage') {
        const t = this.byId(p.targets[0]);
        if (t && t.alive) {
          p.tx = t.x;
          p.ty = t.y;
        }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const move = p.speed * dt;
        if (d > move) {
          p.x += (dx / d) * move;
          p.y += (dy / d) * move;
          keep.push(p);
          continue;
        }
        const splash = hc.splash ?? 60;
        for (const e of this.enemies) {
          if (!e.alive || Math.hypot(e.x - p.tx, e.y - p.ty) > splash) continue;
          this.damage(e, e.id === p.targets[0] ? dmg : dmg * (hc.splashFrac ?? 0.5), 'mage', p.crit, false);
          this.addMark(e, 'burn');
        }
      } else {
        p.x += p.speed * dt;
        const rest: number[] = [];
        for (const id of p.targets) {
          const e = this.byId(id);
          if (!e || !e.alive) continue;
          if (p.x >= e.x) {
            this.damage(e, dmg, 'archer', p.crit, false);
            this.addMark(e, 'frost');
          } else rest.push(id);
        }
        p.targets = rest;
        if (p.x < p.tx) keep.push(p);
      }
    }
    this.projectiles = keep;
  }

  private updateAuto(dt: number): void {
    if (!this.auto || this.chain.active) return;
    this.autoTimer += dt;
    const next = (this.active + 1) % this.heroes.length;
    if (this.smart) {
      let best = -1;
      let bestN = 0;
      for (let i = 0; i < this.heroes.length; i++) {
        if (!this.canSwitch(i)) continue;
        const n = this.detonatable(i);
        if (n > bestN) {
          best = i;
          bestN = n;
        }
      }
      const urgent = this.wallHp < this.wallMax * 0.35 && bestN >= 2;
      if (best >= 0 && (bestN >= 18 || urgent)) this.switchTo(best);
      return;
    }
    if (this.autoTimer >= this.cfg.autoSwitchEvery && this.canSwitch(next)) this.switchTo(next);
  }

  // ---------- 连锁（设计文档 4.4） ----------

  private idleChain(): ChainState {
    return { active: false, exclude: 'armor', hero: 'sword', queue: [], visited: new Set(), hops: 0, timer: 0, damage: 0 };
  }

  private startChain(hero: HeroKind): void {
    const ex = HERO_MARK[hero];
    let seed: Enemy | undefined;
    for (const e of this.enemies) {
      if (!e.alive || this.liveStacks(e, ex) <= 0) continue;
      if (!seed || e.x < seed.x || (e.x === seed.x && e.id < seed.id)) seed = e;
    }
    if (!seed) return;
    this.chain = { active: true, exclude: ex, hero, queue: [seed.id], visited: new Set([seed.id]), hops: 0, timer: 0, damage: 0 };
    this.events.push({ t: 'chainStart', seed: seed.id, hero, x: seed.x, y: seed.y });
  }

  /** 两次爆炸之间的间隔：越往后越快，像越烧越快的导火索。 */
  hopInterval(hops: number): number {
    const c = this.cfg.chain;
    return Math.max(c.intervalMin, c.intervalStart * Math.pow(c.intervalDecay, hops));
  }

  private updateChain(dt: number): void {
    const ch = this.chain;
    if (!ch.active) return;
    ch.timer -= dt;
    let guard = 0;
    while (ch.active && ch.timer <= 0 && guard++ < 100) {
      const id = ch.queue.shift();
      if (id === undefined) {
        this.endChain();
        break;
      }
      const e = this.byId(id);
      if (!e) continue;
      this.explode(e);
      ch.hops++;
      ch.timer += this.hopInterval(ch.hops);
    }
  }

  private explode(e: Enemy): void {
    const c = this.cfg;
    const cc = c.chain;
    const ch = this.chain;
    const ex = ch.exclude;
    const m = zeroMarks();
    for (const k of MARKS) if (k !== ex) m[k] = e.marks[k];
    const stacks = m.armor + m.burn + m.frost;

    let r = cc.baseRadius;
    if (m.burn > 0) r += cc.burnRadius + cc.burnRadiusPerStack * m.burn;
    if (m.armor > 0) r += cc.armorRadiusPerStack * m.armor;
    const dist = (o: Enemy) => Math.hypot(o.x - e.x, o.y - e.y);

    // 破甲：先把周围的怪往爆点吸，挤得更密。
    let pulled = false;
    if (m.armor > 0) {
      for (const o of this.enemies) {
        if (o === e || !o.alive) continue;
        const d = dist(o);
        if (d > cc.pullRadius || d < 1) continue;
        o.x = Math.max(c.wallStopX, o.x + (e.x - o.x) * cc.pullFrac);
        o.y = o.y + (e.y - o.y) * cc.pullFrac;
        o.row = Math.max(0, Math.min(c.rows - 1, Math.round(o.y / c.rowGap)));
        pulled = true;
      }
    }

    const dmg = (cc.dmgBase + cc.dmgPerStack * stacks) * (1 + cc.dmgPerHop * ch.hops) * this.atkMult;
    for (const o of this.enemies) if (o.alive && dist(o) <= r) ch.damage += this.damage(o, dmg, 'chain', false, true);

    // 点燃：范围内带印记的怪（被炸死的也算，尸体照样会爆）。
    const live = (o: Enemy) => !ch.visited.has(o.id) && this.liveStacks(o, ex) > 0;
    const ignite: Enemy[] = [];
    for (const o of this.enemies) if (o !== e && live(o) && dist(o) <= r) ignite.push(o);

    // 冰霜：沿同一排往前、往后各射一根冰锥，点燃最近的带印记的怪。
    const shards: { x: number; y: number }[] = [];
    if (m.frost > 0) {
      const range = cc.frostRange + cc.frostRangePerStack * m.frost;
      for (const dir of [1, -1]) {
        let best: Enemy | undefined;
        for (const o of this.enemies) {
          if (o === e || !live(o) || Math.abs(o.y - e.y) >= c.rowGap / 2) continue;
          const dx = (o.x - e.x) * dir;
          if (dx <= 0 || dx > range) continue;
          if (!best || dx < (best.x - e.x) * dir) best = o;
        }
        if (best) {
          shards.push({ x: best.x, y: best.y });
          if (!ignite.includes(best)) ignite.push(best);
        }
      }
    }

    ignite.sort((a, b) => a.x - b.x || a.id - b.id);
    for (const o of ignite) {
      ch.visited.add(o.id);
      ch.queue.push(o.id);
    }
    for (const k of MARKS) if (k !== ex) e.marks[k] = 0;
    this.events.push({ t: 'explode', id: e.id, x: e.x, y: e.y, r, hop: ch.hops + 1, dmg, marks: m, shards, pulled });
  }

  private endChain(): void {
    const ch = this.chain;
    const hops = ch.hops;
    const tiers = this.cfg.chain.chestTiers;
    const chest = hops >= tiers[2] ? 3 : hops >= tiers[1] ? 2 : hops >= tiers[0] ? 1 : 0;
    const gold = Math.round(hops * this.cfg.chain.goldPerHop * this.goldMult);
    this.gold += gold;
    this.lastChain = hops;
    this.bestChain = Math.max(this.bestChain, hops);
    this.events.push({ t: 'chainEnd', hops, damage: ch.damage, gold, chest });
    this.chain = this.idleChain();
  }
}
