#!/bin/env node

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

const USAGE = `
This tests unpublished @headlamp-k8s/pluginctl package in repo.

./test-pluginctl.js

Assumes being run within the plugins/pluginctl folder
`;
const PACKAGE_NAME = "appcatalog_headlamp_plugin";
const PACKAGE_URL =
  "https://artifacthub.io/packages/headlamp/test-123/appcatalog_headlamp_plugin";
const PACKAGE_NAME_TO_UNINSTALL = "app-catalog";

function testPluginctl() {
  // remove some temporary files.
  cleanup();

  // Install dependencies
  run("npm", ["install"]);

  // Use "link" to test the repo version of the pluginctl tool.
  run("npm", ["link"]);
  curDir = process.cwd();
  pluginsDir = curDir + "/.plugins";
  // test install command
  run("node", [
    "bin/pluginctl.js",
    "install",
    PACKAGE_URL,
    "--folderName",
    pluginsDir,
  ]);
  checkFileExists(pluginsDir + "/" + PACKAGE_NAME + "/package.json");
  checkFileExists(pluginsDir + "/" + PACKAGE_NAME + "/main.js");

  // test list command
  run("node", ["bin/pluginctl.js", "list"]);

  // test uninstall command
  run("node", [
    "bin/pluginctl.js",
    "uninstall",
    PACKAGE_NAME_TO_UNINSTALL,
    "--folderName",
    pluginsDir,
  ]);
  checkFileExists(pluginsDir + "/" + PACKAGE_NAME + "/package.json", false);
}

const fs = require("fs");
const child_process = require("child_process");
const path = require("path");
const resolve = path.resolve;
let curDir;
let pluginsDir;
function checkFileExists(fname, shouldExist = true) {
  if (shouldExist && !fs.existsSync(fname)) {
    exit(`Error: ${fname} does not exist.`);
  } else if (!shouldExist && fs.existsSync(fname)) {
    exit(`Error: ${fname} should not exist.`);
  }
}
function exit(message) {
  console.error(message);
  cleanup();
  process.exit(1);
}
function cleanup() {
  console.log(`Cleaning up. Removing temp files...`);

  const foldersToRemove = [path.join(".plugins", PACKAGE_NAME), PACKAGE_NAME];
  console.log("Temp foldersToRemove", foldersToRemove);
  foldersToRemove
    .filter((folder) => fs.existsSync(folder))
    .forEach((folder) => fs.rmSync(folder, { recursive: true }));
}

function run(cmd, args) {
  console.log("");
  console.log(
    `Running cmd:${cmd} with args:${args.join(
      " "
    )} inside of cwd:${curDir} abs: "${resolve(curDir)}"`
  );
  console.log("");
  try {
    child_process.execFileSync(cmd, args, {
      stdio: "inherit",
      cwd: curDir,
      encoding: "utf8",
    });
  } catch (e) {
    exit(
      `Error: Problem running "${cmd} ${args.join(
        " "
      )}" inside of "${curDir}" abs: "${resolve(curDir)}"`
    );
  }
}

(function () {
  if (process.argv[1].includes("test-pluginctl")) {
    console.log(USAGE);
    curDir = ".";

    process.on("beforeExit", cleanup);
    testPluginctl();
  }
})();
