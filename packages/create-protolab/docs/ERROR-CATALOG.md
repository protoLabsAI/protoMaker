# Error Catalog

Complete reference of all error codes with examples, root causes, and step-by-step fixes.

## Quick Reference Table

| Code | Error                        | Severity | Component     |
| ---- | ---------------------------- | -------- | ------------- |
| E001 | Not a git repository         | High     | Git           |
| E002 | No write access              | High     | Filesystem    |
| E003 | Claude CLI not found         | High     | CLI Tools     |
| E004 | Beads CLI not found          | High     | CLI Tools     |
| E005 | jq not installed             | High     | CLI Tools     |
| E006 | Server not running           | Medium   | Automaker     |
| E007 | Connection timeout           | Medium   | Network       |
| E008 | SSL/TLS error                | Medium   | Network       |
| E009 | Beads init failed            | High     | Beads         |
| E010 | Bead permission error        | High     | Filesystem    |
| E011 | Automaker init failed        | High     | Automaker     |
| E012 | Automaker file error         | High     | Filesystem    |
| E013 | Plugin marketplace not found | Medium   | Claude Plugin |
| E014 | Plugin install failed        | Medium   | Claude Plugin |
| E015 | Plugin incompatible          | Medium   | Claude Plugin |
| E016 | GitHub API rate limited      | Low      | GitHub        |
| E017 | Cannot create workflows      | Medium   | CI/CD         |
| E018 | Branch protection failed     | Medium   | GitHub        |
| E019 | Invalid path format          | High     | Platform      |

---

## Error Details

### E001: Not a git repository

**Full Message:**

```
✗ Not a git repository
  Project directory exists but .git/ not found
```

**Root Causes:**

- Directory is not initialized as a git repository
- .git directory was deleted or moved
- Directory is a subdirectory of a git repo (inherits parent's git)
- Git initialization failed

**Example Scenario:**

```bash
$ mkdir my-project
$ cd my-project
$ ./scripts/setup-protolab.sh .
✗ Not a git repository
```

**Step-by-Step Fix:**

1. **Check if .git exists:**

   ```bash
   ls -la | grep .git
   ```

2. **If missing, initialize git:**

   ```bash
   git init
   ```

3. **Configure git user (if first time):**

   ```bash
   git config user.email "you@example.com"
   git config user.name "Your Name"
   ```

4. **Create initial commit:**

   ```bash
   git add .
   git commit -m "Initial commit"
   ```

5. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh .
   ```

**Related Errors:** E002, E010

**Prevention:**

```bash
# Always initialize git first
git init
git config user.email "you@example.com"
git config user.name "Your Name"

# Then run setup
./scripts/setup-protolab.sh .
```

---

### E002: No write access to directory

**Full Message:**

```
✗ No write access to directory
  Cannot create files in project directory
```

**Root Causes:**

- Directory owned by different user
- File permissions are too restrictive
- Directory is read-only (mounted as read-only)
- Insufficient disk space
- SELinux/AppArmor restrictions
- Directory is on shared/mounted filesystem

**Example Scenario:**

```bash
$ ls -la /path/to/project
drwxr-xr-- 1 otheruser staff ... project

$ ./scripts/setup-protolab.sh /path/to/project
✗ No write access to directory
```

**Step-by-Step Fix:**

1. **Check current user:**

   ```bash
   whoami
   # Output: your-username
   ```

2. **Check directory ownership:**

   ```bash
   ls -la /path/to/project
   # Look at owner (3rd column)
   ```

3. **Check permissions:**

   ```bash
   stat /path/to/project
   # Look for "Access:" permissions
   ```

4. **Fix ownership (if you have sudo access):**

   ```bash
   sudo chown -R $(whoami) /path/to/project
   ```

5. **Fix permissions:**

   ```bash
   chmod u+w /path/to/project
   chmod u+w /path/to/project/.git
   ```

6. **Check disk space:**

   ```bash
   df -h /path/to/project
   # Ensure Avail is > 1GB
   ```

7. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E010, E012, E019

**Prevention:**

```bash
# Ensure you own the directory
mkdir -p ~/projects/my-project
cd ~/projects/my-project

# Then initialize and setup
git init
./scripts/setup-protolab.sh .
```

---

### E003: Claude CLI not found

**Full Message:**

```
✗ Claude CLI is not installed
  Install from: https://claude.ai/code
```

**Root Causes:**

- Claude CLI not installed on system
- Claude CLI not in PATH environment variable
- Claude CLI installed with different name
- Old incompatible version
- npm global installation failed
- Permission issue with npm -g

**Example Scenario:**

```bash
$ which claude
# (no output - command not found)

$ ./scripts/setup-protolab.sh /path/to/project
✗ Claude CLI is not installed
```

**Step-by-Step Fix:**

1. **Check if installed:**

   ```bash
   which claude
   claude --version
   ```

2. **Install via npm (recommended):**

   ```bash
   npm install -g @anthropic-ai/claude-cli
   ```

3. **Or download from official source:**

   ```bash
   # Visit https://claude.ai/code and follow instructions
   ```

4. **Verify installation:**

   ```bash
   claude --version
   # Output: claude version X.X.X
   ```

5. **If installed but not in PATH:**

   ```bash
   # Find where it's installed
   find ~/.local -name claude 2>/dev/null
   find ~/.npm -name claude 2>/dev/null

   # Add to PATH in ~/.bashrc or ~/.zshrc
   export PATH="$HOME/.local/bin:$HOME/.npm/bin:$PATH"
   source ~/.bashrc
   ```

6. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E004, E005, E013, E014

**Platform-Specific:**

**macOS with Homebrew:**

```bash
brew install anthropics/tap/claude
```

**Linux with Apt:**

```bash
# May need to add tap/PPA first
sudo apt-get install claude
```

**Windows with Chocolatey:**

```bash
choco install claude
```

**Prevention:**

```bash
# Always install prerequisites first
npm install -g @anthropic-ai/claude-cli @jlowin/beads

# Verify
claude --version
bd --version
```

---

### E004: Beads CLI not found

**Full Message:**

```
✗ beads CLI (bd) is not installed
  Install from: https://github.com/jlowin/beads
```

**Root Causes:**

- Beads not installed
- Beads not in PATH
- Old/incompatible version
- Installation corrupted
- Wrong architecture (arm64 vs x86_64)

**Example Scenario:**

```bash
$ which bd
# (no output)

$ ./scripts/setup-protolab.sh /path/to/project
✗ beads CLI (bd) is not installed
```

**Step-by-Step Fix:**

1. **Check if installed:**

   ```bash
   which bd
   bd --version
   ```

2. **Install latest Beads:**

   ```bash
   # Official installer
   curl -fsSL https://get.beads.sh | bash
   ```

3. **Or via Homebrew (macOS):**

   ```bash
   brew install jlowin/tap/beads
   ```

4. **Or via Cargo (if Rust installed):**

   ```bash
   cargo install beads
   ```

5. **Or build from source:**

   ```bash
   git clone https://github.com/jlowin/beads.git
   cd beads
   cargo install --path .
   ```

6. **Verify installation:**

   ```bash
   bd --version
   # Output: beads X.X.X
   ```

7. **Add to PATH if needed:**

   ```bash
   # Find installation
   which bd

   # Add directory to PATH in ~/.bashrc or ~/.zshrc
   export PATH="$PATH:$(dirname $(which bd))"
   ```

8. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E003, E005, E009

**Prevention:**

```bash
# Install all CLIs upfront
curl -fsSL https://get.beads.sh | bash
npm install -g @anthropic-ai/claude-cli
sudo apt-get install jq  # Or brew install jq on macOS

# Verify all
bd --version
claude --version
jq --version
```

---

### E005: jq not installed

**Full Message:**

```
✗ jq is not installed
  Install from: https://stedolan.github.io/jq/ or your package manager
```

**Root Causes:**

- jq not installed
- jq not in PATH
- Old incompatible version
- JSON parsing library missing

**Example Scenario:**

```bash
$ jq --version
# (command not found)

$ ./scripts/setup-protolab.sh /path/to/project
✗ jq is not installed
```

**Step-by-Step Fix:**

1. **Check if installed:**

   ```bash
   which jq
   jq --version
   ```

2. **Install via package manager:**

   **macOS (Homebrew):**

   ```bash
   brew install jq
   ```

   **Ubuntu/Debian:**

   ```bash
   sudo apt-get update
   sudo apt-get install jq
   ```

   **Fedora/RHEL:**

   ```bash
   sudo dnf install jq
   ```

3. **Or download binary:**

   ```bash
   # Visit https://stedolan.github.io/jq/download/
   # Download precompiled binary
   chmod +x /path/to/jq
   sudo mv /path/to/jq /usr/local/bin/
   ```

4. **Or compile from source:**

   ```bash
   git clone https://github.com/stedolan/jq.git
   cd jq
   ./configure
   make
   sudo make install
   ```

5. **Verify installation:**

   ```bash
   jq --version
   # Output: jq-X.X
   ```

6. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E003, E004

**Prevention:**

```bash
# Install all system dependencies
# macOS
brew install git node jq

# Linux
sudo apt-get install git nodejs jq npm

# Verify
git --version
node --version
jq --version
```

---

### E006: Server not running

**Full Message:**

```
⚠ Automaker server is not running
  Start it with: npm run dev
  Continue anyway? (y/n)
```

**Root Causes:**

- Automaker server not started
- Server running on different port
- Server crashed or hung
- Firewall blocking localhost:3008
- Port 3008 in use by different process

**Example Scenario:**

```bash
$ curl -s http://localhost:3008/api/health
curl: (7) Failed to connect to localhost port 3008: Connection refused

$ ./scripts/setup-protolab.sh /path/to/project
⚠ Automaker server is not running
```

**Step-by-Step Fix:**

1. **Check if server running on correct port:**

   ```bash
   curl -s http://localhost:3008/api/health
   # Should return: {"status":"ok","version":"..."}
   ```

2. **Check what's using port 3008:**

   ```bash
   # macOS/Linux
   lsof -i :3008
   # or
   netstat -tuln | grep 3008
   ```

3. **If port in use by wrong process:**

   ```bash
   # Find PID of process using port
   lsof -i :3008 | grep LISTEN

   # Kill process
   kill -9 <PID>
   ```

4. **Start Automaker server:**

   ```bash
   # In automaker repository
   cd ~/dev/automaker

   # Development mode
   npm run dev

   # Or production mode
   npm run start
   ```

5. **Wait for server to be ready:**

   ```bash
   # Watch logs for "listening on 3008" or similar
   sleep 5
   curl -s http://localhost:3008/api/health | jq '.'
   ```

6. **If server on different port:**

   ```bash
   export AUTOMAKER_URL=http://localhost:3009
   ./scripts/setup-protolab.sh /path/to/project
   ```

7. **If setup in CI/CD environment:**
   ```bash
   # May be expected to fail - continue anyway
   ./scripts/setup-protolab.sh /path/to/project <<< 'y'
   ```

**Related Errors:** E007, E008, E011

**Prevention:**

```bash
# Ensure server running before setup
# Terminal 1
cd ~/dev/automaker && npm run dev

# Terminal 2
./scripts/setup-protolab.sh /path/to/project

# Or wait for health check
while ! curl -s http://localhost:3008/api/health | jq -e '.status == "ok"'; do
  echo "Waiting for server..."
  sleep 1
done
./scripts/setup-protolab.sh /path/to/project
```

---

### E007: Connection timeout

**Full Message:**

```
✗ Connection timeout
  Could not reach Automaker server within timeout
```

**Root Causes:**

- Server is starting up (too slow)
- Network connectivity issue
- Firewall blocking connection
- DNS resolution failing
- Server overloaded/hanging
- Timeout setting too short

**Example Scenario:**

```bash
$ curl --connect-timeout 2 http://localhost:3008/api/health
curl: (28) Operation timed out

$ ./scripts/setup-protolab.sh /path/to/project
✗ Connection timeout
```

**Step-by-Step Fix:**

1. **Check network connectivity:**

   ```bash
   # Can you reach localhost?
   ping localhost

   # Can you resolve hostname?
   nslookup localhost

   # Can you connect to port?
   nc -zv localhost 3008
   ```

2. **Check if server is really running:**

   ```bash
   ps aux | grep automaker
   ```

3. **Check server logs:**

   ```bash
   # Automaker logs usually in:
   tail -f ~/.automaker/logs/*.log
   # or
   tail -f /var/log/automaker.log
   ```

4. **Increase timeout:**

   ```bash
   # Run with longer timeout
   AUTOMAKER_TIMEOUT=30 ./scripts/setup-protolab.sh /path/to/project
   ```

5. **Check firewall:**

   ```bash
   # macOS
   sudo lsof -i :3008

   # Linux
   sudo ufw status
   sudo firewall-cmd --list-ports

   # Windows
   netsh advfirewall show allprofiles
   ```

6. **Try connecting with longer timeout:**

   ```bash
   curl --connect-timeout 10 --max-time 30 http://localhost:3008/api/health
   ```

7. **Re-run setup with increased timeout:**
   ```bash
   AUTOMAKER_TIMEOUT=30 ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E006, E008

**Prevention:**

```bash
# Start server with verbose logging
npm run dev -- --log-level debug

# In separate terminal, wait for ready state
sleep 10  # Or monitor logs
./scripts/setup-protolab.sh /path/to/project
```

---

### E008: SSL/TLS error

**Full Message:**

```
✗ SSL/TLS certificate verification failed
  CERTIFICATE_VERIFY_FAILED
```

**Root Causes:**

- Self-signed certificate not trusted
- Certificate expired
- Wrong hostname in certificate
- System missing root certificates
- Antivirus intercepting HTTPS

**Example Scenario:**

```bash
$ curl https://automaker.example.com/api/health
curl: (60) SSL: CERTIFICATE_VERIFY_FAILED

$ AUTOMAKER_URL=https://automaker.example.com \
  ./scripts/setup-protolab.sh /path/to/project
✗ SSL/TLS error
```

**Step-by-Step Fix:**

1. **Check certificate validity (for development):**

   ```bash
   openssl s_client -connect automaker.example.com:443
   # Look for "Verify return code"
   ```

2. **For development with self-signed certificates:**

   ```bash
   # Disable certificate verification (NOT for production)
   export NODE_TLS_REJECT_UNAUTHORIZED=0
   ./scripts/setup-protolab.sh /path/to/project

   # Or use insecure flag
   AUTOMAKER_INSECURE=true ./scripts/setup-protolab.sh /path/to/project
   ```

3. **For production - install proper certificate:**

   ```bash
   # Obtain certificate from trusted CA
   # https://letsencrypt.org/

   # Or import self-signed cert to system
   # macOS
   sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem

   # Linux
   sudo cp cert.pem /usr/local/share/ca-certificates/
   sudo update-ca-certificates

   # Windows
   certutil -addstore "Root" cert.pem
   ```

4. **Update system certificates:**

   ```bash
   # macOS
   update-ca-certificates

   # Linux
   sudo update-ca-certificates --fresh
   ```

5. **Test HTTPS connection:**

   ```bash
   curl -v https://automaker.example.com/api/health
   ```

6. **Re-run setup:**
   ```bash
   AUTOMAKER_URL=https://automaker.example.com \
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E006, E007

**Prevention:**

```bash
# For development - use HTTP
AUTOMAKER_URL=http://localhost:3008 ./scripts/setup-protolab.sh /path/to/project

# For production - use proper HTTPS with valid cert
AUTOMAKER_URL=https://automaker.example.com ./scripts/setup-protolab.sh /path/to/project
```

---

### E009: Beads initialization failed

**Full Message:**

```
✗ Beads initialization failed
  bd init exited with error code X
```

**Root Causes:**

- Directory permissions
- Beads daemon crashed
- Corrupted beads configuration
- Insufficient disk space
- Incompatible Beads version
- Port conflicts with daemon

**Example Scenario:**

```bash
$ cd /path/to/project
$ bd init --prefix myproject
Error: Could not initialize beads database

$ ./scripts/setup-protolab.sh /path/to/project
✗ Beads initialization failed
```

**Step-by-Step Fix:**

1. **Check Beads status:**

   ```bash
   bd status
   bd daemon status
   ```

2. **Stop Beads daemon:**

   ```bash
   bd daemon stop
   sleep 2
   ```

3. **Clear Beads cache:**

   ```bash
   rm -rf ~/.beads/cache
   rm -rf ~/.beads/.lock*
   ```

4. **Check directory permissions:**

   ```bash
   ls -la /path/to/project
   chmod u+w /path/to/project
   ```

5. **Check if .beads already exists:**

   ```bash
   rm -rf /path/to/project/.beads
   ```

6. **Try initialization manually:**

   ```bash
   cd /path/to/project
   bd init --force --no-daemon
   ```

7. **Check logs:**

   ```bash
   bd logs
   cat ~/.beads/logs/latest.log | tail -50
   ```

8. **If still failing - upgrade Beads:**

   ```bash
   curl -fsSL https://get.beads.sh | bash
   bd --version
   ```

9. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E002, E004, E010

**Prevention:**

```bash
# Verify Beads working before setup
bd --version
bd daemon start
bd status

# Then run setup
./scripts/setup-protolab.sh /path/to/project
```

---

### E010: Bead permission error

**Full Message:**

```
✗ Cannot read/write bead files
  Permission denied: .beads/...
```

**Root Causes:**

- .beads directory owned by different user
- File permissions too restrictive
- SELinux/AppArmor blocking access
- Running as root vs regular user
- Filesystem is read-only

**Example Scenario:**

```bash
$ ls -la .beads
drwxr-xr-x beads-owner .beads

$ bd list
Error: Permission denied

$ ./scripts/setup-protolab.sh /path/to/project
✗ Cannot read/write bead files
```

**Step-by-Step Fix:**

1. **Check .beads ownership:**

   ```bash
   ls -la .beads/
   stat .beads/
   ```

2. **Fix ownership:**

   ```bash
   cd /path/to/project
   sudo chown -R $(whoami) .beads/
   ```

3. **Fix permissions:**

   ```bash
   chmod -R u+rw .beads/
   chmod -R u+x .beads/*/  # Make dirs executable
   ```

4. **Verify permissions:**

   ```bash
   ls -la .beads/
   ```

5. **Test Beads access:**

   ```bash
   bd list
   bd create "test"
   ```

6. **Remove and reinitialize if needed:**

   ```bash
   rm -rf .beads/
   bd init --force
   ```

7. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E002, E009, E012

**Prevention:**

```bash
# Use consistent user for all operations
# Don't mix sudo and regular user commands
./scripts/setup-protolab.sh /path/to/project  # Don't use sudo

# If you must use sudo, ensure ownership matches
sudo chown -R $(whoami) /path/to/project
```

---

### E011: Automaker initialization failed

**Full Message:**

```
✗ Automaker initialization failed
  POST /api/setup/project returned error: ...
```

**Root Causes:**

- Server error (E006 - server not running)
- Invalid project path
- Permission error on server
- Missing required files
- Server crashed during request
- API authentication failed

**Example Scenario:**

```bash
$ curl -X POST http://localhost:3008/api/setup/project \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project"}'
{"error":"Internal server error","status":500}

$ ./scripts/setup-protolab.sh /path/to/project
✗ Automaker initialization failed
```

**Step-by-Step Fix:**

1. **Check if server is running:**

   ```bash
   curl -s http://localhost:3008/api/health | jq '.'
   # If fails, see E006 fix
   ```

2. **Check API key (if required):**

   ```bash
   export AUTOMAKER_API_KEY=dev-key
   ```

3. **Test API directly:**

   ```bash
   curl -X POST http://localhost:3008/api/setup/project \
     -H "Content-Type: application/json" \
     -H "X-API-Key: dev-key" \
     -d '{"projectPath": "/path/to/project"}' | jq '.'
   ```

4. **Check response for error details:**

   ```bash
   # Look at error message in response
   # Common errors: directory doesn't exist, permission denied, etc.
   ```

5. **Verify project path exists and is writable:**

   ```bash
   ls -la /path/to/project
   touch /path/to/project/test-write.tmp && rm /path/to/project/test-write.tmp
   ```

6. **Check server logs:**

   ```bash
   # Find Automaker logs
   tail -f /var/log/automaker.log
   # or
   tail -f ~/.automaker/logs/*.log
   ```

7. **Restart server and retry:**

   ```bash
   # Stop server
   # (Usually Ctrl+C if running in foreground)

   # Start server
   npm run dev

   # Wait for startup
   sleep 5

   # Re-run setup
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E006, E012, E011

**Prevention:**

```bash
# Verify server health before setup
curl -s http://localhost:3008/api/health | jq -e '.status == "ok"' || exit 1

# Then run setup
./scripts/setup-protolab.sh /path/to/project
```

---

### E012: Automaker file error

**Full Message:**

```
✗ Automaker file error
  Cannot create .automaker files: ...
```

**Root Causes:**

- Directory permission issues (E002)
- Disk space full
- .automaker already exists with wrong permissions
- Filesystem is read-only
- I/O error on storage

**Example Scenario:**

```bash
$ df -h /path/to/project
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1      100G   99G  100M  99% /path/to/project

$ ./scripts/setup-protolab.sh /path/to/project
✗ Automaker file error
```

**Step-by-Step Fix:**

1. **Check disk space:**

   ```bash
   df -h /path/to/project
   # Should have at least 100MB available
   ```

2. **Free up space if needed:**

   ```bash
   # Find large files/dirs
   du -sh /path/to/project/* | sort -h | tail -10

   # Clean up
   rm -rf /path/to/project/build  # Example
   ```

3. **Check directory permissions:**

   ```bash
   ls -la /path/to/project
   chmod u+w /path/to/project
   ```

4. **Remove existing .automaker with wrong perms:**

   ```bash
   rm -rf /path/to/project/.automaker
   ```

5. **Check filesystem read-only status:**

   ```bash
   touch /path/to/project/test.tmp
   # If fails with "Read-only file system", remount
   sudo mount -o remount,rw /path/to/project
   ```

6. **Check for I/O errors:**

   ```bash
   dmesg | grep -i error | tail -20
   ```

7. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E002, E011

**Prevention:**

```bash
# Check prerequisites before setup
df -h /path/to/project  # >= 100MB free
ls -la /path/to/project  # Current user can write
file /path/to/project  # Directory not read-only

# Then run setup
./scripts/setup-protolab.sh /path/to/project
```

---

### E013: Plugin marketplace not found

**Full Message:**

```
✗ Plugin marketplace not found
  Cannot add or locate Automaker plugin marketplace
```

**Root Causes:**

- Wrong plugin directory path
- Plugin directory doesn't exist
- Claude CLI version too old
- Corrupted Claude configuration

**Example Scenario:**

```bash
$ claude plugin marketplace add /wrong/path
Error: Directory not found

$ ./scripts/setup-protolab.sh /path/to/project
✗ Plugin marketplace not found
```

**Step-by-Step Fix:**

1. **Check if plugin directory exists:**

   ```bash
   AUTOMAKER_ROOT="/path/to/automaker"
   ls -la $AUTOMAKER_ROOT/packages/mcp-server/plugins
   ```

2. **Get correct Automaker root:**

   ```bash
   # From setup script
   AUTOMAKER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
   echo $AUTOMAKER_ROOT
   ```

3. **Manually add marketplace:**

   ```bash
   claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins
   ```

4. **Verify marketplace added:**

   ```bash
   claude plugin marketplace list
   ```

5. **If Claude version too old:**

   ```bash
   # Update Claude CLI
   npm install -g @anthropic-ai/claude-cli@latest

   # Verify version
   claude --version
   ```

6. **If marketplace list empty:**

   ```bash
   # Try again
   claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins
   ```

7. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E003, E014, E015

**Prevention:**

```bash
# Verify plugin directory before setup
ls -la packages/mcp-server/plugins/

# Or from project directory
AUTOMAKER_ROOT="../automaker"
ls -la $AUTOMAKER_ROOT/packages/mcp-server/plugins/

# Then run setup
./scripts/setup-protolab.sh /path/to/project
```

---

### E014: Plugin install failed

**Full Message:**

```
✗ Cannot install Automaker plugin
  Plugin install returned error code X
```

**Root Causes:**

- Marketplace not configured (E013)
- Plugin has dependencies missing
- Claude CLI incompatible version
- Network error during install
- Plugin source corrupted

**Example Scenario:**

```bash
$ claude plugin install protolabs
Error: Plugin not found

$ ./scripts/setup-protolab.sh /path/to/project
✗ Cannot install Automaker plugin
```

**Step-by-Step Fix:**

1. **Ensure marketplace configured:**

   ```bash
   claude plugin marketplace list
   # If empty, see E013 fix
   ```

2. **Try manual plugin install:**

   ```bash
   claude plugin install protolabs
   ```

3. **Check detailed error:**

   ```bash
   claude plugin install protolabs 2>&1 | head -20
   ```

4. **Rebuild plugin from source:**

   ```bash
   cd /path/to/automaker/packages/mcp-server
   npm install
   npm run build
   ```

5. **Reinstall Claude CLI:**

   ```bash
   npm uninstall -g @anthropic-ai/claude-cli
   npm install -g @anthropic-ai/claude-cli@latest
   ```

6. **Try install again:**

   ```bash
   claude plugin install protolabs
   ```

7. **Check installed plugins:**

   ```bash
   claude plugin list
   ```

8. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E003, E013, E015

**Prevention:**

```bash
# Verify plugin can be installed before setup
claude plugin marketplace list | grep protolabs || \
  echo "Plugin not available"

# Then run setup
./scripts/setup-protolab.sh /path/to/project
```

---

### E015: Plugin incompatible

**Full Message:**

```
✗ Automaker plugin is incompatible
  Plugin version X does not match server version Y
```

**Root Causes:**

- Plugin version mismatch
- Incompatible Automaker server version
- Claude CLI version too old
- Plugin not properly initialized
- Corrupted plugin installation

**Example Scenario:**

```bash
$ claude plugin list
automaker v0.10.0

$ npm --version
0.13.0

# Version mismatch detected in setup script

$ ./scripts/setup-protolab.sh /path/to/project
✗ Automaker plugin is incompatible
```

**Step-by-Step Fix:**

1. **Check plugin version:**

   ```bash
   claude plugin list | grep protolabs
   ```

2. **Check Automaker server version:**

   ```bash
   curl -s http://localhost:3008/api/health | jq '.version'
   # or check package.json
   grep '"version"' packages/mcp-server/package.json
   ```

3. **Update plugin to match server:**

   ```bash
   # Update to latest version
   claude plugin update protolabs

   # Verify
   claude plugin list | grep protolabs
   ```

4. **If update fails, reinstall:**

   ```bash
   claude plugin uninstall protolabs
   sleep 2
   claude plugin install protolabs
   ```

5. **Update Claude CLI if plugin still incompatible:**

   ```bash
   npm install -g @anthropic-ai/claude-cli@latest
   claude --version

   # Try plugin install again
   claude plugin install protolabs
   ```

6. **Verify compatibility:**

   ```bash
   # Test plugin
   claude --version
   claude plugin list
   ```

7. **Re-run setup:**
   ```bash
   ./scripts/setup-protolab.sh /path/to/project
   ```

**Related Errors:** E003, E013, E014

**Prevention:**

```bash
# Keep everything up to date
npm install -g @anthropic-ai/claude-cli@latest
claude plugin update protolabs

# Start fresh Automaker server
npm run dev

# Then run setup
./scripts/setup-protolab.sh /path/to/project
```

---

### E016: GitHub API rate limited

**Full Message:**

```
⚠ GitHub API rate limited
  Please try again in X minutes
```

**Root Causes:**

- Too many API calls in short time
- Not authenticated with gh CLI
- IP-based rate limit exceeded
- GitHub service degraded

**Example Scenario:**

```bash
$ gh api user
Error: API rate limit exceeded

$ ./scripts/setup-protolab.sh /path/to/project
⚠ GitHub API rate limited
```

**Step-by-Step Fix:**

1. **Check rate limit status:**

   ```bash
   gh api rate_limit
   ```

2. **Authenticate with GitHub (if not done):**

   ```bash
   gh auth login
   # Follow prompts to authenticate
   ```

3. **Wait for rate limit reset (typically 1 hour):**

   ```bash
   # Check remaining time
   gh api rate_limit | jq '.rate'
   ```

4. **Or use GitHub token directly:**

   ```bash
   export GH_TOKEN="your-github-token"
   gh api rate_limit
   ```

5. **Verify authentication:**

   ```bash
   gh auth status
   ```

6. **Retry CI/CD setup:**
   ```bash
   ./scripts/setup-ci-cd.sh /path/to/project
   ```

**Related Errors:** E017, E018

**Prevention:**

```bash
# Authenticate early to get higher rate limits
gh auth login

# Use authenticated requests
gh api user  # Much higher rate limit with auth

# Then run setup
./scripts/setup-protolab.sh /path/to/project
```

---

### E017: Cannot create GitHub Actions workflows

**Full Message:**

```
✗ Cannot create GitHub Actions workflows
  gh command returned error: ...
```

**Root Causes:**

- Not authenticated with gh (E016)
- Not a GitHub repository
- Insufficient permissions on repository
- Workflows directory permission issue
- GitHub API error

**Example Scenario:**

```bash
$ git remote -v
origin  /local/path/to/repo  # Not a GitHub URL

$ ./scripts/setup-ci-cd.sh /path/to/project
✗ Cannot create GitHub Actions workflows
```

**Step-by-Step Fix:**

1. **Verify it's a GitHub repository:**

   ```bash
   cd /path/to/project
   git remote -v
   # Should show github.com origin
   ```

2. **If not GitHub, change remote:**

   ```bash
   git remote remove origin
   git remote add origin https://github.com/user/repo.git
   git fetch origin
   ```

3. **Ensure authenticated with gh:**

   ```bash
   gh auth login
   ```

4. **Check repository permissions:**

   ```bash
   gh repo view --web
   # If insufficient, contact repo admin
   ```

5. **Verify workflows directory exists:**

   ```bash
   mkdir -p .github/workflows
   ```

6. **Check gh CLI can write:**

   ```bash
   gh api repos/{owner}/{repo}/contents/.github/workflows
   ```

7. **Re-run CI/CD setup:**
   ```bash
   ./scripts/setup-ci-cd.sh /path/to/project
   ```

**Related Errors:** E016, E018

**Prevention:**

```bash
# Setup GitHub repo first
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/user/repo.git
git push -u origin main

# Then authenticate and setup CI/CD
gh auth login
./scripts/setup-ci-cd.sh /path/to/project
```

---

### E018: Branch protection setup failed

**Full Message:**

```
✗ Branch protection setup failed
  Cannot configure branch protection on 'main'
```

**Root Causes:**

- Not authenticated with gh (E016)
- Branch doesn't exist
- Insufficient permissions (need admin)
- Repository type doesn't support protection (e.g., private)
- GitHub Enterprise specific settings

**Example Scenario:**

```bash
$ gh api repos/{owner}/{repo}/branches/main
Error: Branch not found or not protected

$ ./scripts/setup-ci-cd.sh /path/to/project
✗ Branch protection setup failed
```

**Step-by-Step Fix:**

1. **Check if branch exists:**

   ```bash
   cd /path/to/project
   git branch -a
   # If no 'main', create and push it
   git branch main
   git push origin main
   ```

2. **Check permissions:**

   ```bash
   gh repo view
   # Permission should be 'admin' to set branch protection
   ```

3. **If insufficient permissions:**

   ```bash
   # Contact repository admin/owner
   # Or use personal repository for testing
   ```

4. **Try protecting branch:**

   ```bash
   gh api repos/{owner}/{repo}/branches/main/protection \
     -X PUT \
     -f enforce_admins=true \
     -f required_pull_request_reviews='{"dismiss_stale_reviews":true}'
   ```

5. **Or skip branch protection:**

   ```bash
   # Modify setup-ci-cd.sh to skip this step
   # Or answer 'n' when prompted
   ```

6. **Retry CI/CD setup:**
   ```bash
   ./scripts/setup-ci-cd.sh /path/to/project
   ```

**Related Errors:** E016, E017

**Prevention:**

```bash
# Ensure you have admin permissions
# Ensure branch exists and is pushed
git push origin main

# Authenticate
gh auth login

# Then setup CI/CD
./scripts/setup-ci-cd.sh /path/to/project
```

---

### E019: Invalid path format

**Full Message:**

```
✗ Invalid path format
  Path contains invalid characters or format: ...
```

**Root Causes:**

- Windows path in Unix shell (or vice versa)
- Mixed path separators (/ and \)
- Spaces not properly escaped
- Special characters in path
- Relative path doesn't resolve correctly

**Example Scenario:**

```bash
# Windows path in bash
$ ./scripts/setup-protolab.sh C:\Users\user\project
✗ Invalid path format

# Or relative path issue
$ ./scripts/setup-protolab.sh ../../../project
✗ Invalid path format
```

**Step-by-Step Fix:**

1. **Use absolute paths (recommended):**

   ```bash
   # Instead of relative
   ./scripts/setup-protolab.sh /path/to/project

   # Or with home directory
   ./scripts/setup-protolab.sh ~/projects/my-project
   ```

2. **On Windows, use proper format:**

   ```bash
   # Option 1: Absolute path with forward slashes (in Git Bash)
   ./scripts/setup-protolab.sh /c/Users/username/projects/my-project

   # Option 2: Use WSL (recommended)
   wsl ./scripts/setup-protolab.sh ~/projects/my-project

   # Option 3: Use PowerShell
   .\scripts\setup-protolab.sh C:\Users\username\projects\my-project
   ```

3. **Escape spaces in path:**

   ```bash
   # With escaping
   ./scripts/setup-protolab.sh /path/to/"My Project"

   # Or use single quotes
   ./scripts/setup-protolab.sh '/path/to/My Project'
   ```

4. **Use variable for clarity:**

   ```bash
   PROJECT_PATH="/path/to/my-project"
   ./scripts/setup-protolab.sh "$PROJECT_PATH"
   ```

5. **Verify path resolution:**

   ```bash
   # Check that path exists
   ls -la /path/to/project

   # Or absolute path
   readlink -f ./project
   ```

6. **Re-run setup with correct path:**
   ```bash
   ./scripts/setup-protolab.sh "$(cd ~/projects/my-project && pwd)"
   ```

**Related Errors:** E001, E002, E019

**Prevention:**

```bash
# Always use absolute paths
cd /path/to/project  # Or ~/projects/my-project
./scripts/setup-protolab.sh "$(pwd)"

# Not relative paths
./scripts/setup-protolab.sh .
./scripts/setup-protolab.sh ../project  # Bad

# Quote paths with spaces
./scripts/setup-protolab.sh "/Users/My Name/My Project"
```

---

## Error Prevention Checklist

Before running setup, verify:

- [ ] Git is installed: `git --version`
- [ ] Node.js ≥22.0: `node --version`
- [ ] npm is installed: `npm --version`
- [ ] Claude CLI installed: `claude --version`
- [ ] Beads installed: `bd --version`
- [ ] jq installed: `jq --version`
- [ ] Project directory exists: `ls -la /path/to/project`
- [ ] Project is writable: `touch /path/to/project/test && rm /path/to/project/test`
- [ ] Git repo initialized: `ls -la /path/to/project/.git`
- [ ] Automaker server running: `curl http://localhost:3008/api/health`
- [ ] Disk space available: `df -h /path/to/project` (>100MB)
- [ ] No permission issues: `ls -la /path/to/project | head -1`

## Related Error Documents

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Step-by-step recovery procedures
- [README.md](../README.md) - Setup requirements and workflows
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Contributing and extending error handling
