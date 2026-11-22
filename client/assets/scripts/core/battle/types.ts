/**
 * 战斗核心的数据类型。坐标系（与画面方向无关）：
 * - x：从城墙往右，0 = 城墙，laneLength = 怪的出生处；
 * - y：横跨三排的连续坐标，第 r 排的中心在 r * rowGap。
 * 画面（横版或竖向）只负责把 (x, y) 投影到屏幕上。
 */

export type HeroKind = 'sword' | 'mage' | 'archer';
export type MarkKind = 'armor' | 'burn' | 'frost';
export type EnemyKind = 'grunt' | 'runner' | 'tank';

export const HERO_MARK: Record<HeroKind, MarkKind> = { sword: 'armor', mage: 'burn', archer: 'frost' };
export const MARKS: MarkKind[] = ['armor', 'burn', 'frost'];

export interface Enemy {
  id: number;
  kind: EnemyKind;
  elite: boolean;
  x: number;
  y: number;
  /** 出生时分到的排（0～2），冰锥按它判断"同一排"。 */
  row: number;
  hp: number;
  maxHp: number;
  speed: number;
  dps: number;
  /** 体型系数（画面和间距用）。 */
  size: number;
  gold: number;
  alive: boolean;
  /** 每种印记的层数。 */
  marks: Record<MarkKind, number>;
  /** 每种印记距上次叠加过了多久（秒），超过 markDecay 清零。 */
  markAge: Record<MarkKind, number>;
  /** 冻住剩余时间（秒）。 */
  frozen: number;
  /** 是否已贴到城墙前（在打墙）。 */
  atWall: boolean;
}

export interface Projectile {
  id: number;
  hero: HeroKind;
  x: number;
  y: number;
  /** 目标点；火球飞向目标怪，箭沿一排飞。 */
  tx: number;
  ty: number;
  speed: number;
  /** 火球：目标怪 id；箭：按顺序要命中的怪 id。 */
  targets: number[];
  crit: boolean;
}

export interface HeroState {
  kind: HeroKind;
  /** 距下次普攻还有多久（秒）。 */
  attackTimer: number;
}

export interface ChainState {
  active: boolean;
  /** 引爆者的印记：这种印记不参与本次连锁。 */
  exclude: MarkKind;
  hero: HeroKind;
  /** 待爆的怪（按入队顺序）。 */
  queue: number[];
  visited: Set<number>;
  hops: number;
  timer: number;
  damage: number;
}

export type BattleEvent =
  | { t: 'spawn'; id: number }
  | { t: 'attack'; hero: HeroKind; targets: number[] }
  | { t: 'hit'; id: number; dmg: number; crit: boolean; src: HeroKind | 'burn' | 'chain' }
  | { t: 'kill'; id: number; x: number; y: number; gold: number; byChain: boolean }
  | { t: 'freeze'; id: number }
  | { t: 'switch'; from: number; to: number }
  | { t: 'chainStart'; seed: number; hero: HeroKind; x: number; y: number }
  | {
      t: 'explode';
      id: number;
      x: number;
      y: number;
      r: number;
      hop: number;
      dmg: number;
      marks: Record<MarkKind, number>;
      /** 冰锥：从爆点射到哪些怪。 */
      shards: { x: number; y: number }[];
      pulled: boolean;
    }
  | { t: 'chainEnd'; hops: number; damage: number; gold: number; chest: number }
  | { t: 'waveStart'; wave: number; stage: number }
  | { t: 'stageClear'; stage: number }
  | { t: 'wallBroken'; stage: number };
