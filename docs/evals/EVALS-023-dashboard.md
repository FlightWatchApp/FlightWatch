# EVALS-023 — Flight Watch Dashboard Evaluation Suite

**Version:** 1.0  
**Date:** October 2026  
**Coverage:** SPEC-023 (13 sub-specs)  
**Related:** SPEC-023-dashboard.md

---

## E-DASH-001: Highlight Card Renders with Correct Layout

**Category:** Layout & Structure  
**Specification:** SPEC-023.1 (Highlight Card)  
**Severity:** Critical

### Test Scenario

```tsx
<DashboardHighlight
  highlight={{
    from: 'GRU',
    to: 'MIA',
    currentPrice: 1083.91,
    targetPrice: 900,
    departureDate: '2026-10-20',
    delta: -18,
  }}
/>
```

### Acceptance Criteria

- ✅ Desktop (1440px): 2-column layout (left + right)
- ✅ Mobile (<600px): stacked (left, then right)
- ✅ Gradient background petróleo → petróleo-deep applied
- ✅ Left column shows heading + route + price + delta + buttons
- ✅ Right column shows chart placeholder + stats row
- ✅ Padding matches spec: 32px desktop, 24px mobile
- ✅ Border-radius: 16px

### Validation Method

- Render component
- Measure column widths at 1440px (should be ~50% each)
- Resize to 400px, verify stacking
- Check computed styles for gradient, radius, padding

---

## E-DASH-002: Highlight Card — Route Code Display

**Category:** Typography & Content  
**Specification:** SPEC-023.1  
**Severity:** High

### Test Scenario

Route code display with IATA format

### Acceptance Criteria

- ✅ Font: JetBrains Mono, 32px, weight 600
- ✅ Letter-spacing: 0.05em
- ✅ Color: Paper (#F5F3EE)
- ✅ Format: "GRU → MIA" (with arrow)
- ✅ Opacity: 95%
- ✅ No line breaks (stays on one line at desktop width)

### Validation Method

```js
const element = document.querySelector('[data-testid="highlight-route"]');
const styles = window.getComputedStyle(element);
assert(styles.fontFamily.includes('JetBrains Mono'));
assert(styles.fontSize === '32px');
assert(styles.fontWeight === '600');
assert(styles.letterSpacing === '1.6px'); // 0.05em * 32px
```

---

## E-DASH-003: Price Delta Indicator (Color-Coded)

**Category:** Accessibility & Data Representation  
**Specification:** SPEC-023.1  
**Severity:** High

### Test Scenario

Display price deltas: favorable (↓ 18%), neutral, unfavorable

### Acceptance Criteria

- ✅ Favorable delta (< -10%): Green #1D6B45, icon ↓
- ✅ Neutral delta (-10% to +10%): Amber #7F5200, icon ↔
- ✅ Unfavorable delta (> +10%): Red #A8261D, icon ↑
- ✅ Text label shown alongside icon (e.g., "↓ 18% abaixo da média")
- ✅ Not color-only (icon + text both present)
- ✅ Contrast ≥ WCAG AA (3:1 minimum)

### Validation Method

- Test with axe-core accessibility check
- Verify RGB values match spec colors
- Check that text content exists alongside color coding

---

## E-DASH-004: Highlight Card Chart Rendering

**Category:** Data Visualization  
**Specification:** SPEC-023.1  
**Severity:** Medium

### Test Scenario

Price history chart rendered from mock data

### Acceptance Criteria

- ✅ SVG line drawn with price history
- ✅ Chart height: 120px
- ✅ Background: rgba(255, 255, 255, 0.1)
- ✅ Line color: rgba(255, 255, 255, 0.5)
- ✅ Stroke-width: 2
- ✅ Border-radius: 10px
- ✅ Responsive width (100% of container)
- ✅ Line renders within bounds (no overflow)

### Validation Method

```js
const chart = document.querySelector('[data-testid="highlight-chart"]');
const svg = chart.querySelector('svg');
assert(svg !== null);
assert(svg.viewBox.baseVal.height === 80); // scaled
```

---

## E-DASH-005: Promotion Cards Grid Layout

**Category:** Layout & Responsiveness  
**Specification:** SPEC-023.2  
**Severity:** Critical

### Test Scenario

Grid of 3 promotion cards displays and responds to breakpoints

### Acceptance Criteria

- ✅ Desktop (≥1024px): 3-column grid
- ✅ Mobile (<600px): 1-column grid
- ✅ Gap: 24px
- ✅ No horizontal scroll at any width
- ✅ Cards have equal widths in grid
- ✅ Card padding: 24px
- ✅ Border-radius: 16px

### Validation Method

- Render dashboard with mock promos
- Measure grid at 1440px: 3 equal columns visible
- Resize to 400px: 1 column visible, full width
- Verify `overflow-x: auto` not present on grid

---

## E-DASH-006: Promotion Card Hover Lift

**Category:** Interaction & Animation  
**Specification:** SPEC-023.2  
**Severity:** Medium

### Test Scenario

Mouse hover over promotion card

### Acceptance Criteria

- ✅ Transform: translateY(-4px)
- ✅ Box-shadow: 0 8px 24px rgba(196, 98, 45, 0.2)
- ✅ Duration: 300ms
- ✅ Easing: cubic-bezier(0.25, 0.46, 0.45, 0.94)
- ✅ Smooth transition (no jank)
- ✅ Returns to original state on mouseleave
- ✅ Respects prefers-reduced-motion (transform removed)

### Validation Method

- Programmatic hover on card element
- Track animation frames, verify ≥55fps
- Measure transform values at 50ms intervals
- Verify transition property set correctly

---

## E-DASH-007: Promotion Card Content Display

**Category:** Content & Structure  
**Specification:** SPEC-023.2  
**Severity:** High

### Test Scenario

Promotion card shows all required content

### Acceptance Criteria

- ✅ Badge: "✓ Menor preço à vista" (green #1D6B45)
- ✅ Route: IATA format (e.g., "GRU → MIA", JetBrains Mono)
- ✅ Price: Large type (24px, weight 600)
- ✅ Description: Flight info (e.g., "Só ida · 24 de out · 2h30")
- ✅ Button: Full width, "Comprar passagem →"
- ✅ All text visible (no truncation)

### Validation Method

```js
const card = document.querySelector('[data-testid="promo-card"]');
assert(card.textContent.includes('GRU'));
assert(card.textContent.includes('→'));
assert(card.textContent.includes('MIA'));
assert(card.querySelector('button').textContent.includes('Comprar'));
```

---

## E-DASH-008: Monitoring Cards Grid & Buttons

**Category:** Layout & Interaction  
**Specification:** SPEC-023.3  
**Severity:** Critical

### Test Scenario

Monitoring cards grid displays all user routes with action buttons

### Acceptance Criteria

- ✅ Desktop (≥1024px): 2-column grid
- ✅ Mobile (<600px): 1-column
- ✅ Gap: 24px
- ✅ Each card shows: route, date, price, target, buttons
- ✅ Buttons: "Comprar" (primary), "Editar" (secondary)
- ✅ Buttons keyboard accessible (Tab, Enter)
- ✅ No horizontal scroll

### Validation Method

- Render 6 monitoring routes
- Count grid columns at different widths
- Tab through buttons, verify focus states
- Check button `type="button"` attributes

---

## E-DASH-009: Route Status Indicator (Meta Atingida)

**Category:** Accessibility & Data  
**Specification:** SPEC-023.3  
**Severity:** High

### Test Scenario

Monitoring card shows different status: "Meta atingida" vs. "Meta: R$ X"

### Acceptance Criteria

- ✅ Not reached: "Meta: R$ 900,00" (14px, muted text)
- ✅ Reached: "✓ Meta atingida" (14px, green #1D6B45)
- ✅ Icon (✓ or no icon) present alongside text
- ✅ Color accessible but not the only indicator
- ✅ Status clear to screen reader

### Validation Method

- Render card with reached status
- Check computed text color matches green token
- Verify screen reader announces status with aria-label or text content

---

## E-DASH-010: Sidebar Active Watches Summary

**Category:** Layout & Data  
**Specification:** SPEC-023.4  
**Severity:** High

### Test Scenario

Sidebar displays active monitoring summary on desktop

### Acceptance Criteria

- ✅ Desktop (≥1024px): Visible in right column
- ✅ Mobile (<600px): May collapse or appear below main
- ✅ Shows 3–5 active watches
- ✅ Each: route code, current price, target, status dot
- ✅ Status dot: green (#1D6B45) animated or static
- ✅ Scrollable if >5 watches (not pushing layout)

### Validation Method

- Render dashboard at 1440px with sidebar visible
- Verify sidebar grid-column: 1fr (right of 2fr main)
- Render at 400px, verify sidebar doesn't break layout

---

## E-DASH-011: Sidebar Stats Cards Styling

**Category:** Visual Design  
**Specification:** SPEC-023.4  
**Severity:** Medium

### Test Scenario

Three stats cards display (Economia, Passagens, Alertas) with color-coded borders

### Acceptance Criteria

- ✅ **Economia:** Green bg-10% (#1D6B45), left border green
- ✅ **Passagens:** Amber bg-10% (#7F5200), left border amber
- ✅ **Alertas:** Petróleo bg-10% (#0F4C5C), left border petróleo
- ✅ Each: large number (32px, weight 600) + label (14px)
- ✅ Padding: 16px
- ✅ Border-radius: 6px
- ✅ Border-left: 4px width

### Validation Method

```js
const econ = document.querySelector('[data-testid="stat-economy"]');
const border = window.getComputedStyle(econ).borderLeftColor;
assert(rgbToHex(border) === '#1D6B45');
```

---

## E-DASH-012: Header Sticky & User Info

**Category:** Layout & Navigation  
**Specification:** SPEC-023.5  
**Severity:** High

### Test Scenario

Header shows user info and remains accessible while scrolling

### Acceptance Criteria

- ✅ Header fixed or sticky (position: sticky/fixed)
- ✅ Z-index: 100 (above content)
- ✅ Shows heading "✈️ Flight Watch"
- ✅ Subtitle: "Bem-vindo, [Name] · [Email]"
- ✅ Right buttons: "+ Buscar passagem", "Sair"
- ✅ Padding: 24px (or responsive)
- ✅ Border-bottom: 1px solid border token
- ✅ Stays visible on scroll
- ✅ Responsive: stacks on mobile

### Validation Method

- Render full page
- Scroll 500px down
- Verify header still visible
- Check computed position (sticky or fixed)

---

## E-DASH-013: Reveal Animation on Load (Staggered)

**Category:** Animation & Performance  
**Specification:** SPEC-023.10  
**Severity:** Medium

### Test Scenario

Dashboard content fades in with staggered timing on page load

### Acceptance Criteria

- ✅ Highlight card: 0ms delay, 600ms duration
- ✅ Promos: 0ms, 100ms, 200ms delays (per card)
- ✅ Monitoring cards: 0ms, 100ms, 200ms, ... delays
- ✅ Animation: Fade-in + translateY(+12px) → 0
- ✅ Easing: cubic-bezier(0.25, 0.46, 0.45, 0.94)
- ✅ No jank (≥55fps)
- ✅ prefers-reduced-motion: animationDuration 0.01ms

### Validation Method

```js
const highlight = document.querySelector('[data-testid="highlight"]');
const styles = window.getComputedStyle(highlight);
assert(styles.animationDuration === '600ms');
assert(styles.animationDelay === '0ms');

const promo2 = document.querySelector('[data-testid="promo-card"]:nth-child(2)');
const delay = window.getComputedStyle(promo2).animationDelay;
assert(delay === '100ms');
```

---

## E-DASH-014: Responsive Breakpoints & No Horizontal Scroll

**Category:** Responsiveness & Performance  
**Specification:** SPEC-023.6  
**Severity:** Critical

### Test Scenario

Dashboard renders at multiple widths without horizontal scroll

### Breakpoints to Test

- **Mobile:** 320px, 390px (iPhone)
- **Tablet:** 600px, 768px
- **Desktop:** 1024px, 1440px, 1920px

### Acceptance Criteria

- ✅ At 320px: Single column, 16px side gutter, readable
- ✅ At 390px: Full content visible, no h-scroll
- ✅ At 600px: Sidebar below or collapsed
- ✅ At 1024px+: 2-column layout active
- ✅ Highlight card stacks at <600px
- ✅ Promos: 1 column <600px, 2 columns 600–1024px, 3 columns ≥1024px
- ✅ `body { overflow-x: hidden }` not needed

### Validation Method

```js
// Test function
function checkResponsive(width) {
  viewport.setSize(width, 800);
  const scrollWidth = document.documentElement.scrollWidth;
  assert(scrollWidth === width, `Horizontal scroll at ${width}px`);
}

[320, 390, 600, 1024, 1440].forEach(checkResponsive);
```

---

## E-DASH-015: Lighthouse Performance & Web Vitals

**Category:** Performance  
**Specification:** SPEC-023.12  
**Severity:** Critical

### Test Scenario

Dashboard audited with Lighthouse (desktop & mobile)

### Acceptance Criteria

- ✅ **Lighthouse Performance:** ≥ 90
- ✅ **LCP (Largest Contentful Paint):** < 2.5s
- ✅ **CLS (Cumulative Layout Shift):** < 0.1
- ✅ **INP (Interaction to Next Paint):** < 200ms
- ✅ **First Contentful Paint (FCP):** < 1.8s
- ✅ **Time to Interactive (TTI):** < 3s

### Validation Method

```bash
npm run lighthouse -- http://localhost:3000/dashboard
# Check report:
# - Performance score ≥ 90
# - No CLS warnings
# - LCP element identified, <2.5s
```

---

## E-DASH-016: Accessibility Audit (axe-core)

**Category:** Accessibility  
**Specification:** SPEC-023.11  
**Severity:** Critical

### Test Scenario

Dashboard audited with axe-core for WCAG AA compliance

### Acceptance Criteria

- ✅ **Violations:** 0 (critical)
- ✅ **Color contrast:** ≥ 4.5:1 (text), ≥ 3:1 (graphics)
- ✅ **Focus indicators:** 2px outline, visible
- ✅ **Keyboard navigation:** Tab through all interactive elements
- ✅ **ARIA labels:** Regions labeled, live regions where needed
- ✅ **Semantic HTML:** Headings, nav, buttons, sections properly marked
- ✅ **Alt text:** Not required (no images in mockup)

### Validation Method

```js
const axe = require('axe-core');
axe.run(document, {}, (error, results) => {
  assert(results.violations.length === 0);
  assert(results.incomplete.length === 0); // Optional check
});
```

---

## E-DASH-017: TypeScript Strict Mode — No Errors

**Category:** Code Quality  
**Specification:** SPEC-023 (General)  
**Severity:** High

### Test Scenario

Components compile with TypeScript `strict: true`

### Acceptance Criteria

- ✅ No `any` types without explicit `// @ts-expect-error` comment
- ✅ All props typed with interfaces/types
- ✅ All state and refs typed correctly
- ✅ No implicit `any` from function parameters
- ✅ `npm run type-check` passes with 0 errors

### Validation Method

```bash
npm run type-check
# Expected output: "No errors"
```

---

## E-DASH-018: CSS Modules — No Global Leaks

**Category:** Code Quality  
**Specification:** SPEC-023 (General)  
**Severity:** Medium

### Test Scenario

Components use CSS Modules without global style pollution

### Acceptance Criteria

- ✅ All `.css` files imported as `import styles from '*.module.css'`
- ✅ Classes applied via `className={styles.className}`
- ✅ No `<style>` tags in component JSX
- ✅ No global selectors in CSS Modules
- ✅ Color tokens from `:root` CSS variables

### Validation Method

- Inspect rendered components
- Check DevTools Styles for scoped class names (e.g., `DashboardCard__root__a1b2`)
- No unscoped class leaks to other components

---

## E-DASH-019: Data Binding & Mock API Integration

**Category:** Data & Integration  
**Specification:** SPEC-023.13  
**Severity:** High

### Test Scenario

Components accept and display mock API data correctly

### Acceptance Criteria

- ✅ `<DashboardHighlight>` accepts `highlight` prop (object)
- ✅ `<PromotionCard>` accepts `promo` prop
- ✅ `<MonitoringCard>` accepts `monitor` prop
- ✅ `<SidebarStats>` accepts `stats` prop
- ✅ Props match JSON shape from spec (SPEC-023.13)
- ✅ Missing data gracefully handled (fallback or hidden)
- ✅ No console errors with valid data

### Validation Method

```tsx
const mockHighlight = {
  from: 'GRU',
  to: 'MIA',
  currentPrice: 1083.91,
  // ...
};

render(<DashboardHighlight highlight={mockHighlight} />);
assert(screen.getByText('GRU')); // Route renders
```

---

## E-DASH-020: Mobile Touch Targets ≥ 44px

**Category:** Accessibility & Mobile  
**Specification:** SPEC-023.11  
**Severity:** Medium

### Test Scenario

All interactive elements (buttons, links) have touch targets ≥ 44px

### Acceptance Criteria

- ✅ Buttons (Comprar, Editar, Sair, etc.): ≥ 44×44px
- ✅ Links (if any): ≥ 44×44px
- ✅ Gaps between targets: ≥ 8px
- ✅ No overlapping touch targets
- ✅ Verified on mobile (390px viewport)

### Validation Method

```js
function checkTouchTarget(element) {
  const { width, height } = element.getBoundingClientRect();
  assert(width >= 44 && height >= 44, `Target too small: ${width}×${height}`);
}

document.querySelectorAll('button, a').forEach(checkTouchTarget);
```

---

## Evaluation Execution

### Quick Run

```bash
npm run eval:dashboard
# Runs E-DASH-001, 005, 012, 013, 014, 015, 016, 017, 018 (critical only)
```

### Full Suite

```bash
npm run eval:dashboard -- --full
# Runs all E-DASH-001 through E-DASH-020
```

### Specific Evaluation

```bash
npm run eval -- E-DASH-001
npm run eval -- E-DASH-015
```

---

## Pass/Fail Criteria

| Range                   | Status                        |
| ----------------------- | ----------------------------- |
| All critical evals pass | ✅ Ready for review           |
| ≥1 critical fails       | ❌ Blocked                    |
| Optional evals fail     | ⚠️ Warning (fix before merge) |

**Critical evals:** E-DASH-001, 005, 012, 013, 014, 015, 016, 017

---

## Related Documentation

- **SPEC-023-dashboard.md** — Full specification
- **Design Canvas:** https://claude.ai/artifact/5QKPKMFSHZexX5TT6HfDwp
- **SPEC-022:** Animation specs (reveal, hover)

**Version History:**

- v1.0 — Initial eval suite (20 evaluations)
