from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract
from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional
import httpx

from database import get_db
from models import Trip, Family, Vehicle, Setting

router = APIRouter(prefix="/trips", tags=["trips"])


class TripCreate(BaseModel):
    date: date
    vehicle_id: int
    family_id: int
    driver_name: Optional[str] = None
    start_location: Optional[str] = None
    end_location: Optional[str] = None
    km: Optional[float] = None
    round_trip: bool = False
    notes: Optional[str] = None


class TripOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    vehicle_id: Optional[int]
    vehicle_name: Optional[str]
    family_id: int
    family_name: str
    driver_name: Optional[str]
    start_location: Optional[str]
    end_location: Optional[str]
    km: float
    round_trip: bool
    notes: Optional[str]


def trip_to_out(t: Trip) -> TripOut:
    return TripOut(
        id=t.id,
        date=t.date,
        vehicle_id=t.vehicle_id,
        vehicle_name=t.vehicle.name if t.vehicle else None,
        family_id=t.family_id,
        family_name=t.family.name,
        driver_name=t.driver_name,
        start_location=t.start_location,
        end_location=t.end_location,
        km=t.km,
        round_trip=bool(t.round_trip),
        notes=t.notes,
    )


async def get_distance_km(start: str, end: str, api_key: str) -> Optional[float]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = {"Authorization": api_key}
            geocode_url = "https://api.openrouteservice.org/geocode/search"
            r1 = await client.get(geocode_url, headers=headers, params={"text": start, "size": 1})
            r2 = await client.get(geocode_url, headers=headers, params={"text": end, "size": 1})
            if r1.status_code != 200 or r2.status_code != 200:
                return None
            coords1 = r1.json()["features"][0]["geometry"]["coordinates"]
            coords2 = r2.json()["features"][0]["geometry"]["coordinates"]
            route_url = "https://api.openrouteservice.org/v2/directions/driving-car"
            r = await client.post(
                route_url,
                headers={**headers, "Content-Type": "application/json"},
                json={"coordinates": [coords1, coords2]},
            )
            if r.status_code != 200:
                return None
            meters = r.json()["routes"][0]["summary"]["distance"]
            return round(meters / 1000, 1)
    except Exception:
        return None


@router.post("/", response_model=TripOut)
async def create_trip(trip: TripCreate, db: Session = Depends(get_db)):
    if not db.query(Family).filter(Family.id == trip.family_id).first():
        raise HTTPException(status_code=404, detail="Familie nicht gefunden")
    if not db.query(Vehicle).filter(Vehicle.id == trip.vehicle_id).first():
        raise HTTPException(status_code=404, detail="Fahrzeug nicht gefunden")

    km = trip.km
    if km is None and trip.start_location and trip.end_location:
        setting = db.query(Setting).filter(Setting.key == "ors_api_key").first()
        if setting and setting.value:
            km = await get_distance_km(trip.start_location, trip.end_location, setting.value)
        if km is None:
            raise HTTPException(status_code=400, detail="Km konnte nicht ermittelt werden. Bitte manuell eingeben.")

    if km is None:
        raise HTTPException(status_code=400, detail="Bitte Kilometer oder Start- und Zielort angeben")

    db_trip = Trip(
        date=trip.date,
        vehicle_id=trip.vehicle_id,
        family_id=trip.family_id,
        driver_name=trip.driver_name,
        start_location=trip.start_location,
        end_location=trip.end_location,
        km=km,
        round_trip=trip.round_trip,
        notes=trip.notes,
    )
    db.add(db_trip)
    db.commit()
    db.refresh(db_trip)
    return trip_to_out(db_trip)


@router.get("/", response_model=list[TripOut])
def list_trips(
    vehicle_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Trip)
    if vehicle_id:
        q = q.filter(Trip.vehicle_id == vehicle_id)
    if year:
        q = q.filter(extract("year", Trip.date) == year)
    if month:
        q = q.filter(extract("month", Trip.date) == month)
    return [trip_to_out(t) for t in q.order_by(Trip.date.desc()).all()]


@router.delete("/{trip_id}")
def delete_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Fahrt nicht gefunden")
    db.delete(trip)
    db.commit()
    return {"ok": True}


@router.post("/calculate-distance")
async def calculate_distance(payload: dict, db: Session = Depends(get_db)):
    start = payload.get("start")
    end = payload.get("end")
    if not start or not end:
        raise HTTPException(status_code=400, detail="Start und Ziel erforderlich")
    setting = db.query(Setting).filter(Setting.key == "ors_api_key").first()
    if not setting or not setting.value:
        raise HTTPException(status_code=400, detail="Kein ORS API-Key konfiguriert")
    km = await get_distance_km(start, end, setting.value)
    if km is None:
        raise HTTPException(status_code=400, detail="Strecke konnte nicht berechnet werden")
    return {"km": km}
