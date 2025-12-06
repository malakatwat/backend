import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth'; 
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
    try {
        // 1. Use the "Guard" to check the token
        const user = verifyAuth(request);

        // 2. If the token is invalid or missing, send 401 Unauthorized
        if (!user || !user.id) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // 3. If the token is valid, get the user's data from the database
        const connection = await getConnection();
        
        // Select all the goals and user info, but NEVER the password hash
        const sql = `
            SELECT id, name, email, goal, age, current_weight, target_weight, gender, activity_level, height 
            FROM users 
            WHERE id = ?
        `;
        
        // Use RowDataPacket[] to strictly type the result
        const [rows] = await connection.execute<RowDataPacket[]>(sql, [user.id]);
        await connection.end();

        const users = rows;
        if (users.length === 0) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        // 4. Send the user's data back to the app
        return NextResponse.json({ user: users[0] }, { status: 200 });

    } catch (error: unknown) {
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while getting user data' }, { status: 500 });
    }
}