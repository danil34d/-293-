export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { CounterAgent } from '@/types';
import { invalidateCounterAgentsCache } from '@/lib/data-loader';
import { requireAdmin } from '@/lib/server-auth';

const dataDir = path.join(process.cwd(), 'data', 'counter-agents');

// Ensure the data directory exists
async function ensureDataDirectory() {
  try {
    await fs.access(dataDir);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dataDir, { recursive: true });
    } else {
      throw error;
    }
  }
}

async function readCounterAgentFile(id: string): Promise<CounterAgent | null> {
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent) as CounterAgent;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

// GET request handler for a specific counter agent
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    await ensureDataDirectory();
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Counter agent not found' }, { status: 404 });
    }
    console.error(`Error reading counter agent data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT request handler (for updating or creating data)
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Agent ID is required for PUT' }, { status: 400 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    await ensureDataDirectory();
    const updatedData: CounterAgent = await request.json();
    const existingData = await readCounterAgentFile(id);
    
    // Ensure the ID in the body matches the ID in the path, or set it if not present
    if (!updatedData.id || updatedData.id !== id) {
        updatedData.id = id;
    }

    if (existingData) {
      if (updatedData.archived === undefined) {
        updatedData.archived = existingData.archived;
      }

      if (updatedData.archivedAt === undefined) {
        updatedData.archivedAt = existingData.archivedAt;
      }
    }

    await fs.writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf-8');
    invalidateCounterAgentsCache();
    return NextResponse.json({ message: 'Data updated successfully', agent: updatedData });
  } catch (error) {
    console.error(`Error writing counter agent data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Agent ID is required for PATCH' }, { status: 400 });
  }

  try {
    await ensureDataDirectory();
    const existingData = await readCounterAgentFile(id);
    if (!existingData) {
      return NextResponse.json({ error: 'Counter agent not found' }, { status: 404 });
    }

    const patch = await request.json();
    if (typeof patch.archived !== 'boolean') {
      return NextResponse.json({ error: 'Field "archived" must be boolean' }, { status: 400 });
    }

    const updatedData: CounterAgent = {
      ...existingData,
      archived: patch.archived,
      archivedAt: patch.archived ? (existingData.archivedAt || new Date().toISOString()) : undefined,
    };

    const filePath = path.join(dataDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf-8');
    invalidateCounterAgentsCache();

    return NextResponse.json({
      message: patch.archived ? 'Counter agent archived successfully' : 'Counter agent restored successfully',
      agent: updatedData,
    });
  } catch (error) {
    console.error(`Error patching counter agent data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE request handler
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Agent ID is required for DELETE' }, { status: 400 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    await ensureDataDirectory();
    const existingData = await readCounterAgentFile(id);
    if (!existingData) {
      return NextResponse.json({ error: 'Counter agent not found' }, { status: 404 });
    }

    if (!existingData.archived) {
      return NextResponse.json(
        { error: 'Сначала перенесите контрагента в архив, затем удаляйте окончательно.' },
        { status: 409 }
      );
    }

    await fs.unlink(filePath);
    invalidateCounterAgentsCache();
    return NextResponse.json({ message: 'Counter agent deleted successfully' });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Counter agent not found' }, { status: 404 });
    }
    console.error(`Error deleting counter agent data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
