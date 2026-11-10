#!/usr/bin/env node

const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const files = ["Dockerfile", "Dockerfile.plugins"];
const indexTypes = new Set([
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
]);
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const usage = `Usage: node tools/verify-image-digests.js [--update | --help]

Verify that pinned FROM/ARG image digests are multi-platform indexes containing
linux/amd64 and linux/arm64. A tag moving does not invalidate an existing pin.

--update resolves the existing tags and refreshes only their digests after all
resolved indexes pass validation. Requires Docker Buildx and registry access.
`;

function extractImages(content) {
  const images = [];
  const instruction = /^\s*(?:FROM\s+(?:--platform=\S+\s+)?|ARG\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*)([^\s@]+)@(sha256:[a-f0-9]{64})(?=\s|$)/i;
  let offset = 0;
  for (const [index, line] of content.split("\n").entries()) {
    const match = instruction.exec(line);
    if (match) {
      images.push({
        image: match[1],
        digest: match[2],
        lineNumber: index + 1,
        start: offset + match.index + match[0].length - match[2].length,
      });
    } else if (/^\s*(?:FROM|ARG)\s+/i.test(line) && /@sha256:/i.test(line)) {
      throw new Error(`Malformed pinned image on line ${index + 1}: ${line}`);
    }
    offset += line.length + 1;
  }
  return images;
}

function inspectImage(reference) {
  return JSON.parse(execFileSync("docker", [
    "buildx", "imagetools", "inspect", reference, "--format", "{{json .Manifest}}",
  ], { encoding: "utf8", timeout: 120000 }));
}

function validateIndex(reference, manifest) {
  if (!manifest || !indexTypes.has(manifest.mediaType) || !Array.isArray(manifest.manifests)) {
    throw new Error(`${reference}: expected a multi-platform image index, not an architecture-specific manifest`);
  }
  if (!digestPattern.test(manifest.digest)) {
    throw new Error(`${reference}: missing or invalid resolved SHA-256 digest`);
  }
  for (const architecture of ["amd64", "arm64"]) {
    if (!manifest.manifests.some(item =>
      item.platform?.os === "linux" && item.platform.architecture === architecture)) {
      throw new Error(`${reference}: missing linux/${architecture}`);
    }
  }
}

function processFiles({ update = false, directory = ".", inspect = inspectImage, log = console.log } = {}) {
  const { join } = require("node:path");
  const snapshots = files.map(file => {
    const path = join(directory, file);
    const content = fs.readFileSync(path, "utf8");
    const images = extractImages(content);
    if (images.length === 0) throw new Error(`${file}: no pinned images found`);
    return { file, path, content, images };
  });
  const cache = new Map();
  const changes = [];
  for (const snapshot of snapshots) {
    let updated = snapshot.content;
    for (const image of [...snapshot.images].reverse()) {
      const reference = update ? image.image : `${image.image}@${image.digest}`;
      if (!cache.has(reference)) {
        const manifest = inspect(reference);
        validateIndex(reference, manifest);
        cache.set(reference, manifest.digest);
      }
      const digest = cache.get(reference);
      if (!update && digest !== image.digest) {
        throw new Error(`${reference}: registry returned a different digest (${digest})`);
      }
      if (update && digest !== image.digest) {
        updated = updated.slice(0, image.start) + digest +
          updated.slice(image.start + image.digest.length);
        changes.push(`${snapshot.file}:${image.lineNumber}: ${image.image}@${digest}`);
      }
    }
    snapshot.updated = updated;
  }
  // Resolve and validate every image before changing either Dockerfile.
  if (update) for (const snapshot of snapshots) {
    if (snapshot.updated !== snapshot.content) fs.writeFileSync(snapshot.path, snapshot.updated);
  }
  for (const change of changes) log(`Updated ${change}`);
  log(update ? `Updated ${changes.length} image pin(s).` : "All pinned images support linux/amd64 and linux/arm64.");
  return changes;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !["--update", "--help"].includes(arg))) throw new Error(usage);
    if (args.includes("--help")) console.log(usage);
    else processFiles({ update: args.includes("--update") });
  } catch (error) {
    console.error(`Image digest check failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { extractImages, processFiles };
