# Deck runtime assets

The html-ppt deck runtime — `base.css`, `fonts.css`, `runtime.js` (pager +
keyboard nav + S-key presenter mode + timer), `themes/*.css` (36 themes),
`animations/*` (CSS animations + canvas FX) — is vendored from open-design's
`design-templates/html-ppt/assets/` (Apache-2.0 © the Open Design authors).

Vibedesign serves these unmodified at `/api/deck-assets/<path>`. The
`consulting-deck` skill (open-design's html-ppt) references them by that URL so
its original authoring workflow works unchanged.
