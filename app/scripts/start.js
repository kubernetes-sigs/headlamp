/**
 * This script is used to start the backend, frontend and app in parallel.
 * So ctrl+c will terminate all of them.
 *
 * Assumes being run from within the app/ folder
 */
const { spawn } = require('child_process');
const { statSync, existsSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');
const { spawnSync } = require('child_process');

/**
 * @returns true if the backend/ might need rebuilding.
 *
 * `make backend` takes significantly longer each time we do a git switch
 * to a different branch. This avoids it if the branch does not modify the backend.
 *
 * So `cd app; npm start` runs quicker when developing many branches.
 * But, the backend is still rebuilt if it needs to be.
 */
function shouldMakeBackend() {
  const backendDir = join(process.cwd(), '..', 'backend');

  if (!existsSync(join(backendDir, 'headlamp-server'))) {
    return true;
  }

  // This covers both "uncommitted vs HEAD" and "committed vs main".
  const gitDiffStatus = spawnSync('git', ['diff', '--quiet', 'main', '--', backendDir], {
    stdio: 'ignore',
  }).status;

  const lastCommitDateMs =
    Number(
      execSync(`git log -1 --format=%ct ${backendDir}`, {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
    ) * 1000;

  if (Number.isNaN(lastCommitDateMs)) throw new Error('Failed to parse last commit date');

  const headlampServerStat = statSync(join(backendDir, 'headlamp-server'));
  const isHeadlampServerOlderThanLastCommit = headlampServerStat.mtimeMs < lastCommitDateMs;
  const shouldBuildBackend = gitDiffStatus || isHeadlampServerOlderThanLastCommit;

  // Log the decision process, to help debugging in the next months
  console.log(`Should we make the backend: ${shouldBuildBackend ? 'yes' : 'no'}`, {
    shouldBuildBackend,
    backendDir,
    gitDiffStatus,
    lastCommitDateMs,
    isHeadlampServerOlderThanLastCommit,
  });
  return shouldBuildBackend;
}

const serverProcess = spawn(
  `cd ../ && make ${shouldMakeBackend() ? 'backend' : ''} run-backend`,
  [],
  {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      HEADLAMP_CHECK_FOR_UPDATES: 'false',
    },
  }
);

let frontendCmd =
  'cd ../frontend/ && ../app/node_modules/.bin/cross-env BROWSER=none FORCE_COLOR=true npm';

frontendCmd += process.argv[2] === '--star' ? ' run star' : ' start';

if (process.platform !== 'win32') {
  // to prevent clearing the screen
  frontendCmd += ' | cat';
} else {
  frontendCmd = frontendCmd.replace(/\//g, '\\');
}
const frontendProcess = spawn(frontendCmd, [], {
  stdio: 'inherit',
  shell: true,
});

let appProcess = null;

// Wait a little bit so the frontend server starts listening.
setTimeout(() => {
  appProcess = spawn('npm run dev-only-app', [], {
    stdio: 'inherit',
    shell: true,
  });
}, 1000);

// Handle Ctrl+C (SIGINT) to terminate both processes
process.on('SIGINT', () => {
  console.log('Ctrl+C pressed. Terminating the background process...');
  serverProcess.kill('SIGINT');
  frontendProcess.kill('SIGINT');
  if (appProcess) {
    appProcess.kill('SIGINT');
  }
  process.exit(0);
});
