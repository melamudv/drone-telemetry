# Drone Telemetry Dashboard

Full-stack demo: a **FastAPI** backend ingests simulated drone telemetry through a validation pipeline into a database, and an **Angular + Leaflet** dashboard shows the drones on a map. All drone activity is simulated; only the coordinates are real.

```
backend/    FastAPI, SQLAlchemy, Alembic, pytest
frontend/   Angular 20, Leaflet, Karma/Jasmine
docker-compose.yml   PostgreSQL + backend + frontend (nginx)
```

## Quick start (Docker)

```bash
docker compose up --build
```

- Dashboard: http://localhost:8080
- API docs: http://localhost:8000/docs

Click **Run Pipeline** in the UI to load `backend/data/drones.json`.

## Run locally (SQLite, no Docker)

**Backend** (Python 3.11+):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows   (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
alembic upgrade head              # create the schema
uvicorn app.main:app --reload --port 8000
```

**Frontend** (Node 20.19+/22):

```bash
cd frontend
npm install
npm start                         # http://localhost:4200, proxies /api -> localhost:8000
```

Use PostgreSQL instead by setting `DATABASE_URL`, e.g. `postgresql+psycopg2://user:pass@localhost:5432/drones`.

Environment variables: `DATABASE_URL` (default: SQLite file `backend/drones.db`), `INPUT_FILE` (default `backend/data/drones.json`), `CORS_ORIGINS`.

## Tests

```bash
cd backend && pytest                                   # 47 tests: validation, pipeline, API
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless   # 27 tests
```

## Pipeline flow

`POST /api/pipeline/run` creates a `pipeline_runs` row (`status=started`) and returns `202` immediately. The work runs in a FastAPI background task (`app/pipeline/runner.py`):

1. **Load** records already stored in the DB (valid rows plus saved invalid and duplicate rows) and recount them. The JSON file is read only when the DB is empty. A later run does not insert.
2. **Validate** each record with Pydantic (`app/pipeline/validation.py`): non-empty `drone_id`, latitude -90..90, longitude -180..180, altitude >= 0, battery 0..100, valid timestamp, status in `active | landed | lost_signal`.
3. **Skip invalid** records (logged, counted in `invalid_records`).
4. **Normalize**: trim strings, lower-case status, convert timestamps to UTC.
5. **Store** valid records. Records already stored (same `drone_id` + `timestamp`) are skipped and counted in `duplicate_records`, so re-running is idempotent.
6. **Record** counters and final status: `completed`, or `failed` with `error_message` (missing file, malformed JSON, DB error).

Invalid records do **not** fail a run; only an inability to process the input does. The UI polls the run until it leaves `started`, then refreshes the drone list, stats and run table. Only one run may be active at a time (`409` otherwise).

## API

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/pipeline/run` | Starts a run (202) |
| GET | `/api/pipeline/runs?limit=20` | Newest first |
| GET | `/api/drones` | Filters: `drone_type` (repeatable, e.g. `?drone_type=VTOL&drone_type=Quadcopter`), `status` (repeatable), `operator_id`, `min_battery`, `from`, `to`, `latest_only`, `page`, `page_size` (max 1000) |
| GET | `/api/drones/{id}` | One record by row id |
| GET | `/api/drones/{drone_id}/path` | Full position history, oldest first |
| GET | `/api/drone-types` | Distinct types (filter autocomplete) |
| GET | `/api/stats` | Totals, status counts, low-battery count, last run |
| POST | `/api/addData` | Adds 10 rows: 1 new drone, 7 points near existing ones, 2 duplicates. Validates before storing |

`to=2026-06-28` (date only) includes the whole day. Timestamps are returned as UTC ISO strings ending in `Z`.

## Schema

Alembic migration: `backend/alembic/versions/0001_initial.py`.

- `drone_records` — one row per telemetry point; unique `(drone_id, timestamp)`; indexed on drone_id, type, operator, status, timestamp.
- `pipeline_runs` — `id, started_at, finished_at, status, total_records, valid_records, invalid_records, duplicate_records, error_message`.

## Frontend features

Map with popups (ID, type, operator, altitude, speed, battery, status, last update); filters (type, status, operator, min battery, date range, latest-only); Run Pipeline panel with run history; loading, empty and error states with retry. Bonuses: low-battery (< 20%) orange ring, pulsing red lost-signal markers, latest position per drone (default), path history polyline when clicking a marker.

## Sample data

`backend/data/drones.json`: 13 records → 9 valid, 3 invalid (empty id/out-of-range/bad date/bad status; longitude 190.5; a non-object entry) and 1 duplicate. DRONE-001 has 4 points to demo the path.

## Assumptions and trade-offs

- Every telemetry point is kept (history); the map shows the latest per drone by default.
- `speed_kmh` is optional (defaults to 0) because the spec's invalid example omits it; it must be >= 0 when present. `drone_type` is free text.
- Timestamps without a timezone are treated as UTC.
- Background execution uses FastAPI `BackgroundTasks` (in-process) rather than Prefect/Celery — simple, but runs are lost if the server restarts mid-run. Such an orphaned `started` run stops blocking new runs after 5 minutes. A queue worker would be the production choice.
- The map loads up to 1000 records per request; the UI tells you if results are truncated.
- `Base.metadata.create_all` also runs on startup for convenience; Alembic is the source of truth.
- No authentication, as this is a demo.
