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
