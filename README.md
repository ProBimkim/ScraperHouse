<p align="center">
  <img src="./public/logo.png" width="400" alt="ScraperHouse Logo" />
</p>

# ScraperHouse

A modern, high-performance web application built with Next.js that serves as a centralized suite for automated form extraction, media preservation, and real-time diagnostic monitoring. 

Currently, ScraperHouse features a dual-engine Microsoft Forms scraper, an automated Cloudinary & MongoDB dual-storage asset pipeline, one-click bulk image ZIP exporting, dashboard authentication, and an advanced Auto Debug Error Monitor.

---

## 🌟 Key Features

- **Centralized Dashboard & Auth**:
  - Modern glassmorphism-inspired user interface with smooth micro-interactions.
  - Cookie-based authentication protecting the scraper dashboard with `APP_PASSWORD`.
- **Microsoft Forms Scraper (Dual-Strategy)**:
  - **Strategy 1 (Fast Fetch)**: Extracts form metadata, `prefetchFormUrl`, and session verification tokens directly from HTML and Microsoft Form APIs for instantaneous scraping.
  - **Strategy 2 (Puppeteer Browser Fallback)**: Automatically activates a headless Chromium instance (`@sparticuz/chromium`) to solve dynamic challenges, timed forms, session cookies, and intercept internal `/formapi/api/...` network responses.
  - **Comprehensive Data Extraction**: Captures titles, descriptions, question types (single/multi-choice, text, ratings, etc.), question images, choice text, and choice images.
- **Dual-Storage Image Pipeline (Cloudinary + MongoDB)**:
  - **Primary Storage (Cloudinary CDN)**: Automatically downloads and streams extracted images into Cloudinary (`scraper/` folder) to provide permanent, high-speed, and secure HTTPS image links that never expire.
  - **Secondary Storage (MongoDB Fallback)**: If Cloudinary is unreachable or fails, images are automatically saved as binary buffers directly into MongoDB (`StoredImage` collection) and served through `/api/images/[slug]/[id]`.
  - **Frontend Resiliency (`FallbackImage`)**: Dynamically resolves images between Cloudinary, MongoDB, and original URLs if an asset cannot be loaded.
- **Bulk Image ZIP Exporter**:
  - Download all questions and choice images from a scraped form in one click via `JSZip` and `file-saver`.
  - Automatically sanitizes and renames files with intuitive naming conventions (e.g. `q1_gambar_soal.png`, `q1_opsi_A.png`).
  - Automatically strips Cloudinary version timestamps (`/v\d+/`) during download to guarantee fetching the latest uploaded image assets.
  - Uses a local image proxy route (`/api/proxy-image`) to bypass CORS and anti-hotlinking restrictions on external images.
- **Auto Debug Error Monitor (`/errors`)**:
  - Centralized error tracking and diagnostic view.
  - Logs failed scraping jobs (`GlobalErrorLog`), categorized by source (e.g. `ms-forms-fetch`, `ms-forms-puppeteer`, `api-validation`).
  - Displays full execution step traces, timestamps, error codes, and stack traces.
- **Proxy & Bandwidth Optimization**:
  - Rotating proxy support via `PROXY_LIST` for outgoing scraper `fetch` calls.
  - Randomized User-Agent headers to prevent basic bot detection.
  - **Intelligent Proxy Bypass**: Internal database queries and Cloudinary image uploads bypass proxies to conserve bandwidth and reduce latency.

---

## 🛠 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Styling**: Vanilla CSS (Custom Glassmorphism & responsive layouts)
- **Scraping Engine**: Puppeteer Core, `@sparticuz/chromium`, Native `fetch`
- **Database & Storage**: MongoDB (Mongoose), Cloudinary CDN (Image streaming)
- **Archiving**: `JSZip`, `file-saver`
- **Icons**: Lucide React

---

## ⚙️ Environment Variables Template

Create a `.env.local` file in the root directory and configure the variables below. 

> [!IMPORTANT]
> All credentials must be kept secret. Never commit your real `.env.local` file to version control.
> Replace all `xxxxxxxxx` placeholders with your actual service credentials.

```env
# ==============================================================================
# DATABASE CONFIGURATION
# ==============================================================================
# MongoDB connection URI (e.g. MongoDB Atlas or local MongoDB instance)
MONGODB_URI="mongodb+srv://xxxxxxxxx:xxxxxxxxx@xxxxxxxxx.mongodb.net/xxxxxxxxx?retryWrites=true&w=majority"

# ==============================================================================
# DASHBOARD AUTHENTICATION
# ==============================================================================
# Password required to log in to the dashboard and perform scraping actions
APP_PASSWORD="xxxxxxxxx"

# ==============================================================================
# CLOUDINARY MEDIA STORAGE (IMAGE ASSETS)
# ==============================================================================
# Cloudinary credentials for permanent asset storage & optimization
CLOUDINARY_CLOUD_NAME="xxxxxxxxx"
CLOUDINARY_API_KEY="xxxxxxxxx"
CLOUDINARY_API_SECRET="xxxxxxxxx"

# ==============================================================================
# PROXY CONFIGURATION (OPTIONAL)
# ==============================================================================
# Comma-separated list of HTTP/HTTPS rotating proxies for scraping requests
PROXY_LIST="http://xxxxxxxxx:xxxxxxxxx@xxxxxxxxx:xxxxxxxxx,http://xxxxxxxxx:xxxxxxxxx@xxxxxxxxx:xxxxxxxxx"
```

*(Note: Groq AI integration is deprecated/unused and does not need to be configured).*

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18.x or higher
- npm, yarn, or pnpm
- A MongoDB cluster or local instance
- A Cloudinary account (free tier works)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/ProBimkim/Scraper-deden.git
cd Scraper-deden
npm install
```
*Note: The postinstall hook will configure the necessary Chromium binaries for Puppeteer.*

### 3. Setup Environment
Copy or create `.env.local` in the project root:
```bash
cp .env.example .env.local   # or create .env.local manually
```
Fill in your credentials according to the template above.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```text
├── public/                     # Static public assets (logo, icons)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/     # Login verification & cookie management
│   │   │   ├── errors/         # Error monitoring endpoint
│   │   │   ├── history/        # Recent scraping jobs endpoint
│   │   │   ├── images/         # MongoDB fallback image server
│   │   │   ├── proxy-image/    # CORS bypass image proxy
│   │   │   ├── scrape/         # Scrape job execution trigger
│   │   │   └── scraper/[slug]/ # Real-time job status polling
│   │   ├── errors/             # Global Error Monitor dashboard UI
│   │   ├── login/              # Dashboard authentication UI
│   │   ├── ms-forms/           # Microsoft Forms scraper input page
│   │   ├── scraper/[slug]/     # Form results, search, & ZIP exporter UI
│   │   ├── globals.css         # Core CSS design system & tokens
│   │   ├── layout.js           # Root HTML layout
│   │   └── page.js             # Centralized dashboard home page
│   ├── components/             # Reusable UI components (Navbar, etc.)
│   ├── lib/
│   │   ├── cloudinary.js       # Cloudinary streaming upload & MongoDB fallback
│   │   ├── mongodb.js          # Cached Mongoose connection handler
│   │   └── scraper.js          # Core dual-strategy scraping engine
│   └── models/
│       ├── GlobalErrorLog.js   # Mongoose model for system errors
│       ├── ScrapeResult.js     # Mongoose model for extracted form questions
│       └── StoredImage.js      # Mongoose model for binary image fallback
├── package.json
└── README.md
```

---

## 🔄 How the Scraping System Works

```mermaid
flowchart TD
    A[User Submits Form URL] --> B{Strategy 1: Fast Fetch}
    B -- Token & Form Found --> C[Extract Metadata & Questions]
    B -- Fetch Fails / Dynamic Block --> D{Strategy 2: Puppeteer Chromium}
    D -- Intercept Network API --> C
    D -- Browser Error --> E[Log to GlobalErrorLog]
    
    C --> F[Image Processing Pipeline]
    F --> G{Upload to Cloudinary?}
    G -- Success --> H[Save Cloudinary CDN URL]
    G -- Failed / Network Error --> I[Fallback: Save Buffer to MongoDB StoredImage]
    
    H --> J[Save ScrapeResult Document]
    I --> J
    J --> K[Real-Time Frontend Poller: /scraper/slug]
    K --> L[Search & View Questions]
    K --> M[One-Click Bulk Download Images as ZIP]
```

---

## 🗄️ Database Models

1. **`ScrapeResult`**
   - Holds the unique job `slug`, original target `url`, form `title`, and `description`.
   - Stores the structured array of `questions` (with choices, correct answers if available, and image links).
   - Records status (`processing`, `success`, `failed`, `partial`) and chronological execution `steps` for debugging.
2. **`StoredImage`**
   - Fallback collection storing raw image binary buffers when Cloudinary upload is unavailable.
   - Served on-demand through `/api/images/[slug]/[imageKey]`.
3. **`GlobalErrorLog`**
   - Centralized logging collection recording failed scraping attempts with stack trace, originating module, and step diagnostic history.

---

## 📄 License & Maintainer

Maintained with ❤️ by **ProBimkim**.
Distributed under the MIT License.
