/**
 * studio-api.js — Canonical API & Offline Sync Client for Nihongo Studio
 */
window.StudioAPI = (() => {
    let config = {};
    let syncFlushInFlight = false;
    let syncLifecycleBound = false;

    function init(userConfig = {}) {
        config = { ...userConfig };
        bindSyncLifecycle();
    }

    function getConfig() {
        return config;
    }

    function getActiveLang() {
        try {
            const apiUrl = config.apiUrl || '';
            if (!apiUrl.includes('?')) return 'nihongo';
            const params = new URLSearchParams(apiUrl.split('?')[1] || '');
            return params.get('lang') || 'nihongo';
        } catch (e) {
            return 'nihongo';
        }
    }

    function isOfflineSyncEnabled() {
        return !!config.enableOfflineSync;
    }

    function getOfflineKey(suffix) {
        return `studio_offline_${getActiveLang()}_${suffix}`;
    }

    function getCacheStorageKey() {
        return getOfflineKey('snapshot_v1');
    }

    function getQueueStorageKey() {
        return getOfflineKey('sync_queue_v1');
    }

    function getDeviceIdStorageKey() {
        return getOfflineKey('device_id');
    }

    function getSyncToken() {
        const fromConfig = typeof config.syncToken === 'string' ? config.syncToken.trim() : '';
        if (fromConfig) return fromConfig;

        const fromWindow = typeof window.STUDIO_SYNC_TOKEN === 'string' ? window.STUDIO_SYNC_TOKEN.trim() : '';
        if (fromWindow) return fromWindow;

        const fromIos = typeof window.NIHONGO_IOS_CONFIG?.syncToken === 'string' ? window.NIHONGO_IOS_CONFIG.syncToken.trim() : '';
        if (fromIos) return fromIos;

        return '';
    }

    function getWriteAuthPayload() {
        const payload = {};
        const syncToken = getSyncToken();
        if (syncToken) payload.sync_token = syncToken;

        const writeTokenFromConfig = typeof config.writeToken === 'string' ? config.writeToken.trim() : '';
        const writeTokenFromWindow = typeof window.STUDIO_WRITE_TOKEN === 'string' ? window.STUDIO_WRITE_TOKEN.trim() : '';
        const writeTokenFromIos = typeof window.NIHONGO_IOS_CONFIG?.writeToken === 'string' ? window.NIHONGO_IOS_CONFIG.writeToken.trim() : '';
        const writeToken = writeTokenFromConfig || writeTokenFromWindow || writeTokenFromIos;
        if (writeToken) payload.write_token = writeToken;

        const adminPasswordFromConfig = typeof config.adminPassword === 'string' ? config.adminPassword : '';
        const adminPasswordFromWindow = typeof window.STUDIO_ADMIN_PASSWORD === 'string' ? window.STUDIO_ADMIN_PASSWORD : '';
        const adminPassword = adminPasswordFromConfig || adminPasswordFromWindow;
        if (adminPassword) payload.password = adminPassword;

        return payload;
    }

    function getSyncDeviceId() {
        const key = getDeviceIdStorageKey();
        try {
            let existing = localStorage.getItem(key);
            if (existing) return existing;
            existing = `ios-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem(key, existing);
            return existing;
        } catch (e) {
            return `ephemeral-${Date.now()}`;
        }
    }

    // Account data is private: an expired session sends the user to sign in
    // instead of silently rendering an empty library.
    let authRedirectPending = false;

    function isUnauthenticatedResponse(response) {
        return !!response && response.status === 401;
    }

    function redirectToSignIn() {
        if (authRedirectPending) return;
        authRedirectPending = true;
        const target = typeof config.signInUrl === 'string' && config.signInUrl
            ? config.signInUrl
            : '/login.html';
        window.location.replace(target + (target.indexOf('?') === -1 ? '?signedout=1' : '&signedout=1'));
    }

    async function safeJson(response, fallback) {
        try {
            const parsed = await response.json();
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (e) {
            return fallback;
        }
    }

    async function apiFetch(url, options = {}) {
        const response = await fetch(url, options);

        if (isUnauthenticatedResponse(response)) {
            redirectToSignIn();
            throw new Error('Not signed in');
        }

        if (!response.ok) {
            let errorMsg = `API Error HTTP ${response.status}`;
            try {
                const data = await response.json();
                if (data.error) errorMsg = data.error;
            } catch (e) { }
            throw new Error(errorMsg);
        }
        return response;
    }

    function isIndexedDBAvailable() {
        return typeof indexedDB !== 'undefined';
    }

    function openSyncDB() {
        return new Promise((resolve, reject) => {
            if (!isIndexedDBAvailable()) {
                reject(new Error('IndexedDB unavailable'));
                return;
            }
            const request = indexedDB.open('studioOfflineSync', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('queues')) {
                    db.createObjectStore('queues', { keyPath: 'key' });
                }
            };
            request.onerror = () => reject(request.error || new Error('Failed to open sync db'));
            request.onsuccess = () => resolve(request.result);
        });
    }

    async function readQueueFromIndexedDB() {
        const key = getQueueStorageKey();
        const db = await openSyncDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('queues', 'readonly');
            const store = tx.objectStore('queues');
            const request = store.get(key);
            request.onerror = () => {
                db.close();
                reject(request.error || new Error('Failed to read sync queue'));
            };
            request.onsuccess = () => {
                const events = request.result?.events;
                db.close();
                resolve(Array.isArray(events) ? events : []);
            };
        });
    }

    async function writeQueueToIndexedDB(events) {
        const key = getQueueStorageKey();
        const db = await openSyncDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('queues', 'readwrite');
            const store = tx.objectStore('queues');
            store.put({ key, events });
            tx.onerror = () => {
                db.close();
                reject(tx.error || new Error('Failed to write sync queue'));
            };
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
        });
    }

    function readQueueFromLocalStorage() {
        try {
            const raw = localStorage.getItem(getQueueStorageKey());
            const parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    function writeQueueToLocalStorage(events) {
        try {
            localStorage.setItem(getQueueStorageKey(), JSON.stringify(events));
        } catch (e) { }
    }

    async function readPendingQueue() {
        const sanitizeQueue = (events) => {
            if (!Array.isArray(events)) return [];
            return events.map(sanitizeEventForSync).filter(Boolean).slice(0, 1500);
        };

        if (isIndexedDBAvailable()) {
            try {
                return sanitizeQueue(await readQueueFromIndexedDB());
            } catch (e) {
                return sanitizeQueue(readQueueFromLocalStorage());
            }
        }
        return sanitizeQueue(readQueueFromLocalStorage());
    }

    async function writePendingQueue(events) {
        if (isIndexedDBAvailable()) {
            try {
                await writeQueueToIndexedDB(events);
                writeQueueToLocalStorage(events);
                return;
            } catch (e) {
                writeQueueToLocalStorage(events);
                return;
            }
        }
        writeQueueToLocalStorage(events);
    }

    async function enqueueSyncEvent(event) {
        const safeEvent = sanitizeEventForSync(event);
        if (!safeEvent) return;
        const queue = await readPendingQueue();
        queue.push(safeEvent);
        await writePendingQueue(queue);
    }

    async function removeEventsFromQueue(eventIds) {
        if (!eventIds || eventIds.length === 0) return;
        const removeSet = new Set(eventIds);
        const queue = await readPendingQueue();
        const filtered = queue.filter(item => !removeSet.has(item?.event_id));
        await writePendingQueue(filtered);
    }

    function normalizeResultItem(item) {
        if (!item || typeof item !== 'object') return null;
        const key = typeof item.jp === 'string' ? item.jp : (typeof item.word === 'string' ? item.word : '');
        if (!key) return null;
        return { jp: key, word: key, correct: !!item.correct };
    }

    function sanitizeEventForSync(rawEvent) {
        if (!rawEvent || typeof rawEvent !== 'object') return null;
        const eventId = String(rawEvent.event_id || '').trim();
        if (!eventId || eventId.length > 160) return null;

        const listName = String(rawEvent.listName || '').trim();
        if (!listName || listName.length > 120) return null;

        const mode = String(rawEvent.mode || '');
        if (!['jp-en', 'en-jp', 'speech', 'choice'].includes(mode)) return null;

        const scoreValue = Number.parseInt(rawEvent.score, 10);
        const safeScore = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, scoreValue)) : 0;
        const eventTs = Number.parseInt(rawEvent.event_ts, 10);
        const safeEventTs = Number.isFinite(eventTs) && eventTs > 0 ? eventTs : Date.now();

        const rawResults = Array.isArray(rawEvent.results) ? rawEvent.results : [];
        const normalizedResults = rawResults.map(normalizeResultItem).filter(Boolean).slice(0, 250);

        return {
            event_id: eventId,
            event_ts: safeEventTs,
            listName,
            mode,
            score: safeScore,
            results: normalizedResults,
            is_purification: !!rawEvent.is_purification
        };
    }

    function buildSessionEvent(params) {
        const now = Date.now();
        const normalizedResults = (params.results || []).map(normalizeResultItem).filter(Boolean);
        return {
            event_id: `evt_${now}_${Math.random().toString(36).slice(2, 10)}`,
            event_ts: now,
            listName: params.listName,
            mode: params.mode,
            score: params.score,
            results: normalizedResults,
            is_purification: !!params.isPurification
        };
    }

    function applySessionLocally(sessionEvent, loadedScores, wordStats) {
        if (!loadedScores[sessionEvent.listName] || typeof loadedScores[sessionEvent.listName] !== 'object') {
            const existing = loadedScores[sessionEvent.listName];
            loadedScores[sessionEvent.listName] = {
                'jp-en': typeof existing === 'number' ? existing : 0,
                'en-jp': 0,
                'speech': 0,
                'choice': 0,
                'last_activity': 0
            };
        }
        const entry = loadedScores[sessionEvent.listName];
        const prior = entry[sessionEvent.mode] || 0;
        if (sessionEvent.score > prior) {
            entry[sessionEvent.mode] = sessionEvent.score;
        }
        entry.last_activity = sessionEvent.event_ts || Date.now();

        const results = Array.isArray(sessionEvent.results) ? sessionEvent.results : [];
        results.forEach((result) => {
            const word = result?.jp || result?.word;
            if (!word) return;

            if (!wordStats[word] || typeof wordStats[word] !== 'object') {
                wordStats[word] = { correct: 0, wrong: 0, streak: 0, last_review: 0, next_review: 0, seen: 0 };
            }
            const stats = wordStats[word];
            stats.seen = (stats.seen || 0) + 1;
            stats.last_review = sessionEvent.event_ts || Date.now();

            if (result.correct) {
                stats.correct = (stats.correct || 0) + 1;
                stats.streak = (stats.streak || 0) + 1;
                if (sessionEvent.is_purification) stats.wrong = 0;
                const streak = stats.streak;
                const days = (streak === 1) ? 1 : (streak === 2 ? 3 : (streak === 3 ? 7 : (streak === 4 ? 14 : 30)));
                stats.next_review = stats.last_review + (days * 86400 * 1000);
            } else {
                stats.wrong = (stats.wrong || 0) + 1;
                stats.streak = 0;
                stats.next_review = stats.last_review;
            }
        });
    }

    function saveSnapshotCache(snapshot) {
        try {
            localStorage.setItem(getCacheStorageKey(), JSON.stringify({
                updated_at: Date.now(),
                payload: snapshot
            }));
        } catch (e) { }
    }

    function loadSnapshotCache() {
        try {
            const raw = localStorage.getItem(getCacheStorageKey());
            const parsed = JSON.parse(raw || '{}');
            const payload = parsed?.payload;
            if (!payload || typeof payload !== 'object') return null;
            return payload;
        } catch (e) {
            return null;
        }
    }

    async function loadBundledSnapshot() {
        if (!config.offlineSeedPaths || typeof config.offlineSeedPaths !== 'object') return null;
        const { lists: listsPath, scores: scoresPath, stats: statsPath, mnemonics: mnemonicsPath } = config.offlineSeedPaths;
        if (!listsPath || !scoresPath || !statsPath) return null;

        try {
            const [listsRes, scoresRes, statsRes, mnRes] = await Promise.all([
                fetch(listsPath + '?t=' + Date.now()),
                fetch(scoresPath + '?t=' + Date.now()),
                fetch(statsPath + '?t=' + Date.now()),
                mnemonicsPath ? fetch(mnemonicsPath + '?t=' + Date.now()).catch(() => null) : null
            ]);

            const lang = getActiveLang();
            const listData = await listsRes.json();
            const scoreData = await scoresRes.json();
            const statsData = await statsRes.json();
            const mnemonicData = mnRes ? await mnRes.json().catch(() => ({})) : {};

            return {
                lists: (listData && typeof listData === 'object') ? (listData[lang] || {}) : {},
                scores: (scoreData && typeof scoreData === 'object') ? (scoreData[lang] || {}) : {},
                stats: (statsData && typeof statsData === 'object') ? (statsData[lang] || {}) : {},
                mnemonics: (mnemonicData && typeof mnemonicData === 'object') ? (mnemonicData[lang] || {}) : {}
            };
        } catch (e) {
            return null;
        }
    }

    async function flushQueueWhenOnline(options = {}) {
        const { silent = false, onRefreshNeeded = null } = options;
        if (!isOfflineSyncEnabled() || syncFlushInFlight) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        const syncToken = getSyncToken();
        if (!syncToken) return;

        const queue = await readPendingQueue();
        if (!queue.length) return;

        syncFlushInFlight = true;
        try {
            const safeEvents = queue.map(sanitizeEventForSync).filter(Boolean);
            if (!safeEvents.length) {
                await writePendingQueue([]);
                return;
            }

            const payload = {
                device_id: getSyncDeviceId(),
                lang: getActiveLang(),
                sync_token: syncToken,
                events: safeEvents
            };

            const response = await fetch(config.apiUrl + '&action=sync_progress_batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 409) {
                const conflictingIds = safeEvents.map(item => item.event_id).filter(Boolean);
                await removeEventsFromQueue(conflictingIds);
                if (onRefreshNeeded) onRefreshNeeded();
                if (!silent && window.StudioUI?.showToast) {
                    window.StudioUI.showToast('Conflict detected. Server state kept.', 'warning', 3500);
                }
                return;
            }

            if (!response.ok) throw new Error(`Sync failed (${response.status})`);

            const data = await response.json().catch(() => ({}));
            const applied = Array.isArray(data.applied_event_ids) ? data.applied_event_ids : [];
            const skipped = Array.isArray(data.skipped_event_ids) ? data.skipped_event_ids : [];
            await removeEventsFromQueue([...applied, ...skipped]);

            if (!silent && (applied.length > 0 || skipped.length > 0) && window.StudioUI?.showToast) {
                window.StudioUI.showToast(`Synced ${applied.length} session${applied.length === 1 ? '' : 's'} to server`, 'success', 3000);
            }

            if (applied.length > 0 && onRefreshNeeded) {
                onRefreshNeeded();
            }
        } catch (e) {
            if (!silent && window.StudioUI?.showToast) {
                window.StudioUI.showToast('Saved offline. Will retry sync when online.', 'warning', 3500);
            }
        } finally {
            syncFlushInFlight = false;
        }
    }

    function bindSyncLifecycle() {
        if (!isOfflineSyncEnabled() || syncLifecycleBound) return;
        syncLifecycleBound = true;

        window.addEventListener('online', () => {
            flushQueueWhenOnline({ silent: false });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                flushQueueWhenOnline({ silent: true });
            }
        });
    }

    async function fetchStudioData() {
        const requests = [
            fetch(config.apiUrl + '&action=get_lists&t=' + Date.now()),
            fetch(config.apiUrl + '&action=get_scores&t=' + Date.now()),
            fetch(config.apiUrl + '&action=get_word_stats&t=' + Date.now())
        ];

        if (config.enableKanjiCorner) {
            requests.push(
                fetch(config.apiUrl + '&action=get_kanji_mnemonics&t=' + Date.now()).catch(() => null)
            );
        }

        const [lRes, sRes, statsRes, mnemonicRes] = await Promise.all(requests);

        // Private account data: bounce to sign-in when the session has expired.
        if (isUnauthenticatedResponse(lRes) || isUnauthenticatedResponse(sRes) || isUnauthenticatedResponse(statsRes)) {
            redirectToSignIn();
            throw new Error('Not signed in');
        }

        const loadedLists = await safeJson(lRes, {});
        const loadedScores = await safeJson(sRes, {});
        const wordStats = await safeJson(statsRes, {});
        let kanjiMnemonics = {};
        if (mnemonicRes && mnemonicRes.ok) {
            kanjiMnemonics = await safeJson(mnemonicRes, {});
        }

        if (isOfflineSyncEnabled()) {
            saveSnapshotCache({
                lists: loadedLists,
                scores: loadedScores,
                stats: wordStats,
                mnemonics: kanjiMnemonics
            });
        }

        return { loadedLists, loadedScores, wordStats, kanjiMnemonics };
    }

    async function saveList(name, words) {
        return apiFetch(config.apiUrl + '&action=save_list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, words, ...getWriteAuthPayload() })
        });
    }

    async function deleteList(name) {
        return apiFetch(config.apiUrl + '&action=delete_list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, ...getWriteAuthPayload() })
        });
    }

    async function saveScore(listName, score, mode) {
        return apiFetch(config.apiUrl + '&action=save_score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listName, score, mode, ...getWriteAuthPayload() })
        });
    }

    async function updateWordStats(results, isPurification = false) {
        return apiFetch(config.apiUrl + '&action=update_word_stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ results, is_purification: isPurification, ...getWriteAuthPayload() })
        });
    }

    async function lookupWord(word) {
        const response = await fetch(`${config.apiUrl}&action=lookup&word=${encodeURIComponent(word)}`);
        if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
        return response.json();
    }

    return {
        init,
        getConfig,
        getActiveLang,
        isOfflineSyncEnabled,
        getSyncToken,
        getWriteAuthPayload,
        getSyncDeviceId,
        apiFetch,
        readPendingQueue,
        enqueueSyncEvent,
        buildSessionEvent,
        applySessionLocally,
        saveSnapshotCache,
        loadSnapshotCache,
        loadBundledSnapshot,
        flushQueueWhenOnline,
        fetchStudioData,
        saveList,
        deleteList,
        saveScore,
        updateWordStats,
        lookupWord
    };
})();
