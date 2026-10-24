# Shared UI tokens

`src/tokens.css` is the single source of values for Albion Market's colors,
font families, type scale, spacing, layout dimensions, borders, focus, and shadows.
The web root layout imports `@albion/ui/tokens.css` once, before `globals.css`.

```tsx
import "@albion/ui/tokens.css";
```

```css
.example {
  color: var(--foreground);
  background: var(--surface);
  font-family: var(--font-family-heading);
  font-size: var(--text-section);
  padding: var(--space-24);
  border: var(--border-default);
}
```

## Reference and conventions

Open `/dev/ui` for labelled color swatches, live type samples, spacing bars,
border/focus examples, applied CSS values, and shared component examples.
`designTokenGroups` (exported from `@albion/ui`) contains names and descriptions
only. The catalogue reads values from the applied stylesheet rather than
duplicating them in TypeScript.

| Family | Purpose |
| --- | --- |
| `--background`, `--foreground`, `--muted`, `--line`, `--surface`, `--accent` | Existing semantic palette, retaining the public names |
| `--color-*`, `--*-rgb` | State colors, translucent surfaces, shared color channels |
| `--font-family-*`, `--text-*`, `--weight-*`, `--leading-*`, `--tracking-*` | Typography; section, profile, and hero text retain responsive `clamp()` sizes |
| `--space-*` | Margin, padding, gap, and offsets |
| `--size-*` | Layout dimensions, including `--size-touch-target` for 44px controls |
| `--border-*`, `--focus-width`, `--outline-focus`, `--radius-circle` | Borders and focus treatment |
| `--shadow-search` | Search dropdown shadow |

Numeric suffixes retain their pixel sizes. The PLAYERS-78 accessibility pass
lightens rank, caption and muted text, uses `--color-control-border` for search
and section controls, and increases the small labels used on main pages.
The full type scale remains available to the catalogue. Prefer existing tokens
before adding another value; update the catalogue metadata when adding one.
See [the accessibility review checklist](../../docs/accessibility-and-mobile.md)
for automated and manual checks still required.

The existing `700px` and `950px` media-query conditions stay literal because
CSS custom properties cannot be used in media-query conditions. Structural
values such as grid fractions, percentages, viewport units, transform geometry,
and animation timing remain in component rules.
