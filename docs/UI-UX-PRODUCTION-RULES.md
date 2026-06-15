# Production UI/UX rules for vibe-coded apps

A practical checklist plus paste-ready prompt snippets to make AI-generated ("vibe-coded") UIs look and feel like a polished, production product instead of generic AI output. Researched and compiled 2026-06-15 with cited sources.

## 0. Why vibe-coded UIs look the same

AI coding tools do not design, they average. They sample the statistical center of training data unless told otherwise. Tailwind's creator Adam Wathan: "I'd like to formally apologize for making every button in Tailwind UI bg-indigo-500 five years ago, leading to every AI generated UI on earth also being indigo." (https://x.com/adamwathan/status/1953510802159219096)

The recognizable "AI slop" cluster (Developers Digest 2025 audit, https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it):
- Permanent dark mode, medium-grey body text, all-caps section labels (34%, the most common tell)
- Purple-to-blue / indigo-violet hero gradients and gradient hero text (27%)
- Three identical feature cards in a row, thin-line icon, four-word title, one sentence of filler (22%)
- 22% of pages hit four or more of these patterns

Other tells: Inter / Poppins / Geist / Space Grotesk everywhere, over-rounding, default Tailwind gray-slate palette, emoji/Lucide icons, centered everything, glassmorphism overuse, the hero -> 3 features -> testimonials -> CTA cadence, "Empowering Your Journey" filler copy.

## 1. Loading and async states

Nielsen response-time limits (https://www.nngroup.com/articles/response-times-3-important-limits/): 0.1s feels instant, 1.0s stays in flow, 10s is the attention limit.

1. No loading indicator for actions under ~1s. A loader that flashes for 80ms looks broken.
2. Indeterminate spinner for short shapeless waits (2 to 10s). Determinate percent bar for 10s+ or "file 3 of 10." Progress bars only move forward.
3. Skeleton screens for content-shaped layouts (feeds, lists, cards) to reserve space and prevent layout shift. Spinners for momentary shapeless waits.
4. Do NOT claim skeletons "feel 30% faster" (folklore). The one controlled study (Viget, https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens) found skeletons scored worst on perceived duration. Use them for layout stability, not a speed claim.
5. Avoid loader flicker with a two-timer pattern (https://github.com/smeijer/spin-delay): delay showing the spinner ~500ms, then keep it visible at least 200ms.
6. Optimistic UI for low-stakes high-success actions (likes, toggles, reorders). React 19 useOptimistic (https://react.dev/reference/react/useOptimistic) or TanStack onMutate/onError rollback.
7. Do NOT use optimistic UI for payments or irreversible operations.
8. Stream when you can. Suspense + RSC / Next.js loading.js sends the shell immediately (https://nextjs.org/docs/app/guides/streaming).

## 2. Empty states, zero-data, first-run

1. Never leave the space blank. Every empty state: (a) say there is nothing yet, (b) show what will appear and how, (c) give a prominent action to populate it.
2. Make the CTA the visual hero of the empty state (Refactoring UI).
3. Distinguish first-run, user-cleared, and no-results. Do not show generic "No data" for all three.
4. For no-results, preserve the query, explain the miss, offer a one-click reset.
5. Real placeholder content, never lorem ipsum.

Source: https://www.nngroup.com/articles/empty-state-interface-design/

## 3. Error handling and feedback

1. Errors next to their source, plain language, what went wrong and how to fix it. Preserve the user's input (https://www.nngroup.com/articles/error-message-guidelines/).
2. Validate on blur and submit, not every keystroke; once a field is in error, re-validate on keystroke so it clears when fixed. Inline validation payoff (Etre/LukeW, https://www.lukew.com/ff/entry.asp?883=): +22% success, -22% errors, +31% satisfaction.
3. On submit with errors, focus the first invalid field. Add a top error summary for long/accessibility-critical forms (https://design-system.service.gov.uk/components/error-summary/).
4. Toasts auto-dismiss ~4 to 5s (Sonner default 4000ms), one at a time, dismissible, never for critical/blocking errors.
5. Wire toasts to a live region: role="status"/aria-live="polite" normally, role="alert" only when truly imperative.
6. Wrap risky subtrees in error boundaries with a retry (https://react.dev/reference/react/Component). Boundaries do NOT catch event-handler or async errors.
7. Retry transient failures with capped exponential backoff plus jitter (https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/).
8. Prefer undo over confirm (https://alistapart.com/article/neveruseawarning/). Reserve confirm dialogs for irreversible actions; type-to-confirm for the most dangerous.
9. Confirm dialogs use verb-specific buttons ("Delete file" / "Keep file"), never Yes/No; separate the destructive button from the benign one.

## 4. Microinteractions and motion

1. Animate only transform and opacity (GPU-cheap, 60fps). Never transition: all (Josh Comeau, https://www.joshwcomeau.com/animation/css-transitions/).
2. 150 to 300ms for microinteractions (250ms hover); larger surfaces can run longer.
3. Asymmetric timing: quick enter, slower exit.
4. Easing by purpose: ease-out for entrances, ease-in only when exiting offscreen, linear only for loops. A custom cubic-bezier(0.22, 1, 0.36, 1) is a sound convention.
5. Respect prefers-reduced-motion (wrap motion in @media (prefers-reduced-motion: no-preference)). WCAG 2.3.3.
6. Animate the few moments that benefit. Do not animate body text or loop motion in peripheral vision.
7. Every interactive element needs distinct hover, active/pressed, and focus states.

## 5. Typography and spacing

1. Defined modular type scale, not arbitrary px (e.g. 12/14/16/18/20/24/30/36/48/60/72).
2. Body 16 to 18px; line-height ~1.5 to 1.7 for body, 1.0 to 1.2 for large headlines.
3. Measure 45 to 75 characters per line; max-width: 65ch sits inside that.
4. Typeface with 5+ weights; in UI never go under 400; two weights usually suffice, three is the ceiling.
5. Hierarchy via size, weight, and color together; emphasize by de-emphasizing.
6. text-balance on headlines, text-pretty on body, curly quotes.
7. Spacing on a constrained scale (4/8/12/16/24/32/48/64/96), even values. No two scale values closer than ~25%. Start with too much whitespace, then remove. 80 to 120px between desktop sections.

Sources: Refactoring UI (https://refactoringui.com/previews/line-height-is-proportional), 4/8pt grid convention.

## 6. Color and visual design

1. Cap the palette at 3 to 5 colors: one dominant neutral, one accent used sparingly, plus state colors (v0 system prompt).
2. Do NOT use purple/violet/indigo prominently. Avoid default Tailwind blue/slate/gray out of the box.
3. Avoid gradients unless asked. Never mix opposing temperatures.
4. Never pure #000 or #fff on large surfaces (use ~#1a1a1a and ~#faf9f6). Greys carry a subtle hue.
5. Build a real 8 to 10 shade ramp, define colors in HSL.
6. Do not put neutral grey text on a colored background; derive text color from the background hue.
7. Avoid three-identical-cards, centered-everything, glassmorphism, emoji icons. Add one distinctive element per page.
8. Never rely on color alone for meaning (WCAG 1.4.1).
9. Shadows: tinted toward the background hue, layered, multi-step. As elevation rises, more offset/blur, less opacity (https://www.joshwcomeau.com/css/designing-shadows/).
10. Contrast: 4.5:1 normal text, 3:1 large text and UI components (WCAG 1.4.3 / 1.4.11).
11. Child border-radius <= parent; keep nested radii concentric.

## 7. Forms and inputs

1. Visible label above each input (top-aligned is fastest, LukeW/Penzo). Never placeholder-as-label (https://www.nngroup.com/articles/form-design-placeholders/).
2. Single column. Group short related fields on one row only when logical (City/State/Zip).
3. Distinguish required vs optional; state formatting up front, not only in errors.
4. Autofocus only on single-purpose pages/modals.
5. Inline error between label and input with a red border, associated via aria-describedby. Never color-only.
6. Do NOT disable submit until valid (https://adamsilver.io/blog/the-problem-with-disabled-buttons-and-what-to-do-instead/). The one acceptable disable is a brief in-flight state with a spinner to block double-submit.
7. Set type, inputmode, and autocomplete (e.g. current-password, new-password). web.dev sign-in best practices.
8. Input font-size >= 16px on mobile to prevent iOS zoom.
9. Full keyboard support, no traps (WCAG 2.1.1, 2.1.2).

## 8. Accessibility baseline (WCAG 2.2 AA)

1. Semantic HTML first; aria only when no native element fits.
2. Visible :focus-visible on everything. AAA focus: 2px perimeter, 3:1 contrast (SC 2.4.13).
3. Contrast 4.5:1 text, 3:1 large/UI. Never color-only meaning.
4. aria-label on icon-only buttons.
5. Touch targets: design for 44 to 48px (Apple HIG 44, Material 48, WCAG AAA 44); 24px is the hard floor (WCAG 2.2 AA SC 2.5.8).
6. Respect prefers-reduced-motion.
7. Keyboard operable, no traps.

NN/g's 10 heuristics are the higher-level lens: https://www.nngroup.com/articles/ten-usability-heuristics/

## 9. Responsiveness and layout

1. Mobile-first; Flexbox by default, Grid only for genuine 2D layouts.
2. Conventional breakpoints (640/768/1024/1280/1536). Test the in-between widths.
3. Constrain content width; body copy 65ch even when sections go full-bleed.
4. Do not center everything; left-aligned reads more confident.
5. No fixed heights on content containers; no horizontal scroll.
6. Reserve space for async/media so layout does not jump.

## 10. Performance and polish

Core Web Vitals at the 75th percentile (https://web.dev/articles/vitals): LCP <= 2.5s, CLS <= 0.1, INP <= 200ms. INP replaced FID on 2024-03-12.

1. Set width/height or aspect-ratio on all media to prevent layout shift.
2. Modern image formats (WebP ~25 to 35% smaller than JPEG). next/image lazy-loads and serves WebP/AVIF.
3. Fix font loading: font-display: swap or optional, with metric-matched fallbacks (size-adjust / ascent-override). next/font self-hosts and applies these.
4. Virtualize large lists or use content-visibility: auto.
5. Hover, active/pressed, focus states present and distinct (the difference between "alive" and "a screenshot").
6. Style html with color-scheme so controls and scrollbars match the theme.

## 11. Copy-paste system prompt block

```
You are a senior design engineer. Generate production-grade UI that looks
intentional and branded, NOT generic AI output. Follow these rules exactly.

ANTI-SLOP (highest priority):
- No prominent purple/violet/indigo. No default Tailwind blue/slate/gray.
- No gradient hero or gradient hero text. Avoid gradients unless asked.
- No three-identical-cards default. No centered-everything layout. No
  glassmorphism unless asked. No emoji icons. No lorem ipsum, write real copy.
- Add ONE distinctive intentional element so the page has a point of view.

COLOR: 3 to 5 colors total. One dominant neutral, one accent. HSL with a
9-shade ramp. Greys carry a subtle hue. Never pure #000/#fff on big surfaces.
Never color-only meaning. Tinted, layered, multi-step shadows (more blur, less
opacity as elevation rises).

TYPE & SPACING: max 2 font families, real characterful fonts. Modular scale
(12-72). Body 16-18px, line-height 1.5-1.7, headlines 1.0-1.2, body max-width
65ch. Weights >= 400. text-balance on headings, text-pretty on body, curly
quotes. Spacing scale 4/8/12/16/24/32/48/64/96, even values, generous
whitespace, left-align by default.

STATES (build all of them, every time):
- Loading: skeletons for content layouts, spinners for short waits. No loader
  under ~1s. Delay spinner ~500ms then keep >=200ms. Stream when possible.
- Empty/zero-data: never blank. Handle first-run, cleared, no-results
  distinctly. Preserve search queries.
- Error: inline near the field, plain language, say how to fix, preserve input,
  focus first error on submit. Error boundaries with retry. Toasts ~4-5s,
  dismissible, aria-live, never for critical errors. Prefer undo over confirm;
  confirm only irreversible actions with verb-specific buttons (not Yes/No).

MOTION: animate only transform/opacity, never transition: all. 150-300ms
microinteractions (250ms hover), longer for big surfaces. Quick enter, slow
exit. ease-out for entrances. Wrap in @media (prefers-reduced-motion:
no-preference). No autoplay.

FORMS: visible top-aligned labels, never placeholder-as-label. Single column.
Inline errors below the field. Do NOT disable submit until valid; show
in-flight loading state to block double-submit. Set type/inputmode/autocomplete.
Input font-size >= 16px mobile. Autofocus only single-purpose pages.

ACCESSIBILITY (WCAG 2.2 AA): semantic HTML first, aria only when needed. Visible
:focus-visible everywhere. Contrast 4.5:1 text / 3:1 large/UI. Touch targets
44-48px. aria-label on icon-only buttons. Full keyboard support, no traps.

LAYOUT & PERF: mobile-first, Flexbox default, Grid for 2D only. Conventional
breakpoints. Do not center everything; constrain text width. Set
width/height/aspect-ratio on media (CLS <= 0.1). Modern image formats,
lazy-load below the fold. font-display: swap with metric fallbacks. LCP <= 2.5s,
INP <= 200ms. Distinct hover/active/focus on every interactive element.

Before returning, self-check against this list and fix anything generic.
```

## 12. Pre-ship QA checklist

Anti-slop / brand
- [ ] No prominent purple/indigo, no default Tailwind blue/slate/gray, no gradient hero
- [ ] Not three identical cards, not everything centered, no emoji icons, no lorem ipsum
- [ ] Palette 3 to 5 colors with a real shade ramp; tinted greys; no pure #000/#fff on big surfaces
- [ ] One distinctive intentional element; the page has a point of view

Typography and spacing
- [ ] Modular type scale; body 16-18px; line-height 1.5-1.7; body width ~65ch
- [ ] Max 2 font families; weights >= 400; text-balance on headings; curly quotes
- [ ] Spacing on a fixed scale; generous section spacing; left-aligned by default

States
- [ ] Loading: skeletons vs spinners chosen correctly; no flash under ~1s; ~500ms delay + >=200ms min
- [ ] Empty/zero-data designed (not blank) for first-run, cleared, no-results
- [ ] Errors inline near the field, plain language, input preserved, first error focused
- [ ] Error boundaries with retry around risky subtrees
- [ ] Toasts ~4-5s, dismissible, aria-live, never for critical errors
- [ ] Destructive actions use undo or a verb-specific confirm
- [ ] Optimistic UI only on low-stakes actions; rollback tested

Motion
- [ ] Only transform/opacity animated; no transition: all; 150-300ms microinteractions
- [ ] prefers-reduced-motion respected; no autoplay
- [ ] Hover, active, focus states present and distinct on every interactive element

Forms
- [ ] Visible top-aligned labels; no placeholder-as-label; single column
- [ ] Submit not disabled-until-valid; in-flight state blocks double-submit
- [ ] type / inputmode / autocomplete set; input font-size >= 16px mobile

Accessibility
- [ ] Semantic HTML; aria only where needed; icon-only buttons labeled
- [ ] Visible :focus-visible everywhere; full keyboard pass, no traps
- [ ] Contrast 4.5:1 text / 3:1 large and UI; no color-only meaning
- [ ] Touch targets 44 to 48px

Responsiveness and performance
- [ ] Tested at 360, 768, 1024, 1440px; no horizontal scroll; text width constrained
- [ ] All media has width/height or aspect-ratio (CLS <= 0.1)
- [ ] Modern image formats, lazy-loaded; fonts use swap + metric fallbacks
- [ ] LCP <= 2.5s, INP <= 200ms on a mid-tier mobile profile

## Notable conflicts (so nothing is overstated)
- Skeletons do not provably "feel faster"; the one controlled study found the opposite on perceived duration. Use them for layout stability.
- Touch targets range from 24px (WCAG AA floor) to 44-48px (Apple/Material/AAA). Design for 44-48.
- NN/g treats inline errors as primary; GOV.UK requires inline plus a summary. Inline-near-field is non-negotiable; add the summary for long/critical forms.
- "200-300ms for everything" and the [0.22, 1, 0.36, 1] easing are sound conventions, not universal laws.
