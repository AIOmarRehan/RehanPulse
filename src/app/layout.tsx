import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import './globals.css';
import { cn } from '@/lib/utils';
import { AuthProvider } from '@/components/providers/auth-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'RehanPulse',
  description: 'Developer Activity Command Center',
  icons: {
    icon: [
      { url: '/icons/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/icons/site.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'RehanPulse',
    statusBarStyle: 'black-translucent',
  },
  verification: {
    google: 'FCJAuIHyxvPNVxnn1OQjiyrVwnwejWRnY9Ubp8F_yIc',
  },
};

// Inline script that removes the loader when the page is truly ready.
// Does NOT depend on React — runs as vanilla JS.
const LOADER_SCRIPT = `
(function(){
  function hide(){
    var el=document.getElementById('__app-loader');
    if(!el)return;
    el.style.opacity='0';
    setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},400);
  }
  if(document.readyState==='complete'){hide();}
  else{window.addEventListener('load',hide);}
  setTimeout(hide,4000);
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn('font-sans', geistSans.variable, geistMono.variable)}>
      <body className="antialiased">
        {/* Layout-level loader: pure HTML/CSS, shown before JS loads */}
        <div
          id="__app-loader"
          aria-hidden="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#f5f5f7] dark:bg-[#050608]"
          style={{ transition: 'opacity 0.4s ease-out' }}
        >
          <div className="relative h-8 w-8">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-1/2 top-0 h-full w-full"
                style={{
                  transform: `rotate(${i * 30}deg)`,
                  animation: `macos-fade 1.2s ${(i * 0.1).toFixed(1)}s infinite linear`,
                  opacity: 0,
                }}
              >
                <div className="mx-auto h-[26%] w-[8%] rounded-full bg-gray-400 dark:bg-white/60" />
              </div>
            ))}
          </div>
        </div>

        {/* Vanilla JS loader removal — doesn't depend on React */}
        <Script id="__loader-remove" strategy="afterInteractive">{LOADER_SCRIPT}</Script>

        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
