// 数值快速检查（设计文档 4.4 的"憋"）：每隔 N 秒换一次人，看平均连锁、长连锁占比、城墙最低剩多少、推关速度。
// 用法：npm run sim [-- 秒数]
import { Battle, STEP } from '../client/assets/scripts/core/battle/Battle';
import { DEFAULT_CONFIG } from '../client/assets/scripts/core/battle/config';

const SECONDS = Number(process.argv[2] ?? 180);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function bestCandidate(b: Battle): number {
  let best = -1;
  let bestN = -1;
  for (let k = 0; k < b.heroes.length; k++) {
    if (!b.canSwitch(k)) continue;
    const n = b.detonatable(k);
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function measure(every: number | 'auto') {
  const hops: number[] = [];
  let broken = 0;
  let stage = 0;
  let wallLow = 0;
  for (const seed of SEEDS) {
    const b = new Battle(DEFAULT_CONFIG, seed);
    if (every === 'auto') b.setAuto(true);
    let t = 0;
    let low = 1;
    for (let s = 0; s < SECONDS * 30; s++) {
      t += STEP;
      if (every !== 'auto' && t >= every) {
        const k = bestCandidate(b);
        if (k >= 0 && b.switchTo(k)) t = 0;
      }
      b.step();
      low = Math.min(low, b.wallHp / b.wallMax);
      for (const e of b.drainEvents()) {
        if (e.t === 'chainEnd') hops.push(e.hops);
        if (e.t === 'wallBroken') broken++;
      }
    }
    stage += b.stage;
    wallLow += low;
  }
  hops.sort((a, c) => a - c);
  const n = SEEDS.length;
  return {
    mean: hops.reduce((a, c) => a + c, 0) / Math.max(1, hops.length),
    p90: hops[Math.floor(hops.length * 0.9)] ?? 0,
    long: hops.filter((h) => h >= DEFAULT_CONFIG.chain.chestTiers[0]).length / Math.max(1, hops.length),
    wallLow: wallLow / n,
    broken: broken / n,
    stage: stage / n,
  };
}

console.log(`${SECONDS} 秒 × ${SEEDS.length} 个种子，不升级`);
console.log('换人节奏      平均连锁  最长10%   ≥15跳占比  城墙最低  城破次数  到第几关');
for (const every of ['auto', 5, 7, 9, 12, 15, 18] as const) {
  const r = measure(every);
  const label = every === 'auto' ? '自动(每9秒)' : `每 ${every} 秒`;
  console.log(
    `${label.padEnd(10)}  ${r.mean.toFixed(1).padStart(6)}跳  ≥${String(r.p90).padStart(3)}跳  ${(r.long * 100).toFixed(0).padStart(6)}%  ${(r.wallLow * 100).toFixed(0).padStart(6)}%  ${r.broken.toFixed(2).padStart(7)}  ${r.stage.toFixed(1).padStart(6)}`,
  );
}
