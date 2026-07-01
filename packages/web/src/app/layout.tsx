import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { ApiProvider } from '@/components/providers/api-provider';
import { Toaster } from '@/components/ui/toaster';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ApiProvider>
            {children}
            <Toaster />
          </ApiProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
