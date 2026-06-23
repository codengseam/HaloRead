/* ============================================================
 * 段落评论系统 · 浏览器端单元测试
 * 自建极简测试框架（~60 行），无外部依赖，覆盖 tdd.md 中 P0/P1 核心用例
 *
 * 用法：在浏览器中打开测试页（需先引入 paragraph-comments.js），或：
 *   <script src="../site/js/paragraph-comments.js" defer></script>
 *   <script src="paragraph-comments.test.js" defer></script>
 *   <div id="pc-test-results"></div>
 *
 * 覆盖用例前缀：PM / AN / ST / CM / XS / BD / GH / OQ / PC
 * ============================================================ */

(function () {
    'use strict';

    /* ========================================================
     * 一、极简测试框架
     * ======================================================== */

    var suites = [];
    var currentSuite = null;
    var stats = { passed: 0, failed: 0, total: 0 };

    function describe(name, fn) {
        var suite = { name: name, tests: [], beforeEach: null, afterEach: null };
        var prev = currentSuite;
        currentSuite = suite;
        try { fn(); } finally { currentSuite = prev; }
        suites.push(suite);
    }

    function beforeEach(fn) {
        if (currentSuite) currentSuite.beforeEach = fn;
    }

    function afterEach(fn) {
        if (currentSuite) currentSuite.afterEach = fn;
    }

    function it(name, fn) {
        if (!currentSuite) return;
        currentSuite.tests.push({ name: name, fn: fn, async: fn.constructor.name === 'AsyncFunction' });
    }

    var assert = {
        ok: function (val, msg) {
            if (!val) throw new Error((msg || '断言失败') + '（期望真值）');
        },
        notOk: function (val, msg) {
            if (val) throw new Error((msg || '断言失败') + '（期望假值）');
        },
        equal: function (actual, expected, msg) {
            if (actual !== expected) {
                throw new Error((msg || '断言失败') + '：期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
            }
        },
        notEqual: function (a, b, msg) {
            if (a === b) throw new Error((msg || '断言失败') + '：不应相等 ' + JSON.stringify(a));
        },
        deepEqual: function (actual, expected, msg) {
            if (!deepEqual(actual, expected)) {
                throw new Error((msg || '断言失败') + '：深比较不等');
            }
        },
        throws: function (fn, msg) {
            var threw = false;
            try { fn(); } catch (e) { threw = true; }
            if (!threw) throw new Error(msg || '期望抛出异常但未抛出');
        },
        isTrue: function (val, msg) { this.equal(val, true, msg); },
        isFalse: function (val, msg) { this.equal(val, false, msg); }
    };

    function deepEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return a === b;
        if (typeof a !== typeof b) return false;
        if (typeof a !== 'object') return a === b;
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        var ka = Object.keys(a), kb = Object.keys(b);
        if (ka.length !== kb.length) return false;
        for (var i = 0; i < ka.length; i++) {
            if (!deepEqual(a[ka[i]], b[ka[i]])) return false;
        }
        return true;
    }

    /* ========================================================
     * 二、Mock 工具：内存 localStorage / fetch 拦截
     * ======================================================== */

    var MockStorage = {
        _store: {},
        _quotaExceeded: false,
        _realLS: null,

        install: function () {
            this._realLS = window.localStorage;
            var self = this;
            var ls = {
                getItem: function (k) { return Object.prototype.hasOwnProperty.call(self._store, k) ? self._store[k] : null; },
                setItem: function (k, v) {
                    if (self._quotaExceeded) {
                        var e = new Error('QuotaExceeded');
                        e.name = 'QuotaExceededError';
                        throw e;
                    }
                    self._store[k] = String(v);
                },
                removeItem: function (k) { delete self._store[k]; },
                clear: function () { self._store = {}; self._quotaExceeded = false; },
                key: function (i) { return Object.keys(self._store)[i]; },
                get length() { return Object.keys(self._store).length; }
            };
            try {
                Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
            } catch (e) {
                window.localStorage = ls;
            }
        },
        restore: function () {
            if (this._realLS) {
                try {
                    Object.defineProperty(window, 'localStorage', { value: this._realLS, configurable: true });
                } catch (e) {
                    window.localStorage = this._realLS;
                }
            }
        },
        setQuotaExceeded: function () { this._quotaExceeded = true; },
        clear: function () { this._store = {}; this._quotaExceeded = false; }
    };

    var MockFetch = {
        _realFetch: null,
        _store: {},
        _online: true,
        _failMode: null,
        _calls: [],

        install: function () {
            this._realFetch = window.fetch;
            var self = this;
            window.fetch = function (url, opts) {
                return self._handle(url, opts);
            };
        },
        restore: function () {
            if (this._realFetch) window.fetch = this._realFetch;
        },
        _handle: function (url, opts) {
            var self = this;
            var u = String(url);
            self._calls.push({ url: u, opts: opts });
            if (!self._online || self._failMode === 'network') {
                return Promise.reject(new TypeError('Failed to fetch'));
            }
            var getMatch = u.match(/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
            if (getMatch) {
                var path = getMatch[3];
                var method = (opts && opts.method) || 'GET';
                if (method === 'GET') {
                    if (self._store[path]) {
                        return Promise.resolve(self._resp(200, {
                            content: btoa(unescape(encodeURIComponent(self._store[path].content))),
                            sha: self._store[path].sha,
                            encoding: 'base64'
                        }));
                    }
                    return Promise.resolve(self._resp(404, { message: 'Not Found' }));
                }
                if (method === 'PUT') {
                    var body = JSON.parse(opts.body);
                    if (self._failMode === '409' && self._store[path] && body.sha !== self._store[path].sha) {
                        return Promise.resolve(self._resp(409, { message: 'sha mismatch' }));
                    }
                    if (self._failMode === '403-rate') {
                        return Promise.resolve(self._resp(403, { message: 'rate limit' }, {
                            'X-RateLimit-Remaining': '0',
                            'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600)
                        }));
                    }
                    var sha = 'sha-' + Date.now();
                    self._store[path] = { content: decodeURIComponent(escape(atob(body.content))), sha: sha };
                    return Promise.resolve(self._resp(200, { content: { sha: sha }, commit: { sha: 'commit-1' } }));
                }
            }
            // jsdelivr / raw 读取
            if (u.indexOf('jsdelivr') >= 0 || u.indexOf('raw.githubusercontent') >= 0) {
                var rawPath = u.replace(/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/[^/]+\//, '');
                if (self._store[rawPath]) {
                    return Promise.resolve(self._resp(200, JSON.parse(self._store[rawPath].content)));
                }
                return Promise.resolve(self._resp(404, { message: 'Not Found' }));
            }
            if (self._realFetch) return self._realFetch.apply(this, arguments);
            return Promise.resolve(self._resp(404, {}));
        },
        _resp: function (status, body, headers) {
            var h = headers || {};
            return {
                ok: status >= 200 && status < 300,
                status: status,
                statusText: status === 200 ? 'OK' : 'Error',
                headers: { get: function (name) { return h[name] || null; } },
                json: function () { return Promise.resolve(body); },
                text: function () { return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)); }
            };
        },
        setStore: function (s) { this._store = JSON.parse(JSON.stringify(s)); },
        setOnline: function (v) { this._online = v; },
        setFailMode: function (m) { this._failMode = m; },
        getCalls: function () { return this._calls; },
        reset: function () { this._store = {}; this._calls = []; this._failMode = null; this._online = true; }
    };

    /* ========================================================
     * 三、测试辅助
     * ======================================================== */

    function setupArticle(html) {
        var container = document.createElement('div');
        container.className = 'markdown-body';
        container.innerHTML = html;
        document.body.appendChild(container);
        return container;
    }

    function cleanupContainer(container) {
        if (container && container.parentNode) container.parentNode.removeChild(container);
    }

    function makeComment(overrides) {
        var c = {
            id: 'pc_test_' + Math.random().toString(36).slice(2, 8),
            notePath: 'note/test.md',
            paragraphId: 'p_0_abc12345',
            paragraph: '预览文本',
            content: '测试内容',
            type: 'discussion',
            author: '测试者',
            authorId: 'anon_test',
            createdAt: '2026-06-23T10:00:00.000Z',
            updatedAt: '2026-06-23T10:00:00.000Z',
            likes: 0,
            likedBy: [],
            replies: [],
            expertReviews: [],
            deleted: false,
            syncedAt: null
        };
        if (overrides) for (var k in overrides) c[k] = overrides[k];
        return c;
    }

    /* ========================================================
     * 四、测试用例
     * ======================================================== */

    // —— PM 段落标记 ——
    describe('PM 段落标记', function () {
        var container;
        beforeEach(function () {
            MockStorage.install();
            MockStorage.clear();
            container = setupArticle('<p>第一段文字内容</p><p>第二段文字内容</p><p>第三段文字内容</p>');
        });
        afterEach(function () {
            cleanupContainer(container);
            MockStorage.restore();
        });

        it('PM-001 每个段落获得 data-pid', function () {
            var PC = window.ParagraphComments;
            var result = PC._internal.injectParagraphIds(container);
            var ps = container.querySelectorAll('p[data-pid]');
            assert.equal(ps.length, 3, '应标记 3 段');
            assert.equal(ps[0].getAttribute('data-pid'), '0', '首段 pid=0');
            assert.equal(ps[2].getAttribute('data-pid'), '2', '末段 pid=2');
            assert.ok(result.count === 3, '返回计数=3');
        });

        it('PM-003 标题不标记', function () {
            var PC = window.ParagraphComments;
            var c2 = setupArticle('<h2>标题</h2><p>正文段落</p>');
            PC._internal.injectParagraphIds(c2);
            var h = c2.querySelector('h2');
            assert.notOk(h.hasAttribute('data-pid'), '标题不应有 data-pid');
            var p = c2.querySelector('p');
            assert.ok(p.hasAttribute('data-pid'), '段落应有 data-pid');
            cleanupContainer(c2);
        });

        it('PM-005 空段落跳过', function () {
            var PC = window.ParagraphComments;
            var c2 = setupArticle('<p>   </p><p>有内容</p>');
            PC._internal.injectParagraphIds(c2);
            var empty = c2.querySelector('p:first-child');
            assert.notOk(empty.hasAttribute('data-pid'), '空段落不应标记');
            var real = c2.querySelectorAll('p[data-pid]');
            assert.equal(real.length, 1, '仅 1 段被标记');
            assert.equal(real[0].getAttribute('data-pid'), '0', '非空段 pid=0');
            cleanupContainer(c2);
        });

        it('PM-006 重复加载幂等', function () {
            var PC = window.ParagraphComments;
            PC._internal.injectParagraphIds(container);
            var pid1 = container.querySelector('p').getAttribute('data-pid');
            var fp1 = container.querySelector('p').getAttribute('data-fp');
            // 再次注入（先清理）
            var ps = container.querySelectorAll('p[data-pid]');
            for (var i = 0; i < ps.length; i++) ps[i].removeAttribute('data-pid');
            PC._internal.injectParagraphIds(container);
            var pid2 = container.querySelector('p').getAttribute('data-pid');
            var fp2 = container.querySelector('p').getAttribute('data-fp');
            assert.equal(pid1, pid2, 'pid 稳定');
            assert.equal(fp1, fp2, '指纹稳定');
        });

        it('PM-008 data-fp 指纹存在且为 8 位 hex', function () {
            var PC = window.ParagraphComments;
            PC._internal.injectParagraphIds(container);
            var fp = container.querySelector('p').getAttribute('data-fp');
            assert.ok(/^[0-9a-f]{8}$/.test(fp), '指纹为 8 位十六进制');
        });
    });

    // —— AN 段落定位稳定性 ——
    describe('AN 段落定位稳定性', function () {
        var container;
        beforeEach(function () {
            MockStorage.install();
            MockStorage.clear();
            container = setupArticle('<p>甲段文字</p><p>乙段文字</p><p>丙段文字</p>');
        });
        afterEach(function () {
            cleanupContainer(container);
            MockStorage.restore();
        });

        it('AN-001 指纹稳定（同段不改字）', function () {
            var PC = window.ParagraphComments;
            PC._internal.injectParagraphIds(container);
            var p1 = container.querySelector('p[data-pid="1"]');
            var fp = p1.getAttribute('data-fp');
            var resolved = PC._internal.resolveParagraph(1, fp, container);
            assert.ok(resolved, '应能解析');
            assert.equal(resolved.pid, 1, 'pid 一致');
            assert.isFalse(resolved.relocated, '未重定位');
        });

        it('AN-005 指纹全局匹配兜底（段前插入致 index 漂移）', function () {
            var PC = window.ParagraphComments;
            PC._internal.injectParagraphIds(container);
            var p2 = container.querySelector('p[data-pid="2"]');
            var fp2 = p2.getAttribute('data-fp');
            // 模拟段前插入：在首段前插入新段，重新注入
            var newP = document.createElement('p');
            newP.textContent = '新插入段';
            container.insertBefore(newP, container.firstChild);
            // 重新标记
            var ps = container.querySelectorAll('p[data-pid]');
            for (var i = 0; i < ps.length; i++) {
                ps[i].removeAttribute('data-pid');
                ps[i].removeAttribute('data-fp');
            }
            PC._internal.injectParagraphIds(container);
            // 原 p2 现在变成 p3，但指纹应能全局匹配找回
            var resolved = PC._internal.resolveParagraph(2, fp2, container);
            assert.ok(resolved, '指纹兜底应找回');
            assert.ok(resolved.relocated, '应标记为重定位');
        });

        it('AN-006 大幅改写后指纹失配返回 null', function () {
            var PC = window.ParagraphComments;
            PC._internal.injectParagraphIds(container);
            // 用一个不存在的指纹
            var resolved = PC._internal.resolveParagraph(0, 'deadbeef', container);
            assert.notOk(resolved, '不存在指纹应返回 null');
        });

        it('AN-008 空白归一化后指纹一致', function () {
            var PC = window.ParagraphComments;
            var c2 = setupArticle('<p>甲段  文字\n\n带空白</p>');
            var fp1 = PC._internal.computeParagraphFingerprint(c2.querySelector('p'));
            var c3 = setupArticle('<p>甲段 文字 带空白</p>');
            var fp2 = PC._internal.computeParagraphFingerprint(c3.querySelector('p'));
            assert.equal(fp1, fp2, '空白归一化后指纹一致');
            cleanupContainer(c2);
            cleanupContainer(c3);
        });
    });

    // —— ST 存储层 ——
    describe('ST localStorage 存储', function () {
        beforeEach(function () {
            MockStorage.install();
            MockStorage.clear();
        });
        afterEach(function () {
            MockStorage.restore();
        });

        it('ST-001 写入读取一致', function () {
            var Storage = window.ParagraphComments._internal.Storage;
            var c = makeComment({ content: '测试写入' });
            var ok = Storage.saveComments('note/test.md', [c]);
            assert.isTrue(ok, '保存成功');
            var loaded = Storage.loadComments('note/test.md');
            assert.equal(loaded.length, 1, '读取 1 条');
            assert.equal(loaded[0].content, '测试写入', '内容一致');
        });

        it('ST-002 按 notePath 分片互不污染', function () {
            var Storage = window.ParagraphComments._internal.Storage;
            Storage.saveComments('note/a.md', [makeComment({ id: 'c1', content: 'A' })]);
            Storage.saveComments('note/b.md', [makeComment({ id: 'c2', content: 'B' })]);
            var a = Storage.loadComments('note/a.md');
            var b = Storage.loadComments('note/b.md');
            assert.equal(a.length, 1, 'A 篇 1 条');
            assert.equal(b.length, 1, 'B 篇 1 条');
            assert.equal(a[0].content, 'A', 'A 内容');
            assert.equal(b[0].content, 'B', 'B 内容');
        });

        it('ST-003 配额超限捕获不崩溃', function () {
            var Storage = window.ParagraphComments._internal.Storage;
            MockStorage.setQuotaExceeded();
            var ok = Storage.saveComments('note/test.md', [makeComment()]);
            assert.isFalse(ok, '应返回 false');
            // 不应抛出未捕获异常
        });

        it('ST-005 全站评论索引', function () {
            var Storage = window.ParagraphComments._internal.Storage;
            Storage.saveComments('note/a.md', [makeComment({ id: 'c1' })]);
            Storage.saveComments('note/b.md', [makeComment({ id: 'c2' }), makeComment({ id: 'c3' })]);
            var all = Storage.loadAllComments();
            assert.ok(all['note/a.md'], 'A 篇存在');
            assert.ok(all['note/b.md'], 'B 篇存在');
            assert.equal(all['note/a.md'].length, 1, 'A 篇 1 条');
            assert.equal(all['note/b.md'].length, 2, 'B 篇 2 条');
        });

        it('ST-006 删除单篇', function () {
            var Storage = window.ParagraphComments._internal.Storage;
            Storage.saveComments('note/a.md', [makeComment()]);
            Storage.deleteNote('note/a.md');
            var loaded = Storage.loadComments('note/a.md');
            assert.equal(loaded.length, 0, '删除后为空');
        });

        it('ST-authorId 持久化', function () {
            var Storage = window.ParagraphComments._internal.Storage;
            var id1 = Storage.getAuthorId();
            var id2 = Storage.getAuthorId();
            assert.equal(id1, id2, 'authorId 持久化一致');
            assert.ok(id1.length > 0, 'authorId 非空');
        });
    });

    // —— CM 冲突合并 ——
    describe('CM 冲突合并', function () {
        var mergeComments;
        beforeEach(function () {
            MockStorage.install();
            MockStorage.clear();
            mergeComments = window.ParagraphComments._internal.mergeComments;
        });
        afterEach(function () { MockStorage.restore(); });

        it('CM-001 按 id 合并新增', function () {
            var local = [
                makeComment({ id: 'c1', content: '本地1', updatedAt: '2026-06-22T09:00:00Z' }),
                makeComment({ id: 'c2', content: '本地2', updatedAt: '2026-06-22T09:00:00Z' })
            ];
            var remote = [
                makeComment({ id: 'c2', content: '本地2', updatedAt: '2026-06-22T09:00:00Z' }),
                makeComment({ id: 'c3', content: '远端新增', updatedAt: '2026-06-22T10:00:00Z' })
            ];
            var merged = mergeComments(local, remote);
            assert.equal(merged.length, 3, 'c1+c2+c3');
            assert.ok(merged.some(function (c) { return c.id === 'c3'; }), '远端新增被合并');
        });

        it('CM-002 同 id LWW 较新者胜出', function () {
            var local = [makeComment({ id: 'c1', content: '旧', updatedAt: '2026-06-22T09:00:00Z' })];
            var remote = [makeComment({ id: 'c1', content: '新', updatedAt: '2026-06-22T10:00:00Z' })];
            var merged = mergeComments(local, remote);
            // 本地 updatedAt 09:00 < 远端 10:00，但合并是本地覆盖远端基线
            // 本地 09:00 >= 远端 10:00? 否，所以远端胜出
            assert.equal(merged[0].content, '新', '较新者胜');
        });

        it('CM-003 点赞并集', function () {
            var local = [makeComment({ id: 'c1', likes: 3, likedBy: ['a', 'b', 'c'], updatedAt: '2026-06-22T09:00:00Z' })];
            var remote = [makeComment({ id: 'c1', likes: 5, likedBy: ['a', 'd', 'e', 'f', 'g'], updatedAt: '2026-06-22T09:00:00Z' })];
            var merged = mergeComments(local, remote);
            assert.equal(merged[0].likedBy.length, 7, 'a-g 并集 7 个');
            assert.equal(merged[0].likes, 7, 'likes 重算为并集长度');
        });

        it('CM-004 回复按 id 并集', function () {
            var local = [makeComment({
                id: 'c1', updatedAt: '2026-06-22T09:00:00Z',
                replies: [{ id: 'r1', content: '回复1', author: 'A', createdAt: '2026-06-22T09:00:00Z' }]
            })];
            var remote = [makeComment({
                id: 'c1', updatedAt: '2026-06-22T09:00:00Z',
                replies: [
                    { id: 'r1', content: '回复1', author: 'A', createdAt: '2026-06-22T09:00:00Z' },
                    { id: 'r2', content: '回复2', author: 'B', createdAt: '2026-06-22T10:00:00Z' }
                ]
            })];
            var merged = mergeComments(local, remote);
            assert.equal(merged[0].replies.length, 2, '回复并集 2 条');
        });

        it('CM-005 删除标记传播', function () {
            var local = [makeComment({ id: 'c1', deleted: true, updatedAt: '2026-06-22T11:00:00Z' })];
            var remote = [makeComment({ id: 'c1', deleted: false, updatedAt: '2026-06-22T09:00:00Z' })];
            var merged = mergeComments(local, remote);
            assert.isTrue(merged[0].deleted, '较新者 deleted 应传播');
        });

        it('CM-007 合并幂等', function () {
            var local = [makeComment({ id: 'c1', content: 'x', updatedAt: '2026-06-22T09:00:00Z' })];
            var remote = [makeComment({ id: 'c1', content: 'x', updatedAt: '2026-06-22T09:00:00Z' })];
            var m1 = mergeComments(local, remote);
            var m2 = mergeComments(m1, remote);
            assert.equal(m1.length, m2.length, '重复合并数量一致');
            assert.equal(m1[0].content, m2[0].content, '内容一致');
        });

        it('CM-空输入安全', function () {
            assert.equal(mergeComments([], []).length, 0, '空+空=空');
            assert.equal(mergeComments(null, null).length, 0, 'null 安全');
            var one = [makeComment({ id: 'c1' })];
            assert.equal(mergeComments(one, []).length, 1, '本地有远端空');
        });
    });

    // —— XSS 防护 ——
    describe('XSS 防护', function () {
        var escapeHtml;
        beforeEach(function () {
            escapeHtml = window.ParagraphComments._internal.escapeHtml;
        });

        it('XS-001 脚本注入转义', function () {
            var out = escapeHtml('<script>alert(1)</script>');
            assert.notOk(out.indexOf('<script>') >= 0, '不应含原始 script 标签');
            assert.ok(out.indexOf('&lt;script&gt;') >= 0, '应转义');
        });

        it('XS-002 事件属性注入转义', function () {
            var out = escapeHtml('<img src=x onerror=alert(1)>');
            assert.notOk(out.indexOf('onerror=') >= 0, '不应含原始 onerror');
        });

        it('XS-003 HTML 实体注入显示字面量', function () {
            var out = escapeHtml('<b>粗体</b>');
            assert.ok(out.indexOf('&lt;b&gt;') >= 0, '应转义为字面量');
        });

        it('XS-008 特殊字符转义', function () {
            var out = escapeHtml('& < > "');
            assert.ok(out.indexOf('&amp;') >= 0, '转义 &');
            assert.ok(out.indexOf('&lt;') >= 0, '转义 <');
            assert.ok(out.indexOf('&gt;') >= 0, '转义 >');
            assert.ok(out.indexOf('&quot;') >= 0, '转义 "');
        });

        it('XS-null/undefined 安全', function () {
            assert.equal(escapeHtml(null), '', 'null 返回空串');
            assert.equal(escapeHtml(undefined), '', 'undefined 返回空串');
            assert.equal(escapeHtml(123), '123', '数字转字符串');
        });
    });

    // —— BD 边界 ——
    describe('BD 边界测试', function () {
        var createComment, Storage;
        beforeEach(function () {
            MockStorage.install();
            MockStorage.clear();
            var PC = window.ParagraphComments;
            createComment = PC._internal.createComment;
            Storage = PC._internal.Storage;
        });
        afterEach(function () { MockStorage.restore(); });

        it('BD-005 特殊字符（emoji/生僻字/全角）', function () {
            var content = '测试 emoji 😀 古文 龘 全角 ＡＢＣ';
            var c = createComment('note/test.md', 'p_0_abc12345', '预览', content, 'discussion', '作者', 'anon');
            Storage.saveComments('note/test.md', [c]);
            var loaded = Storage.loadComments('note/test.md');
            assert.equal(loaded[0].content, content, '特殊字符存储读取一致');
        });

        it('BD-006 换行保留', function () {
            var content = '第一行\n第二行\n第三行';
            var c = createComment('note/test.md', 'p_0_abc12345', '预览', content, 'discussion', '作者', 'anon');
            Storage.saveComments('note/test.md', [c]);
            var loaded = Storage.loadComments('note/test.md');
            assert.equal(loaded[0].content, content, '换行保留');
        });

        it('BD-009 并发提交 id 唯一', function () {
            var ids = {};
            for (var i = 0; i < 20; i++) {
                var c = createComment('note/test.md', 'p_0_abc12345', '预览', '内容' + i, 'discussion', '作者', 'anon');
                assert.notOk(ids[c.id], 'id 不重复: ' + c.id);
                ids[c.id] = true;
            }
        });

        it('BD-011 notePath 含中文/特殊字符', function () {
            var path = '资治通鉴/汉纪/第一卷.md';
            var c = createComment(path, 'p_0_abc12345', '预览', '内容', 'discussion', '作者', 'anon');
            Storage.saveComments(path, [c]);
            var loaded = Storage.loadComments(path);
            assert.equal(loaded.length, 1, '中文路径存储读取正常');
            assert.equal(loaded[0].notePath, path, 'notePath 一致');
        });

        it('BD-012 重复 id 导入去重', function () {
            var c1 = makeComment({ id: 'dup1', content: 'A' });
            var c2 = makeComment({ id: 'dup1', content: 'B', updatedAt: '2026-06-22T10:00:00Z' });
            // 模拟导入合并：同 id 去重
            var merged = window.ParagraphComments._internal.mergeComments([c1], [c2]);
            assert.equal(merged.length, 1, '同 id 去重为 1');
        });
    });

    // —— PC 评论对象结构 ——
    describe('PC 评论对象结构', function () {
        var createComment;
        beforeEach(function () {
            MockStorage.install();
            MockStorage.clear();
            createComment = window.ParagraphComments._internal.createComment;
        });
        afterEach(function () { MockStorage.restore(); });

        it('PC-006 Comment 字段完整', function () {
            var c = createComment('note/test.md', 'p_3_abc12345', '段落预览', '内容', 'error', '作者', 'anon_x');
            var required = ['id', 'notePath', 'paragraphId', 'paragraph', 'content', 'type', 'author', 'authorId', 'createdAt', 'updatedAt', 'likes', 'likedBy', 'replies', 'expertReviews', 'deleted', 'syncedAt'];
            for (var i = 0; i < required.length; i++) {
                assert.ok(required[i] in c, '字段存在: ' + required[i]);
            }
        });

        it('PC-007 paragraphId 正确关联', function () {
            var c = createComment('note/test.md', 'p_3_abc12345', '预览', '内容', 'discussion', '作者', 'anon');
            assert.equal(c.paragraphId, 'p_3_abc12345', 'paragraphId 关联正确');
            assert.equal(c.notePath, 'note/test.md', 'notePath 正确');
        });

        it('PC-005 类型枚举完整', function () {
            var types = window.ParagraphComments._internal.COMMENT_TYPES;
            var keys = Object.keys(types);
            assert.ok(keys.indexOf('error') >= 0, '含 error');
            assert.ok(keys.indexOf('praise') >= 0, '含 praise');
            assert.ok(keys.indexOf('discussion') >= 0, '含 discussion');
            assert.ok(keys.indexOf('supplement') >= 0, '含 supplement');
            assert.ok(keys.indexOf('thought') >= 0, '含 thought');
            assert.equal(keys.length, 5, '共 5 种类型');
            // 每种类型有 label/seal/color
            keys.forEach(function (k) {
                assert.ok(types[k].label, k + ' 有 label');
                assert.ok(types[k].seal, k + ' 有 seal');
                assert.ok(types[k].color, k + ' 有 color');
            });
        });

        it('PC-章评 id 前缀为 cc_', function () {
            var CHAPTER_PID = window.ParagraphComments._internal.CHAPTER_PID;
            var c = createComment('note/test.md', CHAPTER_PID, '', '章评内容', 'chapter', '作者', 'anon');
            assert.equal(c.id.indexOf('cc_'), 0, '章评 id 前缀 cc_');
        });
    });

    // —— GH GitHub 配置与路径 ——
    describe('GH GitHub 配置与路径', function () {
        var GitHubConfig, encodeCommentPath;
        beforeEach(function () {
            MockStorage.install();
            MockStorage.clear();
            var PC = window.ParagraphComments;
            GitHubConfig = PC._internal.GitHubConfig;
            encodeCommentPath = PC._internal.encodeCommentPath;
        });
        afterEach(function () { MockStorage.restore(); });

        it('GH-001 未配置时 isConfigured 返回 false', function () {
            assert.isFalse(GitHubConfig.isConfigured(), '未配置应返回 false');
        });

        it('GH-008 配置后路径正确', function () {
            GitHubConfig.set({ owner: 'me', repo: 'repo', token: 'tok', branch: 'main', commentsDir: 'site/data/comments' });
            assert.isTrue(GitHubConfig.isConfigured(), '配置后应返回 true');
            var path = encodeCommentPath('note/test.md');
            assert.ok(path.indexOf('site/data/comments/') === 0, '路径前缀正确');
            assert.ok(path.indexOf('.json') > 0, '以 .json 结尾');
        });

        it('GH-009 路径中 / 转换为 __', function () {
            GitHubConfig.set({ owner: 'me', repo: 'repo', token: 'tok' });
            var path = encodeCommentPath('book/chapter.md');
            assert.ok(path.indexOf('book__chapter') >= 0, '/ 转为 __');
            assert.notOk(path.indexOf('book/chapter') >= 0, '不含原始 /');
        });

        it('GH-clear 清除配置', function () {
            GitHubConfig.set({ owner: 'me', repo: 'repo', token: 'tok' });
            assert.isTrue(GitHubConfig.isConfigured());
            GitHubConfig.clear();
            assert.isFalse(GitHubConfig.isConfigured(), '清除后未配置');
        });

        it('GH-base64 中文编解码', function () {
            // 验证 utf8ToBase64 逻辑（通过 Storage 间接）
            var Storage = window.ParagraphComments._internal.Storage;
            var c = makeComment({ content: '中文测试 内容' });
            Storage.saveComments('note/test.md', [c]);
            var raw = MockStorage._store['pc:comments:note/test.md'];
            // 解析回来应正确
            var parsed = JSON.parse(raw);
            assert.equal(parsed[0].content, '中文测试 内容', '中文存储读取无乱码');
        });
    });

    // —— OQ 离线队列 ——
    describe('OQ 离线队列', function () {
        var SyncQueue, Storage;
        beforeEach(function () {
            MockStorage.install();
            MockStorage.clear();
            var PC = window.ParagraphComments;
            SyncQueue = PC._internal.SyncQueue;
            Storage = PC._internal.Storage;
        });
        afterEach(function () { MockStorage.restore(); });

        it('OQ-001 入队持久化', function () {
            var op = {
                id: 'op_1', type: 'upsert', commentId: 'c1', notePath: 'note/test.md',
                payload: makeComment({ id: 'c1' }), createdAt: '2026-06-23T10:00:00Z', retries: 0
            };
            SyncQueue.enqueue(op);
            var pending = Storage.loadPending();
            assert.equal(pending.length, 1, '入队 1 条');
        });

        it('OQ-002 出队移除', function () {
            var op = {
                id: 'op_1', type: 'upsert', commentId: 'c1', notePath: 'note/test.md',
                payload: makeComment({ id: 'c1' }), createdAt: '2026-06-23T10:00:00Z', retries: 0
            };
            SyncQueue.enqueue(op);
            SyncQueue.dequeue('op_1');
            var pending = Storage.loadPending();
            assert.equal(pending.length, 0, '出队后为空');
        });

        it('OQ-005 同 commentId+type 去重保留最新', function () {
            SyncQueue.enqueue({
                id: 'op_1', type: 'upsert', commentId: 'c1', notePath: 'note/test.md',
                payload: makeComment({ id: 'c1', content: '旧' }), createdAt: '2026-06-23T10:00:00Z', retries: 0
            });
            SyncQueue.enqueue({
                id: 'op_2', type: 'upsert', commentId: 'c1', notePath: 'note/test.md',
                payload: makeComment({ id: 'c1', content: '新' }), createdAt: '2026-06-23T11:00:00Z', retries: 0
            });
            var pending = Storage.loadPending();
            assert.equal(pending.length, 1, '同 commentId+type 去重为 1');
            assert.equal(pending[0].payload.content, '新', '保留最新');
        });

        it('OQ-process 未配置时跳过', async function () {
            var result = await SyncQueue.process();
            assert.equal(result.processed, 0, '未配置不处理');
            assert.equal(result.reason, 'not_configured', '原因 not_configured');
        });
    });

    // —— simpleHash / 指纹算法 ——
    describe('FP 指纹算法', function () {
        var simpleHash, computeParagraphFingerprint;
        beforeEach(function () {
            var PC = window.ParagraphComments._internal;
            simpleHash = PC.simpleHash;
            computeParagraphFingerprint = PC.computeParagraphFingerprint;
        });

        it('FP-返回 8 位 hex', function () {
            var h = simpleHash('hello');
            assert.ok(/^[0-9a-f]{8}$/.test(h), '8 位十六进制');
        });

        it('FP-相同输入相同输出', function () {
            assert.equal(simpleHash('测试'), simpleHash('测试'), '确定性');
        });

        it('FP-不同输入大概率不同', function () {
            assert.notEqual(simpleHash('甲'), simpleHash('乙'), '不同输入不同输出');
        });

        it('FP-空串返回 00000000', function () {
            var c = setupArticle('<p></p>');
            var fp = computeParagraphFingerprint(c.querySelector('p'));
            assert.equal(fp, '00000000', '空段落指纹 00000000');
            cleanupContainer(c);
        });
    });

    /* ========================================================
     * 五、测试运行器
     * ======================================================== */

    async function runSuite(suite) {
        var results = [];
        for (var i = 0; i < suite.tests.length; i++) {
            var t = suite.tests[i];
            stats.total++;
            var err = null;
            try {
                if (suite.beforeEach) suite.beforeEach();
                if (t.async) {
                    await t.fn();
                } else {
                    t.fn();
                }
                stats.passed++;
            } catch (e) {
                err = e;
                stats.failed++;
            } finally {
                if (suite.afterEach) {
                    try { suite.afterEach(); } catch (e) {}
                }
            }
            results.push({ name: t.name, passed: !err, error: err ? err.message : null });
        }
        return results;
    }

    async function runAll() {
        var PC = window.ParagraphComments;
        if (!PC) {
            renderResults([{
                suite: '环境',
                results: [{ name: 'ParagraphComments 加载', passed: false, error: 'window.ParagraphComments 未定义，请先引入 paragraph-comments.js' }]
            }]);
            return;
        }

        var allResults = [];
        for (var i = 0; i < suites.length; i++) {
            var suiteResults = await runSuite(suites[i]);
            allResults.push({ suite: suites[i].name, results: suiteResults });
        }
        renderResults(allResults);
        // 控制台汇总
        console.log('%c[段评测试] 通过 ' + stats.passed + '/' + stats.total + '，失败 ' + stats.failed,
            'color:' + (stats.failed === 0 ? 'green' : 'red') + ';font-weight:bold');
        if (stats.failed > 0) {
            allResults.forEach(function (s) {
                s.results.forEach(function (r) {
                    if (!r.passed) console.error('✗ ' + s.suite + ' · ' + r.name + '\n  ' + r.error);
                });
            });
        }
    }

    function renderResults(allResults) {
        var container = document.getElementById('pc-test-results');
        if (!container) return;
        var html = '<div class="pc-test-summary" style="font-family:monospace;padding:16px;border:1px solid #ccc;border-radius:4px;background:#fafafa;">';
        html += '<h2 style="margin:0 0 12px;">段落评论系统 · 单元测试</h2>';
        var color = stats.failed === 0 ? 'green' : 'red';
        html += '<p style="font-size:14px;color:' + color + ';font-weight:bold;">通过 ' + stats.passed + ' / ' + stats.total +
            '，失败 ' + stats.failed + '</p>';
        allResults.forEach(function (s) {
            html += '<div style="margin:12px 0;border-top:1px solid #eee;padding-top:8px;">';
            html += '<h3 style="margin:0 0 6px;font-size:14px;">' + escapeText(s.suite) + '</h3>';
            s.results.forEach(function (r) {
                var c = r.passed ? 'green' : 'red';
                var icon = r.passed ? '✓' : '✗';
                html += '<div style="font-size:13px;color:' + c + ';padding:2px 0 2px 12px;">' + icon + ' ' + escapeText(r.name);
                if (!r.passed && r.error) html += '<span style="color:#999;display:block;padding-left:16px;">' + escapeText(r.error) + '</span>';
                html += '</div>';
            });
            html += '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    function escapeText(t) {
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ========================================================
     * 六、启动
     * ======================================================== */

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runAll);
    } else {
        runAll();
    }

    // 暴露给手动调用（控制台调试）
    window.PCTest = {
        run: runAll,
        stats: stats,
        MockStorage: MockStorage,
        MockFetch: MockFetch,
        makeComment: makeComment,
        setupArticle: setupArticle
    };

})();
