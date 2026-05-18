require('dotenv').config();
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function codeSign(config) {
  const teamID = process.env.APPLE_TEAM_ID;

  if (!teamID) {
    console.log('Mac codesign: No Apple Team ID found, skipping codesign');
    return;
  }

  const entitlementsPath = path.resolve(path.join(__dirname, '..', 'entitlements.mac.plist'));

  let exitCode = 0;
  try {
    execFileSync(
      'codesign',
      ['-s', teamID, '--deep', '--force', '--options', 'runtime', '--entitlements', entitlementsPath, config.app]
    );
  } catch (e) {
    exitCode = e.status !== null ? e.status : 1;
  }

  console.log('Mac codesign:', exitCode === 0 ? 'Success' : `Failed (${exitCode})`);
};
