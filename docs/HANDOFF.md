# HANDOFF · 项目交接记录

> 最后更新：2026-11-07
> 工作区：`c:/Users/13601/CodeBuddy/20261107152343`

---

## 一、任务概述

依据用户提供的 `E:/Documents/deepseek-harness/default-workspace/M.LEAGUE日麻规则_中文翻译.docx`（M.LEAGUE 官方比赛规则中文翻译），生成一个名为 `index` 的网页：

- 页面顶部显示主标题「熊熊雀庄团队赛事规则」；
- 左侧固定导航栏，按文档「章 → 条 → 项」层级生成可点击目录，点击平滑滚动并高亮当前小节；
- 右侧展示全部章节/小节正文，保持原文层级与顺序；
- 响应式布局，移动端导航可折叠，文字排版清晰、层次分明。

## 二、完成情况

| 项目 | 状态 | 说明 |
|---|---|---|
| 源文档解析 | 已完成 | 用 Python `zipfile` + XML 直接解析 docx（环境无 pandoc），共 508 个块：506 段落 + 2 表格 |
| 设计系统 | 已完成 | `ui-ux-pro-max` 生成：Minimalism & Swiss Style，#F8FAFC / #1E293B / #2563EB，Inter + 系统中文栈 |
| 图标 | 已完成 | `lucide-icons` 下载 menu / x / chevron-right / search / arrow-up / book-open / list-tree，内联 SVG，无 emoji |
| 页面实现 | 已完成 | 单文件 `index.html`（约 133 KB，零外部依赖，UTF-8） |
| 左侧目录 | 已完成 | 固定侧栏，237 个可跳转节点（文档说明 + 9 章 + 56 条 + 171 项），三级折叠 + 关键词筛选 |
| 平滑滚动 / 高亮 | 已完成 | `scrollIntoView` 平滑定位 + `scroll-margin-top` 避开顶栏 + 滚动监听自动高亮最深小节、自动展开并折叠其它章 |
| 正文保真 | 已完成 | 508 段逐段核对，0 遗漏；2 张 12×5 点数表、1 组 `｜` 对齐伪表格、39 条役一览、10 条注/例/脚注均单独处理 |
| 响应式 | 已完成 | ≥1024px 固定侧栏；<1024px 抽屉式折叠导航 + 遮罩 + Esc 关闭 + inert；断点 1279 / 1023 / 420px |
| 无障碍 | 已完成 | 跳转链接、语义标题层级、`aria-expanded` / `aria-current` / `aria-label`、可见焦点、`prefers-reduced-motion`、打印样式 |
| 校验 | 已完成 | HTML 标签闭合 0 错误、ID 0 重复、237 个目录目标 0 缺失、内联 JS `node --check` 通过、IDE linter 0 诊断 |
| 预览 | 已完成 | 本地 `python -m http.server 5173`，`http://127.0.0.1:5173/index.html` |

## 三、关键决策

1. **单文件静态页而非 React 工程**：需求是「一个名为 index 的网页」，内容为只读规则文档；单文件 `index.html` 双击即可打开、便于分发，且无构建/依赖风险。
2. **用生成脚本保证保真**：508 段正文手工转写易错，采用 `.tmp/build.py` 从解析结果生成 HTML；生成后删除全部临时文件，交付物仅 `index.html` + `docs/`。
3. **层级识别规则**：源 docx 的 `w:pStyle` / `numPr` / `outlineLvl` 全部为空，唯一格式信号是整段加粗。因此按「加粗 + `^第N章` / `^第N条`」识别章/条，「非加粗 + `^第N项`」识别项；锚点 ID 用序号生成（`ch-1`、`art-1-2`、`item-1-2-3`），不依赖原文编号（原文存在跳号）。
4. **不重组原文顺序**：原文采用「条标题 → 一批项标题 → 一批正文段落」的分块排版，项与正文不是逐条交替。页面严格保留该顺序，用 `.item-stack` 把连续的项标题呈现为「本节分项」列表，正文随后按原序排列；未作配对或重排。
5. **特殊内容处理**：
   - 两张真表格渲染为可横向滚动的 `<table>`，表头吸顶、首列吸附；
   - 第一张表末行第 5 列误含第二张表的表题，抽出为第二张表的 `.table-caption`，该单元格留空，不臆造点数；
   - `｜` + 全角空格的伪表格用 `white-space: pre-wrap` 保留对齐；
   - 役一览用响应式卡片网格，DOM 顺序不变；`◎` / `※` 保留并着色，末尾图例保留；
   - `（注・…）` `【例】` `（例：` `＊` 分别用不同色条区分为注、例、脚注。
6. **交互细节**：滚动监听用 rAF 节流 + 「视口顶部之前最后一个锚点」判定，切章自动折叠其它章，避免 237 条目录无限展开；目录筛选支持即时匹配并自动展开命中分支；阅读进度条与回到顶部按钮。
7. **顶部主标题**：放于固定深色顶栏 `<h1>`，桌面显示「全 9 章 / 56 条 / 171 项」元信息，移动端缩为单行。

## 四、已知情况 / 遗留问题

以下均为**源文档本身的既有特征**，页面按「保持原文」原则原样保留，未擅自改写：

- 第 6 章缺少「第 5 条」标题：`第4条 点数计算(2)` 之后直接是第二组 `第1项 点数的计算…第8项 交割错误`，随后为 `第6条 满贯`。这些项在目录中归入第 4 条。
- 第 8 章 `第1条` 无条名，目录与正文只显示「第1条」。
- 第 1 章 `第8条 裁判` 下出现 `第1项 自动配牌`，与后续裁判正文不符，疑为原文残留。
- 第 3 章末尾两段（比赛行为报牌/确认）与第 4 章 `第2条 优先顺序` 前置段落疑似串位，页面保持原位置。
- 第 6 章 `满贯有以下四种` 但列出 (1)–(5) 五项；第 8 章「使其鸣牌使南家」疑似翻译残缺。
- 部分全角空格、`・`、`～`、`▲`、`〔〕`、`《》` 与片假名注音均为原文字符，已保留；若后续编辑请勿做全半角归一化。
- 因原文项标题集中排列，滚动到项后的正文段落时，高亮仍停留在该组最后一个项标题，属原文结构导致，非实现缺陷。

## 五、下一步计划

见 `TASKLIST.md`。剩余可选方向仅 P3：源文档异常回归校对。

## 六、近期改动记录（2026-11-07）

在保持原文保真与单文件零依赖的前提下，完成 TASKLIST 后续待办与静态部署改造：

1. **目录筛选命中高亮**：`applyFilter` 中新增 `highlightLabels`，用 `data-label` 缓存原文，筛选时对命中片段包 `<mark>`，清空后还原；CSS 新增 `.toc-label mark` 样式。
2. **深色模式**：新增 `:root[data-theme="dark"]` 变量覆盖块，将所有硬编码浅色 hex 收敛为语义变量（`--surface-2/3`、`--row-even`、`--body-2`、`--example-line/bg`、`--note-foot-bg`、`--mk-men/open`、`--muted-2/3`、`--on-header`、`--border-header` 等）；顶栏新增月亮/太阳切换按钮（`.theme-toggle`）；JS 新增 `applyTheme`，优先级「手动选择 > 系统 `prefers-color-scheme`」，`localStorage` 键 `xq-theme` 记忆，未手动选择时监听系统变化。
3. **打印分页优化**：`@media print` 增补 `thead{display:table-header-group}` 表头跨页重复、`.article-head h3`/`.chapter-head` 防孤行、`.para/.note` 等 `orphans/widows:3`、`tr{break-inside:avoid}`、表格打印放宽 `min-width` 与 `overflow`。
4. **静态部署改造**：移除 Google Fonts（`preconnect` + `css2`）外部依赖，保留系统字体栈（`--font` 中 Inter 已回退到 PingFang SC / Microsoft YaHei / Noto Sans CJK SC），页面零外部请求，可离线或 `file://` 直接打开。
5. **校验**：内联 JS `node --check` 通过；ID 315 个 0 重复；238 个锚点目标 0 缺失；暗色下正文/顶栏/文字反色正常，筛选命中 `<mark>` 计数与清空还原验证通过。

### 六-2、分页阅读体验增强（同日继续）

1. **按章分页**：右侧正文改为「序 + 9 章 = 10 页」，`.page`/`.page.is-active` 切换；顶部吸顶分页条（`.pager`，`position:sticky; top:88px; z-index:20`）+ 底部分页条，含上一页/下一页/下拉跳转/页码计数，支持 ← → 方向键。
2. **页内小节导航 chips**：`buildSectionNav()` 从每页 `.article-head` 的 `.article-badge` + `h3[data-anchor]` 生成「第N条 条名」胶囊，当前条 `.is-current` 高亮；无条名的条（第 8 章第 1 条）标 `data-unnamed` 跳过。
3. **阅读位置记忆**：`scheduleSavePosition()` 600ms 防抖写 `localStorage['xq-pos'] = {page, anchor, t}`；重新打开且无 hash 时，底部 `.resume-toast` 提示「上次读到 第X章 · 第N条…」，点「继续阅读」跳回，12s 自动隐藏。
4. **URL hash 同步**：`syncHash()` 用 `history.replaceState` 把当前锚点写回地址栏（`#art-5-3` 等），可直接分享/刷新定位。
5. **跳转稳定性**：`lockSpy(ms)` + `spyLockUntil` 在目录/chips/继续阅读跳转期间抑制滚动高亮（60ms 减少动效 / 900ms 平滑滚动），避免平滑滚动途中被中途锚点抢占导致 hash 漂移。
6. **吸顶遮挡修正**：新增 `--pager-h:62px`（<1023px 为 56px），`.chapter` 与 `[data-anchor]` 的 `scroll-margin-top` 统一为 `calc(var(--header-h) + var(--pager-h) + 14px)`；`updateSpy()` 判定阈值改为 `headerHeight() + pagerH + 16`。
7. **校验**：内联 JS `node --check` 通过；body 内 `div` 362/362、`section` 66/66 闭合平衡；ego-browser 实测目录跳转后 hash 稳定于 `#art-5-3`、TOC 与 chips 双高亮正确、继续阅读 toast 正常。

> 修复提示：`index.html` 为纯 LF 换行；批量替换建议用 Python 脚本（`io.open(..., newline='\n')`）而非 PowerShell here-string，避免中文与 CRLF 问题。

### 六-3、顶部切换栏移除 + 正文可编辑功能

用户要求（m00800）：「右侧内容展示区上方的切换栏并没有移除，此外新增可编辑内容的功能」，并经确认「可编辑范围=全部正文（目录/锚点结构不动）、保存方式=本地持久化 + 导出 HTML」。

1. **移除顶部切换栏**：删除 `<nav class="pager" id="pagerTop">`（含 prevTop/nextTop/jumpTop/pagerTopLabel）；JS 对 prevTop/nextTop/jumpTop 全部判空保护，`renderPager()` 去掉 `labelTop` 引用。底部 `#pagerFoot` 保留。此前的顶部吸顶分页条是真·分页导航，属错误搭建的「小节切换栏」，与需求不符，已整体移除。
2. **编辑按钮**：`.header-meta` 内 `#editToggle`（编辑图标 SVG + `<span id="editToggleLabel">`），CSS `.edit-toggle` 含 `.is-on` 蓝底白字；`aria-pressed` 同步。
3. **编辑工具条**：`.doc` 开头 `#editbar`（默认 `hidden`），含「保存」`#editSave`（`#editSaveLabel` 文字节点独立，避免 textContent 覆盖图标）、「导出 HTML」`#editExport`（primary）、「完成」`#editDone`；`position:sticky; top:88px; z-index:21`。
4. **编辑态 CSS**：`:root[data-editing] [data-edit]{outline:1px dashed; cursor:text}` + `:hover/:focus` 高亮。
5. **可编辑节点**：`EDITABLE_SEL` 覆盖 `.front p / .chapter-title / .article-head h3 / .item-stack h4 / .para / .note / .bullet / .subitem / .example / .pre-line / td / th / .table-caption / .yaku-name / .yaku-desc / .legend`，共 587 个节点。
6. **稳定 id（关键）**：无原生 id 的段落由 `ensureEditIds()` 按「所属 `.article/.front/.chapter` 的条/章级标题锚点 id + 类名 + 同 scope 内序号」生成语义化稳定 id（如 `ed-art-1-1-para-0`），保证刷新后编辑内容能正确恢复。`editScopeOf()` 优先取 `.article-head h3[data-anchor]` / `.chapter-head h2[data-anchor]` 作为作用域。
7. **持久化/恢复**：`EDIT_KEY='xq-edit'`，`collectEdits()` 存 `{id: innerHTML}`；`persistEdits()` 写 localStorage；`applySavedEdits()` 启动时恢复。编辑时 input 事件防抖 600ms 自动保存（`schedulePersist`），保存按钮即时持久化并显示「已保存」反馈 1.2s。
8. **导出**：`exportHtml()` clone `documentElement`，清除全部 `contenteditable`/`data-edit`/`data-editing`、移除 `.editbar`/`.edit-toggle`，拼 `<!DOCTYPE html>` 后 Blob 下载 `index.html`（干净静态页）。
9. **编辑态键位**：`editKeyGuard` 在编辑态下 `stopImmediatePropagation` 拦截 ArrowLeft/ArrowRight，避免方向键翻页冲突光标移动。
10. **踩坑记录（重要）**：
    - `.para` 等正文段落与 `.article-head h3[data-anchor]` 是**兄弟关系而非父子**，`closest('[data-anchor]')` 拿不到锚点，必须用「容器级 scope 取标题锚点」。
    - `compareDocumentPosition` 位判断：`PRECEDING`(2)=el 在 anchor 之前需 break；误用 `FOLLOWING`(4) 会导致 scope 恒为 `root`。
    - 按钮文案切勿用 `textContent =` 直接覆盖（会抹掉内联 SVG 图标），必须用独立 `<span id=...>` 文字节点。
    - don't 用 `Date.now()` 生成临时 id（刷新即变，key 对不上无法恢复）。

校验：`node --check` 通过；587 节点进出编辑态正常、改标题+正文后刷新均恢复、保存按钮「已保存」反馈正常、导出清理逻辑正确（587 标记全清除、editbar/edit-toggle 移除）。

### 六-4、移动端目录热区 + 桌面端正文加宽（2026-11-07 第三轮）

1. **移动端目录可点性**（`@media (max-width:1023px)`）
   - `.sidebar{width:min(92vw,360px)}`；`.toc{padding:10px 8px 26px}`
   - 一级/二级项 `.toc-link{min-height:46px;padding:11px 12px;font-size:.94rem;border-radius:10px;border-left-width:3px}`
   - 三级项 `.toc-level-3{min-height:42px;margin:2px 4px;padding:10px 12px;background:var(--surface-2)}`，激活态 `.is-active{background:var(--accent-soft)}`
   - 折叠箭头 `.toc-toggle{width:40px;min-height:44px}`（≥40px 触控热区）
   - 相邻项 `.toc-row+.toc-row{margin-top:2px}`，分组之间 10px + 分隔线
   - 长标题 `.toc-label{-webkit-line-clamp:2}` 两行截断，不再挤压
   - 思路：把「一行一条、零间距」的密集列表改成「独立卡片行」，每项 ≥42px 高 + 2px 间隔，误触率大幅下降。
2. **桌面端正文加宽**
   - `.doc` 从 `max-width:920px` → `max-width:1120px`（+22%），`margin:0 auto` 居中
   - 宽屏分级：`@media (max-width:1439px){.doc{max-width:1080px;padding:36px 40px 96px}}`；`@media (max-width:1279px){.doc{max-width:100%;padding:34px 32px 90px}}`
   - 曾试验 `.doc .para,.doc .pre-line,.doc .bullet,.doc .subitem{max-width:78ch}` 限阅读行宽，但右半边留白过大且与卡片左对齐冲突，**已回退**——现在段落与卡片同宽（1920 下 1032px）。
3. **验证**：390x844 移动端 / 1440 / 1920 桌面三档实测无横向溢出；682 个 ID 无重复、237 个锚点无缺失；`node --check` exit 0。
4. **工具经验（修正旧结论）**：`ego_script` 里 `cdp('Emulation.setDeviceMetricsOverride', {...})` 可正常模拟移动端视口，`mobile:true` + 390x844 生效，此前记录的「不可持久」不准确——本轮用它完成了真实移动端验证。注意 `Emulation.clearDeviceMetricsOverride` 后视口可能停在中间值，直接再 setIdOverride 目标宽度即可。

### 六-5、目录层级竖线与折叠三角对齐（2026-11-07）

**问题**：目录一、二级项左侧的层级引导竖线，与展开/折叠三角的尖端不在同一列，视觉上错位。

**根因**：三角中心由「父行 `.toc-row` 的 `gap` + 按钮宽度一半」决定，而竖线位置由子容器 `.toc-children` 的 `margin-left + padding-left` 单独决定，两者各自计算，从未对齐。
- 桌面：`.toc-row{gap:2px}` + `.toc-toggle{width:24px}` → 三角中心偏移 2 + 12 = **14px**
- 移动：`.toc-row{gap:0}` + `.toc-toggle{width:40px}` → 三角中心偏移 0 + 20 = **20px**

**修复**：把 `.toc-children` 的竖线定位到三角中心列（竖线在 border-left，故 margin-left = 中心偏移 - 1px）。
- 桌面 `.toc-children{margin-left:13px;padding-left:8px;border-left:1px solid var(--line)}`
- 移动 `@media (max-width:1023px){ .toc-children{margin-left:20px;padding-left:6px} }`

**验证**：折叠状态下遍历全部 65 个 `.toc-children`，比较「竖线 X」与「三角 svg 中心 X」，最大绝对差 0.5px（子像素取整），无一项超过 1px；移动端 390 与桌面 1920 两档均通过，截图确认竖线自三角下方笔直穿过。

**维护提示**：以后若调整 `.toc-toggle` 宽度或 `.toc-row` 的 `gap`，必须同步修改 `.toc-children` 的 `margin-left`（桌面 = gap + width/2 - 1，移动同式），否则竖线会再次跑偏。

### 六-6、目录层级缩进阶梯修正（2026-11-07）

**问题**：三级项（第N项）文字比二级项（第N条）更靠左，层级越深反而越外凸，与「越深越缩进」的直觉相反。

**实测根因（三处叠加）**：
| 层级 | 文字起点（移动端） | 原因 |
|---|---|---|
| 一级（第N章） | 97px | 有 26px 宽的 `.toc-num` 编号徽章（01/02…）+ 8px gap |
| 二级（第N条） | 90px | 行左移 13px 且**没有编号徽章**，左侧少让出 34px |
| 三级（第N项） | 81px | `.toc-level-3` 直接吃掉二级行的箭头列，`padding-left:12px` 太小 |

**修复（桌面 / 移动两套值）**：
- 二级行补上与一级一致的箭头列占位：`.toc-children .toc-level-2{gap:2px}` + `.toc-children .toc-level-2>.toc-toggle{width:24px}`（移动 `gap:0` / `width:40px`）
- 二级链接补上编号徽章等宽的左侧内缩：`.toc-children .toc-level-2>.toc-link{padding-left:42px}`（移动 `46px`）
- 三级项加大左内缩：`.toc-level-3{...padding-left:55px}`（移动 `padding:10px 12px 10px 70px`）

**结果（文字起点 X 坐标，6 档分辨率实测全部通过）**：
| 视口 | 一级 | 二级 | 三级 | 竖线对齐偏差 |
|---|---|---|---|---|
| 1920 / 1440 / 1280 / 1024 | 76 | 102 | 117 | ≤0.5px |
| 768 / 390 | 97 | 124 | 139 | ≤0.5px |
各档 `overflowX` 均为 false。

**维护提示**：层级缩进是三个值联动的——`.toc-toggle` 宽度、`.toc-row` 的 gap、`.toc-level-2>.toc-link` 的 padding-left。改任意一个都要重新核对一级/二级/三级的文字起点是否仍严格递增。

### 六-7、顶栏标题移到最左侧（2026-11-07）

**问题**：顶部标题「熊熊雀庄团队赛事规则」不在页面最左，而是被推到侧栏右侧（约 320px 处）。

**根因**：`.site-header` 是 `position:fixed;inset:0 0 auto 0`，本来就横跨整个视口，但 `.header-inner` 留了
`padding:0 26px 0 max(20px,calc(var(--sidebar-w) - 6px))`，桌面端又在 `@media` 里叠加
`.header-inner{padding-left:calc(var(--sidebar-w) + 12px)}`，两处都把内容让到侧栏右边。

**修复**：
- 基础样式 `padding:0 26px 0 max(20px,calc(var(--sidebar-w) - 6px))` → `padding:0 26px 0 20px`
- 桌面媒体查询 `padding-left:calc(var(--sidebar-w) + 12px)` → `padding-left:20px`

**结果**：1920/1440/1024 下 `.brand` left = 20px、`h1` left = 69px（与侧栏左边缘对齐）；768/390 下汉堡按钮占最左，标题紧随其后（66px / 111px）；各档 `overflowX` 均为 false。

**维护提示**：顶栏左右留白由 `.header-inner` 的 padding 统一控制（左 20px、右 26px），不要再引入依赖 `--sidebar-w` 的 calc 左边距，否则标题会再次跑到侧栏右侧。

### 六-8、目录箭头列对齐规则（2026-11-07）

**用户规则**：二级箭头的最左侧应固定在「一级箭头最右侧」那一列，三级同理。

**实现**：每级箭头的**左端 = 上一级箭头的右端**，逐级递推。
- `.toc-children{margin-left:24px}`（桌面）→ 二级箭头左端 = 一级箭头右端 24
- `.toc-children .toc-children{margin-left:24px}` → 三级左端 = 二级箭头右端 48
- 移动端箭头宽 40，两级容器 `margin-left` 均为 `40px`

**竖线改为伪元素**：原先用 `.toc-children{border-left}` 画层级引导线，容器位置一变竖线就跟着跑。改为
`.toc-children::before{position:absolute;left:-12px;width:1px;background:var(--line)}`（桌面）/ `left:-20px`（移动），
精确落在「上一级箭头中心」列，与容器左边缘解耦。

**实测（间距 = 下一级箭头左端 − 上一级箭头右端）**：
| 视口 | 一→二级间距 | 二→三级间距 | 竖线偏差 |
|---|---|---|---|
| 1920 / 1440 | 0px | 0px | 1px |
| 390（移动） | 0px | 0px | 0px |

**维护提示**：箭头宽度一变，`.toc-children` 的两级 `margin-left` 与 `::before` 的 `left` 必须同时改：
`margin-left = 上一级箭头宽`，`::before.left = 上一级箭头宽 / -2`。

### 六-9、二级/三级左留白关系修正（2026-11-07）

**问题**：二级条目标签左侧留出一大块空白，三级项反而紧贴左边，与「层级越深、左侧留白越多」的直觉相反。

**根因**：二者左内边距写反了。
- `.toc-children .toc-level-2>.toc-link{padding-left:34px}`（二级内部留白过大）
- `.toc-level-3{padding-left:14px}`（三级几乎没有留白）

**修复**：二级只保留常规内边距（贴紧自身行首），三级承担缩进留白。
| 层级 | 桌面 padding-left | 移动 padding-left |
|---|---|---|
| 二级（第N条） | 18px | 12px |
| 三级（第N项） | 26px（另加 margin-left 6px） | 22px |

**结果（文字起点 X）**：
| 视口 | 一级 | 二级 | 三级 | 箭头间距 | 竖线偏差 |
|---|---|---|---|---|---|
| 1440 | 76 | 80 | 92 | 均为 0px | 1px |
| 390（移动） | 97 | 103 | 113 | 均为 0px | 0px |

**维护提示**：二级/三级的左留白必须满足「一级 < 二级 < 三级」，改动后要重新量三者的文字起点，不要只看 padding 数值（因为二级行还带箭头列偏移）。

### 六-10、静态部署产物（2026-11-07）

用户提供的部署面板只有「框架预设 / 根目录 / 输出目录 / 编译命令 / 安装命令」五个字段，页面本身无构建步骤，因此：

1. 新增 `build_static.py`：把 `index.html` 拷进 `public/`，并生成 `404.html`（meta refresh 跳回首页）、`robots.txt`、`.nojekyll`。
2. 新增 `docs/DEPLOY.md`：逐字段说明面板怎么填（框架预设 Other、输出目录 `public` 或 `.`、编译/安装命令留空），并给出 Vercel / Netlify / Cloudflare Pages / GitHub Pages / Nginx 的要点。
3. 已验证 `public/` 作为独立站点根目录可正常工作：`python -m http.server 5174 --directory public` 起服务，
   页面 10 页 / 682 个唯一 ID / 237 个目录锚点无缺失，翻页、深色模式、目录跳转（hash 同步 `#art-9-3`）全部正常。
4. 复核外部依赖：`index.html` 内 0 个 http(s) 外链、0 处 Google Fonts 引用，1 个 `<style>` + 1 个 `<script>` 全内联。

**维护提示**：改完 `index.html` 后若要发布产物目录，记得重新跑 `python build_static.py`，否则 `public/index.html` 会是旧版本。

### 六-11、GitHub Pages 自动部署 workflow（2026-11-07）

用户提供了 GitHub Pages 官方模板 workflow（`actions/upload-pages-artifact@v3`，`path: '.'`）。第 12 轮已落地：

1. 新建 `.github/workflows/deploy-pages.yml`，保留原模板的触发条件（`push` 到 `main` + `workflow_dispatch`）、权限（`contents: read` / `pages: write` / `id-token: write`）与 `concurrency: pages` 配置。
2. **关键改动**：在 `Setup Pages` 之前插入 `- name: Build static site` → `run: python3 build_static.py`，并把上传路径从 `'.'` 改成 `'./public'`。理由：原模板会把整个仓库（含 `docs/`、`.docx` 源文件、构建脚本）发布成公开网站内容。
3. 构建脚本只用 Python 标准库，`ubuntu-latest` 自带 `python3`，无需 `pip install`、无 npm 依赖。
4. 校验：YAML 顶层键为 `name/on/permissions/concurrency/jobs`，无 tab、缩进为 2 空格；`python3 build_static.py` 在本地跑通并产出 `public/{index.html, 404.html, robots.txt, .nojekyll}`。
5. `docs/DEPLOY.md` 追加「六、GitHub Pages 自动部署」，含 `path: '.'` 与 `path: './public'` 的对比表和一次性设置步骤（Pages → Source 必须选 **GitHub Actions**）。

**维护提示**：workflow 只监听 `main` 分支；若默认分支叫 `master`，需同步修改 `branches`。本地改完 `index.html` 后 `public/` 由 CI 重新生成，本地不必手动同步。
