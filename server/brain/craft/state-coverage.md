# State coverage

A component is not done when the happy path renders. Real UI has several
states, and the missing ones are exactly where designs feel unfinished.

## The states every data surface needs
For any list, table, card grid, dashboard widget, or query result, design all of:

1. **Empty** — first-run, before any data. This is an onboarding opportunity, not
   a blank box: say what goes here and offer the first action. "No projects yet —
   create one" beats an empty panel.
2. **Loading** — a skeleton that matches the final layout beats a centered
   spinner; it prevents layout shift and reads as faster.
3. **Partial / few items** — one row, three rows. Don't only design the state
   with a full, tidy 12 items.
4. **Overflow / many items** — long strings, huge numbers, 500 rows. Decide
   truncation (`text-overflow: ellipsis`, line clamps), wrapping, and pagination
   *now*, not when it breaks.
5. **Error** — the request failed. Say what happened in plain language and give a
   retry. Never a dead end.
6. **Success / result** — the state after an action completes (confirmation,
   updated value).

## Interactive elements need their states too
Buttons, inputs, links, and controls each need: default, hover, focus-visible,
active/pressed, disabled, and (where relevant) loading and selected. A button
with no distinct hover/focus/disabled treatment reads as a mock, not a product.

## Feedback and optimism
- Every action gets immediate feedback (state change, spinner on the control,
  toast). Silence after a click reads as broken.
- Prefer optimistic updates for cheap, reversible actions; reconcile on failure.
- Destructive actions confirm first and are reversible where possible (undo).

## Preserve context across states
Don't collapse the layout when switching states — keep the container size stable
so the page doesn't jump. The empty, loading, and loaded states should occupy
the same space.
</content>
