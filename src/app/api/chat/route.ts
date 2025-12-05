import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

// --- CRITICAL: Get your Gemini API Key ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""; 
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";

// Helper to get user context for the AI
async function getUserContext(userId: number) {
    const connection = await getConnection();
    const [userRows] = await connection.execute(
        `SELECT goal, age, current_weight, target_weight, gender, activity_level, height FROM users WHERE id = ?`,
        [userId]
    );
    await connection.end();

    const userProfile = userRows[0] as any;
    // Simple logic for target calories (replace with real calculation if needed)
    const targetCalories = userProfile?.goal === 'lose_weight' ? 1800 : 2500;
    
    return {
        profile: userProfile,
        targetCalories: targetCalories,
    };
}

// --- AI REPLY GENERATOR ---
async function getAiReply(userId: number, query: string): Promise<string> {
    if (!GEMINI_API_KEY) {
        return "I'm currently offline (API Key missing). Please try again later.";
    }

    const context = await getUserContext(userId);

    const systemPrompt = `
        You are 'Dr. Malak', a friendly, certified clinical dietitian.
        User's Goal: ${context.profile.goal}.
        User's Target: ${context.targetCalories} kcal.
        
        Respond to the user's message: "${query}"
        
        Guidelines:
        1. If they say "Hi" or "Hello", greet them warmly and ask how their diet is going.
        2. If they ask about food/recipes, give a short, healthy suggestion based on Middle Eastern cuisine.
        3. If they ask about weight loss/gain, give 1 specific, actionable tip based on their goal.
        4. Keep your answer under 3 sentences. Be encouraging.
    `;

    const payload = {
        contents: [{ parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "I'm thinking... could you rephrase that?";
    } catch (e) {
        console.error("Gemini API call failed:", e);
        return "I'm having a little trouble connecting right now. Please ask me again in a moment.";
    }
}

// --- GET: Fetch chat history ---
export async function GET(request: NextRequest) {
  try {
    const user = verifyAuth(request);
    if (!user || !user.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const connection = await getConnection();
    
    // Get all messages for this user (either FROM user or TO user)
    // We treat ID 0 as the "AI Dietitian"
    const sql = `
      SELECT * FROM messages 
      WHERE (sender_id = ? AND receiver_id = 0) 
         OR (sender_id = 0 AND receiver_id = ?)
      ORDER BY created_at ASC
    `;
    
    const [rows] = await connection.execute(sql, [user.id, user.id]);
    let messages = rows as any[];

    // If chat is empty, insert a welcome message
    if (messages.length === 0) {
        const welcomeMsg = "Hello! I'm Dr. Malak, your AI dietitian. How can I help you today?";
        await connection.execute(
            `INSERT INTO messages (sender_id, receiver_id, message) VALUES (0, ?, ?)`,
            [user.id, welcomeMsg]
        );
        // Fetch again to include the new message
        const [newRows] = await connection.execute(sql, [user.id, user.id]);
        messages = newRows as any[];
    }

    await connection.end();
    return NextResponse.json({ messages: messages }, { status: 200 });

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ message: 'Server error fetching messages' }, { status: 500 });
  }
}

// --- POST: Send a message and get AI reply ---
export async function POST(request: NextRequest) {
    const user = verifyAuth(request);
    if (!user || !user.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { message } = await request.json();
    if (!message) return NextResponse.json({ message: 'Message cannot be empty' }, { status: 400 });

    try {
        const connection = await getConnection();
        
        // 1. Save the User's message
        await connection.execute(
            `INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, 0, ?)`, 
            [user.id, message]
        );
        
        // 2. Get the AI's Reply
        // We do this *immediately* in the same request for a fast response
        const aiReply = await getAiReply(user.id, message);
        
        // 3. Save the AI's message
        await connection.execute(
            `INSERT INTO messages (sender_id, receiver_id, message) VALUES (0, ?, ?)`,
            [user.id, aiReply]
        );

        await connection.end();

        return NextResponse.json({ message: 'Sent', reply: aiReply }, { status: 200 });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ message: 'Server error sending message' }, { status: 500 });
    }
}