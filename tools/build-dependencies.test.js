const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const hostGOOS = process.platform === "win32" ? "windows" : process.platform;

test("npm signal handlers wait for Windows children and forward POSIX signals", () => {
  for (const platform of ["win32", "linux"]) {
    const handlers = new Map();
    const childHandlers = new Map();
    const forwarded = [];
    let cleaned = false;
    let exited = false;
    const child = {
      on: (event, handler) => childHandlers.set(event, handler),
      kill: signal => forwarded.push(signal),
    };
    const module = {};
    const requireMock = name => {
      if (name === "node:child_process") return {
        execFileSync: (_command, args) => args[0] === "env" ? "windows\namd64\n" : undefined,
        spawn: () => child,
      };
      if (name === "node:fs") return { rmSync: () => { cleaned = true; } };
      if (name === "node:path") return path;
      if (name === "node:os") return os;
      throw new Error(`Unexpected bootstrap dependency: ${name}`);
    };
    requireMock.main = module;
    vm.runInNewContext(fs.readFileSync(path.join(root, "tools/build-backend.js"), "utf8"), {
      require: requireMock,
      module,
      __dirname: path.join(root, "tools"),
      console,
      process: {
        env: {},
        argv: ["node", "build-backend.js"],
        platform,
        pid: 123,
        on: (signal, handler) => handlers.set(signal, handler),
        once: (signal, handler) => handlers.set(signal, handler),
        exit: code => {
          assert.equal(code, 0);
          exited = true;
          handlers.get("exit")();
        },
      },
    });
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
      handlers.get(signal)();
    }
    assert.deepEqual(forwarded, platform === "win32" ? [] :
      ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]);
    assert.equal(exited, false);
    assert.equal(cleaned, false);
    childHandlers.get("exit")(0, null);
    assert.equal(exited, true);
    assert.equal(cleaned, true);
  }
});

function pathWithTools(directory, tools) {
  const bin = path.join(directory, "restricted-bin");
  fs.mkdirSync(bin);
  for (const tool of tools) {
    const executable = process.env.PATH.split(path.delimiter)
      .map(directory => path.join(directory, tool))
      .find(filename => fs.existsSync(filename));
    assert.ok(executable, `Required fixture tool missing: ${tool}`);
    fs.symlinkSync(executable, path.join(bin, tool));
  }
  return bin;
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "headlamp-build-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const name of [
    "bin",
    "tools",
    "frontend/src",
    "app/scripts",
    "backend/cmd",
    "backend/pkg/spa",
    "backend/pkg/kubeconfig",
  ]) {
    fs.mkdirSync(path.join(directory, name), { recursive: true });
  }
  fs.copyFileSync(path.join(root, "Makefile"), path.join(directory, "Makefile"));
  fs.copyFileSync(path.join(root, "package.json"), path.join(directory, "package.json"));
  fs.copyFileSync(
    path.join(root, "tools/build-backend.js"),
    path.join(directory, "tools/build-backend.js")
  );
  fs.copyFileSync(
    path.join(root, "tools/build-backend.go"),
    path.join(directory, "tools/build-backend.go")
  );
  fs.writeFileSync(
    path.join(directory, "app/scripts/setup-plugins.ts"),
    `
const fs = require("node:fs");
fs.writeFileSync("prepared.html", fs.readFileSync("../frontend/build/index.html"));
`
  );
  fs.writeFileSync(
    path.join(directory, "bin/npm"),
    `#!${process.execPath}
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
`,
    { mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(directory, "backend/go.mod"),
    "module github.com/kubernetes-sigs/headlamp/backend\n\ngo 1.20\n"
  );
  fs.writeFileSync(
    path.join(directory, "backend/pkg/spa/spa.go"),
    `//go:build embed

package spa
import _ "embed"
//go:embed static/index.html
var Page string
`
  );
  fs.writeFileSync(
    path.join(directory, "backend/pkg/spa/noembed.go"),
    `//go:build !embed

package spa
var Page = "backend without embedded frontend"
`
  );
  fs.writeFileSync(
    path.join(directory, "backend/pkg/kubeconfig/version.go"),
    `package kubeconfig
var Version string
var AppName string
`
  );
  fs.writeFileSync(
    path.join(directory, "backend/pkg/kubeconfig/tagged.go"),
    `//go:build caller

package kubeconfig
var FromTag = "caller tag"
`
  );
  fs.writeFileSync(
    path.join(directory, "backend/pkg/kubeconfig/untagged.go"),
    `//go:build !caller

package kubeconfig
var FromTag string
`
  );
  fs.writeFileSync(
    path.join(directory, "backend/cmd/main.go"),
    `package main
import (
  "fmt"
  "os"
  "github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
  "github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
)
var CallerFlag string
func main() {
  if len(os.Args) > 1 {
    if os.Args[1] == "--tag-info" {
      fmt.Print(kubeconfig.FromTag)
    } else {
      fmt.Printf("%s|%s|%s", kubeconfig.Version, kubeconfig.AppName, CallerFlag)
    }
  } else {
    fmt.Print(spa.Page)
  }
}
`
  );
  fs.writeFileSync(
    path.join(directory, "backend/inspect-debug.go"),
    `package main
import (
  "debug/dwarf"
  "debug/elf"
  "debug/macho"
  "debug/pe"
  "fmt"
  "os"
)
func hasDebug(data *dwarf.Data, err error) bool {
  if err != nil { return false }
  entry, err := data.Reader().Next()
  return err == nil && entry != nil
}
func main() {
  name := os.Args[1]
  if binary, err := elf.Open(name); err == nil {
    defer binary.Close()
    fmt.Print(hasDebug(binary.DWARF()))
  } else if binary, err := macho.Open(name); err == nil {
    defer binary.Close()
    fmt.Print(hasDebug(binary.DWARF()))
  } else if binary, err := pe.Open(name); err == nil {
    defer binary.Close()
    fmt.Print(hasDebug(binary.DWARF()))
  } else {
    panic("Unrecognized executable format: " + name)
  }
}
`
  );
  return {
    directory,
    source(content) {
      fs.writeFileSync(path.join(directory, "frontend/src/index.html"), content);
    },
    read(name) {
      return fs.readFileSync(path.join(directory, name), "utf8");
    },
    make(target, env = {}, expectedStatus = 0, metadata = true) {
      const result = spawnSync(
        "make",
        [
          ...(Array.isArray(target) ? target : target ? [target] : []),
          ...(metadata ? ["APP_VERSION=test", `APP_NAME=${env.APP_NAME ?? "Headlamp"}`] : []),
          "HEADLAMP_SOURCE_COMMIT=test",
          "DOCKER_IMAGE_VERSION=test",
        ],
        {
          cwd: directory,
          env: {
            ...process.env,
            PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH}`,
            CGO_ENABLED: "0",
            GOOS: hostGOOS,
            GOARCH: process.arch === "x64" ? "amd64" : process.arch,
            GOENV: "off",
            GOFLAGS: "",
            ...env,
          },
          encoding: "utf8",
        }
      );
      if (result.error) throw result.error;
      assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
      return result;
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
          GOOS: hostGOOS,
          GOARCH: process.arch === "x64" ? "amd64" : process.arch,
          GOENV: "off",
          GOFLAGS: "",
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

test("native build entrypoints preserve caller flags and packaged debugging information", t => {
  const project = fixture(t);
  const executable = path.join(
    project.directory,
    "backend/headlamp-server" + (process.platform === "win32" ? ".exe" : "")
  );
  const env = {
    ...process.env,
    GOENV: "off",
    GOTOOLCHAIN: "local",
    CGO_ENABLED: "0",
    GOOS: hostGOOS,
    GOARCH: process.arch === "x64" ? "amd64" : process.arch,
    GOFLAGS: `'-ldflags=-compressdwarf=false -X main.CallerFlag=native-ci' -trimpath=false`,
  };
  function run(command, args, expectedStatus = 0, overrides = {}) {
    const result = spawnSync(command, args, {
      cwd: project.directory,
      env: { ...env, ...overrides },
      encoding: "utf8",
      shell: process.platform === "win32" && command === "npm.cmd",
    });
    if (result.error) throw result.error;
    assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
    return result;
  }
  const verifier = path.join(root, "tools/check-backend-debug/main.go");
  project.make("backend");
  const stripped = run("go", ["run", verifier, executable], 1, { GOFLAGS: "" });
  assert.match(stripped.stderr, /Backend build verification failed/);
  project.make("backend", {
    ...env,
    GOFLAGS: "'-ldflags=-compressdwarf=false -s -w' -trimpath=false",
  });
  const removedDebug = run("go", ["run", verifier, executable], 1, { GOFLAGS: "" });
  assert.match(removedDebug.stderr, /debug information is missing/);

  project.make("backend", env);
  assert.equal(run(executable, ["--build-info"]).stdout, "test|Headlamp|native-ci");
  run("go", ["run", verifier, executable], 0, { GOFLAGS: "" });
  if (process.platform === "win32") {
    fs.unlinkSync(executable);
    project.make(["backend", "SHELL=cmd.exe"], env);
    assert.equal(run(executable, ["--build-info"]).stdout, "test|Headlamp|native-ci");
    run("go", ["run", verifier, executable], 0, { GOFLAGS: "" });
    const withoutUnixShell = process.env.PATH.split(path.delimiter).filter(directory =>
      !["sh", "sh.exe", "bash", "bash.exe"].some(name =>
        fs.existsSync(path.join(directory, name))
      )
    ).join(path.delimiter);
    const noShellEnv = {
      ...env,
      PATH: withoutUnixShell,
      SHELL: undefined,
      MAKESHELL: undefined,
      BASH_VERSION: undefined,
    };
    fs.unlinkSync(executable);
    project.make("backend", noShellEnv);
    assert.equal(run(executable, ["--build-info"]).stdout, "test|Headlamp|native-ci");
    run("go", ["run", verifier, executable], 0, { GOFLAGS: "" });
  }
  const resources = path.join(project.directory, "package/resources");
  fs.mkdirSync(resources, { recursive: true });
  fs.copyFileSync(executable, path.join(resources, path.basename(executable)));
  run("go", ["run", verifier, path.join(project.directory, "package")], 0, { GOFLAGS: "" });
  const missing = run("go", ["run", verifier, path.join(project.directory, "frontend")], 1, {
    GOFLAGS: "",
  });
  assert.match(missing.stderr, /no packaged backends/);

  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "backend:build"]);
  const npmOutput = path.join(project.directory, "backend/headlamp-server");
  const runnable =
    process.platform === "win32"
      ? path.join(project.directory, "backend/npm-backend.exe")
      : npmOutput;
  if (process.platform === "win32") fs.copyFileSync(npmOutput, runnable);
  assert.equal(run(runnable, ["--build-info"]).stdout, "||native-ci");
  run("go", ["run", verifier, npmOutput], 0, { GOFLAGS: "" });
});

test("backend recipes follow Make's actual shell when Windows markers are inherited", t => {
  const project = fixture(t);
  project.make(["backend", "SHELL=/bin/bash"], {
    OS: "Windows_NT",
    BASH_VERSION: undefined,
    GOFLAGS: "'-ldflags=-X main.CallerFlag=git-bash'",
  });
  project.run("backend/headlamp-server.exe --build-info > build-info");
  assert.equal(project.read("build-info"), "test|Headlamp|git-bash");
});

test("caller linker flags retain version metadata and debugging information", t => {
  const project = fixture(t);
  project.make("backend", {
    GOFLAGS: "'-ldflags=-X main.CallerFlag=caller'",
  });
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "test|Headlamp|caller");
  project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
  assert.equal(project.read("debug-info"), "true");
  project.run("go tool nm backend/headlamp-server > symbols");
  assert.match(project.read("symbols"), /main\.main/);
});

test("Make caches metadata once and queries the bootstrap host only when needed", t => {
  const project = fixture(t);
  const realGo = process.env.PATH.split(path.delimiter)
    .map(directory => path.join(directory, "go"))
    .find(filename => fs.existsSync(filename));
  assert.ok(realGo, "Go is required");
  fs.writeFileSync(path.join(project.directory, "bin/node"), `#!/bin/sh
printf 'node\\n' >> '${project.directory}/node-calls'
exec '${process.execPath}' "$@"
`, { mode: 0o755 });
  fs.writeFileSync(path.join(project.directory, "bin/go"), `#!/bin/sh
if [ "$1" = env ] && [ "$2" = GOHOSTOS ]; then
  printf 'host\\n' >> '${project.directory}/host-calls'
fi
exec '${realGo}' "$@"
`, { mode: 0o755 });
  const count = name => project.read(name).trim().split("\n").length;
  const env = { APP_VERSION: undefined, APP_NAME: undefined };
  fs.writeFileSync(path.join(project.directory, "app/package.json"),
    JSON.stringify({ version: "test", productName: "Headlamp" }));
  project.source("cached metadata frontend");
  project.make("frontend-build", env, 0, false);
  assert.equal(count("node-calls"), 2);
  assert.equal(fs.existsSync(path.join(project.directory, "host-calls")), false);
  fs.writeFileSync(path.join(project.directory, "node-calls"), "");
  project.make([
    "backend-embed-prepare", "backend-embed-clean", "backend",
    "backend-embed-linux-amd64",
  ], env, 0, false);
  assert.equal(count("node-calls"), 2);
  assert.equal(count("host-calls"), 1);
});

test("the backend builds without Node or npm, including metadata fallbacks and caller flags", t => {
  const project = fixture(t);
  const bin = pathWithTools(project.directory, ["make", "go", "uname", "mkdir", "sh", "git"]);
  const result = spawnSync("make", [
    "backend", "HEADLAMP_SOURCE_COMMIT=test", "DOCKER_IMAGE_VERSION=test",
  ], {
    cwd: project.directory,
    env: {
      ...process.env,
      PATH: bin,
      APP_VERSION: undefined,
      APP_NAME: undefined,
      GOENV: "off",
      GOTOOLCHAIN: "local",
      CGO_ENABLED: "0",
      GOOS: process.platform,
      GOARCH: process.arch === "x64" ? "amd64" : process.arch,
      GOFLAGS: "'-ldflags=all=-X main.CallerFlag=go-only'",
    },
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stdout + result.stderr);
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "unknown|Headlamp|go-only");
  project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
  assert.equal(project.read("debug-info"), "true");
});

test("linker package patterns retain Go matching and last-match precedence", t => {
  const project = fixture(t);
  project.make("backend", {
    GOFLAGS: "'-ldflags=not/a/package=-X main.CallerFlag=unmatched'",
  });
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "test|Headlamp|");
  project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
  assert.equal(project.read("debug-info"), "false");
  project.make("backend", {
    GOFLAGS: "'-ldflags=-X main.CallerFlag=base' '-ldflags=all=-X main.CallerFlag=all' " +
      "'-ldflags=github.com/kubernetes-sigs/headlamp/backend/cmd=-X main.CallerFlag=specific'",
  });
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "test|Headlamp|specific");
});

test("GOFLAGS linker settings and compiler flags survive Make and npm builds", t => {
  const project = fixture(t);
  const env = {
    GOFLAGS: `'-ldflags=all=-X "main.CallerFlag=caller value"' '-gcflags=all=-N -l' -trimpath=false`,
  };
  project.make("backend", env);
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "test|Headlamp|caller value");
  project.run("go version -m backend/headlamp-server > build-settings");
  assert.match(project.read("build-settings"), /-gcflags="?all=-N -l"?/);
  assert.doesNotMatch(project.read("build-settings"), /-trimpath=true/);

  project.run("npm run backend:build", { ...env, PATH: process.env.PATH });
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "||caller value");
  project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
  assert.equal(project.read("debug-info"), "true");
});

test("default builds stay stripped and explicit empty linker flags retain debug data", t => {
  const project = fixture(t);
  project.make("backend");
  project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
  assert.equal(project.read("debug-info"), "false");
  project.make("backend", { GOFLAGS: "-ldflags=" });
  project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
  assert.equal(project.read("debug-info"), "true");
});

test("JSON Go output does not override caller debug and path settings", t => {
  const project = fixture(t);
  for (const jsonFlag of ["-json", "-json=true"]) {
    const env = { GOFLAGS: `${jsonFlag} -trimpath=false -ldflags=` };
    project.make("backend", env);
    project.run("go version -m backend/headlamp-server > build-settings");
    assert.doesNotMatch(project.read("build-settings"), /-trimpath=true/);
    project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
    assert.equal(project.read("debug-info"), "true");
    project.run("npm run backend:build", { ...env, PATH: process.env.PATH });
    project.run("go version -m backend/headlamp-server > build-settings");
    assert.doesNotMatch(project.read("build-settings"), /-trimpath=true/);
    project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
    assert.equal(project.read("debug-info"), "true");
  }
});

test("interrupted POSIX builds clean up their bootstrap executable", t => {
  if (!fs.existsSync("/bin/dash")) {
    t.skip("dash-specific signal cleanup requires /bin/dash; covered on Linux CI");
    return;
  }
  for (const signal of ["INT", "HUP", "TERM"]) {
    const project = fixture(t);
    fs.writeFileSync(
      path.join(project.directory, "tools/build-backend.go"),
      `package main
import (
  "os"
  "syscall"
  "time"
)
func main() {
  if err := syscall.Kill(os.Getppid(), syscall.SIG${signal}); err != nil { panic(err) }
  time.Sleep(100 * time.Millisecond)
}
`
    );
    const result = project.make(["backend", "SHELL=/bin/dash"], {}, 2);
    assert.match(
      result.stderr,
      new RegExp(`Error ${signal === "INT" ? 130 : signal === "HUP" ? 129 : 143}`)
    );
    const remaining = fs.readdirSync(path.join(project.directory, "backend/.build"));
    assert.deepEqual(remaining, [], `${signal} must remove the bootstrap executable`);
  }
});

test("embedded builds keep caller tags, and every cross-platform target retains debug data", t => {
  const project = fixture(t);
  project.source("embedded frontend");
  project.make(["frontend-build", "backend-embed-prepare", "backend-embed-clean"]);
  for (const tags of [
    "-tags=caller",
    "-tags='caller'",
    "'-tags=caller extra'",
    "\"-tags='caller' 'extra'\"",
    "-tags=caller,extra",
  ]) {
    project.make("backend-embed", { GOFLAGS: `${tags} -ldflags=` });
    project.run("backend/headlamp-server --tag-info > tag-info");
    assert.equal(project.read("tag-info"), "caller tag", tags);
    project.run("backend/headlamp-server > embedded-info");
    assert.equal(project.read("embedded-info"), "embedded frontend", tags);
  }

  for (const [platform, architecture] of [
    ["windows", "arm64"],
    ["windows", "amd64"],
    ["windows", "386"],
    ["darwin", "arm64"],
    ["darwin", "amd64"],
    ["linux", "arm64"],
    ["linux", "amd64"],
    ["linux", "386"],
  ]) {
    project.make(`backend-embed-${platform}-${architecture}`, { GOFLAGS: "-ldflags=" });
    const executable = `dist/headlamp_app__${platform}_${architecture}${
      platform === "windows" ? ".exe" : ""
    }`;
    project.run(`cd backend && go run inspect-debug.go ${executable} > ../debug-info`);
    assert.equal(project.read("debug-info"), "true", `${platform}/${architecture}`);
  }
});

test("quoted linker values preserve backslashes and invalid settings fail explicitly", t => {
  const project = fixture(t);
  project.make("backend", {
    APP_NAME: "AKS desktop",
    GOFLAGS: `'-ldflags=-X "main.CallerFlag=C:\\Program Files\\AKS"'`,
    LDFLAGS: "-Wl,--as-needed",
  });
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "test|AKS desktop|C:\\Program Files\\AKS");
  const invalidGoFlags = project.make("backend", { GOFLAGS: "'unterminated" }, 2);
  assert.match(invalidGoFlags.stderr, /Invalid backend build flags:.*Unterminated/);
});

test("the npm bootstrap runs on the host while building a foreign target", t => {
  const project = fixture(t);
  const bin = pathWithTools(project.directory, ["npm", "node", "go", "env", "sh", "bash"]);
  project.run("npm run backend:build", {
    PATH: bin,
    GOOS: "windows",
    GOARCH: "amd64",
    GOARM64: "v9.0",
    CGO_ENABLED: "0",
    GOFLAGS: "'-ldflags=all=-X main.CallerFlag=npm-cross'",
  });
  project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
  assert.equal(project.read("debug-info"), "true");
});

test("stdlib bootstraps ignore surrounding module requirements without changing backend settings", t => {
  const project = fixture(t);
  fs.writeFileSync(
    path.join(project.directory, "go.mod"),
    "module example.com/bootstrap-context\n\ngo 1.99.0\n"
  );
  project.make("backend", {
    GO111MODULE: "on",
    GOTOOLCHAIN: "local",
    GOFLAGS: "'-ldflags=-X main.CallerFlag=make-module'",
  });
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "test|Headlamp|make-module");

  const backend = path.join(project.directory, "backend");
  fs.writeFileSync(
    path.join(backend, "compatible.mod"),
    fs.readFileSync(path.join(backend, "go.mod"))
  );
  fs.writeFileSync(
    path.join(backend, "go.mod"),
    "module github.com/kubernetes-sigs/headlamp/backend\n\ngo 1.99.0\n"
  );
  project.run("npm run backend:build", {
    PATH: process.env.PATH,
    GO111MODULE: "on",
    GOTOOLCHAIN: "local",
    GOFLAGS: "-modfile=compatible.mod '-ldflags=-X main.CallerFlag=npm-module'",
  });
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "||npm-module");
});

test("linker flags saved in a Go environment file are honored", t => {
  const project = fixture(t);
  const goenv = path.join(project.directory, "go-env");
  fs.writeFileSync(goenv, "GOFLAGS='-ldflags=-X main.CallerFlag=persisted'\n");
  project.make("backend", { GOENV: goenv });
  project.run("backend/headlamp-server --build-info > build-info");
  assert.equal(project.read("build-info"), "test|Headlamp|persisted");
});

test("cgo inherits the selected C compiler, compiler flags, and external linker flags", t => {
  const project = fixture(t);
  const compiler = path.join(project.directory, "bin/selected-cc");
  const marker = path.join(project.directory, "compiler-used");
  fs.writeFileSync(
    compiler,
    `#!/bin/sh
printf called >> '${marker}'
exec cc "$@"
`,
    { mode: 0o755 }
  );
  fs.writeFileSync(
    path.join(project.directory, "backend/linked.c"),
    "int headlamp_build_linked_value(void) { return 9; }\n"
  );
  project.run(
    "cc -c backend/linked.c -o backend/linked.o && ar rcs backend/liblinked.a backend/linked.o"
  );
  fs.writeFileSync(
    path.join(project.directory, "backend/cmd/main.go"),
    `package main
/*
#ifndef HEADLAMP_BUILD_FLAG
#error caller compiler flags were discarded
#endif
extern int headlamp_build_linked_value(void);
*/
import "C"
import "fmt"
func main() { fmt.Printf("%d|%d", C.HEADLAMP_BUILD_FLAG, C.headlamp_build_linked_value()) }
`
  );
  project.make("backend", {
    CGO_ENABLED: "1",
    CC: compiler,
    CGO_CFLAGS: "-DHEADLAMP_BUILD_FLAG=37 -g -O0",
    CGO_LDFLAGS: path.join(project.directory, "backend/liblinked.a"),
    GOFLAGS: "-ldflags=",
  });
  project.run("backend/headlamp-server > cgo-info");
  assert.equal(project.read("cgo-info"), "37|9");
  assert.ok(fs.existsSync(marker), "Go must invoke the caller-selected C compiler");
  project.run("cd backend && go run inspect-debug.go headlamp-server > ../debug-info");
  assert.equal(project.read("debug-info"), "true");
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
