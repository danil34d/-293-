import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getInventory, invalidateInventoryCache } from '@/lib/data-loader';
import type { Inventory, InventoryMaterial, InventorySettings } from '@/types';
import { requireAdmin } from '@/lib/server-auth';

const INVENTORY_FILE = path.join(process.cwd(), 'data', 'inventory.json');

// GET /api/inventory - Get full inventory data
export async function GET() {
    try {
        const inventory = await getInventory();
        return NextResponse.json(inventory);
    } catch (error: any) {
        console.error('Error fetching inventory:', error);
        return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
    }
}

// PUT /api/inventory - Update inventory (settings, stock, materials)
export async function PUT(request: NextRequest) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await request.json();
        const currentInventory = await getInventory();

        // Update chemical stock if provided
        if (typeof body.chemicalStockGrams === 'number') {
            currentInventory.chemicalStockGrams = body.chemicalStockGrams;
        }

        // Update settings if provided
        if (body.settings) {
            currentInventory.settings = {
                ...currentInventory.settings,
                ...body.settings
            };
        }

        // Update materials if provided
        if (body.materials) {
            currentInventory.materials = body.materials;
        }

        await fs.writeFile(INVENTORY_FILE, JSON.stringify(currentInventory, null, 2), 'utf-8');
        await invalidateInventoryCache();

        return NextResponse.json(currentInventory);
    } catch (error: any) {
        console.error('Error updating inventory:', error);
        return NextResponse.json({ error: 'Failed to update inventory' }, { status: 500 });
    }
}

// POST /api/inventory - Add new material
export async function POST(request: NextRequest) {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    try {
        const body = await request.json();
        const currentInventory = await getInventory();

        if (!body.name || !body.category || !body.unit) {
            return NextResponse.json({ error: 'Missing required fields: name, category, unit' }, { status: 400 });
        }

        const newMaterial: InventoryMaterial = {
            id: `mat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: body.name,
            category: body.category,
            unit: body.unit,
            currentStock: body.currentStock || 0,
            minStock: body.minStock,
            pricePerUnit: body.pricePerUnit,
            description: body.description,
            isActive: body.isActive !== false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!currentInventory.materials) {
            currentInventory.materials = [];
        }
        currentInventory.materials.push(newMaterial);

        await fs.writeFile(INVENTORY_FILE, JSON.stringify(currentInventory, null, 2), 'utf-8');
        await invalidateInventoryCache();

        return NextResponse.json(newMaterial, { status: 201 });
    } catch (error: any) {
        console.error('Error adding material:', error);
        return NextResponse.json({ error: 'Failed to add material' }, { status: 500 });
    }
}
