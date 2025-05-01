const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');

const envFile = path.join(os.tmpdir(), 'tmpEnv');

test('Create & verify', () => {
  const execFile = path.resolve(path.join(__dirname, '..', 'make-env.js'));
  execFileSync('node', [execFile, envFile]);

  const envContents = readFileSync(envFile).toString();

  const lines = envContents.split(/\r?\n/);
  const envObj = {};

  lines.forEach(line => {
    // Skip empty lines
    if (!line) {
      return;
    }

    const [key, val] = line.trim().split('=');

    expect(key.trim()).toBeDefined();
    expect(val.trim()).toBeDefined();

    envObj[key] = val;
  });

  const keys = Object.keys(envObj);
  expect(keys).toContain('REACT_APP_HEADLAMP_VERSION');
  expect(keys).toContain('REACT_APP_HEADLAMP_GIT_VERSION');
  expect(keys).toContain('REACT_APP_HEADLAMP_PRODUCT_NAME');
});
