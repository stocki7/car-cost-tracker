from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import text

from database import engine, Base, SessionLocal
from models import Family, CostType, Vehicle, Driver, Location, Setting
from routes import trips, costs, reports, settings, settlements

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Auto-Kostenteilung")

class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if not request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

app.add_middleware(NoCacheStaticMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trips.router, prefix="/api")
app.include_router(costs.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(settlements.router, prefix="/api")


def run_migrations():
    """Add new columns to existing tables without dropping data."""
    migrations = [
        "ALTER TABLE trips ADD COLUMN vehicle_id INTEGER",
        "ALTER TABLE trips ADD COLUMN round_trip INTEGER DEFAULT 0",
        "ALTER TABLE costs ADD COLUMN vehicle_id INTEGER",
        "ALTER TABLE costs ADD COLUMN paid_by_family_id INTEGER",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass  # column already exists

        # Make settlements.month nullable (SQLite requires table recreation)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS settlements_new (
                    id INTEGER PRIMARY KEY,
                    vehicle_id INTEGER,
                    year INTEGER NOT NULL,
                    month INTEGER,
                    settled_at TEXT NOT NULL,
                    notes TEXT
                )
            """))
            conn.execute(text("INSERT OR IGNORE INTO settlements_new SELECT * FROM settlements"))
            conn.execute(text("DROP TABLE settlements"))
            conn.execute(text("ALTER TABLE settlements_new RENAME TO settlements"))
            conn.commit()
        except Exception:
            pass


@app.on_event("startup")
def startup():
    run_migrations()
    db = SessionLocal()
    try:
        if db.query(Vehicle).count() == 0:
            db.add(Vehicle(name="Auto 1", description="Gemeinsames Fahrzeug"))
            db.commit()

        if db.query(Family).count() == 0:
            db.add(Family(name="Familie 1"))
            db.add(Family(name="Familie 2"))
            db.commit()

        if db.query(CostType).count() == 0:
            for name in ["Tanken", "Wartung", "Versicherung", "Steuer", "Reparatur", "Sonstiges"]:
                db.add(CostType(name=name))
            db.commit()
    finally:
        db.close()


app.mount("/", StaticFiles(directory="/frontend", html=True), name="frontend")
