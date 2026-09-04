# TypeScript Typing

### Strictness stance
Be strict by default: avoid `as` and `any` for data that crosses an
untyped boundary, and prefer explicit types, inference from validated
data, and runtime validation over casting there. This is a strong default
with a small number of legitimate, narrow exceptions (test fixtures, DOM
APIs, library interop — detailed below), not a literal zero-exceptions
rule — but the exceptions are the unusual case, and the default below is
what to reach for first.

- Treat `as` on untyped/external data as writing a "lie" into the code: it
  asserts a type without proving it. The classic violation:
  ```ts
  return JSON.parse(result) as MySpecialType; // NEVER DO THIS
  ```
- When a value genuinely comes from an untyped boundary (API response,
  external payload, EHR scraping result), **validate it before treating it as
  typed** — don't cast past the boundary. Use a runtime validator (e.g. zod)
  to parse and confirm shape, then use the inferred/validated type from that
  point forward.
- Avoid `any` outside of true boundary cases that cannot yet be validated. If
  you reach for `any`, prefer `unknown` plus a narrowing check, or a validated
  parse, instead.
- Legitimate, narrow casting cases where the "validate, don't cast" default
  above doesn't apply: DOM APIs where TypeScript's lib types are less
  specific than what you know to be true at a given point (e.g.
  `event.target as HTMLInputElement` inside a handler you know is only
  ever attached to an `<input>`), third-party library interop where the
  library's own types are wrong or missing and there's no validation step
  that makes sense to insert (you're not parsing untyped data, you're
  correcting a type definition you don't control), and test fixtures (see
  below). These are still narrow exceptions, not a general license —
  prefer the validated/narrowed alternative whenever one is practical, and
  keep the cast as close to the actual boundary as possible rather than
  letting it propagate.
- In test files only, casting (`as`, including `as any`) is allowed when
  necessary to construct test fixtures — but only when necessary, not as a
  default convenience.

### Types and return values
- Prefer explicit types and named return objects over positional tuples —
  a function *you write* that returns multiple values should return a
  named object, not `[a, b, c]`. This doesn't conflict with destructuring
  `Promise.all([...])` by position (see `async-patterns.md`) — that array's
  order is fixed by the call site you just wrote one line above it, not
  by a tuple type baked into a function signature elsewhere, so there's
  no separate name to forget or misorder.
- Use a closed type for known, fixed sets of states instead of magic
  strings — **default to a string union** (`type Status = 'pending' |
  'active' | 'closed'`) rather than a TS `enum`. String unions produce no
  runtime artifact (enums compile to an actual object unless you use
  `const enum`, which has its own caveats), narrow more naturally with
  inference, and serialize directly to/from JSON without a lookup step.
  Reach for an actual `enum` only when you specifically need runtime enum
  behavior (iterating all members, reverse mapping from value to key) —
  state that need explicitly when you do, since it's the exception.
- Prefer inferred types where the type has exactly one function/caller using
  it — don't create a standalone named type for something used in only one
  place.

### Explicit primitive type annotations
- Annotate the type explicitly on any declaration whose value is a
  primitive (`number`, `string`, `boolean`, `bigint`, `symbol`), even when
  TypeScript could infer it. The annotation states intent at the
  declaration site and stays correct across refactors that change the
  initializer.
  ```ts
  const timeoutId: number = window.setTimeout(() => setDebouncedValue(value), delayMs);
  ```
- This applies to `let`/`const` locals **and** to module-scope constants —
  `const SHORT_ROW_SEAT_COUNT: number = 5;`, not
  `const SHORT_ROW_SEAT_COUNT = 5;`.
- Primitives only. Do **not** hand-write annotations for non-primitive
  initializers whose type inference is already obvious and correct — object
  and array literals, `new ClassName()`, calls to a function with a declared
  return type, `as const` literals, JSX elements. Annotating those adds
  noise and can silently drift from the real type; let inference own them.
- This is a deliberate exception to the "prefer inferred types" guidance
  below (which is about not creating standalone *named object types* used in
  a single place), not a contradiction of it — the two govern different
  things: primitive declaration sites here, named type declarations there.

### Interfaces vs types
- See `naming-conventions.md` for the full rule. Short version: the `I`
  prefix is reserved for DI-injected service contracts — that's the
  operative test, not just "might have an alternate implementation."
  Outside of DI service contracts, choose `interface` vs. plain `type`
  based on whether the shape might reasonably get a different
  implementation later (interface) or is fixed (type), without adding the
  `I` prefix either way.

### Zod schema conventions
- Schemas live in a dedicated `schemas/` folder, separate from `types/` —
  see "Folder structure — `types/` vs. `schemas/`" in Naming Conventions.
- Schemas validating input to **your own API/action** use `.strict()` to
  reject unknown keys — this catches typos and unexpected fields from
  callers you control.
- Schemas validating a payload **owned by an external system** (a webhook,
  a third-party API response, an EHR payload) should generally *not* use
  `.strict()`. Use `.passthrough()` or a plain (non-strict) parse instead.
  An external system can add new fields at any time; `.strict()` on that
  boundary means a harmless upstream change breaks your validation in
  production until you redeploy. Validate and extract the fields you
  actually need; don't reject the payload for carrying extra ones.
- Every field that isn't self-explanatory gets a `.describe('...')` call —
  write the description like inline documentation: note fuzzy-vs-exact
  matching, caching behavior, or any other non-obvious validation rule.
- Optional fields are `.optional()` with a `.describe()` explaining the
  default or triggered behavior, not just restating the type.
- Place a block comment immediately above each exported `*InputSchema` /
  action explaining: what the action does, what to validate the response
  against, and any special-case behavior (pagination ranges, fallback search
  order, etc.). New actions follow the same banner-comment-then-schema shape.
- Re-export shared schemas instead of redefining them, e.g.:
  ```ts
  export { PatientSchema as GetPatientResponseSchema } from '../../entities/patient';
  ```

### Maps over dictionaries
- Prefer `Map` over plain object dictionaries when the structure is used as a
  key-value store (iteration order guarantees, non-string keys, frequent
  add/remove). Plain objects are fine for fixed-shape records.
- **Exception — anything that crosses a serialization boundary.** `Map`
  does not round-trip through `JSON.stringify`/`JSON.parse`
  (`JSON.stringify(new Map([['a', 1]]))` produces `{}`, silently losing
  the data) — this is a runtime bug waiting to happen, not a style
  concern. Use `Record<string, T>` instead of `Map` for anything that
  will be sent as an API response/request body, persisted to
  `localStorage` or a database as JSON, or passed across an IPC / Web
  Worker `postMessage` boundary, regardless of whether `Map` would
  otherwise be the better fit for that data's access patterns. If you
  need `Map`'s mutation/iteration properties *and* serialization, convert
  explicitly at the boundary (`Object.fromEntries(map)` /
  `new Map(Object.entries(obj))`) rather than serializing the `Map`
  directly.

### Modern TypeScript features — use them where they fit
- **Discriminated unions** for state machines and error/result modeling
  (e.g. `{ status: 'success'; data: T } | { status: 'error'; error: E }`)
  over a single object with optional fields that have to be checked in
  combination. This pairs naturally with the existing "enums/string unions
  for known closed sets of states" rule above.
- **`satisfies`** over `as` when you want to validate a literal against a
  type *without* widening or losing the literal's inferred type — this is
  not the same operation as the `as`-is-a-lie casting described earlier in
  this file; `satisfies` checks rather than asserts, so prefer it
  whenever the goal is "make sure this matches the shape" rather than
  "tell the compiler to trust me."
- **Branded/nominal types** for primitives that are easy to mix up despite
  sharing a JS type (e.g. `PatientId` vs. `EncounterId`, both `string` at
  runtime). A simple brand (`type PatientId = string & { __brand: 'PatientId' }`)
  catches accidentally passing one ID where another is expected, which
  plain `string` parameters cannot.
- **Template literal types** for string values with known structure (e.g.
  route paths, event names like `on${Capitalize<string>}`) instead of
  widening to plain `string`.
- Reach for `Omit`/`Pick`/`Partial`/`Required` deliberately, not
  reflexively — each one should be removing or relaxing a *specific*
  field for a *specific* reason (e.g. "this DTO is the entity minus its
  server-generated fields"), not used as a generic shortcut to avoid
  writing a new type.
- Where a function's return type genuinely depends on an input type in a
  way that's simple to enumerate, prefer function **overloads** or
  distinct, separately-named functions over a single function with a
  **conditional type** in its signature. Both can express the same
  relationship, but overloads show each concrete input/output pairing
  explicitly, which both editor autocomplete and a reader scanning the
  signature resolve more directly than tracing a conditional type's
  branches. Reach for a conditional type when the relationship is
  genuinely generic/open-ended (works over any `T` satisfying some
  constraint), not as the default tool for "this function returns
  different shapes for a few known input cases."

### Recommended `tsconfig` strict flags
On top of standard `strict: true`, turn on:
- `exactOptionalPropertyTypes` — prevents `{ foo?: string }` from silently
  accepting `foo: undefined` as distinct from "key not present," which
  otherwise undermines `.optional()` Zod fields and similar contracts.
- `noUncheckedIndexedAccess` — makes indexed access (`arr[i]`,
  `record[key]`) return `T | undefined` instead of `T`, which is almost
  always the honest type for anything indexed by a runtime value rather
  than a known-fixed key.
These two flags are the ones most likely to surface real bugs that
`strict: true` alone misses, particularly around the optional-field and
untyped-boundary patterns already emphasized elsewhere in this file.
