const { sign, SIGN_OPS } = require('../scripts/esrp');

exports.default = async function (configuration) {
  const esrpTool = process.env.ESRP_PATH;
  if (!esrpTool) {
    // Ignore if the signing tool is not available.
    return;
  }

  // We exclude the uninstaller as, due to a bug, it doesn't actually exist.
  // See https://github.com/electron-userland/electron-builder/issues/7071 .
  if (configuration.path.endsWith('__uninstaller-nsis-headlamp.exe')) {
    return;
  }

  console.log('Signing', configuration.path);
  try {
    sign(esrpTool, SIGN_OPS.WINDOWS_SIGN, configuration.path);
  } catch (e) {
    console.log('Failed to sign: ', e);
    process.exit(1);
  }
};
