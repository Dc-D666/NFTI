# NF-BTI 免费部署指南

> 项目类型：Vue 3 + Vite 纯前端 SPA · 无需后端 · 静态文件托管

---

## 通用步骤：构建项目

所有方案都先做这一步：

```bash
# 1. 进入项目目录
cd E:\nfBTI\nfbti-app

# 2. 安装依赖（首次或依赖更新后）
npm install

# 3. 构建生产版本
npm run build-only
```

构建产物在 `dist/` 文件夹，之后部署的就是这个文件夹。

---

## 方案一 · Cloudflare Pages（推荐 ⭐）

**免费额度**：无限请求 / 500 MB 存储 / 全球 CDN  
**特点**：速度快、配置简单、支持自动从 Git 部署

### 方式 A：从 Git 仓库自动部署（推荐）

1. 把项目推送到 GitHub / GitLab / Gitee
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**
3. 点 **Create** → **Pages** → **Connect to Git**
4. 授权并选择你的仓库
5. 在构建设置中：
   | 项目 | 值 |
   |------|-----|
   | 框架预设 | **Vue**（会自动填好下面两项） |
   | 构建命令 | `npm run build-only` |
   | 输出目录 | `dist` |
6. 展开 **Environment variables (advanced)** → 添加：
   - `NODE_VERSION` = `22`（项目要求的 Node 版本）
7. 点 **Save and Deploy**

部署完成后，Cloudflare 会给你一个 `<project>.pages.dev` 域名，即开即用。

### 方式 B：手动上传（无 Git）

1. 把构建好的 `dist` 文件夹**压缩成 zip**
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload Directories**
3. 上传 zip，自动部署

### ⚙ SPA 路由配置（重要）

项目中的 `_redirects` 文件已自动处理。如果将来改用 Cloudflare Dashboard 自定义，确保开启 **SPA 模式**（在 Pages 项目的 **Settings** → **General** → **SPA Mode** 打开）。

---

## 方案二 · Vercel

**免费额度**：每月 100 GB 带宽 / 无限页面 / 自带 HTTPS 和 CDN

### 方式 A：从 Git 仓库自动部署

1. 登录 [vercel.com](https://vercel.com/)（可用 GitHub / GitLab 账号直接登录）
2. 点 **Add New** → **Project** → 导入你的仓库
3. 框架会自动识别为 **Vite**
4. 在 **Build and Output Settings** 中确认：
   | 项目 | 值 |
   |------|-----|
   | Framework Preset | **Vite** |
   | Build Command | `npm run build-only` |
   | Output Directory | `dist` |
   | Node.js Version | **22.x** |
5. 点 **Deploy**

### 方式 B：Vercel CLI（命令行）

```bash
npm i -g vercel
npm run build-only
cd dist
vercel --prod
```

按提示登录，Vercel 会自动上传并部署。

### ⚙ SPA 路由

项目中的 `vercel.json` 已自动处理，无需额外配置。

---

## 方案三 · Netlify

**免费额度**：每月 100 GB 带宽 / 300 分钟构建时长

### 从 Git 部署

1. 登录 [netlify.com](https://app.netlify.com/)
2. **Add new site** → **Import an existing project**
3. 授权你的 Git 仓库
4. 设置：
   | 项目 | 值 |
   |------|-----|
   | Build command | `npm run build-only` |
   | Publish directory | `dist` |
   | Node version | **22**（在 Environment variables 里加 `NODE_VERSION=22`） |
5. 点 **Deploy site**

项目里的 `_redirects` 文件会自动处理 SPA 路由回退。

---

## 方案四 · GitHub Pages（备选，免费）

**免费额度**：无限流量 / 1 GB 存储  
**缺点**：SPA 路由需要手动 hack；自定义域名必须配 CNAME

### 步骤

1. 在 `vite.config.ts` 中设置 `base`（如果部署到 `https://<user>.github.io/nfbti-app/`）：

```ts
export default defineConfig({
  base: '/nfbti-app/',  // ← 仓库名
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

2. 在 `.github/workflows/deploy.yml` 创建 GitHub Actions：

```yaml
name: Deploy to Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build-only
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

3. 在仓库 Settings → **Pages** → **Source** 选择 **GitHub Actions**

4. **SPA 路由 404 问题**：GitHub Pages 没有原生的 SPA 回退。需要在 `public/` 下建一个 `404.html` 文件，内容与 `index.html` 相同（但浏览器地址栏不会变，对分享不太友好）。

---

## 一览对比

| 特性 | Cloudflare Pages ⭐ | Vercel | Netlify | GitHub Pages |
|------|-------------------|--------|---------|-------------|
| 配置难度 | ★☆☆ 极简 | ★☆☆ 极简 | ★☆☆ 极简 | ★★★ 稍复杂 |
| 全球 CDN | ✅ 全球 330+ 节点 | ✅ | ✅ | ✅ |
| 中国访问 | 🌕 可访问 | 🌗 较慢 | 🌗 较慢 | 🌕 可访问 |
| 自定义域名 | ✅ 免费 | ✅ 免费 | ✅ 免费 | ✅ 免费 |
| SPA 回退 | ✅ `_redirects` | ✅ `vercel.json` | ✅ `_redirects` | ⚠️ 需要 404 hack |
| HTTPS | ✅ 自动 | ✅ 自动 | ✅ 自动 | ✅ 自动 |
| 自动部署 | ✅ Git 联动 | ✅ Git 联动 | ✅ Git 联动 | ✅ Actions |
| 商业风险 | 免费额度极高 | 免费额度充足 | 免费额度充足 | 完全免费无限制 |

---

## 自定义域名（可选，完全免费）

如果想用自己的域名而不是 `xxx.pages.dev`，三种方案都支持：

1. 在域名购买方（如阿里云、腾讯云、GoDaddy）添加 CNAME 记录指向你获得的部署域名
2. 在 Cloudflare/Vercel/Netlify 的 **Custom Domain** 设置中添加你的域名
3. 等待 DNS 生效（通常 1-10 分钟），HTTPS 证书会自动签发

---

## 常见问题

### 刷新页面出现 404？

`_redirects` 和 `vercel.json` 已在项目中配好。如果部署后还 404，检查 Git 是否推送了这两个文件，或者登录面板手动开启 SPA 模式。

### 字体加载慢？

`index.html` 已经引用了 `fonts.googleapis.cn`（中文镜像）。如果部署在海外 CDN，它会自动回退到全球 CDN，不影响。

### 图片/资源 404？

确保 `vite.config.ts` 的 `base` 保持 `'/'`（默认值），只有在 GitHub Pages 部署到**子路径**时才需要改动。

### 域名在中国没备案能用 Cloudflare 吗？

Cloudflare Pages 分配的 `xxx.pages.dev` 域名在中国大陆访问速度尚可，但如果有自己的域名且服务器在海外，Cloudflare 可以免备案。如果域名是国内的且绑定到 Cloudflare 的国内节点……但 Cloudflare 在中国大陆没有自营节点（是通过合作伙伴），性能有限但不妨碍使用。Vercel 和 Netlify 同理。
