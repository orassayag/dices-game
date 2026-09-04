# Constants & Configuration

### No magic literals
Do not use hardcoded numeric or string literals that carry business,
security, timing, or operational meaning.

- Define such values as named constants with descriptive names.
- Group constants at the top of the file, or in a dedicated
  `config/` or `constants` module if shared across files.
- If a literal is timing-, security-, or business-rule-related, it must be
  named — even if it's only used once. The name documents intent.
  (Note: this is about naming the *value* — it does not conflict with the
  separate TypeScript rule preferring inferred *types* for single-use
  cases. "Give a single-use magic number a named constant" and "don't
  create a standalone named *type* for something used in only one place"
  are both true at the same time; one's about literals, the other's about
  type declarations.)

### Allowed inline literals
Inline literals are allowed only for universally obvious values (`0`, `1`,
empty string `''`) inside trivial logic where naming the value would reduce
readability rather than improve it (e.g. `array.length === 0`).

### Regex patterns
If regex patterns are needed, declare them in a dedicated constants file
rather than inline at the point of use.

### Selectors (UI scraping / adapter contexts)
If multiple DOM/UI selectors exist for a component, group them into a single
object rather than scattering separate constants:

```ts
const SELECTORS = {
  KEY_ONE: '#i_am_a_selector',
  KEY_TWO: '.some-other-element',
};
```

### Design tokens (styling, any approach)
**Principle, regardless of styling approach:** never hardcode colors,
shadows, or layout sizes directly at the point of use. Always go through
the project's design-token system. The specific mechanism depends on
which styling approach the project actually uses — check which of these
applies before assuming any one of them:

- **SCSS-based projects:** tokens live in dedicated partials (e.g.
  `_palette.scss` for raw values, `_theme.scss` for semantic CSS custom
  properties, `_layout.scss` for dimensions). See the worked example
  below.
- **Tailwind-based projects:** tokens are theme values in
  `tailwind.config` (or the v4 CSS-based `@theme` block). Use the
  semantic utility classes/theme keys the config defines (e.g.
  `bg-brand`, `text-action-primary`) rather than arbitrary-value
  utilities (`bg-[#001c36]`) — an arbitrary value is the Tailwind
  equivalent of a hardcoded hex code and defeats the same purpose.
- **Plain CSS variables / CSS-in-JS (styled-components, vanilla-extract,
  etc.):** tokens are CSS custom properties or a theme object, typically
  defined once at a root/theme-provider level. Reference the theme
  variable/property rather than a literal value, the same way you'd
  reference `var(--color-...)` below.
- **Design-system-sourced tokens** (e.g. exported from Figma via a
  tokens plugin, or a shared `@org/design-tokens` package): treat that
  package/file as the source of truth above project-local token files —
  don't redefine a token locally that already exists there.

Workflow (applies across all of the above — substitute the right file/
mechanism for the project's actual approach):
1. Search the token source for an existing value that matches what you need.
2. Reuse it — prefer the semantic token (e.g. `--color-action-primary`,
   `bg-brand`) over a raw/primitive one (e.g. `$blue-primary`) where both
   exist.
3. If no match exists, don't hardcode the value — add it to the
   appropriate token source first (raw value → semantic mapping → use),
   following that source's existing naming/comment conventions, then use
   the new token.

**Worked example — SCSS-based projects specifically:**

| What you need | Look in | Token format |
|---|---|---|
| Raw color | `_palette.scss` | SCSS variable, e.g. `$blue-primary` |
| Semantic color | `_theme.scss` | CSS custom property, e.g. `var(--color-action-primary)` |
| Layout dimension | `_layout.scss` | SCSS variable, e.g. `$header-height` |

```scss
// BAD — hard-coded values
.my-comp__header {
  color: #001c36;
  background: #f9fafb;
  border: 1px solid #ddd;
  height: 40px;
}

// GOOD — design tokens
@use '../../styles/palette' as *;
@use '../../styles/layout' as *;

.my-comp__header {
  color: var(--color-text-brand);
  background: var(--color-bg-main);
  border: 1px solid var(--color-border-default);
  height: $header-height;
}
```
