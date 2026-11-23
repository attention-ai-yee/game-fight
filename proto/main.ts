/**
 * 原型入口。URL 参数：
 *   layout=h|v      画面方向（默认 h 横版）
 *   seed=数字        随机种子（默认随机）
 *   record=1        录素材模式：自动"憋"满再引爆，开头跳过空场，显示投放字幕
 *   caption=文字     录素材字幕，用 | 换行
 *   target=数字      录素材时要找的连锁长度（默认 20 跳）
 *   every=秒        录素材时换人的间隔（默认 12 秒，城墙危险时提前换）
 * 电脑上试：数字键 1/2/3 换人，A 开关自动。
 */
import { Battle, STEP } from '../client/assets/scripts/core/battle/Battle';
import { DEFAULT_CONFIG } from '../client/assets/scripts/core/battle/config';
import { Game } from './game';
import { H, LayoutKind, W } from './layout';

const q = new URLSearchParams(location.search);
const layout: LayoutKind = q.get('layout') === 'v' ? 'v' : 'h';
const seed = Number(q.get('seed')) || Math.floor(Math.random() * 100000) + 1;
const record = q.get('record') === '1';
const caption = q.get('caption') ?? undefined;
const target = Number(q.get('target')) || 20;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
let scale = 1;
let dpr = 1;

function resize(): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  scale = Math.min(vw / W, vh / H);
  dpr = Math.min(3, window.devicePixelRatio || 1);
  const cw = Math.floor(W * scale);
  const ch = Math.floor(H * scale);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
}
window.addEventListener('resize', resize);
resize();

const game = new Game({ layout, seed, record, caption });

/**
 * 录素材：先离线跑一遍（每隔 every 秒换一次人，城墙危险时提前换），
 * 找到第一次炸出 ≥ target 跳的那次换人，再从它前 2.5 秒开始正式演。之后的换人按同一份计划重放。
 */
function setupRecording(): void {
  const every = Number(q.get('every')) || 12;
  const plan = new Map<number, number>();
  const b = new Battle(DEFAULT_CONFIG, seed);
  let first = -1;
  let lastSwitch = -1;
  let since = 0;
  for (let s = 0; s < 150 * 30; s++) {
    since += STEP;
    // 第一次大连锁之后换得勤一点，保证 15 秒的视频里还能看到第二次连锁。
    if (since >= (first >= 0 ? 7 : every) || b.wallHp < b.wallMax * 0.3) {
      let best = -1;
      let bestN = 0;
      for (let k = 0; k < b.heroes.length; k++) {
        if (!b.canSwitch(k)) continue;
        const n = b.detonatable(k);
        if (n > bestN) {
          best = k;
          bestN = n;
        }
      }
      if (best >= 0 && b.switchTo(best)) {
        plan.set(s, best);
        lastSwitch = s;
        since = 0;
      }
    }
    b.step();
    for (const e of b.drainEvents()) if (e.t === 'chainEnd' && first < 0 && e.hops >= target) first = lastSwitch;
    if (first >= 0 && s > first + 40 * 30) break;
  }
  game.stepHook = (i) => {
    const k = plan.get(i);
    if (k !== undefined) game.switchHero(k);
    const soon = plan.get(i + 18);
    if (soon !== undefined) game.finger = { hero: soon, t: 0.75 };
  };
  game.fastForward(Math.max(0, (first < 0 ? 0 : first) - Math.round(2.5 / STEP)));
  (window as unknown as { __rec: unknown }).__rec = { first, found: first >= 0 };
}

if (record) setupRecording();

canvas.addEventListener('pointerdown', (ev) => {
  const r = canvas.getBoundingClientRect();
  game.tap(((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H);
  ev.preventDefault();
});
window.addEventListener('keydown', (ev) => {
  game.sfx.unlock();
  if (ev.key >= '1' && ev.key <= '3') game.switchHero(Number(ev.key) - 1);
  if (ev.key === 'a' || ev.key === 'A') game.toggleAuto();
  if (ev.key === ' ' && game.showHelp) {
    game.showHelp = false;
    game.started = true;
  }
});

let last = performance.now();
/** 先预约下一帧再画：某一帧出错也不会让整个游戏停住（错误记在 window.__err，录素材脚本会打印）。 */
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    game.update(dt);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    game.draw(ctx);
  } catch (err) {
    const w = window as unknown as { __err?: string[] };
    (w.__err ??= []).push(String((err as Error)?.stack ?? err));
    if (w.__err.length <= 3) console.error(err);
  }
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';
