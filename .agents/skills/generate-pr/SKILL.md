---
name: generate-pr
description: Generates a GitHub Pull Request description based on the current branch's changes.
---

# Generate PR

When the user invokes `/generate-pr`, you must:

The repository follows this branching flow: **child branch → dev → main**.

1. Determine the source and target branches. If not specified by the user, identify the base branch from which the current branch diverged. The PR merges the source into the target.

2. **Scope the diff correctly based on the PR direction:**

   - **For any PR targeting `dev` or `main`** (e.g. `child → dev`, `dev → main`):
     - Run `git log --merges <target> -n 10` to inspect the merge history on the target branch.
     - Find the most recent merge commit on the **target branch** where the **source branch** was last merged in (e.g. the last `Merge pull request ... from OpenK3vin/dev` on `main`).
     - For **`dev → main` PRs specifically**: also find the most recent commit on `dev` where `main` was synced back (e.g. `Merge remote-tracking branch 'origin/main' into dev` or `Merge pull request ... sync-main-into-dev`). This sync marks the **start of the current dev cycle**. Only describe commits added to `dev` **after that sync commit** — these represent the actual new child branches merged since the last successful dev→main merge.
     - Use `git log <last-sync-commit>...<source>` and `git diff <last-sync-commit>...<source>` to scope the diff to only truly new changes.

   - **For all other PRs** (e.g. a child feature branch → dev):
     - Use `git log <target>...<source>` and `git diff <target>...<source>`.

3. **Only describe what is literally in the scoped diff.** Do not add background context, infer intent from conversation history, or include details from previously merged PRs. If a change is not in the diff output, do not mention it.

4. Synthesize the scoped changes to understand their scope and intent.

5. Generate a Pull Request description based strictly on the scoped changes.

6. You MUST adhere strictly to the rules defined in `pull-request-style.md` (which requires a specific 5-section format: Title, Summary, Key Changes, Testing Instructions, Expected Result).

7. As per the rules, output the PR description inside a fenced markdown code block.
