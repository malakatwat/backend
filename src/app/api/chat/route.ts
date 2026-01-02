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

type ActiveIntent =
  | 'weight_loss'
  | 'weight_gain'
  | 'maintenance'
  | 'medical'
  | 'general';

/* -------------------------------------------------------------------------- */
/* In-Memory Chat Context (Short-Term Memory)                                  */
/* -------------------------------------------------------------------------- */

const chatMemory = new Map<
  number,
  {
    activeIntent: ActiveIntent | null;
    allergies: string[];
  }
>();

function getChatContext(userId: number) {
  if (!chatMemory.has(userId)) {
    chatMemory.set(userId, {
      activeIntent: null,
      allergies: [],
    });
  }
  return chatMemory.get(userId)!;
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

/* -------------------------------------------------------------------------- */
/* Intent Detection (LATEST QUERY WINS)                                        */
/* -------------------------------------------------------------------------- */

function detectIntent(query: string): ActiveIntent | null {
  const q = query.toLowerCase();

  if (/lose|fat|slim|weight loss/.test(q)) return 'weight_loss';
  if (/gain|bulk|muscle|weight gain/.test(q)) return 'weight_gain';
  if (/maintain|maintenance/.test(q)) return 'maintenance';
  if (/thyroid|diabetes|pcod|bp|cholesterol|acidity|pain|bloating/.test(q))
    return 'medical';

  return null;
}

/* -------------------------------------------------------------------------- */
/* Allergy Detection                                                           */
/* -------------------------------------------------------------------------- */

function detectAllergies(query: string): string[] {
  const allergens = [
    'peanut',
    'milk',
    'egg',
    'soy',
    'gluten',
    'seafood',
    'fish',
  ];

  const q = query.toLowerCase();
  return allergens.filter(a => q.includes(a));
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
/* Safe Hard Fallback                                                          */
/* -------------------------------------------------------------------------- */

function safeFallback(intent: ActiveIntent): string {
  if (intent === 'weight_loss') {
    return 'For weight loss, focus on regular meals with controlled portions, adequate protein, vegetables, and limited processed foods.';
  }

  if (intent === 'weight_gain') {
    return 'For weight gain, prioritize calorie-dense meals with sufficient protein, healthy fats, and consistent meal timing.';
  }

  if (intent === 'maintenance') {
    return 'For weight maintenance, keep meals balanced, portions consistent, and activity regular.';
  }

  if (intent === 'medical') {
    return 'For health concerns, focus on simple, balanced meals and avoid extreme dietary changes.';
  }

  return 'A balanced diet with regular meals and adequate hydration works well for most people.';
}

/* -------------------------------------------------------------------------- */
/* AI Reply                                                                    */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'I am unavailable right now.';
  }

  const { profile, calories } = await getUserContext(userId);
  const chatContext = getChatContext(userId);

  // Detect & switch intent instantly
  const detectedIntent = detectIntent(query);
  if (detectedIntent) {
    chatContext.activeIntent = detectedIntent;
  }

  // Detect allergies
  const foundAllergies = detectAllergies(query);
  foundAllergies.forEach(a => {
    if (!chatContext.allergies.includes(a)) {
      chatContext.allergies.push(a);
    }
  });

  const activeIntent =
    chatContext.activeIntent ||
    (profile.goal === 'lose_weight'
      ? 'weight_loss'
      : profile.goal === 'gain_weight'
      ? 'weight_gain'
      : 'maintenance');

  const systemPrompt = `
You are a professional human nutrition assistant working with a licensed dietitian.

ACTIVE INTENT: ${activeIntent}

User profile:
Age: ${profile.age || 'unknown'}
Height: ${profile.height || 'unknown'} cm
Weight: ${profile.current_weight || 'unknown'} kg
Activity level: ${profile.activity_level || 'unknown'}
Calories: ${calories || 'not calculated'}

Known allergies: ${
    chatContext.allergies.length
      ? chatContext.allergies.join(', ')
      : 'None'
  }

STRICT RULES:
- Always answer based on ACTIVE INTENT.
- Instantly switch intent only if user asks a different type.
- Respect allergies strictly.
- If user asks for an allergic food: explain risk, warn clearly, and suggest a safe alternative.
- Answer exactly what the user asks.
- No markdown, no bullets, no emojis.
- Sound human, calm, and professional.
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
      return safeFallback(activeIntent);
    }

    return sanitizeText(raw);
  } catch {
    return safeFallback(activeIntent);
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
