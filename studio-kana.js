/**
 * studio-kana.js: the kana quiz that lives at /kana.
 *
 * The drill follows the one at kuuuube.github.io/kana-quiz: one kana at a time, type
 * its romaji, and a pool that requeues whatever you get wrong. It is rebuilt in this
 * studio's vocabulary rather than copied: one checkbox per gojuon row instead of one
 * per kana, the studio's own tokens and rules, and the sound tool speaks the kana with
 * the browser's voice instead of shipping recorded audio.
 *
 * This page loads no app script, so the module mounts itself and owns everything it
 * needs: the drill, its options, and the dark-mode switch in the bar.
 */
window.StudioKana = (() => {
    const STORAGE_SUFFIX = 'kana_v1';
    const DEFAULT_SET = 'hsingle';

    // One entry per gojuon row, in the order the charts print them. A row's checkbox
    // carries this key, and the label under each row is generated from the readings
    // themselves, so the options list can never drift from the data.
    const KANA = {
        hsingle: { 'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o' },
        hk: { 'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko' },
        hs: { 'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so' },
        ht: { 'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to' },
        hn: { 'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no' },
        hh: { 'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho' },
        hm: { 'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo' },
        hy: { 'や': 'ya', 'ゆ': 'yu', 'よ': 'yo' },
        hr: { 'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro' },
        hw: { 'わ': 'wa', 'を': 'wo' },
        hn1: { 'ん': 'n' },
        hg: { 'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go' },
        hz: { 'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo' },
        hd: { 'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do' },
        hb: { 'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo' },
        hp: { 'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po' },

        hdk: { 'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo' },
        hds: { 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho' },
        hdc: { 'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho' },
        hdn: { 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo' },
        hdh: { 'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo' },
        hdm: { 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo' },
        hdr: { 'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo' },
        hdg: { 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo' },
        hdj: { 'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo' },
        hdj2: { 'ぢゃ': 'dya', 'ぢゅ': 'dyu', 'ぢょ': 'dyo' },
        hdb: { 'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo' },
        hdp: { 'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo' },

        ksingle: { 'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o' },
        kk: { 'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko' },
        ks: { 'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so' },
        kt: { 'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to' },
        kn: { 'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no' },
        kh: { 'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho' },
        km: { 'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo' },
        ky: { 'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo' },
        kr: { 'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro' },
        kw: { 'ワ': 'wa', 'ヲ': 'o' },
        kn1: { 'ン': 'n' },
        kg: { 'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go' },
        kz: { 'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo' },
        kd: { 'ダ': 'da', 'ヂ': 'di', 'ヅ': 'du', 'デ': 'de', 'ド': 'do' },
        kb: { 'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo' },
        kp: { 'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po' },

        kdk: { 'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo' },
        kds: { 'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho' },
        kdc: { 'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho' },
        kdn: { 'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo' },
        kdh: { 'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo' },
        kdm: { 'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo' },
        kdr: { 'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo' },
        kdg: { 'ギャ': 'gya', 'ギュ': 'gyu', 'ギョ': 'gyo' },
        kdj: { 'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo' },
        kdj2: { 'ヂャ': 'dya', 'ヂュ': 'dyu', 'ヂョ': 'dyo' },
        kdb: { 'ビャ': 'bya', 'ビュ': 'byu', 'ビョ': 'byo' },
        kdp: { 'ピャ': 'pya', 'ピュ': 'pyu', 'ピョ': 'pyo' },

        ekw: { 'ウィ': 'wi', 'ウェ': 'we', 'ウォ': 'wo' },
        ekv: { 'ヴァ': 'va', 'ヴィ': 'vi', 'ヴ': 'vu', 'ヴェ': 've', 'ヴォ': 'vo' },
        ekf: { 'ファ': 'fa', 'フィ': 'fi', 'フェ': 'fe', 'フォ': 'fo' },
        ekt: { 'ツァ': 'tsa', 'ツィ': 'tsi', 'ツェ': 'tse', 'ツォ': 'tso' },
        ekmisc: { 'ティ': 'ti', 'トゥ': 'tu', 'シェ': 'she' },
        ekmisc2: { 'ディ': 'di', 'ドゥ': 'du', 'ジェ': 'je' },
        ekmisc3: { 'チェ': 'che' }
    };

    const GROUPS = [
        { title: 'Hiragana', sets: ['hsingle', 'hk', 'hs', 'ht', 'hn', 'hh', 'hm', 'hy', 'hr', 'hw', 'hn1', 'hg', 'hz', 'hd', 'hb', 'hp'] },
        { title: 'Hiragana combinations', sets: ['hdk', 'hds', 'hdc', 'hdn', 'hdh', 'hdm', 'hdr', 'hdg', 'hdj', 'hdj2', 'hdb', 'hdp'] },
        { title: 'Katakana', sets: ['ksingle', 'kk', 'ks', 'kt', 'kn', 'kh', 'km', 'ky', 'kr', 'kw', 'kn1', 'kg', 'kz', 'kd', 'kb', 'kp'] },
        { title: 'Katakana extended', sets: ['ekw', 'ekv', 'ekf', 'ekt', 'ekmisc', 'ekmisc2', 'ekmisc3'] }
    ];

    // Readings the charts disagree about. The first spelling is what gets shown; the rest
    // are accepted, because a learner who types "si" for し is not wrong.
    const REPLACEMENTS = {
        wo: ['o'], chi: ['ti'], shi: ['si'], tsu: ['tu'], fu: ['hu'],
        du: ['zu', 'dwu'], di: ['ji', 'zi', 'dhi'],
        dya: ['ja'], dyo: ['jo'], dyu: ['ju'],
        sha: ['sya'], shu: ['syu'], sho: ['syo'],
        tsa: ['tza'], tsi: ['tzi'], tse: ['tze'], tso: ['tzo'],
        tu: ['twu'], ti: ['thi']
    };

    // What the answer line shows when a reading has a commoner spelling.
    const DISPLAY = { wo: 'o', du: 'zu', di: 'ji', dya: 'ja', dyo: 'jo', dyu: 'ju' };

    let sets = [];
    let wrongHint = true;
    let wrongAudio = true;

    let pool = [];
    let queue = [];
    let current = null;
    let wrong = false;
    let answered = 0;
    let correct = 0;

    const el = id => document.getElementById(id);
    const storageKey = () => 'studio_' + STORAGE_SUFFIX;
    const display = source => DISPLAY[source] || source;

    function readSettings() {
        try {
            const stored = JSON.parse(localStorage.getItem(storageKey()) || 'null');
            if (stored) {
                if (Array.isArray(stored.sets)) sets = stored.sets.filter(id => KANA[id]);
                wrongHint = stored.wrongHint !== false;
                wrongAudio = stored.wrongAudio !== false;
            }
        } catch (error) { }
        if (!sets.length) sets = [DEFAULT_SET];
    }

    function writeSettings() {
        try {
            localStorage.setItem(storageKey(), JSON.stringify({ sets, wrongHint, wrongAudio }));
        } catch (error) { }
    }

    function shuffle(list) {
        const out = list.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    function collect() {
        pool = [];
        sets.forEach(id => {
            Object.keys(KANA[id] || {}).forEach(kana => pool.push([kana, KANA[id][kana]]));
        });
        queue = shuffle(pool);
    }

    function setStatus(text) {
        const message = el('kana-message');
        if (message) message.innerHTML = text || '&nbsp;';
    }

    function next() {
        wrong = false;
        const input = el('kana-input');
        if (input) input.value = '';
        setStatus('');

        if (!pool.length) collect();
        if (!queue.length) queue = shuffle(pool);

        // Never the same kana twice in a row, which is the one thing a shuffle can do
        // that feels broken.
        if (current && queue.length > 1 && queue[0][0] === current[0]) queue.push(queue.shift());

        current = queue.shift() || pool[0];
        paint();
    }

    function paint() {
        const glyph = el('kana-glyph');
        const answer = el('kana-answer');
        if (glyph) glyph.textContent = current ? current[0] : '';
        if (answer) {
            answer.textContent = current ? display(current[1]) : '';
            answer.classList.add('is-hidden');
        }
        const count = el('kana-count');
        if (count) count.textContent = `${correct}/${answered}`;
        const input = el('kana-input');
        if (input) input.focus();
    }

    function check(value) {
        const answer = String(value || '').toLowerCase().trim();
        if (!answer || !current) return;

        const accepted = [current[1]].concat(REPLACEMENTS[current[1]] || []);
        if (accepted.some(candidate => candidate === answer)) {
            answered += 1;
            if (!wrong) correct += 1;
            next();
            return;
        }
        // Still typing towards a reading that would be accepted: say nothing yet.
        if (accepted.some(candidate => candidate.startsWith(answer))) return;

        if (!wrong) {
            wrong = true;
            if (wrongHint) setStatus(`<span class="kana-wrong">${current[0]} = ${display(current[1])}</span>`);
            if (wrongAudio) speak();
        }
    }

    // The reference ships recorded audio per kana. This asks the browser for a Japanese
    // voice instead, so the tool has no asset to load and nothing to keep in sync.
    function speak() {
        if (!current || !('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(current[0]);
            utterance.lang = 'ja-JP';
            utterance.rate = 0.8;
            window.speechSynthesis.speak(utterance);
        } catch (error) { }
        const input = el('kana-input');
        if (input) input.focus();
    }

    function skip() {
        if (!current) return;
        // A wrong answer goes back into the pool a few places ahead, so it comes round
        // again in the same sitting rather than at the end of the queue.
        if (queue.length > 3) queue.splice(3, 0, [current[0], current[1]]);
        if (queue.length > 13) queue.splice(13, 0, [current[0], current[1]]);
        answered += 1;
        next();
    }

    function toggleSet(id, on) {
        if (on) {
            if (!sets.includes(id)) sets.push(id);
        } else {
            sets = sets.filter(existing => existing !== id);
        }
    }

    function syncBoxes(root) {
        root.querySelectorAll('.kanacheck').forEach(box => { box.checked = sets.includes(box.id); });
    }

    function optionsMarkup() {
        return GROUPS.map(group => `
            <section class="kana-group">
                <div class="kana-group-head">
                    <h3>${group.title}</h3>
                    <div class="kana-group-actions">
                        <button type="button" class="kana-link" data-kana-all="${group.sets.join(' ')}">check all</button>
                        <button type="button" class="kana-link" data-kana-none="${group.sets.join(' ')}">uncheck all</button>
                    </div>
                </div>
                <div class="kana-rows">
                    ${group.sets.map(id => {
                        const entries = Object.entries(KANA[id] || {});
                        return `<label class="kana-row">
                            <input type="checkbox" class="kanacheck" id="${id}" ${sets.includes(id) ? 'checked' : ''}>
                            <span class="kana-row-glyphs" lang="ja">${entries.map(([kana]) => kana).join(' ')}</span>
                            <span class="kana-row-readings">${entries.map(([, reading]) => reading).join(' ')}</span>
                        </label>`;
                    }).join('')}
                </div>
            </section>`).join('');
    }

    function bind(root) {
        const input = el('kana-input');
        input.addEventListener('input', () => check(input.value));

        // Space and Enter move the drill on, from anywhere on the page, the way the
        // reference works. Typing anywhere lands in the answer field.
        document.addEventListener('keydown', event => {
            if (event.ctrlKey || event.altKey || event.metaKey) return;
            const isSubmit = event.key === ' ' || event.key === 'Enter';
            if (isSubmit) {
                event.preventDefault();
                if (wrong) skip();
                else check(input.value);
                return;
            }
            if (event.key.length === 1 && document.activeElement !== input) input.focus();
        });

        const wrap = root.querySelector('.kana-glyph-wrap');
        const showAnswer = () => el('kana-answer').classList.remove('is-hidden');
        const hideAnswer = () => el('kana-answer').classList.add('is-hidden');
        wrap.addEventListener('mouseenter', showAnswer);
        wrap.addEventListener('mouseleave', hideAnswer);
        wrap.addEventListener('touchstart', showAnswer, { passive: true });

        el('kana-sound').onclick = speak;

        root.querySelectorAll('.kanacheck').forEach(box => {
            box.addEventListener('change', () => {
                toggleSet(box.id, box.checked);
                if (!sets.length) {
                    // An empty pool would leave the drill with nothing to ask, so the first
                    // row comes back on rather than the page going blank.
                    sets = [DEFAULT_SET];
                    syncBoxes(root);
                    setStatus('<span class="kana-wrong">Keep at least one row checked.</span>');
                }
                writeSettings();
                collect();
                next();
            });
        });

        root.querySelectorAll('[data-kana-all]').forEach(button => {
            button.onclick = () => {
                button.dataset.kanaAll.split(' ').forEach(id => toggleSet(id, true));
                syncBoxes(root); writeSettings(); collect(); next();
            };
        });

        root.querySelectorAll('[data-kana-none]').forEach(button => {
            button.onclick = () => {
                button.dataset.kanaNone.split(' ').forEach(id => toggleSet(id, false));
                if (!sets.length) sets = [DEFAULT_SET];
                syncBoxes(root); writeSettings(); collect(); next();
            };
        });

        el('kana-wrong-hint').addEventListener('change', event => {
            wrongHint = event.target.checked; writeSettings();
        });
        el('kana-wrong-audio').addEventListener('change', event => {
            wrongAudio = event.target.checked; writeSettings();
        });
    }

    // The page loads no app script, so it carries its own switch for the same preference
    // the studio's header writes. Both pages then turn over together.
    function bindDarkMode() {
        const box = el('dark-mode-checkbox');
        if (!box) return;
        const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
        box.checked = isDark;
        box.addEventListener('change', () => {
            document.documentElement.classList.toggle('dark', box.checked);
            document.body.classList.toggle('dark', box.checked);
            try { localStorage.setItem('studio_dark_mode', box.checked ? 'true' : 'false'); } catch (error) { }
            const meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', box.checked ? '#121417' : '#f5f7f9');
        });
    }

    function mount() {
        const root = el('kana-root');
        if (!root) return;

        readSettings();
        collect();
        root.innerHTML = `
            <div class="kana-stage">
                <div class="kana-glyph-wrap">
                    <span id="kana-glyph" class="kana-glyph" lang="ja"></span>
                    <span id="kana-answer" class="kana-answer is-hidden" lang="ja"></span>
                </div>
                <div class="kana-controls">
                    <input id="kana-input" class="kana-input" type="text" autocomplete="off"
                        autocapitalize="none" autocorrect="off" spellcheck="false"
                        aria-label="Type the romaji reading" placeholder="romaji">
                    <span id="kana-count" class="kana-count" aria-live="polite">0/0</span>
                </div>
                <p id="kana-message" class="kana-message" role="status">&nbsp;</p>
                <div class="kana-tools">
                    <button type="button" id="kana-sound" class="kana-link">Play sound</button>
                    <span class="kana-tool-note">Space moves on. Hover the kana to see the reading.</span>
                </div>
            </div>

            <details class="kana-options">
                <summary>Options</summary>
                ${optionsMarkup()}
                <section class="kana-group">
                    <div class="kana-group-head"><h3>Misc</h3></div>
                    <label class="kana-row kana-row--misc">
                        <input type="checkbox" id="kana-wrong-hint" ${wrongHint ? 'checked' : ''}>
                        <span>Show the answer when I get it wrong</span>
                    </label>
                    <label class="kana-row kana-row--misc">
                        <input type="checkbox" id="kana-wrong-audio" ${wrongAudio ? 'checked' : ''}>
                        <span>Say the kana when I get it wrong</span>
                    </label>
                </section>
            </details>`;

        bind(root);
        bindDarkMode();
        next();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();

    return { mount };
})();
