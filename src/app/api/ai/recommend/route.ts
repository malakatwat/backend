import { NextResponse, type NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getConnection } from '@/lib/db';
import { RowDataPacket } from 'mysql2'; // 1. Import RowDataPacket

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""; 
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";

// --- Helper to get user's full data ---
async function getUserContext(userId: number) {
    const connection = await getConnection();
    
    // 2. FIX: Explicitly type the result as RowDataPacket[]
    const [userRows] = await connection.execute<RowDataPacket[]>(
        `SELECT goal, age, current_weight, target_weight, gender, activity_level, height FROM users WHERE id = ?`,
        [userId]
    );

    // 3. Safe access: check if we got a row, otherwise use empty object
    const userProfile = userRows.length > 0 ? userRows[0] : {};

    // Mock totals for prototype
    const mockTotals = { calories: 800, protein: 50, carbs: 100, fat: 20 };
    
    // Calculate targets based on profile
    const targetCalories = userProfile?.goal === 'lose_weight' ? 1800 : 2500;
    
    await connection.end();

    return {
        profile: userProfile,
        totals: mockTotals,
        remaining: {
            calories: targetCalories - mockTotals.calories,
            protein: 150 - mockTotals.protein,
        },
        targetCalories: targetCalories
    };
}

export async function POST(request: NextRequest) {
    try {
        const authUser = verifyAuth(request);
        if (!authUser || !authUser.id) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const { query, type } = await request.json(); 
        const context = await getUserContext(authUser.id);

        // --- Construct the detailed system prompt ---
        let systemPrompt = `
            You are 'Dr. Sarah', a certified clinical dietitian specialized in Middle Eastern cuisine (Lebanese, Emirati, Bahraini).
            User Profile:
            - Goal: ${context?.profile?.goal}
            - Stats: ${context.profile.age} yrs, ${context.profile.gender}, ${context.profile.height}cm, ${context.profile.current_weight}kg.
            - Activity: ${context.profile.activity_level}
            - Daily Target: ${context.targetCalories} kcal
            - Remaining Today: ${context.remaining.calories} kcal
        `;

        if (type === 'plan') {
            systemPrompt += `
                Create a 1-day meal plan (Breakfast, Lunch, Dinner, Snack) that fits their remaining calories.
                Focus on traditional Middle Eastern dishes but make them healthy.
                Format the response as a clean list with calorie counts for each meal.
            `;
        } else if (type === 'recipe') {
            systemPrompt += `
                Suggest a healthy recipe based on the user's request: "${query}".
                Include ingredients and brief instructions.
                Ensure it fits within their remaining ${context.remaining.calories} calories.
            `;
        } else if (type === 'challenge') {
             systemPrompt += `
                Create a fun, motivating 30-day fitness or nutrition challenge title and description for this user.
                Focus on their goal of ${context.profile.goal}.
                The output should be inspiring and sound like a community event.
            `;
        } else {
            // Chat mode
            systemPrompt += `
                Answer the user's question concisely and supportively.
                If they ask about their progress, use the provided stats.
            `;
        }

        // --- Make the Gemini API Call ---
        const payload = {
            contents: [{ parts: [{ text: query }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            // Optional: tools: [{ "google_search": {} }]
        };

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        const aiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a recommendation right now.";
        
        return NextResponse.json({ reply: aiResponseText }, { status: 200 });

    } catch (error: unknown) {
        console.error('AI Error:', error);
        return NextResponse.json({ message: 'Error processing AI request.' }, { status: 500 });
    }
}