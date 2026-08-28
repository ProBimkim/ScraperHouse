import './globals.css';

export const metadata = {
  title: 'MS Forms Scraper',
  description: 'Premium MS Forms extraction tool powered by Puppeteer & MongoDB.',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
