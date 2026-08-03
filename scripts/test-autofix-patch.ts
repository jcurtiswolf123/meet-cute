// Regression test for the watchdog autofix patch format.
//
// The first version asked the model for
// {"files":[{"path":..., "content":...}]} with whole source files inside JSON
// strings. It never succeeded once: real code is full of backslashes, quotes,
// newlines and template literals, and the first live drill died on "Bad escaped
// character in JSON at position 875". Autofix had been enabled in CI every 15
// minutes for weeks and could not have worked.
//
// Delimited blocks need no escaping, so these cases pin the parser instead.
import assert from "node:assert/strict";
import { parsePatch } from "./watchdog";

const ALLOWED = ["src/lib/age.ts", "src/lib/email.ts"];

// The happy path.
{
  const reply = `<<<FILE src/lib/age.ts
export const x = 1;
>>>END`;
  const out = parsePatch(reply, ALLOWED);
  assert.equal(out.length, 1);
  assert.equal(out[0].path, "src/lib/age.ts");
  assert.equal(out[0].content, "export const x = 1;\n");
}

// The exact content that broke JSON: backslashes, quotes, template literals,
// regexes and newlines all round-trip verbatim.
{
  const nasty = [
    'const re = /^[a-z]+\\\\.[0-9]{2}$/g;',
    'const s = "she said \\"hello\\" and left";',
    "const t = `line ${a}\\n\\ttabbed`;",
    "const path = 'C:\\\\Users\\\\x';",
  ].join("\n");
  const out = parsePatch(`<<<FILE src/lib/email.ts\n${nasty}\n>>>END`, ALLOWED);
  assert.equal(out.length, 1);
  assert.equal(out[0].content, `${nasty}\n`, "content must survive byte for byte");
}

// A model may not rewrite a file it was never shown.
{
  const reply = `<<<FILE src/lib/secrets.ts
export const stolen = true;
>>>END`;
  assert.deepEqual(parsePatch(reply, ALLOWED), [], "unoffered paths are dropped");
}

// Several files in one reply.
{
  const reply = `<<<FILE src/lib/age.ts\nA\n>>>END\n<<<FILE src/lib/email.ts\nB\n>>>END`;
  const out = parsePatch(reply, ALLOWED);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((f) => f.path).sort(), ["src/lib/age.ts", "src/lib/email.ts"]);
}

// Prose around the blocks is ignored rather than corrupting them.
{
  const reply = `Sure, here is the fix:\n\n<<<FILE src/lib/age.ts\nfixed\n>>>END\n\nLet me know if you need anything else.`;
  const out = parsePatch(reply, ALLOWED);
  assert.equal(out.length, 1);
  assert.equal(out[0].content, "fixed\n");
}

// Models fence code despite being told not to.
{
  const reply = "<<<FILE src/lib/age.ts\n```ts\nconst fenced = 1;\n```\n>>>END";
  assert.equal(parsePatch(reply, ALLOWED)[0].content, "const fenced = 1;\n");
}

// A file whose own text contains the terminator must not end the block early.
{
  const body = 'const doc = "write >>>END to finish";\nconst after = 2;';
  const out = parsePatch(`<<<FILE src/lib/age.ts\n${body}\n>>>END`, ALLOWED);
  assert.equal(out.length, 1);
  assert.ok(out[0].content.includes("const after = 2;"), "the whole body survives");
}

// Nothing usable is empty, not a throw: the caller logs and moves on.
assert.deepEqual(parsePatch("I could not work out the fix, sorry.", ALLOWED), []);
assert.deepEqual(parsePatch("", ALLOWED), []);

// A repeated path takes the last block rather than writing twice.
{
  const reply = `<<<FILE src/lib/age.ts\nfirst\n>>>END\n<<<FILE src/lib/age.ts\nsecond\n>>>END`;
  const out = parsePatch(reply, ALLOWED);
  assert.equal(out.length, 1);
  assert.equal(out[0].content, "second\n");
}

console.log("autofix patch parsing passed: verbatim code, unoffered paths refused, prose and fences tolerated");
