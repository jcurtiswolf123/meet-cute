# Mutuals Design System

## Product context

- What this is: A private matchmaking service with public applications, member introductions, and an operator studio.
- Who it is for: Adults in New York and San Francisco who want a considered introduction instead of another public dating profile.
- Project type: Public membership site, member web app, and internal operating tool.

## Aesthetic direction

- Direction: Quiet members club.
- Decoration: Minimal. Typography, scale, rules, and negative space carry the design.
- Mood: Discreet, selective, warm, and confident. It should feel run by people with judgment.
- Reference: [Raya](https://www.rayatheapp.com/) for restraint and membership posture. Do not copy its logo, rings, rainbow palette, or exact layout.
- Avoid: gradients, floating cards, startup feature grids, public vanity metrics, glass effects, and decorative copy.

## Typography

- Display: Instrument Serif, weight 400. Use for public headlines and short editorial statements.
- Body and UI: Instrument Sans, weights 400 through 700. Use for navigation, copy, labels, buttons, and app controls.
- Data: Instrument Sans with tabular numerals.
- Code and operator-only technical text: JetBrains Mono.
- Loading: `next/font/google`, bundled by Next.js.
- Scale: 11, 14, 16, 18, 24, 36, 48, 60, 80, 104, and 128 pixels.
- Body copy: 16 to 18 pixels, 1.6 line height, and no more than 65 characters per line.

## Color

- Approach: Restrained.
- Cream: `#f4f1ea`, the main canvas.
- Paper: `#e9e4da`, used for one section band or a quiet secondary surface.
- Panel: `#f8f6f1`, used for forms and cards.
- Ink: `#171714`, used for text, primary buttons, and the dark statement section.
- Muted: `#67635d`, used for secondary copy.
- Line: `#d2cdc3`, used for dividers and outlines.
- Oxblood: `#762d38`, the only brand accent. Use for focus, hover, and rare emphasis.
- Semantic colors remain distinct from the brand accent and must pass WCAG AA contrast.

## Spacing

- Base unit: 4 pixels.
- Core scale: 4, 8, 16, 24, 32, 48, 64, 80, 96, and 120 pixels.
- Density: Spacious on the public site, comfortable in forms, and compact in the operator studio.

## Layout

- Approach: Editorial on the public site, grid-disciplined in the member app and studio.
- Public grid: 12 columns on desktop with asymmetric 5/7 and 4/8 compositions.
- Maximum width: 1280 pixels.
- Page padding: 24 pixels on mobile, 32 pixels on tablet, and 40 pixels on desktop.
- Border radius: 6 pixels for fields, 8 pixels for cards, 12 pixels for large panels, and full only for buttons and status pills.
- Shadows: Nearly flat. Use a one-pixel border before adding elevation.

## Motion

- Approach: Intentional and quiet.
- Entrance easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Durations: 150 to 250 milliseconds for controls and 600 to 800 milliseconds for page reveals.
- Public reveals run once. All nonessential motion stops when reduced motion is requested.

## Public copy

- Write like a discreet person, not a luxury brand.
- Use short sentences and concrete mechanics.
- Do not claim exclusivity through numbers, celebrity associations, or vague status language.
- Prefer "request membership" to generic conversion language.
- Do not expose operator links in public navigation.

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-26 | Adopt the quiet members club direction | Joshua asked for less generated styling and a more Raya-like level of restraint. |
| 2026-07-26 | Remove public roster counts | A small live count weakens the membership posture and is not useful to an applicant. |
| 2026-07-26 | Keep the homepage free of hero photography | The site had already moved away from a hero photo, and typographic restraint fits the new direction better. |
