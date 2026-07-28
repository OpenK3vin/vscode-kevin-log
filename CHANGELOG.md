# Changelog

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
