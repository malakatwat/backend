import mysql from 'mysql2/promise';

// 1. We define the config in ONE place
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    // 2. THIS IS THE FIX:
    // We check if the password exists. If not, we explicitly use a blank string "".
    password: process.env.DB_PASSWORD || "", 
    database: process.env.DB_DATABASE,
};

// 3. We create a reusable function to get a connection
export async function getConnection() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        return connection;
    } catch (error: unknown) {
        console.error("--- DATABASE CONNECTION FAILED ---");
        
        // Type check to safely access .message
        if (error instanceof Error) {
            console.error("Error:", error.message);
        } else {
            console.error("Unknown error occurred during database connection");
        }
        
        throw new Error("Failed to connect to the database. Check server .env.local and MySQL settings.");
    }
}