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
    let sessionResults = [];

    let isPurificationSession = false;
    let gauntletLives = 3;

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
        initDarkMode();
        setupKeyboardShortcuts();
        if (config.favicon) setFavicon(config.favicon);

        // Default to the harder production direction on every fresh load.
        const modeSelect = document.getElementById('global-quiz-mode');
        if (modeSelect) modeSelect.value = 'en-jp';

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
        if (ro) ro.classList.add('hidden');
        if (so) so.classList.add('hidden');
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
            const [lRes, sRes, statsRes] = await Promise.all([
                fetch(config.apiUrl + '&action=get_lists&t=' + Date.now()),
                fetch(config.apiUrl + '&action=get_scores&t=' + Date.now()),
                fetch(config.apiUrl + '&action=get_word_stats&t=' + Date.now())
            ]);
            loadedLists = await lRes.json();
            // Normalize: accept "id" key as alias for "jp" (Bahasa organized lists use "id")
            Object.keys(loadedLists).forEach(name => {
                loadedLists[name] = loadedLists[name].map(w =>
                    (!w.jp && w.id) ? { jp: w.id, en: w.en } : w
                );
            });
            loadedScores = await sRes.json();
            wordStats = await statsRes.json();

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
        tbody.innerHTML = '';
        let count = 0;
        const currentMode = document.getElementById('global-quiz-mode').value;

        // --- SMART REVIEW ROW ---
        let allUniqueWords = [];
        let uniqueCheck = new Set();
        Object.values(lists).forEach(l => l.forEach(w => {
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
            tbody.innerHTML += `
            <tr class="border-b border-gray-100 transition cursor-default bg-blue-50/50 hover:bg-blue-500 group">
                <td class="p-3 pl-6 font-bold text-blue-600 group-hover:text-white"><i class="fas fa-brain mr-3"></i>Smart Review</td>
                <td class="p-3 text-blue-600 group-hover:text-white font-medium">${sessionBatch.length} words</td>
                <td class="p-3 text-blue-400 group-hover:text-white text-xs hidden md:table-cell">--</td>
                <td class="p-3 hidden md:table-cell"><div class="flex items-center gap-2"><div class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse border border-blue-600"></div><span class="text-blue-600 group-hover:text-white text-xs font-bold uppercase"></span></div></td>
                <td class="p-3 pr-6 text-right"><button onclick="startSmartReview()" class="bg-blue-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-sm group-hover:bg-white group-hover:text-blue-600 transition">Start Session</button></td>
            </tr>`;
        }

        // --- CUSTOM TABLE EXTRAS (e.g. Hantu Hunt for Bahasa) ---
        if (config.renderTableExtras) {
            const extraHTML = config.renderTableExtras(lists, allUniqueWords, wordStats);
            if (extraHTML) tbody.innerHTML += extraHTML;
        }

        // --- MAIN LISTS ---
        const sortedKeys = Object.keys(lists).sort((a, b) => {
            const getTs = (key) => {
                if (!scores[key]) return 0;
                if (typeof scores[key] === 'object') return scores[key].last_activity || 0;
                return 0;
            };
            return getTs(b) - getTs(a);
        });

        sortedKeys.forEach(name => {
            count++;
            const words = lists[name];
            let jpScore = 0; let enScore = 0; let speechScore = 0;
            if (scores[name]) {
                if (typeof scores[name] === 'object') {
                    jpScore = scores[name]['jp-en'] || 0;
                    enScore = scores[name]['en-jp'] || 0;
                    speechScore = scores[name]['speech'] || 0;
                } else { jpScore = scores[name]; }
            }

            let badgeHTML = ''; let dotColor = "bg-gray-300"; let statusText = "New";
            if (currentMode === 'jp-en') {
                badgeHTML = `<span class="badge bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">${jpScore}%</span>`;
                if (jpScore > 80) { dotColor = "bg-green-500"; statusText = "Mastered"; } else if (jpScore > 0) { dotColor = "bg-yellow-400"; statusText = "Learning"; }
            } else if (currentMode === 'en-jp') {
                badgeHTML = `<span class="badge bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">${enScore}%</span>`;
                if (enScore > 80) { dotColor = "bg-green-500"; statusText = "Mastered"; } else if (enScore > 0) { dotColor = "bg-yellow-400"; statusText = "Learning"; }
            } else if (currentMode === 'speech') {
                badgeHTML = `<span class="badge bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">${speechScore}%</span>`;
                if (speechScore > 80) { dotColor = "bg-green-500"; statusText = "Mastered"; } else if (speechScore > 0) { dotColor = "bg-yellow-400"; statusText = "Learning"; }
            }

            // Build action buttons — training only for nihongo
            const safeName = escapeAttr(name);
            let actionButtons = `
                <button onclick="editList('${safeName}')" class="text-gray-400 hover:text-blue-600 transition" title="Edit"><i class="fas fa-edit"></i></button>
                <button onclick="deleteList('${safeName}')" class="text-gray-400 hover:text-red-500 transition" title="Delete"><i class="fas fa-trash"></i></button>`;

            if (config.startTraining) {
                actionButtons += `
                <button onclick="startTraining('${safeName}')" class="text-gray-400 hover:text-green-600 transition" title="Training"><i class="fas fa-dumbbell"></i></button>`;
            }

            actionButtons += `
                <button onclick="startQuiz('${safeName}')" class="text-blue-600 font-bold hover:underline">Start Quiz</button>`;

            tbody.innerHTML += `
            <tr class="border-b border-gray-100 transition cursor-default group">
                <td class="p-3 pl-6 font-medium text-gray-800"><i class="fas fa-list-ul mr-3 text-gray-400 group-hover:text-white"></i>${escapeHTML(name)}</td>
                <td class="p-3 text-gray-500">${words.length} words</td>
                <td class="p-3 hidden md:table-cell">${badgeHTML}</td>
                <td class="p-3 hidden md:table-cell"><div class="flex items-center gap-2"><div class="w-2.5 h-2.5 rounded-full ${dotColor} shadow-sm"></div><span class="text-gray-500">${statusText}</span></div></td>
                <td class="p-3 pr-6 text-right font-mono text-xs flex justify-end items-center gap-4">
                    ${actionButtons}
                </td>
            </tr>`;
        });

        // Update footer counts
        let uniqueWords = new Set();
        Object.values(lists).forEach(wl => { wl.forEach(w => uniqueWords.add(w.jp)); });
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
        Object.values(loadedLists).forEach(l => {
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

        Object.values(loadedLists).forEach(list => {
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

    function startNeedsWork() {
        closeStats();
        currentListName = "Practice Focus";
        // Normal retry loop — wrong words re-queue, no hearts/gauntlet
        isPurificationSession = false;

        const allWords = [];
        const seen = new Set();
        Object.values(loadedLists).forEach(list => {
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

    function startSession() {
        currentIndex = 0; score = 0; sessionResults = [];
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

        let mode = document.getElementById('global-quiz-mode').value;
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
            document.getElementById('quiz-mode-label').innerText = "Translating";
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

        let mode = document.getElementById('global-quiz-mode').value;
        if (isPurificationSession) mode = 'en-jp';

        const pair = wordList[currentIndex];
        let correct = (mode === 'jp-en') ? pair.en : pair.jp;
        let user = (spokenText !== null) ? spokenText : document.getElementById('answer-input').value;

        // Delegate matching to language-specific logic
        let match = false;
        if (config.checkAnswerMatch) {
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

    function getStoredAdminPassword(forcePrompt = false) {
        const storageKey = 'studio_admin_password';
        let password = '';

        if (!forcePrompt) {
            try {
                password = sessionStorage.getItem(storageKey) || '';
            } catch (e) {
                password = '';
            }
        }

        if (!password) {
            password = window.prompt('Admin password required to manage language lists:') || '';
            password = password.trim();
        }

        if (password) {
            try {
                sessionStorage.setItem(storageKey, password);
            } catch (e) { }
        }

        return password;
    }

    function clearStoredAdminPassword() {
        try {
            sessionStorage.removeItem('studio_admin_password');
        } catch (e) { }
    }

    function handleAdminRequestError(error, fallbackMessage) {
        const message = error?.message || fallbackMessage;
        if (/unauthorized|password/i.test(message)) {
            clearStoredAdminPassword();
        }
        showToast(message || fallbackMessage, 'error');
    }

    // =========================================================
    // FINISH QUIZ
    // =========================================================
    async function finishQuiz() {
        const pct = Math.round((score / wordList.length) * 100);
        document.getElementById('progress-bar').style.width = "100%";
        const mode = document.getElementById('global-quiz-mode').value;

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
        if (pct === 100 && typeof confetti === 'function') {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
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

        const scoreColor = pct >= 80 ? '#34c759' : (pct >= 50 ? '#ff9f0a' : '#ff3b30');

        let wrongHTML = '';
        if (wrongWords.length > 0) {
            wrongHTML = `
                <div class="results-wrong-list">
                    <div style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.08em; color:#8e8e93; font-weight:600; margin-bottom:0.5rem;">
                        Missed ${wrongWords.length}
                    </div>
                    ${wrongWords.map(w => `
                        <div class="results-wrong-item">
                            <span>${escapeHTML(w.jp)}</span>
                            <span class="correct-answer">${escapeHTML(w.en)}</span>
                        </div>
                    `).join('')}
                </div>`;
        }

        overlay.innerHTML = `
            <div style="text-align:center; padding-top:3rem; max-width:440px; width:100%;">
                <div class="results-score" style="color:${scoreColor}">${pct}%</div>
                <div style="font-size:0.8rem; color:#8e8e93; font-weight:400; margin-top:0.25rem;">${escapeHTML(currentListName)} · ${mode.toUpperCase()}</div>
                ${wrongHTML}
                <button onclick="document.getElementById('studio-results-overlay').classList.add('hidden'); showSection('select');"
                    style="margin-top:2rem; padding:0.5rem 1.5rem; background:none; border:1px solid #d1d5db; border-radius:980px; font-size:0.8rem; font-weight:500; color:#3b82f6; cursor:pointer; transition:all 0.15s;">
                    Done
                </button>
            </div>
        `;

        overlay.classList.remove('hidden');
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
        const password = getStoredAdminPassword();
        if (!password) {
            showToast("Admin password is required to delete lists", "warning");
            return;
        }
        try {
            await apiFetch(config.apiUrl + '&action=delete_list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, password })
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
        const name = document.getElementById('list-name-input').value.trim();
        const text = document.getElementById('word-input').value;
        if (!name || !text) return;
        const password = getStoredAdminPassword();
        if (!password) {
            showToast("Admin password is required to save lists", "warning");
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

        try {
            if (editingOriginalName && editingOriginalName !== name) {
                await apiFetch(config.apiUrl + '&action=delete_list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: editingOriginalName, password })
                });
            }
            await apiFetch(config.apiUrl + '&action=save_list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, words, password })
            });

            // Reload lists after saving
            fetchLists();
            showSection('select');
        } catch (e) {
            console.error(e);
            handleAdminRequestError(e, "Failed to save list");
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

        const sparklineHTML = recentScores.length > 1 ? `
            <div class="sparkline-container">
                ${recentScores.map(s => {
            const h = Math.max(3, (s.score / 100) * 28);
            const color = s.score >= 80 ? '#34c759' : (s.score >= 50 ? '#ff9f0a' : '#ff3b30');
            return `<div class="sparkline-bar" style="height:${h}px;background:${color};"></div>`;
        }).join('')}
            </div>` : '';

        const sessionsHTML = history.slice(0, 8).map(s => {
            const d = new Date(s.date);
            const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            const scoreColor = s.score >= 80 ? '#34c759' : (s.score >= 50 ? '#ff9f0a' : '#ff3b30');
            return `<div class="session-item">
                <span>${escapeHTML(s.listName)}</span>
                <span style="color:${scoreColor};font-weight:500;">${s.score}%</span>
                <span style="color:#8e8e93;font-size:0.7rem;">${dateStr}</span>
            </div>`;
        }).join('');

        const weakHTML = weakWords.slice(0, 10).map(w => `
            <tr>
                <td>${escapeHTML(w.word.jp)}</td>
                <td style="color:#8e8e93;">${escapeHTML(w.word.en)}</td>
                <td style="color:${w.accuracy >= 50 ? '#ff9f0a' : '#ff3b30'};font-weight:500;">${w.accuracy}%</td>
                <td style="color:#8e8e93;">${w.total}</td>
            </tr>
        `).join('');

        overlay.innerHTML = `
            <div class="stats-header">
                <span style="font-weight:600;font-size:0.85rem;color:#8e8e93;">Stats</span>
                <button onclick="closeStats()" style="color:#8e8e93;font-size:1rem;cursor:pointer;background:none;border:none;padding:0;">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" style="color:#3b82f6;">${allWords.length}</div>
                    <div class="stat-label">Words</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color:#34c759;">${totalMastered}</div>
                    <div class="stat-label">Mastered</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color:#ff9f0a;">${totalLearning}</div>
                    <div class="stat-label">Learning</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color:${avgAccuracy >= 70 ? '#34c759' : '#ff9f0a'};">${avgAccuracy}%</div>
                    <div class="stat-label">Accuracy</div>
                </div>
            </div>

            <div class="stats-section">
                <div class="mastery-bar">
                    <div class="bar-mastered" style="width:${masteredPct}%"></div>
                    <div class="bar-learning" style="width:${learningPct}%"></div>
                </div>
            </div>

            ${recentScores.length > 1 ? `<div class="stats-section"><div class="stats-label">Recent</div>${sparklineHTML}</div>` : ''}

            ${weakWords.length > 0 ? `
            <div class="stats-section">
                <div class="stats-label" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span>Needs Work</span>
                    <button onclick="startNeedsWork()" class="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-indigo-100 transition shadow-sm" style="display:flex; align-items:center; gap:6px; cursor:pointer;">
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

        overlay.classList.remove('hidden');
    }

    function closeStats() {
        const overlay = document.getElementById('studio-stats-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    // =========================================================
    // KEYBOARD SHORTCUTS
    // =========================================================
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
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
                    if (resultsOverlay && !resultsOverlay.classList.contains('hidden')) {
                        resultsOverlay.classList.add('hidden');
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
        // Find the header bar (first child of mac-window)
        const header = document.querySelector('.mac-window > div:first-child');
        if (!header) return;

        // Left side: Stats icon
        const leftSlot = header.querySelector('div:first-child');
        if (leftSlot) {
            leftSlot.innerHTML = '';
            leftSlot.style.display = 'flex';
            leftSlot.style.alignItems = 'center';
            const statsBtn = document.createElement('button');
            statsBtn.className = 'header-icon-btn';
            statsBtn.onclick = () => showStats();
            statsBtn.title = 'Stats (S)';
            statsBtn.innerHTML = '<i class="fas fa-chart-pie"></i>';
            leftSlot.appendChild(statsBtn);
        }

        // Right side: Dark mode toggle
        const rightSlot = header.querySelector('div:last-child');
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
                <input type="checkbox" id="dark-mode-checkbox" ${isDark ? 'checked' : ''}>
                <span class="slider"></span>
            `;
            toggleLabel.querySelector('input').addEventListener('change', toggleDarkMode);
            rightSlot.appendChild(toggleLabel);
        }
    }

    function injectOverlays() {
        const contentArea = document.querySelector('.flex-1.overflow-hidden.bg-white.relative');
        if (!contentArea) return;

        // Results overlay
        const resultsOverlay = document.createElement('div');
        resultsOverlay.id = 'studio-results-overlay';
        resultsOverlay.className = 'studio-results-overlay hidden';
        contentArea.appendChild(resultsOverlay);

        // Stats overlay
        const statsOverlay = document.createElement('div');
        statsOverlay.id = 'studio-stats-overlay';
        statsOverlay.className = 'studio-stats-overlay hidden';
        contentArea.appendChild(statsOverlay);
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
