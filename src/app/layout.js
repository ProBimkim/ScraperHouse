import './globals.css';

export const metadata = {
  title: 'ScraperHouse - Data Intelligence & OSINT Suite',
  description: 'All-in-one data extraction and OSINT suite featuring MS Forms Scraper and Sherlock Username Hunter.',
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
