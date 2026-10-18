# TASK: Drone Telemetry Full-Stack Exercise

Build a small full-stack app: a **Python** backend ingests simulated drone telemetry, and an **Angular** frontend shows it on a map. Coordinates may be real; drone activity is simulated.

## Drone record

```json
{
  "drone_id": "DRONE-001", "drone_type": "Quadcopter", "operator_id": "OP-123",
  "latitude": 32.0853, "longitude": 34.7818, "altitude_m": 120, "speed_kmh": 45,
  "battery_percent": 76, "timestamp": "2026-06-28T10:30:00Z", "status": "active"
}
```

## Backend (FastAPI + SQLAlchemy, PostgreSQL or SQLite)

### Pipeline
Source: JSON file (or CSV / mock API / folder). Steps:
1. Load raw records
2. Validate required fields and allowed values
3. Skip invalid records
4. Normalize
5. Store valid records in the DB
6. Save run status and counters

### Pipeline run history
`id, started_at, finished_at, status (started|completed|failed), total_records, valid_records, invalid_records, error_message`

### Validation rules
- `drone_id` not empty
- latitude -90..90, longitude -180..180
- `altitude_m` >= 0
- `battery_percent` 0..100
- `timestamp` valid date/time
- `status` in: active, landed, lost_signal

### Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/pipeline/run | Trigger pipeline |
| GET | /api/pipeline/runs | Recent run history |
| GET | /api/drones | Records with filters |
| GET | /api/drones/{id} | Single record |
| GET | /api/stats | Optional summary |

`/api/drones` filters: `drone_type`, `status`, `operator_id`, `min_battery`, `from`, `to`.

## Frontend (Angular + Leaflet / MapLibre / OpenLayers)

- **Map dashboard:** marker per drone; popup shows Drone ID, type, operator ID, altitude, speed, battery %, status, last update.
- **Filters** (call the API and refresh the map): drone type, status, operator ID, min battery %, date range.
- **Pipeline panel:** `[Run Pipeline]` calls `POST /api/pipeline/run`, then refreshes drones and the runs table (date, status, valid, invalid).

## Sample input
Valid: DRONE-001 (Quadcopter, Tel Aviv, active), DRONE-002 (Fixed Wing, Jerusalem, active), DRONE-003 (VTOL, near Haifa, lost_signal, battery 15).
Invalid example: empty `drone_id`, latitude 200, altitude -50, battery 150, timestamp `invalid-date`, status `flying`.

## Deliverables
Backend and frontend source, README (setup/run), DB schema or migrations, example input with valid and invalid records, short pipeline-flow explanation, basic backend and frontend tests.

## Bonus
Low-battery (<20%) styling, highlight lost-signal, latest position per drone, path history on select, backend pagination, Docker Compose, meaningful tests, Prefect/Celery/background worker.

## Evaluation focus
Backend (structure, validation, modeling, errors, API design), Pipeline (flow, invalid handling, status tracking, reuse), Frontend (structure, map, services, filters, loading/error states), Quality (readability, separation of concerns, README, tests), UX (layout, popups, pipeline status).

Submit as git repo or archive. README must include all run commands and brief assumptions/trade-offs.

---

# CURRENT STATUS (as of 2026-10-18)

**All required features and all bonuses are implemented.** 47 backend tests and 27 frontend tests pass. Docker Compose (PostgreSQL + backend + nginx) was verified end to end.

## Project layout
```
backend/
  app/main.py                 FastAPI app, CORS, lifespan
  app/config.py               DATABASE_URL, INPUT_FILE, CORS_ORIGINS
  app/database.py             engine, SessionLocal, get_db
  app/models.py               DroneRecord, PipelineRun
  app/schemas.py              response models (timestamps serialized with 'Z')
  app/api/drones.py           /api/drones, /{id}, /{drone_id}/path, /api/drone-types
  app/api/pipeline.py         /api/pipeline/run|runs, /api/stats
  app/pipeline/validation.py  Pydantic validation + normalization
  app/pipeline/runner.py      load, process, execute_run, start_run, stale-run check
  alembic/versions/0001_initial.py
  data/drones.json            sample: 13 records -> 9 valid, 3 invalid, 1 duplicate
  tests/                      conftest, test_validation, test_pipeline, test_api
frontend/src/app/
  core/models, core/services (drone, pipeline), core/utils (drone-utils, format)
  features/map (Leaflet), filters, pipeline-panel, dashboard
docker-compose.yml, README.md
```

## Run (WebStorm terminal)

Backend (Windows):
```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
Frontend (proxies `/api` to localhost:8000 via `proxy.conf.json`):
```
cd frontend
npm install
npm start          # http://localhost:4200
```
Docker: `docker compose up --build` then http://localhost:8080 (API docs on :8000/docs).

Tests:
```
cd backend && pytest
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless   # set CHROME_BIN if needed
```

## WebStorm tips
- Open the `drone-telemetry` folder as the project root.
- Python interpreter: `backend\.venv\Scripts\python.exe` (Settings, Python Interpreter), and mark `backend` as Sources Root.
- Angular 20 requires Node 20.19+/22. The Angular CLI on this machine is run through `npx` (Node 24.14 is too old for CLI 21+).
- Click **Run Pipeline** in the UI first, otherwise the map is empty.

## Key design decisions
- Every telemetry point is stored (history). Unique key is `(drone_id, timestamp)`, so reruns are idempotent. Duplicates are counted in the extra `duplicate_records` column.
- Invalid records do not fail a run. Only load or DB errors give `status=failed`.
- `speed_kmh` is optional (default 0), because the spec's invalid example omits it. Naive timestamps are treated as UTC.
- `POST /api/pipeline/run` returns 202 and runs via `BackgroundTasks`. The UI polls `/api/pipeline/runs` until the run is no longer `started`. A concurrent run returns 409. A `started` run older than 5 minutes is considered stale.
- `to=YYYY-MM-DD` includes the whole day.

## Possible next steps
- Replace `BackgroundTasks` with Celery or Prefect.
- Visual check of the path polyline and popups in a real browser (only logic is unit-tested).
- Add component tests for the map and pipeline panel; add backend CSV input.
- UI pagination or a drone table; marker clustering for large datasets.
- Initialize a git repo and commit.
