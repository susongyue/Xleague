# 部署说明（静态网页）

本页面是**零外部依赖的单文件静态页**：`public/index.html` 内含全部 HTML、CSS、JavaScript，
不加载任何 CDN 字体、第三方脚本或图片，因此可以在断网状态下用 `file://` 直接打开，
也可以原样上传到任意静态托管。

---

## 一、构建产物

运行 `python build_static.py` 会重新生成 `public/` 目录：

```
public/
├── index.html     站点主页面（唯一必需的产物，约 165 KB）
├── 404.html       404 兜底，自动跳回首页
├── robots.txt     允许搜索引擎收录
└── .nojekyll      GitHub Pages 下跳过 Jekyll 处理
```

> 只想要最简部署时，**只上传 `index.html` 也能正常工作**，其余三个文件属于托管平台的辅助配置。

## 二、各平台配置

你在部署面板里看到的是「构建部署配置」，本页面**不需要任何构建步骤**，按下表填写即可。

| 字段 | 应填内容 | 说明 |
|---|---|---|
| 框架预设 | `Other` / 无框架 | 纯静态 HTML，不要选 React/Vue 等预设 |
| 根目录 | `./` | 仓库根目录（`index.html` 与 `public/` 都在这里） |
| 输出目录 | `public` | 若不想运行构建脚本，可改填 `.`（根目录） |
| 编译命令 | **留空** | 没有构建步骤 |
| 安装命令 | **留空** | 没有 npm 依赖 |

### 方案 A：直接部署根目录（最省事，推荐）

仓库根目录的 `index.html` 与 `public/index.html` 内容完全一致。如果平台允许把根目录当站点，
把「输出目录」填 `.`、「编译命令」「安装命令」全部留空即可，无需运行任何脚本。

### 方案 B：部署 public/ 产物目录

1. 本地运行 `python build_static.py` 生成 `public/`；
2. 把 `public/` 一并提交到仓库；
3. 部署面板「输出目录」填 `public`，其余命令留空。

### 各平台要点

- **Vercel**：Framework Preset 选 `Other`，Build Command / Output Directory 留空或填 `public`，
  Root Directory 保持 `.`。
- **Netlify**：Build command 留空，Publish directory 填 `public`（或 `.`）。
- **Cloudflare Pages**：Framework preset 选 `None`，Build command 留空，Build output directory 填 `public`。
- **GitHub Pages**：Settings → Pages → Source 选 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`；
  `.nojekyll` 已在 `public/` 内，若部署根目录请一并放到仓库根。
- **Gitee Pages / 自建 Nginx**：把 `public/` 内容整个拷到网站根目录即可。

## 三、本地预览

```bash
# 方式一：直接双击 index.html（file:// 即可，功能完整）
# 方式二：起一个本地静态服务
python -m http.server 5173
# 访问 http://127.0.0.1:5173/index.html
```

## 四、页面功能清单（部署后应可用）

| 功能 | 说明 |
|---|---|
| 按章分页 | 序 + 9 章共 10 页，底部翻页条 / 键盘 ←→ 翻页 |
| 三级目录 | 237 个可跳转小节，支持关键词筛选（命中高亮） |
| 页内小节 chips | 每章顶部可点击的条目标签 |
| 阅读位置记忆 | 刷新后提示「上次读到…」并可一键继续 |
| URL 锚点同步 | 地址栏 hash 随阅读位置更新，可直接分享定位链接 |
| 深色模式 | 跟随系统，也可手动切换并记忆 |
| 正文可编辑 | 顶栏「编辑」进入编辑态，本地保存 + 导出 HTML |
| 打印 | 打印时自动展开全部页面，隐藏翻页条与目录 |

## 五、注意事项

- 页面的编辑内容保存在浏览器 `localStorage`（键名前缀 `xq-`），**不会上传服务器**，
  换设备或清理浏览器数据后需要重新编辑；需要固化请用「导出 HTML」下载新的 `index.html` 覆盖部署文件。
- 页面不依赖任何外部字体，中文使用系统字体栈（PingFang SC / 微软雅黑 / Noto Sans CJK 等）。
- 重新构建后请复核：10 页、682 个唯一 ID、237 个目录锚点无缺失（可参照 `docs/HANDOFF.md` 的校验方法）。

---

## 六、GitHub Pages 自动部署（workflow）

仓库内已提供 `.github/workflows/deploy-pages.yml`，**推送 `main` 分支即自动发布**，也可在 Actions 页手动触发（`workflow_dispatch`）。

```yaml
- name: Build static site
  run: python3 build_static.py        # 生成 public/
- uses: actions/upload-pages-artifact@v3
  with:
    path: './public'                  # 只发布干净产物
```

### 与「上传整个仓库」的区别

| 做法 | 发布内容 | 说明 |
|---|---|---|
| `path: '.'`（原模板默认） | 整个仓库 | 会把 `docs/`、`.docx` 源文件、构建脚本一并公开 |
| `path: './public'`（当前配置） | 仅站点产物 | index.html + 404.html + robots.txt + .nojekyll |

仓库根的 `index.html` 也能直接打开，所以即使用 `path: '.'` 站点同样能跑通，只是会把源文档暴露出去。

### 一次性设置

1. 推送代码到 `main`（workflow 只监听 `main`，分支名不同请同步修改 `branches`）；
2. 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**（不是 “Deploy from a branch”）；
3. 首次推送后到 **Actions** 标签页确认 `Deploy static content to Pages` 运行成功；
4. 站点地址形如 `https://<用户名>.github.io/<仓库名>/`。

### 注意事项

- workflow 里的构建步骤只用 Python 标准库（`io`/`os`/`shutil`/`sys`），GitHub 的 `ubuntu-latest` 自带 `python3`，无需 `pip install`。
- 若改用方案 A（发布根目录），把 `path` 改回 `'.'` 即可，但建议同时在 `.gitignore` 里排除不必要的源文件。
- `public/` 是构建产物，可以选择提交也可以不提交（workflow 会自动重新生成）；本地预览需要它时才提交。
