import mysql from 'mysql2/promise';

// 1. We define the config in ONE place
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    // 2. THIS IS THE FIX:
    // We check if the password exists in .env.local. 
    // If it doesn't, we explicitly tell mysql to use a blank string "".
    password: process.env.DB_PASSWORD || "", 
    database: process.env.DB_DATABASE,
};

console.log(dbConfig,'000000000000')

// 3. We create a reusable function to get a connection
export async function getConnection() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        return connection;
    } catch (error: any) {
        console.error("--- DATABASE CONNECTION FAILED ---");
        console.error("Error:", error.message);
        // This will now show a clear error if the DB_USER or DB_HOST is wrong
        throw new Error("Failed to connect to the database. Check server .env.local and MySQL settings.");
    }
}