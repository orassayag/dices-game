# Async Patterns

The rules below cover several overlapping concerns; this is the short
version of when each applies, before the detail:
- **Unhandled promises** — always prevented, no exceptions (see "Avoid
  unhandled promise rejections" below).
- **`return await` inside async functions** — always on, regardless of
  whether the code happens to be inside a `try` block (see "Style"
  below).
- **`Promise.all` vs. `Promise.allSettled`** — depends on whether every
  batched result is required (`all`) or some are independent/optional
  (`allSettled`) — see "Batching independent calls" below.
- **`try`/`catch`** — for actual recovery, or for wrapping an error with
  context before rethrowing; not a default wrapper around code with
  nothing meaningful to do in the `catch` (see `error-handling-logging.md`).

### Style
- Prefer `async`/`await` with `try`/`catch`/`finally` over `.then().catch().finally()`
  chains.
- Inside any `async` function, always write `return await somePromise`
  rather than `return somePromise` — not just inside a `try` block. This
  keeps the behavior consistent everywhere (the await always shows up in
  the stack trace and is always caught by a local `catch` if one is added
  later) rather than depending on whether the surrounding code happens to
  be wrapped in `try`/`catch` today.
- Async methods declare `Promise<T>` return types explicitly, even where the
  type is inferable.

### Never leave unhandled promises
Never fire an async call without handling its result, e.g.:

```ts
runAsyncFunction(); // NEVER do this — unhandled rejection risk
```

Either `await` it, explicitly `void` it if the result is genuinely
unneeded (and the function's own errors are already handled inside it), or
attach a `.catch()` with real error handling. `no-floating-promises` should
be treated as an error-level lint rule, not a warning.

### Batching independent calls
When multiple async calls are independent of each other, batch them rather
than awaiting them one at a time in sequence — but choose `Promise.all` vs.
`Promise.allSettled` based on whether a single failure should abort the
whole operation:

- **`Promise.all`** when every result is actually required — if any one
  call fails, there's nothing useful to do with the others anyway, so
  failing the whole batch immediately is correct:
  ```ts
  const [patient, encounters] = await Promise.all([
    getPatient(patientId),
    getPatientEncounters(patientId),
  ]);
  ```
- **`Promise.allSettled`** when the calls are independent *and* one
  failing shouldn't invalidate the others — e.g. fetching optional or
  best-effort supplementary data alongside required data. `Promise.all`
  is fail-fast: if you batch 5 calls and one optional one rejects, the
  entire batch rejects and you lose the other 4 results that already
  succeeded. With `allSettled`, inspect `status` on each result
  (`'fulfilled'` vs. `'rejected'`) and handle partial success explicitly:
  ```ts
  const results = await Promise.allSettled([
    getPatientNotes(patientId),
    getPatientAttachments(patientId), // optional — ok if this fails
  ]);
  const notes = results[0].status === 'fulfilled' ? results[0].value : null;
  ```
- Default to `Promise.all` only when you've actually confirmed every
  result is required; don't reach for it purely out of habit when some
  of the batched calls are genuinely optional.

### Tracing spans
Wrap async business logic in tracing spans using the project's tracer, e.g.:

```ts
tracer.startAutoChildSpan(name, OPTIONS, async (span) => {
  span.setAttribute('SubType', '<stepName>');
  // ...business logic...
});
```

Use `startAutoRootSpan(...)` for top-level entry points and
`startAutoChildSpan(...)` for nested steps. When adding a new traced step,
follow the existing `setAttribute('SubType', '<stepName>')` pairing already
used elsewhere in the codebase rather than inventing a new attribute scheme.

### Optional/conditional async steps
When not every implementation of a multi-step async flow needs every step
(e.g. not every EHR adapter implements every writeback field), declare the
method as optional on the abstract/base class and guard the call:

```ts
abstract writebackOrders?(...): Promise<void>;

// in the runner:
if (this.writebackOrders) {
  await this.writebackOrders(payload);
}
```
