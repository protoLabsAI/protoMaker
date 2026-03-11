# Headless Server + Remote Client Architecture

Split Automaker into headless server instances and lightweight "legless" clients (Electron + web) that connect to any server in the hive.

**Three deployment modes:**
1. **Headless server** — runs backend only, no UI, configured for 2-agent team via proto.config.yaml
2. **Legless Electron** — desktop app without bundled server, connects to remote server URL
3. **Legless web app** — same UI served statically, connects to configurable server

**Key feature: Server URL switching in Developer Settings**
- Input field + dropdown in developer section to change the connected server URL at runtime
- Auto-discovers instances from the hivemind mesh (peers broadcast identity with url, name, role, capacity)
- Remembers recent connections (localStorage) for quick switching between dev/staging/etc.
- Shows instance health indicators (online/offline, agent count, capacity)

**Why:** Josh needs to toggle between staging and dev views from one client, see what each instance sees, and have a lightweight Mac client that doesn't run its own server. Dev can tap into any instance in the hive when needed.

**Status:** active
**Created:** 2026-03-10T01:41:48.204Z
**Updated:** 2026-03-10T01:46:43.068Z

## Milestones

### 1. Server URL Runtime Switching

Add runtime server URL override to auth layer and a Server Connection section in Developer Settings with recent connection history.

**Status:** undefined

#### Phases

1. **Server URL override in auth layer + app store** (medium)
2. **Server Connection section in Developer Settings** (medium)
3. **Instance name indicator + quick toggle in bottom panel** (medium)

### 2. Hivemind Instance Picker + Build Targets

Auto-discover hive instances for the server picker, add legless Electron and web build scripts, and headless server config.

**Status:** undefined

#### Phases

1. **Hivemind instance auto-discovery in server picker** (medium)
2. **Legless Electron build + headless server config** (medium)
