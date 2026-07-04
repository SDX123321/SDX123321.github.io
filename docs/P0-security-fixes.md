# P0 安全改造清单

本文档记录已完成的 P0 改造，以及**需要你手动执行**的运维步骤。

---

## ✅ 已完成的代码改动（push 即生效）

### P0-1 Service Worker 修复
- `sw.js` / `public/sw.js` 重写为 v3：
  - 删除坏掉的 `PRECACHE_URLS`（React 化前的旧文件名，install 阶段 addAll 失败）
  - 改为纯运行时缓存：HTML Network-First，静态资源 Stale-While-Revalidate
  - 版本号升到 `v3`，activate 时清掉所有 v1/v2 旧缓存
  - 离线兜底页保留

### P0-2 全局 ErrorBoundary
- 新增 `src/components/ErrorBoundary.jsx`：
  - 用 `getDerivedStateFromError` + `componentDidCatch` 捕获渲染异常
  - 错误 UI 提供"重试 / 返回首页"
  - 预留 `window.__errorSink__` 钩子给未来接 Sentry
- `src/App.jsx` 在最外层包了 `<ErrorBoundary>`，整树不再白屏

### P0-3 CSP / HSTS / 安全头
- `scripts/site.conf` 重写，新增 HTTPS server block：
  - **CSP**：白名单 `cdn.jsdelivr.net / giscus.app / challenges.cloudflare.com / busuanzi.ibruce.info / r2.zzzzcx.cn / docs.google.com`
  - **HSTS**：`max-age=31536000; includeSubDomains; preload`
  - **Permissions-Policy**：禁用 camera/microphone/geolocation
  - 移除废弃的 `X-XSS-Protection`
  - 所有 `add_header` 加 `always` 确保错误响应也带安全头
- 同时新增 `scripts/vps-https-setup.sh` 一键落脚本

### P0-4 Turnstile 密钥 + GitHub PAT
- `turnstile-worker.js`：删掉硬编码 SECRET，改用 `env.SECRET_KEY`；缺密钥时**拒绝**而非放行
- `src/features/security/verifyToken.js`：Worker 不可达时**拒绝**验证（原先是 `return !!token` 客户端兜底放行，等于没防护）
- 新增 `wrangler.toml` 用于 Worker 部署

---

## 🔧 你需要手动执行的步骤

### 1) 部署新的 Turnstile Worker（去 GitHub 仓库的 Secret 不要再硬编码）

```bash
# 在本仓库根目录
npx wrangler login        # 一次性
npx wrangler secret put SECRET_KEY
# 粘贴 Cloudflare Turnstile 的 Server-side secret key（以 0x4AAAAAADsV... 开头）
npx wrangler deploy
```

部署后，Worker 的密钥**不再出现在代码里**，只存在 Cloudflare 加密存储中。

### 2) 轮换并收窄 GitHub PAT

当前 `.env` 里的 `GITHUB_TOKEN=ghp_...` 是明文、几乎全权限。处理步骤：

1. GitHub → Settings → Developer settings → **Personal access tokens** → Tokens (classic)
2. 找到旧 token → Revoke
3. 新建一个 fine-grained token：
   - **Repository access**：只选 `SDX123321/SDX123321.github.io`
   - **Permissions**：
     - Contents: Read-only（如果只是用来拉取，不需要 push）
     - 如果 CI 用不上 PAT 就**别再放 .env**，直接删掉这一行
4. 更新 `.env` 里的 `GITHUB_TOKEN`，或干脆删除该行（`deploy.yml` 用的是 `secrets.VPS_SSH_KEY`，根本不需要 PAT）

### 3) 在 VPS 上落地 HTTPS（切换到 Cloudflare Full Strict）

```bash
# 1. Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate
#    选 RSA 2048，hostname 填 web.zzzzcx.com，有效期 15 年
#    复制两段文本（Certificate / Private Key）

# 2. SSH 进 VPS
ssh root@107.173.28.216

# 3. 编辑脚本，把两段证书粘贴进 CERT_EOF / KEY_EOF 之间
nano /root/site/scripts/vps-https-setup.sh   # 或用 vim
#    把脚本里两处占位文本替换为 Cloudflare 给你的真实内容

# 4. 执行
bash /root/site/scripts/vps-https-setup.sh

# 5. Cloudflare Dashboard 切换：
#    SSL/TLS → Overview → Encryption mode → "Full (Strict)"
#    SSL/TLS → Edge Certificates → 打开 "Always Use HTTPS"
#    SSL/TLS → Edge Certificates → 打开 "HSTS Enabled"
```

### 4) 推送代码触发 CI

```bash
git add -A
git commit -m "P0: 修复 SW、加 ErrorBoundary、加 CSP/HSTS、修 Turnstile 密钥泄露"
git push
```

CI 跑完后访问 https://web.zzzzcx.com，检查响应头：

```bash
curl -I https://web.zzzzcx.com | grep -iE "content-security|hsts|x-frame|referrer"
```

应该能看到 `content-security-policy`、`strict-transport-security` 等。

---

## 验证步骤

部署完后做这些快速验证：

```bash
# 1. SW 应该是 v3，无 install 错误
# 浏览器 DevTools → Application → Service Workers → 看 sw.js 注册成功且无报错

# 2. ErrorBoundary 生效
# 临时在某组件里 throw new Error('test') → 应看到错误页而非白屏

# 3. CSP 不误伤
# 打开 DevTools → Console，看是否有 "Refused to load" 报错
# 如果某个 CDN 被误拦，把域名加到 site.conf 的 CSP 白名单里

# 4. HSTS / 头部
curl -sI https://web.zzzzcx.com | grep -iE "strict-transport|content-security|permissions-policy"

# 5. Turnstile 校验
# 在需要 Turnstile 的页面提交一次 → DevTools → Network → /api/turnstile-verify 返回 success:true
```

---

## 暂时妥协的地方

- **CSP 里保留了 `'unsafe-inline'`**（script-src 和 style-src）：因为 Vite dev 模式和 MathJax 内联配置需要。**后续改进**：改用 nonce 或 hash 收紧。
- **GitHubActions 仍用 root SSH**：CI 直接 rsync 到 `/var/www/site/`，权限最大。**后续改进**：创建一个受限的 deploy 用户，只对 `/var/www/site/` 有写权限。
- **localStorage 数据仍单设备**：跨端同步在 P1/P2 里。
