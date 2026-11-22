// 把 docs/images/src/mockups.html 里的两张示意图导出成 PNG（2 倍清晰度）。
// 用法：node tools/render-mockups.cjs [字体 CSS 的路径]
//   需要 Playwright（npm i -D playwright && npx playwright install chromium）。
//   第二个参数可选：例如 node_modules/@fontsource/zcool-kuaile/400.css，用站酷快乐体出图；不传就用系统中文字体。
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const html = path.join(root, 'docs/images/src/mockups.html');
  const out = path.join(root, 'docs/images');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1140, height: 2200 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(html).href);
  if (process.argv[2]) await page.addStyleTag({ url: pathToFileURL(path.resolve(process.argv[2])).href });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  for (const [id, name] of [['main', 'main-screen.png'], ['combo', 'relay-combo.png'], ['horizontal', 'horizontal-layout.png']]) {
    await page.locator('#' + id).screenshot({ path: path.join(out, name) });
    console.log('写出', path.join('docs/images', name));
  }
  await browser.close();
})();
