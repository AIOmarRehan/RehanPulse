import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { encrypt } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const { idToken, githubAccessToken } = (await request.json()) as {
      idToken?: string;
      githubAccessToken?: string;
    };

    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    // Verify the ID token and get the user
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Create a session cookie (5 days)
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    // If we have a GitHub access token, encrypt and store it
    if (githubAccessToken) {
      const encryptedToken = encrypt(githubAccessToken);
      await adminDb.collection('users').doc(uid).set(
        {
          githubTokenEncrypted: encryptedToken,
          displayName: decodedToken.name ?? null,
          email: decodedToken.email ?? null,
          photoURL: decodedToken.picture ?? null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    }

    // Set the session cookie
    const response = NextResponse.json({ status: 'success' });
    response.cookies.set('__session', sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
