## Changelog Automation

The changelog automation script simplifies the process of generating a changelog for our project's releases. While certain steps remain manual for quality assurance, much of the procedure is automated to save time and effort.

### GitHub Token

Before running the script, ensure you have a GitHub personal access token. This token helps prevent potential issues with GitHub rate limits. If you don't have one already, generate a token by visiting [GitHub Tokens](https://github.com/settings/tokens).

### Define the Latest Release Tag

The following example assumes we’re going from version 0.22.0 (v0.22.0) to 0.23.0 (v0.23.0). Check Increasing version number for details on how to identify what the next version should be.

Export the release version.

```bash
# Example: export NEW_RELEASE_TAG="v0.23.0"
export NEW_RELEASE_TAG=""
```

Create a release branch from latest main

```bash
git fetch origin && git checkout -b release-$NEW_RELEASE_TAG origin/main
```

Make sure your git status is clean.

```bash
git status
```

### Running the Script

Execute the script to generate the changelog file (scripts/changelog.md). Review the output and make any necessary adjustments for the release.

```bash
scripts/changelog.sh
```

