/** 灰盒画面的图形：全部用代码画，换正式美术时替换这里。 */
import { HeroKind, MarkKind } from '../client/assets/scripts/core/battle/types';

export const FONT = '"ZCOOL KuaiLe", "PingFang SC", "Microsoft YaHei", "WenQuanYi Zen Hei", sans-serif';

export const C = {
  ink: '#2a2440',
  panel: '#2b2f4a',
  panel2: '#22253b',
  gold: '#ffc93c',
  orange: '#ff8a1f',
  skin: '#ffdcbc',
  sky1: '#8fd0ff',
  sky2: '#dff3ff',
  grass: '#86c86f',
  road: '#ecd6a8',
  roadEdge: '#c9a874',
  cream: '#f3efe6',
};

export const HERO_COLOR: Record<HeroKind, string> = { sword: '#e0645c', mage: '#5a86e6', archer: '#5fb46c' };
export const HERO_NAME: Record<HeroKind, string> = { sword: '剑士', mage: '法师', archer: '射手' };
export const MARK_COLOR: Record<MarkKind, string> = { armor: '#c3cad8', burn: '#ff8a1f', frost: '#6fd3ff' };
export const MARK_NAME: Record<MarkKind, string> = { armor: '破甲', burn: '燃烧', frost: '冰霜' };

type Ctx = CanvasRenderingContext2D;

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function text(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  o: { stroke?: string | null; sw?: number; align?: CanvasTextAlign; base?: CanvasTextBaseline; rot?: number } = {},
): void {
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.base ?? 'middle';
  if (o.stroke !== null) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.sw ?? Math.max(2, size / 6);
    ctx.strokeStyle = o.stroke ?? C.ink;
    ctx.strokeText(s, 0, 0);
  }
  ctx.fillStyle = fill;
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

export function enemyColor(kind: string, elite: boolean): string {
  if (elite) return '#d9534f';
  return kind === 'runner' ? '#73b86a' : kind === 'tank' ? '#c27c3e' : '#8f6fd0';
}

/** 小怪：圆滚滚的身体 + 两只角 + 生气的眼睛。facing = -1 朝左（横版），0 朝下（竖向）。 */
export function enemy(ctx: Ctx, x: number, y: number, r: number, color: string, o: { flash?: number; frozen?: boolean; elite?: boolean; squash?: number; facing?: number } = {}): void {
  const sq = o.squash ?? 0;
  const f = o.facing ?? -1;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.scale(1 + sq, 1 - sq);
  ctx.lineWidth = Math.max(1.2, r * 0.13);
  ctx.strokeStyle = C.ink;
  // 角
  ctx.fillStyle = '#f3e3c3';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(d * r * 0.55, -r * 0.6);
    ctx.lineTo(d * r * 0.78, -r * 1.15);
    ctx.lineTo(d * r * 0.12, -r * 0.82);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.4, r * 0.28, r * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  // 眼睛
  const ex = f * r * 0.12;
  for (const d of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex + d * r * 0.34, -r * 0.05, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(ex + d * r * 0.34 + f * r * 0.08, f === 0 ? r * 0.05 : 0, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.beginPath();
    ctx.moveTo(ex + d * r * 0.6, -r * 0.42);
    ctx.lineTo(ex + d * r * 0.12, -r * 0.26);
    ctx.stroke();
  }
  if (o.elite) {
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.78);
    ctx.lineTo(-r * 0.45, -r * 1.25);
    ctx.lineTo(-r * 0.2, -r * 1.0);
    ctx.lineTo(0, -r * 1.35);
    ctx.lineTo(r * 0.2, -r * 1.0);
    ctx.lineTo(r * 0.45, -r * 1.25);
    ctx.lineTo(r * 0.45, -r * 0.78);
    ctx.closePath();
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }
  if (o.frozen) {
    ctx.fillStyle = 'rgba(140,220,255,.55)';
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, r * 0.2);
    ctx.lineTo(-r * 0.7, -r * 0.95);
    ctx.lineTo(r * 0.1, -r * 1.15);
    ctx.lineTo(r * 1.05, -r * 0.5);
    ctx.lineTo(r * 0.9, r * 0.8);
    ctx.lineTo(-r * 0.6, r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (o.flash && o.flash > 0) {
    ctx.globalAlpha = Math.min(1, o.flash * 10);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.02, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function markIcon(ctx: Ctx, kind: MarkKind, x: number, y: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = C.ink;
  if (kind === 'burn') {
    ctx.fillStyle = C.orange;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.bezierCurveTo(4, -3, 6, 1, 3, 6);
    ctx.bezierCurveTo(1, 8, -1, 8, -3, 6);
    ctx.bezierCurveTo(-6, 1, -2, -2, 0, -8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.bezierCurveTo(2, 1, 2, 4, 0, 6);
    ctx.bezierCurveTo(-2, 4, -2, 1, 0, -2);
    ctx.fill();
  } else if (kind === 'frost') {
    ctx.strokeStyle = '#2a6a8a';
    ctx.lineWidth = 3.4;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
    }
    ctx.strokeStyle = MARK_COLOR.frost;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = MARK_COLOR.armor;
    ctx.beginPath();
    ctx.moveTo(-6, -7);
    ctx.lineTo(6, -7);
    ctx.lineTo(6, 0);
    ctx.bezierCurveTo(6, 5, 0, 8, 0, 8);
    ctx.bezierCurveTo(0, 8, -6, 5, -6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-2, -2);
    ctx.lineTo(2, 1);
    ctx.lineTo(-1, 6);
    ctx.stroke();
  }
  ctx.restore();
}

/** 英雄：横版用侧身（朝右），竖向用背身（朝上）。drop = 0～1 入场时从上面落下来。 */
export function hero(ctx: Ctx, kind: HeroKind, x: number, y: number, s: number, o: { t: number; drop?: number; swing?: number; back?: boolean }): void {
  const bob = Math.sin(o.t * 4) * 1.5;
  const drop = o.drop ?? 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.ellipse(0, 30 * s, 22 * s * (1 - drop * 0.5), 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -drop * 120 + bob);
  ctx.scale(s, s);
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.ink;
  ctx.lineJoin = 'round';
  const body = kind === 'sword' ? '#9aa3b5' : kind === 'mage' ? '#3f72d9' : '#3f8f4f';
  const back = !!o.back;
  // 身体
  ctx.fillStyle = kind === 'sword' ? '#b8352f' : body;
  ctx.beginPath();
  ctx.moveTo(-14, 30);
  ctx.lineTo(15, 30);
  ctx.lineTo(9, -4);
  ctx.lineTo(-9, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (kind === 'sword') {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(9, -4);
    ctx.lineTo(11, 24);
    ctx.lineTo(-11, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 武器
  const sw = o.swing ?? 0;
  ctx.save();
  if (kind === 'sword') {
    ctx.translate(10, 4);
    ctx.rotate(back ? -0.2 : -0.6 + sw * 2.2);
    ctx.strokeStyle = '#7a4a26';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -40);
    ctx.stroke();
    ctx.strokeStyle = '#eef2f8';
    ctx.lineWidth = 4.5;
    ctx.stroke();
  } else if (kind === 'mage') {
    ctx.strokeStyle = '#7a4a26';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, 28);
    ctx.lineTo(24, -30);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,160,60,.35)';
    ctx.beginPath();
    ctx.arc(25, -34, 10 + sw * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.orange;
    ctx.beginPath();
    ctx.arc(25, -34, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#c4501a';
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(back ? 0 : 16, back ? -10 : 0, 30, back ? Math.PI * 1.15 : -1.1, back ? Math.PI * 1.85 : 1.1);
    ctx.stroke();
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (back) {
      ctx.moveTo(-26, -24);
      ctx.lineTo(26, -24);
    } else {
      ctx.moveTo(16 + 30 * Math.cos(-1.1) - sw * 8, 30 * Math.sin(-1.1));
      ctx.lineTo(16 + 30 * Math.cos(1.1) - sw * 8, 30 * Math.sin(1.1));
    }
    ctx.stroke();
  }
  ctx.restore();
  // 头
  ctx.fillStyle = back ? (kind === 'sword' ? '#c3cad8' : '#7a5634') : C.skin;
  ctx.beginPath();
  ctx.arc(0, -14, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (!back) {
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(5, -14, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === 'mage') {
    ctx.fillStyle = '#5b3fa8';
    ctx.beginPath();
    ctx.ellipse(-1, -21, 16, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#6b4cc0';
    ctx.beginPath();
    ctx.moveTo(-10, -22);
    ctx.quadraticCurveTo(-8, -40, back ? 0 : -20, -52);
    ctx.quadraticCurveTo(-2, -44, 8, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'sword') {
    ctx.fillStyle = '#c3cad8';
    ctx.beginPath();
    ctx.arc(0, -16, 12, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#d9534f';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.quadraticCurveTo(-12, -36, -14, -22);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#4fa35e';
    ctx.beginPath();
    ctx.moveTo(-12, -12);
    ctx.quadraticCurveTo(-4, -34, 12, -18);
    ctx.lineTo(back ? 12 : 4, -10);
    ctx.lineTo(-12, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function portrait(ctx: Ctx, kind: HeroKind, x: number, y: number, r: number, st: { active: boolean; cd: number; glow: number; t: number }): void {
  ctx.save();
  if (st.glow > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(st.t * 8);
    ctx.fillStyle = `rgba(255,210,60,${0.25 + 0.25 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, r + 8 + pulse * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -st.t * 20;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = HERO_COLOR[kind];
  ctx.strokeStyle = st.active ? C.gold : '#141626';
  ctx.lineWidth = st.active ? 4 : 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 2, 0, Math.PI * 2);
  ctx.clip();
  hero(ctx, kind, x - 2, y + r * 0.55, r / 26, { t: 0 });
  ctx.restore();
  if (st.cd > 0) {
    ctx.fillStyle = 'rgba(10,10,25,.62)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + st.cd * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function coin(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = '#b07a10';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#e0a21e';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.stroke();
}

export function chest(ctx: Ctx, x: number, y: number, s: number, tier: number): void {
  const body = tier >= 3 ? '#f0b429' : tier === 2 ? '#b9c4d6' : '#c07a35';
  const lid = tier >= 3 ? '#ffd76a' : tier === 2 ? '#dfe7f2' : '#d9904a';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.ink;
  ctx.fillStyle = body;
  rr(ctx, -20, -8, 40, 26, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = lid;
  rr(ctx, -21, -18, 42, 13, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.gold;
  ctx.fillRect(-4, -9, 8, 10);
  ctx.strokeRect(-4, -9, 8, 10);
  ctx.restore();
}

export function star(ctx: Ctx, x: number, y: number, r: number, n: number, fill: string, stroke: string): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const rr2 = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr2;
    const py = y + Math.sin(a) * rr2;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}
