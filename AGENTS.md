# AGENTS.md — Kube Workshop Slide Engine

## Project Overview

A reusable HTML slide presentation engine with a Kubernetes workshop as its first content deck. The architecture follows a reveal.js-inspired 3-layer pattern: **engine CSS** (mechanics) → **theme CSS** (visuals) → **content HTML** (slides). No build step, no bundler, no node_modules — just static files served by Bun.

## Repository Structure

```
index.html                    # Slide content only (38 slides, ~2800 lines)
engine/
  engine.css                  # Presentation mechanics: controls, progress bar, laser, transitions, scaling
  engine.js                   # All JS logic + auto-injects controls DOM into the page
  themes/
    glass.css                 # Visual theme: typography, layouts, tiles, terminal styles, colors
package.json                  # Only script: bun --serve
.github/workflows/deploy.yml  # GitHub Pages static deploy (no build step)
```

## Commands

```bash
# Dev server (serves static files from project root on port 3000)
bun run dev

# There are no tests, linter, formatter, or build commands.
# Verification is done visually via browser (Playwright MCP for automation).
```

## Architecture Decisions

### Engine / Content Separation

- `engine/engine.js` auto-injects all UI chrome (controls bar, progress bar, laser pointer, help overlay) into `document.body` on load. Content HTML files must NOT contain controls markup.
- The only contract between engine and content: slides must be `<div class="slide-container" id="slideN">` where N is 1-indexed.
- Engine auto-enters presentation mode on load. ESC exits to scroll view.

### Mermaid Diagrams

- `mermaid.js` is loaded via CDN in the content HTML `<head>`, before `engine.js`.
- Engine initializes Mermaid with `startOnLoad: false` and renders lazily per-slide.
- Original Mermaid source text is stored in a `Map` before slides are hidden by presentation mode. This is critical — rendering Mermaid on `display: none` elements produces broken 16×16px SVGs.
- Once a slide's Mermaid is rendered, it's marked `data-mermaid-rendered="true"` and skipped on revisit.
- **Do NOT add CSS geometry overrides** (rx, ry, stroke-width, filter: drop-shadow) on `.node rect` or `.cluster rect` — these break Mermaid v11's internal SVG layout. Safe overrides: `themeVariables` in `mermaid.initialize()` and per-node `style` directives in Mermaid syntax. Text-only CSS (font-weight, font-size on `.nodeLabel`) is safe.

### External Dependencies (CDN only, no npm)

- Google Fonts: Inter, Montserrat, Fira Code
- Font Awesome 6.5.1
- Mermaid v11

## Code Style

### HTML (index.html)

- 8-space indentation (Gemini-generated, maintained for consistency)
- Each slide wrapped in `<div class="slide-container" id="slideN">`
- Slide numbering is 1-indexed and sequential
- HTML comments mark slide boundaries: `<!-- Slide N: Title -->`
- Presentation is in French; slide content and help overlay text are in French

### CSS

- 4-space indentation
- Section separators use `/* === SECTION NAME === */` banners
- Property ordering: display/layout → dimensions → spacing → visual → animation
- Colors: hex for opaque (`#3b82f6`), rgba for transparency
- Design tokens are hardcoded (no CSS variables) — Tailwind-inspired palette: gray-900 `#111827`, blue-500 `#3b82f6`, rose-600 `#e11d48`
- Engine CSS (`engine.css`) contains zero visual theming — only structural positioning, transitions, and controls
- Theme CSS (`themes/glass.css`) contains all visual styling — backgrounds, typography, layout classes, component styles
- Use `!important` sparingly and only for Mermaid SVG overrides or cursor-hidden state

### JavaScript

- Vanilla JS, no frameworks, no modules, no imports
- engine.js is a single file loaded with `<script src="engine/engine.js"></script>` at end of body
- Two IIFEs: one for DOM injection, one for presentation logic
- `"use strict"` inside the main IIFE
- 4-space indentation
- `const` for immutable bindings, `let` for mutable state, no `var` in new code
- DOM refs obtained via `document.getElementById()` after injection
- Event listeners use named functions for cleanup (e.g., `removeEventListener`)
- String concatenation preferred over template literals in existing code (mixed style acceptable)
- No `as any`, `@ts-ignore`, or type suppression

### Git Commits

- Imperative mood, sentence case: `Added new slides`, `Reworked laser and slide effects`
- Short (< 72 chars), no conventional commits prefix

## Key Patterns

### Adding a New Slide

1. Add `<div class="slide-container" id="slideN">` in `index.html` at the correct position
2. Use existing layout classes from `glass.css`: `title-layout`, `quote-layout`, `two-column`, `tiled-content`, `section-title-layout`, `two-column-tiled`, `styled-bullet-list`, `qa-layout`
3. Include `<div class="top-accent"></div>` as first child for the gradient accent bar
4. Update slide IDs to remain sequential if inserting between existing slides

### Adding a New Theme

1. Create `engine/themes/<name>.css`
2. Replace the theme `<link>` in the content HTML
3. Must style `.slide-container` visual properties and all layout classes used by content
4. Engine CSS handles all structural/behavioral styles — theme only handles appearance

### Adding Mermaid to a Slide

1. Add `<div class="mermaid">` inside the slide with the diagram source as text content
2. Use per-node `style` directives for custom colors: `style NodeName fill:#1e3a5f,stroke:#3b82f6,color:#f1f5f9`
3. Engine handles lazy rendering automatically — no extra JS needed

## Verification Checklist

Since there are no automated tests, verify changes with:

1. `bun run dev` → open `http://localhost:3000`
2. Presentation enters fullscreen mode automatically
3. Arrow keys / Space navigate slides; counter updates (`N / 38`)
4. Controls bar appears on hover at bottom; fades after 1.5s
5. Progress bar visible and clickable to jump
6. Mermaid diagrams render when their slide becomes active
7. Laser (L key), Timer (T key), Fullscreen (F key), Help (? key) all functional
8. ESC from native fullscreen keeps presentation mode; ESC from presentation mode returns to scroll view
9. Touch swipe navigates on mobile
10. URL hash `#slideN` deep-links to correct slide

## Common Pitfalls

- **Broken Mermaid**: If diagrams show as tiny boxes, Mermaid rendered while the slide was `display: none`. Ensure `renderMermaidInSlide()` is called only when the slide is visible (active).
- **CSS vs Mermaid SVG**: Never add CSS that modifies SVG geometry (width, height, rx, ry, transform) on Mermaid elements. Mermaid calculates its own layout.
- **Slide ID gaps**: Engine discovers slides via `querySelectorAll(".slide-container")`, so display order matters, not ID numbers. But keep IDs sequential for maintainability.
- **Controls in content HTML**: Never add controls markup to `index.html`. Engine.js injects all UI chrome.
