import type { Metadata } from 'next';
import './globals.css';
import AuthGuard from '@/components/AuthGuard';
import { ThemeProvider } from '@/contexts/ThemeContext';

export const metadata: Metadata = {
  title: 'SlackCRM - AI-Powered Team CRM',
  description: 'AI-powered CRM platform for team collaboration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <AuthGuard>{children}</AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}