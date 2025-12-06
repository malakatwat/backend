import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';

// --- THE FIX IS HERE ---
// In Next.js 15, params is a Promise that resolves to the object.
// We must type it as Promise<{ upc: string }>
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ upc: string }> } 
) {
    try {
        // 1. Await the params to get the upc
        const { upc } = await params;
        
        if (!upc) {
            return NextResponse.json({ message: 'Barcode (UPC) is required' }, { status: 400 });
        }

        const connection = await getConnection();
        
        const sql = `
            SELECT id, name, calories, protein, carbs, fat, serving_size, serving_unit 
            FROM food_items 
            WHERE barcode_upc = ?
        `;
        const [rows] = await connection.execute(sql, [upc]);
        await connection.end();

        const foods = rows as any[];
        if (foods.length === 0) {
            return NextResponse.json({ message: 'Food item not found for this barcode' }, { status: 404 });
        }

        return NextResponse.json({ food: foods[0] }, { status: 200 });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while finding by barcode' }, { status: 500 });
    }
}
