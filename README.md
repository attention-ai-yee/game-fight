# Game Fight（暂定名）

抖音小游戏 · 竖屏 + 横版守城 · 连锁引爆 · 纯广告变现、投流回本。

怪从右边成群冲向城墙，英雄在城前自动开打。等怪挤满城下，点一下换人，印记像导火索一样一路连锁，炸穿全场。

## 文档

- 设计文档：[docs/游戏设计文档.md](docs/游戏设计文档.md)（v0.2）
- 市场调研与差异化：[docs/市场调研与差异化.md](docs/市场调研与差异化.md)
- 示意图：[竖屏横版战斗](docs/images/horizontal-layout.png)、[竖向通道（对照组）](docs/images/main-screen.png)

## 目录

```
client/assets/scripts/core/battle/   战斗核心（纯逻辑，不依赖 Cocos 和抖音接口）：原型、正式版、模拟器、录素材共用
  Battle.ts                           守城、波次、三英雄、印记、换人、多米诺连锁
  config.ts                           数值（初版占位）
proto/                                浏览器原型（canvas 灰盒画面）
tests/                                单元测试（vitest）
tools/                                打包原型、数值模拟、批量录投放视频、导出示意图
docs/                                 设计文档、调研、示意图
```

正式游戏工程以后放在 `client/`（Cocos Creator 3.8），分层规则沿用《御兽山海》：`core/` 里不能 `import 'cc'`、不能用 `tt`。

## 常用命令

```bash
npm install          # 第一次
npm test             # 战斗核心单元测试（含"憋得越久连锁越长、城墙越危险"）
npm run typecheck    # 类型检查
npm run sim          # 换人节奏对照表：平均连锁、城墙最低剩多少、推关速度
npm run proto        # 打包浏览器原型 → dist/proto.html，双击就能玩
```

### 原型怎么玩

打开 `dist/proto.html`（电脑或手机浏览器都行）；`dist/proto-artifact.html` 是发成分享链接用的版本。下面的头像亮起来、显示"引爆 N"时，点它换人。电脑上可以按数字键 1/2/3 换人，按 A 开关自动。底部按钮可以切换横版/竖向、开关自动和声音、重开。

网址参数：`?layout=v` 竖向；`?seed=5` 固定随机种子；`?record=1&caption=第一行|第二行` 录素材模式。

### 批量录投放视频

```bash
npm run proto
node tools/record-creatives.cjs --seeds 3,5,8 --layouts h,v \
  --captions "憋到城下挤满|一键全炸！;这一下能连多少？" \
  --font node_modules/@fontsource/zcool-kuaile/400.css
```

需要 Playwright 和 ffmpeg。每个组合录 15 秒、720×1280 的 mp4，放在 `recordings/`（不提交到仓库），附一份 `清单.csv`。
