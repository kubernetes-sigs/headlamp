---
title: Windows Installation
sidebar_label: Windows
sidebar_position: 3
---

Headlamp is available for Windows as a direct download from its [releases page](https://github.com/kubernetes-sigs/headlamp/releases) on GitHub (.exe file) and from package registries
like [Winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) and [Chocolatey](https://chocolatey.org/).

## Install via Winget

To install Headlamp from the Winget registry, simply run the following command:

```powershell
winget install headlamp
```

### Upgrading

To upgrade Headlamp when its installed with Winget, run the command:

```powershell
winget upgrade headlamp
```

## Install via Chocolatey

To install Headlamp from the Chocolatey registry, first install the choco command by following
its [official instructions](https://chocolatey.org/install#generic).
After `choco` is available, [install Headlamp](https://community.chocolatey.org/packages/headlamp#install) by running the following command:

```powershell
choco install headlamp
```

### Upgrading

To upgrade Headlamp when its installed with Chocolatey, run the command:

```powershell
choco upgrade headlamp
```

## If Windows Defender flags the installer

Windows Defender has reported the Headlamp installer as a trojan, under the
detection name `Trojan:Win32/Cinjo.O!cl`. Detections of this shape are commonly
raised against Electron applications. No analysis has shown the published
installers to be malicious, and the detection has not been reviewed by Microsoft
yet, so treat it as unconfirmed rather than settled either way. See
[#8050](https://github.com/kubernetes-sigs/headlamp/issues/8050).

Before anything else, check that the file you downloaded is the one the project
published. The Windows installers are not yet Authenticode signed, so this is
done with `checksums.txt`, which carries a signature of its own that ties it to
the project's release workflow. [Verifying Releases](../verify-releases.md)
gives the commands for both steps.

If the checksum matches, you can report the detection to Microsoft through
[Submit a file for malware analysis](https://www.microsoft.com/en-us/wdsi/filesubmission),
as a software developer, saying it is incorrectly detected, and include the
detection name above. Microsoft reviews the file and decides whether to update
its definitions. If it does, the warning clears for everyone rather than only on
your machine.

## Install via Github Releases

To install Headlamp from its official installer, first download the _.exe_ file for the [latest release](https://github.com/kubernetes-sigs/headlamp/releases/latest)'s assets section (located at the bottom of the section). Then double click the file and follow the installer's instructions.

### Upgrading

To upgrade Headlamp when it's installed directly from its installer, you have to
download the new version of the installer and re-install it. There is no automatic upgrade.

If you install via Chocolatey or Winget they can manage upgrades for you.
