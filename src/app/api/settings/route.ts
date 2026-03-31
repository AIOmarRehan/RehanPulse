import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { encrypt, decrypt } from '@/lib/crypto';
import { registerWebhooksForUser } from '@/lib/github';
import { registerVercelWebhook } from '@/lib/vercel';

export const dynamic = 'force-dynamic';

/** GET — load the user's settings (tokens are masked). */
export async function GET(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const uid = decoded.uid;

    const db = getAdminDb();
    const doc = await db.collection('users').doc(uid).get();
    const data = doc.data();

    return NextResponse.json({
      hasVercelToken: !!data?.vercelTokenEncrypted,
      hasGitHubToken: !!data?.githubTokenEncrypted,
      webhooksRegistered: data?.webhooksRegistered ?? false,
    });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST — save user settings (Vercel token, etc.). */
export async function POST(request: NextRequest) {
  try {
    const session = request.cookies.get('__session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);
    const uid = decoded.uid;

    const body = (await request.json()) as {
      vercelToken?: string;
      removeVercelToken?: boolean;
      registerWebhooks?: boolean;
    };

    const db = getAdminDb();

    // Handle webhook registration
    if (body.registerWebhooks) {
      const doc = await db.collection('users').doc(uid).get();
      const data = doc.data();
      if (!data?.githubTokenEncrypted) {
        return NextResponse.json(
          { error: 'No GitHub token found. Please sign in again.' },
          { status: 400 },
        );
      }
      const githubToken = decrypt(data.githubTokenEncrypted as string);
      const appUrl = request.headers.get('origin') ?? request.nextUrl.origin;
      const webhookUrl = `${appUrl}/api/webhooks/github`;
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? '';

      // Warn if running locally — GitHub can't deliver to localhost
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(appUrl);
      if (isLocalhost) {
        return NextResponse.json({
          status: 'webhooks_registered',
          registered: 0,
          skipped: 0,
          errors: 0,
          errorDetails: [
            'Cannot register webhooks on localhost — GitHub needs a publicly accessible URL to deliver events. Deploy your app first, then register webhooks from production.',
          ],
          isLocalhost: true,
        });
      }

      const stats = await registerWebhooksForUser(githubToken, webhookUrl, webhookSecret);

      if (stats.registered > 0 || stats.skipped > 0) {
        await db.collection('users').doc(uid).set(
          { webhooksRegistered: true, updatedAt: new Date().toISOString() },
          { merge: true },
        );
      }

      return NextResponse.json({
        status: 'webhooks_registered',
        registered: stats.registered,
        skipped: stats.skipped,
        errors: stats.errors,
        errorDetails: stats.errorDetails,
      });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (body.removeVercelToken) {
      // Use FieldValue.delete() equivalent
      const { FieldValue } = await import('firebase-admin/firestore');
      updates.vercelTokenEncrypted = FieldValue.delete();
    } else if (body.vercelToken) {
      // Validate token by making a test call
      const testRes = await fetch('https://api.vercel.com/v2/user', {
        headers: { Authorization: `Bearer ${body.vercelToken}` },
      });
      if (!testRes.ok) {
        return NextResponse.json(
          { error: 'Invalid Vercel token — could not authenticate with Vercel API' },
          { status: 400 },
        );
      }
      updates.vercelTokenEncrypted = encrypt(body.vercelToken);

      // Auto-register Vercel webhook for deployment events
      const appUrl = request.headers.get('origin') ?? request.nextUrl.origin;
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(appUrl);
      if (!isLocalhost) {
        const vercelWebhookUrl = `${appUrl}/api/webhooks/vercel?uid=${uid}`;
        registerVercelWebhook(body.vercelToken, vercelWebhookUrl)
          .then(async (result) => {
            if (result) {
              await db.collection('users').doc(uid).set(
                {
                  vercelWebhookId: result.id,
                  vercelWebhookSecret: result.secret,
                },
                { merge: true },
              );
              console.log('Vercel webhook registered:', result.id);
            }
          })
          .catch((err) => console.error('Vercel webhook registration failed:', err));
      }
    }

    await db.collection('users').doc(uid).set(updates, { merge: true });

    return NextResponse.json({ status: 'saved' });
  } catch (error) {
    console.error('Settings POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
