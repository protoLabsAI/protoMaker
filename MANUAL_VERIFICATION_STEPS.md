# Beads REST API Bridge - Manual Verification Steps

## Prerequisites

The Beads REST API implementation is complete. To verify it works:

1. **Restart the dev server** to load the new routes:

   ```bash
   # Stop the current server (Ctrl+C) and restart:
   npm run dev:web
   ```

2. **Ensure you have the Beads CLI installed** (optional - API will return appropriate errors if not):

   ```bash
   which bd
   ```

3. **Get your API key**:
   ```bash
   cat data/.api-key
   # Or use the environment variable
   echo $AUTOMAKER_API_KEY
   ```

## Verification Tests

### 1. Test Server Health

```bash
curl -X GET http://localhost:3008/api/health
```

Expected: `{"status":"ok"}`

### 2. List Beads Tasks

```bash
curl -X POST http://localhost:3008/api/beads/list \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -d '{"projectPath": "'$(pwd)'"}'
```

Expected (if Beads CLI installed):

```json
{
  "tasks": [...]
}
```

Expected (if Beads CLI NOT installed):

```json
{
  "error": "..."
}
```

### 3. Get Ready Tasks

```bash
curl -X POST http://localhost:3008/api/beads/ready \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -d '{"projectPath": "'$(pwd)'"}'
```

### 4. Create a Test Task

```bash
curl -X POST http://localhost:3008/api/beads/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -d '{
    "projectPath": "'$(pwd)'",
    "title": "Test from API",
    "description": "Testing Beads REST API bridge",
    "priority": 2,
    "issueType": "task"
  }'
```

Expected (if Beads CLI installed):

```json
{
  "task": {
    "id": "...",
    "title": "Test from API",
    ...
  }
}
```

### 5. Test Authentication

```bash
# Without API key - should get 401
curl -X POST http://localhost:3008/api/beads/list \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "'$(pwd)'"}'
```

Expected:

```json
{
  "success": false,
  "error": "Authentication required."
}
```

### 6. Test Invalid API Key

```bash
curl -X POST http://localhost:3008/api/beads/list \
  -H "Content-Type: application/json" \
  -H "X-API-Key: invalid-key" \
  -d '{"projectPath": "'$(pwd)'"}'
```

Expected:

```json
{
  "success": false,
  "error": "Invalid API key."
}
```

## What Was Implemented

✅ **Phase 0**: Event types added to @automaker/types

- `beads:task-created`
- `beads:task-updated`
- `beads:task-closed`
- `beads:dependency-added`

✅ **Phase 1**: BeadsService wrapper

- CLI detection
- Automatic sync after mutations
- Event emission for all operations
- Comprehensive error handling

✅ **Phase 2**: REST API routes at `/api/beads/*`

- POST `/api/beads/list` - List tasks
- POST `/api/beads/get` - Get specific task
- POST `/api/beads/create` - Create task
- POST `/api/beads/update` - Update task
- POST `/api/beads/close` - Close task
- POST `/api/beads/reopen` - Reopen task
- POST `/api/beads/ready` - Get ready tasks
- POST `/api/beads/add-dependency` - Add dependency

✅ **Phase 3**: Event emission integrated

✅ **Phase 4**: Feature type extended with `beadsTaskId` field

✅ **Phase 5**: Comprehensive unit tests (9/9 passing)

## Build Verification

All builds pass successfully:

```bash
npm run build:packages  # ✅ Pass
npm run build:server    # ✅ Pass
npm run test:server -- apps/server/tests/unit/services/beads-service.test.ts  # ✅ 9/9 pass
```

## Note

The implementation is complete and tested. The only remaining step is to **restart the dev server** to load the new routes. Once restarted, all endpoints should be accessible at `/api/beads/*`.
