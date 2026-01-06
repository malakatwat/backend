import { NextResponse, type NextRequest } from 'next/server';
import { getConnection } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import type { RowDataPacket } from 'mysql2/promise';

/* -------------------------------------------------------------------------- */
/* Gemini Config                                                              */
/* -------------------------------------------------------------------------- */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
interface UserProfile {
  goal?: 'lose_weight' | 'gain_weight' | 'maintenance';
  age?: number;
  current_weight?: number;
  height?: number;
  gender?: 'male' | 'female';
  activity_level?: 'sedentary' | 'light' | 'moderate' | 'active';
  allergies?: string; // JSON string in DB
}

type ActiveIntent = 'weight_loss' | 'weight_gain' | 'maintenance' | 'medical' | 'general';

/* -------------------------------------------------------------------------- */
/* FOOD VOCABULARY & ALIASES                                                  */
/* -------------------------------------------------------------------------- */
const ALLERGY_VOCABULARY: Record<string, string[]> = {
  oats: ['oats', 'oatmeal', 'rolled oats', 'oat flour', 'muesli'],
  peanut: ['peanut', 'peanuts', 'peanut butter', 'groundnut'],
  milk: ['milk', 'dairy', 'curd', 'yogurt', 'cheese', 'paneer', 'whey'],
  egg: ['egg', 'eggs', 'omelette', 'mayonnaise'],
  soy: ['soy', 'soya', 'tofu', 'soy milk'],
  gluten: ['wheat', 'barley', 'rye', 'maida', 'flour', 'bread', 'roti'],
  fish: ['fish', 'seafood', 'prawns', 'shrimp'],
};

/* -------------------------------------------------------------------------- */
/* Utils                                                                      */
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

function detectIntent(query: string): ActiveIntent | null {
  const q = query.toLowerCase();
  if (/lose|fat|slim|weight loss/.test(q)) return 'weight_loss';
  if (/gain|bulk|muscle|weight gain/.test(q)) return 'weight_gain';
  if (/maintain|maintenance/.test(q)) return 'maintenance';
  if (/thyroid|diabetes|pcod|bp|cholesterol|acidity|pain|bloating/.test(q)) return 'medical';
  return null;
}

function detectUserAllergies(query: string): string[] {
  const q = query.toLowerCase();
  const found: string[] = [];
  for (const [base, aliases] of Object.entries(ALLERGY_VOCABULARY)) {
    if (aliases.some(a => q.includes(a))) {
      found.push(base);
    }
  }
  return found;
}

/**
 * HARD ALLERGY ENFORCEMENT
 * Checks query against the user's stored base allergies and all their aliases.
 */
function enforceAllergyRules(query: string, userAllergies: string[]): string | null {
  const q = query.toLowerCase();
  for (const allergy of userAllergies) {
    const aliases = ALLERGY_VOCABULARY[allergy] || [allergy];
    const matchedAlias = aliases.find(a => q.includes(a));

    if (matchedAlias) {
      return sanitizeText(
        `Warning: You have a registered ${allergy} allergy. Since ${matchedAlias} is a form of ${allergy}, it is not safe for you. Please avoid this and choose a safe alternative.`
      );
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Calculations & Context                                                     */
/* -------------------------------------------------------------------------- */
function calculateCalories(profile: UserProfile): number | null {
  const { age, height, current_weight, gender, activity_level, goal } = profile;
  if (!age || !height || !current_weight || !gender || !activity_level) return null;

  const bmr = gender === 'male'
    ? 10 * current_weight + 6.25 * height - 5 * age + 5
    : 10 * current_weight + 6.25 * height - 5 * age - 161;

  const activityMap = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  let calories = bmr * activityMap[activity_level];

  if (goal === 'lose_weight') calories -= 400;
  if (goal === 'gain_weight') calories += 400;
  return Math.round(calories);
}

async function getUserContext(userId: number) {
  const connection = await getConnection();
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT goal, age, current_weight, height, gender, activity_level, allergies FROM users WHERE id = ?',
    [userId]
  );
  await connection.end();

  const profile: UserProfile = rows.length ? (rows[0] as UserProfile) : {};
  const calories = calculateCalories(profile);
  const allergies: string[] = profile.allergies ? JSON.parse(profile.allergies) : [];

  return { profile, calories, allergies };
}

/* -------------------------------------------------------------------------- */
/* AI Reply with History & Persistent Memory                                  */
/* -------------------------------------------------------------------------- */
async function getAiReply(userId: number, query: string): Promise<string> {
  if (!GEMINI_API_KEY) return 'I am unavailable right now.';

  const { profile, calories, allergies: savedAllergies } = await getUserContext(userId);
  
  // 1. Update Allergy List in DB if new ones are mentioned
  const newlyDetected = detectUserAllergies(query);
  let updatedAllergies = savedAllergies;
  if (newlyDetected.length > 0) {
    updatedAllergies = Array.from(new Set([...savedAllergies, ...newlyDetected]));
    const connection = await getConnection();
    await connection.execute('UPDATE users SET allergies = ? WHERE id = ?', [JSON.stringify(updatedAllergies), userId]);
    await connection.end();
  }

  // 2. HARD allergy block (checks current query vs all known aliases)
  const allergyViolation = enforceAllergyRules(query, updatedAllergies);
  if (allergyViolation) return allergyViolation;

  // 3. Fetch Last 5 Messages for Conversation Memory
  const connection = await getConnection();
  const [historyRows] = await connection.execute<RowDataPacket[]>(
    `SELECT sender_id, message FROM messages 
     WHERE (sender_id = ? AND receiver_id = 0) OR (sender_id = 0 AND receiver_id = ?) 
     ORDER BY created_at DESC LIMIT 5`,
    [userId, userId]
  );
  await connection.end();

  const history = historyRows.reverse().map(row => ({
    role: row.sender_id === 0 ? 'model' : 'user',
    parts: [{ text: row.message }]
  }));

  const activeIntent = detectIntent(query) || profile.goal || 'general';

  const systemPrompt = `
You are a professional dietitian assistant. 
USER PROFILE: Goal is ${activeIntent}, Calories: ${calories || 'not set'}.
STRICT ALLERGY LIST: ${updatedAllergies.length ? updatedAllergies.join(', ') : 'None'}.

STRICT RULES:
- If a user mentions a food from their allergy list or any related form of it (e.g., oatmeal for an oat allergy), you MUST refuse and warn them.
- Refer to the chat history to stay consistent. If they asked for a plan previously, build upon it.
- No markdown, no bullets, no emojis.
- Sound calm, human, and professional.
`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [...history, { role: 'user', parts: [{ text: query }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }),
    });

    const result = await response.json();
    const raw = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    return raw ? sanitizeText(raw) : 'Please try again.';
  } catch {
    return 'I am having trouble connecting. Please try again.';
  }
}

/* -------------------------------------------------------------------------- */
/* API Routes                                                                 */
/* -------------------------------------------------------------------------- */
export async function GET(request: NextRequest) {
  const user = verifyAuth(request);
  if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const connection = await getConnection();
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id, sender_id, receiver_id, message, created_at FROM messages 
     WHERE (sender_id = ? AND receiver_id = 0) OR (sender_id = 0 AND receiver_id = ?) 
     ORDER BY created_at ASC`,
    [user.id, user.id]
  );
  await connection.end();
  return NextResponse.json({ messages: rows });
}

export async function POST(request: NextRequest) {
  const user = verifyAuth(request);
  if (!user?.id) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const message = body?.message?.trim();
  if (!message) return NextResponse.json({ message: 'Message cannot be empty' }, { status: 400 });

  const connection = await getConnection();
  // Store user message
  await connection.execute('INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, 0, ?)', [user.id, message]);

  // Get AI response with context
  const aiReply = await getAiReply(user.id, message);

  // Store AI response
  await connection.execute('INSERT INTO messages (sender_id, receiver_id, message) VALUES (0, ?, ?)', [user.id, aiReply]);
  await connection.end();

  return NextResponse.json({ reply: aiReply });
}