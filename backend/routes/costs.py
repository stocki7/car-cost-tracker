from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract
from pydantic import BaseModel, ConfigDict
from datetime import date
from typing import Optional

from database import get_db
from models import Cost, CostType, Family, Vehicle

router = APIRouter(prefix="/costs", tags=["costs"])


class CostCreate(BaseModel):
    date: date
    vehicle_id: int
    paid_by_family_id: int
    cost_type: str
    amount: float
    description: Optional[str] = None
    notes: Optional[str] = None


class CostOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    vehicle_id: Optional[int]
    vehicle_name: Optional[str]
    paid_by_family_id: Optional[int]
    paid_by_family_name: Optional[str]
    cost_type: str
    amount: float
    description: Optional[str]
    notes: Optional[str]


def cost_to_out(c: Cost) -> CostOut:
    return CostOut(
        id=c.id,
        date=c.date,
        vehicle_id=c.vehicle_id,
        vehicle_name=c.vehicle.name if c.vehicle else None,
        paid_by_family_id=c.paid_by_family_id,
        paid_by_family_name=c.paid_by_family.name if c.paid_by_family else None,
        cost_type=c.cost_type,
        amount=c.amount,
        description=c.description,
        notes=c.notes,
    )


@router.post("/", response_model=CostOut)
def create_cost(cost: CostCreate, db: Session = Depends(get_db)):
    if not db.query(Vehicle).filter(Vehicle.id == cost.vehicle_id).first():
        raise HTTPException(status_code=404, detail="Fahrzeug nicht gefunden")
    if not db.query(Family).filter(Family.id == cost.paid_by_family_id).first():
        raise HTTPException(status_code=404, detail="Familie nicht gefunden")
    db_cost = Cost(**cost.model_dump())
    db.add(db_cost)
    db.commit()
    db.refresh(db_cost)
    return cost_to_out(db_cost)


@router.get("/", response_model=list[CostOut])
def list_costs(
    vehicle_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Cost)
    if vehicle_id:
        q = q.filter(Cost.vehicle_id == vehicle_id)
    if year:
        q = q.filter(extract("year", Cost.date) == year)
    if month:
        q = q.filter(extract("month", Cost.date) == month)
    return [cost_to_out(c) for c in q.order_by(Cost.date.desc()).all()]


@router.delete("/{cost_id}")
def delete_cost(cost_id: int, db: Session = Depends(get_db)):
    cost = db.query(Cost).filter(Cost.id == cost_id).first()
    if not cost:
        raise HTTPException(status_code=404, detail="Kosten nicht gefunden")
    db.delete(cost)
    db.commit()
    return {"ok": True}


@router.get("/types")
def get_cost_types(db: Session = Depends(get_db)):
    return [ct.name for ct in db.query(CostType).order_by(CostType.id).all()]
