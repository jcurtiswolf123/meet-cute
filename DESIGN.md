# Mutuals Design System

## Product context

- What this is: A curated matchmaking service with public applications, member introductions, and an operator studio.
- Who it is for: Adults in New York and San Francisco who want a considered introduction instead of another public dating profile.
- Project type: Public site, member web app, and internal operating tool.

## Aesthetic direction

- Direction: Warm and editorial. The feeling is a well-connected friend making the introduction, not a velvet rope.
- Decoration: Minimal. Typography, scale, rules, and negative space carry the design.
- Mood: Warm, plain-spoken, and confident. It should feel run by people with judgment who are glad you came.
- Restraint is for craft, not status. Keep the typographic discipline; do not borrow members-club or gatekeeping posture from Raya or its imitators.
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

- Write like a friend who is good at this, not a luxury brand and not a startup.
- Use short sentences and concrete mechanics.
- Do not claim exclusivity through numbers, celebrity associations, selection rates, or vague status language.
- The line is "Meet your friend's friends." The positioning line is "curated matchmaking."
- Say "join" and "apply to join," not "request membership." Say "members," not "the list" or "the roster."
- Do not use "private" as brand language. Describe the actual privacy mechanic instead (who sees what, and when).
- Do not expose operator links in public navigation.

## Form controls

- **Never ship a native `<select>`.** Its popup is drawn by the operating
  system, in the system accent (a blue bar on macOS), and cannot be styled. It
  is the one place the whole cream-and-oxblood surface hands the page back to
  the OS.
- **Two to five options: `ChoiceGroup`** (`src/components/fields.tsx`). Radio
  pills. One click instead of two, every option visible while you choose, and
  the browser supplies the arrow keys, the label hit area, and the "radio, 2 of
  3" announcement.
- **Longer lists, or a dense studio toolbar: `Select`**
  (`src/components/select.tsx`). A listbox drawn in the page. Everything native
  selects gave away free is code here and is covered by
  `scripts/test-form-controls.ts`.
- **Checkboxes use `Checkbox`**, never a bare `input type="checkbox"`. Same
  reason: the default box is system chrome.
- **Native date and file inputs stay native.** The mobile date wheel and the
  file chooser are better than anything we would build, and they carry locale
  and permission behaviour for free. Style the chrome around them.
- Selected state is ink fill, cream text. Focus is a two-pixel oxblood outline
  at two-pixel offset. Transitions are 150 to 200ms on `ease-soft`.

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-03 | Replace every native select and checkbox with our own controls | The applicant's first control opened a macOS menu with a blue highlight, on a page that is otherwise cream, ink, and one oxblood accent. Pills for short choices, an in-page listbox for long ones. |
| 2026-07-26 | Adopt the quiet members club direction | Joshua asked for less generated styling and a more Raya-like level of restraint. |
| 2026-08-02 | Warm the voice and drop the members-club posture | Jess asked to cut the word "private," lead with "Meet your friend's friends," and use "curated matchmaking" as the positioning line. Joshua asked for friendlier language overall, less Raya. The typographic restraint stays; the gatekeeping tone does not. |
| 2026-07-26 | Remove public roster counts | A small live count weakens the membership posture and is not useful to an applicant. |
| 2026-07-26 | Keep the homepage free of hero photography | The site had already moved away from a hero photo, and typographic restraint fits the new direction better. |
