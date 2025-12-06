import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();
        if (!email || !password) {
            return NextResponse.json({ message: 'Please provide email and password.' }, { status: 400 });
        }

        const connection = await getConnection();
        const sql = 'SELECT * FROM users WHERE email = ?';
        const [rows] = await connection.execute<RowDataPacket[]>(sql, [email]);
        await connection.end();

        const users = rows;
        if (users.length === 0) {
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
        }
        
        const payload = { id: user.id, email: user.email, name: user.name };
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET is not defined.');
        }

        const token = jwt.sign(payload, secret, { expiresIn: '30d' });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...userWithoutPassword } = user;

        return NextResponse.json({ 
            message: 'Login successful!', 
            user: userWithoutPassword,
            token: token
        }, { status: 200 });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Login API Error:', errorMessage);
        return NextResponse.json({ message: errorMessage || 'Server error during login.' }, { status: 500 });
    }
}