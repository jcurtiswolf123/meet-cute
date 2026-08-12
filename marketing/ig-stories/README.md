# Mutuals Instagram stories

Four 1080x1920 story creatives pointing at the application form.

## Files

| Creative | Angle | Surface |
|---|---|---|
| `story-1-ink-friends` | "Meet your friend's friends." The main line. Post this one first. | Ink |
| `story-2-cream-howitworks` | The four steps, for people who need the mechanic before they apply | Cream |
| `story-3-paper-oneintro` | One introduction, two answers, vouches | Paper |
| `story-4-dinners` | Dinners as the soft entry point | Ink |

`stories/*.html` are the sources, `exports/*.png` are the posts. All copy is pulled from
the live site and `DESIGN.md`: Instrument Serif and Instrument Sans, cream `#f4f1ea`,
ink `#171714`, oxblood `#762d38`, no gradients, no exclusivity claims.

## Swipe-up is gone. Use the link sticker.

Instagram retired swipe-up in October 2021. Every account can now add a **link sticker**,
which is what the "tap the link to apply" line at the bottom of each creative points at.
The bottom 300px of every creative is left empty for that sticker.

Post flow:
1. Add the PNG to your story.
2. Sticker tray, **Link**, paste the URL below.
3. Drag it into the empty band at the bottom, over the "tap the link" line.
4. Set the sticker text to **Apply to join**.

## Links (per creative, tagged)

```
https://hellomutuals.com/apply?utm_source=instagram&utm_medium=story&utm_campaign=ig_story_aug26&utm_content=ink_friends
https://hellomutuals.com/apply?utm_source=instagram&utm_medium=story&utm_campaign=ig_story_aug26&utm_content=how_it_works
https://hellomutuals.com/apply?utm_source=instagram&utm_medium=story&utm_campaign=ig_story_aug26&utm_content=one_intro
https://hellomutuals.com/dinners?utm_source=instagram&utm_medium=story&utm_campaign=ig_story_aug26&utm_content=dinners
```

`/apply` returned 200 on 2026-08-10. `/apply` starts with an email and a magic link, so
the first thing a tapper sees is one field, not a wall.

## Re-rendering

```bash
B="$HOME/.claude/skills/gstack/browse/dist/browse"
$B viewport 1080x1920
$B goto "file://$PWD/story-1-ink-friends.html"
$B wait --networkidle
$B screenshot --viewport exports/story-1-ink-friends.png
```

Edit the HTML, re-run, done. Fonts load from Google Fonts, so the render needs network.
