import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { RowDataPacket } from 'mysql2'; // Import type

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size?: number;
  serving_unit?: string;
}

// Helper function to fetch from our local DB
async function searchLocalDB(query: string): Promise<FoodItem[]> {
  try {
    const connection = await getConnection();
    const sql = `
        SELECT id, name, calories, protein, carbs, fat, serving_size, serving_unit 
        FROM food_items 
        WHERE name LIKE ? 
        LIMIT 20
    `;
    
    // FIX 1: Type the query result
    const [rows] = await connection.execute<RowDataPacket[]>(sql, [`%${query}%`]);
    await connection.end();
    
    // FIX 2: Map correctly without 'any'
    return rows.map((row) => ({
        id: row.id.toString(),
        name: row.name,
        calories: parseFloat(row.calories),
        protein: parseFloat(row.protein),
        carbs: parseFloat(row.carbs),
        fat: parseFloat(row.fat),
        serving_size: parseFloat(row.serving_size),
        serving_unit: row.serving_unit
    }));

  } catch (error: unknown) { // FIX 3: Use unknown
    console.error("Error searching local DB:", error);
    return []; 
  }
}

// Helper function to fetch from the USDA API
async function searchUsdaAPI(query: string): Promise<FoodItem[]> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.warn("USDA_API_KEY is not configured. Skipping USDA search.");
    return [];
  }

  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=20&dataType=Branded,Foundation,SR%20Legacy`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("USDA API request failed:", response.statusText);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.foods) return [];

    // FIX 4: Use 'any' only where necessary for external API structure if it's complex, 
    // but try to be specific or keep it scoped. Here 'any' is okay for the raw external data item 
    // as long as we validate/map it safely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedFoods: FoodItem[] = (data.foods as any[])
      .map((food) => {
        // Helper to find a specific nutrient by its ID
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getNutrient = (id: number) => food.foodNutrients.find((n: any) => n.nutrientId === id || n.nutrientNumber === id.toString());

        const calories = getNutrient(1008)?.value || 0;
        const protein = getNutrient(1003)?.value || 0;
        const fat = getNutrient(1004)?.value || 0;
        const carbs = getNutrient(1005)?.value || 0;
        
        if (!food.description || (calories === 0 && protein === 0 && fat === 0 && carbs === 0)) {
          return null;
        }
        
        return {
          id: `usda-${food.fdcId}`, 
          name: food.description,
          calories: calories,
          protein: protein,
          carbs: carbs,
          fat: fat,
          serving_size: 100, 
          serving_unit: 'g', 
        };
      })
      .filter((food): food is FoodItem => food !== null); // Type predicate filter

    return formattedFoods;

  } catch (error: unknown) { // FIX 5: Use unknown
    console.error("Error searching USDA API:", error);
    return [];
  }
}

// GET handler to search for food
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('search') || '';
        
        if (!query) {
            const localResults = await searchLocalDB('');
            return NextResponse.json({ foods: localResults }, { status: 200 });
        }

        const [localResults, usdaResults] = await Promise.all([
            searchLocalDB(query),
            searchUsdaAPI(query)
        ]);

        const combinedResults = [...localResults, ...usdaResults];
        
        return NextResponse.json({ foods: combinedResults }, { status: 200 });

    } catch (error: unknown) { // FIX 6: Use unknown
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while searching for food' }, { status: 500 });
    }
}