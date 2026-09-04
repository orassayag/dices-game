# React Component Folder Structure

Each React component you author lives in **its own folder**, named in
**kebab-case** — never a bare `.tsx` file dropped directly in `components/`.
One component per folder.

- Folder name is kebab-case (`job-card/`, `status-badge/`, `error-boundary/`),
  matching the folder-naming convention. The component file inside keeps the
  project's established file casing — `PascalCase` (`JobCard.tsx`) in projects
  that use PascalCase component files, lowercase (`job-card.tsx`) in projects
  that already use lowercase files. Match what the surrounding skeleton does;
  don't introduce a second casing convention.
- Co-locate everything the component owns in that folder: its test
  (`__tests__/<Component>.test.tsx`), component-scoped styles, and any
  subcomponents or helpers used only by it. A component that grows private
  parts keeps them local instead of leaking them into a shared folder.
- A barrel `index.ts(x)` re-exporting the component is optional — add one only
  if the project's existing import style uses barrels; otherwise import the
  file directly.

### Carve-outs (these do NOT get folded into per-component folders)

- **Atomic primitive layers** under `components/ui/` stay flat. For shadcn/ui
  this is mandatory — the CLI generates flat files (`components/ui/button.tsx`)
  and the next `shadcn add` would regenerate flat and drift from any folders you
  imposed. The same carve-out covers a hand-authored `ui/` atoms layer exported
  through a single barrel (`Button`, `Badge`, `Spinner`, …): it's a flat design
  system, not a set of standalone components. Everything outside that primitive
  layer — feature components, page-shell/layout chrome, standalone components —
  still gets its own folder.
- **Framework-mandated files win.** Next.js App Router files (`page.tsx`,
  `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`,
  `route.ts`) stay exactly where the framework requires them.
- **A single-component library** (e.g. the `react-component` boilerplate, which
  exports one component) may keep that component at the package's conventional
  entry location. This rule governs multi-component apps; it isn't a mandate to
  invent a folder for a package that has exactly one component.
