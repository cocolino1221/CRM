import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';
import { ThemeProvider } from '@/contexts/ThemeContext';

export const metadata: Metadata = {
  title: 'easyteamcrm',
  description: 'AI-powered CRM platform for team collaboration',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'easyteamcrm',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#16a34a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="safe-area-inset">
        <ThemeProvider>
          <AuthGuard>{children}</AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}
