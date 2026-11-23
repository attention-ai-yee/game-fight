/**
 * 画面方向：同一份战斗逻辑，横版（英雄在左守城，怪从右来）和竖向（城墙在下，怪从上来）两种投影。
 * 逻辑坐标：x = 离城墙多远（0～1000），y = 横跨三排（0～120）。屏幕是 375×667 的设计尺寸。
 */
export const W = 375;
export const H = 667;

export type LayoutKind = 'h' | 'v';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Projected {
  sx: number;
  sy: number;
  /** 这个位置的缩放（近大远小）。 */
  s: number;
}

export interface Layout {
  kind: LayoutKind;
  top: Rect;
  battle: Rect;
  heroBar: Rect;
  growth: Rect;
  nav: Rect;
  /** 每个逻辑单位多少像素（爆炸半径等换算用）。 */
  unit: number;
  project(x: number, y: number): Projected;
  /** 高光全屏时的放大倍数。 */
  zoom: number;
}

export function makeLayout(kind: LayoutKind): Layout {
  if (kind === 'h') {
    const unit = 0.66;
    return {
      kind,
      top: { x: 0, y: 0, w: W, h: 50 },
      battle: { x: 0, y: 50, w: W, h: 322 },
      heroBar: { x: 0, y: 372, w: W, h: 84 },
      growth: { x: 0, y: 456, w: W, h: 144 },
      nav: { x: 0, y: 600, w: W, h: 67 },
      unit,
      zoom: 1.7,
      project(x, y) {
        const t = Math.max(-0.2, Math.min(1.2, y / 120));
        return { sx: 36 + x * unit, sy: 262 + t * 82, s: 0.84 + t * 0.26 };
      },
    };
  }
  const unit = 0.72;
  return {
    kind,
    top: { x: 0, y: 0, w: W, h: 50 },
    battle: { x: 0, y: 50, w: W, h: 420 },
    heroBar: { x: 0, y: 470, w: W, h: 84 },
    growth: { x: 0, y: 554, w: W, h: 46 },
    nav: { x: 0, y: 600, w: W, h: 67 },
    unit,
    zoom: 1.35,
    project(x, y) {
      const t = Math.max(-0.2, Math.min(1.2, y / 120));
      const depth = Math.max(0, Math.min(1, x / 480));
      return { sx: 187 + (t - 0.5) * (170 - depth * 40), sy: 442 - x * unit, s: 1.05 - depth * 0.22 };
    },
  };
}
