<p align="center">
  <img src="./public/logo.png" width="400" alt="ScraperHouse Logo" />
</p>

# ScraperHouse

A modern, robust web application built with Next.js that serves as a central dashboard for data extraction tools and monitoring. Currently, ScraperHouse features a powerful Microsoft Forms scraper and an advanced Auto Debug Error Monitor.

## Features

- **Centralized Dashboard**: A clean, glassmorphism-inspired UI featuring quick access to all available tools.
- **Microsoft Forms Scraper**:
  - **Dual-Strategy Extraction**: 
    - *Fast Fetch*: Attempts to extract `prefetchFormUrl` and internal verification tokens directly from HTML for lightning-fast scraping.
    - *Puppeteer Fallback*: Uses a headless browser (`@sparticuz/chromium`) to intercept API requests when forms require complex session handling, cookies, or start buttons for timed forms.
  - **Comprehensive Data Extraction**: Extracts titles, descriptions, and all question types along with their embedded images and choices (including choice images).
- **Auto Debug Error Monitor**: 
  - A dedicated view (`/errors`) to track, filter, and analyze failed scraping attempts.
  - Groups errors by source and provides detailed diagnostic explanations and full step-by-step traces for easy debugging.
- **Real-time Status Polling**: The frontend constantly polls the API to display the real-time processing status of scraping jobs.
- **Proxy & User-Agent Rotation**:
  - Implements randomized User-Agent rotation for all requests to bypass simple bot detection.
  - Supports rotating proxies via the `PROXY_LIST` environment variable for native `fetch` requests (Puppeteer runs without proxies due to HTTPS CONNECT limitations on free tiers).
- **MongoDB Integration**: Stores all scraped results and global error logs persistently using Mongoose.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Frontend**: React 19, Vanilla CSS (Custom Glassmorphism styling)
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
   Create a `.env.local` file in the root directory and add your MongoDB connection string and optional proxy list:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   # Optional: Comma-separated list of proxies for rotation (HTTP/HTTPS)
   PROXY_LIST="http://user:pass@ip:port, http://user2:pass2@ip2:port2"
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```

5. **Open the Application**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works (Internal Architecture)

### 1. Microsoft Forms Engine (`src/lib/scraper.js`)
The scraper engine attempts to fetch the form data without launching a heavy browser first:
- **`scrapeWithFetch(url)`**: Downloads the form's HTML, uses Regex to find internal tokens, and calls the internal Microsoft API.
- **`scrapeWithPuppeteer(url)`**: If the fetch strategy fails, Puppeteer is launched. It navigates to the page and intercepts the `/formapi/api/...` network response to capture the JSON payload.

### 2. Frontend Viewer (`src/app/scraper/[slug]/page.js`)
When a form is submitted for scraping, a unique `slug` (based on a base36 timestamp) is generated. The user is redirected to the results page which:
- Polls the API every 3 seconds until the status changes from `processing` to `success` or `failed`.
- Renders the form metadata and a list of questions (with image support).
- Includes a real-time debug view of the "Scrape Steps" to see exactly what the backend is doing.

## Database Schema Models

- **`ScrapeResult`**: Stores the slug, original URL, form title/description, array of extracted questions (and images), raw API response, and the chronological scraping steps for debugging.
- **`GlobalErrorLog`**: Centralized logging for failures during the scraping process. Includes source filtering, stack traces, and detailed diagnostic step traces to assist in monitoring edge cases.
