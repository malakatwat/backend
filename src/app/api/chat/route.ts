import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import type { RowDataPacket } from 'mysql2/promise';

/* -------------------------------------------------------------------------- */
/*                               Gemini Config                                 */
/* -------------------------------------------------------------------------- */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent';

/* -------------------------------------------------------------------------- */
/*                              User Profile Type                              */
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
/*                        Calorie Calculation                                  */
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

  const activityMultiplier: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };

  let calories = bmr * activityMultiplier[activity_level];

  if (goal === 'lose_weight') calories -= 400;
  if (goal === 'gain_weight') calories += 400;

  return Math.round(calories);
}

/* -------------------------------------------------------------------------- */
/*                           Fetch User Context                                */
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
/*                           Intent Detection                                  */
/* -------------------------------------------------------------------------- */

function detectIntent(query: string) {
  const q = query.toLowerCase();

  if (/^(hi|hello|hey)$/.test(q)) return 'greeting';
  if (/lose|fat|slim|weight loss/.test(q)) return 'weight_loss';
  if (/gain|bulk|muscle|weight gain/.test(q)) return 'weight_gain';
  if (/meal plan|diet plan|full day|what should i eat/.test(q))
    return 'direct_diet';
  if (/thyroid|diabetes|pcod|bp|cholesterol|acidity|pain|bloating/.test(q))
    return 'medical';

  return 'general';
}

/* -------------------------------------------------------------------------- */
/*                           Text Sanitizer                                    */
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

/* -------------------------------------------------------------------------- */
/*                           Human Fallback                                    */
/* -------------------------------------------------------------------------- */

function humanFallback(profile: UserProfile, intent: string): string {
  if (intent === 'direct_diet' || profile.goal === 'lose_weight') {
    return `For weight loss, focus on balanced meals with good protein, vegetables, and controlled portions of carbs. 
Breakfast can include oats or eggs, lunch should be a protein-rich meal with vegetables, and dinner should be light. 
Avoid sugary snacks and drink enough water.`;
  }

  return `I can help with diet, weight goals, or health concerns. Tell me what you want to focus on right now.`;
}

/* -------------------------------------------------------------------------- */
/*                           AI Reply Generator                                */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'Service is temporarily unavailable.';
  }

  const { profile, calories } = await getUserContext(userId);
  const intent = detectIntent(query);

  if (intent === 'greeting') {
    return 'Hi, how can I help you today?';
  }

  const systemPrompt = `
You are Dr. Sarah, a real clinical dietitian chatting naturally on WhatsApp.

User profile (use silently):
Age: ${profile.age || 'unknown'}
Height: ${profile.height || 'unknown'} cm
Weight: ${profile.current_weight || 'unknown'} kg
Goal: ${profile.goal || 'not specified'}
Calories: ${calories || 'not calculated'}

STRICT RULES:
Answer immediately.
Give practical advice first.
Do not ask questions at the start.
Do not repeat greetings.
Do not say "it depends".
Do not use markdown, bullets, emojis, stars, or headings.
Plain human text only.
Ask at most one short question at the end only if truly necessary.
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

    if (!raw || raw.length < 40) {
      return humanFallback(profile, intent);
    }

    return sanitize(raw);
  } catch (error) {
    console.error('Gemini Error:', error);
    return humanFallback(profile, intent);
  }
}

/* -------------------------------------------------------------------------- */
/*                               GET Chat                                      */
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
/*                               POST Chat                                     */
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
