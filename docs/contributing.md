---
title: Contribution Guidelines
sidebar_label: Contributing
sidebar_position: 4
---

This section has information on how to contribute to Headlamp. It assumes you have cloned
this repository (or your own Github fork).
Any contributions to the project are accepted under the terms of the project's
license ([Apache 2.0](https://github.com/kubernetes-sigs/headlamp/blob/main/LICENSE)).

## Code of Conduct

Please refer to the Kinvolk [Code of Conduct](https://github.com/kinvolk/contribution/blob/master/CODE_OF_CONDUCT.md).

## Development practices

The Headlamp project follows the [Kinvolk Contribution Guidelines](https://github.com/kinvolk/contribution),
which promotes good and consistent contribution practices across Kinvolk's
projects. Before starting to contribute, and in addition to this section, please
read those guidelines.

## Community Monthly Call

We hold a monthly call to discuss the project, the roadmap, and the community.

You can find Headlamp's Community Call event in its [CNCF calendar](https://zoom-lfx.platform.linuxfoundation.org/meetings/headlamp?view=month).

## Filing an issue or feature request

Please use the [project's issue tracker](https://github.com/kubernetes-sigs/headlamp/issues) for filing any bugs you find or features
you think are useful.

### Guidelines for Submitting an Issue

When submitting an issue, follow these guidelines to help maintainers address it efficiently:

**Search for Existing Issues:**

- Use the issue tracker to see if your issue already exists. If it does, consider adding your input to the existing issue instead of opening a new one.
- If the issue doesn't exist, please create a new issue using one of the templates available:
  - [For bug related issues](https://github.com/kubernetes-sigs/headlamp/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=)
  - [For feature requests](https://github.com/kubernetes-sigs/headlamp/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.md&title=)

### Security issues

For filing security issues that are sensitive and should not be public, please
send an email to <security@headlamp.dev> .

## Submitting a Pull Request (PR)

Follow these steps when submitting a PR to ensure it meets the project’s standards.

### 1. Run Tests and Format Your Code

Run the following commands from your project directory:

- `npm run frontend:test` - Run the test suite
- `npm run frontend:lint` - Format your code to match the project

These steps ensure your code is functional, well-typed, and formatted consistently.

---

### 2. Follow Commit Guidelines

Use **atomic commits** to keep each commit focused on a single change. Follow this structure for your commit messages:

`<area>: <description of changes>`

- Both the title and the body of the commit message shoud not exceed
  72 characters in length.
  i.e. Please keep the title length under 72
  characters, and the wrap the body of the message at 72 characters.

- Commits should be atomic and self-contained. Divide logically separate changes
  to separate commits. This principle is best explained in the the Linux Kernel
  [submitting patches](https://www.kernel.org/doc/html/v4.17/process/submitting-patches.html#separate-your-changes) guide.

- Commit messages should explain the intention, _why_ something is done. This,
  too, is best explained in [this section](https://www.kernel.org/doc/html/v4.17/process/submitting-patches.html#describe-your-changes) from the Linux
  Kernel patch submission guide.

- Commit titles (the first line in a commit) should be meaningful and describe
  _what_ the commit does.

- Don't add code you will change in a later commit (it makes it pointless to
  review that commit), nor create a commit to add code an earlier commit should
  have added. Consider squashing the relevant commits instead.

- It's not important to retain your development history when contributing a
  change. Use `git rebase` to squash and order commits in a way that makes them easy to
  review. Keep the final, well-structured commits and not your development history
  that led to the final state.

- Consider reviewing the changes yourself before opening a PR. It is likely
  you will catch errors when looking at your code critically and thus save the
  reviewers (and yourself) time.

- Use the PR's description as a "cover letter" and give the context you think
  reviewers might need. Use the PR's description to explain why you are
  proposing the change, give an overview, raise questions about yet-unresolved
  issues in your PR, list TODO items etc.

#### Examples:

**Good**

- `frontend: HomeButton: Fix so it navigates to home`
- `backend: config: Add enable-dynamic-clusters flag`

**Bad**

- `updates the manifest`
- `Init feature added.`
- `this adds new colors to the dashboard`

For more detailed commit practices, see Kinvolk's [Git contribution guidelines](https://github.com/kinvolk/contribution/tree/master/topics/git.md).

---

### 3. Write a Descriptive PR Description

When opening a PR, make sure to:

- **Summarize your changes** and **why** they are needed.
- **Link to the related issue** via `fixes #ISSUE_NUMBER`, if applicable.
- **Provide steps to test** the changes.

Example:

**This PR fixes the home button bug where the button did not navigate back to the homepage.**

**Steps to Test:**

1. Click on the 'Home' button in the sidebar.
2. Verify that it navigates to the main screen.

---

### 4. Use Labels for Organization

Add relevant labels to your PR to help with triaging and prioritization:

Example:

- enhancement
- documentation

## Coding style

The coding style for the `backend` and `frontend` should be consistent.
For helping and verifying that, we have go and js linters.

For linting the `backend` and `frontend`, use the following commands
(respectively):

```bash
npm run backend:lint
```

```bash
npm run frontend:lint
```

The linters are also run in the CI system, so any PRs you create will be
tested for compliance with the coding style.

To speed up a review from the project's maintainers, please make sure that
the CI checks are passing for your PR.

## Complex contributions

If you have a complex contribution in mind (meaning changes in the architecture
or a lot of LOC changed), it is advisable to first file a GitHub issue and
discuss the implementation with the project's maintainers via [#headlamp](https://kubernetes.slack.com/messages/headlamp) Slack channel.

## Translations

If you want to contribute to the internationalization of Headlamp, please refer to the
dedicated [i18n docs](./development/i18n).

## Commit guidelines

For general guidelines on making PRs/commits easier to review, please check
out Kinvolk's
[contribution guidelines on git](https://github.com/kinvolk/contribution/tree/master/topics/git.md).

## Testing

The frontend is tested via Storybook-related snapshots. So new components should have
an associated story when possible.

For running the frontend tests, use the following command:

```bash
npm run frontend:test
```

The backend uses go's testing and can be run by using the following command:

```bash
npm run backend:test
```

Tests will run as part of the CI after a Pull Request is open.
