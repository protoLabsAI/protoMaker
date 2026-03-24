# Building Desktop Apps with Tauri v2 + React

A practical guide to wrapping any React web app in a native desktop shell using Tauri v2. Covers project setup, system tray, global hotkeys, hide-on-close behavior, and macOS-specific requirements.

## Prerequisites

- Node.js 22+
- Rust toolchain: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
- **Windows**: Visual Studio C++ Build Tools + WebView2

## Architecture

```
your-app/
├── src/                    # React app (Vite, Next, CRA, etc.)
├── src-tauri/
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Window, tray, security config
│   ├── build.rs            # Tauri build hook
│   ├── icons/              # App + tray icons
│   └── src/
│       └── main.rs         # Native behavior (tray, hotkeys, events)
├── package.json
└── dist/                   # Built React app (Tauri serves this in production)
```

Tauri uses the system WebView (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux) — no bundled Chromium. Result: ~3-5MB binary vs Electron's ~150MB.

## Step 1: Create the Tauri Shell

### Cargo.toml

```toml
[package]
name = "my-app"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Release optimizations — strips debug info, enables LTO
[profile.release]
strip = true
lto = true
codegen-units = 1
panic = "abort"
```

### build.rs

```rust
fn main() {
    tauri_build::build()
}
```

### tauri.conf.json

```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-config-schema/schema.json",
  "productName": "My App",
  "version": "0.1.0",
  "identifier": "com.mycompany.myapp",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "My App",
        "width": 440,
        "height": 720,
        "minWidth": 360,
        "minHeight": 500,
        "decorations": true,
        "alwaysOnTop": false,
        "resizable": true
      }
    ],
    "trayIcon": {
      "iconPath": "icons/tray-icon.png",
      "iconAsTemplate": true,
      "tooltip": "My App"
    },
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    }
  },
  "plugins": {}
}
```

**Key config decisions:**

| Field                | What it does                       | Common values                             |
| -------------------- | ---------------------------------- | ----------------------------------------- |
| `frontendDist`       | Where the built React app lives    | `../dist` (Vite), `../build` (CRA)        |
| `devUrl`             | Dev server URL for hot reload      | `http://localhost:5173` (Vite)            |
| `beforeDevCommand`   | Starts dev server automatically    | `npm run dev`                             |
| `beforeBuildCommand` | Builds frontend before Tauri build | `npm run build`                           |
| `decorations`        | Native title bar                   | `true` (native), `false` (custom)         |
| `alwaysOnTop`        | Float above other windows          | `true` for utility panels                 |
| `iconAsTemplate`     | macOS menu bar icon style          | `true` (monochrome, adapts to light/dark) |

### Connecting to a Remote URL (no bundled frontend)

If your React app runs as a separate server (like protoLabs Studio), point the window at the URL instead of bundling:

```json
{
  "app": {
    "windows": [
      {
        "url": "http://localhost:3007",
        "title": "My App"
      }
    ]
  },
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:3007",
    "beforeDevCommand": "",
    "beforeBuildCommand": ""
  }
}
```

Create a minimal `dist/index.html` fallback:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My App</title>
  </head>
  <body>
    <script>
      window.location.href = 'http://localhost:3007';
    </script>
  </body>
</html>
```

## Step 2: Native Behavior (main.rs)

### Minimal — Just a Window

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running app");
}
```

### Full Featured — Tray + Hotkey + Hide on Close

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // ── System Tray ────────────────────────────────────
            let show = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("My App")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => toggle_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // ── Global Hotkey ──────────────────────────────────
            // Cmd+Shift+A on Mac, Ctrl+Shift+A on Windows/Linux
            let shortcut = Shortcut::new(
                Some(Modifiers::SUPER | Modifiers::SHIFT),
                Code::KeyA,
            );
            app.global_shortcut().register(shortcut)?;

            Ok(())
        })
        // Hide on close — app stays in tray
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running app");
}
```

## Step 3: Icons

### App Icon

Tauri needs multiple sizes. Use the Tauri icon generator:

```bash
npx @tauri-apps/cli icon src-tauri/icons/app-icon-1024.png
```

This generates all required sizes from a 1024x1024 source PNG.

### Tray Icon (macOS)

macOS menu bar icons must be **template images**:

- **Size**: 22x22px (44x44 for @2x retina)
- **Color**: White shapes on transparent background
- **Format**: PNG
- **Naming**: File must be referenced in `tauri.conf.json` with `iconAsTemplate: true`

macOS automatically adjusts template icons for light/dark mode and vibrancy.

```
icons/
├── icon.png              # App icon (256x256 minimum)
├── tray-icon.png         # Menu bar icon (22x22, white on transparent)
└── tray-icon@2x.png      # Retina menu bar icon (44x44)
```

### Linux Tray Icon

Linux uses the `ayatana-appindicator` library. Icons should be:

- 22x22 or 24x24 PNG
- Full color (not template)
- Placed in the `icons/` directory

## Step 4: package.json Scripts

```json
{
  "scripts": {
    "dev": "cd src-tauri && cargo tauri dev",
    "build": "cd src-tauri && cargo tauri build",
    "build:release": "cd src-tauri && cargo tauri build --release"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2"
  }
}
```

## Step 5: Build and Distribute

### Development

```bash
npm run dev
# or directly:
cd src-tauri && cargo tauri dev
```

This starts your React dev server and the Tauri window with hot reload.

### Production Build

```bash
npm run build:release
```

Output location by platform:

| Platform | Output                                                 |
| -------- | ------------------------------------------------------ |
| macOS    | `src-tauri/target/release/bundle/dmg/MyApp.dmg`        |
| Windows  | `src-tauri/target/release/bundle/nsis/MyApp-setup.exe` |
| Linux    | `src-tauri/target/release/bundle/deb/myapp.deb`        |

### Binary Sizes (Release Build)

| Component               | Size       |
| ----------------------- | ---------- |
| Tauri binary            | ~3-5MB     |
| App bundle (macOS .app) | ~8-12MB    |
| DMG installer           | ~5-8MB     |
| Electron equivalent     | ~150-200MB |

## Common Patterns

### Send Data from React to Rust

```rust
// main.rs — define a command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

// Register in builder
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![greet])
```

```typescript
// React — call the command
import { invoke } from '@tauri-apps/api/core';
const result = await invoke('greet', { name: 'Ava' });
```

### Send Events from Rust to React

```rust
// Rust — emit to frontend
app.emit("update", serde_json::json!({ "count": 42 })).unwrap();
```

```typescript
// React — listen for events
import { listen } from '@tauri-apps/api/event';
const unlisten = await listen('update', (event) => {
  console.log(event.payload); // { count: 42 }
});
```

### Custom Title Bar (Frameless Window)

```json
{
  "app": {
    "windows": [
      {
        "decorations": false,
        "transparent": true
      }
    ]
  }
}
```

Then in React, add a drag region:

```tsx
<div data-tauri-drag-region className="h-8 flex items-center px-4 select-none">
  <span className="text-sm font-medium">My App</span>
</div>
```

### Multiple Windows

```rust
// Open a second window from Rust
tauri::WebviewWindowBuilder::new(
    app,
    "settings",
    tauri::WebviewUrl::App("/settings".into()),
)
.title("Settings")
.inner_size(600.0, 400.0)
.build()?;
```

### File Drag and Drop

```typescript
import { listen } from '@tauri-apps/api/event';

await listen('tauri://drag-drop', (event) => {
  const paths = event.payload.paths as string[];
  // Handle dropped files
});
```

### Auto-Updater

Add to `Cargo.toml`:

```toml
tauri-plugin-updater = "2"
```

Configure update endpoint in `tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://releases.myapp.com/{{target}}/{{arch}}/{{current_version}}"],
      "pubkey": "YOUR_PUBLIC_KEY"
    }
  }
}
```

## macOS-Specific Notes

### Accessibility Permissions

Global shortcuts require accessibility permissions on macOS. The OS will prompt the user on first launch. If denied, shortcuts won't work but the tray icon will.

### App Activation

When showing a hidden window from a background state, you may need to activate the app:

```rust
fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            // On macOS, activate the app to bring it to the foreground
            #[cfg(target_os = "macos")]
            let _ = app.show();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
```

### Code Signing

For distribution outside the Mac App Store:

```bash
# Sign the app
cargo tauri build --release
codesign --deep --force --sign "Developer ID Application: Your Name" \
  target/release/bundle/macos/MyApp.app

# Notarize
xcrun notarytool submit target/release/bundle/dmg/MyApp.dmg \
  --apple-id your@email.com --team-id TEAMID --password app-specific-password
```

## Troubleshooting

| Issue                 | Cause                                         | Fix                                                            |
| --------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| White dot in tray     | Icon not loading or wrong format              | Use 22x22 white-on-transparent PNG with `iconAsTemplate: true` |
| No tray context menu  | Menu not attached or event handler mismatch   | Verify `TrayIconBuilder::menu()` is called with the menu       |
| Hotkey doesn't work   | Accessibility permissions denied              | System Preferences > Security > Accessibility > enable app     |
| Window doesn't appear | `window.show()` without `app.show()` on macOS | Add `app.show()` before `window.show()` on macOS               |
| Blank white window    | Frontend not running or wrong URL             | Check `devUrl` matches your dev server port                    |
| Build fails on Linux  | Missing system libs                           | Install `libwebkit2gtk-4.1-dev libgtk-3-dev`                   |
| Large binary size     | Debug build                                   | Use `cargo tauri build --release` with LTO config              |

## Starter Template Checklist

When creating a new Tauri + React desktop app:

- [ ] `Cargo.toml` with tauri v2, tray-icon feature, global-shortcut plugin
- [ ] `tauri.conf.json` with window config, tray icon, security CSP
- [ ] `build.rs` with `tauri_build::build()`
- [ ] `main.rs` with tray, hotkey, hide-on-close
- [ ] App icon (1024x1024 source + generated sizes)
- [ ] Tray icon (22x22 + 44x44 @2x, white on transparent for macOS)
- [ ] `package.json` with dev/build scripts
- [ ] `.gitignore` entries for `src-tauri/target/`, `src-tauri/gen/`
