import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db'; // Your existing DB connection helper
import { RowDataPacket } from 'mysql2';

export async function GET() {
  try {
    const connection = await getConnection();

    // We use Promise.all to run all queries in parallel for speed
    const [
      usersResult, 
      revenueResult, 
      challengesResult, 
      recentUsersResult
    ] = await Promise.all([
      // 1. Count Total Users
      connection.execute<RowDataPacket[]>('SELECT COUNT(*) as count FROM users'),

      // 2. Sum Total Revenue (Assuming you have a 'payments' or 'subscriptions' table)
      // If you don't have payments yet, you can remove this or set it to 0
      connection.execute<RowDataPacket[]>('SELECT SUM(amount) as total FROM payments'), 

      // 3. Count Active Challenges (Assuming 'challenges' table with a 'status' column)
      connection.execute<RowDataPacket[]>('SELECT COUNT(*) as count FROM challenges WHERE status = ?', ['active']),

      // 4. Get 5 Most Recent Users
      connection.execute<RowDataPacket[]>('SELECT id, name, email, created_at FROM users ORDER BY created_at DESC LIMIT 5')
    ]);

    // Extracting data from the results (mysql2 returns [rows, fields])
    const totalUsers = usersResult[0][0]?.count || 0;
    const totalRevenue = revenueResult[0][0]?.total || 0;
    const activeChallenges = challengesResult[0][0]?.count || 0;
    const recentUsers = recentUsersResult[0] || [];

    // Format the recent users data to match what the frontend expects
    const formattedRecentUsers = Array.isArray(recentUsers) ? recentUsers.map((user: any) => ({
      id: user.id,
      name: user.name || 'Unknown',
      email: user.email,
      // Format date nicely (e.g., "2024-01-15")
      joinedDate: user.created_at ? new Date(user.created_at).toISOString().split('T')[0] : 'N/A',
      status: 'Active' // You can map this to a real column if you have one
    })) : [];

    // Return the real data
    return NextResponse.json({
      totalUsers,
      totalRevenue,
      activeChallenges,
      recentUsers: formattedRecentUsers
    });

  } catch (error: any) {
    console.error("Dashboard Stats API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats", details: error.message }, 
      { status: 500 }
    );
  }
}