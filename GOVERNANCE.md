# Headlamp Governance

Headlamp is a [subproject](https://github.com/kubernetes/community/blob/main/governance.md#subprojects)
of the Kubernetes [SIG UI](https://github.com/kubernetes/community/tree/main/sig-ui).
As such, it follows the [Kubernetes community governance](https://github.com/kubernetes/community/blob/main/governance.md),
the [SIG UI charter](https://github.com/kubernetes/community/blob/main/sig-ui/charter.md), and the
[SIG governance](https://github.com/kubernetes/community/blob/main/committee-steering/governance/sig-governance.md)
rules. This document explains how those rules apply to Headlamp day to day.

All participants are expected to follow the [Code of Conduct](./code-of-conduct.md).

## Roles and responsibilities

Who holds each role is recorded in files in this repository, so that it is
always public and versioned:

| Role | Where it is recorded |
| --- | --- |
| Maintainers (approvers) | `headlamp-maintainers` in [OWNERS_ALIASES](./OWNERS_ALIASES), referenced as `approvers` in [OWNERS](./OWNERS) |
| Reviewers | `headlamp-reviewers` in [OWNERS_ALIASES](./OWNERS_ALIASES), referenced as `reviewers` in [OWNERS](./OWNERS) |
| Security contacts | [SECURITY_CONTACTS](./SECURITY_CONTACTS) |
| SIG UI Chairs | [SIG UI README](https://github.com/kubernetes/community/tree/main/sig-ui#leadership) |

### Contributor

Anyone who contributes to Headlamp: code, documentation, translations, tests,
issue reports, reviews, design feedback, or community support.

Contributors:

- Follow the [Code of Conduct](./code-of-conduct.md) and the
  [contribution guidelines](./docs/contributing.md).
- Sign the [CNCF Contributor License Agreement](https://git.k8s.io/community/CLA.md)
  before their pull requests can be merged.
- Include tests with their changes (see
  [Testing](./docs/contributing.md#testing)).

### Reviewer

Reviewers are experienced contributors trusted to review pull requests for
quality and correctness.

Reviewers:

- Review pull requests in a timely manner, and mark them with `/lgtm` when
  they are ready to merge.
- Check that changes follow the coding style, include adequate tests and
  documentation, and do not introduce security regressions.
- Help triage issues and support other contributors.

### Maintainer (approver)

Maintainers are responsible for the overall health and direction of Headlamp.

Maintainers:

- Approve pull requests with `/approve`. Only maintainers can approve a pull
  request for merging.
- Triage issues, set priorities, and keep the
  [milestones](https://github.com/kubernetes-sigs/headlamp/milestones) up to date.
- Perform releases following the [release guide](./docs/development/release-guide.md).
- Keep dependencies up to date and respond to vulnerability reports together
  with the security contacts.
- Run the monthly community meeting and represent Headlamp within SIG UI.
- Mentor contributors and grow new reviewers and maintainers.

### Security contact

Security contacts are maintainers who are the point of contact for the
Kubernetes Security Response Committee. They triage and coordinate fixes for
vulnerabilities reported through the process in [SECURITY.md](./SECURITY.md),
and abide by the Kubernetes
[embargo policy](https://git.k8s.io/security/private-distributors-list.md#embargo-policy).

### SIG UI Chairs

As a SIG UI subproject, Headlamp is overseen by the SIG UI Chairs, who resolve
escalations that cannot be settled within the project, as defined in the [SIG governance](https://github.com/kubernetes/community/blob/main/committee-steering/governance/sig-governance.md).

## Decision making

Headlamp makes decisions by **lazy consensus**: a proposal is accepted if no
maintainer raises a reasoned objection after it has been visible for a
reasonable amount of time.

- **Code and documentation changes** are proposed as pull requests. A pull
  request needs an `/lgtm` from a reviewer and an `/approve` from a maintainer
  ([Prow](https://docs.prow.k8s.io/) only accepts `/approve` from approvers in
  the [OWNERS](./OWNERS) file), as well as passing CI and a signed CLA. Prow's
  merge bot, Tide, then merges it automatically.
- **Larger changes** (new features, architecture changes, or changes that
  affect many lines of code) should start as a GitHub issue and be discussed with
  the maintainers on the [#headlamp](https://kubernetes.slack.com/messages/headlamp)
  Slack channel or in the
  [monthly community meeting](https://zoom-lfx.platform.linuxfoundation.org/meetings/headlamp)
  before implementation.
- **Roadmap and release planning** decisions are made by the maintainers, in
  public, through [milestones](https://github.com/kubernetes-sigs/headlamp/milestones),
  GitHub issues, and community meetings.
- **Disputes** are first resolved through discussion among the maintainers,
  aiming for consensus. If maintainers cannot reach consensus, the matter is
  escalated to the SIG UI Chairs, and ultimately to the
  Kubernetes [Steering Committee](https://github.com/kubernetes/steering), as
  described in the [Kubernetes governance](https://github.com/kubernetes/community/blob/main/governance.md).

## Changing roles

Membership follows the Kubernetes
[community membership](https://github.com/kubernetes/community/blob/main/community-membership.md)
ladder:

- To become a **reviewer** or **maintainer** (approver), a contributor must
  meet the requirements for that role in the Kubernetes
  [community membership](https://github.com/kubernetes/community/blob/main/community-membership.md)
  guidelines, such as the minimum number of pull requests reviewed. A reviewer
  must be sponsored by a maintainer. A maintainer must be nominated by a
  subproject owner; for Headlamp, the subproject owners are the maintainers,
  since SIG UI lists the top-level [OWNERS](./OWNERS) file as the owners of
  the Headlamp subproject. The contributor is then added to the relevant alias
  in [OWNERS_ALIASES](./OWNERS_ALIASES) by a pull request, which is accepted if
  the other maintainers have no objections.
  `OWNERS_ALIASES` decides who Prow assigns reviews to and who can
  `/approve` pull requests. GitHub repository permissions are managed
  separately, through the Headlamp teams in
  [kubernetes/org](https://github.com/kubernetes/org/blob/main/config/kubernetes-sigs/sig-ui/teams.yaml),
  and are changed with a pull request to that repository.
- Members who are no longer active may step down, or be moved to emeritus
  status, by a pull request. Former maintainers are removed from
  `headlamp-maintainers` in [OWNERS_ALIASES](./OWNERS_ALIASES) and added to
  `emeritus_approvers` in [OWNERS](./OWNERS), as described in the Kubernetes
  [OWNERS guide](https://github.com/kubernetes/community/blob/main/contributors/guide/owners.md#emeritus).
  Former reviewers are removed from `headlamp-reviewers`.
- Changes to [SECURITY_CONTACTS](./SECURITY_CONTACTS) are made by pull request
  and approved by the maintainers.

## Changes to this document

Changes to this governance document are made by pull request and require
approval from the maintainers.
