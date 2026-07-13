const { execSync } = require('child_process');

/**
 * fails if the current kubectl context is not kwok-kwok
 */
function assertContextKwok() {
  const result = execSync('kubectl config current-context', {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdoutData = result.toString();
  if (stdoutData.trim() !== 'kwok-kwok') {
    console.error('Error: current context is not kwok-kwok');
    process.exit(1);
  }
}

exports.assertContextKwok = assertContextKwok;
