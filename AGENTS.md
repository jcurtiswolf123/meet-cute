# Project Standards (read me first)

This file tells any AI coding agent (Claude Code, Cursor, Codex, Copilot, etc.)
how to build in this repo. Follow it. Joshua's global rules in `~/.claude/CLAUDE.md`
still apply on top of this.

## Orient before you touch anything
- Find the entry point and the 3 main folders before editing. Read the README first.
- If a task feels big, map it as inputs -> transform -> outputs before writing code.
- Being lost in a repo is not failing to understand code, it is not yet having the map. Get the map.

## Structure
- One concern per file or folder. Keep files small.
- Standard layout: `src/` for code, `tests/` for tests, `README.md` for how to run,
  `.env.example` for the config keys, `.gitignore` for what stays out of git.
- Group by feature, not by file type, once the project grows past a handful of files.
- No dead code. Delete it, do not comment it out. Git remembers everything.

## Readability beats cleverness
- Names say what the thing is: `days_since_signup`, not `d`. Functions are verbs, data is nouns.
- Small functions that do one thing. If you cannot name it simply, it is doing too much.
- Match the surrounding style (indentation, quotes, existing patterns). Consistency wins over personal taste.
- Comment WHY, not WHAT. Keep comment density like the surrounding code.

## Small steps, run often
- Write a little, run it, confirm it works, repeat. Never write 100 lines then run for the first time.
- The computer is literal, not smart. When it does something wrong, the instructions are wrong. Fix the instructions.

## Errors are handled, never silently swallowed
- Do not wrap everything in a bare catch that hides the failure. Fail loudly, or handle it explicitly
  with a message that says what went wrong and what to do about it.
- Validate inputs at the edges: user input, API responses, file reads. Trust nothing from outside.

## Secrets and config never live in code
- No API keys, passwords, tokens, or connection strings in source. Ever.
- Read them from environment variables or a `.env` file.
- `.env` is gitignored. `.env.example` (the key names, no real values) IS committed, so the next
  person knows exactly what the project needs to run.

## Dependencies
- Reuse well-maintained libraries. Do not reinvent auth, dates, payments, or crypto.
- Pin versions with a lockfile (`package-lock.json`, `poetry.lock`, versioned `requirements.txt`).
  Commit the lockfile.
- Add a dependency only when it earns its place. Every one is a thing that can break or go stale.

## Git discipline
- Work on a feature branch, not `main`, for anything nontrivial.
- Commit small and often, one logical change per commit, with a message that says what changed and why.
- Never commit secrets, `.env`, build output, `node_modules`, or large binaries. That is what `.gitignore` is for.
- Pushing a feature branch is routine. Merging to `main` is a deliberate act, not an accident.

## Definition of done (all must be true)
- It runs. You executed the actual path and saw the intended result. "It should work" is not done.
- Tests, typecheck, lint, and build pass, if the project has them. If it does not have them yet and the
  change is nontrivial, add at least one test.
- No secrets committed, no dead code left behind, names are clear.
- The README says how to run it. If setup changed, the README changed with it.
- Evidence, not assertion. Show the output, the reloaded value, the API response, or the screenshot.

## Formatting (hard rules, from Joshua's global config)
- No em-dashes or en-dashes anywhere: code, comments, commit messages, docs, generated files.
  Use periods, commas, parentheses, colons, or a plain hyphen for ranges.
- No emojis anywhere.
- No AI-slop filler. Say the thing plainly.
