# NFTI · 南方人格类型测试

> ## 🌐 在线体验：**[nfti.weaxi.cn](https://nfti.weaxi.cn)**
>
> 无需安装、无需注册，打开即用 👉 **<https://nfti.weaxi.cn>**

一个面向**南方中学校园场景**的人格类型测试。不是又一份通用 MBTI 量表——题目、选项与结果文案都长在这所校园里：食堂、晚自习走廊、社团、年级频道……目标是让你做完之后能会心一笑，而不是拿到一串通用心理学标签。

除核心人格测试外，还包含 **Holland 职业兴趣测评**、**人格默契度配对**等功能。

---

## ✨ 功能一览

| 功能 | 说明 |
| --- | --- |
| 🧩 **人格类型测试** | 校本化题库，八维字母体系，测完给出专属人格类型与结果卡 |
| 🎯 **Holland 职业兴趣测评** | RIASEC 六维职业兴趣测评，匹配适合的专业与职业方向 |
| 💞 **人格默契度配对** | 粘贴好友的分享链接，生成两人的人格契合度报告 |
| 📊 **结果可视化** | 雷达图等图表展示各维度得分（Chart.js） |
| 🖼️ **结果卡分享** | 一键生成图片版结果卡，方便分享到频道/群聊 |

---

## 🛠️ 技术栈

**前端**
- Vue 3 + TypeScript + Vite
- Pinia（状态管理）、Vue Router
- Chart.js（可视化）、html2canvas / dom-to-image-more（结果卡导出）
- Three.js（部分动效）

**后端**
- Node.js（原生 HTTP 服务，无框架）
- MySQL（生产）/ JSON 文件（本地开发降级）
- DeepSeek API（AI 生成与内容辅助）
- Docker + Nginx 部署

---

## 🚀 本地运行

### 前端

```bash
cd frontend
npm install
npm run dev          # 开发模式，默认 http://localhost:5173
npm run build        # 生产构建，产物在 dist/
```

### 后端

```bash
cd backend
npm install

# 1. 准备环境变量（不要直接改代码写死凭据）
cp .env.example .env   # 或复制仓库根的 .env.example
# 编辑 .env，填入数据库密码与 API Key

# 2. 初始化数据库
mysql -u <user> -p < schema.sql

# 3. 启动
node server.js         # 默认监听 9000
```

> ⚠️ **本仓库不含任何真实凭据。** 所有密码与密钥通过环境变量注入，请参考仓库根的 `.env.example`。
> 历史版本曾误提交过 `.env` 与 SSH 私钥，已全部清除并加入 `.gitignore`；**请勿再提交任何真实密钥**。

### Docker 部署

```bash
cp .env.example .env    # 填写真实值
docker compose up -d --build
```

---

## 📁 目录结构

```
.
├── frontend/                前端（Vue 3 + Vite）
│   ├── src/
│   │   ├── assessments/holland/   Holland 职业兴趣测评
│   │   ├── views/                 页面
│   │   ├── assets/                人格类型配图等资源
│   │   └── docs/                  题库、算法设计、人格设定等文档
│   └── docs/                同上（题库与设计文档）
├── backend/                 后端（Node.js + MySQL）
│   ├── server.js            主服务
│   ├── match.js             默契度配对
│   ├── recommendCareers.js  Holland 职业推荐
│   ├── schema.sql           数据库结构
│   └── data/                运行时数据（题库、职业库）
├── docs/                    设计讨论与功能说明
├── docker-compose.yml       部署编排（凭据走环境变量）
├── nfti.weaxi.cn.conf       Nginx 站点配置示例
└── .env.example             环境变量模板
```

---

## 📖 相关文档

- [题库与类型体系](frontend/docs/nfbti-question-bank.md)
- [算法设计](frontend/docs/algorithm-design.md)
- [人格类型大全](frontend/docs/personalities.md)
- [人格关系与默契度](frontend/docs/personality-relationships.md)
- [Holland 测评方案](docs/holland-plan.md)
- [默契度配对功能](docs/match-feature.md)
- [部署指南](frontend/docs/deployment-guide.md)

---

## 🙏 致谢

感谢所有参与内测并提出反馈的同学。为保护个人隐私，本仓库文档中的志愿者姓名均已做匿名化处理。

数据来源：[腾讯频道 · 南方1958](https://pd.qq.com/g/nanfang1958)

---

## 📄 许可

本项目用于校园展示与学习交流。如需引用题库或算法设计，请先联系作者。
