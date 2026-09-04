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

const VALID_TOOL = /^[a-z0-9][a-z0-9._-]*$/i;
const MAX_GRANTS = 64;
const MAX_TOOL_LENGTH = 128;
const MAX_ARGUMENTS = 16;
const MAX_ARGUMENT_LENGTH = 256;

/** Executable resolved only through the sanitized system search path. */
export interface SystemRunCommandExecutable {
  /** Trusted origin used to resolve the executable. */
  source: 'system';
}

/** Executable intentionally supplied by the plugin bundle. */
export interface PluginRunCommandExecutable {
  /** Trusted origin used to resolve the executable. */
  source: 'plugin';
  /** Fixed platform-independent path relative to the verified plugin bundle. */
  path: string;
}

/** Explicit executable origin attached to a normalized command grant. */
export type RunCommandExecutable = SystemRunCommandExecutable | PluginRunCommandExecutable;

/**
 * A product-owned grant for one executable and argument sequence.
 *
 * @example Allow `examplectl project list` with optional trailing arguments.
 * ```ts
 * const grant: RunCommandGrant = {
 *   tool: 'examplectl',
 *   args: ['project', 'list'],
 *   allowTrailingArgs: true,
 * };
 * ```
 */
export interface RunCommandGrant {
  /** Canonical executable identifier. */
  tool: string;
  /** Executable provenance. Omitted grants resolve only on the system PATH. */
  executable?: RunCommandExecutable;
  /** Exact argument sequence or prefix permitted by the grant. */
  args: string[];
  /** Whether arguments may follow the exact declared prefix. */
  allowTrailingArgs?: boolean;
}

/**
 * Parses command grants from untrusted product manifest data.
 *
 * @param value - Candidate `commands` grant array from a top-level `runCommands` policy entry.
 * @returns A validated, normalized copy of the grants.
 * @throws When any grant is malformed, duplicated, or too broad.
 */
export function parseRunCommandGrants(value: unknown): RunCommandGrant[] {
  if (!Array.isArray(value) || value.length > MAX_GRANTS) {
    throw new Error(`runCommands must be an array with at most ${MAX_GRANTS} grants`);
  }

  const grants: RunCommandGrant[] = [];
  const seen = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new Error(`Invalid runCommands[${index}]`);
    }

    const record = candidate as Record<string, unknown>;
    if (Object.keys(record).some(key => !['tool', 'args', 'allowTrailingArgs'].includes(key))) {
      throw new Error(`Unknown field in runCommands[${index}]`);
    }
    if (
      typeof record.tool !== 'string' ||
      record.tool.length > MAX_TOOL_LENGTH ||
      !VALID_TOOL.test(record.tool)
    ) {
      throw new Error(`Invalid tool in runCommands[${index}]`);
    }
    if (
      !Array.isArray(record.args) ||
      record.args.length === 0 ||
      record.args.length > MAX_ARGUMENTS ||
      record.args.some(
        argument =>
          typeof argument !== 'string' ||
          argument.trim() === '' ||
          argument.length > MAX_ARGUMENT_LENGTH ||
          argument.includes('\0')
      )
    ) {
      throw new Error(`Invalid args in runCommands[${index}]`);
    }
    if (record.allowTrailingArgs !== undefined && typeof record.allowTrailingArgs !== 'boolean') {
      throw new Error(`Invalid allowTrailingArgs in runCommands[${index}]`);
    }

    const grant: RunCommandGrant = {
      tool: record.tool,
      args: [...record.args],
      ...(record.allowTrailingArgs === true && { allowTrailingArgs: true }),
    };
    const key = JSON.stringify(grant);
    if (seen.has(key)) {
      throw new Error(`Duplicate runCommands[${index}]`);
    }
    seen.add(key);
    grants.push(grant);
  }
  return grants;
}

/**
 * Checks a request against one exact command grant.
 *
 * @param grant - Validated product grant.
 * @param tool - Canonical requested executable identifier.
 * @param args - Requested arguments.
 * @returns Whether the request is covered by the grant.
 */
export function matchesRunCommandGrant(
  grant: RunCommandGrant,
  tool: string,
  args: string[]
): boolean {
  if (grant.tool !== tool || args.length < grant.args.length) {
    return false;
  }
  for (let index = 0; index < grant.args.length; index += 1) {
    if (grant.args[index] !== args[index]) {
      return false;
    }
  }
  return grant.allowTrailingArgs === true || args.length === grant.args.length;
}

/**
 * Checks a request against all command grants for one plugin.
 *
 * @param grants - Validated product grants.
 * @param tool - Canonical requested executable identifier.
 * @param args - Requested arguments.
 * @returns Whether any grant covers the request.
 */
export function isRunCommandAllowed(
  grants: RunCommandGrant[],
  tool: string,
  args: string[]
): boolean {
  for (const grant of grants) {
    if (matchesRunCommandGrant(grant, tool, args)) {
      return true;
    }
  }
  return false;
}
