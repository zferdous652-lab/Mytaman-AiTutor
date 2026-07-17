"""MYTAMAN AI Tutor — FastAPI backend."""
import os
import logging
from pathlib import Path
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import router as auth_router, seed_admin  # noqa: E402
from model_router import router as router_router  # noqa: E402
from content import router as content_router  # noqa: E402
from packs import router as packs_router, seed_packs  # noqa: E402


mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_admin(db)
    await seed_packs(db)
    yield
    client.close()


app = FastAPI(title="MYTAMAN AI Tutor", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "MYTAMAN AI Tutor API", "time": datetime.now(timezone.utc).isoformat()}


# Attach shared db onto app.state for sub-routers
app.state.db = db

# Include sub-routers under /api
api_router.include_router(auth_router)
api_router.include_router(router_router)
api_router.include_router(content_router)
api_router.include_router(packs_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
