<p align="center">
  <img src="./public/logo.png" width="400" alt="Microsoft Forms Scraper Logo" />
</p>

# Microsoft Forms Scraper

A robust web application built with Next.js that extracts questions, choices, and images from Microsoft Forms. This tool utilizes a dual-strategy scraping method combining native HTTP fetching and Puppeteer for reliable data extraction, even for forms with anti-bot protections or timed mechanisms.

## Features

- **Dual-Strategy Scraping**:
  - **Fast Fetch**: Attempts to extract `prefetchFormUrl` and internal verification tokens directly from HTML for lightning-fast scraping.
  - **Puppeteer Fallback**: Uses a headless browser (`@sparticuz/chromium`) to intercept API requests when forms require complex session handling, cookies, or start buttons for timed forms.
- **Comprehensive Data Extraction**:
  - Extracts form title and description.
  - Retrieves all questions including types (multiple choice, text, etc.), choices, and required status.
  - Downloads/extracts image URLs embedded in questions.
- **Real-time Status Polling**: The frontend constantly polls the API to display the real-time processing status of the scraping job.
- **Search & Filter**: Built-in search functionality to quickly find specific questions or choices from the scraped results.
- **MongoDB Integration**: Stores all scraped results and global error logs persistently using Mongoose.
- **Modern UI**: Clean, glassmorphism-inspired UI with Lucide React icons.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Frontend**: React 19, CSS (Custom Glassmorphism styling)
- **Scraping Engine**: Puppeteer Core, `@sparticuz/chromium`, native `fetch`
- **Database**: MongoDB (via Mongoose)
- **Icons**: Lucide React

## Prerequisites

- Node.js (v18+)
- MongoDB connection string (set in `.env.local`)

## Getting Started

1. **Clone the repository** (if not already done).

2. **Install dependencies**:
   ```bash
   npm install
   ```
   *Note: A postinstall script will automatically install the required Chromium binaries for Puppeteer.*

3. **Set up Environment Variables**:
   Create a `.env.local` file in the root directory and add your MongoDB connection string:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```

5. **Open the Application**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works (Internal Architecture)

### 1. The Scraping Core (`src/lib/scraper.js`)
The scraper engine attempts to fetch the form data without launching a heavy browser first:
- **`scrapeWithFetch(url)`**: Downloads the form's HTML, uses Regex to find the `prefetchFormUrl`, `__RequestVerificationToken`, `correlationId`, and `sessionId`. It then calls the internal Microsoft API.
- **`scrapeWithPuppeteer(url)`**: If the fetch strategy fails (often due to timed forms or strict session requirements), Puppeteer is launched. It navigates to the page, clicks the "Start" button if it's a timed form, and intercepts the `/formapi/api/...` network response to capture the JSON payload.

### 2. Frontend Viewer (`src/app/scraper/[slug]/page.js`)
When a form is submitted for scraping, a unique `slug` is generated. The user is redirected to the results page which:
- Polls `/api/scraper/[slug]` every 3 seconds until the status changes from `processing` to `success` or `failed`.
- Renders the form metadata and a list of questions.
- Includes a real-time debug view of the "Scrape Steps" to see exactly what the backend is doing (e.g., launching browser, intercepting API, fallback success/fail).

## Database Schema Models

- **`ScrapeResult`**: Stores the slug, original URL, form title/description, array of extracted questions, raw API response, and the chronological scraping steps for debugging.
- **`GlobalErrorLog`**: Centralized logging for any failures during the scraping process to assist in monitoring and debugging edge cases in Microsoft Forms' updates.
