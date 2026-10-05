# 腾讯频道 CLI (tencent-channel-cli) 详细 Wiki

> 版本：CLI 1.0.6  
> 适用范围：腾讯频道(QQ频道)社区管理  
> 操作域示例：`guild_id=621631744026206738`

---

## 目录

1. [安装与环境](#1-安装与环境)
2. [鉴权与登录](#2-鉴权与登录)
3. [全局使用规范](#3-全局使用规范)
4. [Domain: manage（频道与成员管理）](#4-domain-manage频道与成员管理)
5. [Domain: feed（帖子与内容管理）](#5-domain-feed帖子与内容管理)
6. [快捷命令（Shortcut）](#6-快捷命令shortcut)
7. [通知系统](#7-通知系统)
8. [敏感信息处理规则](#8-敏感信息处理规则)
9. [故障排查](#9-故障排查)
10. [高风险操作清单（严禁自动执行）](#10-高风险操作清单严禁自动执行)

---

## 1. 安装与环境

### 1.1 检查/安装 CLI

```bash
# 查看版本（要求 >= 1.0.6）
tencent-channel-cli version

# 未安装或版本过低时执行
npm install -g tencent-channel-cli
```

### 1.2 环境检查

```bash
tencent-channel-cli doctor       # 自检连通性
tencent-channel-cli login status # 查看登录状态
```

### 1.3 Windows / PowerShell 注意事项

- 优先使用 `.cmd` 路径调用，避免 PowerShell 执行策略阻止 `.ps1` 脚本。
- 能用 CLI flag 时优先用 flag；复杂对象/数组/分页等场景再用 stdin JSON。
- PowerShell JSON 格式示例：

```powershell
$body = @{ guild_id = "123" } | ConvertTo-Json -Compress
$body | & tencent-channel-cli manage get-guild-info --json
```

---

## 2. 鉴权与登录

### 2.1 扫码鉴权（当前有效方式）

由于内置 Token 鉴权在 Windows 环境下存在读取问题，当前采用扫码授权方式：

**步骤 1：获取授权码/二维码**

```bash
tencent-channel-cli login --json
```

返回示例：

```json
{
  "data": {
    "expires_in_s": 289,
    "message": "请扫描二维码或打开授权链接完成登录，然后执行 tencent-channel-cli login poll-token --json 获取令牌",
    "qr_code": "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMAAABmvDol...",
    "qrcode_path": "C:\\Users\\<用户名>\\.qqcli\\login-qrcode.png",
    "state_file": "C:\\Users\\<用户名>\\.qqcli\\device_auth_state.json",
    "status": "pending_authorization",
    "verification_uri": "https://connect.qq.com/open-platform/device-bind?device_code=..."
  },
  "success": true
}
```

**步骤 2：用户扫码/打开链接授权**

- 打开返回的 `verification_uri` 链接，或扫描 `qrcode_path` 处的二维码图片
- 在手机上确认授权

**步骤 3：轮询获取令牌**

```bash
tencent-channel-cli login poll-token --json
```

**步骤 4：验证登录状态**

```bash
tencent-channel-cli login status --json
```

期望返回：

```json
{"data":{"message":"已登录，服务连通正常。","tokenSource":"keychain","valid":true},"success":true}
```

### 2.2 内置 Token 鉴权（备用方案）

**[!CRITICAL] 内置Token鉴权为唯一优先方案，严禁在未尝试内置Token前引导用户扫码**

**步骤 1：确保 `.env` 文件存在且内容正确**

```powershell
# 检查 .env 文件是否存在
Test-Path "$env:USERPROFILE\.qqcli\.env"

# 创建/覆盖 .env 文件（不带 BOM 头）
Set-Content -Path "$env:USERPROFILE\.qqcli\.env" -Value "QQ_AI_CONNECT_TOKEN=bot:v1_xxx" -NoNewline
```

**步骤 2：清除 Windows 密钥链旧凭证（关键！）**

```powershell
cmdkey /delete:LegacyGeneric:target=qq-cli:token 2>$null
```

> Windows 版 CLI 优先读取 Windows Credentials 中的 `qq-cli:token`，不删除旧凭证会导致即使 `.env` 正确仍使用过期 token。

**步骤 3：验证鉴权状态**

```powershell
tencent-channel-cli login status --json
```

期望返回：

```json
{"data":{"message":"已登录，服务连通正常。","tokenSource":"dotenv","valid":true},"success":true}
```

`tokenSource` 必须为 `"dotenv"`。若为 `"keychain"`，返回步骤 2 重新删除。

### 2.3 鉴权故障排查

| 现象 | 原因 | 解决方案 |
|------|------|---------|
| `tokenSource="keychain"` | 优先读取了 Windows Credentials 旧凭证 | `cmdkey /delete:LegacyGeneric:target=qq-cli:token` |
| `retCode=8011` + `tokenSource="dotenv"` | 内置 token 已过期 | 走扫码授权流程 |
| `.env` 文件不存在 | 首次使用或文件被删除 | 按步骤 1 创建 |
| "invalid header field value for Authorization" | Token 包含换行符或特殊字符 | 重新复制纯净的 Token |

---

## 3. 全局使用规范

### 3.1 命令格式

```bash
tencent-channel-cli <domain> <action> [flags] [options]
```

### 3.2 两种传参模式

| 模式 | 示例 |
|------|------|
| **CLI flag** | `tencent-channel-cli manage get-guild-info --guild-id 123` |
| **stdin JSON** | `echo '{"guild_id":"123"}' | tencent-channel-cli manage get-guild-info` |

> 能用 flag 时优先用 flag；复杂对象/数组/分页等场景再用 stdin JSON。

### 3.3 全局选项

| Flag | 说明 |
|------|------|
| `-d, --dry-run` | 预演模式：仅展示将要发送的参数，不实际执行 |
| `-h, --help` | 查看帮助信息 |
| `-j, --json` | JSON 输出（适用于脚本和 AI 调用） |
| `-y, --yes` | 跳过高风险操作的确认提示 |

### 3.4 参数查询

```bash
# 查看命令参数定义（机器可解析 JSON）
tencent-channel-cli schema feed.publish-feed

# 中文模糊搜索命令
tencent-channel-cli schema --search "发帖"
```

### 3.5 翻页通用规则

- 列表类命令通常返回翻页令牌（如 `feed_attach_info`、`attach_info`、`next_page_token`、`next_page_cookie` 等）。
- 下次请求时传入对应参数即可翻页。

### 3.6 @用户规范

- 必须先通过 `guild-member-search` 或 `get-guild-member-list` 查到 `tiny_id`。
- 填入 `at_users`（`id`=tiny_id, `nick`=昵称）。
- **严禁**在 content 中手写 `@昵称`，严禁用 QQ 号或猜测值。
- 推荐内联语法：`@[昵称](tinyid)`

---

## 4. Domain: manage（频道与成员管理）

### 4.1 频道信息查询

#### 4.1.1 `manage get-guild-info` — 查看频道资料

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |

```bash
tencent-channel-cli manage get-guild-info --guild-id 621631744026206738 --json
```

**返回示例：**

```json
{
  "data": {
    "avatar_url": "https://groupprohead-76292.picgzc.qpic.cn/621631744026206738/100?t=1781514643577",
    "create_time": "1722783250",
    "create_time_human": "2024-08-04 22:54:10",
    "guild_id": "621631744026206738",
    "guild_number": "nanfang1958",
    "guild_type": "私密腾讯频道",
    "member_count": 3071,
    "name": "南方中学频道（瓜开得胜🍉）",
    "profile": "◇━━━━━━━━━━━━━◇\n┃╳╳╳╳  南方不大  ╳╳╳╳┃\n...",
    "share_url": "https://pd.qq.com/s/fn6pykqr7",
    "subscribe_hint": {
      "action": "subscribe_notices",
      "command": "tencent-channel-cli manage notices-on",
      "message": "你还没有开启频道消息通知..."
    }
  },
  "success": true
}
```

#### 4.1.2 `manage get-my-join-guild-info` — 查看我的频道列表

```bash
tencent-channel-cli manage get-my-join-guild-info --json
```

**返回示例：**

```json
{
  "data": {
    "created_guilds": [
      {
        "guild_id": "621631744026206738",
        "guild_number": "nanfang1958",
        "member_count": 3071,
        "name": "南方中学频道（瓜开得胜🍉）",
        "role": "腾讯频道主"
      }
    ],
    "joined_guilds": [
      {
        "guild_id": "674380754015237275",
        "guild_number": "SCZXandSCYZ567",
        "member_count": 1523,
        "name": "舒城高中部",
        "role": "成员",
        "share_url": "https://pd.qq.com/s/6hfh8o3kn"
      }
    ],
    "managed_guilds": [
      {
        "guild_id": "29228881776257183",
        "guild_number": "pd06433494",
        "member_count": 89,
        "name": "江苏省第三魔丸学院",
        "role": "管理员",
        "share_url": "https://pd.qq.com/s/f9ijravrm"
      }
    ],
    "total_count": 72
  },
  "success": true
}
```

#### 4.1.3 `manage get-guild-channel-list` — 查看版块列表

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |

```bash
tencent-channel-cli manage get-guild-channel-list --guild-id 621631744026206738 --json
```

**返回示例：**

```json
{
  "data": {
    "channels": [
      {
        "channel_id": "658090767",
        "channel_name": "📢通知",
        "guild_id": "621631744026206738"
      },
      {
        "channel_id": "658070583",
        "channel_name": "全部",
        "guild_id": "621631744026206738"
      },
      {
        "channel_id": "658072095",
        "channel_name": "📚学习",
        "guild_id": "621631744026206738"
      }
    ],
    "count": 16,
    "guild_id": "621631744026206738"
  },
  "success": true
}
```

#### 4.1.4 `manage get-join-guild-setting` — 查看频道加入设置

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |

```bash
tencent-channel-cli manage get-join-guild-setting --guild-id 621631744026206738 --json
```

**返回示例：**

```json
{
  "data": {
    "setting": {
      "joinType": "JOIN_GUILD_TYPE_QUESTION_WITH_ADMIN_AUDIT",
      "question": {
        "items": [
          {
            "question": "班级+班主任姓名？"
          }
        ]
      }
    }
  },
  "success": true
}
```

#### 4.1.5 `manage get-guild-share-url` — 获取频道分享短链

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |

```bash
tencent-channel-cli manage get-guild-share-url --guild-id 621631744026206738 --json
```

#### 4.1.6 `manage get-share-info` — 解析分享链接

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--url` | string | 是 | pd.qq.com 分享链接 |

```bash
tencent-channel-cli manage get-share-info --url "https://pd.qq.com/s/xxx" --json
```

### 4.2 频道搜索

#### 4.2.1 `manage search-guild-content` — 搜索频道/帖子/作者

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--keyword` | string | 是 | - | 搜索关键词 |
| `--scope` | string | 否 | `channel` | 搜索范围：`channel`/`feed`/`author`/`all` |
| `--next-page-token` | string | 否 | - | 翻页令牌 |

```bash
# 搜索频道
tencent-channel-cli manage search-guild-content --keyword "南方中学" --scope channel --json
```

**返回示例（搜索频道）：**

```json
{
  "data": {
    "channels": [
      {
        "avatar": "https://groupprohead-76292.picgzc.qpic.cn/621631744026206738/100?t=1781514643577",
        "guild_id": "621631744026206738",
        "guild_number": "nanfang1958",
        "member_count": 3071,
        "name": "南方中学频道（瓜开得胜🍉）",
        "share_url": "https://pd.qq.com/s/fn6pykqr7"
      }
    ],
    "has_next": false
  },
  "success": true
}
```

### 4.3 频道信息修改

#### 4.3.1 `manage update-guild-info` — 修改频道名称/简介

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--guild-name` | string | 否 | 新频道名称 |
| `--guild-profile` | string | 否 | 新频道简介 |

```bash
# 修改名称
tencent-channel-cli manage update-guild-info --guild-id 621631744026206738 --guild-name "新名称" --json

# 同时修改名称和简介
tencent-channel-cli manage update-guild-info --guild-id 621631744026206738 --guild-name "新名称" --guild-profile "新简介" --json
```

#### 4.3.2 `manage modify-guild-number` — 修改频道号

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--guild-number` | string | 是 | 新频道号 |

```bash
tencent-channel-cli manage modify-guild-number --guild-id 621631744026206738 --guild-number TestNum2026 --json
```

#### 4.3.3 `manage upload-guild-avatar` — 修改频道头像

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--image-path` | string | 是 | 头像图片路径 |

```bash
tencent-channel-cli manage upload-guild-avatar --guild-id 621631744026206738 --image-path ./avatar.jpg --json
```

### 4.4 频道创建与加入

#### 4.4.1 `manage create-theme-private-guild` — 创建频道（公开/私密）

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--image-path` | string | 是 | - | 头像图片路径 |
| `--theme` | string | 否 | - | 主题关键词（自动生成名称和简介） |
| `--guild-name` | string | 否 | - | 频道名称（≤15字） |
| `--guild-profile` | string | 否 | - | 频道简介（≤300字符） |
| `--community-type` | string | 否 | `public` | 类型：`public`/`private`/`公开`/`私密` |

```bash
# 通过主题自动生成
tencent-channel-cli manage create-theme-private-guild --image-path ./avatar.jpg --theme "编程" --json

# 手动指定
tencent-channel-cli manage create-theme-private-guild --image-path ./avatar.jpg --guild-name "编程俱乐部" --guild-profile "一起学编程" --community-type public --json
```

#### 4.4.2 `manage join-guild` — 加入频道

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |

```bash
# 直接加入（无验证公开频道）
tencent-channel-cli manage join-guild --guild-id 621631744026206738 --json

# 带附言加入（审核/问答类频道，需 stdin JSON）
echo '{"guild_id":"621631744026206738","join_guild_comment":"请求加入"}' | tencent-channel-cli manage join-guild --json
```

### 4.5 版块管理

#### 4.5.1 `manage create-channel` — 创建子版块

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--channel-name` | string | 是 | 版块名称 |

```bash
tencent-channel-cli manage create-channel --guild-id 621631744026206738 --channel-name "新版块" --json
```

#### 4.5.2 `manage modify-channel` — 修改版块名称

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--channel-id` | string | 是 | 版块 ID |
| `--channel-name` | string | 是 | 新版块名称 |

```bash
tencent-channel-cli manage modify-channel --guild-id 621631744026206738 --channel-id 456 --channel-name "新名称" --json
```

### 4.6 加入设置管理

#### 4.6.1 `manage update-join-guild-setting` — 修改频道加入设置

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--join-type` | string | 是 | 加入方式（见下表） |

**join-type 枚举值：**

| 值 | 说明 |
|----|------|
| `JOIN_GUILD_TYPE_DIRECT` | 无需审核，直接加入 |
| `JOIN_GUILD_TYPE_ADMIN_AUDIT` | 发送验证消息，管理员审核 |
| `JOIN_GUILD_TYPE_DISABLE` | 不允许任何人加入 |
| `JOIN_GUILD_TYPE_QUESTION_WITH_ADMIN_AUDIT` | 回答问题 + 管理员审核 |
| `JOIN_GUILD_TYPE_MULTI_QUESTION` | 正确回答问题 |
| `JOIN_GUILD_TYPE_QUIZ` | 答题 |

```bash
# 直接加入
tencent-channel-cli manage update-join-guild-setting --guild-id 621631744026206738 --join-type JOIN_GUILD_TYPE_DIRECT --json

# 管理员审核
tencent-channel-cli manage update-join-guild-setting --guild-id 621631744026206738 --join-type JOIN_GUILD_TYPE_ADMIN_AUDIT --json
```

高级设置（问答/答题）需通过 stdin JSON：

```bash
# 回答问题 + 管理员审核
echo '{"guild_id":"621631744026206738","setting":{"join_type":"JOIN_GUILD_TYPE_QUESTION_WITH_ADMIN_AUDIT","question":{"items":[{"question":"你从哪里知道这个频道的？"}]}}}' | tencent-channel-cli manage update-join-guild-setting --json

# 正确回答问题
echo '{"guild_id":"621631744026206738","setting":{"join_type":"JOIN_GUILD_TYPE_MULTI_QUESTION","question":{"items":[{"question":"1+1=?","answer":"2"}]}}}' | tencent-channel-cli manage update-join-guild-setting --json

# 答题
echo '{"guild_id":"621631744026206738","setting":{"join_type":"JOIN_GUILD_TYPE_QUIZ","quiz":{"items":[{"question":"1+1=?","answers":["1","2","3","4"],"correctAnswer":"2"}],"minAnswerNum":1,"minCorrectAnswerNum":1}}}' | tencent-channel-cli manage update-join-guild-setting --json
```

### 4.7 成员管理

#### 4.7.1 `manage get-guild-member-list` — 查看成员列表（分页）

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--next-page-token` | string | 否 | 翻页令牌 |

```bash
tencent-channel-cli manage get-guild-member-list --guild-id 621631744026206738 --json
```

**返回示例：**

```json
{
  "data": {
    "members": [
      {
        "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
        "guild_id": "621631744026206738",
        "joinTime": 1722783250,
        "joinTime_human": "2024-08-04 22:54:10",
        "nick": "南方中学频道",
        "role": "频道主",
        "shutupExpireTime": 0,
        "shutupExpireTime_human": "无禁言",
        "tiny_id": "1441152187377287410"
      },
      {
        "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
        "guild_id": "621631744026206738",
        "joinTime": 1722783300,
        "joinTime_human": "2024-08-04 22:55:00",
        "nick": "张三",
        "role": "成员",
        "shutupExpireTime": 0,
        "shutupExpireTime_human": "无禁言",
        "tiny_id": "1441152187377287411"
      }
    ],
    "next_page_token": "xxx",
    "total": 3071
  },
  "success": true
}
```

#### 4.7.2 `manage guild-member-search` — 按昵称搜索成员

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--guild-id` | string | 是 | - | 腾讯频道 ID |
| `--keyword` | string | 是 | - | 搜索关键词 |
| `--num` | int | 否 | 20 | 每页数量 |
| `--next-pos` | string | 否 | - | 翻页位置 |

```bash
tencent-channel-cli manage guild-member-search --guild-id 621631744026206738 --keyword "测试" --json
```

**返回示例：**

```json
{
  "data": {
    "members": [
      {
        "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
        "guild_id": "621631744026206738",
        "joinTime": 1722783300,
        "joinTime_human": "2024-08-04 22:55:00",
        "nick": "测试用户",
        "role": "成员",
        "shutupExpireTime": 0,
        "shutupExpireTime_human": "无禁言",
        "tiny_id": "1441152187377287412"
      }
    ],
    "next_pos": "",
    "total": 1
  },
  "success": true
}
```

#### 4.7.3 `manage modify-member-shut-up` — 禁言/解禁成员

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--tiny-id` | string | 是 | 成员 Tiny ID |
| `--time-stamp` | string | 否 | 禁言到期时间戳（0=解禁） |

```bash
# 禁言到指定时间
tencent-channel-cli manage modify-member-shut-up --guild-id 621631744026206738 --tiny-id 456 --time-stamp 1735689600 --json

# 解除禁言
tencent-channel-cli manage modify-member-shut-up --guild-id 621631744026206738 --tiny-id 456 --time-stamp 0 --json
```

### 4.8 身份组管理

#### 4.8.1 `manage create-guild-role-group` — 创建身份组

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--name` | string | 是 | 身份组名称（最多30字符，中文算2个） |

```bash
tencent-channel-cli manage create-guild-role-group --guild-id 621631744026206738 --name "运营组" --json
```

#### 4.8.2 `manage modify-guild-role-group` — 修改身份组

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--role-id` | string | 是 | 身份组 ID |
| `--name` | string | 是 | 新身份组名称 |

```bash
tencent-channel-cli manage modify-guild-role-group --guild-id 621631744026206738 --role-id 456 --name "内容组" --json
```

#### 4.8.3 `manage add-role-members` — 向身份组添加成员

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--role-id` | string | 是 | 身份组 ID |
| `--tiny-ids` | string_array | 是 | 成员 Tiny ID 列表 |

```bash
# 添加单个成员
tencent-channel-cli manage add-role-members --guild-id 621631744026206738 --role-id 456 --tiny-ids 789 --json

# 批量添加
tencent-channel-cli manage add-role-members --guild-id 621631744026206738 --role-id 456 --tiny-ids 789 --tiny-ids 790 --json
```

### 4.9 私信

#### 4.9.1 `manage push-group-dm-msg` — 发送频道私信

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--peer-tiny-id` | string | 否 | 目标用户 tinyID |
| `--source-guild-id` | string | 否 | 来源频道 ID |
| `--text` | string | 是 | 消息文本内容 |
| `--ref` | int | 否 | 通知编号（自动填充） |

```bash
# 直接发送
tencent-channel-cli manage push-group-dm-msg --peer-tiny-id 144115218557759121 --source-guild-id 621631744026206738 --text "你好" --json

# 回复私信通知（通过通知编号）
tencent-channel-cli manage push-group-dm-msg --ref 1 --text "你好" --json
```

---

## 5. Domain: feed（帖子与内容管理）

### 5.1 帖子查询

#### 5.1.1 `feed get-guild-feeds` — 获取频道主页帖子

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--guild-id` | string | 是 | - | 腾讯频道 ID |
| `--get-type` | int | 否 | 2 | 获取类型：1=热门 2=最新 |
| `--count` | int | 否 | 20 | 每页数量 |
| `--feed-attach-info` | string | 否 | - | 翻页令牌 |

```bash
# 获取最新帖子（3条）
tencent-channel-cli feed get-guild-feeds --guild-id 621631744026206738 --get-type 2 --count 3 --json
```

**返回示例：**

```json
{
  "data": {
    "feeds": [
      {
        "author": {
          "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
          "nick": "南方中学频道",
          "tiny_id": "1441152187377287410"
        },
        "channel_id": "658070583",
        "channel_name": "全部",
        "content": "研学活动通知...",
        "create_time": "2025-06-15 10:30:00",
        "create_time_raw": 1752552600,
        "feed_id": "B_dece2f6ad38f0d001441152187377287410X60",
        "feed_type": 1,
        "images": [
          "https://p.qpic.cn/..."
        ],
        "like_count": 42,
        "reply_count": 15,
        "title": ""
      }
    ],
    "feed_attach_info": "{\"nextPage\":\"xxx\"}",
    "has_next": true
  },
  "success": true
}
```

#### 5.1.2 `feed get-channel-timeline-feeds` — 获取版块帖子列表

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--guild-id` | string | 是 | - | 腾讯频道 ID |
| `--channel-id` | string | 是 | - | 版块 ID |
| `--count` | int | 否 | 20 | 每页数量 |
| `--feed-attach-info` | string | 否 | - | 翻页令牌 |

```bash
tencent-channel-cli feed get-channel-timeline-feeds --guild-id 621631744026206738 --channel-id 658070583 --count 3 --json
```

**返回示例：**

```json
{
  "data": {
    "feeds": [
      {
        "author": {
          "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
          "nick": "南方中学频道",
          "tiny_id": "1441152187377287410"
        },
        "channel_id": "658070583",
        "channel_name": "全部",
        "content": "研学活动通知...",
        "create_time": "2025-06-15 10:30:00",
        "create_time_raw": 1752552600,
        "feed_id": "B_dece2f6ad38f0d001441152187377287410X60",
        "feed_type": 1,
        "images": [
          "https://p.qpic.cn/..."
        ],
        "like_count": 42,
        "reply_count": 15,
        "title": ""
      }
    ],
    "feed_attach_info": "{\"nextPage\":\"xxx\"}",
    "has_next": true
  },
  "success": true
}
```

#### 5.1.3 `feed get-feed-detail` — 查看帖子详情

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--feed-id` | string | 是 | 帖子 ID |
| `--guild-id` | string | 否 | 腾讯频道 ID（推荐传入） |
| `--channel-id` | string | 否 | 版块 ID |

```bash
tencent-channel-cli feed get-feed-detail --feed-id B_dece2f6ad38f0d001441152187377287410X60 --guild-id 621631744026206738 --json
```

**返回示例：**

```json
{
  "data": {
    "author": {
      "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
      "nick": "南方中学频道",
      "tiny_id": "1441152187377287410"
    },
    "channel_id": "658070583",
    "channel_name": "全部",
    "content": "研学活动通知：本周六组织高二年级前往科技馆研学...",
    "create_time": "2025-06-15 10:30:00",
    "create_time_raw": 1752552600,
    "feed_id": "B_dece2f6ad38f0d001441152187377287410X60",
    "feed_type": 1,
    "images": [
      "https://p.qpic.cn/..."
    ],
    "is_essence": false,
    "is_top": false,
    "like_count": 42,
    "reply_count": 15,
    "title": "",
    "share_url": "https://pd.qq.com/s/xxx"
  },
  "success": true
}
```

#### 5.1.4 `feed search-guild-feeds` — 搜索帖子

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 腾讯频道 ID |
| `--query` / `--keyword` | string | 否 | 搜索关键词 |
| `--next-page-cookie` | string | 否 | 翻页令牌 |

```bash
tencent-channel-cli feed search-guild-feeds --guild-id 621631744026206738 --query "研学" --json
```

**返回示例：**

```json
{
  "data": {
    "feeds": [
      {
        "author": {
          "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
          "nick": "南方中学频道",
          "tiny_id": "1441152187377287410"
        },
        "channel_id": "658070583",
        "channel_name": "全部",
        "content": "研学活动通知...",
        "create_time": "2025-06-15 10:30:00",
        "create_time_raw": 1752552600,
        "feed_id": "B_dece2f6ad38f0d001441152187377287410X60",
        "feed_type": 1,
        "images": [
          "https://p.qpic.cn/..."
        ],
        "like_count": 42,
        "reply_count": 15,
        "title": ""
      }
    ],
    "has_next": false,
    "next_page_cookie": ""
  },
  "success": true
}
```

### 5.2 帖子操作

#### 5.2.1 `feed publish-feed` — 发表帖子

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--guild-id` | string | 条件 | - | 频道 ID（普通用户必填；作者全局发帖可传 0） |
| `--channel-id` | string | 条件 | - | 版块 ID（普通用户必填；作者全局发帖可传 0） |
| `--title` | string | 否 | - | 帖子标题（有标题自动升级为长贴） |
| `--content` | string | 条件 | - | 帖子内容（与 `--markdown-content` 互斥） |
| `--markdown-content` | string | 条件 | - | Markdown 格式正文（与 `--content` 互斥） |
| `--content-file` | string | 否 | - | 从文件读取正文（txt/md） |
| `--feed-type` | int | 否 | 1 | 帖子类型：1=短贴 2=长贴 |
| `--image` | string_array | 否 | - | 图片文件路径（短贴≤18张/长贴≤50张） |
| `--video` | string_array | 否 | - | 视频文件路径（短贴最多1个/长贴最多5个） |
| `--at-user` | string_array | 否 | - | @用户（格式：tinyid:昵称） |
| `--link` | string_array | 否 | - | 文字链接（格式：url\|显示文字） |
| `--topic-name` | string_array | 否 | - | 话题名 |

**推荐内联语法：**
- `@用户`：`@[昵称](tinyid)`
- `链接`：`[显示文字](url)`
- `话题`：`#[话题名]()`

```bash
# 纯文字短帖
tencent-channel-cli feed publish-feed --guild-id 621631744026206738 --channel-id 456 --content "你好世界" --json

# 带标题长帖
tencent-channel-cli feed publish-feed --guild-id 621631744026206738 --channel-id 456 --title "周报" --content "本周完成了 A 和 B" --json

# 图片帖
tencent-channel-cli feed publish-feed --guild-id 621631744026206738 --channel-id 456 --content "看图" --image ./photo1.jpg --image ./photo2.png --json

# Markdown 长帖
tencent-channel-cli feed publish-feed --guild-id 621631744026206738 --channel-id 456 --title "技术分享" --markdown-content "# 背景\n本文介绍 Go 并发模型。" --json

# @用户 + 链接混排
tencent-channel-cli feed publish-feed --guild-id 621631744026206738 --channel-id 456 --content "本周技术分享见 [详情页](https://example.com/weekly)，@[张三](144115219800577368) 请查收。" --json
```

#### 5.2.2 `feed alter-feed` — 编辑帖子

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--feed-id` | string | 是 | - | 帖子 ID |
| `--guild-id` | string | 是 | - | 腾讯频道 ID |
| `--channel-id` | string | 是 | - | 版块 ID |
| `--create-time` | string | 是 | - | 帖子创建时间戳 |
| `--feed-type` | int | 否 | 1 | 帖子类型：1=短贴 2=长贴 |
| `--title` | string | 否 | - | 新标题 |
| `--content` | string | 否 | - | 新内容（与 `--markdown-content` 互斥） |
| `--markdown-content` | string | 否 | - | 新 Markdown 正文 |
| `--content-file` | string | 否 | - | 从文件读取新正文 |
| `--image` | string_array | 否 | - | 新增图片 |
| `--video` | string_array | 否 | - | 新增视频 |
| `--clear-images` | bool | 否 | false | 清除原帖所有图片 |
| `--clear-videos` | bool | 否 | false | 清除原帖所有视频 |

```bash
# 修改标题和内容
tencent-channel-cli feed alter-feed --feed-id B_xxx --guild-id 621631744026206738 --channel-id 456 --create-time 1700000000 --title "新标题" --content "新内容" --json

# 替换所有图片
tencent-channel-cli feed alter-feed --feed-id B_xxx --guild-id 621631744026206738 --channel-id 456 --create-time 1700000000 --clear-images --image ./new1.jpg --image ./new2.jpg --json
```

#### 5.2.3 `feed move-feed` — 移动帖子到其他版块

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 频道 ID |
| `--channel-id` | string | 是 | 目标版块 ID |
| `--original-channel-id` | string | 是 | 帖子当前所在版块 ID |
| `--feed-id` | string | 是 | 帖子 ID |

```bash
tencent-channel-cli feed move-feed --guild-id 621631744026206738 --channel-id 789 --original-channel-id 456 --feed-id B_xxx --json
```

#### 5.2.4 `feed top-feed` — 帖子置顶/取消置顶

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--feed-id` | string | 是 | - | 帖子 ID |
| `--user-id` | string | 是 | - | 帖子发表者用户 ID |
| `--create-time` | string | 是 | - | 帖子创建时间戳 |
| `--guild-id` | string | 是 | - | 腾讯频道 ID |
| `--action` | int | 否 | 1 | 操作：1=置顶 2=取消置顶 |
| `--top-type` | int | 否 | 1 | 置顶类型：1=全局置顶 |

```bash
# 置顶
tencent-channel-cli feed top-feed --feed-id B_xxx --user-id 111 --create-time 1700000000 --guild-id 621631744026206738 --action 1 --json

# 取消置顶
tencent-channel-cli feed top-feed --feed-id B_xxx --user-id 111 --create-time 1700000000 --guild-id 621631744026206738 --action 2 --json
```

#### 5.2.5 `feed set-feed-essence` — 设置/取消精华

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--feed-id` | string | 是 | - | 帖子 ID |
| `--action` | int | 否 | 1 | 操作：1=设置精华 2=取消精华 |

```bash
# 设置精华
tencent-channel-cli feed set-feed-essence --feed-id B_xxx --action 1 --json

# 取消精华
tencent-channel-cli feed set-feed-essence --feed-id B_xxx --action 2 --json
```

#### 5.2.6 `feed push-essence-feed` — 推送精华帖通知

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--feed-id` | string | 是 | 精华帖 ID（需先设置为精华） |

```bash
tencent-channel-cli feed push-essence-feed --feed-id B_xxx --json
```

#### 5.2.7 `feed do-feed-prefer` — 帖子点赞/取消

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--feed-id` | string | 是 | - | 帖子 ID |
| `--action` | int | 否 | 0 | 操作：1=点赞 3=取消 |
| `--guild-id` | string | 否 | - | 腾讯频道 ID |
| `--channel-id` | string | 否 | - | 版块 ID |

```bash
# 点赞
tencent-channel-cli feed do-feed-prefer --feed-id B_xxx --action 1 --json

# 取消点赞
tencent-channel-cli feed do-feed-prefer --feed-id B_xxx --action 3 --json
```

### 5.3 评论与回复

#### 5.3.1 `feed get-feed-comments` — 查看帖子评论

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--feed-id` | string | 是 | - | 帖子 ID |
| `--guild-id` | string | 否 | - | 腾讯频道 ID |
| `--channel-id` | string | 否 | - | 版块 ID |
| `--count` | int | 否 | 20 | 每页数量（最大 20） |
| `--rank-type` | int | 否 | - | 排序：0=默认 1=时间正序 2=时间倒序 |
| `--reply-list-num` | int | 否 | 1 | 每条评论预加载回复数（最大 10） |
| `--attach-info` | string | 否 | - | 翻页令牌 |

```bash
tencent-channel-cli feed get-feed-comments --feed-id B_dece2f6ad38f0d001441152187377287410X60 --guild-id 621631744026206738 --count 3 --json
```

**返回示例：**

```json
{
  "data": {
    "comments": [
      {
        "author": {
          "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
          "nick": "张三",
          "tiny_id": "1441152187377287411"
        },
        "comment_id": "C_xxx",
        "content": "支持！",
        "create_time": "2025-06-15 11:00:00",
        "create_time_raw": 1752554400,
        "like_count": 5,
        "reply_count": 2,
        "replies": [
          {
            "author": {
              "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
              "nick": "李四",
              "tiny_id": "1441152187377287412"
            },
            "content": "+1",
            "create_time": "2025-06-15 11:05:00",
            "reply_id": "R_xxx"
          }
        ]
      }
    ],
    "has_next": false,
    "total": 15
  },
  "success": true
}
```

#### 5.3.2 `feed get-next-page-replies` — 查看更多回复（评论回复分页）

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--feed-id` | string | 是 | - | 帖子 ID |
| `--comment-id` | string | 是 | - | 评论 ID |
| `--guild-id` | string | 是 | - | 腾讯频道 ID |
| `--channel-id` | string | 是 | - | 版块 ID |
| `--count` | int | 否 | 20 | 每页数量（最大 50） |
| `--attach-info` | string | 否 | - | 翻页令牌 |

```bash
tencent-channel-cli feed get-next-page-replies --feed-id B_dece2f6ad38f0d001441152187377287410X60 --comment-id C_xxx --guild-id 621631744026206738 --channel-id 658070583 --json
```

**返回示例：**

```json
{
  "data": {
    "replies": [
      {
        "author": {
          "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
          "nick": "李四",
          "tiny_id": "1441152187377287412"
        },
        "content": "+1",
        "create_time": "2025-06-15 11:05:00",
        "create_time_raw": 1752554700,
        "reply_id": "R_xxx"
      },
      {
        "author": {
          "avatar": "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eq...",
          "nick": "王五",
          "tiny_id": "1441152187377287413"
        },
        "content": "同意",
        "create_time": "2025-06-15 11:10:00",
        "create_time_raw": 1752555000,
        "reply_id": "R_yyy"
      }
    ],
    "has_next": false,
    "total": 2
  },
  "success": true
}
```

#### 5.3.3 `feed do-comment` — 发表/删除评论

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--feed-id` | string | 条件 | - | 帖子 ID |
| `--feed-create-time` | string | 条件 | - | 帖子创建时间戳 |
| `--comment-type` | int | 否 | 1 | 类型：0=自删 1=发表 2=帖主删 |
| `--content` | string | 条件 | - | 评论内容（发表时与 `--image-path` 至少填一个） |
| `--image-path` | string | 条件 | - | 评论图片路径 |
| `--comment-id` | string | 条件 | - | 评论 ID（删除时必填） |
| `--comment-author-id` | string | 条件 | - | 评论作者 ID（删除时必填） |
| `--guild-id` | string | 否 | - | 腾讯频道 ID |
| `--channel-id` | string | 否 | - | 版块 ID |
| `--ref` | int | 否 | - | 通知编号（自动填充帖子信息） |

```bash
# 发表评论
tencent-channel-cli feed do-comment --feed-id B_xxx --content "写得不错!" --feed-create-time 1700000000 --guild-id 621631744026206738 --channel-id 456 --json

# @用户评论
tencent-channel-cli feed do-comment --feed-id B_xxx --content "说得很对，@[张三](144115219800577368) 你怎么看？" --feed-create-time 1700000000 --guild-id 621631744026206738 --channel-id 456 --json

# 通过通知编号引用评论
tencent-channel-cli feed do-comment --ref 1 --content "写得不错!" --json
```

#### 5.3.4 `feed do-reply` — 发表/删除回复

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--feed-id` | string | 条件 | 帖子 ID |
| `--feed-author-id` | string | 条件 | 帖子作者 ID |
| `--feed-create-time` | string | 条件 | 帖子创建时间戳 |
| `--comment-id` | string | 条件 | 评论 ID |
| `--comment-author-id` | string | 条件 | 评论作者 ID |
| `--comment-create-time` | string | 条件 | 评论创建时间戳 |
| `--reply-type` | int | 否 | 1 | 类型：0=自删 1=发表 2=帖主删 |
| `--replier-id` | string | 条件 | 回复人用户 ID（发表时必填） |
| `--content` | string | 条件 | 回复内容 |
| `--image-path` | string | 条件 | 回复图片路径 |
| `--target-reply-id` | string | 否 | 被回复的回复 ID（楼中楼） |
| `--target-user-id` | string | 否 | 被回复人用户 ID |
| `--target-user-nick` | string | 否 | 被回复人昵称 |
| `--reply-id` | string | 条件 | 回复 ID（删除时必填） |
| `--guild-id` | string | 否 | 腾讯频道 ID |
| `--channel-id` | string | 否 | 版块 ID |
| `--ref` | int | 否 | 通知编号 |

```bash
# 回复评论
tencent-channel-cli feed do-reply --feed-id B_xxx --comment-id C_xxx --content "说得对" --replier-id 111 --feed-author-id 111 --feed-create-time 1700000000 --comment-author-id 222 --comment-create-time 1700000001 --guild-id 621631744026206738 --channel-id 456 --json

# 回复某条回复（楼中楼）
tencent-channel-cli feed do-reply --feed-id B_xxx --comment-id C_xxx --content "赞同" --replier-id 111 --target-reply-id R_xxx --target-user-id 333 --target-user-nick 李四 --feed-author-id 111 --feed-create-time 1700000000 --comment-author-id 222 --comment-create-time 1700000001 --guild-id 621631744026206738 --channel-id 456 --json

# 通过通知编号引用回复
tencent-channel-cli feed do-reply --ref 1 --content "说得对" --json
```

#### 5.3.5 `feed do-like` — 评论/回复点赞

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--like-type` | int | 否 | 0 | 3=赞评论 4=取消赞评论 5=赞回复 6=取消赞回复 |
| `--feed-id` | string | 是 | - | 帖子 ID |
| `--comment-id` | string | 是 | - | 评论 ID |
| `--feed-author-id` | string | 是 | - | 帖子作者 ID |
| `--feed-create-time` | string | 是 | - | 帖子创建时间戳 |
| `--comment-author-id` | string | 是 | - | 评论作者 ID |
| `--reply-id` | string | 否 | - | 回复 ID（点赞回复时必填） |
| `--reply-author-id` | string | 否 | - | 回复作者 ID（点赞回复时必填） |
| `--guild-id` | string | 否 | - | 腾讯频道 ID |
| `--channel-id` | string | 否 | - | 版块 ID |

```bash
# 点赞评论
tencent-channel-cli feed do-like --like-type 3 --feed-id B_xxx --comment-id C_xxx --feed-author-id 111 --feed-create-time 1700000000 --comment-author-id 222 --json

# 点赞回复
tencent-channel-cli feed do-like --like-type 5 --feed-id B_xxx --comment-id C_xxx --reply-id R_xxx --reply-author-id 333 --feed-author-id 111 --feed-create-time 1700000000 --comment-author-id 222 --json
```

### 5.4 分享链接

#### 5.4.1 `feed get-feed-share-url` — 获取帖子分享短链

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--feed-id` | string | 是 | 帖子 ID |
| `--guild-id` | string | 否 | 腾讯频道 ID |
| `--channel-id` | string | 否 | 版块 ID |

```bash
tencent-channel-cli feed get-feed-share-url --feed-id B_dece2f6ad38f0d001441152187377287410X60 --guild-id 621631744026206738 --json
```

**返回示例：**

```json
{
  "data": {
    "share_url": "https://pd.qq.com/s/xxx"
  },
  "success": true
}
```

---

## 6. 快捷命令（Shortcut）

快捷命令是多轮交互命令，返回 `status: "waiting"` 时必须继续执行返回里的 `resume_command`，`--resume-id` 全程不变。

### 6.1 `manage search-and-join` — 搜索频道并加入

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--keyword` | string | 是 | 搜索关键词 |
| `--resume-id` | string | 否 | resume session ID |
| `--pick` | string | 否 | resume 时的选择索引 |

```bash
# 发起
tencent-channel-cli manage search-and-join --keyword "游戏" --json

# Resume 选择并加入
tencent-channel-cli manage search-and-join --resume-id s-abc123 --pick 0 --json
```

### 6.2 `feed quick-publish` — 选择频道和版块，一键发帖

参数同 `feed publish-feed`，支持 `--resume-id` 和 `--pick`。

```bash
# 发起
tencent-channel-cli feed quick-publish --content "测试帖子" --json

# Resume 选择频道
tencent-channel-cli feed quick-publish --resume-id s-abc123 --pick 0 --json

# Resume 选择版块并发帖
tencent-channel-cli feed quick-publish --resume-id s-abc123 --pick 1 --json
```

### 6.3 `feed search-and-comment` — 搜索帖子并评论

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--guild-id` | string | 是 | 频道 ID |
| `--query` | string | 是 | 搜索关键词 |
| `--content` | string | 是 | 评论内容 |
| `--resume-id` | string | 否 | resume session ID |
| `--pick` | string | 否 | resume 时的选择索引 |

```bash
# 发起
tencent-channel-cli feed search-and-comment --guild-id 621631744026206738 --query "关键词" --content "评论内容" --json

# Resume 选择帖子并评论
tencent-channel-cli feed search-and-comment --resume-id s-abc123 --pick 2 --content "评论内容" --json
```

### 6.4 `feed latest-feeds-detail` — 获取频道最新帖子详情

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--count` | int | 否 | 10 | 帖子数量 |
| `--resume-id` | string | 否 | - | resume session ID |
| `--pick` | string | 否 | - | resume 时的选择索引 |

```bash
# 发起（选择频道）
tencent-channel-cli feed latest-feeds-detail --count 5 --json

# Resume 选择频道
tencent-channel-cli feed latest-feeds-detail --resume-id s-abc123 --pick 3 --count 10 --json
```

### 6.5 `feed hot-feeds-detail` — 获取频道热门帖子详情

参数同 `feed latest-feeds-detail`。

```bash
tencent-channel-cli feed hot-feeds-detail --count 5 --json
```

---

## 7. 通知系统

### 7.1 通知开关

#### 7.1.1 `manage notices-on` — 开启频道消息通知

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--session-key` | string | 否 | - | 当前会话的 sessionKey |
| `--confirm` | bool | 否 | false | 确认测试推送成功，正式开启订阅 |

```bash
# 第一步：测试推送通道
tencent-channel-cli manage notices-on --session-key "agent:main:" --json

# 第二步：确认收到后正式开启
tencent-channel-cli manage notices-on --session-key "agent:main:" --confirm --json
```

#### 7.1.2 `manage notices-off` — 关闭频道消息通知

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--session-key` | string | 否 | 要移除的 sessionKey |

```bash
# 关闭当前通道
tencent-channel-cli manage notices-off --session-key "agent:main:" --json

# 全量关闭
tencent-channel-cli manage notices-off --json
```

#### 7.1.3 `manage notices-status` — 查看频道消息通知状态

```bash
tencent-channel-cli manage notices-status --json
```

#### 7.1.4 `manage subscribe-notices` — 开启频道消息通知（简化版）

```bash
tencent-channel-cli manage subscribe-notices --json
```

#### 7.1.5 `manage unsubscribe-notices` — 关闭频道消息通知（简化版）

```bash
tencent-channel-cli manage unsubscribe-notices --json
```

### 7.2 通知检查与处理

#### 7.2.1 `manage check-notices` — 检查新的频道通知（增量）

```bash
tencent-channel-cli manage check-notices --json
```

#### 7.2.2 `manage check-new-notices` — 检查新的频道通知

```bash
tencent-channel-cli manage check-new-notices --json
```

#### 7.2.3 `manage get-recent-notices` — 获取最近的通知记录（本地）

```bash
tencent-channel-cli manage get-recent-notices --json
```

#### 7.2.4 `manage deal-notice` — 处理系统通知

| Flag | 类型 | 必填 | 说明 |
|------|------|------|------|
| `--notice-id` | string | 否 | 通知 ID |
| `--action-id` | string | 是 | `agree`=同意 `refuse`=拒绝 |
| `--ref` | int | 否 | 通知编号（如 #1 中的 1） |

```bash
# 同意加入申请
tencent-channel-cli manage deal-notice --action-id agree --ref 1 --json

# 拒绝
tencent-channel-cli manage deal-notice --action-id refuse --ref 1 --json
```

### 7.3 通知守护进程

#### 7.3.1 `manage notify-daemon` — 启动后台通知检查服务

| Flag | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--push-command` | string | 否 | - | 推送命令模板 |
| `--interval` | int | 否 | 5 | 轮询间隔秒数 |
| `--once` | bool | 否 | false | 仅检查一次后退出（Cron 模式） |

```bash
# Cron 模式：仅检查一次
tencent-channel-cli manage notify-daemon --once --json

# 常驻模式：每 60 秒检查一次
nohup tencent-channel-cli manage notify-daemon --interval 60 &
```

---

## 8. 敏感信息处理规则

### 8.1 用户隐私数据

以下信息默认不展示、不复述、非执行必需不透传：

- 真实姓名、手机号、邮箱、详细地址
- 身份证号、银行卡号等金融账户信息
- 生物识别信息、医疗健康信息、行踪轨迹
- 未成年人信息、宗教信仰等特定身份信息
- **Token、Cookie、登录凭证（最高保护级别）**

### 8.2 非面向用户字段

以下字段主要服务于 Skill 内部执行，默认不向用户展示原值：

| 字段 | 中文语义 |
|------|---------|
| `guild_id` | 频道 ID |
| `channel_id` | 版块 ID |
| `tiny_id` | 用户 ID |
| `feed_id` | 帖子 ID |
| `comment_id` | 评论 ID |
| `reply_id` | 回复 ID |
| `author_id` / `target_user_id` | 作者/目标用户 ID |
| `role_id` / `level_role_id` | 身份组 ID |
| `attach_info` / `feed_attach_info` / `next_page_cookie` | 翻页令牌 |

### 8.3 时间戳处理

- 内容管理命令：`create_time` 已格式化为北京时间（`YYYY-MM-DD HH:MM:SS`），直接展示。
- 频道管理命令：原始秒级字段自动附带 `{字段名}_human` 可读值，展示 `_human` 字段。

---

## 9. 故障排查

### 9.1 鉴权相关

| 现象 | 原因 | 解决方案 |
|------|------|---------|
| `retCode=8011` | 鉴权失败 | 检查 `.env` 文件和 Windows Credentials |
| `tokenSource="keychain"` | 使用了密钥链旧凭证 | `cmdkey /delete:LegacyGeneric:target=qq-cli:token` |
| `.env` 文件不存在 | 首次使用或文件被删除 | 创建 `$env:USERPROFILE\.qqcli\.env` |

### 9.2 限流处理

- `retCode=153` 或错误含"接口调用已超过申请的频率上限"：
  - **不报错、不询问用户**，直接 sleep 70s 后原样重试一次。
  - 若重试仍报 153，告知用户"接口触发频率限制，请稍后再试"。

### 9.3 Windows 执行问题

- PowerShell 执行 `.ps1` 脚本被阻止时，使用 `.cmd` 路径调用 CLI。
- 环境变量设置无效时，使用 `.env` 文件而非临时设置环境变量。

---

## 10. 高风险操作清单（严禁自动执行）

以下命令属于高风险操作，执行前必须说明影响，等待用户同意，并加 `--yes` 执行。**本 Wiki 不包含这些命令的详细使用说明，严禁在未经用户明确同意的情况下调用。**

| 命令 | 风险等级 | 说明 |
|------|---------|------|
| `manage leave-guild` | high-risk-write | 退出频道 |
| `manage kick-guild-member` | high-risk-write | 踢出成员 |
| `manage remove-role-members` | high-risk-write | 从身份组移除成员 |
| `manage delete-channel` | high-risk-write | 删除版块 |
| `feed del-feed` | high-risk-write | 删除帖子 |
| `feed delete-and-mute` | high-risk-write | 删帖并禁言（快捷命令） |

---

> 本文档基于 `tencent-channel-cli` 1.0.6 版本生成，操作域示例为 `guild_id=621631744026206738`。
