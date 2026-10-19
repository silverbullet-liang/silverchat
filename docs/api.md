# API 清单

## 约定

- 基址：`/api`
- 请求体：JSON（`Content-Type: application/json`），上传接口为 `multipart/form-data`
- 认证：`Authorization: Bearer <token>`（64 位十六进制）
- 兼容：部分 CGI/FastCGI 主机会剥离 `Authorization`，客户端同时发送 `X-Auth-Token: <token>`，服务端任取其一。
- 统一响应：

```json
{ "code": 0, "msg": "", "data": {} }
```

- `code = 0` 表示成功；其余为业务错误，HTTP 状态码同步给出 400/401/403/404/410/429/500。
- 所有时间戳为 Unix 秒。
- 用户一律以 `public_id`（`sc_` 开头）标识，不暴露内部自增 id。

### 错误码

| 段 | 含义 | 示例 |
|---|---|---|
| 1001–1005 | 通用 | 1001 参数错误、1002 未登录、1003 无权限、1004 频率限制、1005 不存在 |
| 1101–1107 | 账号 | 1101 用户名被占用、1102 用户名或密码错误、1103 尝试频繁、1107 答案错误 |
| 1201–1204 | 好友 | 1201 对方不存在、1202 已是好友、1203 申请已发送、1204 被拉黑 |
| 1301–1304 | 消息 | 1301 会话无权访问、1302 发送频繁、1303 超过撤回时限、1304 无法撤回 |
| 1401–1405 | 群聊 | 1401 群不存在、1402 人数上限、1403 仅群主、1404 仅邀请、1405 已在群中 |
| 1501–1504 | 媒体 | 1501 文件过大、1502 类型不支持、1503 上传失败、1504 已过期 |
| 1601–1602 | 动态 | 1601 无权查看、1602 超长 |
| 1701 | 法律 | 未同意最新协议 |

## 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | 注册 |
| POST | `/auth/login` | 登录 |
| POST | `/auth/logout` | 登出（删除当前 Token） |
| GET | `/auth/me` | 当前用户、未读数、待处理申请、同意状态 |
| GET | `/auth/security_question?username=` | 获取安全问题（账号不存在时返回通用问题） |
| POST | `/auth/reset_password` | 通过安全问题重置密码 |
| GET | `/auth/devices` | 登录设备列表 |
| POST | `/auth/kick` | 踢下线某设备 |
| POST | `/auth/reconsent` | 重新同意协议 |
| POST | `/account/delete` | 注销账号 |

**注册**

```json
{
  "username": "alice",
  "password": "至少6位",
  "nickname": "爱丽丝",
  "public_key": "{\"x25519\":\"...\",\"p256\":\"...\"}",
  "device_id": "d1a2b3c4...",
  "consent_versions": {"privacy":"v1.0","terms":"v1.0","cross-border":"v1.0"},
  "sec_question": "可选",
  "sec_answer": "可选"
}
```

返回 `{token, user, needs_reconsent}`。用户名规则：2–20 字符，支持中英文、数字与 `_ - . @ # $ & +`，不能以 `. _ -` 开头或结尾，大小写不敏感唯一。

**登录**

```json
{"username":"alice","password":"...","public_key":"{...}","device_id":"..."}
```

返回 `{token, user, needs_reconsent, consents}`。登录会更新该设备的公钥与最近活跃时间。

**设备**

`GET /auth/devices` 返回：

```json
{"devices":[{"device_id":"...","user_agent":"Mozilla/5.0 ...","created_at":0,"last_seen_at":0,"current":true}]}
```

`POST /auth/kick` body `{device_id}`，不能踢当前设备。

## 用户

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/user/profile` | 修改昵称、签名、性别 |
| POST | `/user/avatar` | 上传头像（multipart，字段 `avatar`） |
| POST | `/user/public_key` | 同步本机加密公钥（换设备后调用，每小时最多 10 次） |
| POST | `/user/password` | 修改密码（会清空所有登录凭证） |
| POST | `/user/security_question` | 设置安全问题与答案 |
| GET | `/user/info?public_id=` | 查看他人资料与好友状态 |
| GET | `/avatar/{public_id}` | 头像输出（需登录，解密后返回图片） |

`GET /user/info` 返回 `{user, is_friend, has_pending, blocked, remark, is_self}`，`user.public_key` 用于端到端加密。

## 好友

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/friend/search?q=sc_xxx` | 精确搜索用户 |
| POST | `/friend/request` | 发送申请 `{to_public_id, message}` |
| GET | `/friend/requests` | 收到与发出的申请 |
| POST | `/friend/handle` | `{id, action: accept|reject}` |
| GET | `/friend/list` | 好友列表（含备注、星标、公钥） |
| POST | `/friend/remark` | `{public_id, remark}` |
| POST | `/friend/star` | `{public_id, starred: 0|1}` |
| POST | `/friend/block` | `{public_id, blocked: 0|1}` |
| POST | `/friend/delete` | `{public_id}` |
| GET | `/friend/blocklist` | 黑名单 |

接受申请会在同一事务内建立双向好友关系与单聊会话。

## 会话与消息

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/conversations` | 会话列表（含最后一条消息元数据） |
| POST | `/conversation/read` | `{conv_id, last_msg_id}` 清未读 |
| POST | `/conversation/pin` | `{conv_id, pinned}` |
| POST | `/conversation/mute` | `{conv_id, muted}` |
| POST | `/conversation/delete` | `{conv_id}` 从列表移除（消息保留） |
| POST | `/message/send` | 发送消息 |
| POST | `/message/revoke` | `{msg_id}` 2 分钟内 |
| GET | `/message/history` | `?conv_id=&before_id=&limit=20` |

**发送消息**

```json
{
  "conv_id": 12,
  "type": 1,
  "content": "{\"c\":\"base64\",\"n\":\"base64\",\"kf\":\"a1b2c3d4\"}",
  "extra": {"media_id": 88},
  "client_msg_id": "sc_abc_1730000000_12345"
}
```

- `type`：1 文本、2 图片、3 语音、4 视频、5 文件、6 表情、7 位置（99 为系统消息，仅服务端写入）。
- `content` 为客户端加密后的 JSON 字符串，服务器不解析；媒体消息在 `extra.media_id` 关联媒体台账。
- `client_msg_id` 6–64 位字母数字下划线连字符，用于幂等；幂等范围是「同一发送者 + 同一会话」。

**会话列表项**

```json
{
  "conv_id": 12, "type": 1, "title": "爱丽丝", "avatar": "",
  "public_id": "sc_xxx", "unread": 2, "pinned": false, "muted": false,
  "peer_is_staff": false,
  "member_count": 0, "member_avatars": [],
  "last": {"id": 99, "type": 1, "content": "{密文}", "extra": null,
           "status": 1, "created_at": 1730000000,
           "sender_id": 3, "sender_public_id": "sc_yyy", "sender_name": "爱丽丝"}
}
```

群会话会返回 `member_avatars`（前 9 位成员的头像信息），用于九宫格群头像；同时返回 `join_mode`（1 可搜索加入 / 2 仅邀请）与 `my_role`（2 群主 / 1 管理员 / 0 成员），前端据此控制群设置入口。

## 群聊

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/group/create` | 建群（含群密钥封装） |
| GET | `/group/search?q=gp_xxx` | 按群号查询 |
| POST | `/group/join` | `{public_id}` 加入公开群 |
| GET | `/group/list` | 我的群 |
| POST | `/group/invite` | `{public_id, user_public_ids[]}` |
| POST | `/group/kick` | `{public_id, user_public_id}` 仅群主 |
| POST | `/group/quit` | `{public_id}` |
| POST | `/group/update` | 名称/公告/加入方式/我的群昵称 |
| GET | `/group/members?public_id=` | 成员列表（仅群成员；非成员只返回 `member_count`） |
| GET | `/group/key?public_id=` | 取自己那份群密钥封装 |
| POST | `/group/key` | 上传某成员的群密钥封装 |

**建群**

```json
{
  "name": "项目群",
  "member_public_ids": ["sc_aaa", "sc_bbb"],
  "group_key_wraps": [
    {"user_public_id": "sc_aaa", "wrapped": "{\"n\":\"...\",\"c\":\"...\"}"},
    {"user_public_id": "kefu 的 public_id", "wrapped": "..."}
  ]
}
```

`group_key_wraps` 由客户端生成：随机 32 字节群密钥，逐个成员用 ECDH 派生的包装密钥加密。封装内容为 `{n, c, from}`，`from` 是封装者公钥；接收方用「自己的私钥 + from」派生同一密钥解封。服务器只存密文。

## 媒体与表情

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/upload` | 上传（multipart：`file`、`type`、`scope`） |
| GET | `/media/{id}` | 下载（A 类返回密文；B 类解密后返回） |
| GET | `/emoji/packages` | 表情包与表情列表 |

**上传**

- `type`：1 图片、2 语音、3 视频、4 文件
- `scope`：`chat`（默认，客户端密文，A 类）或 `moment`（服务器端加密，B 类）
- 大小限制：图片 5 MB、语音 10 MB、视频 50 MB、文件 20 MB
- 返回 `{media_id, url, size, expired_at}`

动态与头像的媒体需要 `<img>` 直接访问，因此使用签名 URL：`/media/{id}?t=<sig>.<exp>`，有效期 1 小时。

## 轮询

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/poll.php?cursor=&since_time=` | 增量同步 |

```json
{
  "messages": [{"id":100,"conv_id":12,"type":1,"content":"{密文}","extra":null,
                "status":1,"created_at":1730000000,"sender_id":3,
                "sender_public_id":"sc_yyy","sender_name":"爱丽丝"}],
  "conversations": [{"conv_id":12,"unread":1,"last_msg_id":100,
                     "last_seen_id":0,"muted":false,"last_msg_at":1730000000}],
  "friend_requests": [{"id":5,"public_id":"sc_zzz","nickname":"鲍勃",
                       "avatar":"","message":"你好","created_at":1730000000}],
  "moment_notices": [{"type":"like","post_id":9,"public_id":"sc_zzz",
                      "nickname":"鲍勃","created_at":1730000000}],
  "read_map": {"12": 98},
  "cursor": 100,
  "server_time": 1730000005
}
```

- `cursor` 为最后一条消息 ID；客户端下次带上。
- `read_map` 为单聊对方已读到的消息 ID，用于双勾变蓝。
- 建议节奏：4 秒；页面隐藏 15 秒；失败指数退避 4→8→16→30 秒。

## 动态

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/moment/post` | 发布 |
| GET | `/moment/feed?before_id=&limit=20` | 好友动态（游标分页：`before_id` 传上一页最后一条 id；仍兼容 `offset`） |
| GET | `/moment/detail?id=` | 详情（含全部评论） |
| POST | `/moment/like` | `{id, on: 0|1}` |
| POST | `/moment/comment` | `{id, content, reply_to}` |
| POST | `/moment/delete` | `{id}` |

发布参数：

```json
{
  "text": "文字（≤1000）",
  "media": [{"media_id": 88, "type": 1}],
  "visibility": 1,
  "visible_user_ids": ["sc_aaa"]
}
```

`visibility`：1 公开（好友可见）、2 仅好友、3 仅自己、4 指定可见。视频与图片不能混发，图片最多 9 张。

## 客服

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/kefu/status` | 客服是否存在、在线、是否有公钥 |
| POST | `/kefu/start` | 创建/复用与客服的单聊会话 |

`kefu/status` 返回：

```json
{"exists":true,"public_id":"sc_kefu","online":true,"has_key":true,
 "last_seen":1730000000,"nickname":"客服"}
```

在线判定：客服账号最近 90 秒内有设备活动（轮询会刷新）。

`kefu/start` 返回 `{conv_id, kefu:{public_id, nickname, online, has_key}}`。客服账号登录后只能访问消息相关接口，其余接口返回 1003。

## 通话

仅两人单聊；媒体流通过 WebRTC P2P 直连（DTLS-SRTP 加密），服务器只转发 SDP/ICE 与保存记录。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/call/start` | `{conv_id, media_type}`，1 语音 / 2 视频；返回 `call` 与 `ice_servers` |
| POST | `/call/signal` | `{call_id, kind, payload}`，kind=`offer`/`answer`/`ice` |
| GET | `/call/poll?call_id=&after_id=` | 拉取新信令与通话状态（建议 1 秒一次） |
| POST | `/call/answer` | `{call_id, accept}`，仅被叫方可调用；接听时返回 `ice_servers` |
| POST | `/call/end` | `{call_id}`，任一方挂断 |
| GET | `/call/history?conv_id=&limit=` | 通话记录（含时长） |

- 呼叫建立后，被叫方的普通轮询（`/poll.php`）会返回 `incoming_call`，用于弹来电界面。
- 状态：0 呼叫中、1 通话中、2 已结束、3 未接听、4 已拒绝。
- 同一用户同一时间只允许一通通话；60 秒未接听自动置为未接。
- 信令在通话结束后立即删除，通话记录保留。

## 搜索与法律

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/search?q=` | 搜索会话、好友、群（昵称解密后内存匹配） |
| GET | `/legal/versions` | 协议版本与文档清单（免登录） |

## 动态路由

| 路径 | 说明 |
|---|---|
| `/api/media/{id}` | 媒体下载；A 类密文、B 类解密；支持 `?t=` 签名 |
| `/api/avatar/{public_id}` | 头像；需登录，服务器解密后按原格式输出（GIF 保留动画），ETag 协商缓存 |

## 速率限制

| 动作 | 限制 |
|---|---|
| 注册 | 同 IP 每小时 3 次 |
| 登录失败 | 同账号 + IP 5 分钟内 5 次后锁定 |
| 发消息 | 单用户每秒 5 条 |
| 好友申请 | 单用户每天 20 次 |
| 轮询 | 单用户每分钟 30 次 |
| 上传 | 单用户每小时 120 次 |
| 修改密码/重置 | 同 IP 每小时 10 次 |

超限返回对应业务码（1004/1103/1302）。
