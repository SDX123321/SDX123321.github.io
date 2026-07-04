#!/bin/bash
set -e
# 在 SSH 到 VPS 后，以 root 身份运行：
#   curl -sL https://raw.githubusercontent.com/SDX123321/SDX123321.github.io/main/scripts/vps-setup.sh | bash
#   或者本地：bash scripts/vps-setup.sh

echo "========================================"
echo "  VPS 环境初始化 — 期末复习网站"
echo "========================================"

# 1. 系统更新
echo "[1/7] 系统更新..."
apt update && apt upgrade -y

# 2. 安装 nginx
echo "[2/7] 安装 nginx..."
apt install nginx -y

# 3. 安装 certbot（SSL证书）
echo "[3/7] 安装 certbot..."
apt install certbot python3-certbot-nginx -y

# 4. 安装 Node.js 20（本地构建用）
echo "[4/7] 安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install nodejs -y

# 5. 安装 git
echo "[5/7] 安装 git..."
apt install git -y

# 6. 防火墙配置
echo "[6/7] 配置 UFW 防火墙..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# 7. 创建站点目录
echo "[7/7] 创建站点目录..."
mkdir -p /var/www/site
chmod 755 /var/www/site

# 验证安装
echo ""
echo "========================================"
echo "  环境安装完成，验证："
echo "========================================"
echo "nginx:  $(nginx -v 2>&1)"
echo "nodejs: $(node -v)"
echo "npm:    $(npm -v)"
echo "git:    $(git --version)"
echo ""
ufw status
echo ""
echo "========================================"
echo "  接下来请执行 nginx 配置和 SSL："
echo "========================================"
echo "  1) bash <第二步 配置 nginx>"
echo "  2) certbot --nginx -d web.zzzzcx.com"
