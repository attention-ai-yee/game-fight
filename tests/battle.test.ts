import { describe, expect, it } from 'vitest';
import { Battle, STEP } from '../client/assets/scripts/core/battle/Battle';
import { BattleConfig, DEFAULT_CONFIG } from '../client/assets/scripts/core/battle/config';
import { BattleEvent } from '../client/assets/scripts/core/battle/types';

/** 测试用配置：怪不动、血很厚，只看连锁规则本身。 */
function still(): BattleConfig {
  const c = structuredClone(DEFAULT_CONFIG);
  for (const k of ['grunt', 'runner', 'tank'] as const) c.enemies[k].speed = 0;
  return c;
}

/** 摆好怪以后换人，跑到连锁结束，返回所有事件。 */
function detonate(b: Battle, heroIndex: number) {
  expect(b.switchTo(heroIndex)).toBe(true);
  const events: BattleEvent[] = [];
  for (let i = 0; i < 900; i++) {
    b.step();
    events.push(...b.drainEvents());
    if (!b.chain.active) break;
  }
  const end = events.find((e) => e.t === 'chainEnd');
  const explodes = events.filter((e): e is Extract<BattleEvent, { t: 'explode' }> => e.t === 'explode');
  return { events, hops: end && end.t === 'chainEnd' ? end.hops : 0, explodes };
}

const SWORD = 0;
const MAGE = 1;
const ARCHER = 2;

describe('连锁：起点和印记归属', () => {
  it('换上来的英雄不会引爆自己的印记', () => {
    const b = new Battle(still(), 1, { spawn: false, active: ARCHER });
    b.addEnemy({ x: 120, hp: 999, marks: { burn: 2 } });
    b.addEnemy({ x: 180, hp: 999, marks: { burn: 2 } });
    const r = detonate(b, MAGE);
    expect(r.events.some((e) => e.t === 'chainStart')).toBe(false);
    expect(r.hops).toBe(0);
  });

  it('从离城墙最近的带印记的怪开始', () => {
    const b = new Battle(still(), 1, { spawn: false });
    b.addEnemy({ x: 300, hp: 999, marks: { burn: 1 } });
    const near = b.addEnemy({ x: 140, hp: 999, marks: { frost: 1 } });
    b.addEnemy({ x: 110, hp: 999 }); // 没印记，不算
    const r = detonate(b, MAGE);
    const start = r.events.find((e) => e.t === 'chainStart');
    expect(start && start.t === 'chainStart' && start.seed).toBe(near.id);
  });
});

describe('连锁：三种传导方式', () => {
  it('燃烧：圆形范围内带印记的怪依次被点燃，范围外的不会', () => {
    const b = new Battle(still(), 1, { spawn: false });
    b.addEnemy({ x: 120, hp: 999, marks: { burn: 1 } });
    b.addEnemy({ x: 190, hp: 999, marks: { burn: 1 } });
    b.addEnemy({ x: 260, hp: 999, marks: { burn: 1 } });
    b.addEnemy({ x: 600, hp: 999, marks: { burn: 1 } });
    const r = detonate(b, ARCHER);
    expect(r.hops).toBe(3);
  });

  it('没印记的怪只挨炸、不传，中间断开连锁就停', () => {
    const gap = new Battle(still(), 1, { spawn: false });
    gap.addEnemy({ x: 120, hp: 999, marks: { burn: 1 } });
    gap.addEnemy({ x: 185, hp: 999 });
    gap.addEnemy({ x: 250, hp: 999, marks: { burn: 1 } });
    expect(detonate(gap, ARCHER).hops).toBe(1);

    const filled = new Battle(still(), 1, { spawn: false });
    filled.addEnemy({ x: 120, hp: 999, marks: { burn: 1 } });
    filled.addEnemy({ x: 185, hp: 999, marks: { burn: 1 } });
    filled.addEnemy({ x: 250, hp: 999, marks: { burn: 1 } });
    expect(detonate(filled, ARCHER).hops).toBe(3);
  });

  it('冰霜：冰锥沿同一排传到远处，不会传到别的排', () => {
    const b = new Battle(still(), 1, { spawn: false });
    b.addEnemy({ x: 120, row: 0, hp: 999, marks: { frost: 1 } });
    const far = b.addEnemy({ x: 330, row: 0, hp: 999, marks: { frost: 1 } });
    b.addEnemy({ x: 330, row: 2, hp: 999, marks: { frost: 1 } });
    const r = detonate(b, MAGE);
    expect(r.hops).toBe(2);
    expect(r.explodes[0].shards).toEqual([{ x: far.x, y: far.y }]);
  });

  it('破甲：先把周围的怪往爆点吸，原本够不着的也能连上', () => {
    const control = new Battle(still(), 1, { spawn: false });
    control.addEnemy({ x: 120, hp: 999, marks: { burn: 1 } });
    control.addEnemy({ x: 220, hp: 999, marks: { armor: 1 } });
    expect(detonate(control, ARCHER).hops).toBe(1);

    const b = new Battle(still(), 1, { spawn: false });
    b.addEnemy({ x: 120, hp: 999, marks: { armor: 2 } });
    const pulled = b.addEnemy({ x: 220, hp: 999, marks: { armor: 1 } });
    const r = detonate(b, MAGE);
    expect(r.hops).toBe(2);
    expect(r.explodes[0].pulled).toBe(true);
    expect(pulled.x).toBeLessThan(220);
  });

  it('被炸死的怪照样会爆（尸体也传）', () => {
    const b = new Battle(still(), 1, { spawn: false });
    b.addEnemy({ x: 120, hp: 999, marks: { burn: 1 } });
    b.addEnemy({ x: 185, hp: 1, marks: { burn: 1 } });
    b.addEnemy({ x: 250, hp: 999, marks: { burn: 1 } });
    expect(detonate(b, ARCHER).hops).toBe(3);
  });
});

describe('连锁：节奏和伤害', () => {
  it('越往后两跳之间越快，最快不低于下限', () => {
    const b = new Battle(still(), 1, { spawn: false });
    expect(b.hopInterval(0)).toBeGreaterThan(b.hopInterval(10));
    expect(b.hopInterval(10)).toBeGreaterThan(b.hopInterval(20));
    expect(b.hopInterval(200)).toBe(DEFAULT_CONFIG.chain.intervalMin);
  });

  it('越往后每一跳越疼', () => {
    const b = new Battle(still(), 1, { spawn: false });
    for (let i = 0; i < 6; i++) b.addEnemy({ x: 120 + i * 60, hp: 9999, marks: { burn: 1 } });
    const r = detonate(b, ARCHER);
    expect(r.hops).toBe(6);
    for (let i = 1; i < r.explodes.length; i++) expect(r.explodes[i].dmg).toBeGreaterThan(r.explodes[i - 1].dmg);
  });

  it('连锁够长掉宝箱：15 / 30 / 60 跳对应木、银、金', () => {
    const b = new Battle(still(), 1, { spawn: false });
    for (let i = 0; i < 16; i++) b.addEnemy({ x: 120 + i * 50, row: 1, hp: 9999, marks: { burn: 1 } });
    const end = detonate(b, ARCHER).events.find((e) => e.t === 'chainEnd');
    expect(end && end.t === 'chainEnd' && end.chest).toBe(1);
    expect(b.bestChain).toBe(16);
  });

  it('连锁进行时不能再换人', () => {
    const b = new Battle(still(), 1, { spawn: false });
    for (let i = 0; i < 5; i++) b.addEnemy({ x: 120 + i * 60, hp: 999, marks: { burn: 1 } });
    expect(b.switchTo(ARCHER)).toBe(true);
    expect(b.chain.active).toBe(true);
    b.switchCooldown = 0;
    expect(b.canSwitch(SWORD)).toBe(false);
  });
});

describe('印记', () => {
  it('燃烧会慢慢蔓延到旁边没着火的怪', () => {
    const b = new Battle(still(), 1, { spawn: false, active: ARCHER });
    b.addEnemy({ x: 300, hp: 9999, marks: { burn: 3 } });
    const near = b.addEnemy({ x: 340, hp: 9999 });
    for (let i = 0; i < 40; i++) b.step();
    expect(near.marks.burn).toBeGreaterThan(0);
  });

  it('冰霜叠满 5 层冻住', () => {
    const b = new Battle(still(), 1, { spawn: false, active: SWORD });
    const e = b.addEnemy({ x: 400, hp: 9999, marks: { frost: 4 } });
    (b as unknown as { addMark(e: unknown, k: string): void }).addMark(e, 'frost');
    expect(e.frozen).toBeGreaterThan(0);
  });

  it('印记 8 秒不叠就消失', () => {
    const b = new Battle(still(), 1, { spawn: false, active: SWORD });
    const e = b.addEnemy({ x: 900, hp: 9999, marks: { frost: 3 } });
    for (let i = 0; i < Math.ceil(DEFAULT_CONFIG.markDecay / STEP) + 2; i++) b.step();
    expect(e.marks.frost).toBe(0);
  });
});

describe('整场战斗', () => {
  it('同样的种子和操作，结果完全一样', () => {
    const run = () => {
      const b = new Battle(DEFAULT_CONFIG, 7);
      b.setAuto(true);
      for (let i = 0; i < 3000; i++) b.step();
      return { gold: b.gold, stage: b.stage, wave: b.wave, best: b.bestChain, wall: b.wallHp, n: b.enemies.length };
    };
    expect(run()).toEqual(run());
  });

  it('城墙被打穿：退回上一关（最低第 1 关），清场，城墙回满', () => {
    const c = structuredClone(DEFAULT_CONFIG);
    c.wallMaxHp = 5;
    const b = new Battle(c, 1);
    const events: BattleEvent[] = [];
    for (let i = 0; i < 30 * 60 && !events.some((e) => e.t === 'wallBroken'); i++) {
      b.step();
      events.push(...b.drainEvents());
    }
    expect(events.some((e) => e.t === 'wallBroken')).toBe(true);
    expect(b.stage).toBe(1);
    expect(b.enemies.length).toBe(0);
    expect(b.wallHp).toBe(b.wallMax);
  });

  it('挂机（自动换人）4 分钟能稳定推到第 3 关，不会城破（"不卡死"）', () => {
    for (const seed of [1, 2, 3]) {
      const b = new Battle(DEFAULT_CONFIG, seed);
      b.setAuto(true);
      let broken = 0;
      for (let i = 0; i < 240 * 30; i++) {
        b.step();
        for (const e of b.drainEvents()) if (e.t === 'wallBroken') broken++;
      }
      expect(broken).toBe(0);
      expect(b.stage).toBeGreaterThanOrEqual(3);
    }
  });

  it('"憋"：等得越久连锁越长，但城墙也越危险（设计文档 4.4）', () => {
    const measure = (every: number) => {
      const hops: number[] = [];
      let wallLow = 0;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const b = new Battle(DEFAULT_CONFIG, seed);
        let t = 0;
        let low = 1;
        for (let s = 0; s < 180 * 30; s++) {
          t += STEP;
          if (t >= every) {
            let best = -1;
            let bestN = -1;
            for (let k = 0; k < 3; k++) {
              if (!b.canSwitch(k)) continue;
              const n = b.detonatable(k);
              if (n > bestN) {
                best = k;
                bestN = n;
              }
            }
            if (best >= 0 && b.switchTo(best)) t = 0;
          }
          b.step();
          low = Math.min(low, b.wallHp / b.wallMax);
          for (const e of b.drainEvents()) if (e.t === 'chainEnd') hops.push(e.hops);
        }
        wallLow += low;
      }
      return { mean: hops.reduce((a, c) => a + c, 0) / hops.length, wallLow: wallLow / 6 };
    };
    const quick = measure(5);
    const patient = measure(12);
    expect(patient.mean).toBeGreaterThan(quick.mean * 1.8);
    expect(patient.wallLow).toBeLessThan(quick.wallLow - 0.3);
  });
});
