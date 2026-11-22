import { EnemyKind, HeroKind } from './types';

/**
 * 战斗数值（初版占位，见设计文档第 4～7 节）。以后挪进配置表 JSON。
 *
 * 调数原则：普攻主要负责挂印记、伤害很低；杀伤主要靠连锁。
 * 这样怪会在城下挤成一堆，"憋"得越久连锁越长、城墙越危险（数值见 tests/battle.test.ts 的"憋"测试和 npm run sim）。
 */
export interface HeroConfig {
  /** 普攻间隔（秒）。 */
  interval: number;
  dmg: number;
  /** 剑士：能砍到城前多远（x ≤ heroX + range）。 */
  range?: number;
  /** 法师：溅射半径和溅射伤害比例。 */
  splash?: number;
  splashFrac?: number;
  /** 射手：一箭穿透几只。 */
  pierce?: number;
  /** 弹道速度（单位/秒）。剑士近战没有弹道。 */
  projSpeed?: number;
}

export interface EnemyConfig {
  hp: number;
  speed: number;
  dps: number;
  gold: number;
  size: number;
}

export interface BattleConfig {
  laneLength: number;
  rowGap: number;
  rows: number;
  heroX: number;
  heroY: number;
  /** 怪停在这里打墙。 */
  wallStopX: number;
  /** 同一排里两只怪之间的最小间距（会乘体型）。 */
  sepDist: number;
  wallMaxHp: number;

  switchCooldown: number;
  autoSwitchEvery: number;
  /** 待命头像发光提示：换它上场能引爆的怪 ≥ 这个数。 */
  glowCount: number;

  markMax: number;
  markDecay: number;
  burnDpsPerStack: number;
  /** 燃烧蔓延：每隔多久，≥ burnSpreadMin 层的怪把 1 层燃烧传给身边最近的一只没着火的怪。 */
  burnSpreadInterval: number;
  burnSpreadRadius: number;
  burnSpreadMin: number;
  frostSlowPerStack: number;
  freezeTime: number;
  armorTakenPerStack: number;
  critChance: number;
  critMult: number;

  heroes: Record<HeroKind, HeroConfig>;
  enemies: Record<EnemyKind, EnemyConfig>;

  stage: {
    waves: number;
    hpGrowth: number;
    dpsGrowth: number;
    goldGrowth: number;
    waveBase: number;
    wavePerIndex: number;
    wavePerStage: number;
    waveCap: number;
    /** 场上活着的怪 ≤ 这个数，或者距上一波过了 nextWaveTime 秒，就出下一波。 */
    nextWaveAlive: number;
    nextWaveTime: number;
    eliteHpMult: number;
    eliteSize: number;
    /** 换关、城破后的停顿（秒）。 */
    pause: number;
  };

  chain: {
    baseRadius: number;
    burnRadius: number;
    burnRadiusPerStack: number;
    armorRadiusPerStack: number;
    frostRange: number;
    frostRangePerStack: number;
    pullRadius: number;
    pullFrac: number;
    dmgBase: number;
    dmgPerStack: number;
    dmgPerHop: number;
    intervalStart: number;
    intervalDecay: number;
    intervalMin: number;
    /** 连锁进行时，怪的移动速度乘这个数（场面近乎定格）。 */
    slow: number;
    /** 掉宝箱的跳数门槛：木、银、金。 */
    chestTiers: number[];
    goldPerHop: number;
  };

  upgrades: {
    atk: { base: number; growth: number; step: number };
    wall: { base: number; growth: number; step: number };
  };
}

export const DEFAULT_CONFIG: BattleConfig = {
  laneLength: 1000,
  rowGap: 60,
  rows: 3,
  heroX: 55,
  heroY: 60,
  wallStopX: 95,
  sepDist: 24,
  wallMaxHp: 600,

  switchCooldown: 5,
  autoSwitchEvery: 9,
  glowCount: 10,

  markMax: 5,
  markDecay: 8,
  burnDpsPerStack: 0.4,
  burnSpreadInterval: 1.0,
  burnSpreadRadius: 55,
  burnSpreadMin: 2,
  frostSlowPerStack: 0.1,
  freezeTime: 1.5,
  armorTakenPerStack: 0.04,
  critChance: 0.1,
  critMult: 2,

  heroes: {
    sword: { interval: 0.75, dmg: 1.5, range: 175 },
    mage: { interval: 0.8, dmg: 4, splash: 75, splashFrac: 0.5, projSpeed: 700 },
    archer: { interval: 0.38, dmg: 2, pierce: 3, projSpeed: 1100 },
  },

  enemies: {
    grunt: { hp: 36, speed: 50, dps: 4, gold: 2, size: 1 },
    runner: { hp: 22, speed: 88, dps: 3, gold: 2, size: 0.82 },
    tank: { hp: 120, speed: 30, dps: 9, gold: 6, size: 1.35 },
  },

  stage: {
    waves: 4,
    hpGrowth: 1.13,
    dpsGrowth: 1.08,
    goldGrowth: 1.1,
    waveBase: 12,
    wavePerIndex: 3,
    wavePerStage: 0.6,
    waveCap: 30,
    nextWaveAlive: 10,
    nextWaveTime: 6,
    eliteHpMult: 3,
    eliteSize: 1.5,
    pause: 1.5,
  },

  chain: {
    baseRadius: 46,
    burnRadius: 22,
    burnRadiusPerStack: 12,
    armorRadiusPerStack: 8,
    frostRange: 200,
    frostRangePerStack: 30,
    pullRadius: 125,
    pullFrac: 0.65,
    dmgBase: 14,
    dmgPerStack: 6,
    dmgPerHop: 0.1,
    intervalStart: 0.07,
    intervalDecay: 0.94,
    intervalMin: 0.025,
    slow: 0.2,
    chestTiers: [15, 30, 60],
    goldPerHop: 2,
  },

  upgrades: {
    atk: { base: 30, growth: 1.18, step: 0.12 },
    wall: { base: 25, growth: 1.16, step: 0.15 },
  },
};
