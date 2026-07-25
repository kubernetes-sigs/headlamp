# Headlamp Releaser

A CLI tool for managing Headlamp releases. It automates version bumping, tagging, publishing, and CI build management.

## Prerequisites

- **Node.js** >= 20.11.1
- **npm** >= 10.0.0
- **Git** (with push access to the repository)
- **GitHub Personal Access Token** with `repo`, `workflow`, and `read:packages` scopes, set as the `GITHUB_TOKEN` environment variable

## Setup

```bash
cd tools/releaser
npm install
npm run build
```

This compiles the TypeScript source into the `dist/` directory. To make the `releaser` command available, link the package:

```bash
npm link
```

You can then run the tool as:

```bash
releaser <command>
```

## Typical Release Workflow

```bash
export GITHUB_TOKEN=your-token-here

# 1. Start the release (creates branch hl-rc-0.42.0, bumps version
#    in app/package.json, runs npm install, and commits)
releaser start 0.42.0

# 2. Create the GitHub draft release
#    Run the "Create Release Draft" workflow (.github/workflows/draft-release.yml)
#    via the GitHub Actions UI with releaseName: 0.42.0

# 3. Create the release tag (reads version from app/package.json,
#    creates annotated git tag v0.42.0)
releaser tag

# 4. Verify the draft release and its required artifacts before publishing
#    (fetches the GitHub release, checks Mac/Linux/Windows build artifacts exist)
releaser check 0.42.0

# 5. Publish the release (pushes tag to remote, associates it with the
#    draft release, and marks the release as published — irreversible)
releaser publish 0.42.0

# 6. (Optional) Re-run checks after publishing for extended asset verification
#    (also checks container images, Homebrew, winget, Chocolatey, Flatpak, etc.)
releaser check 0.42.0
```

## Usage

### `check` — Verify a release

Check whether a release exists on GitHub and verify that all required artifacts (Mac, Linux, Windows) are present.

```bash
releaser check <release-version>
```

**Example:**

```bash
releaser check 0.42.0
```

For published releases, this also checks extended assets such as container images, Homebrew, winget, Chocolatey, Flatpak, Docker extension, Helm, and Minikube.

### `start` — Start a new release

Update `app/package.json` with the new version, run `npm install` in the app directory, and commit the changes. By default, a release branch named `hl-rc-<version>` is created.

```bash
releaser start <release-version> [options]
```

**Options:**

| Option | Description |
|---|---|
| `--no-branch` | Stay on the current branch instead of creating a release branch |

**Example:**

```bash
# Create a release branch and bump version
releaser start 0.42.0

# Bump version on the current branch
releaser start 0.42.0 --no-branch
```

### `tag` — Create a release tag

Create an annotated git tag (`v<version>`) for the current version read from `app/package.json`.

```bash
releaser tag
```

### `publish` — Publish a release

Push the tag to the remote, associate it with the GitHub release draft, and publish the release. You will be prompted for confirmation unless `--force` is used.

```bash
releaser publish <release-version> [options]
```

**Options:**

| Option | Description |
|---|---|
| `--force` | Skip the confirmation prompt |

**Example:**

```bash
releaser publish 0.42.0
releaser publish 0.42.0 --force
```

### `ci app` — Manage CI app build workflows

Trigger or list app build workflow runs on GitHub Actions.

```bash
# Trigger builds
releaser ci app --build <git-ref> [options]

# List recent runs
releaser ci app --list [options]
```

**Options:**

| Option | Description |
|---|---|
| `--build <git-ref>` | Trigger build workflows for the specified git ref (branch or tag) |
| `--list` | List the latest app build workflow runs |
| `-p, --platform <platform>` | Platform filter: `all`, `windows`, `mac`, or `linux` (default: `all`) |
| `--latest <number>` | Number of recent runs to fetch when listing (default: `1`) |
| `-o, --output <format>` | Output format when listing: `simple` or `json` (default: detailed) |
| `--force` | Skip the confirmation prompt when building |

**Examples:**

```bash
# Trigger builds for all platforms on a tag
releaser ci app --build v0.42.0

# Trigger a Linux-only build
releaser ci app --build main --platform linux --force

# List the latest run for each platform
releaser ci app --list

# List the 3 most recent Mac runs in JSON format
releaser ci app --list --platform mac --latest 3 --output json
```

## Development

Source code is in `src/` and is organized as follows:

- `src/index.ts` — CLI entry point and command definitions
- `src/commands/` — Individual command implementations (`check`, `start`, `tag`, `publish`, `build`, `get-app-runs`)
- `src/utils/` — Shared utilities (`git`, `github`, `version`)

To rebuild after making changes:

```bash
npm run build
```
