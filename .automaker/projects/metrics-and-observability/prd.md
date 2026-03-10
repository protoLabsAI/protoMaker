# PRD: Metrics and Observability

## Situation
The system has cost tracking via Langfuse but no DORA metrics (deployment frequency, change lead time, change fail rate, recovery time) and no agentic-specific metrics (autonomy rate, WIP saturation, remediation loop counts). Without measurement, flow controls and gate thresholds cannot be calibrated.

## Problem
Cannot answer basic questions: What is our change fail rate? What percentage of features ship without human intervention? How long does a feature take from creation to merge? What is our WIP saturation at each pipeline stage? Without these metrics, flow controls are guesswork.

## Approach
Three milestones: (1) DORA metrics collection from existing events and git data, (2) Agentic-specific metrics derived from board state and agent execution data, (3) REST API endpoints and UI dashboard panel for visualization.

## Results
Real-time DORA metrics available via API. Agentic metrics (autonomy rate, cost/feature, remediation loops, WIP saturation) tracked and queryable. Dashboard panel showing trends over time. Metrics data available for gate threshold calibration.

## Constraints
Must not add significant overhead to the event loop. Metrics collection should be event-driven, not polling. Storage in flat files (.automaker/metrics/) for simplicity. Dashboard should reuse existing analytics-view infrastructure.
