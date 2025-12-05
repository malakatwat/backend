import { NextResponse, type NextRequest } from 'next/server';
import jwt, { type JwtPayload } from 'jsonwebtoken';

// This is the "Guard" function
// It checks the token and returns the user's data if valid
export function verifyAuth(request: NextRequest) {
    try {
        // 1. Get the secret key from environment variables
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error('JWT_SECRET is not defined');
            return null;
        }

        // 2. Get the Authorization header from the request
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            console.warn('Missing Authorization header');
            return null;
        }

        // 3. Check if it's a Bearer token
        const token = authHeader.split(' ')[1];
        if (!token) {
            console.warn('Malformed Authorization header');
            return null;
        }

        // 4. Verify the token using the secret key
        // This will throw an error if the token is expired or invalid
        const decoded = jwt.verify(token, secret) as JwtPayload;

        // 5. Return the decoded user payload
        return decoded; // This will be { id: 123, email: '...', name: '...' }

    } catch (error) {
        console.error('Auth Error:', error);
        return null;
    }
}