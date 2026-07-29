---
trigger: always_on
---

# Rule: PR Description Format

## Overview

All pull request descriptions must follow a consistent five-section structure with standardized formatting. Output must only be generated **after agent confirmation AND explicit user approval ("yes")**, and must be saved as a markdown file in the `/agents-output` folder.

## Generation Condition (Strict)

- Generate the PR markdown immediately when given sufficient context (branch, changes, or description)
- Output the complete PR in the conversation inside a fenced markdown code block
- After outputting, ask: "Would you like me to save this to `/agents-output/pr-<short-description>.md`?"
- ONLY save the file if the user explicitly confirms
- Do NOT save without confirmation

## Output Instructions

- First, output the complete PR markdown in the conversation (inside a markdown code block)
- After outputting, ask the user: "Would you like me to save this to `/agents-output/pr-<short-description>.md`?"
- Only save the file if the user confirms
- When saving: filename format is `pr-<short-description>.md` (e.g. `pr-fix-login-bug.md`)
- The saved file must contain only the PR markdown — no extra commentary or wrapping
- After the `## Expected Result` section, append a fenced code block containing the exact markdown that would be written to the file
- Label the block with a comment: `<!-- file: /agents-output/pr-<short-description>.md -->`
- The block must be language-tagged as` ```markdown

## Required Structure

### 1. `## Title` (required)

- Concise, descriptive title tracking the main change
- Format: `feat: ...`, `fix: ...`, `chore: ...` etc.
- One line only

### 2. `## Summary` (required)

- 2–3 sentences maximum
- First sentence: what problem this PR solves
- Second sentence: what it introduces or changes at a high level
- No bullet points — prose only

### 3. `## Key Changes` (required)

- Numbered list of logical change groups (e.g. `1. Feature Name`)
- Each group has bullet points beneath it
- Each bullet uses `- **Bold Label**:` followed by a description
- Inline code (backticks) for variable names, config keys, and component names
- Group count: 2–5 groups typical; each group has 1–4 items

### 4. `## Testing Instructions` (required)

- Numbered steps using repeating `1.` (markdown auto-increments)
- Steps must be concrete and reproducible (specific env flags, screens, viewports)

### 5. `## Expected Result` (required)

- Numbered list or single group of checklist items
- Each item uses `- [ ] **Bold Label**:` followed by a description
- Clearly describes the observed behavior after following testing steps

## Formatting Rules

- Use `##` for all section headers (H2 only)
- Checklist format for items: `- [ ] **Label**:` followed by description
- Bullet format for items: `- **Label**:` followed by description
- Backticks for: file paths, env variables, config keys, component/function names, CSS classes
- No emoji, no horizontal rules, no nested numbered lists
- Tense: present tense for descriptions ("ensures", "prevents"), past tense for changes ("Updated", "Removed", "Introduced")

## Example Skeleton

```markdown
## Title

feat: add user authentication

## Summary

[What problem this addresses.] [What it introduces or changes.]

## Key Changes

1. Group Name

- **Label**: Description using `code` where relevant.
- **Label**: Description.

2. Another Group

- **Label**: Description.

## Testing Instructions

1. [Setup step, e.g. enable a flag or navigate somewhere.]
1. [Action step.]

## Expected Result

- [ ] **Label**: Clear description of the observed behavior.
- [ ] **Label**: Another behavior.
```
