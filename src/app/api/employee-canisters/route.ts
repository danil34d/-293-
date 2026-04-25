import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeCanistersData, invalidateEmployeeCanistersCache, getInventory, invalidateInventoryCache, invalidateStockMovementsCache } from '@/lib/data';
import type { EmployeeChemicalCanister, StockMovement } from '@/types';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, saveInventoryData } from '@/lib/data/write-helpers';

// GET /api/employee-canisters - Get all canisters or filter by employee
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get('employeeId');
        const status = searchParams.get('status') as EmployeeChemicalCanister['status'] | null;
        const activeOnly = searchParams.get('activeOnly') === 'true';

        let canisters = await getEmployeeCanistersData();

        // Apply filters
        if (employeeId) {
            canisters = canisters.filter(c => c.employeeId === employeeId);
        }
        if (status) {
            canisters = canisters.filter(c => c.status === status);
        }
        if (activeOnly) {
            canisters = canisters.filter(c => c.status === 'active');
        }

        // Sort by issuedAt descending
        canisters.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

        return NextResponse.json(canisters);
    } catch (error: any) {
        console.error('Error fetching employee canisters:', error);
        return NextResponse.json({ error: 'Failed to fetch employee canisters' }, { status: 500 });
    }
}

// POST /api/employee-canisters - Issue a new canister to employee
export async function POST(request: NextRequest) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await request.json();

        if (!body.employeeId) {
            return NextResponse.json(
                { error: 'Missing required field: employeeId' },
                { status: 400 }
            );
        }

        // Get inventory settings for default values
        const inventory = await getInventory();
        const settings = inventory.settings;

        const initialAmount = body.initialAmountGrams ?? settings?.canisterWeightGrams ?? 21000;
        const price = body.priceRub ?? settings?.canisterPriceRub ?? 3000;

        const newCanister: EmployeeChemicalCanister = {
            id: `canister_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            employeeId: body.employeeId,
            issuedAt: body.issuedAt || new Date().toISOString(),
            initialAmountGrams: initialAmount,
            remainingAmountGrams: initialAmount,
            priceRub: price,
            status: 'active',
        };

        // Save canister
        await saveEntity('employeeCanister', newCanister);

        // Subtract from inventory (issuing to employee reduces warehouse stock)
        const newInventoryBalance = inventory.chemicalStockGrams - initialAmount;
        inventory.chemicalStockGrams = newInventoryBalance;

        // Also update main chemical material
        const chemicalMaterial = inventory.materials?.find(m => m.category === 'chemical' && m.isActive);
        if (chemicalMaterial && Array.isArray(inventory.materials)) {
            const materialIndex = inventory.materials.findIndex(m => m.id === chemicalMaterial.id);
            if (materialIndex !== -1) {
                inventory.materials[materialIndex].currentStock = newInventoryBalance;
                inventory.materials[materialIndex].updatedAt = new Date().toISOString();
            }
        }

        await saveInventoryData(inventory);

        // Create stock movement record for issue
        const movement: StockMovement = {
            id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            materialId: 'mat_chemical_main',
            type: 'issue',
            amount: -initialAmount,
            balanceAfter: newInventoryBalance,
            date: new Date().toISOString(),
            description: `Выдача канистры сотруднику`,
            relatedEntityType: 'employee',
            relatedEntityId: body.employeeId,
            employeeId: body.employeeId,
        };
        await saveEntity('stockMovement', movement);

        invalidateEmployeeCanistersCache();
        invalidateInventoryCache();
        invalidateStockMovementsCache();

        return NextResponse.json(newCanister, { status: 201 });
    } catch (error: any) {
        console.error('Error issuing canister:', error);
        return NextResponse.json({ error: 'Failed to issue canister' }, { status: 500 });
    }
}
