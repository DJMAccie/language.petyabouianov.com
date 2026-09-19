/**
 * studio-quiz.js: Stateful, Policy-Driven Quiz Engine for Nihongo Studio
 */
window.StudioQuiz = (() => {
    let wordList = [];
    let currentIndex = 0;
    let score = 0;
    let gauntletLives = 3;
    let isProcessing = false;
    let sessionResults = [];
    let sessionInitialWordCount = 0;

    let currentListName = '';
    let sessionModeOverride = null;
    let sessionAnswerMatcher = null;
    let sessionLabelOverride = null;
    let sessionIsKanji = false;
    let kanjiHintVisible = false;
    let isPurificationSession = false;
    let requueWrong = true;
    let persistScore = true;
    let sessionKind = 'standard';
    let onSessionComplete = null;
    let onSessionQuit = null;

    function getWordList() {
        return wordList;
    }

    function getCurrentIndex() {
        return currentIndex;
    }

    function getCurrentPair() {
        return wordList[currentIndex] || null;
    }

    function getStoredStreak() {
        const config = window.StudioAPI?.getConfig?.() || {};
        const prefix = config.streakKey || 'studio';
        return Math.max(0, Number.parseInt(localStorage.getItem(`${prefix}_streak`) || '0', 10) || 0);
    }

    // Distinct days with at least one finished session. Unlike the streak this is
    // never reset, so it only ever grows.
    function getStoredStudyDays() {
        const config = window.StudioAPI?.getConfig?.() || {};
        const prefix = config.streakKey || 'studio';
        return Math.max(0, Number.parseInt(localStorage.getItem(`${prefix}_study_days`) || '0', 10) || 0);
    }

    function checkStreak() {
        const config = window.StudioAPI?.getConfig?.() || {};
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
        const config = window.StudioAPI?.getConfig?.() || {};
        const prefix = config.streakKey || 'studio';
        const today = new Date().toLocaleDateString('en-CA');
        const lastDate = localStorage.getItem(`${prefix}_last_study_date`);
        let streak = parseInt(localStorage.getItem(`${prefix}_streak`) || 0);
        if (lastDate !== today) {
            const diff = !lastDate ? 1 : Math.ceil(Math.abs(new Date(today) - new Date(lastDate)) / (1000 * 60 * 60 * 24));
            streak = (diff === 1) ? streak + 1 : 1;
            localStorage.setItem(`${prefix}_streak`, streak);
            localStorage.setItem(`${prefix}_last_study_date`, today);
            // First session of the day also counts as a day studied.
            localStorage.setItem(`${prefix}_study_days`, getStoredStudyDays() + 1);
        }
        updateStreakUI(streak);
    }

    function updateStreakUI(streak) {
        const text = document.getElementById('streak-text');
        const icon = document.getElementById('streak-icon');
        if (text) text.innerText = `${streak} Day Streak`;
        if (icon) icon.className = `fas fa-fire transition-colors ${streak > 0 ? 'text-orange-400' : 'text-gray-300'}`;
    }

    function getSessionHistory() {
        const config = window.StudioAPI?.getConfig?.() || {};
        const prefix = config.streakKey || 'studio';
        try {
            return JSON.parse(localStorage.getItem(`${prefix}_session_history`) || '[]');
        } catch { return []; }
    }

    function saveSessionHistory(session) {
        const config = window.StudioAPI?.getConfig?.() || {};
        const prefix = config.streakKey || 'studio';
        const history = getSessionHistory();
        history.unshift(session);
        if (history.length > 50) history.length = 50;
        try {
            localStorage.setItem(`${prefix}_session_history`, JSON.stringify(history));
        } catch { }
    }

    function startSession(options = {}) {
        wordList = Array.isArray(options.words) ? [...options.words] : [];
        currentIndex = 0;
        score = 0;
        sessionResults = [];
        gauntletLives = 3;
        isProcessing = false;

        currentListName = options.listName || 'Practice';
        sessionKind = options.sessionKind || 'standard';
        sessionModeOverride = options.modeOverride || null;
        sessionLabelOverride = options.labelOverride || null;
        sessionAnswerMatcher = typeof options.answerMatcher === 'function' ? options.answerMatcher : null;
        sessionIsKanji = !!options.isKanjiSession;
        kanjiHintVisible = false;
        isPurificationSession = !!options.isPurification;

        requeueWrong = options.requeueWrong !== undefined
            ? !!options.requeueWrong
            : (sessionKind !== 'daily-lesson' && sessionKind !== 'daily-review');

        persistScore = options.persistScore !== undefined
            ? !!options.persistScore
            : (sessionKind !== 'daily-lesson' && sessionKind !== 'daily-review');

        onSessionComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
        onSessionQuit = typeof options.onQuit === 'function' ? options.onQuit : null;

        sessionInitialWordCount = new Set(wordList.map(w => w?.jp).filter(Boolean)).size;

        window.StudioCore?.showSection('quiz');
        showCard();
    }

    function showCard() {
        if (currentIndex >= wordList.length) return finishQuiz();
        const pct = (currentIndex / wordList.length) * 100;
        const progressBar = document.getElementById('progress-bar');
        const countText = document.getElementById('current-count-text');
        if (progressBar) progressBar.style.width = pct + "%";
        if (countText) countText.innerText = `${currentIndex + 1} / ${wordList.length}`;

        const config = window.StudioAPI?.getConfig?.() || {};
        const globalMode = document.getElementById('global-quiz-mode')?.value || 'en-jp';
        let mode = sessionModeOverride || globalMode;

        const heartsContainer = document.getElementById('hearts-container');
        const textInput = document.getElementById('text-input-container');
        const speechControls = document.getElementById('speech-controls');
        let choiceContainer = document.getElementById('choice-container');

        if (!choiceContainer && textInput?.parentElement) {
            choiceContainer = document.createElement('div');
            choiceContainer.id = 'choice-container';
            choiceContainer.className = 'hidden';
            textInput.parentElement.insertBefore(choiceContainer, textInput.nextSibling);
        }

        const pair = wordList[currentIndex];
        const modeLabel = document.getElementById('quiz-mode-label');

        if (isPurificationSession) {
            mode = 'en-jp';
            if (modeLabel) {
                modeLabel.innerText = config.gauntletLabel || "GAUNTLET (EN → Target)";
                modeLabel.classList.add('text-red-500');
            }
            heartsContainer?.classList.remove('hidden');
            renderHearts();
            textInput?.classList.remove('hidden');
            speechControls?.classList.add('hidden');
            choiceContainer?.classList.add('hidden');
        } else if (mode === 'choice') {
            if (modeLabel) {
                modeLabel.innerText = sessionLabelOverride || "Multiple Choice";
                modeLabel.classList.remove('text-red-500');
            }
            heartsContainer?.classList.add('hidden');
            textInput?.classList.add('hidden');
            speechControls?.classList.add('hidden');
            choiceContainer?.classList.remove('hidden');

            const correctAnswer = pair.en;
            const loadedLists = window._studio?.getLoadedLists?.() || {};
            const allAnswers = [];
            const seen = new Set([correctAnswer.toLowerCase()]);
            Object.values(loadedLists).forEach(list => {
                if (Array.isArray(list)) {
                    list.forEach(w => {
                        if (w?.en && !seen.has(w.en.toLowerCase())) {
                            allAnswers.push(w.en);
                            seen.add(w.en.toLowerCase());
                        }
                    });
                }
            });

            const distractors = [];
            const pool = [...allAnswers];
            for (let i = 0; i < 3 && pool.length > 0; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                distractors.push(pool.splice(idx, 1)[0]);
            }

            const options = [correctAnswer, ...distractors].sort(() => Math.random() - 0.5);

            if (choiceContainer) {
                choiceContainer.innerHTML = `<div class="choice-grid">${options.map(opt =>
                    `<button class="choice-btn" onclick="window.StudioQuiz.handleChoice(this, ${opt === correctAnswer})">${window.StudioUI?.escapeHTML(opt)}</button>`
                ).join('')}</div>`;
            }
        } else if (mode === 'speech') {
            if (modeLabel) {
                modeLabel.innerText = config.speechLabel || "SPEAKING";
                modeLabel.classList.remove('text-red-500');
            }
            heartsContainer?.classList.add('hidden');
            textInput?.classList.add('hidden');
            speechControls?.classList.remove('hidden');
            choiceContainer?.classList.add('hidden');
            const status = document.getElementById('speech-status');
            if (status) status.innerText = config.speechPrompt || "Click mic to speak";
            if (config.updateMicState) config.updateMicState('idle');
        } else {
            if (modeLabel) {
                modeLabel.innerText = sessionLabelOverride || "Translating";
                modeLabel.classList.remove('text-red-500');
            }
            heartsContainer?.classList.add('hidden');
            textInput?.classList.remove('hidden');
            speechControls?.classList.add('hidden');
            choiceContainer?.classList.add('hidden');
        }

        const questionWord = document.getElementById('question-word');
        if (questionWord) {
            if (mode === 'choice') {
                questionWord.innerText = pair.jp;
            } else {
                questionWord.innerText = (mode === 'jp-en') ? pair.jp : pair.en;
            }
        }

        const input = document.getElementById('answer-input');
        if (input) {
            input.value = '';
            input.disabled = false;
            if (mode !== 'speech' && mode !== 'choice') input.focus();
        }

        const feedback = document.getElementById('feedback');
        if (feedback) feedback.style.opacity = '0';

        updateKanjiHintView(false);
        isProcessing = false;
    }

    function handleChoice(btn, isCorrect) {
        if (isProcessing) return;
        isProcessing = true;

        const choiceContainer = document.getElementById('choice-container');
        if (choiceContainer) {
            choiceContainer.querySelectorAll('.choice-btn').forEach(b => { b.disabled = true; });
        }

        const pair = wordList[currentIndex];
        const correctAnswer = pair?.en || '';

        if (isCorrect) {
            btn.classList.add('correct');
        } else {
            btn.classList.add('wrong');
            if (choiceContainer) {
                choiceContainer.querySelectorAll('.choice-btn').forEach(b => {
                    if (b.textContent === correctAnswer) b.classList.add('correct');
                });
            }
        }

        finishAnswerCheck(isCorrect, correctAnswer);
    }

    function renderHearts() {
        const container = document.getElementById('hearts-container');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            container.innerHTML += (i < gauntletLives)
                ? `<i class="fas fa-heart text-red-500 text-2xl animate-pulse"></i>`
                : `<i class="fas fa-heart-broken text-gray-300 text-2xl"></i>`;
        }
    }

    function checkAnswer(spokenText = null) {
        if (isProcessing) return;
        isProcessing = true;

        const config = window.StudioAPI?.getConfig?.() || {};
        const globalMode = document.getElementById('global-quiz-mode')?.value || 'en-jp';
        let mode = sessionModeOverride || globalMode;
        if (isPurificationSession) mode = 'en-jp';

        const pair = wordList[currentIndex];
        if (!pair) return;

        let correct = (mode === 'jp-en') ? pair.en : pair.jp;
        let user = (spokenText !== null) ? spokenText : (document.getElementById('answer-input')?.value || '');

        let match = false;
        if (sessionAnswerMatcher) {
            match = sessionAnswerMatcher(user, pair, mode);
        } else if (config.checkAnswerMatch) {
            match = config.checkAnswerMatch(user, correct, mode, pair);
        } else {
            const nUser = config.normalize ? config.normalize(user) : user.toLowerCase().replace(/\s+/g, '');
            const nCorrect = config.normalize ? config.normalize(correct) : correct.toLowerCase().replace(/\s+/g, '');
            const minLength = nCorrect.length <= 2 ? 1 : 2;
            match = nUser.length >= minLength && nCorrect.includes(nUser);
        }

        finishAnswerCheck(match, correct);
    }

    function finishAnswerCheck(match, correctText) {
        const pair = wordList[currentIndex];
        const config = window.StudioAPI?.getConfig?.() || {};
        sessionResults.push({ word: pair.jp, correct: match });

        const fb = document.getElementById('feedback');
        const input = document.getElementById('answer-input');
        if (fb) fb.style.opacity = '1';

        if (match) {
            if (fb) fb.innerHTML = "<span class='text-green-500'><i class='fas fa-check mr-2'></i>Correct</span>";
            score++;

            if (config.speakText) config.speakText(pair.jp);
            if (input) input.classList.add('border-green-500');

            setTimeout(() => {
                if (input) input.classList.remove('border-green-500');
                currentIndex++;
                showCard();
            }, 1500);
        } else {
            if (fb) {
                fb.innerHTML = `<span class='text-red-500'><i class='fas fa-times mr-2'></i></span>`;
                const errorSpan = document.createElement('span');
                errorSpan.className = 'text-red-500';
                errorSpan.textContent = correctText;
                fb.appendChild(errorSpan);
            }

            if (input) input.classList.add('border-red-500');
            if (sessionIsKanji) {
                toggleKanjiHint(true);
            }

            if (isPurificationSession) {
                gauntletLives--;
                renderHearts();
                if (gauntletLives <= 0) {
                    setTimeout(() => {
                        alert(config.gauntletFailMsg || "Failed! Try again later.");
                        window.StudioCore?.showSection('select');
                    }, 1000);
                    return;
                }
            } else if (requeueWrong) {
                wordList.push(pair);
            }

            setTimeout(() => {
                if (input) input.classList.remove('border-red-500');
                currentIndex++;
                showCard();
            }, 2500);
        }
    }

    async function finishQuiz() {
        const pct = wordList.length > 0 ? Math.round((score / wordList.length) * 100) : 0;
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) progressBar.style.width = "100%";

        const mode = sessionModeOverride || document.getElementById('global-quiz-mode')?.value || 'en-jp';
        let sessionEvent = null;

        if (window.StudioAPI?.isOfflineSyncEnabled()) {
            sessionEvent = window.StudioAPI.buildSessionEvent({
                listName: currentListName,
                mode,
                score: pct,
                results: sessionResults,
                isPurification: isPurificationSession
            });

            const loadedScores = window._studio?.getLoadedScores?.() || {};
            const wordStats = window._studio?.getWordStats?.() || {};
            window.StudioAPI.applySessionLocally(sessionEvent, loadedScores, wordStats);
            await window.StudioAPI.enqueueSyncEvent(sessionEvent);
        }

        if (!window.StudioSession?.isSignedIn?.()) {
            // Guest: nothing goes to the server. Progress is kept in this browser
            // so the review deck and the progress panel still work.
            window.StudioGuest?.recordSession({
                listName: currentListName,
                score: pct,
                mode,
                results: sessionResults,
                isPurification: isPurificationSession
            });

            const guestState = window.StudioGuest?.read?.() || {};
            const loadedScores = window._studio?.getLoadedScores?.() || {};
            const wordStats = window._studio?.getWordStats?.() || {};
            Object.assign(loadedScores, guestState.scores || {});
            Object.assign(wordStats, guestState.stats || {});
            window.StudioLibrary?.renderTable?.(window._studio?.getLoadedLists?.() || {}, loadedScores);
        } else {
            try {
                const apiCalls = [
                    window.StudioAPI?.updateWordStats(sessionResults, isPurificationSession)
                ];
                if (persistScore) {
                    apiCalls.push(window.StudioAPI?.saveScore(currentListName, pct, mode));
                }
                await Promise.all(apiCalls);
            } catch (e) { }
        }

        if (sessionEvent) {
            window.StudioAPI?.flushQueueWhenOnline({ silent: true });
        }

        incrementStreak();

        if (onSessionComplete) {
            onSessionComplete({ score: pct, mode, listName: currentListName });
        }

        saveSessionHistory({
            listName: currentListName,
            mode,
            score: pct,
            wordCount: sessionInitialWordCount || wordList.length,
            date: Date.now()
        });

        if (pct === 100) {
            window.StudioUI?.ensureConfettiLoaded()
                .then((confettiFn) => {
                    if (typeof confettiFn === 'function') {
                        confettiFn({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
                    }
                })
                .catch(() => { });
        }

        const wrongWords = [];
        const wrongSeen = new Set();
        sessionResults.forEach(r => {
            if (!r.correct && !wrongSeen.has(r.word)) {
                wrongSeen.add(r.word);
                const pair = wordList.find(w => w.jp === r.word);
                if (pair) wrongWords.push(pair);
            }
        });

        const doneButtonLabel = sessionKind === 'daily-lesson'
            ? 'Back to today'
            : sessionKind === 'daily-review'
                ? 'Reviews complete'
                : 'Done';

        window.StudioUI?.showResultsScreen({
            pct,
            mode,
            listName: currentListName,
            wrongWords,
            doneButtonLabel,
            onDone: () => quitCurrentSession()
        });

        isPurificationSession = false;
        window.StudioCore?.fetchLists();
    }

    function quitCurrentSession() {
        if (onSessionQuit) {
            onSessionQuit();
        } else if (sessionKind === 'daily-lesson' || sessionKind === 'daily-review') {
            window.StudioCore?.showSection('today');
        } else {
            window.StudioCore?.showSection('select');
        }
    }

    function replayAudio() {
        const pair = wordList[currentIndex];
        const config = window.StudioAPI?.getConfig?.() || {};
        if (pair && config.speakText) config.speakText(pair.jp);
    }

    function activateSpeech() {
        const config = window.StudioAPI?.getConfig?.() || {};
        if (config.activateSpeech) config.activateSpeech();
    }

    function toggleKanjiHint(forceVisible = null) {
        if (typeof forceVisible === 'boolean') {
            kanjiHintVisible = forceVisible;
        } else {
            kanjiHintVisible = !kanjiHintVisible;
        }
        updateKanjiHintView();
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
        const mnemonics = window._studio?.getKanjiMnemonics?.() || {};
        const entry = pair?.jp ? mnemonics[pair.jp] : null;

        const rawMeaning = (pair?.en || '').toString().trim();
        const match = rawMeaning.match(/^\s*\(([^)]+)\)\s*(.*)$/);
        const fallbackReading = match ? match[1].trim() : '';

        const mnemonicText = entry?.mnemonic || 'No mnemonic saved yet for this kanji.';
        const readingText = entry?.reading_cue || (fallbackReading ? `Try saying: ${fallbackReading}` : 'No reading cue saved yet.');
        const contextText = entry?.travel_context || 'No travel context saved yet.';
        const emojiText = entry?.emoji || '🧠';

        mnemonicEl.textContent = mnemonicText;
        readingEl.textContent = readingText;
        contextEl.textContent = contextText;
        emojiEl.textContent = emojiText;

        const imageUrl = entry?.image_url;
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

    return {
        startSession,
        checkAnswer,
        handleChoice,
        finishQuiz,
        quitCurrentSession,
        replayAudio,
        activateSpeech,
        renderHearts,
        toggleKanjiHint,
        updateKanjiHintView,
        getStoredStreak,
        getStoredStudyDays,
        checkStreak,
        incrementStreak,
        updateStreakUI,
        getSessionHistory,
        saveSessionHistory,
        getWordList,
        getCurrentIndex,
        getCurrentPair
    };
})();
