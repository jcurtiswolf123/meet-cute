// Regression test for the watchdog autofix patch format.
//
// Three transports were tried against a live model before this one stuck, and
// the failures are the reason these cases exist:
//
//   1. JSON, {"files":[{"path","content"}]}, whole files inside JSON strings.
//      Never succeeded once. Real code is full of backslashes, quotes and
//      newlines; the first live drill died on "Bad escaped character in JSON at
//      position 875". Autofix had been enabled in CI every 15 minutes for weeks
//      and could not have worked.
//   2. Whole files in delimited blocks. Parsed perfectly, and the model fixed
//      one assignment while stripping every blank line in the file and mangling
//      two comments. Correct, and unreviewable.
//   3. Search/replace edits, below. The model can only express the lines it
//      wants to change, so minimality is structural rather than a request the
//      prompt has to make and the model can ignore.
import assert from "node:assert/strict";
import { parseEdits, applyEdits } from "./watchdog";

const ALLOWED = ["src/lib/age.ts", "src/lib/email.ts"];
const edit = (path: string, search: string, replace: string) =>
  `<<<EDIT ${path}\n<<<SEARCH\n${search}\n<<<REPLACE\n${replace}\n>>>END`;

// --- parsing ---------------------------------------------------------------

{
  const out = parseEdits(edit("src/lib/age.ts", "const n = 1;", "const n = 2;"), ALLOWED);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { path: "src/lib/age.ts", search: "const n = 1;", replace: "const n = 2;" });
}

// The content that broke the JSON transport must survive byte for byte.
{
  const nasty = [
    'const re = /^[a-z]+\\.[0-9]{2}$/g;',
    'const s = "she said \\"hello\\" and left";',
    "const t = `line ${a}\\n\\ttabbed`;",
    "const p = 'C:\\\\Users\\\\x';",
  ].join("\n");
  const out = parseEdits(edit("src/lib/email.ts", nasty, "const fixed = true;"), ALLOWED);
  assert.equal(out.length, 1);
  assert.equal(out[0].search, nasty, "search text survives verbatim");
}

// A model may not edit a file it was never shown.
assert.deepEqual(parseEdits(edit("src/lib/secrets.ts", "a", "b"), ALLOWED), []);

// An empty search would match anywhere, so it is refused at parse time.
assert.deepEqual(parseEdits(edit("src/lib/age.ts", "   ", "b"), ALLOWED), []);

// Prose around the edits is ignored rather than corrupting them.
{
  const reply = `Here is the fix:\n\n${edit("src/lib/age.ts", "a", "b")}\n\nHope that helps.`;
  assert.equal(parseEdits(reply, ALLOWED).length, 1);
}

// Several edits in one reply, including two files.
{
  const reply = `${edit("src/lib/age.ts", "a", "b")}\n${edit("src/lib/email.ts", "c", "d")}`;
  assert.equal(parseEdits(reply, ALLOWED).length, 2);
}

// Nothing usable is an empty list, not a throw: the caller logs and moves on.
assert.deepEqual(parseEdits("I could not work out the fix, sorry.", ALLOWED), []);
assert.deepEqual(parseEdits("", ALLOWED), []);

// --- applying --------------------------------------------------------------

const FILE = 'const a = 1;\nconst n: number = "wrong";\nconst b = 2;\n';

// The happy path changes exactly what was asked and nothing else.
{
  const files = new Map([["src/lib/age.ts", FILE]]);
  const { applied, problems } = applyEdits(files, [
    { path: "src/lib/age.ts", search: 'const n: number = "wrong";', replace: "const n: number = 42;" },
  ]);
  assert.deepEqual(problems, []);
  assert.equal(applied.get("src/lib/age.ts"), 'const a = 1;\nconst n: number = 42;\nconst b = 2;\n');
}

// Search text that is not there is refused, and the file is left alone.
{
  const files = new Map([["src/lib/age.ts", FILE]]);
  const { applied, problems } = applyEdits(files, [
    { path: "src/lib/age.ts", search: "const missing = 0;", replace: "x" },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not found/);
  assert.equal(applied.get("src/lib/age.ts"), FILE, "the file is untouched");
}

// Ambiguous search text is refused rather than applied to a guess. Editing the
// wrong occurrence can still compile, and a quietly wrong file is the one
// outcome worth avoiding in code nobody asked to be written.
{
  const dup = "const x = 1;\nconst y = 2;\nconst x = 1;\n";
  const { applied, problems } = applyEdits(new Map([["src/lib/age.ts", dup]]), [
    { path: "src/lib/age.ts", search: "const x = 1;", replace: "const x = 9;" },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /appears 2 times/);
  assert.equal(applied.get("src/lib/age.ts"), dup, "the file is untouched");
}

// One bad edit does not discard a good one alongside it.
{
  const files = new Map([
    ["src/lib/age.ts", FILE],
    ["src/lib/email.ts", "const keep = true;\n"],
  ]);
  const { applied, problems } = applyEdits(files, [
    { path: "src/lib/age.ts", search: 'const n: number = "wrong";', replace: "const n: number = 42;" },
    { path: "src/lib/email.ts", search: "not present", replace: "x" },
  ]);
  assert.equal(problems.length, 1);
  assert.ok(applied.get("src/lib/age.ts")!.includes("= 42;"), "the good edit applied");
  assert.equal(applied.get("src/lib/email.ts"), "const keep = true;\n", "the bad one did not");
}

// A file that was never offered cannot be created.
{
  const { applied, problems } = applyEdits(new Map(), [
    { path: "src/lib/age.ts", search: "a", replace: "b" },
  ]);
  assert.equal(applied.size, 0);
  assert.match(problems[0], /not offered/);
}

console.log(
  "autofix patch parsing passed: verbatim code, unoffered paths refused, ambiguous and missing search text refused",
);
