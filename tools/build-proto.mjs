// 把浏览器原型打包成一个单文件 HTML：dist/proto.html（可以直接双击打开，也可以发成链接在手机上玩）。
// 用法：npm run proto
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const r = await build({ entryPoints: ['proto/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2019', write: false, logLevel: 'warning' });
const js = r.outputFiles[0].text;
const html = readFileSync('proto/index.html', 'utf8').replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/proto.html', html);
console.log(`写出 dist/proto.html（${(html.length / 1024).toFixed(0)} KB）`);
