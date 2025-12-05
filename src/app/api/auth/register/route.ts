import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    console.log('--- REGISTER API HIT ---');
    try {
        const body = await request.json();
        console.log('Received payload:', body); 

        const { name, email, password, goal, age, currentWeight, targetWeight, gender, activityLevel, height } = body;

        if (!name || !email || !password || !goal) {
            return NextResponse.json({ message: 'Please provide all required fields.' }, { status: 400 });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const connection = await getConnection();

        const sql = `
            INSERT INTO users (name, email, password, goal, age, current_weight, target_weight, gender, activity_level, height)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.execute(sql, [
            name, email, hashedPassword, goal, age, currentWeight, targetWeight, gender, activityLevel, height
        ]);
        
        await connection.end();

        return NextResponse.json({ message: 'User registered successfully!' }, { status: 201 });

    } catch (error: any) {
        console.error('--- REGISTRATION ERROR ---:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return NextResponse.json({ message: 'Email already exists.' }, { status: 409 });
        }
        return NextResponse.json({ message: 'Server error during registration.' }, { status: 500 });
    }
}