# /tools/ 模块契约（CONTRACT）

本文件是「工具」分页外壳与 5 个练习模块之间的接口约定。
外壳文件由 shell-dev 维护：`tools/index.html`、`assets/tools/tools.css`、`assets/tools/tiles.js`、
`assets/tools/data.js`、`assets/tools/app.js`。模块只写自己的
`assets/tools/modules/{name}.js` 与 `assets/tools/modules/{name}.css`。

- 模块名：`hoikata`（何切）、`fuhan`（算番）、`training`（牌效训练）、`scoretable`（番符表）、`yaku`（役种一览）
- 脚本与样式加载顺序（`tools/index.html`，均为 `defer`，按序执行）：
  `engine.js` → `tiles.js` → `data.js` → `modules/hoikata.js` → `fuhan.js` → `training.js` →
  `scoretable.js` → `yaku.js` → `app.js`。模块 CSS 在 `head` 中位于 `tools.css` 之后。

## 1. 模块入口

```js
window.MJ = window.MJ || {};
window.MJ.modules = window.MJ.modules || {};

MJ.modules.hoikata = {
  init: function (panel) {
    // panel 是已清空的 <section id="panel-hoikata">，直接往里写 DOM
  }
};
```

规则：

1. **一个模块只注册一次**，`init(panel)` 由外壳在**首次激活该 tab 时调用一次**。
2. 调用前外壳已执行 `panel.innerHTML = ''`，并移除占位空状态；`panel` 上可能带
   `data-module-state="ready"`。
3. 模块可以同步初始化，也可以自己异步加载数据（`MJ.data.loadTraining()` 等）后渲染；
   异步期间请模块自己在 panel 内放骨架/加载态（`.tools-skeleton`、`.tools-empty`）。
4. 不要操作 tab、不要改 `location.hash`、不要动其它 panel。
5. 重复激活不会再次 `init`；若模块需要响应「重新进入」，监听
   `document` 上的 `mj:tools-activate`（`event.detail.name`、`event.detail.panel`）。
6. 初始化抛错时外壳会捕获并在 panel 内显示「模块不可用」空状态，错误同时打到 console。
7. 若脚本晚于 `app.js` 才注册，可在注册后派发：

```js
document.dispatchEvent(new CustomEvent('mj:module-ready', { detail: { name: 'hoikata' } }));
```

外壳会重试初始化当前 tab。

## 2. 可见 DOM 契约

| 元素 | id / 选择器 | 说明 |
| --- | --- | --- |
| 标签页 | `#tab-hoikata` `#tab-fuhan` `#tab-training` `#tab-scoretable` `#tab-yaku` | `role=tab`，`aria-selected`，`data-tab=name` |
| 面板 | `#panel-hoikata` `#panel-fuhan` `#panel-training` `#panel-scoretable` `#panel-yaku` | `role=tabpanel`，非当前面板带 `hidden` |
| 标签栏 | `.tools-tabbar > .tools-tabs` | 吸顶，移动端横向滚动 |
| 页头 | `.tools-head` | 标题「麻将练习工具」 |
| 当前 tab | `document.documentElement.dataset.toolsTab` | 值即模块名，供 CSS 钩子使用 |

外壳公开 API（`window.MJ.tools`）：

```js
MJ.tools.modules            // [{name,label,title,desc}, ...]
MJ.tools.activate(name)     // 切换面板（不写 hash）
MJ.tools.go(name)           // 切换面板并更新 hash
MJ.tools.retry(name)        // 清空初始化标记并重试 init
MJ.tools.isReady(name)      // 是否已成功 init
MJ.tools.current()          // 当前模块名
```

## 3. 可用 CSS 类（全部在 `assets/tools/tools.css`）

模块**必须复用**这些公共类，只把私有样式写进 `modules/{name}.css`。

### 布局
- `.tools-grid` + `.tools-grid--2` / `.tools-grid--3`：响应式栅格（≤1024 三列变两列，≤768 变单列）
- `.tools-row`（可加 `.tools-row--between`）、`.tools-stack`、`.tools-spacer`、`.tools-divider`
- `.tools-card` > `.tools-card-head`（`.tools-card-title` + `.tools-card-sub`）+ `.tools-card-body`；`.tools-card.is-flat`
- `.tools-section-title`：带右侧横线的分组标题

### 控件
- `.tools-btn`，变体 `.tools-btn-primary` / `.tools-btn-ghost` / `.tools-btn-danger`，
  尺寸 `.tools-btn-sm` / `.tools-btn-lg`，禁用 `[disabled]` 或 `.is-disabled`
- `.tools-seg` > `.tools-seg-btn`（当前项 `.is-active`）：分段控件
- `.tools-table-wrap` > `table.tools-table`，单元格辅助 `.is-num` / `.is-strong`

### 信息
- `.tools-badge`，配色 `.is-blue` `.is-green` `.is-amber` `.is-red` `.is-outline`
- `.tools-empty`（`.is-error`）> `.tools-empty-icon` + `h3` + `p` + `.tools-empty-actions`
- `.tools-note`（`.is-warn`）、`.tools-kv`（`dl` 两列）、`.tools-mono`、`.tools-muted`
- `.tools-skeleton`：加载骨架条

### 牌面
- `.mj-tiles`，尺寸 `.mj-tiles--xs|sm|md|lg|xl`，长手牌可加 `.is-scroll`
- `.mj-tile`，状态 `.is-win`（高亮和牌张/推荐张）、`.is-dim`（弱化）、`.is-clickable`

## 4. `MJ.tiles` 牌面渲染

```js
MJ.tiles.render(['1m','2m','3m','0p','5s','7z'], { win: [3], size: 'lg' })
// -> '<div class="mj-tiles mj-tiles--lg" role="group" aria-label="一万、二万、三万、赤五筒、五索、红中">…</div>'

MJ.tiles.mount('#hand', '123m456p789s11z', { gap: 4 }); // 写进容器并返回容器
```

- 牌名：`1m–9m` 万、`1p–9p` 筒、`1s–9s` 索、`1z–7z` 字（东南西北白发中）；
  `0m/0p/0s` = 赤 5；也接受 `123m` 连写、`{suit:'m',rank:5,red:true}`。
- `opts.win`：高亮下标数组（也接受牌名或 `true`）；`opts.red`：把对应下标的 5 变赤 5；
  `opts.size`：`xs|sm|md|lg|xl` 或数字宽度；`opts.gap`：牌间距；`opts.className`：附加类名。
- `MJ.tiles.KEYS`：34 张标准牌；`MJ.tiles.all()`；`MJ.tiles.redFives()`；
  `MJ.tiles.nameOf('4m') === '四万'`；`MJ.tiles.keyOf({suit:'p',rank:0}) === '0p'`。
- 图片路径：`assets/tools/tiles/{key}.png`（34 张 + `back.png`）。牌图 **自带白底与立体边**，
  不要再给 `.mj-tile` 加背景/边框；需要和牌高亮时用 `.is-win`。
- 无障碍：每个 `img` 带 `alt="四万"`，外层 `role="group"` + 中文 `aria-label`。

## 5. `MJ.data` 数据加载

```js
MJ.data.loadTraining().then(function (list) { /* 300 条 */ });
MJ.data.loadYaku().then(function (list) { /* 123 条 */ });
```

- 两个方法都返回 `Promise<Array>`，成功后缓存（重复调用不发请求）；失败不缓存，可重试。
- 失败抛出的 `Error.message` 是可直接展示的中文说明，例如：
  `无法加载「牌效训练题库」数据（…/data/training.json）：HTTP 404`。
- `MJ.data.get('training'|'yaku')` 取同步缓存；`MJ.data.clear(name?)` 清缓存。
- 数据格式：
  - `training.json`：数组，字段 `_id,id,level,body,draw,roundWind,seatWind,riichi,ippatsu,doraIndicators,uraIndicators,recommend,ukeire,shantenAfter,note`。
    其中 `body` / `draw` / `doraIndicators` / `uraIndicators` / `recommend` 为牌名数组或字符串（见源数据）。
  - `yaku.json`：数组，字段 `name,han,hanTab,cat,openHan,dreamClear,keywords,desc,hand,win,doraIndicator`。

## 6. `MJ.engine`（只读，勿改）

`assets/tools/engine.js` 是引擎层，加载后挂在 `window.MJ.engine`，含
`tileCore / shanten / agari / yaku / score / ukeire / pointEst / generator / commentary`。
模块只调用，不要修改该文件。

## 7. 样式约定

- 颜色只用 `shell.css` 的 token：`--accent #2563EB`、`--ink #0F172A`、`--body #475569`、
  `--muted #64748B`、`--line #E2E8F0`、`--bg #F8FAFC`、`--surface #FFF`、`--radius 14px`、`--shadow-1/2`。
- 模块私有类名统一加模块前缀（如 `.hoikata-*`、`.yaku-*`），避免与外层冲突。
- 断点：`1024px` / `768px` / `520px` / `390px`；触控目标不小于 36px 高。
- 不改 `html { overflow-y: scroll }`，不在导航激活态加粗。

## 8. 页面结构与部署

- 页面：`tools/index.html`，`body.site-page.tools-page`，无页脚，底部 72px 留白（≤520px 为 48px）。
- 顶栏导航顺序：首页 / 规则 / **工具** / 关于我们 / 活动公告 / 联系方式 / FAQ。
- 部署：站点由 `public/` 目录起服务。`_build/refresh.ps1` 只复制 `assets/` 顶层文件，
  **不会**同步 `assets/tools/**`，发布时需额外执行（Git Bash）：

```bash
mkdir -p public/assets public/tools
cp -r assets/tools public/assets/
cp tools/index.html public/tools/index.html
```

  并把 8 个页面的导航改动一并同步到 `public/` 对应页面。
