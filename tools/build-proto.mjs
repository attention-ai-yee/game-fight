// 把浏览器原型打包成单文件 HTML：
//   dist/proto.html          完整网页，可以直接双击打开
//   dist/proto-artifact.html 发成分享链接用的版本（不带 <html>/<head>/<body> 外壳，由发布平台套上）
// 用法：npm run proto
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const r = await build({ entryPoints: ['proto/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2019', write: false, logLevel: 'warning' });
const js = r.outputFiles[0].text;
const script = `<script>${js}</script>`;
const html = readFileSync('proto/index.html', 'utf8').replace('<!--SCRIPT-->', () => script);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/proto.html', html);

const artifact = `<title>连锁守城原型</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap" rel="stylesheet">
<style>
  /* 游戏画面是固定的深色风格，不跟随浅色/深色主题切换 */
  :root { --bg: #15161f; --fg: #f4f1ea; color-scheme: dark; }
  html, body { height: 100%; margin: 0; background: var(--bg); color: var(--fg); overflow: hidden; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
  canvas { display: block; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
</style>
<canvas id="game" aria-label="连锁守城原型：点下方亮起的头像换人，引爆连锁"></canvas>
${script}
`;
writeFileSync('dist/proto-artifact.html', artifact);
console.log(`写出 dist/proto.html 和 dist/proto-artifact.html（${(html.length / 1024).toFixed(0)} KB）`);
