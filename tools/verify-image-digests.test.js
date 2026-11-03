const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { extractImages, processFiles } = require("./verify-image-digests");

const oldDigest = `sha256:${"a".repeat(64)}`;
const newDigest = `sha256:${"b".repeat(64)}`;
const index = (digest = oldDigest, mediaType = "application/vnd.oci.image.index.v1+json") => ({
  digest,
  mediaType,
  manifests: ["amd64", "arm64"].map(architecture => ({ platform: { os: "linux", architecture } })),
});

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "headlamp-digests-"));
  t.after(() => {
    for (const file of ["Dockerfile", "Dockerfile.plugins"]) {
      const target = path.join(directory, file);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(directory);
  });
  const content = `# FROM ignored:1@${oldDigest}\nARG BASE = registry:5000/base:1@${oldDigest}\nFROM --platform=\${BUILDPLATFORM} node:22@${oldDigest} AS build\nFROM \${BASE}\n`;
  fs.writeFileSync(path.join(directory, "Dockerfile"), content);
  fs.writeFileSync(path.join(directory, "Dockerfile.plugins"), `FROM node:22@${oldDigest}\r\n`);
  return { directory, log: () => {} };
}

function contents(directory) {
  return ["Dockerfile", "Dockerfile.plugins"].map(file =>
    fs.readFileSync(path.join(directory, file), "utf8"));
}

test("extracts FROM and ARG pins, ignoring comments and variable-only stages", () => {
  const source = `# FROM ignored:1@${oldDigest}\nARG BASE=host:5000/base:1@${oldDigest}\nFROM --platform=linux/arm64 node:22@${oldDigest} as build\nFROM \${BASE}\n`;
  const images = extractImages(source);
  assert.deepEqual(images.map(image => [image.image, image.lineNumber]),
    [["host:5000/base:1", 2], ["node:22", 3]]);
  for (const image of images)
    assert.equal(source.slice(image.start, image.start + oldDigest.length), oldDigest);
});

test("accepts existing multi-arch pins without resolving mutable tags", t => {
  const options = fixture(t);
  const calls = [];
  const before = contents(options.directory);
  assert.deepEqual(processFiles({ ...options, inspect: ref => {
    calls.push(ref);
    assert.ok(ref.endsWith(`@${oldDigest}`));
    return index();
  } }), []);
  assert.equal(calls.length, 2);
  assert.deepEqual(contents(options.directory), before);
});

test("refreshes all occurrences using one lookup per tag, preserving other bytes", t => {
  const options = fixture(t);
  const calls = [];
  const before = contents(options.directory);
  const inspect = ref => { calls.push(ref); assert.ok(!ref.includes("@")); return index(newDigest); };
  assert.equal(processFiles({ ...options, update: true, inspect }).length, 3);
  assert.equal(calls.length, 2);
  assert.deepEqual(contents(options.directory),
    before.map(text => text.split("\n").map(line =>
      line.startsWith("#") ? line : line.replace(oldDigest, newDigest)).join("\n")));
  assert.deepEqual(processFiles({ ...options, update: true, inspect }), []);
});

test("accepts Docker manifest lists as well as OCI indexes", t => {
  processFiles({ ...fixture(t), inspect: () =>
    index(oldDigest, "application/vnd.docker.distribution.manifest.list.v2+json") });
});

test("rejects single-architecture manifests even if they are the current tag", t => {
  const options = fixture(t), before = contents(options.directory);
  assert.throws(() => processFiles({ ...options, update: true, inspect: () => ({
    digest: newDigest, mediaType: "application/vnd.oci.image.manifest.v1+json",
  }) }), /architecture-specific/);
  assert.deepEqual(contents(options.directory), before);
});

test("rejects missing architectures, including attestation-only descriptors", t => {
  const options = fixture(t);
  for (const architecture of ["amd64", "arm64"]) {
    const manifest = index();
    manifest.manifests = manifest.manifests.filter(item => item.platform.architecture !== architecture);
    manifest.manifests.push({ platform: { architecture: "unknown", os: "unknown" } });
    assert.throws(() => processFiles({ ...options, inspect: () => manifest }),
      new RegExp(`missing linux/${architecture}`));
  }
});

test("registry errors do not leave partially refreshed files", t => {
  const options = fixture(t), before = contents(options.directory);
  let calls = 0;
  assert.throws(() => processFiles({ ...options, update: true, inspect: () => {
    if (++calls === 2) throw new Error("registry unavailable");
    return index(newDigest);
  } }), /registry unavailable/);
  assert.deepEqual(contents(options.directory), before);
});

test("rejects invalid resolved digests and mismatched pinned responses", t => {
  const options = fixture(t);
  assert.throws(() => processFiles({ ...options, inspect: () => index("bad") }), /invalid resolved/);
  assert.throws(() => processFiles({ ...options, inspect: () => index(newDigest) }), /different digest/);
});

test("missing files, missing pins and malformed pins fail explicitly", t => {
  const options = fixture(t);
  const file = path.join(options.directory, "Dockerfile");
  fs.writeFileSync(file, "FROM node:22@sha256:bad\n");
  assert.throws(() => processFiles(options), /Malformed pinned image/);
  fs.writeFileSync(file, "FROM node:22\n");
  assert.throws(() => processFiles(options), /no pinned images/);
  fs.unlinkSync(file);
  assert.throws(() => processFiles(options), /ENOENT/);
});
