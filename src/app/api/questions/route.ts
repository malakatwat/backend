import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

// 1. GET: Fetch all questions
export async function GET() {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM questions ORDER BY created_at ASC'
    );
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. POST: Add a new question
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question_text, question_type, options, is_active } = body;

    // Convert options array to JSON string for database
    const optionsJson = (question_type === 'single_choice' || question_type === 'multiple_choice') && options
      ? JSON.stringify(options) 
      : null;

    const connection = await getConnection();
    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO questions (question_text, question_type, options, is_active) VALUES (?, ?, ?, ?)',
      [question_text, question_type, optionsJson, is_active !== false]
    );

    return NextResponse.json({ id: result.insertId, message: 'Question added' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 3. PUT: Update a question
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, question_text, question_type, options, is_active } = body;

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const optionsJson = (question_type === 'single_choice' || question_type === 'multiple_choice') && options
      ? JSON.stringify(options) 
      : null;

    const connection = await getConnection();
    await connection.execute(
      'UPDATE questions SET question_text=?, question_type=?, options=?, is_active=? WHERE id=?',
      [question_text, question_type, optionsJson, is_active, id]
    );

    return NextResponse.json({ message: 'Question updated' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 4. DELETE: Remove a question
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const connection = await getConnection();
    await connection.execute('DELETE FROM questions WHERE id = ?', [id]);

    return NextResponse.json({ message: 'Question deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}