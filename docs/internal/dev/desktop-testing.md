# Desktop App Testing Guide

This guide covers testing the protoLabs Studio desktop application (Electron) across platforms.

## Overview

The desktop app is built with:

- **Electron 39.2.7** - Cross-platform desktop framework
- **electron-builder 26.7.0** - Packaging and distribution
- **Bundled server** - Node.js Express API packaged in `resources/server/`

## Automated Testing

### Smoke Tests (CI)

Smoke tests run automatically on every version tag (`v*`) via GitHub Actions. They verify:

✅ **Installation**: DMG mounts, NSIS installs, AppImage executes
✅ **Launch**: App starts without crashes
✅ **Server Startup**: Backend API responds to health checks
✅ **Core Functionality**: First-run setup, window creation, IPC channels

**Trigger**: Push a version tag

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

**Monitor**: GitHub Actions → `build-electron.yml`

**Artifacts**: Test results and screenshots uploaded on failure

### Local Smoke Testing

Run smoke tests locally on an installed build:

```bash
# 1. Build the app for your platform
npm run build:electron --workspace=apps/ui

# 2. Install using platform script
# macOS:
bash apps/ui/scripts/smoke-test-mac.sh

# Windows:
powershell apps/ui/scripts/smoke-test-win.ps1

# Linux:
bash apps/ui/scripts/smoke-test-linux.sh

# 3. Run smoke tests
# macOS:
ELECTRON_EXEC_PATH=/tmp/test-app/protoLabs.studio.app/Contents/MacOS/protoLabs.studio \
  npm run test:smoke --workspace=apps/ui

# Windows:
$env:ELECTRON_EXEC_PATH="C:\test-app\protoLabs.studio.exe"
npm run test:smoke --workspace=apps/ui

# Linux:
ELECTRON_EXEC_PATH=/tmp/test-app/protoLabs.studio.AppImage \
  xvfb-run npm run test:smoke --workspace=apps/ui
```

## Manual Testing Checklist

Use this checklist for extended verification beyond automated tests.

### Pre-Release Testing (RC Tags)

**When**: Before releasing a stable version (e.g., `v1.0.0-rc.1`)
**Goal**: Verify release candidate is production-ready

#### Installation UX

**macOS (.dmg)**

- [ ] DMG mounts without errors
- [ ] Drag-to-Applications workflow works
- [ ] App icon displays correctly in Applications folder
- [ ] DMG unmounts cleanly
- [ ] No Gatekeeper warnings (signed builds only)
- [ ] First launch shows correct splash screen

**Windows (.exe NSIS)**

- [ ] Installer shows correct branding and version
- [ ] Installation progress bar works
- [ ] Desktop shortcut created (if option selected)
- [ ] Start Menu entry created
- [ ] Uninstaller present in Control Panel
- [ ] SmartScreen accepts signed builds

**Linux (.AppImage)**

- [ ] AppImage executes without permission errors
- [ ] Desktop integration works (launcher icon)
- [ ] AppImage can be moved to different directory and still runs
- [ ] No missing library errors

**Linux (.deb)**

- [ ] `sudo dpkg -i` installs without errors
- [ ] All dependencies resolved automatically
- [ ] Executable in PATH (`which automaker`)
- [ ] Desktop file installed (`/usr/share/applications/`)
- [ ] App appears in system launcher

**Linux (.rpm)** _(manual only, not in CI)_

- [ ] `sudo rpm -i` installs on Fedora/CentOS
- [ ] Dependencies resolved
- [ ] Desktop integration works

#### First Launch Experience

- [ ] App launches within 10 seconds
- [ ] Main window renders correctly
- [ ] Window positioned sensibly (centered on screen)
- [ ] Window size appropriate for desktop (not too small/large)
- [ ] No console errors in DevTools
- [ ] Backend server starts automatically
- [ ] Health check endpoint responds (`http://localhost:PORT/api/health`)

**Mock Agent Mode** (CI default):

- [ ] Setup flow renders with "Mock Mode" indicator
- [ ] No API key prompt shown
- [ ] Board view loads with sample features
- [ ] Terminal tab renders

**Real Mode** (production):

- [ ] API key prompt shown on first launch
- [ ] Anthropic API key validation works
- [ ] Invalid key shows clear error message
- [ ] Valid key persists for subsequent launches

#### System Integration

**macOS**

- [ ] App appears in Dock
- [ ] Dock icon shows correct image
- [ ] Right-click Dock → Quit works
- [ ] Cmd+Q quits cleanly
- [ ] App reopens to previous window position
- [ ] Notifications work (if implemented)
- [ ] Touch Bar integration (if implemented)
- [ ] macOS native menu bar present

**Windows**

- [ ] App appears in Taskbar
- [ ] Taskbar icon correct
- [ ] Right-click taskbar → Close works
- [ ] Alt+F4 quits cleanly
- [ ] Windows notifications (if implemented)
- [ ] Windows defender doesn't flag app

**Linux**

- [ ] App appears in system tray/launcher
- [ ] Desktop notifications work
- [ ] Tray icon correct (if implemented)
- [ ] App survives session restart (if configured)

#### Performance

- [ ] Launch time < 10 seconds (cold start)
- [ ] Launch time < 5 seconds (warm start)
- [ ] Memory usage reasonable (< 300MB idle)
- [ ] CPU usage low when idle (< 5%)
- [ ] No memory leaks after extended use (8+ hours)
- [ ] Server startup < 60 seconds
- [ ] UI responsive during agent execution

#### Core Functionality

**Board View**

- [ ] Kanban columns render (Backlog, In Progress, Review, Done)
- [ ] Features can be dragged between columns
- [ ] Feature cards show correct metadata
- [ ] Context menu (right-click) works
- [ ] Filter and search work

**Agent Execution**

- [ ] Start agent button works
- [ ] Agent output streams in real-time
- [ ] Stop agent button works
- [ ] Agent completes successfully
- [ ] Errors displayed clearly
- [ ] Agent logs persisted

**Terminal**

- [ ] Terminal tab renders
- [ ] Command execution works
- [ ] Output displays correctly
- [ ] Scroll history works
- [ ] Terminal resize works
- [ ] Copy/paste works

**Settings**

- [ ] Settings panel opens
- [ ] Settings persist across restarts
- [ ] Validation works (e.g., invalid API key)
- [ ] Reset to defaults works

**File Operations**

- [ ] Project directory picker works
- [ ] File paths validated correctly
- [ ] Read/write operations succeed
- [ ] Path traversal blocked (`@protolabsai/platform`)

#### Window Management

- [ ] Resize window → bounds saved
- [ ] Quit → relaunch → previous bounds restored
- [ ] Minimize/maximize works
- [ ] Full-screen mode works (if implemented)
- [ ] Multiple windows supported (if implemented)
- [ ] Window doesn't overlap system UI (menu bar, taskbar)

#### Updates (if auto-updater enabled)

- [ ] Update notification appears
- [ ] Download progress shown
- [ ] Install on quit works
- [ ] Rollback works on failure
- [ ] "Check for updates" menu item works

#### Accessibility

- [ ] Keyboard navigation works (Tab, Shift+Tab)
- [ ] Focus indicators visible
- [ ] Screen reader announces UI elements (NVDA, VoiceOver)
- [ ] Contrast meets WCAG AA
- [ ] Font size adjustable (if implemented)
- [ ] High contrast mode supported (Windows)

#### Error Handling

- [ ] Network errors shown clearly
- [ ] Server crash recovers gracefully
- [ ] Invalid API key shows helpful message
- [ ] Disk full error handled
- [ ] Permission errors handled (file operations)
- [ ] Logs captured for debugging

### Platform-Specific Issues

#### macOS Known Issues

**Code Signing (unsigned CI builds)**

- ⚠️ First launch: "protoLabs.studio.app cannot be opened because it is from an unidentified developer"
- **Workaround**: Right-click → Open → Open anyway
- **Permanent fix**: Code sign with Developer ID (requires Apple Developer account)

**Quarantine Attributes**

- ⚠️ DMG contents marked as quarantined by macOS
- **Automated fix**: `xattr -cr /path/to/app` (done in smoke test script)
- **User impact**: None if installed via DMG drag-to-Applications

#### Windows Known Issues

**SmartScreen Filter (unsigned builds)**

- ⚠️ "Windows protected your PC" warning on first launch
- **Workaround**: Click "More info" → "Run anyway"
- **Permanent fix**: Code sign with EV certificate (requires Windows Developer account)

**Antivirus False Positives**

- ⚠️ Some antivirus software flags Electron apps
- **Mitigation**: Submit builds to VirusTotal, request whitelist
- **User impact**: App may be quarantined or deleted

**Path Separators**

- ⚠️ Windows uses backslashes (`\`) vs. Unix forward slashes (`/`)
- **Fix**: Use `path.join()` or `@protolabsai/platform` utilities
- **Test**: Verify file operations on Windows

#### Linux Known Issues

**AppImage Permissions**

- ⚠️ AppImage not executable by default
- **Fix**: `chmod +x protoLabs.studio.AppImage`
- **User impact**: Must run from terminal first time

**DEB Dependencies**

- ⚠️ Missing dependencies on minimal installs
- **Fix**: `sudo apt-get install -f`
- **Test**: Verify on clean Ubuntu 22.04 LTS

**Display Server (Xvfb)**

- ⚠️ Headless testing requires Xvfb
- **Fix**: `xvfb-run ./app` or install display server
- **CI**: Automated in smoke test script

**GPU Acceleration**

- ⚠️ Some VMs/containers lack GPU
- **Fix**: Electron auto-falls back to software rendering
- **Impact**: Slightly slower UI rendering

## Debugging Tips

### View Logs

**macOS**

```bash
# App logs
~/Library/Logs/protoLabs.studio/main.log

# Electron logs
~/Library/Application Support/protoLabs.studio/logs/
```

**Windows**

```powershell
# App logs
%USERPROFILE%\AppData\Roaming\protoLabs.studio\logs\main.log
```

**Linux**

```bash
# App logs
~/.config/protoLabs.studio/logs/main.log
```

### Open DevTools

**Enable DevTools in production builds:**

```bash
# macOS/Linux
ELECTRON_ENABLE_LOGGING=1 /path/to/app --remote-debugging-port=9222

# Windows
set ELECTRON_ENABLE_LOGGING=1 && C:\path\to\app.exe --remote-debugging-port=9222
```

Then open Chrome to `chrome://inspect` and click "Configure" → `localhost:9222`

### Test with Mock Agent

Skip real API calls during testing:

```bash
AUTOMAKER_MOCK_AGENT=true /path/to/app
```

### Test Auto-Login

Skip API key prompt:

```bash
AUTOMAKER_AUTO_LOGIN=true /path/to/app
```

### Inspect Packaged Server

The bundled server is in:

- macOS: `protoLabs.studio.app/Contents/Resources/server/`
- Windows: `resources/server/`
- Linux: `resources/server/`

Check server logs:

```bash
# macOS
/path/to/app/Contents/Resources/server/logs/

# Windows
C:\path\to\app\resources\server\logs\

# Linux
/path/to/app/resources/server/logs/
```

## CI Build Artifacts

**Location**: GitHub Actions → Workflow runs → Artifacts

**Available after tag push:**

- `mac-builds` - DMG + ZIP (universal x64/arm64)
- `windows-builds` - NSIS installer (x64)
- `linux-builds` - AppImage + DEB + RPM (x64)

**Test results (on failure):**

- `mac-test-results` - Screenshots, traces, logs
- `windows-test-results` - Screenshots, traces, logs
- `linux-test-results` - Screenshots, traces, logs

**Retention**: 30 days for release builds, 7 days for test artifacts

## Known Limitations

### Not Tested in CI

- ❌ RPM installation (no RPM-based runner)
- ❌ ARM Linux (no ARM64 GitHub runner)
- ❌ Older OS versions (only latest runner versions)
- ❌ GPU acceleration (runners have no GPU)
- ❌ Code signing (no certificates in CI)
- ❌ Auto-updater (not implemented yet)

### Manual Testing Required

- **Signed Builds**: Code signing behavior differs from unsigned CI builds
- **Older OS Versions**: macOS 11, Windows 10, Ubuntu 20.04
- **ARM Architecture**: Apple Silicon native performance, ARM Linux
- **UI Interactions**: Advanced workflows beyond smoke tests
- **Performance**: Launch time, memory usage, long-running stability
- **Accessibility**: Screen reader compatibility, keyboard navigation

## Troubleshooting

### Build Fails in CI

**Symptom**: `build-mac` or `build-windows` job fails
**Diagnosis**: Check logs for native module compilation errors
**Fix**: Ensure `node-pty` and Rollup/Tailwind dependencies build correctly

### Smoke Test Times Out

**Symptom**: Test fails with "Timed out waiting for server"
**Diagnosis**: Server took > 90s to start
**Fix**: Check server logs for errors, verify port scanning works

### AppImage Won't Execute

**Symptom**: `./protoLabs.studio.AppImage: Permission denied`
**Fix**: `chmod +x protoLabs.studio.AppImage`

### DMG Won't Mount (macOS)

**Symptom**: `hdiutil: attach failed - Resource busy`
**Fix**: Unmount previous DMG → `hdiutil detach /Volumes/protoLabs`

### NSIS Installer Fails (Windows)

**Symptom**: Silent install returns non-zero exit code
**Diagnosis**: Check installer log in `%TEMP%`
**Fix**: Verify install directory has write permissions

### DEB Install Fails (Linux)

**Symptom**: `dpkg: dependency problems`
**Fix**: `sudo apt-get install -f` to auto-resolve dependencies

## Release Checklist

Before tagging a release candidate:

- [ ] All smoke tests pass in CI
- [ ] Manual testing checklist complete (this document)
- [ ] Known issues documented in release notes
- [ ] Version number updated in `apps/ui/package.json`
- [ ] Changelog updated
- [ ] Screenshots updated (if UI changed)
- [ ] Documentation updated (if features added)

Tag release candidate:

```bash
git tag v1.0.0-rc.1
git push origin v1.0.0-rc.1
```

Monitor CI workflow → Wait for smoke tests → Download artifacts → Manual test

If issues found:

1. Fix bugs
2. Tag new RC (`v1.0.0-rc.2`)
3. Repeat

When RC stable:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Release created automatically with all platform builds attached.

## Additional Resources

- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [electron-builder Docs](https://www.electron.build/)
- [Playwright Electron Testing](https://playwright.dev/docs/api/class-electron)
- [GitHub Actions - Building Electron Apps](https://github.com/electron/action-electron-builder)
