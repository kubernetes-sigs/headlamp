#!/usr/bin/env python3
"""Regression tests for the release workflow's pre-upload checks.

Run with Python 3, Bash 4+, jq, and sha256sum on PATH:
    python3 .github/scripts/test-release-provenance.py
"""

import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import unittest


WORKFLOW = (Path(__file__).parents[1] / "workflows/push-release-assets.yml").read_text()


def step_command(name, workflow=WORKFLOW):
    step = workflow.split(f"      - name: {name}\n", 1)[1]
    header, script = step.split("        run: |\n", 1)
    script = textwrap.dedent(script.split("\n      - name:", 1)[0])
    bash = shutil.which("bash")
    if "        shell: bash\n" in header:
        return [bash, "--noprofile", "--norc", "-eo", "pipefail", "-c", script]
    return [bash, "-e", "-c", script]


def digest(contents):
    return hashlib.sha256(contents).hexdigest()


def bundle(contents, trusted=True):
    statement = {"subject": [{"digest": {"sha256": digest(contents)}}]}
    return {
        "trusted": trusted,
        "dsseEnvelope": {
            "payload": base64.b64encode(json.dumps(statement).encode()).decode()
        },
    }


class ReleaseProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ("bin", "flattened-artifacts", "provenance", "remote"):
            (self.root / directory).mkdir()
        self.assets = []
        self.add_asset("checksums.txt", b"")
        self.add_asset("headlamp-1.2.3.intoto.jsonl", b"")
        self.add_asset("checksums.txt.sigstore.json", b"signature")
        (self.root / "flattened-artifacts/new.exe").write_bytes(b"new")
        self.write_bundles("provenance/new.intoto.jsonl", [bundle(b"new")])
        self.write_tool("gh", """
            import json, pathlib, sys
            root = pathlib.Path.cwd()
            failure_path = root / "api-failure.json"
            failure = json.loads(failure_path.read_text()) if failure_path.exists() else {}
            endpoint = next(arg for arg in sys.argv if arg.startswith("repos/"))
            if endpoint.endswith("/releases"):
                print("123")
            elif endpoint.endswith("/123/assets"):
                assets = json.loads((root / "assets.json").read_text())
                for asset in assets[:failure.get("asset_count", len(assets))]:
                    print(json.dumps(asset))
            else:
                sys.stdout.buffer.write((root / "remote" / endpoint.rsplit("/", 1)[1]).read_bytes())
            if endpoint == failure.get("endpoint"):
                print("API request failed", file=sys.stderr)
                sys.exit(1)
        """)
        # Only external signature verification is stubbed; jq and hashing are real.
        self.write_tool("cosign", """
            import json, pathlib, sys
            args = sys.argv
            bundle = json.loads(pathlib.Path(args[args.index("--bundle") + 1]).read_text())
            required = {
                "--type": "https://slsa.dev/provenance/v1",
                "--certificate-identity-regexp": "^https://github\\\\.com/kubernetes-sigs/headlamp/\\\\.github/workflows/app-artifacts-(linux|mac|win)\\\\.yml@",
                "--certificate-oidc-issuer": "https://token.actions.githubusercontent.com",
                "--digestAlg": "sha256",
            }
            assert args[1] == "verify-blob-attestation"
            for flag, value in required.items():
                assert args[args.index(flag) + 1] == value
            sys.exit(0 if bundle["trusted"] else 1)
        """)

    def write_tool(self, name, source):
        tool = self.root / "bin" / name
        tool.write_text("#!/usr/bin/env python3\n" + textwrap.dedent(source))
        tool.chmod(0o755)

    def add_asset(self, name, contents):
        asset_id = str(len(self.assets) + 1)
        self.assets.append({"id": int(asset_id), "name": name})
        (self.root / "remote" / asset_id).write_bytes(contents)
        return asset_id

    def write_bundles(self, path, bundles):
        (self.root / path).write_text("".join(json.dumps(b) + "\n" for b in bundles))

    def retained_asset(self, manifest=True, trusted=True, contents=b"retained"):
        self.add_asset("retained.dmg", contents)
        if manifest:
            (self.root / "remote/1").write_text(f"{digest(b'retained')}  retained.dmg\n")
        self.write_bundles("remote/2", [bundle(b"retained", trusted)])

    def run_checks(self, success=True):
        (self.root / "assets.json").write_text(json.dumps(self.assets))
        env = {
            **os.environ,
            "PATH": str(self.root / "bin") + os.pathsep + os.environ["PATH"],
            "GITHUB_REPOSITORY": "kubernetes-sigs/headlamp",
            "RELEASE_NAME": "1.2.3",
        }
        for name in ("Collect build provenance", "Verify build provenance"):
            result = subprocess.run(
                step_command(name),
                cwd=self.root, env=env, text=True, capture_output=True,
            )
            if result.returncode:
                break
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return result.stdout + result.stderr

    def test_publish_is_serialized_by_release(self):
        publish = WORKFLOW.split("  publish:\n", 1)[1].split("    steps:\n", 1)[0]
        self.assertIn(
            "    concurrency:\n"
            "      group: release-assets-${{ inputs.release_name }}\n"
            "      cancel-in-progress: false\n", publish,
        )

    def test_first_upload_ignores_release_metadata(self):
        self.run_checks()

    def test_partial_upload_preserves_retained_provenance(self):
        self.retained_asset()
        self.run_checks()
        combined = (self.root / "temp-checksums/headlamp-1.2.3.intoto.jsonl").read_text()
        self.assertEqual(len(combined.splitlines()), 2)

    def test_retained_asset_without_manifest_is_rejected(self):
        self.retained_asset(manifest=False)
        self.assertIn("Retained asset retained.dmg", self.run_checks(success=False))

    def test_incomplete_manifest_is_rejected(self):
        self.retained_asset()
        self.add_asset("unlisted.msi", b"unlisted")
        self.assertIn("Retained asset unlisted.msi", self.run_checks(success=False))

    def test_retained_asset_with_wrong_digest_is_rejected(self):
        self.retained_asset(contents=b"changed")
        self.assertIn("different digest", self.run_checks(success=False))

    def test_replacing_unlisted_asset_repairs_manifest(self):
        self.retained_asset(manifest=False)
        (self.root / "flattened-artifacts/retained.dmg").write_bytes(b"retained")
        self.run_checks()

    def test_untrusted_retained_provenance_is_rejected(self):
        self.retained_asset(trusted=False)
        self.assertIn("No verified build provenance", self.run_checks(success=False))

    def test_missing_new_provenance_is_rejected(self):
        (self.root / "provenance/new.intoto.jsonl").write_text("")
        self.assertIn("No verified build provenance", self.run_checks(success=False))

    def test_retained_download_failure_is_rejected(self):
        self.retained_asset()
        (self.root / "remote/4").unlink()
        self.run_checks(success=False)

    def test_failed_empty_asset_listing_stops_collection(self):
        (self.root / "api-failure.json").write_text(json.dumps({
            "endpoint": "repos/kubernetes-sigs/headlamp/releases/123/assets",
            "asset_count": 0,
        }))
        self.assertIn("API request failed", self.run_checks(success=False))
        self.assertFalse((self.root / "temp-checksums/headlamp-1.2.3.intoto.jsonl").exists())

    def test_failed_partial_asset_listing_stops_collection(self):
        self.retained_asset()
        (self.root / "api-failure.json").write_text(json.dumps({
            "endpoint": "repos/kubernetes-sigs/headlamp/releases/123/assets",
            "asset_count": 3,
        }))
        self.assertIn("API request failed", self.run_checks(success=False))
        self.assertFalse((self.root / "temp-checksums/headlamp-1.2.3.intoto.jsonl").exists())

    def test_failed_download_with_matching_digest_is_rejected(self):
        self.retained_asset()
        (self.root / "api-failure.json").write_text(json.dumps({
            "endpoint": "repos/kubernetes-sigs/headlamp/releases/assets/4",
        }))
        self.assertIn("API request failed", self.run_checks(success=False))


class ChartVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "bin").mkdir()
        self.workflow = (
            Path(__file__).parents[1] / "workflows/helm-chart-release.yml"
        ).read_text()
        self.config = {
            "commit": "current",
            "package": "published-chart",
            "signature": "published-chart",
            "provenance": "published-chart",
            "identity": "https://github.com/kubernetes-sigs/headlamp/"
                        ".github/workflows/helm-chart-release.yml@refs/heads/main",
        }
        self.write_tool("helm", """
            print("name: headlamp\\nversion: 1.2.3")
        """)
        self.write_tool("gh", """
            import json, pathlib, sys
            root = pathlib.Path.cwd()
            config = json.loads((root / "config.json").read_text())
            args = sys.argv[1:]
            if args[0] == "api":
                if config.get("api_failure"):
                    sys.exit("API request failed")
                print(config["commit"])
            elif args[:2] == ["release", "download"]:
                asset = args[args.index("--pattern") + 1]
                directory = pathlib.Path(args[args.index("--dir") + 1])
                with (root / "downloads").open("a") as log:
                    log.write(asset + "\\n")
                if asset == config.get("missing"):
                    sys.exit("Asset unavailable: " + asset)
                if asset.endswith(".sigstore.json"):
                    contents = json.dumps({"digest_of": config["signature"], "identity": config["identity"]})
                elif asset.endswith(".intoto.jsonl"):
                    contents = json.dumps({"digest_of": config["provenance"], "identity": config["identity"]})
                else:
                    contents = config["package"]
                (directory / asset).write_text(contents)
            else:
                sys.exit("Unexpected gh command")
        """)
        self.write_tool("cosign", """
            import json, pathlib, sys
            args = sys.argv[1:]
            bundle = json.loads(pathlib.Path(args[args.index("--bundle") + 1]).read_text())
            assert args[args.index("--certificate-identity") + 1] == bundle["identity"], "Wrong identity"
            assert args[args.index("--certificate-oidc-issuer") + 1] == "https://token.actions.githubusercontent.com"
            assert pathlib.Path(args[1]).read_text() == bundle["digest_of"], "Digest mismatch"
            if args[0] == "verify-blob-attestation":
                assert args[args.index("--type") + 1] == "https://slsa.dev/provenance/v1"
            else:
                assert args[0] == "verify-blob"
            with pathlib.Path("verified").open("a") as log:
                log.write(args[0] + "\\n")
        """)

    def write_tool(self, name, source):
        tool = self.root / "bin" / name
        tool.write_text("#!/usr/bin/env python3\n" + textwrap.dedent(source))
        tool.chmod(0o755)

    def verify(self, success=True):
        (self.root / "config.json").write_text(json.dumps(self.config))
        result = subprocess.run(
            step_command("Verify published chart signatures and provenance", self.workflow),
            cwd=self.root, text=True, capture_output=True,
            env={
                **os.environ,
                "PATH": str(self.root / "bin") + os.pathsep + os.environ["PATH"],
                "GITHUB_REPOSITORY": "kubernetes-sigs/headlamp",
                "GITHUB_SHA": "current",
                "CHANGED_CHARTS": "charts/headlamp",
            },
        )
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return result.stdout + result.stderr

    def test_published_assets_are_downloaded_and_both_signatures_checked(self):
        self.verify()
        self.assertEqual((self.root / "verified").read_text().splitlines(),
                         ["verify-blob", "verify-blob-attestation"])
        self.assertEqual(len((self.root / "downloads").read_text().splitlines()), 3)

    def test_missing_signature_or_provenance_fails(self):
        for suffix in (".sigstore.json", ".intoto.jsonl"):
            with self.subTest(suffix=suffix):
                self.config["missing"] = "headlamp-1.2.3.tgz" + suffix
                self.assertIn("Asset unavailable", self.verify(success=False))

    def test_changed_package_or_untrusted_identity_fails(self):
        for field in ("signature", "provenance", "identity"):
            with self.subTest(field=field):
                original = self.config[field]
                self.config[field] = "untrusted-or-different"
                self.verify(success=False)
                self.config[field] = original

    def test_api_failure_stops_verification(self):
        self.config["api_failure"] = True
        self.assertIn("API request failed", self.verify(success=False))
        self.assertFalse((self.root / "downloads").exists())

    def test_historical_release_is_not_downloaded_or_changed(self):
        self.config["commit"] = "older"
        output = self.verify()
        self.assertIn("::notice::Verification skipped for headlamp-helm-1.2.3", output)
        self.assertIn("release commit older differs from workflow commit current", output)
        self.assertFalse((self.root / "downloads").exists())
        self.assertFalse((self.root / "verified").exists())

    def test_release_checklist_requires_published_chart_verification(self):
        generator = Path(__file__).with_name("generate-release-issue-body.js")
        output = subprocess.check_output(
            ["node", str(generator), "issue", "1.2.3", "v1.2.2", "tester"], text=True
        )
        self.assertIn("Chart: Verify published signatures and provenance", output)
        self.assertIn("fresh directory", output)


if __name__ == "__main__":
    unittest.main()
