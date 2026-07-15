---
name: IBM Carbon Sass theme config in Vite
description: Correct @carbon/styles theme configuration and what is NOT overridable.
---

When configuring `@carbon/styles` in a Vite app:

```scss
@use '@carbon/styles/scss/themes';
@use '@carbon/styles' with ($theme: themes.$g10);
```

- `$theme` expects a **theme map** (`themes.$g10`), NOT the string `'g10'`.
  Passing the string throws `$map2: "g10" is not a map`.
- `$use-font-face` and `$font-path` are **not declared with `!default`** in the
  installed `@carbon/styles` entry, so trying to override them throws
  "variable was not declared with !default in the @used module".

**Why:** Carbon changed its theme API to take maps; the font-face vars are not
part of the public `with (...)` surface of the main entry.

**How to apply:** load IBM Plex from Google Fonts in `index.html` instead of
relying on Carbon's bundled `@font-face` — Carbon emits webpack-style
`~@ibm/plex` `url()`s that fail to decode in Vite (harmless console warning, but
fonts won't come from Carbon's copy).
