import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { RowDataPacket } from 'mysql2';

// 1. GET: Fetch all users and their basic health metrics
export async function GET() {
  try {
    const connection = await getConnection();
    
    // Notice we DO NOT select the password field for security
    const [rows] = await connection.execute<RowDataPacket[]>(`
      SELECT 
        id, name, email, role, goal, age, 
        current_weight, target_weight, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Users API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. DELETE: Allow admin to remove a user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const connection = await getConnection();
    await connection.execute('DELETE FROM users WHERE id = ?', [id]);

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}