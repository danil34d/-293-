export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireAdmin } from '@/lib/server-auth';

const dataDir = path.join(process.cwd(), 'data');

export async function POST(request: Request) {
  try {
    const auth = requireAdmin();
    if (auth instanceof NextResponse) return auth;

    // When the app is running on PostgreSQL, the legacy JSON wipe below would
    // have no effect on what users see (reads come from PG via data-loader's
    // runtime delegation). Dispatch to the PG-side helper, which runs the
    // delete in a single transaction.
    if (process.env.DATA_SOURCE === 'postgres') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pg = require('@/lib/data/pg-adapter');
      await pg.resetFinancialData();
      // Drop in-memory caches in data-loader so the JSON branch (used as a
      // fallback path through delegation) doesn't keep serving pre-reset
      // values to anything that reads through it.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dl = require('@/lib/data-loader');
      await Promise.all([
        dl.invalidateWashEventsCache?.(),
        dl.invalidateAllEmployeeTransactionsCache?.(),
        dl.invalidateAllClientTransactionsCache?.(),
        dl.invalidateExpensesCache?.(),
        dl.invalidateStockMovementsCache?.(),
        dl.invalidateAggregatorsCache?.(),
        dl.invalidateCounterAgentsCache?.(),
        dl.invalidateInventoryCache?.(),
      ].filter(Boolean));
      return NextResponse.json({
        message: 'Финансовые данные очищены (PostgreSQL)',
        cleared: ['wash-events', 'employee-transactions', 'expenses', 'client-transactions', 'stock-movements', 'inventory.balance', 'aggregator.balance', 'counter-agent.balance'],
        store: 'postgres',
      });
    }

    // Directories/files to clear (wash events, transactions, expenses)
    const pathsToClear = [
      path.join(dataDir, 'wash-events'),
      path.join(dataDir, 'employee-transactions'),
      path.join(dataDir, 'expenses'),
      path.join(dataDir, 'client-transactions'),
      path.join(dataDir, 'stock-movements'),
    ];

    for (const dirPath of pathsToClear) {
      try {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            await fs.unlink(path.join(dirPath, file));
          }
        }
      } catch (error: any) {
        // Directory might not exist, that's ok
        if (error.code !== 'ENOENT') {
          console.error(`Error clearing ${dirPath}:`, error);
        }
      }
    }

    // Reset inventory balance while preserving settings/materials
    const inventoryPath = path.join(dataDir, 'inventory.json');
    try {
      const inventoryRaw = await fs.readFile(inventoryPath, 'utf-8');
      const inventory = JSON.parse(inventoryRaw);
      const safeInventory = {
        ...inventory,
        chemicalStockGrams: 0,
        materials: Array.isArray(inventory.materials) ? inventory.materials : [],
        settings: inventory.settings ?? {
          defaultChemicalConsumptionPerWash: 700,
          canisterWeightGrams: 21000,
          canisterVolumeMl: 19000,
          canisterPriceRub: 3000,
          lowStockThresholdKg: 10,
          autoDeductChemical: true,
          chemicalPricePerKg: 150,
        },
      };
      await fs.writeFile(inventoryPath, JSON.stringify(safeInventory, null, 2));
    } catch {
      const defaultInventory = {
        chemicalStockGrams: 0,
        materials: [],
        settings: {
          defaultChemicalConsumptionPerWash: 700,
          canisterWeightGrams: 21000,
          canisterVolumeMl: 19000,
          canisterPriceRub: 3000,
          lowStockThresholdKg: 10,
          autoDeductChemical: true,
          chemicalPricePerKg: 150,
        },
      };
      await fs.writeFile(inventoryPath, JSON.stringify(defaultInventory, null, 2));
    }

    // Reset balances for aggregators (keep other data)
    const aggregatorsDir = path.join(dataDir, 'aggregators');
    try {
      const aggFiles = await fs.readdir(aggregatorsDir);
      for (const file of aggFiles) {
        if (file.endsWith('.json')) {
          const filePath = path.join(aggregatorsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const aggregator = JSON.parse(content);
          aggregator.balance = 0;
          await fs.writeFile(filePath, JSON.stringify(aggregator, null, 2));
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Error resetting aggregators:', error);
      }
    }

    // Reset balances for counter-agents (keep other data)
    const counterAgentsDir = path.join(dataDir, 'counter-agents');
    try {
      const caFiles = await fs.readdir(counterAgentsDir);
      for (const file of caFiles) {
        if (file.endsWith('.json')) {
          const filePath = path.join(counterAgentsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const counterAgent = JSON.parse(content);
          counterAgent.balance = 0;
          await fs.writeFile(filePath, JSON.stringify(counterAgent, null, 2));
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Error resetting counter-agents:', error);
      }
    }

    return NextResponse.json({
      message: 'Данные успешно очищены',
      cleared: ['wash-events', 'employee-transactions', 'expenses', 'client-transactions', 'stock-movements', 'inventory', 'balances']
    });

  } catch (error: any) {
    console.error('Error resetting data:', error);
    return NextResponse.json({ error: 'Не удалось очистить данные: ' + error.message }, { status: 500 });
  }
}
