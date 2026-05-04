import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cogentrex',
  description: 'Self-hosted multi-provider AI research cockpit with deep research, provider routing, and skill-aware agents.',
  icons: {
    icon: '/logo',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
