const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "headlamp-build-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of ["bin", "frontend/src", "app/scripts", "backend/cmd", "backend/pkg/spa"]) {
    fs.mkdirSync(path.join(directory, name), { recursive: true });
  }
  fs.copyFileSync(path.join(root, "Makefile"), path.join(directory, "Makefile"));
  fs.writeFileSync(path.join(directory, "app/scripts/setup-plugins.ts"), `
const fs = require("node:fs");
fs.writeFileSync("prepared.html", fs.readFileSync("../frontend/build/index.html"));
`);
  fs.writeFileSync(path.join(directory, "bin/npm"), `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const project = path.basename(process.cwd());
if (process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    (project === "frontend" || ["install", "ci"].includes(args.join(" ")))) {
  throw new Error("Dependency preparation must not run with notarization credentials");
}
if (["install", "ci"].includes(args.join(" "))) process.exit(0);
if (project === "frontend" && args.join(" ") === "run build") {
  fs.mkdirSync("build", { recursive: true });
  fs.writeFileSync("build/index.html", fs.readFileSync("src/index.html"));
  const count = fs.existsSync("build-count") ? Number(fs.readFileSync("build-count", "utf8")) : 0;
  fs.writeFileSync("build-count", String(count + 1));
} else if (project === "app" && args[0] === "run" && ["build", "package"].includes(args[1])) {
  const frontend = fs.readFileSync("../frontend/build/index.html", "utf8");
  if (fs.readFileSync("prepared.html", "utf8") !== frontend) {
    throw new Error("App packaging ran before frontend preparation");
  }
  fs.writeFileSync("packaged.html", frontend);
} else {
  throw new Error("Unexpected npm command: " + project + " " + args.join(" "));
}
`, { mode: 0o755 });
  fs.writeFileSync(path.join(directory, "backend/go.mod"),
    "module github.com/kubernetes-sigs/headlamp/backend\n\ngo 1.20\n");
  fs.writeFileSync(path.join(directory, "backend/pkg/spa/spa.go"), `//go:build embed

package spa
import _ "embed"
//go:embed static/index.html
var Page string
`);
  fs.writeFileSync(path.join(directory, "backend/pkg/spa/noembed.go"), `//go:build !embed

package spa
var Page = "backend without embedded frontend"
`);
  fs.writeFileSync(path.join(directory, "backend/cmd/main.go"), `package main
import (
  "fmt"
  "github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
)
func main() { fmt.Print(spa.Page) }
`);
  return {
    directory,
    source(content) {
      fs.writeFileSync(path.join(directory, "frontend/src/index.html"), content);
    },
    read(name) {
      return fs.readFileSync(path.join(directory, name), "utf8");
    },
    make(target) {
      const result = spawnSync("make", [
        ...(Array.isArray(target) ? target : target ? [target] : []),
        "APP_VERSION=test",
        "APP_NAME=Headlamp",
        "HEADLAMP_SOURCE_COMMIT=test",
        "DOCKER_IMAGE_VERSION=test",
      ], {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`,
          CGO_ENABLED: "0",
          GOOS: process.platform,
          GOARCH: process.arch === "x64" ? "amd64" : process.arch,
        },
        encoding: "utf8",
      });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, result.stdout + result.stderr);
    },
    run(command, env = {}) {
      const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", command], {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`,
          APP_VERSION: "test",
          APP_NAME: "Headlamp",
          HEADLAMP_SOURCE_COMMIT: "test",
          DOCKER_IMAGE_VERSION: "test",
          CGO_ENABLED: "0",
          GOOS: process.platform,
          GOARCH: process.arch === "x64" ? "amd64" : process.arch,
          ...env,
        },
        encoding: "utf8",
      });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, result.stdout + result.stderr);
    },
  };
}

test("desktop packaging rebuilds existing frontend output before preparation", t => {
  const project = fixture(t);
  project.source("initial frontend");
  project.make("app-build");
  assert.equal(project.read("app/packaged.html"), "initial frontend");

  project.source("updated frontend");
  project.make("app-build");
  assert.equal(project.read("app/prepared.html"), "updated frontend");
  assert.equal(project.read("app/packaged.html"), "updated frontend");

  project.source("platform package frontend");
  project.make("app-mac");
  assert.equal(project.read("app/packaged.html"), "platform package frontend");
});

test("embedded backend rebuilds and embeds updated frontend output", t => {
  const project = fixture(t);
  for (const content of ["initial frontend", "updated frontend"]) {
    project.source(content);
    project.make("backend-embed");
    assert.equal(project.read("backend/pkg/spa/static/index.html"), content);
    const result = spawnSync(path.join(project.directory, "backend/headlamp-server"), {
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, content);
  }
});

test("the release checklist builds the frontend once when packaging the app", t => {
  const project = fixture(t);
  project.source("release frontend");
  const result = spawnSync(process.execPath, [
    path.join(root, ".github/scripts/generate-release-issue-body.js"),
    "issue", "0.0.1", "v0.0.0", "tester",
  ], { encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const command = result.stdout.match(/Build app with plugins: `([^`]+)`/);
  assert.ok(command, "Release checklist must include an app build command");
  for (const step of command[1].split(" && ")) {
    const make = step.match(/^make(?: ([a-z-]+))?$/);
    assert.ok(make, `Unexpected build command: ${step}`);
    project.make(make[1]);
  }
  assert.equal(project.read("app/packaged.html"), "release frontend");
  assert.equal(project.read("frontend/build-count"), "1");
});

test("macOS workflow prepares before certificate import and packages without rebuilding", async t => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/app-artifacts-mac.yml"), "utf8");
  const steps = [...workflow.matchAll(/^    - name: (.+)\n((?:^(?!    - ).*(?:\n|$))*)/gm)];
  function step(name) {
    const result = steps.find(match => match[1] === name);
    assert.ok(result, `Missing workflow step: ${name}`);
    return result;
  }
  function command(match) {
    const block = match[2].match(/^      run: \|\n((?:^        .*(?:\n|$))*)/m);
    assert.ok(block, `Expected a run block in ${match[1]}`);
    return block[1].replace(/^        /gm, "");
  }
  const preparation = step("Build Backend and Prepare App");
  const certificates = step("Add MacOS certs");
  assert.ok(preparation.index < certificates.index, "Prepare app before certificate import");
  for (const name of ["Build Signed and Notarized App Mac", "Build Unsigned App Mac"]) {
    await t.test(name, t => {
      const packaging = step(name);
      assert.ok(certificates.index < packaging.index, "Package after certificate import");
      const project = fixture(t);
      project.source("prepared macOS frontend");
      project.run(command(preparation));
      project.run(command(packaging), {
        APPLE_APP_SPECIFIC_PASSWORD: "test-only-placeholder",
      });
      assert.equal(project.read("app/packaged.html"), "prepared macOS frontend");
      assert.equal(project.read("frontend/build-count"), "1");
    });
  }
});
