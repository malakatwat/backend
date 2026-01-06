import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import type { RowDataPacket } from 'mysql2/promise';

/* -------------------------------------------------------------------------- */
/* Gemini Config                                                              */
/* -------------------------------------------------------------------------- */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
interface UserProfile {
  goal?: 'lose_weight' | 'gain_weight' | 'maintenance';
  age?: number;
  current_weight?: number;
  height?: number;
  gender?: 'male' | 'female';
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active';
  allergies?: string; // JSON string in DB
}

/* -------------------------------------------------------------------------- */
/* ALLERGY DICTIONARY                                                         */
/* -------------------------------------------------------------------------- */
const ALLERGY_VOCABULARY: Record<string, string[]> = {
  oats: ['oats', 'oatmeal', 'rolled oats', 'oat flour', 'muesli'],
  peanut: ['peanut', 'peanuts', 'peanut butter', 'groundnut'],
  milk: ['milk', 'dairy', 'curd', 'yogurt', 'cheese', 'paneer', 'whey'],
  egg: ['egg', 'eggs', 'omelette', 'mayonnaise'],
  soy: ['soy', 'soya', 'tofu', 'soy milk'],
  gluten: ['wheat', 'barley', 'rye', 'maida', 'flour', 'bread', 'roti'],
  fish: ['fish', 'seafood', 'prawns', 'shrimp'],
};

/* -------------------------------------------------------------------------- */
/* Utils                                                                      */
/* -------------------------------------------------------------------------- */
function sanitizeText(text: string): string {
  // Removes all robotic markdown formatting to keep it human-like
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^\d+\.\s*/gm, '')
    .replace(/^[-•]\s*/gm, '')
    .replace(/[⭐★]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Scans text for any mention of allergens or their aliases.
 */
function detectAllergyKeys(text: string): string[] {
  const q = text.toLowerCase();
  const detected: string[] = [];
  for (const [base, aliases] of Object.entries(ALLERGY_VOCABULARY)) {
    if (aliases.some(alias => q.includes(alias))) {
      detected.push(base);
    }
  }
  return detected;
}

/* -------------------------------------------------------------------------- */
/* Calculations & Context                                                     */
/* -------------------------------------------------------------------------- */
function calculateCalories(profile: UserProfile): number | null {
  const { age, height, current_weight, gender, activity_level, goal } = profile;
  if (!age || !height || !current_weight || !gender || !activity_level) return null;

  const bmr = gender === 'male'
    ? 10 * current_weight + 6.25 * height - 5 * age + 5
    : 10 * current_weight + 6.25 * height - 5 * age - 161;

  const activityMap = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  let calories = bmr * activityMap[activity_level];

  if (goal === 'lose_weight') calories -= 400;
  if (goal === 'gain_weight') calories += 400;
  return Math.round(calories);
}

async function getUserContext(userId: number) {
  const connection = await getConnection();
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT goal, age, current_weight, height, gender, activity_level, allergies FROM users WHERE id = ?',
    [userId]
  );
  await connection.end();

  const profile: UserProfile = rows.length ? (rows[0] as UserProfile) : {};
  const calories = calculateCalories(profile);
  const allergies: string[] = profile.allergies ? JSON.parse(profile.allergies) : [];

  return { profile, calories, allergies };
}

/* -------------------------------------------------------------------------- */
/* AI Reply with Deep History & Intent Priority                               */
/* -------------------------------------------------------------------------- */
async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) return 'I am unavailable right now.';

  const { profile, calories, allergies: savedAllergies } = await getUserContext(userId);
  
  // 1. Update Allergy List in DB if new ones are mentioned in current query
  const newlyDetected = detectAllergyKeys(query);
  let updatedAllergies = savedAllergies;
  if (newlyDetected.length > 0) {
    updatedAllergies = Array.from(new Set([...savedAllergies, ...newlyDetected]));
    const connection = await getConnection();
    await connection.execute('UPDATE users SET allergies = ? WHERE id = ?', [JSON.stringify(updatedAllergies), userId]);
    await connection.end();
  }

  // 2. Fetch Last 10 Messages for Deep Contextual Memory
  const connection = await getConnection();
  const [historyRows] = await connection.execute<RowDataPacket[]>(
    `SELECT sender_id, message FROM messages 
     WHERE (sender_id = ? AND receiver_id = 0) OR (sender_id = 0 AND receiver_id = ?) 
     ORDER BY created_at DESC LIMIT 10`,
    [userId, userId]
  );
  await connection.end();

  const history = historyRows.reverse().map(row => ({
    role: row.sender_id === 0 ? 'model' : 'user',
    parts: [{ text: row.message }]
  }));

  // 3. Human-Centric Dietitian Prompt
  const systemPrompt = `
You are a highly experienced human Dietitian. You have a warm, professional, and observant personality.

USER DATA:
- Profile Goal: ${profile.goal || 'General Health'}
- Calculated Daily Calories: ${calories || 'Not set'}
- Registered Allergies: ${updatedAllergies.length > 0 ? updatedAllergies.join(', ') : 'None'}

STRICT OPERATING RULES:
1. CONTEXT OVER PROFILE: The chat history is more important than the profile. If the user recently asked for a "weight loss plan" even though their profile says "weight gain", you MUST follow the weight loss request.
2. ALLERGY MEMORY: You must remember every allergy the user mentions. If they ask for a food they are allergic to (or a variation like oatmeal for an oat allergy), you must firmly but kindly explain why they should avoid it and offer a safe alternative.
3. BE HUMAN, NOT ROBOTIC: Do not use bullet points, bolding, or markdown. Do not start sentences with "Warning:". Instead, incorporate warnings naturally: "Since we're avoiding oats, let's swap that for a quinoa porridge."
4. PERSISTENCE: Maintain the flow. If the user just registered an allergy and now asks for a plan, refer back to the plan you were discussing a few messages ago.
5. Answer concisely in clear paragraphs.
`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [...history, { role: 'user', parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }),
    });

    const result = await response.json();

    if (result.error) {
      console.error("Gemini Error:", result.error);
      return "I'm having a bit of trouble focusing. Could you repeat that?";
    }

    const raw = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    return raw ? sanitizeText(raw) : 'How can I help you with your nutrition today?';
  } catch (error) {
    console.error("Server Error:", error);
    return 'I seem to be offline. Please try again in a moment.';
  }
}

/* -------------------------------------------------------------------------- */
/* API Routes                                                                 */
/* -------------------------------------------------------------------------- */
export async function GET(request: NextRequest) {
  const user = verifyAuth(request);
  if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const connection = await getConnection();
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, sender_id, receiver_id, message, created_at FROM messages 
     WHERE (sender_id = ? AND receiver_id = 0) OR (sender_id = 0 AND receiver_id = ?) 
     ORDER BY created_at ASC`,
    [user.id, user.id]
  );
  await connection.end();
  return NextResponse.json({ messages: rows });
}

export async function POST(request: NextRequest) {
  const user = verifyAuth(request);
  if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const message = body?.message?.trim();
  if (!message) return NextResponse.json({ message: 'Message cannot be empty' }, { status: 400 });

  const connection = await getConnection();
  // 1. Save User Message to History
  await connection.execute('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, 0, ?)', [user.id, message]);

  // 2. Generate Context-Aware AI Reply
  const aiReply = await getAiReply(user.id, message);

  // 3. Save AI Reply to History
  await connection.execute('INSERT INTO messages (sender_id, receiver_id, message) VALUES (0, ?, ?)', [user.id, aiReply]);
  await connection.end();

  return NextResponse.json({ reply: aiReply });
}