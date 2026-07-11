# Anti-AI-slop rules

Concrete, checkable patterns that separate "designed by someone who has
shipped product" from "default model output." These are the tells a
designer spots in three seconds. Treat the hard list as regressions, not
preferences.

## Hard tells — do not ship these

1. **Default framework indigo as the accent.** The stock Tailwind indigo/violet
   ramp is the single loudest AI signature: `#6366f1`, `#4f46e5`, `#4338ca`,
   `#3730a3`, `#818cf8`, `#8b5cf6`, `#7c3aed`, `#a855f7`. If the brief or design
   system gives an accent, use it. If it does not, pick a considered color with
   intent — never fall back to these.
2. **The two-stop "trust me" gradient.** Purple→blue, blue→cyan, indigo→pink
   washes on a hero. A flat surface with confident typography beats this every
   time. Reserve gradients for a deliberate, single moment.
3. **Emoji as UI icons.** `✨ 🚀 🎯 ⚡ 🔥 💡` inside headings, buttons, list
   markers, or feature tiles. Use monoline SVG (≈1.5–1.8px stroke,
   `currentColor`) instead.
4. **Hardcoded system font on display type** when a real typeface is available.
   Headlines defaulting to `Inter` / `Roboto` / `system-ui` when the brief
   implies a voice is a missed decision.
5. **The rounded card with a colored left border.** The canonical "AI dashboard
   tile." Drop either the radius or the left stripe; do not ship both together
   as your default card.
6. **Invented metrics.** "10× faster", "99.9% uptime", "3× more productive" with
   no source. Pull a real number or use an honestly-labelled placeholder.
7. **Filler copy.** `lorem ipsum`, "Feature one / two / three", "placeholder
   text", "sample content." An empty section is a composition problem to solve,
   not a prompt to invent words.

## Soft tells — fix when you can

- **The stock skeleton**: Hero → Features (3 cards) → Pricing → FAQ → CTA with no
  variation. Introduce at least one unconventional section (a full-bleed
  testimonial quote, pricing framed against the status quo, an inline mini-demo).
- **Placeholder image CDNs** (`unsplash`, `placehold.co`, `picsum`, `placekitten`).
  Fragile and obvious. Use a real asset or a styled placeholder block.
- **Token leakage**: many raw hex values scattered outside a `:root` block means
  the design tokens were not honored.
- **Accent overuse**: the accent color used on 6+ elements per screen. Cap it at
  ~2 visible uses per view — scarcity is what makes an accent read as emphasis.
- **Perfectly symmetric, evenly-dense layout** with no tension. Alternate density
  (one tight section, one that breathes) so the rhythm reads as intentional.

## How to add soul without breaking the rules

Aim for roughly **80% proven patterns + 20% one distinctive choice.** Spend the
20% on: one bold visual move (a type choice, a single color decision, an
unexpected proportion); voice and microcopy ("Start tracking" over "Get
started"); one small interaction the user remembers; one detail only someone who
used the product would add. If an outsider can identify which product a
screenshot is from, it has soul. If not, it's a template.
</content>
