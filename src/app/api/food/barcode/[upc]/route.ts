import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { RowDataPacket } from 'mysql2';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ upc: string }> } 
) {
    try {
        // Await the params (Next.js 15 requirement)
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
        
        // Explicitly type the result as RowDataPacket[]
        const [rows] = await connection.execute<RowDataPacket[]>(sql, [upc]);
        await connection.end();

        if (rows.length === 0) {
            return NextResponse.json({ message: 'Food item not found for this barcode' }, { status: 404 });
        }

        return NextResponse.json({ food: rows[0] }, { status: 200 });

    } catch (error: unknown) {
        // Safe error handling for unknown type
        let errorMessage = 'Server error while finding by barcode';
        
        if (error instanceof Error) {
            console.error('API Error:', error.message);
            errorMessage = error.message;
        } else {
            console.error('API Error:', error);
        }
        
        return NextResponse.json({ message: errorMessage }, { status: 500 });
    }
}