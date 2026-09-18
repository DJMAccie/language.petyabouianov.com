/**
 * studio-library.js — Word Library Table, List CRUD, and SRS Focus Metrics for Nihongo Studio
 */
window.StudioLibrary = (() => {
    let tableStatusSortDirection = null;
    let editingOriginalName = null;
    // Scope of the list being edited: 'shared' for the owner's library,
    // 'personal' for a member's own list.
    let editingScope = 'personal';
    let isSavingList = false;

    function getUniqueStudyWords(lists = null) {
        const targetLists = lists || window._studio?.getLoadedLists?.() || {};
        const words = [];
        const byPrompt = new Map();
        const nonKanjiEntries = getNonKanjiLists(targetLists);

        nonKanjiEntries.forEach(([listName, list]) => {
            (list || []).forEach(word => {
                if (!word || !word.jp) return;
                if (!byPrompt.has(word.jp)) {
                    const cloned = { ...word, listNames: [] };
                    byPrompt.set(word.jp, cloned);
                    words.push(cloned);
                }
                byPrompt.get(word.jp).listNames.push(listName);
            });
        });

        return words;
    }

    function getReviewTotal(word) {
        const wordStats = window._studio?.getWordStats?.() || {};
        const stats = wordStats[word.jp];
        if (!stats) return 0;
        return (stats.correct || 0) + (stats.wrong || 0);
    }

    function getAccuracy(word) {
        const wordStats = window._studio?.getWordStats?.() || {};
        const stats = wordStats[word.jp];
        const total = getReviewTotal(word);
        if (!stats || total === 0) return 0;
        return (stats.correct || 0) / total;
    }

    function isMastered(word) {
        const wordStats = window._studio?.getWordStats?.() || {};
        const stats = wordStats[word.jp];
        if (!stats) return false;
        return (stats.streak || 0) >= 3;
    }

    function calculatePriority(word) {
        const wordStats = window._studio?.getWordStats?.() || {};
        const stats = wordStats[word.jp] || { correct: 0, wrong: 0, streak: 0, next_review: 0 };
        const now = Date.now();
        let priority = 0;

        if (stats.next_review && stats.next_review <= now) {
            const overdueDays = Math.min((now - stats.next_review) / 86400000, 7);
            priority += 50 + (overdueDays * 5);
        }

        priority += Math.min((stats.wrong || 0) * 8, 30);
        priority += Math.max(0, 15 - ((stats.streak || 0) * 3));
        return priority;
    }

    function shuffleWithBias(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    function getFreshPriority(word) {
        const names = word.listNames || [];
        if (names.some(name => /^Trip Priority/.test(name))) return 7;
        if (names.some(name => name === 'Grammar Patterns')) return 6;
        if (names.some(name => /Useful Connectors|Asking for Help|Social Situations|Making Plans|Expressing Wants|Daily Routines/.test(name))) return 5;
        if (names.some(name => /Kenty Lesson 1[01]/.test(name))) return 4;
        return 1;
    }

    function getFocusCandidates(kind) {
        const words = getUniqueStudyWords();
        const wordStats = window._studio?.getWordStats?.() || {};

        if (kind === 'fresh') {
            return words
                .filter(word => getReviewTotal(word) === 0)
                .sort((a, b) => getFreshPriority(b) - getFreshPriority(a));
        }

        if (kind === 'weak') {
            return words
                .filter(word => getReviewTotal(word) > 0 && !isMastered(word))
                .map(word => ({ ...word, priorityScore: calculatePriority(word) }))
                .sort((a, b) => {
                    const priorityDiff = (b.priorityScore || 0) - (a.priorityScore || 0);
                    if (priorityDiff !== 0) return priorityDiff;
                    const wrongDiff = (wordStats[b.jp]?.wrong || 0) - (wordStats[a.jp]?.wrong || 0);
                    if (wrongDiff !== 0) return wrongDiff;
                    return getAccuracy(a) - getAccuracy(b);
                });
        }

        if (kind === 'maintenance') {
            return words
                .filter(word => isMastered(word))
                .sort((a, b) => {
                    const aStats = wordStats[a.jp] || {};
                    const bStats = wordStats[b.jp] || {};
                    const reviewDiff = (aStats.last_review || 0) - (bStats.last_review || 0);
                    if (reviewDiff !== 0) return reviewDiff;
                    return (bStats.wrong || 0) - (aStats.wrong || 0);
                });
        }

        return [];
    }

    function getStudyFocusSummary(lists = null) {
        const words = getUniqueStudyWords(lists);
        const total = words.length;
        const mastered = words.filter(word => isMastered(word)).length;
        const fresh = words.filter(word => getReviewTotal(word) === 0).length;
        const weak = words.filter(word => getReviewTotal(word) > 0 && !isMastered(word)).length;
        const maintenance = words.filter(word => isMastered(word)).length;
        const config = window.StudioAPI?.getConfig?.() || {};
        const kanjiWords = config.enableKanjiCorner ? getKanjiWords(lists) : [];
        const kanjiDue = kanjiWords.filter(word => !isMastered(word)).length;
        const goal = Number(config.vocabularyGoal) || 0;

        return { total, mastered, fresh, weak, maintenance, kanjiDue, goal };
    }

    function renderStudyFocusPanel(lists = null) {
        const panel = document.getElementById('study-focus-panel');
        if (!panel) return;

        const summary = getStudyFocusSummary(lists);
        const masteredPct = summary.total > 0 ? Math.round((summary.mastered / summary.total) * 100) : 0;
        const goalPct = summary.goal > 0 ? Math.min(100, Math.round((summary.mastered / summary.goal) * 100)) : 0;
        const goalText = summary.goal > 0
            ? `${summary.mastered}/${summary.goal} goal`
            : `${summary.mastered} mastered`;

        panel.innerHTML = `
            <div class="study-focus-summary">
                <div>
                    <div class="study-focus-kicker">Today</div>
                    <div class="study-focus-title">${masteredPct}% mastered</div>
                    <div class="study-focus-meta">${goalText}</div>
                </div>
                <div class="study-focus-progress" aria-hidden="true">
                    <span style="width:${goalPct}%"></span>
                </div>
            </div>
        `;
    }

    function getKanjiListNames(lists) {
        const config = window.StudioAPI?.getConfig?.() || {};
        if (!config.enableKanjiCorner) return [];

        const listMap = lists || window._studio?.getLoadedLists?.() || {};
        const availableNames = Object.keys(listMap);

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
        const config = window.StudioAPI?.getConfig?.() || {};
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
        const config = window.StudioAPI?.getConfig?.() || {};
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
        const config = window.StudioAPI?.getConfig?.() || {};
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
        const listMap = lists || window._studio?.getLoadedLists?.() || {};

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
        const listMap = lists || window._studio?.getLoadedLists?.() || {};
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
        const config = window.StudioAPI?.getConfig?.() || {};
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
        } catch (e) { }
    }

    function getNonKanjiLists(lists) {
        const config = window.StudioAPI?.getConfig?.() || {};
        const allEntries = Object.entries(lists || {});
        if (!config.enableKanjiCorner) return allEntries;

        const kanjiNameSet = new Set(getKanjiListNames(lists));
        return allEntries.filter(([name]) => !kanjiNameSet.has(name));
    }

    function getScoreSet(scores, key) {
        const rawScoreSet = scores[key];
        return typeof rawScoreSet === 'object'
            ? rawScoreSet
            : (typeof rawScoreSet === 'number' ? { 'jp-en': rawScoreSet } : {});
    }

    function getModeProgress(mode, scoreSet) {
        const jpScore = scoreSet?.['jp-en'] || 0;
        const enScore = scoreSet?.['en-jp'] || 0;
        const speechScore = scoreSet?.['speech'] || 0;

        if (mode === 'jp-en') return { value: jpScore };
        if (mode === 'speech') return { value: speechScore };
        return { value: enScore };
    }

    function getStatusRank(activeScore) {
        if (activeScore > 80) return 2;
        if (activeScore > 0) return 1;
        return 0;
    }

    function toggleStatusSort() {
        tableStatusSortDirection = tableStatusSortDirection === 'desc' ? 'asc' : 'desc';
        syncStatusSortUI();
        const lists = window._studio?.getLoadedLists?.() || {};
        const scores = window._studio?.getLoadedScores?.() || {};
        renderTable(lists, scores);
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

    function renderTable(lists, scores) {
        const tbody = document.getElementById('list-table-body');
        if (!tbody) return;

        const config = window.StudioAPI?.getConfig?.() || {};
        const wordStats = window._studio?.getWordStats?.() || {};
        const currentMode = document.getElementById('global-quiz-mode')?.value || 'en-jp';

        let rows = [];
        let count = 0;
        let allUniqueWords = [];
        let uniqueCheck = new Set();

        const kanjiWords = config.enableKanjiCorner ? getKanjiWords(lists) : [];

        getNonKanjiLists(lists).forEach(([, l]) => l.forEach(w => {
            if (!uniqueCheck.has(w.jp)) {
                allUniqueWords.push(w);
                uniqueCheck.add(w.jp);
            }
        }));

        renderStudyFocusPanel(lists);
        window.StudioDaily?.renderDailyDashboard();

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
                <td class="p-3 pr-6 text-right"><button type="button" onclick="window.StudioLibrary.startSmartReview()" class="studio-table-start-btn" aria-label="Start smart review session">Start Session</button></td>
            </tr>`);
        }

        if (config.enableKanjiCorner && config.showKanjiCornerTableRow !== false && kanjiWords.length > 0) {
            const kanjiDueCount = kanjiWords.filter(word => !isMastered(word)).length;
            const kanjiCountLabel = `${kanjiDueCount} due · ${kanjiWords.length} total`;
            rows.push(`
            <tr class="border-b border-gray-100 transition cursor-default bg-amber-50/70 hover:bg-amber-500 group">
                <td class="p-3 pl-6 font-bold text-amber-700 group-hover:text-white"><i class="fas fa-torii-gate mr-3"></i>Kanji Corner</td>
                <td class="p-3 text-amber-700 group-hover:text-white font-medium">${kanjiCountLabel}</td>
                <td class="p-3 text-amber-400 group-hover:text-white text-xs hidden md:table-cell">--</td>
                <td class="p-3 hidden md:table-cell"><span class="text-amber-400 group-hover:text-white text-xs">--</span></td>
                <td class="p-3 pr-6 text-right"><button type="button" onclick="window.StudioLibrary.startKanjiCorner()" class="studio-table-start-btn" aria-label="Open kanji corner picker">Open Corner</button></td>
            </tr>`);
        }

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
                if (!tableStatusSortDirection) return compareByRecent(a, b);

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
            const words = lists[name] || [];
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

            const safeName = window.StudioUI.escapeAttr(name);

            // Shared lists belong to the library and are only editable by the
            // owner; personal lists are editable by whoever is signed in. Guests
            // study but never modify.
            const isShared = !!window.StudioScope?.isShared?.(name);
            const mayEdit = isShared
                ? !!window.StudioScope?.canEditShared?.()
                : !!window.StudioScope?.canEditPersonal?.();

            let actionButtons = mayEdit ? `
                <button type="button" onclick="window.StudioLibrary.editList('${safeName}')" class="studio-table-icon-btn" title="Edit ${safeName}" aria-label="Edit ${safeName}"><i class="fas fa-edit"></i></button>
                <button type="button" onclick="window.StudioLibrary.deleteListConfirm('${safeName}')" class="studio-table-icon-btn danger" title="Delete ${safeName}" aria-label="Delete ${safeName}"><i class="fas fa-trash"></i></button>` : '';

            if (config.startTraining) {
                actionButtons += `
                <button type="button" onclick="window.startTraining('${safeName}')" class="studio-table-icon-btn" title="Training for ${safeName}" aria-label="Start training for ${safeName}"><i class="fas fa-dumbbell"></i></button>`;
            }

            actionButtons += `
                <button type="button" onclick="window.StudioLibrary.startQuiz('${safeName}')" class="studio-table-start-btn" aria-label="Start quiz for ${safeName}">Start Quiz</button>`;

            rows.push(`
            <tr class="border-b border-gray-100 transition cursor-default group">
                <td class="p-3 pl-6 font-medium text-gray-800"><i class="fas fa-list-ul mr-3 text-gray-400 group-hover:text-white"></i>${window.StudioUI.escapeHTML(name)}${isShared ? '<span class="studio-list-badge" title="From the shared library">Shared</span>' : '<span class="studio-list-badge studio-list-badge--personal" title="Your own list">Personal</span>'}</td>
                <td class="p-3 text-gray-500">${words.length} words</td>
                <td class="p-3 hidden md:table-cell text-gray-500">${activeScore}%</td>
                <td class="p-3 hidden md:table-cell"><div class="flex items-center gap-2"><div class="w-2.5 h-2.5 rounded-full ${dotColor} shadow-sm"></div><span class="text-gray-500">${statusText}</span></div></td>
                <td class="p-3 pr-6 text-right">
                    <div class="studio-table-action-bar">${actionButtons}</div>
                </td>
            </tr>`);
        });

        tbody.innerHTML = rows.join('');
        filterLists();

        let uniqueWords = new Set();
        sortedKeys.forEach((name) => {
            (lists[name] || []).forEach((w) => uniqueWords.add(w.jp));
        });
        const listsCountEl = document.getElementById('total-lists-count');
        const wordsCountEl = document.getElementById('total-words-count');
        if (listsCountEl) listsCountEl.innerText = `${count} lists`;
        if (wordsCountEl) wordsCountEl.innerText = `${uniqueWords.size} words`;
    }

    function filterLists() {
        const input = document.getElementById('list-search');
        if (!input) return;
        const query = input.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#list-table-body tr');

        rows.forEach(row => {
            const listName = row.cells[0]?.textContent.toLowerCase() || '';
            row.style.display = listName.includes(query) ? '' : 'none';
        });
    }

    // Only the owner curates the shared library, so only they see the choice.
    function syncScopeField(scope) {
        const field = document.getElementById('list-scope-field');
        const select = document.getElementById('list-scope-select');
        const allowed = !!window.StudioScope?.canEditShared?.();
        if (field) field.classList.toggle('hidden', !allowed);
        if (select && allowed) select.value = scope === 'shared' ? 'shared' : 'personal';
    }

    function openCreateNew() {
        editingOriginalName = null;
        editingScope = 'personal';
        const nameInput = document.getElementById('list-name-input');
        const wordInput = document.getElementById('word-input');
        if (nameInput) nameInput.value = '';
        if (wordInput) wordInput.value = '';
        syncScopeField(editingScope);
        window.StudioCore?.showSection('setup');
    }

    function editList(name) {
        editingOriginalName = name;
        editingScope = window.StudioScope?.isShared?.(name) ? 'shared' : 'personal';
        const loadedLists = window._studio?.getLoadedLists?.() || {};
        const words = loadedLists[name] || [];
        const nameInput = document.getElementById('list-name-input');
        const wordInput = document.getElementById('word-input');
        if (nameInput) nameInput.value = name;
        if (wordInput) {
            wordInput.value = words.map(p => {
                const extras = [p.kana || '', p.romaji || '', p.sentence_jp || '', p.sentence_en || '', p.mnemonic || ''];
                while (extras.length && !extras[extras.length - 1]) extras.pop();
                return `${p.jp}, ${p.en}${extras.length ? ` | ${extras.join(' | ')}` : ''}`;
            }).join('\n');
        }
        syncScopeField(editingScope);
        window.StudioCore?.showSection('setup');
    }

    async function saveListToServer() {
        if (isSavingList) return;
        const name = document.getElementById('list-name-input')?.value.trim();
        const text = document.getElementById('word-input')?.value || '';
        if (!name || !text.trim()) {
            window.StudioUI?.showToast("Add a list name and at least one word pair before saving.", "warning");
            return;
        }

        const words = text.split('\n').reduce((acc, line) => {
            if (!line.trim()) return acc;
            const parts = line.split(/\s+\|\s+/);
            const pair = parts.shift() || '';
            const match = pair.match(/^(.*?),\s*(.*)$/);
            if (match && match.length >= 3) {
                const [kana = '', romaji = '', sentenceJp = '', sentenceEn = '', mnemonic = ''] = parts;
                const entry = { jp: match[1].trim(), en: match[2].trim() };
                if (kana.trim()) entry.kana = kana.trim();
                if (romaji.trim()) entry.romaji = romaji.trim();
                if (sentenceJp.trim()) entry.sentence_jp = sentenceJp.trim();
                if (sentenceEn.trim()) entry.sentence_en = sentenceEn.trim();
                if (mnemonic.trim()) entry.mnemonic = mnemonic.trim();
                acc.push(entry);
            }
            return acc;
        }, []);

        if (words.length === 0) {
            window.StudioUI?.showToast("Words must be formatted as: Word, Meaning", "warning");
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

            const scopeSelect = document.getElementById('list-scope-select');
            const chosenScope = (scopeSelect && !document.getElementById('list-scope-field')?.classList.contains('hidden'))
                ? (scopeSelect.value === 'shared' ? 'shared' : 'personal')
                : editingScope;

            // Renamed, or moved between the shared library and personal lists:
            // remove the previous entry from wherever it used to live.
            if (editingOriginalName && (editingOriginalName !== name || editingScope !== chosenScope)) {
                await window.StudioAPI?.deleteList(editingOriginalName, editingScope);
            }
            await window.StudioAPI?.saveList(name, words, chosenScope);

            await window.StudioCore?.fetchLists();
            window.StudioCore?.showSection('select');
            const where = chosenScope === 'shared' ? 'the shared library' : 'your lists';
            window.StudioUI?.showToast(`Saved "${name}" to ${where}.`, 'success');
        } catch (e) {
            window.StudioUI?.showToast(e.message || "Failed to save list", 'error');
        } finally {
            isSavingList = false;
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.removeAttribute('aria-busy');
                saveButton.textContent = 'Save Changes';
            }
        }
    }

    async function deleteListConfirm(name) {
        if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
        try {
            await window.StudioAPI?.deleteList(name, window.StudioScope?.isShared?.(name) ? 'shared' : 'personal');
            await window.StudioCore?.fetchLists();
            window.StudioUI?.showToast(`Deleted "${name}".`, 'success');
        } catch (e) {
            window.StudioUI?.showToast(e.message || "Failed to delete list", 'error');
        }
    }

    function startQuiz(name) {
        const loadedLists = window._studio?.getLoadedLists?.() || {};
        if (!loadedLists[name]) return;
        window.StudioQuiz?.startSession({
            listName: name,
            words: [...loadedLists[name]],
            requeueWrong: true,
            persistScore: true,
            sessionKind: 'standard'
        });
    }

    function startMixSession() {
        const loadedLists = window._studio?.getLoadedLists?.() || {};
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

        if (allWords.length === 0) {
            window.StudioUI?.showToast("No words to mix!", 'warning');
            return;
        }

        allWords.forEach(w => { w.priorityScore = calculatePriority(w); });
        allWords.sort((a, b) => b.priorityScore - a.priorityScore);
        allWords = shuffleWithBias(allWords);

        window.StudioQuiz?.startSession({
            listName: "Smart Mix",
            words: allWords.slice(0, 10),
            requeueWrong: true,
            persistScore: true,
            sessionKind: 'standard'
        });
    }

    function startSmartReview() {
        const loadedLists = window._studio?.getLoadedLists?.() || {};
        const wordStats = window._studio?.getWordStats?.() || {};
        let candidates = [];
        let seen = new Set();

        getNonKanjiLists(loadedLists).forEach(([, list]) => {
            list.forEach(word => {
                if (!seen.has(word.jp)) {
                    seen.add(word.jp);
                    const stats = wordStats[word.jp];
                    if (!stats || !stats.correct || stats.correct === 0) return;
                    if (isMastered(word)) return;
                    candidates.push(word);
                }
            });
        });

        candidates.forEach(word => { word.priorityScore = calculatePriority(word); });
        candidates.sort((a, b) => b.priorityScore - a.priorityScore);
        candidates = shuffleWithBias(candidates);

        if (candidates.length === 0) {
            window.StudioUI?.showToast("No active reviews due! Words must be answered correctly at least once.", 'info');
            return;
        }

        window.StudioQuiz?.startSession({
            listName: "Smart Review",
            words: candidates.slice(0, 10),
            requeueWrong: true,
            persistScore: true,
            sessionKind: 'standard'
        });
    }

    function startKanjiCorner() {
        const kanjiListNames = getKanjiListNames();
        if (kanjiListNames.length === 0) {
            window.StudioUI?.showToast("No kanji lists found.", 'warning');
            return;
        }

        const config = window.StudioAPI?.getConfig?.() || {};
        if (config.enableKanjiCornerListPicker) {
            window.StudioUI?.showKanjiCornerPicker(kanjiListNames, (chosen) => {
                startKanjiCornerSession(chosen);
            });
            return;
        }

        startKanjiCornerSession(kanjiListNames);
    }

    function startKanjiCornerSession(selectedPackNames) {
        const loadedLists = window._studio?.getLoadedLists?.() || {};
        const words = getKanjiWordsForListNames(loadedLists, selectedPackNames);
        if (words.length === 0) {
            window.StudioUI?.showToast("No cards available in selected kanji packs.", 'warning');
            return;
        }

        const sorted = [...words].sort((a, b) => {
            const aDue = !isMastered(a);
            const bDue = !isMastered(b);
            if (aDue !== bDue) return aDue ? -1 : 1;
            return Math.random() - 0.5;
        });

        window.StudioQuiz?.startSession({
            listName: selectedPackNames.length === 1 ? selectedPackNames[0] : `Kanji Corner (${selectedPackNames.length} packs)`,
            words: sorted,
            isKanjiSession: true,
            requeueWrong: true,
            persistScore: true,
            sessionKind: 'standard'
        });
    }

    function startNeedsWork() {
        const candidates = getFocusCandidates('weak');
        if (candidates.length === 0) {
            window.StudioUI?.showToast("No cards currently flagged as needing work.", 'info');
            return;
        }
        window.StudioUI?.closeStats();
        window.StudioQuiz?.startSession({
            listName: "Practice Focus",
            words: candidates.slice(0, 10),
            requeueWrong: true,
            persistScore: true,
            sessionKind: 'standard'
        });
    }

    return {
        getUniqueStudyWords,
        getReviewTotal,
        getAccuracy,
        isMastered,
        calculatePriority,
        shuffleWithBias,
        getFreshPriority,
        getFocusCandidates,
        getStudyFocusSummary,
        renderStudyFocusPanel,
        getKanjiListNames,
        getKanjiPackNumber,
        getKanjiCategoryLabel,
        groupKanjiListNamesByCategory,
        getKanjiWords,
        getKanjiWordsForListNames,
        getSavedKanjiSelection,
        saveKanjiSelection,
        getNonKanjiLists,
        renderTable,
        filterLists,
        toggleStatusSort,
        syncStatusSortUI,
        openCreateNew,
        editList,
        saveListToServer,
        deleteListConfirm,
        startQuiz,
        startMixSession,
        startSmartReview,
        startKanjiCorner,
        startNeedsWork
    };
})();
