# 日麻算法引擎移植对拍记录（assets/tools/engine.js）

## 1. 移植范围与方式

- 源：`C:/Users/13601/WeChatProjects/miniprogram-1/miniprogram/utils/mahjong/` 下 9 个 CommonJS 模块（tile-core / shanten / agari / yaku / score / ukeire / point-est / generator / commentary），约 66KB。
- 目标：`assets/tools/engine.js`（单文件，普通 `<script>` 即可加载，无构建步骤）。
- 方式：脚本 `build.js` 将每个模块原样包进独立 IIFE `var X = (function (_deps) { ...原代码...; return module.exports })(_deps)`，文件头的 `require('./x.js')` 替换为 `_deps.x`，`module.exports = {...}` 替换为 `return {...}`；模块间依赖按拓扑序注入：

```
tileCore -> shanten -> agari -> yaku -> score -> ukeire -> pointEst -> generator -> commentary
```

- 算法逻辑逐字保留（未改任何函数体、常量、判定顺序），仅在文件末尾增加：`window.MJ = window.MJ || {}; window.MJ.engine = { tileCore, shanten, agari, yaku, score, ukeire, pointEst, generator, commentary };`
- 每个模块独立 IIFE 作用域，解决同名辅助函数冲突（point-est 与 yaku 各自的 `doraNext`/`calcHan`、commentary 的 `tileName`、ukeire 与 yaku 各自的 `countDora` 等）。

## 2. 产物

| 项 | 值 |
| --- | --- |
| 文件 | `assets/tools/engine.js` |
| 体积 | 68,497 bytes（66.9 KB），远小于 400KB 上限 |
| sha256 | `a4018994241cd1585dc16886cf37400da812eae57c976a25f56fb7e8a7815892`（2026-11-09 首次通过版） |
| 禁用 token 扫描 | `require(`、`module.exports`、`exports.`、`process.`、`fs.`、`__dirname`、`Buffer` 均 0 命中 |
| 顶层结构 | `window.MJ.engine = { tileCore, shanten, agari, yaku, score, ukeire, pointEst, generator, commentary }` |

## 3. 对拍方法

- 运行环境：Windows，Node v24.15.0；原模块用 `require()` 直接加载，移植版用 `vm.createContext({ window: {}, console })` 后 `vm.runInContext` 载入，模拟浏览器普通 script（无 CommonJS 环境），再取 `context.window.MJ.engine`。
- 手牌生成：固定种子线性同余 RNG（seed = 20261109）。20 组随机 14 张（每组独立洗 136 张牌墙后取前 14 张，保证同种牌不超过 4 张）；10 组构造和牌型（随机 4 面子 + 1 对子）。
- 每组手牌比较：`toCounts`、`tilesToString`、`parseTiles` 往返、`sortTiles`；`shanten`/`shantenChiitoi`/`shantenKokushi`/`shantenNormal`；`decomposeAll`/`isChiitoi`/`isKokushi`/`isAgari`；`calcHand`（役种/番数/符/和牌判定）；`calcPayment`（4 种支付模式：自摸/荣和·子/荣和·庄/放铳）；`ukeire`/`evaluateDiscards`；`buildOpt`/`isGoodShapeTenpai34`/`identifyYaku34`/`estimate`/`evaluateHand`；`generateCommentary`/`detectSeeds`。
- 引擎常量与工具函数：`SUITS`、`WINDS`、全 34 索引 `indexToTile`/`tileToIndex`/`isYaochu`、`buildWall(true/false)`、`parseTiles` 边界串。
- 符/点数全表：`score` 的 han 1–13 × fu 11 档（20/25/30/40/50/60/70/80/90/100/110）× 4 种支付模式，共 572 个单元格逐一比对。
- 生成器：`generateFuhan`、`generateHoikata`、`generateTraining` 在同一 RNG 序列下用同种子 `Math.random` 替身对拍（验证抽题逻辑与随机数消耗顺序完全一致）。
- 每个 check 直接做深比较（JSON.stringify 或 ===），任一差异记录到 diffs 并打印上下文。

## 4. 覆盖与结果

| 项 | 结果 |
| --- | --- |
| 手牌组数 | 30（20 随机 + 10 构造和牌），每组的向听/和牌/役种/符点均比对 |
| 检查项总数 | 1,688 |
| 差异数 | 0 |
| 符/点表格 | 572/572 一致 |
| 生成器用例 | 4/4 一致 |
| 结论 | **PARITY OK: 1688 项检查全部一致** |

### 30 组手牌摘要

| # | 类型 | 手牌 | 向听 | 和牌 | 番/符 | 役种 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 随机 14 张 | `89m17p50689s22345z` | 4 | false | — | 未和牌 |
| 2 | 随机 14 张 | `339m78p123589s255z` | 2 | false | — | 未和牌 |
| 3 | 随机 14 张 | `57m6679p24889s167z` | 3 | false | — | 未和牌 |
| 4 | 随机 14 张 | `256m448p125068s12z` | 3 | false | — | 未和牌 |
| 5 | 随机 14 张 | `3469m49p357s13777z` | 4 | false | — | 未和牌 |
| 6 | 随机 14 张 | `1445778m123489p4z` | 2 | false | — | 未和牌 |
| 7 | 随机 14 张 | `13478m11p399s3467z` | 4 | false | — | 未和牌 |
| 8 | 随机 14 张 | `11m45779p7s123677z` | 3 | false | — | 未和牌 |
| 9 | 随机 14 张 | `27789m4569p40s135z` | 3 | false | — | 未和牌 |
| 10 | 随机 14 张 | `357m45678p1237s57z` | 2 | false | — | 未和牌 |
| 11 | 随机 14 张 | `1146m123p2689s367z` | 3 | false | — | 未和牌 |
| 12 | 随机 14 张 | `599m46789p1s12345z` | 4 | false | — | 未和牌 |
| 13 | 随机 14 张 | `7789m6667p57s1136z` | 2 | false | — | 未和牌 |
| 14 | 随机 14 张 | `446889m22679p23s6z` | 3 | false | — | 未和牌 |
| 15 | 随机 14 张 | `1266m68p45689s127z` | 2 | false | — | 未和牌 |
| 16 | 随机 14 张 | `234067889m1234p3s` | 1 | false | — | 未和牌 |
| 17 | 随机 14 张 | `17m11279p2589s146z` | 5 | false | — | 未和牌 |
| 18 | 随机 14 张 | `446m124669p1336s6z` | 3 | false | — | 未和牌 |
| 19 | 随机 14 张 | `11368m1899p16s166z` | 3 | false | — | 未和牌 |
| 20 | 随机 14 张 | `1389m135578p1236z` | 3 | false | — | 未和牌 |
| 21 | 自造和牌型 | `345567p666s33555z` | -1 | true | 2 番 / 40 符 | 役牌 白:1, 宝牌:1 |
| 22 | 自造和牌型 | `111123999m44678p` | -1 | true | 4 番 / 40 符 | 立直:1, 门前清自摸和:1, 宝牌:2 |
| 23 | 自造和牌型 | `444m11p111222s666z` | -1 | true | 10 番 / 50 符 | 立直:1, 役牌 發:1, 对对和:2, 三暗刻:2, 宝牌:4 |
| 24 | 自造和牌型 | `11456777p123888s` | -1 | true | 2 番 / 30 符 | 门前清自摸和:1, 宝牌:1 |
| 25 | 自造和牌型 | `122334789p55599s` | -1 | true | 2 番 / 40 符 | 立直:1, 一发:1 |
| 26 | 自造和牌型 | `678888m234p34555s` | -1 | true | 5 番 / 30 符 | 立直:1, 门前清自摸和:1, 断幺九:1, 宝牌:2 |
| 27 | 自造和牌型 | `455667m56788p111z` | -1 | true | 0 番 / 40 符 |  |
| 28 | 自造和牌型 | `77m234555p789999s` | -1 | true | 5 番 / 40 符 | 立直:1, 门前清自摸和:1, 海底摸月:1, 宝牌:2 |
| 29 | 自造和牌型 | `11234m345666s555z` | -1 | true | 2 番 / 40 符 | 立直:1, 役牌 白:1 |
| 30 | 自造和牌型 | `223344666p55s333z` | -1 | true | 6 番 / 40 符 | 门前清自摸和:1, 场风 西:1, 自风 西:1, 一杯口:1, 宝牌:2 |

## 5. 已知差异

无。30 组手牌、1,688 项检查、572 个符点单元格与 4 个生成器用例全部与源模块一致，未发现无法避免的差异。

说明：生成器对拍时用固定序列替换 `Math.random`（源模块与移植版消耗同一序列），因此比较的是抽题逻辑本身；真实浏览器中仍使用原生 `Math.random`。

## 6. 复现命令

临时脚本放在系统临时目录，不进入站点：`C:/Users/13601/AppData/Local/Temp/mj-engine-build/`（`build.js` 生成 engine.js，`test.js` 执行对拍）。

```bash
# 1) 由源模块生成单文件引擎
node C:/Users/13601/AppData/Local/Temp/mj-engine-build/build.js

# 2) 与原 CommonJS 模块对拍（30 组手牌 + 全量符点表）
node C:/Users/13601/AppData/Local/Temp/mj-engine-build/test.js C:/Users/13601/CodeBuddy/20261107152343/assets/tools/engine.js
```

最近一次运行输出（节选）：

```json
{ "checks": 1688, "diffs": 0, "hands": 30, "scoreCells": 572, "bytes": 68497, "kb": 66.9, "bannedHits": [] }
```

## 7. 浏览器实测（/tools/）

- 页面：`http://127.0.0.1:8767/tools/`（HTTP 200，标题「麻将练习工具 · 熊熊雀庄」）。
- 引入方式：页面内普通 `<script src="/assets/tools/engine.js"></script>`（相对站点根，实际请求 `http://127.0.0.1:8767/assets/tools/engine.js`，HTTP 200，68,497 bytes）。未使用 `type="module"`、无打包器、无 `require`。
- 控制台：加载与调用期间无任何 console 输出/报错。
- 在页面上下文实际调用并核对（与 Node 端同参数结果完全一致）：

| 调用 | 结果 |
| --- | --- |
| `Object.keys(window.MJ.engine)` | `tileCore, shanten, agari, yaku, score, ukeire, pointEst, generator, commentary` |
| `shanten.shanten(counts('123m456p789s11122z'))` | `-1` |
| `agari.isAgari(counts(...))` | `true` |
| `shanten.shanten(counts('123m456p789s1122z'))` | `0` |
| `yaku.calcHand({...立直/场风东/自风东...})` | `3 番 40 符`，役种 `立直:1, 场风 東:1, 自风 東:1` |
| `score.calcPayment(3, 40, {dealer:false,tsumo:false})` | `5200`（荣和 5200 点） |
| `score.calcPayment(3, 40, {dealer:true,tsumo:false})` | `7700`（荣和 7700 点） |
| `ukeire.ukeire(13 张形, ...)` | 进张 `total=4` |
| `pointEst.estimate(...)` | `1300` |
| `generator.generateTraining` / `commentary.generateCommentary` | 均为 function，可调用 |

结论：`assets/tools/engine.js` 在 `/tools/` 以普通 script 加载无报错，`window.MJ.engine` 九个子对象方法可正常调用，浏览器端结果与 Node 端逐项一致。
