# Contributing to Kevin Log

Thanks for wanting to help out. This project is intentionally small and dependency-light — let's keep it that way. Below is everything you need to get set up, understand how the code is organized, and submit a change.

## Project philosophy

- **No bloat.** No telemetry, no accounts, no unnecessary dependencies. If a PR adds a dependency, it should have a very good reason to.
- **Logic stays pure where possible.** The core AST decision-making lives in `src/logPlanner.ts` and has zero dependency on the `vscode` API, so it can be unit tested without spinning up an editor. `src/extension.ts` is a thin adapter that translates between `vscode`'s types and `logPlanner`'s plain types. New features should follow this split: put decision logic in `logPlanner.ts`, keep `extension.ts` limited to reading from/writing to the editor.

## Getting set up

**Requirements:** Node.js, Yarn, VS Code.

```bash
git clone <repo-url>
cd kevin-log
yarn install
```

Build and watch for changes:

```bash
yarn watch
```

Press **F5** in VS Code to launch the Extension Development Host — a second VS Code window with your local build of the extension loaded. Test commands there via the Command Palette or their keybindings, not in your main editor window.

If F5 says the extension is incompatible, check that your installed VS Code version satisfies the `engines.vscode` field in `package.json`.

## Project structure

```
src/
  extension.ts        # vscode-facing entry point: commands, editor reads/writes
  logPlanner.ts        # pure AST logic — no vscode import, fully unit-testable
  logPlanner.test.ts    # unit tests for logPlanner.ts
.changeset/            # pending changelog entries (see "Changelogs" below)
package.json            # commands, keybindings, and settings are declared under "contributes"
```

### How a "detection case" works

`logPlanner.ts`'s `buildLogPlan()` tries a sequence of specialized matchers in order — destructuring, function parameter, class property — falling back to the plain-variable case if none match. Each matcher is a `tryX(sourceFile, token)` function that either returns a `LogPlan` or `undefined` to let the next matcher try. If you're adding a new case (e.g. array destructuring, TS interface properties), follow this pattern:

1. Write a `tryYourCase(sourceFile, token)` function next to the existing ones.
2. Add it to the sequence in `buildLogPlan()`, in whatever priority order makes sense.
3. Add test cases in `logPlanner.test.ts` covering the new case, plus a case confirming it doesn't false-positive on unrelated code.

## Running tests

```bash
yarn test:unit
```

This compiles `src/**/*.ts` and runs the Mocha suite (`tdd` style — `suite`/`test`, not `describe`/`it`) against `logPlanner.ts`. These tests run in plain Node, no editor required, so they're fast — run them before every PR.

There's also `yarn test`, which runs `@vscode/test-cli` integration tests against a real VS Code instance. These are slower and cover the `extension.ts` wiring itself (command registration, actual editor edits). Use these sparingly, for things that can't be tested at the `logPlanner.ts` level.

## Making a change

1. **Branch** off `main`.
2. **Write the code.** If you're touching detection logic, put it in `logPlanner.ts`, not `extension.ts`.
3. **Add tests.** PRs that change `logPlanner.ts` behavior need corresponding test cases — this is how we catch regressions across the different detection branches.
4. **Add a changeset.** This project uses [changesets](https://github.com/changesets/changesets) to generate `CHANGELOG.md` and manage version bumps. Run:
   ```bash
   yarn changeset
   ```
   It'll ask what kind of change this is (patch/minor/major) and prompt for a short description — this becomes a changelog entry, so write it for a user, not for a fellow contributor (e.g. "Fix log placement inside multi-line function signatures", not "refactor tryFunctionParameter").
5. **Open a PR.** Include the `.changeset/*.md` file it generated — don't run `yarn version` yourself; that's done at release time by a maintainer.

## Code style

- TypeScript, strict mode.
- Prefer small, single-purpose functions over large ones — see how `buildLogPlan` delegates to `tryDestructuring`/`tryFunctionParameter`/`tryClassProperty` rather than doing it all inline.
- No `any` unless there's genuinely no better option.
- Settings-driven behavior (quote style, semicolons, etc.) belongs in `FormatOptions`/`formatLogStatement`, not scattered through the detection logic — detection decides _what_ to log, formatting decides _how_ it's written out.

## Reporting bugs / requesting features

Open an issue with:

- A minimal code snippet showing the input (what you selected, what file type)
- What you expected the extension to insert
- What it actually inserted

For detection bugs specifically, the snippet is the most valuable part — it usually becomes the test case that goes with the fix.

## Questions

Open an issue or start a discussion — no formal process, this is a small project.
