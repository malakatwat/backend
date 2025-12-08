import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
    try {
        const user = verifyAuth(request);
        if (!user || !user.id) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const connection = await getConnection();

        const sql = `
            SELECT id, name, email, goal, age, current_weight, target_weight, gender, activity_level, height 
            FROM users 
            WHERE id = ?
        `;
        
        // Explicitly type the result as RowDataPacket[] to avoid 'any' error
        const [rows] = await connection.execute<RowDataPacket[]>(sql, [user.id]);
        await connection.end();

        if (rows.length === 0) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ user: rows[0] }, { status: 200 });

    } catch (error: unknown) {
        // Use unknown type for error handling
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while getting user data' }, { status: 500 });
    }
}