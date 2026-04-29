from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255))
    trips = relationship("Trip", back_populates="vehicle")
    costs = relationship("Cost", back_populates="vehicle")


class Family(Base):
    __tablename__ = "families"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    trips = relationship("Trip", back_populates="family")


class Trip(Base):
    __tablename__ = "trips"
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False)
    driver_name = Column(String(100))
    start_location = Column(String(255))
    end_location = Column(String(255))
    km = Column(Float, nullable=False)
    round_trip = Column(Boolean, default=False)
    notes = Column(Text)
    vehicle = relationship("Vehicle", back_populates="trips")
    family = relationship("Family", back_populates="trips")


class Cost(Base):
    __tablename__ = "costs"
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    paid_by_family_id = Column(Integer, ForeignKey("families.id"), nullable=True)
    cost_type = Column(String(50), nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(String(255))
    notes = Column(Text)
    vehicle = relationship("Vehicle", back_populates="costs")
    paid_by_family = relationship("Family")


class Driver(Base):
    __tablename__ = "drivers"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=True)
    family = relationship("Family")


class CostType(Base):
    __tablename__ = "cost_types"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False, unique=True)


class Settlement(Base):
    __tablename__ = "settlements"
    id = Column(Integer, primary_key=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=True)  # null = Jahresabrechnung
    settled_at = Column(Text, nullable=False)  # ISO date string
    notes = Column(Text)
    vehicle = relationship("Vehicle")


class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True)


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String(100), primary_key=True)
    value = Column(Text)
