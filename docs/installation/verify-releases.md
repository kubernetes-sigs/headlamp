---
title: Verifying Releases
sidebar_label: Verifying Releases
sidebar_position: 5
---

Headlamp releases are signed, so you can check that what you downloaded was
built by the Headlamp project and hasn't been tampered with.

Release checksums and container images are signed with
[Sigstore](https://www.sigstore.dev/) keyless signing in the GitHub Actions
workflows that build them, so there is no long-lived private key that could
leak. Release tags are signed by the maintainer who creates the release, with
their own key. The Helm chart is signed with GPG.

:::note
Signatures for release checksums, container images, and release tags start with
the first release after v0.45.0. For v0.45.0 and earlier, `checksums.txt` is not
signed, so it only protects against corrupted downloads, not tampered ones.
:::

The cosign commands on this page need
[cosign](https://docs.sigstore.dev/cosign/system_config/installation/) v2.6.3
or later, because older versions cannot read the signature format that Headlamp
releases use.

## Desktop apps and binaries

Each [GitHub release](https://github.com/kubernetes-sigs/headlamp/releases)
includes:

- `checksums.txt`: the SHA-256 checksums of the release's apps and binaries.
- `checksums.txt.sigstore.json`: a Sigstore signature bundle for
  `checksums.txt`.

To verify a download, first verify `checksums.txt`. It is signed by the release
assets workflow running from the `main` branch:

```shell
cosign verify-blob checksums.txt \
  --bundle checksums.txt.sigstore.json \
  --certificate-identity 'https://github.com/kubernetes-sigs/headlamp/.github/workflows/push-release-assets.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Then check the files you downloaded against it:

```shell
sha256sum --check --ignore-missing checksums.txt
```

On macOS, use `shasum -a 256 --check --ignore-missing checksums.txt`. On
Windows, use PowerShell (replace the file name with the one you downloaded); it
prints `True` if the checksum matches:

```powershell
$file = 'Headlamp-X.Y.Z-win-x64.exe'
$expected = (Select-String -Path checksums.txt -Pattern "  $file`$").Line.Split(' ')[0]
(Get-FileHash -Algorithm SHA256 $file).Hash -eq $expected
```

The macOS app is also signed and notarized by Apple, so macOS verifies it at
install time. The Windows installers are not yet Authenticode signed, so verify
them with `checksums.txt` as described above.

## Container images

Release images at `ghcr.io/headlamp-k8s/headlamp` are signed when they are built
from a release tag, and come with build provenance attestations:

```shell
cosign verify ghcr.io/headlamp-k8s/headlamp:vX.Y.Z \
  --certificate-identity-regexp '^https://github\.com/kubernetes-sigs/headlamp/\.github/workflows/container-publish\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The `nightly` image is signed by the nightly build from the `main` branch:

```shell
cosign verify ghcr.io/headlamp-k8s/headlamp:nightly \
  --certificate-identity 'https://github.com/kubernetes-sigs/headlamp/.github/workflows/nightly-build.yml@refs/heads/main' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Helm chart

The Helm chart is signed with GPG (key fingerprint
`2956 B7F7 1677 6937 0C93  730C 7264 DA7B 85D0 8A37`), and each chart release
includes a `.prov` provenance file. To verify the chart with Helm:

:::note
The public key is not currently available from public keyservers (see
[#5093](https://github.com/kubernetes-sigs/headlamp/issues/5093)), so the
`gpg --recv-keys` command below fails until it is published.
:::

```shell
gpg --keyserver hkps://keys.openpgp.org --recv-keys 2956B7F7167769370C93730C7264DA7B85D08A37
gpg --export 2956B7F7167769370C93730C7264DA7B85D08A37 > headlamp-pubring.gpg
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/
helm pull headlamp/headlamp --verify --keyring headlamp-pubring.gpg
```

## Source code

Release tags are signed by the maintainer who creates the release. To check a
tag, open it on [GitHub](https://github.com/kubernetes-sigs/headlamp/tags) and
look for the **Verified** label, which means GitHub has matched the signature to
a key registered on the maintainer's GitHub account.

To check a tag locally with `git tag -v`, first get the public key of the
maintainer who created it (shown as the tagger by `git show vX.Y.Z`; replace
`USERNAME` and `EMAIL` below with their GitHub username and tagger email).

For SSH-signed tags:

```shell
curl -s https://api.github.com/users/USERNAME/ssh_signing_keys \
  | jq -r '.[].key' | sed 's/^/EMAIL /' > allowed_signers
git -c gpg.ssh.allowedSignersFile=allowed_signers tag -v vX.Y.Z
```

For GPG-signed tags:

```shell
curl -s https://github.com/USERNAME.gpg | gpg --import
git tag -v vX.Y.Z
```
