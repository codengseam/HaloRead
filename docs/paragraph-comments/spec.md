# 静态网站段落级评论系统 · 产品规格说明书

> 版本：v1.0 · 日期：2026-06-23
> 适用项目：深度阅读助手静态站点（`site/`，vanilla JS + marked.js，部署于阿里魔搭空间 ModelScope Studio + GitHub Pages）
> 基线版本：`site/versions/B-classic/`（古籍批注风评论系统）
> 关联代码：`site/index.html`、`site/js/app.js`、`site/css/style.css`、`scripts/build_site.py`、`src/agents/`

---

## 一、产品定位与目标

### 1.1 一句话定位

为「深度阅读助手」静态站点增加**番茄小说 / 起点中文网式的段落级评论（段评）能力**，让读者能针对《资治通鉴》等古籍讲书笔记的**任意一个段落**发表即时评论、点赞、回复，评论数据通过 GitHub Contents API 沉淀到项目仓库，实现「纯静态部署、无后端、跨读者可见」的段评体验，并把段评数据沉淀为可被 Python AI 专家团消费的结构化资产。

### 1.2 与现有 B 版本的关系

| 维度 | B 古籍批注风（已有） | 本系统（段落级评论） |
|---|---|---|
| 评论粒度 | 选区级（圈选任意文本片段） | **段落级**（点击整个段落） |
| 触发方式 | 鼠标圈选文本 | 点击段落 / 段落右侧小图标 |
| 存储方案 | 仅 localStorage | **localStorage + GitHub Contents API 双通道** |
| 跨读者可见 | 否（仅作者本机） | **是**（评论写入仓库，他人拉取可见） |
| 社交属性 | 无点赞 | **有点赞、回复** |
| 章评 | 无 | **有**（文末整章评论） |
| 视觉风格 | 朱砂赭石、便笺笺纸 | **沿用 B 古籍批注风** |
| 设备优先 | 桌面优先 | **手机优先** |

> 本系统**复用 B 版本的视觉语言**（朱砂 `#c0392b`、赭石 `#a0522d`、便笺宣纸色 `#fdf6e3`、楷体优先、印章式标签），但**重写交互层与存储层**，从「选区锚定」改为「段落锚定」，从「单机 localStorage」改为「双通道同步」。

### 1.3 核心目标

| 编号 | 目标 | 衡量标准 |
|---|---|---|
| G1 | 点段即评 | 点击任意段落，300ms 内展开该段段评浮层，可写段评 |
| G2 | 段落定位稳定 | 原文小幅修订（个别字词、标点）后，段评仍能正确定位到对应段落，不变成孤儿 |
| G3 | 跨读者可见 | 段评写入 GitHub 仓库 `comments/` 目录后，其他读者打开同一笔记可拉取并看到该段评 |
| G4 | 双通道同步 | localStorage 即时写入 + GitHub API 异步持久化，离线可写、联网自动补传 |
| G5 | 手机优先 | 移动端单手可操作：点击段落右侧小图标展开段评、点赞、回复，触摸友好 |
| G6 | 章评闭环 | 文末可发表针对整章的章评，与段评区分展示 |
| G7 | 数据可导出 | 一键导出当前笔记段评为 JSON，格式可直接被 `src/agents/` 专家团读取 |
| G8 | 专家团可触发 | 站点可生成专家团评判请求包，本地 Python 执行后回填评判结果 |
| G9 | 纯静态零后端 | 全部功能在浏览器内完成，仅依赖 GitHub Contents API 做持久化，不引入自建服务端 |
| G10 | 风格协调 | 视觉沿用 B 古籍批注风，与暖纸色古籍阅读风格（`--bg-paper` `#faf8f5`、宋体）一致 |

### 1.4 非目标（明确不做）

- 不做实时协同编辑（段评是异步留言，非实时弹幕推送）
- 不做服务端账号体系（用 GitHub PAT 鉴权，读者匿名或填昵称）
- 不做评论自动改写原文（最终修订权在人）
- 不做评论的全文搜索引擎（评论量级小，按段落聚合即可）
- 不引入前端框架（React/Vue 等），保持 vanilla JS
- 不做 WebSocket 实时推送（纯静态约束，靠轮询/手动刷新拉取他人段评）

---

## 二、用户角色

| 角色 | 描述 | 本系统中的典型行为 |
|---|---|---|
| **作者（主要）** | 笔记撰写者，项目所有者，持有 GitHub PAT | 点段写段评、补充史料、记录感想；触发专家团评判；决定是否采纳建议修订原文；管理 PAT 配置 |
| **读者（主要）** | 访问魔搭 / GitHub Pages 站点的任意访客 | 点击段落看他人段评、发表段评（写入仓库）、点赞、回复；可填昵称，无需登录 |
| **AI 专家团（消费者）** | `src/agents/` 下的 historian/biographer/context_analyst/critic/philosopher/editor | 不直接操作 UI；通过消费导出的段评 JSON，结合原文与项目规则，产出评判报告 |

> 说明：因纯静态无后端，读者发表段评时，前端直接用配置在站点内的 GitHub PAT（fine-grained，限定写 `comments/` 目录）调用 GitHub Contents API 写入仓库。PAT 以**只写 comments 目录、无其他权限**的细粒度令牌形式存在，接受「令牌可能被前端抓取」的折中（见 7.4 安全说明）。

---

## 三、核心功能清单

### F1 · 段评发表

- 在阅读区（`#reader .markdown-body`）点击任意段落（`<p>` / `<blockquote>` / `<li>`），段落右侧展开段评浮层（笺纸便笺风）。
- 浮层含：段评输入框（多行）、类型选择器（5 类，见第四节）、提交按钮、取消按钮。
- 提交后：段评进入该段的段评列表，段落右侧出现段评计数标记（朱砂小圆点 + 数字）。

### F2 · 段评列表

- 点击段落或段落右侧小图标，展开该段所有段评，按时间倒序排列（最新在上）。
- 段评卡片展示：印章式类型标签、作者昵称、时间、正文、点赞数、回复数。
- 空状态：显示「此段尚无段评，留下第一条吧」。

### F3 · 点赞

- 每条段评可点赞（朱砂心形 / 印章式），再次点击取消。
- 点赞状态存 localStorage（防重复点赞），点赞数同步到 GitHub。
- 点赞数 ≥ 1 时段评卡片显示点赞数。

### F4 · 回复

- 每条段评可展开回复列表，支持多级回复（建议最多 2 级，第 3 级折叠为「查看更多回复」）。
- 回复含作者、时间戳；回复不单独设类型，继承父段评类型。

### F5 · 段评计数标记

- 有段评的段落，右侧显示朱砂小圆点 + 段评数（如 `3`）。
- 计数为 0 时不显示标记。
- 计数实时更新（发表 / 删除段评后同步）。

### F6 · 章评

- 笔记文末设章评入口（`__chapter__` 特殊段落），可发表针对整章的评论。
- 章评与段评在数据模型上统一（`paragraphId = "__chapter__"`），在 UI 上分区展示。
- 章评列表独立浮层，不与某段绑定。

### F7 · 导出给 AI

- 工具栏「导出评论」按钮，下拉选项：
  - 导出当前笔记段评（`comments_<notePath>.json`）
  - 导出全站段评（`comments_all.json`）
  - 导出给专家团（AI 友好格式，按段落线程组织）
- 导出格式见第八节，可直接被 Python pipeline 读取。

### F8 · 导入批注

- 提供「导入批注」入口，选择 JSON 文件后合并（按 `id` 去重，冲突时询问覆盖/跳过）。
- 用于跨设备同步、专家团反馈回填。

### F9 · 专家团触发

- 工具栏「启用专家团」按钮，弹出向导（范围 / 参与专家 / 附加指令）。
- 生成 `expert_review_request.json`，含 `projectContext` 与 `expertReviewRequest`。
- 显示本地执行命令提示：`python src/main.py --expert-review expert_review_request.json`。
- 导入评判结果后显示徽章（采纳 / 不采纳 / 待议），可展开查看理由与建议。

### F10 · 段评管理

- 每条段评支持：编辑（仅作者本人或匿名读者自己的）、删除（软删除带确认）、复制段落原文、定位到段落。
- 作者本人段评可改类型；他人段评只读 + 点赞 + 回复。

---

## 四、评论数据模型

### 4.1 段评对象（ParagraphComment）

```json
{
  "id": "pc_1719012345678_0",
  "notePath": "资治通鉴/周纪一_三家分晋.md",
  "paragraphId": "p_3_a1b2c3d4",
  "paragraph": {
    "index": 3,
    "headingPath": ["讲事情"],
    "textFingerprint": "a1b2c3d4",
    "preview": "智伯贪而愎，不与，将伐我。韩康子不想给…"
  },
  "content": "这段段规的劝说很有意思，韩康子其实是被吓服的。",
  "type": "discussion",
  "author": "读者甲",
  "authorId": "anon_8f3a2b",
  "createdAt": "2026-06-23T10:32:11+08:00",
  "updatedAt": "2026-06-23T10:32:11+08:00",
  "likes": 2,
  "likedBy": ["anon_8f3a2b", "anon_1c2d3e"],
  "replies": [
    {
      "id": "r_1719012400000_0",
      "content": "同意，段规用的是恐吓而非讲理。",
      "author": "读者乙",
      "authorId": "anon_1c2d3e",
      "createdAt": "2026-06-23T10:40:00+08:00"
    }
  ],
  "expertReviews": [],
  "deleted": false,
  "syncedAt": "2026-06-23T10:32:15+08:00"
}
```

### 4.2 字段定义

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 全局唯一，格式 `pc_<timestamp>_<seq>`（章评用 `cc_` 前缀），前端生成 |
| `notePath` | string | 是 | 笔记相对路径，与 `data/index.json` 的 `notes` key 一致 |
| `paragraphId` | string | 是 | 段落定位 ID，见第五节；章评固定为 `"__chapter__"` |
| `paragraph` | object | 是 | 段落元信息，见 4.3 |
| `content` | string | 是 | 段评正文，纯文本（支持简单换行，不做 Markdown 渲染，防 XSS） |
| `type` | enum | 是 | `error` / `praise` / `discussion` / `supplement` / `thought`；章评用 `chapter` |
| `author` | string | 是 | 读者昵称，默认「读者」；可自定义 |
| `authorId` | string | 是 | 匿名读者标识，localStorage 生成一次持久化，用于区分「自己的段评」与防重复点赞 |
| `createdAt` | string (ISO 8601) | 是 | 创建时间，带时区 |
| `updatedAt` | string (ISO 8601) | 否 | 最后编辑时间 |
| `likes` | number | 是 | 点赞数，默认 0 |
| `likedBy` | array | 是 | 点赞者 `authorId` 数组，用于防重复与取消 |
| `replies` | array | 否 | 回复列表，每项含 `id`/`content`/`author`/`authorId`/`createdAt` |
| `expertReviews` | array | 否 | 专家团评判结果回填，见第九节 |
| `deleted` | boolean | 是 | 软删除标记，默认 `false` |
| `syncedAt` | string (ISO 8601) | 否 | 最后一次成功同步到 GitHub 的时间；未同步为 `null` |

### 4.3 段落元信息（paragraph）

| 字段 | 说明 | 作用 |
|---|---|---|
| `index` | 段落在 `.markdown-body` 下块级元素（`p`/`blockquote`/`li`/`h2-h4`）中的顺序索引 | 主定位 |
| `headingPath` | 从顶层标题到当前段最近的标题路径，如 `["讲事情"]` | 跨段落大改时的结构兜底 |
| `textFingerprint` | 段落纯文本前 64 字归一化后的 8 位 hash（`simpleHash`） | 段落内容指纹，检测段落是否变更 |
| `preview` | 段落纯文本前 60 字（去空白） | 段评卡片展示用，无需重新解析 DOM |

### 4.4 评论类型枚举（沿用 B 版本）

| type | 中文名 | 印章 | 色值 | 用途 |
|---|---|---|---|---|
| `error` | 错误指正 | 误 | 朱砂 `#c0392b` | 指出史实、引文、字词错误 |
| `praise` | 写得好 | 赞 | 赭石 `#a0522d` | 标记精彩段落 |
| `discussion` | 讨论 | 议 | 青灰 `#5a7a8a` | 提出疑问、展开思辨 |
| `supplement` | 补充 | 补 | 墨色 `#5a5651` | 补充史料、出处、背景 |
| `thought` | 感想 | 感 | 黛紫 `#7a5a8a` | 读者灵感、联想 |
| `chapter` | 章评 | 章 | 朱砂 `#c0392b` | 文末整章评论（特殊类型） |

---

## 五、段落定位策略

### 5.1 设计原则

段落级定位**比选区级稳定得多**：段落是结构化单元，即使段落内个别字词修订，段落本身仍存在。本系统采用**「段落索引 + 标题路径 + 文本指纹」三重定位**，不做字符级偏移。

### 5.2 paragraphId 生成

```
paragraphId = "p_" + index + "_" + textFingerprint
```

- `index`：加载笔记后，遍历 `.markdown-body` 下所有块级元素（`p`/`blockquote`/`li`/`h2`/`h3`/`h4`），按 DOM 顺序赋索引。
- `textFingerprint`：取段落 `textContent` 归一化（去首尾空白、合并连续空白）后前 64 字，做 `simpleHash`（8 位十六进制）。
- 章评：`paragraphId = "__chapter__"`，`paragraph.index = -1`。

### 5.3 定位算法（加载笔记后执行）

1. 遍历 `.markdown-body` 块级元素，为每个段落计算 `{ index, headingPath, textFingerprint, preview }`。
2. 对每条段评，按 `paragraphId` 中的 `index` 找到候选段落。
3. 比对候选段落的 `textFingerprint` 与段评记录的 `paragraph.textFingerprint`：
   - **一致** → 定位成功，在该段右侧渲染计数标记。
   - **不一致**（段落内容变更）→ 用 `headingPath` + `index` 重新定位到该标题下第 N 段，重新计算指纹并更新段评记录。
   - **仍失败**（段落被删除）→ 标记为 `orphaned`（孤儿段评），计数标记不渲染，段评仅在「孤儿段评」区以灰色「⚠ 段落已删除」展示。

### 5.4 与选区锚定的区别

| 维度 | 选区锚定（B 版本） | 段落锚定（本系统） |
|---|---|---|
| 粒度 | 字符区间 | 整段 |
| 偏移敏感性 | 高（改一字可能偏移） | 低（改段内字不影响段落定位） |
| 高亮方式 | `<mark>` 包裹选中文本 | 段落右侧计数标记（不侵入正文） |
| 容错 | 三级（精确→全文→指纹） | 两级（指纹→标题路径兜底） |

> 段落锚定**不包裹正文**，只在段落右侧渲染朱砂小圆点 + 计数，保持正文阅读纯净（番茄 / 起点式）。

---

## 六、交互流程

### 6.1 主流程：点段 → 展开段评 → 写段评 → 同步 → 他人可见

```
[用户点击段落 / 段落右侧小图标]
        ↓
[计算 paragraphId，查询该段段评]
        ↓
[段落右侧展开段评浮层（笺纸便笺风）]
        ↓
[展示已有段评列表 + 底部输入框]
        ↓
[用户输入段评 + 选类型 + 填昵称] ──取消──→ 关闭浮层
        ↓ 提交
[生成 ParagraphComment 对象]
        ↓
[立即写入 localStorage（即时可见）]
        ↓
[段落右侧计数标记 +1，段评列表追加]
        ↓
[异步：调用 GitHub Contents API 写入 comments/<notePath>.json]
        ↓ 成功
[更新 syncedAt，从离线队列移除]
        ↓ 失败 / 离线
[进入离线队列，联网后重试]
        ↓
[其他读者打开同一笔记 → 拉取 comments/<notePath>.json → 看到该段评]
```

### 6.2 点赞流程

- 段评卡片「心形」按钮 → 检查 `likedBy` 是否含当前 `authorId` → 未含则 `likes++`、`likedBy.push(authorId)` → 写 localStorage → 异步同步到 GitHub → 心形变朱砂实心。
- 已含则取消点赞（`likes--`、移除 `authorId`）。

### 6.3 回复流程

- 段评卡片「回复」→ 展开输入框 → 提交 → 追加到 `replies[]` → 写 localStorage → 异步同步 → 回复列表刷新。

### 6.4 章评流程

- 文末「章评」入口 → 展开章评浮层（`paragraphId = "__chapter__"`）→ 写章评 → 同步。

### 6.5 拉取他人段评

- 加载笔记后，自动 `GET comments/<notePath>.json`（GitHub raw 或 Contents API）→ 与 localStorage 合并（见 7.3）→ 渲染计数标记与段评列表。
- 提供「刷新段评」按钮手动重新拉取（避免轮询）。

---

## 七、存储方案（双通道）

### 7.1 通道一：localStorage（即时）

| Key | 值 |
|---|---|
| `dpc:<notePath>` | 该笔记的段评数组 |
| `dpc:meta` | 元信息（schema 版本、最后同步时间、authorId） |
| `dpc:queue` | 离线同步队列（待推送的写操作） |
| `dpc:authorId` | 匿名读者标识（首次生成持久化） |
| `dpc:authorName` | 读者昵称（可编辑） |
| `dpc:liked` | 已点赞段评 ID 集合（冗余防重复，与 `likedBy` 双写） |

- 作用：**即时可见**、离线可写、点赞状态本地记忆。
- 容量预警：单笔记段评 > 500 条或总量 > 4MB 时提示导出清理。

### 7.2 通道二：GitHub Contents API（持久化）

#### 7.2.1 仓库结构

```
comments/
  资治通鉴/
    周纪一_三家分晋.json      # 该笔记全部段评（段评 + 章评）
  三国/
    01_天下大乱.json
  史记/
    汉纪/
      01_大泽乡起义.json
```

- 文件路径 = `comments/` + `notePath`（去 `.md`）+ `.json`。
- 每个文件内容：

```json
{
  "schema": "deep-reading-paragraph-comments/v1",
  "notePath": "资治通鉴/周纪一_三家分晋.md",
  "updatedAt": "2026-06-23T10:32:15+08:00",
  "comments": [ /* ParagraphComment 数组 */ ]
}
```

#### 7.2.2 API 调用

- **读取**（无需鉴权，走 raw 或 Contents API GET）：
  `GET https://api.github.com/repos/{owner}/{repo}/contents/comments/{path}.json`
  或 `GET https://raw.githubusercontent.com/{owner}/{repo}/{branch}/comments/{path}.json`
- **写入**（需 PAT，走 Contents API PUT）：
  `PUT https://api.github.com/repos/{owner}/{repo}/contents/comments/{path}.json`
  - 请求体：`{ "message": "段评: <preview>", "content": "<base64>", "sha": "<existing sha>", "branch": "<branch>" }`
  - 新建文件不需 `sha`；更新需先 GET 拿 `sha` 再 PUT。
- **鉴权**：`Authorization: Bearer <PAT>`（fine-grained PAT，仅授权 `contents: write` 于 `comments/` 目录）。
- **CORS**：GitHub API 支持 CORS（`Access-Control-Allow-Origin: *`），浏览器可直接跨域调用。
- **速率**：认证 5000 次/小时；段评写入低频，足够。

#### 7.2.3 配置

- 站点配置文件 `site/js/comments-config.js`（或内联到 `index.html`）：

```js
window.DPC_CONFIG = {
  owner: 'codengseam',
  repo: 'haosz',
  branch: 'master',
  commentsDir: 'comments',
  token: '',  // 由作者在站点设置面板填入，存 localStorage；读者模式可留空（只读）
  rawBase: 'https://raw.githubusercontent.com/codengseam/haosz/master'
};
```

- 作者模式：填入 PAT，可写；读者模式：留空，只读他人段评 + 本地 localStorage 写（联网后由作者代为同步，或读者自行填 PAT）。

### 7.3 双通道合并策略

加载笔记后合并顺序：

1. 读 localStorage `dpc:<notePath>` → 得本地段评 `local[]`。
2. `GET comments/<notePath>.json` → 得远端段评 `remote[]`（失败则跳过，仅用 local）。
3. 按 `id` 合并：
   - 两端都有 → 取 `updatedAt` 较新者；若 `deleted` 字段较新者为 `true`，则视为已删除。
   - 仅 local 有 → 保留（待同步）。
   - 仅 remote 有 → 加入本地。
4. 合并后写回 localStorage，渲染。
5. 检查离线队列 `dpc:queue`，联网时逐条推送。

### 7.4 离线队列

- 每次写操作（发表 / 编辑 / 删除 / 点赞 / 回复）生成一个 `op`：

```json
{
  "opId": "op_<timestamp>_<seq>",
  "type": "upsert" | "delete" | "like" | "unlike" | "reply",
  "commentId": "pc_...",
  "notePath": "...",
  "payload": { /* 操作数据 */ },
  "createdAt": "...",
  "retries": 0
}
```

- 推送时：拉取远端文件 → 应用所有 `op` → 一次 PUT 写回（合并多次操作，减少 API 调用）。
- 失败重试：指数退避，最多 5 次；超限标记为「同步失败」提示用户。

### 7.5 安全说明（PAT 折中）

- 纯静态站点无法安全保管 PAT，前端嵌入的 PAT 可被抓包 / 查看 source 获取。
- **缓解措施**：
  1. 使用 **fine-grained PAT**，仅授权 `comments/` 目录的 `contents: write`，无其他仓库权限、无删除仓库权限。
  2. PAT 不写死在代码，由作者在站点「设置」面板填入存 localStorage；读者默认无 PAT（只读）。
  3. 仓库开启「禁止直接 push 到 master」保护规则，PAT 只能写 `comments/`，无法改原文 `output/`、`site/`。
  4. 在 spec 与 README 明示此折中风险，作者自行评估。
- **替代方案**（未来可演进）：接入 Giscus（基于 GitHub Discussions）或自建 Cloudflare Worker 代理写操作，本版不做。

---

## 八、AI 集成接口

### 8.1 导出格式（供 Python pipeline 消费）

导出文件为单个 JSON，顶层结构：

```json
{
  "schema": "deep-reading-paragraph-comments/v1",
  "exportedAt": "2026-06-23T11:00:00+08:00",
  "exportedBy": "作者",
  "scope": "note",
  "notePath": "资治通鉴/周纪一_三家分晋.md",
  "projectContext": {
    "rulesFile": ".trae/rules/rules.md",
    "notesDir": "output/",
    "agents": ["historian", "biographer", "context_analyst", "critic", "philosopher", "editor"]
  },
  "comments": [ /* ParagraphComment 数组 */ ]
}
```

- `scope`：`"note"` 或 `"all"`；为 `all` 时 `notePath` 省略，`comments` 跨笔记汇总，每条含 `notePath`。
- `scope=note` 时附 `noteContent`（笔记全文，便于专家团对照）。

### 8.2 按段落线程组织（专家团友好格式）

```json
{
  "schema": "deep-reading-paragraph-comments/v1",
  "notePath": "资治通鉴/周纪一_三家分晋.md",
  "book": "资治通鉴",
  "chapter": "周纪一_三家分晋",
  "threads": [
    {
      "threadId": "pc_...",
      "paragraphId": "p_3_a1b2c3d4",
      "paragraphPreview": "智伯贪而愎…",
      "headingPath": ["讲事情"],
      "status": "open",
      "tags": [],
      "targetAgent": "philosopher",
      "priority": "normal",
      "messages": [
        { "id": "pc_...", "author": "读者甲", "type": "discussion", "content": "...", "createdAt": "..." },
        { "id": "r_...", "author": "读者乙", "type": "reply", "content": "...", "createdAt": "..." }
      ]
    }
  ]
}
```

### 8.3 Python 侧消费约定

- 专家团入口在 `src/main.py` 增加 `--expert-review <request.json>` 参数。
- 读取 `request.json` → 按 `threads[].targetAgent` 分派：
  - `error` / `supplement` → historian + context_analyst + editor
  - `praise` → critic（提炼风格）
  - `discussion` → philosopher + critic
  - `thought` → 不强制分派
- 每条段评产出 `ExpertReview`（同 B 版本格式）：

```json
{
  "commentId": "pc_1719012345678_0",
  "verdict": "accept",
  "confidence": 0.85,
  "rationale": "段规劝说确见于《国语·晋语九》，建议补注。",
  "suggestedEdit": { "action": "append_citation", "target": "paragraphId", "text": "（参见《国语·晋语九》）" },
  "reviewedBy": ["historian", "editor"]
}
```

### 8.4 站点侧导入评判

- 导入后 `ExpertReview` 挂到 `comment.expertReviews[]`。
- 段评卡片展示评判徽章，点击展开 `rationale` 与 `suggestedEdit`。
- **评判不自动改原文**；作者点「应用建议」复制 `suggestedEdit.text` 到剪贴板，手动修订 `output/*.md`，再跑 `scripts/build_site.py`。

---

## 九、专家团触发机制

### 9.1 触发入口

- 工具栏「启用专家团」按钮，仅当当前笔记有 ≥1 条段评时可用。
- 点击弹出向导：

| 步骤 | 内容 |
|---|---|
| 1. 范围 | 单选：当前笔记 / 全站 |
| 2. 参与专家 | 多选：historian / biographer / context_analyst / critic / philosopher / editor（默认全选） |
| 3. 附加指令 | 文本框：可填「重点核查引文出处」「评估讲道理部分是否过度引申」等 |
| 4. 确认 | 生成并下载 `expert_review_request.json`，显示本地执行命令提示 |

### 9.2 输入（request 包）

见 8.2，额外字段：

```json
{
  "expertReviewRequest": {
    "participants": ["historian", "biographer", "context_analyst", "critic", "philosopher", "editor"],
    "additionalInstruction": "重点核查引文出处",
    "rulesReference": ".trae/rules/rules.md"
  }
}
```

### 9.3 输出（result 包）

```json
{
  "schema": "deep-reading-expert-review/v1",
  "requestRef": "expert_review_request.json",
  "reviewedAt": "2026-06-23T16:00:00+08:00",
  "reviews": [ /* ExpertReview 数组 */ ]
}
```

### 9.4 闭环

```
站点导出 request ──→ 本地 Python 执行 ──→ 站点导入 result ──→ 作者人工决定是否修订 ──→ 修订后重建站点
```

> 关键约束：站点永远不直接调用 LLM、不直接改 `output/*.md`。Python pipeline 在本地运行，结果以文件形式回流。

---

## 十、非功能需求

### 10.1 手机端优先

- **触摸交互**：段落右侧小图标命中区 ≥ 44×44px（iOS HIG），点击展开段评浮层。
- **响应式**：
  - 桌面（>1024px）：段评浮层在段落右侧 inline 展开，宽 320px。
  - 平板（≤1024px）：段评浮层在段落下方展开。
  - 移动（≤768px）：段评浮层全屏底部 sheet（max-height 70vh，可上滑全屏）。
- **性能**：单笔记 200 条段评，计数标记渲染 < 150ms；段评浮层展开 < 200ms。
- **键盘**：桌面端 Tab 可达，Esc 关闭浮层，Ctrl+Enter 提交。

### 10.2 魔搭部署兼容

- **纯静态**：全部逻辑在浏览器内运行，仅依赖 `marked.js` CDN（已有）+ GitHub Contents API（跨域 CORS 支持）。
- **相对路径**：所有资源用相对路径（`js/paragraph-comments.js`、`css/paragraph-comments.css`），不依赖根路径，兼容魔搭子路径部署。
- **无构建步骤**：不引入 npm / webpack / vite，`scripts/build_site.py` 仅复制文件，无需为评论系统增加构建。
- **CORS**：GitHub Contents API 与 raw.githubusercontent.com 均支持 CORS，魔搭域名下可直接调用。
- **HTTPS**：魔搭与 GitHub Pages 均为 HTTPS，`navigator.clipboard`、`fetch` 可用。
- **离线可用**：无网络时仍可写段评到 localStorage，联网后自动补传；只读模式下无网络仍可看 localStorage 缓存的段评。

### 10.3 XSS 防护

- 段评 `content` / `author` 渲染强制 `escapeHtml`，禁止 HTML 注入。
- 不使用 `innerHTML` 拼接用户输入；DOM 用 `createElement` + `textContent` 构建。
- 导入 JSON 时校验 schema 与字段类型，非法文件拒绝并提示。
- 段落 `preview` 来自 DOM `textContent`，天然安全。

### 10.4 可访问性

- 段评浮层 `role="dialog"` `aria-modal="true"` `aria-labelledby`。
- 段落计数标记 `aria-label="第 N 段，M 条段评"`。
- 段评卡片用 `<article>`，含 `aria-label` 摘要。
- 类型选择器用 `role="radiogroup"` + `role="radio"` `aria-checked`。
- 点赞按钮 `aria-pressed` 反映状态。
- 颜色对比度满足 WCAG AA。
- 尊重 `prefers-reduced-motion`，开启时禁用非必要动画。

### 10.5 视觉协调（沿用 B 古籍批注风）

- 复用 B 版本 CSS 变量：`--cmtB-vermilion` `#c0392b`、`--cmtB-ochre` `#a0522d`、`--cmtB-paper-note` `#fdf6e3`、`--cmtB-font-note`（楷体优先）。
- 段评浮层用笺纸便笺样式（米黄底 + 赭石边框 + 右上折角）。
- 印章式类型标签（22×22px 单字阴文：误/赞/议/补/感/章）。
- 段落计数标记：朱砂小圆点 + 白字数字，14×14px。
- 动效：墨迹晕染淡入、便笺手贴、印章盖下（同 B 版本）。

---

## 十一、边界与不做事项

| 项 | 决策 | 理由 |
|---|---|---|
| 实时弹幕推送 | 不做 | 纯静态无 WebSocket，靠手动刷新拉取 |
| 服务端账号体系 | 不做 | 用 GitHub PAT + 匿名昵称 |
| 评论富文本 / 图片 | 不做 | 防 XSS，保持纯文本 |
| 评论全文搜索 | 不做 | 量级小，按段落聚合即可 |
| 自动同步到 git 主分支 | 不做 | PAT 仅写 `comments/` 目录，不碰原文 |
| 自动改原文 | 不做 | 修订权在人，专家团仅给建议 |
| 跨笔记段评 | 不做 | 锚定复杂度爆炸，单笔记内闭环 |
| 选区级批注 | 不做（本系统） | 由 B 版本承担，本系统专注段落级 |
| 评论版本历史 | 不做（首版） | 仅保留 `updatedAt`，不存全量历史 |
| 实时专家团（站点内直接调 LLM） | 不做 | 纯静态约束，专家团在本地 Python 跑 |
| 轮询拉取他人段评 | 不做（首版） | 仅手动「刷新段评」，避免 API 速率消耗 |

---

## 十二、交付物清单

| 文件 | 说明 |
|---|---|
| `site/js/paragraph-comments.js` | 段落级评论系统主模块（vanilla JS，IIFE） |
| `site/css/paragraph-comments.css` | 段落级评论系统样式（沿用 B 古籍批注风变量） |
| `site/js/comments-config.js` | GitHub 仓库配置（owner/repo/branch/token 占位） |
| `site/index.html` | 追加 `paragraph-comments.js` / `css` 引用与段评容器 |
| `site/js/app.js` | `loadNote` 末尾追加 `note:loaded` 事件分发（同 B 版本集成方式） |
| `docs/paragraph-comments/spec.md` | 本文件 |
| `docs/paragraph-comments/checklist.md` | 评审 checklist |
| `src/main.py`（建议） | 增加 `--expert-review` 入口（由 Python 侧实现，非本规格强制） |

---

## 十三、验收口径（与 checklist.md 对齐）

- 点段 → 浮层 → 提交 → 计数标记 → 段评列表，全链路在 vanilla JS 下可用。
- 关闭并重开浏览器，段评与计数标记仍存在（localStorage）。
- 修改原文个别字词后重开，段评仍能定位到对应段落（段落指纹 + 标题路径兜底）。
- 段评写入 GitHub 仓库 `comments/` 目录后，其他读者打开同一笔记可拉取并看到。
- 离线写段评后联网，离线队列自动补传成功。
- 导出 JSON 可被 Python `json.load` 正常解析，字段齐全。
- 专家团触发可生成 `expert_review_request.json`，导入 `expert_review_result.json` 后评判徽章正确显示。
- 视觉沿用 B 古籍批注风，无突兀感。
- 移动端单手可点段、写段评、点赞、回复。
