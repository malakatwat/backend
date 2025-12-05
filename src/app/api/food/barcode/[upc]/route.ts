import { NextResponse, type NextRequest } from 'next/server';
import mysql from 'mysql2/promise';
import { getConnection } from '@/lib/db';
// Database configuration
// const dbConfig = {
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD || "",
//     database: process.env.DB_DATABASE,
// };

// GET handler to find a food item by its UPC
export async function GET(
    request: NextRequest,
    { params }: { params: { upc: string } }
) {
    try {
        // 1. Get the UPC from the URL parameters
        const { upc } = params;
        if (!upc) {
            return NextResponse.json({ message: 'Barcode (UPC) is required' }, { status: 400 });
        }

        // 2. Connect to the database
       // const connection = await mysql.createConnection(dbConfig);
        const connection = await getConnection();
        // 3. Find the food item in the food_items table
        const sql = `
            SELECT id, name, calories, protein, carbs, fat, serving_size, serving_unit 
            FROM food_items 
            WHERE barcode_upc = ?
        `;
        const [rows] = await connection.execute(sql, [upc]);
        await connection.end();

        const foods = rows as any[];
        if (foods.length === 0) {
            // 4. If not found, send a 404
            return NextResponse.json({ message: 'Food item not found for this barcode' }, { status: 404 });
        }

        // 5. If found, send the food item back
        return NextResponse.json({ food: foods[0] }, { status: 200 });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while finding by barcode' }, { status: 500 });
    }
}