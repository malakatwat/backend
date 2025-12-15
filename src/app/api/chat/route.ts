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
  target_weight?: number;
  gender?: 'male' | 'female';
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active';
  height?: number;
}

/* -------------------------------------------------------------------------- */
/*                        Calorie Calculation (Dietitian)                      */
/* -------------------------------------------------------------------------- */

function calculateCalories(profile: UserProfile): number | null {
  const {
    age,
    height,
    current_weight,
    gender,
    activity_level,
    goal,
  } = profile;

  if (!age || !height || !current_weight || !gender || !activity_level) {
    return null;
  }

  // Mifflin-St Jeor Equation
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
    SELECT goal, age, current_weight, target_weight, gender, activity_level, height
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
  if (q.match(/diabetes|thyroid|pcod|bp|cholesterol|acidity|pain/))
    return 'medical';
  if (q.match(/calorie|protein|diet|food|meal/)) return 'nutrition';

  return 'general';
}

/* -------------------------------------------------------------------------- */
/*                           AI Reply Generator                                */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'I am temporarily unavailable. Please try again shortly.';
  }

  const { profile, calories } = await getUserContext(userId);
  const intent = detectIntent(query);

  // Goal vs Intent Conflict Handling
  if (
    profile.goal === 'gain_weight' &&
    intent === 'weight_loss'
  ) {
    return `I notice your profile goal is weight gain, but you’re asking about weight loss. Can you clarify what you want to focus on right now so I can guide you correctly?`;
  }

  if (
    profile.goal === 'lose_weight' &&
    intent === 'weight_gain'
  ) {
    return `Your profile mentions weight loss, but this question sounds like weight gain. Let me know which goal you want to work on currently.`;
  }

  const systemPrompt = `
You are Dr. Sarah, a warm and experienced clinical dietitian.

User Profile:
- Goal: ${profile.goal || 'not specified'}
- Age: ${profile.age || 'unknown'}
- Height: ${profile.height || 'unknown'} cm
- Weight: ${profile.current_weight || 'unknown'} kg
- Activity Level: ${profile.activity_level || 'unknown'}
- Estimated Calories: ${calories || 'not calculated'}

Guidelines:
- Respond naturally like a human dietitian
- Show empathy before advice
- Ask clarifying questions if needed
- Avoid strict prescriptions for medical conditions
- Give culturally flexible food examples
- Safety first, motivation second
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
      'Could you please explain that a bit more?'
    );
  } catch (error) {
    console.error('Gemini API Error:', error);
    return 'I’m having trouble responding right now. Please try again in a moment.';
  }
}

/* -------------------------------------------------------------------------- */
/*                               GET: History                                  */
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
      const welcome =
        "Hello, I’m Dr. Sarah, your dietitian. Tell me about your food habits or health goals.";

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
/*                               POST: Message                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  try {
    const user = verifyAuth(request);
    if (!user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { message } = await request.json();
    if (!message?.trim()) {
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
