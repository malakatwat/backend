import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth'; 

// Helper to fetch a single food from USDA by FDC ID
async function getUsdaFoodDetails(fdcId: string) {
    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) return null;
    
    try {
        const response = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`);
        if (!response.ok) return null;
        const data = await response.json();
        
        // Map USDA data format to our database format
        const getNutrient = (id: number) => data.foodNutrients.find((n: any) => n.nutrient.id === id)?.amount || 0;
        
        return {
            name: data.description,
            calories: getNutrient(1008),
            protein: getNutrient(1003),
            fat: getNutrient(1004),
            carbs: getNutrient(1005),
            serving_size: 100, // Default to 100g for simplicity or extract from portions
            serving_unit: 'g'
        };
    } catch (error) {
        console.error("Error fetching USDA details:", error);
        return null;
    }
}

// Helper to ensure a food item exists in our local DB
async function ensureFoodExists(connection: any, foodId: string | number): Promise<number | null> {
    // 1. If it's already a number, it's a local ID. Assume it exists.
    if (typeof foodId === 'number' || !foodId.toString().startsWith('usda-')) {
        return Number(foodId);
    }

    // 2. It's a USDA ID (e.g., "usda-123456"). Check if we've already saved it.
    // We use the barcode_upc column to store the USDA ID for easy lookup
    const [existing] = await connection.execute(
        'SELECT id FROM food_items WHERE barcode_upc = ?', 
        [foodId]
    );

    if (existing.length > 0) {
        return existing[0].id;
    }

    // 3. It's new! Fetch details from USDA API.
    const fdcId = foodId.toString().replace('usda-', '');
    const details = await getUsdaFoodDetails(fdcId);
    
    if (!details) return null; // Failed to get details

    // 4. Insert it into our local database so we can link to it
    const [result] = await connection.execute(
        `INSERT INTO food_items (name, barcode_upc, calories, protein, carbs, fat, serving_size, serving_unit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [details.name, foodId, details.calories, details.protein, details.carbs, details.fat, details.serving_size, details.serving_unit]
    );

    return result.insertId;
}

// --- GET: Fetch the user's food diary for a specific date ---
export async function GET(request: NextRequest) {
    try {
        const user = verifyAuth(request);
        if (!user || !user.id) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        if (!date) {
            return NextResponse.json({ message: 'Date parameter is required' }, { status: 400 });
        }

        const connection = await getConnection();
        
        const sql = `
            SELECT 
                d.id, 
                d.meal_type, 
                d.created_at,
                f.id AS food_id, 
                f.name, 
                f.calories, 
                f.protein, 
                f.carbs, 
                f.fat, 
                f.serving_size, 
                f.serving_unit
            FROM diary_logs d
            JOIN food_items f ON d.food_id = f.id
            WHERE 
                d.user_id = ? AND
                DATE(d.created_at) = ?
            ORDER BY d.created_at ASC
        `;
        const [rows] = await connection.execute(sql, [user.id, date]);
        await connection.end();

        return NextResponse.json({ diary: rows }, { status: 200 });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while fetching diary' }, { status: 500 });
    }
}

// --- POST: Log a new food item to the user's diary ---
export async function POST(request: NextRequest) {
    try {
        const user = verifyAuth(request);
        if (!user || !user.id) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { food_id, meal_type } = await request.json();
        if (!food_id || !meal_type) {
            return NextResponse.json({ message: 'food_id and meal_type are required' }, { status: 400 });
        }

        const connection = await getConnection();
        
        // --- NEW STEP: Ensure the food exists locally before logging ---
        const localFoodId = await ensureFoodExists(connection, food_id);
        
        if (!localFoodId) {
             await connection.end();
             return NextResponse.json({ message: 'Invalid food item' }, { status: 400 });
        }

        const sql = `
            INSERT INTO diary_logs (user_id, food_id, meal_type, created_at)
            VALUES (?, ?, ?, NOW())
        `;
        
        // Use the guaranteed localFoodId
        await connection.execute(sql, [user.id, localFoodId, meal_type]);
        
        const [newLogRows] = await connection.execute('SELECT * FROM diary_logs WHERE id = LAST_INSERT_ID()');
        await connection.end();
        
        return NextResponse.json({ message: 'Food logged successfully', log: (newLogRows as any)[0] }, { status: 201 });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while logging food' }, { status: 500 });
    }
}