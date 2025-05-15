---
title: Linux Installation
sidebar_label: Linux
sidebar_position: 1
---

We ship Headlamp the Linux desktop in several formats: [Flatpak](#flatpak), [AppImage](#appimage), [Tarballs](#tarballs).

## Flatpak

[Flatpak](https://flatpak.org/) gives an isolated and bundled way of running Headlamp, with decoupled runtime updates (besides other [benefits](https://en.wikipedia.org/wiki/Flatpak#Features)).

Make sure you [install Flatpak and enable the flathub repository](https://flatpak.org/setup/), then install Headlamp with the following command:

```bash
flatpak install io.kinvolk.Headlamp
```

For running it, just launch it as usually in your Linux desktop, or run:

```bash
flatpak run io.kinvolk.Headlamp
```

### Upgrading

To upgrading Headlamp when it's installed via Flatpak, run:

```bash
flatpak update io.kinvolk.Headlamp
```

### Running External Tools

When using tools like `az`, `aws`, `gcloud`, etc. from e.g. kubeconfig user's
exec, Flatpak will need to run these tools from outside the sandbox. For that
to work, you need to grant the *talk-name* of *org.freedesktop.Flatpak*. To do
this, use the [Flatseal](https://flathub.org/apps/com.github.tchx84.Flatseal)
application to change Headlamp's permissions, or run the following command
(before running Headlamp):

```shell
sudo flatpak override --talk-name=org.freedesktop.Flatpak io.kinvolk.Headlamp
```

## AppImage

Headlamp can be used as an [AppImage](https://appimage.org/) by downloading and running it directly.

To download, choose the AppImage file from the [latest release page](https://github.com/kubernetes-sigs/headlamp/releases/latest).
You can then run it with the following command (exemplified for the AMD64, 0.16.0 version):

```bash
./Headlamp-0.16.0-linux-x64.AppImage
```

## Tarballs

To run Headlamp from one of the tarballs, first download the tarball for the [latest release](https://github.com/kubernetes-sigs/headlamp/releases/latest). Then, extract the contents from it and run
the `headlamp` binary in the resulting folder (exemplified below for the AMD64, 0.16.0 version):

```bash
tar xvzf ./Headlamp-0.16.0-linux-x64.tar.gz
cd Headlamp-0.16.0-linux-x64
./headlamp
```
