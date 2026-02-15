import { NextRequest, NextResponse } from 'next/server';
import { getAllAutomations, createAutomation, ensureDatabase } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const automations = await getAllAutomations();
    return NextResponse.json(automations);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = req.cookies.get('digest_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDatabase();
    const body = await req.json();

    if (!body.name || !body.delivery_time || !body.recipient_email) {
      return NextResponse.json(
        { error: 'name, delivery_time, and recipient_email are required' },
        { status: 400 }
      );
    }

    const automation = await createAutomation({
      name: body.name,
      delivery_time: body.delivery_time,
      recipient_email: body.recipient_email,
      sections: body.sections,
      settings: body.settings,
    });

    return NextResponse.json(automation, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
