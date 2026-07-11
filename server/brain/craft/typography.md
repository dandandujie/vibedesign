# Typography

Universal rules for setting type, independent of which typeface a brand uses.

## Line length and reading comfort
- Body copy: **60–75 characters per line**. Cap long-form containers around
  `max-width: 65ch`. Full-viewport-width paragraphs are a readability failure.
- Body line-height: **~1.5** for paragraphs, tighter (**~1.1–1.2**) for large
  headlines, looser (**~1.7**) for sustained long-form reading.

## Letter-spacing (tracking)
- Large display type usually wants slightly **negative** tracking
  (`-0.01em` to `-0.03em`) — big type looks loose by default.
- **All-caps and small labels always need positive tracking** (≥ `0.06em`).
  Untracked all-caps is a reliable amateur tell.
- Normal-size body text needs no tracking. Leave it at `normal`.

## Weight and size do the work, not many families
Two families is plenty (one display/heading, one text/body); one is often
better. Establish hierarchy through **size, weight, and color**, not by
introducing a third typeface. Only load the weights you actually use.

## A real scale, not arbitrary sizes
Use a consistent ratio (≈1.2 minor-third for dense UI, ≈1.25–1.333 for
editorial). Every size on the page should be a step on that scale — random
`17px` / `19px` / `23px` values read as unconsidered.

## Alignment and rhythm
- Left-align long text. Reserve centered text for short, deliberate moments
  (a hero line, a single caption) — never center a paragraph.
- Avoid justified text on the web (it opens ugly rivers without hyphenation).
- Keep a consistent vertical rhythm: spacing between blocks should come from a
  small spacing scale, not ad-hoc margins.

## Numbers and detail
Use tabular figures (`font-variant-numeric: tabular-nums`) for data, tables,
timers, and anything that updates in place, so digits don't jitter.
</content>
