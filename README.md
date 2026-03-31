# RehanPulse

![Demo](intro-video/demo.gif)

A real-time developer activity dashboard built with Next.js 14, Firebase, and multiple third-party API integrations. RehanPulse consolidates GitHub activity, Vercel deployment metrics, and Firebase project data into a single, unified interface with live updates and configurable alerting.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-orange) ![Tailwind](https://img.shields.io/badge/Tailwind%20CSS-3.4-38bdf8)

## Features

**GitHub Integration**
- Full OAuth-based authentication via Firebase Auth
- Repository listing, commit history, pull request tracking, and CI status
- Contribution graph powered by the GitHub GraphQL API
- Webhook ingestion with HMAC-SHA256 signature verification for real-time event capture

**Vercel Integration**
- Deployment history with build duration, status indicators, and success rate metrics
- Project listing with associated domains (custom and default)
- Usage analytics for bandwidth and serverless function invocations

**Firebase Integration**
- Google OAuth connection for Firestore project monitoring
- Collection-level document count and project statistics

**Real-Time Data**
- Server-Sent Events (SSE) stream delivers webhook payloads to the client instantly
- Automatic background polling at configurable intervals (30 seconds to 2 minutes depending on data source)
- Manual sync across all data sources from any page

**Alerts and Notifications**
- Configurable alert rules per webhook event type (push, pull request, deployment, etc.)
- Grouped notification system with read/unread tracking
- Automatic 30-second polling for new notifications

**AI Chatbot (Pulse AI)**
- Context-aware assistant that understands your repos, deployments, alerts, and Firebase data
- Powered by Hugging Face Inference API (zero additional npm dependencies)
- Streaming responses via SSE for real-time output
- Automatically injects live dashboard data as context from React Query caches
- Accessible from a floating action button or the command palette

**User Interface**
- macOS-inspired frosted glass design with dark and light mode support
- Draggable widget grid for dashboard customization
- Command palette (Cmd+K / Ctrl+K) for navigation and quick actions
- Animated landing page with Three.js particle background and Framer Motion transitions
- Fully responsive layout for desktop and mobile

## Tech Stack

### Core

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Runtime | Node.js 18+ |

### Frontend

| Category | Technology |
|----------|------------|
| Styling | Tailwind CSS 3.4, tw-animate-css |
| Animation | Framer Motion |
| 3D Graphics | Three.js (dynamically imported) |
| Component Library | shadcn/ui, Radix UI |
| Command Palette | cmdk |
| Charts | Recharts |
| Icons | Lucide React |
| Theme Management | next-themes |

### State Management and Data Fetching

| Category | Technology |
|----------|------------|
| Server State | TanStack React Query v5 |
| Client State | Zustand |
| Validation | Zod, @t3-oss/env-nextjs |

### Backend and Infrastructure

| Category | Technology |
|----------|------------|
| Authentication | Firebase Auth (GitHub OAuth provider) |
| Database | Cloud Firestore |
| Server SDK | Firebase Admin SDK |
| GitHub API | Octokit (REST + GraphQL) |
| Vercel API | REST (deployments, projects, domains, usage) |
| Token Encryption | AES-256-GCM via Web Crypto API |
| AI Chat | Hugging Face Inference API (OpenAI-compatible streaming) |

### Development Tooling

| Category | Technology |
|----------|------------|
| Unit Testing | Vitest, Testing Library, jsdom |
| E2E Testing | Playwright |
| Component Development | Storybook 8 |
| Linting | ESLint, eslint-config-next, eslint-config-prettier |
| Formatting | Prettier, prettier-plugin-tailwindcss |
| Git Hooks | Husky, lint-staged |
| Bundle Analysis | @next/bundle-analyzer |

## Architecture

```
src/
  app/
    api/
      auth/           # Session cookie management, sign-out
      github/         # GitHub data proxy with server-side caching
      settings/       # User settings CRUD, webhook registration
      stream/         # SSE endpoint (Firestore onSnapshot to client)
      vercel/         # Vercel API proxy with force-refresh support
      chat/           # AI chatbot endpoint (HF Inference API streaming)
      webhooks/       # GitHub webhook receiver (HMAC verified)
    home/             # Public landing page
    login/            # GitHub OAuth sign-in
    page.tsx          # Root entry (authenticated dashboard shell)
  components/
    layout/           # App shell (sidebar, top bar, content area)
    pages/            # Page-level components (Dashboard, GitHub, Deployments, Firebase, Alerts, Settings)
    providers/        # Auth, Theme, React Query context providers
    chat/             # AI chat panel (Pulse AI)
    spotlight/        # Command palette
    ui/               # Shared UI primitives
    widgets/          # Draggable widget grid with error boundaries
  hooks/              # useEventSource (SSE), useGitHubData, useVercelData, useFirebaseData, useAlertRules, useNotifications, useChat
  lib/
    crypto.ts         # AES-256-GCM encryption for stored tokens
    firebase.ts       # Client SDK initialization
    firebase-admin.ts # Admin SDK initialization
    github.ts         # Octokit wrapper (repos, commits, PRs, contributions, webhooks)
    vercel.ts         # Vercel API wrapper (deployments, projects, domains, usage)
    stores/           # Zustand store for real-time SSE events
  middleware.ts       # Session cookie validation and route protection
```

### Data Flow

1. The user authenticates via GitHub OAuth. Firebase Auth issues a session cookie that the middleware validates on every request.
2. API routes proxy requests to GitHub, Vercel, and Firebase with server-side caching (30-second TTL). Each route supports a `force=1` parameter to bypass the cache.
3. GitHub webhook events are received at `/api/webhooks/github`, verified with HMAC-SHA256, and written to Firestore via the Admin SDK.
4. The SSE endpoint at `/api/stream` uses Firestore `onSnapshot` to push webhook events to the client in real time.
5. React Query manages polling and cache invalidation for all data sources. Zustand handles the real-time event stream.

### Security

- GitHub and Vercel tokens are encrypted with AES-256-GCM before storage in Firestore. Encryption keys never leave the server.
- Firestore security rules restrict users to their own documents. All webhook writes go through the Admin SDK and bypass client rules.
- Webhook payloads are verified against the `GITHUB_WEBHOOK_SECRET` using HMAC-SHA256 before processing.
- Environment variables are validated at build time using `@t3-oss/env-nextjs` with Zod schemas.

## Getting Started

### Prerequisites

- Node.js 18 or later
- A Firebase project with Firestore and GitHub OAuth enabled
- A GitHub OAuth App configured in the Firebase Console
- A Vercel account and API token (optional, for deployment metrics)

### Installation

```bash
git clone https://github.com/your-username/RehanPulse.git
cd RehanPulse
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Firebase (Server)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Firebase (Client)
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Security
GITHUB_WEBHOOK_SECRET=your-webhook-secret
TOKEN_ENCRYPTION_KEY=a-32-character-or-longer-secret-key

# Optional
SKIP_ENV_VALIDATION=0
ANALYZE=false

# AI Chatbot (optional, enables Pulse AI)
HUGGINGFACE_API_KEY=hf_...
# HUGGINGFACE_MODEL=meta-llama/Llama-3.1-8B-Instruct
```

All environment variables are validated at build time. Set `SKIP_ENV_VALIDATION=1` for CI environments where secrets are not available.

### Development

```bash
npm run dev
```

The root path redirects to the authenticated dashboard. Visit `/home` for the public landing page.

### Vercel Token Setup

After signing in, navigate to Settings in the dashboard and enter your [Vercel API Token](https://vercel.com/account/tokens). The token is AES-256-GCM encrypted before being stored in Firestore.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Format all files with Prettier |
| `npm run type-check` | Run TypeScript type checking |
| `npm test` | Run unit tests with Vitest |
| `npm run test:e2e` | Run end-to-end tests with Playwright |
| `npm run analyze` | Build with bundle analysis enabled |
| `npm run storybook` | Start Storybook on port 6006 |

## Deployment

### Vercel (Recommended)

1. Push the repository to GitHub.
2. Import it on [vercel.com](https://vercel.com).
3. Add all environment variables from `.env.local` to the Vercel project settings.
4. Deploy. Vercel will automatically build and deploy on pushes to `main`.

### Webhook Registration

After deploying to a public URL, go to Settings in the dashboard and click "Register Webhooks". This creates webhooks on all your GitHub repositories pointing to your deployed `/api/webhooks/github` endpoint. Webhooks require a publicly accessible URL and will not work on localhost.

## License

This project is licensed under the MIT License.