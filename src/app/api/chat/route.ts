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
/* Text Sanitizer (NO markdown, NO bullets, NO stars)                          */
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
/* Intent Detection                                                           */
/* -------------------------------------------------------------------------- */

function detectIntent(query: string) {
  const q = query.toLowerCase();

  if (/^(hi|hello|hey)$/.test(q)) return 'greeting';
  if (/lose|fat|slim|weight loss/.test(q)) return 'lose';
  if (/gain|bulk|muscle|weight gain/.test(q)) return 'gain';
  if (/thyroid|diabetes|pcod|bp|cholesterol|pain|bloating|acidity/.test(q))
    return 'medical';

  return 'general';
}

/* -------------------------------------------------------------------------- */
/* Calorie Calculation                                                        */
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

  const activity: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
  };

  let calories = bmr * (activity[activity_level] || 1.2);

  if (goal === 'lose_weight') calories -= 400;
  if (goal === 'gain_weight') calories += 400;

  return Math.round(calories);
}

/* -------------------------------------------------------------------------- */
/* Fetch User Context                                                         */
/* -------------------------------------------------------------------------- */

async function getUserContext(userId: number) {
  const db = await getConnection();

  const [rows] = await db.execute<RowDataPacket[]>(
    `
    SELECT goal, age, current_weight, height, gender, activity_level
    FROM users
    WHERE id = ?
    `,
    [userId]
  );

  await db.end();

  const profile: UserProfile = rows.length ? (rows[0] as UserProfile) : {};
  const calories = calculateCalories(profile);

  return { profile, calories };
}

/* -------------------------------------------------------------------------- */
/* HARD HUMAN FALLBACK (NO QUESTIONS LOOP)                                     */
/* -------------------------------------------------------------------------- */

function humanFallback(profile: UserProfile, intent: string): string {
  if (intent === 'lose') {
    return `For weight loss, focus on regular meals with good protein and vegetables. Avoid skipping meals and keep portions steady.`;
  }

  if (intent === 'gain') {
    return `For healthy weight gain, eat every 3 to 4 hours and include protein, carbs, and healthy fats in each meal.`;
  }

  if (intent === 'medical') {
    return `For your health concern, keep meals light, balanced, and at fixed times. Avoid extreme diets and stay hydrated.`;
  }

  return `A balanced diet with regular meals, enough protein, fruits, vegetables, and water supports overall health.`;
}

/* -------------------------------------------------------------------------- */
/* AI Reply Generator                                                         */
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
You are Dr. Sarah, a real clinical dietitian chatting naturally.

User profile:
Age: ${profile.age || 'unknown'}
Height: ${profile.height || 'unknown'} cm
Weight: ${profile.current_weight || 'unknown'} kg
Goal: ${profile.goal || 'not specified'}
Calories: ${calories || 'not calculated'}

STRICT RULES:
- Give practical advice immediately
- Use profile silently
- Ask at most one short question ONLY if necessary
- Never repeat questions
- No markdown, no bullets, no emojis
- Sound like a human dietitian
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
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text || text.length < 25) {
      return humanFallback(profile, intent);
    }

    return sanitize(text);
  } catch (err) {
    console.error('Gemini Error:', err);
    return humanFallback(profile, intent);
  }
}

/* -------------------------------------------------------------------------- */
/* GET: Chat History                                                          */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  try {
    const user = verifyAuth(request);
    if (!user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getConnection();

    const [rows] = await db.execute<RowDataPacket[]>(
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
      await db.execute(
        `INSERT INTO messages (sender_id, receiver_id, message)
         VALUES (0, ?, ?)`,
        [user.id, 'Hi, how can I help you today?']
      );
    }

    await db.end();
    return NextResponse.json({ messages: rows });
  } catch (e) {
    console.error('GET Error', e);
    return NextResponse.json({ message: 'Failed' }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST: Send Message                                                         */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  try {
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

    const db = await getConnection();

    await db.execute(
      `INSERT INTO messages (sender_id, receiver_id, message)
       VALUES (?, 0, ?)`,
      [user.id, message]
    );

    const reply = await getAiReply(user.id, message);

    await db.execute(
      `INSERT INTO messages (sender_id, receiver_id, message)
       VALUES (0, ?, ?)`,
      [user.id, reply]
    );

    await db.end();
    return NextResponse.json({ reply });
  } catch (e) {
    console.error('POST Error', e);
    return NextResponse.json({ message: 'Failed' }, { status: 500 });
  }
}
