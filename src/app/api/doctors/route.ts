import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

// --- CONFIG: Email Transporter ---
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// 1. GET: Fetch all doctors
export async function GET() {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT * FROM doctors ORDER BY created_at DESC'
    );
    return NextResponse.json(rows);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. POST: Add Doctor + Create User + Send Email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, specialty, bio, rating, email, phone } = body;

    // A. Validate Inputs
    if (!email || !name) {
      return NextResponse.json({ message: 'Name and Email are required' }, { status: 400 });
    }

    const connection = await getConnection();

    // B. Check if User already exists
    const [existingUsers] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ?', 
      [email]
    );

    if (existingUsers.length > 0) {
      return NextResponse.json({ message: 'User with this email already exists' }, { status: 409 });
    }

    // C. Generate Temporary Password
    const tempPassword = Math.random().toString(36).slice(-8) + "Aa1!"; // e.g., "x7z9q2Aa1!"
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // D. Create User Account (Role = Doctor)
    const [userResult] = await connection.execute<ResultSetHeader>(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, 'doctor']
    );
    const newUserId = userResult.insertId;

    // E. Create Doctor Profile (Linked to User)
    const [doctorResult] = await connection.execute<ResultSetHeader>(
      'INSERT INTO doctors (user_id, name, specialty, bio, rating, is_available, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [newUserId, name, specialty, bio, rating || 5.0, true, email, phone]
    );

    // F. Send Email with Credentials
    try {
      await transporter.sendMail({
        from: `"YourDietitian" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Welcome to YourDietitian - Your Doctor Account',
        html: `
          <h1>Welcome, Dr. ${name}!</h1>
          <p>An account has been created for you on the DietApp Dashboard.</p>
          <p><strong>Login Details:</strong></p>
          <ul>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Temporary Password:</strong> ${tempPassword}</li>
          </ul>
          <p>Please log in and change your password immediately.</p>
          <a href="http://localhost:3000/login">Login Here</a>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // We don't stop the process, but we log it.
    }

    return NextResponse.json({ 
      id: doctorResult.insertId, 
      message: 'Doctor created and email sent' 
    });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 3. PUT: Update a doctor
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, specialty, bio, rating, is_available, email, phone } = body;

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const connection = await getConnection();
    
    // Update Doctor Table
    await connection.execute(
      'UPDATE doctors SET name=?, specialty=?, bio=?, rating=?, is_available=?, email=?, phone=? WHERE id=?',
      [name, specialty, bio, rating, is_available, email, phone, id]
    );

    // Optional: Also update the 'users' table email/name if you want them to stay in sync
    // await connection.execute('UPDATE users SET name=?, email=? WHERE id=(SELECT user_id FROM doctors WHERE id=?)', [name, email, id]);

    return NextResponse.json({ message: 'Doctor updated' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 4. DELETE: Remove a doctor
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const connection = await getConnection();

    // First, find the linked user_id
    const [rows] = await connection.execute<RowDataPacket[]>('SELECT user_id FROM doctors WHERE id = ?', [id]);
    
    // Delete the Doctor Profile
    await connection.execute('DELETE FROM doctors WHERE id = ?', [id]);

    // Optional: Also delete the User Account so they can't log in anymore
    if (rows.length > 0 && rows[0].user_id) {
       await connection.execute('DELETE FROM users WHERE id = ?', [rows[0].user_id]);
    }

    return NextResponse.json({ message: 'Doctor and User account deleted' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}