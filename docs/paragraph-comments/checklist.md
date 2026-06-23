# 静态网站段落级评论系统 · 评审 Checklist

> 版本：v1.0 · 日期：2026-06-23
> 配套文档：[spec.md](./spec.md)
> 用途：评审段落级评论系统（番茄 / 起点式段评）是否达标。每条用 `- [ ]` 勾选；评审时逐项验证，未通过项需附说明。

---

## 一、功能完整性

### 1.1 段评发表

- [ ] 在阅读区（`#reader .markdown-body`）点击任意段落（`p`/`blockquote`/`li`），300ms 内展开段评浮层
- [ ] 段评浮层含：多行输入框、5 类类型选择器、昵称输入、提交按钮、取消按钮
- [ ] 提交后段评进入该段段评列表，段落右侧出现朱砂计数标记（小圆点 + 数字）
- [ ] 取消按钮关闭浮层，不写入数据
- [ ] 输入为空时提交按钮禁用或提示
- [ ] 段评支持 Ctrl+Enter 提交（桌面）、Esc 关闭

### 1.2 段评列表

- [ ] 点击段落或段落右侧小图标，展开该段所有段评，按时间倒序（最新在上）
- [ ] 段评卡片展示：印章式类型标签、作者昵称、时间、正文、点赞数、回复数
- [ ] 段评正文支持换行，纯文本不渲染 HTML
- [ ] 空状态显示「此段尚无段评，留下第一条吧」+ 引导图标
- [ ] 段评列表可滚动，不撑破浮层

### 1.3 点赞

- [ ] 每条段评有心形点赞按钮，点击 `likes++` 并加入 `likedBy`
- [ ] 再次点击取消点赞（`likes--`、移除 `authorId`）
- [ ] 点赞状态存 localStorage（`dpc:liked`），刷新后保持
- [ ] 点赞数 ≥ 1 时段评卡片显示点赞数
- [ ] 同一读者对同一段评只能点赞一次（防重复）

### 1.4 回复

- [ ] 每条段评可展开回复输入框
- [ ] 支持多级回复（最多 2 级，第 3 级折叠为「查看更多回复」）
- [ ] 回复含 `id` / `content` / `author` / `authorId` / `createdAt`
- [ ] 回复提交后立即追加到 `replies[]` 并刷新计数
- [ ] 回复支持 Ctrl+Enter 提交

### 1.5 段评计数标记

- [ ] 有段评的段落右侧显示朱砂小圆点 + 段评数（如 `3`）
- [ ] 计数为 0 时不显示标记
- [ ] 发表 / 删除段评后计数实时更新
- [ ] 计数标记命中区 ≥ 44×44px（移动端触摸友好）
- [ ] 计数标记有 `aria-label="第 N 段，M 条段评"`

### 1.6 章评

- [ ] 笔记文末设章评入口（`paragraphId = "__chapter__"`）
- [ ] 可发表针对整章的评论，`type = "chapter"`
- [ ] 章评列表独立浮层，不与某段绑定
- [ ] 章评与段评在数据模型上统一，在 UI 上分区展示

### 1.7 导出

- [ ] 工具栏有「导出评论」按钮，下拉含「当前笔记」「全站」「导出给专家」三个选项
- [ ] 导出文件为 JSON，文件名 `comments_<notePath|all>_<YYYYMMDD>.json`
- [ ] 导出 JSON 顶层结构符合 spec 8.1（`schema` / `exportedAt` / `scope` / `comments`）
- [ ] 导出 JSON 可被 Python `json.load` 正常解析，无 BOM、无注释
- [ ] 空评论时导出仍生成合法 JSON（`comments: []`）
- [ ] 专家团格式（spec 8.2）按段落线程组织，含 `paragraphId` / `paragraphPreview` / `headingPath`

### 1.8 导入

- [ ] 提供「导入评论」入口，选择 JSON 文件后合并到 localStorage
- [ ] 按 `id` 去重；冲突时弹窗询问「覆盖 / 跳过 / 全部覆盖」
- [ ] 非法 JSON 或 schema 不符时，拒绝并提示具体错误
- [ ] 导入后段评列表与计数标记立即刷新

### 1.9 专家团触发

- [ ] 工具栏有「启用专家团」按钮
- [ ] 当前笔记无段评时按钮禁用并提示「暂无评论可评判」
- [ ] 点击后弹出向导：范围（当前笔记/全站）、参与专家（多选）、附加指令（文本框）
- [ ] 确认后下载 `expert_review_request.json`，含 spec 9.2 所有字段
- [ ] 向导末尾显示本地执行命令提示（`python src/main.py --expert-review expert_review_request.json`）
- [ ] 提供「导入专家评判」入口，导入 `expert_review_result.json` 后回填到 `comment.expertReviews[]`
- [ ] 评判徽章（采纳/不采纳/待议）在段评卡片正确显示，点击展开 `rationale` 与 `suggestedEdit`
- [ ] 「应用建议」按钮可复制 `suggestedEdit.text` 到剪贴板，不自动改原文

### 1.10 段评管理

- [ ] 读者可编辑自己发表的段评内容与类型，`updatedAt` 同步更新
- [ ] 读者可删除自己的段评（软删除 `deleted=true`，带二次确认）
- [ ] 每条段评可「复制段落原文」到剪贴板
- [ ] 每条段评可「定位到段落」，滚动并高亮对应段落
- [ ] 他人段评只读，仅可点赞与回复，不可编辑 / 删除

---

## 二、段落定位稳定性

### 2.1 段落定位数据完整性

- [ ] `paragraph` 对象含 `index` / `headingPath` / `textFingerprint` / `preview` 全部字段
- [ ] `paragraphId` 格式为 `p_<index>_<textFingerprint>`，章评为 `__chapter__`
- [ ] `textFingerprint` 为段落纯文本前 64 字归一化后的 8 位 hash
- [ ] `headingPath` 为从顶层标题到当前段最近的标题路径数组
- [ ] `preview` 为段落纯文本前 60 字（去空白）

### 2.2 定位算法

- [ ] 加载笔记后遍历 `.markdown-body` 块级元素，为每段计算 `{ index, headingPath, textFingerprint, preview }`
- [ ] 按 `paragraphId` 中的 `index` 找候选段落
- [ ] 比对 `textFingerprint`，一致则定位成功
- [ ] 不一致时用 `headingPath` + `index` 重新定位到该标题下第 N 段，更新指纹
- [ ] 全部失败时标记 `orphaned`，不渲染计数标记，在「孤儿段评」区以灰色「⚠ 段落已删除」展示

### 2.3 原文变更容错

- [ ] 原文段内个别字词修订（≤ 3 字）后，段评仍定位到该段（指纹可能变，靠标题路径兜底）
- [ ] 原文段落顺序调整后，`headingPath` + `index` 兜底能定位到正确段落
- [ ] 原文整段删除时，对应段评变孤儿，不崩溃，作者可手动删除
- [ ] 段落指纹变更后，段评记录的 `paragraph.textFingerprint` 自动更新并同步

### 2.4 不侵入正文

- [ ] 段评不包裹正文（不用 `<mark>` 包裹段落文本）
- [ ] 仅在段落右侧渲染计数标记，保持正文阅读纯净
- [ ] 计数标记用绝对定位，不影响正文排版

---

## 三、存储同步（localStorage + GitHub API 双通道）

### 3.1 localStorage 通道

- [ ] localStorage key `dpc:<notePath>` 存该笔记段评数组
- [ ] localStorage key `dpc:meta` 存元信息（schema 版本、最后同步时间）
- [ ] localStorage key `dpc:queue` 存离线同步队列
- [ ] localStorage key `dpc:authorId` 存匿名读者标识（首次生成持久化）
- [ ] localStorage key `dpc:authorName` 存读者昵称（可编辑）
- [ ] localStorage key `dpc:liked` 存已点赞段评 ID 集合（防重复）
- [ ] 所有 localStorage 读写包裹 try-catch
- [ ] localStorage 不可用时提示「本地存储不可用，段评无法保存」
- [ ] 配量预警：单笔记段评 > 500 条或总量 > 4MB 时提示导出清理

### 3.2 GitHub Contents API 通道

- [ ] 段评写入 `comments/<notePath>.json`（路径 = `comments/` + notePath 去 `.md` + `.json`）
- [ ] 读取走 `GET https://api.github.com/repos/{owner}/{repo}/contents/comments/{path}.json` 或 raw URL
- [ ] 写入走 `PUT`，请求体含 `message` / `content`(base64) / `sha`(更新时) / `branch`
- [ ] 鉴权头 `Authorization: Bearer <PAT>`
- [ ] 新建文件不传 `sha`；更新文件先 GET 拿 `sha` 再 PUT
- [ ] 仓库结构 `comments/{book}/{chapter}.json` 与 notePath 镜像
- [ ] 文件内容顶层含 `schema: "deep-reading-paragraph-comments/v1"` / `notePath` / `updatedAt` / `comments[]`

### 3.3 双通道合并

- [ ] 加载笔记后先读 localStorage `dpc:<notePath>` 得 `local[]`
- [ ] 再 `GET comments/<notePath>.json` 得 `remote[]`（失败则跳过，仅用 local）
- [ ] 按 `id` 合并：两端都有取 `updatedAt` 较新者；`deleted` 较新者为 `true` 则视为已删除
- [ ] 仅 local 有则保留（待同步）；仅 remote 有则加入本地
- [ ] 合并后写回 localStorage 并渲染
- [ ] 合并冲突不丢数据，取并集

### 3.4 离线队列

- [ ] 每次写操作生成 `op`（含 `opId` / `type` / `commentId` / `notePath` / `payload` / `createdAt` / `retries`）
- [ ] `op` 类型覆盖：`upsert` / `delete` / `like` / `unlike` / `reply`
- [ ] 推送时拉取远端文件 → 应用所有 `op` → 一次 PUT 写回（合并多次操作减少 API 调用）
- [ ] 失败重试：指数退避，最多 5 次
- [ ] 超限标记「同步失败」并提示用户
- [ ] 联网后自动检查队列并补传
- [ ] 成功同步后更新 `syncedAt`，从队列移除

### 3.5 冲突与并发

- [ ] 多读者同时写同一笔记文件时，后写者 PUT 因 `sha` 不匹配失败，自动重新 GET → 合并 → 重试
- [ ] 重试次数上限后提示「同步冲突，请刷新后重试」
- [ ] 点赞数合并取并集（`likedBy` 去重），不互相覆盖

### 3.6 PAT 配置与安全

- [ ] 使用 fine-grained PAT，仅授权 `comments/` 目录的 `contents: write`
- [ ] PAT 不写死在代码，由作者在站点「设置」面板填入存 localStorage
- [ ] 读者默认无 PAT（只读他人段评 + 本地写）
- [ ] 仓库开启「禁止直接 push 到 master」保护规则（PAT 只能写 `comments/`）
- [ ] spec 与 README 明示 PAT 折中风险

---

## 四、手机端兼容

### 4.1 触摸交互

- [ ] 段落右侧小图标命中区 ≥ 44×44px（iOS HIG）
- [ ] 点击小图标展开段评浮层，触摸无延迟（无 300ms click 延迟，用 touchend 或 fastclick 思路）
- [ ] 段评浮层在移动端为底部 sheet（max-height 70vh，可上滑全屏）
- [ ] 浮层内输入框聚焦时键盘弹出不遮挡输入区（`scrollIntoView` 或 `visualViewport` 适配）
- [ ] 点赞、回复按钮命中区 ≥ 44×44px

### 4.2 响应式布局

- [ ] 桌面（>1024px）：段评浮层在段落右侧 inline 展开，宽 320px
- [ ] 平板（≤1024px）：段评浮层在段落下方展开
- [ ] 移动（≤768px）：段评浮层全屏底部 sheet
- [ ] 计数标记在移动端不与正文重叠
- [ ] 工具栏按钮在移动端可换行或折叠

### 4.3 移动端性能

- [ ] 单笔记 200 条段评，计数标记渲染 < 150ms
- [ ] 段评浮层展开 < 200ms
- [ ] 段评列表 > 50 条时考虑虚拟滚动或分页（首版可全量，但需评估）
- [ ] 切换笔记时清理事件监听与 DOM 引用，无内存泄漏
- [ ] GitHub API 调用不阻塞主线程（异步 fetch）
- [ ] 移动网络下 fetch 超时设合理值（如 10s），超时提示

### 4.4 移动端可用性

- [ ] 单手可操作：计数标记在段落右侧拇指可达区
- [ ] 段评浮层可上滑 / 下滑关闭
- [ ] 输入框 placeholder 提示「写下你的段评…」
- [ ] 提交成功有 toast 反馈
- [ ] 离线时明确提示「离线模式，段评将联网后同步」

---

## 五、视觉设计（B 古籍批注风）

### 5.1 配色（沿用 B 版本变量）

- [ ] 朱砂红 `--cmtB-vermilion: #c0392b` 用于计数标记、点赞、提交按钮
- [ ] 赭石 `--cmtB-ochre: #a0522d` 用于浮层边框、引用块
- [ ] 便笺宣纸色 `--cmtB-paper-note: #fdf6e3` 用于浮层底色
- [ ] 5 类类型色：朱砂 / 赭石 / 青灰 / 墨色 / 黛紫（同 B 版本）
- [ ] 复用 `style.css` 的 CSS 变量：`--bg-paper` / `--ink-primary` / `--border` / `--radius`
- [ ] 高亮底纹透明度 ≤ 0.18，不抢正文

### 5.2 字体与排版

- [ ] 段评正文用 `--cmtB-font-note`（楷体优先，回退宋体）
- [ ] 计数标记、时间戳用 `--font-sans`
- [ ] 印章式类型标签用 `--font-serif`
- [ ] 段评卡片间距 10-12px，行高 1.6
- [ ] 段落原文预览用斜体 + `--ink-secondary`

### 5.3 印章与便笺

- [ ] 印章式类型标签 22×22px 单字阴文（误/赞/议/补/感/章），朱底白字
- [ ] 段评浮层有右上折角（笺纸便笺风）
- [ ] 段评卡片有赭石左边框 + 阴影
- [ ] 已解决 / 已删除段评有视觉降级（透明度降低或删除线）

### 5.4 动效（沿用 B 版本）

- [ ] 段评浮层出现有墨迹晕染淡入（`filter: blur(1.5px)→0` + `opacity 0→1`）
- [ ] 段评卡片出现有便笺手贴（`translateY(-8px) rotate(-1deg)→0`）
- [ ] 计数标记出现有淡入
- [ ] 点赞有朱砂心形填充动效
- [ ] 动效尊重 `prefers-reduced-motion`，开启时禁用非必要动画

### 5.5 整体协调

- [ ] 评论系统 UI 不引入新色系（除 5 类低饱和高亮色）
- [ ] 评论系统 UI 不引入新字体
- [ ] 浮层、计数标记、段评卡片视觉风格与 B 版本批注栏协调，无突兀感
- [ ] 暗色模式不支持（与现有站点一致，不做）

---

## 六、代码质量

### 6.1 无框架依赖

- [ ] 仅用 vanilla JS，不引入 React/Vue/jQuery 等框架
- [ ] 仅依赖 `marked.js`（已有），不新增 CDN 依赖
- [ ] 无 `npm install` / `package.json` 新增依赖

### 6.2 模块化

- [ ] 评论系统为独立模块 `site/js/paragraph-comments.js`，IIFE 封装
- [ ] 通过 `window.DeepReadingParagraphComments` 暴露最小 API
- [ ] 不污染全局变量（仅 `DeepReadingParagraphComments` 与 `DPC_CONFIG` 两个命名空间）
- [ ] 内部状态用模块级私有变量，不暴露
- [ ] GitHub API 同步逻辑独立为子模块（如 `Sync` 对象），便于替换为其他后端

### 6.3 不破坏现有 app.js

- [ ] `app.js` 现有函数签名与 `state` 结构不变
- [ ] `loadNote` 末尾仅追加 `note:loaded` 事件分发（同 B 版本集成方式）
- [ ] `index.html` 仅追加 `paragraph-comments.js` / `css` 引用与段评容器
- [ ] 现有搜索、目录树、modal 功能不受影响
- [ ] 与 B 版本评论系统可共存（不同命名空间）或替换（由构建配置决定）

### 6.4 安全（无 XSS）

- [ ] 段评 `content` / `author` 渲染强制 `escapeHtml`
- [ ] 不使用 `innerHTML` 拼接用户输入
- [ ] 段评 DOM 用 `createElement` + `textContent` 构建
- [ ] 导入 JSON 时校验 schema 与字段类型，非法字段拒绝
- [ ] 印章 `class` 仅用白名单类型，不拼用户输入
- [ ] GitHub PAT 不写入代码仓库，仅存 localStorage
- [ ] fetch 请求不把 PAT 写入 URL（用 Header）

### 6.5 健壮性

- [ ] 所有 `localStorage` 读写包裹 try-catch
- [ ] 所有 DOM 查询返回 null 时有兜底
- [ ] GitHub API 调用失败时降级为仅 localStorage 模式，不崩溃
- [ ] 网络超时 / 速率限制（403/429）时提示并退避
- [ ] 评论数据迁移：检测 `dpc:meta.schema` 版本，旧版自动升级
- [ ] base64 编码用 `btoa(unescape(encodeURIComponent(str)))` 处理中文

### 6.6 可维护性

- [ ] 代码有清晰分段注释（与 `app.js` / B 版本 `comments.js` 风格一致）
- [ ] 关键函数有 JSDoc 注释（参数、返回值）
- [ ] 无魔法数字，常量提取（如类型枚举、颜色映射、API 端点）
- [ ] 无超过 80 行的函数，复杂逻辑拆分
- [ ] GitHub API 调用封装为统一函数，便于改 endpoint

---

## 七、魔搭部署兼容

### 7.1 纯静态

- [ ] 全部逻辑在浏览器内运行，仅依赖 `marked.js` CDN（已有）+ GitHub Contents API
- [ ] 不引入自建服务端
- [ ] 不引入 npm / webpack / vite 构建步骤
- [ ] `scripts/build_site.py` 无需为评论系统增加构建逻辑（仅复制文件）

### 7.2 相对路径

- [ ] 所有资源用相对路径（`js/paragraph-comments.js`、`css/paragraph-comments.css`），不依赖根路径
- [ ] 兼容魔搭子路径部署（如 `modelscope.cn/studios/xxx/haosz`）
- [ ] GitHub raw URL 与 Contents API URL 用绝对路径（配置在 `DPC_CONFIG`）

### 7.3 CORS

- [ ] GitHub Contents API 支持 CORS（`Access-Control-Allow-Origin: *`），魔搭域名下可直接调用
- [ ] raw.githubusercontent.com 支持 CORS，可用于只读拉取
- [ ] 预检请求（OPTIONS）正常通过
- [ ] 跨域 fetch 不带 cookie（`credentials: 'omit'`）

### 7.4 HTTPS

- [ ] 魔搭与 GitHub Pages 均为 HTTPS，`navigator.clipboard` 可用
- [ ] `fetch` HTTPS 调用无混合内容警告
- [ ] localStorage 在 HTTPS 域名下正常工作

### 7.5 离线可用

- [ ] 无网络时仍可写段评到 localStorage
- [ ] 联网后自动补传离线队列
- [ ] 只读模式下无网络仍可看 localStorage 缓存的段评
- [ ] 离线状态有明确 UI 提示

### 7.6 GitHub Pages 部署

- [ ] 所有资源用相对路径，纯静态可部署
- [ ] localStorage 在 GitHub Pages 域名下正常工作
- [ ] 导出 / 导入文件功能在 HTTPS 下正常工作
- [ ] GitHub Actions 自动构建（`pages.yml`）不受影响

---

## 八、可访问性

### 8.1 键盘

- [ ] 所有交互元素（浮层、计数标记、段评卡片按钮、点赞）可 Tab 聚焦
- [ ] 焦点可见（`:focus-visible` 有 outline，颜色用 `--cmtB-vermilion`）
- [ ] 浮层打开时焦点陷阱（Tab 不跳出浮层，Esc 关闭）
- [ ] Ctrl+Enter 提交段评，Esc 关闭浮层
- [ ] 段评列表可用上下方向键浏览（可选）

### 8.2 ARIA

- [ ] 段评浮层 `role="dialog"` `aria-modal="true"` `aria-labelledby`
- [ ] 计数标记 `aria-label="第 N 段，M 条段评"`
- [ ] 段评卡片用 `<article>`，含 `aria-label` 摘要
- [ ] 类型选择器用 `role="radiogroup"` + `role="radio"` `aria-checked`
- [ ] 点赞按钮 `aria-pressed` 反映状态
- [ ] 加载状态 `aria-busy="true"`
- [ ] 段评列表 `<section aria-label="段评列表">`

### 8.3 对比度

- [ ] 段评正文文字与背景对比度 ≥ 4.5:1（WCAG AA）
- [ ] 类型标签文字与底色对比度 ≥ 4.5:1
- [ ] 计数标记白字与朱砂底对比度 ≥ 4.5:1
- [ ] 时间戳、作者名等辅助文字对比度 ≥ 3:1

### 8.4 屏幕阅读器

- [ ] 段评内容用 `textContent` 渲染，可被屏幕阅读器读取
- [ ] 印章标签有 `aria-label` 或 `title` 说明类型
- [ ] 孤儿段评有 `aria-label` 说明「段落已删除」
- [ ] 同步状态有 `aria-live="polite"` 提示

---

## 九、数据模型合规

### 9.1 字段齐全

- [ ] 每个 ParagraphComment 含 `id` / `notePath` / `paragraphId` / `paragraph` / `content` / `type` / `author` / `authorId` / `createdAt` / `likes` / `likedBy` / `deleted` / `syncedAt`
- [ ] `updatedAt` 在编辑后存在
- [ ] `replies[]` 每项含 `id` / `content` / `author` / `authorId` / `createdAt`
- [ ] `expertReviews[]` 每项含 `commentId` / `verdict` / `confidence` / `rationale` / `suggestedEdit` / `reviewedBy`

### 9.2 类型正确

- [ ] `id` / `notePath` / `paragraphId` / `content` / `author` / `authorId` 为 string
- [ ] `type` 取值限于 `error` / `praise` / `discussion` / `supplement` / `thought` / `chapter`
- [ ] `likes` 为非负整数
- [ ] `likedBy` / `replies` / `expertReviews` 为数组（可为空）
- [ ] `createdAt` / `updatedAt` / `syncedAt` 为 ISO 8601 字符串，带时区
- [ ] `deleted` 为 boolean
- [ ] `paragraph.index` 为非负整数（章评为 -1）

### 9.3 可被 AI pipeline 消费

- [ ] 导出 JSON 顶层含 `schema: "deep-reading-paragraph-comments/v1"`
- [ ] 导出 JSON 含 `projectContext`（`rulesFile` / `notesDir` / `agents`）
- [ ] `scope=note` 时附 `noteContent`（笔记全文）
- [ ] `scope=all` 时 `notePath` 省略，每条 comment 含 `notePath`
- [ ] JSON 无循环引用、无 `undefined`、无 NaN
- [ ] 文件 UTF-8 无 BOM，中文不转义

### 9.4 存储与去重

- [ ] localStorage key 命名 `dpc:<notePath>` 存该笔记段评数组
- [ ] `id` 全局唯一，格式 `pc_<timestamp>_<seq>`（章评 `cc_`）
- [ ] `authorId` 全局唯一，格式 `anon_<6位hex>`
- [ ] 导入时按 `id` 去重，不产生重复条目
- [ ] 点赞按 `authorId` 去重，不重复计数

---

## 十、文档与交付

- [ ] `docs/paragraph-comments/spec.md` 存在且与实现一致
- [ ] `docs/paragraph-comments/checklist.md` 存在且可执行
- [ ] `site/js/paragraph-comments.js` 有文件头注释说明模块用途与 API
- [ ] `site/index.html` 变更可追溯到 spec 第十二节
- [ ] `site/js/app.js` 变更仅限 `loadNote` 末尾事件分发
- [ ] 不引入未在 spec 中声明的文件或依赖
- [ ] README 说明 PAT 配置方式与安全折中

---

## 评审记录模板

| 维度 | 通过项数 / 总项数 | 结论 | 备注 |
|---|---|---|---|
| 一、功能完整性 | / 50+ | 通过/有条件通过/不通过 | |
| 二、段落定位稳定性 | / 16 | | |
| 三、存储同步 | / 30+ | | |
| 四、手机端兼容 | / 18 | | |
| 五、视觉设计 | / 20 | | |
| 六、代码质量 | / 24 | | |
| 七、魔搭部署兼容 | / 18 | | |
| 八、可访问性 | / 16 | | |
| 九、数据模型合规 | / 18 | | |
| 十、文档与交付 | / 7 | | |

评审人：__________  评审日期：__________  实现版本：__________
