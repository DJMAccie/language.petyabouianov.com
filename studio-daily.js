/**
 * studio-daily.js — Calm Daily Path Engine for Nihongo Studio
 * 5-word lessons, 10-word reviews, flashcard walkthrough, and daily progress
 */
window.StudioDaily = (() => {
    const DAILY_LESSON_BATCH_SIZE = 5;
    const DAILY_LESSON_DEFAULT = 10;
    const DAILY_LESSON_MAX = 15;
    const DAILY_REVIEW_LIMIT = 10;

    let lessonWords = [];
    let lessonIndex = 0;
    let lessonBatchIndex = 0;
    let lessonLookupRequest = 0;
    const readingCache = new Map();

    function getLocalDateKey() {
        return new Date().toLocaleDateString('en-CA');
    }

    function getDailyPathStorageKey() {
        const config = window.StudioAPI?.getConfig?.() || {};
        return `${config.streakKey || 'studio'}_daily_path_v1`;
    }

    function createDailyPathState() {
        return {
            date: getLocalDateKey(),
            lessonTarget: DAILY_LESSON_DEFAULT,
            lessonBatches: [],
            completedLessonBatches: [],
            reviewKeys: [],
            reviewCompleted: false,
            reviewCount: 0
        };
    }

    function readDailyPathState() {
        const fallback = createDailyPathState();
        try {
            const stored = JSON.parse(localStorage.getItem(getDailyPathStorageKey()) || 'null');
            if (!stored || stored.date !== fallback.date) return fallback;

            const target = Number(stored.lessonTarget);
            return {
                ...fallback,
                ...stored,
                lessonTarget: target === DAILY_LESSON_MAX ? DAILY_LESSON_MAX : DAILY_LESSON_DEFAULT,
                lessonBatches: Array.isArray(stored.lessonBatches)
                    ? stored.lessonBatches.map(batch => Array.isArray(batch) ? batch.filter(Boolean) : []).filter(batch => batch.length > 0)
                    : [],
                completedLessonBatches: Array.isArray(stored.completedLessonBatches)
                    ? [...new Set(stored.completedLessonBatches.map(Number).filter(Number.isInteger))]
                    : [],
                reviewKeys: Array.isArray(stored.reviewKeys) ? stored.reviewKeys.filter(Boolean) : [],
                reviewCompleted: stored.reviewCompleted === true,
                reviewCount: Math.max(0, Number(stored.reviewCount) || 0)
            };
        } catch (error) {
            return fallback;
        }
    }

    function writeDailyPathState(state) {
        try {
            localStorage.setItem(getDailyPathStorageKey(), JSON.stringify(state));
        } catch (error) { }
    }

    function findStudyWord(wordKey) {
        const words = window.StudioLibrary?.getUniqueStudyWords?.() || [];
        return words.find(word => word.jp === wordKey) || null;
    }

    function getDailyFreshCandidates(excludedKeys = new Set()) {
        const fresh = window.StudioLibrary?.getFocusCandidates?.('fresh') || [];
        return fresh
            .filter(word => !(word.listNames || []).includes('Grammar Patterns'))
            .filter(word => !excludedKeys.has(word.jp));
    }

    function ensureDailyLessonBatch(state, batchIndex) {
        while (state.lessonBatches.length <= batchIndex) {
            const assigned = new Set(state.lessonBatches.flat());
            const nextBatch = getDailyFreshCandidates(assigned)
                .slice(0, DAILY_LESSON_BATCH_SIZE)
                .map(word => word.jp);

            if (nextBatch.length === 0) break;
            state.lessonBatches.push(nextBatch);
        }
        writeDailyPathState(state);
        return state.lessonBatches[batchIndex] || [];
    }

    function getDailyReviewCandidates() {
        const now = Date.now();
        const words = window.StudioLibrary?.getUniqueStudyWords?.() || [];
        const wordStats = window._studio?.getWordStats?.() || {};

        return words
            .filter(word => !(word.listNames || []).includes('Grammar Patterns'))
            .filter(word => (window.StudioLibrary?.getReviewTotal?.(word) || 0) > 0)
            .map(word => {
                const stats = wordStats[word.jp] || {};
                const nextReview = Number(stats.next_review) || 0;
                return {
                    word,
                    due: nextReview === 0 || nextReview <= now,
                    mastered: window.StudioLibrary?.isMastered?.(word),
                    nextReview,
                    lastReview: Number(stats.last_review) || 0,
                    wrong: Number(stats.wrong) || 0,
                    streak: Number(stats.streak) || 0
                };
            })
            .sort((a, b) => {
                if (a.due !== b.due) return a.due ? -1 : 1;
                if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
                if (a.due && a.nextReview !== b.nextReview) return a.nextReview - b.nextReview;
                if (a.wrong !== b.wrong) return b.wrong - a.wrong;
                if (a.streak !== b.streak) return a.streak - b.streak;
                return a.lastReview - b.lastReview;
            })
            .map(item => item.word);
    }

    function ensureDailyReviewQueue(state) {
        const existing = state.reviewKeys.map(findStudyWord).filter(Boolean);
        if (existing.length === 0 && !state.reviewCompleted) {
            state.reviewKeys = getDailyReviewCandidates().slice(0, DAILY_REVIEW_LIMIT).map(word => word.jp);
            writeDailyPathState(state);
            return state.reviewKeys.map(findStudyWord).filter(Boolean);
        }
        return existing;
    }

    function getGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning!';
        if (hour < 18) return 'Good afternoon!';
        return 'Good evening!';
    }

    function renderDailyDashboard() {
        const panel = document.getElementById('daily-study-panel');
        const loadedLists = window._studio?.getLoadedLists?.() || {};
        if (!panel || !Object.keys(loadedLists).length) return;

        const state = readDailyPathState();
        const words = window.StudioLibrary?.getUniqueStudyWords?.() || [];
        const total = words.length;
        const mastered = words.filter(word => window.StudioLibrary?.isMastered?.(word)).length;
        const learning = words.filter(word => (window.StudioLibrary?.getReviewTotal?.(word) || 0) > 0 && !window.StudioLibrary?.isMastered?.(word)).length;
        const fresh = Math.max(0, total - mastered - learning);
        const config = window.StudioAPI?.getConfig?.() || {};
        const goal = Number(config.vocabularyGoal) || 2000;
        const goalBase = Math.max(goal, 1);
        const catalogPct = Math.min(100, (total / goalBase) * 100);

        const completedSet = new Set(state.completedLessonBatches);
        const targetBatchCount = state.lessonTarget / DAILY_LESSON_BATCH_SIZE;
        let nextBatchIndex = -1;
        for (let i = 0; i < targetBatchCount; i++) {
            if (!completedSet.has(i)) { nextBatchIndex = i; break; }
        }

        const completedLessonWords = [...completedSet]
            .filter(index => index >= 0 && index < targetBatchCount)
            .reduce((sum, index) => sum + (state.lessonBatches[index]?.length || DAILY_LESSON_BATCH_SIZE), 0);
        const lessonsDone = nextBatchIndex === -1;
        const reviewQueue = ensureDailyReviewQueue(state);
        const reviewReady = state.reviewCompleted ? 0 : reviewQueue.length;
        const streak = window.StudioQuiz?.getStoredStreak?.() || 0;

        const quotaSteps = [0, 1, 2].map(index => {
            const isOptional = index === 2;
            const isUnlocked = !isOptional || state.lessonTarget === DAILY_LESSON_MAX;
            const isComplete = completedSet.has(index);
            const isCurrent = isUnlocked && index === nextBatchIndex;
            const stateClass = isComplete ? 'is-complete' : isCurrent ? 'is-current' : isUnlocked ? 'is-ready' : 'is-optional';
            const icon = isComplete ? '<i class="fas fa-check" aria-hidden="true"></i>' : String(index + 1);
            const label = isOptional && !isUnlocked ? 'optional 5' : '5 words';
            return `<div class="daily-quota-step ${stateClass}"><span>${icon}</span><small>${label}</small></div>`;
        }).join('');

        const lessonButtonLabel = lessonsDone
            ? 'Today’s lessons done'
            : (state.lessonBatches[nextBatchIndex]?.length ? 'Continue 5 words' : 'Learn 5 words');
        const optionalAction = lessonsDone && state.lessonTarget < DAILY_LESSON_MAX && fresh > 0
            ? `<button type="button" class="daily-optional-btn" onclick="window.StudioDaily.addFiveMoreWords()"><i class="fas fa-plus" aria-hidden="true"></i> I feel good — add 5 more</button>`
            : '';

        panel.innerHTML = `
            <div class="daily-intro">
                <div>
                    <h1 id="today-heading">${getGreeting()}</h1>
                    <p>A little each day adds up. No rush.</p>
                </div>
                <button type="button" class="daily-settings-btn" onclick="window.StudioUI.showStats()" aria-label="Open progress"><i class="fas fa-chart-pie" aria-hidden="true"></i><span>Progress</span></button>
            </div>

            <div class="daily-section-label">Today’s path</div>

            <div class="daily-actions-grid">
                <section class="daily-action-card daily-action-card--lesson">
                    <div class="daily-action-illustration"><img src="assets/lesson-words.png" alt="" aria-hidden="true"></div>
                    <div class="daily-action-content">
                        <h2>Lessons</h2>
                        <div class="daily-action-number"><strong>${Math.max(0, state.lessonTarget - completedLessonWords)}</strong><span>new words</span></div>
                        <p>See each word first. Learn in groups of five.</p>
                        <button type="button" class="daily-primary-btn daily-primary-btn--lesson" onclick="window.StudioDaily.startDailyLesson()" ${lessonsDone || fresh === 0 ? 'disabled' : ''}>${lessonButtonLabel}</button>
                        <div class="daily-quota" aria-label="Daily lesson quota">${quotaSteps}</div>
                        ${optionalAction}
                    </div>
                </section>

                <section class="daily-action-card daily-action-card--review">
                    <div class="daily-action-illustration"><img src="assets/review-words.png" alt="" aria-hidden="true"></div>
                    <div class="daily-action-content">
                        <h2>Reviews</h2>
                        <div class="daily-action-number"><strong>${reviewReady}</strong><span>${state.reviewCompleted ? 'finished today' : 'ready'}</span></div>
                        <p>${state.reviewCompleted ? `Nice. You reviewed ${state.reviewCount} words today.` : 'Reinforce the words that need you most.'}</p>
                        <button type="button" class="daily-primary-btn daily-primary-btn--review" onclick="window.StudioDaily.startDailyReview()" ${reviewReady === 0 ? 'disabled' : ''}>${state.reviewCompleted ? 'Reviews done' : `Review ${reviewReady} words`}</button>
                    </div>
                </section>
            </div>

            <section class="daily-progress-section" aria-label="Progress toward two thousand words">
                <div class="daily-section-label">Your progress</div>
                <div class="daily-progress-track" aria-hidden="true">
                    <span class="is-rainbow" style="width:${catalogPct}%"></span>
                </div>
                <div class="daily-progress-values">
                    <div class="is-mastered"><strong>${mastered.toLocaleString()}</strong><span>steady</span></div>
                    <div class="is-learning"><strong>${learning.toLocaleString()}</strong><span>learning</span></div>
                    <div class="is-new"><strong>${fresh.toLocaleString()}</strong><span>new</span></div>
                    <div class="is-goal"><strong>${goal.toLocaleString()}</strong><span>word goal</span></div>
                </div>
                <div class="daily-streak-line">
                    <span><i class="fas fa-fire" aria-hidden="true"></i> <strong>${streak} day streak</strong></span>
                    <span>${total.toLocaleString()} words currently in your studio</span>
                </div>
            </section>
        `;
    }

    function addFiveMoreWords() {
        const state = readDailyPathState();
        state.lessonTarget = DAILY_LESSON_MAX;
        writeDailyPathState(state);
        renderDailyDashboard();
        window.StudioUI?.showToast('Optional five unlocked. Still no pressure.', 'success');
    }

    function splitJapaneseLabel(word) {
        const raw = String(word?.jp || '').trim();
        const suppliedRomaji = String(word?.romaji || '').trim();
        const match = raw.match(/^(.+?)\s+([A-Za-z0-9À-ž'’.,!?~:/()\-\s]+)$/u);
        const japanese = match ? match[1].trim() : raw;
        const romaji = suppliedRomaji || (match ? match[2].trim() : '');
        return { japanese, romaji };
    }

    function getLessonKana(word, japanese) {
        const supplied = String(word?.kana || word?.reading || '').trim();
        if (supplied) return supplied;
        if (readingCache.has(japanese)) return readingCache.get(japanese);

        const mnemonics = window._studio?.getKanjiMnemonics?.() || {};
        if (mnemonics[japanese]?.reading_cue) {
            return mnemonics[japanese].reading_cue;
        }

        const hasKanji = /[\u3400-\u9fff々〆ヵヶ]/u.test(japanese);
        const hasKana = /[\u3040-\u30ff]/u.test(japanese);
        return !hasKanji && hasKana ? japanese : (word?._lessonKana || '…');
    }

    function hashText(text) {
        let hash = 0;
        for (const char of String(text || '')) hash = ((hash << 5) - hash + char.codePointAt(0)) | 0;
        return Math.abs(hash);
    }

    function buildMemoryHook(word, romaji) {
        const { japanese } = splitJapaneseLabel(word);
        const mnemonics = window._studio?.getKanjiMnemonics?.() || {};
        const kanjiEntry = mnemonics[japanese];
        if (kanjiEntry?.mnemonic) return String(kanjiEntry.mnemonic);
        if (word?.mnemonic) return String(word.mnemonic);

        const sound = romaji || japanese;
        const meaning = String(word?.en || 'this meaning').split(/[\/;]/)[0].trim();
        const hooks = [
            `Picture ${meaning} wearing a tiny name tag that says “${sound}”.`,
            `Imagine shouting “${sound}!” when ${meaning} suddenly appears.`,
            `Put ${meaning} inside the Reptilian Birdhaus and label it “${sound}”.`,
            `Make ${meaning} move in a ridiculous way while you say “${sound}”.`,
            `Link “${sound}” to the strangest version of ${meaning} you can picture.`
        ];
        return hooks[hashText(word?.jp) % hooks.length];
    }

    async function enrichLessonKana(word, japanese, requestId) {
        if (getLessonKana(word, japanese) !== '…' || !japanese) return;
        try {
            const payload = await window.StudioAPI.lookupWord(japanese);
            const entries = payload?.data?.[0]?.japanese || [];
            const exact = entries.find(entry => entry.word === japanese) || entries[0];
            const reading = String(exact?.reading || '').trim();
            if (!reading) return;

            word._lessonKana = reading;
            readingCache.set(japanese, reading);
            if (requestId === lessonLookupRequest && lessonWords[lessonIndex]?.jp === word.jp) {
                const kanaEl = document.getElementById('lesson-kana');
                if (kanaEl) kanaEl.textContent = reading;
            }
        } catch (error) { }
    }

    function renderLessonCard() {
        const word = lessonWords[lessonIndex];
        if (!word) return;
        const { japanese, romaji } = splitJapaneseLabel(word);
        const kana = getLessonKana(word, japanese);
        const exampleJp = String(word.sentence_jp || word.example_jp || '').trim();
        const exampleEn = String(word.sentence_en || word.example_en || '').trim();
        const exampleBlock = document.getElementById('lesson-example-block');
        const batchTotal = readDailyPathState().lessonTarget / DAILY_LESSON_BATCH_SIZE;

        document.getElementById('lesson-batch-label').textContent = `Lesson ${lessonBatchIndex + 1} of ${batchTotal}`;
        document.getElementById('lesson-count-text').textContent = `${lessonIndex + 1} / ${lessonWords.length}`;
        document.getElementById('lesson-progress-bar').style.width = `${((lessonIndex + 1) / lessonWords.length) * 100}%`;
        document.getElementById('lesson-word').textContent = japanese;
        document.getElementById('lesson-meaning').textContent = word.en || '';
        document.getElementById('lesson-kana').textContent = kana;
        document.getElementById('lesson-romaji').textContent = romaji || '—';
        document.getElementById('lesson-mnemonic').textContent = buildMemoryHook(word, romaji);

        if (exampleJp || exampleEn) {
            exampleBlock.hidden = false;
            document.getElementById('lesson-example-jp').textContent = exampleJp;
            document.getElementById('lesson-example-en').textContent = exampleEn;
        } else {
            exampleBlock.hidden = true;
        }

        const prevButton = document.getElementById('lesson-prev-btn');
        const nextButton = document.getElementById('lesson-next-btn');
        prevButton.disabled = lessonIndex === 0;
        nextButton.innerHTML = lessonIndex === lessonWords.length - 1
            ? `Start 5-word quiz <i class="fas fa-arrow-right" aria-hidden="true"></i>`
            : `Next word <i class="fas fa-arrow-right" aria-hidden="true"></i>`;

        document.getElementById('lesson-dots').innerHTML = lessonWords.map((item, index) => `
            <button type="button" class="lesson-dot ${index === lessonIndex ? 'is-active' : ''} ${index < lessonIndex ? 'is-seen' : ''}"
                onclick="window.StudioDaily.goToLessonCard(${index})" aria-label="Word ${index + 1}" ${index === lessonIndex ? 'aria-current="step"' : ''}>${index + 1}</button>
        `).join('');

        lessonLookupRequest += 1;
        enrichLessonKana(word, japanese, lessonLookupRequest);
    }

    function startDailyLesson() {
        const state = readDailyPathState();
        const completed = new Set(state.completedLessonBatches);
        const targetBatchCount = state.lessonTarget / DAILY_LESSON_BATCH_SIZE;
        let batchIndex = -1;
        for (let i = 0; i < targetBatchCount; i++) {
            if (!completed.has(i)) { batchIndex = i; break; }
        }

        if (batchIndex < 0) {
            window.StudioUI?.showToast('Today’s lesson path is complete.', 'success');
            return;
        }

        const keys = ensureDailyLessonBatch(state, batchIndex);
        const batch = keys.map(findStudyWord).filter(Boolean);
        if (batch.length === 0) {
            window.StudioUI?.showToast('No fresh words are waiting right now.', 'info');
            return;
        }

        lessonBatchIndex = batchIndex;
        lessonWords = batch;
        lessonIndex = 0;
        window.StudioCore.showSection('lesson');
        renderLessonCard();
    }

    function goToLessonCard(index) {
        if (!Number.isInteger(index) || index < 0 || index >= lessonWords.length) return;
        lessonIndex = index;
        renderLessonCard();
    }

    function moveLessonCard(direction) {
        if (direction > 0 && lessonIndex === lessonWords.length - 1) {
            window.StudioQuiz.startSession({
                listName: `Daily Lesson ${lessonBatchIndex + 1}`,
                words: [...lessonWords],
                modeOverride: 'choice',
                labelOverride: '5-WORD CHECK',
                requeueWrong: false,
                persistScore: false,
                sessionKind: 'daily-lesson',
                onComplete: () => {
                    completeDailySession('daily-lesson', lessonBatchIndex, lessonWords.length);
                },
                onQuit: () => {
                    window.StudioCore.showSection('today');
                }
            });
            return;
        }

        lessonIndex = Math.max(0, Math.min(lessonWords.length - 1, lessonIndex + direction));
        renderLessonCard();
    }

    function playLessonAudio() {
        const word = lessonWords[lessonIndex];
        const config = window.StudioAPI?.getConfig?.() || {};
        if (!word || !config.speakText) return;
        config.speakText(splitJapaneseLabel(word).japanese);
    }

    function startDailyReview() {
        const state = readDailyPathState();
        if (state.reviewCompleted) {
            window.StudioUI?.showToast('Today’s reviews are already complete.', 'success');
            return;
        }

        const queue = ensureDailyReviewQueue(state);
        if (queue.length === 0) {
            window.StudioUI?.showToast('No review words are ready yet.', 'info');
            return;
        }

        window.StudioQuiz.startSession({
            listName: 'Daily Review',
            words: [...queue],
            requeueWrong: false,
            persistScore: false,
            sessionKind: 'daily-review',
            onComplete: () => {
                completeDailySession('daily-review', 0, queue.length);
            },
            onQuit: () => {
                window.StudioCore.showSection('today');
            }
        });
    }

    function completeDailySession(kind, batchIdx, count) {
        const state = readDailyPathState();
        if (kind === 'daily-lesson') {
            if (!state.completedLessonBatches.includes(batchIdx)) {
                state.completedLessonBatches.push(batchIdx);
                state.completedLessonBatches.sort((a, b) => a - b);
            }
        } else if (kind === 'daily-review') {
            state.reviewCompleted = true;
            state.reviewCount = Math.min(DAILY_REVIEW_LIMIT, count);
        }
        writeDailyPathState(state);
    }

    return {
        readDailyPathState,
        writeDailyPathState,
        renderDailyDashboard,
        addFiveMoreWords,
        startDailyLesson,
        startDailyReview,
        moveLessonCard,
        goToLessonCard,
        playLessonAudio,
        completeDailySession,
        splitJapaneseLabel,
        buildMemoryHook,
        getLessonKana
    };
})();
