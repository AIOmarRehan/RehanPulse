import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — RehanPulse',
};

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-gray-800 dark:text-gray-200">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Last updated: March 25, 2026
      </p>

      <section className="mt-10 space-y-8 text-[15px] leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            1. Acceptance of Terms
          </h2>
          <p className="mt-2">
            By accessing or using RehanPulse (&quot;the app&quot;), you agree to be bound by these
            Terms of Service. If you do not agree, do not use the app.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            2. Description of Service
          </h2>
          <p className="mt-2">
            RehanPulse is a developer activity dashboard that aggregates data from GitHub, Vercel,
            and Firebase to provide a unified view of your development workflow. The app is provided
            &quot;as is&quot; for personal and professional developer use.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            3. User Accounts
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>You must authenticate via GitHub to use the app.</li>
            <li>You are responsible for maintaining the security of your account.</li>
            <li>
              You may optionally connect Google and Vercel accounts for additional features.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            4. Permitted Use
          </h2>
          <p className="mt-2">You agree to use RehanPulse only for lawful purposes. You must not:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Attempt to gain unauthorized access to other users&apos; data.</li>
            <li>Use the app to violate any applicable law or regulation.</li>
            <li>Interfere with or disrupt the app&apos;s infrastructure.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            5. Data &amp; Privacy
          </h2>
          <p className="mt-2">
            Your use of the app is also governed by our{' '}
            <a href="/policy" className="text-indigo-600 underline dark:text-indigo-400">
              Privacy Policy
            </a>
            . By using the app, you consent to the collection and use of data as described therein.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            6. Third-Party Integrations
          </h2>
          <p className="mt-2">
            The app connects to third-party services (GitHub, Google, Vercel). Your use of those
            services is subject to their respective terms. We are not responsible for the
            availability or behavior of third-party APIs.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            7. Limitation of Liability
          </h2>
          <p className="mt-2">
            RehanPulse is provided &quot;as is&quot; without warranties of any kind. We are not
            liable for any damages arising from your use of the app, including data loss, service
            interruptions, or inaccuracies in displayed data.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            8. Termination
          </h2>
          <p className="mt-2">
            You may stop using the app at any time. You can disconnect linked accounts and request
            data deletion. We reserve the right to suspend accounts that violate these terms.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            9. Changes to Terms
          </h2>
          <p className="mt-2">
            We may update these terms from time to time. Continued use of the app after changes
            constitutes acceptance of the updated terms.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">10. Contact</h2>
          <p className="mt-2">
            For questions about these terms, contact{' '}
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
