// 批量录投放素材（设计文档第 12 节"录素材模式"）。
// 每个组合打开一次 dist/proto.html?record=1，录 15 秒，转成 720×1280 的 mp4。
//
// 用法（先 npm run proto）：
//   node tools/record-creatives.cjs [--seeds 3,5,8] [--layouts h,v] [--seconds 15]
//        [--captions "憋到城下挤满|一键全炸！;这一下能连多少？"] [--font 字体CSS路径] [--out recordings]
// 需要 Playwright（npm i -g playwright 或项目里装）和 ffmpeg。
// 输出：recordings/<方向>-种子<N>-字幕<K>.mp4，以及 recordings/清单.csv。
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const seeds = arg('seeds', '3,5,8').split(',').map(Number);
const layouts = arg('layouts', 'h,v').split(',');
const seconds = Number(arg('seconds', '15'));
const captions = arg('captions', '憋到城下挤满|一键全炸！;这一下能连多少？;火越烧越旺|一口气全炸！').split(';');
const font = arg('font', '');
const out = path.resolve(arg('out', 'recordings'));
const page = pathToFileURL(path.resolve('dist/proto.html')).href;

(async () => {
  if (!fs.existsSync('dist/proto.html')) throw new Error('先运行 npm run proto');
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(out, '.raw-'));
  const browser = await chromium.launch();
  const rows = ['文件,方向,种子,字幕,首个大连锁所在步'];
  for (const layout of layouts) {
    for (const seed of seeds) {
      for (let ci = 0; ci < captions.length; ci++) {
        const ctx = await browser.newContext({
          viewport: { width: 720, height: 1280 },
          deviceScaleFactor: 1,
          recordVideo: { dir: tmp, size: { width: 720, height: 1280 } },
        });
        const p = await ctx.newPage();
        const born = Date.now();
        // 录制时不连外网字体；用 --font 传本地字体 CSS
        await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
        const q = new URLSearchParams({ record: '1', seed: String(seed), layout, caption: captions[ci] });
        await p.goto(`${page}?${q}`);
        if (font) await p.addStyleTag({ url: pathToFileURL(path.resolve(font)).href });
        await p.evaluate(() => document.fonts.ready);
        await p.waitForFunction(() => document.body.dataset.ready === '1');
        const rec = await p.evaluate(() => window.__rec);
        const start = (Date.now() - born) / 1000 + 0.3;
        await p.waitForTimeout(seconds * 1000 + 600);
        const errs = await p.evaluate(() => window.__err || []);
        if (errs.length) console.log(`  页面报错 ${errs.length} 次，第一次：${errs[0].split('\n').slice(0, 3).join(' | ')}`);
        const video = p.video();
        await ctx.close();
        const raw = await video.path();
        const name = `${layout === 'h' ? '横版' : '竖向'}-种子${seed}-字幕${ci + 1}.mp4`;
        execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', start.toFixed(2), '-i', raw, '-t', String(seconds), '-vf', 'scale=720:1280,fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', path.join(out, name)]);
        fs.rmSync(raw);
        rows.push(`${name},${layout},${seed},"${captions[ci].replace(/\|/g, ' / ')}",${rec && rec.found ? rec.first : '没找到'}`);
        console.log(`录好 ${name}${rec && rec.found ? '' : '（这个种子没找到大连锁，换个种子）'}`);
      }
    }
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(out, '清单.csv'), '﻿' + rows.join('\n') + '\n');
  console.log(`完成：${out}`);
})();
