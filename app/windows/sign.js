/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
