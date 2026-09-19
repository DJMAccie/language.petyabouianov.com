/**
 * studio-core.js: Nihongo Studio Learning Engine (Facade & Coordinator)
 * 
 * Initialize with: StudioCore.init(config)
 */
const StudioCore = window.StudioCore = (() => {
    let loadedLists = {};
    // Names of shared-library lists, so the UI can mark them read-only and keep
    // personal copies distinguishable from the owner's library.
    let sharedListNames = [];
    let personalListNames = [];
    let loadedScores = {};
    let wordStats = {};
    let kanjiMnemonics = {};
    let config = {};
    let isFetchingLists = false;

    // Provide internal data accessors for submodules
    window._studio = {
        getLoadedLists: () => loadedLists,
        getLoadedScores: () => loadedScores,
        getWordStats: () => wordStats,
        getKanjiMnemonics: () => kanjiMnemonics
    };

    function setFavicon(emoji) {
        if (!document.head) return;
        document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => el.remove());
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
        document.head.appendChild(link);
    }

    function injectMultipleChoiceOption() {
        const select = document.getElementById('global-quiz-mode');
        if (!select || select.querySelector('option[value="choice"]')) return;
        const opt = document.createElement('option');
        opt.value = 'choice';
        opt.textContent = '🎯 Multiple Choice';
        select.appendChild(opt);
    }

    function injectToolbarButtons() {
        const header = document.querySelector('[data-studio-header]');
        if (!header) return;

        // Guarded: the slot is appended to rather than replaced, so a second init
        // would otherwise stack duplicate buttons next to the static About link.
        if (header.dataset.toolbarReady === '1') return;
        header.dataset.toolbarReady = '1';

        const leftSlot = header.querySelector('[data-studio-header-left]');
        if (leftSlot) {
            // Append rather than clear: the slot carries the static About link in the
            // markup, which is the crawlable path to that page.
            leftSlot.className = 'studio-header-left flex items-center gap-1.5';
            const statsBtn = document.createElement('button');
            statsBtn.type = 'button';
            statsBtn.className = 'header-icon-btn';
            statsBtn.onclick = () => window.StudioUI.showStats();
            statsBtn.title = 'Stats (S)';
            statsBtn.setAttribute('aria-label', 'Open statistics');
            statsBtn.innerHTML = '<i class="fas fa-chart-pie"></i>';
            leftSlot.appendChild(statsBtn);

            if (config.enableKanjiCorner) {
                const kanjiBtn = document.createElement('button');
                kanjiBtn.type = 'button';
                kanjiBtn.className = 'header-icon-btn';
                kanjiBtn.onclick = () => window.StudioLibrary.startKanjiCorner();
                kanjiBtn.title = 'Kanji Corner (K)';
                kanjiBtn.setAttribute('aria-label', 'Open Kanji Corner');
                kanjiBtn.innerHTML = '<i class="fas fa-torii-gate"></i>';
                leftSlot.appendChild(kanjiBtn);
            }
        }

        const rightSlot = header.querySelector('[data-studio-header-right]');
        if (rightSlot) {
            rightSlot.innerHTML = '';
            rightSlot.className = 'studio-header-right flex items-center justify-end gap-1.5';

            // Account: opens Settings, which carries the trip date and keeps the
            // sign-in path for a visitor who has no session yet.
            const accountBtn = document.createElement('button');
            accountBtn.type = 'button';
            accountBtn.className = 'header-icon-btn';
            accountBtn.onclick = () => window.StudioUI?.openStudioSettings?.();
            accountBtn.title = 'Settings';
            accountBtn.setAttribute('aria-label', 'Open settings and account');
            accountBtn.innerHTML = '<i class="fas fa-user-circle"></i>';
            rightSlot.appendChild(accountBtn);

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'dark-mode-switch';
            toggleLabel.title = 'Dark Mode (D)';
            toggleLabel.setAttribute('aria-label', 'Toggle dark mode');
            toggleLabel.innerHTML = `
                <input type="checkbox" id="dark-mode-checkbox" onchange="window.StudioUI.toggleDarkMode()" aria-label="Toggle dark mode">
                <span class="slider"></span>
            `;
            rightSlot.appendChild(toggleLabel);
        }
    }

    function renderDailyQuote() {
        const quoteBox = document.getElementById('daily-quote-box');
        if (!quoteBox || !config.quotes || !config.quotes.length) return;

        const dateKey = new Date().toDateString();
        let hash = 0;
        for (let i = 0; i < dateKey.length; i++) hash = dateKey.charCodeAt(i) + ((hash << 5) - hash);
        const quote = config.quotes[Math.abs(hash) % config.quotes.length];

        quoteBox.innerHTML = `
            <div class="quote-text font-japanese text-sm font-semibold">${window.StudioUI.escapeHTML(quote.jp)}</div>
            ${quote.reading ? `<div class="quote-reading text-xs text-gray-400 mt-0.5">${window.StudioUI.escapeHTML(quote.reading)}</div>` : ''}
            <div class="quote-meaning text-xs text-gray-400 mt-1">${window.StudioUI.escapeHTML(quote.en)}</div>
        `;
    }

    function showSection(id) {
        const sectionIds = ['today', 'select', 'setup', 'lesson', 'quiz'];
        sectionIds.forEach(sec => document.getElementById(sec + '-section')?.classList.add('hidden'));

        const target = document.getElementById(id + '-section');
        if (!target) return;
        target.classList.remove('hidden');
        if (id === 'today' || id === 'select') target.scrollTop = 0;

        const ro = document.getElementById('studio-results-overlay');
        const so = document.getElementById('studio-stats-overlay');
        const ko = document.getElementById('studio-kanji-picker-overlay');
        if (ro) window.StudioUI.closeDialog(ro, { restoreFocus: false });
        if (so) window.StudioUI.closeDialog(so, { restoreFocus: false });
        if (ko) window.StudioUI.closeDialog(ko, { restoreFocus: false });

        const sysBar = document.getElementById('system-bar');
        if (sysBar) {
            sysBar.classList.toggle('is-hidden', !['today', 'select'].includes(id));
            document.getElementById('nav-today')?.classList.toggle('is-active', id === 'today');
            document.getElementById('nav-select')?.classList.toggle('is-active', id === 'select');
        }

        if (id === 'today') {
            window.StudioDaily?.renderDailyDashboard();
        } else if (id === 'select') {
            renderDailyQuote();
            window.StudioLibrary?.renderTable(loadedLists, loadedScores);
            window.StudioLibrary?.syncCreateControl?.();
        }
    }

    async function fetchLists(options = {}) {
        if (isFetchingLists) return;
        isFetchingLists = true;

        try {
            const data = await window.StudioAPI.fetchStudioData();
            loadedLists = data.loadedLists || {};
            loadedScores = data.loadedScores || {};
            wordStats = data.wordStats || {};
            kanjiMnemonics = data.kanjiMnemonics || {};
            sharedListNames = data.sharedNames || [];
            personalListNames = data.personalNames || [];
            window._studioSharedNames = sharedListNames;
            window._studioPersonalNames = personalListNames;

            window.loadedLists = loadedLists;
            window.loadedScores = loadedScores;
            window.mockWordStats = wordStats;

            window.StudioLibrary?.renderTable(loadedLists, loadedScores);
            window.StudioLibrary?.syncCreateControl?.();
            window.StudioDaily?.renderDailyDashboard();
            // Settings belong to the account when there is one; this settles the
            // trip date and re-renders the status line if it changed.
            window.StudioAPI?.refreshPrefs?.().catch(() => { });
        } catch (e) {
            const cached = window.StudioAPI.loadSnapshotCache();
            if (cached?.lists && Object.keys(cached.lists).length) {
                loadedLists = cached.lists || {};
                loadedScores = cached.scores || {};
                wordStats = cached.stats || {};
                kanjiMnemonics = cached.mnemonics || {};
            } else {
                const bundled = await window.StudioAPI.loadBundledSnapshot();
                if (bundled?.lists) {
                    loadedLists = bundled.lists || {};
                    loadedScores = bundled.scores || {};
                    wordStats = bundled.stats || {};
                    kanjiMnemonics = bundled.mnemonics || {};
                }
            }
            window.StudioLibrary?.renderTable(loadedLists, loadedScores);
            window.StudioDaily?.renderDailyDashboard();
        } finally {
            isFetchingLists = false;
        }
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (window.StudioUI.isDialogOpen()) return;

            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                if (e.key === 'Escape') document.activeElement.blur();
                return;
            }

            switch (e.key) {
                case 'Escape':
                    if (!document.getElementById('quiz-section')?.classList.contains('hidden')) {
                        window.StudioQuiz.quitCurrentSession();
                    } else if (!document.getElementById('lesson-section')?.classList.contains('hidden')) {
                        showSection('today');
                    }
                    break;
                case '/':
                    e.preventDefault();
                    showSection('select');
                    document.getElementById('list-search')?.focus();
                    break;
                case 'n':
                    if (!document.getElementById('select-section').classList.contains('hidden')) {
                        window.StudioLibrary.openCreateNew();
                    }
                    break;
                case 'm':
                    if (!document.getElementById('select-section').classList.contains('hidden')) {
                        window.StudioLibrary.startMixSession();
                    }
                    break;
                case 'd':
                    window.StudioUI.toggleDarkMode();
                    break;
                case 's':
                    if (!document.getElementById('select-section')?.classList.contains('hidden') || !document.getElementById('today-section')?.classList.contains('hidden')) {
                        window.StudioUI.showStats();
                    }
                    break;
                case 'k':
                    if (!document.getElementById('select-section').classList.contains('hidden') && config.enableKanjiCorner) {
                        window.StudioLibrary.startKanjiCorner();
                    }
                    break;
            }
        });
    }

    function exportGlobals() {
        window.showSection = showSection;
        window.fetchLists = fetchLists;
        window.renderTable = window.renderLibraryTable = (l, s) => window.StudioLibrary.renderTable(l || loadedLists, s || loadedScores);
        window.filterLists = () => window.StudioLibrary.filterLists();
        window.toggleStatusSort = () => window.StudioLibrary.toggleStatusSort();
        window.openCreateNew = window.createList = () => window.StudioLibrary.openCreateNew();
        window.editList = (name) => window.StudioLibrary.editList(name);
        window.deleteList = (name) => window.StudioLibrary.deleteListConfirm(name);
        window.saveScore = (listName, score, total) => window.StudioAPI.saveScore(listName, score, total);
        window.startQuiz = (name) => window.StudioLibrary.startQuiz(name);
        window.startMixSession = () => window.StudioLibrary.startMixSession();
        window.startSmartReview = () => window.StudioLibrary.startSmartReview();
        window.startKanjiCorner = () => window.StudioLibrary.startKanjiCorner();
        window.startNeedsWork = () => window.StudioLibrary.startNeedsWork();

        window.startDailyLesson = () => window.StudioDaily.startDailyLesson();
        window.startDailyReview = () => window.StudioDaily.startDailyReview();
        window.addFiveMoreWords = () => window.StudioDaily.addFiveMoreWords();
        window.moveLessonCard = (dir) => window.StudioDaily.moveLessonCard(dir);
        window.goToLessonCard = (idx) => window.StudioDaily.goToLessonCard(idx);
        window.playLessonAudio = () => window.StudioDaily.playLessonAudio();
        window.quitCurrentSession = () => window.StudioQuiz.quitCurrentSession();

        window.checkAnswer = (spoken) => window.StudioQuiz.checkAnswer(spoken);
        window.replayAudio = () => window.StudioQuiz.replayAudio();
        window.activateSpeech = () => window.StudioQuiz.activateSpeech();

        window.showStats = window.openStatsModal = () => window.StudioUI.showStats();
        window.closeStats = window.closeStatsModal = () => window.StudioUI.closeStats();
        window.showToast = (msg, type, dur) => window.StudioUI.showToast(msg, type, dur);
        window.toggleDarkMode = () => window.StudioUI.toggleDarkMode();

        window.openGrammarCorner = () => window.StudioUI.openGrammarCorner();
        window.closeGrammarCorner = () => window.StudioUI.closeGrammarCorner();
        window.openStudioSettings = () => window.StudioUI.openStudioSettings();
        window.closeStudioSettings = () => window.StudioUI.closeStudioSettings();
        window.saveGrammarEntry = (e) => window.StudioUI.saveGrammarEntry(e);

        window.openDictionary = (word) => window.StudioUI.openDictionary(word);
        window.closeDictionary = () => window.StudioUI.closeDictionary();
        window.lookupWord = () => window.StudioUI.lookupWord();
        window.handleSearchKeyup = (e) => window.StudioUI.handleSearchKeyup(e);

        if (typeof config.startTraining === 'function') {
            window.startTraining = config.startTraining;
        }
    }

    async function init(userConfig = {}) {
        config = { ...userConfig };

        window.StudioAPI.init(config);

        // Scope helpers: the library uses these to decide what is editable.
        window.StudioScope = {
            isShared: (name) => sharedListNames.indexOf(name) !== -1,
            isPersonal: (name) => personalListNames.indexOf(name) !== -1,
            sharedNames: () => sharedListNames.slice(),
            personalNames: () => personalListNames.slice(),
            canEditShared: () => !!window.StudioSession?.can?.('editShared'),
            canEditPersonal: () => !!window.StudioSession?.can?.('editPersonal')
        };
        exportGlobals();

        injectMultipleChoiceOption();
        injectToolbarButtons();
        window.StudioQuiz.checkStreak();
        window.StudioUI.initDarkMode();
        setupKeyboardShortcuts();
        if (config.initVoices) config.initVoices();
        if (config.favicon) setFavicon(config.favicon);

        const modeSelect = document.getElementById('global-quiz-mode');
        if (modeSelect) modeSelect.value = 'en-jp';

        // Enter submits a typed answer. The global keydown shortcuts deliberately
        // ignore inputs, so without this the answer input can never be submitted.
        const answerInput = document.getElementById('answer-input');
        if (answerInput && !answerInput.dataset.enterBound) {
            answerInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (typeof window.checkAnswer === 'function') window.checkAnswer();
            });
            answerInput.dataset.enterBound = 'true';
        }

        await fetchLists();
        showSection('today');
    }

    return {
        init,
        showSection,
        fetchLists,
        setState: (k, v) => {
            if (k === 'currentListName') window.StudioQuiz.startSession({ listName: v });
        },
        startSession: (opts) => window.StudioQuiz.startSession(opts)
    };
})();
