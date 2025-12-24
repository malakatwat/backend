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
  goal?: 'lose_weight' | 'gain_weight';
  age?: number;
  current_weight?: number;
  height?: number;
  gender?: 'male' | 'female';
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active';
}

/* -------------------------------------------------------------------------- */
/* Utils                                                                       */
/* -------------------------------------------------------------------------- */

function sanitize(text: string): string {
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

  if (/^(hi|hello|hey)$/.test(q)) return 'greeting';
  if (/meal plan|full day|eat plan/.test(q)) return 'meal_plan';
  if (/fruit|portion|serve|quantity/.test(q)) return 'portion';
  if (/lose|weight loss|fat/.test(q)) return 'lose';
  if (/gain|weight gain|bulk/.test(q)) return 'gain';
  if (/thyroid|diabetes|pcod|bp|cholesterol/.test(q)) return 'medical';

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
/* User Context                                                                */
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
/* Hard Answers (NO AI FAILURE)                                                */
/* -------------------------------------------------------------------------- */

function forcedAnswer(intent: string, profile: UserProfile) {
  if (intent === 'portion') {
    return `For weight loss, aim for 2 servings of fruit per day. One serving is one medium apple, orange, or one cup of cut fruit. For meals, use this plate method: half vegetables, one quarter protein, and one quarter whole grains. This keeps calories controlled without feeling hungry.`;
  }

  if (intent === 'meal_plan') {
    return `Here is a simple full day meal plan for weight loss. Breakfast: oats or eggs with vegetables. Lunch: roti or rice with dal or chicken and salad. Snack: fruit or yogurt. Dinner: light meal with vegetables and protein. Keep oil and sugar minimal.`;
  }

  if (intent === 'lose') {
    return `For weight loss, focus on regular meals, high protein, plenty of vegetables, and controlled portions. Avoid sugary drinks and late-night snacking.`;
  }

  return `For your health goals, focus on balanced meals, regular timing, and hydration.`;
}

/* -------------------------------------------------------------------------- */
/* AI Reply                                                                    */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  const { profile, calories } = await getUserContext(userId);
  const intent = detectIntent(query);

  if (intent === 'greeting') {
    return 'Hi, how can I help you today?';
  }

  if (!GEMINI_API_KEY) {
    return forcedAnswer(intent, profile);
  }

  const systemPrompt = `
You are Dr. Sarah, a real dietitian chatting like WhatsApp.

User profile:
Age: ${profile.age || 'unknown'}
Height: ${profile.height || 'unknown'} cm
Weight: ${profile.current_weight || 'unknown'} kg
Goal: ${profile.goal || 'not specified'}
Calories: ${calories || 'not calculated'}

Rules:
Answer immediately.
Give advice first.
Ask max one question at the end only if needed.
No markdown, no bullets, no emojis.
Plain human language.
`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }),
    });

    const result = await response.json();
    const raw = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (raw && raw.length > 20) {
      return sanitize(raw);
    }

    // FORCE RESPONSE IF AI IS WEAK
    return forcedAnswer(intent, profile);
  } catch {
    return forcedAnswer(intent, profile);
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
