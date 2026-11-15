<div align="center">

# 📖 LexiFlow 词流

**本地优先的全能英语学习应用** — 沉浸阅读点词查义 → 一键收词 → SM-2 间隔复习 → 词书闯关 → AI 口语陪练（BYO API key）。

数据 100% 本地 SQLite，零账号、零上传、无额度墙。

[![Stars](https://img.shields.io/github/stars/zhengqiuyang/lexiflow?style=flat-square&color=0969da)](https://github.com/zhengqiuyang/lexiflow/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/zhengqiuyang/lexiflow?style=flat-square&label=updated)](https://github.com/zhengqiuyang/lexiflow/commits)
![local-first](https://img.shields.io/badge/local--first-100%25-22C55E?style=flat-square)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?style=flat-square)

```bash
npm run setup   # 下载 ECDICT 词典并导入
npm start       # → http://127.0.0.1:3210
```

[核心闭环](#loop) · [功能](#features) · [快速开始](#quickstart) · [架构](#arch)

</div>

---

> 竞品分析结论：没有任何产品同时做好「阅读流查词 / SRS 复习 / 词书体系 / AI 对话」，更没有一个本地的——见 [docs/竞品分析.md](docs/竞品分析.md)。

<a id="loop"></a>

## 核心闭环

```
读(任意英文文本) → 点词(ECDICT 77 万词条离线释义) → 收(自动带捕获原句)
   ↑                                              ↓
   └────────── 阅读中高亮生词 ←—— SM-2 复习队列 ←——┘
```

<a id="features"></a>

## 功能

| 模块 | 说明 |
|---|---|
| 📖 沉浸阅读 | 粘贴 / 导入 .txt .md .srt;点词弹卡(音标/英英/英汉/Collins 星级/词频/发音);认识词淡化、生词高亮;文档列表与进度 |
| 🃏 SM-2 复习 | 忘记/模糊/记得三键,遗忘曲线排期;卡片带捕获原句语境;7 日预测 |
| 📚 词书 | 中考/高考/四六级/考研/托福/雅思/GRE 8 本(ECDICT tag 生成,按词频推进);新词引导 + 4 选 1 测验 |
| 💬 AI 对话 | OpenAI 兼容接口(GLM/DeepSeek/OpenAI/本地 Ollama);日常/雅思/面试/写作批改四场景,导师式纠错;TTS 朗读 + 语音识别(浏览器支持时) |
| 📊 统计 | 12 周热力图、词汇量估算、连击(轻激励,不做焦虑设计) |

**隐私与数据自主权**:无账号、无遥测;数据在 `data/`(app.db + dict.db),设置页一键导出 JSON;AI 对话用你自己的 key,成本 ≈ 纯 API 费($1-5/月),App 不转售 token。

<a id="quickstart"></a>

## 快速开始

需求:Node.js ≥ 22(内置 SQLite,零 npm 运行时依赖)。

```bash
npm run setup   # 下载 ECDICT 词典(63MB)并导入(支持 gh-proxy 镜像与手动放置 data/incoming)
npm start       # → http://127.0.0.1:3210
npm test        # 单元测试(21 项:CSV 状态机 / lemma / 分词 / SM-2)
```

### 启用 AI 对话(可选)

设置页填 OpenAI 兼容三项(Base URL / API Key / 模型名)→ 测试连接。示例:
- GLM:`https://open.bigmodel.cn/api/paas/v4` + `glm-4-flash`
- DeepSeek:`https://api.deepseek.com` + `deepseek-chat`
- 完全离线:Ollama `http://localhost:11434/v1`

<a id="arch"></a>

## 架构

- **零构建零框架**:Node 24 原生 `node:http` + `node:sqlite`;前端 vanilla ES modules
- `src/csv.mjs` RFC4180 状态机解析(ECDICT 释义内嵌换行);`src/lemma.mjs` 10 万词形还原;`src/sm2.mjs` 纯函数排期
- 词典 77 万词条导入 ≈ 2 秒(事务批插);时间戳全部毫秒,规避 JS 安全整数陷阱

## 已知边界

- 弹卡释义来自 ECDICT,无在线例句库(词书语境取释义首行)
- 语音识别依赖 Edge/Chrome,不可用时自动隐藏
- ECDICT 为 MIT 许可,数据版权归其作者(skywind3000)所有
