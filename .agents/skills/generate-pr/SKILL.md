---
name: generate-pr
description: Generates a GitHub Pull Request description based on the current branch's changes.
---

# Generate PR

When the user invokes `/generate-pr`, you must:
1. Analyze the changes in the current repository. First, identify the base branch from which the current branch diverged. Then, compare the current branch against this base branch using `git log` and `git diff` to understand the full scope of changes. The Pull Request should be generated to merge into this base branch.
2. Synthesize these changes to understand the scope and intent of the work.
3. Generate a comprehensive Pull Request description based on your analysis.
4. You MUST adhere strictly to the rules defined in `pull-request-style.md` (which requires a specific 5-section format: Title, Summary, Key Changes, Testing Instructions, Expected Result).
5. As per the rules, output the PR description inside a fenced markdown code block and then ask the user if they would like to save it to `/agents-output/pr-<short-description>.md`.
