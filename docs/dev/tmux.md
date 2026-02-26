# tmux Setup & User Guide

tmux is a terminal multiplexer that lets you run persistent sessions with multiple windows and split panes. It's especially useful for running the dev server, watching logs, and keeping a shell open simultaneously — all in one terminal.

## Installation

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Verify
tmux -V
```

---

## Workspace Automation (tmuxinator)

tmuxinator lets you define a session layout in YAML and spin it up with one command. This is the recommended way to start your dev environment.

### Installation

```bash
# macOS
brew install tmuxinator

# Ubuntu/Debian
sudo apt install tmuxinator
# or via gem if apt version is outdated:
gem install tmuxinator
```

Add shell completion to `~/.zshrc`:

```bash
# macOS (Homebrew) — glob handles version bumps on upgrade
source $(ls /opt/homebrew/Cellar/tmuxinator/*/libexec/gems/tmuxinator-*/completion/tmuxinator.zsh | tail -1)

# Linux (gem install)
source ~/.local/share/tmuxinator/tmuxinator.zsh

# The 'mux' shorthand is NOT set up automatically — add it manually
alias mux="tmuxinator"
```

### protolabs workspace

The team workspace config lives at `~/.config/tmuxinator/protolabs.yml`:

```yaml
name: protolabs
root: ~/dev/automaker

windows:
  - workspace:
      layout: even-horizontal
      panes:
        - dev:
            - git checkout dev
            - git pull origin dev
            - npm run dev
        - ava:
            - sleep 4 && claude --dangerously-skip-permissions /ava
```

**What it does:**

| Pane        | Commands                                                         |
| ----------- | ---------------------------------------------------------------- |
| Left (dev)  | Checks out `dev`, pulls latest from origin, starts `npm run dev` |
| Right (ava) | Waits 4 seconds for the server to boot, then launches Ava        |

### Usage

```bash
mux start protolabs    # start the workspace
mux stop protolabs     # stop and kill the session
mux edit protolabs     # open the config in $EDITOR
mux new <name>         # scaffold a new workspace config
mux list               # list all configs
```

> `mux` is the tmuxinator shorthand alias included by default.

---

## Config

Create `~/.tmux.conf` with the following. This is the team's recommended baseline:

```bash
# ─── General ──────────────────────────────────────────────────────────────────
set -g mouse on                    # click to select panes/windows, scroll
set -g history-limit 20000         # longer scrollback
set -g base-index 1                # windows start at 1
setw -g pane-base-index 1          # panes start at 1
set -g renumber-windows on         # re-number when a window closes
set -g escape-time 0               # no delay after Esc (important for vim/nvim)
set -g focus-events on             # pass focus events through (for editors)
set -g default-terminal "screen-256color"
set -ga terminal-overrides ",xterm-256color:Tc"  # true color

# ─── Key Bindings ─────────────────────────────────────────────────────────────
# Reload config
bind r source-file ~/.tmux.conf \; display "tmux config reloaded"

# Intuitive splits that open in current directory
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
unbind '"'
unbind %

# New windows open in current directory
bind c new-window -c "#{pane_current_path}"

# Vim-style pane navigation
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R

# Resize panes with Ctrl+b + HJKL (repeatable)
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# ─── Copy Mode ────────────────────────────────────────────────────────────────
setw -g mode-keys vi               # vi keys in copy mode
bind [ copy-mode
bind -T copy-mode-vi v send -X begin-selection
bind -T copy-mode-vi y send -X copy-selection-and-cancel
bind -T copy-mode-vi Escape send -X cancel

# ─── Status Bar ───────────────────────────────────────────────────────────────
set -g status on
set -g status-position bottom
set -g status-interval 5

set -g status-style                bg='#1a1a2e',fg='#a9b1d6'
set -g window-status-style         bg='#1a1a2e',fg='#565f89'
set -g window-status-current-style bg='#0f3460',fg='#7aa2f7',bold
set -g pane-border-style           fg='#3b4261'
set -g pane-active-border-style    fg='#7aa2f7'
set -g message-style               bg='#0f3460',fg='#7aa2f7'

set -g status-left-length 30
set -g status-left " #[fg=#7aa2f7,bold]#S #[fg=#3b4261]│ "

set -g status-right-length 60
set -g status-right "#[fg=#565f89]%H:%M  #[fg=#7aa2f7]#h "

set -g window-status-format         " #I:#W "
set -g window-status-current-format " #I:#W "
set -g window-status-separator ""
```

Reload without restarting:

```bash
# From inside tmux
Ctrl+b r

# Or from any shell
tmux source-file ~/.tmux.conf
```

---

## Core Concepts

tmux has three levels:

| Level       | Description                                      |
| ----------- | ------------------------------------------------ |
| **Session** | A persistent workspace. Survives terminal close. |
| **Window**  | A tab within a session.                          |
| **Pane**    | A split within a window.                         |

The **prefix key** is `Ctrl+b` — press it before every tmux command.

---

## Key Bindings Reference

### Sessions

| Action                        | Key        |
| ----------------------------- | ---------- |
| Detach (keep session running) | `Ctrl+b d` |
| List / switch sessions        | `Ctrl+b s` |
| Rename session                | `Ctrl+b $` |

```bash
tmux new -s protolabs       # new named session
tmux attach -t protolabs    # re-attach
tmux ls                     # list sessions
tmux kill-session -t name   # kill a session
```

### Windows

| Action           | Key                     |
| ---------------- | ----------------------- |
| New window       | `Ctrl+b c`              |
| Next / previous  | `Ctrl+b n` / `Ctrl+b p` |
| Jump to window N | `Ctrl+b 1-9`            |
| Rename window    | `Ctrl+b ,`              |
| Close window     | `Ctrl+b &`              |

### Panes

| Action                        | Key                     |
| ----------------------------- | ----------------------- |
| Split vertical (side by side) | `Ctrl+b \|`             |
| Split horizontal (top/bottom) | `Ctrl+b -`              |
| Navigate panes                | `Ctrl+b h/j/k/l`        |
| Zoom pane (toggle fullscreen) | `Ctrl+b z`              |
| Resize pane                   | `Ctrl+b H/J/K/L`        |
| Close pane                    | `Ctrl+b x`              |
| Swap panes                    | `Ctrl+b {` / `Ctrl+b }` |

### Copy Mode

| Action          | Key             |
| --------------- | --------------- |
| Enter copy mode | `Ctrl+b [`      |
| Start selection | `v`             |
| Copy selection  | `y`             |
| Exit            | `q` or `Escape` |

Scroll with arrow keys or mouse wheel while in copy mode.

---

## Recommended Dev Workflow

A three-pane layout works well for this project:

```bash
# Create a session
tmux new -s protolabs

# Split into three panes
Ctrl+b |        # vertical split → editor left, right side open
Ctrl+b -        # horizontal split right side → server top, logs bottom

# Pane layout:
# ┌─────────────┬─────────────┐
# │             │  npm run    │
# │   editor /  │  dev:web    │
# │   shell     ├─────────────┤
# │             │  git / logs │
# └─────────────┴─────────────┘
```

Detach and come back any time:

```bash
Ctrl+b d                    # detach
tmux attach -t protolabs    # re-attach later
```

---

## Shell Autocomplete (zsh)

These work inside tmux panes and give you Warp-style autocomplete in any terminal.

### Installation

```bash
# macOS
brew install fzf zsh-autosuggestions zsh-syntax-highlighting

# Ubuntu/Debian
sudo apt install fzf zsh-autosuggestions zsh-syntax-highlighting
```

### ~/.zshrc config

Add the following at the bottom of `~/.zshrc`, after `source $ZSH/oh-my-zsh.sh`:

```bash
# ─── Autocomplete ─────────────────────────────────────────────────────────────
# Ghost text from history (accept with → or Ctrl+E)

# macOS (Homebrew)
source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh
# Linux (apt/manual)
# source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh

ZSH_AUTOSUGGEST_STRATEGY=(history completion)  # history first, then zsh completions
ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=20
bindkey '^ ' autosuggest-accept                # Ctrl+Space to accept suggestion

# Syntax highlighting — green = valid command, red = not found
# Must be sourced AFTER all other plugins
# macOS (Homebrew)
source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
# Linux (apt/manual)
# source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# fzf — fuzzy finder (Ctrl+R, Ctrl+T, Alt+C)
source <(fzf --zsh)
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border --info=inline'
```

Then reload:

```bash
source ~/.zshrc
```

### Key bindings

| Action                        | Key             |
| ----------------------------- | --------------- |
| Accept ghost text suggestion  | `→` or `Ctrl+E` |
| Accept one word of suggestion | `Ctrl+F`        |
| Accept with Ctrl+Space        | `Ctrl+Space`    |
| Fuzzy history search          | `Ctrl+R`        |
| Fuzzy file picker             | `Ctrl+T`        |
| Fuzzy cd into subdirectory    | `Alt+C`         |

The ghost text pulls from two sources in order: command history first, then zsh's tab completions. The more you use the shell, the smarter the suggestions get.

---

## Optional: Plugin Manager (TPM)

[TPM](https://github.com/tmux-plugins/tpm) adds plugin support:

```bash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

Add to the bottom of `~/.tmux.conf`:

```bash
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'   # sane defaults
set -g @plugin 'tmux-plugins/tmux-resurrect'  # save/restore sessions across reboots
run '~/.tmux/plugins/tpm/tpm'
```

Install plugins with `Ctrl+b I` (capital I) from inside tmux.

---

## Cheatsheet

```
Ctrl+b ?          show all bindings
Ctrl+b d          detach
Ctrl+b s          switch session
Ctrl+b c          new window
Ctrl+b |          split right
Ctrl+b -          split down
Ctrl+b h/j/k/l    move between panes
Ctrl+b z          zoom current pane
Ctrl+b [          enter scroll/copy mode
Ctrl+b r          reload ~/.tmux.conf
```
