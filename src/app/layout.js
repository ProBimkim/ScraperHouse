import './globals.css';

export const metadata = {
  title: 'MS Forms Premium Scraper',
  description: 'Scrape Microsoft Forms automatically using Puppeteer and MongoDB.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
