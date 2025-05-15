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

## Install via Github Releases

To install Headlamp from its official installer, first download the _.exe_ file for the [latest release](https://github.com/kubernetes-sigs/headlamp/releases/latest)'s assets section (located at the bottom of the section). Then double click the file and follow the installer's instructions.

### Upgrading

To upgrade Headlamp when it's installed directly from its installer, you have to
download the new version of the installer and re-install it. There is no automatic upgrade.

If you install via Chocolatey or Winget they can manage upgrades for you.
