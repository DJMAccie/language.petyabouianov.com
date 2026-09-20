---
name: Nihongo Studio
description: A calm, list-first Japanese vocabulary studio that lives in one window.
colors:
  studio-blue: "#2e6ee8"
  studio-blue-deep: "#1f56c4"
  studio-blue-text: "#1f56c4"
  key-edge: "#707984"
  studio-blue-wash: "#eef4ff"
  lesson-green: "#27b95d"
  lesson-green-deep: "#148844"
  lesson-green-text: "#127a3e"
  lesson-green-wash: "#edf9f1"
  streak-amber: "#e8a51e"
  streak-amber-deep: "#b87808"
  ink: "#171b22"
  muted-ink: "#606876"
  faint-ink: "#9aa3b1"
  rule-line: "#dce2ea"
  canvas: "#f5f7f9"
  surface: "#ffffff"
  surface-alt: "#fafbfc"
  chrome-top: "#f3f4f6"
  chrome-bottom: "#e5e7eb"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.35rem)"
    fontWeight: 760
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.12rem"
    fontWeight: 720
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.08rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.77rem"
    fontWeight: 600
    letterSpacing: "0.01em"
  japanese:
    fontFamily: "'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', sans-serif"
    fontSize: "1.02rem"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  key: "0.5rem"
  field: "0.6rem"
  object: "0.85rem"
  window: "1rem"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "0.35rem"
  sm: "0.6rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
  band: "clamp(3.5rem, 9vh, 6rem)"
components:
  button-primary:
    backgroundColor: "{colors.studio-blue-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "2.75rem"
    padding: "0 1.35rem"
  button-primary-hover:
    backgroundColor: "#17439b"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "2.75rem"
    padding: "0 1.35rem"
  button-key:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.key}"
    height: "2.6rem"
    padding: "0 0.95rem"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "2.4rem"
    padding: "0 0.7rem"
  window-bar:
    backgroundColor: "{colors.chrome-bottom}"
    textColor: "{colors.muted-ink}"
    height: "2.5rem"
---

# Design System: Nihongo Studio

## Overview

**Creative North Star: "The Quiet Window"**

One window, ruled lines, nothing ornamental. The product is a small desktop-style window you
return to for a couple of minutes a day, and the whole visual system is built to keep that
window calm: a themed grey title bar across every surface, a neutral canvas with white paper
on it, and hairline rules doing the work that boxes and cards do elsewhere.

The restraint is deliberate and it is the brief. PRODUCT.md puts the audience at people who
bounced off heavier study tools, so the interface has to feel like something you already know
how to use. Structure comes from space and rules, colour is rationed to one blue plus two
role colours, and the only decoration is the artwork on the two daily cards.

Depth is tonal: canvas, surface, and surface-alt are three steps of the same near-white, and
the window chrome is a two-stop grey gradient. Exactly one shadow exists, and it is reserved
for objects that genuinely float above the page (dialogs, and the product screenshots on the
landing page). Nothing else lifts.

**Key Characteristics:**
- One themed window bar on every page, app and document alike.
- Hairline rules and space instead of cards, borders around boxes, or nested containers.
- One accent blue, two role colours (lesson green, streak amber), everything else neutral.
- A single elevation for floating objects, never paired with a hairline border.
- Numbers are data: tabular figures in the status line and progress values.

## Colors

A near-white room with one blue in it. The palette is small on purpose: the product's energy
comes from the content, and the interface stays out of its way.

### Primary
- **Studio Blue** (#2e6ee8): links, the active tab, icon accents, and any place where colour
  has to mean "this one". It is never a large fill.
- **Studio Blue Deep** (#1f56c4): the fill colour when white text sits on top. White on Studio
  Blue measures about 4.0:1, under the 4.5:1 body-text floor, so filled buttons and the
  landing page's primary pill use the deep step instead.
- **Studio Blue Text** (#1f56c4 light, #5b8ff0 dark): the foreground twin of the deep step,
  for blue text and icons. Dark mode re-points it because the deep step is a *fill* there:
  white sits on it, so it cannot lighten, and blue-deep text on the dark tints measured 2.50:1.
- **Studio Blue Wash** (#eef4ff): tinted backgrounds for blue-tinted surfaces, dark mode swaps
  it for #141f33.

### Secondary
- **Lesson Green** (#27b95d) with **Lesson Green Deep** (#148844): the Lessons card border,
  the lesson progress fill, and the quota checks. Green means "learning", nothing else.
- **Lesson Green Text** (#127a3e light, #27b95d dark): the foreground twin, for green text and
  icons. The deep step is the fill behind the Start Practice button's white label, and on the
  green-soft tint it measured 4.19:1 in light mode and 2.50:1 of its blue sibling in dark.
- **Streak Amber** (#e8a51e) with **Streak Amber Deep** (#b87808): the streak flame and the
  lesson quota markers. Amber means "streak", nothing else.

### Neutral
- **Ink** (#171b22): body text and every number that carries emphasis.
- **Muted Ink** (#606876): secondary text, labels, captions, and the window bar's lockup.
- **Faint Ink** (#9aa3b1): decorative glyphs only, such as the icon beside the window title.
  It never carries a word.
- **Rule Line** (#dce2ea): every hairline in the system, including section rules and list
  separators.
- **Canvas** (#f5f7f9) and **Surface** (#ffffff): the page and the paper on it. **Surface Alt**
  (#fafbfc) is the third step, used for headers and quiet fills.
- **Chrome Top** (#f3f4f6) to **Chrome Bottom** (#e5e7eb): the window bar's gradient, the one
  place a gradient is allowed.

### Named Rules
**The One Loud Element Rule.** The progress spectrum (crimson #c7003d through magenta #a126bd
and indigo #4c54d9 to teal #148fb7 and green #23ad5b, left to right) is the single place in the
product where colour runs free. It is a signature, it stays, and nothing else may compete with
it. Do not tone it down and do not multiply it.

**The Muted Floor Rule.** Muted Ink is the lightest value that may carry words. It measures
5.6:1 on surface, 5.2:1 on canvas and 4.5:1 on the window chrome. Faint Ink is for decorative
glyphs; if a string needs to be read, it is not faint.

## Typography

**Display Font:** the platform sans (-apple-system, Segoe UI, Roboto, Helvetica, Arial)
**Body Font:** the same stack; a Japanese stack (Hiragino Kaku Gothic ProN, Yu Gothic, Noto
Sans JP) carries kana and kanji.

**Character:** one neutral system voice, worked by weight rather than by family. Hierarchy is
weight, size and colour role, never a second typeface. Japanese text switches stacks and
keeps the same weight logic.

### Hierarchy
- **Display** (760, `clamp(2rem, 5.2vw, 3.05rem)`, 1.18): the landing page's title, which
  carries the hero on its own now that no image sits beside it. The studio's own page titles
  stay at `clamp(1.75rem, 4vw, 2.35rem)`. Tight tracking
  (-0.02em) and balanced wrapping.
- **Headline** (720, 1.35rem, 1.3): section headings. On the landing page a heading no longer
  opens with a rule — the band's air does that job — while the studio's still do.
  It was 1.12rem, which sat barely above the 1.08rem body, so nine headings gave a scanning
  reader no outline
  it and generous space before it.
- **Body** (400, 1.08rem, 1.65): running text, held to the landing page's `--home-measure`
  (46rem = **73ch** at 16px, inside the 65–75ch band) and a 44rem column in the app's dialogs. A band's display
  type is allowed `--home-display` (52rem), and a two-column band's cells sit below the measure
  rather than above it.
- **Label** (600, 0.77rem): the status line, captions, field labels, and the window lockup at
  0.875rem.
- **Japanese** (600, 1.02rem, 1.35): kana and kanji, always with romaji or a meaning beside it.

### Named Rules
**The Romaji Leads Rule.** On a lesson card the romaji is the line you read first and the kana
and kanji sit under it as support. A learner reads a word on day one and picks up the script
as they go; do not invert that order.

**The Quiet Label Rule.** Labels, captions and secondary text are Muted Ink. Never grey text
on a coloured surface: tint it from that surface's hue.

**Known gap.** The five roles above are the documented scale. The older app surfaces still
carry about two dozen finer label steps between 0.62rem and 1.18rem (dense table rows, quota
markers, the streak line) that predate this record. They are in use and they are not drift to
copy: fold them into the roles above when those surfaces are next touched, rather than adding
another step.

## Layout

Two spatial models share one chrome. The app is a fixed column, `min(100%, 1180px)` with a
`clamp(1rem, 3.5vw, 3.25rem)` gutter, so the title bar, the tab row and the study cards all
line up on the same edges. The landing page is a 72rem grid of bands with prose capped at a
readable measure inside it, because a page that has to show the product cannot be a document
column.

Bands alternate shape, and the shape is the point: a text hero that leads with words and
nothing beside them; a statement band carrying the progress spectrum at page width over a
three-column ruled texture of theme names, six names to two full rows; a two-column lessons
band where the prose leads at `1.3fr` and the phone capture follows at `1fr` and ends on the
grid's right edge, with both drawings closing the band as **one plate row** rather than
floating inside the prose; a full-bleed `surface-alt` strip for the story; an unequal pair for
the account and free questions; and a two-cell close carrying the sign-off, the closing action
and the donation note against the ask, with a one-line footer under it. Vertical rhythm between
bands is `--home-band-gap`, `clamp(3.6rem, 10vh, 6rem)`.

**No rules divide the landing page's bands.** Every section hairline, band edge, list row rule
and footer rule was removed; the only borders left on `/` belong to the window bar and to the
quiet buttons. Separation is carried entirely by air, which is why the band gap above is
generous, and a list separates by row padding rather than by a rule. The studio keeps every one
of its hairlines: this is a landing-page decision taken by the owner, not a change to the
system.

**The landing page's alignment is deliberately uneven.** Each band takes a different position so
the page has a line to follow rather than one margin. The hero and the Lists heading sit
**left**; the Lists band runs two columns with the framing paragraph left and the note **right**,
and the spectrum's caption is right-aligned under the spectrum's far end; the lessons band is
prose **left** and capture **right**; the story strip is the page's one **centred** band; the
pair spreads its two questions to the two outer edges; the close mirrors the lessons band, with
the sign-off and its action pushed **right** inside their cell against the ask on the left; the
footer is centred. Blocks move; long prose inside them still sets ragged-right, because a ragged
left edge costs reading speed for nothing. On one column the offsets collapse and everything
returns to the single left edge.

**The landing page has two measures and one left edge.** `.home-page` declares
`--home-measure: 46rem` for running prose and `--home-display: 52rem` for display type, which
sets wider; nothing else picks a width. Both hold at the page's single left edge, which is the
same line for the hero, the statement band, the lessons band, the story strip, the pair and the
close at every width. The page previously used four measures (832 / 736 / 1088 / 491) on two
axes, because the story strip and the close were centred islands at 46rem sitting 32rem inboard
of everything else; that is what made six bands read as six unrelated blocks. Wide elements —
the spectrum, the theme texture, the plate row, a band's heading rule — run the full grid, so
the page alternates between prose on the measure and data at page width.

Responsive behaviour is structural, not scaled. Two-column bands collapse to one column at
900px, the theme texture drops to two columns there and one at 700px, the sample-word rows drop
to a single column at 560px, the plate row stacks, and the donation card is a plain button until
the viewport can give its column the 432px the Ko-fi widget needs, which is 1120px.

**Three rules a future layout edit must not break.** The plate images carry explicit widths
rather than `max-width` alone, because a flex item with `width: auto` holding an image that has
not loaded yet computes to zero, and a zero-sized image never enters the viewport, so
`loading="lazy"` never fires and the row stays empty. The story strip's vertical rhythm sits on
the band and its horizontal inset on the inner box — one gutter, not two — so its text lands on
the page's left edge at every width and not only at 1440. And the Ko-fi widget is capped at
`min(52vh, 27rem)`, because uncapped its fixed 712px made the page's lowest-value section its
second tallest by a wide margin.

**The landing page carries no icon font.** Its one glyph, the brand mark, is an inline SVG, so
the page requests nothing from a third party before first paint beyond nothing at all: the only
external request left is the Ko-fi iframe, which is lazy and below the fold.

**The kana page.** `/kana` is the one surface with no app chrome around it: the same window
bar and wordmark, a single 44rem column, and the drill as the first thing on the page, with
the options in a disclosure underneath so the exercise never competes with its own settings.
It loads the stylesheet and one script, nothing else, and carries its own copy of the
dark-mode switch because it loads no app script.

**The parallel card rule.** The daily screen's two action cards sit side by side and run the
same four rows in the same order: heading, value, action, today. The action is always the third
row, and its row holds its height whether it carries a button or the sentence that replaces it,
so both actions and both strips land on the same lines in every state and theme. The value
always sizes the session the action starts, never a library total the learner cannot act on, and
the today strip is one tick per five-word set with the count in tabular figures.

## Elevation & Depth

Tonal first, with one shadow in reserve. Canvas, surface and surface-alt carry ordinary
hierarchy, and the window bar reads as chrome through its gradient and hairline, not through
depth. Objects that truly float (dialogs, and the product screenshots that sit on the landing
page) use the single shadow below.

### Shadow Vocabulary
- **Floating object** (`box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35)`): dialogs and
  product screenshots. Always with a radius; never with a border.
- **Knob** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2)`): the dark-mode switch's slider only.

### Named Rules
**The One Shadow Rule.** There is one elevation in this system. A floating object gets the
shadow, a hairline edge is for things that do not float, and the two are never combined: a 1px
border under a 50px blur is the generated-UI signature this system avoids.

## Shapes

Structure is drawn with 1px rules, and containers are the exception. In the studio a section
heading opens with a hairline above it and a list separates its rows with hairlines; on the
landing page those rules are gone and air does the same work. The window bar closes with
one. Radii are modest and consistent: keys and small controls at 0.5rem, fields at 0.6rem,
floating objects at 0.85rem, window panels at 1rem, and true pills at 999px for primary
actions.

Focus is always visible: a 2px solid ring in Studio Blue with a 2 to 3px offset, and buttons
that sit on a coloured surface use a soft 3px wash instead. Nothing is signalled by colour
alone.

The app's buttons carry a thick bottom edge, 3px or 4px depending on the button's rank, that
compresses when pressed.

### Named Rules
**The Key-Cap Rule.** The bottom edge is the press language, not decoration: a button looks
like a key you can push, and pressing it compresses the edge. New controls inherit it rather
than inventing a second press treatment.

**The Rule-Not-Card Rule.** Group with proximity first, then a hairline of the studio's, before
reaching for a container. **On the landing page the rule is air instead** — the owner removed
every divider, so proximity alone carries grouping there and the band gap is sized for it. Cards are not the default, and a card inside a card is never correct.

## Components

### Buttons
- **Shape:** true pills for page-level actions (999px, 2.75rem tall), key-caps with a 0.5rem
  radius and a 3 to 4px bottom edge for in-app controls.
- **Primary:** Studio Blue Deep fill with white text, `0 1.35rem` padding, one per view.
- **Quiet:** surface fill with an Ink label and Rule Line border, for the second action.
- **Hover / Focus:** background shifts over 140ms ease-out; focus is a 2px Studio Blue ring
  with offset. Disabled controls drop to about 0.48 opacity.
- **Press:** the key-cap edge compresses to 1px. The edge changes instantly rather than
  animating, so no layout property is transitioned.

### Cards / Containers
- **Corner Style:** 0.85rem for floating objects, 1rem for window panels.
- **Background:** Surface on Canvas, with Surface Alt for quiet headers.
- **Shadow Strategy:** see Elevation. One shadow, floating objects only.
- **Border:** 1px Rule Line for panels that need an edge (the closing CTA panel). Never
  combined with the shadow.
- **Internal Padding:** 1.25rem to 1.6rem.

### Inputs / Fields
- **Style:** surface fill, 1px Rule Line stroke, 0.6rem radius, 2.4rem tall, 0.82rem text.
- **Focus:** border shifts to a soft blue and a 3px translucent blue ring appears.
- **Disabled / Read-only:** muted text, no fill change. Native pickers follow the theme through
  `color-scheme`.

### Navigation
- **Style:** the window bar carries the centred lockup at 0.875rem in Muted Ink with a Faint
  Ink glyph, and the tab row below it uses 0.9rem labels with a 2px active underline in Studio
  Blue.
- **Mobile:** the tab row keeps its labels, the lockup steps aside below 560px, and the mode
  selector stays visible.

### Signature Components
- **The status line:** the four-figure row under the progress bar (streak, days studied, trip
  countdown, words total). One typographic recipe for every item, numbers in Ink at weight
  700, labels in Muted Ink at weight 500, tabular figures throughout, so the row reads as one
  line of data.
- **The sample lesson list:** rows of Japanese, romaji and meaning, separated by air on the
  landing page and by rules in the app. It is the
  system's answer to "show, don't tell", and it collapses to one column at 560px.
- **Product screenshots:** real captures of the running app on the landing page, presented at
  0.85rem radius with the floating-object shadow and no border. They are objects, not
  decoration, and they are re-captured when the app changes.

## Do's and Don'ts

### Do:
- **Do** put the window bar on every page, app and document alike, with the lockup matched to
  `.studio-header-title`.
- **Do** reach for proximity and space before a container, and for a hairline on the studio's
  surfaces. On `/` the hairline is not available: use the band gap.
- **Do** use Studio Blue Deep for filled buttons so white text clears 4.5:1.
- **Do** keep numbers in tabular figures and in Ink, with their labels in Muted Ink.
- **Do** show real product evidence: a real capture, a real word list, real numbers from the
  library.
- **Do** let the progress spectrum be the loudest thing on the screen.

### Don't:
- **Don't** combine a 1px border with the wide shadow on the same object.
- **Don't** add a third accent colour or a second typeface.
- **Don't** set words in Faint Ink, and never grey text on a coloured surface.
- **Don't** put text on Studio Blue itself; step down to Studio Blue Deep.
- **Don't** introduce card grids, nested cards, or a container for a single line of text.
- **Don't** animate layout properties: transform, opacity, colour and shadow only.
- **Don't** use a kicker or eyebrow above a heading, or a row of large numbers over small
  labels as a page's structure.
