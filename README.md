# BackDoor AI 🎯 — Real-Time Desktop Interview Co-Pilot

<div align="center">

**A privacy-first, ultra-low-latency cross-platform desktop interview companion and mock simulation studio.**

[![Tauri](https://img.shields.io/badge/Tauri-v2-blue?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/React-18-cyan?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Qdrant](https://img.shields.io/badge/VectorDB-Qdrant-red?style=flat-square&logo=qdrant&logoColor=white)](https://qdrant.tech)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square)](https://github.com/marotiuppe/BackDoor-AI)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/marotiuppe/BackDoor-AI/total?style=flat-square&logo=github&color=blue)](https://github.com/marotiuppe/BackDoor-AI/releases)

</div>

---

**BackDoor AI** is an augmented reference utility that operates silently in the background during live meetings. It intercepts conversational audio and screen context, performs instant semantic extraction, and delivers talking points, code frameworks, and behavioral answers to a stealthy, webcam-aligned HUD overlay.

---

## 💾 Instant Download & Installation (Cross-Platform)

| Platform | Package Format | Direct Download Link |
| :--- | :--- | :--- |
| 🪟 **Windows** | NSIS Installer (`.exe`) | [**⬇️ Get Latest Windows Installer**](https://github.com/marotiuppe/BackDoor-AI/releases/latest) |
| 🍏 **macOS** | Universal Bundle (`.dmg`) | [**⬇️ Get Latest macOS Installer**](https://github.com/marotiuppe/BackDoor-AI/releases/latest) |
| 🐧 **Linux** | Debian Package (`.deb`) | [**⬇️ Get Latest Linux Installer**](https://github.com/marotiuppe/BackDoor-AI/releases/latest) |

---

## 📑 User Guide Table of Contents
1. [✨ Core Features & Capabilities](#-core-features--capabilities)
2. [🔑 Setup Guide: Configuring API Credentials](#-setup-guide-configuring-api-credentials)
3. [💡 How to Use BackDoor AI During an Interview](#-how-to-use-backdoor-ai-during-an-interview)
4. [⌨️ Global Keyboard Shortcuts Matrix](#️-global-keyboard-shortcuts-matrix)
5. [🖥️ Stealth HUD & Screen-Sharing Protection](#️-stealth-hud--screen-sharing-protection)
6. [🚀 How to Setup, Run & Build (Developers)](#-how-to-setup-run--build-developers)
7. [🛠️ Troubleshooting & FAQ](#️-troubleshooting--faq)

---

## ✨ Core Features & Capabilities

*   🎙️ **Real-Time Voice Assistant**: Captures interviewer questions from Zoom/Teams/Meet system audio (Loopback) and your mic stream, transcribing dialogue and suggesting talking points instantly.
*   🖥️ **Stealth HUD Overlay**: Displays generated answers on a customizable, borderless, semi-transparent HUD window that floats over your screen.
*   📁 **Drag & Drop Knowledge Base**: Ingest resumes, job descriptions, PDFs, and coding cheat sheets. BackDoor AI searches this local data in real time to tailor its answers specifically to your profile and documentation.
*   📂 **Persistent Sessions & Auto-RAG**: HUD overlay rounds prompt for an interview name on start. All dialogue turns are saved to SQLite and compiled transcripts are dynamically indexed into Qdrant/SQLite RAG in real-time, making them queryable later.
*   🎭 **Mock Interview Studio**: Practice offline with simulated technical, behavioral, and design interview tracks. Get radar scorecards, structure analysis, and feedback on your performance.
*   🦙 **Offline Local LLMs (Ollama)**: Full offline compatibility running models like LLaMA 3, Mistral, Qwen, and Phi-3 locally on your GPU/CPU with dynamic local model discovery.
*   🪵 **Hidden Consoles & Dedicated Logging**: Sidecar command prompts (Ollama, Qdrant) run silently without spawning command prompt windows, writing clean, separate log files directly to AppData logs.

---

## 🔑 Setup & Configuration Guide

You can run BackDoor AI in cloud mode (API keys) or 100% locally:

*   **Offline Mode (No API Keys)**: **Local Ollama Integration**. The Rust backend automatically launches Ollama, prevents port collisions by stopping tray app conflicts, and terminates it when you close the app.
*   **Cloud Mode (API Keys)**: Uses Groq (Whisper STT/fast LLaMA), Gemini (chat & vision), Anthropic Claude, or OpenAI GPT models.

| Provider | Role | Default Active Model | Setup Details |
| :--- | :--- | :--- | :--- |
| **Local Ollama** | 📴 100% Offline Chat & Reasoning | `gemma4:31b-cloud` | Runs at `http://127.0.0.1:11434` (configurable). Auto-detects local pulled models. |
| **Groq** | 🎙️ Audio Transcription + Fast Chat | `llama-3.3-70b-versatile` (Chat) / `whisper-large-v3-turbo` (STT) | Secure DPAPI key storage. [Get Groq Key](https://console.groq.com/keys) |
| **Google Gemini** | 💬 Chat Reasoning + Screen Vision | `gemini-3.7-flash` | Secure DPAPI key storage. [Get Gemini Key](https://aistudio.google.com/apikey) |
| **Anthropic** | 🧠 Deep Technical Reasoning | `claude-sonnet-5` (or `claude-3-5-sonnet-20241022`) | Secure DPAPI key storage. [Get Anthropic Key](https://console.anthropic.com/) |
| **OpenAI** | 💬 Chat & Reasoning | `gpt-5.4` (or `gpt-4o`) | Secure DPAPI key storage. [Get OpenAI Key](https://platform.openai.com/api-keys) |

### How to Configure Credentials & Host URLs:
1. Open BackDoor AI and click **Profile & Settings** (the settings gear icon).
2. Choose your preferred AI provider. If using Ollama, input your Ollama Host URL (defaults to local server). If using a cloud provider, paste your API key.
3. Click **Save & Test Connection**.
4. *Security Note: API keys are securely encrypted using Windows DPAPI and stored inside your Windows Credential Manager under the service name `BackDoorAI`. Local Host URLs are cached on disk. API keys are never transmitted to third parties.*

---

## 🚀 First-Time Launch Onboarding & Interactive Tour

To guide you through your first boot, BackDoor AI features an immersive setup wizard and a detailed UI guide:

1. **Step 1: Welcome & Value Prop**: Introduces the tool's stealth features and core concepts.
2. **Step 2: Credentials & Local Connection Check**: Polls local Ollama connection in real-time. Allows configuring cloud API keys or skipping directly to offline Local Ollama.
3. **Step 3: Dependency Diagnostics**: Runs health checks on critical subsystems (Qdrant Vector DB, local Ollama server, system microphone capture, and GDI screen capturing capability).
4. **Step 4: Resume Auto-Profiling**: Upload a resume (PDF/TXT/Markdown) to parse and extract your candidate profile (Bio, Role, Skills, Projects) using the AI provider, or skip to enter details manually.
5. **Step 5: Interactive UI Tour**: Highlights critical controls (Stealth HUD Toggle, Mock Studio, Settings, New Chat, Capture Controls) using a focused spotlight overlay, teaching you exactly where everything is on your dashboard.

---

## 🔒 Secure Local Access PIN Gate

To protect your candidate identity, saved API credentials, and sensitive interview session history, BackDoor AI features a secure offline authentication gate:

1. **First-Time Setup (PIN Creation)**: On the initial boot of the application, you will be guided to set up a secure 4-to-8 digit master passcode.
2. **Subsequent Boots (Workspace Locking)**: Every next time the app opens, it launches in a locked state behind a modern glassmorphic PIN entry screen. You must type your secret passcode to unlock your dashboard and access the co-pilot.
3. **100% Offline & Private**: Your passcode hash is stored completely locally on disk and evaluated locally. No authentication payloads or credential data ever leave your machine.

---

## 💡 How to Use BackDoor AI During an Interview

Follow these steps for a successful setup:

```
Step 1: Complete the Onboarding Wizard (or edit your profile in Settings).
Step 2: Drag and drop preparation docs (PDF/Markdown) into the Knowledge base.
Step 3: Press [ Alt + I ] to toggle the Stealth HUD Overlay window.
Step 4: Position the HUD window right below your webcam lens.
Step 5: Start your video meeting. The HUD is automatically invisible to Zoom/Teams capture.
Step 6: Use [ Alt + Q ] (Answer Audio) or [ Alt + S ] (Solve Code) to stream real-time guidance.
```

---

## ⌨️ Global Keyboard Shortcuts Matrix

These keyboard shortcuts are active system-wide and do not steal focus from your code editor or meeting window:

| Hotkey | Action | Description |
| :--- | :--- | :--- |
| **`Alt + Shift + W`** | **Toggle Assistant Workspace** | Shows or hides the main workspace dashboard window (runs covertly off the taskbar). |
| **`Alt + I`** | **Toggle HUD Overlay** | Shows or hides the floating HUD overlay window. |
| **`Alt + Q`** | **Quick Answer** | Processes the captured audio transcription and generates structured talking points. |
| **`Alt + S`** | **Solve Screen Code** | Captures active screen area (CoderPad/IDE), runs OCR, and extracts solutions or complex complexity analysis. |
| **`Alt + H`** | **Cycle Ghost Mode** | Cycles HUD transparency: **Solid (100%)**, **Glass (78%)**, **Ghost (35%)** to stay covert. |
| **`Alt + C`** | **Clear Output** | Clears the current transcript and viewport contents on the HUD. |

---

## 🖥️ Stealth HUD & Screen-Sharing Protection

*   **Capture Exclusion**: BackDoor AI applies `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` to the HUD window. When sharing your screen in Zoom, Teams, Google Meet, or Discord, your viewers see only the wallpaper or window behind the HUD.
*   **Stealth Mouse Cursor**: The cursor remains standard (`cursor: default`) when passing over transparent HUD regions, avoiding hover animations that might give away the overlay's presence.
*   **Camera Eyeline Centering**: Position the HUD immediately below your physical webcam. Reading bullet points horizontally centered within a 15-degree angle ensures you maintain direct, natural eye contact with the interviewer.

---

## 📁 Persistent Sessions & Auto-RAG Indexing

BackDoor AI automatically records all activities that occur during your HUD Overlay co-pilot sessions to ensure you can review, analyze, or summarize your interview performance later:

*   **Startup Interview Naming**: When you launch the HUD Overlay, a premium glassmorphic modal prompts you for the session name or purpose (e.g. *Google Frontend Interview*, *Java Tech Round*). You can choose to skip, which defaults to a timestamp.
*   **Automatic Workspace Sync**: Every turn (captured user/interviewer question and generated co-pilot answer) is recorded in real-time in SQLite. This session will automatically appear in your main workspace chat history, allowing you to review it, delete it, or continue the chat.
*   **Real-Time Vector DB / RAG Sync**: When an interview turn finishes, BackDoor AI compiles the entire interview session history into a Markdown transcript and indexes it in your local vector database (Qdrant + SQLite RAG).
*   **Post-Interview Revision**: Since transcripts are indexed in the RAG store, you can open the main workspace chat later and simply ask: *"What questions did I face in Google Frontend Interview?"* or *"Summarize the Meta Mock Tech Screen performance,"* and the RAG pipeline will retrieve and summarize the transcript.

---

## 🪵 Diagnostic & Background Process Logging

To maintain a stealthy presence, all background command consoles for sidecar binaries are completely hidden. Their standard outputs are routed to a platform-specific logs directory:

*   **Logs Location**:
    - **Windows**: `%LOCALAPPDATA%\com.backdoor.desktop\logs\`
    - **macOS**: `~/Library/Application Support/com.backdoor.desktop/logs/`
    - **Linux**: `~/.local/share/com.backdoor.desktop/logs/`
*   **`app.log`**: Standard stdout and stderr logs generated by the main Rust desktop application.
*   **`ollama.log`**: Server activity logs generated by the local background `ollama serve` instance.
*   **`qdrant.log`**: Database logs generated by the running local Qdrant vector database sidecar.
*   **`backdoor_panic.log`**: Detailed call-stack panic dumps in the event of an application crash.

---

## 🧠 XML-Structured Prompts & Output Hardening

To ensure stable responses across both local offline LLMs and cloud frontier engines, the prompt orchestration layer has been completely standardized:

*   **XML Border Guarding**: Candidate profile details, STAR stories, loopback transcripts, and RAG knowledge snippets are partitioned within explicit XML elements (e.g. `<candidate_profile>`, `<star_matrix>`, `<reference_documents>`, `<active_context>`). This forces the models to distinguish reference documents from personal experience, preventing hallucinations.
*   **Markdown Bypass & JSON Hardening**: Custom prompt definitions instruct the models to bypass conversational preamble/postamble and output raw content. For HUD "raw" mode operations and **Mock Interview Studio** evaluations, strict JSON constraints and validation rules prevent models from wrapping responses in markdown code blocks (like ```json).

---

## 🚀 How to Setup, Run & Build (Developers)

Developers who wish to compile from source or run the app in development mode should refer to our detailed developer specification document:

> [!NOTE]
> 🛠️ **Developer Specifications**: Full system architecture, SQLite schemas, local Qdrant RAG pipeline details, and directory mappings are available in **[TECHNICAL_DETAILS.md](./TECHNICAL_DETAILS.md)**.

### Setup & Development Guide:
Ensure you have [Node.js](https://nodejs.org/) and the [Rust Toolchain](https://www.rust-lang.org/tools/install) installed, then execute the following steps:

```bash
# 1. Clone the repository and navigate into the root directory
git clone https://github.com/Dheerajdvn/BackDoor-AI.git
cd BackDoor-AI

# 2. Install frontend dependencies and run the production build
cd backdoor-ai-ui
npm install
npm run build
cd ..

# 3. Install backend dependencies and launch dev environment
cd backdoor-ai-be
npm install
npm run tauri dev
```

### Building the Production Installer:
To package the application into a production installer for your host operating system, run the build script from the backend folder:

```bash
cd backdoor-ai-be
npm run build
```
This build script will automatically compile the frontend UI, build the Tauri native container for the host platform, and copy the final installer executable (e.g. `.exe`, `.dmg`, or `.deb`) to the target build output directory.

#### CI/CD Auto-Release:
The repository includes a GitHub Actions workflow at `.github/workflows/release.yml` that automatically builds release binaries for Windows, macOS (Universal), and Linux whenever a tag prefixed with `v` (e.g. `v1.0.3`) is pushed to GitHub.
---

## 🛠️ Troubleshooting & FAQ

### Q: Why is the HUD invisible when I share my screen?
> **A:** This is by design! Hardware capture exclusion (`WDA_EXCLUDEFROMCAPTURE`) is enabled by default so interviewers cannot see the co-pilot. To make it visible for testing, toggle the **Stealth / Visible** mode in the HUD header.

### Q: Why did the LLM return an HTTP 404 model error?
> **A:** Ensure your saved API key has permission for the selected model. If a model was deprecated, BackDoor AI automatically routes requests to active frontier versions like `gemini-3.7-flash` or `llama-3.3-70b-versatile`.

### Q: How do I verify if Windows Native OCR Language Pack is installed?
> **A:** Open PowerShell as Administrator and run:
> `Get-WindowsCapability -Online | Where-Object Name -like "*Language.OCR*en-US*"`
> If `State` is `NotPresent`, install it by running: `Add-WindowsCapability -Online -Name "Language.OCR~~~en-US~0.0.1.0"`.

---

*BackDoor AI — Level the hiring playing field with real-time desktop intelligence.*
