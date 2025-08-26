import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import * as semver from 'semver';

const OWNER = 'kubernetes-sigs';
const REPO = 'headlamp';

// Constants
const MAX_PAGES_TO_CHECK = 5;
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Fetch with timeout handling
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

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

  // First try to find by tag name (v{version})
  const tagName = `v${version}`;
  let release = releases.find(rel => rel.tag_name === tagName);

  // If not found by tag, try to find by name
  if (!release) {
    release = releases.find(rel => rel.name === version);
  }

  return release || null;
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

/**
 * Check if container image exists for the version
 */
export async function checkContainerImage(version: string): Promise<boolean> {
  const octokit = getOctokit();

  try {
    // Alternative approach: try to fetch package info and look for version in metadata
    try {
      const { data: packageInfo } = await octokit.rest.packages.getPackageForOrganization({
        package_type: 'container',
        package_name: 'headlamp',
        org: 'headlamp-k8s'
      });

      // If we can get package info, try to list all versions with pagination
      let page = 1;
      const perPage = 100;
      let foundVersion = false;

      while (page <= MAX_PAGES_TO_CHECK && !foundVersion) { // Limit to MAX_PAGES_TO_CHECK pages to avoid infinite loops
        try {
          const { data: versions } = await octokit.rest.packages.getAllPackageVersionsForPackageOwnedByOrg({
            package_type: 'container',
            package_name: 'headlamp',
            org: 'headlamp-k8s',
            page: page,
            per_page: perPage,
            state: 'active'
          });

          console.log(chalk.blue(`   Checking page ${page}: found ${versions.length} package versions`));

          for (const pkg of versions) {
            const tags = pkg.metadata?.container?.tags || [];
            if (tags.includes(`v${version}`) || tags.includes(version)) {
              console.log(chalk.blue(`   Found matching package with tags: ${tags.join(', ')}`));
              return true;
            }
          }

          if (versions.length < perPage) {
            // Last page
            break;
          }
          page++;
        } catch (pageError: any) {
          console.log(chalk.yellow(`   Note: Error fetching page ${page}: ${pageError?.message || pageError}`));
          break;
        }
      }
    } catch (packageError: any) {
      console.log(chalk.yellow(`   Note: Unable to fetch package info: ${packageError?.message || packageError}`));
    }

    // Final fallback: try a different API endpoint to get specific version
    try {
      // Try to list all versions without pagination limits
      const { data: allVersions } = await octokit.rest.packages.getAllPackageVersionsForPackageOwnedByOrg({
        package_type: 'container',
        package_name: 'headlamp',
        org: 'headlamp-k8s',
        per_page: 100
      });

      console.log(chalk.blue(`   Total package versions found: ${allVersions.length}`));

      // Look more thoroughly through all versions
      for (const pkg of allVersions) {
        const tags = pkg.metadata?.container?.tags || [];
        const name = pkg.name || '';

        if (tags.includes(`v${version}`) || tags.includes(version) || name.includes(version)) {
          console.log(chalk.blue(`   Found package: name="${name}", tags=[${tags.join(', ')}]`));
          return true;
        }
      }
    } catch (fallbackError: any) {
      console.log(chalk.yellow(`   Note: Fallback search failed: ${fallbackError?.message || fallbackError}`));
    }

    // Manual check suggestion
    console.log(chalk.yellow(`   Note: Container package v${version} not found via API - check manually at:`));
    console.log(chalk.yellow(`   https://github.com/orgs/headlamp-k8s/packages/container/headlamp`));

    return false;
  } catch (error: any) {
    console.log(chalk.yellow(`   Note: Unable to verify container image: ${error?.message || error}`));
    return false;
  }
}

/**
 * Check if Homebrew formula has been updated for the version
 */
export async function checkHomebrewFormula(version: string): Promise<boolean> {
  const octokit = getOctokit();

  try {
    // Get the actual formula file content
    const { data: formulaFile } = await octokit.repos.getContent({
      owner: 'Homebrew',
      repo: 'homebrew-cask',
      path: 'Casks/h/headlamp.rb'
    });

    if ('content' in formulaFile) {
      const content = Buffer.from(formulaFile.content, 'base64').toString();

      // Extract version from the formula file
      // Look for patterns like: version "0.30.0" or url ending with v0.30.0.tar.gz
      const versionMatch = content.match(/version\s+["']([^"']+)["']/);
      const urlVersionMatch = content.match(/\/v([0-9]+\.[0-9]+\.[0-9]+(?:-[^\/]+)?)\.tar\.gz/);

      let formulaVersion = null;
      if (versionMatch) {
        formulaVersion = versionMatch[1];
      } else if (urlVersionMatch) {
        formulaVersion = urlVersionMatch[1];
      }

      if (formulaVersion) {
        // Clean versions (remove 'v' prefix if present)
        const cleanTargetVersion = version.replace(/^v/, '');
        const cleanFormulaVersion = formulaVersion.replace(/^v/, '');

        // Check if formula version is greater than or equal to target version
        if (semver.eq(cleanFormulaVersion, cleanTargetVersion)) {
          console.log(chalk.blue(`   Homebrew formula version: ${cleanFormulaVersion}`));
          return true;
        } else if (semver.gt(cleanFormulaVersion, cleanTargetVersion)) {
          console.log(chalk.blue(`   Homebrew formula version: ${cleanFormulaVersion} (newer than ${cleanTargetVersion})`));
          return true;
        } else {
          console.log(chalk.yellow(`   Homebrew formula version: ${cleanFormulaVersion} (older than ${cleanTargetVersion})`));
          return false;
        }
      } else {
        console.log(chalk.yellow(`   Unable to parse version from Homebrew formula`));
        return false;
      }
    }

    return false;
  } catch (error) {
    console.log(chalk.yellow(`   Note: Unable to verify Homebrew formula (repository may not be accessible)`));
    return false;
  }
}

/**
 * Check if Winget package has been updated for the version
 */
export async function checkWingetPackage(version: string): Promise<boolean> {
  try {
    // Use the public GitHub API without authentication to check winget-pkgs
    // This approach uses raw HTTP requests instead of the authenticated Octokit client
    const packagePath = 'manifests/h/Headlamp/Headlamp';
    const manifestPath = `${packagePath}/${version}`;

    // Try to fetch the directory contents using the public GitHub API
    const url = `https://api.github.com/repos/microsoft/winget-pkgs/contents/${manifestPath}`;

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'headlamp-releaser'
        }
      });

      if (response.ok) {
        const contents = await response.json();
        if (Array.isArray(contents) && contents.length > 0) {
          // Found version directory, check for manifest files
          const hasYamlFiles = contents.some((file: any) =>
            file.name.endsWith('.yaml') || file.name.endsWith('.yml')
          );
          if (hasYamlFiles) {
            console.log(chalk.blue(`   Winget manifest directory found with ${contents.length} files`));
            return true;
          }
        }
      } else if (response.status === 404) {
        // Directory doesn't exist, which is expected for versions not in winget
        console.log(chalk.blue(`   Winget manifest directory not found (404)`));
      } else {
        console.log(chalk.yellow(`   Winget check returned status: ${response.status}`));
      }
    } catch (fetchError: any) {
      console.log(chalk.yellow(`   Note: Unable to fetch winget manifest: ${fetchError?.message || fetchError}`));
    }

    return false;
  } catch (error: any) {
    console.log(chalk.yellow(`   Note: Unable to verify Winget package: ${error?.message || error}`));
    return false;
  }
}

/**
 * Check if Chocolatey package has been updated for the version
 */
export async function checkChocolateyPackage(version: string): Promise<boolean> {
  try {
    // Use the Chocolatey OData API to check for package versions
    const packageName = 'headlamp';
    const targetVersion = version.replace(/^v/, ''); // Remove 'v' prefix if present
    const url = `https://community.chocolatey.org/api/v2/Packages()?$filter=Id eq '${packageName}'`;

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'headlamp-releaser'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.d && data.d.results && Array.isArray(data.d.results)) {
          const packages = data.d.results;
          console.log(chalk.blue(`   Found ${packages.length} Chocolatey package versions`));

          // Look for our specific version
          const matchingPackage = packages.find((pkg: any) =>
            pkg.Version === targetVersion || pkg.NormalizedVersion === targetVersion
          );

          if (matchingPackage) {
            console.log(chalk.blue(`   Chocolatey package version found: ${matchingPackage.Version}`));
            return true;
          }

          // Show available versions for debugging (first 5)
          const availableVersions = packages
            .map((pkg: any) => pkg.Version)
            .slice(0, 5);

          if (availableVersions.length > 0) {
            console.log(chalk.blue(`   Available Chocolatey versions: ${availableVersions.join(', ')}${packages.length > 5 ? '...' : ''}`));
          }

          return false;
        }
      } else if (response.status === 404) {
        console.log(chalk.blue(`   Chocolatey package not found (404)`));
      } else {
        console.log(chalk.yellow(`   Chocolatey check returned status: ${response.status}`));
      }
    } catch (fetchError: any) {
      console.log(chalk.yellow(`   Note: Unable to fetch Chocolatey package info: ${fetchError?.message || fetchError}`));
    }

    return false;
  } catch (error: any) {
    console.log(chalk.yellow(`   Note: Unable to verify Chocolatey package: ${error?.message || error}`));
    return false;
  }
}

/**
 * Check if Flatpak package has been updated for the version
 */
export async function checkFlatpakPackage(version: string): Promise<boolean> {
  try {
    // Check the Flathub repository for Headlamp package
    const targetVersion = version.replace(/^v/, ''); // Remove 'v' prefix if present
    const url = 'https://api.github.com/repos/flathub/io.kinvolk.Headlamp/contents/headlamp-source.json';

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'headlamp-releaser'
        }
      });

      if (response.ok) {
        const fileInfo = await response.json();
        if (fileInfo.content) {
          // Decode base64 content
          const content = Buffer.from(fileInfo.content, 'base64').toString();
          const sourceConfig = JSON.parse(content);

          if (Array.isArray(sourceConfig)) {
            // Look for version in the download URLs
            for (const source of sourceConfig) {
              if (source.url && typeof source.url === 'string') {
                // Extract version from URL like: /download/v0.33.0/Headlamp-0.33.0-linux-x64.tar.gz
                const versionMatch = source.url.match(/\/download\/v([0-9]+\.[0-9]+\.[0-9]+(?:-[^\/]+)?)\/Headlamp-\1-/);
                if (versionMatch) {
                  const packageVersion = versionMatch[1];
                  console.log(chalk.blue(`   Flatpak package version: ${packageVersion}`));

                  // Check if this matches our target version
                  if (packageVersion === targetVersion) {
                    return true;
                  }

                  // Also check with semantic versioning for comparison
                  try {
                    if (semver.gte(packageVersion, targetVersion)) {
                      if (semver.gt(packageVersion, targetVersion)) {
                        console.log(chalk.blue(`   Flatpak has newer version: ${packageVersion} (target: ${targetVersion})`));
                      }
                      return true;
                    }
                  } catch (semverError) {
                    // If semver comparison fails, continue with other sources
                  }
                }
              }
            }
          }

          console.log(chalk.yellow(`   Flatpak version ${targetVersion} not found in source configuration`));
        }
      } else if (response.status === 404) {
        console.log(chalk.blue(`   Flatpak source configuration not found (404)`));
      } else {
        console.log(chalk.yellow(`   Flatpak check returned status: ${response.status}`));
      }
    } catch (fetchError: any) {
      console.log(chalk.yellow(`   Note: Unable to fetch Flatpak source configuration: ${fetchError?.message || fetchError}`));
    }

    return false;
  } catch (error: any) {
    console.log(chalk.yellow(`   Note: Unable to verify Flatpak package: ${error?.message || error}`));
    return false;
  }
}

/**
 * Check if Helm chart has been updated for the version
 */
export async function checkHelmChart(version: string): Promise<boolean> {
  try {
    // Check the Helm chart in the main repository
    const targetVersion = version.replace(/^v/, ''); // Remove 'v' prefix if present
    const url = 'https://raw.githubusercontent.com/kubernetes-sigs/headlamp/main/charts/headlamp/Chart.yaml';

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'headlamp-releaser'
        }
      });

      if (response.ok) {
        const chartContent = await response.text();

        // Extract appVersion and version from Chart.yaml
        const appVersionMatch = chartContent.match(/^appVersion:\s*(.+)$/m);
        const chartVersionMatch = chartContent.match(/^version:\s*(.+)$/m);

        if (appVersionMatch) {
          const appVersion = appVersionMatch[1].trim().replace(/['"]/g, ''); // Remove quotes
          console.log(chalk.blue(`   Helm chart appVersion: ${appVersion}`));

          // Check if appVersion matches our target version
          if (appVersion === targetVersion) {
            if (chartVersionMatch) {
              const chartVersion = chartVersionMatch[1].trim().replace(/['"]/g, '');
              console.log(chalk.blue(`   Helm chart version: ${chartVersion}`));
            }
            return true;
          }

          // Also check with semantic versioning for comparison
          try {
            if (semver.gte(appVersion, targetVersion)) {
              if (semver.gt(appVersion, targetVersion)) {
                console.log(chalk.blue(`   Helm chart has newer appVersion: ${appVersion} (target: ${targetVersion})`));
              }
              if (chartVersionMatch) {
                const chartVersion = chartVersionMatch[1].trim().replace(/['"]/g, '');
                console.log(chalk.blue(`   Helm chart version: ${chartVersion}`));
              }
              return true;
            } else {
              console.log(chalk.yellow(`   Helm chart appVersion ${appVersion} is older than target ${targetVersion}`));
              return false;
            }
          } catch (semverError) {
            // If semver comparison fails, do exact string match
            return appVersion === targetVersion;
          }
        } else {
          console.log(chalk.yellow(`   Unable to parse appVersion from Helm Chart.yaml`));
          return false;
        }
      } else if (response.status === 404) {
        console.log(chalk.blue(`   Helm Chart.yaml not found (404)`));
      } else {
        console.log(chalk.yellow(`   Helm chart check returned status: ${response.status}`));
      }
    } catch (fetchError: any) {
      console.log(chalk.yellow(`   Note: Unable to fetch Helm Chart.yaml: ${fetchError?.message || fetchError}`));
    }

    return false;
  } catch (error: any) {
    console.log(chalk.yellow(`   Note: Unable to verify Helm chart: ${error?.message || error}`));
    return false;
  }
}

/**
 * Check if minikube addon has been updated for the version
 */
export async function checkMinikubeAddon(version: string): Promise<boolean> {
  try {
    // Check the minikube addons.go file for Headlamp addon image version
    const targetVersion = version.replace(/^v/, ''); // Remove 'v' prefix if present
    const url = 'https://raw.githubusercontent.com/kubernetes/minikube/master/pkg/minikube/assets/addons.go';

    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': 'headlamp-releaser'
        }
      });

      if (response.ok) {
        const content = await response.text();

        // Look for the headlamp addon definition and extract the image version
        // Pattern: "headlamp-k8s/headlamp:v0.28.0@sha256:..."
        const headlampAddonMatch = content.match(/"headlamp-k8s\/headlamp:v([0-9]+\.[0-9]+\.[0-9]+(?:-[^"@]+)?)(?:@[^"]+)?"/);

        if (headlampAddonMatch) {
          const addonVersion = headlampAddonMatch[1];
          console.log(chalk.blue(`   Minikube addon version: ${addonVersion}`));

          // Check if addon version matches our target version
          if (addonVersion === targetVersion) {
            return true;
          }

          // Also check with semantic versioning for comparison
          try {
            if (semver.gte(addonVersion, targetVersion)) {
              if (semver.gt(addonVersion, targetVersion)) {
                console.log(chalk.blue(`   Minikube addon has newer version: ${addonVersion} (target: ${targetVersion})`));
              }
              return true;
            } else {
              console.log(chalk.yellow(`   Minikube addon version ${addonVersion} is older than target ${targetVersion}`));
              return false;
            }
          } catch (semverError) {
            // If semver comparison fails, do exact string match
            return addonVersion === targetVersion;
          }
        } else {
          console.log(chalk.yellow(`   Unable to parse version from minikube addons.go`));
          return false;
        }
      } else if (response.status === 404) {
        console.log(chalk.blue(`   Minikube addons.go not found (404)`));
      } else {
        console.log(chalk.yellow(`   Minikube addon check returned status: ${response.status}`));
      }
    } catch (fetchError: any) {
      console.log(chalk.yellow(`   Note: Unable to fetch minikube addons.go: ${fetchError?.message || fetchError}`));
    }

    return false;
  } catch (error: any) {
    console.log(chalk.yellow(`   Note: Unable to verify minikube addon: ${error?.message || error}`));
    return false;
  }
}

/**
 * Check if Docker extension is available on DockerHub
 */
export async function checkDockerExtension(version: string): Promise<boolean> {
  try {
    const targetVersion = version.replace(/^v/, '');

    // DockerHub API endpoint for headlamp/headlamp-docker-extension
    const response = await fetchWithTimeout('https://hub.docker.com/v2/repositories/headlamp/headlamp-docker-extension/tags/?page_size=100');

    if (response.ok) {
      const data = await response.json();
      console.log(chalk.blue(`   Found ${data.results?.length || 0} Docker extension tags`));

      if (data.results && Array.isArray(data.results)) {
        // Look for tags that exactly match our version
        const versionTags = [`v${targetVersion}`, targetVersion];
        const matchingTag = data.results.find((tag: any) =>
          versionTags.includes(tag.name)
        );

        if (matchingTag) {
          console.log(chalk.blue(`   Docker extension tag found: ${matchingTag.name}`));
          return true;
        } else {
          // Check if latest tag exists, but don't assume it's the right version
          const latestTag = data.results.find((tag: any) => tag.name === 'latest');
          if (latestTag) {
            console.log(chalk.blue(`   Docker extension has 'latest' tag but no specific v${targetVersion} tag`));
          } else {
            console.log(chalk.blue(`   No Docker extension tags found for v${targetVersion}`));
          }
          return false;
        }
      }
    } else {
      console.log(chalk.yellow(`   Docker extension check returned status: ${response.status}`));
    }

    return false;
  } catch (error: any) {
    console.log(chalk.yellow(`   Note: Unable to verify Docker extension: ${error?.message || error}`));
    return false;
  }
}

interface ExtendedAssetResult {
  available: boolean;
  displayName: string;
  version?: string;
  isNewer?: boolean;
}

interface ExtendedAssetsStatus {
  containerImage: ExtendedAssetResult;
  homebrew: ExtendedAssetResult;
  winget: ExtendedAssetResult;
  chocolatey: ExtendedAssetResult;
  flatpak: ExtendedAssetResult;
  helm: ExtendedAssetResult;
  minikube: ExtendedAssetResult;
  dockerExtension: ExtendedAssetResult;
}

// Asset configuration
const EXTENDED_ASSETS = [
  { key: 'containerImage', name: 'Container image', description: 'GitHub Container Registry (ghcr.io)', checkFn: checkContainerImage, isCore: true },
  { key: 'homebrew', name: 'Homebrew formula', description: 'Homebrew/homebrew-cask', checkFn: checkHomebrewFormula, isCore: true },
  { key: 'winget', name: 'Winget package', description: 'microsoft/winget-pkgs', checkFn: checkWingetPackage, isCore: true },
  { key: 'chocolatey', name: 'Chocolatey package', description: 'community.chocolatey.org', checkFn: checkChocolateyPackage, isCore: true },
  { key: 'flatpak', name: 'Flatpak package', description: 'flathub/io.kinvolk.Headlamp', checkFn: checkFlatpakPackage, isCore: true },
  { key: 'dockerExtension', name: 'Docker extension', description: 'headlamp/headlamp-docker-extension', checkFn: checkDockerExtension, isCore: true },
  { key: 'helm', name: 'Helm chart', description: 'kubernetes-sigs/headlamp/charts/headlamp', checkFn: checkHelmChart, isCore: false },
  { key: 'minikube', name: 'Minikube addon', description: 'kubernetes/minikube/pkg/minikube/assets', checkFn: checkMinikubeAddon, isCore: false },
] as const;

/**
 * Check extended assets that are published after a release
 */
export async function checkExtendedAssets(version: string): Promise<ExtendedAssetsStatus> {
  console.log(chalk.blue('\nChecking extended release assets...'));

  // Display what we're checking
  EXTENDED_ASSETS.forEach(asset => {
    console.log(chalk.blue(`   ${asset.name}: ${asset.description}`));
  });

  const results = {} as ExtendedAssetsStatus;

  // Check all assets in parallel
  const checks = EXTENDED_ASSETS.map(async (asset) => {
    const available = await asset.checkFn(version);
    results[asset.key as keyof ExtendedAssetsStatus] = {
      available,
      displayName: asset.name
    };
  });

  await Promise.all(checks);

  // Special handling for Homebrew version comparison
  if (results.homebrew.available) {
    try {
      const homebrewVersion = await getHomebrewVersion();
      if (homebrewVersion) {
        const cleanTargetVersion = version.replace(/^v/, '');
        const cleanFormulaVersion = homebrewVersion.replace(/^v/, '');

        results.homebrew.version = homebrewVersion;
        results.homebrew.isNewer = semver.gt(cleanFormulaVersion, cleanTargetVersion);
      }
    } catch (error) {
      // Ignore errors in version comparison
    }
  }

  // Display results
  displayExtendedAssetsResults(results, version);

  return results;
}

/**
 * Get the current Homebrew formula version
 */
async function getHomebrewVersion(): Promise<string | undefined> {
  try {
    const octokit = getOctokit();
    const { data: formulaFile } = await octokit.repos.getContent({
      owner: 'Homebrew',
      repo: 'homebrew-cask',
      path: 'Casks/h/headlamp.rb'
    });

    if ('content' in formulaFile) {
      const content = Buffer.from(formulaFile.content, 'base64').toString();
      const versionMatch = content.match(/version\s+["']([^"']+)["']/);
      const urlVersionMatch = content.match(/\/v([0-9]+\.[0-9]+\.[0-9]+(?:-[^\/]+)?)\.tar\.gz/);

      return versionMatch?.[1] || urlVersionMatch?.[1];
    }
  } catch (error) {
    // Ignore errors
  }
  return undefined;
}

/**
 * Display extended assets results in a clean format
 */
function displayExtendedAssetsResults(results: ExtendedAssetsStatus, version: string): void {
  Object.entries(results).forEach(([key, result]) => {
    if (result.available) {
      if (key === 'homebrew' && result.isNewer) {
        console.log(chalk.green(`↗️  ${result.displayName} updated for v${version} (v${result.version} available)`));
      } else {
        console.log(chalk.green(`✅ ${result.displayName} found for v${version}`));
      }
    } else {
      console.log(chalk.yellow(`⚠️  ${result.displayName} not found for v${version}`));
    }
  });
}