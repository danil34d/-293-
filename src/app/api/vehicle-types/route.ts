import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { VehicleType } from '@/types';
import { requireAdmin } from '@/lib/server-auth';

const VEHICLE_TYPES_FILE = path.join(process.cwd(), 'data', 'vehicle-types.json');

export async function GET() {
  try {
    const data = await fs.readFile(VEHICLE_TYPES_FILE, 'utf-8');
    const vehicleTypes: VehicleType[] = JSON.parse(data);
    return NextResponse.json(vehicleTypes);
  } catch (error) {
    console.error('Error reading vehicle types:', error);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const newVehicle: Omit<VehicleType, 'id'> = await req.json();

    // Validate the vehicle
    if (!newVehicle.name || newVehicle.name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Название машины обязательно' },
        { status: 400 }
      );
    }

    if (!newVehicle.areaM2 || newVehicle.areaM2 <= 0) {
      return NextResponse.json(
        { error: 'Площадь должна быть больше 0' },
        { status: 400 }
      );
    }

    // Read existing vehicles
    let vehicles: VehicleType[] = [];
    try {
      const data = await fs.readFile(VEHICLE_TYPES_FILE, 'utf-8');
      vehicles = JSON.parse(data);
    } catch {
      vehicles = [];
    }

    // Generate ID and consumption
    const id = `custom_${Date.now()}`;
    const consumptionCoefficient = 2.0 / 116.43; // Based on truck
    const consumptionLiters = newVehicle.areaM2 * consumptionCoefficient;
    const recommendedPrice = Math.round(newVehicle.areaM2 * (1800 / 116.43));

    const vehicleToAdd: VehicleType = {
      ...newVehicle,
      id,
      consumptionLiters: parseFloat(consumptionLiters.toFixed(3)),
      recommendedPrice: newVehicle.recommendedPrice || recommendedPrice,
      isCustom: true,
    };

    vehicles.push(vehicleToAdd);
    await fs.writeFile(VEHICLE_TYPES_FILE, JSON.stringify(vehicles, null, 2), 'utf-8');

    return NextResponse.json(vehicleToAdd);
  } catch (error) {
    console.error('Error adding vehicle type:', error);
    return NextResponse.json(
      { error: 'Ошибка добавления типа машины' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID машины обязателен' },
        { status: 400 }
      );
    }

    const data = await fs.readFile(VEHICLE_TYPES_FILE, 'utf-8');
    let vehicles: VehicleType[] = JSON.parse(data);

    // Don't allow deleting default vehicles
    const vehicle = vehicles.find(v => v.id === id);
    if (vehicle && !vehicle.isCustom) {
      return NextResponse.json(
        { error: 'Нельзя удалить стандартный тип машины' },
        { status: 400 }
      );
    }

    vehicles = vehicles.filter(v => v.id !== id);
    await fs.writeFile(VEHICLE_TYPES_FILE, JSON.stringify(vehicles, null, 2), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting vehicle type:', error);
    return NextResponse.json(
      { error: 'Ошибка удаления типа машины' },
      { status: 500 }
    );
  }
}
