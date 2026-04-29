from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from database import get_db
from models import Settlement

router = APIRouter(prefix="/settlements", tags=["settlements"])


class SettleBody(BaseModel):
    vehicle_id: Optional[int] = None
    year: int
    month: Optional[int] = None  # null = Jahresabrechnung
    notes: Optional[str] = None


@router.get("/")
def list_settlements(vehicle_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Settlement)
    if vehicle_id:
        q = q.filter(Settlement.vehicle_id == vehicle_id)
    return [
        {"id": s.id, "vehicle_id": s.vehicle_id, "year": s.year,
         "month": s.month, "settled_at": s.settled_at, "notes": s.notes}
        for s in q.all()
    ]


@router.post("/")
def settle(body: SettleBody, db: Session = Depends(get_db)):
    q = db.query(Settlement).filter(
        Settlement.vehicle_id == body.vehicle_id,
        Settlement.year == body.year,
    )
    if body.month is not None:
        q = q.filter(Settlement.month == body.month)
    else:
        q = q.filter(Settlement.month == None)  # noqa: E711
    if q.first():
        raise HTTPException(status_code=400, detail="Bereits abgerechnet")
    s = Settlement(
        vehicle_id=body.vehicle_id,
        year=body.year,
        month=body.month,
        settled_at=date.today().isoformat(),
        notes=body.notes,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "settled_at": s.settled_at}


@router.delete("/{settlement_id}")
def unsettle(settlement_id: int, db: Session = Depends(get_db)):
    s = db.query(Settlement).filter(Settlement.id == settlement_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Nicht gefunden")
    db.delete(s)
    db.commit()
    return {"ok": True}
