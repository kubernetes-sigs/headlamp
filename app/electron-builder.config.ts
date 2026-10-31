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

/**
 * Electron Builder configuration for Headlamp desktop packages.
 *
 * Most settings remain in `package.json`. This wrapper only replaces the
 * default build-manifest resource when `HEADLAMP_BUILD_MANIFEST` selects a
 * product-specific manifest. Electron Builder must still copy that selected
 * file as `app-build-manifest.json`, because the packaged app reads that fixed
 * runtime filename from its resources directory.
 */
import {
  type AfterPackContext,
  type BeforeBuildContext,
  type Configuration,
  DIR_TARGET,
} from 'electron-builder';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyBuildResources,
  applyBuildTargets,
  applyPlatformMetadata,
  applyProductMetadata,
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} from './scripts/build-manifest.ts';

type ExtraResource =
  | string
  | {
      from: string;
      to?: string;
      [key: string]: unknown;
    };

type ElectronBuilderConfiguration = {
  extraResources: ExtraResource[];
  [key: string]: unknown;
};

const require = createRequire(import.meta.url);
const packageJson = require('./package.json');
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestFile = resolveBuildManifestPath();
const manifest = loadBuildManifest(manifestFile);
const defaultManifest = path.resolve(DEFAULT_MANIFEST_FILE);
const packageBuild = packageJson.build as ElectronBuilderConfiguration;
const existingBeforeBuild = require('./scripts/build-backend.js').default as (
  context: BeforeBuildContext
) => Promise<boolean | void> | boolean | void;
const existingAfterPack = require('./scripts/after-pack.js').default as (
  context: AfterPackContext
) => Promise<void>;

interface BuildTimingDependencies {
  existingBeforeBuild: (context: BeforeBuildContext) => Promise<boolean | void> | boolean | void;
  existingAfterPack: (context: AfterPackContext) => Promise<void> | void;
  now?: () => number;
  log?: (message: string) => void;
}

/** Creates isolated Electron Builder timing hooks around the existing build hooks. */
export function createBuildTimingHooks({
  existingBeforeBuild,
  existingAfterPack,
  now = Date.now,
  log = console.log,
}: BuildTimingDependencies) {
  let assemblyStartedAt: number | undefined;
  const postPackStarts = new Map<string, number>();
  const artifactStarts = new Map<string, { name: string; startedAt: number }>();
  const postPackKey = (arch: unknown) => String(arch ?? 'default');
  const completePostPack = (arch: unknown) => {
    const key = postPackKey(arch);
    const startedAt = postPackStarts.get(key);
    if (startedAt === undefined) {
      return;
    }
    postPackStarts.delete(key);
    log(
      `[build-timing] Electron post-pack processing completed in ${(
        (now() - startedAt) /
        1000
      ).toFixed(3)}s`
    );
  };

  const beforeBuild = async (context: BeforeBuildContext) => {
    const result = await existingBeforeBuild(context);
    assemblyStartedAt = now();
    log(
      `[build-timing] Electron app assembly started at ${new Date(assemblyStartedAt).toISOString()}`
    );
    return result;
  };
  const afterPack = async (context: AfterPackContext) => {
    await existingAfterPack(context);
    if (assemblyStartedAt !== undefined) {
      log(
        `[build-timing] Electron app assembly completed in ${(
          (now() - assemblyStartedAt) /
          1000
        ).toFixed(3)}s`
      );
    }
    if (context.targets.length > 0 && context.targets.every(target => target.name === DIR_TARGET)) {
      return;
    }
    const postPackStartedAt = now();
    postPackStarts.set(postPackKey(context.arch), postPackStartedAt);
    log(
      `[build-timing] Electron post-pack processing started at ${new Date(
        postPackStartedAt
      ).toISOString()}`
    );
  };
  const afterSign = (context?: Pick<AfterPackContext, 'arch'>) => {
    completePostPack(context?.arch);
  };
  const artifactBuildStarted = (context: {
    targetPresentableName: string;
    file: string;
    arch: string | number | null;
  }) => {
    completePostPack(context.arch);
    const name = context.targetPresentableName || path.basename(context.file);
    const startedAt = now();
    artifactStarts.set(context.file, { name, startedAt });
    log(`[build-timing] Electron artifact ${name} started at ${new Date(startedAt).toISOString()}`);
  };
  const artifactBuildCompleted = (context: { file: string; target: { name: string } | null }) => {
    const timing = artifactStarts.get(context.file);
    if (!timing) {
      return;
    }
    artifactStarts.delete(context.file);
    log(
      `[build-timing] Electron artifact ${timing.name} completed in ${(
        (now() - timing.startedAt) /
        1000
      ).toFixed(3)}s`
    );
  };

  return { beforeBuild, afterPack, afterSign, artifactBuildStarted, artifactBuildCompleted };
}

const timingHooks = createBuildTimingHooks({ existingBeforeBuild, existingAfterPack });

const config: Configuration = applyBuildResources(
  applyBuildTargets(
    applyPlatformMetadata(
      applyProductMetadata(
        {
          ...packageBuild,
          ...timingHooks,
          extraResources: packageBuild.extraResources.map(resource => {
            // Preserve every resource except the default manifest entry.
            if (
              typeof resource === 'string' ||
              path.resolve(configDirectory, resource.from) !== defaultManifest
            ) {
              return resource;
            }
            return { ...resource, from: manifestFile, to: 'app-build-manifest.json' };
          }),
        },
        manifest
      ),
      manifest
    ),
    manifest
  ),
  manifest,
  manifestFile
);

export default config;
