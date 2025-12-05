import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const user = verifyAuth(request);
        if (!user || !user.id) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { name, calories, protein, carbs, fat, serving_size, serving_unit } = await request.json();

        if (!name || !calories || !serving_unit) {
            return NextResponse.json({ message: 'Missing required fields (Name, Calories, Serving Unit).' }, { status: 400 });
        }

        const connection = await getConnection();

        // Save the new custom food item to the database
        const sql = `
            INSERT INTO food_items (name, calories, protein, carbs, fat, serving_size, serving_unit)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        // We use 0.00 for values the user might leave blank, ensuring database integrity
        const [result] = await connection.execute(sql, [
            name, 
            calories, 
            protein || 0.00, 
            carbs || 0.00, 
            fat || 0.00, 
            serving_size || 1.00, 
            serving_unit
        ]);
        await connection.end();

        return NextResponse.json({ 
            message: 'Custom food saved', 
            foodId: result?.insertId 
        }, { status: 201 });

    } catch (error: any) {
        console.error('Custom Food API Error:', error);
        return NextResponse.json({ message: 'Server error while saving custom food.' }, { status: 500 });
    }
}