# Terminal

The integrated terminal provides a full-featured terminal emulator within Automaker, powered by xterm.js.

## Configuration

Configure the terminal via environment variables in `apps/server/.env`:

### Disable Terminal Completely

```
TERMINAL_ENABLED=false
```

Set to `false` to completely disable the terminal feature.

### Password Protection

```
TERMINAL_PASSWORD=yourpassword
```

By default, the terminal is **not password protected**. Add this variable to require a password.

When password protection is enabled:

- Enter the password in **Settings > Terminal** to unlock
- The terminal remains unlocked for the session
- You can toggle password requirement on/off in settings after unlocking

## Keyboard Shortcuts

When the terminal is focused, the following shortcuts are available:

| Shortcut | Action                                  |
| -------- | --------------------------------------- |
| `Alt+T`  | Open new terminal tab                   |
| `Alt+D`  | Split terminal right (horizontal split) |
| `Alt+S`  | Split terminal down (vertical split)    |
| `Alt+W`  | Close current terminal                  |

These shortcuts are customizable via the keyboard shortcuts settings (Settings > Keyboard Shortcuts).

### Split Pane Navigation

Navigate between terminal panes using directional shortcuts:

| Shortcut                          | Action                               |
| --------------------------------- | ------------------------------------ |
| `Ctrl+Alt+ArrowUp` (or `Cmd+Alt`) | Move focus to terminal pane above    |
| `Ctrl+Alt+ArrowDown`              | Move focus to terminal pane below    |
| `Ctrl+Alt+ArrowLeft`              | Move focus to terminal pane on left  |
| `Ctrl+Alt+ArrowRight`             | Move focus to terminal pane on right |

The navigation is spatially aware - pressing Down will move to the terminal below your current one, not just cycle through terminals in order.

Global shortcut (works anywhere in the app):
| Shortcut | Action |
|----------|--------|
| `Cmd+`` (Mac) / `Ctrl+`` (Windows/Linux) | Toggle terminal view |

## Features

### Multiple Terminals

- Create multiple terminal tabs using the `+` button
- Split terminals horizontally or vertically within a tab
- Drag terminals to rearrange them

### Theming

The terminal automatically matches your app theme. Supported themes include:

- Light / Dark / System
- Retro, Dracula, Nord, Monokai
- Tokyo Night, Solarized, Gruvbox
- Catppuccin, One Dark, Synthwave, Red

### Font Size

- Use the zoom controls (`+`/`-` buttons) in each terminal panel
- Or use `Cmd/Ctrl + Scroll` to zoom

### Scrollback

- The terminal maintains a scrollback buffer of recent output
- Scroll up to view previous output
- Output is preserved when reconnecting

## Architecture

The terminal uses a client-server architecture:

1. **Frontend** (`apps/ui`): xterm.js terminal emulator with WebGL rendering
2. **Backend** (`apps/server`): node-pty for PTY (pseudo-terminal) sessions

Communication happens over WebSocket for real-time bidirectional data flow.

### Shell Detection

The server automatically detects the best shell:

- **WSL**: User's shell or `/bin/bash`
- **macOS**: User's shell, zsh, or bash
- **Linux**: User's shell, bash, or sh
- **Windows**: PowerShell 7, PowerShell, or cmd.exe

## Troubleshooting

### Terminal not connecting

1. Ensure the server is running (`npm run dev:server`)
2. Check that port 3008 is available
3. Verify the terminal is unlocked

### Slow performance with heavy output

The terminal throttles output at ~60fps to prevent UI lockup. Very fast output (like `cat` on large files) will be batched.

### Shortcuts not working

- Ensure the terminal is focused (click inside it)
- Some system shortcuts may conflict (especially Alt+Shift combinations on Windows)
