# Testing Conventions

### Scope & placement
- Test public APIs, not internal implementation details. The one carve-out:
  a complex internal helper with its own non-trivial logic (a parser, a
  matching/scoring algorithm, a date calculator) can reasonably get
  focused tests of its own even though it's not exported — test it as if
  it *were* the public API of its own module, rather than only indirectly
  through whatever calls it. This is about complexity, not file
  visibility: a trivial private helper still doesn't need its own tests.
- Co-locate tests in a `__tests__/` folder alongside the subject file, using
  `*.test.ts` naming. **Never use a root-level `tests/` folder** — every test
  file lives in a `__tests__/` folder next to the code it exercises:
  - Unit tests: `src/<area>/__tests__/<subject>.test.ts` next to the subject
    file.
  - Integration/flow tests: a `__tests__/` folder next to the code that owns
    the flow's entry point (e.g. route-level integration tests in
    `src/routes/__tests__/`), not a separate top-level tree.
  - Shared test helpers (app factories, test clients): a `__tests__/helpers/`
    folder under the nearest folder common to the tests that use them (e.g.
    `src/__tests__/helpers/testApp.ts` for an app-wide factory). Helpers
    don't use `.test.ts` naming, so runner globs don't pick them up as suites.
  - Runner setup files wired via config (e.g. Vitest `setupFiles`) are
    config-level, not test files — keep them at the project root next to the
    runner config (e.g. `vitest.setup.ts`), not in a `tests/` tree.
  Publish-safety for libraries comes from the package's `files` allowlist and
  a build config that excludes `**/__tests__/**` — not from segregating tests
  into a root folder.
  Only fall back to matching a different pre-existing local pattern if a
  given package already has one in place; don't introduce the `__tests__/`
  convention inconsistently next to an established different pattern in the
  same package.
- Mocks live in a separate `__mocks__/` folder, named `<subject>.mock.ts`.

### Test structure
- Arrange, Act, Assert — structure every test in that order.
- One test validates one behavior. No conditional exits / conditional pass
  paths inside a test.
- No placeholder tests (e.g. `expect(true).toBe(true)`).
- Keep blank lines between `describe` blocks and between individual tests.
- Group tests in nested `describe` blocks by the method or
  matching-strategy under test, not just by class — e.g.
  `describe('DiagnosisIndexSelector')` containing nested
  `describe('firstIndexMatchByExactICDAndDescriptionWithFallback')`.

### Naming
- Every `it(...)` (test-case) description **must start with the word
  "should"** and read as a full behavior sentence:
  `it('should return -1 when zip does not match', ...)`. This is a firm
  convention, not a preference — `it('returns -1 when zip does not match')`
  and `it('zip mismatch', ...)` do not satisfy it.
- This governs the `it(...)` description specifically. `describe(...)` blocks
  still name the unit under test (a class, method, or matching strategy),
  not a "should" sentence — see Test structure above.

### Async / error assertions
- Use `expect(promise).rejects.toThrow()` for async errors, or
  `expect(() => fn()).toThrow()` for sync errors.
- Do not use optional chaining in assertions where the dependency must exist
  — if the value is required for the test to be meaningful, access it
  directly so a missing value fails loudly instead of silently passing.
- Don't validate error *order* — keep tests minimal and focused on the
  specific behavior being verified.

### Fixtures
- Define shared fixtures/parsers as plain helper functions at the top of the
  test file, reused across `it` blocks rather than duplicated inline in each
  test.
- Use `beforeEach` to reset or rebuild the subject-under-test and base
  fixture data between tests in a `describe` block, rather than constructing
  fresh state inline in every `it`.

### Edge case coverage
Cover edge cases exhaustively and explicitly per behavior — don't rely on one
happy-path test to imply the rest. At minimum, consider:
- Empty input
- Missing optional field
- Case-insensitivity (where relevant)
- Partial match vs. exact match
- Priority between matching strategies (e.g. ID-based match takes precedence
  over name-based match)
- Not-found case
- Ambiguous / duplicate matches

### Mocking philosophy
- Mock only true externals: network, DB, filesystem, system clock,
  randomness, environment variables, third-party SDKs.
- Prefer simple fakes over intricate mocks (in-memory stores, stub senders)
  where a fake is sufficient.
- Do not mock the function/module under test.
- Do not mock core business logic just to make a test pass — keep real
  collaborations between business-logic units so that refactors break tests
  loudly instead of silently passing against a stale mock.
- Don't mock something just to test the mock itself.
- Reset/restore mocks in `afterEach` to avoid state leaking between tests.
- `jest.mock` / `vi.mock` for static, module-level mocks; `spyOn` for
  per-test overrides. (Both are shown because the project has packages on
  each — check the package's own config/existing tests for which runner
  it actually uses rather than assuming; don't mix `jest.mock` and
  `vi.mock` syntax within the same package.)

### Workflow
- Prefer running a single related test while iterating — `vitest related
  <file>` (Vitest) or `-t <name>` (Jest/Vitest both support `-t` for
  matching by test name) — not the full suite every time. Use whichever
  the package's configured runner actually is.
- Tight loop: think → write/change code → run the one test → repeat until
  green, then run the broader suite.
- Start with the simplest test case and extend coverage as the implementation
  stabilizes.
- Keep console logging for debugging only, and remove it once the issue is
  fixed — don't leave debug logging in committed tests.
- In monorepos, use the package-scoped test runner
  (e.g. `pnpm --filter <package> test`) rather than running everything from
  the repo root.

### Coverage target
- Where a project specifies a coverage bar (e.g. 90%), treat code that can't
  reasonably be tested as a signal the code needs to be restructured, not a
  reason to skip the test. This is a project-level policy — check whether
  the specific repo you're in actually enforces a number before assuming it
  applies.
- **Exception:** thin boundary/glue code — direct third-party SDK calls,
  framework lifecycle hooks, or wiring code whose entire job is "call this
  other thing with these arguments" — is a legitimate case where low or no
  coverage isn't a design smell. The signal above is about *your* logic
  being untestable because it's tangled with side effects; it's not a
  mandate to wrap every external call in an abstraction purely to hit a
  coverage number. If you're unsure which case you're in, ask whether
  there's any actual branching/logic to test — if there isn't, there's
  nothing meaningful a unit test would verify beyond "the mock was called."

### Pairing with integration tests
For critical paths, pair a focused unit test with a lightweight integration
test that uses real dependencies (e.g. sqlite, localstack, a real test
server) to validate that the pieces are actually wired together correctly —
unit tests alone don't catch wiring/integration mistakes.

### Tooling by test type
The conventions above (AAA structure, fixtures, mocking philosophy) apply
regardless of tool, but use the right tool for what's actually being
tested rather than improvising:
- **React/UI components:** React Testing Library — query by role/text the
  way a user would find the element, not by implementation detail like
  CSS class or component internals.
- **Mocking HTTP/API calls:** MSW (Mock Service Worker) — intercepts at
  the network level, so the code under test makes a real `fetch`/HTTP
  call against a mocked handler instead of having its HTTP client
  replaced. This is usually a better fit than mocking the HTTP client
  directly, per the "mock only true externals" philosophy above — MSW
  treats the network itself as the external boundary.
- **Integration tests needing a real backing service** (Postgres, Redis,
  etc.): Testcontainers — spins up the real service in a container for
  the test run rather than relying on a long-lived shared test
  environment or an in-memory approximation.
- **Algorithms/parsers with a large or fuzzy input space** (date parsing,
  matching/scoring logic): consider property-based testing (e.g.
  `fast-check`) to assert invariants across generated inputs, in addition
  to the specific edge cases already called out above — this is a
  supplement to, not a replacement for, the exhaustive edge-case list.
- **UI that must not regress visually** (design-system components, marketing
  pages): visual regression testing (e.g. Chromatic, Playwright's screenshot
  comparison) where the project has it configured. Don't introduce a new
  visual-regression setup ad hoc for a single component unless asked.

### Parameterized / table-driven tests
For a function with many similar input/output cases (e.g. a validator
tested against a dozen valid and invalid inputs), prefer a data-driven
table plus `it.each`/`test.each` over copy-pasted near-identical `it`
blocks:
```ts
it.each([
  ['valid email', '[email protected]', true],
  ['missing @', 'userexample.com', false],
  ['empty string', '', false],
])('%s: validates "%s" as %s', (_label, input, expected) => {
  expect(isValidEmail(input)).toBe(expected);
});
```
Prefer this over a deeply nested `describe` tree once the nesting exists
mainly to group structurally-identical cases rather than to express
genuinely different setup/context — nested `describe`s are still right
when each branch needs different fixtures or mocking, not just a
different input/output pair.

### Snapshot tests
Useful for catching unintended changes in large, relatively stable output
(rendered component trees, generated API documentation, serialized
config). Easy to misuse as a substitute for asserting on what actually
matters, though — a snapshot that's updated reflexively on every diff
without being read stops catching anything. Review a snapshot diff
deliberately before accepting it; don't run the "update snapshots" command
as a way to make a failing test pass without checking what changed.

### Contract tests
For a service boundary consumed by another team or service (an internal
API, a queue message shape, a webhook payload your service emits), a
contract test — verifying the response/message shape matches what
consumers actually expect, independent of the internal implementation —
catches breaking changes earlier than a typical integration test would.
This pairs with the API & contract versioning guidance in
`security-performance-cross-cutting.md`: the contract test is what
actually enforces that versioning discipline in CI rather than relying
on manual review to catch it.
