import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'drones.db'}")
INPUT_FILE = Path(os.getenv("INPUT_FILE", BASE_DIR / "data" / "drones.json"))
MOCK_TELEMETRY = os.getenv("MOCK_TELEMETRY", "1").lower() in ("1", "true", "yes")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:4200").split(",")
