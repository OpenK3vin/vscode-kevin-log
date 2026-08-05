# Changelog

## 0.2.1

### Patch Changes

- ca33114: fix: log planner anchors references inside if-conditions correctly to the start of the block

## 0.2.0

### Minor Changes

- 28c09ee: Add configurable log markers via the `kevinLog.marker` setting, and document the new setting in the README.

### Patch Changes

- fb36bdd: Ensure yarn dependencies are installed before running versioning and release commands in release workflow.
- 2899c55: Fix log planner to ensure consecutive logs are stacked in order and update Yarn PnP package paths.
- 552474c: Setup Yarn VSCode SDKs for TypeScript resolution and configure .gitignore for Yarn Berry artifacts.
- 8483fb8: Add `docs/github-conventions.md` documenting the repo's branching model, PR conventions, branch protection rules, and GitHub Actions workflow behaviour (CI, release, and sync).
- d355ae7: Ignore and remove tracked Yarn PnP generated files to clean up the repository.
- 3695306: Add GitHub branch ruleset configuration for main and dev branch protection.
- a628398: Update generate-pr skill to scope dev-to-main PRs to only new changes since the last main-to-dev sync.
- c50d19c: Update sync-dev GitHub Actions workflow to use GitHub App token authentication for branch protection bypass.
- 110bdc7: Wrap changesets action version and publish commands in bash subshell for chaining support.
- 5135df4: Expanded the OSS project setup checklist with additional troubleshooting tips for bot permissions, PnP packaging errors, and artifact size management.
- 88b953d: Update log planner tests to comprehensively cover indentation, line numbering, and context name resolution for multi-line statements.

## 0.1.2

### Patch Changes

- c4204be: Fixed `vsce` PnP resolution errors during publishing by adding `secretlint` dependencies, and introduced a `compile-code` script for extracting codebase context.

## 0.1.1

### Patch Changes

- 3dc137a: Added an OSS project setup checklist to the documentation and refined the release script to improve the Open VSX publishing flow and debug output.
- c57bfc2: Added a GitHub Actions workflow to automatically sync the `main` branch into the `dev` branch after every release or push.

## 0.1.0

### Minor Changes

- 1aca080: Added GitHub Actions workflows for continuous integration, automated releases, and Open VSX Registry publishing support.

All notable changes to the "Kevin Log" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Unit test suite for the log-planning logic (`logPlanner.test.ts`), covering plain variables, destructuring, function parameters, class properties, and log formatting.

## [0.1.0] - 2026-07-28

### Added

- Smart node-type detection: the extension now distinguishes between plain variables, destructured fields, function parameters, and class properties, and logs the appropriate expression for each.
  - Destructured field selected → logs just that field.
  - Whole destructuring pattern selected → logs the source object once.
  - Function parameter selected → log is inserted right after the function body's opening brace, correctly handling multi-line signatures.
  - Class property (declaration or `this.x` usage) → logs `this.propName` with the class name as context.
- 🚀 marker prefix on every inserted log, used to distinguish extension-inserted logs from manually written ones.
- `Kevin Log: Delete All Logs` command — removes every marked log from the current file.
- `Kevin Log: Comment/Uncomment All Logs` command — toggles marked logs between commented and active.
- Configuration settings:
  - `kevinLog.quoteStyle`
  - `kevinLog.logFunction`
  - `kevinLog.includeFileAndLine`
  - `kevinLog.includeMarker`
  - `kevinLog.semicolons`
- Refactored core logic into `logPlanner.ts`, separating pure AST decision-making from the `vscode`-facing editor integration.

## [0.0.1] - 2026-07-28

### Added

- Initial release.
- `Kevin Log: Insert Console Log` command — select a variable (or place the cursor on one) and insert a `console.log` with file name, line number, and enclosing function name.
- Keyboard shortcut: `Ctrl+Alt+L` (`Cmd+Alt+L` on Mac).

[Unreleased]: https://github.com/kevin/kevin-log/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kevin/kevin-log/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/kevin/kevin-log/releases/tag/v0.0.1
