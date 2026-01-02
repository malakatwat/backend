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
/* FOOD VOCABULARY (NOT USER DATA)                                             */
/* Can later be loaded from DB / JSON / API                                   */
/* -------------------------------------------------------------------------- */

function loadFoodVocabulary(): Record<string, string[]> {
  return {
    oats: ['oats', 'oatmeal', 'rolled oats', 'oat flour'],
    peanut: ['peanut', 'peanuts', 'peanut butter'],
    milk: ['milk', 'dairy', 'curd', 'yogurt', 'cheese'],
    egg: ['egg', 'eggs'],
    soy: ['soy', 'soya'],
    gluten: ['wheat', 'barley', 'rye'],
    fish: ['fish', 'seafood'],
  };
}

/* -------------------------------------------------------------------------- */
/* Short-Term Memory (PER USER)                                                */
/* -------------------------------------------------------------------------- */

const chatMemory = new Map<
  number,
  {
    activeIntent: ActiveIntent | null;
    allergies: string[]; // base allergen keys only
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
/* Intent Detection                                                            */
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
/* Allergy Detection (Dynamic User Input)                                      */
/* -------------------------------------------------------------------------- */

function detectUserAllergies(query: string): string[] {
  const vocabulary = loadFoodVocabulary();
  const q = query.toLowerCase();
  const found: string[] = [];

  for (const [base, aliases] of Object.entries(vocabulary)) {
    if (aliases.some(a => q.includes(a))) {
      found.push(base);
    }
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* HARD ALLERGY ENFORCEMENT                                                    */
/* -------------------------------------------------------------------------- */

function enforceAllergyRules(
  query: string,
  userAllergies: string[]
): string | null {
  const vocabulary = loadFoodVocabulary();
  const q = query.toLowerCase();

  for (const allergy of userAllergies) {
    const aliases = vocabulary[allergy] || [];

    if (aliases.some(a => q.includes(a))) {
      return sanitizeText(
        `Because you have a ${allergy} allergy, foods containing ${allergy}, such as ${aliases.join(
          ', '
        )}, are not safe for you. Consuming them may trigger allergic reactions.

For meals or diet plans, these foods should be completely avoided and replaced with safe alternatives.`
      );
    }
  }

  return null;
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
/* AI Reply                                                                    */
/* -------------------------------------------------------------------------- */

async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) return 'I am unavailable right now.';

  const { profile, calories } = await getUserContext(userId);
  const chatContext = getChatContext(userId);

  // Update intent (latest query wins)
  const detectedIntent = detectIntent(query);
  if (detectedIntent) chatContext.activeIntent = detectedIntent;

  // Update user allergies dynamically
  detectUserAllergies(query).forEach(a => {
    if (!chatContext.allergies.includes(a)) {
      chatContext.allergies.push(a);
    }
  });

  // HARD allergy block (before AI)
  const allergyViolation = enforceAllergyRules(
    query,
    chatContext.allergies
  );
  if (allergyViolation) return allergyViolation;

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

Known allergies: ${
    chatContext.allergies.length
      ? chatContext.allergies.join(', ')
      : 'None'
  }

STRICT RULES:
- Never recommend foods that match known allergies or their variants.
- If a meal or diet plan would normally include such foods, explicitly avoid and replace them.
- Always warn clearly if an allergic food is part of the discussion.
- Answer exactly what the user asks.
- No markdown, no bullets, no emojis.
- Sound calm, human, and professional.
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

    return raw ? sanitizeText(raw) : 'Please try again.';
  } catch {
    return 'Please try again.';
  }
}

/* -------------------------------------------------------------------------- */
/* GET Chat                                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const user = verifyAuth(request);
  if (!user?.id)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

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

  await connection.end();
  return NextResponse.json({ messages: rows });
}

/* -------------------------------------------------------------------------- */
/* POST Chat                                                                   */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const user = verifyAuth(request);
  if (!user?.id)
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const message = body?.message?.trim();

  if (!message)
    return NextResponse.json(
      { message: 'Message cannot be empty' },
      { status: 400 }
    );

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
