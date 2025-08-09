/**
 * This script is used to start the backend, frontend and app in parallel.
 * So ctrl+c will terminate all of them.
 *
 * Assumes being run from within the app/ folder
 */
const { spawn } = require('child_process');

const serverProcess = spawn('cd ../ && make backend && make run-backend', [], {
  stdio: 'inherit',
  shell: true,
});

let frontendCmd =
  'cd ../frontend/ && ../app/node_modules/.bin/cross-env BROWSER=none FORCE_COLOR=true npm start';
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
