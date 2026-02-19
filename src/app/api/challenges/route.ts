import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

// 1. GET: Fetch all challenges
export async function GET() {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM challenges ORDER BY created_at DESC'
    );
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. POST: Create a new challenge
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, duration_days, status } = body;

    const connection = await getConnection();
    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO challenges (title, description, duration_days, status) VALUES (?, ?, ?, ?)',
      [title, description, duration_days, status || 'upcoming']
    );

    return NextResponse.json({ id: result.insertId, message: 'Challenge created' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 3. PUT: Update an existing challenge
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, description, duration_days, status } = body;

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const connection = await getConnection();
    await connection.execute(
      'UPDATE challenges SET title=?, description=?, duration_days=?, status=? WHERE id=?',
      [title, description, duration_days, status, id]
    );

    return NextResponse.json({ message: 'Challenge updated' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 4. DELETE: Remove a challenge
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const connection = await getConnection();
    await connection.execute('DELETE FROM challenges WHERE id = ?', [id]);

    return NextResponse.json({ message: 'Challenge deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}