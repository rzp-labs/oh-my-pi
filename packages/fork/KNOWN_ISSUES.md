## Async job completion notifications delayed in long-running agent turns

### Symptom

When the model uses `async: true` on a `bash` call, the completion notification (`Background job completed [bash] bg_...`) can arrive significantly later in the conversation than when the job actually finished. By the time the notification is delivered, the model may already have moved on, captured the result by other means, or completed the work entirely. The notification is then stale and can cause the agent to explain it away.

### Root cause

When a background job completes while the agent is streaming a turn, `sendCustomMessage` with `deliverAs: "followUp"` calls `agent.followUp()`. That path buffers the notification until the current turn finishes streaming. If the model is executing many tool calls in sequence, the notification remains buffered until all tool calls complete. If another long turn starts immediately afterward, the notification is delayed again. There is no interrupt mechanism: the agent loop does not check for incoming messages between tool calls.

### Affected path

`packages/coding-agent/src/session/agent-session.ts` `sendCustomMessage` → `this.agent.followUp()` when `isStreaming` is true.

### Workaround

None. The architectural constraint is that the agent loop does not yield between tool calls. Bounding turn length, for example with a `task.maxToolCalls` limit, would reduce the delay window but would not eliminate it.

### Status

Open. This requires an architectural change to the agent loop so it can deliver interrupts mid-turn.
