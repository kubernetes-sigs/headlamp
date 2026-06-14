---
name: pr-triage
description: Use this skill when the user asks to "triage PRs", "check new PRs", "review open PRs", "find PRs missing copilot review", or otherwise wants a sweep of open pull requests on the current GitHub repository to surface ones missing a Copilot review request and ones whose commits do not follow the Linux kernel-style format used in this repo.
---

# PR Triage

## Purpose

Sweep open PRs on the current repo and produce a short, actionable report:

1. **PRs missing a Copilot review request** — flag so the user can request one.
2. **PRs whose commits do not follow Linux kernel-style** — flag and draft a ready-to-paste reply.

Output is read by the user to decide what to do next. Do not request reviews, push commits, or post comments without explicit instruction.

## Step 1 — Resolve the repo

Run from the current working directory:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

If this errors, stop and tell the user the directory is not a GitHub repo (or `gh` is not authenticated).

## Step 2 — List candidate PRs (open, not draft, no human reviews yet)

```bash
gh pr list \
  --search "is:open is:pr draft:false review:none" \
  --json number,title,author,headRefName,url \
  --limit 50
```

Notes:
- `review:none` excludes PRs that already have any **human** review. (A Copilot review does **not** count as a human review for this filter, so PRs Copilot has reviewed but no human has are still in scope — that is intentional.)
- `draft:false` excludes drafts; mention this in the output.
- If the list is empty, report "no open PRs needing triage" and stop.

## Step 3 — Detect missing Copilot review request

**Do not parse `reviewRequests` JSON for this.** Copilot does **not** appear in the `reviewRequests` field returned by `gh pr view --json reviewRequests` — neither as a User nor as a Bot. The only reliable signal is GitHub's search filters.

Run a second search that returns the candidate PRs **missing** Copilot involvement (neither requested nor already reviewed by Copilot):

```bash
gh pr list \
  --search "is:open is:pr draft:false review:none -review-requested:app/copilot-pull-request-reviewer -reviewed-by:app/copilot-pull-request-reviewer" \
  --json number \
  --limit 50
```

Any PR number in this result is **missing Copilot**. PR numbers in Step 2's list but **not** in this list have Copilot involved (either requested or already reviewed).

The reviewer slug is `app/copilot-pull-request-reviewer`. If your org uses a different Copilot app login, change the slug — but verify by running:

```bash
gh pr list --search "is:open is:pr reviewed-by:app/copilot-pull-request-reviewer" --json number --limit 3
```

If that returns nothing for a repo you know Copilot has reviewed, the slug is wrong for this org.

## Step 4 — Check commits for Linux kernel-style

For each PR, fetch its commits:

```bash
gh pr view <number> --json commits -q '.commits[].messageHeadline'
```

A commit **passes** if its subject line matches the convention used in this repo's `git log`:

- Format: `<area>[: <subarea>]*: <Capitalized imperative description>`
- Areas seen in this repo: `frontend`, `backend`, `app`, `docs`, `chocolatey`, `ci`, plus nested forms like `backend: server:` or `frontend: common/ReleaseNotes/ReleaseNotes:`.
- Subject ≤ ~75 characters, no trailing period, imperative mood (`Add`, `Fix`, `Bump`, `Refactor`, not `Added`/`Adding`/`Fixes`).
- Conventional-commit prefixes (`feat:`, `fix:`, `chore:`, `feat(scope):`) are **not** this repo's style — flag them.
- Lowercase-only or punctuation-only subjects (`update stuff`, `wip`, `.`) are flagged.

If unsure about borderline cases, sanity-check against recent history:

```bash
git log --no-merges --format='%s' -30
```

A PR **fails** the check if **any** of its commits fail. Record which commits failed and why (one short reason each).

## Step 5 — Report

Print a single compact report. Use this shape:

```
## PR triage — <N> open PR(s) without a review (drafts excluded)

### ✅ Clean
- #1234 — Title (author) — <url>

### ⚠️ Missing Copilot review
- #1235 — Title (author) — <url>
- #1236 — Title (author) — <url>

### ⚠️ Commit messages need cleanup
- #1237 — Title (author) — <url>
  - "feat: add thing" — uses Conventional-commit prefix; expected `<area>: <Description>`
  - "wip" — non-descriptive
- #1238 — Title (author) — <url>
  - "fixed bug" — past tense; expected imperative ("Fix …")

PRs in both ⚠️ sections appear in both.
```

For each PR in **Commit messages need cleanup**, also include a ready-to-paste reply block. Use the user's preferred wording verbatim — do not paraphrase:

```
**Reply for #1237:**
> The commit messages just need a quick cleanup to match our Linux kernel–style guidelines. The contributing guide and git log both have good examples.
```

If there are zero issues across both checks, just say so in one line.

## Boundaries

- **Read-only.** Do not run `gh pr review`, `gh pr comment`, `gh pr edit`, or any mutating gh command. The user posts replies themselves.
- **Do not** request Copilot as a reviewer automatically.
- **Do not** suggest force-pushing or amending commits on the user's behalf.
- If `gh` is not installed or not authenticated, say so and stop.
- Cap at 50 PRs per run; if there are more, mention it and ask whether to paginate.
