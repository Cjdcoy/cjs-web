# CJS design-system conventions

Import `src/styles/index.css` once at the application entry point. Feature code
should consume the public exports from `src/components/ui` and should not repeat
brand colors, spacing, radii, shadows, motion timings, or layer values.

## Responsive data

Use `DataTable` for tabular records. At widths below the medium breakpoint
(768px), each semantic table row becomes a bordered card and each cell exposes
its column heading through `data-label`. Keep the first column meaningful, pass
a concise `cardLabel` when a desktop heading is too long, and mark only
nonessential cells as `priority: "secondary"`. Do not wrap a product table in an
unbounded horizontal scroller as its only mobile treatment.

The shared validation widths are 360px, 768px, and 1440px. The corresponding
TypeScript values are exported from `tokens.ts`; CSS media queries mirror those
values because custom properties cannot be used in media-query conditions.

## Focus and errors

All interactive primitives use a two-part `:focus-visible` ring that remains
visible against both the page and panel backgrounds. Do not remove it in feature
styles. Disabled controls remain readable but cannot be focused or activated.
Loading buttons are disabled, retain visible text, and expose `aria-busy`.

`Input` and `Select` own their label, helper, and error relationships. Pass the
human-readable validation message through `error`; the primitive sets
`aria-invalid`, connects the message with `aria-describedby`, and announces it.
Do not encode error, success, selection, or rank through color alone—pair color
with copy, an icon, `aria-current`, `aria-checked`, or another semantic state.

## Motion and async states

Only tokenized, short transitions and the shared skeleton animation are used.
`prefers-reduced-motion: reduce` collapses all durations and disables repeated
animation. Use `Skeleton` while no content is available, keep successful stale
content visible during refresh, use `EmptyState` for valid zero-result responses,
and use `ErrorState` for failed requests with a retry action when retrying is
safe.

Open `src/components/ui/gallery.html` through the Vite dev server for the visual
fixture covering control states, feedback, responsive tables, and pagination.
