import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import type { RowDataPacket } from 'mysql2/promise';

/* -------------------------------------------------------------------------- */
/* Gemini Config                                                               */
/* -------------------------------------------------------------------------- */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface UserProfile {
  goal?: 'lose_weight' | 'gain_weight' | 'maintenance';
  age?: number;
  current_weight?: number;
  height?: number;
  gender?: 'male' | 'female';
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active';
}

/* -------------------------------------------------------------------------- */
/* Utils                                                                       */
/* -------------------------------------------------------------------------- */

function sanitizeText(text: string): string {
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

function detectIntent(query: string) {
  const q = query.toLowerCase();

  if (/^(hi|hello|hey|hola)$/i.test(q)) return 'greeting';
  if (/lose|fat|slim|weight loss/.test(q)) return 'weight_loss';
  if (/gain|bulk|muscle|weight gain/.test(q)) return 'weight_gain';
  if (/meal plan|full day|diet plan/.test(q)) return 'meal_plan';
  if (/fruit|portion|serving/.test(q)) return 'portion';
  if (/thyroid|diabetes|pcod|bp|cholesterol|acidity|pain|bloating/.test(q))
    return 'medical';

  return 'general';
}

/* -------------------------------------------------------------------------- */
/* Calories                                                                    */
/* -------------------------------------------------------------------------- */

function calculateCalories(profile: UserProfile): number | null {
  const { age, height, current_weight, gender, activity_level, goal } = profile;

  if (!age || !height || !current_weight || !gender || !activity_level) {
    return null;
  }

  const bmr =
    gender === 'male'
      ? 10 * current_weight + 6.25 * height - 5 * age + 5
      : 10 * current_weight + 6.25 * height - 5 * age - 161;

  const activityMap = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };

  let calories = bmr * activityMap[activity_level];

  if (goal === 'lose_weight') calories -= 400;
  if (goal === 'gain_weight') calories += 400;

  return Math.round(calories);
}

/* -------------------------------------------------------------------------- */
/* DB Helpers                                                                  */
/* -------------------------------------------------------------------------- */

async function getUserContext(userId: number) {
  const connection = await getConnection();

  const [rows] = await connection.execute<RowDataPacket[]>(
    `
    SELECT goal, age, current_weight, height, gender, activity_level
    FROM users
    WHERE id = ?
    `,
    [userId]
  );

  await connection.end();

  const profile: UserProfile = rows.length ? (rows[0] as UserProfile) : {};
  const calories = calculateCalories(profile);

  return { profile, calories };
}

/* -------------------------------------------------------------------------- */
/* Safe Hard Fallback (NEVER ASK QUESTIONS)                                    */
/* -------------------------------------------------------------------------- */

function safeFallback(profile: UserProfile, intent: string): string {
  if (intent === 'meal_plan' || intent === 'weight_loss') {
    return `For weight loss, structure your day with three balanced meals and one light snack. 
Breakfast can include protein and fiber, lunch should focus on vegetables and lean protein, 
and dinner should be lighter with controlled portions.`;
  }

  if (intent === 'portion') {
    return `For weight loss, aim for two servings of fruit per day. 
One serving equals one medium fruit or one cup of chopped fruit. 
Vegetables can be eaten more freely, especially non-starchy ones.`;
  }

  if (intent === 'medical') {
    return `For health concerns, keep meals regular and balanced. 
Avoid extreme diets and focus on simple, home-cooked foods.`;
  }

  return `A balanced diet with regular meals, enough protein, vegetables, and hydration works well for most people.`;
}

/* -------------------------------------------------------------------------- */
/* AI Reply                                                                    */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'I am unavailable right now.';
  }

  const { profile, calories } = await getUserContext(userId);
  const intent = detectIntent(query);

  if (intent === 'greeting') {
    return 'Hi, how can I help you today?';
  }

  const systemPrompt = `
You are a human nutrition assistant working with a licensed dietitian.

User profile:
Goal: ${profile.goal || 'not specified'}
Age: ${profile.age || 'unknown'}
Height: ${profile.height || 'unknown'} cm
Weight: ${profile.current_weight || 'unknown'} kg
Activity level: ${profile.activity_level || 'unknown'}
Calories: ${calories || 'not calculated'}

Rules:
Answer exactly what the user asks.
Do not repeat questions.
Do not ask for information already known.
No markdown, no bullets, no emojis.
Sound human and professional.
End with at most one optional short follow-up.
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
    const raw = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw || raw.length < 20) {
      return safeFallback(profile, intent);
    }

    return sanitizeText(raw);
  } catch {
    return safeFallback(profile, intent);
  }
}

/* -------------------------------------------------------------------------- */
/* GET Chat                                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const user = verifyAuth(request);
  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const connection = await getConnection();

  const [rows] = await connection.execute<RowDataPacket[]>(
    `
    SELECT id, sender_id, receiver_id, message, created_at
    FROM messages
    WHERE (sender_id = ? AND receiver_id = 0)
       OR (sender_id = 0 AND receiver_id = ?)
    ORDER BY created_at ASC
    `,
    [user.id, user.id]
  );

  if (!rows.length) {
    await connection.execute(
      `INSERT INTO messages (sender_id, receiver_id, message)
       VALUES (0, ?, ?)`,
      [user.id, 'Hi, how can I help you today?']
    );
  }

  await connection.end();
  return NextResponse.json({ messages: rows });
}

/* -------------------------------------------------------------------------- */
/* POST Chat                                                                   */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const user = verifyAuth(request);
  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const message = body?.message?.trim();

  if (!message) {
    return NextResponse.json(
      { message: 'Message cannot be empty' },
      { status: 400 }
    );
  }

  const connection = await getConnection();

  await connection.execute(
    `INSERT INTO messages (sender_id, receiver_id, message)
     VALUES (?, 0, ?)`,
    [user.id, message]
  );

  const aiReply = await getAiReply(user.id, message);

  await connection.execute(
    `INSERT INTO messages (sender_id, receiver_id, message)
     VALUES (0, ?, ?)`,
    [user.id, aiReply]
  );

  await connection.end();

  return NextResponse.json({ reply: aiReply });
}
