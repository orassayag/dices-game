# Code Structure & Style

### Core principle
Optimize for readability and maintainability. Prefer explicit, understandable
code over compact or clever code. Write for the common developer who finds
this file two years from now with no other context.

- Use clear, consistent naming (see `naming-conventions.md`).
- Implement features in the simplest possible way that satisfies the
  requirement — start naive, optimize only after tests pass.
- Use clear, easy-to-understand language; write in short sentences, in both
  code and any prose you write about it.

### Duplication and abstraction timing
- **Extract after the second occurrence, not before.** The first time you
  write something, just write it inline. The second time you're about to
  copy/paste similar logic, extract it to a shared function instead of
  letting a third copy accumulate. This is the practical trigger behind
  "don't repeat yourself" — a concrete rule of two, not an abstract
  principle to apply by feel.
- **Don't extract a helper/abstraction speculatively** for a hypothetical
  future second use that doesn't exist yet — this is the other half of
  the YAGNI principle above, applied to internal structure rather than
  features. A helper function, utility module, or shared component should
  exist because something *actually* uses it more than once, not because
  it *might* someday. Premature abstraction built around a guessed-at
  future shape is often harder to adapt later than just duplicating the
  one extra time and refactoring once the real second use shows up.

### Functions
- **Prefer named functions over arrow/lambda functions and `const` arrow
  declarations**, as the default. A named function declaration shows up
  with its own name in stack traces, is hoisted (so call-order in the file
  doesn't matter), and reads as "this is a function" at a glance rather
  than "this is a `const` that happens to hold a function."
- **Exception — follow the ecosystem's own convention where one exists.**
  Where the surrounding framework/ecosystem has a dominant, idiomatic
  pattern that uses arrow functions, follow that pattern instead of
  fighting it. This includes (non-exhaustively): React function components
  and hooks, Express/Koa/Fastify route and middleware handlers, short
  inline callbacks passed to `map`/`filter`/`reduce`/`then`, and anywhere
  binding `this` requires an arrow function. The goal is to match what a
  developer coming from that ecosystem already expects to see — don't make
  the codebase look unusual to readers familiar with the framework just to
  satisfy this rule.
- Keep functions focused: one clear responsibility, a clear input/output
  contract.
- Prefer small helper functions over deeply nested logic.
- Avoid clever one-liners when they reduce clarity.
- Avoid single-line functions unless they're reused in many places.

### Control flow
- Prefer explicit, readable control flow over compact expressions.
- Flatten conditional logic with early returns/guard clauses rather than
  nesting deeper: return/throw/continue as soon as a condition rules out
  the rest of the function, instead of wrapping the remaining logic in an
  `else` block. Treat 3+ levels of nested conditionals/loops as a signal
  to refactor — extract a function, invert a condition, or add a guard
  clause — the same way file size and constructor param count are
  treated as signals elsewhere in this file, not hard syntax errors but a
  prompt to reconsider the shape.
- Functional chains (`map`, `filter`, `reduce`) are fine for short,
  single-purpose transformations.
- Avoid long or multi-step chains if they obscure intent — prefer an explicit
  loop when it improves clarity, debuggability, or extensibility.
- A single blank line may be used inside a function to separate logical
  steps (e.g. "fetch the data" / "transform the data" / "return the
  result") — this is fine and does not need to be split out.
- Avoid *multiple consecutive* blank lines, and avoid more than a couple of
  blank-line-separated groups in one function. If a function needs several
  such breaks to stay readable, that's a sign it should be split.

### File size
- Keep files small and focused: aim for under ~200 lines per file/module
  as a general guideline.
- Keep each file responsible for a single component or a single piece of
  logic.
- Split exports across files rather than one large file exposing everything.
- If a hand-written file is getting too big, treat that as a prompt to
  investigate *why* — usually it means the file is doing more than one
  job and should be split. This is a heuristic, not a hard ceiling: it
  doesn't apply to generated code (API clients, GraphQL types), large
  discriminated-union/type-definition files where splitting would scatter
  one coherent concept across files, table-driven config/data files (e.g.
  a large `SELECTORS` map or enum-with-descriptions), or comprehensive
  test files covering many edge cases for one method. In those cases,
  line count isn't a meaningful signal on its own — judge by cohesion, not
  by the number.

### Debug logging and dead code
- Don't leave debug-only logging (`console.log`, `print`, or equivalent
  ad hoc statements added while diagnosing something) in committed code.
  This generalizes the existing test-specific rule in
  `testing-conventions.md` ("don't leave debug logging in committed
  tests") to all code, not just tests — remove it once the issue it was
  added for is resolved, before the change is considered done.
- Don't leave commented-out code in committed code. If it's no longer
  needed, delete it — version control already has the history if it's
  ever needed again. If it's being kept deliberately as a reference for
  something not-yet-implemented, that's a `TODO` with tracked context
  (see the `TODO`/`FIXME`/`HACK` rule under Comments below), not a
  silently commented-out block.
- This is part of what "before considering work complete" means in
  practice — re-reading a diff for leftover debug logging and
  commented-out code is one of the concrete things that check covers
  (see `git-workflow-permissions.md`).

### Dependencies & DI
- Prefer dependency injection. Pass dependencies (DB clients, HTTP clients,
  cache clients, clocks, loggers) as constructor arguments or parameters.
- **Scope this to services with real dependencies and lifecycle** —
  application services, adapters, anything with I/O or that needs to be
  swapped/mocked in tests. It is not a mandate for every script, CLI
  command, or pure utility function: a one-off migration script or a
  stateless string-formatting helper doesn't need to be wired through the
  DI container just to satisfy this rule. Apply DI where it actually buys
  testability or flexibility, not as architecture for its own sake.
- Don't import and use concrete implementations directly inside business
  logic — inject an abstraction instead.
- For TypeScript codebases using inversify: services intended for the DI
  container are decorated `@injectable()` and take dependencies via
  constructor `@inject(...)` parameters. They are not instantiated with `new`
  directly in app code (tests, and one specific SDK singleton-entry-point
  class, are the only exceptions). **This is this project's specific DI
  library choice, not a universal prescription** — the underlying
  principle is "prefer DI, decorate injectable services, inject via the
  constructor," which applies the same way with `tsyringe`,
  framework-native DI (NestJS's own `@Injectable()`), or a context-based
  approach (React); swap the decorator/wiring mechanism for whichever the
  project actually uses and keep the principle.
- Constructor parameter property shorthand is the default style:
  `constructor(@inject(Foo) private foo: Foo) {}` rather than assigning
  fields in the body.
- Long constructor injection lists (15+ params) are normal and accepted for
  top-level orchestrator classes — don't flag this as a smell by default.
  Past roughly 25-30 params, treat it as worth a second look: at that
  point it's worth asking whether the orchestrator is actually doing too
  many distinct jobs and could be split, rather than assuming it's fine
  purely because long lists are normal here. This is a "take a closer
  look" threshold, not a hard cap. If a split does turn out to be
  warranted, one option worth considering is grouping related
  sub-services behind a facade so the orchestrator depends on a handful
  of cohesive facades instead of dozens of individual services directly —
  but this is one example approach, not a prescribed solution; the right
  decomposition depends on what the dependencies actually have in common.
- Avoid singletons in favor of DI. The one accepted exception is a single,
  clearly-scoped SDK entry-point class using
  `private static instance` / `static getInstance()`.

### Comments
- Write only comments that add a fact the code cannot express on its own.
  A comment that narrates or restates what the code already shows is
  forbidden — don't write it, and delete it if it's there. When in doubt,
  no comment is the right choice. Prefer clearer names and smaller functions
  over a comment that explains confusing code.
- The bar for keeping any comment: it clarifies something a reader could not
  get from the code itself — a non-obvious *why*, a business rule, a subtle
  constraint or gotcha — or would be very hard to understand without it.
  Explaining *what* a line does never clears this bar.
- Never delete an existing comment that still passes that bar. But a comment
  that only restates the code, or that has gone stale/misleading as the code
  changed, is obsolete — remove or rewrite it rather than leaving it in place.
- Answer a genuine "why is this written this way?" next to the code only when
  the answer isn't self-evident — a real constraint, a non-obvious trade-off,
  a business rule. Don't manufacture a "why" comment for ordinary code.
- Never leave a bare `TODO`/`FIXME`/`HACK` comment with no tracking in
  committed code. Either fix the issue before committing, or open a
  tracked issue/ticket and reference it in the comment (e.g.
  `// TODO(PROJ-1234): handle retry backoff once rate-limit headers are
  available`). An untracked TODO tends to be forgotten the moment it's
  written and accumulates silently — a referenced one stays visible.
- File-level/section banner comments are useful for explaining *business
  rules* (validation order, fallback behavior, what must be re-checked on a
  response) — not implementation mechanics.
- `/** Section **/`-style comments can mark logical sub-groups of related
  methods or fields (e.g. grouping abstract methods by domain area) instead
  of leaving them as an undifferentiated flat list.
- Inline lint-disable comments (e.g. `// eslint-disable-next-line <rule>`)
  must name the specific rule and include a one-line reason — never a blanket
  disable.
- File-level disables (e.g. `/* eslint-disable */` at the top of a file)
  are not allowed. They silently turn off checks for every line added to
  the file afterward, including code nobody intended to exempt. If a rule
  genuinely needs to be off for a whole file, disable that specific rule
  by name at the top (`/* eslint-disable <rule-name> */`) with a one-line
  reason, never an unscoped blanket disable.

### Imports
- Keep imports consistently ordered. Group by origin: external libraries →
  scoped/internal packages → relative imports, with related symbols from the
  same module combined into a single multi-line `{ ... }` import rather than
  repeated separately.
- Use `import type { ... }` when a file exclusively needs types from a
  module; otherwise a normal `import { ... }` is fine.
- No default exports — use named exports everywhere, including for a
  module's "primary" export, as the default. This keeps refactor-safe
  renames and autocomplete accurate, and avoids ambiguity about what a
  default export is actually called at the call site.
  **Exception — follow the ecosystem's own convention where one exists.**
  Where the framework requires or strongly expects a default export, use
  one instead of fighting it: Next.js `pages/`/`app` router files,
  `React.lazy()` targets (which resolve via a default export), and
  Storybook story files are common examples. Don't introduce awkward
  re-export shims just to satisfy the named-exports rule in these cases.
- Never import from a deep path inside another package (e.g.
  `@scope/package/build/...`). Import from the package's public entry point
  only — deep-path imports can cause duplicate copies of the package to be
  bundled.
- **Prefer barrel (`index.ts`) imports for shorter, stable paths within
  your own code.** When a folder groups several modules that are imported
  together elsewhere, give it an `index.ts` that re-exports its public
  surface, and import from the folder rather than reaching into each file:
  `import type { CreateItemInput, Item } from '../../shared'` instead of
  `import type { CreateItemInput, Item } from '../../shared/schemas'`. This
  shortens call sites and lets you move a symbol between files inside the
  folder without touching every importer. Two caveats: (1) if two files in
  the folder export the same name, a barrel re-export collides — import
  directly from the specific file in that case rather than renaming a
  symbol just to fit the barrel; (2) only add a barrel when the folder has
  a real shared surface that's actually imported together — don't create an
  `index.ts` that re-exports a single file, or one nobody imports through
  (that's the speculative-abstraction smell from "Duplication and
  abstraction timing" applied to imports). This applies to your own
  first-party folders; it does not loosen the rule above against reaching
  into another *package's* internals.
- **Toolchain determines the barrel path form.** The extensionless folder
  form (`from '../../shared'`) only resolves under a bundler-style
  resolver — Vite, esbuild/tsup, `tsx`, or TypeScript's
  `moduleResolution: bundler`. Under `moduleResolution: nodenext` with the
  compiled output run on plain Node, a bare directory import is illegal at
  runtime *and* rejected by the type-checker: there the barrel must be
  named explicitly — `from './middleware/index.js'`, keeping the file
  extension the rest of the project uses. The path can't get shorter in
  that case, so the win is **consolidation** (collapsing several
  single-file imports from one folder into a single barrel import), not a
  shorter string. Match whichever form the project's `tsconfig` and runtime
  actually support rather than forcing the extensionless form where it
  won't resolve.
- Default to top-level `import` statements for ordinary dependencies — this
  avoids surprising load-order and circular-import bugs.
- Dynamic `import()` is expected and standard, not an edge case, for:
  route-level code-splitting (as used by Next.js, Remix, Vite, and most
  modern bundlers), loading ESM-only packages from a CJS context, and
  conditionally loading heavy or platform-specific dependencies (large
  SDKs, PDF/chart renderers, browser-only vs. Node-only code). Use it in
  these cases rather than forcing a top-level import that bloats the
  initial bundle or breaks the build.

### Formatting
- Keep formatting consistent across the codebase (rely on the project's
  formatter/linter rather than manual style decisions).
- Avoid overly long lines — break lines to improve readability.
- For primitive-typed parameters, always write the type annotation explicitly
  after the parameter name (don't rely on inference for primitives at a
  function boundary).
