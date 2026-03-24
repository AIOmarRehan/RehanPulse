import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { encrypt } from '@/lib/crypto';
import { registerWebhooksForUser } from '@/lib/github';

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

      // Auto-register webhooks on user's repos (fire-and-forget)
      const appUrl = request.headers.get('origin') ?? request.nextUrl.origin;
      const webhookUrl = `${appUrl}/api/webhooks/github`;
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? '';
      registerWebhooksForUser(githubAccessToken, webhookUrl, webhookSecret)
        .then(async (stats) => {
          console.log('Webhook registration:', stats);
          // Mark in Firestore that webhooks were registered
          if (stats.registered > 0 || stats.skipped > 0) {
            await adminDb.collection('users').doc(uid).set(
              { webhooksRegistered: true },
              { merge: true },
            );
          }
        })
        .catch((err) => console.error('Webhook registration failed:', err));
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
