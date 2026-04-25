import { NextRequest, NextResponse } from 'next/server';
import { getStockMovementsData, getInventory, invalidateStockMovementsCache, invalidateInventoryCache } from '@/lib/data';
import type { StockMovement, StockMovementType } from '@/types';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, saveInventoryData } from '@/lib/data/write-helpers';

// GET /api/stock-movements - Get all stock movements
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const materialId = searchParams.get('materialId');
        const type = searchParams.get('type') as StockMovementType | null;
        const employeeId = searchParams.get('employeeId');
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        let movements = await getStockMovementsData();

        // Apply filters
        if (materialId) {
            movements = movements.filter(m => m.materialId === materialId);
        }
        if (type) {
            movements = movements.filter(m => m.type === type);
        }
        if (employeeId) {
            movements = movements.filter(m => m.employeeId === employeeId);
        }
        if (from) {
            const fromDate = new Date(from);
            movements = movements.filter(m => new Date(m.date) >= fromDate);
        }
        if (to) {
            const toDate = new Date(to);
            movements = movements.filter(m => new Date(m.date) <= toDate);
        }

        return NextResponse.json(movements);
    } catch (error: any) {
        console.error('Error fetching stock movements:', error);
        return NextResponse.json({ error: 'Failed to fetch stock movements' }, { status: 500 });
    }
}

// POST /api/stock-movements - Create new stock movement
export async function POST(request: NextRequest) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await request.json();

        if (!body.materialId || !body.type || typeof body.amount !== 'number') {
            return NextResponse.json(
                { error: 'Missing required fields: materialId, type, amount' },
                { status: 400 }
            );
        }

        // Get current inventory to calculate balance after
        const inventory = await getInventory();
        const material = inventory.materials?.find(m => m.id === body.materialId);

        let currentStock = 0;
        if (material) {
            currentStock = material.currentStock;
        } else if (body.materialId === 'chemical_main' || body.materialId === 'mat_chemical_main') {
            currentStock = inventory.chemicalStockGrams;
        } else {
            return NextResponse.json(
                { error: `Material not found: ${body.materialId}` },
                { status: 404 }
            );
        }

        const balanceAfter = currentStock + body.amount;

        const newMovement: StockMovement = {
            id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            materialId: body.materialId,
            type: body.type,
            amount: body.amount,
            balanceAfter: balanceAfter,
            date: body.date || new Date().toISOString(),
            description: body.description || '',
            relatedEntityType: body.relatedEntityType,
            relatedEntityId: body.relatedEntityId,
            employeeId: body.employeeId,
            createdBy: body.createdBy
        };

        // Save movement
        await saveEntity('stockMovement', newMovement);

        // Update inventory stock
        if (material && Array.isArray(inventory.materials)) {
            const materialIndex = inventory.materials.findIndex(m => m.id === body.materialId);
            if (materialIndex === -1) {
                return NextResponse.json({ error: 'Material index not found' }, { status: 500 });
            }
            inventory.materials[materialIndex].currentStock = balanceAfter;
            inventory.materials[materialIndex].updatedAt = new Date().toISOString();

            // Sync chemical stock if it's the main chemical
            if (material.category === 'chemical') {
                inventory.chemicalStockGrams = balanceAfter;
            }
        } else {
            // Update main chemical stock
            inventory.chemicalStockGrams = balanceAfter;
        }

        await saveInventoryData(inventory);

        await invalidateStockMovementsCache();
        await invalidateInventoryCache();

        return NextResponse.json(newMovement, { status: 201 });
    } catch (error: any) {
        console.error('Error creating stock movement:', error);
        return NextResponse.json({ error: 'Failed to create stock movement' }, { status: 500 });
    }
}
