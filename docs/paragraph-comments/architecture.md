# 静态网站段落评论系统 — 技术架构方案

> 目标读者：实现该系统的前端 agent。
> 约束：纯静态站点（vanilla JS + marked.js），部署在阿里魔搭空间（static 类型）和 GitHub Pages，无后端。
> 现有代码基线：`site/index.html`、`site/js/app.js`（IIFE，`loadNote` 在第 545 行注入 innerHTML，**尚未** dispatch `note:loaded`）、`site/css/style.css`、`scripts/build_site.py`（生成 `site/data/index.json` 与 `site/notes/`）、`src/agents/`（Python AI 工作流，`AgentState` 见 `src/core/state.py`）。
> 与既有系统的关系：本系统是**段落级**评论（点击段落→看评论→写评论），与 `docs/comments-system/`（选区级、纯 localStorage）并存，存储前缀 `pc:` 与选区级 `drc:` 互不冲突。

---

## 0. 总体设计原则

1. **段落级而非选区级**：评论锚定到整段 `<p>`，不绑定字符区间。手机端选区体验差，段落级点击更稳。
2. **双通道存储**：localStorage 即时可用、离线可写；GitHub Contents API 持久化到仓库 `site/data/comments/`，评论随仓库版本化，AI 可直接读取。
3. **不破坏现有 IIFE**：`app.js` 不做结构性重构，只插入 `note:loaded` 事件分发与段落标记注入两处钩子；评论系统作为独立 IIFE 通过自定义事件接入。
4. **手机端优先**：触摸交互、浮层定位、性能预算全部按移动端约束设计，桌面端是增强。
5. **PAT 最小授权**：fine-grained PAT 只授权写 `site/data/comments/` 目录，泄露后影响面可控。
6. **原文改动可重定位**：段落用 `data-pid` 编号 + 文本指纹双重锚定，原文小幅修订后评论仍能找回段落。

---

## 1. 模块划分

### 1.1 文件清单

| 文件 | 职责 |
|---|---|
| `site/js/paragraph-comments.js` | 段落评论主模块（IIFE），暴露 `window.ParagraphComments` |
| `site/css/paragraph-comments.css` | 段落评论样式（段落标记、浮层、面板、计数徽章） |
| `site/data/comments/<notePath>.json` | 仓库持久化的评论文件（运行时由前端写入，构建期不生成） |
| `docs/paragraph-comments/architecture.md` | 本文档 |

### 1.2 模块边界与解耦

`paragraph-comments.js` 是独立 IIFE，**不引用** `app.js` 内部私有变量（`state`、`elements`、`loadNote`）。仅通过两个渠道通信：

- **入站**：监听 `document` 上的自定义事件 `note:loaded`（由 `app.js` 在渲染完成后 dispatch，携带 `{ notePath, container, meta }`）。
- **出站**：通过 `window.ParagraphComments` 暴露方法，供控制台调试与未来扩展。

```
┌─────────────────────────┐      note:loaded (CustomEvent)      ┌──────────────────────────────┐
│         app.js          │ ─────────────────────────────────▶   │     paragraph-comments.js     │
│  (现有 IIFE，加 2 处钩子)│                                      │  (独立 IIFE，监听事件)        │
│                         │ ◀─────────────────────────────────  │                               │
└─────────────────────────┘   window.ParagraphComments.* (可选)   └──────────────────────────────┘
                                          │
                                          ▼
                          ┌───────────────────────────────────────┐
                          │  localStorage（pc:* 前缀）            │
                          │  GitHub Contents API（site/data/comments/）│
                          └───────────────────────────────────────┘
```

### 1.3 `window.ParagraphComments` 接口

```js
window.ParagraphComments = {
  // —— 生命周期 ——
  attach(container, notePath, meta),  // 为容器注入段落标记 + 绑定触摸/点击 + 加载评论
  detach(),                           // 卸载当前笔记的监听与 DOM
  refresh(),                          // 重新渲染当前笔记的段落标记与评论

  // —— 状态查询 ——
  getComments(notePath),              // Comment[]
  getAllComments(),                   // { [notePath]: Comment[] }
  getParagraphComments(notePath, pid),// Comment[] 该段落的评论
  getPendingCount(),                  // number 待同步队列长度

  // —— 数据操作 ——
  addComment(notePath, pid, content, opts),   // Promise<Comment>
  replyComment(notePath, commentId, content), // Promise<Comment>
  resolveComment(notePath, commentId),        // Promise<Comment>
  deleteComment(notePath, commentId),        // Promise<void>

  // —— 同步 ——
  syncNow(),                          // Promise<SyncResult> 手动触发同步
  isOnline(),                         // boolean

  // —— 导出 / 导入 ——
  exportNote(notePath),               // string (JSON)
  exportAll(),                        // string (JSON)
  exportForAgents(notePath),          // string (JSON，AI 友好格式)
  copyAsPromptContext(notePath),      // Promise<void>
  importJSON(jsonStr, mode),          // mode: 'merge' | 'replace'

  // —— 配置 ——
  configureGitHub(config),           // 设置 token/repo/branch
  getGitHubStatus(),                  // { configured, lastSyncAt, pending }
};
```

### 1.4 `app.js` 需要的最小改动（两处）

**改动 1：`loadNote` 成功分支末尾 dispatch 事件**（约第 545 行后）：

```js
// 改动前
elements.reader.innerHTML = `<article class="markdown-body">${metaHtml}${html}</article>${navHtml}`;
bindChapterNavButtons();
```

```js
// 改动后
elements.reader.innerHTML = `<article class="markdown-body">${metaHtml}${html}</article>${navHtml}`;
bindChapterNavButtons();

// —— 段落评论系统接入钩子（开始）——
const article = elements.reader.querySelector('.markdown-body');
if (article) {
    document.dispatchEvent(new CustomEvent('note:loaded', {
        detail: { notePath: path, container: article, meta: meta || null }
    }));
}
// —— 段落评论系统接入钩子（结束）——
```

> 注意：`loadNote` 的 `catch` 分支（加载失败，第 558 行）**不要** dispatch `note:loaded`，避免评论模块把错误占位符当成正文。

**改动 2：`index.html` 追加资源引用**（在 `app.js` 之后）：

```html
<link rel="stylesheet" href="css/paragraph-comments.css">
<script src="js/paragraph-comments.js" defer></script>
```

`scripts/build_site.py` **无需改动**；评论数据是运行时产物，不进入构建期。

---

## 2. 段落定位算法（data-pid + 文本指纹）

### 2.1 问题陈述

段落级评论锚定到整段 `<p>`。原文修订后，`data-pid` 编号可能因段落增删而错位，因此需要文本指纹辅助重定位。设计目标：原文小幅修订（改标点、加句话、删一句）后，评论仍能找回对应段落。

### 2.2 段落标记注入（`injectParagraphIds`）

marked.js 渲染完成后，遍历 `.markdown-body` 内的可批注块级元素，按文档顺序赋 `data-pid`。

```js
/**
 * 可批注块级元素选择器。
 * 排除：标题（h1-h6，改动频繁）、代码块（pre/code，语义脆弱）、表格单元格（td/th，结构复杂）。
 * 包含：p、blockquote > p、li 内的 p。
 */
var ANNOTATABLE_SELECTOR = '.markdown-body p, .markdown-body blockquote p, .markdown-body li > p';

/**
 * 为容器内每个可批注段落注入 data-pid 与文本指纹。
 * @param {Element} container  .markdown-body 元素
 * @returns {{ count: number, fingerprints: Map<number, string> }}
 *   fingerprints: pid → 段落文本指纹（用于重定位）
 */
function injectParagraphIds(container) {
    var paragraphs = container.querySelectorAll(ANNOTATABLE_SELECTOR);
    var fingerprints = new Map();
    var pid = 0;
    paragraphs.forEach(function (p) {
        p.setAttribute('data-pid', String(pid));
        var fp = computeParagraphFingerprint(p);
        p.setAttribute('data-fp', fp);
        fingerprints.set(pid, fp);
        pid++;
    });
    return { count: pid, fingerprints: fingerprints };
}
```

### 2.3 段落文本指纹（`computeParagraphFingerprint`）

指纹 = 归一化文本的前 20 字 + 后 20 字的哈希。归一化规则：连续空白压成单空格、去首尾空白。

```js
var FP_HEAD_LEN = 20;
var FP_TAIL_LEN = 20;

/**
 * 计算段落文本指纹。
 * 规则：归一化文本 → 取前 20 字 + "‖" + 后 20 字 → simpleHash。
 * 前 20 字保证段首稳定（段首通常不改），后 20 字辅助区分同段不同位置。
 * @param {Element} paragraph
 * @returns {string} 8 位十六进制指纹
 */
function computeParagraphFingerprint(paragraph) {
    var raw = paragraph.textContent || '';
    var normalized = raw.replace(/\s+/g, ' ').trim();
    if (normalized.length === 0) return '00000000';
    var head = normalized.slice(0, FP_HEAD_LEN);
    var tail = normalized.length > FP_HEAD_LEN + FP_TAIL_LEN
        ? normalized.slice(-FP_TAIL_LEN)
        : normalized.slice(FP_HEAD_LEN);
    return simpleHash(head + '‖' + tail);
}

/**
 * 简单字符串哈希（djb2 变体），返回 8 位十六进制。
 */
function simpleHash(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
```

### 2.4 段落锚点数据结构

```ts
interface ParagraphAnchor {
  notePath: string;        // 所属笔记相对路径，如 "资治通鉴/周纪一_三家分晋.md"
  pid: number;             // 段落编号（data-pid），创建时的快照
  fingerprint: string;     // 创建时的段落文本指纹（8 位 hex）
  textHead: string;        // 段落归一化文本前 40 字（用于人工核对与模糊匹配）
  schemaVersion: 1;
}
```

> `textHead` 保留 40 字（比指纹的 20 字长），用于模糊匹配时的人工核对与日志排查。

### 2.5 锚点建立（`captureParagraphAnchor`）

用户点击段落时，从 DOM 读取 `data-pid` 与 `data-fp`，并截取段落文本前 40 字。

```js
/**
 * 从点击事件捕获段落锚点。
 * @param {Event} clickEvent
 * @param {string} notePath
 * @returns {ParagraphAnchor | null}
 */
function captureParagraphAnchor(clickEvent, notePath) {
    var paragraph = clickEvent.target.closest('[data-pid]');
    if (!paragraph) return null;
    var pid = parseInt(paragraph.getAttribute('data-pid'), 10);
    if (isNaN(pid)) return null;
    var fingerprint = paragraph.getAttribute('data-fp') || computeParagraphFingerprint(paragraph);
    var normalized = (paragraph.textContent || '').replace(/\s+/g, ' ').trim();
    return {
        notePath: notePath,
        pid: pid,
        fingerprint: fingerprint,
        textHead: normalized.slice(0, 40),
        schemaVersion: 1
    };
}
```

### 2.6 锚点解析（`resolveParagraph`）—— 三级容错

重新渲染后，已保存的 `pid` 可能因段落增删而错位。解析采用三级策略：

```js
/**
 * 在当前容器内解析段落锚点，返回对应的 <p> 元素。
 * 三级策略：精确 pid + 指纹校验 → 指纹全局匹配 → textHead 模糊匹配。
 * @param {ParagraphAnchor} anchor
 * @param {Element} container
 * @returns {{ element: Element, pid: number, relocated: boolean } | null}
 *   relocated: true 表示发生了重定位（pid 变了），调用方应更新存储
 */
function resolveParagraph(anchor, container) {
    if (!anchor || !container) return null;

    // —— 级别 1：精确 pid + 指纹校验 ——
    var exact = container.querySelector('[data-pid="' + anchor.pid + '"]');
    if (exact) {
        var exactFp = exact.getAttribute('data-fp') || computeParagraphFingerprint(exact);
        if (exactFp === anchor.fingerprint) {
            return { element: exact, pid: anchor.pid, relocated: false };
        }
    }

    // —— 级别 2：指纹全局匹配（pid 可能漂移）——
    var paragraphs = container.querySelectorAll('[data-pid]');
    for (var i = 0; i < paragraphs.length; i++) {
        var p = paragraphs[i];
        var fp = p.getAttribute('data-fp') || computeParagraphFingerprint(p);
        if (fp === anchor.fingerprint) {
            var newPid = parseInt(p.getAttribute('data-pid'), 10);
            return { element: p, pid: newPid, relocated: newPid !== anchor.pid };
        }
    }

    // —— 级别 3：textHead 模糊匹配（前 20 字编辑距离 ≤ 2）——
    var targetHead = anchor.textHead.slice(0, 20);
    var bestMatch = null;
    var bestPid = -1;
    for (var j = 0; j < paragraphs.length; j++) {
        var candidate = paragraphs[j];
        var norm = (candidate.textContent || '').replace(/\s+/g, ' ').trim();
        var candHead = norm.slice(0, 20);
        if (editDistance(candHead, targetHead) <= 2) {
            bestMatch = candidate;
            bestPid = parseInt(candidate.getAttribute('data-pid'), 10);
            break;
        }
    }
    if (bestMatch) {
        return { element: bestMatch, pid: bestPid, relocated: true };
    }

    return null; // 解析失败，评论以"未定位"状态展示
}
```

`editDistance` 复用选区级评论系统已验证的 Levenshtein 实现（限制最大长度 64）。

### 2.7 段落标记刷新策略

`attach` 时调用 `injectParagraphIds` 一次，结果缓存到模块变量 `paragraphMap`。所有 `resolveParagraph` 复用该缓存。若 `relocated === true`，调用方需用新 `pid` 更新存储中的评论，并标记 `anchor.relocatedAt` 时间戳供日志排查。

### 2.8 关键函数签名汇总

```js
// 段落标记
injectParagraphIds(container): { count, fingerprints }
computeParagraphFingerprint(paragraph): string
ANNOTATABLE_SELECTOR  // 常量

// 锚点
captureParagraphAnchor(clickEvent, notePath): ParagraphAnchor | null
resolveParagraph(anchor, container): { element, pid, relocated } | null

// 工具
simpleHash(str): string
editDistance(a, b): number
```

---

## 3. 存储双通道方案

### 3.1 整体数据流

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    用户操作（点击段落、写评论）            │
                    └───────────────────────────┬─────────────────────────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │  addComment / reply   │
                                    └───────────┬───────────┘
                                                │
                          ┌─────────────────────┴──────────────────────┐
                          ▼                                             ▼
              ┌───────────────────────┐                     ┌───────────────────────┐
              │  localStorage 即时写入 │                     │  pending 队列追加     │
              │  pc:comments:<path>  │                     │  pc:pending           │
              └───────────┬──────────┘                     └───────────┬───────────┘
                          │                                             │
                          │ 立即反映到 UI                               │
                          ▼                                             │
              ┌───────────────────────┐                                 │
              │  段落计数徽章刷新      │                                 │
              │  评论浮层/面板渲染     │                                 │
              └───────────────────────┘                                 │
                                                                        │
                          ┌─────────────────────────────────────────────┘
                          ▼  （online 事件 / 定时器 / 手动 syncNow）
              ┌───────────────────────┐
              │  SyncWorker.process() │
              └───────────┬───────────┘
                          │
            ┌─────────────┴──────────────┐
            ▼                            ▼
   ┌─────────────────┐         ┌─────────────────────┐
   │  GET 仓库 SHA   │         │  离线？→ 留在队列   │
   └────────┬────────┘         └─────────────────────┘
            │
            ▼
   ┌─────────────────┐    409 冲突     ┌─────────────────────┐
   │  PUT + SHA      │ ──────────────▶ │  重新 GET → 合并    │
   └────────┬────────┘                 │  → 重试 PUT（≤3次） │
            │                          └─────────────────────┘
            ▼ 成功
   ┌─────────────────┐
   │  从 pending 移除│
   │  更新 pc:meta   │
   └─────────────────┘
```

### 3.2 localStorage 键设计

| Key | 值 | 说明 |
|---|---|---|
| `pc:comments:<notePath>` | `Comment[]` | 单篇笔记的评论数组，按 `createdAt` 升序 |
| `pc:pending` | `PendingOp[]` | 待同步队列，FIFO |
| `pc:meta` | `{ schemaVersion, lastSyncAt, lastSyncResult, pendingCount }` | 元信息 |
| `pc:config` | `{ github: {...}, cdn: '...' }` | GitHub 配置（含 token） |
| `pc:remote:<notePath>` | `{ sha, fetchedAt, comments }` | 远端快照缓存（避免重复 GET） |

`<notePath>` 中的 `/` 保留原样（localStorage key 允许任意字符）。例：`pc:comments:资治通鉴/周纪一_三家分晋.md`。

### 3.3 `PendingOp` 结构

```ts
interface PendingOp {
  id: string;              // 操作 ID（uuid），用于去重与移除
  type: 'add' | 'reply' | 'resolve' | 'delete';
  notePath: string;
  payload: any;            // 对应操作的参数（commentId、content 等）
  commentId: string;       // 关联的评论 ID
  createdAt: string;       // ISO 8601
  retryCount: number;      // 已重试次数
  lastError: string | null;
}
```

### 3.4 离线队列算法

```js
var SyncQueue = {
    /** 入队 */
    enqueue: function (op) {
        var pending = Storage.loadPending();
        // 去重：同 commentId + 同 type 的操作只保留最新一条
        pending = pending.filter(function (p) {
            return !(p.commentId === op.commentId && p.type === op.type);
        });
        pending.push(op);
        Storage.savePending(pending);
        Storage.updateMeta({ pendingCount: pending.length });
        // 联网则立即尝试同步
        if (navigator.onLine) {
            SyncWorker.process();
        }
    },

    /** 出队（成功后移除） */
    dequeue: function (opId) {
        var pending = Storage.loadPending().filter(function (p) { return p.id !== opId; });
        Storage.savePending(pending);
        Storage.updateMeta({ pendingCount: pending.length });
    },

    /** 处理整个队列 */
    process: async function () {
        if (!navigator.onLine) return { processed: 0, failed: 0 };
        if (!GitHubConfig.isConfigured()) return { processed: 0, failed: 0, reason: 'not_configured' };

        var pending = Storage.loadPending();
        var processed = 0, failed = 0;
        // 按 notePath 分组，减少 GET 次数
        var byNote = groupBy(pending, 'notePath');
        for (var notePath in byNote) {
            if (!byNote.hasOwnProperty(notePath)) continue;
            var ops = byNote[notePath];
            try {
                await SyncWorker.applyOpsToRemote(notePath, ops);
                ops.forEach(function (op) { SyncQueue.dequeue(op.id); });
                processed += ops.length;
            } catch (err) {
                failed += ops.length;
                ops.forEach(function (op) {
                    op.retryCount = (op.retryCount || 0) + 1;
                    op.lastError = String(err.message || err);
                    // 超过 5 次重试则标记为失败，不再自动重试（需手动处理）
                    if (op.retryCount >= 5) op.giveUp = true;
                });
            }
        }
        Storage.savePending(pending.filter(function (p) { return !p.giveUp; }));
        Storage.updateMeta({ lastSyncAt: new Date().toISOString(), lastSyncResult: { processed: processed, failed: failed } });
        return { processed: processed, failed: failed };
    }
};
```

### 3.5 冲突合并算法

当 PUT 返回 409（SHA 不匹配，说明远端已被他人/他端修改），需重新拉取远端、与本地合并后再重试。

```js
/**
 * 合并本地与远端评论。
 * 策略：按 comment.id 去重，同 id 取 updatedAt 更新者；按 createdAt 升序排序。
 * @param {Comment[]} local
 * @param {Comment[]} remote
 * @returns {Comment[]} 合并结果
 */
function mergeComments(local, remote) {
    var byId = {};
    // 先放远端（基线）
    remote.forEach(function (c) { byId[c.id] = c; });
    // 再用本地覆盖（本地通常是更新的）
    local.forEach(function (c) {
        var existing = byId[c.id];
        if (!existing) {
            byId[c.id] = c;
        } else {
            // 取 updatedAt 更新者；相同则取本地（用户刚操作过）
            var localUpdated = new Date(c.updatedAt || c.createdAt).getTime();
            var remoteUpdated = new Date(existing.updatedAt || existing.createdAt).getTime();
            byId[c.id] = localUpdated >= remoteUpdated ? c : existing;
        }
    });
    var merged = Object.keys(byId).map(function (k) { return byId[k]; });
    // 按 createdAt 升序，回复紧跟主评论
    merged.sort(function (a, b) {
        if (a.parentId && !b.parentId) return 1;
        if (!a.parentId && b.parentId) return -1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    return merged;
}
```

### 3.6 网络状态监听

```js
window.addEventListener('online', function () {
    showToast('网络已恢复，正在同步评论…');
    SyncQueue.process().then(function (r) {
        if (r.processed > 0) showToast('已同步 ' + r.processed + ' 条评论');
    });
});
window.addEventListener('offline', function () {
    showToast('已离线，评论将暂存本地，联网后自动同步');
});
```

---

## 4. GitHub Contents API 集成

### 4.1 配置结构

```ts
interface GitHubConfig {
  owner: string;       // 仓库所有者
  repo: string;        // 仓库名
  branch: string;      // 分支，默认 "main"
  token: string;       // fine-grained PAT（只授权写 site/data/comments/）
  commitPrefix: string;// 提交信息前缀，默认 "chore(comments): "
  cdnBase: string;     // 读取 CDN 基址，默认 jsdelivr
}
```

CDN 读取基址（按优先级）：
1. `https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/site/data/comments/{path}.json`（jsdelivr，全球 CDN，有缓存延迟 ~10 分钟）
2. `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/site/data/comments/{path}.json`（raw，无缓存但慢）

> 写入必须用 `api.github.com`；读取优先 CDN（快、不消耗 API 配额）。

### 4.2 路径编码

`notePath`（如 `资治通鉴/周纪一_三家分晋.md`）需编码为仓库文件路径：

```js
/**
 * 将 notePath 编码为 comments 目录下的文件路径。
 * 规则："/" → "__"，".md" 保留，其余原样。
 * 例："资治通鉴/周纪一_三家分晋.md" → "资治通鉴__周纪一_三家分晋.md"
 * @param {string} notePath
 * @returns {string} 仓库内相对路径 site/data/comments/<encoded>.json
 */
function encodeCommentPath(notePath) {
    var encoded = notePath.replace(/\//g, '__');
    return 'site/data/comments/' + encoded + '.json';
}
```

### 4.3 读取（`fetchRemoteComments`）

```js
/**
 * 从 CDN/raw 读取远端评论。
 * @param {string} notePath
 * @returns {Promise<{ comments: Comment[], sha: string | null, source: string }>}
 *   sha 为 null 表示走 CDN（无 SHA）；走 API 时有 SHA
 */
async function fetchRemoteComments(notePath) {
    var cfg = GitHubConfig.get();
    var filePath = encodeCommentPath(notePath);
    var encodedPath = filePath.split('/').map(encodeURIComponent).join('/');

    // 优先 jsdelivr CDN（快、不消耗配额，但有缓存延迟）
    var cdnUrl = 'https://cdn.jsdelivr.net/gh/' + cfg.owner + '/' + cfg.repo + '@' + cfg.branch + '/' + encodedPath;
    try {
        var resp = await fetch(cdnUrl, { cache: 'no-cache' });
        if (resp.ok) {
            var data = await resp.json();
            return { comments: data.comments || [], sha: null, source: 'jsdelivr' };
        }
        if (resp.status === 404) return { comments: [], sha: null, source: 'jsdelivr-404' };
    } catch (e) {
        console.warn('[PC] jsdelivr 读取失败，回退 raw', e);
    }

    // 回退 raw.githubusercontent.com
    var rawUrl = 'https://raw.githubusercontent.com/' + cfg.owner + '/' + cfg.repo + '/' + cfg.branch + '/' + encodedPath;
    try {
        var rawResp = await fetch(rawUrl, { cache: 'no-cache' });
        if (rawResp.ok) {
            var rawData = await rawResp.json();
            return { comments: rawData.comments || [], sha: null, source: 'raw' };
        }
        if (rawResp.status === 404) return { comments: [], sha: null, source: 'raw-404' };
    } catch (e) {
        console.warn('[PC] raw 读取失败', e);
    }

    return { comments: [], sha: null, source: 'failed' };
}
```

### 4.4 获取 SHA（`getRemoteSha`）

写入前需先获取远端文件当前 SHA（用于乐观并发控制）。

```js
/**
 * 通过 GitHub Contents API 获取文件 SHA。
 * @param {string} notePath
 * @returns {Promise<{ sha: string | null, comments: Comment[] }>}
 */
async function getRemoteSha(notePath) {
    var cfg = GitHubConfig.get();
    var filePath = encodeCommentPath(notePath);
    var encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    var url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encodedPath + '?ref=' + cfg.branch;

    var resp = await fetch(url, {
        headers: {
            'Authorization': 'Bearer ' + cfg.token,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        }
    });
    if (resp.status === 404) return { sha: null, comments: [] };
    if (!resp.ok) throw new Error('GET contents 失败: ' + resp.status);
    var data = await resp.json();
    // content 是 base64 编码的 JSON
    var content = data.content ? atob(data.content.replace(/\n/g, '')) : '{}';
    var parsed = JSON.parse(content);
    return { sha: data.sha, comments: parsed.comments || [] };
}
```

### 4.5 写入（`putRemoteComments`）—— 含冲突重试

```js
var MAX_RETRY = 3;

/**
 * 将评论写入远端。冲突时自动重试。
 * @param {string} notePath
 * @param {Comment[]} localComments  本地完整评论数组
 * @returns {Promise<{ sha: string, merged: Comment[] }>}
 */
async function putRemoteComments(notePath, localComments) {
    var cfg = GitHubConfig.get();
    if (!cfg.token) throw new Error('未配置 GitHub token');

    for (var attempt = 0; attempt < MAX_RETRY; attempt++) {
        // 1. 获取当前 SHA + 远端评论
        var remote = await getRemoteSha(notePath);

        // 2. 合并本地与远端
        var merged = mergeComments(localComments, remote.comments);

        // 3. 构造文件内容
        var fileContent = JSON.stringify({
            schemaVersion: 1,
            notePath: notePath,
            updatedAt: new Date().toISOString(),
            comments: merged
        }, null, 2);
        var base64Content = btoa(unescape(encodeURIComponent(fileContent))); // UTF-8 安全 base64

        // 4. PUT
        var filePath = encodeCommentPath(notePath);
        var encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
        var url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encodedPath;
        var body = {
            message: cfg.commitPrefix + 'update comments for ' + notePath,
            content: base64Content,
            branch: cfg.branch
        };
        if (remote.sha) body.sha = remote.sha; // 更新已有文件需带 sha

        var resp = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + cfg.token,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (resp.ok) {
            var data = await resp.json();
            // 同步合并结果回本地
            Storage.saveComments(notePath, merged);
            return { sha: data.content.sha, merged: merged };
        }

        if (resp.status === 409) {
            // 冲突：远端 SHA 不匹配，重试（重新 GET + 合并）
            console.warn('[PC] 冲突，重试 ' + (attempt + 1) + '/' + MAX_RETRY);
            await sleep(500 * (attempt + 1)); // 退避
            continue;
        }

        if (resp.status === 422 && !remote.sha) {
            // 422 通常是 sha 缺失但文件已存在，重试时会带上 sha
            console.warn('[PC] 422，可能文件已存在，重试');
            continue;
        }

        // 其他错误（401 token 失效、403 权限不足、429 限流）
        var errBody = await resp.json().catch(function () { return {}; });
        throw new Error('PUT 失败: ' + resp.status + ' ' + (errBody.message || ''));
    }
    throw new Error('冲突重试 ' + MAX_RETRY + ' 次仍失败');
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
```

### 4.6 `SyncWorker.applyOpsToRemote`

将一组 pending 操作应用到远端：先把所有操作在本地评论数组上执行一遍，再整体 PUT。

```js
var SyncWorker = {
    /**
     * 把一组操作应用到远端文件。
     * @param {string} notePath
     * @param {PendingOp[]} ops
     */
    applyOpsToRemote: async function (notePath, ops) {
        // 1. 取本地最新评论（操作已即时写入本地）
        var local = Storage.loadComments(notePath);
        // 2. 整体 PUT（内部会 GET + merge + 重试）
        await putRemoteComments(notePath, local);
    }
};
```

### 4.7 速率限制与防抖

- GitHub API 认证后每小时 5000 次。前端按 notePath 维度防抖写入，避免连续操作触发多次 PUT。
- 单次 PUT 即包含该 notePath 的所有 pending 操作（按 notePath 分组）。
- 读取走 CDN 不消耗配额。

```js
var debouncedSync = debounce(function (notePath) {
    SyncQueue.process();
}, 2000); // 写评论后 2 秒内无新操作才触发同步

function scheduleSync(notePath) {
    debouncedSync(notePath);
}
```

---

## 5. 评论数据 JSON Schema

### 5.1 `Comment` 完整结构

```ts
interface Comment {
  id: string;             // "pc_<timestamp>_<seq>"，主键
  notePath: string;       // 所属笔记，如 "资治通鉴/周纪一_三家分晋.md"
  parentId: string | null;// 顶级评论为 null；回复指向被回复评论的 id
  anchor: ParagraphAnchor;// 段落锚点（回复也带，便于定位到同一段）
  type: 'comment' | 'question' | 'insight' | 'critique';
  // type 语义：
  //   comment  普通评论
  //   question 提问
  //   insight  洞察
  //   critique 批评/质疑（供 critic agent 消费）
  status: 'open' | 'resolved';
  content: string;        // 评论正文（纯文本，渲染时转义，防 XSS）
  author: string;         // 作者标识，默认 "作者"
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
  resolvedAt: string | null;
  tags: string[];         // 自由标签，如 ["人物:智伯", "待查"]
  // AI 消费用
  agentHints?: {
    targetAgent?: 'historian' | 'biographer' | 'context_analyst' | 'critic' | 'philosopher' | 'editor';
    priority?: 'low' | 'normal' | 'high';
  };
  // 同步元信息（不导出给 AI）
  _sync?: {
    remoteSha?: string;     // 最后一次成功同步的远端 SHA
    syncedAt?: string;      // 最后同步时间
    dirty?: boolean;        // 本地有改动未同步
  };
}
```

### 5.2 仓库文件结构（`site/data/comments/<encoded>.json`）

```json
{
  "schemaVersion": 1,
  "notePath": "资治通鉴/周纪一_三家分晋.md",
  "updatedAt": "2026-06-23T10:00:00+08:00",
  "comments": [
    {
      "id": "pc_1719120000000_1",
      "notePath": "资治通鉴/周纪一_三家分晋.md",
      "parentId": null,
      "anchor": {
        "notePath": "资治通鉴/周纪一_三家分晋.md",
        "pid": 3,
        "fingerprint": "a1b2c3d4",
        "textHead": "初命晋大夫魏斯、赵籍、韩虔为诸侯",
        "schemaVersion": 1
      },
      "type": "critique",
      "status": "open",
      "content": "司马光把三家分晋作为通鉴开篇，是否在暗示礼制崩坏是乱世之源？",
      "author": "作者",
      "createdAt": "2026-06-23T09:00:00+08:00",
      "updatedAt": "2026-06-23T09:00:00+08:00",
      "resolvedAt": null,
      "tags": ["礼制", "开篇"],
      "agentHints": { "targetAgent": "critic", "priority": "high" }
    }
  ]
}
```

### 5.3 localStorage 存储读写函数

```js
var Storage = {
    SCHEMA_VERSION: 1,
    PREFIX: 'pc:',

    loadComments: function (notePath) {
        try {
            var raw = localStorage.getItem(this.PREFIX + 'comments:' + notePath);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    },

    saveComments: function (notePath, comments) {
        try {
            localStorage.setItem(this.PREFIX + 'comments:' + notePath, JSON.stringify(comments));
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError') showToast('本地存储已满，请导出后清理');
            return false;
        }
    },

    loadPending: function () {
        try {
            var raw = localStorage.getItem(this.PREFIX + 'pending');
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    },

    savePending: function (pending) {
        localStorage.setItem(this.PREFIX + 'pending', JSON.stringify(pending));
    },

    loadMeta: function () {
        try {
            var raw = localStorage.getItem(this.PREFIX + 'meta');
            return raw ? JSON.parse(raw) : { schemaVersion: this.SCHEMA_VERSION, lastSyncAt: null, pendingCount: 0 };
        } catch (e) { return { schemaVersion: this.SCHEMA_VERSION }; }
    },

    updateMeta: function (patch) {
        var meta = this.loadMeta();
        Object.assign(meta, patch);
        localStorage.setItem(this.PREFIX + 'meta', JSON.stringify(meta));
    },

    loadConfig: function () {
        try {
            var raw = localStorage.getItem(this.PREFIX + 'config');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },

    saveConfig: function (config) {
        localStorage.setItem(this.PREFIX + 'config', JSON.stringify(config));
    },

    deleteNote: function (notePath) {
        localStorage.removeItem(this.PREFIX + 'comments:' + notePath);
    }
};
```

---

## 6. 手机端交互设计

### 6.1 触摸事件设计

段落级评论的核心交互是"点击段落"。移动端需区分"点击段落看评论"与"长按选择文字"。

```js
/**
 * 绑定段落触摸/点击事件。
 * 策略：
 *   - click：桌面端主交互
 *   - touchstart + touchend：移动端，记录起止位置，位移 < 10px 且时长 < 500ms 视为点击
 *   - 避免与浏览器原生长按选区冲突
 */
function bindParagraphInteraction(container) {
    var touchStart = null;
    var TOUCH_THRESHOLD = 10;   // 位移阈值 px
    var TAP_MAX_DURATION = 500; // 点击最大时长 ms

    container.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) { touchStart = null; return; }
        touchStart = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            t: Date.now(),
            target: e.target
        };
    }, { passive: true });

    container.addEventListener('touchend', function (e) {
        if (!touchStart) return;
        var touch = e.changedTouches[0];
        var dx = Math.abs(touch.clientX - touchStart.x);
        var dy = Math.abs(touch.clientY - touchStart.y);
        var dt = Date.now() - touchStart.t;
        if (dx < TOUCH_THRESHOLD && dy < TOUCH_THRESHOLD && dt < TAP_MAX_DURATION) {
            // 视为点击
            handleParagraphTap(touchStart.target, touch.clientX, touch.clientY);
        }
        touchStart = null;
    }, { passive: true });

    // 桌面端 click
    container.addEventListener('click', function (e) {
        if (window.innerWidth <= 768) return; // 移动端由 touch 处理
        handleParagraphTap(e.target, e.clientX, e.clientY);
    });
}

/**
 * 处理段落点击。
 * @param {Element} target  点击目标
 * @param {number} x  视口 x（用于浮层定位）
 * @param {number} y  视口 y
 */
function handleParagraphTap(target, x, y) {
    var paragraph = target.closest('[data-pid]');
    if (!paragraph) return;
    var pid = parseInt(paragraph.getAttribute('data-pid'), 10);
    var notePath = currentNotePath;
    var comments = Storage.loadComments(notePath).filter(function (c) {
        return c.anchor && c.anchor.pid === pid && !c.deleted;
    });
    if (comments.length > 0) {
        // 已有评论：展开浮层显示评论列表 + 输入框
        showParagraphPanel(paragraph, pid, comments, { x: x, y: y });
    } else {
        // 无评论：直接展开输入浮层
        showComposePanel(paragraph, pid, { x: x, y: y });
    }
}
```

### 6.2 浮层定位（移动端优先）

移动端浮层采用**底部抽屉**而非桌面端的悬浮气泡，避免遮挡键盘。

```js
/**
 * 定位浮层。
 * 移动端（≤768px）：底部抽屉，占屏宽 100%，高度自适应（最大 60vh）。
 * 桌面端：悬浮在段落下方，居中对齐。
 */
function positionPanel(panel, paragraph, tapPos) {
    if (window.innerWidth <= 768) {
        // 底部抽屉
        panel.classList.add('pc-panel-bottom');
        panel.style.left = '0';
        panel.style.right = '0';
        panel.style.bottom = '0';
        panel.style.top = 'auto';
        panel.style.maxHeight = '60vh';
    } else {
        // 桌面悬浮
        panel.classList.remove('pc-panel-bottom');
        var rect = paragraph.getBoundingClientRect();
        var scrollY = window.scrollY;
        var panelWidth = 380;
        var left = rect.left + rect.width / 2 - panelWidth / 2;
        var top = rect.bottom + scrollY + 8;
        // 边界检查
        if (left < 10) left = 10;
        if (left + panelWidth > window.innerWidth - 10) left = window.innerWidth - panelWidth - 10;
        if (top + 300 > scrollY + window.innerHeight) {
            top = rect.top + scrollY - 308; // 翻转到上方
            if (top < scrollY + 60) top = scrollY + 60;
        }
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.maxHeight = 'none';
    }
}
```

### 6.3 浮层 DOM 结构

```html
<div class="pc-panel" id="pcPanel" hidden>
  <div class="pc-panel-handle" aria-hidden="true"></div>
  <header class="pc-panel-header">
    <span class="pc-panel-pid">段落 #3</span>
    <span class="pc-panel-count">0 条评论</span>
    <button class="pc-panel-close" type="button" aria-label="关闭">&times;</button>
  </header>
  <div class="pc-panel-quote" id="pcPanelQuote"></div>
  <ul class="pc-panel-list" id="pcPanelList"></ul>
  <div class="pc-panel-compose">
    <textarea class="pc-panel-input" placeholder="写下你对这段的评论…（Ctrl+Enter 提交）"></textarea>
    <div class="pc-panel-actions">
      <select class="pc-panel-type">
        <option value="comment">评论</option>
        <option value="question">提问</option>
        <option value="insight">洞察</option>
        <option value="critique">质疑</option>
      </select>
      <select class="pc-panel-agent">
        <option value="">不指定专家</option>
        <option value="historian">史官</option>
        <option value="biographer">传记官</option>
        <option value="context_analyst">背景分析</option>
        <option value="critic">名家点评</option>
        <option value="philosopher">问道</option>
        <option value="editor">编辑</option>
      </select>
      <button class="pc-panel-submit btn-primary" type="button">提交</button>
    </div>
  </div>
</div>
```

### 6.4 段落计数徽章

每个有评论的段落，在段末显示一个小徽章（数字），点击同段落点击。

```js
function renderParagraphBadges(container, notePath) {
    // 清除旧徽章
    container.querySelectorAll('.pc-badge').forEach(function (b) { b.remove(); });
    var comments = Storage.loadComments(notePath);
    var byPid = groupBy(comments.filter(function (c) { return !c.deleted; }), function (c) { return c.anchor.pid; });
    Object.keys(byPid).forEach(function (pid) {
        var p = container.querySelector('[data-pid="' + pid + '"]');
        if (!p) return;
        var badge = el('span', { className: 'pc-badge', 'data-pid': pid }, String(byPid[pid].length));
        p.appendChild(badge);
    });
}
```

### 6.5 性能优化

- **段落标记延迟注入**：`injectParagraphIds` 在 `note:loaded` 后用 `requestIdleCallback`（回退 `setTimeout 0`）执行，不阻塞首屏。
- **徽章批量渲染**：一次 `querySelectorAll` 收集所有段落，按 pid 分组后批量插入徽章，避免 N 次 DOM 操作。
- **浮层复用**：全局只有一个 `#pcPanel`，切换段落时只更新内容与定位，不重建 DOM。
- **触摸事件 passive**：`touchstart`/`touchend` 用 `{ passive: true }`，不阻塞滚动。
- **虚拟列表**：单段落评论 > 50 条时，`#pcPanelList` 用简易虚拟滚动（只渲染可视区 ± 5 条）。
- **防抖**：写入同步防抖 2 秒；`resize` 时重新定位浮层防抖 150ms。

---

## 7. 与现有 `app.js` 集成点

### 7.1 集成清单

| # | 位置 | 改动 | 说明 |
|---|---|---|---|
| 1 | `app.js` `loadNote` 成功分支末尾（约第 545 行后） | dispatch `note:loaded` 事件 | 携带 `{ notePath, container, meta }` |
| 2 | `app.js` `loadNote` 失败分支（第 558 行） | **不** dispatch 事件 | 避免误触发 |
| 3 | `index.html` `<head>` | 追加 `<link rel="stylesheet" href="css/paragraph-comments.css">` | 在 `style.css` 之后 |
| 4 | `index.html` `<body>` 末尾 | 追加 `<script src="js/paragraph-comments.js" defer>` | 在 `app.js` 之后 |

### 7.2 `paragraph-comments.js` 内部监听

```js
document.addEventListener('note:loaded', function (e) {
    var detail = e.detail || {};
    var notePath = detail.notePath;
    var container = detail.container;
    var meta = detail.meta;
    if (!notePath || !container) return;
    ParagraphComments.attach(container, notePath, meta);
});
```

### 7.3 `attach` 内部流程

```js
function attach(container, notePath, meta) {
    detach(); // 先卸载旧的
    currentContainer = container;
    currentNotePath = notePath;
    currentMeta = meta;

    // 1. 注入段落标记（data-pid + data-fp）
    requestIdleCallback(function () {
        var result = injectParagraphIds(container);
        paragraphMap = result.fingerprints;

        // 2. 渲染段落计数徽章
        renderParagraphBadges(container, notePath);

        // 3. 绑定触摸/点击
        bindParagraphInteraction(container);
    });

    // 4. 加载评论：先本地，再异步拉取远端合并
    loadCommentsWithSync(notePath).then(function () {
        renderParagraphBadges(container, notePath); // 合并后刷新徽章
    });
}

/**
 * 加载评论：本地即时显示，远端异步合并。
 */
async function loadCommentsWithSync(notePath) {
    // 本地已有（即时）
    var local = Storage.loadComments(notePath);
    // 远端拉取（异步，失败不阻塞）
    if (GitHubConfig.isConfigured() && navigator.onLine) {
        try {
            var remote = await fetchRemoteComments(notePath);
            var merged = mergeComments(local, remote.comments);
            Storage.saveComments(notePath, merged);
        } catch (e) {
            console.warn('[PC] 远端拉取失败，使用本地', e);
        }
    }
}
```

### 7.4 无需改动

- `scripts/build_site.py`：评论是运行时产物，不进构建期。
- `src/agents/*`：除非实现 AI 消费侧（见第 9 节），否则不动。
- `site/css/style.css`：评论样式独立文件，复用其 CSS 变量。

---

## 8. 配置方案（GitHub token/repo 安全存储）

### 8.1 风险声明

**PAT 暴露在前端是固有风险**。任何能访问页面 JS 的用户都能拿到 token。本方案通过"最小授权 + 目录限制"将风险降到可控范围，但**不适用于公开站点**——仅适用于作者本人使用的私有部署或可信场景。

### 8.2 fine-grained PAT 配置

在 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens 创建：

- **Repository access**：仅选择目标仓库（如 `yourname/deep-reading`）
- **Repository permissions**：
  - `Contents`: **Read and write**（读写文件内容）
  - 其他权限：全部 **No access**
- **资源限制**：通过仓库的 `.github/CODEOWNERS` 或分支保护规则，限制该 token 只能写 `site/data/comments/` 目录（需配合 GitHub Actions 校验，见 8.4）

### 8.3 前端配置存储

token 存 `localStorage`（`pc:config`），不进仓库、不进构建产物。提供配置 UI：

```js
var GitHubConfig = {
    get: function () {
        var cfg = Storage.loadConfig();
        return cfg && cfg.github ? Object.assign({ branch: 'main', commitPrefix: 'chore(comments): ' }, cfg.github) : null;
    },
    isConfigured: function () {
        var cfg = this.get();
        return !!(cfg && cfg.owner && cfg.repo && cfg.token);
    },
    set: function (config) {
        var cfg = Storage.loadConfig() || {};
        cfg.github = config;
        Storage.saveConfig(cfg);
    },
    clear: function () {
        var cfg = Storage.loadConfig() || {};
        delete cfg.github;
        Storage.saveConfig(cfg);
    }
};
```

配置 UI（模态框）：

```html
<div class="modal-overlay" id="pcConfigOverlay" hidden>
  <div class="modal" role="dialog">
    <div class="modal-header">
      <h2>GitHub 同步配置</h2>
      <button class="modal-close" type="button">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>仓库所有者 (owner)</label>
        <input type="text" id="pcCfgOwner" placeholder="yourname">
      </div>
      <div class="form-group">
        <label>仓库名 (repo)</label>
        <input type="text" id="pcCfgRepo" placeholder="deep-reading">
      </div>
      <div class="form-group">
        <label>分支 (branch)</label>
        <input type="text" id="pcCfgBranch" placeholder="main" value="main">
      </div>
      <div class="form-group">
        <label>Fine-grained PAT</label>
        <input type="password" id="pcCfgToken" placeholder="github_pat_...">
        <small>仅授权写 site/data/comments/ 目录的 fine-grained token。</small>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="pcCfgClear">清除配置</button>
        <button type="button" class="btn-primary" id="pcCfgSave">保存</button>
      </div>
    </div>
  </div>
</div>
```

### 8.4 服务端校验（可选，推荐）

在仓库加一个 GitHub Action，校验 token 提交的文件路径是否在 `site/data/comments/` 内，越权则拒绝：

```yaml
# .github/workflows/validate-comments-push.yml
name: Validate comments push
on:
  push:
    paths:
      - 'site/data/comments/**'
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - name: Check changed files are within comments dir
        run: |
          CHANGED=$(git diff --name-only HEAD~1 HEAD | grep -v '^site/data/comments/' || true)
          if [ -n "$CHANGED" ]; then
            echo "非法路径变更: $CHANGED"
            exit 1
          fi
```

### 8.5 XSS 防护

- **评论内容**：渲染时强制 `textContent` 赋值，**绝不** `innerHTML`。所有用户输入（content、tags、author）走 `escapeHtml`。
- **浮层 textarea**：原生控件，无 XSS 风险。
- **导出 JSON**：`JSON.stringify` 自动转义。
- **导入 JSON**：`JSON.parse` 后逐字段校验类型；`anchor.textHead` 只用于字符串比较，不注入 DOM。
- **段落标记**：`document.createElement` + `setAttribute`，不接触 HTML 字符串。
- **与 `sanitizeHtml` 协作**：`app.js` 的 `sanitizeHtml` 在 marked 输出后执行，会移除 `on*` 属性。评论系统在 `sanitizeHtml` 之后介入，注入的 `data-pid`/`data-fp` 不触发 sanitize（只跑一次）。重新渲染时由 `note:loaded` 重新 `attach`。

---

## 9. AI 消费接口

### 9.1 仓库直读（推荐）

评论持久化到 `site/data/comments/<encoded>.json` 后，Python pipeline 可直接从仓库读取，无需前端导出。

```python
# src/storage/file_manager.py 新增

import json
import urllib.request
from pathlib import Path


def load_paragraph_comments(
    repo: str,
    note_path: str,
    branch: str = "main",
    owner: str | None = None,
) -> list[dict]:
    """从 GitHub 仓库读取段落评论。

    Args:
        repo: 仓库名，如 "deep-reading"
        note_path: 笔记相对路径，如 "资治通鉴/周纪一_三家分晋.md"
        branch: 分支名
        owner: 仓库所有者；为 None 时从 config 读取

    Returns:
        评论线程列表（已按段落分组）。
    """
    if owner is None:
        from ..utils.config import load_config
        config = load_config()
        owner = config.get("github", {}).get("owner", "")
        repo = config.get("github", {}).get("repo", repo)

    # 路径编码：与前端 encodeCommentPath 一致
    encoded = note_path.replace("/", "__")
    raw_url = (
        f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/"
        f"site/data/comments/{encoded}.json"
    )

    try:
        with urllib.request.urlopen(raw_url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data.get("comments", [])
    except Exception as e:
        logger.warning("读取段落评论失败 %s: %s", note_path, e)
        return []


def group_comments_by_paragraph(comments: list[dict]) -> list[dict]:
    """把评论按段落分组，组织成 AI 友好的线程结构。

    Returns:
        [
          {
            "pid": 3,
            "fingerprint": "a1b2c3d4",
            "textHead": "初命晋大夫魏斯...",
            "threads": [ { comment, replies: [...] }, ... ]
          }
        ]
    """
    by_pid: dict[int, dict] = {}
    for c in comments:
        anchor = c.get("anchor") or {}
        pid = anchor.get("pid", -1)
        bucket = by_pid.setdefault(pid, {
            "pid": pid,
            "fingerprint": anchor.get("fingerprint", ""),
            "textHead": anchor.get("textHead", ""),
            "threads": [],
        })
        if c.get("parentId") is None:
            bucket["threads"].append({"comment": c, "replies": []})
        else:
            # 回复挂到对应主评论
            for t in bucket["threads"]:
                if t["comment"]["id"] == c["parentId"]:
                    t["replies"].append(c)
                    break
    return sorted(by_pid.values(), key=lambda b: b["pid"])
```

### 9.2 `AgentState` 扩展

在 `src/core/state.py` 增加可选字段：

```python
class AgentState(TypedDict, total=False):
    book: str
    chapter: str
    event: str
    user_input: str
    output_path: str
    sections: Annotated[Dict[str, str], dict_merge]
    sources: Annotated[Dict[str, List[str]], dict_merge]
    final_markdown: str
    errors: Annotated[List[str], lambda a, b: a + b]
    # 新增：作者段落评论
    author_comments: list[dict]  # 按段落分组的评论线程
```

### 9.3 Workflow 注入

在 `src/core/workflow.py` 的入口处，根据 `book/chapter/event` 推算 `note_path`，拉取评论注入 `AgentState`：

```python
# src/core/workflow.py 片段

def build_initial_state(user_input: str, book: str, chapter: str, event: str) -> AgentState:
    note_path = f"{book}/{chapter}_{event}.md"
    # 拉取段落评论
    comments = load_paragraph_comments(repo="deep-reading", note_path=note_path)
    grouped = group_comments_by_paragraph(comments)
    return {
        "book": book,
        "chapter": chapter,
        "event": event,
        "user_input": user_input,
        "output_path": str(FileManager().get_output_path(book, chapter, event)),
        "sections": {},
        "sources": {},
        "final_markdown": "",
        "errors": [],
        "author_comments": grouped,
    }
```

### 9.4 Agent 消费

各 agent 的 prompt 模板（`prompts/*.md`）在合适位置插入 `{{author_comments}}` 占位符，由 `src/utils/prompts.py` 渲染。批注按 `agentHints.targetAgent` 过滤后只传给对应 agent；未指定的传给所有 agent。

```python
# src/utils/prompts.py 片段

def render_author_comments(grouped: list[dict], target_agent: str | None) -> str:
    """把段落评论渲染为 prompt 文本片段。"""
    if not grouped:
        return "（作者未留段落评论）"
    lines = ["# 作者段落评论"]
    for bucket in grouped:
        lines.append(f"\n## 段落 #{bucket['pid']}（{bucket['textHead'][:20]}…）")
        for thread in bucket["threads"]:
            c = thread["comment"]
            # 按 targetAgent 过滤
            hints = c.get("agentHints") or {}
            ta = hints.get("targetAgent")
            if target_agent and ta and ta != target_agent:
                continue
            lines.append(f"- [{c['type']}] {c['content']}")
            for r in thread["replies"]:
                lines.append(f"  - 回复：{r['content']}")
    return "\n".join(lines)
```

### 9.5 前端导出格式（`exportForAgents`）

为兼容"无 GitHub 配置"场景，前端仍提供导出按钮，产出与仓库文件一致的 AI 友好结构：

```js
function exportForAgents(notePath) {
    var path = notePath || currentNotePath;
    var comments = Storage.loadComments(path).filter(function (c) { return !c.deleted; });
    var grouped = groupByParagraph(comments);
    var parts = path.replace(/\.md$/, '').split(/[\/\\]/);
    var data = {
        schemaVersion: 1,
        exportedAt: nowISO(),
        notePath: path,
        book: parts[0] || '',
        chapter: parts.length > 1 ? parts[1] : '',
        event: parts.length > 2 ? parts.slice(2).join('_') : '',
        paragraphs: grouped.map(function (b) {
            return {
                pid: b.pid,
                fingerprint: b.fingerprint,
                textHead: b.textHead,
                threads: b.threads
            };
        })
    };
    downloadJSON(data, 'paragraph_comments_' + path.replace(/[\/\\]/g, '_') + '.json');
}
```

### 9.6 "复制为 Prompt 上下文"按钮

```js
function copyAsPromptContext(notePath) {
    var comments = Storage.loadComments(notePath).filter(function (c) { return !c.deleted; });
    var grouped = groupByParagraph(comments);
    var lines = ['# 作者段落评论', '笔记：' + notePath, ''];
    grouped.forEach(function (b) {
        lines.push('## 段落 #' + b.pid + '（' + b.textHead.slice(0, 20) + '…）');
        b.threads.forEach(function (t) {
            var c = t.comment;
            lines.push('- [' + c.type + '] ' + c.content);
            t.replies.forEach(function (r) { lines.push('  - 回复：' + r.content); });
        });
        lines.push('');
    });
    copyToClipboard(lines.join('\n'));
}
```

---

## 10. 性能与边界

### 10.1 性能预算

| 操作 | 预算 | 说明 |
|---|---|---|
| 段落标记注入 | < 50ms / 100 段 | `querySelectorAll` + `setAttribute` |
| 徽章渲染 | < 30ms / 100 段 | 批量插入 |
| 浮层打开 | < 16ms | 复用 DOM，只更新内容 |
| 本地评论加载 | < 5ms | localStorage 直读 |
| 远端评论拉取 | 200-800ms | CDN，不阻塞 UI |
| PUT 同步 | 500-2000ms | 异步，不阻塞 UI |

### 10.2 大量评论时的渲染策略

- **段落标记延迟注入**：`requestIdleCallback`，不阻塞首屏。
- **徽章批量渲染**：一次 `querySelectorAll`，按 pid 分组后批量插入。
- **浮层虚拟列表**：单段落评论 > 50 条时启用。
- **防抖**：写入同步防抖 2 秒；`resize` 防抖 150ms。
- **避免重渲染**：评论增删只操作对应 DOM 节点，不重写 `.markdown-body` innerHTML。

### 10.3 localStorage 容量限制

- 单域名约 5–10 MB。单条评论约 0.5–2 KB，可存数千条。
- **配额监控**：`saveComments` 时 `try/catch`，捕获 `QuotaExceededError` 后提示用户导出并清理。
- **分片**：已按 notePath 分片。
- **远端兜底**：localStorage 满后，新评论仍可写入 pending 队列（队列单独计），同步到远端后可清理本地。

### 10.4 GitHub API 边界

- **配额**：认证后 5000 次/小时。读取走 CDN 不消耗配额；写入按 notePath 分组，单次 PUT 含该 notePath 所有 pending 操作。
- **限流响应**：403/429 时读取 `X-RateLimit-Reset` 头，提示用户等待，操作留队。
- **文件大小**：单文件 < 100MB（GitHub 限制）。单 notePath 评论数 < 10000 条无压力。
- **并发**：前端串行 PUT（同 notePath），避免并发冲突。

### 10.5 其他边界

- **笔记删除/重命名**：`site/data/comments/` 会残留文件。提供"清理无效评论"按钮，比对 `data/index.json` 的 `notes` 字段，删除不存在的 notePath 评论（本地 + 远端）。
- **多标签页同步**：监听 `window.addEventListener('storage', ...)`，当其他标签页修改 `pc:comments:*` 时刷新当前视图。
- **无痕模式**：localStorage 可能不可用，`attach` 时 `try/catch`，降级为"只读不存"模式并提示。
- **原文大改**：段落增删导致 `data-pid` 错位时，`resolveParagraph` 三级容错兜底；全部失败则评论以"未定位"状态展示在汇总区，不高亮段落。
- **token 失效**：PUT 返回 401 时清除 `pc:config`，提示用户重新配置。
- **CDN 缓存延迟**：jsdelivr 有 ~10 分钟缓存，刚写入的评论可能读不到。写入成功后前端立即用本地数据更新 UI，不依赖 CDN 回读。

---

## 附录 A：落地顺序建议（给实现 agent）

1. **存储层**：`Storage` 对象 + `Comment`/`ParagraphAnchor` 数据结构 + 控制台手测。
2. **段落定位**：`injectParagraphIds` + `computeParagraphFingerprint` + `resolveParagraph`，用一个固定笔记手测点击→保存→刷新→找回。
3. **本地 CRUD**：`addComment`/`replyComment`/`resolveComment`/`deleteComment`，纯 localStorage。
4. **手机端交互**：触摸事件 + 浮层定位 + 徽章渲染。
5. **GitHub 集成**：`fetchRemoteComments` + `getRemoteSha` + `putRemoteComments` + 冲突重试。
6. **离线队列**：`SyncQueue` + `online`/`offline` 事件。
7. **导出/导入**：`exportNote`/`exportAll`/`exportForAgents`/`importJSON`。
8. **AI 消费侧**：`file_manager.load_paragraph_comments` + `AgentState.author_comments` + prompt 渲染。
9. **集成测试**：改 `app.js` 加 `note:loaded`，`index.html` 加资源引用，端到端验证。

每一步都可在浏览器控制台通过 `window.ParagraphComments.*` 独立验证。

---

## 附录 B：与选区级评论系统（`docs/comments-system/`）的并存

| 维度 | 选区级（`drc:`） | 段落级（`pc:`，本方案） |
|---|---|---|
| 锚定粒度 | 字符区间（Range） | 整段 `<p>` |
| 存储前缀 | `drc:` | `pc:` |
| 持久化 | 仅 localStorage | localStorage + GitHub 仓库 |
| AI 消费 | 手动导出 JSON | 仓库直读 |
| 移动端体验 | 差（选区难操作） | 优（点击段落） |
| 原文改动容错 | 三级（精确偏移→quote→指纹） | 三级（pid→指纹→textHead） |

两套系统可并存于同一站点（前缀不冲突），但建议**新部署优先用段落级**，选区级作为桌面端增强保留。若要二选一，段落级在移动端与持久化上明显更优。
