import type { Metadata } from 'next';
import '@/styles/dashboard.css';

export const metadata: Metadata = {
  title: 'CropConcept fieldwork dashboard',
  description: 'Near real-time monitoring of CropConcept surveys across Ethiopia, Tanzania, Malawi, Nigeria and Central America.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
