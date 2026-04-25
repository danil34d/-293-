import { NextRequest, NextResponse } from 'next/server';
import { getInventory, invalidateInventoryCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveInventoryData } from '@/lib/data/write-helpers';

// GET /api/inventory/materials/[id] - Get single material
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const inventory = await getInventory();
        const material = inventory.materials?.find(m => m.id === id);

        if (!material) {
            return NextResponse.json({ error: 'Material not found' }, { status: 404 });
        }

        return NextResponse.json(material);
    } catch (error: any) {
        console.error('Error fetching material:', error);
        return NextResponse.json({ error: 'Failed to fetch material' }, { status: 500 });
    }
}

// PUT /api/inventory/materials/[id] - Update material
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await params;
        const body = await request.json();
        const inventory = await getInventory();

        const materialIndex = inventory.materials?.findIndex(m => m.id === id) ?? -1;
        if (materialIndex === -1) {
            return NextResponse.json({ error: 'Material not found' }, { status: 404 });
        }

        const existingMaterial = inventory.materials![materialIndex];
        const updatedMaterial = {
            ...existingMaterial,
            ...body,
            id: existingMaterial.id, // Preserve ID
            createdAt: existingMaterial.createdAt, // Preserve creation date
            updatedAt: new Date().toISOString()
        };

        inventory.materials![materialIndex] = updatedMaterial;

        // If this is the main chemical material, sync with chemicalStockGrams
        if (updatedMaterial.category === 'chemical' && typeof body.currentStock === 'number') {
            inventory.chemicalStockGrams = body.currentStock;
        }

        await saveInventoryData(inventory);
        await invalidateInventoryCache();

        return NextResponse.json(updatedMaterial);
    } catch (error: any) {
        console.error('Error updating material:', error);
        return NextResponse.json({ error: 'Failed to update material' }, { status: 500 });
    }
}

// DELETE /api/inventory/materials/[id] - Delete material (soft delete by setting isActive to false)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const { id } = await params;
        const inventory = await getInventory();

        const materialIndex = inventory.materials?.findIndex(m => m.id === id) ?? -1;
        if (materialIndex === -1) {
            return NextResponse.json({ error: 'Material not found' }, { status: 404 });
        }

        // Soft delete
        inventory.materials![materialIndex].isActive = false;
        inventory.materials![materialIndex].updatedAt = new Date().toISOString();

        await saveInventoryData(inventory);
        await invalidateInventoryCache();

        return NextResponse.json({ success: true, message: 'Material deactivated' });
    } catch (error: any) {
        console.error('Error deleting material:', error);
        return NextResponse.json({ error: 'Failed to delete material' }, { status: 500 });
    }
}
