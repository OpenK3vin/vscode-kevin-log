# OSS Project Setup Checklist

A reusable checklist for setting up CI, automated versioning, and publishing on a new
open-source project (originally built out for a VS Code extension using Yarn Berry +
Changesets, but the branch/CI/publishing sections generalize to most JS/TS projects).

---

## 1. Repo & branch structure

- [ ] Decide your branch model up front: `main` (protected, releasable) + `dev`
      (integration) + short-lived `feature/*` / `fix/*` / `chore/*` branches off `dev`.
- [ ] Never commit directly to `main` or `dev` — always branch, always PR.
- [ ] Define a `hotfix/*` path for emergencies that need to skip the normal `dev` cycle
      (branch off `main`, PR into `main` directly, then back-merge `main` → `dev`
      immediately after).

## 2. Branch protection

Apply to **both** `main` and `dev` (Settings → Branches → branch ruleset):

- [ ] Require a pull request before merging
- [ ] Require relevant CI status checks to pass before merging
- [ ] Block force pushes
- [ ] Block branch deletion
- [ ] Leave required approvals at **0** if you're a solo maintainer (GitHub won't let you
      approve your own PR — a required-approval rule will lock you out of merging).
- [ ] Expect **"branch is out-of-date with the base branch"** on PRs into `main` if your
      release process bumps the version _only_ on `main` (e.g. a Changesets version PR).
      Every such bump leaves your integration branch behind — plan to back-merge
      `main` → integration branch after every release, not just after hotfixes.
- [ ] If you automate that back-merge with a workflow that pushes directly to a protected
      branch, add an explicit **bypass actor** for that automation (Ruleset → Bypass list
      → add "GitHub Actions", scoped to the specific branch if possible) — otherwise the
      protection rule blocks the bot's push exactly the same way it blocks yours.

## 3. GitHub Actions permissions (check this _before_ writing workflows that open PRs)

- [ ] If the repo lives under an **organization**, check
      `github.com/organizations/<org>/settings/actions` first — org-level policy overrides
      and greys out the repo-level setting until fixed there. Only org **owners** can
      change this; if the org settings page isn't visible to you at all, you're a member,
      not an owner.
- [ ] Repo-level: Settings → Actions → General → Workflow permissions →
      **"Read and write permissions"**
- [ ] Check **"Allow GitHub Actions to create and approve pull requests"** — required for
      any bot/action (e.g. Changesets, Dependabot, Renovate) that opens PRs automatically.
- [ ] **Bot-authored pushes do not themselves trigger other workflows** when made with the
      default `GITHUB_TOKEN` — this is deliberate infinite-loop prevention. Don't design a
      chain where Workflow A's bot commit is expected to trigger Workflow B; it won't fire.
      If automation needs to push directly to a protected branch (e.g. keeping a second
      branch in sync after a release), that's a case for a scoped ruleset bypass (below),
      not a follow-on workflow trigger.

## 4. CI workflow basics

- [ ] Lint, build/compile, and test on every PR — fail fast before merge.
- [ ] Trigger on `pull_request` (target branches you care about) and `push` to your
      integration branch — not on every branch push.
- [ ] Use `concurrency` groups to cancel superseded runs on the same PR/branch.
- [ ] If using **Yarn Berry**: run `corepack enable` before `yarn install --immutable`
      (not `yarn install`) so CI fails loudly on a stale/missing lockfile instead of
      silently resolving different versions than local.

## 5. Automated versioning (Changesets, or equivalent)

- [ ] Adopt a changelog/versioning tool (Changesets is a solid default for both single-
      package and monorepo JS/TS projects).
- [ ] Habit: run the "add changeset" command as part of _every_ PR into the integration
      branch, written **last**, once the diff is final (the description doesn't
      auto-generate from your diff — you write it, so keep it in sync manually).
- [ ] Add a CI check that **fails a PR into the integration branch if no changeset file
      was added** — with an escape-hatch label (e.g. `skip-changeset`) for PRs that
      genuinely don't need a version bump (docs, CI-only changes).
- [ ] Create that escape-hatch label in the repo (Issues → Labels) — the workflow
      condition referencing it does nothing if the label doesn't exist yet.
- [ ] Know that the changeset file is deleted **automatically** by the versioning tool
      when it runs — you don't delete it by hand in the normal flow.

## 6. Release automation

- [ ] Standard pattern: push to `main` → if changesets are pending, bot opens/updates a
      "Version Packages" PR (bump + changelog) → merging _that_ PR triggers the actual
      publish step (build artifact, push to registry/registries).
- [ ] **Watch for command-name collisions with your package manager's built-ins.** Yarn
      Berry has a built-in `yarn version <strategy>` command that silently shadows a
      `package.json` script also named `"version"` — use `yarn run version` (or rename
      the script) to force it to run your script instead of the built-in.
- [ ] If publishing to multiple registries (e.g. VS Code Marketplace + Open VSX, or npm +
      GitHub Packages), **build the artifact once and publish that same file to both** —
      don't rebuild per registry.
- [ ] Add all required secrets (API tokens/PATs) to Settings → Secrets and variables →
      Actions **before** the first real release run; a workflow referencing an unset
      secret usually fails at the publish step, not at setup.
- [ ] Confirm the lockfile (`yarn.lock` / `package-lock.json`) is actually committed —
      `--immutable`/`ci` installs fail hard without it.

## 7. Package manager / bundler gotchas (Yarn Berry / PnP specific, but check equivalents)

- [ ] Tools that shell out to `yarn list --prod --json` (or similar dependency-tree
      introspection) may break under Yarn Berry PnP, since that's a Yarn Classic-era
      command. Look for a `--no-dependencies` / "skip dependency scan" flag on the
      packaging tool if you hit this — safe to use when your bundler (webpack/esbuild/etc.)
      already produces a fully self-contained output file.
- [ ] `pip install` in restricted/managed Python environments may need
      `--break-system-packages` — not Yarn-specific, but the same "environment fights the
      tool" pattern.
- [ ] **Packaging tools with built-in dynamic-loading features (linters, secret scanners,
      plugin systems) can fail under non-hoisted `node_modules` layouts** (Yarn PnP, pnpm,
      sandboxed CI environments) even when the underlying package is genuinely installed —
      the failure is in _resolving_ it, not finding it. If a tool errors with something like
      "rule module not found" or "plugin could not be loaded" under PnP/pnpm, check whether
      adding the failing sub-dependency **explicitly** to your own `devDependencies` (rather
      than relying on it being hoisted/transitive) resolves it before assuming the tool
      itself is broken.

## 8. Publishing prerequisites (do this well before you need to publish urgently)

- [ ] Check whether your target registry now requires **linked billing/subscription
      info** even for a nominally free tier — platform policies change over time (e.g.
      Azure DevOps org creation now requires a linked Azure subscription). Don't assume
      a guide from a year ago still reflects the current signup flow.
- [ ] If a required identity-verification step needs a credit card, check for a
      **no-card alternative path** (e.g. student program, alternate registry) before
      assuming you're blocked.
- [ ] Required manifest fields (`publisher`/`repository`/`license` fields, or equivalent)
      — fill these in _before_ your first packaging attempt, not after hitting warnings
      one at a time.
- [ ] For registries with a separate legal/agreement step (e.g. Open VSX's Publisher
      Agreement, distinct from just logging in) — complete that fully; a missing
      agreement step can surface as a confusing generic error rather than a clear
      "sign the agreement" message.
- [ ] A generic 5xx error from a registry API isn't always an outage — check the
      registry's live status page, then retry, then check your own request (auth token
      scope, manifest field values) before assuming it's on their end.

## 9. Keep the published artifact lean

- [ ] Don't assume your packaging tool's default ignore behavior excludes everything it
      should — explicitly audit and list what gets bundled (`vsce ls`, `npm pack --dry-run`,
      or equivalent) at least once, not just when you first set up the ignore file.
- [ ] Common accidental inclusions worth explicitly excluding: version-manager internals
      (e.g. `.yarn/unplugged`, `.yarn/cache`, `.pnp.cjs`, `.pnp.loader.mjs`), CI config
      (`.github/`), versioning scaffolding (`.changeset/`), internal docs/tooling
      directories not meant for end users, and any AI-agent or editor-specific config
      folders.
- [ ] Re-check the packaged file list **after** any dependency or tooling change, not just
      once at project setup — a new devDependency or generated file can silently start
      getting swept into the artifact.

## 10. Dry run before trusting any of this with a real release

- [ ] Trivial PR → integration branch → confirm CI fully passes (not just skips).
- [ ] Merge → confirm the release bot opens the version PR with the expected bump +
      changelog content.
- [ ] Merge the version PR → confirm the publish step actually runs and the artifact
      shows up on the registry/registries afterward.
- [ ] Only after this succeeds once end-to-end should you rely on it for a real release.
