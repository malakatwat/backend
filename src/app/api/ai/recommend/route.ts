import { NextResponse, type NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getConnection } from '@/lib/db';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""; 
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";

async function getUserContext(userId: number) {
    const connection = await getConnection();
    const [userRows] = await connection.execute(
        `SELECT goal, age, current_weight, target_weight, gender, activity_level, height FROM users WHERE id = ?`,
        [userId]
    );
    const userProfile = userRows[0] as any;
    const mockTotals = { calories: 800, protein: 50, carbs: 100, fat: 20 };
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

        let systemPrompt = `
            You are 'Dr. Malak', a certified clinical dietitian and fitness coach.
            User Profile: Goal: ${context.profile.goal}, Age: ${context.profile.age}, Gender: ${context.profile.gender}, Activity: ${context.profile.activity_level}.
        `;

        if (type === 'plan') {
            systemPrompt += `Create a 1-day meal plan (Breakfast, Lunch, Dinner, Snack) for Middle Eastern cuisine fitting ${context.targetCalories} kcal.`;
        } else if (type === 'recipe') {
            systemPrompt += `Suggest a healthy Middle Eastern recipe for: "${query}". Include calories.`;
        } else if (type === 'challenge') {
            // --- NEW CHALLENGE LOGIC ---
            systemPrompt += `
                Create a fun, motivating 30-day fitness or nutrition challenge title and description for this user.
                Focus on their goal of ${context.profile.goal}.
                The output should be inspiring and sound like a community event.
            `;
        } else {
            systemPrompt += `Answer concisely.`;
        }

        const payload = {
            contents: [{ parts: [{ text: query }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        const aiResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a recommendation right now.";
        
        return NextResponse.json({ reply: aiResponseText }, { status: 200 });

    } catch (error: any) {
        console.error('AI Error:', error);
        return NextResponse.json({ message: 'Error processing AI request.' }, { status: 500 });
    }
}