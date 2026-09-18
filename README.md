# Persona Architect

Persona Architect is a React web app for building a personal reference file for AI agents and digital twins. It combines Gemini-powered chat, file analysis, Google Drive imports, and a real-time voice interview to continuously build and refine a Markdown **Master Reference Document** containing a user's traits, preferences, history, and goals.

> **Status:** Early-stage prototype. Review generated content before using it as an agent reference file, and do not upload sensitive information unless you understand how it is processed by the configured APIs.

## Features

- **Gemini chat agent** using `gemini-3.1-pro-preview` with high-level thinking enabled.
- **Structured document updates** through Gemini function calling with the `updateMasterDocument` tool.
- **Live voice interviews** powered by `gemini-3.1-flash-live-preview`.
- **Live audio transcription** with microphone input, agent audio responses, and an audio visualizer.
- **Local file attachments** for text, PDFs, JSON, and images supported by the Gemini API.
- **Google Drive integration** with OAuth, multi-select file/folder picking, folder expansion, and Google Workspace export handling.
- **Markdown preview and export** with copy-to-clipboard and `Master_Reference_Document.md` download actions.

## How it works

1. Start the app and dismiss the onboarding guide.
2. Import source material using the paperclip button, or select files and folders from Google Drive.
3. Chat with the Architect Agent about your background, preferences, goals, and working style.
4. Optionally start a **Live Interview** to answer conversational questions by voice.
5. The agent uses the `updateMasterDocument` function to update the Markdown document shown in the right-hand panel.
6. Copy the document or export it as `Master_Reference_Document.md`.

## Tech stack

- TypeScript
- React 19
- Vite 6
- Google GenAI JavaScript SDK
- Gemini 3.1 Pro and Gemini Live API
- Google Drive Picker and Google Identity Services
- React Markdown with GitHub-Flavored Markdown support
- Tailwind CSS via the CDN in `index.html`

## Requirements

- Node.js 18+ recommended
- A Gemini API key with access to the configured Gemini models
- For Google Drive features:
  - A Google Cloud project
  - Google Drive API and Google Picker API enabled
  - OAuth client configuration for the app's origin
  - A browser that supports microphone access for Live Interview

## Getting started

Clone the repository and install dependencies:

```bash
git clone https://github.com/geminidev102000-collab/Persona-Architect.git
cd Persona-Architect
npm install
```

Create a `.env.local` file in the project root:

```dotenv
GEMINI_API_KEY=your_gemini_api_key

# Required only for Google Drive integration
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_API_KEY=your_google_api_key
GOOGLE_APP_ID=your_google_cloud_app_id
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The Vite configuration binds the development server to `0.0.0.0` on port `3000`. The Gemini key is read from `GEMINI_API_KEY`; Google Drive configuration is optional, and Drive controls remain unavailable when its variables are missing.

## Available scripts

```bash
npm run dev       # Start the Vite development server
npm run build     # Create a production build in dist/
npm run preview   # Preview the production build locally
```

There is currently no test script configured in `package.json`.

## Project structure

```text
.
├── App.tsx                  # Main split-pane layout and live-session handoff
├── index.tsx                # React entry point
├── index.html               # HTML shell, CDN scripts, and Google API scripts
├── types.ts                 # Chat, attachment, document, and Live API types
├── components/
│   ├── ChatInterface.tsx    # Chat UI, uploads, Drive picker, and tool-call handling
│   ├── DocumentViewer.tsx   # Markdown rendering, copy, and export
│   └── LiveSession.tsx      # Live voice interview modal and visualizer
├── services/
│   ├── geminiService.ts     # Gemini chat, function calling, and Live API client
│   ├── driveService.ts      # Google OAuth, Picker, folder expansion, and downloads
│   └── audioUtils.ts        # PCM/base64 conversion and audio decoding helpers
├── metadata.json            # App metadata and requested permissions
├── migrated_prompt_history/ # Historical prompt-generation data
├── package.json             # Scripts and dependencies
├── tsconfig.json            # TypeScript compiler configuration
└── vite.config.ts           # Vite server, React plugin, aliases, and env mapping
```

## Configuration notes

### Gemini

`services/geminiService.ts` initializes the Google GenAI client from `GEMINI_API_KEY` and creates a chat session with the `gemini-3.1-pro-preview` model. The agent is instructed to maintain a comprehensive Markdown document and call `updateMasterDocument` whenever it has meaningful new information.

The Live Interview uses `gemini-3.1-flash-live-preview`, browser microphone access, PCM audio input at 16 kHz, and audio output at 24 kHz.

### Google Drive

The Drive integration requests the read-only scope:

```text
https://www.googleapis.com/auth/drive.readonly
```

It can import regular text files, PDFs, JSON, CSV, and supported image formats. Google Docs, Sheets, and Slides are exported to text or CSV before being attached to the Gemini request. Selected folders are expanded recursively.

When deploying, add the deployed origin to the relevant Google OAuth and API configuration. Do not commit `.env.local` or expose unrestricted production credentials.

## Privacy and security

- Treat uploaded files, Drive imports, voice transcripts, and generated documents as sensitive personal data.
- The current frontend passes API configuration into the browser bundle through Vite's `define` configuration. Use appropriately restricted keys and configure API restrictions for your deployment.
- Review Google OAuth consent-screen settings and authorized JavaScript origins before enabling Drive access.
- The generated document is held in the app's runtime state and can be copied or downloaded; no persistence layer is included in this repository.
- Gemini output can be inaccurate. Verify inferred traits and generated recommendations before sharing or using the document.

## Troubleshooting

### Gemini requests fail

- Confirm `GEMINI_API_KEY` is present in `.env.local`.
- Restart the Vite server after changing environment variables.
- Verify the key has access to the models configured in `services/geminiService.ts`.

### Google Drive is unavailable

- Confirm all three Drive variables are set: `GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`, and `GOOGLE_APP_ID`.
- Enable the required Google APIs and authorize `http://localhost:3000` or your deployed origin.
- Allow pop-ups and verify that the OAuth consent flow is not blocked.

### Live Interview cannot connect

- Grant microphone permission to the browser.
- Use HTTPS in deployed environments.
- Check the browser console for microphone, Web Audio, or Live API errors.

## Contributing

Contributions are welcome. Before opening a pull request:

1. Run `npm run build`.
2. Test chat, file upload, document updates, Drive import, and Live Interview flows when applicable.
3. Do not include API keys, OAuth secrets, personal documents, or recorded transcripts in commits.

## License

No license has been specified yet. Add a license before distributing or reusing this project outside the repository.
