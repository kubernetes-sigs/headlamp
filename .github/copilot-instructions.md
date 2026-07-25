# Copilot PR Review Instructions

These instructions apply when reviewing pull requests in this repository.

## Commit History Rule (Blocking)

- Inspect the PR commit range only (base..head).
- If any merge commit exists in the PR commit range, raise a blocking review finding.
- Ask the author to rebase onto the base branch and force-push a linear PR history.
- Do not flag merge commits that exist only in the target branch history and are not part of the PR range.

## Commit Coherence Rule

- Review commit-to-commit flow in the PR range to detect when later commits fix or significantly rewrite code introduced by earlier commits in the same PR.
- When this pattern appears, add a review finding asking the author to clean up history for readability (for example by squashing, reordering, or rebasing commits).
- Focus on cases that make review difficult, hide regressions, or split one logical change across multiple corrective commits.

## Commit Message Rule

- Review commit titles and descriptions in the PR range for clarity and coherence.
- Prefer commit titles that follow `<area>: <description of changes>`.
- Ask for improvements when commit titles are not meaningful, are too vague, or do not describe what changed.
- Ask for improvements when commit messages do not explain intent and why the change is needed.
- Prefer commit titles under 72 characters.
- Ask authors not to include `Fixes #NN` in commit messages.

## Review Priorities

- Prioritize correctness, behavior regressions, security risks, and missing tests.
- Keep findings concrete and actionable, and include file and line references when possible.
- Avoid style-only or preference-only comments unless they impact maintainability or correctness.

## CI Status Rule

- Review pull request CI/check status when available.
- If checks are failing, ask the author to inspect failed workflows, share root cause, and post a fix or rerun plan.
- If failures are clearly caused by changes in the PR, treat this as a blocking finding.
- If CI status is unavailable in the review context, state that explicitly and ask the author to confirm CI results.

## Repository Constraints To Respect

- Do not approve or merge PRs on behalf of humans.
- Treat changes to manual-review-only areas as high-risk and call for human review:
  - `.github/workflows/*`
  - `Dockerfile`, `Dockerfile.plugins`
  - `charts/**`
  - `kubernetes-*.yaml`
  - `SECURITY.md`, `SECURITY_CONTACTS`
  - `OWNERS`, `OWNERS_ALIASES`
  - `LICENSE`, `NOTICE`
  - `code-of-conduct.md`

## Scope Discipline

- Do not suggest unrelated refactors.
- Do not suggest public API changes without clear request and justification.
- Do not suggest new dependencies unless required by the requested change.
