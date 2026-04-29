from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Optional

from database import get_db
from models import Family, CostType, Vehicle, Driver, Location, Setting, Trip, Cost

router = APIRouter(prefix="/settings", tags=["settings"])


class NameBody(BaseModel):
    name: str


class VehicleBody(BaseModel):
    name: str
    description: Optional[str] = None


class SettingUpdate(BaseModel):
    value: str


class DriverBody(BaseModel):
    name: str
    family_id: Optional[int] = None


class FamilyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class CostTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str]


class DriverOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    family_id: Optional[int]
    family_name: Optional[str]


def _get_or_404(db: Session, model, id: int, label: str):
    obj = db.query(model).filter(model.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail=f"{label} nicht gefunden")
    return obj


# ── Vehicles ──────────────────────────────────────────────────────────────────

@router.get("/vehicles", response_model=list[VehicleOut])
def list_vehicles(db: Session = Depends(get_db)):
    return db.query(Vehicle).order_by(Vehicle.id).all()


@router.post("/vehicles", response_model=VehicleOut)
def create_vehicle(body: VehicleBody, db: Session = Depends(get_db)):
    v = Vehicle(name=body.name.strip(), description=body.description)
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.put("/vehicles/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(vehicle_id: int, body: VehicleBody, db: Session = Depends(get_db)):
    v = _get_or_404(db, Vehicle, vehicle_id, "Fahrzeug")
    v.name = body.name.strip()
    v.description = body.description
    db.commit()
    db.refresh(v)
    return v


@router.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    v = _get_or_404(db, Vehicle, vehicle_id, "Fahrzeug")
    trip_count = db.query(Trip).filter(Trip.vehicle_id == vehicle_id).count()
    cost_count = db.query(Cost).filter(Cost.vehicle_id == vehicle_id).count()
    if trip_count + cost_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Fahrzeug hat noch {trip_count} Fahrt(en) und {cost_count} Kosteneintrag/-einträge."
        )
    db.delete(v)
    db.commit()
    return {"ok": True}


# ── Families ──────────────────────────────────────────────────────────────────

@router.get("/families", response_model=list[FamilyOut])
def list_families(db: Session = Depends(get_db)):
    return db.query(Family).order_by(Family.id).all()


@router.post("/families", response_model=FamilyOut)
def create_family(body: NameBody, db: Session = Depends(get_db)):
    f = Family(name=body.name.strip())
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@router.put("/families/{family_id}", response_model=FamilyOut)
def update_family(family_id: int, body: NameBody, db: Session = Depends(get_db)):
    f = _get_or_404(db, Family, family_id, "Familie")
    f.name = body.name.strip()
    db.commit()
    db.refresh(f)
    return f


@router.delete("/families/{family_id}")
def delete_family(family_id: int, db: Session = Depends(get_db)):
    f = _get_or_404(db, Family, family_id, "Familie")
    trip_count = db.query(Trip).filter(Trip.family_id == family_id).count()
    if trip_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Familie hat noch {trip_count} Fahrt(en) – bitte zuerst löschen."
        )
    db.delete(f)
    db.commit()
    return {"ok": True}


# ── Drivers ───────────────────────────────────────────────────────────────────

def _driver_out(d: Driver) -> DriverOut:
    return DriverOut(id=d.id, name=d.name, family_id=d.family_id,
                     family_name=d.family.name if d.family else None)


@router.get("/drivers", response_model=list[DriverOut])
def list_drivers(db: Session = Depends(get_db)):
    return [_driver_out(d) for d in db.query(Driver).order_by(Driver.name).all()]


@router.post("/drivers", response_model=DriverOut)
def create_driver(body: DriverBody, db: Session = Depends(get_db)):
    d = Driver(name=body.name.strip(), family_id=body.family_id)
    db.add(d)
    db.commit()
    db.refresh(d)
    return _driver_out(d)


@router.put("/drivers/{driver_id}", response_model=DriverOut)
def update_driver(driver_id: int, body: DriverBody, db: Session = Depends(get_db)):
    d = _get_or_404(db, Driver, driver_id, "Fahrer")
    d.name = body.name.strip()
    d.family_id = body.family_id
    db.commit()
    db.refresh(d)
    return _driver_out(d)


@router.delete("/drivers/{driver_id}")
def delete_driver(driver_id: int, db: Session = Depends(get_db)):
    d = _get_or_404(db, Driver, driver_id, "Fahrer")
    db.delete(d)
    db.commit()
    return {"ok": True}


# ── Cost Types ────────────────────────────────────────────────────────────────

@router.get("/cost-types", response_model=list[CostTypeOut])
def list_cost_types(db: Session = Depends(get_db)):
    return db.query(CostType).order_by(CostType.id).all()


@router.post("/cost-types", response_model=CostTypeOut)
def create_cost_type(body: NameBody, db: Session = Depends(get_db)):
    name = body.name.strip()
    if db.query(CostType).filter(CostType.name == name).first():
        raise HTTPException(status_code=400, detail="Kostenart existiert bereits")
    ct = CostType(name=name)
    db.add(ct)
    db.commit()
    db.refresh(ct)
    return ct


@router.put("/cost-types/{ct_id}", response_model=CostTypeOut)
def update_cost_type(ct_id: int, body: NameBody, db: Session = Depends(get_db)):
    ct = _get_or_404(db, CostType, ct_id, "Kostenart")
    ct.name = body.name.strip()
    db.commit()
    db.refresh(ct)
    return ct


@router.delete("/cost-types/{ct_id}")
def delete_cost_type(ct_id: int, db: Session = Depends(get_db)):
    ct = _get_or_404(db, CostType, ct_id, "Kostenart")
    in_use = db.query(Cost).filter(Cost.cost_type == ct.name).count()
    if in_use > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Kostenart wird in {in_use} Eintrag/Einträgen verwendet."
        )
    db.delete(ct)
    db.commit()
    return {"ok": True}


# ── Locations ─────────────────────────────────────────────────────────────────

@router.get("/locations")
def list_locations(db: Session = Depends(get_db)):
    return [loc.name for loc in db.query(Location).order_by(Location.name).all()]


@router.post("/locations")
def create_location(body: NameBody, db: Session = Depends(get_db)):
    name = body.name.strip()
    if db.query(Location).filter(Location.name == name).first():
        raise HTTPException(status_code=400, detail="Ort existiert bereits")
    db.add(Location(name=name))
    db.commit()
    return {"ok": True}


@router.delete("/locations/{name:path}")
def delete_location(name: str, db: Session = Depends(get_db)):
    loc = db.query(Location).filter(Location.name == name).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Ort nicht gefunden")
    db.delete(loc)
    db.commit()
    return {"ok": True}


# ── ORS Key ───────────────────────────────────────────────────────────────────

@router.get("/ors-key")
def get_ors_key(db: Session = Depends(get_db)):
    s = db.query(Setting).filter(Setting.key == "ors_api_key").first()
    return {"configured": bool(s and s.value)}


@router.put("/ors-key")
def set_ors_key(body: SettingUpdate, db: Session = Depends(get_db)):
    s = db.query(Setting).filter(Setting.key == "ors_api_key").first()
    if s:
        s.value = body.value
    else:
        db.add(Setting(key="ors_api_key", value=body.value))
    db.commit()
    return {"ok": True}
