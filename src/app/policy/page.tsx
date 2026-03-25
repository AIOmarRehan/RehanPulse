import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — RehanPulse',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-800 dark:text-gray-200">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Last updated: March 25, 2026
      </p>

      <section className="mt-10 space-y-8 text-[15px] leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">1. Introduction</h2>
          <p className="mt-2">
            RehanPulse (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) is a developer
            activity dashboard. This policy explains what data we collect, how we use it, and your
            rights regarding that data.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            2. Data We Collect
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>GitHub account information:</strong> username, email, and profile data provided
              through GitHub OAuth sign-in.
            </li>
            <li>
              <strong>GitHub activity data:</strong> repository events (pushes, pull requests, issues)
              received via webhooks you authorize.
            </li>
            <li>
              <strong>Google account information:</strong> email and profile data provided when you
              optionally connect your Google account for Firebase project monitoring.
            </li>
            <li>
              <strong>Firebase project metadata:</strong> project names, collection names, and
              document counts from Firebase projects you choose to monitor (read-only access).
            </li>
            <li>
              <strong>Vercel deployment data:</strong> project names and deployment statuses when you
              connect your Vercel account.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            3. How We Use Your Data
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Display your developer activity in the dashboard.</li>
            <li>Send alert notifications based on rules you configure.</li>
            <li>Authenticate and authorize your sessions.</li>
          </ul>
          <p className="mt-2">We do not sell, share, or transfer your data to third parties.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            4. Data Storage &amp; Security
          </h2>
          <p className="mt-2">
            Data is stored in Firebase Firestore. OAuth tokens are encrypted at rest using AES-256
            before storage. Sessions are managed via secure, HTTP-only cookies.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            5. Third-Party Services
          </h2>
          <p className="mt-2">
            We integrate with GitHub, Google (Firebase), and Vercel APIs. Each service has its own
            privacy policy. We only request the minimum permissions necessary (read-only where
            possible).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            6. Your Rights
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>You can disconnect linked accounts at any time from the dashboard.</li>
            <li>You can request deletion of your data by contacting us.</li>
            <li>You can revoke OAuth permissions directly from GitHub, Google, or Vercel.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">7. Contact</h2>
          <p className="mt-2">
            For questions about this policy, contact{' '}
            <a
              href="mailto:ai.omar.rehan@gmail.com"
              className="text-indigo-600 underline dark:text-indigo-400"
            >
              ai.omar.rehan@gmail.com
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
