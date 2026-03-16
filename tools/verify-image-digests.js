#!/usr/bin/env node

const usage = `
Usage: node tools/verify-image-digests.js [--help]

Checks Dockerfile and Dockerfile.plugins for FROM or ARG lines pinned with @sha256,
and verifies that the digest matches the top-level multi-arch manifest list
digest from 'docker buildx imagetools inspect'. This prevents accidentally
pinning an x64-only digest, which would break builds for other architectures
such as arm64.
`;

const files = ["Dockerfile", "Dockerfile.plugins"];

const fs = require("fs");
const { execSync } = require("child_process");

if (process.argv.includes("--help")) {
  console.log(usage);
  process.exit(0);
}

/**
 * Extract image references with digests from a Dockerfile.
 * 
 * @param {string} filePath - Path to the Dockerfile.
 * @returns {Array<{ line: string, ref: string, lineNumber: number }>} 
 *   Array of objects, each containing:
 *     - line: The full matched line from the Dockerfile.
 *     - ref: The image reference with digest (e.g., "nginx:1.25@sha256:...").
 *     - lineNumber: The 1-based line number in the file where the match was found.
 */
function extractImages(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const results = [];

  // Match FROM lines (with optional --platform and optional AS)
  const fromRegex = /FROM\s+(?:--platform=\$\{[^\}]+\}\s+)?([^\s@]+(?::[^\s@]+)?@sha256:[a-f0-9]{64})/gi;
  for (const m of content.matchAll(fromRegex)) {
    results.push({
      line: m[0],
      ref: m[1],
      lineNumber: content.substring(0, m.index).split("\n").length
    });
  }

  // Match ARG assignments with digest
  const argRegex = /ARG\s+[A-Z0-9_]+\s*=\s*([^\s@]+(?::[^\s@]+)?@sha256:[a-f0-9]{64})/gi;
  for (const m of content.matchAll(argRegex)) {
    results.push({
      line: m[0],
      ref: m[1],
      lineNumber: content.substring(0, m.index).split("\n").length
    });
  }

  return results;
}

/**
 * Gets the top-level multi-arch manifest digest for a given image tag.
 * 
 * @param {string} imageTag - The image tag (e.g., "nginx:1.25").
 * @returns {string} The top-level digest (sha256:...)
 */
function getTopLevelDigest(imageTag) {
  const output = execSync(`docker buildx imagetools inspect ${imageTag}`, { encoding: "utf-8" });
  const digestLine = output.split("\n").find(line => line.includes("Digest:"));
  return digestLine.split(": ")[1].trim();
}

/**
 * Checks a Dockerfile for image digest correctness.
 *
 * For each image reference pinned with a digest, verifies that the digest
 * matches the top-level multi-arch manifest digest from
 * 'docker buildx imagetools inspect'. If a mismatch is found, an error
 * object is added to the errors array.
 *
 * @param {string} filePath
 *   Path to the Dockerfile to check.
 * @param {Array<{
 *   file: string,
 *   line: string,
 *   lineNumber: number,
 *   image: string,
 *   pinned: string,
 *   correct: string
 * }>} errors
 *   Array to collect error objects for any mismatched digests.
 */
function checkFile(filePath, errors, oks) {
  const images = extractImages(filePath);

  for (const { line, ref, lineNumber } of images) {
    const [imageTag, expectedDigest] = ref.split("@");
    console.log(`Verifying ${filePath}@${lineNumber}: ${imageTag}@${expectedDigest}`);
    const topDigest = getTopLevelDigest(imageTag);

    if (expectedDigest === topDigest) {
      oks.push(`OK: ${line}`);
    } else {
      errors.push({
        file: filePath,
        line,
        lineNumber,
        image: imageTag,
        pinned: expectedDigest,
        correct: topDigest,
      });
    }
  }
}

function main() {
  let errors = [];
  let oks = [];
  for (const file of files) {
    if (fs.existsSync(file)) {
      checkFile(file, errors, oks);
    } else {
      console.warn(`Skipping ${file}, not found`);
    }
  }

  if (errors.length > 0) {
    // Tell the user what to do to fix the errors
    console.error("\nDigest check failed. Some digests are not top level digests but are arch specific ones:\n");
    for (const e of errors) {
      console.error(`Incorrect ${e.file}@${e.lineNumber}: ${e.line}`);
      console.error(`Suggested fix ${e.file}@${e.lineNumber}\n  ${e.image}@${e.correct}\n`);
    }
    process.exit(1);
  } else {
    for (const ok of oks) {
      console.log(ok);
    }
    console.log("All digests are correct top level digests and not arch specific digests.");
  }
}

main();
