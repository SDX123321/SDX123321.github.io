#!/bin/bash
set -e
# VPS P0-3：在 nginx 上落地 CSP/HSTS + 切换到 HTTPS (Cloudflare Full Strict)
#
# 前置准备：
#   1) 已在 Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate
#      生成 RSA 2048 证书，host = web.zzzzcx.com
#   2) 把"Origin Certificate"段落贴到本脚本下面的 CERT 占位
#   3) 把"Private Key"段落贴到本脚本下面的 KEY 占位
#
# 使用：
#   ssh root@VPS 后，把本脚本最后两段 CERT/KEY 替换为实际内容，再 bash 运行

echo "========================================"
echo "  P0-3: nginx HTTPS + 安全头 落地"
echo "========================================"

# 1) 创建证书目录
mkdir -p /etc/nginx/certs
chmod 700 /etc/nginx/certs

# 2) 写入原站证书和私钥
#    ↓↓↓ 把 Cloudflare 给你的两段内容粘在下面 EOF 之间 ↓↓↓
cat > /etc/nginx/certs/origin.pem << 'CERT_EOF'
-----BEGIN CERTIFICATE-----
把 Cloudflare "Origin Certificate" 内容粘贴在这里
-----END CERTIFICATE-----
CERT_EOF

cat > /etc/nginx/certs/origin.key << 'KEY_EOF'
-----BEGIN RSA PRIVATE KEY-----
把 Cloudflare "Private Key" 内容粘贴在这里
-----END RSA PRIVATE KEY-----
KEY_EOF
#    ↑↑↑ 替换结束 ↑↑↑

chmod 600 /etc/nginx/certs/origin.pem /etc/nginx/certs/origin.key

# 3) 写入 nginx 配置
cat > /etc/nginx/sites-available/site.conf << 'NGINX_EOF'
server {
    listen 80;
    server_name web.zzzzcx.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name web.zzzzcx.com;
    root /var/www/site;

    ssl_certificate     /etc/nginx/certs/origin.pem;
    ssl_certificate_key /etc/nginx/certs/origin.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

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
    gzip_types text/css application/javascript text/html application/json image/svg+xml text/plain;
    gzip_min_length 256;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;

    access_log /var/log/nginx/site-access.log;
    error_log  /var/log/nginx/site-error.log;

    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://giscus.app https://challenges.cloudflare.com https://busuanzi.ibruce.info; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https: blob:; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' https://r2.zzzzcx.cn; frame-src https://giscus.app https://docs.google.com https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;

    location / { try_files $uri $uri/ /index.html; }
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
    location /files/  { expires 30d; add_header Cache-Control "public, must-revalidate"; }
    location /courses/ { expires 7d; add_header Cache-Control "public, must-revalidate"; }
    location = /sw.js { add_header Cache-Control "no-cache, no-store, must-revalidate" always; expires -1; }
    location = /favicon.ico { log_not_found off; access_log off; try_files $uri =204; }
}
NGINX_EOF

# 4) 启用 & 验证
ln -sf /etc/nginx/sites-available/site.conf /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

echo ""
echo "========================================"
echo "  完成！现在去 Cloudflare 后台："
echo "========================================"
echo "  SSL/TLS → Overview → 改为 'Full (Strict)'"
echo "  SSL/TLS → Edge Certificates → 打开 'Always Use HTTPS'"
echo "  SSL/TLS → Edge Certificates → 打开 'HSTS Enabled'"
echo ""
echo "验证：curl -I https://web.zzzzcx.com"
