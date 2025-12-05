import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db'; // 1. Import our new function
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// 2. We no longer need dbConfig here!

export async function POST(request: Request) {
    console.log('\n--- LOGIN ATTEMPT ---');
    try {
        const { email, password } = await request.json();
        if (!email || !password) {
            return NextResponse.json({ message: 'Please provide email and password.' }, { status: 400 });
        }

        const connection = await getConnection(); // 3. Use our new function
        console.log('Login: Database connection successful!');

        const sql = 'SELECT * FROM users WHERE email = ?';
        const [rows] = await connection.execute(sql, [email]);
        await connection.end();

        const users = rows as any[];
        if (users.length === 0) {
            console.warn('Login: User not found.');
            return NextResponse.json({ message: 'User not found.' }, { status: 404 });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.warn('Login: Invalid credentials.');
            return NextResponse.json({ message: 'Invalid credentials.' }, { status: 401 });
        }
        
        console.log('Login: Success. Creating token...');
        const payload = { id: user.id, email: user.email, name: user.name };
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET is not defined.');
        }

        const token = jwt.sign(payload, secret, { expiresIn: '30d' });
        const { password: _, ...userWithoutPassword } = user;

        return NextResponse.json({ 
            message: 'Login successful!', 
            user: userWithoutPassword,
            token: token
        }, { status: 200 });

    } catch (error: any) {
        console.error('--- LOGIN API CRASHED ---', error.message);
        return NextResponse.json({ message: error.message || 'Server error during login.' }, { status: 500 });
    }
}