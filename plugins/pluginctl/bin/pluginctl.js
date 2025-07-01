#!/usr/bin/env node

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

// @ts-check
"use strict";

const crypto = require("crypto");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const yargs = require("yargs/yargs");
const PluginManager = require("../src/plugin-management").PluginManager;
const { table } = require("table");
const tar = require("tar");
const MultiPluginManager = require("../src/multi-plugin-management");

/**
 * extract copies folders of packages in the form:
 *   packageName/dist/main.js to packageName/main.js
 *   packageName/package.json to packageName/package.json
 *
 * @param {string} pluginPackagesPath - can be a package or a folder of packages.
 * @param {string} outputPlugins - folder where the plugins are placed.
 * @param {boolean} logSteps - whether to print the steps of the extraction (true by default).
 * @returns {0 | 1} Exit code, where 0 is success, 1 is failure.
 */
function extract(pluginPackagesPath, outputPlugins, logSteps = true) {
  if (!fs.existsSync(pluginPackagesPath)) {
    console.error(`"${pluginPackagesPath}" does not exist. Not extracting.`);
    return 1;
  }
  if (!fs.existsSync(outputPlugins)) {
    if (logSteps) {
      console.log(`"${outputPlugins}" did not exist, making folder.`);
    }
    fs.mkdirSync(outputPlugins);
  }

  /**
   * pluginPackagesPath is a package folder, not a folder of packages.
   */
  function extractPackage() {
    if (fs.existsSync(path.join(pluginPackagesPath, "dist", "main.js"))) {
      const distPath = path.join(pluginPackagesPath, "dist");
      const trimmedPath =
        pluginPackagesPath.slice(-1) === path.sep
          ? pluginPackagesPath.slice(0, -1)
          : pluginPackagesPath;
      const folderName = trimmedPath.split(path.sep).splice(-1)[0];
      const plugName = path.join(outputPlugins, folderName);

      fs.ensureDirSync(plugName);

      const files = fs.readdirSync(distPath);
      files.forEach((file) => {
        const srcFile = path.join(distPath, file);
        const destFile = path.join(plugName, file);
        console.log(`Copying "${srcFile}" to "${destFile}".`);
        fs.copyFileSync(srcFile, destFile);
      });

      const inputPackageJson = path.join(pluginPackagesPath, "package.json");
      const outputPackageJson = path.join(plugName, "package.json");
      console.log(`Copying "${inputPackageJson}" to "${outputPackageJson}".`);
      fs.copyFileSync(inputPackageJson, outputPackageJson);

      return true;
    }
    return false;
  }

  function extractFolderOfPackages() {
    const folders = fs
      .readdirSync(pluginPackagesPath, { withFileTypes: true })
      .filter((fileName) => {
        return (
          fileName.isDirectory() &&
          fs.existsSync(
            path.join(pluginPackagesPath, fileName.name, "dist", "main.js")
          )
        );
      });

    folders.forEach((folder) => {
      const distPath = path.join(pluginPackagesPath, folder.name, "dist");
      const plugName = path.join(outputPlugins, folder.name);

      fs.ensureDirSync(plugName);

      const files = fs.readdirSync(distPath);
      files.forEach((file) => {
        const srcFile = path.join(distPath, file);
        const destFile = path.join(plugName, file);
        console.log(`Copying "${srcFile}" to "${destFile}".`);
        fs.copyFileSync(srcFile, destFile);
      });

      const inputPackageJson = path.join(
        pluginPackagesPath,
        folder.name,
        "package.json"
      );
      const outputPackageJson = path.join(plugName, "package.json");
      console.log(`Copying "${inputPackageJson}" to "${outputPackageJson}".`);
      fs.copyFileSync(inputPackageJson, outputPackageJson);
    });
    return folders.length !== 0;
  }

  if (!(extractPackage() || extractFolderOfPackages())) {
    console.error(
      `"${pluginPackagesPath}" does not contain packages. Not extracting.`
    );
    return 1;
  }

  return 0;
}

/**
 * Calculate the checksum of a file.
 *
 * @param {*} filePath
 * @returns
 */
async function calculateChecksum(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash("sha256");
    hashSum.update(fileBuffer);
    const hex = hashSum.digest("hex");
    return hex;
  } catch (error) {
    console.error("Error calculating checksum:", error);
    throw error; // Rethrow the error if you want to handle it further up the call stack
  }
}

/**
 * Copy extra files specified in package.json to the dist folder
 *
 * @param {string} [packagePath='.'] - Path to the package root containing package.json
 * @returns {Promise<void>}
 */
async function copyExtraDistFiles(packagePath = ".") {
  try {
    const packageJsonPath = path.join(packagePath, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return; // No package.json, nothing to do
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    if (!packageJson.headlamp || !packageJson.headlamp.extraDist) {
      return; // No extra files to copy
    }

    const extraDist = packageJson.headlamp.extraDist;
    const distFolder = path.resolve(packagePath, "dist");

    // Create dist folder if it doesn't exist (although it should by this point)
    if (!fs.existsSync(distFolder)) {
      fs.mkdirSync(distFolder, { recursive: true });
    }

    // Process all entries in extraDist
    for (const [target, source] of Object.entries(extraDist)) {
      const targetPath = path.join(distFolder, target);
      const sourcePath = path.resolve(packagePath, source);

      // Skip if source doesn't exist
      if (!fs.existsSync(sourcePath)) {
        console.warn(
          `Warning: extraDist source "${sourcePath}" does not exist, skipping.`
        );
        continue;
      }

      // Create target directory if needed
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      // Copy based on whether it's a directory or file
      const sourceStats = fs.statSync(sourcePath);
      if (sourceStats.isDirectory()) {
        console.log(
          `Copying extra directory "${sourcePath}" to "${targetPath}"`
        );
        fs.copySync(sourcePath, targetPath);
      } else {
        console.log(`Copying extra file "${sourcePath}" to "${targetPath}"`);
        fs.copyFileSync(sourcePath, targetPath);
      }
    }

    console.log("Successfully copied extra dist files");
  } catch (error) {
    console.error("Error copying extra dist files:", error);
  }
}

/**
 * Creates a tarball of the plugin package. The tarball is placed in the outputFolderPath.
 * It moves files from:
 *   packageName/dist/main.js to packageName/main.js
 *   packageName/package.json to packageName/package.json
 * And then creates a tarball of the resulting folder.
 *
 * @param {string} pluginDir - path to the plugin package.
 * @param {string} outputDir - folder where the tarball is placed.
 *
 * @returns {Promise<0 | 1>} Exit code, where 0 is success, 1 is failure.
 */
async function createArchive(pluginDir, outputDir) {
  const pluginPath = path.resolve(pluginDir);
  if (!fs.existsSync(pluginPath)) {
    console.error(
      `Error: "${pluginPath}" does not exist. Not creating archive.`
    );
    return 1;
  }

  // Extract name + version from plugin's package.json
  const packageJsonPath = path.join(pluginPath, "package.json");
  let packageJson = "";
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (e) {
    console.error(
      `Error: Failed to read package.json from "${pluginPath}". Not creating archive.`
    );
    return 1;
  }

  const sanitizedName = packageJson.name.replace(/@/g, "").replace(/\//g, "-");
  const tarballName = `${sanitizedName}-${packageJson.version}.tar.gz`;

  const outputFolderPath = path.resolve(outputDir);
  const tarballPath = path.join(outputFolderPath, tarballName);

  if (!fs.existsSync(outputFolderPath)) {
    console.log(`"${outputFolderPath}" did not exist, making folder.`);
    fs.mkdirSync(outputFolderPath, { recursive: true });
  } else if (fs.existsSync(tarballPath)) {
    console.error(
      `Error: Tarball "${tarballPath}" already exists. Not creating archive.`
    );
    return 1;
  }

  // Create temporary folder
  const tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), "pluginctl-"));

  // Make sure any extraDist files are in the dist folder before extraction
  await copyExtraDistFiles(pluginPath);

  if (extract(pluginPath, tempFolder, false) !== 0) {
    console.error(
      `Error: Failed to extract plugin package to "${tempFolder}". Not creating archive.`
    );
    return 1;
  }

  const folderName = path.basename(pluginPath);

  // Create tarball
  await tar.c(
    {
      gzip: true,
      file: tarballPath,
      cwd: tempFolder,
    },
    [folderName]
  );

  // Remove temporary folder
  fs.rmSync(tempFolder, { recursive: true });

  console.log(`Created tarball: "${tarballPath}".`);

  // Print sha256 checksum for convenience
  const checksum = await calculateChecksum(tarballPath);
  console.log(`Tarball checksum (sha256): ${checksum}`);

  return 0;
}

// const pluginctlBin = fs.realpathSync(process.argv[1]);
// console.log('pluginctlBin path:', pluginctlBin);

yargs(process.argv.slice(2))
  .command(
    "extract <pluginPackages> <outputPlugins>",
    "Copies folders of packages from pluginPackages/packageName/dist/main.js " +
      "to outputPlugins/packageName/main.js.",
    (yargs) => {
      yargs.positional("pluginPackages", {
        describe:
          "A folder of plugin packages that have been built with dist/main.js in them." +
          "Can also be a single package folder.",
        type: "string",
      });
      yargs.positional("outputPlugins", {
        describe:
          'A plugins folder (eg. ".plugins") to extract plugins to. ' +
          "The output is a series of packageName/main.js. " +
          "Creates this folder if it does not exist.",
        type: "string",
      });
    },
    (argv) => {
      // @ts-ignore
      process.exitCode = extract(argv.pluginPackages, argv.outputPlugins);
    }
  )
  .command(
    "package [pluginPath] [outputDir]",
    "Creates a tarball of the plugin package in the format Headlamp expects.",
    (yargs) => {
      yargs.positional("pluginPath", {
        describe:
          "A folder of a plugin package that have been built with dist/main.js in it." +
          " Defaults to current working directory.",
        type: "string",
      });
      yargs.positional("outputDir", {
        describe:
          "The destination folder in which to create the archive." +
          "Creates this folder if it does not exist.",
        type: "string",
      });
    },
    async (argv) => {
      let pluginPath = argv.pluginPath;
      if (!pluginPath) {
        pluginPath = process.cwd();
      }

      let outputDir = argv.outputDir;
      if (!outputDir) {
        outputDir = process.cwd();
      }

      process.exitCode = await createArchive(pluginPath, outputDir);
    }
  )
  .command(
    "install [URL]",
    "Install plugin(s) from a configuration file or a plugin artifact Hub URL",
    (yargs) => {
      return yargs
        .positional("URL", {
          describe: "URL of the plugin to install",
          type: "string",
        })
        .option("config", {
          alias: "c",
          describe: "Path to plugin configuration file",
          type: "string",
        })
        .option("folderName", {
          describe: "Name of the folder to install the plugin into",
          type: "string",
        })
        .option("headlampVersion", {
          describe: "Version of headlamp to install the plugin into",
          type: "string",
        })
        .option("quiet", {
          alias: "q",
          describe: "Do not print logs",
          type: "boolean",
        })
        .option("watch", {
          alias: "w",
          describe:
            "Watch config file for changes and automatically reinstall plugins",
          type: "boolean",
        })
        .check((argv) => {
          if (!argv.URL && !argv.config) {
            throw new Error("Either URL or --config must be specified");
          }
          if (argv.URL && argv.config) {
            throw new Error("Cannot specify both URL and --config");
          }
          if (argv.watch && !argv.config) {
            throw new Error("Watch option can only be used with --config");
          }
          return true;
        });
    },
    async (argv) => {
      const { URL, config, folderName, headlampVersion, quiet, watch } = argv;
      try {
        const progressCallback = quiet
          ? () => {}
          : (data) => {
              const { type = "info", message, raise = true } = data;
              if (config && !URL) {
                // bulk installation
                let prefix = "";
                if (data.current || data.total || data.plugin) {
                  prefix = `${data.current} of ${data.total} (${data.plugin}): `;
                }
                if (type === "info" || type === "success") {
                  console.log(`${prefix}${type}: ${message}`);
                } else if (type === "error" && raise) {
                  throw new Error(message);
                } else {
                  console.error(`${prefix}${type}: ${message}`);
                }
              } else {
                if (type === "error" || type === "success") {
                  console.error(`${type}: ${message}`);
                }
              }
            };

        /**
         * @param {string} configPath
         */
        async function installFromConfig(configPath) {
          const installer = new MultiPluginManager(
            folderName,
            headlampVersion,
            progressCallback
          );
          const result = await installer.installFromConfig(configPath);
          if (result.failed > 0) {
            throw new Error(`${result.failed} plugins failed to install`);
          }
        }

        if (URL) {
          // Single plugin installation
          try {
            await PluginManager.install(
              URL,
              folderName,
              headlampVersion,
              progressCallback
            );
          } catch (e) {
            console.error(e.message);
            process.exit(1); // Exit with error status
          }
        } else if (config) {
          // Bulk installation from config
          try {
            await installFromConfig(config);
          } catch (error) {
            console.error("Installation failed", {
              error: error.message,
              stack: error.stack,
            });
          }

          if (watch) {
            console.log(`Watching ${config} for changes...`);
            fs.watch(config, async (eventType) => {
              if (eventType === "change") {
                console.log(`Config file changed, reinstalling plugins...`);
                try {
                  await installFromConfig(config);
                  console.log("Plugins reinstalled successfully");
                } catch (error) {
                  console.error("Installation failed", {
                    error: error.message,
                    stack: error.stack,
                  });
                }
              }
            });

            // Keep the process running
            process.stdin.resume();

            // Handle graceful shutdown
            process.on("SIGINT", () => {
              console.log("\nStopping config file watch");
              process.exit(0);
            });
          }
        }
      } catch (error) {
        console.error("Installation failed", {
          error: error.message,
          stack: error.stack,
        });
        process.exit(1);
      }
    }
  )
  .command(
    "update <pluginName>",
    "Update a plugin to the latest version",
    (yargs) => {
      yargs
        .positional("pluginName", {
          describe: "Name of the plugin to update",
          type: "string",
        })
        .positional("folderName", {
          describe: "Name of the folder that contains the plugin",
          type: "string",
        })
        .positional("headlampVersion", {
          describe: "Version of headlamp to update the plugin into",
          type: "string",
        })
        .option("quiet", {
          alias: "q",
          describe: "Do not print logs",
          type: "boolean",
        });
    },
    async (argv) => {
      const { pluginName, folderName, headlampVersion, quiet } = argv;
      const progressCallback = quiet
        ? null
        : (data) => {
            if (data.type === "error" || data.type === "success") {
              console.error(data.type, ":", data.message);
            }
          }; // Use console.log for logs if not in quiet mode
      try {
        await PluginManager.update(
          pluginName,
          folderName,
          headlampVersion,
          progressCallback
        );
      } catch (e) {
        console.error(e.message);
        process.exit(1); // Exit with error status
      }
    }
  )
  .command(
    "uninstall <pluginName>",
    "Uninstall a plugin",
    (yargs) => {
      yargs
        .positional("pluginName", {
          describe: "Name of the plugin to uninstall",
          type: "string",
        })
        .option("folderName", {
          describe: "Name of the folder that contains the plugin",
          type: "string",
        })
        .option("quiet", {
          alias: "q",
          describe: "Do not print logs",
          type: "boolean",
        });
    },
    async (argv) => {
      const { pluginName, folderName, quiet } = argv;
      const progressCallback = quiet
        ? null
        : (data) => {
            if (data.type === "error" || data.type === "success") {
              console.error(data.type, ":", data.message);
            }
          }; // Use console.log for logs if not in quiet mode
      try {
        await PluginManager.uninstall(pluginName, folderName, progressCallback);
      } catch (e) {
        console.error(e.message);
        process.exit(1); // Exit with error status
      }
    }
  )
  .command(
    "list",
    "List installed plugins",
    (yargs) => {
      yargs
        .option("folderName", {
          describe: "Name of the folder that contains the plugins",
          type: "string",
        })
        .option("json", {
          alias: "j",
          describe: "Output in JSON format",
          type: "boolean",
        });
    },
    async (argv) => {
      const { folderName, json } = argv;
      const progressCallback = (data) => {
        if (json) {
          console.log(JSON.stringify(data.data));
        } else {
          // display table
          const rows = [["Name", "Version", "Folder Name", "Repo", "Author"]];
          data.data.forEach((plugin) => {
            rows.push([
              plugin.pluginName,
              plugin.pluginVersion,
              plugin.folderName,
              plugin.repoName,
              plugin.author,
            ]);
          });
          console.log(table(rows));
        }
      };
      try {
        await PluginManager.list(folderName, progressCallback);
      } catch (e) {
        console.error(e.message);
        process.exit(1); // Exit with error status
      }
    }
  )
  .demandCommand(1, "")
  .strict()
  .help().argv;
