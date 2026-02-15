import { NextRequest, NextResponse } from 'next/server';
import { getAutomation, updateAutomation, deleteAutomation, ensureDatabase } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const { id } = await params;
    const automation = await getAutomation(parseInt(id));
    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }
    return NextResponse.json(automation);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const { id } = await params;
    const body = await req.json();
    const automation = await updateAutomation(parseInt(id), body);
    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }
    return NextResponse.json(automation);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const { id } = await params;
    const deleted = await deleteAutomation(parseInt(id));
    if (!deleted) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
