# 静态网站段落评论系统 · TDD 测试用例与手机端兼容方案

> 版本：v1.0 · 日期：2026-06-23
> 适用系统：段落级评论（仿番茄/起点段评），手机端优先
> 技术栈：vanilla JS + marked.js（CDN），IIFE 模块，B 古籍批注风（朱砂/赭石/宋体）
> 部署：阿里魔搭空间 + GitHub Pages（纯静态）
> 存储：localStorage 即时层 + GitHub Contents API 同步层（双通道）
> 关联代码基线：`site/versions/B-classic/`（index.html / js/app.js / js/comments.js / css/comments.css）

---

## 0. 文档定位与测试驱动思路

本文档是**段落评论系统**的测试设计基线，先于实现编写（TDD：Red → Green → Refactor）。

### 0.1 与现有 `comments-system` 的区别

| 维度 | 现有圈选批注系统（`docs/comments-system/`） | 本段落评论系统 |
|---|---|---|
| 触发方式 | 鼠标圈选文本 → 浮层 | 点击段落 → 浮层 |
| 锚定对象 | 任意文本区间（Range） | 整段 `<p>`（data-pid） |
| 存储通道 | 仅 localStorage | localStorage + GitHub Contents API 双通道 |
| 评论粒度 | 选区级 | 段落级（段评）+ 章节级（章评） |
| 社交属性 | 无点赞 | 点赞、回复 |
| 离线能力 | 无 | 离线队列 + 冲突合并 |
| 移动端 | 降级（隐藏选区） | 手机端优先设计 |

### 0.2 TDD 红绿循环约定

1. **Red**：先写一条失败测试（断言尚未实现的行为）。
2. **Green**：写最小实现让测试通过。
3. **Refactor**：在测试全绿前提下重构。
4. 每个核心函数都应有对应的单元测试；UI 交互用浏览器测试覆盖。

### 0.3 优先级定义

| 标记 | 含义 | 必须通过门槛 |
|---|---|---|
| P0 | 阻塞核心链路，不通过不可发布 | 发版前 100% 通过 |
| P1 | 重要功能或常见边界 | 发版前 ≥ 95% 通过 |
| P2 | 体验优化、罕见边界 | 可带缺陷发布，下版补齐 |

---

# 第一部分：测试用例（TDD 驱动）

## 1. 段落标记测试

> 目标：marked.js 渲染后，每个可评论块级元素被赋予稳定、唯一、可恢复的 `data-pid`。

### 1.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| PM-001 | 标准段落标记 | 加载一篇含多个 `<p>` 的笔记 | 1. dispatch `note:loaded` 事件<br>2. 读取 `.markdown-body p` 列表 | 每个 `<p>` 含 `data-pid` 属性，值为 `p<index>`（如 p0、p1），index 从 0 起 | P0 |
| PM-002 | 块级元素覆盖 | 笔记含 `<p>`、`<blockquote>`、`<li>` | 同上 | 三类元素均被标记，`data-pid` 全局连续不重复 | P1 |
| PM-003 | 标题不标记 | 笔记含 `<h1>`~`<h6>` | 同上 | 标题元素**无** `data-pid`（标题不参与段评，避免锚点漂移） | P1 |
| PM-004 | 代码块不标记 | 笔记含 `<pre><code>` | 同上 | `pre`、`code` 内部元素**无** `data-pid` | P1 |
| PM-005 | 空段落跳过 | 笔记含空白 `<p></p>` 或仅空白 | 同上 | 空段落不被标记，后续段落 index 不因空段错位（需明确策略：跳过 or 占位，本系统选**跳过**） | P2 |
| PM-006 | 重复加载幂等 | 同一笔记已标记一次 | 1. 再次 dispatch `note:loaded`<br>2. 检查 `data-pid` | 不产生重复标记；`data-pid` 值与首次一致（重新渲染前先清理旧标记） | P0 |
| PM-007 | 切换笔记清理 | 笔记 A 已标记 | 1. 加载笔记 B<br>2. 检查 A 的 DOM | A 的 DOM 已被替换，B 的段落重新从 p0 标记 | P0 |
| PM-008 | data-pid 稳定性 | 同一笔记原文未改 | 1. 标记并记录每段 `data-pid`<br>2. 关闭重开浏览器<br>3. 重新加载 | `data-pid` 与首次完全一致 | P0 |
| PM-009 | 嵌套结构处理 | `<blockquote>` 内含多个 `<p>` | 标记并读取 | 嵌套 `<p>` 也被标记，`data-pid` 全局唯一递增 | P2 |
| PM-010 | marked 版本兼容 | marked@12 渲染输出 | 标记 | 不依赖 marked 内部 AST，仅遍历渲染后 DOM，版本升级不破坏 | P1 |

### 1.2 TDD 实现要点（先写测试）

```js
// tests/paragraph-mark.test.js（示意）
test('PM-001 每个段落获得 data-pid', () => {
  setupArticle('<p>甲</p><p>乙</p><p>丙</p>');
  ParagraphComments.attach(container, 'note/test.md');
  const ps = container.querySelectorAll('p[data-pid]');
  assert.equal(ps.length, 3);
  assert.equal(ps[0].dataset.pid, 'p0');
  assert.equal(ps[2].dataset.pid, 'p2');
});
```

---

## 2. 段评发表测试

> 目标：点击段落 → 浮层 → 输入 → 提交，全链路在 vanilla JS 下可用，且 localStorage 即时落盘。

### 2.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| PC-001 | 点击段落弹浮层 | 笔记已标记 data-pid | 1. 点击某 `<p>`<br>2. 检查浮层 | 段评浮层出现，含输入框、类型选择、提交按钮；浮层标题显示该段 `data-pid` | P0 |
| PC-002 | 提交段评落盘 | 浮层已打开 | 1. 输入「此处史实有误」<br>2. 选类型「错误指正」<br>3. 点提交 | 浮层关闭；localStorage `pc:<notePath>` 新增一条 Comment；段落右侧徽章计数 +1 | P0 |
| PC-003 | 空内容拦截 | 浮层已打开 | 1. 输入框留空或仅空白<br>2. 点提交 | 不提交；输入框聚焦并提示「请输入评论内容」 | P0 |
| PC-004 | 取消关闭浮层 | 浮层已打开且有输入 | 1. 点取消 / 按 Esc | 浮层关闭，输入内容丢弃，不落盘 | P0 |
| PC-005 | 类型枚举完整 | 浮层已打开 | 检查类型选择器 | 含 5 类：错误指正/写得好/讨论/补充/感想，默认「讨论」 | P1 |
| PC-006 | 评论对象结构 | 已提交一条 | 读取 localStorage | Comment 含 `id/notePath/pid/content/type/author/createdAt/likes/likedBy/replies/status` 字段 | P0 |
| PC-007 | pid 正确关联 | 在 p3 提交评论 | 读取该 Comment | `comment.pid === 'p3'`，`comment.notePath` 正确 | P0 |
| PC-008 | 即时同步触发 | 已配置 GitHub Token | 提交一条评论 | localStorage 写入后，触发 GitHub API 同步（异步，不阻塞 UI） | P1 |
| PC-009 | Ctrl+Enter 提交 | 浮层已打开有内容 | 按 Ctrl+Enter | 等同点提交按钮 | P1 |
| PC-010 | 二次点击同段 | p1 已有评论 | 再次点击 p1 | 浮层打开并预加载已有评论列表，输入框在底部 | P1 |

---

## 3. 段评列表展示测试

> 目标：浮层内正确展示该段所有评论，支持排序、分页、计数徽章。

### 3.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| PL-001 | 列表按时间倒序 | p2 有 3 条评论（时间递增） | 点击 p2 打开浮层 | 列表最新在最上（倒序），或按配置正序，顺序稳定可预期 | P1 |
| PL-002 | 计数徽章显示 | p1 有 2 条评论 | 检查 p1 右侧 | 徽章显示「2」；无评论段落无徽章 | P0 |
| PL-003 | 徽章实时更新 | p1 当前 2 条 | 新增 1 条 | 徽章变为「3」，无需手动刷新 | P0 |
| PL-004 | 空列表提示 | p0 无评论 | 点击 p0 | 浮层显示「暂无段评，快来抢沙发」空状态 | P2 |
| PL-005 | 评论卡片字段 | p1 有评论 | 打开浮层 | 每条卡片含：作者、类型印章、内容、时间、点赞数、回复数 | P1 |
| PL-006 | 长内容截断 | 一条评论 500 字 | 打开浮层 | 默认显示前 N 字 +「展开」；点展开显示全文 | P2 |
| PL-007 | 大量评论分页 | p1 有 120 条评论 | 打开浮层 | 首屏渲染 20 条，滚动到底加载下一页（虚拟列表/懒加载） | P1 |
| PL-008 | 多标签页同步 | 标签页 A、B 同看 p1 | A 新增评论 | B 通过 `storage` 事件刷新徽章与列表 | P1 |
| PL-009 | 已解决评论样式 | 一条评论 status=resolved | 打开浮层 | 该卡片降饱和、折叠，可点「展开」 | P2 |
| PL-010 | 孤儿评论处理 | 评论的 pid 在当前 DOM 不存在 | 打开浮层 | 不崩溃；该评论归入「章评汇总」或标记「段落已删除」 | P1 |

---

## 4. 点赞 / 回复测试

### 4.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| LK-001 | 点赞计数 | 一条评论 | 点赞按钮 | `likes` +1，按钮变已赞态；再次点击取消，`likes` -1 | P0 |
| LK-002 | 防重复点赞 | 已点赞 | 再次点赞 | 不允许同 author 重复点赞（`likedBy` 去重） | P0 |
| LK-003 | 点赞即时落盘 | 已点赞 | 读取 localStorage | `likedBy` 含当前 author，`likes` 数与数组长度一致 | P0 |
| LK-004 | 点赞同步 GitHub | 已配 Token | 点赞 | 触发 GitHub API 更新（增量 patch 或全量覆盖） | P1 |
| RP-001 | 回复发表 | 一条评论 | 1. 点回复<br>2. 输入<br>3. 提交 | `replies[]` 新增一条，含 `id/content/author/createdAt` | P0 |
| RP-002 | 回复空内容拦截 | 回复框打开 | 空内容提交 | 不提交，聚焦提示 | P0 |
| RP-003 | 多级回复深度 | 已有 1 级回复 | 回复该回复 | 最多 2 级（产品决策），超出折叠为「查看更多回复」 | P2 |
| RP-004 | 回复计数同步 | 评论有 2 回复 | 检查卡片 | 显示「2 回复」；徽章计数是否含回复（产品决策：段评徽章只计主评论，不含回复） | P1 |
| RP-005 | 回复列表展开 | 评论有回复 | 点击「展开回复」 | 回复列表平滑展开，含作者、内容、时间 | P1 |
| RP-006 | 回复点赞 | 一条回复 | 点赞回复 | 回复支持独立点赞，不影响主评论 | P2 |
| RP-007 | 回复删除 | 评论有 2 条回复 | 删除其中一条回复 | `replies[]` 移除该条，计数 -1，UI 即时更新；主评论保留 | P1 |

---

## 5. 存储同步测试（localStorage / GitHub API / 离线队列 / 冲突合并）

> 这是双通道系统的核心难点，测试密度最高。

### 5.1 localStorage 读写

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| ST-001 | 写入读取 | 空存储 | 写入 1 条评论 → 读取 | 数据一致，字段完整 | P0 |
| ST-002 | 按 notePath 分片 | 两篇笔记各写评论 | 读取各篇 | key 为 `pc:<notePath>`，互不污染 | P0 |
| ST-003 | 配额超限 | localStorage 接近满 | 写入触发 QuotaExceededError | 捕获异常，toast 提示「存储已满，请导出后清理」，不崩溃 | P0 |
| ST-004 | 不可用降级 | 无痕模式 / 禁用 localStorage | attach | 降级为「只读不存」模式，提示用户；不抛未捕获异常 | P1 |
| ST-005 | 索引维护 | 多篇有评论 | 读取 `pc:index` | 索引含每篇 notePath 的 count/threadCount/lastUpdatedAt | P1 |
| ST-006 | 删除单篇 | 某篇有评论 | clearNote | 该篇 key 移除，索引同步更新 | P1 |

### 5.2 GitHub Contents API 读写

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| GH-001 | Token 配置校验 | 未配 Token | 触发同步 | 检测到无 Token，跳过 GitHub 同步，仅 localStorage；不报错 | P0 |
| GH-002 | 首次拉取 | 远端 `comments/<notePath>.json` 存在 | 加载笔记 | GET Contents API，base64 解码，合并到本地 | P1 |
| GH-003 | 首次推送 | 远端无该文件 | 提交评论 | PUT Contents API，message 含 notePath 与时间；返回 commit sha | P1 |
| GH-004 | 更新推送 | 远端文件已存在 | 提交新评论 | PUT 携带上次 `sha`，更新成功；未带 sha 时返回 409 | P1 |
| GH-005 | 409 冲突检测 | 远端已被他处更新 | PUT | 捕获 409，触发冲突合并流程（见 CM-001） | P0 |
| GH-006 | 速率限制 | GitHub API 返回 403 + X-RateLimit | 连续操作 | 读取 `X-RateLimit-Remaining`，耗尽时退避到 `X-RateLimit-Reset`，期间只走 localStorage | P1 |
| GH-007 | 网络错误重试 | fetch 抛 TypeError | 同步 | 自动重试 3 次（指数退避 1s/2s/4s），仍失败入离线队列 | P1 |
| GH-008 | 仓库路径正确 | 配置 repo + branch | 推送 | path 为 `comments/<notePath>.json`，branch 默认 `main` 可配 | P1 |
| GH-009 | base64 编解码 | 含中文评论 | 推送后拉取 | `TextEncoder`/`btoa(unescape(encodeURIComponent(...)))` 正确处理 UTF-8，无乱码 | P0 |
| GH-010 | Token 不泄露 | 任意请求 | 检查 Authorization header | Token 仅在 header，不写入 localStorage 明文，不打印到 console | P0 |

### 5.3 离线队列

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| OQ-001 | 离线入队 | navigator.onLine === false | 提交评论 | localStorage 写入 + 入队 `pc:queue`；UI 显示「已暂存，联网后同步」 | P0 |
| OQ-002 | 联网自动重放 | 队列有 3 条 | 触发 `online` 事件 | 按顺序重放，成功则出队，失败留队并标记重试次数 | P0 |
| OQ-003 | 重试上限 | 某条重放失败 | 重试 5 次仍失败 | 标记 `dead`，不再自动重放，提示用户手动处理 | P1 |
| OQ-004 | 队列持久化 | 队列有数据 | 关闭重开浏览器 | 队列仍在 localStorage，联网后继续重放 | P1 |
| OQ-005 | 队列顺序保证 | 队列有 A、B（同段） | 重放 | A 先于 B（FIFO），避免乱序导致 pid 计数错乱 | P1 |
| OQ-006 | 手动触发同步 | 队列有数据 | 点「立即同步」按钮 | 立即重放队列，显示进度 | P2 |

### 5.4 冲突合并

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| CM-001 | 拉取合并基础 | 本地 2 条，远端 3 条（1 条新增） | 触发同步 | 按 `id` 合并：新增的 1 条追加，本地 2 条保留；结果 4 条（去重） | P0 |
| CM-002 | 同 id 内容冲突 | 本地与远端同 id 但 content 不同 | 合并 | 按 `updatedAt` 较新者胜出（LWW）；记录冲突日志供用户回看 | P0 |
| CM-003 | 点赞数合并 | 本地 likes=3，远端 likes=5，likedBy 不同 | 合并 | `likedBy` 取并集，`likes = likedBy.length`（点赞用并集策略，不丢赞） | P0 |
| CM-004 | 回复合并 | 本地 1 回复，远端 2 回复（不同 id） | 合并 | 回复按 `id` 并集，去重后 3 条 | P1 |
| CM-005 | 删除传播 | 远端某评论 deleted=true，本地未删 | 合并 | 本地同步标记 deleted，徽章 -1 | P1 |
| CM-006 | 双向同步 | 合并后本地有新数据 | 推送 | PUT 合并结果到远端，远端 sha 更新 | P1 |
| CM-007 | 合并幂等 | 同一远端状态合并两次 | 重复合并 | 第二次结果与第一次一致，不产生重复 | P1 |
| CM-008 | 合并失败回滚 | 合并过程异常 | 捕获 | 本地数据不损坏，保留合并前快照，提示用户 | P0 |

---

## 6. 段落定位稳定性测试（原文更新后）

> 目标：原文小幅修订后，已存段评仍能正确关联到对应段落。

### 6.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| AN-001 | pid 索引稳定 | p3 有评论 | 原文 p2 改字（不增删段） | 重新标记后 p3 仍为 p3，评论正确关联 | P0 |
| AN-002 | 段前插入段 | p3 有评论 | 在 p2 前插入新段 | 纯索引策略下 p3 会变 p4，评论错位 → 需**段落指纹**兜底（见 AN-005） | P0 |
| AN-003 | 段后插入段 | p3 有评论 | 在 p3 后插入新段 | p3 仍是 p3，评论不受影响 | P1 |
| AN-004 | 删除段 | p3 有评论，p2 被删 | 重新加载 | p3 变 p2；评论通过指纹找回，或标记「段落已删除」归入章评 | P1 |
| AN-005 | 段落指纹兜底 | 评论存了段首 32 字指纹 | 段前插入致 index 漂移 | 用段首指纹（归一化后前 N 字）匹配找回，评论不丢 | P0 |
| AN-006 | 大幅改写 | 段落内容完全重写 | 重新加载 | 指纹失配，评论标记 orphan，归入章评汇总，不高亮 | P1 |
| AN-007 | 标点修订 | p3 仅改标点 | 重新加载 | 归一化后指纹一致（标点保留不归一化），评论找回 | P1 |
| AN-008 | 空白归一化 | p3 多了换行/空格 | 重新加载 | 指纹归一化压缩空白后一致，评论找回 | P1 |
| AN-009 | 版本检测 | 评论存了原文 version hash | 原文改了 | version 不匹配 → 触发指纹重定位，而非直接信任 index | P1 |
| AN-010 | 批量重定位性能 | 100 条评论，原文小改 | 重新加载 | 全部重定位 < 500ms，复用一次 `buildNormalizedText` 缓存 | P2 |

---

## 7. 手机端交互测试

> 目标：手机端优先，触摸交互流畅，浮层不被键盘遮挡。

### 7.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| MB-001 | 触摸点击段落 | 移动端视口 < 768px | 点击 `<p>` | 浮层以**底部抽屉**形式弹出，非桌面侧边浮层 | P0 |
| MB-002 | 无 300ms 延迟 | 移动端 | 点击段落 | 响应 < 100ms（viewport meta 含 `width=device-width`，或用 `touch-action`） | P0 |
| MB-003 | 双击不缩放 | 移动端 | 双击段落 | 不触发浏览器缩放（`touch-action: manipulation`） | P1 |
| MB-004 | 软键盘不遮挡 | 浮层打开 | 聚焦输入框 | 浮层上移至键盘上方（`visualViewport` 监听或 `scrollIntoView`） | P0 |
| MB-005 | 输入框聚焦滚动 | 浮层打开 | 聚焦输入框 | 输入框在可视区，页面不跳动错位 | P0 |
| MB-006 | 抽屉下滑关闭 | 抽屉打开 | 下滑抽屉 | 抽屉跟随手指下滑，松手超阈值则关闭 | P2 |
| MB-007 | 横竖屏切换 | 抽屉打开 | 旋转屏幕 | 抽屉重新定位，不丢失输入内容 | P1 |
| MB-008 | 长按不选中文本 | 移动端 | 长按段落 | 不触发系统文本选择弹窗（`-webkit-user-select: none` 于非输入区） | P2 |
| MB-009 | 触摸滚动流畅 | 列表 100 条 | 滑动列表 | 60fps，无卡顿（虚拟列表 + passive 监听） | P1 |
| MB-010 | 安全区适配 | iPhone X+ | 检查底部 | 抽屉底部避开 home indicator（`env(safe-area-inset-bottom)`） | P2 |
| MB-011 | 平板布局 | 768–1024px | 检查浮层 | 浮层为侧边浮层但宽度收窄 | P2 |
| MB-012 | 桌面布局 | > 1024px | 检查浮层 | 右侧侧边浮层，段落徽章悬停可见 | P1 |

---

## 8. XSS 防护测试

> 目标：所有用户输入不执行 HTML/JS，纯文本渲染。

### 8.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| XS-001 | 脚本注入 | 输入 `<script>alert(1)</script>` | 提交并渲染 | 原样显示文本，不执行脚本（用 `textContent` 而非 `innerHTML`） | P0 |
| XS-002 | 事件属性注入 | 输入 `<img src=x onerror=alert(1)>` | 渲染 | 原样显示，不触发 onerror | P0 |
| XS-003 | HTML 实体注入 | 输入 `<b>粗体</b>` | 渲染 | 显示字面量 `<b>粗体</b>`，不渲染为粗体 | P0 |
| XS-004 | data-pid 注入 | 构造恶意 pid | 渲染徽章 | `data-pid` 经校验（仅 `p\d+`），非法值拒绝 | P0 |
| XS-005 | URL 注入 | 评论含 `javascript:alert(1)` | 若有链接化 | 不生成可点击 `javascript:` 链接 | P1 |
| XS-006 | 导入 JSON 注入 | 导入含恶意字段的 JSON | 导入 | 逐字段校验类型，非法字段丢弃，content 强制 `textContent` 渲染 | P0 |
| XS-007 | innerHTML 禁用 | 全代码扫描 | grep `innerHTML` | 评论渲染路径无 `innerHTML` 拼接用户输入（marked 输出除外，且经 sanitize） | P0 |
| XS-008 | escapeHtml 覆盖 | 含 `& < > "` | 渲染 | 正确转义为 `&amp; &lt; &gt; &quot;` | P1 |
| XS-009 | CSS.escape 用法 | commentId 含特殊字符 | querySelector | 用 `CSS.escape(commentId)` 拼选择器，不报错 | P1 |
| XS-010 | marked 输出隔离 | marked 渲染含 `<script>` | sanitize | 复用 app.js 的 sanitizeHtml，移除 `on*` 与 `<script>` | P1 |

---

## 9. 边界测试（空 / 超长 / 特殊字符 / 性能）

### 9.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| BD-001 | 空评论 | 输入空 | 提交 | 拦截，提示 | P0 |
| BD-002 | 仅空白评论 | 输入空格/换行 | 提交 | trim 后为空，拦截 | P0 |
| BD-003 | 超长评论 | 输入 10000 字 | 提交 | 截断到上限（如 2000 字）或提示超长；不崩溃 localStorage | P1 |
| BD-004 | 字符上限提示 | 输入接近上限 | 输入 | 实时显示剩余字数 | P2 |
| BD-005 | 特殊字符 | 含 emoji、生僻字、全角 | 提交渲染 | 正确存储与显示，计数按码点（`Array.from` 或 `[...str]`） | P1 |
| BD-006 | 换行保留 | 含 `\n` | 渲染 | 保留换行（`white-space: pre-wrap` 或转 `<br>`，禁用 `innerHTML`） | P1 |
| BD-007 | 单段大量评论 | p1 有 500 条 | 打开浮层 | 虚拟列表，首屏 < 100ms，滚动不卡 | P1 |
| BD-008 | 全站大量评论 | 50 篇 × 100 条 | 加载索引 | 索引读取 < 50ms；徽章渲染按需（IntersectionObserver 懒渲染） | P2 |
| BD-009 | 并发提交 | 快速连点提交 10 次 | 提交 | 防抖/节流，只生效 1 条或按队列顺序，不产生重复 id | P0 |
| BD-010 | 时钟回拨 | 系统时间被改早 | 提交 | `createdAt` 仍单调（用 `Date.now()`，接受可能非单调，但 id 含 seq 保证唯一） | P2 |
| BD-011 | notePath 含特殊字符 | 路径含中文/空格 | 存储 | key 正确，无编码问题 | P1 |
| BD-012 | 重复 id 防护 | 构造同 id 导入 | 导入 | 按 id 去重，不产生重复 | P0 |

---

## 10. 魔搭部署兼容测试

> 目标：在阿里魔搭空间 static 部署环境下功能正常。

### 10.1 测试用例表

| ID | 用例名 | 前置条件 | 步骤 | 预期结果 | 优先级 |
|---|---|---|---|---|---|
| MS-001 | 静态资源路径 | 魔搭部署后 | 访问站点 | js/css 路径正确加载（相对路径，非绝对 `/js/`） | P0 |
| MS-002 | 相对路径兼容 | 魔搭二级路径部署 | 检查资源引用 | 用 `./js/` 或 `<base>`，不依赖根路径 | P0 |
| MS-003 | CORS 跨域 | GitHub API 跨域请求 | fetch GitHub | GitHub Contents API 支持 CORS（`Access-Control-Allow-Origin: *`），浏览器直连可用 | P0 |
| MS-004 | Token 安全 | 魔搭公开访问 | 检查 Token | Token 不硬编码进 JS；由用户在设置面板输入存 localStorage（仅作者自用场景） | P0 |
| MS-005 | 缓存策略 | 魔搭 CDN 缓存 | 更新部署 | index.html 不缓存或短缓存；js/css 用 hash 或版本号 | P1 |
| MS-006 | HTTPS 强制 | 魔搭默认 HTTPS | 访问 | GitHub API 要求 HTTPS，魔搭 HTTPS 环境无 mixed-content | P0 |
| MS-007 | 离线可用 | 魔搭断网 | 操作 | localStorage 仍可用，离线队列暂存 | P1 |
| MS-008 | 构建产物校验 | CI 部署 | build_site.py | `site/data/index.json` 可解析，notes 非空（CI 已校验） | P1 |
| MS-009 | marked CDN 可达 | 魔搭网络 | 加载 marked | CDN 可访问；可选本地化 marked.js 避免依赖外网 | P1 |
| MS-010 | GitHub Pages 一致 | 同代码部署 Pages | 验证 | 两端行为一致，无环境差异 | P1 |

---

# 第二部分：手机端兼容方案

## 1. 触摸交互设计

### 1.1 touch vs mouse 事件统一

**问题**：桌面用 `mouseup`，移动端 `mouseup` 延迟且不可靠。

**方案**：用 **Pointer Events** 统一，或双绑 `mouseup` + `touchend`（参考现有 comments.js 已采用双绑）。

```js
container.addEventListener('mouseup', handleParagraphClick);
container.addEventListener('touchend', handleParagraphClick);
// 注意：touchend 后会延迟触发 mouseup，需用 e.preventDefault() 防重复
```

**推荐**：优先 Pointer Events（`pointerup`），覆盖鼠标/触摸/笔，现代浏览器支持良好：

```js
container.addEventListener('pointerup', handleParagraphClick);
```

### 1.2 消除 300ms 点击延迟

- `<meta name="viewport" content="width=device-width, initial-scale=1.0">`（现有 index.html 已有）。
- 现代浏览器在含该 meta 时已无 300ms 延迟。
- 额外保险：CSS `touch-action: manipulation`（禁用双击缩放，消除残留延迟）。

```css
.markdown-body p[data-pid] {
  touch-action: manipulation;
}
```

### 1.3 双击缩放控制

- 段落区域 `touch-action: manipulation` 允许 pan 但禁用 double-tap zoom。
- 浮层/抽屉区域 `touch-action: none`（自定义手势时），避免滑动抽屉触发页面缩放。

### 1.4 长按防选中

```css
.markdown-body p[data-pid] {
  -webkit-user-select: none;
  user-select: none;
}
.cmt-drawer-input textarea,
.cmt-reply-input textarea {
  -webkit-user-select: text;  /* 输入区恢复可选 */
  user-select: text;
}
```

---

## 2. 响应式断点

### 2.1 断点定义

| 断点 | 范围 | 浮层形态 | 布局 |
|---|---|---|---|
| 手机 | < 768px | 底部抽屉（全宽，高度 70vh） | 单列，批注栏在文末 |
| 平板 | 768–1024px | 侧边浮层（宽度 380px） | 双列，批注栏右侧 |
| 桌面 | > 1024px | 侧边浮层（宽度 420px） | 三列（目录/正文/批注栏） |

### 2.2 CSS 媒体查询

```css
/* 默认（手机优先）：底部抽屉 */
.cmt-overlay {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 70vh;
  border-radius: 12px 12px 0 0;
  transform: translateY(100%);
  transition: transform 0.25s ease;
}
.cmt-overlay.open { transform: translateY(0); }

/* 平板及以上：侧边浮层 */
@media (min-width: 768px) {
  .cmt-overlay {
    top: 80px;
    bottom: auto;
    right: 16px;
    left: auto;
    width: 380px;
    max-height: calc(100vh - 100px);
    border-radius: var(--radius);
    transform: translateX(120%);
  }
  .cmt-overlay.open { transform: translateX(0); }
}

/* 桌面：更宽 */
@media (min-width: 1024px) {
  .cmt-overlay { width: 420px; }
}
```

### 2.3 断点切换时状态保持

- 监听 `resize`（防抖 200ms），切换浮层形态时保留当前打开状态与输入内容。
- 不在 resize 时强制关闭浮层，避免用户旋转屏幕丢失输入。

---

## 3. 浮层定位策略

### 3.1 手机端：底部抽屉

**优势**：
- 不遮挡正文，符合移动端拇指操作区。
- 软键盘弹出时抽屉自然上移。
- 类似番茄/起点段评的熟悉交互。

**结构**：

```html
<div class="cmt-overlay" role="dialog" aria-modal="true">
  <div class="cmt-drawer-handle" aria-label="下滑关闭"></div>
  <header class="cmt-drawer-header">
    <span class="cmt-drawer-title">段评 · p3</span>
    <button class="cmt-drawer-close">×</button>
  </header>
  <div class="cmt-drawer-body">
    <ul class="cmt-comment-list"><!-- 虚拟列表 --></ul>
  </div>
  <footer class="cmt-drawer-input">
    <textarea placeholder="写下段评…"></textarea>
    <button>发送</button>
  </footer>
</div>
```

**下滑关闭手势**：监听 `touchstart/touchmove/touchend`，handle 区域跟随手指，松手位移 > 80px 则关闭。

### 3.2 桌面端：侧边浮层

**定位**：固定在右侧，`position: fixed`，不随正文滚动。

**定位算法**（避免遮挡点击的段落）：

```js
function positionOverlay(overlay, paragraph) {
  const rect = paragraph.getBoundingClientRect();
  // 桌面：浮层在右侧固定，不跟随段落
  // 仅在首次打开时滚动段落到可视区
  paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
```

### 3.3 浮层 z-index 层级

| 层 | z-index | 元素 |
|---|---|---|
| 正文高亮 | 1 | `mark.cmt-highlight` |
| 徽章 | 10 | `.cmt-badge` |
| 抽屉/浮层 | 1000 | `.cmt-overlay` |
| 遮罩 | 999 | `.cmt-backdrop` |
| Toast | 2000 | `.cmt-toast` |

---

## 4. 性能优化

### 4.1 虚拟列表（大量评论）

**触发**：单段评论 > 20 条时启用。

**方案**：简易虚拟滚动，只渲染可视区 ± buffer 条。

```js
// 核心思路
const ITEM_HEIGHT = 72;       // 估算每条高度
const BUFFER = 5;             // 上下缓冲
function renderVisible(scrollTop, viewportHeight, comments) {
  const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
  const end = Math.min(comments.length, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + BUFFER);
  // 只渲染 comments.slice(start, end)，用 padding 撑开总高度
  spacer.style.height = (start * ITEM_HEIGHT) + 'px';
  bottomSpacer.style.height = ((comments.length - end) * ITEM_HEIGHT) + 'px';
}
```

**监听**：`scroll` 事件加 `{ passive: true }` + `requestAnimationFrame` 节流。

### 4.2 懒加载徽章

**问题**：长文 100 段，每段查评论数会 N 次 localStorage 读取。

**方案**：一次性读取该笔记所有评论，建 `Map<pid, count>`，徽章用 `IntersectionObserver` 懒渲染（段落进入视口才设徽章 DOM）。

```js
const pidCountMap = new Map();
comments.forEach(c => pidCountMap.set(c.pid, (pidCountMap.get(c.pid) || 0) + 1));

const badgeObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const pid = entry.target.dataset.pid;
      const count = pidCountMap.get(pid) || 0;
      if (count > 0) renderBadge(entry.target, count);
      badgeObserver.unobserve(entry.target);
    }
  });
});
document.querySelectorAll('p[data-pid]').forEach(p => badgeObserver.observe(p));
```

### 4.3 防抖节流

| 场景 | 策略 | 时延 |
|---|---|---|
| 输入字数统计 | 防抖 | 200ms |
| scroll 虚拟列表 | rAF 节流 | 一帧 |
| resize 断点切换 | 防抖 | 200ms |
| GitHub 同步触发 | 防抖 | 1000ms（合并连续提交） |
| 徽章计数更新 | 微任务批处理 | 同 tick 合并 |

### 4.4 DOM 操作批处理

- 批量渲染评论列表用 `DocumentFragment` 一次性插入。
- 徽章批量更新用 `requestAnimationFrame` 合并到一帧。
- 避免在循环中逐条 `appendChild` 触发重排。

```js
const frag = document.createDocumentFragment();
comments.forEach(c => frag.appendChild(renderCard(c)));
listEl.appendChild(frag);  // 一次重排
```

### 4.5 缓存规范化文本

- `buildNormalizedText` 一次构建，所有段落指纹/重定位复用（参考现有 comments.js 的 `normTextCache`）。
- 切换笔记时清缓存。

---

## 5. 输入体验

### 5.1 软键盘弹出时浮层不被遮挡

**核心 API**：`window.visualViewport`（比 `resize` 更准）。

```js
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const overlay = document.querySelector('.cmt-overlay');
    if (!overlay || overlay.classList.contains('open') === false) return;
    const keyboardHeight = window.innerHeight - window.visualViewport.height;
    // 手机端抽屉：上移避开键盘
    if (window.innerWidth < 768) {
      overlay.style.transform = `translateY(-${keyboardHeight}px)`;
      overlay.style.maxHeight = `${window.visualViewport.height * 0.7}px`;
    }
  });
}
```

**兜底**：聚焦输入框时 `scrollIntoView({ block: 'center' })`。

### 5.2 输入框聚焦滚动

```js
inputEl.addEventListener('focus', () => {
  // 延迟等键盘弹起后再滚动
  setTimeout(() => inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
});
```

### 5.3 输入区可滚动

- 抽屉 body 区 `overflow-y: auto`，`-webkit-overflow-scrolling: touch`（iOS 惯性滚动）。
- 输入框 `position: sticky; bottom: 0`，始终可见。

### 5.4 键盘快捷键（桌面）

- `Ctrl/Cmd + Enter` 提交。
- `Esc` 关闭浮层。
- `Tab` 焦点陷阱（不跳出浮层）。

---

## 6. 离线 / 弱网处理

### 6.1 在线状态检测

```js
function isOnline() {
  return navigator.onLine;
}
window.addEventListener('online', replayQueue);
window.addEventListener('offline', () => {
  showToast('已离线，评论将暂存，联网后自动同步');
});
```

### 6.2 离线队列数据结构

```js
// localStorage key: pc:queue
[
  {
    id: 'op_<timestamp>_<seq>',
    type: 'add' | 'like' | 'reply' | 'delete',
    notePath: '...',
    pid: 'p3',
    commentId: '...',
    payload: { /* Comment 或部分字段 */ },
    createdAt: 'ISO',
    retries: 0,
    status: 'pending' | 'dead'
  }
]
```

### 6.3 弱网感知

- 用 `navigator.connection.effectiveType`（如支持）判断 2g/3g 降级。
- 弱网下：提交即时反馈「已暂存」，GitHub 同步延后且不阻塞 UI。

### 6.4 同步状态可视化

- 浮层顶部显示同步状态徽标：`已同步` / `同步中` / `待同步(N)` / `同步失败`。
- 点击徽标查看队列详情与手动重试。

### 6.5 冲突提示

- 合并冲突时 toast 提示「检测到远端更新，已自动合并，点击查看」。
- 冲突日志存 `pc:conflict-log`，供用户回看。

---

## 7. 魔搭空间 static 部署的特殊考量

### 7.1 CORS（跨域）

**GitHub Contents API 跨域**：
- `api.github.com` 返回 `Access-Control-Allow-Origin: *`，浏览器直连可用。
- 魔搭页面（`modelscope.cn`）调 GitHub API 属跨域，但 GitHub 支持 CORS，无需代理。

**注意**：PUT 请求会触发 `OPTIONS` 预检（因为带 `Authorization` header），GitHub 会正确响应预检。

### 7.2 资源路径

**问题**：魔搭可能部署在二级路径（如 `/studios/<user>/<repo>/`），绝对路径 `/js/app.js` 会 404。

**方案**：
- 用相对路径 `./js/app.js`、`./css/style.css`。
- 或构建时注入 `<base href="/">`（需确保根路径部署）。
- 现有 `build_site.py` 应输出相对路径（检查确认）。

### 7.3 缓存

**index.html**：不缓存或短缓存（1 分钟），确保更新及时生效。
```http
# 魔搭空间通常无法自定义 header，靠文件名 hash
```

**js/css**：用内容 hash 命名（`app.<hash>.js`）或版本号查询参数（`app.js?v=20260623`）。
- 现有项目未做 hash，建议至少加版本号查询参数。

**marked.js CDN**：长期缓存（CDN 自带 immutable），但魔搭若网络受限，考虑本地化：

```html
<!-- 备选：本地化 marked 避免 CDN 不可达 -->
<script src="./vendor/marked.min.js" defer></script>
```

### 7.4 Token 安全（公开部署）

**约束**：魔搭空间公开访问，Token 不能硬编码进 JS（会被任何人查看）。

**方案**（仅作者自用场景）：
- 作者在浏览器设置面板手动输入 GitHub PAT，存 localStorage（仅本机）。
- Token 仅存内存/localStorage，不写入代码、不打印日志。
- PAT 权限最小化：仅 `repo:contents` 写权限，限定到评论数据仓库或目录。

**进阶**（多用户场景，超出本系统范围）：
- 用 GitHub Actions 作为中转：前端提交到 Actions 触发器，Actions 代写仓库。本系统不做。

### 7.5 HTTPS

- 魔搭默认 HTTPS，GitHub API 要求 HTTPS，无 mixed-content 问题。
- 确保 `fetch` 用 `https://api.github.com/...`，不混用 `http://`。

### 7.6 部署一致性

- 同一份 `site/` 产物同时部署魔搭与 GitHub Pages（现有 CI 已如此）。
- 测试需在两端各验证一次（MS-010）。

---

# 第三部分：自动化测试方案

## 1. 测试框架选型（纯 vanilla JS 无框架）

### 1.1 推荐方案：浏览器原生 + 轻量 test runner

**不引入** Jest/Vitest（与 vanilla JS 项目风格不符，增加构建复杂度）。

**推荐**：用 **QUnit** 或自研极简 runner，在浏览器中直接跑。

| 方案 | 优点 | 缺点 | 推荐度 |
|---|---|---|---|
| QUnit（CDN） | 零构建，浏览器原生，jQuery 生态成熟 | 略老 | ★★★★ |
| 自研 runner（~50 行） | 完全可控，无依赖 | 需自己写断言 | ★★★ |
| Playwright | 真实浏览器，E2E 强 | 重，需 Node | ★★★（E2E 层） |
| jsdom + Node | 快 | DOM 模拟不完整，Range/Selection 支持差 | ★★ |

**最终建议**：
- **单元测试**：QUnit（浏览器跑，覆盖纯函数：锚定、合并、escapeHtml、队列）。
- **E2E 测试**：Playwright（覆盖 UI 交互：点击段落、浮层、提交、同步）。

### 1.2 测试目录结构

```
tests/
├── paragraph-comments/
│   ├── index.html                 # QUnit 测试运行页（浏览器打开即跑）
│   ├── unit/
│   │   ├── paragraph-mark.test.js    # 段落标记（PM-*）
│   │   ├── anchor.test.js            # 段落定位稳定性（AN-*）
│   │   ├── storage.test.js           # localStorage 读写（ST-*）
│   │   ├── github-sync.test.js       # GitHub API 同步（GH-*，Mock）
│   │   ├── offline-queue.test.js     # 离线队列（OQ-*）
│   │   ├── conflict-merge.test.js    # 冲突合并（CM-*）
│   │   ├── xss.test.js               # XSS 防护（XS-*）
│   │   └── boundary.test.js          # 边界（BD-*）
│   ├── e2e/
│   │   ├── comment-flow.spec.js      # 段评发表全链路（PC-*、PL-*）
│   │   ├── like-reply.spec.js        # 点赞回复（LK-*、RP-*）
│   │   └── mobile.spec.js            # 手机端交互（MB-*，Playwright 设备模拟）
│   ├── fixtures/
│   │   ├── note-sample.html          # 测试用笔记 HTML 片段
│   │   ├── comments-remote.json      # Mock 远端评论数据
│   │   └── conflict-scenarios.json   # 冲突场景数据
│   └── helpers/
│       ├── mock-github.js            # Mock GitHub Contents API
│       ├── mock-storage.js           # 内存 localStorage（jsdom 兜底）
│       └── setup-dom.js              # 构造测试 DOM
└── run-browser.sh                    # 启动本地 server 跑 QUnit
```

### 1.3 QUnit 测试运行页示例

```html
<!-- tests/paragraph-comments/index.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>段落评论系统 · 单元测试</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/qunit@2.20.0/qunit/qunit.css">
</head>
<body>
  <div id="qunit"></div>
  <div id="qunit-fixture"></div>
  <!-- 被测模块 -->
  <script src="../../site/versions/B-classic/js/paragraph-comments.js"></script>
  <!-- helpers -->
  <script src="./helpers/mock-storage.js"></script>
  <script src="./helpers/mock-github.js"></script>
  <script src="./helpers/setup-dom.js"></script>
  <!-- 测试用例 -->
  <script src="./unit/paragraph-mark.test.js"></script>
  <script src="./unit/anchor.test.js"></script>
  <script src="./unit/storage.test.js"></script>
  <script src="./unit/github-sync.test.js"></script>
  <script src="./unit/offline-queue.test.js"></script>
  <script src="./unit/conflict-merge.test.js"></script>
  <script src="./unit/xss.test.js"></script>
  <script src="./unit/boundary.test.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/qunit@2.20.0/qunit/qunit.js"></script>
</body>
</html>
```

---

## 2. 测试文件结构建议

### 2.1 `tests/paragraph-comments/unit/storage.test.js`（示例骨架）

```js
/* 段评存储层单元测试，对应 ST-* 用例 */
QUnit.module('Storage', function (hooks) {
  hooks.beforeEach(function () {
    // 用内存 localStorage 隔离每条用例
    mockStorage.clear();
    setupArticle('<p>甲</p><p>乙</p>');
    ParagraphComments.attach(document.querySelector('.markdown-body'), 'note/test.md');
  });

  QUnit.test('ST-001 写入读取一致', function (assert) {
    const comment = makeComment({ pid: 'p0', content: '测试' });
    ParagraphComments.Storage.saveComments('note/test.md', [comment]);
    const loaded = ParagraphComments.Storage.loadComments('note/test.md');
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].content, '测试');
    assert.equal(loaded[0].pid, 'p0');
  });

  QUnit.test('ST-003 配额超限捕获', function (assert) {
    mockStorage.setQuotaExceeded();
    const ok = ParagraphComments.Storage.saveComments('note/test.md', [makeComment()]);
    assert.notOk(ok, '应返回 false 且不抛异常');
  });
});
```

### 2.2 `tests/paragraph-comments/unit/conflict-merge.test.js`（示例骨架）

```js
/* 冲突合并单元测试，对应 CM-* 用例 */
QUnit.module('ConflictMerge', function (hooks) {
  hooks.beforeEach(function () {
    mockStorage.clear();
  });

  QUnit.test('CM-001 按 id 合并新增', function (assert) {
    const local = [
      { id: 'c1', content: '本地1', updatedAt: '2026-06-22T09:00:00Z', likes: 0, likedBy: [] },
      { id: 'c2', content: '本地2', updatedAt: '2026-06-22T09:00:00Z', likes: 0, likedBy: [] }
    ];
    const remote = [
      { id: 'c2', content: '本地2', updatedAt: '2026-06-22T09:00:00Z', likes: 0, likedBy: [] },
      { id: 'c3', content: '远端新增', updatedAt: '2026-06-22T10:00:00Z', likes: 0, likedBy: [] }
    ];
    const merged = ParagraphComments.mergeComments(local, remote);
    assert.equal(merged.length, 3, 'c1+c2+c3');
    assert.ok(merged.find(c => c.id === 'c3'), '远端新增被合并');
  });

  QUnit.test('CM-002 同 id LWW 胜出', function (assert) {
    const local = [{ id: 'c1', content: '旧', updatedAt: '2026-06-22T09:00:00Z', likes: 0, likedBy: [] }];
    const remote = [{ id: 'c1', content: '新', updatedAt: '2026-06-22T10:00:00Z', likes: 0, likedBy: [] }];
    const merged = ParagraphComments.mergeComments(local, remote);
    assert.equal(merged[0].content, '新', '较新者胜');
  });

  QUnit.test('CM-003 点赞并集', function (assert) {
    const local = [{ id: 'c1', content: 'x', updatedAt: 't1', likes: 3, likedBy: ['a','b','c'] }];
    const remote = [{ id: 'c1', content: 'x', updatedAt: 't1', likes: 5, likedBy: ['a','d','e','f','g'] }];
    const merged = ParagraphComments.mergeComments(local, remote);
    assert.equal(merged[0].likedBy.length, 7, 'a-g 并集');
    assert.equal(merged[0].likes, 7, 'likes 重算');
  });
});
```

---

## 3. Mock GitHub API 方案

### 3.1 Mock 策略

GitHub Contents API 是网络依赖，单元测试必须 Mock。三种 Mock 层级：

| 层级 | 方式 | 适用 |
|---|---|---|
| 函数级 | 替换 `ParagraphComments.GitHubSync.fetch` 为 stub | 单元测试（快） |
| 拦截级 | `fetch` 全局 Mock（Service Worker 或 monkey-patch） | 集成测试 |
| 录制回放 | 用真实请求录制 JSON，回放 | 回归测试 |

### 3.2 `helpers/mock-github.js`（fetch 拦截）

```js
/* Mock GitHub Contents API，拦截 fetch */
window.MockGitHub = (function () {
  let store = {};          // path -> { content, sha }
  let online = true;
  let failMode = null;     // null | 'network' | '409' | '403-rate'
  let calls = [];

  function install() {
    const realFetch = window.fetch;
    window.fetch = function (url, opts) {
      calls.push({ url, opts });
      if (!online) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      if (failMode === 'network') {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      const u = String(url);
      // GET contents
      const getMatch = u.match(/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
      if (getMatch && (!opts || opts.method === 'GET' || !opts.method)) {
        const path = getMatch[3];
        if (store[path]) {
          return Promise.resolve(mockResponse(200, {
            content: btoa(unescape(encodeURIComponent(store[path].content))),
            sha: store[path].sha,
            encoding: 'base64'
          }));
        }
        return Promise.resolve(mockResponse(404, { message: 'Not Found' }));
      }
      // PUT contents
      if (getMatch && opts && opts.method === 'PUT') {
        const path = getMatch[3];
        const body = JSON.parse(opts.body);
        if (failMode === '409' && store[path] && body.sha !== store[path].sha) {
          return Promise.resolve(mockResponse(409, { message: 'sha mismatch' }));
        }
        if (failMode === '403-rate') {
          return Promise.resolve(mockResponse(403, { message: 'rate limit' }, {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor(Date.now()/1000) + 3600)
          }));
        }
        const sha = 'sha-' + Date.now();
        store[path] = { content: decodeURIComponent(escape(atob(body.content))), sha };
        return Promise.resolve(mockResponse(200, { content: { sha }, commit: { sha: 'commit-1' } }));
      }
      return realFetch.apply(this, arguments);
    };
  }

  function mockResponse(status, body, headers = {}) {
    return {
      ok: status >= 200 && status < 300,
      status: status,
      headers: { get: (h) => headers[h] || null },
      json: () => Promise.resolve(body)
    };
  }

  return {
    install,
    setStore: (s) => { store = JSON.parse(JSON.stringify(s)); },
    setOnline: (v) => { online = v; },
    setFailMode: (m) => { failMode = m; },
    getCalls: () => calls,
    reset: () => { store = {}; calls = []; failMode = null; online = true; }
  };
})();
```

### 3.3 Mock localStorage（jsdom 兜底）

```js
/* helpers/mock-storage.js：内存 localStorage，隔离测试 */
window.mockStorage = (function () {
  let store = {};
  let quotaExceeded = false;
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      if (quotaExceeded) {
        const e = new Error('QuotaExceeded');
        e.name = 'QuotaExceededError';
        throw e;
      }
      store[k] = String(v);
    },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; quotaExceeded = false; },
    key: (i) => Object.keys(store)[i],
    get length() { return Object.keys(store).length; }
  };
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
  return {
    setQuotaExceeded: () => { quotaExceeded = true; },
    clear: () => { store = {}; quotaExceeded = false; }
  };
})();
```

### 3.4 GitHub 同步测试示例

```js
QUnit.module('GitHubSync', function (hooks) {
  hooks.beforeEach(function () {
    mockStorage.clear();
    MockGitHub.reset();
    MockGitHub.install();
  });

  QUnit.test('GH-003 首次推送 PUT', async function (assert) {
    const done = assert.async();
    ParagraphComments.Config.setToken('fake-token');
    ParagraphComments.Config.setRepo('owner/repo');
    await ParagraphComments.GitHubSync.pushComments('note/test.md', [{ id: 'c1', content: '测试' }]);
    const calls = MockGitHub.getCalls();
    assert.ok(calls.some(c => c.opts && c.opts.method === 'PUT'), '发起 PUT');
    done();
  });

  QUnit.test('GH-005 409 触发合并', async function (assert) {
    const done = assert.async();
    MockGitHub.setStore({ 'comments/note/test.md': { content: '[]', sha: 'sha-old' } });
    MockGitHub.setFailMode('409');
    ParagraphComments.Config.setToken('fake-token');
    const result = await ParagraphComments.GitHubSync.pushComments('note/test.md', [{ id: 'c1', content: '新' }]);
    assert.equal(result.conflict, true, '应检测到冲突');
    done();
  });

  QUnit.test('GH-007 网络错误重试后入队', async function (assert) {
    const done = assert.async();
    MockGitHub.setFailMode('network');
    ParagraphComments.Config.setToken('fake-token');
    await ParagraphComments.GitHubSync.pushComments('note/test.md', [{ id: 'c1', content: 'x' }]);
    const queue = ParagraphComments.OfflineQueue.peek();
    assert.ok(queue.length >= 1, '失败入队');
    done();
  });
});
```

---

## 4. E2E 测试（Playwright，可选但推荐）

### 4.1 安装与配置

```bash
npm init -y
npm i -D @playwright/test
npx playwright install chromium webkit  # webkit 模拟 iOS
```

### 4.2 `playwright.config.js`

```js
module.exports = {
  testDir: './tests/paragraph-comments/e2e',
  use: { baseURL: 'http://localhost:8000' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-ios', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true } },
    { name: 'mobile-android', use: { viewport: { width: 412, height: 915 }, isMobile: true } }
  ],
  webServer: { command: 'python -m http.server 8000', url: 'http://localhost:8000', reuseExistingServer: true }
};
```

### 4.3 E2E 示例：手机端段评全链路

```js
// tests/paragraph-comments/e2e/comment-flow.spec.js
const { test, expect } = require('@playwright/test');

test.describe('段评发表全链路', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      // 注入测试笔记
    });
    await page.goto('/site/versions/B-classic/index.html');
  });

  test('PC-001 手机端点击段落弹底部抽屉', async ({ page, isMobile }) => {
    await page.click('text=资治通鉴');
    await page.click('.markdown-body p[data-pid="p0"]');
    const overlay = page.locator('.cmt-overlay');
    await expect(overlay).toBeVisible();
    if (isMobile) {
      // 手机端：底部抽屉
      const box = await overlay.boundingBox();
      expect(box.y).toBeGreaterThan(400);  // 位于屏幕下半
    }
  });

  test('PC-002 提交段评落盘', async ({ page }) => {
    await page.click('.markdown-body p[data-pid="p0"]');
    await page.fill('.cmt-overlay textarea', '此处史实有误');
    await page.click('.cmt-overlay button:has-text("发送")');
    // 徽章 +1
    await expect(page.locator('p[data-pid="p0"] .cmt-badge')).toHaveText('1');
    // localStorage 落盘
    const stored = await page.evaluate(() => localStorage.getItem('pc:note/test.md'));
    expect(JSON.parse(stored).length).toBe(1);
  });
});
```

---

## 5. CI 集成建议

### 5.1 GitHub Actions 跑测试

```yaml
# .github/workflows/test-paragraph-comments.yml
name: Test Paragraph Comments
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run QUnit in headless browser
        run: |
          npx playwright install chromium
          npx playwright test --project=desktop
  e2e-mobile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run mobile E2E
        run: npx playwright test --project=mobile-ios
```

### 5.2 覆盖率

- QUnit 无原生覆盖率，可用 `nyc` + instrumented JS（增加复杂度，可选）。
- 关键：确保 P0 用例 100% 覆盖，P1 ≥ 95%。

---

## 6. 测试数据管理

### 6.1 测试 fixtures

- `fixtures/note-sample.html`：含 10 段、嵌套 blockquote、代码块、标题的标准笔记。
- `fixtures/comments-remote.json`：Mock 远端评论，含正常、冲突、孤儿场景。
- `fixtures/conflict-scenarios.json`：参数化冲突合并用例。

### 6.2 测试隔离

- 每个 `hooks.beforeEach` 清空 localStorage 与 Mock 状态。
- QUnit fixture div 自动清理 DOM。
- E2E 用 `addInitScript` 清 localStorage。

---

## 7. 落地顺序（TDD 推进路线）

1. **先写存储层测试**（ST-*）→ 实现 Storage → 绿。
2. **再写段落标记测试**（PM-*）→ 实现 attach + data-pid → 绿。
3. **再写锚定测试**（AN-*）→ 实现段落指纹 → 绿。
4. **再写段评发表测试**（PC-*）→ 实现浮层 + 提交 → 绿。
5. **再写列表/徽章测试**（PL-*）→ 实现渲染 → 绿。
6. **再写点赞回复测试**（LK-*/RP-*）→ 实现 → 绿。
7. **再写 GitHub 同步测试**（GH-*，Mock）→ 实现 GitHubSync → 绿。
8. **再写离线队列测试**（OQ-*）→ 实现 OfflineQueue → 绿。
9. **再写冲突合并测试**（CM-*）→ 实现 mergeComments → 绿。
10. **再写 XSS/边界测试**（XS-*/BD-*）→ 加固 → 绿。
11. **最后 E2E + 手机端测试**（MB-*）→ Playwright → 绿。
12. **魔搭部署兼容**（MS-*）→ 手动验证两端 → 绿。

每一步都可在浏览器控制台通过 `window.ParagraphComments.*` 独立验证，不依赖前序 UI。

---

## 附录：用例 ID 索引

| 类别 | 前缀 | 数量 | 优先级分布 |
|---|---|---|---|
| 段落标记 | PM | 10 | P0×4, P1×4, P2×2 |
| 段评发表 | PC | 10 | P0×4, P1×5, P2×1 |
| 段评列表 | PL | 10 | P0×2, P1×5, P2×3 |
| 点赞回复 | LK/RP | 11 | P0×5, P1×4, P2×2 |
| 存储同步 | ST/GH/OQ/CM | 30 | P0×12, P1×16, P2×2 |
| 段落定位 | AN | 10 | P0×2, P1×7, P2×1 |
| 手机端 | MB | 12 | P0×4, P1×5, P2×3 |
| XSS | XS | 10 | P0×6, P1×4 |
| 边界 | BD | 12 | P0×3, P1×6, P2×3 |
| 魔搭部署 | MS | 10 | P0×4, P1×6 |
| **合计** | | **125** | **P0×46, P1×62, P2×17** |

> 发版门槛：P0 100% 通过，P1 ≥ 95% 通过。
