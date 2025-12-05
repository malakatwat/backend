import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';

// Define the interface for FoodItem here or import it if you have a shared types file
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

// Helper function to fetch from our local DB (client's custom foods)
async function searchLocalDB(query: string): Promise<FoodItem[]> {
  try {
    const connection = await getConnection();
    const sql = `
        SELECT id, name, calories, protein, carbs, fat, serving_size, serving_unit 
        FROM food_items 
        WHERE name LIKE ? 
        LIMIT 20
    `;
    // We add 'as any' to satisfy TypeScript's strictness with the SQL response
    const [rows] = await connection.execute(sql, [`%${query}%`]);
    await connection.end();
    
    // Map database rows to FoodItem structure (ensure IDs are strings)
    return (rows as any[]).map((row) => ({
        id: row.id.toString(),
        name: row.name,
        calories: parseFloat(row.calories),
        protein: parseFloat(row.protein),
        carbs: parseFloat(row.carbs),
        fat: parseFloat(row.fat),
        serving_size: parseFloat(row.serving_size),
        serving_unit: row.serving_unit
    }));

  } catch (error) {
    console.error("Error searching local DB:", error);
    return []; // Don't fail the whole request if this part fails
  }
}

// Helper function to fetch from the USDA API (the 2GB database)
async function searchUsdaAPI(query: string): Promise<FoodItem[]> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.warn("USDA_API_KEY is not configured. Skipping USDA search.");
    return [];
  }

  // We use 'dataType' to filter for common foods (Branded, Foundation, SR Legacy)
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=20&dataType=Branded,Foundation,SR%20Legacy`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("USDA API request failed:", response.statusText);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.foods) return [];

    // Map the complex USDA response to our simple FoodItem format
    const formattedFoods: FoodItem[] = data.foods
      .map((food: any) => {
        // Helper to find a specific nutrient by its ID
        // 1008: Energy (kcal), 1003: Protein, 1004: Total Lipid (Fat), 1005: Carbohydrate
        const getNutrient = (id: number) => food.foodNutrients.find((n: any) => n.nutrientId === id || n.nutrientNumber === id.toString());

        const calories = getNutrient(1008)?.value || 0;
        const protein = getNutrient(1003)?.value || 0;
        const fat = getNutrient(1004)?.value || 0;
        const carbs = getNutrient(1005)?.value || 0;
        
        // Only return foods that have at least a name and calories
        if (!food.description || (calories === 0 && protein === 0 && fat === 0 && carbs === 0)) {
          return null;
        }
        
        return {
          id: `usda-${food.fdcId}`, // Add a prefix to distinguish USDA IDs from local IDs
          name: food.description,
          calories: calories,
          protein: protein,
          carbs: carbs,
          fat: fat,
          serving_size: 100, // USDA data is standard per 100g/ml usually, or portion based
          serving_unit: 'g', 
        };
      })
      .filter((food: FoodItem | null) => food !== null); // Filter out any null entries

    return formattedFoods;

  } catch (error) {
    console.error("Error searching USDA API:", error);
    return [];
  }
}

// GET handler to search for food
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('search') || '';
        
        // If the query is empty, just return the custom foods (e.g., first 20)
        if (!query) {
            const localResults = await searchLocalDB('');
            return NextResponse.json({ foods: localResults }, { status: 200 });
        }

        // 1. Run both searches at the same time (in parallel)
        const [localResults, usdaResults] = await Promise.all([
            searchLocalDB(query),
            searchUsdaAPI(query)
        ]);

        // 2. Combine the results (local results appear first for priority)
        const combinedResults = [...localResults, ...usdaResults];
        
        return NextResponse.json({ foods: combinedResults }, { status: 200 });

    } catch (error: any) {
        console.error('API Error:', error);
        return NextResponse.json({ message: 'Server error while searching for food' }, { status: 500 });
    }
}