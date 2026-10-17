# 架构与数据模型

## 一、设计目标与约束

| 目标 | 实现方式 |
|---|---|
| 适配共享主机 | 无 WebSocket（短轮询）、无 Cron（惰性清理）、单入口路由、零依赖 |
| PHP 7.0 兼容 | 不使用 `void` 返回类型、`?->`、`match`、箭头函数、类型化属性 |
| 零构建 | 原生 ES5 风格 JavaScript，按 `<script>` 顺序加载，无 npm |
| 消息端到端加密 | Web Crypto：X25519 / P-256 + HKDF + AES-256-GCM |
| 全字段保护 | 服务器端 AES-256-CBC + HMAC-SHA256，用户名盲索引 |
| 合规可审计 | 五份法律文档、同意记录、版本化重新同意 |
| 文件数可控 | 226 个表情文件、按需生成的媒体文件、7 天清理 |

## 二、总体架构

```
┌──────────────────────────── 浏览器 ────────────────────────────┐
│  assets/js/core.js      API / 路由 / 弹窗 / 格式化              │
│  assets/js/crypto.js    身份密钥、会话密钥、群密钥、安全码       │
│  assets/js/store.js     全局状态、轮询、摘要解密缓存             │
│  assets/js/ui.js        导航栏 / Tab / 头像 / 空态              │
│  assets/js/pages/*.js   登录、聊天、通讯录、动态、我             │
│  IndexedDB              E2EE 私钥与群密钥（永不上传）            │
└───────────────────────────────┬────────────────────────────────┘
                                │ HTTPS + Bearer Token
┌───────────────────────────────▼────────────────────────────────┐
│  api.php  单入口：解析路径 → 白名单路由 → 模块函数               │
│  app/bootstrap.php   配置、时区、安全头、HTTPS 跳转              │
│  app/helpers.php     响应、鉴权、限流、IP、错误码                │
│  app/crypto.php      字段加密、盲索引、Token、公开 ID            │
│  app/db.php          PDO 单例与查询辅助                          │
│  app/auth_api.php    注册登录、资料、头像、找回、注销、同意      │
│  app/friend_api.php  搜索、申请、备注、星标、拉黑、删除          │
│  app/message_api.php 会话列表、发送、撤回、历史、已读            │
│  app/group_api.php   建群、邀请、踢人、退群、群密钥              │
│  app/moment_api.php  动态发布、Feed、点赞、评论                  │
│  app/media_api.php   上传、下载、签名 URL、B 类媒体解密          │
│  app/poll_api.php    轮询增量、未读、已读回执、通知              │
│  app/legal.php       法律文档渲染与版本                          │
├──────────────────────────────────────────────────────────────────┤
│  MySQL：users / messages / ...（见第四节）                       │
│  media/：聊天媒体密文、动态图片与头像的服务器端加密文件          │
│  secrets/master.key：字段加密主密钥（Web 根之外）                │
└──────────────────────────────────────────────────────────────────┘
```

## 三、请求生命周期

### 3.1 API 请求

```
浏览器 fetch('/api/message/send')
  → .htaccess: ^api/(.*)$ → api.php
  → api.php: 加载 bootstrap / helpers / 各模块
  → sc_boot(): 时区、错误级别、强制 HTTPS
  → sc_security_headers(): nosniff / DENY / no-referrer / HSTS
  → sc_check_origin(): POST 校验 Origin 与 Host 一致
  → 解析 REQUEST_URI，去掉 /api 前缀
  → 动态路由：media/{id}、avatar/{public_id}
  → 静态路由表：'POST message/send' → api_message_send()
  → sc_require_auth(): Bearer Token → SHA-256 → 查 user_tokens → 校验过期
  → 业务处理（全部 SQL 预处理）
  → sc_json({code, msg, data})
  → 异常：sc_log() 记录（不含消息内容）→ 统一错误响应
```

### 3.2 页面请求

```
浏览器 GET /talk/12
  → .htaccess: 非静态文件 → index.php
  → index.php: 判断是否 /legal/{doc}
      ├── 是：服务端渲染 Markdown → 完整 HTML（无 JS 也可阅读）
      └── 否：输出应用壳 + 按序加载 JS
  → app.js: 无 Token → /login；有 Token → /api/auth/me → 启动路由
  → SC.render(): 匹配前端路由 → pages/*.js 渲染
```

### 3.3 安全响应头

```
Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  connect-src 'self'; object-src 'none'; base-uri 'none';
  frame-ancestors 'none'
```

脚本严格同源、禁止内联，样式允许内联属性（动态布局需要）。用户内容一律以文本节点渲染，不使用 `innerHTML` 插入用户输入。

## 四、数据模型

### 4.1 表清单

| 表 | 作用 | 关键索引 |
|---|---|---|
| `users` | 账号、资料、公钥 | `uk_public_id`、`uk_username_bidx` |
| `user_tokens` | 登录凭证哈希 | 主键 `token_hash`、`idx_user` |
| `user_devices` | 设备与设备公钥 | `uk_device(user_id, device_id)` |
| `login_attempts` | 登录失败记录 | `idx_user_time`、`idx_ip_time` |
| `rate_limits` | 通用限流桶 | `idx_bucket_time` |
| `friends` | 好友关系、备注、星标、拉黑 | 主键 `(user_id, friend_id)` |
| `friend_requests` | 好友申请 | `uk_pending(from_id,to_id,status)` |
| `conversations` | 会话（单聊/群聊） | `uk_conv_key` |
| `user_conversations` | 用户与会话的关系、未读、置顶、免打扰 | 主键 `(user_id, conv_id)` |
| `messages` | 消息 | `uk_client(sender_id, client_msg_id)`、`idx_conv_id` |
| `groups` | 群 | `uk_gp_public` |
| `group_members` | 群成员与角色 | 主键 `(group_id, user_id)` |
| `group_keys` | 群密钥的逐人封装 | 主键 `(group_id, user_id)` |
| `emoji_packages` / `emojis` | 表情包与表情 | `uk_pkg`、`idx_pkg` |
| `media_files` | 媒体台账与过期时间 | `idx_expired`、`idx_uploader` |
| `cleanup_failures` | 清理失败记录 | — |
| `moment_posts` / `moment_media` / `moment_likes` / `moment_comments` / `moment_visibility` | 动态 | `idx_author_time`、`idx_post` |
| `user_consents` | 协议同意记录 | `uk_user_doc_version` |
| `account_deletion_requests` | 注销申请 | `idx_user`、`idx_status` |
| `settings` | 键值配置（轮询计数等） | 主键 `k` |

### 4.2 关键设计

**对外 ID 与内部 ID 分离**

- 内部主键 `id` 自增，仅服务器使用；
- 对外 `public_id = 'sc_' + base36(id×7919 + random) + 2 位 hex`，不暴露注册顺序；
- 群 ID `gp_` + 8 位 hex；
- 前端所有接口只用 `public_id`，头像 `/api/avatar/{public_id}`，不暴露内部 id。

**会话键**

```
单聊：u{小id}_u{大id}    例：u12_u87
群聊：g{groupId}         例：g42
```

会话键唯一，创建时使用 `INSERT ... ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)` 保证幂等。

**未读计数**

`user_conversations.unread` 在发送消息的事务内对其他成员 `+1`；发送者自身不增加。打开会话调用 `conversation/read` 清零并更新 `last_seen_id`。单聊已读回执通过轮询返回对方 `last_seen_id`。

**消息幂等**

客户端为每条消息生成 `client_msg_id`，表上 `uk_client(sender_id, client_msg_id)` 唯一。重复提交返回已有消息 ID，避免网络重试造成重复。

**消息 = 密文包**

`messages.content` 为 JSON 字符串：

```json
{"c":"base64(密文)","n":"base64(nonce)","kf":"发送方公钥指纹前8位"}
```

服务器只做长度与类型校验，不解析内容。系统消息 `type=99` 为明文，用于“撤回”“加入群聊”等提示。

## 五、密码学设计

### 5.1 三层保护

| 层级 | 数据 | 密钥 | 服务器可否解密 |
|---|---|---|---|
| A 端到端 | 消息正文、聊天媒体 | 浏览器 IndexedDB | 否 |
| B 服务器端 | 用户名、昵称、备注、群名、动态文字与图片、头像 | `secrets/master.key` 派生 | 是 |
| C 哈希 | 密码、Token、安全答案 | 无 | 不可逆 |

### 5.2 字段加密

```
master.key（32 字节）
  ├── HMAC(master, "field-encryption")     → encKey（AES-256）
  ├── HMAC(master, "field-authentication") → macKey（HMAC-SHA256）
  └── HMAC(master, "blind-index")          → blindKey

密文格式：v1:{base64(iv)}:{base64(ciphertext)}:{base64(mac)}
mac = HMAC-SHA256("v1|" || iv || ciphertext, macKey)
```

- 每次随机 16 字节 IV，同一明文每次密文不同；
- 加密与认证使用独立密钥，实现密钥分离；
- 解密前先校验 MAC（`hash_equals`），防填充预言与篡改；
- 版本前缀为未来密钥轮换预留。

### 5.3 盲索引

```php
blind_index($username) = HMAC-SHA256(mb_strtolower(trim($username)), blindKey)
```

大小写不敏感，可用于唯一索引与等值查询；攻击者没有 blindKey 无法预构建彩虹表。

### 5.4 Token

```
token = bin2hex(random_bytes(32))        // 256 位熵，仅返回给浏览器
存储  = sha256(token)                    // 数据库不存原始 Token
校验  = hash('sha256', $input) 后按主键查，再 hash_equals
有效期 = 7 天，触达时滑动续期，登出/改密/踢设备立即删除
```

### 5.5 端到端加密流程

```
注册/登录：浏览器生成 X25519 与 P-256 两套密钥对
  → 公钥 JSON {"x25519":"...","p256":"..."} 上传
  → 私钥（PKCS#8）存 IndexedDB，永不上传

发送：
  1. 取对端公钥（内存 → localStorage 30 天 → /api/user/info）
  2. 协商算法：优先 X25519，双方都无则 P-256
  3. ECDH → 共享秘密 SS
  4. HKDF-SHA256(SS, info="message-key") → K（AES-256-GCM）
  5. 随机 12 字节 nonce
  6. AES-GCM(K, nonce, 明文, AAD="conv:{convId}")
  7. 提交 {c, n, kf}，kf = SHA256(发送方公钥) 前 8 位

接收：相同算法与本机私钥推导 SS → 相同 K → 解密
```

`AAD` 绑定会话 ID，防止密文被搬到其他会话重放。GCM 认证失败显示“消息无法解密”。

### 5.6 群密钥分发

群聊无法使用两方 ECDH，采用“群密钥 + 逐人封装”：

```
1. 建群者生成随机 32 字节群密钥 GK
2. 对每个成员：ECDH(建群者私钥, 成员公钥) → HKDF(info="group-key-wrap") → 包装密钥
   用包装密钥 AES-GCM 加密 GK，得到 wrapped（每人一份）
3. 全部 wrapped 随建群请求提交，存 group_keys(group_id, user_id, wrapped)
4. 成员登录后 GET /api/group/key 取自己那份，用自己私钥解封 → GK（存 IndexedDB）
5. 群消息：AES-GCM(GK, nonce, 明文, AAD="conv:{convId}")
6. 新成员加入：邀请者取本机 GK，对新成员公钥封装后 POST /api/group/key
```

服务器只存封装密文，无法解封，因此群消息保持端到端加密。代价：新成员的群密钥依赖邀请者在线分发；若缺失，界面提示“群密钥尚未就绪”。

### 5.7 安全码（中间人检测）

```
data = min(pubA, pubB) || max(pubA, pubB)   // 按十六进制字典序
hash = SHA-256(data) 取前 30 字节
展示 = 12 组 × 5 位十六进制
```

双方计算结果必须一致。验证状态只存本机 localStorage（`public_id + key_hash + 时间`），对端公钥变化时自动失效并红色告警。安全码不能通过聊天本身传递（若已被中间人劫持，聊天内容也会被替换）。

### 5.8 媒体加密的两条路径

| 类型 | 加密位置 | `file_type` | 下载 |
|---|---|---|---|
| 聊天媒体（图片/语音/视频/文件） | 浏览器用会话密钥 AES-GCM 加密 | 1–4 | 原样返回密文，浏览器解密 |
| 动态图片、头像 | 服务器用字段加密存储 | 11–14、头像 | 服务器解密后返回；动态图片用签名 URL |

原因：动态图片需要对“可见范围内的多个好友”展示，无法共享某一对用户的会话密钥；若强行逐人封装，成本与失败面都不可控。因此动态图片归入 B 类（服务器端加密），并在隐私政策中如实披露。

签名 URL：

```
t = HMAC-SHA256(mediaId || "|" || exp, master.key) 前 32 位 + "." + exp
/api/media/{id}?t=...   // 1 小时有效，供 <img> 使用（img 无法携带 Bearer 头）
```

## 六、前端架构

### 6.1 模块与加载顺序

```
core.js     → SC 命名空间、API、路由、DOM、Toast、Dialog、图标
crypto.js   → 身份密钥、会话密钥、群密钥、安全码、字节加解密
ui.js       → 导航栏、Tab、头像、空态、骨架、链接拦截
store.js    → 全局状态、轮询、摘要解密、群密钥缓存
pages/*.js  → 各页面渲染与交互
app.js      → 路由注册、启动与鉴权守卫
```

无打包器，按 `<script>` 顺序加载；模块间通过 `window.SC` 通信。

### 6.2 路由

History API + 服务端回退到 `index.php`。路由表使用 `/talk/:id` 形式注册，`SC.navigate()` 执行 `pushState` 并重渲染。每次切换页面调用 `SC.onRouteCleanup()` 注册的清理函数，停掉上一页的轮询与事件监听。

### 6.3 状态与轮询

```
SC.state: user, conversations, friends, groups, unread, pendingRequests, serverTime
SC.poll: 4 秒（可见）/ 15 秒（隐藏）/ 失败指数退避 4→8→16→30 秒
游标: cursor = 最大消息 ID；since_time = 上次服务器时间（用于动态通知）
```

轮询返回：
- `messages`：游标之后、非本人发送的新消息（密文，前端解密）；
- `conversations`：未读摘要；
- `friend_requests`：新的好友申请；
- `moment_notices`：自己动态的新点赞与评论；
- `read_map`：单聊对方已读位置（驱动双勾变蓝）。

### 6.4 渲染安全

- 所有用户内容通过 `textContent` 或 `SC.esc()` 转义后插入；
- 仅图标、头像占位、自己构造的模板使用 `innerHTML`；
- CSP 禁止内联脚本，事件全部通过 `addEventListener` 绑定；
- 媒体 URL 使用 `blob:`，不把用户文件内容拼进 DOM 字符串。

## 七、媒体生命周期

### 7.1 四个惰性清理触发点

| 触发点 | 范围 | 批量 |
|---|---|---|
| 拉取历史消息 | 该会话的过期媒体 | ≤15 |
| 上传新媒体 | 全局最旧的过期媒体 | ≤15 |
| 登录成功 | 该用户上传的过期媒体 | ≤15 |
| 每第 20 次轮询 | 全局最旧 | ≤10 |

清理动作：`realpath` 校验路径在 `media/` 内 → `unlink` → `media_files.deleted=1` → 关联消息 `content='expired'`、`extra={"expired":true}`。失败写入 `cleanup_failures`，不阻断请求。

### 7.2 过期展示

前端看到 `content='expired'` 或 `extra.expired=true` 时渲染灰色占位“图片已过期/语音已过期/文件已过期”，不可点击。

## 八、合规设计

### 8.1 同意记录

```
注册/登录：前端勾选三份协议 → 提交 consent_versions
服务端：校验版本与 config/legal_versions.php 一致 → 写 user_consents
        记录 user_id、doc_type、doc_version、agreed_at、ip、user_agent
```

版本不一致时注册直接拒绝（1701）；登录返回 `needs_reconsent: true`，前端弹窗要求重新同意。

### 8.2 协议版本

`config/legal_versions.php` 是唯一版本源。修改任何法律文本后必须提升对应版本，否则已同意用户不会再看到更新提示。

### 8.3 注销

单事务内：清空用户名/昵称/签名/安全问题/公钥、密码置随机值、删除 Token 与设备、删除好友与申请、消息发送者置 0、动态下架、退出群成员、删除媒体文件与头像，最后写注销申请记录（保留 3 年）。

## 九、关键取舍

| 取舍 | 选择 | 理由 |
|---|---|---|
| 实时性 | 4 秒轮询 | 共享主机无 WebSocket；延迟可接受，成本可控 |
| 定时清理 | 惰性清理 | 无 Cron；把清理摊到正常请求里 |
| 私钥备份 | 不备份 | 备份即削弱端到端加密；代价是换设备丢历史消息，已在协议中明示 |
| 动态图片 | 服务器端加密 | 多接收者无法共享会话密钥；如实标注为 B 类 |
| 群密钥 | 逐人封装 | 保持端到端加密；代价是新成员依赖在线分发 |
| 用户名查询 | 只做精确搜索 | 模糊搜索需明文索引，与加密存储冲突 |
| 前端构建 | 零构建 | 共享主机部署简单；代价是模块需手工按序加载 |
