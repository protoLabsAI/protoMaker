# Multi-Instance Deployment

How to run multiple protoLabs instances in a synchronized hivemind mesh using Tailscale as the transport layer.

## Prerequisites

- Two or more Linux hosts (VMs, bare metal, or Docker containers)
- [Tailscale](https://tailscale.com) installed and authenticated on each host
- protoLabs built and deployed on each host (see [deployment.md](./deployment.md))
- Each host must be able to reach the others on the Tailscale network

## Trust Model

### Transport Security

All sync traffic travels over the Tailscale network. Tailscale uses WireGuard for end-to-end encryption between nodes — no TLS certificates are required for the WebSocket sync server itself. The Tailscale MagicDNS addresses (`100.x.x.x`) are stable and do not route over the public internet.

The sync WebSocket server binds to `0.0.0.0` by default. In a Tailscale environment, restrict this to the Tailscale interface:

```bash
# Bind the sync server to the Tailscale interface only
# Set in proto.config.yaml:
#   syncBindAddr: "100.64.0.1"  (your Tailscale IP)
```

### Instance Attribution

Every CRDT operation and every sync message carries `instanceId`. This value is set in `proto.config.yaml` and included in:

- All CRDT document mutations (`_meta.instanceId`)
- All sync wire messages (`heartbeat`, `feature_event`, `identity`)
- The `sync:partition-recovered` and `sync:peer-unreachable` events

The `instanceId` is the primary audit attribute — all state changes can be traced to the originating instance.

### Authority Tiers (Roadmap)

The current trust model is flat: any instance can publish any event type. The planned authority tier system will add:

| Tier | Role      | Allowed Actions                   |
| ---- | --------- | --------------------------------- |
| 0    | Primary   | All operations, schema migrations |
| 1    | Worker    | Feature and project events        |
| 2    | Read-only | Health queries only               |

Tier enforcement will be added before public multi-tenant deployments.

## Configuration

### proto.config.yaml

Create this file in the project root of each instance:

**Primary instance (`prod-01`):**

```yaml
protolab:
  role: primary
  syncPort: 4444
  instanceId: prod-01
  instanceUrl: ws://100.64.0.1:4444

hivemind:
  heartbeatIntervalMs: 30000
  peerTtlMs: 120000
  peers:
    - ws://100.64.0.1:4444 # prod-01 (primary, index 0)
    - ws://100.64.0.2:4444 # prod-02
    - ws://100.64.0.3:4444 # prod-03
```

**Worker instances (`prod-02`, `prod-03`):**

```yaml
protolab:
  role: worker
  syncPort: 4444
  instanceId: prod-02 # unique per instance
  instanceUrl: ws://100.64.0.2:4444 # this instance's Tailscale IP

hivemind:
  heartbeatIntervalMs: 30000
  peerTtlMs: 120000
  peers:
    - ws://100.64.0.1:4444 # prod-01 (primary)
    - ws://100.64.0.2:4444 # prod-02
    - ws://100.64.0.3:4444 # prod-03
```

The `peers` array determines leader election priority: index 0 is highest priority. If `prod-01` goes down, `prod-02` promotes itself because it has no higher-priority online peers.

### Firewall

Open port 4444 on the Tailscale interface of each instance:

```bash
# UFW
sudo ufw allow in on tailscale0 to any port 4444
```

## Starting the Mesh

Start instances in this order:

1. Start the primary first:

   ```bash
   # On prod-01
   npm run dev:server
   ```

2. Start workers:
   ```bash
   # On prod-02, prod-03
   npm run dev:server
   ```

Workers connect to the primary automatically on startup. Verify connectivity via the health endpoint:

```bash
curl http://localhost:3008/api/health/detailed | jq .sync
```

Expected output on a healthy worker:

```json
{
  "role": "worker",
  "connected": true,
  "peerCount": 2,
  "partitionSince": null,
  "queuedChanges": 0
}
```

## Deploy-Drain Procedure

When taking an instance out of the mesh for maintenance or upgrade:

1. **Drain** — stop sending new work to the instance:
   - Remove the instance from any load balancer or agent dispatch rotation.
   - Wait for running agents to finish their current tasks.

2. **Announce departure** — stop the server gracefully. The server sends a `goodbye` WebSocket message to all peers before closing. Peers mark the instance offline immediately (no TTL wait):

   ```bash
   # systemd
   sudo systemctl stop protomaker

   # Docker
   docker compose stop server
   ```

3. **Verify** — check the other instances have marked it offline:

   ```bash
   curl http://prod-01:3008/api/health/detailed | jq '.sync.onlinePeers'
   ```

4. **Perform maintenance** — upgrade, reconfigure, or replace the instance.

5. **Rejoin** — start the instance. It reconnects to the primary, replays any queued changes, and resumes normal operation.

> **Note:** The sync server is currently in-process (runs inside the main Node.js server). A future enhancement will extract it into a sidecar container, allowing the application server to restart independently without interrupting the sync mesh.

## Runbook: Common Sync Issues

### Split-Brain Detection

**Symptom:** Two instances both claim `role: primary`. Happens if a worker promotes while the original primary was only briefly unreachable.

**Detection:**

```bash
# Check role on each instance
for host in prod-01 prod-02 prod-03; do
  echo -n "$host: "; curl -s http://$host:3008/api/health/detailed | jq -r .sync.role
done
```

**Resolution:**

1. Identify the intended primary (check `proto.config.yaml` on each host — index 0 in `peers` is canonical primary).
2. Restart the instance that incorrectly promoted to primary. It will reconnect as a worker and receive a `promote` message if it should stay primary.
3. If both instances have diverged CRDT state, the CRDT merge will automatically reconcile on reconnect — Automerge CRDTs are merge-safe.

### Stuck Peers

**Symptom:** A peer shows as `online` in the peer registry but is not receiving events. The `lastSeen` timestamp is stale.

**Detection:**

```bash
curl http://prod-01:3008/api/health/detailed | jq '.sync.onlinePeers[] | {instanceId, lastHeartbeat: .identity.lastHeartbeat}'
```

**Resolution:**

1. Check the peer's health endpoint directly.
2. If unreachable, wait for the TTL check to mark it offline (default 120 seconds).
3. Force an immediate reconnect by restarting the stuck instance.
4. The TTL check emits `sync:peer-unreachable` — check server logs for this event.

### Document Corruption

**Symptom:** A feature or project has unexpected values or is missing fields after a sync event.

**Detection:**

```typescript
// In a Node REPL or debug script:
import * as Automerge from '@automerge/automerge';
const handle = store.getHandle('features', featureId);
const doc = handle.docSync();
const history = Automerge.getHistory(doc);
// Inspect history to find the diverging change
```

**Resolution:**

1. Use `Automerge.getHistory(doc)` to trace the change sequence (see [distributed-sync.md](../dev/distributed-sync.md)).
2. Identify the change hash and `actor` (instanceId) that introduced the bad state.
3. If needed, roll back by applying a corrective change from a trusted instance.
4. Automerge guarantees eventual consistency — if the document is reachable from all instances, they will converge to the same state.

### Partition Recovery

**Symptom:** An instance was disconnected for an extended period. On reconnect, events are replayed in bulk.

**Expected behavior:**

1. Server logs: `Partition recovered after Xms — replaying N queued changes`
2. Server logs: `Partition cleared — was disconnected since [timestamp]`
3. `sync:partition-recovered` event fires, triggering a dual-claim audit.

**If the partition replay fails** (connection drops during replay):

- The outbound queue is cleared after each successful replay. If the connection drops mid-replay, the un-replayed changes are lost.
- Lost changes will be reconciled by CRDT merge when the connection is re-established — Automerge handles concurrent operations without data loss as long as both instances retain their change history.

**If post-partition audit finds dual-claimed features:**

- The feature loader receives the `sync:partition-recovered` event and queries all features with `status: in_progress` across both instances.
- Features claimed by both instances are released back to `backlog` by the lower-priority instance (higher index in `hivemind.peers`).
- The higher-priority instance retains ownership.

### Compaction Alerts

**Symptom:** `/api/health/detailed` returns `compactionDiagnostics.alertCount > 0`.

**Resolution:**

1. Identify large documents:
   ```bash
   curl http://prod-01:3008/api/health/detailed | jq '.sync.compactionDiagnostics'
   ```
2. Review `MaintenanceTracker.getDiagnostics().alerts` for the specific document keys.
3. Large documents usually indicate unbounded list growth (e.g., a feature's event history). Archive or prune old entries.
4. After investigation, acknowledge the alerts:
   ```typescript
   maintenanceTracker.clearAlerts();
   ```
