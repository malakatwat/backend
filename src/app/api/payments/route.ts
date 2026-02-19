import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const connection = await getConnection();
    
    // We use a LEFT JOIN to combine payment data with the user's details
    const query = `
      SELECT 
        p.id, 
        p.amount, 
        p.currency, 
        p.payment_method, 
        p.status, 
        p.transaction_id,
        p.created_at,
        u.name as user_name, 
        u.email as user_email
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `;
    
    const [rows] = await connection.execute<RowDataPacket[]>(query);
    
    return NextResponse.json(rows);
  } catch (error: any) {
    console.error("Payments API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}