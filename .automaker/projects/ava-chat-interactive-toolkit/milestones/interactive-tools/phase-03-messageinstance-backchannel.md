# Phase 3: message_instance Backchannel Tool with Response Waiting

*Ava Chat Interactive Toolkit > Interactive Tools*

Add a message_instance tool to Ava's tool list that sends a message to another instance via the Ava channel and waits for a response. Uses the existing send_channel_message MCP tool and read_channel_messages to poll for a reply. The tool should accept: instanceId (target), message (string), timeout_ms (default 60000). It sends a structured backchannel message with a correlation ID, polls for a response message from the target instance that references the correlation ID, and returns the response content. Register in ava-tools.ts.

**Complexity:** large

## Files to Modify

- apps/server/src/services/ava-tools.ts
- apps/server/src/services/ava-channel-service.ts
- apps/server/src/routes/ava-channel/

## Acceptance Criteria

- [ ] message_instance tool appears in Ava's tool list
- [ ] Tool sends a backchannel message with a correlation ID
- [ ] Tool polls for a response from the target instance
- [ ] Tool returns the response content or a timeout error
- [ ] Staging instance can receive and respond to backchannel messages