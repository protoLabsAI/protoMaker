# Multi-Instance Deployment

How to run multiple protoLabs instances in a synchronized hivemind mesh using Tailscale as the transport layer.

## Prerequisites

- Two or more hosts (VMs, bare metal, or Docker containers)
- [Tailscale](https://tailscale.com) installed and authenticated on each host
- protoLabs built and deployed on each host (see [deployment.md](./deployment.md))
- Each host must be able to reach the others on the Tailscale network

## Architecture

The Studio Mesh uses a primary/worker WebSocket topology. One instance runs the sync server (primary), and all others connect as clients (workers). All CRDT changes propagate through the primary in real time.

```
                          Tailscale mesh
                    ┌─────────────────────────┐
                    │                         │
  ┌──────────┐     │    ┌──────────────┐      │     ┌──────────┐
  │ Worker A ├─────┼───►│   Primary    │◄─────┼─────┤ Worker B │
  │ (dev-02) │     │    │   (dev-01)   │      │     │ (dev-03) │
  └──────────┘     │    │  :4444 sync  │      │     └──────────┘
                    │    └──────────────┘      │
                    │                         │
                    └─────────────────────────┘
```

### Synced domains

The mesh synchronizes these CRDT document domains:

| Domain        | Document ID     | Description                               |
| ------------- | --------------- | ----------------------------------------- |
| `features`    | `<featureId>`   | Feature board state                       |
| `projects`    | `<projectSlug>` | Project plans and PRD content             |
| `settings`    | `shared`        | Shared workflow settings (no credentials) |
| `capacity`    | `<instanceId>`  | Per-instance capacity metrics             |
| `ava-channel` | `YYYY-MM-DD`    | Daily-sharded Ava communication log       |
| `calendar`    | `shared`        | Shared calendar events                    |
| `todos`       | `workspace`     | Shared todo lists with permission tiers   |

### Event types bridged across the mesh

Feature events (`feature:created`, `feature:updated`, `feature:deleted`, `feature:status-changed`) and project events (`project:created`, `project:updated`, `project:deleted`) are bridged from the local EventBus to the sync wire. Remote events are re-emitted locally after path remapping.

## Trust Model

### Transport Security

All sync traffic travels over the Tailscale network. Tailscale uses WireGuard for end-to-end encryption between nodes -- no TLS certificates are required for the WebSocket sync server itself. Tailscale IPs (`100.x.x.x`) are stable and do not route over the public internet.

The sync WebSocket server binds to `0.0.0.0` by default. In a Tailscale environment, restrict this to the Tailscale interface:

```yaml
# proto.config.yaml
protolab:
  syncBindAddr: '100.64.0.1' # your Tailscale IP
```

### Instance Attribution

Every CRDT operation and sync message carries `instanceId`. This value is set in `proto.config.yaml` and included in:

- All CRDT document mutations (`_meta.instanceId`)
- All sync wire messages (`heartbeat`, `feature_event`, `identity`)
- Ava Channel messages (`instanceId` and `instanceName` fields)
- The `sync:partition-recovered` and `sync:peer-unreachable` events

### Authority Tiers (Roadmap)

The current trust model is flat: any instance can publish any event type. The planned authority tier system will add:

| Tier | Role      | Allowed Actions                   |
| ---- | --------- | --------------------------------- |
| 0    | Primary   | All operations, schema migrations |
| 1    | Worker    | Feature and project events        |
| 2    | Read-only | Health queries only               |

## Configuration

### proto.config.yaml

Create this file in the project root of each instance. Below is a complete 3-node example.

**Primary instance (`dev-01`):**

```yaml
name: protoMaker
version: '1.0.0'

protolab:
  enabled: true
  role: primary
  syncPort: 4444
  instanceId: dev-01
  instanceUrl: ws://100.64.0.1:4444

hive:
  hiveId: my-hive
  syncPort: 9800
  meshEnabled: true

hivemind:
  heartbeatIntervalMs: 30000
  peerTtlMs: 120000
  peers:
    - ws://100.64.0.1:4444 # dev-01 (primary, index 0 = highest priority)
    - ws://100.64.0.2:4444 # dev-02
    - ws://100.64.0.3:4444 # dev-03

instances:
  - instanceId: dev-01
    hostname: primary-host
    capacity: 4
  - instanceId: dev-02
    hostname: worker-host-a
    capacity: 8
  - instanceId: dev-03
    hostname: worker-host-b
    capacity: 8

workStealing:
  strategy: capacity
  stealMax: 3
  offerTtlMs: 60000
```

**Worker instance (`dev-02`):**

```yaml
name: protoMaker
version: '1.0.0'

protolab:
  enabled: true
  role: worker
  syncPort: 4444
  instanceId: dev-02
  instanceUrl: ws://100.64.0.2:4444

hive:
  hiveId: my-hive
  syncPort: 9800
  meshEnabled: true

hivemind:
  heartbeatIntervalMs: 30000
  peerTtlMs: 120000
  peers:
    - ws://100.64.0.1:4444 # dev-01 (primary)
    - ws://100.64.0.2:4444 # dev-02
    - ws://100.64.0.3:4444 # dev-03

instances:
  - instanceId: dev-01
    hostname: primary-host
    capacity: 4
  - instanceId: dev-02
    hostname: worker-host-a
    capacity: 8
  - instanceId: dev-03
    hostname: worker-host-b
    capacity: 8

workStealing:
  strategy: capacity
  stealMax: 3
  offerTtlMs: 60000
```

**Worker instance (`dev-03`):** Same as `dev-02` but with `instanceId: dev-03` and the corresponding `instanceUrl`.

### Key fields

| Field                          | Description                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `protolab.role`                | `primary` starts a WebSocket server; `worker` connects as a client                      |
| `protolab.syncPort`            | Port the sync WebSocket server listens on (primary) or the port used in peer URLs       |
| `protolab.instanceId`          | Unique identifier for this instance (used in CRDT attribution, heartbeats, Ava Channel) |
| `protolab.instanceUrl`         | This instance's WebSocket URL (how other peers can reach it)                            |
| `hivemind.peers`               | Ordered list of all peer URLs. Index 0 is highest priority for leader election          |
| `hivemind.heartbeatIntervalMs` | How often heartbeats are sent (default: 30000)                                          |
| `hivemind.peerTtlMs`           | How long before an unresponsive peer is marked offline (default: 120000)                |
| `instances[].capacity`         | Max concurrent agents this instance can run (used by work-stealing)                     |
| `workStealing.strategy`        | `capacity` distributes work by available agent slots                                    |

### Docker deployment

When running the server in Docker, the sync port must be exposed in `docker-compose.yml`:

```yaml
services:
  server:
    image: automaker-server
    ports:
      - '${API_PORT:-3008}:3008'
      - '${SYNC_PORT:-4444}:4444' # CRDT sync WebSocket
    volumes:
      - ./proto.config.yaml:/app/proto.config.yaml:ro
      - ./data:/data
    environment:
      NODE_ENV: production
      AUTOMAKER_API_KEY: '${AUTOMAKER_API_KEY}'
```

If the compose file maps a different host port (e.g. `9800:4444`), the `instanceUrl` and `peers` entries must use the **host port** (9800), not the container port (4444), since peers connect from outside the container.

### Firewall

Open the sync port on the Tailscale interface of each instance:

```bash
# UFW
sudo ufw allow in on tailscale0 to any port 4444
```

## Starting the Mesh

Start instances in this order:

1. **Start the primary first:**

   ```bash
   # On dev-01
   npm run dev:server
   # Or with Docker:
   docker compose up -d server
   ```

2. **Start workers:**

   ```bash
   # On dev-02, dev-03
   npm run dev:server
   ```

Workers connect to the primary automatically on startup. Verify connectivity via the health endpoint:

```bash
curl -s http://localhost:3008/api/health/detailed | jq .sync
```

Expected output on a healthy 3-node mesh (from a worker):

```json
{
  "role": "worker",
  "connected": true,
  "peerCount": 2,
  "onlinePeers": [
    {
      "identity": {
        "instanceId": "dev-01",
        "status": "online"
      }
    },
    {
      "identity": {
        "instanceId": "dev-03",
        "status": "online"
      }
    }
  ],
  "isLeader": false,
  "partitionSince": null,
  "queuedChanges": 0
}
```

## Deploy-Drain Procedure

When taking an instance out of the mesh for maintenance or upgrade:

1. **Drain** -- stop sending new work to the instance:
   - Remove the instance from any load balancer or agent dispatch rotation.
   - Wait for running agents to finish their current tasks.

2. **Announce departure** -- stop the server gracefully. The server sends a `goodbye` WebSocket message to all peers before closing. Peers mark the instance offline immediately (no TTL wait):

   ```bash
   # systemd
   sudo systemctl stop protomaker

   # Docker
   docker compose stop server
   ```

3. **Verify** -- check the other instances have marked it offline:

   ```bash
   curl -s http://dev-01:3008/api/health/detailed | jq '.sync.onlinePeers'
   ```

4. **Perform maintenance** -- upgrade, reconfigure, or replace the instance.

5. **Rejoin** -- start the instance. It reconnects to the primary, replays any queued changes, and resumes normal operation.

> **Note:** The sync server is currently in-process (runs inside the main Node.js server). A future enhancement will extract it into a sidecar container, allowing the application server to restart independently without interrupting the sync mesh.

## Path Remapping

Each instance may have its project at a different filesystem path (e.g. `/Users/dev/project` on macOS vs `/home/deploy/project` in Docker). When a remote feature event arrives, `crdt-sync.module.ts` remaps the `projectPath` in the payload to the local `repoRoot` before persisting. This ensures features are written to the correct local directory regardless of the originating instance's path layout.

## Work-Stealing Protocol

When `workStealing.strategy` is set to `capacity`, instances advertise their current load on every heartbeat. If one instance has idle agent slots and another has a backlog, the idle instance can steal features from the busy instance's queue.

| Field        | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `strategy`   | `capacity` (distribute by available slots) or `none` (disabled) |
| `stealMax`   | Maximum features to steal in a single round                     |
| `offerTtlMs` | How long a steal offer remains valid before expiring            |

## Runbook: Common Sync Issues

### Split-Brain Detection

**Symptom:** Two instances both claim `role: primary`. Happens if a worker promotes while the original primary was only briefly unreachable.

**Detection:**

```bash
for host in dev-01 dev-02 dev-03; do
  echo -n "$host: "
  curl -s http://$host:3008/api/health/detailed | jq -r .sync.role
done
```

**Resolution:**

1. Identify the intended primary (check `proto.config.yaml` on each host -- index 0 in `peers` is canonical primary).
2. Restart the instance that incorrectly promoted to primary. It will reconnect as a worker.
3. CRDT state will automatically reconcile on reconnect -- Automerge CRDTs are merge-safe.

### Stuck Peers

**Symptom:** A peer shows as `online` but is not receiving events. The `lastSeen` timestamp is stale.

**Detection:**

```bash
curl -s http://dev-01:3008/api/health/detailed | \
  jq '.sync.onlinePeers[] | {instanceId: .identity.instanceId, lastHeartbeat: .identity.lastHeartbeat}'
```

**Resolution:**

1. Check the peer's health endpoint directly.
2. If unreachable, wait for the TTL check to mark it offline (default 120 seconds).
3. Force an immediate reconnect by restarting the stuck instance.
4. The TTL check emits `sync:peer-unreachable` -- check server logs for this event.

### Port Not Reachable (Docker)

**Symptom:** Workers log `connection refused` when connecting to the primary. The primary's sync service is running.

**Cause:** The sync port is not exposed in `docker-compose.yml`. Docker maps ports explicitly -- a service listening on port 4444 inside the container is not reachable from outside unless mapped.

**Resolution:**

1. Add the port mapping to `docker-compose.yml`:
   ```yaml
   ports:
     - '4444:4444'
   ```
2. Restart the container: `docker compose up -d server`
3. Verify: `curl -s http://<host>:4444` should get a WebSocket upgrade rejection (not connection refused).

### Partition Recovery

**Symptom:** An instance was disconnected for an extended period. On reconnect, events are replayed in bulk.

**Expected behavior:**

1. Server logs: `Partition recovered after Xms -- replaying N queued changes`
2. Server logs: `Partition cleared -- was disconnected since [timestamp]`
3. `sync:partition-recovered` event fires, triggering a dual-claim audit.

**If post-partition audit finds dual-claimed features:**

- Features claimed by both instances are released back to `backlog` by the lower-priority instance (higher index in `hivemind.peers`).
- The higher-priority instance retains ownership.

### Compaction Alerts

**Symptom:** `/api/health/detailed` returns `compactionDiagnostics.alertCount > 0`.

**Resolution:**

1. Identify large documents:
   ```bash
   curl -s http://dev-01:3008/api/health/detailed | jq '.sync.compactionDiagnostics'
   ```
2. Review `MaintenanceTracker.getDiagnostics().alerts` for the specific document keys.
3. Large documents usually indicate unbounded list growth (e.g., Ava Channel message shards). Archive or prune old entries.
4. After investigation, acknowledge the alerts:
   ```typescript
   maintenanceTracker.clearAlerts();
   ```
