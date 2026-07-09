# SuperTube Pivot Plan: Chrome Extension + Supermemory Local

## Goal
Build **SuperTube** — a Chrome extension that acts as an AI-powered personal memory layer for YouTube, using **Supermemory Local** (running on the user's machine at `localhost:6767`) as the backend.

This pivot ensures full compliance with the **Localhost:6767 Hackathon** rules while keeping the original vision.

## Why This Pivot?
- Satisfies "must meaningfully use Supermemory Local"
- Privacy-first, fully local data flow
- Leverages Chrome + Gemini Nano for seamless YouTube integration
- Achievable in 5-day hackathon window

## Architecture Overview

### Components
1. **Supermemory Local** (user runs this)
   - `npx supermemory local` or install script
   - Runs on `http://localhost:6767`

2. **Chrome Extension** (core)
   - Content script: Monitors YouTube watch sessions
   - Gemini Nano (local AI): Decides if video is worth remembering
   - Background service worker: Handles API calls to local Supermemory
   - Popup / Side panel: Quick memory actions

3. **Memory Workspace** (UI)
   - Simple web app (Next.js or vanilla) running locally
   - Or embedded as extension popup/new tab page
   - Search, recommendations, revisit videos

## Data Flow
1. User watches YouTube video
2. Extension detects meaningful watch % + grabs title, description, transcript, channel
3. Gemini Nano evaluates value locally
4. If valuable → send enriched memory to `http://localhost:6767`
5. User opens workspace → queries local Supermemory for search / AI recommendations

## Technical Implementation Notes

### Manifest (manifest.json)
```json
{
  "manifest_version": 3,
  "name": "SuperTube",
  "version": "1.0",
  "permissions": ["tabs", "storage", "activeTab"],
  "host_permissions": [
    "https://*.youtube.com/*",
    "http://localhost:6767/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["https://*.youtube.com/*"],
    "js": ["content.js"]
  }],
  "action": {
    "default_popup": "popup.html"
  }
}