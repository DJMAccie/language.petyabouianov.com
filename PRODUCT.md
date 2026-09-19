# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: strangers who arrive from search.** Nihongo Studio is a public, free web
product, and its audience is people who have never seen it before. First-run clarity
outranks power-user shortcuts, and no visitor is assumed to know the author.

Two confirmed audiences, in the About page's own terms:

- People heading to Japan who want enough words to get around.
- People growing everyday vocabulary without hunting for a word list first.

The sharper audience truth, confirmed directly: **people who hate Anki** — who found
spaced-repetition tooling heavy, fiddly, or hard to start — and **people who enjoy
WaniKani**. The first group needs the on-ramp to be trivial: open it, read five words,
answer for them. The second already likes structured, opinionated study and is looking
for the same feel applied to vocabulary at volume rather than a kanji-first progression.

Guest visitors are first-class: the whole app is open with no account, no trial, and no
locked lists. Accounts exist for cross-device sync and for editing or creating lists —
they serve a subset of the audience rather than gating it.

## Product Purpose

A free web app for learning everyday Japanese vocabulary, built around a library of 84
themed word lists. It exists so that a learner can start studying immediately instead of
first assembling material, and it is meant to be usable in spare minutes rather than long
sessions: a lesson introduces five words, takes a couple of minutes, and finishing a set
brings up the next one.

The app is free in full. One person builds, curates, and pays for it.

## Positioning

**The word lists are already built.** That is the load-bearing promise, and the mechanism
behind it: 84 themed lists grouped by theme rather than alphabetised, so each list is
something a learner can finish and then use, with the useful words first in each list
(Starter Kit covers the greetings, pronouns, and polite forms most sentences lean on).
A neighbouring product could not truthfully copy the claim without doing the curation
itself. The five-word lesson shape, the no-account default, and the editable personal
copies all support that promise rather than competing with it.

The confirmed mental model, in the owner's words: **"kind of WaniKani, but more focused on
getting loads of vocab in quickly."** WaniKani is the reference point for the *feel* —
structured, curated, opinionated about what you learn next — while the differentiator is
vocabulary volume and speed to first value. The anti-reference is Anki: setup, decks, and
configuration before any learning. Simplicity of start is therefore a feature of the
product, not a limitation of it.

**The one-line answer to what this is**, in the owner's words: **"Learn Japanese vocabulary
in a simple and effective way."** Simple is the anti-Anki half and effective is the WaniKani
half, and it is broader than the trip story the page currently frames itself with: the trip
is where the product came from, not the only reason to use it.

## Operating Context

- Study happens in short, focused bursts on desktop and mobile web, often against a trip
  deadline; Travel Essentials and Restaurant & Bar are the lists opened before travel.
- The library is the entry point: a learner browses themes, opens a list, and studies it.
- Progress is kept in the browser for guests and in the account for signed-in users;
  the daily screen tracks how many sets have been cleared, and a review queue re-serves
  words that are due or were struggled with.
- The product is operated by a single curator on shared hosting who also maintains the
  word lists and quizzes by hand.
- A legacy `.impeccable.md` in the repository describes the app as a personal
  language-study workspace. That framing is superseded: the public product is the
  audience, and the file's remaining value is historical.

## Capabilities and Constraints

Confirmed capabilities, in the product's own terminology:

- **Lesson** — a batch of five words, shown before they are tested, with the option to add
  five more; **Review** — a queue of already-met words ordered by due date, then by
  difficulty; words leave it as they are answered correctly.
- **Four answering modes**: JP → EN, EN → JP, speech (say the word aloud), and multiple
  choice. Typed answers accept romaji and Enter submits.
- **Kanji Corner** — 20 kanji packs behind the header's torii icon, with a picker and
  mnemonics.
- **Kana quiz** — its own page at `/kana`, reached from the header icon beside the torii.
  One kana at a time, type the romaji, wrong answers come back in the same sitting. The
  gojuon rows are the unit of selection, and the settings persist in the browser. It is the
  only surface that needs no library, no account and no backend, so it loads on its own with
  nothing but the stylesheet and one script.
- **Lists** — the shared library is read-only for visitors; signing in allows editing,
  creating, and splitting lists, and personal edits never touch the shared library.
- **Dictionary** — Jisho-powered lookup proxied by the backend; grammar notes sit beside
  it. Speech synthesis and recognition, and kana input, are used for pronunciation work.
- **Settings** — opened from the account icon in the header: the Japan trip arrival date,
  counted down in the status line beside the study days while a trip is set and still
  ahead, plus the sign-in path. Settings follow the account when signed in and stay in the
  browser for guests.
- Progress signals: streak, per-word accuracy, Mastered / Learning / New, and a
  2,000-word goal.

Constraints:

- **Platform is web.** `ios-app/` (a Capacitor wrapper) and `expo-go-client/` (an Expo
  WebView client) are experiments, not supported surfaces: neither is deployed, both are
  excluded from the build, and neither may drive design decisions. Mobile web stays web.
- **No database.** PHP on Apache shared hosting, with JSON files serialized through
  `flock` and atomic writes; per-account data lives in `users/<account>/`, which is
  git-ignored and denied by `.htaccess`.
- **Deploy is an explicit whitelist** (four HTML pages, two stylesheets, nine scripts, six
  data files, assets, SEO files, and three PHP files) with forbidden-name and secret
  audits. Anything outside the whitelist does not ship.
- Four routes: `/` (launcher), `/nihongo-studio` (the app), `/login`, `/about`.
- Signing in with Google or Apple creates a separate account from a username and
  password; the two routes are not linked.
- No billing, no advertising, and no analytics of any kind.

Open product decisions, recorded rather than invented:

- Success criteria are not established; the project carries no targets or metrics.
- Licensing for the word lists, the kanji mnemonics, and the bundled OpenMoji images is
  undecided — the repository has no LICENSE file.
- Whether Google and Apple sign-in are live in production is unverified locally.
- `pokopia_words.json` (nine themed lists) ships to production but is wired to nothing.
- Whether public multi-user sign-up is intended at its current scale is unconfirmed,
  though the public marketing and guest-first design assume it is.

## Brand Commitments

- Name: **Nihongo Studio**; canonical origin `language.petyabouianov.com`; author and
  operator Petya Bouianov, linking to `petyabouianov.com`.
- Stated, public commitments that future work must not contradict: free in full with no
  advertising and nothing costing money; no sign-up wall, no trial, no limits on which
  lists can be opened; "accounts store your lists and progress and nothing else";
  donations via Ko-fi are welcome and never expected.
- Existing assets: the inline Japanese-flag SVG icon, the `fa-language` wordmark, and two
  illustrations (`assets/lesson-words.png`, `assets/review-words.png`).
- The interface language is English while the subject matter is Japanese; this split is
  existing product truth, not an oversight to correct silently.

## Evidence on Hand

- `nihongo_lists.json` — the library: 104 lists / 1,413 rows, of which the 84 non-Kanji
  lists hold exactly 1,313 unique words and the remaining 20 are kanji packs. The public
  "84 lists / 1,313 words" figure is therefore a deliberate, consistent count of the
  vocabulary lists only, not drift.
- `kanji_mnemonics.json` — 100 kanji with mnemonic, reading cue, and travel context.
- `global_scores.json` and `global_word_stats.json` — accumulated study history spanning
  several months, consistent with the single curator's own use; `global_lists.json` is the
  legacy pre-accounts library, now a seed and migration source.
- Real UI copy exists for all four pages and is the voice authority; the About page is the
  canonical statement of what the product promises.
- Absences future work must not fabricate: there are no testimonials, no user counts, no
  press, no case studies, no benchmarks, and no analytics figures. The social preview
  image is hosted outside this repository.

## Product Principles

1. **The library is the product.** A visitor should never have to build or find a list
   before studying; curation is the work that makes the app worth opening.
2. **Strangers first.** Anyone arriving from search must understand what this is and start
   a lesson without help, because the primary audience has never seen it before.
3. **Free and open in full.** No paywall, advertisement, trial, or account wall may be
   introduced, and accounts stay limited to lists and progress.
4. **Small sessions win.** Five words is the unit of work; a change that makes a session
   longer or heavier trades away the habit the product is built on.
5. **No setup before learning (the anti-Anki rule).** Decks, configuration, and accounts
   are never prerequisites; anything that inserts a setup step before the first five words
   is a regression against the audience the product is for.
6. **One curator, maintainable by hand.** Content and code must stay editable by a single
   person on shared hosting, without new infrastructure or a team to operate it.

## Accessibility & Inclusion

Observed practice that future work should preserve rather than regress: the studio uses
ARIA labelling and live regions, modal and tab semantics, a screen-reader-only class,
visible focus treatment, Enter-to-submit on typed answers, Escape-to-close on dialogs, and
`prefers-reduced-motion` handling. Text scales in rem with `clamp()` rather than a fixed
pixel grid. Japanese content is not yet marked with `lang="ja"`, there is no locale
switching, and speech is hardcoded to `ja-JP`; no product-specific accessibility standard
has been established.
