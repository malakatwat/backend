import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

// --- Helper: Get USDA Details ---
async function getUsdaFoodDetails(fdcId: string) {
    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) return null;
    try {
        const response = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`);
        if (!response.ok) return null;
        const data = await response.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getNutrient = (id: number) => data.foodNutrients.find((n: any) => n.nutrient.id === id)?.amount || 0;
        return {
            name: data.description,
            calories: getNutrient(1008),
            protein: getNutrient(1003),
            fat: getNutrient(1004),
            carbs: getNutrient(1005),
            serving_size: 100,
            serving_unit: 'g'
        };
    } catch {
        return null;
    }
}

// --- Helper: Ensure Food Exists ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureFoodExists(connection: any, foodId: string | number): Promise<number | null> {
    if (typeof foodId === 'number' || !foodId.toString().startsWith('usda-')) {
        return Number(foodId);
    }
    const [existing] = await connection.execute('SELECT id FROM food_items WHERE barcode_upc = ?', [foodId]) as [RowDataPacket[], unknown];
    if (existing.length > 0) return existing[0].id;

    const fdcId = foodId.toString().replace('usda-', '');
    const details = await getUsdaFoodDetails(fdcId);
    if (!details) return null;

    const [result] = await connection.execute(
        `INSERT INTO food_items (name, barcode_upc, calories, protein, carbs, fat, serving_size, serving_unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [details.name, foodId, details.calories, details.protein, details.carbs, details.fat, details.serving_size, details.serving_unit]
    ) as [ResultSetHeader, unknown];
    return result.insertId;
}

// --- GET Handler ---
export async function GET(request: NextRequest) {
    try {
        const user = verifyAuth(request);
        if (!user || !user.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        if (!date) return NextResponse.json({ message: 'Date parameter is required' }, { status: 400 });

        const connection = await getConnection();
        const sql = `
            SELECT d.id, d.meal_type, d.created_at,
                f.id AS food_id, f.name, f.calories, f.protein, f.carbs, f.fat, f.serving_size, f.serving_unit
            FROM diary_logs d
            JOIN food_items f ON d.food_id = f.id
            WHERE d.user_id = ? AND DATE(d.created_at) = ?
            ORDER BY d.created_at ASC
        `;
        const [rows] = await connection.execute<RowDataPacket[]>(sql, [user.id, date]);
        await connection.end();
        return NextResponse.json({ diary: rows }, { status: 200 });
    } catch {
        return NextResponse.json({ message: 'Server error while fetching diary' }, { status: 500 });
    }
}

// --- POST Handler ---
export async function POST(request: NextRequest) {
    try {
        const user = verifyAuth(request);
        if (!user || !user.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

        const { food_id, meal_type } = await request.json();
        if (!food_id || !meal_type) return NextResponse.json({ message: 'Required fields missing' }, { status: 400 });

        const connection = await getConnection();
        
        const localFoodId = await ensureFoodExists(connection, food_id);
        if (!localFoodId) {
             await connection.end();
             return NextResponse.json({ message: 'Invalid food item' }, { status: 400 });
        }

        // --- 1. Check for Duplicates ---
        const [existingLogs] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM diary_logs 
             WHERE user_id = ? 
             AND food_id = ? 
             AND meal_type = ? 
             AND DATE(created_at) = CURDATE()`, 
            [user.id, localFoodId, meal_type]
        );

        if (existingLogs.length > 0) {
            await connection.end();
            return NextResponse.json(
                { message: `This item is already in your ${meal_type} list.` }, 
                { status: 409 } 
            );
        }

        // --- 2. Insert Log ---
        const sql = `
            INSERT INTO diary_logs (user_id, food_id, meal_type, created_at)
            VALUES (?, ?, ?, NOW())
        `;
        await connection.execute(sql, [user.id, localFoodId, meal_type]);
        
        const [newLogRows] = await connection.execute<RowDataPacket[]>('SELECT * FROM diary_logs WHERE id = LAST_INSERT_ID()');
        await connection.end();
        
        return NextResponse.json({ message: 'Food logged successfully', log: newLogRows[0] }, { status: 201 });

    } catch (error: unknown) {
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while logging food' }, { status: 500 });
    }
}