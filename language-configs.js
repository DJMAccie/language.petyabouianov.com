// language-configs.js
// Unified frontend configurations for Language Studio pages
window.StudioConfigs = {};

// ==========================================
// 1. NIHONGO (JAPANESE) CONFIGURATION
// ==========================================
(function () {
    let recognition = null;
    let bestJapaneseVoice = null;

    const quotes = [
        { jp: "七転び八起き", en: "Fall seven times, stand up eight.", reading: "Nana korobi ya oki" },
        { jp: "猿も木から落ちる", en: "Even monkeys fall from trees.", reading: "Saru mo ki kara ochiru" },
        { jp: "継続は力なり", en: "Perseverance is power.", reading: "Keizoku wa chikara nari" },
        { jp: "一期一会", en: "Once in a lifetime encounter.", reading: "Ichigo ichie" },
        { jp: "千里の道も一歩から", en: "A journey of a thousand miles begins with a single step.", reading: "Senri no michi mo ippo kara" },
        { jp: "花鳥風月", en: "Experience the beauties of nature.", reading: "Kachou Fuugetsu" },
        { jp: "井の中の蛙大海を知らず", en: "A frog in a well knows not the great ocean.", reading: "I no naka no kawazu taikai wo shirazu" }
    ];

    function normalize(text) {
        if (!text) return "";
        return text.toString().toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[\[\]\(\)\{\}「」『』【】]/g, '')
            .replace(/[.,?!'":;。、！？・—\-_\/\\~～…‥«»""'']/g, '');
    }

    function initVoices() {
        if (!('speechSynthesis' in window)) return;
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) return;
            const prefs = ['Google 日本語', 'Kyoko', 'Haruka', 'Nanami', 'Ichiro'];
            for (const p of prefs) {
                const matches = voices.filter(v => v.name.includes(p));
                if (matches.length > 0) {
                    bestJapaneseVoice = matches.find(v => v.name.includes('Premium') || v.name.includes('Enhanced')) || matches[0];
                    break;
                }
            }
            if (!bestJapaneseVoice) bestJapaneseVoice = voices.find(v => v.lang.startsWith('ja'));
        };
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
    }

    function speakText(text) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        let cleanText = text.replace(/\s+[A-Za-z\s\?\!\.\,'-]+$/, '').trim().replace(/[\(\[【（].*?[\)\]】）]/g, '').trim();
        let textToSpeak = (typeof wanakana !== 'undefined') ? wanakana.toHiragana(cleanText) : cleanText;
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        if (bestJapaneseVoice) utterance.voice = bestJapaneseVoice;
        window.speechSynthesis.speak(utterance);
    }

    function checkAnswerMatch(user, correct, mode, pair) {
        const nUser = normalize(user);
        const nCorrect = normalize(correct);
        const minLength = nCorrect.length <= 2 ? 1 : 2;
        if (nUser.length >= minLength) {
            if (nCorrect.includes(nUser)) return true;
            if (window.wanakana) {
                const uHira = window.wanakana.toHiragana(nUser), uKata = window.wanakana.toKatakana(nUser), cHira = window.wanakana.toHiragana(nCorrect);
                if (nCorrect.includes(uHira) || nCorrect.includes(uKata) || cHira.includes(uHira) || cHira.includes(nUser)) return true;
            }
        }
        return false;
    }

    window.StudioConfigs.nihongo = {
        apiUrl: 'studio_api.php?lang=nihongo',
        favicon: '🇯🇵',
        lang: 'ja-JP',
        streakKey: 'ns',
        quotes: quotes,
        normalize: normalize,
        checkAnswerMatch: checkAnswerMatch,
        initVoices: initVoices,
        speakText: speakText,
        gauntletLabel: "GAUNTLET (EN → JP)",
        speechLabel: "SPEAKING (EN → JP)",
        enableKanjiCorner: true,
        enableKanjiCornerListPicker: true,
        kanjiListName: 'Kanji',
        kanjiListPrefix: 'Kanji ',
        startTraining: function (name) {
            const loadedLists = window._studio.getLoadedLists();
            if (!loadedLists[name]) return;
            StudioCore.setState('currentListName', name + " (Training)");
            StudioCore.setState('isPurificationSession', false);
            const allWords = [...loadedLists[name]];
            const size = Math.min(allWords.length, allWords.length <= 30 ? Math.max(3, Math.ceil(allWords.length * 0.3)) : Math.ceil(allWords.length * 0.1));
            StudioCore.setState('wordList', allWords.sort(() => Math.random() - 0.5).slice(0, size));
            StudioCore.startSession();
        }
    };
})();

// ==========================================
// 2. SASCHA (TRAVEL JAPANESE) CONFIGURATION
// ==========================================
(function () {
    const baseConfig = window.StudioConfigs.nihongo;
    const quotes = [
        { jp: "旅は道連れ世は情け", en: "Travel is easier with kindness from others.", reading: "Tabi wa michizure yo wa nasake" },
        { jp: "案ずるより産むが易し", en: "Doing it is easier than worrying about it.", reading: "Anzuru yori umu ga yasushi" },
        { jp: "習うより慣れろ", en: "Learn by getting used to it.", reading: "Narau yori narero" }
    ];

    window.StudioConfigs.sascha = {
        ...baseConfig,
        apiUrl: 'studio_api.php?lang=sascha',
        streakKey: 'ns_sascha',
        quotes: quotes,
        defaultQuizMode: 'jp-en',
        speechLabel: "SPEAKING (EN → JP)"
    };
})();

// ==========================================
// 3. BAHASA (INDONESIAN) CONFIGURATION
// ==========================================
(function () {
    let bestIndoVoice = null;
    const quotes = [
        { jp: "Bisa karena biasa", en: "Practice makes perfect", reading: "" },
        { jp: "Sedikit demi sedikit, lama-lama menjadi bukit", en: "Little by little, long it becomes a hill", reading: "" },
        { jp: "Di mana bumi dipijak, di situ langit dijunjung", en: "When in Rome, do as the Romans do", reading: "" },
        { jp: "Ada udang di balik batu", en: "There is a hidden motive", reading: "" }
    ];

    function normalize(text) {
        if (!text) return "";
        return text.toString().toLowerCase().replace(/\s+/g, '').replace(/[.,?!'":;—\-_/\\~]/g, '');
    }

    function initVoices() {
        if (!('speechSynthesis' in window)) return;
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) return;
            const prefs = ['Google Bahasa Indonesia', 'Damayanti', 'Gadis', 'Andika'];
            for (const p of prefs) {
                const matches = voices.filter(v => v.name.includes(p));
                if (matches.length > 0) {
                    bestIndoVoice = matches.find(v => v.name.includes('Premium') || v.name.includes('Enhanced')) || matches[0];
                    break;
                }
            }
            if (!bestIndoVoice) bestIndoVoice = voices.find(v => v.lang.startsWith('id'));
        };
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
    }

    function speakText(text) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        let cleanText = text.replace(/[\(\[].*?[\)\]]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'id-ID';
        if (bestIndoVoice) utterance.voice = bestIndoVoice;
        window.speechSynthesis.speak(utterance);
    }

    function checkAnswerMatch(user, correct) {
        const u = normalize(user), c = normalize(correct);
        const minLength = c.length <= 2 ? 1 : 2;
        return u.length >= minLength && (c === u || c.includes(u) || u.includes(c));
    }

    window.StudioConfigs.bahasa = {
        apiUrl: 'studio_api.php?lang=bahasa',
        favicon: '🇮🇩',
        lang: 'id-ID',
        streakKey: 'bs',
        quotes: quotes,
        normalize: normalize,
        checkAnswerMatch: checkAnswerMatch,
        initVoices: initVoices,
        speakText: speakText,
        gauntletLabel: "GAUNTLET (EN → ID)",
        speechLabel: "SPEAKING (EN → ID)",
        startTraining: function (name) {
            const loadedLists = window._studio.getLoadedLists();
            if (!loadedLists[name]) return;
            StudioCore.setState('currentListName', name + " (Training)");
            StudioCore.setState('isPurificationSession', false);
            const allWords = [...loadedLists[name]];
            const size = Math.min(allWords.length, allWords.length <= 30 ? Math.max(3, Math.ceil(allWords.length * 0.3)) : Math.ceil(allWords.length * 0.1));
            StudioCore.setState('wordList', allWords.sort(() => Math.random() - 0.5).slice(0, size));
            StudioCore.startSession();
        }
    };
})();

// ==========================================
// 4. ITALIA (ITALIAN) CONFIGURATION
// ==========================================
(function () {
    let bestItalianVoice = null;
    const quotes = [
        { jp: "Chi va piano va sano e va lontano", en: "Slow and steady wins the race", reading: "" },
        { jp: "Roma non è stata costruita in un giorno", en: "Rome wasn't built in a day", reading: "" },
        { jp: "Meglio tardi che mai", en: "Better late than never", reading: "" },
        { jp: "A mali estremi, estremi rimedi", en: "Desperate times call for desperate measures", reading: "" }
    ];

    function normalize(text) {
        if (!text) return "";
        return text.toString().toLowerCase().replace(/\s+/g, '').replace(/[.,?!'":;—\-_/\\~]/g, '');
    }

    function initVoices() {
        if (!('speechSynthesis' in window)) return;
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) return;
            const prefs = ['Google italiano', 'Alice', 'Federica', 'Paola', 'Luca'];
            for (const p of prefs) {
                const matches = voices.filter(v => v.name.includes(p));
                if (matches.length > 0) {
                    bestItalianVoice = matches.find(v => v.name.includes('Premium') || v.name.includes('Enhanced')) || matches[0];
                    break;
                }
            }
            if (!bestItalianVoice) bestItalianVoice = voices.find(v => v.lang.startsWith('it'));
        };
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
    }

    function speakText(text) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        let cleanText = text.replace(/[\(\[].*?[\)\]]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'it-IT';
        if (bestItalianVoice) utterance.voice = bestItalianVoice;
        window.speechSynthesis.speak(utterance);
    }

    function checkAnswerMatch(user, correct) {
        const u = normalize(user), c = normalize(correct);
        const minLength = c.length <= 2 ? 1 : 2;
        return u.length >= minLength && (c === u || c.includes(u) || u.includes(c));
    }

    window.StudioConfigs.italia = {
        apiUrl: 'studio_api.php?lang=italia',
        favicon: '🇮🇹',
        lang: 'it-IT',
        streakKey: 'is',
        quotes: quotes,
        normalize: normalize,
        checkAnswerMatch: checkAnswerMatch,
        initVoices: initVoices,
        speakText: speakText,
        gauntletLabel: "GAUNTLET (EN → IT)",
        speechLabel: "SPEAKING (EN → IT)",
        startTraining: function (name) {
            const loadedLists = window._studio.getLoadedLists();
            if (!loadedLists[name]) return;
            StudioCore.setState('currentListName', name + " (Training)");
            StudioCore.setState('isPurificationSession', false);
            const allWords = [...loadedLists[name]];
            const size = Math.min(allWords.length, allWords.length <= 30 ? Math.max(3, Math.ceil(allWords.length * 0.3)) : Math.ceil(allWords.length * 0.1));
            StudioCore.setState('wordList', allWords.sort(() => Math.random() - 0.5).slice(0, size));
            StudioCore.startSession();
        }
    };
})();

// ==========================================
// 5. NEDERLANDS (DUTCH) CONFIGURATION
// ==========================================
(function () {
    let bestDutchVoice = null;
    const quotes = [
        { jp: "Oost west, thuis best", en: "East west, home's best", reading: "" },
        { jp: "Een goed begin is het halve werk", en: "A good beginning is half the battle", reading: "" },
        { jp: "Al draagt een aap een gouden ring, het is en blijft een lelijk ding", en: "Clothes don't make the man", reading: "" }
    ];

    function normalize(text) {
        if (!text) return "";
        return text.toString().toLowerCase().replace(/\s+/g, '').replace(/[.,?!'":;—\-_/\\~]/g, '');
    }

    function initVoices() {
        if (!('speechSynthesis' in window)) return;
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) return;
            const prefs = ['Google Nederlands', 'Xander', 'Claire', 'Laura'];
            for (const p of prefs) {
                const matches = voices.filter(v => v.name.includes(p));
                if (matches.length > 0) {
                    bestDutchVoice = matches.find(v => v.name.includes('Premium') || v.name.includes('Enhanced')) || matches[0];
                    break;
                }
            }
            if (!bestDutchVoice) bestDutchVoice = voices.find(v => v.lang.startsWith('nl'));
        };
        loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = loadVoices;
    }

    function speakText(text) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        let cleanText = text.replace(/[\(\[].*?[\)\]]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'nl-NL';
        if (bestDutchVoice) utterance.voice = bestDutchVoice;
        window.speechSynthesis.speak(utterance);
    }

    function checkAnswerMatch(user, correct) {
        const u = normalize(user), c = normalize(correct);
        const minLength = c.length <= 2 ? 1 : 2;
        return u.length >= minLength && (c === u || c.includes(u) || u.includes(c));
    }

    window.StudioConfigs.nederlands = {
        apiUrl: 'studio_api.php?lang=nederlands',
        favicon: '🇳🇱',
        lang: 'nl-NL',
        streakKey: 'ns_nl',
        quotes: quotes,
        normalize: normalize,
        checkAnswerMatch: checkAnswerMatch,
        initVoices: initVoices,
        speakText: speakText,
        gauntletLabel: "GAUNTLET (EN → NL)",
        speechLabel: "SPEAKING (EN → NL)",
        startTraining: function (name) {
            const loadedLists = window._studio.getLoadedLists();
            if (!loadedLists[name]) return;
            StudioCore.setState('currentListName', name + " (Training)");
            StudioCore.setState('isPurificationSession', false);
            const allWords = [...loadedLists[name]];
            const size = Math.min(allWords.length, allWords.length <= 30 ? Math.max(3, Math.ceil(allWords.length * 0.3)) : Math.ceil(allWords.length * 0.1));
            StudioCore.setState('wordList', allWords.sort(() => Math.random() - 0.5).slice(0, size));
            StudioCore.startSession();
        }
    };
})();
