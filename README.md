# RehanPulse

A real-time developer activity command center built with Next.js 14, Firebase, and the GitHub/Vercel APIs. Track commits, deployments, and usage metrics from a single, unified dashboard.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-orange) ![Tailwind](https://img.shields.io/badge/Tailwind%20CSS-3.4-38bdf8)

---

## Features

- **GitHub Activity** — Commits, pull requests, repositories, and CI status via OAuth + REST API
- **Vercel Deployments** — Real-time deployment statuses, project overview, and usage analytics
- **Firebase Metrics** — Firestore reads/writes, auth events, and storage usage
- **Real-Time Events** — Server-Sent Events (SSE) stream webhook payloads live to the dashboard
- **Smart Alerts** — Configurable thresholds for deploy failures, rate limits, and resource usage
- **Command Palette** — ⌘K / Ctrl+K spotlight search to navigate, toggle theme, and run actions
- **macOS-Inspired UI** — Frosted glass panels, sidebar, draggable widget grid, dark/light mode
- **Animated Homepage** — Three.js particle background, auto-typing sentences, Framer Motion transitions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS + Framer Motion |
| Auth | Firebase Auth (GitHub OAuth) |
| Database | Cloud Firestore |
| Admin SDK | Firebase Admin |
| APIs | GitHub REST (Octokit), Vercel REST |
| State | Zustand, React Query |
| 3D | Three.js (particle background) |
| Testing | Vitest (unit), Playwright (E2E) |
| Linting | ESLint + Prettier + Husky + lint-staged |
| Design System | shadcn/ui + Storybook |

---

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── auth/           # Session cookie & sign-out routes
│   │   ├── github/         # GitHub data proxy (server-side)
│   │   ├── settings/       # User settings CRUD
│   │   ├── stream/         # SSE endpoint (Firestore → client)
│   │   ├── vercel/         # Vercel API proxy + usage
│   │   └── webhooks/       # GitHub webhook ingestion (HMAC verified)
│   ├── home/               # Animated SaaS landing page
│   ├── login/              # GitHub OAuth sign-in
│   └── page.tsx            # Root (authenticated dashboard shell)
├── components/
│   ├── layout/             # AppShell (sidebar, menubar, content area)
│   ├── pages/              # Dashboard, GitHub, Deployments, Firebase, Alerts, Settings
│   ├── providers/          # Auth, Theme, React Query providers
│   ├── spotlight/          # ⌘K command palette (cmdk)
│   ├── ui/                 # AnimatedBackground, Button, etc.
│   └── widgets/            # WidgetGrid (drag-and-drop) + WidgetErrorBoundary
├── hooks/                  # useEventSource, useGitHubData, useVercelData
├── lib/
│   ├── crypto.ts           # AES-256-GCM token encryption
│   ├── firebase.ts         # Client Firebase SDK init
│   ├── firebase-admin.ts   # Admin SDK init
│   ├── github.ts           # Octokit: repos, commits, PRs, webhooks
│   ├── vercel.ts           # Vercel API: deployments, projects, usage
│   └── stores/             # Zustand event store for SSE
└── middleware.ts            # Session cookie validation, route protection
```

**Data Flow:**
1. User signs in via GitHub OAuth → Firebase Auth issues session cookie
2. GitHub webhook events → `/api/webhooks/github` (HMAC verified) → Firestore
3. SSE stream at `/api/stream` watches Firestore with `onSnapshot` → pushes to client
4. Dashboard widgets consume data via React Query (REST) + Zustand (SSE events)

---

## Getting Started

### Prerequisites

- Node.js 18+
- Firebase project with Firestore and GitHub OAuth enabled
- GitHub OAuth App (Client ID / Secret configured in Firebase)
- Vercel account (optional, for deployment metrics)

### 1. Clone & Install

```bash
git clone https://github.com/your-username/RehanPulse.git
cd RehanPulse
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the project root:

```env
# ─── Firebase (Server) ───
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ─── Firebase (Client) ───
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# ─── Security ───
GITHUB_WEBHOOK_SECRET=your-webhook-secret
TOKEN_ENCRYPTION_KEY=a-32-character-or-longer-secret-key

# ─── Optional ───
SKIP_ENV_VALIDATION=0
ANALYZE=false
```

All environment variables are validated at build time via `@t3-oss/env-nextjs`. Set `SKIP_ENV_VALIDATION=1` during CI builds where secrets aren't available.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the root redirects to the dashboard (requires auth) and `/home` shows the landing page.

### 4. Vercel Token (In-App)

Navigate to **Settings** in the dashboard and paste your [Vercel API Token](https://vercel.com/account/tokens). It's AES-256-GCM encrypted before storage.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Format all files with Prettier |
| `npm run type-check` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run analyze` | Build with bundle analyzer |
| `npm run storybook` | Start Storybook dev server |

---

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add all environment variables from `.env.local` to Vercel project settings
4. Deploy — Vercel auto-builds on push to `main`

### GitHub Webhooks

After deploying, go to **Settings → Register Webhooks** in the dashboard. This creates webhooks on all your GitHub repos pointing to `https://your-domain.com/api/webhooks/github`. Webhooks require a publicly accessible URL (not localhost).

---

## Project Structure Decisions

- **Server-side token storage**: GitHub and Vercel tokens are AES-256-GCM encrypted via `crypto.subtle` and stored in Firestore — never exposed to the client.
- **SSE over WebSockets**: Server-Sent Events via Next.js Edge Runtime are simpler, HTTP-based, and work out of the box on Vercel's free tier.
- **Firestore security rules**: Users can only read/write their own `users/{uid}` documents. Webhook writes go through Admin SDK (bypasses rules).
- **Dynamic code splitting**: Three.js (particle background) is dynamically imported — it only loads on the homepage and login page.

---

## License

Private project — not open-source.
