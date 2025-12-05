import { NextResponse, type NextRequest } from 'next/server';
import mysql from 'mysql2/promise';
import { verifyAuth } from '@/lib/auth'; // The '@/' path alias correctly points to your 'src' folder
import { getConnection } from '@/lib/db';
// Database configuration
// const dbConfig = {
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD || "",
//     database: process.env.DB_DATABASE,
// };

// GET handler to get the current user's data
export async function GET(request: NextRequest) {
    try {
        // 1. Use the "Guard" to check the token
        const user = verifyAuth(request);

        // 2. If the token is invalid or missing, send 401 Unauthorized
        if (!user || !user.id) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // 3. If the token is valid, get the user's data from the database
       // const connection = await mysql.createConnection(dbConfig);
        const connection = await getConnection();
        // Select all the goals and user info, but NEVER the password hash
        const sql = `
            SELECT id, name, email, goal, age, current_weight, target_weight 
            FROM users 
            WHERE id = ?
        `;
        const [rows] = await connection.execute(sql, [user.id]);
        await connection.end();

        const users = rows as any[];
        if (users.length === 0) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        // 4. Send the user's data back to the app
        return NextResponse.json({ user: users[0] }, { status: 200 });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while getting user data' }, { status: 500 });
    }
}
