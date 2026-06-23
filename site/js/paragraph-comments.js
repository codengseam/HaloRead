/* ============================================================
 * 段落评论系统（段评 / 章评）· 番茄起点式段落级评论
 * 纯 vanilla JS，IIFE 封装，暴露 window.ParagraphComments
 *
 * 核心能力：
 *   - 监听 note:loaded 事件自动接入，给段落注入 data-pid + 文本指纹
 *   - 段落右侧朱砂计数徽章，点击段落展开段评浮层
 *   - 5 种评论类型（error/praise/discussion/supplement/thought），传统色彩
 *   - 点赞（防重复）、多级回复、软删除
 *   - 章评（文末整章评论，paragraphId = __chapter__）
 *   - 双通道存储：localStorage 即时 + GitHub Contents API 持久化
 *   - 离线队列、冲突合并（409 重试）、CDN 读取
 *   - 导出 / 导入 JSON（deep-reading-paragraph-comments/v1 schema）
 *   - 专家团触发：生成 expert_review_request.json
 *   - 配置面板：GitHub token/repo/owner
 *   - XSS 防护：escapeHtml + createElement/textContent
 *   - 手机端优先：触摸事件、底部抽屉、软键盘适配
 *
 * 依赖：无（仅浏览器原生 API）
 * ============================================================ */

(function () {
    'use strict';

    /* ========================================================
     * 一、常量定义
     * ======================================================== */

    var SCHEMA = 'deep-reading-paragraph-comments/v1';
    var STORAGE_PREFIX = 'pc:';
    var META_KEY = 'pc:meta';
    var PENDING_KEY = 'pc:pending';
    var CONFIG_KEY = 'pc:config';
    var AUTHOR_ID_KEY = 'pc:authorId';
    var AUTHOR_NAME_KEY = 'pc:authorName';
    var LIKED_KEY = 'pc:liked';
    var ANCHOR_SCHEMA_VERSION = 1;

    // 段落指纹：前 20 字 + 后 20 字
    var FP_HEAD_LEN = 20;
    var FP_TAIL_LEN = 20;
    var PREVIEW_LEN = 60;

    // 可批注块级元素选择器（排除标题、代码块、表格单元格）
    var ANNOTATABLE_SELECTOR = '.markdown-body p, .markdown-body blockquote p, .markdown-body li > p';

    // 5 种评论类型 → 传统色彩（朱/赭/青/墨/黛）+ 印章单字
    var COMMENT_TYPES = {
        error:       { label: '错误指正', seal: '误', color: '#c0392b', agents: ['historian', 'context_analyst', 'editor'] },
        praise:      { label: '写得好',   seal: '赞', color: '#a0522d', agents: ['critic'] },
        discussion:  { label: '讨论',     seal: '议', color: '#5a7a8a', agents: ['philosopher', 'critic'] },
        supplement:  { label: '补充',     seal: '补', color: '#5a5651', agents: ['historian', 'context_analyst', 'editor'] },
        thought:     { label: '感想',     seal: '感', color: '#7a5a8a', agents: [] }
    };
    var CHAPTER_TYPE = { label: '章评', seal: '章', color: '#c0392b', agents: [] };

    var AGENT_LABELS = {
        historian: '史官',
        biographer: '传记官',
        context_analyst: '背景分析',
        critic: '名家点评',
        philosopher: '问道',
        editor: '编辑'
    };
    var ALL_AGENTS = ['historian', 'biographer', 'context_analyst', 'critic', 'philosopher', 'editor'];

    var MAX_RETRY = 3;          // PUT 冲突重试上限
    var MAX_PENDING_RETRIES = 5; // 离线队列重试上限
    var MAX_CONTENT_LEN = 2000;  // 评论正文上限
    var SYNC_DEBOUNCE_MS = 2000; // 同步防抖
    var VIRTUAL_LIST_THRESHOLD = 50; // 虚拟列表阈值

    var CHAPTER_PID = '__chapter__';

    /* ========================================================
     * 二、模块私有状态
     * ======================================================== */

    var currentNotePath = null;
    var currentContainer = null;
    var currentMeta = null;
    var paragraphMap = null;        // Map<pid(number), fingerprint(string)>
    var storageAvailable = true;
    var seqCounter = 0;
    var selectedType = 'discussion';
    var activeParagraphEl = null;   // 当前展开浮层对应的段落元素
    var activePid = null;           // 当前段落 pid 字符串（或 __chapter__）
    var isChapterMode = false;      // 是否章评模式

    // DOM 引用（惰性创建）
    var panelEl = null;
    var panelHeaderEl = null;
    var panelCountEl = null;
    var panelListEl = null;
    var panelQuoteEl = null;
    var inputEl = null;
    var typeSelectorEl = null;
    var authorNameEl = null;
    var submitBtnEl = null;
    var backdropEl = null;
    var configModalEl = null;
    var syncBadgeEl = null;

    /* ========================================================
     * 三、工具函数
     * ======================================================== */

    /** HTML 转义，防 XSS */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    /** 生成唯一评论 ID：pc_<timestamp>_<seq>（章评用 cc_ 前缀） */
    function generateId(prefix) {
        var p = prefix || 'pc';
        seqCounter++;
        return p + '_' + Date.now() + '_' + seqCounter;
    }

    /** 生成 ISO 8601 时间戳 */
    function nowISO() {
        return new Date().toISOString();
    }

    /** 防抖 */
    function debounce(fn, ms) {
        var timer = null;
        return function () {
            var ctx = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
        };
    }

    /** 简单字符串哈希（djb2 变体），返回 8 位十六进制 */
    function simpleHash(str) {
        var hash = 5381;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    /** 简易编辑距离（Levenshtein），限制最大长度 64 */
    function editDistance(a, b) {
        if (a === b) return 0;
        if (!a) return b ? b.length : 0;
        if (!b) return a.length;
        var maxLen = 64;
        if (a.length > maxLen) a = a.slice(0, maxLen);
        if (b.length > maxLen) b = b.slice(0, maxLen);
        var m = a.length, n = b.length;
        var prev = new Array(n + 1);
        var curr = new Array(n + 1);
        for (var j = 0; j <= n; j++) prev[j] = j;
        for (var i = 1; i <= m; i++) {
            curr[0] = i;
            for (var j = 1; j <= n; j++) {
                var cost = a[i - 1] === b[j - 1] ? 0 : 1;
                curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            }
            var tmp = prev; prev = curr; curr = tmp;
        }
        return prev[n];
    }

    /** 安全地设置文本内容（防 XSS） */
    function setText(node, text) {
        if (node) node.textContent = text == null ? '' : String(text);
    }

    /** 创建元素并设置属性（不接触 innerHTML） */
    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            for (var k in attrs) {
                if (!attrs.hasOwnProperty(k)) continue;
                if (k === 'className') node.className = attrs[k];
                else if (k === 'text') setText(node, attrs[k]);
                else if (k.indexOf('data-') === 0) node.setAttribute(k, attrs[k]);
                else if (k === 'aria') {
                    for (var a in attrs.aria) node.setAttribute('aria-' + a, attrs.aria[a]);
                } else node.setAttribute(k, attrs[k]);
            }
        }
        if (children) {
            if (!Array.isArray(children)) children = [children];
            children.forEach(function (c) {
                if (c == null) return;
                if (typeof c === 'string') setText(node, c);
                else if (typeof c === 'number') setText(node, String(c));
                else node.appendChild(c);
            });
        }
        return node;
    }

    /** 下载 JSON 文件 */
    function downloadJSON(data, filename) {
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /** 显示 toast 提示 */
    function showToast(message) {
        var existing = document.getElementById('pcToast');
        if (existing) existing.remove();
        var toast = el('div', { id: 'pcToast', className: 'pc-toast' }, message);
        toast.style.cssText = 'position:fixed;top:75px;left:50%;transform:translateX(-50%);' +
            'padding:8px 20px;background:#2c2c2c;color:#fff;border-radius:4px;font-size:0.88rem;' +
            'z-index:3000;box-shadow:0 4px 12px rgba(0,0,0,0.2);font-family:var(--font-sans);' +
            'transition:opacity 0.3s ease;max-width:90vw;text-align:center;';
        document.body.appendChild(toast);
        setTimeout(function () {
            toast.style.opacity = '0';
            setTimeout(function () { toast.remove(); }, 300);
        }, 2500);
    }

    /** 复制到剪贴板 */
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
        } else {
            fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(textarea);
    }

    /** 格式化时间 */
    function formatTime(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch (e) { return iso; }
    }

    function getDateStr() {
        var d = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    }

    function sleep(ms) {
        return new Promise(function (r) { setTimeout(r, ms); });
    }

    /** 按字段分组 */
    function groupBy(arr, keyFn) {
        var map = {};
        for (var i = 0; i < arr.length; i++) {
            var key = keyFn(arr[i]);
            if (!map[key]) map[key] = [];
            map[key].push(arr[i]);
        }
        return map;
    }

    /** UTF-8 安全 base64 编码 */
    function utf8ToBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    /** UTF-8 安全 base64 解码 */
    function base64ToUtf8(b64) {
        return decodeURIComponent(escape(atob(b64)));
    }

    /* ========================================================
     * 四、段落定位算法（data-pid + 文本指纹）
     * ======================================================== */

    /**
     * 计算段落文本指纹。
     * 规则：归一化文本 → 取前 20 字 + "‖" + 后 20 字 → simpleHash。
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
     * 为容器内每个可批注段落注入 data-pid 与文本指纹。
     * 同时遍历 h2-h4 标题，为每段计算 headingPath 并存入 data-hp。
     * @param {Element} container  .markdown-body 元素
     * @returns {{ count: number, fingerprints: Map }}
     */
    function injectParagraphIds(container) {
        // 同时查询段落与标题，按文档顺序遍历以维护 headingPath
        var all = container.querySelectorAll(
            '.markdown-body p, .markdown-body blockquote p, .markdown-body li > p, ' +
            '.markdown-body h2, .markdown-body h3, .markdown-body h4, ' +
            'p, blockquote p, li > p, h2, h3, h4'
        );
        var fingerprints = new Map();
        var pid = 0;
        var headingPath = [];
        var list = Array.prototype.slice.call(all);
        for (var i = 0; i < list.length; i++) {
            var node = list[i];
            var tag = node.tagName;
            // 标题：更新 headingPath
            if (tag === 'H2' || tag === 'H3' || tag === 'H4') {
                var level = parseInt(tag.charAt(1), 10);
                // 截断到当前层级之前，再追加
                headingPath = headingPath.slice(0, level - 2);
                var headingText = (node.textContent || '').replace(/\s+/g, ' ').trim();
                if (headingText) headingPath.push(headingText);
                continue;
            }
            // 段落：跳过空段
            var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length === 0) continue;
            // 跳过已设置 data-pid 的嵌套段落（避免 blockquote p 与 p 重复计数）
            if (node.hasAttribute('data-pid')) continue;
            node.setAttribute('data-pid', String(pid));
            var fp = computeParagraphFingerprint(node);
            node.setAttribute('data-fp', fp);
            try {
                node.setAttribute('data-hp', JSON.stringify(headingPath));
            } catch (e) {
                node.setAttribute('data-hp', '[]');
            }
            fingerprints.set(pid, fp);
            pid++;
        }
        return { count: pid, fingerprints: fingerprints };
    }

    /**
     * 从段落元素构建 paragraphId 字符串：p_<index>_<fingerprint>
     */
    function buildParagraphId(paragraph) {
        if (!paragraph) return null;
        var pid = paragraph.getAttribute('data-pid');
        if (pid == null) return null;
        var fp = paragraph.getAttribute('data-fp') || computeParagraphFingerprint(paragraph);
        return 'p_' + pid + '_' + fp;
    }

    /**
     * 从 paragraphId 解析出 index
     */
    function parsePidIndex(paragraphId) {
        if (!paragraphId || paragraphId === CHAPTER_PID) return -1;
        var m = paragraphId.match(/^p_(\d+)_/);
        return m ? parseInt(m[1], 10) : -1;
    }

    /**
     * 从 paragraphId 解析出 fingerprint
     */
    function parsePidFingerprint(paragraphId) {
        if (!paragraphId || paragraphId === CHAPTER_PID) return null;
        var m = paragraphId.match(/^p_\d+_([0-9a-f]+)$/);
        return m ? m[1] : null;
    }

    /**
     * 获取段落预览文本（前 60 字归一化）
     */
    function getParagraphPreview(paragraph) {
        if (!paragraph) return '';
        var raw = paragraph.textContent || '';
        var normalized = raw.replace(/\s+/g, ' ').trim();
        return normalized.slice(0, PREVIEW_LEN);
    }

    /**
     * 从段落元素读取 headingPath（由 injectParagraphIds 写入 data-hp）。
     * @returns {string[]}
     */
    function getParagraphHeadingPath(paragraph) {
        if (!paragraph) return [];
        var raw = paragraph.getAttribute('data-hp');
        if (!raw) return [];
        try { return JSON.parse(raw) || []; }
        catch (e) { return []; }
    }

    /**
     * 构建段落元信息对象（spec 4.3）。
     * 兼容旧数据：若传入字符串则视为 preview。
     * @param {string} paragraphId
     * @param {string|object} previewOrMeta  预览文本或已有 paragraph 对象
     * @param {Element} [paragraphEl]  段落 DOM 元素（用于读取 headingPath）
     * @returns {{index, headingPath, textFingerprint, preview}}
     */
    function buildParagraphMeta(paragraphId, previewOrMeta, paragraphEl) {
        var preview = '';
        if (typeof previewOrMeta === 'string') {
            preview = previewOrMeta;
        } else if (previewOrMeta && typeof previewOrMeta === 'object') {
            return previewOrMeta; // 已是对象，原样返回
        }
        var headingPath = [];
        if (paragraphEl) headingPath = getParagraphHeadingPath(paragraphEl);
        return {
            index: parsePidIndex(paragraphId),
            headingPath: headingPath,
            textFingerprint: parsePidFingerprint(paragraphId) || '',
            preview: preview || ''
        };
    }

    /**
     * 兼容读取段评的 paragraph.preview（旧数据可能是字符串）。
     * @returns {string}
     */
    function commentPreview(comment) {
        if (!comment) return '';
        var p = comment.paragraph;
        if (!p) return '';
        if (typeof p === 'string') return p;
        return p.preview || '';
    }

    /**
     * 在当前容器内解析段落锚点，返回对应的 <p> 元素。
     * 三级策略：精确 pid + 指纹校验 → 指纹全局匹配 → textHead 模糊匹配。
     * @param {number} pidIndex
     * @param {string} fingerprint
     * @param {Element} container
     * @param {string} [textHead]  段落预览前 20 字，用于第三级模糊匹配
     * @returns {{ element: Element, pid: number, relocated: boolean } | null}
     */
    function resolveParagraph(pidIndex, fingerprint, container, textHead) {
        if (!container) return null;

        // —— 级别 1：精确 pid + 指纹校验 ——
        var exact = container.querySelector('[data-pid="' + CSS.escape(String(pidIndex)) + '"]');
        if (exact) {
            var exactFp = exact.getAttribute('data-fp') || computeParagraphFingerprint(exact);
            if (exactFp === fingerprint) {
                return { element: exact, pid: pidIndex, relocated: false };
            }
        }

        // —— 级别 2：指纹全局匹配（pid 可能漂移）——
        var paragraphs = container.querySelectorAll('[data-fp]');
        for (var i = 0; i < paragraphs.length; i++) {
            var p = paragraphs[i];
            var fp = p.getAttribute('data-fp') || computeParagraphFingerprint(p);
            if (fp === fingerprint) {
                var newPid = parseInt(p.getAttribute('data-pid'), 10);
                return { element: p, pid: newPid, relocated: newPid !== pidIndex };
            }
        }

        // —— 级别 3：textHead 模糊匹配（前 20 字编辑距离 ≤ 2）——
        if (textHead) {
            var targetHead = textHead.slice(0, 20);
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
        }

        return null;
    }

    /* ========================================================
     * 五、存储层（localStorage）
     * ======================================================== */

    var Storage = {
        /** 检测 localStorage 是否可用 */
        checkAvailable: function () {
            try {
                var k = '__pc_test__';
                localStorage.setItem(k, '1');
                localStorage.removeItem(k);
                return true;
            } catch (e) {
                return false;
            }
        },

        /** 加载单篇笔记的评论 */
        loadComments: function (notePath) {
            if (!storageAvailable) return [];
            try {
                var raw = localStorage.getItem(STORAGE_PREFIX + 'comments:' + notePath);
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                console.error('[PC] 加载评论失败:', e);
                return [];
            }
        },

        /** 保存单篇笔记的评论 */
        saveComments: function (notePath, comments) {
            if (!storageAvailable) {
                showToast('本地存储不可用，段评无法保存');
                return false;
            }
            try {
                localStorage.setItem(STORAGE_PREFIX + 'comments:' + notePath, JSON.stringify(comments));
                return true;
            } catch (e) {
                if (e && e.name === 'QuotaExceededError') {
                    showToast('本地存储已满，请导出后清理');
                } else {
                    console.error('[PC] 保存评论失败:', e);
                }
                return false;
            }
        },

        /** 加载全站评论 */
        loadAllComments: function () {
            var result = {};
            if (!storageAvailable) return result;
            try {
                for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    if (key && key.indexOf(STORAGE_PREFIX + 'comments:') === 0) {
                        var notePath = key.slice((STORAGE_PREFIX + 'comments:').length);
                        result[notePath] = JSON.parse(localStorage.getItem(key));
                    }
                }
            } catch (e) {
                console.error('[PC] 加载全部评论失败:', e);
            }
            return result;
        },

        /** 删除单篇笔记的所有评论 */
        deleteNote: function (notePath) {
            if (!storageAvailable) return;
            try { localStorage.removeItem(STORAGE_PREFIX + 'comments:' + notePath); }
            catch (e) { console.error('[PC] 删除笔记评论失败:', e); }
        },

        /** 加载离线队列 */
        loadPending: function () {
            if (!storageAvailable) return [];
            try {
                var raw = localStorage.getItem(PENDING_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (e) { return []; }
        },

        /** 保存离线队列 */
        savePending: function (pending) {
            if (!storageAvailable) return;
            try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); }
            catch (e) { console.error('[PC] 保存队列失败:', e); }
        },

        /** 加载元信息 */
        loadMeta: function () {
            if (!storageAvailable) return { schemaVersion: 1, lastSyncAt: null, pendingCount: 0 };
            try {
                var raw = localStorage.getItem(META_KEY);
                return raw ? JSON.parse(raw) : { schemaVersion: 1, lastSyncAt: null, pendingCount: 0 };
            } catch (e) { return { schemaVersion: 1 }; }
        },

        /** 更新元信息（合并） */
        updateMeta: function (patch) {
            if (!storageAvailable) return;
            try {
                var meta = this.loadMeta();
                Object.assign(meta, patch);
                localStorage.setItem(META_KEY, JSON.stringify(meta));
            } catch (e) { console.error('[PC] 更新元信息失败:', e); }
        },

        /** 加载配置 */
        loadConfig: function () {
            if (!storageAvailable) return null;
            try {
                var raw = localStorage.getItem(CONFIG_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (e) { return null; }
        },

        /** 保存配置 */
        saveConfig: function (config) {
            if (!storageAvailable) return;
            try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
            catch (e) { console.error('[PC] 保存配置失败:', e); }
        },

        /** 作者标识 */
        getAuthorId: function () {
            if (!storageAvailable) return 'anon_local';
            try {
                var id = localStorage.getItem(AUTHOR_ID_KEY);
                if (!id) {
                    id = 'local_' + simpleHash(String(Date.now()) + Math.random()).slice(0, 6);
                    localStorage.setItem(AUTHOR_ID_KEY, id);
                }
                return id;
            } catch (e) { return 'anon_local'; }
        },

        /** 作者昵称 */
        getAuthorName: function () {
            if (!storageAvailable) return '匿名读者';
            try {
                return localStorage.getItem(AUTHOR_NAME_KEY) || '匿名读者';
            } catch (e) { return '匿名读者'; }
        },

        setAuthorName: function (name) {
            if (!storageAvailable) return;
            try { localStorage.setItem(AUTHOR_NAME_KEY, name || '匿名读者'); }
            catch (e) {}
        },

        /** 已点赞集合 */
        loadLiked: function () {
            if (!storageAvailable) return {};
            try {
                var raw = localStorage.getItem(LIKED_KEY);
                return raw ? JSON.parse(raw) : {};
            } catch (e) { return {}; }
        },

        saveLiked: function (liked) {
            if (!storageAvailable) return;
            try { localStorage.setItem(LIKED_KEY, JSON.stringify(liked)); }
            catch (e) {}
        }
    };

    /* ========================================================
     * 六、GitHub 配置
     * ======================================================== */

    var GitHubConfig = {
        get: function () {
            var cfg = Storage.loadConfig();
            if (!cfg || !cfg.github) return null;
            return Object.assign({
                branch: 'main',
                commitPrefix: 'chore(comments): ',
                commentsDir: 'site/data/comments'
            }, cfg.github);
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

    /* ========================================================
     * 七、GitHub Contents API 集成
     * ======================================================== */

    /**
     * 将 notePath 编码为 comments 目录下的文件路径。
     * 规则："/" → "__"，".md" 保留，其余原样。
     * 例："资治通鉴/周纪一_三家分晋.md" → "site/data/comments/资治通鉴__周纪一_三家分晋.md"
     */
    function encodeCommentPath(notePath) {
        var encoded = notePath.replace(/\//g, '__');
        var dir = 'site/data/comments';
        var cfg = GitHubConfig.get();
        if (cfg && cfg.commentsDir) dir = cfg.commentsDir;
        return dir + '/' + encoded + '.json';
    }

    /** 构造仓库文件 URL 路径（每段 encodeURIComponent 但保留 /） */
    function encodeUrlPath(filePath) {
        return filePath.split('/').map(encodeURIComponent).join('/');
    }

    /**
     * 从 CDN/raw 读取远端评论。
     * @returns {Promise<{ comments: Comment[], sha: string|null, source: string }>}
     */
    async function fetchRemoteComments(notePath) {
        var cfg = GitHubConfig.get();
        if (!cfg || !cfg.owner || !cfg.repo) {
            return { comments: [], sha: null, source: 'not_configured' };
        }
        var filePath = encodeCommentPath(notePath);
        var encodedPath = encodeUrlPath(filePath);
        var branch = cfg.branch || 'main';

        // 优先 jsdelivr CDN
        var cdnUrl = 'https://cdn.jsdelivr.net/gh/' + cfg.owner + '/' + cfg.repo + '@' + branch + '/' + encodedPath;
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
        var rawUrl = 'https://raw.githubusercontent.com/' + cfg.owner + '/' + cfg.repo + '/' + branch + '/' + encodedPath;
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

    /**
     * 通过 GitHub Contents API 获取文件 sha 与内容。
     * @returns {Promise<{ sha: string|null, comments: Comment[] }>}
     */
    async function getRemoteSha(notePath) {
        var cfg = GitHubConfig.get();
        if (!cfg || !cfg.token) throw new Error('未配置 GitHub token');
        var filePath = encodeCommentPath(notePath);
        var encodedPath = encodeUrlPath(filePath);
        var url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encodedPath + '?ref=' + (cfg.branch || 'main');

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
        var content = data.content ? base64ToUtf8(data.content.replace(/\n/g, '')) : '{}';
        var parsed = JSON.parse(content);
        return { sha: data.sha, comments: parsed.comments || [] };
    }

    /**
     * 将评论写入远端。冲突时自动重试。
     * @param {string} notePath
     * @param {Comment[]} localComments  本地完整评论数组
     * @returns {Promise<{ sha: string, merged: Comment[] }>}
     */
    async function putRemoteComments(notePath, localComments) {
        var cfg = GitHubConfig.get();
        if (!cfg || !cfg.token) throw new Error('未配置 GitHub token');

        for (var attempt = 0; attempt < MAX_RETRY; attempt++) {
            // 1. 获取当前 SHA + 远端评论
            var remote = await getRemoteSha(notePath);

            // 2. 合并本地与远端
            var merged = mergeComments(localComments, remote.comments);

            // 3. 构造文件内容
            var fileContent = JSON.stringify({
                schema: SCHEMA,
                notePath: notePath,
                updatedAt: nowISO(),
                comments: merged
            }, null, 2);
            var base64Content = utf8ToBase64(fileContent);

            // 4. PUT
            var filePath = encodeCommentPath(notePath);
            var encodedPath = encodeUrlPath(filePath);
            var url = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encodedPath;
            var body = {
                message: cfg.commitPrefix + 'update comments for ' + notePath,
                content: base64Content,
                branch: cfg.branch || 'main'
            };
            if (remote.sha) body.sha = remote.sha;

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
                Storage.saveComments(notePath, merged);
                return { sha: data.content ? data.content.sha : null, merged: merged };
            }

            if (resp.status === 409) {
                console.warn('[PC] 冲突，重试 ' + (attempt + 1) + '/' + MAX_RETRY);
                await sleep(500 * (attempt + 1));
                continue;
            }

            if (resp.status === 422 && !remote.sha) {
                console.warn('[PC] 422，可能文件已存在，重试');
                continue;
            }

            // 401 token 失效
            if (resp.status === 401) {
                showToast('GitHub token 失效，请重新配置');
                throw new Error('token 失效');
            }
            // 403/429 限流
            if (resp.status === 403 || resp.status === 429) {
                var reset = resp.headers ? resp.headers.get('X-RateLimit-Reset') : null;
                var msg = 'GitHub API 限流';
                if (reset) {
                    var wait = parseInt(reset, 10) * 1000 - Date.now();
                    msg += '，需等待 ' + Math.ceil(wait / 1000) + ' 秒';
                }
                showToast(msg);
                throw new Error(msg);
            }

            var errBody = await resp.json().catch(function () { return {}; });
            throw new Error('PUT 失败: ' + resp.status + ' ' + (errBody.message || ''));
        }
        throw new Error('冲突重试 ' + MAX_RETRY + ' 次仍失败');
    }

    /* ========================================================
     * 八、冲突合并算法
     * ======================================================== */

    /**
     * 合并本地与远端评论。
     * 策略：按 id 去重，同 id 取 updatedAt 更新者；点赞取并集；回复按 id 并集。
     * @param {Comment[]} local
     * @param {Comment[]} remote
     * @returns {Comment[]} 合并结果
     */
    function mergeComments(local, remote) {
        var byId = {};
        // 先放远端（基线）
        (remote || []).forEach(function (c) { byId[c.id] = c; });
        // 再用本地覆盖（本地通常是更新的）
        (local || []).forEach(function (c) {
            var existing = byId[c.id];
            if (!existing) {
                byId[c.id] = c;
            } else {
                var localUpdated = new Date(c.updatedAt || c.createdAt || 0).getTime();
                var remoteUpdated = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
                var winner = localUpdated >= remoteUpdated ? c : existing;
                // 点赞并集
                var mergedLikedBy = uniqueArray((c.likedBy || []).concat(existing.likedBy || []));
                winner = Object.assign({}, winner, {
                    likedBy: mergedLikedBy,
                    likes: mergedLikedBy.length
                });
                // 回复并集（按 id 去重）
                var repliesById = {};
                (existing.replies || []).forEach(function (r) { repliesById[r.id] = r; });
                (c.replies || []).forEach(function (r) {
                    if (!repliesById[r.id]) repliesById[r.id] = r;
                    else {
                        var rLocal = new Date(r.createdAt || 0).getTime();
                        var rRemote = new Date(repliesById[r.id].createdAt || 0).getTime();
                        repliesById[r.id] = rLocal >= rRemote ? r : repliesById[r.id];
                    }
                });
                winner.replies = Object.keys(repliesById).map(function (k) { return repliesById[k]; });
                // 删除标记：较新者 deleted=true 则视为已删除
                if (winner.deleted === true) winner.deleted = true;
                byId[c.id] = winner;
            }
        });
        var merged = Object.keys(byId).map(function (k) { return byId[k]; });
        // 按 createdAt 升序
        merged.sort(function (a, b) {
            return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });
        return merged;
    }

    function uniqueArray(arr) {
        var seen = {};
        var result = [];
        for (var i = 0; i < arr.length; i++) {
            if (!seen[arr[i]]) {
                seen[arr[i]] = true;
                result.push(arr[i]);
            }
        }
        return result;
    }

    /* ========================================================
     * 九、离线队列
     * ======================================================== */

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
            // 联网且已配置则立即尝试同步
            if (navigator.onLine && GitHubConfig.isConfigured()) {
                scheduleSync(op.notePath);
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
            if (!navigator.onLine) return { processed: 0, failed: 0, reason: 'offline' };
            if (!GitHubConfig.isConfigured()) return { processed: 0, failed: 0, reason: 'not_configured' };

            var pending = Storage.loadPending();
            if (pending.length === 0) return { processed: 0, failed: 0 };

            var processed = 0, failed = 0;
            var byNote = groupBy(pending, function (op) { return op.notePath; });
            for (var notePath in byNote) {
                if (!byNote.hasOwnProperty(notePath)) continue;
                var ops = byNote[notePath];
                try {
                    var local = Storage.loadComments(notePath);
                    await putRemoteComments(notePath, local);
                    ops.forEach(function (op) { SyncQueue.dequeue(op.id); });
                    // 更新 syncedAt
                    var updated = Storage.loadComments(notePath).map(function (c) {
                        c.syncedAt = nowISO();
                        return c;
                    });
                    Storage.saveComments(notePath, updated);
                    processed += ops.length;
                } catch (err) {
                    failed += ops.length;
                    ops.forEach(function (op) {
                        op.retryCount = (op.retryCount || 0) + 1;
                        op.lastError = String((err && err.message) || err);
                        if (op.retryCount >= MAX_PENDING_RETRIES) op.giveUp = true;
                    });
                }
            }
            // 移除放弃的操作
            var remaining = Storage.loadPending().filter(function (p) { return !p.giveUp; });
            Storage.savePending(remaining);
            Storage.updateMeta({
                lastSyncAt: nowISO(),
                lastSyncResult: { processed: processed, failed: failed },
                pendingCount: remaining.length
            });
            return { processed: processed, failed: failed };
        }
    };

    var debouncedSync = debounce(function (notePath) {
        SyncQueue.process();
    }, SYNC_DEBOUNCE_MS);

    function scheduleSync(notePath) {
        debouncedSync(notePath);
    }

    /* ========================================================
     * 十、评论数据操作（CRUD）
     * ======================================================== */

    /**
     * 创建评论对象
     * @param {string} notePath
     * @param {string} paragraphId
     * @param {string|object} paragraphMeta  预览文本或已构建的 paragraph 对象
     * @param {string} content
     * @param {string} type
     * @param {string} author
     * @param {string} authorId
     * @param {Element} [paragraphEl]  段落 DOM 元素（用于读取 headingPath）
     */
    function createComment(notePath, paragraphId, paragraphMeta, content, type, author, authorId, paragraphEl) {
        return {
            id: generateId(paragraphId === CHAPTER_PID ? 'cc' : 'pc'),
            notePath: notePath,
            paragraphId: paragraphId,
            paragraph: buildParagraphMeta(paragraphId, paragraphMeta, paragraphEl),
            content: content,
            type: type || 'discussion',
            author: author || '匿名读者',
            authorId: authorId || Storage.getAuthorId(),
            createdAt: nowISO(),
            updatedAt: nowISO(),
            likes: 0,
            likedBy: [],
            replies: [],
            expertReviews: [],
            deleted: false,
            syncedAt: null
        };
    }

    /**
     * 添加段评
     * @param {string} notePath
     * @param {string} pid  段落 paragraphId（p_<index>_<fp>）或 __chapter__
     * @param {string} content
     * @param {object} opts  { type, author, paragraphPreview, paragraphEl }
     * @returns {Promise<Comment>}
     */
    async function addComment(notePath, pid, content, opts) {
        opts = opts || {};
        content = (content || '').trim();
        if (!content) throw new Error('评论内容不能为空');
        if (content.length > MAX_CONTENT_LEN) content = content.slice(0, MAX_CONTENT_LEN);

        var type = opts.type || 'discussion';
        if (pid === CHAPTER_PID) type = 'chapter';
        if (!COMMENT_TYPES[type] && type !== 'chapter') type = 'discussion';

        var author = opts.author || Storage.getAuthorName();
        var authorId = Storage.getAuthorId();
        var preview = opts.paragraphPreview || '';
        var paragraphEl = opts.paragraphEl || null;

        var comment = createComment(notePath, pid, preview, content, type, author, authorId, paragraphEl);

        var comments = Storage.loadComments(notePath);
        comments.push(comment);
        Storage.saveComments(notePath, comments);

        // 入离线队列
        SyncQueue.enqueue({
            id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'upsert',
            notePath: notePath,
            commentId: comment.id,
            payload: comment,
            createdAt: nowISO(),
            retryCount: 0,
            lastError: null
        });

        return comment;
    }

    /**
     * 回复评论
     */
    async function replyComment(notePath, commentId, content) {
        content = (content || '').trim();
        if (!content) throw new Error('回复内容不能为空');
        if (content.length > MAX_CONTENT_LEN) content = content.slice(0, MAX_CONTENT_LEN);

        var comments = Storage.loadComments(notePath);
        var comment = comments.find(function (c) { return c.id === commentId; });
        if (!comment) throw new Error('评论不存在');
        if (!comment.replies) comment.replies = [];

        var reply = {
            id: generateId('r'),
            content: content,
            author: Storage.getAuthorName(),
            authorId: Storage.getAuthorId(),
            createdAt: nowISO()
        };
        comment.replies.push(reply);
        comment.updatedAt = nowISO();
        Storage.saveComments(notePath, comments);

        SyncQueue.enqueue({
            id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'reply',
            notePath: notePath,
            commentId: comment.id,
            payload: reply,
            createdAt: nowISO(),
            retryCount: 0,
            lastError: null
        });

        return reply;
    }

    /**
     * 删除评论（软删除）
     */
    async function deleteComment(notePath, commentId) {
        var comments = Storage.loadComments(notePath);
        var comment = comments.find(function (c) { return c.id === commentId; });
        if (!comment) return;
        comment.deleted = true;
        comment.updatedAt = nowISO();
        Storage.saveComments(notePath, comments);

        SyncQueue.enqueue({
            id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'delete',
            notePath: notePath,
            commentId: comment.id,
            payload: null,
            createdAt: nowISO(),
            retryCount: 0,
            lastError: null
        });
    }

    /**
     * 删除回复
     */
    async function deleteReply(notePath, commentId, replyId) {
        var comments = Storage.loadComments(notePath);
        var comment = comments.find(function (c) { return c.id === commentId; });
        if (!comment || !comment.replies) return;
        comment.replies = comment.replies.filter(function (r) { return r.id !== replyId; });
        comment.updatedAt = nowISO();
        Storage.saveComments(notePath, comments);

        SyncQueue.enqueue({
            id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'upsert',
            notePath: notePath,
            commentId: comment.id,
            payload: comment,
            createdAt: nowISO(),
            retryCount: 0,
            lastError: null
        });
    }

    /**
     * 切换点赞
     */
    async function toggleLike(notePath, commentId) {
        var authorId = Storage.getAuthorId();
        var comments = Storage.loadComments(notePath);
        var comment = comments.find(function (c) { return c.id === commentId; });
        if (!comment) return;
        if (!comment.likedBy) comment.likedBy = [];
        var idx = comment.likedBy.indexOf(authorId);
        if (idx === -1) {
            comment.likedBy.push(authorId);
            comment.likes = comment.likedBy.length;
        } else {
            comment.likedBy.splice(idx, 1);
            comment.likes = comment.likedBy.length;
        }
        comment.updatedAt = nowISO();
        Storage.saveComments(notePath, comments);

        // 冗余防重复
        var liked = Storage.loadLiked();
        liked[commentId] = comment.likedBy.indexOf(authorId) !== -1;
        Storage.saveLiked(liked);

        SyncQueue.enqueue({
            id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'like',
            notePath: notePath,
            commentId: comment.id,
            payload: { likedBy: comment.likedBy, likes: comment.likes },
            createdAt: nowISO(),
            retryCount: 0,
            lastError: null
        });

        return comment;
    }

    /**
     * 编辑评论
     */
    async function editComment(notePath, commentId, newContent, newType) {
        newContent = (newContent || '').trim();
        if (!newContent) throw new Error('评论内容不能为空');
        if (newContent.length > MAX_CONTENT_LEN) newContent = newContent.slice(0, MAX_CONTENT_LEN);

        var comments = Storage.loadComments(notePath);
        var comment = comments.find(function (c) { return c.id === commentId; });
        if (!comment) throw new Error('评论不存在');
        comment.content = newContent;
        if (newType && (COMMENT_TYPES[newType] || newType === 'chapter')) comment.type = newType;
        comment.updatedAt = nowISO();
        Storage.saveComments(notePath, comments);

        SyncQueue.enqueue({
            id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: 'upsert',
            notePath: notePath,
            commentId: comment.id,
            payload: comment,
            createdAt: nowISO(),
            retryCount: 0,
            lastError: null
        });

        return comment;
    }

    /* ========================================================
     * 十一、UI：段落计数徽章
     * ======================================================== */

    /**
     * 渲染段落计数徽章
     */
    function renderParagraphBadges(container, notePath) {
        if (!container || !notePath) return;
        // 清除旧徽章
        var oldBadges = container.querySelectorAll('.pc-badge');
        for (var i = 0; i < oldBadges.length; i++) oldBadges[i].remove();

        var comments = Storage.loadComments(notePath).filter(function (c) { return !c.deleted; });
        var byPid = groupBy(comments, function (c) { return c.paragraphId; });
        Object.keys(byPid).forEach(function (pid) {
            if (pid === CHAPTER_PID) return; // 章评不显示徽章
            var pidIndex = parsePidIndex(pid);
            var p = container.querySelector('[data-pid="' + CSS.escape(String(pidIndex)) + '"]');
            if (!p) return;
            // 校验指纹
            var fp = parsePidFingerprint(pid);
            if (fp) {
                var actualFp = p.getAttribute('data-fp') || computeParagraphFingerprint(p);
                if (actualFp !== fp) {
                    // 指纹不匹配，尝试重定位（带 textHead 启用第三级容错）
                    var head = commentPreview(byPid[pid][0]).slice(0, 20);
                    var resolved = resolveParagraph(pidIndex, fp, container, head);
                    if (resolved) p = resolved.element;
                    else return;
                }
            }
            var count = byPid[pid].length;
            if (count === 0) return;
            var badge = el('span', {
                className: 'pc-badge',
                'data-pid': pid,
                role: 'button',
                tabindex: '0',
                aria: { label: '第 ' + pidIndex + ' 段，' + count + ' 条段评' }
            }, String(count));
            p.appendChild(badge);
        });
    }

    /* ========================================================
     * 十二、UI：浮层 / 抽屉
     * ======================================================== */

    /** 确保浮层 DOM 已创建 */
    function ensurePanel() {
        if (panelEl) return;

        // 遮罩
        backdropEl = el('div', { id: 'pcBackdrop', className: 'pc-backdrop', 'aria-hidden': 'true' });
        backdropEl.addEventListener('click', hidePanel);
        document.body.appendChild(backdropEl);

        // 浮层
        panelEl = el('div', {
            id: 'pcPanel',
            className: 'pc-panel',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'pcPanelTitle',
            hidden: ''
        });

        // 抽屉手柄（移动端下滑关闭）
        var handle = el('div', { className: 'pc-panel-handle', 'aria-hidden': 'true' });
        panelEl.appendChild(handle);

        // 头部
        panelHeaderEl = el('header', { className: 'pc-popover-header' });
        var title = el('span', { id: 'pcPanelTitle', className: 'pc-panel-title' }, '段评');
        panelCountEl = el('span', { className: 'pc-panel-count' }, '');
        var syncBadge = el('span', { id: 'pcSyncBadge', className: 'pc-sync-badge', 'aria-live': 'polite' });
        var closeBtn = el('button', {
            type: 'button',
            className: 'pc-panel-close',
            'aria-label': '关闭'
        }, '×');
        closeBtn.addEventListener('click', hidePanel);
        panelHeaderEl.appendChild(title);
        panelHeaderEl.appendChild(panelCountEl);
        panelHeaderEl.appendChild(syncBadge);
        panelHeaderEl.appendChild(closeBtn);
        panelEl.appendChild(panelHeaderEl);
        syncBadgeEl = syncBadge;

        // 引用原文
        panelQuoteEl = el('div', { className: 'pc-panel-quote', id: 'pcPanelQuote' });
        panelEl.appendChild(panelQuoteEl);

        // 评论列表
        var listSection = el('section', { 'aria-label': '段评列表', className: 'pc-panel-list-section' });
        panelListEl = el('ul', { className: 'pc-panel-list', id: 'pcPanelList' });
        listSection.appendChild(panelListEl);
        panelEl.appendChild(listSection);

        // 输入区
        var compose = el('div', { className: 'pc-input-area' });
        authorNameEl = el('input', {
            type: 'text',
            className: 'pc-author-name',
            placeholder: '昵称',
            'aria-label': '昵称',
            maxlength: '20'
        });
        authorNameEl.value = Storage.getAuthorName();
        authorNameEl.addEventListener('change', function () {
            Storage.setAuthorName(authorNameEl.value.trim() || '匿名读者');
        });
        compose.appendChild(authorNameEl);

        inputEl = el('textarea', {
            className: 'pc-input',
            placeholder: '写下你对这段的评论…（Ctrl+Enter 提交）',
            'aria-label': '评论内容',
            maxlength: String(MAX_CONTENT_LEN)
        });
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitComment();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hidePanel();
            }
        });
        compose.appendChild(inputEl);

        // 类型选择器
        typeSelectorEl = el('div', { className: 'pc-type-selector', role: 'radiogroup', 'aria-label': '评论类型' });
        Object.keys(COMMENT_TYPES).forEach(function (type) {
            var info = COMMENT_TYPES[type];
            var btn = el('button', {
                type: 'button',
                className: 'pc-type-btn pc-type-' + type,
                role: 'radio',
                'aria-checked': type === selectedType ? 'true' : 'false',
                'data-type': type,
                style: '--pc-type-color: ' + info.color + ';'
            });
            var seal = el('span', { className: 'pc-seal pc-seal-' + type }, info.seal);
            btn.appendChild(seal);
            btn.appendChild(document.createTextNode(info.label));
            btn.addEventListener('click', function () {
                selectedType = type;
                typeSelectorEl.querySelectorAll('.pc-type-btn').forEach(function (b) {
                    b.setAttribute('aria-checked', b.getAttribute('data-type') === type ? 'true' : 'false');
                });
                inputEl.focus();
            });
            typeSelectorEl.appendChild(btn);
        });
        compose.appendChild(typeSelectorEl);

        // 提交按钮
        var actions = el('div', { className: 'pc-popover-footer' });
        submitBtnEl = el('button', { type: 'button', className: 'pc-submit-btn' }, '提交');
        submitBtnEl.addEventListener('click', submitComment);
        actions.appendChild(submitBtnEl);
        compose.appendChild(actions);

        panelEl.appendChild(compose);
        document.body.appendChild(panelEl);

        // 焦点陷阱
        panelEl.addEventListener('keydown', function (e) {
            if (e.key !== 'Tab') return;
            var focusables = panelEl.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled])');
            if (focusables.length === 0) return;
            var first = focusables[0];
            var last = focusables[focusables.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });

        // 下滑关闭手势（移动端）
        bindDrawerSwipe(handle, panelEl);

        // 软键盘适配
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onViewportResize);
        }
    }

    function onViewportResize() {
        if (!panelEl || panelEl.hidden) return;
        if (window.innerWidth <= 768 && window.visualViewport) {
            var keyboardHeight = window.innerHeight - window.visualViewport.height;
            if (keyboardHeight > 0) {
                panelEl.style.transform = 'translateY(-' + keyboardHeight + 'px)';
                panelEl.style.maxHeight = (window.visualViewport.height * 0.7) + 'px';
            } else {
                panelEl.style.transform = '';
                panelEl.style.maxHeight = '70vh';
            }
        }
    }

    /** 下滑关闭手势 */
    function bindDrawerSwipe(handle, panel) {
        var startY = 0;
        var currentY = 0;
        var dragging = false;
        handle.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            startY = e.touches[0].clientY;
            dragging = true;
            panel.style.transition = 'none';
        }, { passive: true });
        handle.addEventListener('touchmove', function (e) {
            if (!dragging) return;
            currentY = e.touches[0].clientY;
            var dy = currentY - startY;
            if (dy > 0) {
                panel.style.transform = 'translateY(' + dy + 'px)';
            }
        }, { passive: true });
        handle.addEventListener('touchend', function () {
            if (!dragging) return;
            dragging = false;
            panel.style.transition = '';
            var dy = currentY - startY;
            if (dy > 80) {
                hidePanel();
            } else {
                panel.style.transform = '';
            }
        }, { passive: true });
    }

    /** 显示浮层 */
    function showPanel(paragraph, pid, isChapter) {
        ensurePanel();
        activeParagraphEl = paragraph;
        activePid = pid;
        isChapterMode = !!isChapter;

        // 标题
        var titleEl = panelEl.querySelector('#pcPanelTitle');
        if (isChapter) {
            setText(titleEl, '章评');
        } else {
            var pidIndex = parsePidIndex(pid);
            setText(titleEl, '段评 · 第 ' + pidIndex + ' 段');
        }

        // 引用原文
        var preview = '';
        if (paragraph) {
            preview = getParagraphPreview(paragraph);
        }
        setText(panelQuoteEl, preview ? '「' + preview + '」' : '');

        // 清空输入
        inputEl.value = '';
        // 章评模式默认选中类型不可改（隐藏类型选择器）
        if (isChapter) {
            typeSelectorEl.style.display = 'none';
            selectedType = 'chapter';
        } else {
            typeSelectorEl.style.display = '';
            selectedType = 'discussion';
            typeSelectorEl.querySelectorAll('.pc-type-btn').forEach(function (b) {
                b.setAttribute('aria-checked', b.getAttribute('data-type') === selectedType ? 'true' : 'false');
            });
        }

        // 渲染评论列表
        renderCommentList();

        // 定位
        positionPanel(paragraph);

        // 显示
        panelEl.hidden = false;
        backdropEl.classList.add('open');
        panelEl.classList.add('open');

        // 更新同步状态
        updateSyncBadge();

        // 聚焦输入框
        setTimeout(function () { inputEl.focus(); }, 100);
    }

    /** 隐藏浮层 */
    function hidePanel() {
        if (!panelEl) return;
        panelEl.classList.remove('open');
        panelEl.hidden = true;
        panelEl.style.transform = '';
        panelEl.style.maxHeight = '';
        if (backdropEl) backdropEl.classList.remove('open');
        activeParagraphEl = null;
        activePid = null;
        isChapterMode = false;
    }

    /** 定位浮层（移动端底部抽屉 / 桌面端段落下方） */
    function positionPanel(paragraph) {
        if (!panelEl) return;
        if (window.innerWidth <= 768) {
            // 底部抽屉
            panelEl.classList.add('pc-panel-bottom');
            panelEl.style.left = '';
            panelEl.style.right = '';
            panelEl.style.top = '';
            panelEl.style.bottom = '';
            panelEl.style.width = '';
        } else {
            // 桌面悬浮
            panelEl.classList.remove('pc-panel-bottom');
            if (paragraph) {
                var rect = paragraph.getBoundingClientRect();
                var scrollY = window.scrollY;
                var panelWidth = 420;
                var left = rect.left + rect.width / 2 - panelWidth / 2;
                var top = rect.bottom + scrollY + 8;
                if (left < 10) left = 10;
                if (left + panelWidth > window.innerWidth - 10) left = window.innerWidth - panelWidth - 10;
                if (top + 400 > scrollY + window.innerHeight) {
                    top = rect.top + scrollY - 408;
                    if (top < scrollY + 60) top = scrollY + 60;
                }
                panelEl.style.left = left + 'px';
                panelEl.style.top = top + 'px';
                panelEl.style.right = 'auto';
                panelEl.style.bottom = 'auto';
                panelEl.style.width = panelWidth + 'px';
            }
        }
    }

    /** 更新同步状态徽标 */
    function updateSyncBadge() {
        if (!syncBadgeEl) return;
        var pending = Storage.loadPending();
        var meta = Storage.loadMeta();
        if (!GitHubConfig.isConfigured()) {
            syncBadgeEl.textContent = '未配置同步';
            syncBadgeEl.className = 'pc-sync-badge pc-offline';
        } else if (!navigator.onLine) {
            syncBadgeEl.textContent = '离线';
            syncBadgeEl.className = 'pc-sync-badge pc-offline';
        } else if (pending.length > 0) {
            syncBadgeEl.textContent = '待同步(' + pending.length + ')';
            syncBadgeEl.className = 'pc-sync-badge pc-loading';
        } else if (meta.lastSyncAt) {
            syncBadgeEl.textContent = '已同步';
            syncBadgeEl.className = 'pc-sync-badge';
        } else {
            syncBadgeEl.textContent = '';
            syncBadgeEl.className = 'pc-sync-badge';
        }
    }

    /* ========================================================
     * 十三、UI：评论列表渲染
     * ======================================================== */

    function renderCommentList() {
        if (!panelListEl || !currentNotePath) return;
        var comments = Storage.loadComments(currentNotePath).filter(function (c) {
            if (c.deleted) return false;
            if (isChapterMode) return c.paragraphId === CHAPTER_PID;
            return c.paragraphId === activePid;
        });
        // 按时间倒序（最新在上）
        comments.sort(function (a, b) {
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        // 计数
        setText(panelCountEl, comments.length + ' 条');

        // 清空
        panelListEl.innerHTML = '';

        if (comments.length === 0) {
            var empty = el('li', { className: 'pc-empty' });
            var icon = el('div', { className: 'pc-empty-icon' }, '✎');
            empty.appendChild(icon);
            empty.appendChild(document.createTextNode(isChapterMode ? '尚无章评，留下第一条吧' : '此段尚无段评，留下第一条吧'));
            panelListEl.appendChild(empty);
            return;
        }

        // 虚拟列表（>50 条时只渲染前 30 条，滚动加载）
        var renderCount = comments.length > VIRTUAL_LIST_THRESHOLD ? 30 : comments.length;
        var frag = document.createDocumentFragment();
        for (var i = 0; i < renderCount; i++) {
            frag.appendChild(renderCommentCard(comments[i]));
        }
        panelListEl.appendChild(frag);

        // 滚动加载更多
        if (comments.length > VIRTUAL_LIST_THRESHOLD) {
            var loaded = renderCount;
            panelListEl.addEventListener('scroll', debounce(function () {
                if (loaded >= comments.length) return;
                if (panelListEl.scrollTop + panelListEl.clientHeight >= panelListEl.scrollHeight - 100) {
                    var end = Math.min(loaded + 20, comments.length);
                    var more = document.createDocumentFragment();
                    for (var j = loaded; j < end; j++) {
                        more.appendChild(renderCommentCard(comments[j]));
                    }
                    panelListEl.appendChild(more);
                    loaded = end;
                }
            }, 150));
        }
    }

    /** 渲染单条评论卡片 */
    function renderCommentCard(comment) {
        var typeInfo = comment.type === 'chapter' ? CHAPTER_TYPE : (COMMENT_TYPES[comment.type] || COMMENT_TYPES.discussion);
        var replyCount = (comment.replies || []).length;
        var isLiked = (comment.likedBy || []).indexOf(Storage.getAuthorId()) !== -1;
        var isOwn = comment.authorId === Storage.getAuthorId();

        var card = el('article', {
            className: 'pc-comment pc-type-' + comment.type,
            'data-cm-id': comment.id,
            'aria-label': typeInfo.label + '：' + (comment.content || '').slice(0, 30) + '…，' + replyCount + ' 回复'
        });

        // 专家团评判详情区（徽章点击后展开，先收集，body 之后追加）
        var expertDetails = [];

        // 头部：印章 + 作者 + 时间
        var meta = el('div', { className: 'pc-comment-meta' });
        var seal = el('span', {
            className: 'pc-seal pc-seal-' + comment.type,
            style: 'background-color: ' + typeInfo.color + ';'
        }, typeInfo.seal);
        meta.appendChild(seal);

        var author = el('span', { className: 'pc-comment-author' }, comment.author);
        meta.appendChild(author);

        var time = el('span', { className: 'pc-comment-time' }, formatTime(comment.createdAt));
        meta.appendChild(time);

        // 专家团评判徽章（点击展开 rationale 与 suggestedEdit）
        if (comment.expertReviews && comment.expertReviews.length > 0) {
            comment.expertReviews.forEach(function (review) {
                var verdict = review.verdict === 'accept' ? 'accept'
                    : (review.verdict === 'reject' ? 'reject' : 'pending');
                var verdictLabel = verdict === 'accept' ? '采纳'
                    : (verdict === 'reject' ? '不采纳' : '待议');

                // 详情区（默认隐藏）
                var detail = el('div', { className: 'pc-expert-review', hidden: '' });
                detail.appendChild(el('div', { className: 'pc-expert-review-title' },
                    '名家评判：' + verdictLabel +
                    (review.confidence != null ? '（置信度 ' + review.confidence + '）' : '')));
                if (review.rationale) {
                    detail.appendChild(el('div', { className: 'pc-expert-review-rationale' }, review.rationale));
                }
                if (review.suggestedEdit && review.suggestedEdit.text) {
                    detail.appendChild(el('div', { className: 'pc-expert-review-suggestion' }, review.suggestedEdit.text));
                    var applyBtn = el('button', {
                        type: 'button',
                        className: 'pc-expert-apply-btn'
                    }, '应用建议（复制到剪贴板）');
                    applyBtn.addEventListener('click', function () {
                        copyToClipboard(review.suggestedEdit.text);
                        showToast('已复制建议文本，请手动修订原文');
                    });
                    detail.appendChild(applyBtn);
                }
                if (review.reviewedBy && review.reviewedBy.length) {
                    var byLabels = review.reviewedBy.map(function (a) {
                        return AGENT_LABELS[a] || a;
                    }).join('、');
                    detail.appendChild(el('div', { className: 'pc-expert-review-rationale' }, '评判者：' + byLabels));
                }

                // 徽章（放 meta 行，靠右）
                var badge = el('button', {
                    type: 'button',
                    className: 'pc-expert-badge',
                    'data-verdict': verdict,
                    'aria-expanded': 'false',
                    title: '点击查看名家评判详情'
                }, '名家·' + verdictLabel);
                (function (b, d) {
                    b.addEventListener('click', function () {
                        var isHidden = d.hasAttribute('hidden');
                        if (isHidden) {
                            d.removeAttribute('hidden');
                            b.setAttribute('aria-expanded', 'true');
                        } else {
                            d.setAttribute('hidden', '');
                            b.setAttribute('aria-expanded', 'false');
                        }
                    });
                })(badge, detail);
                meta.appendChild(badge);
                expertDetails.push(detail);
            });
        }

        card.appendChild(meta);

        // 正文
        var body = el('div', { className: 'pc-comment-body' });
        var content = el('p', { className: 'pc-comment-content' }, comment.content);
        body.appendChild(content);
        card.appendChild(body);

        // 专家团评判详情区（徽章点击展开）
        for (var ei = 0; ei < expertDetails.length; ei++) {
            card.appendChild(expertDetails[ei]);
        }

        // 回复列表
        if (comment.replies && comment.replies.length > 0) {
            var repliesWrap = el('div', { className: 'pc-replies-wrap' });
            var repliesList = el('ul', { className: 'pc-replies' });
            comment.replies.forEach(function (reply) {
                var li = el('li', { className: 'pc-reply', 'data-reply-id': reply.id });
                var replyMeta = el('div', { className: 'pc-reply-meta' });
                var replyAuthor = el('span', { className: 'pc-reply-author' }, reply.author);
                replyMeta.appendChild(replyAuthor);
                var replyTime = el('span', { className: 'pc-reply-time' }, formatTime(reply.createdAt));
                replyMeta.appendChild(replyTime);
                li.appendChild(replyMeta);
                var replyContent = el('div', { className: 'pc-reply-content' }, reply.content);
                li.appendChild(replyContent);
                repliesList.appendChild(li);
            });
            repliesWrap.appendChild(repliesList);
            card.appendChild(repliesWrap);
        }

        // 操作按钮
        var actions = el('div', { className: 'pc-comment-actions' });

        // 点赞
        var likeBtn = el('button', {
            type: 'button',
            className: 'pc-action-like' + (isLiked ? ' pc-liked' : ''),
            'aria-pressed': isLiked ? 'true' : 'false',
            'aria-label': isLiked ? '取消点赞' : '点赞',
            title: '点赞'
        }, (isLiked ? '♥ ' : '♡ ') + (comment.likes || 0));
        likeBtn.addEventListener('click', function () {
            toggleLike(currentNotePath, comment.id).then(function () {
                renderCommentList();
                renderParagraphBadges(currentContainer, currentNotePath);
            });
        });
        actions.appendChild(likeBtn);

        // 回复
        var replyBtn = el('button', {
            type: 'button',
            className: 'pc-action-reply',
            title: '回复'
        }, '回复' + (replyCount > 0 ? '(' + replyCount + ')' : ''));
        replyBtn.addEventListener('click', function () { toggleReplyForm(card, comment.id); });
        actions.appendChild(replyBtn);

        // 复制原文（优先取段落完整文本，回退到预览）
        if (comment.paragraph) {
            var copyBtn = el('button', {
                type: 'button',
                className: 'pc-action-copy',
                title: '复制段落原文'
            }, '复制原文');
            copyBtn.addEventListener('click', function () {
                var text = commentPreview(comment);
                if (comment.paragraphId && comment.paragraphId !== CHAPTER_PID && currentContainer) {
                    var pidIdx = parsePidIndex(comment.paragraphId);
                    var fp = parsePidFingerprint(comment.paragraphId);
                    var head = commentPreview(comment).slice(0, 20);
                    var resolved = resolveParagraph(pidIdx, fp, currentContainer, head);
                    if (resolved) {
                        text = (resolved.element.textContent || '').replace(/\s+/g, ' ').trim();
                    }
                }
                copyToClipboard(text);
                showToast('已复制段落原文');
            });
            actions.appendChild(copyBtn);
        }

        // 定位段落
        if (!isChapterMode && comment.paragraphId !== CHAPTER_PID) {
            var jumpBtn = el('button', {
                type: 'button',
                className: 'pc-action-jump',
                title: '定位到段落'
            }, '定位');
            jumpBtn.addEventListener('click', function () { jumpToParagraph(comment); });
            actions.appendChild(jumpBtn);
        }

        // 编辑（仅作者）
        if (isOwn) {
            var editBtn = el('button', {
                type: 'button',
                className: 'pc-action-edit',
                title: '编辑'
            }, '编辑');
            editBtn.addEventListener('click', function () { toggleEditForm(card, comment); });
            actions.appendChild(editBtn);

            var delBtn = el('button', {
                type: 'button',
                className: 'pc-action-delete',
                title: '删除'
            }, '删除');
            delBtn.addEventListener('click', function () {
                if (confirm('确定删除此评论？')) {
                    deleteComment(currentNotePath, comment.id).then(function () {
                        renderCommentList();
                        renderParagraphBadges(currentContainer, currentNotePath);
                        showToast('已删除');
                    });
                }
            });
            actions.appendChild(delBtn);
        }

        card.appendChild(actions);

        // 回复表单
        card.appendChild(createReplyForm(comment.id));
        // 编辑表单
        card.appendChild(createEditForm(comment));

        return card;
    }

    function createReplyForm(commentId) {
        var form = el('div', { className: 'pc-reply-form', 'data-comment-id': commentId });
        var textarea = el('textarea', {
            className: 'pc-input',
            placeholder: '写下回复…（Ctrl+Enter 提交）',
            'aria-label': '回复内容',
            maxlength: String(MAX_CONTENT_LEN)
        });
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitReply(commentId, textarea.value);
            }
        });
        form.appendChild(textarea);
        var actions = el('div', { className: 'pc-popover-footer' });
        var cancelBtn = el('button', { type: 'button', className: 'pc-cancel-btn' }, '取消');
        cancelBtn.addEventListener('click', function () { form.classList.remove('open'); });
        var submitBtn = el('button', { type: 'button', className: 'pc-submit-btn' }, '回复');
        submitBtn.addEventListener('click', function () { submitReply(commentId, textarea.value); });
        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        form.appendChild(actions);
        return form;
    }

    function toggleReplyForm(card, commentId) {
        var form = card.querySelector('.pc-reply-form');
        if (!form) return;
        form.classList.toggle('open');
        if (form.classList.contains('open')) {
            var textarea = form.querySelector('textarea');
            if (textarea) textarea.focus();
        }
    }

    function createEditForm(comment) {
        var form = el('div', { className: 'pc-edit-form', 'data-comment-id': comment.id });
        var textarea = el('textarea', {
            className: 'pc-input',
            placeholder: '编辑评论…（Ctrl+Enter 保存）',
            'aria-label': '编辑评论内容',
            maxlength: String(MAX_CONTENT_LEN)
        });
        textarea.value = comment.content || '';
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitEdit(comment.id, textarea.value);
            }
        });
        form.appendChild(textarea);

        // 类型选择
        if (comment.type !== 'chapter') {
            var typeGroup = el('div', { className: 'pc-type-selector', role: 'radiogroup', 'aria-label': '评论类型' });
            Object.keys(COMMENT_TYPES).forEach(function (type) {
                var info = COMMENT_TYPES[type];
                var btn = el('button', {
                    type: 'button',
                    className: 'pc-type-btn pc-type-' + type,
                    role: 'radio',
                    'aria-checked': type === comment.type ? 'true' : 'false',
                    'data-type': type,
                    style: '--pc-type-color: ' + info.color + ';'
                });
                var seal = el('span', { className: 'pc-seal pc-seal-' + type }, info.seal);
                btn.appendChild(seal);
                btn.appendChild(document.createTextNode(info.label));
                btn.addEventListener('click', function () {
                    typeGroup.querySelectorAll('.pc-type-btn').forEach(function (b) {
                        b.setAttribute('aria-checked', b.getAttribute('data-type') === type ? 'true' : 'false');
                    });
                });
                typeGroup.appendChild(btn);
            });
            form.appendChild(typeGroup);
        }

        var actions = el('div', { className: 'pc-popover-footer' });
        var cancelBtn = el('button', { type: 'button', className: 'pc-cancel-btn' }, '取消');
        cancelBtn.addEventListener('click', function () { form.classList.remove('open'); });
        var submitBtn = el('button', { type: 'button', className: 'pc-submit-btn' }, '保存');
        submitBtn.addEventListener('click', function () {
            var newType = comment.type;
            var checked = form.querySelector('.pc-type-btn[aria-checked="true"]');
            if (checked) newType = checked.getAttribute('data-type');
            submitEdit(comment.id, textarea.value, newType);
        });
        actions.appendChild(cancelBtn);
        actions.appendChild(submitBtn);
        form.appendChild(actions);
        return form;
    }

    function toggleEditForm(card, comment) {
        var form = card.querySelector('.pc-edit-form');
        if (!form) return;
        form.classList.toggle('open');
        if (form.classList.contains('open')) {
            var textarea = form.querySelector('textarea');
            if (textarea) { textarea.focus(); textarea.select(); }
        }
    }

    function submitReply(commentId, content) {
        content = (content || '').trim();
        if (!content) { showToast('回复内容不能为空'); return; }
        replyComment(currentNotePath, commentId, content).then(function () {
            renderCommentList();
            showToast('已添加回复');
        }).catch(function (e) { showToast(e.message || '回复失败'); });
    }

    function submitEdit(commentId, content, newType) {
        content = (content || '').trim();
        if (!content) { showToast('评论内容不能为空'); return; }
        editComment(currentNotePath, commentId, content, newType).then(function () {
            renderCommentList();
            showToast('已更新');
        }).catch(function (e) { showToast(e.message || '更新失败'); });
    }

    /** 提交段评 */
    function submitComment() {
        if (!currentNotePath || !activePid) return;
        var content = inputEl.value.trim();
        if (!content) {
            inputEl.focus();
            showToast('请输入评论内容');
            return;
        }
        var preview = '';
        if (activeParagraphEl) preview = getParagraphPreview(activeParagraphEl);
        var author = authorNameEl.value.trim() || '匿名读者';
        Storage.setAuthorName(author);

        var type = isChapterMode ? 'chapter' : selectedType;
        addComment(currentNotePath, activePid, content, {
            type: type,
            author: author,
            paragraphPreview: preview
        }).then(function () {
            inputEl.value = '';
            renderCommentList();
            if (!isChapterMode) renderParagraphBadges(currentContainer, currentNotePath);
            renderChapterComments(currentNotePath);
            showToast('已添加' + (isChapterMode ? '章评' : '段评'));
            updateSyncBadge();
        }).catch(function (e) {
            showToast(e.message || '提交失败');
        });
    }

    /** 跳转到段落 */
    function jumpToParagraph(comment) {
        if (!currentContainer) return;
        var pidIndex = parsePidIndex(comment.paragraphId);
        var fp = parsePidFingerprint(comment.paragraphId);
        var head = commentPreview(comment).slice(0, 20);
        var resolved = resolveParagraph(pidIndex, fp, currentContainer, head);
        if (resolved) {
            resolved.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            resolved.element.classList.add('pc-flash');
            setTimeout(function () { resolved.element.classList.remove('pc-flash'); }, 600);
        } else {
            showToast('段落已变更，无法定位');
        }
    }

    /* ========================================================
     * 十四、章评
     * ======================================================== */

    /** 渲染章评入口（文末） */
    function renderChapterComments(notePath) {
        if (!currentContainer || !notePath) return;
        var existing = currentContainer.querySelector('.pc-chapter-comments');
        if (existing) existing.remove();

        var comments = Storage.loadComments(notePath).filter(function (c) {
            return !c.deleted && c.paragraphId === CHAPTER_PID;
        });

        var section = el('section', { className: 'pc-chapter-comments', 'aria-label': '章评' });
        var header = el('div', { className: 'pc-chapter-header' });
        header.appendChild(el('h3', {}, '章评'));
        header.appendChild(el('span', { className: 'pc-panel-count' }, comments.length + ' 条'));
        var addBtn = el('button', { type: 'button', className: 'pc-chapter-add' }, '写章评');
        addBtn.addEventListener('click', function () {
            showPanel(null, CHAPTER_PID, true);
        });
        header.appendChild(addBtn);
        section.appendChild(header);

        if (comments.length > 0) {
            var list = el('ul', { className: 'pc-chapter-list' });
            comments.sort(function (a, b) {
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            }).forEach(function (c) {
                list.appendChild(renderCommentCard(c));
            });
            section.appendChild(list);
        }
        currentContainer.appendChild(section);
    }

    /* ========================================================
     * 十五、触摸 / 点击交互
     * ======================================================== */

    function bindParagraphInteraction(container) {
        var touchStart = null;
        var TOUCH_THRESHOLD = 10;
        var TAP_MAX_DURATION = 500;

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
                handleParagraphTap(touchStart.target, touch.clientX, touch.clientY);
            }
            touchStart = null;
        }, { passive: true });

        container.addEventListener('click', function (e) {
            if (window.innerWidth <= 768) return; // 移动端由 touch 处理
            handleParagraphTap(e.target, e.clientX, e.clientY);
        });
    }

    function handleParagraphTap(target, x, y) {
        if (!currentNotePath || !currentContainer) return;
        // 点击徽章
        var badge = target.closest && target.closest('.pc-badge');
        if (badge) {
            var pid = badge.getAttribute('data-pid');
            if (pid) {
                var pidIndex = parsePidIndex(pid);
                var p = currentContainer.querySelector('[data-pid="' + CSS.escape(String(pidIndex)) + '"]');
                if (p) showPanel(p, pid, false);
                return;
            }
        }
        // 点击段落
        var paragraph = target.closest && target.closest('[data-pid]');
        if (!paragraph) return;
        // 排除链接点击
        if (target.tagName === 'A' || (target.closest && target.closest('a'))) return;
        var pid = buildParagraphId(paragraph);
        if (!pid) return;
        showPanel(paragraph, pid, false);
    }

    /* ========================================================
     * 十六、导出 / 导入
     * ======================================================== */

    function getNoteContent() {
        if (!currentContainer) return '';
        return currentContainer.textContent || '';
    }

    /** 导出单篇笔记段评 */
    function exportNote(notePath) {
        var path = notePath || currentNotePath;
        if (!path) { showToast('请先选择一篇笔记'); return; }
        var comments = Storage.loadComments(path).filter(function (c) { return !c.deleted; });
        var data = {
            schema: SCHEMA,
            exportedAt: nowISO(),
            exportedBy: Storage.getAuthorName(),
            scope: 'note',
            notePath: path,
            projectContext: {
                rulesFile: '.trae/rules/rules.md',
                notesDir: 'output/',
                agents: ALL_AGENTS
            },
            comments: comments
        };
        if (path === currentNotePath) data.noteContent = getNoteContent();
        var filename = 'comments_' + path.replace(/[\/\\]/g, '_') + '_' + getDateStr() + '.json';
        downloadJSON(data, filename);
        Storage.updateMeta({ lastExportAt: nowISO() });
        showToast('已导出 ' + comments.length + ' 条段评');
    }

    /** 导出全站段评 */
    function exportAll() {
        var allComments = Storage.loadAllComments();
        var notesArray = [];
        var totalCount = 0;
        for (var path in allComments) {
            if (!allComments.hasOwnProperty(path)) continue;
            var comments = allComments[path].filter(function (c) { return !c.deleted; });
            if (comments.length === 0) continue;
            notesArray.push({ notePath: path, comments: comments });
            totalCount += comments.length;
        }
        var data = {
            schema: SCHEMA,
            exportedAt: nowISO(),
            exportedBy: Storage.getAuthorName(),
            scope: 'all',
            projectContext: {
                rulesFile: '.trae/rules/rules.md',
                notesDir: 'output/',
                agents: ALL_AGENTS
            },
            notes: notesArray
        };
        downloadJSON(data, 'comments_all_' + getDateStr() + '.json');
        Storage.updateMeta({ lastExportAt: nowISO() });
        showToast('已导出 ' + totalCount + ' 条段评');
    }

    /** 导出给专家团（AI 友好格式） */
    function exportForAgents(notePath) {
        var path = notePath || currentNotePath;
        if (!path) { showToast('请先选择一篇笔记'); return; }
        var comments = Storage.loadComments(path).filter(function (c) { return !c.deleted; });
        if (comments.length === 0) { showToast('暂无段评可导出'); return; }

        var parts = path.replace(/\.md$/, '').split(/[\/\\]/);
        var book = parts[0] || '';
        var chapter = parts.length > 1 ? parts[1] : '';
        var event = parts.length > 2 ? parts.slice(2).join('_') : '';

        // 按段落分组线程
        var byPid = groupBy(comments, function (c) { return c.paragraphId; });
        var threads = [];
        Object.keys(byPid).forEach(function (pid) {
            var groupComments = byPid[pid];
            groupComments.forEach(function (c) {
                var typeInfo = c.type === 'chapter' ? CHAPTER_TYPE : (COMMENT_TYPES[c.type] || {});
                var messages = [{
                    id: c.id,
                    author: c.author,
                    type: c.type,
                    content: c.content,
                    createdAt: c.createdAt
                }];
                (c.replies || []).forEach(function (r) {
                    messages.push({
                        id: r.id,
                        author: r.author,
                        type: 'reply',
                        content: r.content,
                        createdAt: r.createdAt
                    });
                });
                threads.push({
                    threadId: c.id,
                    paragraphId: c.paragraphId,
                    paragraphPreview: commentPreview(c),
                    headingPath: (c.paragraph && c.paragraph.headingPath) || [],
                    status: 'open',
                    tags: [],
                    targetAgent: typeInfo.agents ? typeInfo.agents[0] : null,
                    priority: c.type === 'error' ? 'high' : 'normal',
                    messages: messages
                });
            });
        });

        var data = {
            schema: SCHEMA,
            exportedAt: nowISO(),
            notePath: path,
            book: book,
            chapter: chapter,
            event: event,
            threads: threads
        };
        var filename = 'paragraph_comments_' + path.replace(/[\/\\]/g, '_') + '.json';
        downloadJSON(data, filename);
        showToast('已导出专家团评判包');
    }

    /** 复制为 Prompt 上下文 */
    function copyAsPromptContext(notePath) {
        var path = notePath || currentNotePath;
        if (!path) { showToast('请先选择一篇笔记'); return; }
        var comments = Storage.loadComments(path).filter(function (c) { return !c.deleted; });
        if (comments.length === 0) { showToast('暂无段评可复制'); return; }
        var byPid = groupBy(comments, function (c) { return c.paragraphId; });
        var lines = ['# 作者段评上下文', '笔记：' + path, ''];
        Object.keys(byPid).forEach(function (pid) {
            var pidIndex = parsePidIndex(pid);
            lines.push('## ' + (pid === CHAPTER_PID ? '章评' : '段落 #' + pidIndex));
            byPid[pid].forEach(function (c) {
                lines.push('- [' + c.type + '] ' + c.content);
                (c.replies || []).forEach(function (r) {
                    lines.push('  - 回复：' + r.content);
                });
            });
            lines.push('');
        });
        copyToClipboard(lines.join('\n'));
        showToast('已复制 ' + comments.length + ' 条段评到剪贴板');
    }

    /** 导入 JSON */
    function importJSON(jsonStr, mode) {
        var data;
        try { data = JSON.parse(jsonStr); }
        catch (e) { showToast('JSON 解析失败：' + e.message); return false; }

        if (!data.schema || data.schema !== SCHEMA) {
            showToast('schema 不符，期望 ' + SCHEMA);
            return false;
        }

        var importedComments = [];
        if (data.scope === 'all' && data.notes) {
            data.notes.forEach(function (n) {
                (n.comments || []).forEach(function (c) {
                    c.notePath = n.notePath;
                    importedComments.push(c);
                });
            });
        } else if (data.comments) {
            importedComments = data.comments;
            if (data.notePath) {
                importedComments.forEach(function (c) { if (!c.notePath) c.notePath = data.notePath; });
            }
        }

        if (importedComments.length === 0) {
            showToast('未找到可导入的段评');
            return false;
        }

        // 校验字段
        var validTypes = Object.keys(COMMENT_TYPES).concat(['chapter']);
        var valid = importedComments.filter(function (c) {
            return c && typeof c.id === 'string' && typeof c.content === 'string' && validTypes.indexOf(c.type) !== -1;
        });
        var skipped = importedComments.length - valid.length;

        // 按笔记分组
        var byNote = groupBy(valid, function (c) { return c.notePath || currentNotePath || ''; });

        var totalImported = 0;
        for (var np in byNote) {
            if (!byNote.hasOwnProperty(np)) continue;
            var existing = mode === 'replace' ? [] : Storage.loadComments(np);
            var byId = {};
            existing.forEach(function (c) { byId[c.id] = c; });
            byNote[np].forEach(function (c) {
                if (!byId[c.id]) {
                    byId[c.id] = c;
                    totalImported++;
                } else {
                    // 同 id 取较新者
                    var existingUpdated = new Date(byId[c.id].updatedAt || byId[c.id].createdAt || 0).getTime();
                    var newUpdated = new Date(c.updatedAt || c.createdAt || 0).getTime();
                    if (newUpdated >= existingUpdated) {
                        byId[c.id] = c;
                        totalImported++;
                    }
                }
            });
            var merged = Object.keys(byId).map(function (k) { return byId[k]; });
            Storage.saveComments(np, merged);
        }

        if (currentNotePath) refresh();
        var msg = '已导入 ' + totalImported + ' 条';
        if (skipped > 0) msg += '，跳过 ' + skipped + ' 条无效';
        showToast(msg);
        return true;
    }

    /** 导入专家评判结果 */
    function importExpertReview(jsonStr) {
        var data;
        try { data = JSON.parse(jsonStr); }
        catch (e) { showToast('JSON 解析失败：' + e.message); return false; }
        if (!data.reviews || !Array.isArray(data.reviews)) {
            showToast('未找到 reviews 字段');
            return false;
        }
        var allComments = Storage.loadAllComments();
        var count = 0;
        data.reviews.forEach(function (review) {
            if (!review.commentId) return;
            for (var np in allComments) {
                if (!allComments.hasOwnProperty(np)) continue;
                var comment = allComments[np].find(function (c) { return c.id === review.commentId; });
                if (comment) {
                    if (!comment.expertReviews) comment.expertReviews = [];
                    comment.expertReviews.push(review);
                    Storage.saveComments(np, allComments[np]);
                    count++;
                    break;
                }
            }
        });
        if (currentNotePath) refresh();
        showToast('已回填 ' + count + ' 条评判');
        return true;
    }

    /* ========================================================
     * 十七、专家团触发
     * ======================================================== */

    function openExpertDialog() {
        var comments = currentNotePath ? Storage.loadComments(currentNotePath).filter(function (c) { return !c.deleted; }) : [];
        if (comments.length === 0) { showToast('暂无段评可评判'); return; }

        var overlay = el('div', { className: 'pc-overlay open', id: 'pcExpertOverlay', 'aria-hidden': 'false' });
        var modal = el('div', { className: 'pc-panel pc-config-modal', role: 'dialog', 'aria-modal': 'true' });

        var header = el('div', { className: 'pc-popover-header' });
        header.appendChild(el('h2', {}, '延请名家评判'));
        var closeBtn = el('button', { className: 'pc-panel-close', type: 'button', 'aria-label': '关闭' }, '×');
        closeBtn.addEventListener('click', function () { overlay.remove(); });
        header.appendChild(closeBtn);
        modal.appendChild(header);

        var body = el('div', { className: 'pc-popover-body' });

        // 范围
        var scopeGroup = el('div', { className: 'pc-form-group' });
        scopeGroup.appendChild(el('label', {}, '评判范围'));
        var scopeRadios = el('div', { className: 'pc-radio-group' });
        var noteLabel = el('label');
        var noteRadio = el('input', { type: 'radio', name: 'expertScope', value: 'note', checked: '' });
        noteLabel.appendChild(noteRadio);
        noteLabel.appendChild(document.createTextNode('当前笔记'));
        scopeRadios.appendChild(noteLabel);
        var allLabel = el('label');
        var allRadio = el('input', { type: 'radio', name: 'expertScope', value: 'all' });
        allLabel.appendChild(allRadio);
        allLabel.appendChild(document.createTextNode('全站'));
        scopeRadios.appendChild(allLabel);
        scopeGroup.appendChild(scopeRadios);
        body.appendChild(scopeGroup);

        // 参与专家
        var agentGroup = el('div', { className: 'pc-form-group' });
        agentGroup.appendChild(el('label', {}, '参与专家'));
        var checkboxGroup = el('div', { className: 'pc-checkbox-group' });
        ALL_AGENTS.forEach(function (agent) {
            var l = el('label');
            var cb = el('input', { type: 'checkbox', value: agent, checked: '' });
            l.appendChild(cb);
            l.appendChild(document.createTextNode(AGENT_LABELS[agent]));
            checkboxGroup.appendChild(l);
        });
        agentGroup.appendChild(checkboxGroup);
        body.appendChild(agentGroup);

        // 附加指令
        var instrGroup = el('div', { className: 'pc-form-group' });
        instrGroup.appendChild(el('label', {}, '附加指令（可选）'));
        var instrTextarea = el('textarea', {
            placeholder: '如：重点核查引文出处、评估讲道理部分是否过度引申…',
            style: 'width:100%;min-height:60px;'
        });
        instrGroup.appendChild(instrTextarea);
        body.appendChild(instrGroup);

        // 命令提示
        body.appendChild(el('div', { className: 'pc-cmd-hint' },
            '生成后请在本地执行：\npython src/main.py --expert-review expert_review_request.json'));

        modal.appendChild(body);

        var footer = el('div', { className: 'pc-popover-footer' });
        var cancelBtn = el('button', { type: 'button', className: 'pc-cancel-btn' }, '取消');
        cancelBtn.addEventListener('click', function () { overlay.remove(); });
        var confirmBtn = el('button', { type: 'button', className: 'pc-submit-btn' }, '生成请求包');
        confirmBtn.addEventListener('click', function () {
            var scopeEl = overlay.querySelector('input[name="expertScope"]:checked');
            var scope = scopeEl ? scopeEl.value : 'note';
            var participants = [];
            checkboxGroup.querySelectorAll('input:checked').forEach(function (cb) { participants.push(cb.value); });
            var instruction = instrTextarea.value.trim();
            generateExpertReviewRequest(scope, participants, instruction);
            overlay.remove();
        });
        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        modal.appendChild(footer);

        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function generateExpertReviewRequest(scope, participants, instruction) {
        var notePath = currentNotePath;
        var comments = [];
        if (scope === 'note') {
            comments = Storage.loadComments(notePath).filter(function (c) { return !c.deleted; });
        } else {
            var all = Storage.loadAllComments();
            for (var np in all) {
                if (!all.hasOwnProperty(np)) continue;
                all[np].filter(function (c) { return !c.deleted; }).forEach(function (c) { comments.push(c); });
            }
        }

        var parts = notePath ? notePath.replace(/\.md$/, '').split(/[\/\\]/) : [];
        var data = {
            schema: SCHEMA,
            exportedAt: nowISO(),
            exportedBy: Storage.getAuthorName(),
            scope: scope,
            notePath: scope === 'note' ? notePath : undefined,
            projectContext: {
                rulesFile: '.trae/rules/rules.md',
                notesDir: 'output/',
                agents: ALL_AGENTS
            },
            comments: comments,
            expertReviewRequest: {
                participants: participants,
                additionalInstruction: instruction,
                rulesReference: '.trae/rules/rules.md'
            }
        };

        var filename = 'expert_review_request.json';
        if (scope === 'note' && parts.length > 0) {
            filename = 'expert_review_request_' + parts.join('_') + '.json';
        }
        downloadJSON(data, filename);
        showToast('已生成专家团请求包，请下载后在本地执行');
    }

    /* ========================================================
     * 十八、配置面板
     * ======================================================== */

    function openConfigModal() {
        var existing = document.getElementById('pcConfigOverlay');
        if (existing) existing.remove();

        var overlay = el('div', { className: 'pc-overlay open', id: 'pcConfigOverlay', 'aria-hidden': 'false' });
        var modal = el('div', { className: 'pc-panel pc-config-modal', role: 'dialog', 'aria-modal': 'true' });

        var header = el('div', { className: 'pc-popover-header' });
        header.appendChild(el('h2', {}, 'GitHub 同步配置'));
        var closeBtn = el('button', { className: 'pc-panel-close', type: 'button', 'aria-label': '关闭' }, '×');
        closeBtn.addEventListener('click', function () { overlay.remove(); });
        header.appendChild(closeBtn);
        modal.appendChild(header);

        var body = el('div', { className: 'pc-popover-body' });

        // 安全提示
        var warning = el('div', { className: 'pc-warning' });
        warning.appendChild(el('p', {}, '⚠ PAT 仅存于本机 localStorage，不进仓库。'));
        warning.appendChild(el('p', {}, '建议使用 fine-grained PAT，仅授权写 site/data/comments/ 目录。'));
        body.appendChild(warning);

        var cfg = GitHubConfig.get() || {};

        body.appendChild(makeFormGroup('仓库所有者 (owner)', 'pcCfgOwner', cfg.owner || '', 'text', 'yourname'));
        body.appendChild(makeFormGroup('仓库名 (repo)', 'pcCfgRepo', cfg.repo || '', 'text', 'deep-reading'));
        body.appendChild(makeFormGroup('分支 (branch)', 'pcCfgBranch', cfg.branch || 'main', 'text', 'main'));
        body.appendChild(makeFormGroup('Fine-grained PAT', 'pcCfgToken', '', 'password', 'github_pat_...'));
        body.appendChild(makeFormGroup('评论目录', 'pcCfgDir', cfg.commentsDir || 'site/data/comments', 'text', 'site/data/comments'));

        modal.appendChild(body);

        var footer = el('div', { className: 'pc-popover-footer' });
        var clearBtn = el('button', { type: 'button', className: 'pc-cancel-btn' }, '清除配置');
        clearBtn.addEventListener('click', function () {
            GitHubConfig.clear();
            showToast('已清除配置');
            overlay.remove();
        });
        var saveBtn = el('button', { type: 'button', className: 'pc-submit-btn' }, '保存');
        saveBtn.addEventListener('click', function () {
            var config = {
                owner: document.getElementById('pcCfgOwner').value.trim(),
                repo: document.getElementById('pcCfgRepo').value.trim(),
                branch: document.getElementById('pcCfgBranch').value.trim() || 'main',
                commentsDir: document.getElementById('pcCfgDir').value.trim() || 'site/data/comments',
                commitPrefix: 'chore(comments): '
            };
            var tokenVal = document.getElementById('pcCfgToken').value.trim();
            if (tokenVal) config.token = tokenVal;
            else if (cfg.token) config.token = cfg.token;
            GitHubConfig.set(config);
            showToast('已保存配置');
            overlay.remove();
            updateSyncBadge();
        });
        footer.appendChild(clearBtn);
        footer.appendChild(saveBtn);
        modal.appendChild(footer);

        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function makeFormGroup(labelText, id, value, type, placeholder) {
        var group = el('div', { className: 'pc-form-group' });
        group.appendChild(el('label', { 'for': id }, labelText));
        var input = el('input', { type: type || 'text', id: id, placeholder: placeholder || '' });
        input.value = value || '';
        group.appendChild(input);
        return group;
    }

    /* ========================================================
     * 十九、加载评论（本地 + 远端合并）
     * ======================================================== */

    async function loadCommentsWithSync(notePath) {
        var local = Storage.loadComments(notePath);
        if (GitHubConfig.isConfigured() && navigator.onLine) {
            try {
                var remote = await fetchRemoteComments(notePath);
                if (remote.comments.length > 0 || remote.source.indexOf('404') === -1) {
                    var merged = mergeComments(local, remote.comments);
                    Storage.saveComments(notePath, merged);
                }
            } catch (e) {
                console.warn('[PC] 远端拉取失败，使用本地', e);
            }
        }
    }

    /* ========================================================
     * 二十、主流程：attach / detach / refresh
     * ======================================================== */

    function attach(container, notePath, meta) {
        detach();
        currentContainer = container;
        currentNotePath = notePath;
        currentMeta = meta || null;
        storageAvailable = Storage.checkAvailable();

        // 段落标记延迟注入（不阻塞首屏）
        var schedule = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1); };
        schedule(function () {
            var result = injectParagraphIds(container);
            paragraphMap = result.fingerprints;
            renderParagraphBadges(container, notePath);
            bindParagraphInteraction(container);
            renderChapterComments(notePath);
        });

        // 加载评论：先本地，再异步拉取远端合并
        loadCommentsWithSync(notePath).then(function () {
            renderParagraphBadges(container, notePath);
            renderChapterComments(notePath);
            // 处理离线队列
            if (navigator.onLine && GitHubConfig.isConfigured()) {
                SyncQueue.process();
            }
        });
    }

    function detach() {
        if (currentContainer) {
            // 移除徽章
            var badges = currentContainer.querySelectorAll('.pc-badge');
            for (var i = 0; i < badges.length; i++) badges[i].remove();
            // 移除章评
            var chapterSection = currentContainer.querySelector('.pc-chapter-comments');
            if (chapterSection) chapterSection.remove();
            // 移除段落标记
            var ps = currentContainer.querySelectorAll('[data-pid]');
            for (var j = 0; j < ps.length; j++) {
                ps[j].removeAttribute('data-pid');
                ps[j].removeAttribute('data-fp');
            }
        }
        hidePanel();
        currentContainer = null;
        currentNotePath = null;
        currentMeta = null;
        paragraphMap = null;
    }

    function refresh() {
        if (!currentContainer || !currentNotePath) return;
        var result = injectParagraphIds(currentContainer);
        paragraphMap = result.fingerprints;
        renderParagraphBadges(currentContainer, currentNotePath);
        renderChapterComments(currentNotePath);
        if (panelEl && !panelEl.hidden) renderCommentList();
    }

    /* ========================================================
     * 二十一、网络监听
     * ======================================================== */

    window.addEventListener('online', function () {
        showToast('网络已恢复，正在同步评论…');
        updateSyncBadge();
        if (GitHubConfig.isConfigured()) {
            SyncQueue.process().then(function (r) {
                if (r && r.processed > 0) showToast('已同步 ' + r.processed + ' 条评论');
                updateSyncBadge();
                if (currentNotePath) {
                    renderParagraphBadges(currentContainer, currentNotePath);
                    renderChapterComments(currentNotePath);
                }
            });
        }
    });

    window.addEventListener('offline', function () {
        showToast('已离线，评论将暂存本地，联网后自动同步');
        updateSyncBadge();
    });

    // 多标签页同步
    window.addEventListener('storage', function (e) {
        if (!e.key) return;
        if (e.key.indexOf(STORAGE_PREFIX + 'comments:') === 0) {
            var notePath = e.key.slice((STORAGE_PREFIX + 'comments:').length);
            if (notePath === currentNotePath) {
                renderParagraphBadges(currentContainer, currentNotePath);
                renderChapterComments(currentNotePath);
                if (panelEl && !panelEl.hidden) renderCommentList();
            }
        } else if (e.key === PENDING_KEY) {
            updateSyncBadge();
        }
    });

    // 全局 Esc 关闭浮层
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (panelEl && !panelEl.hidden) { hidePanel(); }
        }
    });

    // resize 重新定位
    var debouncedResize = debounce(function () {
        if (panelEl && !panelEl.hidden && activeParagraphEl) {
            positionPanel(activeParagraphEl);
        }
    }, 150);
    window.addEventListener('resize', debouncedResize);

    /* ========================================================
     * 二十二、监听 note:loaded 事件
     * ======================================================== */

    document.addEventListener('note:loaded', function (e) {
        var detail = e.detail || {};
        var notePath = detail.notePath;
        var container = detail.container;
        var meta = detail.meta;
        if (!notePath || !container) return;
        attach(container, notePath, meta);
    });

    /* ========================================================
     * 二十三、暴露 API
     * ======================================================== */

    window.ParagraphComments = {
        // —— 生命周期 ——
        attach: attach,
        detach: detach,
        refresh: refresh,

        // —— 状态查询 ——
        getComments: function (notePath) {
            return Storage.loadComments(notePath).filter(function (c) { return !c.deleted; });
        },
        getAllComments: function () { return Storage.loadAllComments(); },
        getParagraphComments: function (notePath, pid) {
            return Storage.loadComments(notePath).filter(function (c) {
                return !c.deleted && c.paragraphId === pid;
            });
        },
        getPendingCount: function () { return Storage.loadPending().length; },

        // —— 数据操作 ——
        addComment: addComment,
        replyComment: replyComment,
        deleteComment: deleteComment,
        deleteReply: deleteReply,
        toggleLike: toggleLike,
        editComment: editComment,

        // —— 同步 ——
        syncNow: function () { return SyncQueue.process(); },
        isOnline: function () { return navigator.onLine; },

        // —— 导出 / 导入 ——
        exportNote: exportNote,
        exportAll: exportAll,
        exportForAgents: exportForAgents,
        copyAsPromptContext: copyAsPromptContext,
        importJSON: function (jsonStr, mode) { return importJSON(jsonStr, mode || 'merge'); },
        importExpertReview: importExpertReview,

        // —— 配置 ——
        configureGitHub: function (config) { GitHubConfig.set(config); },
        getGitHubStatus: function () {
            var meta = Storage.loadMeta();
            return {
                configured: GitHubConfig.isConfigured(),
                lastSyncAt: meta.lastSyncAt,
                pending: Storage.loadPending().length
            };
        },
        openConfigModal: openConfigModal,
        openExpertDialog: openExpertDialog,

        // —— 工具（供测试调用） ——
        _internal: {
            Storage: Storage,
            GitHubConfig: GitHubConfig,
            SyncQueue: SyncQueue,
            mergeComments: mergeComments,
            injectParagraphIds: injectParagraphIds,
            computeParagraphFingerprint: computeParagraphFingerprint,
            resolveParagraph: resolveParagraph,
            buildParagraphId: buildParagraphId,
            parsePidIndex: parsePidIndex,
            parsePidFingerprint: parsePidFingerprint,
            getParagraphPreview: getParagraphPreview,
            escapeHtml: escapeHtml,
            simpleHash: simpleHash,
            editDistance: editDistance,
            encodeCommentPath: encodeCommentPath,
            createComment: createComment,
            SCHEMA: SCHEMA,
            COMMENT_TYPES: COMMENT_TYPES,
            CHAPTER_PID: CHAPTER_PID,
            MAX_CONTENT_LEN: MAX_CONTENT_LEN
        }
    };

})();
