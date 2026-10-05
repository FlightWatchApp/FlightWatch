# SPEC-023 — Flight Watch Logged-in User Dashboard

**Version:** 1.0  
**Date:** October 2026  
**Status:** Ready for implementation  
**Related:** [[flight-watch-instagram-animations]] (SPEC-022)

> **Nota de organização (2026-10-05):** esta spec veio do pacote
> `flight-watch-dashboard/`, que não era versionado. A implementação existe em
> `apps/web/src/components/dashboard/` (usada por `/watches`) e foi adaptada:
> reaproveita `WatchCard`, `DealCard` e `WatchHighlight` em vez dos componentes
> próprios do pacote. O status acima **não foi reavaliado** contra os critérios
> de aceitação; evals em [`../evals/EVALS-023-dashboard.md`](../evals/EVALS-023-dashboard.md).
> SPEC-022 não existe no repositório.

---

## Overview

Flight Watch logged-in user dashboard (home page for authenticated users) provides a personalized monitoring interface showing:

- **Highlighted deal** — First monitored route with best price
- **Personalized promotions** — Current deals for user's monitored routes
- **Active monitoring cards** — All user's current route watches
- **Price history & stats** — Savings, alerts, booking history
- **Dashboard sidebar** — Quick stats, CTA for new searches

Mirrors visitor home structure but replaces product presentation with user data and actionable monitoring information.

---

## SPEC-023.1: Highlight Card (Destaque Principal)

**Dado:** User has at least one active monitored route  
**Quando:** Dashboard loads  
**Então:** Display hero card with:

### Layout

- **2-column grid** (desktop) / **stacked** (mobile <600px)
- **Left side:** Route info + CTA buttons
- **Right side:** Price chart + stats (days/meta)
- **Gradient background:** Petróleo → Petróleo-dark (#0F4C5C → #0A3844)
- **Padding:** 32px (desktop), 24px (mobile)
- **Border-radius:** 16px

### Content — Left Column

- **Heading:** "Preço favorável!" (or "Monitorando" if no deal yet)
- **Route code:** IATA format (e.g., "GRU → MIA")
  - Font: JetBrains Mono, 32px, weight 600, letter-spacing 0.05em
  - Color: Paper (#F5F3EE)
  - Opacity: 95%
- **Price:** Current best price in large type
  - Font: 24px, weight 600, color Paper
- **Delta:** Price vs. average or target
  - Green (#1D6B45) if favorable (↓ 18%)
  - Amber (#7F5200) if neutral
  - Red (#A8261D) if unfavorable
  - Font: 14px, font-weight 500
- **Buttons:** 2-column flex gap 12px
  - Primary: "Comprar passagem →" (Route color #C4622D on Paper bg)
  - Secondary: "Monitorar" (transparent with white border 40% opacity)

### Content — Right Column

- **Chart placeholder:** 120px height
  - Background: rgba(255, 255, 255, 0.1)
  - Line chart: price history curve (SVG line, rgba(255,255,255,0.5), stroke-width 2)
  - Padding: 16px
  - Border-radius: 10px
- **Stats row:** 2-column grid below chart
  - **Left stat:** "20 de out" (departure date) label "Ida"
  - **Right stat:** "R$ 900" (target/meta) label "Meta"
  - Stat boxes: rgba(255, 255, 255, 0.1), 12px padding, rounded

### Accessibility

- **Semantic:** `<section role="region" aria-label="Melhor preço monitorado">`
- **Buttons:** Full text labels, no icon-only
- **Contrast:** WCAG AA minimum (Paper on Petróleo ≥ 7:1)

### Performance

- No animations on initial load
- Chart renders at screen width (resize responsive)
- DPR-aware for retina displays

---

## SPEC-023.2: Personalized Promotions Section

**Dado:** Dashboard has loaded, user has 1+ monitored routes  
**Quando:** Promotions data available from API  
**Então:** Display 3-column grid of promotion cards (1 column mobile)

### Layout

- **Container:** Full width section
- **Grid:** 3 columns (desktop), 1 column (mobile)
- **Gap:** 24px
- **Card padding:** 24px
- **Border-radius:** 16px

### Card Styling

- **Gradient:** Route orange → Route orange light (#C4622D → #E8834F)
- **Text color:** Paper (#F5F3EE)
- **Transition:** transform 0.3s ease, box-shadow 0.3s ease

### Card Content

- **Badge:** "✓ Menor preço à vista" (light green bg #1D6B45)
  - Padding: 4px 12px
  - Border-radius: 6px
  - Font: 12px, weight 600
- **Route:** IATA format (GRU → MIA)
  - Font: JetBrains Mono, 18px, weight 600, letter-spacing 0.05em
  - Margin-bottom: 12px
- **Price:** Large type (24px, weight 600, margin-bottom 4px)
- **Description:** Flight info
  - Font: 14px
  - Opacity: 90%
  - Example: "Só ida · 24 de out · 2h30"
- **CTA Button:** "Comprar passagem →"
  - Full width
  - Background: Paper
  - Text: Route orange
  - Padding: 8px 16px
  - Border-radius: 10px
  - Font-weight: 600

### Hover State

- **Transform:** translateY(-4px)
- **Box-shadow:** 0 8px 24px rgba(196, 98, 45, 0.2)
- **Duration:** 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)

### Accessibility

- **Region:** `role="region" aria-label="Promoções nos seus destinos"`
- **Cards:** Each is a clickable `<article>` or `<div role="listitem">`
- **Button:** Full text, not icon-only
- **Color not only:** Promo state (price/route) is primary indicator, badge secondary

### Animation

- **Reveal:** Fade-in + slide-up (600ms, staggered 0ms/100ms/200ms)
- **Respects:** prefers-reduced-motion → 0ms duration

---

## SPEC-023.3: Monitoring Cards Grid

**Dado:** Dashboard loaded, user has 2+ monitored routes  
**Quando:** User scrolls to "Todos os seus monitoramentos"  
**Então:** Display grid of monitoring cards

### Layout

- **Container:** Full width
- **Grid:** 2 columns (desktop ≥1024px), 1 column (mobile)
- **Gap:** 24px
- **Card padding:** 16px
- **Border:** 1px solid border token (#E8E6E1)
- **Border-radius:** 10px
- **Background:** Bg token (Paper #F5F3EE)

### Card Content (per route)

- **Route code:** IATA format (GRU → MIA)
  - Font: JetBrains Mono, 14px, weight 600
  - Color: Petróleo (#0F4C5C)
  - Margin-bottom: 8px
- **Date:** Departure date
  - Font: 12px
  - Color: Text-muted
  - Margin-bottom: 12px
- **Price section:**
  - **Current:** "R$ 1.083,91" (weight 600, 16px)
  - **Label:** "Último preço observado" (font 12px, muted)
  - Margin-bottom: 12px
- **Target/Status:**
  - If not reached: "Meta: R$ 900,00" (12px, muted)
  - If reached: "✓ Meta atingida" (12px, green #1D6B45)
  - Margin-bottom: 12px
- **Action buttons:** 2-column flex, gap 8px
  - **Primary:** "Comprar" (Petróleo bg, Paper text)
  - **Secondary:** "Editar" (transparent, Petróleo border/text)
  - Padding: 8px 16px each
  - Font: 12px
  - Border-radius: 6px

### Hover State

- **Border:** Transition to accent color (Petróleo)
- **Box-shadow:** 0 2px 8px rgba(15, 76, 92, 0.08)
- **Duration:** 200ms

### Accessibility

- **Semantic:** `<article>` or `<div role="region">`
- **Route:** Announce as "monitored route GRU to MIA"
- **Buttons:** Full labels, keyboard accessible

### Animation

- **Load:** Fade-in (600ms, 0ms delay for all in view)
- **Respects:** prefers-reduced-motion

---

## SPEC-023.4: Sidebar — Active Monitoring Summary

**Dado:** Dashboard renders  
**Quando:** Sidebar visible (desktop ≥1024px) or collapsed section (mobile)  
**Então:** Show:

### Section 1: Active Watches (3-5 items)

- **Each watch item:**
  - Route code (JetBrains Mono, 14px, Petróleo #0F4C5C)
  - Price info flex row
    - Current price (weight 600, 16px)
    - Target price (font 12px, muted, right-aligned)
  - Status indicator
    - Green dot + "Observando" (12px, muted)
    - Green text + "✓ Meta atingida" (12px, #1D6B45)
- **Card styling:** Hover lift (transform -4px, shadow 0 2px 8px)

### Section 2: Stats Cards (3 items)

- **Economia estimada:** R$ 2.458,20 (green bg-10%, green left-border)
- **Passagens compradas:** 7 (amber bg-10%, amber left-border)
- **Alertas recebidos:** 18 (petróleo bg-10%, petróleo left-border)
- **Each card:**
  - Value: 32px, weight 600
  - Label: 14px, muted
  - Padding: 16px
  - Border-left: 4px
  - Border-radius: 6px

### Section 3: New Search CTA

- **Heading:** "Buscar nova passagem"
- **Subheading:** "Começar a monitorar uma rota" (14px, muted)
- **Button:** Full-width primary (Petróleo, Paper text, 16px padding)
- **Background:** Petróleo bg-10% (subtle tint)
- **Border:** None (or 1px subtle)

### Accessibility

- **Region:** `role="region" aria-label="Resumo de monitoramentos"`
- **Cards:** Each `role="article"` or similar
- **CTA:** Button with full text

### Animation

- **Reveal:** Staggered reveal (600ms, 0ms/100ms/200ms delays)

---

## SPEC-023.5: Header & Navigation

**Dado:** Dashboard loads  
**Quando:** User views page  
**Então:** Show fixed/sticky header with:

### Layout

- **Flex row:** align center, justify space-between
- **Padding:** 24px top/bottom, 16px sides
- **Border-bottom:** 1px solid border token (#E8E6E1)
- **Background:** Paper (#F5F3EE)
- **Z-index:** 100 (sticky/fixed)

### Left Section

- **Logo/Title:** "✈️ Flight Watch"
  - Font: 24px, weight 600, letter-spacing -0.02em
  - Color: Ink (#14212B)
- **Subtitle:** "Bem-vindo, João · user@email.com"
  - Font: 14px, muted
  - Margin-top: 8px

### Right Section (Buttons)

- **"+ Buscar passagem"** (Petróleo bg, Paper text, weight 500)
- **"Sair"** (Petróleo bg, Paper text)
- **Gap:** 16px
- **Padding:** 8px 24px each
- **Border-radius:** 10px
- **Font:** 14px

### Responsive

- **Mobile (<600px):**
  - Stack vertically
  - Align left
  - Buttons full-width
  - Padding: 16px
  - Font: smaller (20px for title)

### Accessibility

- **Semantic:** `<header>`
- **Buttons:** Full text labels
- **Logo:** Can be `<a href="/">` if clickable

---

## SPEC-023.6: Responsive Behavior

### Desktop (≥1024px)

- **Layout:** 2-column grid (main + sidebar)
  - Main: 2fr width
  - Sidebar: 1fr width
  - Gap: 32px
- **Highlight card:** 2-column (left + right)
- **Promos grid:** 3 columns
- **Monitoring cards:** 2 columns
- **Sidebar:** Sticky or visible always

### Tablet (600px–1023px)

- **Layout:** 1 column
- **Highlight card:** Stacked (left, then right)
- **Promos grid:** 2 columns or 1 (depending on width)
- **Monitoring cards:** 1 column
- **Sidebar:** Collapsed or below main

### Mobile (<600px)

- **Layout:** 1 column, full width
- **Padding:** 16px sides, 24px top/bottom
- **Highlight card:** Stacked
- **Promos grid:** 1 column
- **Monitoring cards:** 1 column
- **Sidebar:** Below all, or collapsible sections
- **Header:** Compact, buttons possibly stacked

### No horizontal scroll at any width

---

## SPEC-023.7: Color Tokens

| Token              | Light   | Dark    | Usage                     |
| ------------------ | ------- | ------- | ------------------------- |
| `--fw-petrol`      | #0F4C5C | #2A8FA3 | Primary, accents, buttons |
| `--fw-petrol-deep` | #0A3844 | #1F6B86 | Hover states, gradients   |
| `--fw-paper`       | #F5F3EE | #1A1917 | Background, text on dark  |
| `--fw-ink`         | #14212B | #EDE8E2 | Primary text              |
| `--fw-route`       | #C4622D | #E8834F | Promotions, secondary     |
| `--fw-route-light` | #E8834F | #F5A562 | Promotion hover           |
| `--fw-green`       | #1D6B45 | #4CAF78 | Success, savings          |
| `--fw-amber`       | #7F5200 | #D8A563 | Neutral, warning          |
| `--fw-red`         | #A8261D | #E8523A | Alert, issues             |
| `--border`         | #E8E6E1 | #3D3937 | Dividers, edges           |
| `--text-muted`     | #7A7873 | #A39F9A | Secondary text            |

---

## SPEC-023.8: Typography

| Scale       | Size    | Weight | Line-height | Usage                          |
| ----------- | ------- | ------ | ----------- | ------------------------------ |
| Display     | 32px    | 600    | 1.2         | Main headings (routes, prices) |
| Title       | 24px    | 600    | 1.3         | Page title, section headers    |
| Heading     | 20px    | 600    | 1.4         | Card titles                    |
| Body        | 16px    | 400    | 1.6         | Running text                   |
| Small       | 14px    | 400    | 1.5         | Labels, metadata               |
| Extra small | 12px    | 500    | 1.4         | Badges, status                 |
| Mono        | 14–32px | 600    | Tight       | IATA codes (JetBrains Mono)    |

- **Font families:**
  - Body/Display: Instrument Sans (or -apple-system, BlinkMacSystemFont, "Segoe UI")
  - Mono: JetBrains Mono (or "Courier New")

---

## SPEC-023.9: Spacing & Layout Scale

| Name         | Value | Usage                       |
| ------------ | ----- | --------------------------- |
| `--space-1`  | 4px   | Micro gaps                  |
| `--space-2`  | 8px   | Small gaps, padding         |
| `--space-3`  | 12px  | Standard gaps               |
| `--space-4`  | 16px  | Medium gaps, padding        |
| `--space-6`  | 24px  | Section padding, large gaps |
| `--space-8`  | 32px  | Hero padding, grid gaps     |
| `--space-12` | 48px  | Large section gaps          |

- **Border-radius:**
  - `--radius-sm` = 6px (badges, small buttons)
  - `--radius-md` = 10px (cards)
  - `--radius-lg` = 16px (hero, large sections)

---

## SPEC-023.10: Animations & Motion

### Reveal (on page load)

- **Keyframe:** Fade-in + translateY(+12px) → full opacity, Y(0)
- **Duration:** 600ms
- **Easing:** cubic-bezier(0.25, 0.46, 0.45, 0.94)
- **Stagger:** 0ms, 100ms, 200ms per item in view

### Hover (interactive elements)

- **Transform:** translateY(-4px)
- **Box-shadow:** 0 8px 24px rgba(15, 76, 92, 0.08)
- **Duration:** 300ms ease

### prefers-reduced-motion

- All animation durations → 0.01ms
- All transforms → none
- Content appears instantly

---

## SPEC-023.11: Accessibility Requirements

- **WCAG AA minimum** contrast (4.5:1 text, 3:1 graphics)
- **Keyboard navigation:** Tab, Enter, Arrow keys (carousel if present)
- **Screen reader:** Semantic HTML, ARIA labels where needed
- **Focus indicators:** 2px outline, 2px offset
- **Color not only:** Status (deal/meta) indicated by icon + text, not color alone
- **Touch targets:** Min 44px (mobile)
- **Responsive text:** No fixed widths, text wraps

---

## SPEC-023.12: Performance Targets

| Metric                    | Target    |
| ------------------------- | --------- |
| Lighthouse Performance    | ≥ 90      |
| Core Web Vitals — LCP     | < 2.5s    |
| Core Web Vitals — CLS     | < 0.1     |
| Core Web Vitals — INP     | < 200ms   |
| Time to Interactive (TTI) | < 3s      |
| FPS (animations)          | ≥ 55fps   |
| No layout shift on load   | CLS < 0.1 |
| TypeScript check          | No errors |

- **Optimizations:**
  - CSS Modules (no global leaks)
  - Lazy-load images (if any)
  - Transform-only animations (GPU accelerated)
  - Debounce hover/resize events

---

## SPEC-023.13: Data Requirements

### From API (user session)

- User name, email
- Active monitored routes (ID, IATA from/to, current price, target price, dates)
- Price history for each route (timestamps, prices)
- Promotions (from/to, price, discount %, dates, flight details)
- User stats (total savings, bookings count, alerts count)

### Example Shape

```json
{
  "user": {
    "name": "João",
    "email": "user@example.com"
  },
  "highlights": [
    {
      "routeId": "gru-mia",
      "from": "GRU",
      "to": "MIA",
      "currentPrice": 1083.91,
      "targetPrice": 900,
      "departureDate": "2026-10-20",
      "delta": -18,
      "priceHistory": [...],
      "status": "favorable"
    }
  ],
  "promotions": [
    {
      "from": "GRU",
      "to": "MIA",
      "price": 1083.91,
      "discount": 18,
      "date": "2026-10-20",
      "flightTime": "2h30",
      "type": "round-trip"
    }
  ],
  "activeWatches": [...],
  "stats": {
    "totalSavings": 2458.20,
    "bookingsCount": 7,
    "alertsCount": 18
  }
}
```

---

## Acceptance Criteria

- ✅ Layout matches design canvas (2-column desktop, 1 mobile)
- ✅ Highlight card shows best route + price + delta
- ✅ Promos grid shows 3-column (1 mobile) with hover lift
- ✅ Monitoring cards grid shows all routes + buttons
- ✅ Sidebar shows active watches, stats, CTA
- ✅ Header sticky with user info + buttons
- ✅ Responsive at 390px, 600px, 1024px, 1440px
- ✅ No horizontal scroll at any width
- ✅ Animations respect prefers-reduced-motion
- ✅ Lighthouse Performance ≥ 90
- ✅ CLS < 0.1 (no layout shift)
- ✅ WCAG AA accessibility
- ✅ TypeScript strict mode, no errors
- ✅ CSS Modules (no global CSS)

---

## Related Specifications

- **SPEC-022:** Animation specs (reveal, hover, transitions)
- **Design Canvas:** https://claude.ai/artifact/5QKPKMFSHZexX5TT6HfDwp
- **Flight Watch Brand:** Petróleo #0F4C5C, Laranja #C4622D, Instrument Sans + JetBrains Mono

**Version History:**

- v1.0 — Initial spec (SPEC-023 baseline)
