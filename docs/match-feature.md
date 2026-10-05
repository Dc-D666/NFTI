# 默契度测试（Match）· 功能说明

> v3.4 上线 · 2026-08-21
> 相关实现：`backend/match.js`、`backend/server.js`（share/match 系列 action）、`frontend/src/views/MatchView.vue`、`frontend/src/views/MatchResultView.vue`、`frontend/src/data/matchRules.ts`

## 一、产品玩法

双方各自完成测试（NFTI 人格 或 霍兰德职业，登录后）后，可以互相配对算出"默契度"：

1. A 在测试结果页点「💞 默契分享」→ 生成**分享链接**（`/match?code=XXXX-XXXX`）
2. A 把链接发给 B（微信/QQ/频道）
3. B 点开链接（或粘贴到 `/match` 页）→ 自动解锁 A 的结果摘要 → 选自己的结果 → 算默契度
4. 结果页展示：**默契度分数 + 等级（路人→天作之合）+ 组合称号 + 稀有彩蛋 + AI 聊天剧本 + 校园双人推荐**
5. 可「复制结果链接」（`/match/result/{id}`，点开直接看结果）或「分享结果至频道」（图片卡片 + 文字）

**设计原则**：全部走分享 URL，无口令交互（分享码仅作为 URL 内部凭证）。

## 二、数据模型（MySQL）

```sql
share_codes   -- 分享凭证：一份测试结果一个分享码
  code VARCHAR(20) PK            -- NF/HL-XXXX-XXXX（32 字符集去混淆，40bit）
  result_id CHAR(36) UNIQUE      -- 绑定的测试结果（一份结果至多一个码）
  owner_tiny_id, assessment_type
  created_at, expires_at         -- 30 天过期（惰性判断，无定时任务）
  revoked TINYINT                -- 手动停用

match_results -- 配对结果缓存 + AI 剧本
  id CHAR(36) PK
  share_code, a_tiny_id, b_tiny_id
  a_result_id, b_result_id       -- 幂等键（UNIQUE uk_match_pair）
  a_assessment, b_assessment, score, level
  data JSON                      -- 算法明细（sim/comp/dims 等）
  ai_story TEXT                  -- AI 剧本（对话体）缓存
  created_at
```

## 三、后端接口（POST /api，`server.js`）

| action | 说明 | 鉴权 |
|---|---|---|
| `share-create` | 生成/取回分享码（幂等，30 天过期可重建） | 登录 + 本人结果 |
| `share-redeem` | 解锁分享码 → 对方结果摘要（不含 answers）+ `is_own` | 登录 |
| `share-match` | 双方结果算默契度（幂等缓存），返回 `match_id` | 登录 + 禁自配对 |
| `share-list` | 我的分享列表（剩余天数/配对次数） | 登录 |
| `share-revoke` | 停用分享码 | 登录 + owner |
| `share-pairs` | 谁配对了我的分享 | 登录 |
| `match-ai` | 生成/取回 AI 聊天剧本（DeepSeek，同对缓存） | 登录 + 限流 |
| `match-get` | 凭 match_id 读配对结果（持久化分享，公开只读） | 无（IP 限流） |

安全：全部登录接口 `requireSession` + 归属校验 + IP 限流；分享码 40bit 防枚举；`match_id` 为 UUID 128bit 不可枚举。

## 四、算法（`match.js`）

- **NFTI × NFTI**：四维轴向量（E-I/S-N/T-F/J-P）相似/互补**契合度**（取较大者）+
  人格关系表修正（绝配 +10/天敌 -10/专克 -5，与前端 `relationships.ts` 一致）+ 隐藏款加成
- **Holland × Holland**：RIASEC 六维分数**中心化后**余弦（消除答题风格虚高）+
  六角环一致性修正（同码 +8/相邻 0/隔一 -8/对面 -18，主/次/三码 0.6/0.3/0.1 加权）
- **跨类型**：规则基础分（隐藏款加成）
- **等级**：≥90 天作之合 / ≥80 默契搭档 / ≥65 点头之交 / <65 路人

## 五、前端页面

- `/match`（MatchView）：URL 直达自动解锁 / 引导页粘贴分享链接 / 选结果 / 结果展示
- `/match/result/:id`（MatchResultView）：公开只读结果页（分享/频道帖落地页）
- 结果页/霍兰德结果页：默契分享按钮（生成分享链接弹窗）
- 个人中心：我的默契分享（列表/复制链接/停用/重新申请）+ 记录级分享 + 配对记录
- `matchRules.ts`：190 对组合称号（源自 `docs/match-titles-draft.md`）+ 等级 + 稀有彩蛋 + 校园推荐

## 六、AI 剧本（微信聊天风格）

- 提示词要求输出**对话体**（每行 `人格A: 内容` / `人格B: 内容`，6-10 条）
- 前端解析成消息序列，渲染微信聊天界面（对方左白泡 / 我右琥珀泡，主题色）
- 旧缓存叙述体自动降级为原文展示

## 七、部署注意

- 新表由后端 `initDb` 自动创建；`match_results` 唯一键迁移幂等（老库自动 ALTER + 去重）
- `match-ai` 有成本：per-user 1.5s 间隔 + IP 10/min 限流，同对结果只生成一次（缓存）
- 分享码 30 天过期为惰性判断（redeem/match 时校验），无定时任务
