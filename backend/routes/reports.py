from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import extract
from typing import Optional

from database import get_db
from models import Trip, Cost, Family, Vehicle

router = APIRouter(prefix="/reports", tags=["reports"])


def compute_split(db: Session, vehicle_id: Optional[int], year: Optional[int], month: Optional[int]):
    families = db.query(Family).order_by(Family.id).all()

    trip_q = db.query(Trip)
    cost_q = db.query(Cost)
    if vehicle_id:
        trip_q = trip_q.filter(Trip.vehicle_id == vehicle_id)
        cost_q = cost_q.filter(Cost.vehicle_id == vehicle_id)
    if year:
        trip_q = trip_q.filter(extract("year", Trip.date) == year)
        cost_q = cost_q.filter(extract("year", Cost.date) == year)
    if month:
        trip_q = trip_q.filter(extract("month", Trip.date) == month)
        cost_q = cost_q.filter(extract("month", Cost.date) == month)

    trips = trip_q.all()
    costs = cost_q.all()

    total_km = sum(t.km for t in trips)
    total_cost = sum(c.amount for c in costs)

    cost_by_type = {}
    for c in costs:
        cost_by_type[c.cost_type] = cost_by_type.get(c.cost_type, 0.0) + c.amount

    family_km = {f.id: {"name": f.name, "km": 0.0} for f in families}
    for t in trips:
        if t.family_id in family_km:
            family_km[t.family_id]["km"] += t.km

    # paid per family
    family_paid = {f.id: 0.0 for f in families}
    for c in costs:
        if c.paid_by_family_id and c.paid_by_family_id in family_paid:
            family_paid[c.paid_by_family_id] += c.amount

    split = []
    for fid, data in family_km.items():
        ratio = data["km"] / total_km if total_km > 0 else 0
        should_pay = total_cost * ratio
        paid = family_paid.get(fid, 0.0)
        # balance > 0 means they overpaid (are owed money)
        balance = paid - should_pay
        split.append({
            "family_id": fid,
            "family_name": data["name"],
            "km": round(data["km"], 1),
            "ratio": round(ratio * 100, 1),
            "should_pay": round(should_pay, 2),
            "paid": round(paid, 2),
            "balance": round(balance, 2),
        })

    # Build settlement: who pays whom
    settlement = _calc_settlement(split)

    return {
        "total_km": round(total_km, 1),
        "total_cost": round(total_cost, 2),
        "cost_by_type": {k: round(v, 2) for k, v in cost_by_type.items()},
        "split": split,
        "settlement": settlement,
    }


def _calc_settlement(split: list) -> list:
    """Minimal set of transfers to settle all balances."""
    creditors = sorted([s for s in split if s["balance"] > 0.005], key=lambda x: -x["balance"])
    debtors = sorted([s for s in split if s["balance"] < -0.005], key=lambda x: x["balance"])

    transfers = []
    ci, di = 0, 0
    cred = [dict(s) for s in creditors]
    debt = [dict(s) for s in debtors]

    while ci < len(cred) and di < len(debt):
        amount = min(cred[ci]["balance"], -debt[di]["balance"])
        if amount > 0.005:
            transfers.append({
                "from_family": debt[di]["family_name"],
                "to_family": cred[ci]["family_name"],
                "amount": round(amount, 2),
            })
        cred[ci]["balance"] -= amount
        debt[di]["balance"] += amount
        if cred[ci]["balance"] < 0.005:
            ci += 1
        if debt[di]["balance"] > -0.005:
            di += 1

    return transfers


@router.get("/summary")
def summary(
    vehicle_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return compute_split(db, vehicle_id, year, month)


@router.get("/monthly")
def monthly_report(year: int, vehicle_id: Optional[int] = None, db: Session = Depends(get_db)):
    return [{"month": m, **compute_split(db, vehicle_id, year, m)} for m in range(1, 13)]


@router.get("/yearly")
def yearly_report(vehicle_id: Optional[int] = None, db: Session = Depends(get_db)):
    years_raw = (
        db.query(extract("year", Trip.date).label("y"))
        .union(db.query(extract("year", Cost.date).label("y")))
        .all()
    )
    years = sorted({int(r.y) for r in years_raw if r.y}, reverse=True)
    return [{"year": y, **compute_split(db, vehicle_id, y, None)} for y in years]
