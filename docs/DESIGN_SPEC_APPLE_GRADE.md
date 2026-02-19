# ProxyOS: Apple-Grade Design Specification

**Design philosophy**: Clarity, deference, depth. The interface stays out of the way so the AI office and your Proxy feel like the product—not the chrome. Every element earns its place; motion is purposeful; typography and spacing follow a strict system.

---

## 1. Design Principles (Apple HIG–aligned)

### 1.1 Clarity
- **Legible at a glance**: Text hierarchy is unambiguous (title → body → caption).
- **One primary action per context**: Command Center = “Deploy”; Swarm row = “View” or “Halt”; no crowded buttons.
- **Clear feedback**: Loading, success, and error states are visible and understandable without reading copy.

### 1.2 Deference
- **Content first**: The 2D/3D office and agent activity are the heroes. UI chrome (nav, drawer, modals) uses translucency and subtle borders so content shows through.
- **Reduced visual weight**: Buttons and tabs use fill only when selected; default state is ghost/outline.
- **No decorative clutter**: No gratuitous gradients or heavy shadows. Depth comes from blur and elevation, not decoration.

### 1.3 Depth
- **Layered hierarchy**: Background (office) → mid (cards, Command Center) → foreground (modals, drawer). Each layer has a distinct elevation and blur.
- **Motion reinforces hierarchy**: Modals scale in from center; drawer slides from edge; toasts slide in from top or bottom.
- **Consistent elevation scale**: 0 (canvas) → 1 (cards) → 2 (Command Center) → 3 (drawer) → 4 (modal).

---

## 2. Visual System

### 2.1 Color

**Dark theme (default)**  
- **Backgrounds**
  - `bg-primary`: `#0a0a0a` (true black for OLED)
  - `bg-secondary`: `#141414`
  - `bg-elevated`: `#1c1c1e` (cards, nav)
  - `bg-tertiary`: `#2c2c2e` (inputs, list rows)
  - `bg-glass`: `rgba(28, 28, 30, 0.72)` + blur
  - `bg-glass-strong`: `rgba(28, 28, 30, 0.92)` + blur
- **Text**
  - `text-primary`: `#ffffff` (100%)
  - `text-secondary`: `#ebebf5` at 60% opacity
  - `text-tertiary`: `#ebebf5` at 30% opacity
- **Separators**
  - `separator`: `rgba(255,255,255,0.12)` (1px)
  - `separator-strong`: `rgba(255,255,255,0.2)`
- **Accents** (sparing)
  - Primary (CTAs, selected): `#0a84ff` (Apple blue)
  - Success: `#30d158`
  - Warning: `#ff9f0a`
  - Error: `#ff453a`
  - Secondary (tabs, badges): `#5e5ce6` (purple)

**Light theme (optional)**  
- `bg-primary`: `#f5f5f7`; elevated `#ffffff`; glass with light blur.
- Text inverts to dark; separators `rgba(0,0,0,0.1)`.
- Same accent hex values; they work on both.

### 2.2 Typography

**Font stack**
- **UI / body**: SF Pro–style (system-ui, -apple-system, Inter) — `--font-sans`.
- **Monospace** (logs, code): SF Mono–style (JetBrains Mono) — `--font-mono`.

**Scale (rem, 1rem = 16px)**  
- **Large Title**: 2rem (32px), semibold, -0.5 letter-spacing — hero headings (e.g. “My Proxy”).
- **Title 1**: 1.5rem (24px), semibold — modal titles, section headers.
- **Title 2**: 1.25rem (20px), semibold — card titles, nav labels.
- **Title 3**: 1.125rem (18px), semibold — list section headers.
- **Body**: 1rem (16px), regular — primary body.
- **Callout**: 0.9375rem (15px), regular — secondary body.
- **Subhead**: 0.875rem (14px), medium — labels, list secondary.
- **Footnote**: 0.8125rem (13px), regular — captions, timestamps.
- **Caption 1**: 0.75rem (12px), regular — badges, hints.

**Line height**
- Titles: 1.2; Body: 1.5; Captions: 1.35.

### 2.3 Spacing & Layout

**Base unit**: 4px.

**Scale**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80.

**Usage**
- **Screen padding**: 16px (mobile), 24px (tablet), 32px (desktop).
- **Component internal**: 12–16px.
- **Between sections**: 24–32px.
- **Between list items**: 8–12px.
- **Icon + label gap**: 8px.

**Safe areas**: Respect `env(safe-area-inset-*)` for notches and home indicators (PWA).

**Max content width**: 1200px for centered content (e.g. Proxy dashboard); full bleed for office canvas and Command Center.

### 2.4 Elevation & Surfaces

- **Level 0**: Canvas (office) — no shadow.
- **Level 1**: Cards (stats, task rows) — subtle border, no shadow or 0 1px 3px rgba(0,0,0,0.2).
- **Level 2**: Command Center, nav — glass + 0 4px 12px rgba(0,0,0,0.15).
- **Level 3**: Swarm drawer — glass-strong + 0 8px 24px rgba(0,0,0,0.25).
- **Level 4**: Modals (Memory Vault, World Generator panel) — glass-strong + 0 16px 48px rgba(0,0,0,0.35).

**Corners**
- **Small**: 8px (buttons, chips, inputs).
- **Medium**: 12px (cards, list groups).
- **Large**: 16px (Command Center, drawer header).
- **XLarge**: 20–24px (modals, bottom sheets).

### 2.5 Motion

**Duration**
- **Instant**: 0ms (toggle state).
- **Fast**: 150–200ms (hover, focus, small transitions).
- **Normal**: 250–300ms (sheet open/close, modal).
- **Slow**: 400–500ms (page transitions, hero animations).

**Easing**
- **Standard**: `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Decelerate** (enter): `cubic-bezier(0, 0, 0.2, 1)`.
- **Accelerate** (exit): `cubic-bezier(0.4, 0, 1, 1)`.
- **Spring** (optional): `cubic-bezier(0.34, 1.56, 0.64, 1)` for playful elements (e.g. energy ring).

**Reduced motion**: Respect `prefers-reduced-motion: reduce` — disable or shorten non-essential animations.

---

## 3. Screen-by-Screen Design

### 3.1 Shell (App Frame)

**Top bar (nav)**
- Height: 56px (mobile), 52px (desktop).
- Background: `bg-glass-strong`, bottom border `separator`.
- Content: Logo/wordmark left (20px from edge); primary nav (Office, My Proxy) as segmented control–style pills; right: Swarm (icon), Memory Vault (icon or label), optional Settings.
- **Segmented control**: Two (or three) segments; selected = filled `bg-tertiary` + `text-primary`; unselected = transparent, `text-secondary`. 6px internal padding, 8px gap.
- Icons: 22px, 2px stroke; use one style (outline or filled) consistently.

**Main content area**
- Full bleed for Office tab (canvas fills viewport below nav).
- Centered max-width container for My Proxy (max 720px) with vertical rhythm.

**Bottom safe area**
- 16px (or `env(safe-area-inset-bottom)`) above the home indicator so Command Center never overlaps it.

### 3.2 Office Tab (2D/3D Canvas)

**Layout**
- Canvas is full viewport below nav; no sidebars. Office scene (Phaser/Three) is the only focus.
- **Overlay UI**: Only the Command Center at bottom; optional minimal “energy” pill top-right (e.g. “⚡ 72”) that doesn’t obscure the scene.

**Canvas treatment**
- Rounded corners only if the frame is visible (e.g. 16px on desktop); on mobile, edge-to-edge.
- If the scene is 2D pixel art, consider a subtle scanline or CRT overlay (very light, optional) for personality; keep it off by default for accessibility.

**Loading / cold start**
- Full-screen placeholder: logo + “Waking up the office…” with a 2–3 step progress or shimmer. No spinner unless < 2s; then minimal spinner (e.g. 24px) with caption.

### 3.3 Command Center

**Position**
- Fixed bottom; full width; padding 16px left/right, 12px top/bottom; safe area inset bottom.
- **Elevation**: Level 2 (glass, shadow). Top border 1px separator so it floats above the canvas.

**Layout**
- Single horizontal row: **Energy ring** (left) → **Input** (flex 1) → **Voice** (icon button) → **Deploy** (primary button).
- **Energy ring**: 44px diameter; track gray 20%; fill accent (e.g. blue or green) by percentage; center: number (e.g. “72”). Optional subtle pulse when energy increases (spring animation).

**Input**
- Height: 44px; border-radius 12px; background `bg-tertiary`; border 1px transparent (focus: 1px accent).
- Placeholder: “Feed context to your Proxy…” in `text-tertiary`.
- Font: Body (16px); single line with ellipsis; max 2 lines on larger screens.
- Clear button (×) when non-empty, 8px from right edge.

**Voice button**
- 44×44px; circular; `bg-tertiary`; icon mic (outline). When listening: fill accent (e.g. red), icon mic with “wave” or dot indicator. One tap to start, second to stop (or auto-stop on result).

**Deploy button**
- Height: 44px; min-width 88px; border-radius 12px; background accent-primary; label “Deploy” (or “Send”); font Subhead semibold.
- Disabled: 50% opacity. Loading: replace label with 20px spinner (white).

**States**
- **Idle**: Input empty or with text; Deploy enabled when input has content.
- **Submitting**: Deploy shows spinner; input and voice disabled.
- **Success**: Brief checkmark or “Sent” in Deploy (200ms) then back to idle; optional toast “Context deployed.”
- **Error**: Toast “Something went wrong. Try again.” with retry; keep input content.

### 3.4 Swarm Activity Drawer

**Trigger**
- Nav icon (list or activity icon). Badge with count of “working” tasks if > 0 (e.g. red dot or number).

**Layout**
- Sheet from right (mobile) or right-side panel (desktop, max 400px).
- **Header**: “Swarm Activity” (Title 2); close button (× or chevron). Border-bottom separator.
- **Body**: Scrollable list; sections per agent (Minion, Scout, Sage). Each section: agent name + avatar (24px) + “Working” / “Idle” chip; then task cards.

**Task card**
- One card per task: left border 3px in agent color (minion=blue, scout=green, sage=purple); padding 12px; border-radius 12px; background `bg-secondary`.
- **Line 1**: Task description (Subhead, single line ellipsis).
- **Line 2**: Status pill (Footnote) + optional “Halt” text button (tertiary).
- **Line 3** (optional): First line of `output_log` (Caption 1, 2-line clamp).
- **Timestamp**: Footnote, right-aligned or below.

**Empty state**
- Icon (inbox or agents) + “No tasks yet.” + “Feed context from the Command Center to get started.” in Callout.

**Animation**
- Sheet: slide in from right 300ms decelerate; overlay fade 200ms. Close: reverse.

### 3.5 My Proxy Tab (Dashboard)

**Layout**
- Vertical scroll; max-width 720px; padding 24px; spacing 32px between sections.

**Sections**
1. **Header**: “My Proxy” (Large Title); optional subtitle “Your digital avatar.”
2. **Energy**: Card with energy bar (0–100); label “Energy”; value right; bar height 8px, radius 4px; fill accent.
3. **Stats**: Two-column grid; each cell: number (Title 1), label (Footnote). E.g. “Tasks completed”, “Active projects.”
4. **Achievements**: Horizontal scroll of pills (badges); Footnote; optional lock icon for locked.
5. **Abilities**: Three cards (Code, Research, Strategy); icon + label; tappable if we add deep links later.

**Cards**
- Background `bg-elevated`; border 1px separator; border-radius 16px; padding 20px.

### 3.6 Memory Vault (Modal)

**Entry**
- Full-screen modal (mobile) or centered dialog (desktop, max 560px width).

**Header**
- “Memory Vault” (Title 1); “Skins” or “Change skin” button; Close (×).

**Filters**
- Search: full-width input, placeholder “Search memories…”, icon magnifier.
- Agent chips: horizontal scroll; “Proxy”, “Minion”, “Scout”, “Sage”; selected = filled, unselected = outline.

**List**
- One card per agent (when not filtered): avatar (40px) + name (Title 3) + “Version N · Updated …” (Caption 1).
- Expandable or tap to open detail: **Soul** (pre, Callout, 3–4 line clamp) and **Memory** (pre, Footnote, 5-line clamp). “View full” link if we have a detail view.

**Skin selector**
- In header or as a section: two cards “Default” and “Portal Sci‑Fi”; thumbnail or icon + label; selected = border accent.

**Animation**
- Modal: scale 0.95 → 1, opacity 0 → 1, 250ms decelerate; backdrop 200ms.

### 3.7 World Generator Page

**Layout**
- Full-screen; top bar “World Generator” + “Back to Office”.
- **Main**: Split or stack — left (or top): 3D preview (Three.js) in a card with 16px radius; right (or bottom): controls panel.

**Controls panel**
- **Prompt**: Textarea “Describe your office…”, 4 rows; border-radius 12px; `bg-tertiary`.
- **Primary button**: “Generate World” (full width or right-aligned).
- **Secondary**: “Set as Active Office” when a world is selected.
- **Concept art**: Thumbnail of generated image below prompt.
- **Gallery**: Horizontal or grid of saved worlds; each: thumbnail + prompt snippet + “Active” badge if active.

**3D preview**
- Aspect ratio 16:9 or full area; no UI overlay except optional “Rotate · Zoom” hint (Caption 1, fades out after 3s).

---

## 4. Component-Level Specs

### 4.1 Buttons

- **Primary**: bg accent-primary; text white; height 44px; radius 12px; Subhead semibold. Hover: brightness 1.1; active: scale 0.98.
- **Secondary**: bg-tertiary; text primary. Same size.
- **Ghost**: transparent; text primary or secondary. Hover: bg white/5.
- **Danger**: Same as primary but accent-error for “Halt” or destructive actions.

### 4.2 Inputs

- Height 44px (single line) or min-height 88px (textarea); padding 12px 16px; radius 12px; bg-tertiary; border 1px transparent; focus border accent; placeholder text-tertiary.

### 4.3 Chips / Pills

- Height 28px; padding 0 12px; radius 14px; Footnote; filled = bg-tertiary, outline = border 1px separator.

### 4.4 Toasts / Notifications

- Position: top-center or bottom-center (above Command Center).
- One line of text (Callout); optional icon; bg-elevated + shadow; border-radius 12px; padding 12px 16px; auto-dismiss 3–4s; slide-in 200ms.

### 4.5 Avatars

- Circular; sizes 24, 32, 40, 56px; use skin avatar image or initial + bg-tertiary.

---

## 5. Responsive & Adaptive

- **Mobile (< 640px)**: Single column; drawer = full sheet or 90% width; Command Center full width; nav labels can be icons only.
- **Tablet (640–1024px)**: Same layout with larger touch targets; optional sidebar for Swarm instead of sheet.
- **Desktop (> 1024px)**: Swarm as right panel (400px); modal max 560px; Command Center max 640px centered; office canvas uses remaining space.

**Touch**
- Min touch target 44×44px; spacing between targets ≥ 8px.

**PWA**
- Standalone: hide browser chrome; use theme-color and status bar style; splash screen with logo.

---

## 6. Accessibility

- **Color**: Don’t rely on color alone (status = icon + color + text).
- **Focus**: Visible focus ring (2px outline offset 2px) for keyboard/screen reader.
- **Labels**: All icons have aria-label or sr-only text.
- **Contrast**: text-primary on bg-primary ≥ 7:1; text-secondary ≥ 4.5:1.
- **Motion**: Honor `prefers-reduced-motion`.
- **Semantics**: Nav in `<nav>`, main in `<main>`, modals with role="dialog" and focus trap.

---

## 7. Implementation Checklist

- [ ] **Design tokens**: Implement color, type scale, spacing, and radius in CSS variables (or Tailwind theme).
- [ ] **Shell**: Nav with segmented control; safe areas; one nav pattern for all pages.
- [ ] **Office tab**: Full-bleed canvas; minimal overlay; loading state.
- [ ] **Command Center**: Exact layout (ring + input + voice + Deploy); states and toasts.
- [ ] **Swarm drawer**: Sheet/panel; task cards with left border; empty state.
- [ ] **My Proxy**: Sections and cards as specified.
- [ ] **Memory Vault**: Modal; search + agent filter; agent cards; skin selector.
- [ ] **World Generator**: Split layout; prompt + buttons; gallery.
- [ ] **Buttons & inputs**: Shared components with variants.
- [ ] **Motion**: Durations and easings; reduced-motion fallbacks.
- [ ] **A11y**: Focus, labels, contrast, semantics.

This spec is the single source of truth for Apple-grade UI/UX; implement components and screens to match it for a consistent, premium experience.

---

## 8. Design Principles in One Paragraph

**Clarity**: One primary action per context; clear hierarchy (title → body → caption); obvious loading/success/error states. **Deference**: Content (the office and agents) is hero; chrome is translucent and minimal so the world shows through. **Depth**: Layered elevation (canvas → cards → Command Center → drawer → modal) with blur and shadow; motion (sheet slide, modal scale) reinforces hierarchy. Typography and spacing follow a strict scale; color is restrained (true black/smoke backgrounds, white/gray text, one accent for CTAs). Motion is fast (150–300ms) and purposeful; reduced motion is respected.

---

## 9. Token Quick Reference (for implementation)

```css
/* Colors - Dark theme */
--bg-primary: #0a0a0a;
--bg-secondary: #141414;
--bg-elevated: #1c1c1e;
--bg-tertiary: #2c2c2e;
--text-primary: #ffffff;
--text-secondary: rgba(235, 235, 245, 0.6);
--text-tertiary: rgba(235, 235, 245, 0.3);
--separator: rgba(255, 255, 255, 0.12);
--accent-primary: #0a84ff;
--accent-success: #30d158;
--accent-warning: #ff9f0a;
--accent-error: #ff453a;
--accent-secondary: #5e5ce6;

/* Spacing (px) */
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 20px;  --space-6: 24px;  --space-8: 32px;  --space-10: 40px;
--space-12: 48px; --space-16: 64px; --space-20: 80px;

/* Radius */
--radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 20px;

/* Motion */
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--duration-fast: 150ms; --duration-normal: 250ms; --duration-slow: 400ms;
```

---

## 10. UX Copy Guidelines

- **Short and direct**: “Deploy”, “Swarm Activity”, “Memory Vault”, “My Proxy.”
- **Empty states**: One line of explanation + one line of next step (e.g. “No tasks yet. Feed context from the Command Center to get started.”).
- **Errors**: User-facing message + optional “Try again” or “Retry.”
- **Loading**: “Waking up the office…”, “Sending…”, “Generating…” — avoid generic “Loading”.
- **Success**: Subtle (checkmark or brief “Sent”); avoid long confirmations.
