// studio-guest.js
//
// Guest progress: study data for visitors who are not signed in.
//
// The studio is open to everyone, but nothing about a guest is stored on the
// server. Scores and word statistics are mirrored into this browser only, using
// the same object shapes the API returns, so the review scheduler and the
// progress panel behave identically whether or not an account exists.
//
// Signing in switches to server-side progress; the guest copy is left alone so
// it is still there if the visitor signs out again.
window.StudioGuest = (() => {
    'use strict';

    const STORAGE_PREFIX = 'studio_guest_progress_v1';

    function storageKey() {
        let lang = 'nihongo';
        try {
            lang = new URLSearchParams(window.location.search).get('lang') || 'nihongo';
        } catch (e) { /* default */ }
        return `${STORAGE_PREFIX}_${lang}`;
    }

    function emptyState() {
        return { scores: {}, stats: {}, updated_at: 0 };
    }

    function read() {
        try {
            const raw = localStorage.getItem(storageKey());
            const parsed = JSON.parse(raw || 'null');
            if (!parsed || typeof parsed !== 'object') return emptyState();
            return {
                scores: parsed.scores && typeof parsed.scores === 'object' ? parsed.scores : {},
                stats: parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {},
                updated_at: Number(parsed.updated_at || 0)
            };
        } catch (e) {
            return emptyState();
        }
    }

    function write(state) {
        try {
            localStorage.setItem(storageKey(), JSON.stringify({
                scores: state.scores || {},
                stats: state.stats || {},
                updated_at: Date.now()
            }));
            return true;
        } catch (e) {
            // Private mode or quota: progress simply will not persist.
            return false;
        }
    }

    // Mirrors the server's scoring rule: keep the best result per mode.
    function applyScore(state, listName, score, mode, timestampMs) {
        if (!listName) return;
        const entry = state.scores[listName] && typeof state.scores[listName] === 'object'
            ? state.scores[listName]
            : { 'jp-en': 0, 'en-jp': 0, speech: 0, choice: 0, last_activity: 0 };

        const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
        if (value > (Number(entry[mode]) || 0)) entry[mode] = value;
        entry.last_activity = timestampMs;
        state.scores[listName] = entry;
    }

    // Mirrors the server's spaced-repetition update so the review deck works.
    function applyStats(state, results, isPurification, timestampMs) {
        if (!Array.isArray(results)) return;

        results.forEach(result => {
            if (!result) return;
            const word = String(result.word || '').trim();
            if (!word) return;

            if (!state.stats[word] || typeof state.stats[word] !== 'object') {
                state.stats[word] = { correct: 0, wrong: 0, streak: 0, last_review: 0, next_review: 0, seen: 0 };
            }
            const stats = state.stats[word];
            stats.seen = (Number(stats.seen) || 0) + 1;
            stats.last_review = timestampMs;

            if (result.correct) {
                stats.correct = (Number(stats.correct) || 0) + 1;
                stats.streak = (Number(stats.streak) || 0) + 1;
                if (isPurification) stats.wrong = 0;

                const streak = stats.streak;
                const days = (streak === 1) ? 1 : (streak === 2 ? 3 : (streak === 3 ? 7 : (streak === 4 ? 14 : 30)));
                stats.next_review = timestampMs + (days * 86400 * 1000);
            } else {
                stats.wrong = (Number(stats.wrong) || 0) + 1;
                stats.streak = 0;
                stats.next_review = timestampMs;
            }
        });
    }

    // Records a finished session into the browser copy and returns the new state.
    function recordSession({ listName, score, mode, results, isPurification }) {
        const state = read();
        const now = Date.now();

        applyScore(state, listName, score, mode || 'jp-en', now);
        applyStats(state, results || [], !!isPurification, now);
        write(state);

        return state;
    }

    function clear() {
        try {
            localStorage.removeItem(storageKey());
        } catch (e) { /* ignore */ }
    }

    return { read, write, recordSession, clear, storageKey };
})();
