# Testing sync-dependencies endpoint

## Endpoint

`POST /api/linear/sync-dependencies`

## Request Body

```json
{
  "projectPath": "/path/to/your/project"
}
```

## Response

```json
{
  "success": true,
  "summary": {
    "total": 10,
    "created": 8,
    "skipped": 1,
    "errors": 1
  },
  "details": [
    {
      "featureId": "feature-123",
      "featureTitle": "Add login",
      "dependencyId": "feature-456",
      "dependencyTitle": "Setup auth",
      "status": "created",
      "reason": "Created blocks relation: Setup auth blocks Add login"
    },
    {
      "featureId": "feature-789",
      "dependencyId": "feature-999",
      "status": "skipped",
      "reason": "Dependency feature-999 not synced to Linear"
    }
  ]
}
```

## Testing Steps

### After server restart:

1. **Test with missing projectPath:**

```bash
curl -X POST http://localhost:3008/api/linear/sync-dependencies \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: 400 Bad Request with error about missing projectPath

2. **Test with valid project:**

```bash
curl -X POST http://localhost:3008/api/linear/sync-dependencies \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/home/josh/dev/ava"}'
```

Expected: 200 OK with summary of synced dependencies

## Implementation Details

The endpoint:

- Retrieves all features from the project using FeatureLoader
- For each feature with dependencies, checks if both feature and dependency have Linear issue IDs
- Creates "blocks" relations in Linear where dependency blocks the dependent feature
- Returns detailed status for each relationship (created/skipped/error)

## Notes

- Features without Linear issue IDs are skipped
- Dependencies without Linear issue IDs are skipped
- Duplicate relations are handled by Linear (may return error, but won't break sync)
- The endpoint uses LinearMCPClient.createIssueRelation() to create relations
