from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.api import drones, pipeline
from app.database import Base, engine


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Convenience for local runs; Alembic migrations are the source of truth for the schema.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Drone Telemetry API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(drones.router)
app.include_router(pipeline.router)


@app.get("/health")
def health():
    return {"status": "ok"}
