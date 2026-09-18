<p align="center">
  <img src="./public/logo.png" width="400" alt="ScraperHouse Logo" />
</p>

# ScraperHouse

A modern, high-performance web application built with Next.js that serves as a centralized intelligence and data extraction suite. 

ScraperHouse brings together **dual-engine Microsoft Forms scraping**, **Sherlock OSINT digital footprint investigations**, and **GitDiagram AI architectural visualization** into a unified, secure dashboard with automated Cloudinary & MongoDB dual-storage asset pipelines, one-click bulk image ZIP exporting, real-time diagnostic monitoring, and sleek glassmorphic Liquid Capsule UI components.

---

## 🌟 Key Features

### 1. 📋 Microsoft Forms Scraper (Dual-Strategy Engine)
- **Strategy 1 (Fast Fetch)**: Extracts form metadata, `prefetchFormUrl`, and session verification tokens directly from HTML and Microsoft Form APIs for instantaneous scraping without browser overhead.
- **Strategy 2 (Puppeteer Browser Fallback)**: Automatically activates a headless Chromium instance (`@sparticuz/chromium`) to solve dynamic challenges, timed forms, session cookies, and intercept internal `/formapi/api/...` network responses.
- **Comprehensive Data Extraction**: Captures titles, descriptions, question types (single/multi-choice, text, ratings, date, etc.), question images, choice text, and choice images.
- **Dual-Storage Image Pipeline (Cloudinary + MongoDB)**:
  - **Primary Storage (Cloudinary CDN)**: Automatically downloads and streams extracted images into Cloudinary (`scraper/` folder) to provide permanent, high-speed, and secure HTTPS image links that never expire.
  - **Secondary Storage (MongoDB Fallback)**: If Cloudinary is unreachable or fails, images are automatically saved as binary buffers directly into MongoDB (`StoredImage` collection) and served through `/api/images/[slug]/[id]`.
  - **Frontend Resiliency (`FallbackImage`)**: Dynamically resolves images between Cloudinary, MongoDB, and original URLs if an asset cannot be loaded.
- **Bulk Image ZIP Exporter**:
  - Download all questions and choice images from a scraped form in one click via `JSZip` and `file-saver`.
  - Automatically sanitizes and renames files with intuitive naming conventions (e.g., `question_1.jpg`, `question_1_opt_1.jpg`).
  - Automatically strips Cloudinary version timestamps (`/v\d+/`) during download to guarantee fetching the latest uploaded image assets.
  - Uses a local image proxy route (`/api/proxy-image`) to bypass CORS and anti-hotlinking restrictions on external images.

### 2. 🔍 Sherlock OSINT Username Hunter (`/sherlock`)
- **100% Native JavaScript Engine**: Fully integrated into Next.js App Router without requiring external Python daemons or binaries.
- **400+ Platforms & Social Networks**: Concurrently hunts usernames across GitHub, Twitter/X, Instagram, Reddit, TikTok, LinkedIn, YouTube, Steam, Spotify, and hundreds more.
- **Multi-Tier Detection**: Evaluates HTTP status codes, specific error response payloads, message fragments, and redirected URLs to eliminate false positives.
- **Category Filtering & Live Search**: Filter discovered accounts by category (Social, Coding & Tech, Gaming, Music & Media, Writing, Finance, etc.).
- **Live Real-Time Progress**: Live scanning status with animated progress bar, found/claimed counts, and response latency metrics.
- **Profile Inspector & History**: Detailed profile investigation page (`/sherlock/[id]`) with chronological search history persisted in MongoDB (`SherlockResult` collection).
- **One-Click Export**: Export discovered profiles and URLs to structured JSON or CSV format.

### 3. 🗺️ GitDiagram AI Architecture Visualizer (`/gitdiagram`)
- **Instant GitHub to Mermaid Diagram**: Transforms any public or private GitHub repository URL into an interactive, zoomable, and pannable Mermaid.js architectural graph.
- **Deep Code Inspection ("Mode Lebih Akurat")**: Automatically extracts and parses key project configuration files (`package.json`, `go.mod`, `Cargo.toml`, `requirements.txt`, `docker-compose.yml`) and core application entrypoints to map real services, routing, and data flow.
- **Powered by Groq AI**: Ultra-fast inference with Server-Sent Events (SSE) streaming. Supports dynamic model discovery with user-selectable models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`, etc.).
- **Vector SVG & PNG Export**: Export architecture graphs as vector SVG or high-resolution PNG, or copy raw Mermaid syntax with a single click.
- **Interactive Controls**: Zoom in/out, pan, reset view, and responsive SVG canvas viewport.

### 4. 🛡️ Auto Debug Error Monitor (`/errors`)
- **Centralized Diagnostic View**: Real-time error tracking and diagnostic logs categorized by source module (`ms-forms-fetch`, `ms-forms-puppeteer`, `api-validation`, `sherlock`, `gitdiagram`).
- **Full Trace History**: Displays chronological execution step traces, timestamps, error codes, and full stack traces.
- **Real-Time Badge Counter**: Displays live error counts directly in the header navigation badge.
- **Safe History Purging**: Clear error logs with confirmation modal to prevent accidental data loss.

### 5. 💧 Modern Liquid Capsule Confirmation Dialogs (`DeleteConfirmModal`)
- **3D Glassmorphism UI**: Custom modal featuring layered dimension shadows, subtle neon glows, and smooth spring animations.
- **Data Preview**: Displays detailed item metadata (title, slug, target URL, question count, and creation date) before confirmation.
- **Futuristic Action Buttons**: Styled with Liquid Capsule Button design tokens (`.btn-liquid-delete` and `.btn-liquid-cancel`).
- **Integrated Across Tools**: Protects deletions on `/ms-forms` history, `/scraper/[slug]` detail page, and `/errors` monitor.

### 6. 🧭 Streamlined Header & Dashboard Hub
- **Focused Header Navigation**: Minimalist, distraction-free header navigation displaying exclusively **Dashboard** and **Errors** (with active error badge counter).
- **Centralized Dashboard**: Quick-launch cards for Microsoft Forms, Sherlock OSINT, GitDiagram AI, and Error Monitor.
- **Consistent High-Contrast Aesthetics**: Pure white typography (`#ffffff`) for all page titles, section headings, and subtitles across the application.
- **Proxy & Bandwidth Optimization**: Rotating proxy support via `PROXY_LIST`, randomized User-Agents, and intelligent proxy bypass for database queries and Cloudinary uploads.

---

## 🛠 Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Styling**: Vanilla CSS (Custom Glassmorphism, Liquid Capsule 3D Buttons, Responsive Grid)
- **Scraping Engine**: Puppeteer Core, `@sparticuz/chromium`, Native `fetch` with AbortController
- **OSINT Engine**: Native JavaScript Sherlock scanner with 400+ platform definitions
- **AI & Diagram Engine**: Groq SDK (`llama-3.3-70b-versatile`), Mermaid.js, SVG-to-PNG Canvas
- **Database & Storage**: MongoDB (Mongoose), Cloudinary CDN (Direct streaming upload)
- **Archiving & Download**: `JSZip`, `file-saver`
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
# Password required to log in to the dashboard and perform operations
APP_PASSWORD="xxxxxxxxx"

# ==============================================================================
# CLOUDINARY MEDIA STORAGE (IMAGE ASSETS)
# ==============================================================================
# Cloudinary credentials for permanent asset storage & CDN optimization
CLOUDINARY_CLOUD_NAME="xxxxxxxxx"
CLOUDINARY_API_KEY="xxxxxxxxx"
CLOUDINARY_API_SECRET="xxxxxxxxx"

# ==============================================================================
# PROXY CONFIGURATION (OPTIONAL)
# ==============================================================================
# Comma-separated list of HTTP/HTTPS rotating proxies for scraping requests
PROXY_LIST="http://xxxxxxxxx:xxxxxxxxx@xxxxxxxxx:xxxxxxxxx,http://xxxxxxxxx:xxxxxxxxx@xxxxxxxxx:xxxxxxxxx"

# ==============================================================================
# GROQ AI CONFIGURATION (FOR GITDIAGRAM ARCHITECTURE VISUALIZER)
# ==============================================================================
# Groq API key used for real-time Mermaid architecture graph generation
GROQ_API_KEY="gsk_xxxxxxxxx"

# ==============================================================================
# GITHUB API CONFIGURATION (OPTIONAL)
# ==============================================================================
# GitHub Personal Access Token (increases API rate limit from 60 to 5,000 req/hour)
GITHUB_TOKEN="ghp_xxxxxxxxx"
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18.x or higher
- npm, yarn, or pnpm
- A MongoDB cluster or local instance
- A Cloudinary account (free tier works)
- *(Optional)* A Groq API key (for GitDiagram AI generation)
- *(Optional)* A GitHub personal access token (for higher GitHub API limits)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/ProBimkim/ScraperHouse.git
cd ScraperHouse
npm install
```
*Note: The postinstall hook will configure the necessary Chromium binaries for Puppeteer.*

### 3. Setup Environment
Copy `.env.example` to `.env.local` in the project root:
```bash
cp .env.example .env.local
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
├── public/                         # Static public assets (logo, icons)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/         # Login verification & cookie management
│   │   │   ├── errors/             # Error monitoring endpoint
│   │   │   ├── gitdiagram/         # GitDiagram SSE diagram generator endpoint
│   │   │   ├── history/            # Recent scraping jobs endpoint
│   │   │   ├── images/             # MongoDB fallback image server
│   │   │   ├── proxy-image/        # CORS bypass image proxy
│   │   │   ├── scrape/             # Scrape job execution trigger
│   │   │   ├── scraper/[slug]/     # Real-time job status polling
│   │   │   └── sherlock/           # Sherlock OSINT hunt & history endpoints
│   │   ├── errors/                 # Global Error Monitor dashboard UI
│   │   ├── gitdiagram/             # GitDiagram AI architecture visualizer UI
│   │   ├── login/                  # Dashboard authentication UI
│   │   ├── ms-forms/               # Microsoft Forms scraper input page
│   │   ├── scraper/[slug]/         # Form results, search, & ZIP exporter UI
│   │   ├── sherlock/               # Sherlock OSINT scanner & profile inspector
│   │   ├── globals.css             # Core CSS design system, white typography & tokens
│   │   ├── layout.js               # Root HTML layout
│   │   └── page.js                 # Centralized dashboard hub
│   ├── components/                 # Reusable UI components (Navbar, DeleteConfirmModal)
│   ├── lib/
│   │   ├── cloudinary.js           # Cloudinary streaming upload & MongoDB fallback
│   │   ├── diagramGenerator.js     # Mermaid graph parsing & validation
│   │   ├── github.js               # GitHub repository fetcher & deep code inspector
│   │   ├── groqAgent.js            # Groq AI model client & streaming prompt builder
│   │   ├── mongodb.js              # Cached Mongoose connection handler
│   │   ├── scraper.js              # Core dual-strategy scraping engine
│   │   ├── sherlock_data.json      # 400+ OSINT site target configurations
│   │   └── sherlockEngine.js       # Native JS concurrent username scanner
│   └── models/
│       ├── GlobalErrorLog.js       # Mongoose model for system errors
│       ├── ScrapeResult.js         # Mongoose model for extracted form questions
│       ├── SherlockResult.js       # Mongoose model for OSINT hunt records
│       └── StoredImage.js          # Mongoose model for binary image fallback
├── package.json
└── README.md
```

---

## 🔄 System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Client (Next.js)"]
        Dash["/ Central Dashboard"]
        Nav["Navbar (Dashboard & Errors Only)"]
        MSF["/ms-forms Scraper"]
        SHL["/sherlock OSINT Hunter"]
        GDG["/gitdiagram Visualizer"]
        ERR["/errors Error Monitor"]
        MOD["DeleteConfirmModal (Liquid Capsule)"]
    end

    subgraph MSFormsEngine["MS Forms Extraction Engine"]
        F1{Strategy 1: Fast Fetch} -->|Success| EXT[Extract Metadata & Questions]
        F1 -->|Fails / Dynamic Block| F2{Strategy 2: Puppeteer Chromium}
        F2 -->|Intercept Form API| EXT
        F2 -->|Browser Error| LOG1[GlobalErrorLog]
        EXT --> IMG[Image Pipeline]
        IMG -->|Upload| CLD[Cloudinary CDN]
        IMG -->|Fallback| MIMG[MongoDB StoredImage]
        EXT --> SRES[Save ScrapeResult]
    end

    subgraph SherlockEngine["Sherlock OSINT Engine (100% JS)"]
        SH_IN[Username Input] --> S_PARSE[Load 400+ Site Signatures]
        S_PARSE --> S_FETCH[Concurrent HTTP Checks]
        S_FETCH --> S_EVAL{Evaluate Status & Payload}
        S_EVAL -->|Claimed| S_FOUND[Found Profile URL]
        S_EVAL -->|Available/Error| S_SKIP[Skip/Log]
        S_FOUND --> S_DB[Save SherlockResult]
    end

    subgraph GitDiagramEngine["GitDiagram AI Visualizer"]
        GH_URL[GitHub Repo URL] --> GH_API[Fetch File Tree & Configs]
        GH_API -->|Deep Inspection| GH_CODE[Parse package.json, go.mod, entrypoints]
        GH_CODE --> GROQ[Groq AI SSE Stream: llama-3.3-70b]
        GROQ --> MERMAID[Interactive Mermaid Graph Render]
        MERMAID --> EXP[Export SVG / PNG / Syntax]
    end

    MSF --> MSFormsEngine
    SHL --> SherlockEngine
    GDG --> GitDiagramEngine
    ERR --> LOG1
```

---

## 🗄️ Database Collections

1. **`ScrapeResult`**
   - Holds the unique job `slug`, original target `url`, form `title`, and `description`.
   - Stores the structured array of `questions` (with choices, correct answers if available, and image links).
   - Records status (`processing`, `success`, `failed`, `partial`) and chronological execution `steps` for debugging.
2. **`StoredImage`**
   - Fallback collection storing raw image binary buffers when Cloudinary upload is unavailable.
   - Served on-demand through `/api/images/[slug]/[imageKey]`.
3. **`SherlockResult`**
   - Records completed OSINT username scans with timestamp, duration, total platforms checked, and an array of verified profile findings (site name, URL, category, response time).
4. **`GlobalErrorLog`**
   - Centralized logging collection recording failed operations with stack trace, originating module, and step diagnostic history.

---

## 📄 License & Maintainer

Maintained with ❤️ by **ProBimkim**.  
Distributed under the MIT License.
