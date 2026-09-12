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
        vocabularyGoal: 2000,
        enableCalmDailyPath: true,
        quotes: quotes,
        normalize: normalize,
        checkAnswerMatch: checkAnswerMatch,
        initVoices: initVoices,
        speakText: speakText,
        gauntletLabel: "GAUNTLET (EN → JP)",
        speechLabel: "SPEAKING (EN → JP)",
        enableKanjiCorner: true,
        enableKanjiCornerListPicker: true,
        showKanjiCornerTableRow: false,
        hideKanjiListsFromMainTable: true,
        kanjiListName: 'Kanji',
        kanjiListPrefix: 'Kanji ',
        kanjiCornerCategoryRanges: [
            { label: 'Core Signs', start: 1, end: 4 },
            { label: 'Navigation', start: 5, end: 8 },
            { label: 'Transit & People', start: 9, end: 12 },
            { label: 'Food & Shopping', start: 13, end: 16 },
            { label: 'Travel & Weather', start: 17, end: 20 }
        ],
        kanjiCornerDefaultCategoryLabel: 'Other Kanji',
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
