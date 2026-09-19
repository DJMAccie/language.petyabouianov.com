/**
 * studio-ui.js — Accessible Dialogs, Overlays, Modals, and Notifications for Nihongo Studio
 */
window.StudioUI = (() => {
    let activeDialogState = null;
    let confettiLoader = null;
    let isSavingGrammarEntry = false;
    const GRAMMAR_LIST_NAME = 'Grammar Patterns';

    function escapeAttr(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
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

    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

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

    function getScoreTone(score, successThreshold = 80, warningThreshold = 50) {
        if (score >= successThreshold) return 'tone-success';
        if (score >= warningThreshold) return 'tone-warning';
        return 'tone-danger';
    }

    function ensureConfettiLoaded() {
        if (typeof window.confetti === 'function') return Promise.resolve(window.confetti);
        if (!confettiLoader) {
            confettiLoader = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                const config = window.StudioAPI?.getConfig?.() || {};
                const candidateSources = [
                    config.confettiScriptPath,
                    'vendor/canvas-confetti.browser.min.js',
                    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
                ].filter(Boolean);
                let sourceIndex = 0;

                const loadNextSource = () => {
                    if (sourceIndex >= candidateSources.length) {
                        reject(new Error('Failed to load celebration effect'));
                        return;
                    }
                    script.src = candidateSources[sourceIndex];
                    sourceIndex++;
                };

                script.async = true;
                script.onload = () => resolve(window.confetti);
                script.onerror = () => loadNextSource();
                document.head.appendChild(script);
                loadNextSource();
            });
        }
        return confettiLoader;
    }

    function showResultsScreen(options) {
        const {
            pct,
            mode,
            listName,
            wrongWords = [],
            doneButtonLabel = 'Done',
            onDone
        } = options;

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
                <div class="results-meta">${escapeHTML(listName)} · ${(mode || '').toUpperCase()}</div>
                ${wrongHTML}
                <button type="button" class="results-done-btn" style="margin-top:2rem;" aria-label="Close results">
                    ${escapeHTML(doneButtonLabel)}
                </button>
            </div>
        `;

        const doneBtn = overlay.querySelector('.results-done-btn');
        if (doneBtn) {
            doneBtn.onclick = () => {
                closeDialog(overlay, { restoreFocus: false });
                if (onDone) onDone();
            };
        }

        openDialog(overlay, {
            initialFocusSelector: '.results-done-btn',
            labelId: 'studio-results-title',
            onRequestClose: () => {
                closeDialog(overlay, { restoreFocus: false });
                if (onDone) onDone();
            }
        });
    }

    function showStats() {
        const overlay = document.getElementById('studio-stats-overlay');
        if (!overlay) return;

        const allWords = window.StudioLibrary?.getUniqueStudyWords?.() || [];
        const wordStats = window._studio?.getWordStats?.() || {};
        const config = window.StudioAPI?.getConfig?.() || {};

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
            if (window.StudioLibrary?.isMastered?.(w)) {
                totalMastered++;
            } else {
                totalLearning++;
                weakWords.push({ word: w, accuracy, total });
            }
        });

        weakWords.sort((a, b) => a.accuracy - b.accuracy);
        const avgAccuracy = (totalCorrect + totalWrong) > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0;
        const history = window.StudioQuiz?.getSessionHistory?.() || [];
        const recentScores = history.slice(0, 20).reverse();
        const total = allWords.length || 1;
        const masteredPct = (totalMastered / total) * 100;
        const learningPct = (totalLearning / total) * 100;
        const accuracyTone = avgAccuracy >= 70 ? 'tone-success' : 'tone-warning';
        const vocabularyGoal = Number(config.vocabularyGoal) || 0;
        const goalPct = vocabularyGoal > 0 ? Math.min(100, Math.round((totalMastered / vocabularyGoal) * 100)) : 0;

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
            <div class="studio-panel">
            <div class="stats-header">
                <span id="studio-stats-title" class="stats-header-title">Stats</span>
                <button type="button" onclick="window.StudioUI.closeStats()" class="studio-overlay-close-btn" aria-label="Close statistics">
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
                ${vocabularyGoal > 0 ? `
                <div class="stat-card">
                    <div class="stat-value tone-accent">${goalPct}%</div>
                    <div class="stat-label">2K Goal</div>
                </div>` : ''}
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
                    <button type="button" onclick="window.startNeedsWork()" class="studio-inline-action" aria-label="Start practice focus session">
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
            </div>
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

    // --- GRAMMAR CORNER ---
    function getGrammarRows() {
        const loadedLists = window._studio?.getLoadedLists?.() || {};
        return loadedLists[GRAMMAR_LIST_NAME] || [];
    }

    function parseGrammarPoint(meaning) {
        const match = (meaning || '').match(/\[([^\]]+)\]\s*$/);
        return match ? match[1].trim() : 'Grammar point';
    }

    function stripGrammarPoint(meaning) {
        return (meaning || '').replace(/\s*\[[^\]]+\]\s*$/, '').trim();
    }

    function grammarRowKey(item) {
        return `${(item?.jp || '').trim().toLowerCase()}|${(item?.en || '').trim().toLowerCase()}`;
    }

    async function saveGrammarEntry(event) {
        if (event) event.preventDefault();
        if (isSavingGrammarEntry) return;

        const grammarPointInput = document.getElementById('grammar-point-input');
        const patternInput = document.getElementById('grammar-pattern-input');
        const explanationInput = document.getElementById('grammar-explanation-input');

        const grammarPoint = grammarPointInput?.value.trim() || '';
        const pattern = patternInput?.value.trim() || '';
        const explanation = explanationInput?.value.trim() || '';

        if (!grammarPoint || !pattern || !explanation) {
            showToast('Fill in grammar point, pattern, and explanation.', 'warning');
            return;
        }

        const entry = {
            jp: pattern,
            en: `${explanation} [${grammarPoint}]`
        };

        const rows = getGrammarRows();
        const nextKey = grammarRowKey(entry);
        const hasDuplicate = rows.some((item) => grammarRowKey(item) === nextKey);
        if (hasDuplicate) {
            showToast('That grammar entry already exists.', 'warning');
            return;
        }

        const saveButton = document.getElementById('grammar-save-btn');
        try {
            isSavingGrammarEntry = true;
            if (saveButton) {
                saveButton.disabled = true;
                saveButton.setAttribute('aria-busy', 'true');
                saveButton.textContent = 'Saving...';
            }

            await window.StudioAPI.saveList(GRAMMAR_LIST_NAME, [...rows, entry]);
            await window.StudioCore.fetchLists();
            renderGrammarCorner();
            showToast('Grammar entry added.', 'success');
        } catch (error) {
            showToast(error.message || 'Failed to save grammar entry.', 'error');
        } finally {
            isSavingGrammarEntry = false;
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.removeAttribute('aria-busy');
                saveButton.textContent = 'Add Entry';
            }
        }
    }

    function renderGrammarCorner() {
        const results = document.getElementById('grammar-corner-results');
        if (!results) return;
        const rows = getGrammarRows();

        results.innerHTML = `
            <div class="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
                <div class="text-xs font-semibold tracking-[0.12em] text-gray-400">Add Grammar Entry</div>
                <form class="mt-3 grid gap-3 md:grid-cols-2" onsubmit="window.StudioUI.saveGrammarEntry(event)">
                    <div class="md:col-span-1">
                        <label for="grammar-point-input" class="mb-1 block text-[11px] font-semibold tracking-[0.06em] text-gray-500">Grammar Point</label>
                        <input id="grammar-point-input" type="text" maxlength="80" placeholder="e.g. たことがある"
                            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30">
                    </div>
                    <div class="md:col-span-1">
                        <label for="grammar-pattern-input" class="mb-1 block text-[11px] font-semibold tracking-[0.06em] text-gray-500">Japanese Pattern</label>
                        <input id="grammar-pattern-input" type="text" maxlength="220" placeholder="Pattern in Japanese / romaji"
                            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30">
                    </div>
                    <div class="md:col-span-2">
                        <label for="grammar-explanation-input" class="mb-1 block text-[11px] font-semibold tracking-[0.06em] text-gray-500">Explanation</label>
                        <textarea id="grammar-explanation-input" rows="2" maxlength="260" placeholder="Meaning or usage note"
                            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 resize-none"></textarea>
                    </div>
                    <div class="md:col-span-2 flex justify-end">
                        <button id="grammar-save-btn" type="submit"
                            class="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600">
                            Add Entry
                        </button>
                    </div>
                </form>
            </div>
            <div class="mb-4 flex items-end justify-between gap-4 border-b border-gray-200 pb-3">
                <div>
                    <div class="text-xs font-semibold tracking-[0.12em] text-gray-400">Grammar Points</div>
                </div>
                <div class="text-xs text-gray-400">${rows.length} entries</div>
            </div>
            <div class="border-t border-gray-200">
                ${rows.length ? rows.map((item) => {
            const jp = item.jp || '';
            const en = item.en || '';
            const grammarPoint = parseGrammarPoint(en);
            const explanation = stripGrammarPoint(en);
            return `
                        <div class="grid gap-1 border-b border-gray-200 px-1 py-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:gap-6 md:px-0 md:items-start">
                            <div class="min-w-0">
                                <div class="text-[11px] font-semibold tracking-[0.08em] text-gray-400">${escapeHTML(grammarPoint)}</div>
                            </div>
                            <div class="min-w-0">
                                <div class="text-sm font-medium text-gray-700 whitespace-pre-line leading-relaxed break-words">${escapeHTML(jp)}</div>
                                <div class="mt-1 text-xs text-gray-500 leading-relaxed break-words">${escapeHTML(explanation)}</div>
                            </div>
                        </div>
                    `;
        }).join('') : '<p class="py-8 text-center text-gray-400">No grammar points found yet.</p>'}
            </div>
        `;
    }

    function openGrammarCorner() {
        renderGrammarCorner();
        openDialog(document.getElementById('grammar-corner-modal'), {
            initialFocusSelector: '#grammar-point-input',
            labelId: 'grammar-corner-title'
        });
    }

    function closeGrammarCorner() {
        closeDialog(document.getElementById('grammar-corner-modal'));
    }

    // --- DICTIONARY MODAL ---
    function openDictionary(initialWord = '') {
        const modal = document.getElementById('dictionary-modal') || document.getElementById('dict-modal');
        const input = document.getElementById('dict-search-input');
        if (!modal || !input) return;
        if (initialWord) {
            input.value = initialWord;
            lookupWord();
        }
        openDialog(modal, {
            initialFocusSelector: '#dict-search-input',
            labelId: document.getElementById('dictionary-modal-title') ? 'dictionary-modal-title' : 'dict-modal-title'
        });
    }

    function closeDictionary() {
        const modal = document.getElementById('dictionary-modal') || document.getElementById('dict-modal');
        if (modal) closeDialog(modal);
    }

    async function lookupWord() {
        const input = document.getElementById('dict-search-input');
        const word = input?.value.trim();
        if (!word) return;
        const results = document.getElementById('dict-results');
        if (!results) return;

        results.innerHTML = '<p class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin mr-2"></i>Searching...</p>';
        try {
            const data = await window.StudioAPI.lookupWord(word);
            if (data.error) {
                results.innerHTML = `<p class="text-red-500 text-center py-8">${escapeHTML(data.error)}</p>`;
                return;
            }
            if (!data.data || data.data.length === 0) {
                results.innerHTML = '<p class="text-gray-400 text-center py-8">No results found</p>';
                return;
            }
            const entry = data.data[0];
            const wordText = entry.japanese[0]?.word || entry.japanese[0]?.reading || '';
            const reading = entry.japanese[0]?.reading || '';
            const meanings = entry.senses.map(s => s.english_definitions.join(', ')).slice(0, 5);
            results.innerHTML = `
                <div class="space-y-4">
                    <div class="flex items-center gap-4">
                        <span class="text-4xl font-bold text-gray-800">${escapeHTML(wordText)}</span>
                        <button onclick="window.StudioConfigs.nihongo.speakText('${escapeAttr(wordText)}')" 
                            type="button" aria-label="Play pronunciation for ${escapeAttr(wordText)}"
                            class="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-50 transition">
                            <i class="fas fa-volume-up text-xl"></i>
                        </button>
                    </div>
                    ${reading && reading !== wordText ? `<p class="text-xl text-gray-500">${escapeHTML(reading)}</p>` : ''}
                    <div class="space-y-2 pt-2 border-t border-gray-100">
                        ${meanings.map((m, i) => `<p class="text-gray-700"><span class="text-blue-400 font-bold mr-2">${i + 1}.</span>${escapeHTML(m)}</p>`).join('')}
                    </div>
                </div>`;
        } catch (e) {
            results.innerHTML = `<p class="text-red-500 text-center py-8">Error: ${escapeHTML(e.message)}</p>`;
        }
    }

    function handleSearchKeyup(event) {
        if (event.key === 'Enter') {
            const term = document.getElementById('list-search')?.value.trim();
            if (term) openDictionary(term);
        } else if (window.StudioLibrary?.filterLists) {
            window.StudioLibrary.filterLists();
        }
    }

    // --- KANJI CORNER PICKER MODAL ---
    function showKanjiCornerPicker(kanjiListNames, onStartSession) {
        const overlay = document.getElementById('studio-kanji-picker-overlay');
        if (!overlay) {
            if (onStartSession) onStartSession(kanjiListNames);
            return;
        }

        const loadedLists = window._studio?.getLoadedLists?.() || {};
        const available = (kanjiListNames || []).filter(name => Array.isArray(loadedLists[name]) && loadedLists[name].length > 0);
        if (available.length === 0) {
            showToast('No kanji lists found.', 'warning');
            return;
        }

        const saved = window.StudioLibrary?.getSavedKanjiSelection?.(available) || [];
        const defaultSelection = saved.length > 0 ? saved : [...available];
        const selectedSet = new Set(defaultSelection);

        const listMeta = available.map((name) => {
            const uniqueWords = window.StudioLibrary?.getKanjiWordsForListNames?.(loadedLists, [name]) || [];
            const totalCount = uniqueWords.length;
            const dueCount = uniqueWords.filter(word => !window.StudioLibrary?.isMastered?.(word)).length;
            const masteredCount = Math.max(0, totalCount - dueCount);
            const packNumber = window.StudioLibrary?.getKanjiPackNumber?.(name);
            return {
                name,
                dueCount,
                totalCount,
                masteredCount,
                packNumber,
                categoryLabel: window.StudioLibrary?.getKanjiCategoryLabel?.(name)
            };
        });

        const metaByName = new Map(listMeta.map((item) => [item.name, item]));
        const groupedRows = (window.StudioLibrary?.groupKanjiListNamesByCategory?.(available) || []).map((group, groupIndex) => {
            const packs = group.names.map((name) => metaByName.get(name)).filter(Boolean);
            const groupDue = packs.reduce((sum, pack) => sum + pack.dueCount, 0);
            const groupTotal = packs.reduce((sum, pack) => sum + pack.totalCount, 0);
            const groupSummary = `${groupDue} due · ${groupTotal} cards`;

            const rows = packs.map((pack) => {
                const packLabel = pack.packNumber !== null
                    ? `Pack ${String(pack.packNumber).padStart(2, '0')}`
                    : 'Kanji Pack';
                return `
                    <label class="kanji-picker-row ${pack.dueCount === 0 ? 'is-mastered' : ''}">
                        <input
                            type="checkbox"
                            class="kanji-picker-checkbox"
                            value="${escapeAttr(pack.name)}"
                            data-category-index="${groupIndex}"
                            data-due="${pack.dueCount}"
                            data-total="${pack.totalCount}"
                            ${selectedSet.has(pack.name) ? 'checked' : ''}
                        >
                        <span class="kanji-picker-main">
                            <span class="kanji-picker-title" title="${escapeAttr(pack.name)}">${escapeHTML(pack.name)}</span>
                            <span class="kanji-picker-sub">${packLabel} · ${pack.masteredCount}/${pack.totalCount} mastered</span>
                        </span>
                        <span class="kanji-picker-meta ${pack.dueCount === 0 ? 'is-quiet' : ''}">${pack.dueCount} due</span>
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
                        <button type="button" class="kanji-picker-group-action" data-category-index="${groupIndex}">Select group</button>
                    </div>
                    <div class="kanji-picker-group-list">${rows}</div>
                </section>
            `;
        }).join('');

        overlay.innerHTML = `
            <div class="studio-panel">
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
                <p class="kanji-picker-intro">Pick one or more 5-kanji packs for this run. Due items are asked first.</p>
                <div class="kanji-picker-toolbar">
                    <button type="button" id="kanji-picker-all" class="kanji-picker-toolbar-btn">Select all</button>
                    <button type="button" id="kanji-picker-none" class="kanji-picker-toolbar-btn">Clear</button>
                    <button type="button" id="kanji-picker-due-only" class="kanji-picker-toolbar-btn">Only due packs</button>
                </div>
                <div class="kanji-picker-groups">${groupedRows}</div>
            </div>
            <div class="kanji-picker-footer">
                <div id="kanji-picker-summary" class="kanji-picker-summary">0 packs selected</div>
                <div class="kanji-picker-footer-actions">
                    <button type="button" id="kanji-picker-cancel" class="kanji-picker-cancel-btn">Cancel</button>
                    <button type="button" id="kanji-picker-start" class="kanji-picker-start-btn">Start Practice</button>
                </div>
            </div>
            </div>
        `;

        const checkboxes = Array.from(overlay.querySelectorAll('.kanji-picker-checkbox'));
        const summaryEl = overlay.querySelector('#kanji-picker-summary');
        const startBtn = overlay.querySelector('#kanji-picker-start');

        const updateSummary = () => {
            const checked = checkboxes.filter(cb => cb.checked);
            const packCount = checked.length;
            const dueTotal = checked.reduce((sum, cb) => sum + (Number(cb.dataset.due) || 0), 0);
            const cardTotal = checked.reduce((sum, cb) => sum + (Number(cb.dataset.total) || 0), 0);
            summaryEl.textContent = `${packCount} pack${packCount === 1 ? '' : 's'} · ${dueTotal} due (${cardTotal} total)`;
            startBtn.disabled = packCount === 0;
        };

        checkboxes.forEach(cb => cb.addEventListener('change', updateSummary));
        updateSummary();

        overlay.querySelector('#kanji-picker-close')?.addEventListener('click', () => closeDialog(overlay));
        overlay.querySelector('#kanji-picker-cancel')?.addEventListener('click', () => closeDialog(overlay));
        overlay.querySelector('#kanji-picker-all')?.addEventListener('click', () => {
            checkboxes.forEach(cb => { cb.checked = true; });
            updateSummary();
        });
        overlay.querySelector('#kanji-picker-none')?.addEventListener('click', () => {
            checkboxes.forEach(cb => { cb.checked = false; });
            updateSummary();
        });
        overlay.querySelector('#kanji-picker-due-only')?.addEventListener('click', () => {
            checkboxes.forEach(cb => { cb.checked = (Number(cb.dataset.due) || 0) > 0; });
            updateSummary();
        });

        overlay.querySelectorAll('.kanji-picker-group-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const groupIdx = btn.dataset.categoryIndex;
                const groupCbs = checkboxes.filter(cb => cb.dataset.categoryIndex === groupIdx);
                const allSelected = groupCbs.every(cb => cb.checked);
                groupCbs.forEach(cb => { cb.checked = !allSelected; });
                updateSummary();
            });
        });

        startBtn.addEventListener('click', () => {
            const chosen = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
            if (chosen.length === 0) return;
            window.StudioLibrary?.saveKanjiSelection?.(chosen);
            closeDialog(overlay);
            if (onStartSession) onStartSession(chosen);
        });

        openDialog(overlay, {
            initialFocusSelector: '#kanji-picker-start',
            labelId: 'studio-kanji-picker-title'
        });
    }

    // --- DARK MODE ---
    function initDarkMode() {
        const isDark = localStorage.getItem('studio_dark_mode') === 'true';
        if (isDark) document.body.classList.add('dark');
        const cb = document.getElementById('dark-mode-checkbox');
        if (cb) cb.checked = isDark;
    }

    function toggleDarkMode() {
        document.body.classList.toggle('dark');
        const isDark = document.body.classList.contains('dark');
        localStorage.setItem('studio_dark_mode', isDark);
        const cb = document.getElementById('dark-mode-checkbox');
        if (cb) cb.checked = isDark;
    }

    return {
        openDialog,
        closeDialog,
        isDialogOpen,
        showToast,
        getScoreTone,
        ensureConfettiLoaded,
        showResultsScreen,
        showStats,
        closeStats,
        openStatsModal: showStats,
        closeStatsModal: closeStats,
        openGrammarCorner,
        closeGrammarCorner,
        renderGrammarCorner,
        saveGrammarEntry,
        openDictionary,
        closeDictionary,
        lookupWord,
        handleSearchKeyup,
        showKanjiCornerPicker,
        initDarkMode,
        toggleDarkMode,
        escapeHTML,
        escapeAttr
    };
})();
