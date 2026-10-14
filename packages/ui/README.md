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
| `--size-*` | Existing layout widths and heights |
| `--border-*`, `--focus-width`, `--outline-focus`, `--radius-circle` | Borders and focus treatment |
| `--shadow-search` | Search dropdown shadow |

Numeric suffixes retain the previous pixel sizes. This migration preserves
existing appearances, including small labels and irregular spacing steps.
Consolidating those steps or improving text sizes should be an intentional
follow-up with updated visual evidence. Prefer existing tokens before adding
another value; update the catalogue metadata when adding one.

The existing `700px` and `950px` media-query conditions stay literal because
CSS custom properties cannot be used in media-query conditions. Structural
values such as grid fractions, percentages, viewport units, transform geometry,
and animation timing remain in component rules.
