(function () {
    'use strict';

    const state = {
        booksData: [],        // books 数组
        categories: [],       // 分类列表
        notesIndex: {},       // notes 字典
        currentView: 'bookshelf',  // 'bookshelf' | 'reader'
        currentBook: null,    // 当前书 id
        currentBookTree: [],  // 当前书的 tree
        activePath: null,
        searchQuery: '',
        searchMode: false
    };

    const elements = {
        treeNav: document.getElementById('treeNav'),
        reader: document.getElementById('reader'),
        searchInput: document.getElementById('searchInput'),
        newNoteBtn: document.getElementById('newNoteBtn'),
        refreshBtn: document.getElementById('refreshBtn'),
        modalOverlay: document.getElementById('modalOverlay'),
        modalClose: document.getElementById('modalClose'),
        cancelBtn: document.getElementById('cancelBtn'),
        viewBookshelf: document.getElementById('viewBookshelf'),
        viewReader: document.getElementById('viewReader'),
        bookshelf: document.getElementById('bookshelf'),
        backBtn: document.getElementById('backBtn'),
        currentBookTitle: document.getElementById('currentBookTitle')
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function sanitizeHtml(html) {
        // 移除 script 标签
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        // 移除 on* 事件属性
        html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
        html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
        html = html.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
        return html;
    }

    function showError(message, err) {
        console.error(message, err || '');
        alert(message);
    }

    function nodeMatches(node, query) {
        const text = (node.title || '').toLowerCase();
        return text.includes(query);
    }

    function filterTree(nodes, query) {
        if (!query) return nodes;
        const result = [];
        for (const node of nodes) {
            const children = node.children ? filterTree(node.children, query) : [];
            const matched = nodeMatches(node, query);
            if (matched || children.length > 0) {
                const clone = Object.assign({}, node);
                if (children.length > 0) {
                    clone.children = children;
                }
                result.push(clone);
            }
        }
        return result;
    }

    function expandMatchedNodes(container) {
        if (!state.searchQuery) return;
        const matchedLeaves = container.querySelectorAll('.tree-leaf');
        matchedLeaves.forEach((leaf) => {
            let parent = leaf.closest('.tree-node');
            while (parent) {
                parent.classList.add('expanded');
                parent = parent.parentElement.closest('.tree-node');
            }
        });
    }

    function getNodeIcon(node, isLeaf) {
        if (isLeaf) return '📝';
        if (node.type === 'book') return '📖';
        if (node.type === 'chapter') return '📑';
        return '📁';
    }

    function renderTree(nodes, depth = 0) {
        if (!nodes || nodes.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '暂无笔记';
            return empty;
        }
        const ul = document.createElement('ul');
        ul.className = 'tree-list';

        nodes.forEach((node) => {
            const hasChildren = Array.isArray(node.children) && node.children.length > 0;
            const li = document.createElement('li');
            li.className = 'tree-node' + (hasChildren ? ' expanded' : '');
            li.dataset.depth = String(depth);

            const icon = getNodeIcon(node, !hasChildren);
            const title = escapeHtml(node.title || '未命名');

            if (hasChildren) {
                const toggle = document.createElement('button');
                toggle.className = 'tree-toggle';
                toggle.type = 'button';
                toggle.innerHTML = `<span class="tree-arrow" aria-hidden="true">▶</span><span class="tree-icon">${icon}</span><span>${title}</span>`;
                toggle.addEventListener('click', () => {
                    li.classList.toggle('expanded');
                });
                li.appendChild(toggle);

                const childrenContainer = document.createElement('ul');
                childrenContainer.className = 'tree-children';
                childrenContainer.appendChild(renderTree(node.children, depth + 1));
                li.appendChild(childrenContainer);
            } else {
                const leaf = document.createElement('button');
                leaf.className = 'tree-leaf';
                leaf.type = 'button';
                leaf.dataset.path = node.path || '';
                leaf.innerHTML = `<span class="tree-icon">${icon}</span><span>${title}</span>`;
                leaf.addEventListener('click', () => loadNote(node.path, leaf));
                if (state.activePath && state.activePath === node.path) {
                    leaf.classList.add('active');
                }
                li.appendChild(leaf);
            }

            ul.appendChild(li);
        });

        return ul;
    }

    // 统计树中叶子节点（笔记）数量
    function countNotes(node) {
        if (!node) return 0;
        if (node.path) return 1;
        if (!node.children) return 0;
        return node.children.reduce((sum, child) => sum + countNotes(child), 0);
    }

    // 切换视图显隐
    function switchView(view) {
        if (view === 'bookshelf') {
            elements.viewBookshelf.hidden = false;
            elements.viewReader.hidden = true;
        } else {
            elements.viewBookshelf.hidden = true;
            elements.viewReader.hidden = false;
        }
    }

    // 渲染书架：按分类分组，支持搜索过滤
    function renderBookshelf() {
        const container = elements.bookshelf;
        container.innerHTML = '';

        let books = state.booksData;

        // 搜索过滤：按书名/作者/分类匹配
        if (state.searchQuery) {
            const q = state.searchQuery;
            books = books.filter((book) => {
                const title = (book.title || '').toLowerCase();
                const author = (book.author || '').toLowerCase();
                const category = (book.category || '').toLowerCase();
                return title.includes(q) || author.includes(q) || category.includes(q);
            });
        }

        if (books.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = state.searchQuery ? '未找到匹配的书籍' : '书架暂无书籍';
            container.appendChild(empty);
            return;
        }

        // 按分类分组
        const grouped = {};
        state.categories.forEach((cat) => { grouped[cat] = []; });
        books.forEach((book) => {
            const cat = book.category || '未分类';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(book);
        });

        // 每个分类下按 sort 排序
        Object.keys(grouped).forEach((cat) => {
            grouped[cat].sort((a, b) => (a.sort || 0) - (b.sort || 0));
        });

        // 渲染每个分类区块
        state.categories.forEach((cat) => {
            const catBooks = grouped[cat] || [];
            if (catBooks.length === 0) return;

            const section = document.createElement('section');
            section.className = 'bookshelf-section';

            const title = document.createElement('h3');
            title.className = 'bookshelf-category-title';
            title.textContent = cat;
            section.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'book-grid';

            catBooks.forEach((book) => {
                const card = document.createElement('button');
                card.className = 'book-card';
                card.type = 'button';
                card.dataset.bookId = book.id;

                const cover = document.createElement('div');
                cover.className = 'book-cover';
                cover.textContent = book.cover || '📖';
                card.appendChild(cover);

                const info = document.createElement('div');
                info.className = 'book-info';

                const titleEl = document.createElement('div');
                titleEl.className = 'book-title';
                titleEl.textContent = book.title || book.id;
                info.appendChild(titleEl);

                if (book.author) {
                    const author = document.createElement('div');
                    author.className = 'book-author';
                    author.textContent = book.author;
                    info.appendChild(author);
                }

                if (book.description) {
                    const desc = document.createElement('div');
                    desc.className = 'book-description';
                    desc.textContent = book.description;
                    info.appendChild(desc);
                }

                const stats = document.createElement('div');
                stats.className = 'book-stats';
                stats.textContent = `章节 ${book.chapter_count || 0} · 笔记 ${book.note_count || 0}`;
                info.appendChild(stats);

                card.appendChild(info);
                card.addEventListener('click', () => openBook(book.id));
                grid.appendChild(card);
            });

            section.appendChild(grid);
            container.appendChild(section);
        });
    }

    // 进入阅读视图：加载指定书的目录树
    function openBook(bookId) {
        const book = state.booksData.find((b) => b.id === bookId);
        if (!book) return;

        state.currentBook = bookId;
        state.currentBookTree = book.tree || [];
        state.currentView = 'reader';
        state.searchQuery = '';
        state.searchMode = false;
        state.activePath = null;
        elements.searchInput.value = '';

        switchView('reader');
        elements.currentBookTitle.textContent = book.title || bookId;
        refreshTreeView();

        // 清空阅读区为占位符
        elements.reader.innerHTML = '<div class="reader-placeholder"><p>请在左侧选择一篇笔记开始阅读。</p></div>';
    }

    // 返回书架
    function backToBookshelf() {
        state.currentView = 'bookshelf';
        state.currentBook = null;
        state.currentBookTree = [];
        state.searchQuery = '';
        state.searchMode = false;
        state.activePath = null;
        elements.searchInput.value = '';

        switchView('bookshelf');
        renderBookshelf();
    }

    // 加载 index.json，存储 books/categories/notes
    async function loadIndex() {
        try {
            const response = await fetch('data/index.json');
            if (!response.ok) {
                throw new Error(`请求失败 (${response.status}): ${response.statusText}`);
            }
            const data = await response.json();

            state.booksData = data.books || [];
            state.categories = data.categories || [];
            state.notesIndex = data.notes || {};
            state.searchMode = false;
            state.searchQuery = '';

            // 若 categories 缺失但 books 存在，从 books 派生分类（防御性）
            if (state.categories.length === 0 && state.booksData.length > 0) {
                const catSet = new Set();
                state.booksData.forEach((b) => catSet.add(b.category || '未分类'));
                state.categories = Array.from(catSet);
            }

            // 兼容 v1.0.0：若 books 缺失，从顶层 tree 派生
            if (state.booksData.length === 0 && data.tree && data.tree.length > 0) {
                state.booksData = data.tree.map((bookNode) => ({
                    id: bookNode.title,
                    title: bookNode.title,
                    category: '未分类',
                    description: '',
                    author: '',
                    cover: '📖',
                    sort: 0,
                    chapter_count: (bookNode.children || []).length,
                    note_count: countNotes(bookNode),
                    tree: bookNode.children || []
                }));
                state.categories = ['未分类'];
            }

            // 若当前在阅读视图，刷新当前书的目录
            if (state.currentView === 'reader' && state.currentBook) {
                const book = state.booksData.find((b) => b.id === state.currentBook);
                if (book) {
                    state.currentBookTree = book.tree || [];
                    elements.currentBookTitle.textContent = book.title || book.id;
                }
                refreshTreeView();
            } else {
                renderBookshelf();
            }
        } catch (err) {
            elements.bookshelf.innerHTML = '';
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '加载书架失败';
            elements.bookshelf.appendChild(empty);
            showError('无法加载书架数据，请检查 data/index.json 是否存在。', err);
        }
    }

    function refreshTreeView() {
        const filtered = filterTree(state.currentBookTree, state.searchQuery);
        const rendered = renderTree(filtered);
        elements.treeNav.innerHTML = '';
        elements.treeNav.appendChild(rendered);
        expandMatchedNodes(elements.treeNav);
    }

    function parseFrontmatter(content) {
        const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n*/);
        if (!match) return { meta: null, body: content };
        const metaBlock = match[1];
        const body = content.slice(match[0].length);
        const meta = {};
        metaBlock.split('\n').forEach((line) => {
            const idx = line.indexOf(':');
            if (idx === -1) return;
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (key) meta[key] = value;
        });
        return { meta, body };
    }

    async function loadNote(path, targetElement) {
        if (!path) return;

        // 若不在阅读视图，先找到笔记所属书并 openBook
        if (state.currentView !== 'reader') {
            const note = state.notesIndex[path];
            if (note && note.book) {
                const book = state.booksData.find((b) => b.id === note.book);
                if (book) {
                    openBook(book.id);
                } else {
                    switchView('reader');
                }
            } else {
                switchView('reader');
            }
        } else {
            // 在阅读视图，但笔记属于其他书时自动切换
            const note = state.notesIndex[path];
            if (note && note.book && note.book !== state.currentBook) {
                const book = state.booksData.find((b) => b.id === note.book);
                if (book) {
                    openBook(book.id);
                }
            }
        }

        // 若仍在搜索模式（阅读视图同书跳转），退出搜索并恢复目录树
        if (state.searchMode) {
            state.searchMode = false;
            state.searchQuery = '';
            elements.searchInput.value = '';
            refreshTreeView();
        }

        state.activePath = path;

        const allLeaves = elements.treeNav.querySelectorAll('.tree-leaf');
        allLeaves.forEach((leaf) => leaf.classList.remove('active'));
        if (targetElement) {
            targetElement.classList.add('active');
        } else {
            const match = elements.treeNav.querySelector(`.tree-leaf[data-path="${CSS.escape(path)}"]`);
            if (match) match.classList.add('active');
        }

        elements.reader.innerHTML = '<div class="reader-placeholder">正在加载笔记…</div>';
        try {
            const content = await fetch('notes/' + encodeURI(path)).then((r) => {
                if (!r.ok) {
                    throw new Error(`请求失败 (${r.status}): ${r.statusText}`);
                }
                return r.text();
            });
            const { meta, body } = parseFrontmatter(content || '');
            const html = sanitizeHtml(marked.parse(body, { gfm: true }));

            let metaHtml = '';
            if (meta && (meta.title || meta.created_at)) {
                metaHtml = '<div class="note-meta">';
                if (meta.title) metaHtml += `<span class="note-meta-title">${escapeHtml(meta.title)}</span>`;
                if (meta.book || meta.chapter) {
                    metaHtml += `<span class="note-meta-path">${escapeHtml([meta.book, meta.chapter].filter(Boolean).join(' / '))}</span>`;
                }
                if (meta.created_at) metaHtml += `<span class="note-meta-date">${escapeHtml(meta.created_at)}</span>`;
                metaHtml += '</div>';
            }

            elements.reader.innerHTML = `<article class="markdown-body">${metaHtml}${html}</article>`;
        } catch (err) {
            elements.reader.innerHTML = '<div class="reader-placeholder">加载失败，请重试。</div>';
            showError('无法加载笔记内容。', err);
        }
    }

    function openModal() {
        elements.modalOverlay.classList.add('open');
        elements.modalOverlay.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
        elements.modalOverlay.classList.remove('open');
        elements.modalOverlay.setAttribute('aria-hidden', 'true');
    }

    // 输入事件：根据当前视图过滤（书架过滤书籍，阅读过滤目录树）
    function handleSearch(event) {
        state.searchQuery = event.target.value.trim().toLowerCase();
        if (!state.searchQuery) {
            state.searchMode = false;
            if (state.currentView === 'bookshelf') {
                renderBookshelf();
            } else {
                refreshTreeView();
            }
            return;
        }
        if (state.searchMode) {
            state.searchMode = false;
        }
        if (state.currentView === 'bookshelf') {
            renderBookshelf();
        } else {
            refreshTreeView();
        }
    }

    // 回车事件：全文搜索所有笔记，结果展示在当前视图主区域
    async function handleSearchEnter(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const query = elements.searchInput.value.trim().toLowerCase();
        if (!query) {
            state.searchMode = false;
            if (state.currentView === 'bookshelf') {
                renderBookshelf();
            } else {
                refreshTreeView();
            }
            return;
        }

        const results = [];
        for (const [path, note] of Object.entries(state.notesIndex || {})) {
            const title = note.title || note.event || '';
            const content = note.content || '';
            const titleLower = title.toLowerCase();
            const contentLower = content.toLowerCase();

            let matched = false;
            let snippet = '';

            if (titleLower.includes(query)) {
                matched = true;
                snippet = content.slice(0, 100).replace(/\n/g, ' ');
                if (content.length > 100) snippet += '…';
            } else if (contentLower.includes(query)) {
                matched = true;
                const idx = contentLower.indexOf(query);
                const start = Math.max(0, idx - 30);
                const end = Math.min(content.length, idx + query.length + 60);
                snippet = content.slice(start, end).replace(/\n/g, ' ');
                if (start > 0) snippet = '…' + snippet;
                if (end < content.length) snippet += '…';
            }

            if (matched) {
                results.push({
                    path: path,
                    book: note.book,
                    chapter: note.chapter,
                    event: note.event,
                    title: title,
                    snippet: snippet
                });
            }
        }
        state.searchMode = true;
        renderSearchResults(results, elements.searchInput.value.trim());
    }

    // 渲染搜索结果到当前视图的主区域
    function renderSearchResults(results, query) {
        // 书架视图结果替换书架内容；阅读视图结果替换目录树区域
        const target = state.currentView === 'bookshelf' ? elements.bookshelf : elements.treeNav;
        target.innerHTML = '';

        if (results.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = `未找到与「${query}」相关的笔记`;
            target.appendChild(empty);
            return;
        }
        const header = document.createElement('div');
        header.className = 'search-results-header';
        header.textContent = `找到 ${results.length} 条结果`;
        target.appendChild(header);

        const list = document.createElement('ul');
        list.className = 'search-results';
        results.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'search-result-item';

            const title = document.createElement('button');
            title.className = 'search-result-title';
            title.type = 'button';
            title.textContent = item.title || item.path;
            title.addEventListener('click', () => loadNote(item.path));
            li.appendChild(title);

            if (item.book || item.chapter) {
                const meta = document.createElement('div');
                meta.className = 'search-result-meta';
                meta.textContent = [item.book, item.chapter].filter(Boolean).join(' / ');
                li.appendChild(meta);
            }

            if (item.snippet) {
                const snippet = document.createElement('div');
                snippet.className = 'search-result-snippet';
                snippet.textContent = item.snippet;
                li.appendChild(snippet);
            }

            list.appendChild(li);
        });
        target.appendChild(list);
    }

    function handleKeyDown(event) {
        if (event.key === 'Escape' && elements.modalOverlay.classList.contains('open')) {
            closeModal();
        }
    }

    function init() {
        if (typeof marked === 'undefined') {
            elements.reader.innerHTML = '<div class="reader-placeholder">Markdown 渲染组件加载失败，请检查网络连接。</div>';
            console.error('marked.js is not loaded');
        }

        elements.searchInput.addEventListener('input', handleSearch);
        elements.searchInput.addEventListener('keydown', handleSearchEnter);
        elements.newNoteBtn.addEventListener('click', openModal);
        if (elements.refreshBtn) {
            elements.refreshBtn.addEventListener('click', loadIndex);
        }
        if (elements.backBtn) {
            elements.backBtn.addEventListener('click', backToBookshelf);
        }
        elements.modalClose.addEventListener('click', closeModal);
        if (elements.cancelBtn) {
            elements.cancelBtn.addEventListener('click', closeModal);
        }
        elements.modalOverlay.addEventListener('click', (event) => {
            if (event.target === elements.modalOverlay) {
                closeModal();
            }
        });
        document.addEventListener('keydown', handleKeyDown);

        loadIndex();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
