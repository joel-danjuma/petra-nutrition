import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { ApiProvider } from '@/components/providers/api-provider';
import { Toaster } from '@/components/ui/toaster';
import '@/styles/globals.css';

// Space Grotesk carries the whole editorial system. Exposed as a CSS variable
// so Tailwind's `font-sans` resolves to the loaded face — the previous setup
// applied `inter.className` while Tailwind separately named a bare 'Inter'
// string, so `font-sans` silently overrode the loaded font with a system lookup.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

// Inter stands in for Inter Display on pricing surfaces — the substitution the
// design system documents. Variable axis reaches the 475/575 mid-weights.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Petra AI - Your Intelligent Kitchen Assistant',
  description: 'Discover recipes, plan meals, and manage your pantry with AI-powered assistance.',
  keywords: ['AI', 'cooking', 'recipes', 'meal planning', 'pantry management', 'nutrition'],
  authors: [{ name: 'Petra AI Team' }],
  creator: 'Petra AI',
  publisher: 'Petra AI',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'Petra AI - Your Intelligent Kitchen Assistant',
    description: 'Discover recipes, plan meals, and manage your pantry with AI-powered assistance.',
    siteName: 'Petra AI',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Petra AI - Your Intelligent Kitchen Assistant',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Petra AI - Your Intelligent Kitchen Assistant',
    description: 'Discover recipes, plan meals, and manage your pantry with AI-powered assistance.',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
  },
};

// White canvas only — the design system documents no dark palette.
//
// This is browser-chrome metadata, not a style, and must be a static string a
// Server Component can serialise — it cannot read a CSS custom property, and
// importing the token module here would pull the client-only store barrel into
// the server build. It mirrors `--petra-canvas` in src/styles/tokens.css.
// eslint-disable-next-line no-restricted-syntax
export const viewport: Viewport = { colorScheme: 'light', themeColor: '#ffffff' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <ApiProvider>
          {children}
          <Toaster />
        </ApiProvider>
      </body>
    </html>
  );
}
