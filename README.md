# 熊熊雀庄企业官网

麻将竞技场馆「熊熊雀庄」的官方网站。纯静态多页站点，无任何构建依赖、无后端、无数据库。

线上地址：`https://susongyue.github.io/Xleague/`（GitHub Pages，推送 `main` 分支自动部署）

## 环境要求

| 用途 | 要求 |
|---|---|
| 浏览 / 本地预览 | 任意现代浏览器即可，无 Node/npm 依赖 |
| 本地静态服务（推荐） | Python 3.8+，或任意静态文件服务器（nginx / caddy / `npx serve` 均可） |
| 重新生成站点（可选） | Python 3.8+，脚本位于 `_build/`（不入库，仅本地维护） |

无环境变量要求，无密钥配置。

## 目录结构

```
├── public/          # GitHub Pages 发布目录（线上唯一入口）
│   ├── index.html   # 首页
│   ├── 404.html / robots.txt / .nojekyll
│   ├── rules/       # 规则总览 / 团队赛规则 / 段位赛
│   ├── tools/       # 麻将练习工具（何切、算番、牌效、番符表、役种）
│   ├── about/ news/ contact/ faq/
│   └── assets/      # CSS / JS / 图片 / 工具引擎与数据
├── index.html 等    # 与 public/ 同源的根目录镜像（本地双击预览用）
├── assets/          # 与 public/assets/ 镜像
├── .github/workflows/deploy-pages.yml  # Pages 部署 workflow
└── docs/            # 交接文档（HANDOFF.md / TASKLIST.md），不入库
```

## 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/susongyue/Xleague.git
cd Xleague

# 2. 启动本地静态服务（方式任选其一）
python -m http.server 8767 --directory public     # Python
# npx serve public                                 # Node（可选）
# caddy file-server --root public                  # Caddy（可选）

# 3. 浏览器访问
#    http://127.0.0.1:8767/
```

> 注意：请通过 HTTP 访问，直接双击 `public/index.html` 打开 `file://` 会导致部分相对路径资源加载异常。工具页训练进度存于浏览器 `localStorage`，纯本地计算，手牌不上传。

## 部署

推送至 `main` 分支后，GitHub Actions（`deploy-pages.yml`）自动把 `public/` 发布到 GitHub Pages，无需任何构建步骤。仓库无需配置任何 Secrets。

## 修改须知

- `.gitignore` 为白名单式：新增页面或资源目录时，必须同时在 `public/` 与根目录两组放行规则里追加对应条目，否则不会被提交。
- `assets/tools/**` 为工具页子目录，`_build/refresh.ps1` 不会同步它；改动后需手动 `cp -r assets/tools public/assets/`。
- 详细交接与待办见 `docs/HANDOFF.md` 与 `docs/TASKLIST.md`（本地维护，不入库）。
