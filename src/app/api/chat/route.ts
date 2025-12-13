import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import type { RowDataPacket } from 'mysql2/promise';

/* -------------------------------------------------------------------------- */
/*                               Gemini Config                                */
/* -------------------------------------------------------------------------- */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent';

/* -------------------------------------------------------------------------- */
/*                         Helper: Fetch User Context                          */
/* -------------------------------------------------------------------------- */

interface UserProfile {
  goal?: 'lose_weight' | 'gain_weight' | string;
  age?: number;
  current_weight?: number;
  target_weight?: number;
  gender?: string;
  activity_level?: string;
  height?: number;
}


async function getUserContext(userId: number) {
  const connection = await getConnection();

  const [rows] = await connection.execute<RowDataPacket[]>(
    `
      SELECT 
        goal,
        age,
        current_weight,
        target_weight,
        gender,
        activity_level,
        height
      FROM users
      WHERE id = ?
    `,
    [userId]
  );

  await connection.end();

  const profile: UserProfile =
    rows.length > 0 ? (rows[0] as UserProfile) : {};

  const targetCalories =
    profile.goal === 'lose_weight'
      ? 1800
      : profile.goal === 'gain_weight'
      ? 2500
      : 2000;

  return {
    profile,
    targetCalories,
  };
}


/* -------------------------------------------------------------------------- */
/*                          Helper: AI Reply Generator                         */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'I am currently offline. Please try again later.';
  }

  const context = await getUserContext(userId);

  const systemPrompt = `
You are "Dr. Sarah", a friendly certified clinical dietitian.

User Goal: ${context.profile.goal || 'not specified'}
Daily Target: ${context.targetCalories} kcal

Rules:
- Keep replies under 3 sentences
- Be friendly and encouraging
- If greeting, greet back warmly
- If food-related, suggest healthy Middle Eastern food
- If weight-related, give 1 actionable tip

User Message:
"${query}"
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
      'Could you please rephrase that?'
    );
  } catch (error) {
    console.error('Gemini API Error:', error);
    return 'I am having trouble responding right now. Please try again shortly.';
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

    const sql = `
      SELECT id, sender_id, receiver_id, message, created_at
      FROM messages
      WHERE 
        (sender_id = ? AND receiver_id = 0)
        OR
        (sender_id = 0 AND receiver_id = ?)
      ORDER BY created_at ASC
    `;

    const [rows] = await connection.execute<RowDataPacket[]>(sql, [
      user.id,
      user.id,
    ]);

    if (rows.length === 0) {
      const welcomeMessage =
        "Hello! I'm Dr. Sarah, your AI dietitian. How can I help you today?";

await connection.execute(
  `INSERT INTO messages (id, sender_id, receiver_id, message)
   VALUES (?, ?, ?, ?)`,
  [Date.now(), 0, user.id, welcomeMessage]
)

      const [newRows] = await connection.execute<RowDataPacket[]>(sql, [
        user.id,
        user.id,
      ]);

      await connection.end();
      return NextResponse.json({ messages: newRows }, { status: 200 });
    }

    await connection.end();
    return NextResponse.json({ messages: rows }, { status: 200 });
  } catch (error) {
    console.error('Chat GET Error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                             POST: Send Message                              */
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

    // Save user message
    await connection.execute(
      `INSERT INTO messages (sender_id, receiver_id, message)
       VALUES (?, 0, ?)`,
      [user.id, message]
    );

    // Generate AI reply
    const aiReply = await getAiReply(user.id, message);

    // Save AI reply
    await connection.execute(
      `INSERT INTO messages (sender_id, receiver_id, message)
       VALUES (0, ?, ?)`,
      [user.id, aiReply]
    );

    await connection.end();

    return NextResponse.json(
      { message: 'Message sent', reply: aiReply },
      { status: 200 }
    );
  } catch (error) {
    console.error('Chat POST Error:', error);
    return NextResponse.json(
      { message: 'Failed to send message' },
      { status: 500 }
    );
  }
}
