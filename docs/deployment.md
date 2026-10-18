# 部署指南

## 一、环境要求

| 项 | 要求 |
|---|---|
| PHP | 7.0 及以上（代码按 7.0 语法编写，8.x 亦可运行） |
| PHP 扩展 | 必需：`pdo_mysql`、`openssl`、`mbstring`、`json`；可选：`gd`（头像裁剪，未启用时保存原图） |
| 数据库 | MySQL 5.7+ / 8.0 / MariaDB 10.2+，字符集 `utf8mb4` |
| Web 服务器 | Apache 2.4（支持 `.htaccess`）或 Nginx |
| 磁盘 | 建议 ≥ 1 GB（聊天媒体 7 天滚动） |
| HTTPS | 正式环境必须启用 |

检查扩展：

```bash
php -m | grep -E 'pdo_mysql|openssl|mbstring|gd|json'
```

## 二、目录与权限

```
站点根目录/
├── config/      需要可写（安装时生成 config.php）
├── secrets/     需要可写（生成 master.key），权限 700
├── storage/     需要可写（安装锁、日志）
├── media/       需要可写（媒体与头像）
└── 其余目录     只读即可
```

```bash
chmod 755 config secrets storage media
chmod 600 secrets/master.key
chown -R www-data:www-data config secrets storage media   # 按实际运行用户调整
```

`config/`、`secrets/`、`storage/`、`sql/`、`app/`、`tools/` 已由根目录 `.htaccess` 拒绝外部访问；`media/` 内的 `.htaccess` 拒绝全部直接访问（媒体统一走 `/api/media/{id}`）。

## 三、安装

### 3.1 网页安装

1. 上传全部文件到站点根目录；
2. 创建数据库（`utf8mb4`，无需手工建表）；
3. 访问 `https://你的域名/install.php`；
4. 填写数据库、站点地址，勾选「强制 HTTPS」；
5. 提交后自动建表、生成配置与主密钥、导入表情；
6. **删除 `install.php` 与 `setup.php`**。安装页不做「已安装」检测，保留时可再次访问并重新安装（会覆盖 `config/config.php`，不会删除数据库已有数据）。

### 3.2 命令行安装

```bash
php install.php \
  --db_host=127.0.0.1 \
  --db_port=3306 \
  --db_name=silverchat \
  --db_user=silverchat \
  --db_pass='你的密码' \
  --site_url=https://chat.example.com \
  --force_https=1
```

安装完成后会输出导入的表情数量。

### 3.3 安装做了什么

1. 执行 `sql/schema.sql` 建表；
2. 写入 `config/config.php`；
3. 生成 `secrets/master.key`（32 字节随机，十六进制存储，权限 600）；
4. 读取 `assets/emoji/builtin/manifest.json` 导入表情；
5. 写入 `storage/installed.lock`。

**主密钥一旦生成不可更改**：更换主密钥会导致所有服务器端加密字段（用户名、昵称、群名、动态、头像等）无法解密。备份数据库时必须同时备份 `secrets/master.key`，但两者应分开存放。

## 四、Web 服务器配置

### 4.1 Apache

项目自带 `.htaccess`，需启用 `mod_rewrite`、`mod_headers`、`mod_expires`：

```apache
<Directory /var/www/silverchat>
    AllowOverride All
    Require all granted
</Directory>
```

`.htaccess` 规则：
- `/api/*` → `api.php`
- 已存在的静态文件直接返回
- 其余路径 → `index.php`（前端 History 路由）
- 拒绝访问 `config|secrets|storage|sql|tools|app`、`legal/*.md`、`*.key|log|sql|lock|bak|ini|md|json`

### 4.2 Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name chat.example.com;
    root /var/www/silverchat;
    index index.php;

    client_max_body_size 55m;

    # API 单入口
    location ^~ /api/ {
        rewrite ^/api/(.*)$ /api.php last;
    }

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
    }

    # 敏感目录
    location ~ ^/(config|secrets|storage|sql|tools|app)/ { deny all; }
    location ~ ^/legal/.*\.md$ { deny all; }
    location ~* \.(key|log|sql|lock|bak|ini|md|json)$ { deny all; }

    # 静态资源缓存
    location ~* \.(css|js|png|gif|svg|webp)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

Nginx 下 `manifest.json` 会被上面的正则拦截，需放行：

```nginx
location = /manifest.json { allow all; }
```

### 4.3 HTTPS

- 使用 Let's Encrypt 或主机商提供的证书；
- 安装时勾选「强制 HTTPS」或设置 `site.force_https = true`；
- 反向代理后需在 `site.trusted_proxies` 填写代理网段，否则所有请求的 IP 都会是代理地址，导致限流失效：

```php
'site' => array(
    // ...
    'trusted_proxies' => array('10.0.0.0/8', '172.16.0.0/12'),
),
```

## 五、共享主机（InfinityFree 等）

| 限制 | 影响 | 应对 |
|---|---|---|
| 无 SSH / Composer | 不能命令行安装 | 用网页 `install.php` |
| 无 Cron | 媒体不能定时清理 | 惰性清理：拉历史、上传、登录、每 20 次轮询各触发一批 |
| 无 WebSocket | 无法长连接 | 4 秒短轮询，页面隐藏时 15 秒 |
| Inode 限制（约 3 万） | 文件数量受限 | 聊天媒体 7 天删除；内置表情 226 个文件 |
| 文件类型审查 | 可能删除某些文件 | 纯 PHP/JS/CSS/PNG，无二进制可执行文件 |
| 前置反爬 | 首次访问有 JS 挑战 | 正常浏览器访问不受影响；接口调用需带浏览器 UA |
| 强制 HTTPS | 免费子域默认 HTTPS | 安装时开启强制 HTTPS |

**注意**：共享主机通常不允许关闭 `display_errors`，请确认 `config/config.php` 中 `site.debug` 为 `false`。

## 六、日常运维

### 6.1 备份

```bash
# 数据库
mysqldump -u user -p --single-transaction silverchat > backup-$(date +%F).sql

# 主密钥（必须单独、加密存放）
cp secrets/master.key /secure/offsite/master.key

# 媒体（可选，7 天内的文件）
tar czf media-$(date +%F).tar.gz media/
```

**主密钥与数据库备份不得存放在同一位置**，否则服务器端加密失去意义。

### 6.2 日志与清理

- 应用日志：`storage/logs/app.log`（仅记录接口异常，不含消息内容）；建议每月清理。
- 清理失败记录：`cleanup_failures` 表；可定期查看。
- 限流记录：`rate_limits`、`login_attempts` 由代码概率性清理（1/50 请求）并保留 1 天。

```bash
# 手动清理 30 天前的日志
find storage/logs -name '*.log' -mtime +30 -delete
```

### 6.3 升级

1. 备份数据库与 `secrets/master.key`；
2. 覆盖代码（**不要覆盖** `config/config.php`、`secrets/`、`storage/installed.lock`、`media/`）；
3. 若 `sql/schema.sql` 有变更，手工执行新增的 `CREATE TABLE` / `ALTER TABLE`；
4. 修改法律文档后同步提升 `config/legal_versions.php` 版本号，用户下次登录会收到重新同意弹窗；
5. 访问站点确认登录、发消息、上传图片正常。

静态资源引用统一带 `?v=SC_VERSION`，覆盖代码后浏览器会重新拉取；若仍看到旧界面，确认 `app/bootstrap.php` 的 `SC_VERSION` 已随版本更新，并强刷一次。

## 七、故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 打开站点跳转 `/install.php` | `config/config.php` 或 `storage/installed.lock` 缺失 | 重新安装或补回锁文件 |
| 500 错误 | PHP 版本过低、扩展缺失、目录不可写 | 查看主机错误日志；开启 `site.debug` 临时定位 |
| 登录提示「服务暂时不可用」 | 数据库连接失败 | 检查 `config/config.php` 的 db 配置；确认数据库用户权限 |
| 图片显示 403 | 媒体不属于该用户或签名过期 | 正常安全行为；刷新会话重试 |
| 聊天图片显示「已过期」 | 超过 7 天被清理 | 设计如此，不可恢复 |
| 消息显示「消息无法解密」 | 对方更换了密钥，或本机私钥丢失 | 双方重新核对安全码；历史消息无法恢复 |
| 群聊提示「群密钥尚未就绪」 | 新成员未收到群密钥封装 | 让邀请者在群资料页重新邀请该成员 |
| 头像 404 | 未上传头像 | 正常占位；上传后自动生效 |
| 上传失败 | 超过大小限制或目录不可写 | 检查 `media/` 权限与 `php.ini` 的 `upload_max_filesize` |
| 登录成功后立刻提示「登录已过期」 | 主机（CGI/FastCGI）剥离了 `Authorization` 请求头 | 确认已上传最新 `.htaccess`（含透传规则）；程序同时发送 `X-Auth-Token` 兜底。覆盖后强刷一次 |
| 更新代码后界面仍是旧版 | 浏览器缓存了 30 天的 JS/CSS | 资源已带 `?v=版本号`；确认覆盖了 `index.php` 与 `app/bootstrap.php`，再强刷一次 |
| 客服显示「尚未上线」 | 客服账号从未登录，服务器没有其公钥 | 用 `kefu` 登录一次；登录时浏览器会生成并上传公钥 |
| 安装页显示「已安装」 | `storage/installed.lock` 有内容 | 需要重装时删除该文件再刷新；新版安装页不会因空文件误判 |
| 通话一直停留在「正在呼叫」 | 对方未在 60 秒内接听，或信令未送达 | 确认对方在线；查看 `storage/logs/app.log` 是否有 `call` 相关错误 |
| 通话无法接通或没有声音 | 对称 NAT / 防火墙阻断 UDP | 当前仅使用 STUN；更换网络，或自行部署 TURN |
| 提示「无法使用麦克风」 | 未授权麦克风，或页面不是 HTTPS | 在浏览器允许麦克风权限；确认通过 `https://` 访问 |

## 八、安全加固清单

- [ ] 正式环境 `site.debug = false`
- [ ] 启用 HTTPS 并开启 HSTS
- [ ] `secrets/master.key` 权限 600，且不在 Web 根目录内可访问
- [ ] 删除或锁定 `install.php`
- [ ] 数据库使用独立账号，只授予该库权限
- [ ] 关闭数据库外网访问
- [ ] 定期更换管理员密码；不与其他站点共用
- [ ] 备份主密钥与数据库分离存放
- [ ] 确认 `.htaccess` / Nginx 规则已拦截 `config|secrets|storage`
- [ ] 检查 `storage/logs`、`media` 目录不可直接浏览

## 九、规模与容量

| 指标 | 参考值 |
|---|---|
| 单张聊天图片（压缩后） | 200–400 KB |
| 225 个内置表情 | 约 3.7 MB |
| 100 用户 / 日均 2000 条消息 | 数据库约 4 万行，媒体约 2–3 GB（7 天滚动） |
| 轮询开销 | 每在线用户每分钟 15 次请求（4 秒一次） |

共享主机的每日点击量限制通常在 5 万次左右，按 4 秒轮询计算可支撑约 20–30 人同时在线。用户量增长后建议迁移到 VPS 并改用 WebSocket 或 SSE。

## 十、通话与网络

- 语音/视频通话使用 WebRTC，媒体流 P2P 直连，服务器只转发 SDP/ICE 信令，音视频带宽不经过主机。
- 默认 STUN 已内置（小米、B 站、芒果、斗鱼、Google），可在 `config/config.php` 的 `call.stun` 中替换；留空则使用同一组内置默认值。
- 仅需客户端能 UDP 出站；主机本身不需要开放端口。
- 未部署 TURN：双方都在对称 NAT（部分移动网络、企业防火墙）时可能无法接通。需要稳定连通性时请自行部署 coturn，并扩展 `sc_call_ice_servers()` 支持 `turn:` 与凭据。
- 通话不支持群聊与客服会话；同一账号同一时间只允许一通。
