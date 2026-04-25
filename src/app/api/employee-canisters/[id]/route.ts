import { NextRequest, NextResponse } from 'next/server';
import { invalidateEmployeeCanistersCache, invalidateInventoryCache, invalidateStockMovementsCache, getInventory } from '@/lib/data';
import type { EmployeeChemicalCanister, StockMovement } from '@/types';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, deleteEntity, readEntity, saveInventoryData } from '@/lib/data/write-helpers';

// GET /api/employee-canisters/[id] - Get single canister
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const canister = await readEntity<EmployeeChemicalCanister>('employeeCanister', id);

        if (!canister) {
            return NextResponse.json({ error: 'Canister not found' }, { status: 404 });
        }

        return NextResponse.json(canister);
    } catch (error: any) {
        console.error('Error fetching canister:', error);
        return NextResponse.json({ error: 'Failed to fetch canister' }, { status: 500 });
    }
}

// PUT /api/employee-canisters/[id] - Update canister (remaining amount, status)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await params;
        const body = await request.json();

        // Read existing canister
        const canister = await readEntity<EmployeeChemicalCanister>('employeeCanister', id);
        if (!canister) {
            return NextResponse.json({ error: 'Canister not found' }, { status: 404 });
        }

        // Update fields
        if (typeof body.remainingAmountGrams === 'number') {
            canister.remainingAmountGrams = body.remainingAmountGrams;

            // Auto-mark as empty if remaining is 0 or negative
            if (canister.remainingAmountGrams <= 0) {
                canister.status = 'empty';
                canister.remainingAmountGrams = 0;
            }
        }

        if (body.status) {
            canister.status = body.status;
        }

        // Handle return action - return unused chemicals to inventory
        if (body.action === 'return' && canister.status !== 'returned') {
            const returnedAmount = canister.remainingAmountGrams;

            if (returnedAmount > 0) {
                // Add back to inventory
                const inventory = await getInventory();
                const newBalance = inventory.chemicalStockGrams + returnedAmount;
                inventory.chemicalStockGrams = newBalance;

                // Update material stock too
                const chemicalMaterial = inventory.materials?.find(m => m.category === 'chemical' && m.isActive);
                if (chemicalMaterial) {
                    const materialIndex = inventory.materials!.findIndex(m => m.id === chemicalMaterial.id);
                    if (materialIndex !== -1) {
                        inventory.materials![materialIndex].currentStock = newBalance;
                        inventory.materials![materialIndex].updatedAt = new Date().toISOString();
                    }
                }

                await saveInventoryData(inventory);

                // Create stock movement record for return
                const movement: StockMovement = {
                    id: `mov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    materialId: 'mat_chemical_main',
                    type: 'return',
                    amount: returnedAmount, // Positive for return
                    balanceAfter: newBalance,
                    date: new Date().toISOString(),
                    description: `Возврат канистры от сотрудника (${returnedAmount} гр.)`,
                    relatedEntityType: 'employee',
                    relatedEntityId: canister.employeeId,
                    employeeId: canister.employeeId,
                };
                await saveEntity('stockMovement', movement);

                invalidateInventoryCache();
                invalidateStockMovementsCache();
            }

            canister.status = 'returned';
            canister.remainingAmountGrams = 0;
        }

        // Save updated canister
        await saveEntity('employeeCanister', canister);
        invalidateEmployeeCanistersCache();

        return NextResponse.json(canister);
    } catch (error: any) {
        console.error('Error updating canister:', error);
        return NextResponse.json({ error: 'Failed to update canister' }, { status: 500 });
    }
}

// DELETE /api/employee-canisters/[id] - Delete canister record
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await params;

        const existing = await readEntity('employeeCanister', id);
        if (!existing) {
            return NextResponse.json({ error: 'Canister not found' }, { status: 404 });
        }

        await deleteEntity('employeeCanister', id);
        invalidateEmployeeCanistersCache();

        return NextResponse.json({ success: true, message: 'Canister deleted' });
    } catch (error: any) {
        console.error('Error deleting canister:', error);
        return NextResponse.json({ error: 'Failed to delete canister' }, { status: 500 });
    }
}
