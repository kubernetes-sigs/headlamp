---
title: Development Builds from PRs
sidebar_label: PR Development Builds
sidebar_position: 10
---

# Development Builds from Pull Requests

The Headlamp desktop application includes an experimental feature that allows users to test development builds directly from pull requests. This is particularly useful for developers and testers who want to quickly validate changes without waiting for official releases.

## Overview

When enabled, this feature allows you to:

- Browse open pull requests that have successful app builds
- View detailed information about each PR (author, commit, etc.)
- Activate a PR build to test it locally
- Switch back to the default build at any time

## Security Notice

⚠️ **This is an advanced feature that should be used with caution:**

- Development builds are not officially released or thoroughly tested
- They may contain bugs or unstable code
- Only use PR builds from trusted sources
- The feature is disabled by default for security reasons

## Enabling the Feature

The PR builds feature is **enabled by default**. You can disable it by setting the `HEADLAMP_ENABLE_APP_DEV_BUILDS` environment variable to `false`.

### To Disable (if needed)

#### On macOS and Linux

```bash
export HEADLAMP_ENABLE_APP_DEV_BUILDS=false
/Applications/Headlamp.app/Contents/MacOS/Headlamp  # macOS
# or
./headlamp  # Linux
```

#### On Windows

```powershell
$env:HEADLAMP_ENABLE_APP_DEV_BUILDS="false"
& "C:\Program Files\Headlamp\Headlamp.exe"
```

## Using PR Builds

Once enabled, you can access the PR builds feature from the Settings page:

1. Open Headlamp and navigate to **Settings**
2. Scroll down to the **Development Builds from PRs** section
3. Click **Refresh PR List** to see available PRs
4. Review the list of PRs with available builds:
   - PR number and title
   - Author information
   - Commit SHA and date
   - Number of artifacts available

5. Click **Use This Build** next to the PR you want to test
6. Review the confirmation dialog with PR details
7. Click **Activate** to activate the PR build
8. **Restart the application** to use the PR build

## Switching Back to Default Build

### From Settings

1. Open **Settings**
2. In the **Development Builds from PRs** section
3. Click **Clear PR Build**
4. Restart the application

### On Application Startup

When you start Headlamp with an active PR build, you'll see a confirmation dialog:

- **Continue with PR build**: Keep using the development build
- **Use default build**: Automatically clear the PR build and switch to the default

## How It Works

1. **Fetching PRs**: The app queries the GitHub API for open PRs with successful workflow runs
2. **Artifact Filtering**: Only PRs with platform-specific artifacts (DMG for macOS, AppImage for Linux, EXE for Windows) are shown
3. **Activation**: When you activate a PR build, the app stores the PR information in your local config
4. **Startup Check**: On each startup, if a PR build is active, you're prompted to confirm continued use
5. **Resource Loading**: The app loads resources from the PR build instead of the default installation

## Limitations

### Current Implementation

- **nightly.link Integration**: Artifacts are downloaded using nightly.link, which provides direct download links without requiring GitHub authentication
- **Automatic Download**: The app can now automatically download PR build artifacts
- **No Automatic Updates**: PR builds are not automatically updated when new commits are pushed

### Platform Support

- macOS: DMG files
- Linux: AppImage files  
- Windows: EXE installers

## Troubleshooting

### Feature Not Visible

- The feature is enabled by default. Set `HEADLAMP_ENABLE_APP_DEV_BUILDS=false` to disable it
- Check that you're using the desktop application (not the web version)
- Restart the app after changing the environment variable

### No PRs Listed

- PRs must have successful workflow runs with app artifacts
- Artifacts expire after a certain period (typically 90 days)
- Only platform-specific artifacts are shown (DMG on macOS, etc.)
- Network issues may prevent fetching PR list

### Cannot Activate PR Build

- Ensure you have write permissions to the app's config directory
- Check available disk space for downloading artifacts
- Review the console for error messages

## For Developers

### Testing Your Own PRs

1. Open a pull request with your changes
2. Wait for the GitHub Actions workflow to complete successfully
3. Enable the PR builds feature in your local Headlamp installation
4. Your PR should appear in the list if artifacts were built
5. Activate your PR build to test it

### API Reference

The PR builds feature exposes the following APIs to the renderer process:

```typescript
window.desktopApi.prBuilds = {
  // List all available PR builds
  listPRBuilds(): Promise<PRBuildsListResponse>;
  
  // Get current PR build status
  getPRBuildStatus(): Promise<PRBuildStatusResponse>;
  
  // Activate a specific PR build
  activatePRBuild(prInfo: PRInfo): Promise<Response>;
  
  // Clear the active PR build
  clearPRBuild(): Promise<Response>;
  
  // Check if feature is enabled
  getEnabled(): Promise<EnabledResponse>;
};
```

### File Locations

- **Config file**: `~/Library/Application Support/Headlamp/headlamp-config.json` (macOS)
- **PR builds cache**: `/tmp/headlamp-pr-builds/`
- **Main code**: `app/electron/pr-builds.ts`
- **UI component**: `frontend/src/components/App/Settings/PRBuildsSettings.tsx`

## Future Enhancements

Planned improvements for this feature:

- Automatic artifact download with GitHub authentication
- Resource path override for loading PR builds
- Cached PR builds for offline use
- Automatic update notifications for active PR builds
- Rollback mechanism in case of issues

## Related Documentation

- [Development Guide](../development/index.md)
- [App Development](../development/app.md)
- [Contributing Guidelines](../contributing.md)
