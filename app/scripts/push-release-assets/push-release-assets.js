// @ts-check

/**
 * This script is used to push assets to a release.
 * It can be used to push a single asset or more, and by default it will also push a checksums.txt file.
 * It can also be used to just push checksums.txt updated with the given files' checksums.
 *
 * Author: Joaquim Rocha <joaquim.rocha@microsoft.com>
 */
import crypto from 'crypto';
import fs from 'fs';
import { Octokit } from 'octokit';
import mime from 'mime-types';
import path from 'path';
import process from 'process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const owner = 'headlamp-k8s';
const repo = 'headlamp';
const client = new Octokit({ auth: process.env.GITHUB_TOKEN });

const args = yargs(hideBin(process.argv))
  .command('$0 <release-name> <asset1> [asset2...]', '', yargs => {
    yargs
      .option('force', {
        describe: 'Pushes even if the release is no longer a draft',
        type: 'boolean',
        alias: 'f',
      })
      .option('skip-checksums', {
        describe: 'Skips updating the checksums.txt file',
        type: 'boolean',
      })
      .option('only-checksums', {
        describe: 'Pushes only the checksums.txt file based on the given assets',
        type: 'boolean',
      })
      .positional('asset1', {
        describe:
          'Path to the kube config file (uses the default kube config location if not specified)',
        type: 'string',
      });
  })
  .help().argv;

async function getRelease(releaseName) {
  const releases = await client.request('GET /repos/{owner}/{repo}/releases', {
    owner,
    repo,
  });
  return releases.data.find(r => r.name === releaseName) || null;
}

async function getChecksums(release) {
  if (!release) {
    console.error(`Release not found`);
    process.exit(1);
  }

  const checksums = release.assets?.find(a => a.name === 'checksums.txt');
  if (!!checksums) {
    let checksumContents = await client.request(
      'GET /repos/{owner}/{repo}/releases/assets/{asset_id}',
      {
        owner,
        repo,
        asset_id: checksums.id,
        headers: {
          // NOTE: because application/octet-stream is given it downloads the file.
          accept: 'application/octet-stream',
        },
      }
    );

    var decoder = new TextDecoder('utf-8');

    const currentChecksums = {};
    const checksumsData = decoder.decode(checksumContents.data);
    checksumsData.split('\n').forEach(line => {
      const [hash, fileName] = line.split('  ');
      if (!!hash && !!fileName) {
        currentChecksums[fileName] = hash;
      }
    });

    return [currentChecksums, checksums];
  } else {
    console.log('No checksums.txt uploaded yet.');
    return [{}, null];
  }
}

async function deleteFileAsset(release, fileName) {
  if (!release) {
    console.error(`Release not found`);
    process.exit(1);
  }

  const fileAsset = release.assets?.find(a => a.name === fileName);
  if (!!fileAsset) {
    try {
      await client.request('DELETE /repos/{owner}/{repo}/releases/assets/{asset_id}', {
        owner,
        repo,
        asset_id: fileAsset.id,
      });
    } catch (e) {
      console.error(`Error deleting asset ${fileName}: ${e}`);
      return false;
    }
  }

  return true;
}

function createChecksumsContents(checksums) {
  let contents = '';
  Object.keys(checksums)
    .sort()
    .forEach(fileName => {
      contents += `${checksums[fileName]}  ${fileName}\n`;
    });

  return contents;
}

/**
 * @param {string} extension - the extension to look up.
 * @returns the mimetype of the given extension
 * @rtype string
 */
function getMimeType(extension) {
  const res = mime.lookup(extension);
  if (typeof res !== 'string') {
    return 'application/octet-stream';
  }
  return res;
}

async function pushFiles(release, files) {
  let hashes = {};

  const skipUploading = args.onlyChecksums;
  if (!skipUploading) {
    console.log(`Pushing files to release ${release.name}...`);
  }

  for (const filePath of files) {
    let data;
    try {
      data = fs.readFileSync(filePath);
    } catch (e) {
      console.error(`Error reading file ${filePath}: ${e}`);
      continue;
    }

    const baseFileName = path.basename(filePath);
    const hash = crypto.createHash('sha256').update(data);

    if (!!hashes[baseFileName]) {
      console.log(`A file named ${baseFileName} (from ${filePath}) has already been processed`);
      console.log(`Skipping ${filePath}`);
      continue;
    }

    hashes[baseFileName] = hash.digest('hex');

    // Skip uploading if we're only pushing checksums (we're only here for the hash)
    if (skipUploading) {
      continue;
    }

    try {
      await deleteFileAsset(release, baseFileName);
    } catch (e) {
      console.error(`Error deleting current asset ${baseFileName}: ${e}`);
    }

    const headers = {
      'Content-Type': getMimeType(filePath.split('.').pop()),
    };

    console.log(`Uploading ${baseFileName}, type: ${headers['Content-Type']}...`);

    try {
      await client.rest.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: release.id,
        name: baseFileName,
        data,
        headers,
      });
    } catch (e) {
      console.error(
        `Error uploading asset ${baseFileName}: ${e}; skipping adding it to the checksums.txt`
      );
      continue;
    }

    console.log(`... done`);
  }

  let [currentChecksums, checksums] = await getChecksums(release);
  Object.entries(hashes).forEach(([fileName, hash]) => {
    currentChecksums[fileName] = hash;
  });

  // Skip checksums.txt if we were given this file to push or if asked not to push it.
  const skipChecksums = !!hashes['checksums.txt'] || args.skipChecksums;
  if (skipChecksums) {
    return;
  }

  if (!!checksums) {
    console.log(`Updating checksums.txt file...`);

    await client.request('DELETE /repos/{owner}/{repo}/releases/assets/{asset_id}', {
      owner,
      repo,
      asset_id: checksums.id,
    });
  } else {
    console.log(`Pushing first checksums.txt file...`);
  }

  const checksumsContents = createChecksumsContents(currentChecksums);
  try {
    await client.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: release.id,
      name: 'checksums.txt',
      data: checksumsContents,
    });
  } catch (e) {
    console.error(`Error uploading checksums.txt: ${e}`);
  }
}

async function main() {
  let login;

  if (!process.env.GITHUB_TOKEN) {
    console.error(
      'GITHUB_TOKEN not set! Make sure you have set a GITHUB_TOKEN environment variable with to a personal access token.'
    );
    process.exit(1);
  }

  if (args.skipChecksums && args.onlyChecksums) {
    console.error('Cannot skip checksums and only upload checksums at the same time!');
    process.exit(1);
  }

  try {
    const { data } = await client.rest.users.getAuthenticated();
    login = data.login;
  } catch (e) {
    console.error(`Error authenticating: ${e}`);
    process.exit(1);
  }

  console.log(`Logged in as ${login}`);

  const release = await getRelease(args.releaseName);

  if (!release) {
    if (args.releaseName.startsWith('v')) {
      console.error(
        `Release ${args.releaseName} not found. Did you mean ${args.releaseName.substring(1)}?`
      );
    } else {
      console.error(`Release ${args.releaseName} not found`);
    }
    process.exit(1);
  }

  if (!release.draft && !args.force) {
    console.error(`Release ${release.name} is not a draft. To push to it, use the --force.`);
    process.exit(1);
  }

  await pushFiles(release, [args.asset1].concat(args.asset2));
  console.log('Files pushed successfully.');
}

main();
