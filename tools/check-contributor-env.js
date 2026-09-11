#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

function normalizeVersion(version) {
  return version
    .trim()
    .replace(/^v/i, '')
    .replace(/^go/i, '')
    .split('-')[0];
}

function toVersionParts(version) {
  return normalizeVersion(version)
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .concat([0, 0, 0])
    .slice(0, 3);
}

function isPrereleaseVersion(version) {
  const stripped = version.trim().replace(/^v/i, '').replace(/^go/i, '');

  return /-/.test(stripped) || /^\d+(?:\.\d+){0,2}[a-z]/i.test(stripped);
}

function compareVersions(left, right) {
  const leftParts = toVersionParts(left);
  const rightParts = toVersionParts(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }

    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }

  return 0;
}

function versionSatisfies(actual, requirement) {
  const trimmedRequirement = requirement.trim();

  if (isPrereleaseVersion(actual)) {
    return false;
  }

  if (trimmedRequirement.startsWith('>=')) {
    return compareVersions(actual, trimmedRequirement.slice(2).trim()) >= 0;
  }

  return compareVersions(actual, trimmedRequirement) === 0;
}

function parseGoMod(goModContent) {
  const normalizedContent = goModContent.replace(/\r\n?/g, '\n');
  const languageMatch = normalizedContent.match(/^go\s+(\d+(?:\.\d+){1,2})$/m);
  const toolchainMatch = normalizedContent.match(/^toolchain\s+go(\d+(?:\.\d+){1,2})$/m);

  if (!languageMatch) {
    throw new Error('Could not find the Go language version in backend/go.mod');
  }

  return {
    languageVersion: normalizeVersion(languageMatch[1]),
    toolchainVersion: toolchainMatch ? normalizeVersion(toolchainMatch[1]) : null,
  };
}

function getRepoRequirements(repoRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const goMod = fs.readFileSync(path.join(repoRoot, 'backend/go.mod'), 'utf8');
  const goRequirements = parseGoMod(goMod);

  return {
    nodeRange: packageJson.engines.node,
    npmRange: packageJson.engines.npm,
    goRange: `>=${goRequirements.toolchainVersion || goRequirements.languageVersion}`,
    goLanguageVersion: goRequirements.languageVersion,
    goToolchainVersion: goRequirements.toolchainVersion,
  };
}

function getCommandVersion(command, args, pattern, options = {}) {
  try {
    const output = execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: options.useShellOnWindows && process.platform === 'win32',
    });
    const match = output.match(pattern);

    if (!match) {
      return {
        ok: false,
        actual: null,
        message: `could not parse version from \`${command} ${args.join(' ')}\` output`,
      };
    }

    return {
      ok: true,
      actual: normalizeVersion(match[1]),
      message: null,
    };
  } catch (error) {
    return {
      ok: false,
      actual: null,
      message: error.code === 'ENOENT' ? `\`${command}\` is not installed` : error.message,
    };
  }
}

function buildDocChecks(requirements) {
  return [
    {
      label: 'AGENTS.md consulted Node.js version',
      file: 'AGENTS.md',
      pattern: /Root package with all npm scripts and Node\.js version \(([^)]+)\)/,
      expected: requirements.nodeRange,
    },
    {
      label: 'AGENTS.md consulted Go version',
      file: 'AGENTS.md',
      pattern: /`\/backend\/go\.mod` - Go version \(([^)]+)\)/,
      expected: requirements.goToolchainVersion || requirements.goLanguageVersion,
    },
    {
      label: 'AGENTS.md runtime Node.js version',
      file: 'AGENTS.md',
      pattern: /Node\.js ([^ ]+) \(specified in `\/package\.json` engines field\)/,
      expected: requirements.nodeRange,
    },
    {
      label: 'AGENTS.md runtime npm version',
      file: 'AGENTS.md',
      pattern: /npm ([^ ]+) \(specified in `\/package\.json` engines field\)/,
      expected: requirements.npmRange,
    },
    {
      label: 'AGENTS.md runtime Go version',
      file: 'AGENTS.md',
      pattern: /Go ([^ ]+) \(specified in `\/backend\/go\.mod`\)/,
      expected: requirements.goToolchainVersion || requirements.goLanguageVersion,
    },
    {
      label: 'AGENTS.md version info Node.js version',
      file: 'AGENTS.md',
      pattern: /Node\.js: ([^ ]+) \(from `\/package\.json`\)/,
      expected: requirements.nodeRange,
    },
    {
      label: 'AGENTS.md version info npm version',
      file: 'AGENTS.md',
      pattern: /npm: ([^ ]+) \(from `\/package\.json`\)/,
      expected: requirements.npmRange,
    },
    {
      label: 'AGENTS.md version info Go version',
      file: 'AGENTS.md',
      pattern: /Go: ([^ ]+) \(from `\/backend\/go\.mod`\)/,
      expected: requirements.goToolchainVersion || requirements.goLanguageVersion,
    },
    {
      label: 'CONTRIBUTING.md prerequisite Node.js version',
      file: 'CONTRIBUTING.md',
      pattern: /Node\.js \((>=\s*\d+(?:\.\d+){1,2}) with npm/,
      expected: requirements.nodeRange,
      normalize: value => value.replace(/\s+/g, ''),
    },
    {
      label: 'CONTRIBUTING.md prerequisite npm version',
      file: 'CONTRIBUTING.md',
      pattern: /npm (>=\s*\d+(?:\.\d+){1,2})\)/,
      expected: requirements.npmRange,
      normalize: value => value.replace(/\s+/g, ''),
    },
    {
      label: 'CONTRIBUTING.md prerequisite Go version',
      file: 'CONTRIBUTING.md',
      pattern: /Go \((>=\s*\d+(?:\.\d+){1,2})\) installed/,
      expected: requirements.goRange,
      normalize: value => value.replace(/\s+/g, ''),
    },
    {
      label: 'docs/development/index.md Node.js version',
      file: 'docs/development/index.md',
      pattern: /\[Node\.js\][^\n]*>=\s*(\d+(?:\.\d+){1,2})/,
      expected: requirements.nodeRange,
      actualPrefix: '>=',
    },
    {
      label: 'docs/development/index.md npm version',
      file: 'docs/development/index.md',
      pattern: /\[npm\][^\n]*\(>=\s*(\d+(?:\.\d+){1,2})\)/,
      expected: requirements.npmRange,
      actualPrefix: '>=',
    },
    {
      label: 'docs/development/index.md Go version',
      file: 'docs/development/index.md',
      pattern: /\[Go\][^\n]*>=\s*(\d+(?:\.\d+){1,2})/,
      expected: requirements.goRange,
      actualPrefix: '>=',
    },
  ];
}

function evaluateDocCheck(repoRoot, check) {
  const content = fs.readFileSync(path.join(repoRoot, check.file), 'utf8');
  const match = content.match(check.pattern);

  if (!match) {
    return {
      ok: false,
      label: check.label,
      file: check.file,
      actual: null,
      expected: check.expected,
      message: 'pattern not found',
    };
  }

  const rawActual = `${check.actualPrefix || ''}${match[1].trim()}`;
  const actual = check.normalize ? check.normalize(rawActual) : rawActual;
  const expected = check.normalize ? check.normalize(check.expected) : check.expected;

  return {
    ok: actual === expected,
    label: check.label,
    file: check.file,
    actual,
    expected,
    message: actual === expected ? null : `expected ${expected}, found ${actual}`,
  };
}

function printLocalToolChecks(requirements) {
  const checks = [
    {
      label: 'Node.js',
      expected: requirements.nodeRange,
      lookup: () => ({ok: true, actual: normalizeVersion(process.version), message: null}),
    },
    {
      label: 'npm',
      expected: requirements.npmRange,
      lookup: () =>
        getCommandVersion('npm', ['--version'], /([0-9]+(?:\.[0-9]+){1,2})/, {
          useShellOnWindows: true,
        }),
    },
    {
      label: 'Go',
      expected: requirements.goRange,
      lookup: () => getCommandVersion('go', ['version'], /go([0-9]+(?:\.[0-9]+){1,2})/),
    },
  ];

  const results = checks.map(check => {
    const lookup = check.lookup();

    if (!lookup.ok) {
      return {
        ok: false,
        label: check.label,
        message: lookup.message,
      };
    }

    const satisfies = versionSatisfies(lookup.actual, check.expected);

    return {
      ok: satisfies,
      label: check.label,
      message: satisfies
        ? `${lookup.actual} satisfies ${check.expected}`
        : `${lookup.actual} does not satisfy ${check.expected}`,
    };
  });

  console.log('Authoritative toolchain requirements:');
  console.log(`- Node.js: ${requirements.nodeRange}`);
  console.log(`- npm: ${requirements.npmRange}`);
  console.log(
    `- Go: ${requirements.goRange}` +
      (requirements.goToolchainVersion
        ? ` (toolchain ${requirements.goToolchainVersion}, language version ${requirements.goLanguageVersion})`
        : '')
  );
  console.log('');
  console.log('Local environment:');

  for (const result of results) {
    console.log(`- ${result.ok ? 'PASS' : 'FAIL'} ${result.label}: ${result.message}`);
  }

  return results;
}

function printDocChecks(repoRoot, requirements) {
  const results = buildDocChecks(requirements).map(check => evaluateDocCheck(repoRoot, check));

  console.log('');
  console.log('Contributor metadata drift:');

  for (const result of results) {
    if (result.ok) {
      console.log(`- PASS ${result.label}`);
      continue;
    }

    console.log(
      `- FAIL ${result.label}: ${result.message || 'mismatch'}${result.file ? ` (${result.file})` : ''}`
    );
  }

  return results;
}

function parseArguments(argv) {
  return {
    skipDocs: argv.includes('--skip-docs'),
    skipLocal: argv.includes('--skip-local'),
  };
}

function main(argv = process.argv.slice(2), repoRoot = process.cwd()) {
  const options = parseArguments(argv);
  const requirements = getRepoRequirements(repoRoot);
  const results = [];

  if (!options.skipLocal) {
    results.push(...printLocalToolChecks(requirements));
  }

  if (!options.skipDocs) {
    results.push(...printDocChecks(repoRoot, requirements));
  }

  const failures = results.filter(result => !result.ok);

  console.log('');
  console.log(
    failures.length === 0
      ? 'Contributor environment check passed.'
      : `Contributor environment check failed with ${failures.length} issue(s).`
  );

  return failures.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  buildDocChecks,
  compareVersions,
  evaluateDocCheck,
  getRepoRequirements,
  normalizeVersion,
  parseGoMod,
  versionSatisfies,
};
