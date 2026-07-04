#!/bin/bash
set -e
# VPS 第二步：配置 nginx 站点
# 使用 Cloudflare 代理模式，不需要本地 certbot

echo "========================================"
echo "  配置 nginx — Cloudflare 代理模式"
echo "========================================"

# 1. 创建 nginx 配置
echo "[1/3] 部署 nginx 配置..."

cat > /etc/nginx/sites-available/site.conf << 'NGINX_CONF'
server {
    listen 80;
    server_name web.zzzzcx.com;
    root /var/www/site;

    # Cloudflare 真实 IP
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 131.0.72.0/22;
    set_real_ip_from 2400:cb00::/32;
    set_real_ip_from 2606:4700::/32;
    set_real_ip_from 2803:f800::/32;
    set_real_ip_from 2405:b500::/32;
    set_real_ip_from 2405:8100::/32;
    set_real_ip_from 2a06:98c0::/29;
    set_real_ip_from 2c0f:f248::/32;
    real_ip_header CF-Connecting-IP;

    gzip on;
    gzip_types text/css application/javascript text/html application/json image/svg+xml text/plain application/pdf;
    gzip_min_length 256;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;

    access_log /var/log/nginx/site-access.log;
    error_log  /var/log/nginx/site-error.log;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /files/ {
        expires 30d;
        add_header Cache-Control "public, must-revalidate";
    }

    location /courses/ {
        expires 7d;
        add_header Cache-Control "public, must-revalidate";
    }

    location = /sw.js {
        add_header Cache-Control "no-cache";
        expires -1;
    }

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
NGINX_CONF

# 2. 启用站点
echo "[2/3] 启用站点配置..."
ln -sf /etc/nginx/sites-available/site.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 3. 完成
echo "[3/3] 完成！"
echo ""
echo "========================================"
echo "  nginx 配置完成！"
echo "========================================"
echo ""
echo "  Cloudflare 代理模式下："
echo "  - SSL 证书由 Cloudflare 自动管理"
echo "  - 在 Cloudflare Dashboard 确保 web.zzzzcx.com 开启代理（橙色云朵）"
echo "  - 如需端到端加密（VPS→CF），可以在 Cloudflare → SSL/TLS 将模式改为 Full"
echo ""
echo "查看日志:  tail -f /var/log/nginx/site-access.log"
