import { Octokit } from '@octokit/rest';
import chalk from 'chalk';

const OWNER = 'kubernetes-sigs';
const REPO = 'headlamp';

// Interfaces for GitHub API responses
interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  state: string;
  content_type: string;
}

interface GitHubRelease {
  id: number;
  name: string | null;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string | null;
  assets: ReleaseAsset[];
}

export function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(chalk.red('Error: GITHUB_TOKEN environment variable is not set'));
    console.error('Please set the GITHUB_TOKEN environment variable with a GitHub personal access token');
    process.exit(1);
  }

  return new Octokit({
    auth: token
  });
}

export async function getRelease(version: string): Promise<GitHubRelease | null> {
  const octokit = getOctokit();
  const { data: releases } = await octokit.repos.listReleases({
    owner: OWNER,
    repo: REPO
  });

  const draft = releases.find(release => release.name === version);
  return draft || null;
}

export async function checkArtifactsForRelease(releaseDraft: GitHubRelease): Promise<boolean> {
  // Check if we have artifacts for all platforms
  const releaseVersion = releaseDraft.tag_name?.replace('v', '') || releaseDraft.name;
  if (!releaseVersion) {
    console.error(chalk.red('Error: Release draft does not have a version'));
    return false;
  }

  const requiredAssets = [
    `Headlamp-${releaseVersion}-mac-x64.dmg`,
    `Headlamp-${releaseVersion}-mac-arm64.dmg`,
    `Headlamp-${releaseVersion}-linux-arm64.AppImage`,
    `Headlamp-${releaseVersion}-linux-armv7l.AppImage`,
    `Headlamp-${releaseVersion}-linux-x64.AppImage`,
    `Headlamp-${releaseVersion}-linux-arm64.tar.gz`,
    `Headlamp-${releaseVersion}-linux-armv7l.tar.gz`,
    `Headlamp-${releaseVersion}-linux-x64.tar.gz`,
    `Headlamp-${releaseVersion}-win-x64.exe`,
    `headlamp_${releaseVersion}-1_amd64.deb`,
    `checksums.txt`
  ];

  const assets = releaseDraft.assets || [];
  const foundAssets: Record<string, boolean> = {};
  requiredAssets.forEach(asset => {
    foundAssets[asset] = false;
  });
  const unknownAssets: string[] = [];

  assets.forEach((asset: ReleaseAsset) => {
    if (foundAssets.hasOwnProperty(asset.name)) {
      foundAssets[asset.name] = true;
    } else {
      unknownAssets.push(asset.name);
    }
  });

  let allFound = true;
  Object.entries(foundAssets).forEach(([assetName, found]) => {
    if (found) {
      console.log(chalk.green(`✅ Found asset: ${assetName}`));
    } else {
      console.error(chalk.red(`❌ Missing asset: ${assetName}`));
      allFound = false;
    }
  });

  if (unknownAssets.length > 0) {
    console.log(chalk.yellow('Unknown assets:'));
    unknownAssets.forEach(asset => {
      console.log(`  - ${asset}`);
    });
  }

  return allFound;
}

export async function publishDraftRelease(releaseId: number): Promise<void> {
  const octokit = getOctokit();
  await octokit.repos.updateRelease({
    owner: OWNER,
    repo: REPO,
    release_id: releaseId,
    draft: false
  });
}

/**
 * Associates a tag with a release in GitHub.
 *
 * @param releaseId The ID of the release
 * @param version The version to associate (without 'v' prefix)
 */
export async function associateTagWithRelease(releaseId: number, version: string): Promise<void> {
  const octokit = getOctokit();
  const tagName = `v${version}`;

  try {
    await octokit.repos.updateRelease({
      owner: OWNER,
      repo: REPO,
      release_id: releaseId,
      tag_name: tagName
    });
  } catch (error) {
    console.error(chalk.red(`Error associating tag ${tagName} with release:`));
    console.error(error);
    throw error;
  }
}
