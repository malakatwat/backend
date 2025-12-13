import mysql, { type Connection } from 'mysql2/promise';

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE,
    port: Number(process.env.DB_PORT) || 3306,

    // --- REQUIRED FOR TiDB CLOUD ---
    ssl: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
    },
};

export async function getConnection(): Promise<Connection> {
    try {
        const connection = await mysql.createConnection(dbConfig);
        return connection;
    } catch (error: unknown) {
        console.error('--- DATABASE CONNECTION FAILED ---');

        if (error instanceof Error) {
            console.error('Error:', error.message);
        } else {
            console.error('Unknown error occurred during database connection');
        }

        throw new Error(
            'Failed to connect to the database. Check server .env.local and DB settings.'
        );
    }
}
