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
  goal?: 'lose_weight' | 'gain_weight' | string;
  age?: number;
  current_weight?: number;
  gender?: 'male' | 'female';
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active';
  height?: number;
}

/* -------------------------------------------------------------------------- */
/*                        Calorie Calculation (Real Dietitian)                 */
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

  let calories = bmr * (activityMultiplier[activity_level] || 1.2);

  if (goal === 'lose_weight') calories -= 400;
  if (goal === 'gain_weight') calories += 400;

  return Math.round(calories);
}

/* -------------------------------------------------------------------------- */
/*                           User Context Fetcher                              */
/* -------------------------------------------------------------------------- */

async function getUserContext(userId: number) {
  const connection = await getConnection();

  const [rows] = await connection.execute<RowDataPacket[]>(
    `
    SELECT goal, age, current_weight, gender, activity_level, height
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

  if (q.match(/hi|hello|hey/)) return 'greeting';
  if (q.match(/lose|fat|slim|weight loss/)) return 'weight_loss';
  if (q.match(/gain|bulk|muscle|weight gain/)) return 'weight_gain';
  if (q.match(/thyroid|diabetes|pcod|bp|cholesterol|acidity|pain|bloating/))
    return 'medical';
  if (q.match(/diet|food|meal|protein|calorie/)) return 'nutrition';

  return 'general';
}

/* -------------------------------------------------------------------------- */
/*                           AI Reply Generator                                */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'I am unavailable right now. Please try again.';
  }

  const { profile, calories } = await getUserContext(userId);
  const intent = detectIntent(query);

  /* ---------------------------------------------------------------------- */
  /* Smart goal handling (NO LOOP, NO BLOCKING)                              */
  /* ---------------------------------------------------------------------- */

  let effectiveGoal = profile.goal;

  if (intent === 'weight_loss') effectiveGoal = 'lose_weight';
  if (intent === 'weight_gain') effectiveGoal = 'gain_weight';

  /* ---------------------------------------------------------------------- */
  /* Short Human Greeting                                                    */
  /* ---------------------------------------------------------------------- */

  if (intent === 'greeting') {
    return 'Hi, how can I help you today?';
  }

  /* ---------------------------------------------------------------------- */
  /* Gemini Prompt (Human, Plain Text Only)                                  */
  /* ---------------------------------------------------------------------- */

  const systemPrompt = `
You are Dr. Sarah, an experienced clinical dietitian.

User details:
Goal in profile: ${profile.goal || 'not set'}
Current focus: ${effectiveGoal || 'not specified'}
Age: ${profile.age || 'unknown'}
Height: ${profile.height || 'unknown'} cm
Weight: ${profile.current_weight || 'unknown'} kg
Activity level: ${profile.activity_level || 'unknown'}
Estimated calories: ${calories || 'not calculated'}

Rules:
Speak like a real dietitian chatting on WhatsApp.
Keep replies natural and supportive.
No stars, no emojis, no markdown, no bullet points.
No long lectures.
Health questions are always allowed.
If medical condition is mentioned, be cautious and practical.
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

    return (
      result?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Can you tell me a bit more about this?'
    );
  } catch (error) {
    console.error('Gemini API Error:', error);
    return 'Something went wrong. Please try again.';
  }
}

/* -------------------------------------------------------------------------- */
/*                               GET: Chat History                             */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  try {
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

      const [newRows] = await connection.execute<RowDataPacket[]>(
        `
        SELECT id, sender_id, receiver_id, message, created_at
        FROM messages
        WHERE (sender_id = ? AND receiver_id = 0)
           OR (sender_id = 0 AND receiver_id = ?)
        ORDER BY created_at ASC
        `,
        [user.id, user.id]
      );

      await connection.end();
      return NextResponse.json({ messages: newRows });
    }

    await connection.end();
    return NextResponse.json({ messages: rows });
  } catch (error) {
    console.error('Chat GET Error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                               POST: Send Message                            */
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
  } catch (error) {
    console.error('Chat POST Error:', error);
    return NextResponse.json(
      { message: 'Failed to send message' },
      { status: 500 }
    );
  }
}
