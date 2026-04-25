import { NextRequest, NextResponse } from 'next/server';
import type { VehicleType } from '@/types';
import { requireAdmin } from '@/lib/server-auth';
import { getVehicleTypes } from '@/lib/data';
import { saveVehicleTypesData } from '@/lib/data/write-helpers';

export async function GET() {
  try {
    const vehicleTypes = await getVehicleTypes();
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
      vehicles = await getVehicleTypes();
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
    await saveVehicleTypesData(vehicles);

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

    let vehicles: VehicleType[] = await getVehicleTypes();

    // Don't allow deleting default vehicles
    const vehicle = vehicles.find(v => v.id === id);
    if (vehicle && !vehicle.isCustom) {
      return NextResponse.json(
        { error: 'Нельзя удалить стандартный тип машины' },
        { status: 400 }
      );
    }

    vehicles = vehicles.filter(v => v.id !== id);
    await saveVehicleTypesData(vehicles);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting vehicle type:', error);
    return NextResponse.json(
      { error: 'Ошибка удаления типа машины' },
      { status: 500 }
    );
  }
}
