# Installing protoLabs on Fedora/RHEL

This guide covers installation of protoLabs on Fedora, RHEL, Rocky Linux, AlmaLinux, and other RPM-based distributions.

## Overview

The protoLabs desktop application is built with **Tauri** (not Electron). The app is named **Ava** (product name) and ships as a native Linux binary for x86_64.

## Prerequisites

- **64-bit x86_64 architecture**
- **Fedora 39+** or **RHEL 9+**
- **4GB RAM minimum**, 8GB recommended
- **~200MB disk space** for installation
- **Internet connection** for installation and Claude API access

## Authentication

You'll need one of the following:

- **Claude CLI** (recommended) - `claude login`
- **API key** - Set `ANTHROPIC_API_KEY` environment variable

See the [installation guide authentication section](./installation.md#authentication) for details.

## Installation

### Option 1: Download and Install from GitHub

1. Visit [GitHub Releases](https://github.com/protoLabsAI/protomaker/releases)
2. Find the latest release and download the `.rpm` file
3. Install using dnf:

   ```bash
   sudo dnf install ./protoLabs-<version>-x86_64.rpm
   ```

### Option 2: Install Directly from URL

**Fedora:**

```bash
# Replace v0.107.1 with the actual latest version
sudo dnf install https://github.com/protoLabsAI/protomaker/releases/download/v0.107.1/protoLabs-0.107.1-x86_64.rpm
```

## Running protoLabs

### From Application Menu

- Open Activities/Applications
- Search for "Ava" or "protoLabs"
- Click to launch

### From Terminal

```bash
protomaker
```

## System Requirements & Capabilities

### Hardware Requirements

| Component    | Minimum           | Recommended |
| ------------ | ----------------- | ----------- |
| CPU          | Modern multi-core | 4+ cores    |
| RAM          | 4GB               | 8GB+        |
| Disk         | 200MB             | 1GB+        |
| Architecture | x86_64            | x86_64      |

### Required Dependencies

The RPM package automatically installs these dependencies:

```
gtk3              - GTK+ GUI library (required by Tauri/WebKit)
libnotify         - Desktop notification library
nss               - Network Security Services
libXScrnSaver     - X11 screensaver library
libXtst           - X11 testing library
xdg-utils         - XDG standards utilities
at-spi2-core      - Accessibility library
libuuid           - UUID library
webkit2gtk        - WebKitGTK (bundled with app on some distros)
```

Most of these are pre-installed on typical Fedora/RHEL systems.

## Supported Distributions

**Officially Tested:**

- Fedora 39, 40
- Rocky Linux 9
- AlmaLinux 9

**Should Work:**

- CentOS Stream 9+
- RHEL 9+

**Not Supported:**

- RHEL 8 (glibc 2.28 too old, requires newer dependencies)
- CentOS 7 and earlier
- Fedora versions older than 39

## Configuration

### Environment Variables

Set authentication via environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
protomaker
```

Or create `~/.config/automaker/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Configuration Directory

protoLabs stores configuration and cache in:

```
~/.automaker/                # Project-specific data
~/.config/automaker/         # Application configuration
~/.cache/automaker/          # Cache and temporary files
```

## Troubleshooting

### Application Won't Start

**Check installation:**

```bash
rpm -qi protomaker
rpm -V protomaker
```

**Run from terminal for error output:**

```bash
protomaker
```

### Missing Dependencies

If dependencies fail to install automatically:

```bash
sudo dnf install gtk3 libnotify nss libXScrnSaver libXtst xdg-utils at-spi2-core libuuid
```

### SELinux Denials

If protoLabs fails on SELinux-enforced systems:

**Temporary workaround (testing):**

```bash
sudo setenforce 0
protomaker
# Check for denials
sudo ausearch -m avc -ts recent | grep protomaker
# Re-enable SELinux
sudo setenforce 1
```

### Port Conflicts

protoLabs uses port 3008 for the internal server. If port is already in use:

```bash
sudo ss -tlnp | grep 3008
```

### GPU/Acceleration

protoLabs uses WebKitGTK for rendering. GPU acceleration should work automatically on supported systems.

**Disable acceleration if issues occur:**

```bash
DISABLE_GPU_ACCELERATION=1 protomaker
```

## Uninstallation

```bash
sudo dnf remove protomaker

# Optional: Clean user data
rm -rf ~/.automaker
rm -rf ~/.config/automaker
rm -rf ~/.cache/automaker
```

## Updating protoLabs

```bash
sudo dnf update protomaker
```

---

**Last Updated**: 2026-06-05
**Tested On**: Fedora 40, Rocky Linux 9, AlmaLinux 9