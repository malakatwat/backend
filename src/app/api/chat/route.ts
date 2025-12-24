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

function sanitizeAiText(text: string): string {
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
  if (/lose|fat|slim|weight loss/.test(q)) return 'weight_loss';
  if (/gain|bulk|muscle|weight gain/.test(q)) return 'weight_gain';
  if (/thyroid|diabetes|pcod|bp|cholesterol|pain|acidity|bloating/.test(q))
    return 'medical';
  if (/diet|food|meal|protein|calorie/.test(q)) return 'nutrition';

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

async function resolveEffectiveGoal(
  userId: number,
  profileGoal?: string,
  query?: string
) {
  const q = query?.toLowerCase() || '';

  if (/weight loss|lose weight/.test(q)) return 'lose_weight';
  if (/weight gain|gain weight/.test(q)) return 'gain_weight';

  const connection = await getConnection();
  const [rows] = await connection.execute<RowDataPacket[]>(
    `
    SELECT message
    FROM messages
    WHERE sender_id = ?
      AND message IN ('weight loss', 'weight gain')
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [userId]
  );
  await connection.end();

  if (rows.length) {
    return rows[0].message === 'weight loss'
      ? 'lose_weight'
      : 'gain_weight';
  }

  return profileGoal;
}

/* -------------------------------------------------------------------------- */
/* AI Reply                                                                    */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'I am unavailable right now. Please try again.';
  }

  const { profile, calories } = await getUserContext(userId);
  const intent = detectIntent(query);
  const effectiveGoal = await resolveEffectiveGoal(
    userId,
    profile.goal,
    query
  );

  if (intent === 'greeting') {
    return 'Hi, how can I help you today?';
  }

  const systemPrompt = `
You are Dr. Sarah, a real clinical dietitian chatting naturally.

User context:
Goal: ${effectiveGoal || 'not specified'}
Age: ${profile.age || 'unknown'}
Height: ${profile.height || 'unknown'} cm
Weight: ${profile.current_weight || 'unknown'} kg
Activity level: ${profile.activity_level || 'unknown'}
Calories: ${calories || 'not calculated'}

Rules:
Never repeat questions already answered.
Never ask again about goal unless user changes it.
Health questions are always allowed.
Plain text only.
No markdown, no bullets, no emojis.
Short, human, practical replies.
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
    const raw =
      result?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Can you explain a bit more?';

    return sanitizeAiText(raw);
  } catch {
    return 'Something went wrong. Please try again.';
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
    const welcome = 'Hi, how can I help you today?';

    await connection.execute(
      `INSERT INTO messages (sender_id, receiver_id, message)
       VALUES (0, ?, ?)`,
      [user.id, welcome]
    );

    await connection.end();
    return NextResponse.json({ messages: [] });
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
