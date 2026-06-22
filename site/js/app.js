(function () {
    'use strict';

    const state = {
        booksData: [],
        categories: [],
        notesIndex: {},
        currentView: 'home',
        currentBook: null,
        currentBookTree: [],
        activePath: null,
        searchQuery: '',
        selectedCategory: 'all'
    };

    const elements = {
        homeView: document.getElementById('homeView'),
        readerView: document.getElementById('readerView'),
        bookshelfGrid: document.getElementById('bookshelfGrid'),
        categoryTabs: document.getElementById('categoryTabs'),
        searchInput: document.getElementById('searchInput'),
        heroStats: document.getElementById('heroStats'),
        treeNav: document.getElementById('treeNav'),
        reader: document.getElementById('reader'),
        backBtn: document.getElementById('backBtn'),
        currentBookTitle: document.getElementById('currentBookTitle'),
        newNoteBtn: document.getElementById('newNoteBtn'),
        newNoteLink: document.getElementById('newNoteLink'),
        modalOverlay: document.getElementById('modalOverlay'),
        modalClose: document.getElementById('modalClose'),
        cancelBtn: document.getElementById('cancelBtn')
    };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function sanitizeHtml(html) {
        html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
        html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
        html = html.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
        return html;
    }

    function showError(message, err) {
        console.error(message, err || '');
        alert(message);
    }

    async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`请求失败 (${response.status}): ${response.statusText}`);
        }
        return response.json();
    }

    function renderHeroStats(stats) {
        if (!stats) {
            elements.heroStats.innerHTML = '<span>正在统计书目…</span>';
            return;
        }
        elements.heroStats.innerHTML = `
            <div class="stat"><span class="stat-value">${stats.books || 0}</span><span class="stat-label">部典籍</span></div>
            <div class="stat"><span class="stat-value">${stats.notes || 0}</span><span class="stat-label">篇笔记</span></div>
            <div class="stat"><span class="stat-value">${stats.categories || 0}</span><span class="stat-label">个分类</span></div>
        `;
    }

    function renderCategoryTabs() {
        const container = elements.categoryTabs;
        container.innerHTML = '';

        const allBtn = document.createElement('button');
        allBtn.className = 'category-tab' + (state.selectedCategory === 'all' ? ' active' : '');
        allBtn.textContent = '全部';
        allBtn.dataset.category = 'all';
        allBtn.type = 'button';
        allBtn.role = 'tab';
        allBtn.setAttribute('aria-selected', state.selectedCategory === 'all' ? 'true' : 'false');
        allBtn.addEventListener('click', () => selectCategory('all'));
        container.appendChild(allBtn);

        state.categories.forEach((cat) => {
            const btn = document.createElement('button');
            btn.className = 'category-tab' + (state.selectedCategory === cat ? ' active' : '');
            btn.textContent = cat;
            btn.dataset.category = cat;
            btn.type = 'button';
            btn.role = 'tab';
            btn.setAttribute('aria-selected', state.selectedCategory === cat ? 'true' : 'false');
            btn.addEventListener('click', () => selectCategory(cat));
            container.appendChild(btn);
        });
    }

    function selectCategory(category) {
        state.selectedCategory = category;
        renderCategoryTabs();
        renderBookshelf();
    }

    function filterBooks() {
        let books = state.booksData;

        if (state.selectedCategory !== 'all') {
            books = books.filter((book) => book.category === state.selectedCategory);
        }

        const query = state.searchQuery.trim().toLowerCase();
        if (query) {
            books = books.filter((book) => {
                const title = (book.title || '').toLowerCase();
                const author = (book.author || '').toLowerCase();
                const category = (book.category || '').toLowerCase();
                const description = (book.description || '').toLowerCase();
                return title.includes(query) || author.includes(query) || category.includes(query) || description.includes(query);
            });
        }

        return books;
    }

    function renderBookshelf() {
        const container = elements.bookshelfGrid;
        container.innerHTML = '';

        const books = filterBooks();

        if (books.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = state.searchQuery ? '未找到匹配的书籍' : '书架暂无书籍';
            container.appendChild(empty);
            return;
        }

        books.forEach((book) => {
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

            const category = document.createElement('div');
            category.className = 'book-category';
            category.textContent = book.category || '未分类';
            info.appendChild(category);

            const title = document.createElement('div');
            title.className = 'book-title';
            title.textContent = book.title || book.id;
            info.appendChild(title);

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
            container.appendChild(card);
        });
    }

    function handleSearch(event) {
        state.searchQuery = event.target.value;
        renderBookshelf();
    }

    function switchView(view) {
        state.currentView = view;
        if (view === 'home') {
            elements.homeView.hidden = false;
            elements.readerView.hidden = true;
            document.body.style.overflow = '';
        } else {
            elements.homeView.hidden = true;
            elements.readerView.hidden = false;
            document.body.style.overflow = 'hidden';
        }
    }

    function openBook(bookId) {
        const book = state.booksData.find((b) => b.id === bookId);
        if (!book) return;

        state.currentBook = bookId;
        state.currentBookTree = book.tree || [];
        state.activePath = null;

        switchView('reader');
        elements.currentBookTitle.textContent = book.title || bookId;
        elements.reader.innerHTML = '<div class="reader-placeholder"><p>请在左侧选择一篇笔记开始阅读。</p></div>';
        refreshTreeView();
    }

    function backToHome() {
        state.currentBook = null;
        state.currentBookTree = [];
        state.activePath = null;
        state.searchQuery = '';
        elements.searchInput.value = '';
        switchView('home');
        renderBookshelf();
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

    function refreshTreeView() {
        const rendered = renderTree(state.currentBookTree);
        elements.treeNav.innerHTML = '';
        elements.treeNav.appendChild(rendered);
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

        const note = state.notesIndex[path];
        if (note && note.book && note.book !== state.currentBook) {
            const book = state.booksData.find((b) => b.id === note.book);
            if (book) {
                openBook(book.id);
            }
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

    async function loadIndex() {
        try {
            const data = await fetchJson('data/index.json');
            state.booksData = data.books || [];
            state.categories = data.categories || [];
            state.notesIndex = data.notes || {};

            renderHeroStats(data.stats);
            renderCategoryTabs();
            renderBookshelf();
        } catch (err) {
            elements.bookshelfGrid.innerHTML = '';
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '加载书架失败';
            elements.bookshelfGrid.appendChild(empty);
            showError('无法加载书架数据，请检查 data/index.json 是否存在。', err);
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
        elements.backBtn.addEventListener('click', backToHome);
        elements.newNoteBtn.addEventListener('click', openModal);
        elements.newNoteLink.addEventListener('click', (event) => {
            event.preventDefault();
            openModal();
        });
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
