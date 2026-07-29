---
name: generate-changeset
description: Automatically generates a Changeset file based on the current branch's changes.
---

# Generate Changeset

When the user invokes `/generate-changeset`, you must:
1. Analyze the uncommitted changes and recent commits on the current branch. To do this, find the base branch (e.g., `main` or `dev`) that the current branch diverged from, and review the `git log` and `git diff` against that base branch.
2. Read `package.json` to identify the package name.
3. Determine the appropriate Semantic Version bump based on the changes:
   - `patch`: for bug fixes, chores, and minor tweaks.
   - `minor`: for backward-compatible new features.
   - `major`: for breaking changes.
4. Write a concise, 1-2 sentence description summarizing the changes.
5. Generate a new file in the `.changeset/` directory. Mimic the native `@changesets/cli` behavior by using a random three-word hyphenated filename (typically `adjective-adjective-noun` or `adjective-noun-verb`, e.g., `.changeset/tame-lions-sing.md`).
6. The file MUST follow the exact changeset format:
   ```markdown
   ---
   "package-name": "patch | minor | major"
   ---

   Description of the changes.
   ```
7. Use your file editing tools to directly write the file to the filesystem. You do not need to ask the user for permission to save the changeset file.
8. Notify the user once the changeset file has been successfully created.
