# AI planning

Hibi now includes a local Node backend and an OpenAI planning adapter. No API key is bundled, and no AI response is fabricated when the provider is unconfigured.

## Connect OpenAI

1. Open `.env` in VS Code. If it does not exist, copy `.env.example` to `.env`.
2. Put your API key after `OPENAI_API_KEY=`. Do not paste the key into chat, browser code, or Git.
3. Optionally change `OPENAI_MODEL` and `OPENAI_TRANSCRIPTION_MODEL` to models available to your API account. Defaults are `gpt-5-mini` and `gpt-transcribe`.
4. Restart `npm run dev`. Open Hibi and choose **Plan with AI**.

The frontend only receives configured/not-configured status and the model name. The API key is used exclusively by the server. A configured key has not necessarily been validated by OpenAI until a request succeeds. API usage can incur charges under your API account.

## Create and review a plan

Paste one or more messages/notes, attach documents, and optionally record a thought. Choose a target project and describe the outcome you want. Select **Create a plan** to send the selected sources to OpenAI.

Hibi produces a draft summary, assumptions, questions, and actionable steps. Every step links back to named sources. Edit titles, timing, priority, notes, checklists, and suggested deadlines; deselect anything you do not want. **Add selected tasks** is the only action that adds suggestions to your planner. File and message contents are not automatically turned into tasks.

The model is instructed to merge duplicates, preserve supported deadlines, identify uncertainty, and treat instructions embedded in source documents as untrusted material. Dates are anchored to the server's current Africa/Lagos date. Source citations and structured output are validated on the server, but they do not guarantee the model's interpretation is correct: review the draft.

## Sources and limits

- Documents: PDF, DOCX, TXT, MD, CSV, and JSON.
- Audio: MP3, M4A, MP4, WAV, WebM, and MPEG. Recordings made in Hibi stay in memory until submitted.
- Up to eight files, 8 MB per file, 12 MB total; pasted text up to 60,000 characters; plain text files up to 100 KB each.
- In-app recording stops after three minutes. Microphone permission, a supported recorder, and a secure browser context are required.
- Audio is transcribed first, then its transcript is used as a source for the plan.
- WhatsApp OGG/Opus attachments are not supported by this first version. Convert them to MP3/M4A or record directly in Hibi.

There is no background document indexing, OCR pipeline outside the selected model's file handling, automatic calendar booking, or unsupervised execution.

## Share from WhatsApp

The installable app manifest declares a multipart POST share target at `/share`. On a compatible installed Android/Chromium app, the intended flow is WhatsApp → Share → Hibi → review received sources → Create a plan. A forwarded message is not sent to a dedicated WhatsApp number; this integration is the phone's native Share action.

The receiver accepts shared text, links, and supported files. It validates size/type, assigns an expiring one-time token, redirects to the intake screen, and removes the shared content from server memory once retrieved. Unopened shares expire after ten minutes and never trigger a model call. A server restart loses pending shares. The UI's draft remains only in page memory; accepted tasks are stored in the browser's normal planner storage. Model requests set `store: false`; that setting is not a promise of zero retention under the provider's policies.

**Phone sharing is not live on this localhost installation.** A phone's localhost address points to the phone, not this computer. A reachable HTTPS deployment, an installed app, and compatible share-target support are still required. iPhone/Safari does not provide this web share-target flow; a native share extension is a separate implementation. Paste/upload remains available.

The current backend deliberately binds to loopback and restricts API origins to localhost. Before HTTPS hosting, add user authentication, authenticated API access, and the selected deployment's allowed origin. Do not expose this local server or its model endpoints through a public tunnel as a production setup. The old static Site deployment does not run this backend; uploading `dist/` alone cannot enable AI.

## Code map

```text
server/
  app.js                 HTTP API, local origin checks, static files
  config.js              Server environment and model configuration
  http.js                Bounded requests, errors, JSON responses
  ai/openai.js           OpenAI Responses and audio transcription adapter
  ai/plan-schema.js      Structured output schema and validation
  intake/sources.js      Source decoding, supported types, size limits
  intake/shared.js       Expiring one-time share receiver
src/features/ai/
  intake.js              Source collection, editable review, selected import
  api.js                 Browser-to-server API calls and file encoding
  voice.js               Microphone lifecycle and bounded recording
  plan-import.js         Conversion of approved suggestions into tasks
public/
  manifest.webmanifest   Installable app and share-target declaration
  sw.js                  No-cache installability worker
  icon.svg               App icon
```

## Verification

`npm run check`, `npm test`, and `npm run build` cover the new code. Integration tests use a mocked OpenAI adapter: they test request schemas, document and audio paths, refusal/invalid output, source references, request limits, secret protection, same-origin enforcement, multipart shares, one-time consumption, and selected-task imports without making paid model calls.

The edit/select/import browser flow was also checked with an explicitly labeled synthetic fixture on an isolated port. Live model quality, actual microphone recording, and end-to-end sharing on a real phone still require user credentials/device testing.

Official references:

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
- [MDN share target and compatibility](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)
