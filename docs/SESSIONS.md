# Running several Claude sessions on this repo

One command, then forget about it:

```bash
npm run session:new studio-polish
cd ../meet-cute-sessions/studio-polish
npm run dev
```

You get your own checkout, branch, database and port. Nothing you do can reach
another session's work, and `git add -A` is safe again.

```bash
npm run session:list               # every working copy, its branch, port, and whether it is dirty
npm run session:end studio-polish  # removes the copy and its database; refuses if you have uncommitted work
```

The branch survives `session:end`. Ending a session cannot lose work.

## Why this exists

On 2026-08-03 three sessions worked through the single `~/Projects/meet-cute`
checkout. Everything that went wrong that day traces to that one fact:

| What happened | Cause |
|---|---|
| An in-flight nav edit was swept into an unrelated commit and shipped a sidebar link to a page that did not exist | Shared index. One session ran `git add` on a file another was editing |
| A typecheck failed against a half-written file, which then vanished before it could be read | Shared files |
| Types broke mid-check for no visible reason | `prisma generate` writes into `node_modules`, which was shared |
| Two dev servers became one, serving whichever database won | Next 16 keeps one dev server per directory and silently reuses it, environment and all |
| A PR came back "no commits between master and branch" | The branch had been merged by another session |

None of these produce a clear error. They produce confusion, and in one case
they reached production.

## What a session gets

- **Its own worktree**, at `../meet-cute-sessions/<name>`, on branch
  `session/<name>` cut from `origin/master`. Worktrees deliberately live outside
  the repository: one was created under `.claude/` and eslint walked into it and
  reported 49,000 problems in a second copy of the codebase.
- **Its own `node_modules`**, cloned copy-on-write (`cp -c`, instant on APFS,
  about a second for 900MB). It cannot be shared because `prisma generate`
  writes into it.
- **Its own database**, inside the one shared Postgres container on 5433. A
  container per session would fight over the port; a database each is free.
- **Its own port**, derived from the worktree path so it is stable across
  restarts and two sessions practically never collide. The main checkout keeps
  3009.

## Things worth knowing

**Turbopack bakes the absolute path into its cache.** A `.next` built at a
different path does not error: it starts, prints `Ready`, and then 404s every
route. `npm run dev` stamps `.next/.root` and clears the directory when it does
not match, so a copied, renamed or restored working copy recovers by itself. If
you ever see a healthy-looking server 404 everything, `rm -rf .next` is the
manual version.

**The main checkout is still special.** It stays on `master` at
`~/Projects/meet-cute` on port 3009 with the `mutuals_sandbox` database. If you
are the only session, use it and ignore all of this.

**`npm run dev` is never production.** It runs against the local throwaway
database with every outbound provider key blanked, and refuses to start against
anything that is not localhost. Pointing a dev server at the live roster is
`npm run dev:live` on 3019, by name, on purpose.

**Merging.** Sessions branch from `origin/master` and are merged the normal way.
Rebase before opening a PR; several sessions land commits in an hour and master
moves under you.
