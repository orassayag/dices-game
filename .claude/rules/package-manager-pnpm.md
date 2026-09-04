# Package Manager: pnpm by Default

- pnpm is the default package manager for every boilerplate and project scaffolded
  from one — the single exception is the `npm-library` boilerplate, which stays on
  npm deliberately (it exists to model the plain-npm publishing path).
- All install and run instructions (README, CLAUDE.md, cookbook commands, CI
  snippets) use pnpm commands:

| Instead of | Use |
|---|---|
| `npm install` | `pnpm install` |
| `npm install <pkg>` / `npm i -D <pkg>` | `pnpm add <pkg>` / `pnpm add -D <pkg>` |
| `npm ci` | `pnpm install --frozen-lockfile` |
| `npm run <script>` | `pnpm run <script>` |
| `npm test` | `pnpm test` |
| `npx <pkg>` | `pnpm dlx <pkg>` (one-off remote) / `pnpm exec <bin>` (local bin) |
| `npm publish` | `pnpm publish` |

- `package.json` declares the manager explicitly via the `packageManager` field
  (e.g. `"packageManager": "pnpm@11.8.0"`) so Corepack and CI resolve the same
  version.
- The lockfile is `pnpm-lock.yaml`, committed. Never commit `package-lock.json`
  or `yarn.lock` alongside it — mixed lockfiles drift silently.
- GitHub Actions workflows install pnpm via `pnpm/action-setup` before
  `actions/setup-node`, and use `cache: 'pnpm'` in `setup-node`.
- pnpm 10+ blocks dependency postinstall scripts by default
  (`ERR_PNPM_IGNORED_BUILDS`). Approve the ones the project actually needs in
  `pnpm-workspace.yaml` (committed, so CI and fresh clones inherit it) rather
  than running the per-machine `pnpm approve-builds`:

  ```yaml
  allowBuilds:
    esbuild: true
  ```

  Note the settings home moved in pnpm 11: the `pnpm` field in `package.json`
  is no longer read — these settings live in `pnpm-workspace.yaml` even for
  single-package repos.
