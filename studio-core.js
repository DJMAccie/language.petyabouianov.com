/**
 * studio-core.js — Shared Language Learning Engine
 * Used by nihongo-studio.html and bahasa-studio.html
 * 
 * Initialize with: StudioCore.init(config)
 */
const StudioCore = (() => {

    // === STATE ===
    let loadedLists = {};
    let loadedScores = {};
    let wordStats = {};

    let currentListName = "";
    let editingOriginalName = null;
    let wordList = [];
    let currentIndex = 0;
    let score = 0;
    let isProcessing = false;
    let isSavingList = false;
    let sessionResults = [];

    let isPurificationSession = false;
    let gauntletLives = 3;
    let activeDialogState = null;
    let confettiLoader = null;
    let tableStatusSortDirection = null;
    let sessionModeOverride = null;
    let sessionAnswerMatcher = null;
    let sessionLabelOverride = null;
    let sessionIsKanji = false;
    let kanjiHintVisible = false;
    let kanjiMnemonics = {};

    // === CONFIG (set by init) ===
    let config = {};

    // === HELPERS ===
    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getFocusableElements(container) {
        if (!container) return [];
        return Array.from(container.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0);
    }

    function onDialogKeydown(event) {
        if (!activeDialogState?.dialog) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            activeDialogState.onRequestClose?.();
            return;
        }

        if (event.key !== 'Tab') return;

        const focusable = getFocusableElements(activeDialogState.dialog);
        if (!focusable.length) {
            event.preventDefault();
            activeDialogState.dialog.focus();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey && activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function isDialogOpen() {
        return !!activeDialogState?.dialog && !activeDialogState.dialog.classList.contains('hidden');
    }

    function openDialog(dialog, options = {}) {
        if (!dialog) return;

        const {
            initialFocusSelector,
            onRequestClose,
            restoreFocus = true,
            labelId,
            label
        } = options;

        if (!document.body.dataset.studioDialogBound) {
            document.addEventListener('keydown', onDialogKeydown, true);
            document.body.dataset.studioDialogBound = 'true';
        }

        if (activeDialogState?.dialog && activeDialogState.dialog !== dialog) {
            closeDialog(activeDialogState.dialog, { restoreFocus: false });
        }

        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('tabindex', '-1');
        if (labelId) {
            dialog.setAttribute('aria-labelledby', labelId);
            dialog.removeAttribute('aria-label');
        } else if (label) {
            dialog.setAttribute('aria-label', label);
            dialog.removeAttribute('aria-labelledby');
        }

        const previousFocus = restoreFocus ? document.activeElement : null;
        dialog.setAttribute('aria-hidden', 'false');
        dialog.classList.remove('hidden');

        activeDialogState = {
            dialog,
            previousFocus,
            onRequestClose: onRequestClose || (() => closeDialog(dialog))
        };

        requestAnimationFrame(() => {
            const initialTarget = (initialFocusSelector && dialog.querySelector(initialFocusSelector))
                || getFocusableElements(dialog)[0]
                || dialog;
            initialTarget.focus();
        });
    }

    function closeDialog(dialog, options = {}) {
        if (!dialog) return;

        const { restoreFocus = true } = options;
        dialog.setAttribute('aria-hidden', 'true');
        dialog.classList.add('hidden');

        if (activeDialogState?.dialog === dialog) {
            const previousFocus = activeDialogState.previousFocus;
            activeDialogState = null;
            if (restoreFocus && previousFocus && document.contains(previousFocus) && typeof previousFocus.focus === 'function') {
                requestAnimationFrame(() => previousFocus.focus());
            }
        }
    }

    function ensureConfettiLoaded() {
        if (typeof window.confetti === 'function') return Promise.resolve(window.confetti);
        if (!confettiLoader) {
            confettiLoader = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';
                script.async = true;
                script.onload = () => resolve(window.confetti);
                script.onerror = () => reject(new Error('Failed to load celebration effect'));
                document.head.appendChild(script);
            });
        }
        return confettiLoader;
    }

    function getScoreTone(score, successThreshold = 80, warningThreshold = 50) {
        if (score >= successThreshold) return 'tone-success';
        if (score >= warningThreshold) return 'tone-warning';
        return 'tone-danger';
    }

    function getModeProgress(mode, scoreSet) {
        const jpScore = scoreSet?.['jp-en'] || 0;
        const enScore = scoreSet?.['en-jp'] || 0;
        const speechScore = scoreSet?.['speech'] || 0;

        if (mode === 'jp-en') {
            return {
                value: jpScore,
            };
        }

        if (mode === 'speech') {
            return {
                value: speechScore,
            };
        }

        return {
            value: enScore,
        };
    }

    function getScoreSet(scores, key) {
        const rawScoreSet = scores[key];
        return typeof rawScoreSet === 'object'
            ? rawScoreSet
            : (typeof rawScoreSet === 'number' ? { 'jp-en': rawScoreSet } : {});
    }

    function getStatusRank(activeScore) {
        if (activeScore > 80) return 2;
        if (activeScore > 0) return 1;
        return 0;
    }

    function syncStatusSortUI() {
        const header = document.getElementById('status-sort-header');
        const trigger = document.getElementById('status-sort-trigger');
        if (!header || !trigger) return;

        const ariaSort = tableStatusSortDirection === 'asc'
            ? 'ascending'
            : tableStatusSortDirection === 'desc'
                ? 'descending'
                : 'none';
        header.setAttribute('aria-sort', ariaSort);

        const nextDirection = tableStatusSortDirection === 'desc' ? 'new first' : 'mastered first';
        trigger.setAttribute('aria-label', `Sort lists by status, ${nextDirection}`);
        trigger.setAttribute('title', `Sort status: ${nextDirection}`);
    }

    function getKanjiListNames(lists) {
        if (!config.enableKanjiCorner) return [];

        const listMap = lists || {};
        const availableNames = Object.keys(listMap);

        if (Array.isArray(config.kanjiListNames) && config.kanjiListNames.length > 0) {
            const matched = config.kanjiListNames.filter(name => availableNames.includes(name));
            if (matched.length > 0) return matched;
        }

        const baseName = config.kanjiListName || 'Kanji';
        const prefix = config.kanjiListPrefix || `${baseName} `;
        return availableNames
            .filter(name => name === baseName || name.startsWith(prefix))
            .sort((a, b) => {
                const aNum = getKanjiPackNumber(a);
                const bNum = getKanjiPackNumber(b);
                if (aNum !== null && bNum !== null && aNum !== bNum) return aNum - bNum;
                if (aNum !== null && bNum === null) return -1;
                if (aNum === null && bNum !== null) return 1;
                return a.localeCompare(b);
            });
    }

    function getKanjiPackNumber(listName) {
        if (typeof listName !== 'string') return null;
        const baseName = config.kanjiListName || 'Kanji';
        const prefix = config.kanjiListPrefix || `${baseName} `;
        if (!listName.startsWith(prefix)) return null;
        const suffix = listName.slice(prefix.length).trim();
        const match = suffix.match(/^(\d{1,3})\b/);
        if (!match) return null;
        const num = Number.parseInt(match[1], 10);
        return Number.isFinite(num) ? num : null;
    }

    function getKanjiCategoryLabel(listName) {
        const packNumber = getKanjiPackNumber(listName);
        const ranges = Array.isArray(config.kanjiCornerCategoryRanges) ? config.kanjiCornerCategoryRanges : [];

        if (packNumber !== null) {
            for (const range of ranges) {
                const start = Number.parseInt(range?.start, 10);
                const end = Number.parseInt(range?.end, 10);
                if (Number.isFinite(start) && Number.isFinite(end) && packNumber >= start && packNumber <= end) {
                    return range.label || 'Kanji';
                }
            }
        }

        return config.kanjiCornerDefaultCategoryLabel || 'Other Kanji';
    }

    function groupKanjiListNamesByCategory(listNames) {
        const orderedGroups = [];
        const byLabel = new Map();
        const ranges = Array.isArray(config.kanjiCornerCategoryRanges) ? config.kanjiCornerCategoryRanges : [];

        ranges.forEach((range) => {
            const label = (range?.label || '').toString().trim();
            if (!label || byLabel.has(label)) return;
            const group = { label, names: [] };
            byLabel.set(label, group);
            orderedGroups.push(group);
        });

        (listNames || []).forEach((name) => {
            const label = getKanjiCategoryLabel(name);
            if (!byLabel.has(label)) {
                const group = { label, names: [] };
                byLabel.set(label, group);
                orderedGroups.push(group);
            }
            byLabel.get(label).names.push(name);
        });

        return orderedGroups.filter(group => group.names.length > 0);
    }

    function getKanjiWords(lists) {
        const words = [];
        const seen = new Set();
        const listMap = lists || {};

        getKanjiListNames(listMap).forEach((name) => {
            const list = Array.isArray(listMap[name]) ? listMap[name] : [];
            list.forEach((word) => {
                if (!word || !word.jp || seen.has(word.jp)) return;
                seen.add(word.jp);
                words.push(word);
            });
        });

        return words;
    }

    function getKanjiWordsForListNames(lists, listNames) {
        const words = [];
        const seen = new Set();
        const listMap = lists || {};
        const names = Array.isArray(listNames) ? listNames : [];

        names.forEach((name) => {
            const list = Array.isArray(listMap[name]) ? listMap[name] : [];
            list.forEach((word) => {
                if (!word || !word.jp || seen.has(word.jp)) return;
                seen.add(word.jp);
                words.push(word);
            });
        });

        return words;
    }

    function getKanjiSelectionStorageKey() {
        const prefix = config.streakKey || 'studio';
        return `${prefix}_kanji_corner_lists`;
    }

    function getSavedKanjiSelection(availableNames) {
        try {
            const raw = localStorage.getItem(getKanjiSelectionStorageKey());
            const parsed = JSON.parse(raw || '[]');
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(name => availableNames.includes(name));
        } catch (e) {
            return [];
        }
    }

    function saveKanjiSelection(names) {
        try {
            localStorage.setItem(getKanjiSelectionStorageKey(), JSON.stringify(names));
        } catch (e) {
            // Ignore storage failures in private mode/quota errors.
        }
    }

    function getNonKanjiLists(lists) {
        const allEntries = Object.entries(lists || {});
        if (!config.enableKanjiCorner) return allEntries;

        const kanjiNameSet = new Set(getKanjiListNames(lists));
        return allEntries.filter(([name]) => !kanjiNameSet.has(name));
    }

    function normalizeForMatch(text) {
        if (config.normalize) return config.normalize(text || '');
        return (text || '').toString().toLowerCase().replace(/\s+/g, '');
    }

    function collectKanjiAnswerVariants(pair) {
        const variants = new Set();
        const addVariant = (value) => {
            const normalized = normalizeForMatch(value);
            if (normalized) variants.add(normalized);
        };

        const rawMeaning = (pair?.en || '').toString().trim();
        const match = rawMeaning.match(/^\s*\(([^)]+)\)\s*(.*)$/);
        const readingPart = match ? match[1] : '';
        const meaningPart = match ? (match[2] || '') : rawMeaning;

        const readingTokens = readingPart
            .split(/[\/,;]|\bor\b/i)
            .map(token => token.trim())
            .filter(Boolean);

        readingTokens.forEach(token => {
            addVariant(token);
            if (window.wanakana) {
                addVariant(window.wanakana.toHiragana(token));
                addVariant(window.wanakana.toKatakana(token));
            }
        });

        const meaningTokens = meaningPart
            .split(/[\/,;]|\bor\b/i)
            .map(token => token.trim())
            .filter(Boolean);

        addVariant(meaningPart);
        meaningTokens.forEach(addVariant);

        return Array.from(variants);
    }

    function matchesKanjiAnswer(userInput, pair) {
        const normalizedUser = normalizeForMatch(userInput);
        if (!normalizedUser) return false;

        const variants = collectKanjiAnswerVariants(pair);
        return variants.some(variant => variant === normalizedUser);
    }

    function normalizeKanjiMnemonicPayload(payload) {
        const normalized = {};
        const items = Array.isArray(payload)
            ? payload
            : (payload && typeof payload === 'object' ? Object.values(payload) : []);

        items.forEach((item) => {
            if (!item || typeof item !== 'object') return;
            const jp = (item.jp || '').toString().trim();
            if (!jp) return;

            normalized[jp] = {
                jp,
                mnemonic: (item.mnemonic || '').toString().trim(),
                reading_cue: (item.reading_cue || '').toString().trim(),
                travel_context: (item.travel_context || '').toString().trim(),
                emoji: (item.emoji || '🧠').toString().trim() || '🧠',
                image_url: (item.image_url || '').toString().trim()
            };
        });

        return normalized;
    }

    function emojiToCodepoint(emoji) {
        if (!emoji) return '';
        return Array.from(emoji)
            .map(ch => ch.codePointAt(0).toString(16).toUpperCase())
            .filter(code => code !== 'FE0F')
            .join('-');
    }

    function getOpenMojiUrl(emoji) {
        const codepoint = emojiToCodepoint(emoji);
        if (!codepoint) return '';
        return `https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji/color/svg/${codepoint}.svg`;
    }

    function getMnemonicEntry(pair) {
        if (!pair?.jp) return null;
        return kanjiMnemonics[pair.jp] || null;
    }

    function parseKanjiReadingFallback(pair) {
        const rawMeaning = (pair?.en || '').toString().trim();
        const match = rawMeaning.match(/^\s*\(([^)]+)\)\s*(.*)$/);
        return match ? match[1].trim() : '';
    }

    function ensureKanjiHintElements() {
        if (document.getElementById('kanji-hint-shell')) return;

        const feedback = document.getElementById('feedback');
        if (!feedback || !feedback.parentElement) return;

        const shell = document.createElement('div');
        shell.id = 'kanji-hint-shell';
        shell.className = 'hidden mt-4 md:mt-6';
        shell.innerHTML = `
            <div class="flex justify-end">
                <button id="kanji-hint-toggle" type="button" class="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 transition-colors hover:text-gray-700">
                    Show hint
                </button>
            </div>
            <div id="kanji-hint-panel" class="hidden mt-2 rounded-lg border border-gray-200 bg-white/90 p-4 text-left">
                <div class="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">Mnemonic</div>
                <p id="kanji-hint-mnemonic" class="mt-1 text-sm leading-relaxed text-gray-700"></p>
                <div class="mt-3 grid gap-2 md:grid-cols-2">
                    <div>
                        <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Reading Cue</div>
                        <div id="kanji-hint-reading" class="mt-1 text-sm text-gray-700"></div>
                    </div>
                    <div>
                        <div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Travel Context</div>
                        <div id="kanji-hint-context" class="mt-1 text-sm text-gray-700"></div>
                    </div>
                </div>
                <div id="kanji-hint-image-wrap" class="mt-3 flex items-center gap-3 border-t border-gray-200 pt-3">
                    <img id="kanji-hint-image" class="h-12 w-12 rounded-md border border-gray-200 bg-white object-cover" alt="Mnemonic hint image">
                    <span id="kanji-hint-emoji" class="hidden inline-flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-2xl leading-none">🧠</span>
                    <div class="text-xs uppercase tracking-[0.08em] text-gray-400">Visual cue</div>
                </div>
            </div>
        `;
        feedback.parentElement.insertBefore(shell, feedback);

        const toggleButton = document.getElementById('kanji-hint-toggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => toggleKanjiHint());
        }
    }

    function updateKanjiHintView(forceVisible = null) {
        if (typeof forceVisible === 'boolean') {
            kanjiHintVisible = forceVisible;
        }

        const shell = document.getElementById('kanji-hint-shell');
        const panel = document.getElementById('kanji-hint-panel');
        const toggle = document.getElementById('kanji-hint-toggle');
        const mnemonicEl = document.getElementById('kanji-hint-mnemonic');
        const readingEl = document.getElementById('kanji-hint-reading');
        const contextEl = document.getElementById('kanji-hint-context');
        const imageEl = document.getElementById('kanji-hint-image');
        const emojiEl = document.getElementById('kanji-hint-emoji');

        if (!shell || !panel || !toggle || !mnemonicEl || !readingEl || !contextEl || !imageEl || !emojiEl) return;

        if (!sessionIsKanji) {
            shell.classList.add('hidden');
            panel.classList.add('hidden');
            return;
        }

        shell.classList.remove('hidden');
        panel.classList.toggle('hidden', !kanjiHintVisible);
        toggle.textContent = kanjiHintVisible ? 'Hide hint' : 'Show hint';

        const pair = wordList[currentIndex];
        const entry = getMnemonicEntry(pair);
        const fallbackReading = parseKanjiReadingFallback(pair);

        const mnemonicText = entry?.mnemonic || 'No mnemonic saved yet for this kanji.';
        const readingText = entry?.reading_cue || (fallbackReading ? `Try saying: ${fallbackReading}` : 'No reading cue saved yet.');
        const contextText = entry?.travel_context || 'No travel context saved yet.';
        const emojiText = entry?.emoji || '🧠';

        mnemonicEl.textContent = mnemonicText;
        readingEl.textContent = readingText;
        contextEl.textContent = contextText;
        emojiEl.textContent = emojiText;

        const imageUrl = entry?.image_url || getOpenMojiUrl(emojiText);
        if (!imageUrl) {
            imageEl.classList.add('hidden');
            emojiEl.classList.remove('hidden');
            return;
        }

        imageEl.onerror = () => {
            imageEl.classList.add('hidden');
            emojiEl.classList.remove('hidden');
        };
        imageEl.onload = () => {
            imageEl.classList.remove('hidden');
            emojiEl.classList.add('hidden');
        };
        imageEl.src = imageUrl;
    }

    function toggleKanjiHint(forceVisible = null) {
        if (typeof forceVisible === 'boolean') {
            kanjiHintVisible = forceVisible;
        } else {
            kanjiHintVisible = !kanjiHintVisible;
        }
        updateKanjiHintView();
    }

    function toggleStatusSort() {
        tableStatusSortDirection = tableStatusSortDirection === 'desc' ? 'asc' : 'desc';
        syncStatusSortUI();
        renderTable(loadedLists, loadedScores);
    }

    // =========================================================
    // PUBLIC: Initialization
    // =========================================================
    function init(cfg) {
        config = cfg;

        // Expose state getters for language-specific code
        window._studio = {
            getWordList: () => wordList,
            getCurrentIndex: () => currentIndex,
            getWordStats: () => wordStats,
            getLoadedLists: () => loadedLists,
            getLoadedScores: () => loadedScores,
            getIsProcessing: () => isProcessing,
            setIsProcessing: (v) => { isProcessing = v; },
            getIsPurificationSession: () => isPurificationSession,
            getGauntletLives: () => gauntletLives,
            getScore: () => score,
            getCurrentListName: () => currentListName,
        };

        // Expose shared functions globally for onclick handlers in HTML
        window.loadedLists = loadedLists;
        window.loadedScores = loadedScores;
        window.mockWordStats = wordStats;
        window.showSection = showSection;
        window.openCreateNew = openCreateNew;
        window.saveListToServer = saveListToServer;
        window.startQuiz = startQuiz;
        window.startSmartReview = startSmartReview;
        window.startMixSession = startMixSession;
        window.startKanjiCorner = startKanjiCorner;
        window.editList = editList;
        window.deleteList = deleteList;
        window.filterLists = config.filterLists || filterListsDefault;
        window.replayAudio = replayAudio;
        window.renderTable = renderTable;
        window.showToast = showToast;
        window.checkAnswer = checkAnswer;
        window.activateSpeech = activateSpeech;
        window.renderHearts = renderHearts;
        window.showCard = showCard;
        window.finishAnswerCheck = finishAnswerCheck;
        window.toggleDarkMode = toggleDarkMode;
        window.showStats = showStats;
        window.closeStats = closeStats;
        window.startNeedsWork = startNeedsWork;
        window.toggleKanjiHint = toggleKanjiHint;
        window.toggleStatusSort = toggleStatusSort;
        window.StudioUI = {
            openDialog,
            closeDialog,
            isDialogOpen
        };

        // Training mode (nihongo-only but safe to expose)
        if (config.startTraining) {
            window.startTraining = config.startTraining;
        }

        // Ghost mode (bahasa-only)
        if (config.startGhostMode) {
            window.startGhostMode = config.startGhostMode;
        }

        // Inject UI enhancements
        injectMultipleChoiceOption();
        injectToolbarButtons();
        injectOverlays();
        ensureKanjiHintElements();
        initDarkMode();
        setupKeyboardShortcuts();
        if (config.favicon) setFavicon(config.favicon);

        // Default to the harder production direction on every fresh load.
        const modeSelect = document.getElementById('global-quiz-mode');
        if (modeSelect) {
            const defaultMode = config.defaultQuizMode || 'en-jp';
            modeSelect.value = modeSelect.querySelector(`option[value="${defaultMode}"]`) ? defaultMode : 'en-jp';
        }

        syncStatusSortUI();

        // Run startup
        if (config.initVoices) config.initVoices();
        fetchLists();
        checkStreak();
        if (config.setupSpeech) config.setupSpeech();
        renderDailyQuote();

        // Enter key on answer input
        const answerInput = document.getElementById('answer-input');
        if (answerInput) {
            answerInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") checkAnswer();
            });
        }
    }

    // =========================================================
    // SRS ENGINE
    // =========================================================

    // Simple confidence score (0-100) based entirely on correct answers.
    // Mastered = 7 correct answers.
    function calculateConfidence(stats) {
        if (!stats) return 0;
        const correct = stats.correct || 0;
        return Math.min(100, (correct / 7) * 100);
    }

    function isMastered(word) {
        const stats = wordStats[word.jp];
        if (!stats) return false;
        return (stats.correct || 0) >= 7;
    }

    function calculatePriority(word) {
        const stats = wordStats[word.jp];
        if (!stats) return 100;
        if (isMastered(word)) return 1;

        const wrongCount = stats.wrong || 0;
        const streak = stats.streak || 0;
        const correctCount = stats.correct || 0;

        let weight = 5 + (wrongCount * 5) + Math.max(0, (5 - streak) * 3) + Math.max(0, (7 - correctCount) * 2);
        return Math.max(1, weight);
    }

    function shuffleWithBias(arr) {
        let pool = [...arr];
        let result = [];

        while (pool.length > 0) {
            let totalWeight = pool.reduce((sum, item) => sum + (item.priorityScore || 1), 0);
            let randomVal = Math.random() * totalWeight;
            let currentWeight = 0;

            for (let i = 0; i < pool.length; i++) {
                currentWeight += (pool[i].priorityScore || 1);
                if (randomVal <= currentWeight) {
                    result.push(pool[i]);
                    pool.splice(i, 1);
                    break;
                }
            }
        }
        return result;
    }

    // =========================================================
    // TOAST NOTIFICATIONS
    // =========================================================
    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');

        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500',
            warning: 'bg-yellow-500'
        };

        toast.className = `${colors[type] || colors.info} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-fade-in flex items-center gap-2`;
        const iconElement = document.createElement('i');
        iconElement.className = `fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}`;
        toast.appendChild(iconElement);
        toast.appendChild(document.createTextNode(` ${message}`));

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // =========================================================
    // DAILY QUOTE
    // =========================================================
    function renderDailyQuote() {
        if (!config.quotes || config.quotes.length === 0) return;
        const quote = config.quotes[Math.floor(Math.random() * config.quotes.length)];
        const container = document.getElementById('daily-quote');
        if (!container) return;

        const readingPart = quote.reading ? `${quote.reading} • ` : '';
        container.innerHTML = `
        <div class="group flex flex-col items-center cursor-help transition-all">
            <span class="text-[12px] text-gray-500 font-bold font-serif opacity-80 group-hover:opacity-100 tracking-wide">${quote.jp}</span>
            <span class="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 mt-0.5">${readingPart}${quote.en}</span>
        </div>
        `;
    }

    // =========================================================
    // SECTION NAVIGATION
    // =========================================================
    function showSection(id) {
        ['select', 'setup', 'quiz'].forEach(sec => document.getElementById(sec + '-section').classList.add('hidden'));
        document.getElementById(id + '-section').classList.remove('hidden');
        // Hide feature overlays
        const ro = document.getElementById('studio-results-overlay');
        const so = document.getElementById('studio-stats-overlay');
        const ko = document.getElementById('studio-kanji-picker-overlay');
        if (ro) closeDialog(ro, { restoreFocus: false });
        if (so) closeDialog(so, { restoreFocus: false });
        if (ko) closeDialog(ko, { restoreFocus: false });
        const sysBar = document.getElementById('system-bar');
        sysBar.style.marginTop = (id === 'quiz') ? '-130px' : '0px';
        if (id === 'select') {
            fetchLists();
            renderDailyQuote();
        }
    }

    // =========================================================
    // API: Fetch lists, scores, stats
    // =========================================================
    async function fetchLists() {
        try {
            const requests = [
                fetch(config.apiUrl + '&action=get_lists&t=' + Date.now()),
                fetch(config.apiUrl + '&action=get_scores&t=' + Date.now()),
                fetch(config.apiUrl + '&action=get_word_stats&t=' + Date.now())
            ];

            if (config.enableKanjiCorner) {
                requests.push(
                    fetch(config.apiUrl + '&action=get_kanji_mnemonics&t=' + Date.now())
                        .catch(() => null)
                );
            }

            const [lRes, sRes, statsRes, mnemonicRes] = await Promise.all(requests);
            loadedLists = await lRes.json();
            // Normalize: accept "id" key as alias for "jp" (Bahasa organized lists use "id")
            Object.keys(loadedLists).forEach(name => {
                loadedLists[name] = loadedLists[name].map(w =>
                    (!w.jp && w.id) ? { jp: w.id, en: w.en } : w
                );
            });
            loadedScores = await sRes.json();
            wordStats = await statsRes.json();
            kanjiMnemonics = (mnemonicRes && mnemonicRes.ok)
                ? normalizeKanjiMnemonicPayload(await mnemonicRes.json().catch(() => ({})))
                : {};

            // Keep window references in sync
            window.loadedLists = loadedLists;
            window.loadedScores = loadedScores;
            window.mockWordStats = wordStats;

            renderTable(loadedLists, loadedScores);
        } catch (e) {
            console.error("API Error", e);
            showToast("Failed to load data. Check server connection.", "error");
        }
    }

    // =========================================================
    // TABLE RENDERING (from nihongo-studio)
    // =========================================================
    function renderTable(lists, scores) {
        const tbody = document.getElementById('list-table-body');
        const rows = [];
        let count = 0;
        const currentMode = document.getElementById('global-quiz-mode').value;

        // --- SMART REVIEW ROW ---
        const kanjiWords = getKanjiWords(lists);
        const nonKanjiLists = getNonKanjiLists(lists);
        let allUniqueWords = [];
        let uniqueCheck = new Set();
        nonKanjiLists.forEach(([, listWords]) => listWords.forEach(w => {
            if (!uniqueCheck.has(w.jp)) {
                allUniqueWords.push(w);
                uniqueCheck.add(w.jp);
            }
        }));

        const reviewQueue = allUniqueWords.filter(w => {
            const stats = wordStats[w.jp];
            if (!stats) return false;
            if ((stats.correct || 0) === 0) return false;
            if (isMastered(w)) return false;
            return true;
        });

        reviewQueue.forEach(w => { w.priorityScore = calculatePriority(w); });
        reviewQueue.sort((a, b) => b.priorityScore - a.priorityScore);
        const shuffledQueue = shuffleWithBias(reviewQueue);
        const sessionBatch = shuffledQueue.slice(0, 10);

        if (sessionBatch.length > 0) {
            rows.push(`
            <tr class="border-b border-gray-100 transition cursor-default bg-blue-50/50 hover:bg-blue-500 group">
                <td class="p-3 pl-6 font-bold text-blue-600 group-hover:text-white"><i class="fas fa-brain mr-3"></i>Smart Review</td>
                <td class="p-3 text-blue-600 group-hover:text-white font-medium">${sessionBatch.length} words</td>
                <td class="p-3 text-blue-400 group-hover:text-white text-xs hidden md:table-cell">--</td>
                <td class="p-3 hidden md:table-cell"><div class="flex items-center gap-2"><div class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse border border-blue-600"></div><span class="text-blue-600 group-hover:text-white text-xs font-bold uppercase">Queued</span></div></td>
                <td class="p-3 pr-6 text-right"><button type="button" onclick="startSmartReview()" class="studio-table-start-btn" aria-label="Start smart review session">Start Session</button></td>
            </tr>`);
        }

        if (config.enableKanjiCorner && kanjiWords.length > 0) {
            const kanjiDueCount = kanjiWords.filter(word => !isMastered(word)).length;
            const kanjiCountLabel = `${kanjiDueCount} due · ${kanjiWords.length} total`;
            rows.push(`
            <tr class="border-b border-gray-100 transition cursor-default bg-amber-50/70 hover:bg-amber-500 group">
                <td class="p-3 pl-6 font-bold text-amber-700 group-hover:text-white"><i class="fas fa-torii-gate mr-3"></i>Kanji Corner</td>
                <td class="p-3 text-amber-700 group-hover:text-white font-medium">${kanjiCountLabel}</td>
                <td class="p-3 text-amber-400 group-hover:text-white text-xs hidden md:table-cell">--</td>
                <td class="p-3 hidden md:table-cell"><span class="text-amber-400 group-hover:text-white text-xs">--</span></td>
                <td class="p-3 pr-6 text-right"><button type="button" onclick="startKanjiCorner()" class="studio-table-start-btn" aria-label="Open kanji corner picker">Open Corner</button></td>
            </tr>`);
        }

        // --- CUSTOM TABLE EXTRAS (e.g. Hantu Hunt for Bahasa) ---
        if (config.renderTableExtras) {
            const extraHTML = config.renderTableExtras(lists, allUniqueWords, wordStats);
            if (extraHTML) rows.push(extraHTML);
        }

        // --- MAIN LISTS ---
        const getTs = (key) => {
            if (!scores[key]) return 0;
            if (typeof scores[key] === 'object') return scores[key].last_activity || 0;
            return 0;
        };
        const compareByRecent = (a, b) => {
            const recentDiff = getTs(b) - getTs(a);
            if (recentDiff !== 0) return recentDiff;
            return a.localeCompare(b);
        };

        const kanjiNameSet = new Set(getKanjiListNames(lists));
        const hideKanjiRows = !!config.hideKanjiListsFromMainTable;
        const sortedKeys = Object.keys(lists)
            .filter(name => !(hideKanjiRows && kanjiNameSet.has(name)))
            .sort((a, b) => {
            if (!tableStatusSortDirection) {
                return compareByRecent(a, b);
            }

            const aScore = getModeProgress(currentMode, getScoreSet(scores, a)).value || 0;
            const bScore = getModeProgress(currentMode, getScoreSet(scores, b)).value || 0;
            const aRank = getStatusRank(aScore);
            const bRank = getStatusRank(bScore);
            const direction = tableStatusSortDirection === 'asc' ? 1 : -1;
            const rankDiff = (aRank - bRank) * direction;

            if (rankDiff !== 0) return rankDiff;
            return compareByRecent(a, b);
        });

        sortedKeys.forEach(name => {
            count++;
            const words = lists[name];
            const scoreSet = getScoreSet(scores, name);
            const progress = getModeProgress(currentMode, scoreSet);
            const activeScore = progress.value || 0;

            let dotColor = "bg-gray-300";
            let statusText = "New";
            if (activeScore > 80) {
                dotColor = "bg-green-500";
                statusText = "Mastered";
            } else if (activeScore > 0) {
                dotColor = "bg-yellow-400";
                statusText = "Learning";
            }

            // Build action buttons — training only for nihongo
            const safeName = escapeAttr(name);
            let actionButtons = `
                <button type="button" onclick="editList('${safeName}')" class="studio-table-icon-btn" title="Edit ${safeName}" aria-label="Edit ${safeName}"><i class="fas fa-edit"></i></button>
                <button type="button" onclick="deleteList('${safeName}')" class="studio-table-icon-btn danger" title="Delete ${safeName}" aria-label="Delete ${safeName}"><i class="fas fa-trash"></i></button>`;

            if (config.startTraining) {
                actionButtons += `
                <button type="button" onclick="startTraining('${safeName}')" class="studio-table-icon-btn" title="Training for ${safeName}" aria-label="Start training for ${safeName}"><i class="fas fa-dumbbell"></i></button>`;
            }

            actionButtons += `
                <button type="button" onclick="startQuiz('${safeName}')" class="studio-table-start-btn" aria-label="Start quiz for ${safeName}">Start Quiz</button>`;

            rows.push(`
            <tr class="border-b border-gray-100 transition cursor-default group">
                <td class="p-3 pl-6 font-medium text-gray-800"><i class="fas fa-list-ul mr-3 text-gray-400 group-hover:text-white"></i>${escapeHTML(name)}</td>
                <td class="p-3 text-gray-500">${words.length} words</td>
                <td class="p-3 hidden md:table-cell text-gray-500">${activeScore}%</td>
                <td class="p-3 hidden md:table-cell"><div class="flex items-center gap-2"><div class="w-2.5 h-2.5 rounded-full ${dotColor} shadow-sm"></div><span class="text-gray-500">${statusText}</span></div></td>
                <td class="p-3 pr-6 text-right">
                    <div class="studio-table-action-bar">${actionButtons}</div>
                </td>
            </tr>`);
        });

        tbody.innerHTML = rows.join('');
        if (typeof window.filterLists === 'function') {
            window.filterLists();
        }

        // Update footer counts
        let uniqueWords = new Set();
        sortedKeys.forEach((name) => {
            (lists[name] || []).forEach((w) => uniqueWords.add(w.jp));
        });
        document.getElementById('total-lists-count').innerText = count + " lists";
        document.getElementById('total-words-count').innerText = uniqueWords.size + " words";
    }

    // =========================================================
    // QUIZ SESSION MANAGEMENT
    // =========================================================
    function startMixSession() {
        currentListName = "Smart Mix";
        isPurificationSession = false;

        let allWords = [];
        let uniqueCheck = new Set();
        getNonKanjiLists(loadedLists).forEach(([, l]) => {
            l.forEach(w => {
                if (!uniqueCheck.has(w.jp)) {
                    allWords.push(w);
                    uniqueCheck.add(w.jp);
                }
            });
        });

        if (allWords.length === 0) { alert("No words to mix!"); return; }

        allWords.forEach(w => { w.priorityScore = calculatePriority(w); });
        allWords.sort((a, b) => b.priorityScore - a.priorityScore);
        allWords = shuffleWithBias(allWords);

        wordList = allWords.slice(0, 10);
        startSession();
    }

    function startSmartReview() {
        currentListName = "Smart Review";
        isPurificationSession = false;

        let candidates = [];
        let seen = new Set();

        getNonKanjiLists(loadedLists).forEach(([, list]) => {
            list.forEach(word => {
                if (!seen.has(word.jp)) {
                    seen.add(word.jp);
                    const stats = wordStats[word.jp];
                    if (!stats) return;
                    if (!stats.correct || stats.correct === 0) return;
                    if (isMastered(word)) return;
                    candidates.push(word);
                }
            });
        });

        candidates.forEach(word => { word.priorityScore = calculatePriority(word); });
        candidates.sort((a, b) => b.priorityScore - a.priorityScore);
        candidates = shuffleWithBias(candidates);

        wordList = candidates.slice(0, 10);

        if (wordList.length === 0) {
            alert("No active reviews due!\n\nWords must be learned (correct at least once) to appear here.");
            return;
        }

        startSession();
    }

    function startKanjiCorner() {
        const kanjiListNames = getKanjiListNames(loadedLists);
        if (kanjiListNames.length === 0) {
            alert("No kanji list found.");
            return;
        }

        if (config.enableKanjiCornerListPicker) {
            showKanjiCornerPicker(kanjiListNames);
            return;
        }

        startKanjiCornerSession(kanjiListNames);
    }

    function showKanjiCornerPicker(kanjiListNames) {
        const overlay = document.getElementById('studio-kanji-picker-overlay');
        if (!overlay) {
            startKanjiCornerSession(kanjiListNames);
            return;
        }

        const available = (kanjiListNames || []).filter(name => Array.isArray(loadedLists[name]) && loadedLists[name].length > 0);
        if (available.length === 0) {
            alert("No kanji list found.");
            return;
        }

        const saved = getSavedKanjiSelection(available);
        const defaultSelection = saved.length > 0 ? saved : [...available];
        const selectedSet = new Set(defaultSelection);

        const listMeta = available.map((name) => {
            const uniqueWords = getKanjiWordsForListNames(loadedLists, [name]);
            const totalCount = uniqueWords.length;
            const dueCount = uniqueWords.filter(word => !isMastered(word)).length;
            const masteredCount = Math.max(0, totalCount - dueCount);
            const masteryPercent = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;
            const packNumber = getKanjiPackNumber(name);
            return {
                name,
                dueCount,
                totalCount,
                masteredCount,
                masteryPercent,
                packNumber,
                categoryLabel: getKanjiCategoryLabel(name)
            };
        });

        const metaByName = new Map(listMeta.map((item) => [item.name, item]));
        const groupedRows = groupKanjiListNamesByCategory(available).map((group, groupIndex) => {
            const packs = group.names.map((name) => metaByName.get(name)).filter(Boolean);
            const groupDue = packs.reduce((sum, pack) => sum + pack.dueCount, 0);
            const groupTotal = packs.reduce((sum, pack) => sum + pack.totalCount, 0);
            const groupSummary = `${groupDue} due · ${groupTotal} cards`;

            const rows = packs.map((pack, rowIndex) => {
                const packLabel = pack.packNumber !== null
                    ? `Pack ${String(pack.packNumber).padStart(2, '0')}`
                    : 'Kanji Pack';
                return `
                    <label class="kanji-picker-row" style="--stagger:${rowIndex + 1};">
                        <span class="kanji-picker-check-wrap">
                            <input
                                type="checkbox"
                                class="kanji-picker-checkbox"
                                value="${escapeAttr(pack.name)}"
                                data-category-index="${groupIndex}"
                                data-due="${pack.dueCount}"
                                data-total="${pack.totalCount}"
                                ${selectedSet.has(pack.name) ? 'checked' : ''}
                            >
                        </span>
                        <span class="kanji-picker-main">
                            <span class="kanji-picker-title" title="${escapeAttr(pack.name)}">${escapeHTML(pack.name)}</span>
                            <span class="kanji-picker-sub">${packLabel}</span>
                            <span class="kanji-picker-meter" aria-hidden="true">
                                <span style="width:${pack.masteryPercent}%"></span>
                            </span>
                        </span>
                        <span class="kanji-picker-meta">
                            <span class="kanji-picker-chip ${pack.dueCount === 0 ? 'is-quiet' : ''}">${pack.dueCount} due</span>
                            <span class="kanji-picker-chip is-soft">${pack.masteredCount}/${pack.totalCount} mastered</span>
                        </span>
                    </label>
                `;
            }).join('');

            return `
                <section class="kanji-picker-group">
                    <div class="kanji-picker-group-header">
                        <div>
                            <div class="kanji-picker-group-title">${escapeHTML(group.label)}</div>
                            <div class="kanji-picker-group-meta">${groupSummary}</div>
                        </div>
                        <button type="button" class="kanji-picker-group-action" data-category-index="${groupIndex}">Toggle Category</button>
                    </div>
                    <div class="kanji-picker-group-list">${rows}</div>
                </section>
            `;
        }).join('');

        overlay.innerHTML = `
            <div class="kanji-picker-header">
                <span id="studio-kanji-picker-title" class="kanji-picker-header-title">
                    <i class="fas fa-torii-gate"></i>
                    Kanji Corner
                </span>
                <button type="button" id="kanji-picker-close" class="studio-overlay-close-btn" aria-label="Close kanji list picker">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="kanji-picker-body">
                <p class="kanji-picker-intro">Load one or more 5-kanji packs for this run. Due cards are prioritized automatically.</p>
                <div class="kanji-picker-toolbar">
                    <button type="button" id="kanji-picker-all" class="kanji-picker-toolbar-btn">All Packs</button>
                    <button type="button" id="kanji-picker-due" class="kanji-picker-toolbar-btn">Due Packs</button>
                    <button type="button" id="kanji-picker-none" class="kanji-picker-toolbar-btn">Clear</button>
                </div>
                <div class="kanji-picker-groups">${groupedRows}</div>
            </div>
            <div class="kanji-picker-footer">
                <div id="kanji-picker-summary" class="kanji-picker-summary" aria-live="polite"></div>
                <div id="kanji-picker-summary-hint" class="kanji-picker-summary-hint"></div>
                <button type="button" id="kanji-picker-start" class="kanji-picker-start-btn">Start Kanji Run</button>
            </div>
        `;

        const closeButton = overlay.querySelector('#kanji-picker-close');
        const selectAllButton = overlay.querySelector('#kanji-picker-all');
        const dueButton = overlay.querySelector('#kanji-picker-due');
        const clearButton = overlay.querySelector('#kanji-picker-none');
        const startButton = overlay.querySelector('#kanji-picker-start');
        const summary = overlay.querySelector('#kanji-picker-summary');
        const summaryHint = overlay.querySelector('#kanji-picker-summary-hint');
        const categoryButtons = Array.from(overlay.querySelectorAll('.kanji-picker-group-action'));
        const checkboxes = Array.from(overlay.querySelectorAll('.kanji-picker-checkbox'));

        const getSelectedNames = () => checkboxes.filter(cb => cb.checked).map(cb => cb.value);
        const setSelection = (enabled) => {
            checkboxes.forEach(cb => { cb.checked = enabled; });
        };
        const setSelectionByName = (names) => {
            const lookup = new Set(names || []);
            checkboxes.forEach(cb => { cb.checked = lookup.has(cb.value); });
        };
        const syncSelectedRows = () => {
            checkboxes.forEach((checkbox) => {
                const row = checkbox.closest('.kanji-picker-row');
                if (!row) return;
                row.classList.toggle('is-selected', checkbox.checked);
            });
        };
        const refreshSummary = (withPulse = false) => {
            const selectedNames = getSelectedNames();
            const selectedWords = getKanjiWordsForListNames(loadedLists, selectedNames);
            const totalCount = selectedWords.length;
            const dueCount = selectedWords.filter(word => !isMastered(word)).length;
            const nextRunCount = Math.min(10, dueCount > 0 ? dueCount : totalCount);

            syncSelectedRows();

            if (summary) {
                summary.textContent = `${selectedNames.length} packs loaded · ${dueCount} due now · ${totalCount} cards`;
                if (withPulse) {
                    summary.classList.remove('is-pulse');
                    void summary.offsetWidth;
                    summary.classList.add('is-pulse');
                }
            }

            if (summaryHint) {
                if (selectedNames.length === 0) {
                    summaryHint.textContent = 'Choose at least one pack to start.';
                } else if (dueCount === 0) {
                    summaryHint.textContent = `All loaded packs are mastered. Next run will be a ${nextRunCount}-card refresher.`;
                } else {
                    summaryHint.textContent = `Next run: up to ${nextRunCount} cards from your loaded packs.`;
                }
            }

            if (startButton) {
                startButton.disabled = selectedNames.length === 0;
            }
        };

        if (closeButton) {
            closeButton.addEventListener('click', () => closeDialog(overlay));
        }

        if (selectAllButton) {
            selectAllButton.addEventListener('click', () => {
                setSelection(true);
                refreshSummary(true);
            });
        }

        if (dueButton) {
            dueButton.addEventListener('click', () => {
                const dueNames = listMeta.filter(item => item.dueCount > 0).map(item => item.name);
                if (dueNames.length === 0) {
                    setSelection(true);
                    showToast("Everything is mastered. Loaded all packs for refresher mode.", "info");
                } else {
                    setSelectionByName(dueNames);
                }
                refreshSummary(true);
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                setSelection(false);
                refreshSummary(true);
            });
        }

        categoryButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const groupId = button.getAttribute('data-category-index');
                if (!groupId) return;
                const categoryBoxes = checkboxes.filter(cb => cb.getAttribute('data-category-index') === groupId);
                if (categoryBoxes.length === 0) return;
                const shouldEnable = categoryBoxes.some(cb => !cb.checked);
                categoryBoxes.forEach(cb => { cb.checked = shouldEnable; });
                refreshSummary(true);
            });
        });

        checkboxes.forEach((checkbox) => {
            checkbox.addEventListener('change', () => refreshSummary(true));
        });

        if (startButton) {
            startButton.addEventListener('click', () => {
                const selectedNames = getSelectedNames();
                if (selectedNames.length === 0) {
                    showToast("Pick at least one kanji list.", "warning");
                    return;
                }
                saveKanjiSelection(selectedNames);
                closeDialog(overlay);
                startKanjiCornerSession(selectedNames);
            });
        }

        refreshSummary();

        openDialog(overlay, {
            initialFocusSelector: '#kanji-picker-start',
            labelId: 'studio-kanji-picker-title'
        });
    }

    function startKanjiCornerSession(selectedListNames = null) {
        const availableKanjiNames = getKanjiListNames(loadedLists);
        let selectedNames = Array.isArray(selectedListNames) && selectedListNames.length > 0
            ? selectedListNames.filter(name => availableKanjiNames.includes(name))
            : availableKanjiNames;
        if (selectedNames.length === 0) {
            selectedNames = availableKanjiNames;
        }

        const kanjiWords = getKanjiWordsForListNames(loadedLists, selectedNames);
        if (kanjiWords.length === 0) {
            alert("No kanji found in selected lists.");
            return;
        }

        currentListName = selectedNames.length === 1
            ? `Kanji Corner · ${selectedNames[0]}`
            : `Kanji Corner (${selectedNames.length} packs)`;
        isPurificationSession = false;

        let candidates = kanjiWords.filter(word => !isMastered(word));
        if (candidates.length === 0) {
            candidates = [...kanjiWords];
        }

        candidates.forEach(word => { word.priorityScore = calculatePriority(word); });
        candidates.sort((a, b) => b.priorityScore - a.priorityScore);
        candidates = shuffleWithBias(candidates);

        wordList = candidates.slice(0, 10);

        startSession({
            modeOverride: 'jp-en',
            labelOverride: 'KANJI CORNER',
            answerMatcher: matchesKanjiAnswer,
            isKanjiSession: true
        });
    }

    function startNeedsWork() {
        closeStats();
        currentListName = "Practice Focus";
        // Normal retry loop — wrong words re-queue, no hearts/gauntlet
        isPurificationSession = false;

        const allWords = [];
        const seen = new Set();
        getNonKanjiLists(loadedLists).forEach(([, list]) => {
            list.forEach(w => { if (!seen.has(w.jp)) { allWords.push(w); seen.add(w.jp); } });
        });

        // Pick lowest-confidence non-mastered words that have been attempted at least once
        const weakWords = [];
        allWords.forEach(w => {
            const stats = wordStats[w.jp];
            if (!stats || ((stats.correct || 0) === 0 && (stats.wrong || 0) === 0)) return;
            if (!isMastered(w)) {
                weakWords.push({ word: w, confidence: calculateConfidence(stats) });
            }
        });

        // Lowest confidence = most needs work
        weakWords.sort((a, b) => a.confidence - b.confidence);
        wordList = weakWords.slice(0, 10).map(item => item.word);

        if (wordList.length === 0) {
            alert("Great job! No specific words need extra work right now.");
            return;
        }

        // Slight shuffle so order isn't always identical
        wordList = wordList.sort(() => Math.random() - 0.5);
        startSession();
    }

    function startQuiz(name) {
        if (!loadedLists[name]) return;
        currentListName = name;
        isPurificationSession = false;
        wordList = [...loadedLists[name]].sort(() => Math.random() - 0.5);
        startSession();
    }

    function startSession(options = {}) {
        currentIndex = 0; score = 0; sessionResults = [];
        sessionModeOverride = options.modeOverride || null;
        sessionAnswerMatcher = typeof options.answerMatcher === 'function' ? options.answerMatcher : null;
        sessionLabelOverride = options.labelOverride || null;
        sessionIsKanji = !!options.isKanjiSession;
        kanjiHintVisible = false;
        showSection('quiz');
        showCard();
    }

    // =========================================================
    // SHOW CARD (from nihongo-studio)
    // =========================================================
    function showCard() {
        if (currentIndex >= wordList.length) return finishQuiz();
        const pct = (currentIndex / wordList.length) * 100;
        document.getElementById('progress-bar').style.width = pct + "%";
        document.getElementById('current-count-text').innerText = `${currentIndex + 1} / ${wordList.length}`;

        let mode = sessionModeOverride || document.getElementById('global-quiz-mode').value;
        const heartsContainer = document.getElementById('hearts-container');
        const textInput = document.getElementById('text-input-container');
        const speechControls = document.getElementById('speech-controls');
        let choiceContainer = document.getElementById('choice-container');

        // Create choice container if it doesn't exist
        if (!choiceContainer) {
            choiceContainer = document.createElement('div');
            choiceContainer.id = 'choice-container';
            choiceContainer.className = 'hidden';
            textInput.parentElement.insertBefore(choiceContainer, textInput.nextSibling);
        }

        const pair = wordList[currentIndex];

        if (isPurificationSession) {
            mode = 'en-jp';
            document.getElementById('quiz-mode-label').innerText = config.gauntletLabel || "GAUNTLET (EN → Target)";
            document.getElementById('quiz-mode-label').classList.add('text-red-500');
            heartsContainer.classList.remove('hidden');
            renderHearts();
            textInput.classList.remove('hidden');
            speechControls.classList.add('hidden');
            choiceContainer.classList.add('hidden');
        } else if (mode === 'choice') {
            document.getElementById('quiz-mode-label').innerText = "Multiple Choice";
            document.getElementById('quiz-mode-label').classList.remove('text-red-500');
            heartsContainer.classList.add('hidden');
            textInput.classList.add('hidden');
            speechControls.classList.add('hidden');
            choiceContainer.classList.remove('hidden');

            // Build choices: 1 correct + 3 distractors
            const correctAnswer = pair.en;
            const allAnswers = [];
            const seen = new Set([correctAnswer.toLowerCase()]);
            Object.values(loadedLists).forEach(list => {
                list.forEach(w => {
                    if (!seen.has(w.en.toLowerCase())) {
                        allAnswers.push(w.en);
                        seen.add(w.en.toLowerCase());
                    }
                });
            });

            // Pick 3 random distractors
            const distractors = [];
            const pool = [...allAnswers];
            for (let i = 0; i < 3 && pool.length > 0; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                distractors.push(pool.splice(idx, 1)[0]);
            }

            // Shuffle all 4 options
            const options = [correctAnswer, ...distractors].sort(() => Math.random() - 0.5);

            choiceContainer.innerHTML = `<div class="choice-grid">${options.map(opt =>
                `<button class="choice-btn" onclick="window._studioHandleChoice(this, ${opt === correctAnswer})">${escapeHTML(opt)}</button>`
            ).join('')}</div>`;

            // Handle choice click
            window._studioHandleChoice = (btn, isCorrect) => {
                if (isProcessing) return;
                isProcessing = true;

                // Disable all buttons
                choiceContainer.querySelectorAll('.choice-btn').forEach(b => { b.disabled = true; });

                if (isCorrect) {
                    btn.classList.add('correct');
                } else {
                    btn.classList.add('wrong');
                    // Highlight the correct answer
                    choiceContainer.querySelectorAll('.choice-btn').forEach(b => {
                        if (b.textContent === correctAnswer) b.classList.add('correct');
                    });
                }

                finishAnswerCheck(isCorrect, correctAnswer);
            };
        } else if (mode === 'speech') {
            document.getElementById('quiz-mode-label').innerText = config.speechLabel || "SPEAKING";
            document.getElementById('quiz-mode-label').classList.remove('text-red-500');
            heartsContainer.classList.add('hidden');
            textInput.classList.add('hidden');
            speechControls.classList.remove('hidden');
            choiceContainer.classList.add('hidden');
            document.getElementById('speech-status').innerText = config.speechPrompt || "Click mic to speak";
            if (config.updateMicState) config.updateMicState('idle');
        } else {
            document.getElementById('quiz-mode-label').innerText = sessionLabelOverride || "Translating";
            document.getElementById('quiz-mode-label').classList.remove('text-red-500');
            heartsContainer.classList.add('hidden');
            textInput.classList.remove('hidden');
            speechControls.classList.add('hidden');
            choiceContainer.classList.add('hidden');
        }

        // Show Question — for choice mode, always show the target language word
        if (mode === 'choice') {
            document.getElementById('question-word').innerText = pair.jp;
        } else {
            document.getElementById('question-word').innerText = (mode === 'jp-en') ? pair.jp : pair.en;
        }

        const input = document.getElementById('answer-input');
        input.value = ''; input.disabled = false;
        if (mode !== 'speech' && mode !== 'choice') input.focus();

        document.getElementById('feedback').style.opacity = '0';
        updateKanjiHintView(false);
        isProcessing = false;
    }

    function renderHearts() {
        const container = document.getElementById('hearts-container');
        container.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            container.innerHTML += (i < gauntletLives)
                ? `<i class="fas fa-heart text-red-500 text-2xl animate-pulse"></i>`
                : `<i class="fas fa-heart-broken text-gray-300 text-2xl"></i>`;
        }
    }

    // =========================================================
    // ANSWER CHECKING — delegates to config.checkAnswer
    // =========================================================
    function checkAnswer(spokenText = null) {
        if (isProcessing) return;
        isProcessing = true;

        let mode = sessionModeOverride || document.getElementById('global-quiz-mode').value;
        if (isPurificationSession) mode = 'en-jp';

        const pair = wordList[currentIndex];
        let correct = (mode === 'jp-en') ? pair.en : pair.jp;
        let user = (spokenText !== null) ? spokenText : document.getElementById('answer-input').value;

        // Delegate matching to language-specific logic
        let match = false;
        if (sessionAnswerMatcher) {
            match = sessionAnswerMatcher(user, pair, mode);
        } else if (config.checkAnswerMatch) {
            match = config.checkAnswerMatch(user, correct, mode, pair);
        } else {
            // Fallback: simple normalized containment
            const nUser = config.normalize ? config.normalize(user) : user.toLowerCase().replace(/\s+/g, '');
            const nCorrect = config.normalize ? config.normalize(correct) : correct.toLowerCase().replace(/\s+/g, '');
            const minLength = nCorrect.length <= 2 ? 1 : 2;
            match = nUser.length >= minLength && nCorrect.includes(nUser);
        }

        finishAnswerCheck(match, correct);
    }

    function finishAnswerCheck(match, correctText) {
        const pair = wordList[currentIndex];
        sessionResults.push({ word: pair.jp, correct: match });

        const fb = document.getElementById('feedback');
        fb.style.opacity = '1';

        if (match) {
            fb.innerHTML = "<span class='text-green-500'><i class='fas fa-check mr-2'></i>Correct</span>";
            score++;

            // TTS reinforcement: speak word on correct answer
            if (config.speakText) config.speakText(pair.jp);

            document.getElementById('answer-input').classList.add('border-green-500');
            setTimeout(() => {
                document.getElementById('answer-input').classList.remove('border-green-500');
                currentIndex++; showCard();
            }, 1500);
        } else {
            fb.innerHTML = `<span class='text-red-500'><i class='fas fa-times mr-2'></i></span>`;
            const errorSpan = document.createElement('span');
            errorSpan.className = 'text-red-500';
            errorSpan.textContent = correctText;
            fb.appendChild(errorSpan);

            document.getElementById('answer-input').classList.add('border-red-500');
            if (sessionIsKanji) {
                toggleKanjiHint(true);
            }

            if (isPurificationSession) {
                gauntletLives--;
                renderHearts();
                if (gauntletLives <= 0) {
                    setTimeout(() => {
                        alert(config.gauntletFailMsg || "Failed! Try again later.");
                        showSection('select');
                    }, 1000);
                    return;
                }
            } else {
                wordList.push(pair); // re-queue for retry
            }

            setTimeout(() => {
                document.getElementById('answer-input').classList.remove('border-red-500');
                currentIndex++; showCard();
            }, 2500);
        }
    }

    // =========================================================
    // API WRAPPER WITH AUTHENTICATION
    // =========================================================
    async function apiFetch(url, options = {}) {
        let response = await fetch(url, options);

        if (!response.ok) {
            let errorMsg = "Unknown API error.";
            try {
                const data = await response.json();
                if (data.error) errorMsg = data.error;
            } catch (e) { }
            console.error(`API Error HTTP ${response.status}:`, errorMsg);
            throw new Error(errorMsg);
        }

        return response;
    }

    function handleAdminRequestError(error, fallbackMessage) {
        const message = error?.message || fallbackMessage;
        showToast(message || fallbackMessage, 'error');
    }

    // =========================================================
    // FINISH QUIZ
    // =========================================================
    async function finishQuiz() {
        const pct = Math.round((score / wordList.length) * 100);
        document.getElementById('progress-bar').style.width = "100%";
        const mode = sessionModeOverride || document.getElementById('global-quiz-mode').value;

        try {
            await Promise.all([
                apiFetch(config.apiUrl + '&action=save_score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listName: currentListName, score: pct, mode: mode })
                }),
                apiFetch(config.apiUrl + '&action=update_word_stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ results: sessionResults, is_purification: isPurificationSession })
                })
            ]);
        } catch (e) {
            console.error(e);
        }

        incrementStreak();

        // Save session history
        saveSessionHistory({ listName: currentListName, mode, score: pct, wordCount: wordList.length, date: Date.now() });

        // Confetti on perfect score
        if (pct === 100) {
            ensureConfettiLoaded()
                .then((confettiFn) => {
                    if (typeof confettiFn === 'function') {
                        confettiFn({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
                    }
                })
                .catch(() => { });
        }

        // Collect wrong answers (deduplicate)
        const wrongWords = [];
        const wrongSeen = new Set();
        sessionResults.forEach(r => {
            if (!r.correct && !wrongSeen.has(r.word)) {
                wrongSeen.add(r.word);
                // Find the pair to get the English translation
                const pair = wordList.find(w => w.jp === r.word);
                if (pair) wrongWords.push(pair);
            }
        });

        // Show styled results overlay
        showResultsScreen(pct, mode, wrongWords);

        isPurificationSession = false;
        fetchLists();
    }

    function showResultsScreen(pct, mode, wrongWords) {
        const overlay = document.getElementById('studio-results-overlay');
        if (!overlay) return;

        const scoreTone = getScoreTone(pct);

        let wrongHTML = '';
        if (wrongWords.length > 0) {
            wrongHTML = `
                <div class="results-wrong-list">
                    <div class="results-label">Missed ${wrongWords.length}</div>
                    ${wrongWords.map(w => `
                        <div class="results-wrong-item">
                            <span>${escapeHTML(w.jp)}</span>
                            <span class="correct-answer">${escapeHTML(w.en)}</span>
                        </div>
                    `).join('')}
                </div>`;
        }

        overlay.innerHTML = `
            <div class="results-panel">
                <div id="studio-results-title" class="results-label">Session Results</div>
                <div class="results-score ${scoreTone}">${pct}%</div>
                <div class="results-meta">${escapeHTML(currentListName)} · ${mode.toUpperCase()}</div>
                ${wrongHTML}
                <button type="button" onclick="window.StudioUI.closeDialog(document.getElementById('studio-results-overlay'), { restoreFocus: false }); showSection('select');"
                    class="results-done-btn" style="margin-top:2rem;" aria-label="Close results">
                    Done
                </button>
            </div>
        `;

        openDialog(overlay, {
            initialFocusSelector: '.results-done-btn',
            labelId: 'studio-results-title',
            onRequestClose: () => {
                closeDialog(overlay, { restoreFocus: false });
                showSection('select');
            }
        });
    }

    // =========================================================
    // SPEECH
    // =========================================================
    function replayAudio() {
        const pair = wordList[currentIndex];
        if (pair && config.speakText) config.speakText(pair.jp);
    }

    function activateSpeech() {
        if (config.activateSpeech) {
            config.activateSpeech();
        }
    }

    // =========================================================
    // LIST MANAGEMENT
    // =========================================================
    async function deleteList(name) {
        if (!confirm(`Delete "${name}"?`)) return;
        try {
            await apiFetch(config.apiUrl + '&action=delete_list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name })
            });
            fetchLists();
        } catch (e) {
            console.error(e);
            handleAdminRequestError(e, "Failed to delete list");
        }
    }

    function openCreateNew() {
        editingOriginalName = null;
        document.getElementById('list-name-input').value = '';
        document.getElementById('word-input').value = '';
        showSection('setup');
    }

    async function saveListToServer() {
        if (isSavingList) return;
        const name = document.getElementById('list-name-input').value.trim();
        const text = document.getElementById('word-input').value;
        if (!name || !text) {
            showToast("Add a list name and at least one word pair before saving.", "warning");
            return;
        }
        let words = text.split('\n').reduce((acc, line) => {
            if (!line.trim()) return acc;
            let match = line.match(/^(.*?),\s*(.*)$/);
            if (match && match.length >= 3) {
                acc.push({ jp: match[1].trim(), en: match[2].trim() });
            }
            return acc;
        }, []);
        if (!words.length) {
            showToast("Use the format “word, meaning” on each line.", "warning");
            return;
        }

        const saveButton = document.querySelector('#setup-section .studio-save-btn');

        try {
            isSavingList = true;
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.setAttribute('aria-busy', 'true');
                saveButton.textContent = 'Saving...';
            }
            if (editingOriginalName && editingOriginalName !== name) {
                await apiFetch(config.apiUrl + '&action=delete_list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: editingOriginalName })
                });
            }
            await apiFetch(config.apiUrl + '&action=save_list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, words })
            });

            // Reload lists after saving
            fetchLists();
            showSection('select');
        } catch (e) {
            console.error(e);
            handleAdminRequestError(e, "Failed to save list");
        } finally {
            isSavingList = false;
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.removeAttribute('aria-busy');
                saveButton.textContent = 'Save Changes';
            }
        }
    }

    function editList(name) {
        editingOriginalName = name;
        document.getElementById('list-name-input').value = name;
        document.getElementById('word-input').value = loadedLists[name].map(p => `${p.jp}, ${p.en}`).join('\n');
        showSection('setup');
    }

    // =========================================================
    // DEFAULT FILTER (simple)
    // =========================================================
    function filterListsDefault() {
        const term = document.getElementById('list-search').value.toLowerCase().trim();
        if (!term) {
            document.querySelectorAll('#list-table-body tr').forEach(row => row.style.display = '');
            return;
        }
        document.querySelectorAll('#list-table-body tr').forEach(row => {
            row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
        });
    }

    // =========================================================
    // STREAK (localStorage-based)
    // =========================================================
    function checkStreak() {
        const prefix = config.streakKey || 'studio';
        const today = new Date().toLocaleDateString('en-CA');
        const lastDate = localStorage.getItem(`${prefix}_last_study_date`);
        let streak = parseInt(localStorage.getItem(`${prefix}_streak`) || 0);
        if (lastDate && lastDate !== today) {
            const diff = Math.ceil(Math.abs(new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24));
            if (diff > 1) streak = 0;
        }
        updateStreakUI(streak);
    }

    function incrementStreak() {
        const prefix = config.streakKey || 'studio';
        const today = new Date().toLocaleDateString('en-CA');
        const lastDate = localStorage.getItem(`${prefix}_last_study_date`);
        let streak = parseInt(localStorage.getItem(`${prefix}_streak`) || 0);
        if (lastDate !== today) {
            const diff = !lastDate ? 1 : Math.ceil(Math.abs(new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24));
            streak = (diff === 1) ? streak + 1 : 1;
            localStorage.setItem(`${prefix}_streak`, streak);
            localStorage.setItem(`${prefix}_last_study_date`, today);
        }
        updateStreakUI(streak);
    }

    function updateStreakUI(streak) {
        document.getElementById('streak-text').innerText = `${streak} Day Streak`;
        const icon = document.getElementById('streak-icon');
        icon.className = `fas fa-fire transition-colors ${streak > 0 ? 'text-orange-400' : 'text-gray-300'}`;
    }

    // =========================================================
    // DARK MODE
    // =========================================================
    function initDarkMode() {
        const isDark = localStorage.getItem('studio_dark_mode') === 'true';
        if (isDark) document.body.classList.add('dark');
    }

    function toggleDarkMode() {
        document.body.classList.toggle('dark');
        const isDark = document.body.classList.contains('dark');
        localStorage.setItem('studio_dark_mode', isDark);
        // Sync checkbox if toggled via keyboard
        const cb = document.getElementById('dark-mode-checkbox');
        if (cb) cb.checked = isDark;
    }

    // =========================================================
    // SESSION HISTORY (localStorage)
    // =========================================================
    function getSessionHistory() {
        const prefix = config.streakKey || 'studio';
        try {
            return JSON.parse(localStorage.getItem(`${prefix}_session_history`) || '[]');
        } catch { return []; }
    }

    function saveSessionHistory(session) {
        const prefix = config.streakKey || 'studio';
        const history = getSessionHistory();
        history.unshift(session);
        // Keep last 50
        if (history.length > 50) history.length = 50;
        localStorage.setItem(`${prefix}_session_history`, JSON.stringify(history));
    }

    // =========================================================
    // STATS DASHBOARD
    // =========================================================
    function showStats() {
        const overlay = document.getElementById('studio-stats-overlay');
        if (!overlay) return;

        const allWords = [];
        const seen = new Set();
        Object.values(loadedLists).forEach(list => {
            list.forEach(w => { if (!seen.has(w.jp)) { allWords.push(w); seen.add(w.jp); } });
        });

        let totalMastered = 0, totalLearning = 0, totalNew = 0;
        let totalCorrect = 0, totalWrong = 0;
        const weakWords = [];

        allWords.forEach(w => {
            const stats = wordStats[w.jp];
            if (!stats || (!stats.correct && !stats.wrong)) { totalNew++; return; }
            totalCorrect += (stats.correct || 0);
            totalWrong += (stats.wrong || 0);
            const total = (stats.correct || 0) + (stats.wrong || 0);
            const accuracy = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
            if (isMastered(w)) { totalMastered++; }
            else { totalLearning++; weakWords.push({ word: w, accuracy, total }); }
        });

        weakWords.sort((a, b) => a.accuracy - b.accuracy);
        const avgAccuracy = (totalCorrect + totalWrong) > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0;
        const history = getSessionHistory();
        const recentScores = history.slice(0, 20).reverse();
        const total = allWords.length || 1;
        const masteredPct = (totalMastered / total) * 100;
        const learningPct = (totalLearning / total) * 100;
        const accuracyTone = avgAccuracy >= 70 ? 'tone-success' : 'tone-warning';

        const sparklineHTML = recentScores.length > 1 ? `
            <div class="sparkline-container" aria-hidden="true">
                ${recentScores.map(s => {
            const h = Math.max(3, (s.score / 100) * 28);
            return `<div class="sparkline-bar ${getScoreTone(s.score)}" style="height:${h}px;"></div>`;
        }).join('')}
            </div>` : '';

        const sessionsHTML = history.slice(0, 8).map(s => {
            const d = new Date(s.date);
            const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            return `<div class="session-item">
                <span>${escapeHTML(s.listName)}</span>
                <span class="session-score ${getScoreTone(s.score)}">${s.score}%</span>
                <span class="session-meta">${dateStr}</span>
            </div>`;
        }).join('');

        const weakHTML = weakWords.slice(0, 10).map(w => `
            <tr>
                <td>${escapeHTML(w.word.jp)}</td>
                <td class="cell-muted">${escapeHTML(w.word.en)}</td>
                <td class="cell-score ${w.accuracy >= 50 ? 'tone-warning' : 'tone-danger'}">${w.accuracy}%</td>
                <td class="cell-muted">${w.total}</td>
            </tr>
        `).join('');

        overlay.innerHTML = `
            <div class="stats-header">
                <span id="studio-stats-title" class="stats-header-title">Stats</span>
                <button type="button" onclick="closeStats()" class="studio-overlay-close-btn" aria-label="Close statistics">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value tone-accent">${allWords.length}</div>
                    <div class="stat-label">Words</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value tone-success">${totalMastered}</div>
                    <div class="stat-label">Mastered</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value tone-warning">${totalLearning}</div>
                    <div class="stat-label">Learning</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value ${accuracyTone}">${avgAccuracy}%</div>
                    <div class="stat-label">Accuracy</div>
                </div>
            </div>

            <div class="stats-section">
                <div class="mastery-bar">
                    <div class="bar-mastered" style="width:${masteredPct}%"></div>
                    <div class="bar-learning" style="width:${learningPct}%"></div>
                </div>
                <div class="stats-summary-note">${totalNew} still new to the system.</div>
            </div>

            ${recentScores.length > 1 ? `<div class="stats-section"><div class="stats-label">Recent</div>${sparklineHTML}</div>` : ''}

            ${weakWords.length > 0 ? `
            <div class="stats-section">
                <div class="stats-section-header">
                    <div class="stats-label" style="margin-bottom:0;">Needs Work</div>
                    <button type="button" onclick="startNeedsWork()" class="studio-inline-action" aria-label="Start practice focus session">
                        <i class="fas fa-dumbbell"></i> Practice Focus
                    </button>
                </div>
                <table class="stats-table">
                    <thead><tr><th>Word</th><th>Meaning</th><th>Acc.</th><th>Reviews</th></tr></thead>
                    <tbody>${weakHTML}</tbody>
                </table>
            </div>` : ''}

            ${history.length > 0 ? `
            <div class="stats-section">
                <div class="stats-label">History</div>
                ${sessionsHTML}
            </div>` : ''}
        `;

        openDialog(overlay, {
            initialFocusSelector: '.studio-inline-action, .studio-overlay-close-btn',
            labelId: 'studio-stats-title'
        });
    }

    function closeStats() {
        const overlay = document.getElementById('studio-stats-overlay');
        if (overlay) closeDialog(overlay);
    }

    // =========================================================
    // KEYBOARD SHORTCUTS
    // =========================================================
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (isDialogOpen()) return;

            // Don't trigger when typing in inputs
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                if (e.key === 'Escape') document.activeElement.blur();
                return;
            }

            switch (e.key) {
                case 'Escape':
                    // Close any open overlay, or quit quiz
                    const resultsOverlay = document.getElementById('studio-results-overlay');
                    const statsOverlay = document.getElementById('studio-stats-overlay');
                    const kanjiPickerOverlay = document.getElementById('studio-kanji-picker-overlay');
                    if (kanjiPickerOverlay && !kanjiPickerOverlay.classList.contains('hidden')) {
                        closeDialog(kanjiPickerOverlay);
                    } else if (resultsOverlay && !resultsOverlay.classList.contains('hidden')) {
                        closeDialog(resultsOverlay);
                        showSection('select');
                    } else if (statsOverlay && !statsOverlay.classList.contains('hidden')) {
                        closeStats();
                    } else if (!document.getElementById('quiz-section').classList.contains('hidden')) {
                        showSection('select');
                    }
                    break;
                case '/':
                    e.preventDefault();
                    document.getElementById('list-search')?.focus();
                    break;
                case 'n':
                    if (!document.getElementById('select-section').classList.contains('hidden')) {
                        openCreateNew();
                    }
                    break;
                case 'm':
                    if (!document.getElementById('select-section').classList.contains('hidden')) {
                        startMixSession();
                    }
                    break;
                case 'd':
                    toggleDarkMode();
                    break;
                case 's':
                    if (!document.getElementById('select-section').classList.contains('hidden')) {
                        showStats();
                    }
                    break;
            }
        });
    }

    // =========================================================
    // UI INJECTION (runs on init)
    // =========================================================
    function setFavicon(emoji) {
        // Remove any existing favicon
        document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]').forEach(el => el.remove());
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
        document.head.appendChild(link);
    }

    function injectMultipleChoiceOption() {
        const select = document.getElementById('global-quiz-mode');
        if (!select) return;
        // Check if already exists
        if (select.querySelector('option[value="choice"]')) return;
        const opt = document.createElement('option');
        opt.value = 'choice';
        opt.textContent = '🎯 Multiple Choice';
        select.appendChild(opt);
    }

    function injectToolbarButtons() {
        const header = document.querySelector('[data-studio-header]');
        if (!header) return;

        // Left side: Stats icon
        const leftSlot = header.querySelector('[data-studio-header-left]');
        if (leftSlot) {
            leftSlot.innerHTML = '';
            leftSlot.style.display = 'flex';
            leftSlot.style.alignItems = 'center';
            const statsBtn = document.createElement('button');
            statsBtn.type = 'button';
            statsBtn.className = 'header-icon-btn';
            statsBtn.onclick = () => showStats();
            statsBtn.title = 'Stats (S)';
            statsBtn.setAttribute('aria-label', 'Open statistics');
            statsBtn.innerHTML = '<i class="fas fa-chart-pie"></i>';
            leftSlot.appendChild(statsBtn);
        }

        // Right side: Dark mode toggle
        const rightSlot = header.querySelector('[data-studio-header-right]');
        if (rightSlot) {
            rightSlot.innerHTML = '';
            rightSlot.style.display = 'flex';
            rightSlot.style.alignItems = 'center';
            rightSlot.style.justifyContent = 'flex-end';
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'dark-mode-switch';
            toggleLabel.title = 'Dark Mode (D)';
            const isDark = localStorage.getItem('studio_dark_mode') === 'true';
            toggleLabel.innerHTML = `
                <span class="sr-only">Toggle dark mode</span>
                <input type="checkbox" id="dark-mode-checkbox" aria-label="Toggle dark mode" ${isDark ? 'checked' : ''}>
                <span class="slider"></span>
            `;
            toggleLabel.querySelector('input').addEventListener('change', toggleDarkMode);
            rightSlot.appendChild(toggleLabel);
        }
    }

    function injectOverlays() {
        const contentArea = document.querySelector('[data-studio-content]') || document.querySelector('.flex-1.overflow-hidden.bg-white.relative');
        if (!contentArea) return;

        // Results overlay
        const resultsOverlay = document.createElement('div');
        resultsOverlay.id = 'studio-results-overlay';
        resultsOverlay.className = 'studio-results-overlay hidden';
        resultsOverlay.setAttribute('aria-hidden', 'true');
        contentArea.appendChild(resultsOverlay);

        // Stats overlay
        const statsOverlay = document.createElement('div');
        statsOverlay.id = 'studio-stats-overlay';
        statsOverlay.className = 'studio-stats-overlay hidden';
        statsOverlay.setAttribute('aria-hidden', 'true');
        contentArea.appendChild(statsOverlay);

        const kanjiPickerOverlay = document.createElement('div');
        kanjiPickerOverlay.id = 'studio-kanji-picker-overlay';
        kanjiPickerOverlay.className = 'studio-kanji-picker-overlay hidden';
        kanjiPickerOverlay.setAttribute('aria-hidden', 'true');
        contentArea.appendChild(kanjiPickerOverlay);
    }

    // === PUBLIC API ===
    return {
        init,
        // Expose internals for language-specific code that needs them
        getState: () => ({
            loadedLists, loadedScores, wordStats,
            currentListName, wordList, currentIndex,
            score, isProcessing, sessionResults,
            isPurificationSession, gauntletLives
        }),
        setState: (key, value) => {
            switch (key) {
                case 'wordList': wordList = value; break;
                case 'currentListName': currentListName = value; break;
                case 'isPurificationSession': isPurificationSession = value; break;
                case 'gauntletLives': gauntletLives = value; break;
                case 'isProcessing': isProcessing = value; break;
            }
        },
        calculatePriority,
        shuffleWithBias,
        isMastered,
        showSection,
        showCard,
        renderHearts,
        startSession,
        finishAnswerCheck,
        showToast,
        fetchLists,
    };
})();
