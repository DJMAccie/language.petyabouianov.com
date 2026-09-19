/**
 * studio-daily.js: Calm Daily Path Engine for Nihongo Studio
 * 5-word lessons, 10-word reviews, flashcard walkthrough, and daily progress
 */
window.StudioDaily = (() => {
    const DAILY_LESSON_BATCH_SIZE = 5;
    const DAILY_LESSON_DEFAULT = 10;
    // There is no daily ceiling: the optional action keeps adding a batch at a
    // time. This bound only stops a corrupted stored value from exploding the UI.
    const DAILY_LESSON_HARD_CAP = 60;
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

            const rawTarget = Math.floor(Number(stored.lessonTarget) / DAILY_LESSON_BATCH_SIZE) * DAILY_LESSON_BATCH_SIZE;
            const target = Number.isFinite(rawTarget) && rawTarget >= DAILY_LESSON_DEFAULT
                ? Math.min(rawTarget, DAILY_LESSON_HARD_CAP)
                : DAILY_LESSON_DEFAULT;
            return {
                ...fallback,
                ...stored,
                lessonTarget: target,
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
        // The bar tracks what the learner has done, not what the library holds. The
        // catalog figure never moves once the lists are in place, which made the
        // loudest element on the screen the one number that could not change.
        const learnedPct = Math.min(100, ((mastered + learning) / goalBase) * 100);

        const completedSet = new Set(state.completedLessonBatches);
        const targetBatchCount = state.lessonTarget / DAILY_LESSON_BATCH_SIZE;
        let nextBatchIndex = -1;
        for (let i = 0; i < targetBatchCount; i++) {
            if (!completedSet.has(i)) { nextBatchIndex = i; break; }
        }

        const lessonsDone = nextBatchIndex === -1;
        const reviewQueue = ensureDailyReviewQueue(state);
        const reviewReady = state.reviewCompleted ? 0 : reviewQueue.length;
        const streak = window.StudioQuiz?.getStoredStreak?.() || 0;
        const studyDays = window.StudioQuiz?.getStoredStudyDays?.() || 0;

        // Both cards run the same four rows in the same order, so the primary action is
        // always the third row and the pair reads as one choice: heading, value, action,
        // today. The Lessons card's extra row sits below the strip, never between the
        // value and the action, which is what used to move the primary 70px down the
        // card the moment the day was finished.
        const nextBatchSize = state.lessonBatches[nextBatchIndex]?.length || DAILY_LESSON_BATCH_SIZE;
        const setsDone = completedSet.size;
        const setsPlanned = Math.max(targetBatchCount, 1);

        // The value always sizes the session the button starts, in every state. It used
        // to become the library remainder once the day was done, which put the loudest
        // number on the card beyond the learner's reach.
        const lessonValue = nextBatchSize;
        const lessonUnit = 'words to learn';

        const lessonPrimary = lessonsDone
            ? (fresh > 0
                ? `<button type="button" class="daily-primary-btn daily-primary-btn--lesson" onclick="window.StudioDaily.addFiveMoreWords()">Add 5 more words</button>`
                : `<p class="daily-action-note">Every word in the library has been met.</p>`)
            : `<button type="button" class="daily-primary-btn daily-primary-btn--lesson" onclick="window.StudioDaily.startDailyLesson()">${state.lessonBatches[nextBatchIndex]?.length ? 'Continue 5 words' : 'Learn 5 words'}</button>`;

        const lessonTicks = Array.from({ length: setsPlanned }, (_, index) => {
            const state_ = index < setsDone ? ' is-done' : (index === setsDone && !lessonsDone ? ' is-current' : '');
            return `<span class="daily-tick${state_}"></span>`;
        }).join('');

        // The quiet top-up is a different job from the primary (it extends today's plan
        // rather than starting the next set), so it keeps this spot whenever it is not
        // the only action left.
        const lessonExtra = (!lessonsDone && fresh > 0)
            ? `<div class="daily-extra"><button type="button" class="daily-optional-btn" onclick="window.StudioDaily.addFiveMoreWords()"><i class="fas fa-plus" aria-hidden="true"></i> 5 more words</button></div>`
            : '';

        const reviewDriven = reviewReady > 0;
        const reviewPrimary = reviewDriven
            ? `<button type="button" class="daily-primary-btn daily-primary-btn--review" onclick="window.StudioDaily.startDailyReview()">Review ${reviewReady} words${state.reviewCompleted ? ' more' : ''}</button>`
            : `<p class="daily-action-note">${state.reviewCompleted ? 'Nothing due right now.' : 'Nothing due yet. Reviews come back after a lesson.'}</p>`;
        const reviewTickState = state.reviewCompleted ? ' is-done' : (reviewDriven ? ' is-current' : '');
        const reviewCount = reviewDriven ? (state.reviewCompleted ? '1 of 1' : '0 of 1') : 'nothing due';
        const reviewSpoken = reviewDriven
            ? (state.reviewCompleted ? "Today's review is done" : "Today's review is still to do")
            : 'Nothing due to review yet';

        const lessonSpoken = `${setsDone} of ${setsPlanned} five-word sets done today`;

        panel.innerHTML = `
            <div class="daily-intro">
                <div>
                    <h1 id="today-heading">${getGreeting()}</h1>
                </div>
                <button type="button" class="daily-settings-btn" onclick="window.StudioUI.showStats()" aria-label="Open progress"><i class="fas fa-chart-pie" aria-hidden="true"></i><span>Progress</span></button>
            </div>

            <div class="daily-section-label">Today</div>

            <div class="daily-actions-grid">
                <section class="daily-action-card daily-action-card--lesson">
                    <div class="daily-action-content">
                        <h2>Lessons</h2>
                        <div class="daily-action-number"><strong>${lessonValue}</strong><span>${lessonUnit}</span></div>
                        <div class="daily-action-primary">${lessonPrimary}</div>
                        <div class="daily-today" role="group" aria-label="${lessonSpoken}">
                            <span class="daily-today-label">Today</span>
                            <span class="daily-ticks" aria-hidden="true">${lessonTicks}</span>
                            <span class="daily-today-count">${setsDone} of ${setsPlanned}</span>
                        </div>
                        ${lessonExtra}
                    </div>
                    <div class="daily-action-illustration"><img src="assets/lesson-words.png" alt="" aria-hidden="true"></div>
                </section>

                <section class="daily-action-card daily-action-card--review">
                    <div class="daily-action-content">
                        <h2>Reviews</h2>
                        <div class="daily-action-number"><strong>${reviewReady}</strong><span>words due</span></div>
                        <div class="daily-action-primary">${reviewPrimary}</div>
                        <div class="daily-today" role="group" aria-label="${reviewSpoken}">
                            <span class="daily-today-label">Today</span>
                            <span class="daily-ticks" aria-hidden="true"><span class="daily-tick${reviewTickState}"></span></span>
                            <span class="daily-today-count">${reviewCount}</span>
                        </div>
                    </div>
                    <div class="daily-action-illustration"><img src="assets/review-words.png" alt="" aria-hidden="true"></div>
                </section>
            </div>

            <section class="daily-progress-section" aria-label="Progress toward two thousand words">
                <div class="daily-section-label">Your progress</div>
                <div class="daily-progress-track" aria-hidden="true">
                    <span class="is-rainbow" style="width:${learnedPct}%"></span>
                </div>
                <div class="daily-progress-values">
                    <div class="is-mastered"><strong>${mastered.toLocaleString()}</strong><span>mastered</span></div>
                    <div class="is-learning"><strong>${learning.toLocaleString()}</strong><span>learning</span></div>
                    <div class="is-new"><strong>${fresh.toLocaleString()}</strong><span>new</span></div>
                    <div class="is-goal"><strong>${goal.toLocaleString()}</strong><span>word goal</span></div>
                </div>
                <div class="daily-streak-line">
                    <span class="daily-stat is-streak"><i class="fas fa-fire" aria-hidden="true"></i><strong>${streak}</strong> day streak</span>
                    <span class="daily-stat-cluster">
                        <span class="daily-stat"><strong>${studyDays.toLocaleString()}</strong> ${studyDays === 1 ? 'day' : 'days'} studied</span>
                        ${tripCountdownMarkup()}
                    </span>
                    <span class="daily-stat"><strong>${total.toLocaleString()}</strong> words total</span>
                </div>
            </section>
        `;
    }

    function addFiveMoreWords() {
        const state = readDailyPathState();
        state.lessonTarget = Math.min(
            state.lessonTarget + DAILY_LESSON_BATCH_SIZE,
            DAILY_LESSON_HARD_CAP
        );
        writeDailyPathState(state);
        renderDailyDashboard();
        window.StudioUI?.showToast('Five more words added.', 'success');
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

    // Fills the kana slot from the dictionary when a list does not supply a
    // reading. Guests cannot reach the lookup endpoint, so the slot stays hidden.
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
                if (kanaEl) {
                    kanaEl.textContent = reading;
                    const kanaWrap = kanaEl.closest('div');
                    if (kanaWrap) kanaWrap.hidden = false;
                }
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
        document.getElementById('lesson-progress-bar').style.transform = `scaleX(${(lessonIndex + 1) / lessonWords.length})`;
        // Romaji leads; the kanji and kana below it are supporting detail.
        document.getElementById('lesson-word').textContent = romaji || japanese;
        document.getElementById('lesson-meaning').textContent = word.en || '';
        const kanaEl = document.getElementById('lesson-kana');
        if (kanaEl) {
            const kanaWrap = kanaEl.closest('div');
            const hasKana = !!kana && kana !== '…';
            kanaEl.textContent = hasKana ? kana : '';
            if (kanaWrap) kanaWrap.hidden = !hasKana;
        }
        const kanjiEl = document.getElementById('lesson-kanji');
        if (kanjiEl) kanjiEl.textContent = japanese;

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

    // --- Japan trip countdown -------------------------------------------------
    // The stored value is a plain YYYY-MM-DD date, so it is compared as a local
    // calendar day: a trip is "today" for the whole of that day wherever the
    // visitor is, and never a day out because of a timezone offset.
    function parseTripDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function daysUntilTrip(value) {
        const target = parseTripDate(value);
        if (!target) return null;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.round((target - today) / 86400000);
    }

    // Only rendered when a trip date is set and still ahead of (or on) today.
    function tripCountdownMarkup() {
        const days = daysUntilTrip(window.StudioAPI?.getCachedPrefs?.()?.japanTripDate);
        if (days === null || days < 0) return '';

        if (days === 0) {
            return `<span class="daily-stat is-trip"><i class="fas fa-plane-departure" aria-hidden="true"></i><strong>Today</strong> · Japan trip</span>`;
        }
        return `<span class="daily-stat is-trip"><i class="fas fa-plane-departure" aria-hidden="true"></i><strong>${days}</strong> ${days === 1 ? 'day' : 'days'} to Japan</span>`;
    }

    window.addEventListener('studio:prefs-changed', () => {
        renderDailyDashboard();
    });

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
        getLessonKana,
        daysUntilTrip
    };
})();
