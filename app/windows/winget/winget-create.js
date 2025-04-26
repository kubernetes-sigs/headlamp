/**
 * Usage:
 *
 * 1. Ensure that Node.js and npm are installed on your system.
 * 2. Run this script using the command `node winget-create.js <projectVersion> <directoryPath>`.
 *
 * Parameters:
 * - projectVersion: The version of the project you want to fetch information for (e.g., 0.19.1).
 * - directoryPath: The path to the directory where the generated YAML files should be stored (e.g., app/windows/winget/manifests).
 *
 * Ensure that you replace `<projectVersion>` with the actual project version, do not include the 'v'.
 *
 * Note:
 * - The templates directory should contain the necessary YAML templates and should be located in the same directory as this script.
 * - The manifests directory will be created if it does not exist, and it will contain the generated YAML files.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (!(args.length === 2)) {
  console.error('Usage: node winget-create.js <projectVersion> <directoryPath>');
  process.exit(1);
}

const projectVersion = args[0];
const directoryPath = args[1];

if (projectVersion.startsWith('v')) {
  console.error('Please provide the project version without the "v" prefix.');
  console.error('Example: node winget-create.js 0.19.1 my/path/to/folder');
  process.exit(1);
}

async function createYAMLFiles(version, downloadURL, date, notesURL, checksum) {
  const templates = [
    'Headlamp.Headlamp.installer.yaml',
    'Headlamp.Headlamp.locale.en-US.yaml',
    'Headlamp.Headlamp.yaml',
  ];

  const templateDir = path.join(__dirname, 'templates/');
  const manifestDir = path.join(directoryPath, version);

  try {
    // create manifest version directory if it doesnt exist
    if (!fs.existsSync(manifestDir)) {
      fs.mkdirSync(manifestDir, { recursive: true });
      console.log(`Created directory ${manifestDir}`);
    }
  } catch (err) {
    console.error(`Error creating directory ${manifestDir}: ${err}`);
    process.exit(1);
  }

  templates.forEach(template => {
    const manifestPath = path.join(manifestDir, template);
    const templatePath = path.join(templateDir, template);
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    const newContent = templateContent
      .replaceAll('__PACKAGE_VERSION__', version)
      .replaceAll('__DISPLAY_VERSION__', version)
      .replaceAll('__INSTALLER_SHA256__', checksum)
      .replaceAll('__INSTALLER_URL__', downloadURL)
      .replaceAll('__RELEASE_DATE__', date)
      .replaceAll('__RELEASE_NOTES_URL__', notesURL);

    fs.writeFileSync(manifestPath, newContent);
    console.log(
      `Created winget manifest file ${template} for version ${version} in ${manifestDir}`
    );
  });
}

// Async function to fetch release information from GitHub API for a given tag
async function fetchGithubReleaseInfo() {
  const tag = projectVersion;
  const res = await fetch(
    `https://api.github.com/repos/headlamp-k8s/headlamp/releases/tags/v${tag}`
  );

  if (!res.ok) {
    console.error(
      `Error fetching release information for tag ${tag}: ${res.status} ${res.statusText}`
    );
    process.exit(1);
  }

  const resJSON = await res.json();

  await updateReleaseInfo(resJSON, tag);
}

async function getChecksums(checksumsUrl, fileName) {
  const res = await fetch(checksumsUrl);
  const checksums = await res.text();

  for (const line of checksums.split('\n')) {
    const [checksum, filename] = line.split('  ');

    if (!filename) {
      continue;
    }

    if (filename === fileName) {
      return checksum;
    }
  }

  return '';
}

async function updateReleaseInfo(response, tag) {
  const assets = response.assets;
  const checksums = assets.find(v => v.name === 'checksums.txt');
  const checksumsUrl = checksums.browser_download_url;
  // asset for windows x64, can add more assets for other archs
  const winx64Asset = assets.find(asset => asset.name === `Headlamp-${tag}-win-x64.exe`);
  const browserDownloadName = winx64Asset.name;
  const browserDownloadUrlInfo = winx64Asset.browser_download_url;
  const checksum = await getChecksums(checksumsUrl, browserDownloadName);
  const dateYYYYMMDDLength = 10;
  const releaseDateInfo = response.published_at.slice(0, dateYYYYMMDDLength);
  const releaseNotesUrlInfo = `https://github.com/kubernetes-sigs/headlamp/releases/tag/v${tag}`;
  const versionInfo = response.name;

  await createYAMLFiles(
    versionInfo,
    browserDownloadUrlInfo,
    releaseDateInfo,
    releaseNotesUrlInfo,
    checksum
  );
}

fetchGithubReleaseInfo();
