import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
// Respect Cloud Run's injected $PORT while defaulting to 3000
const PORT = Number(process.env.PORT) || 3000;

// Trust proxy headers behind Cloud Run / reverse proxies so req.ip reflects actual client IP
app.set("trust proxy", 1);

// Middleware for parsing JSON & URL-encoded payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- RATE LIMITING SUBSYSTEM ---
interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // 30 AI requests per minute per IP

// Periodically clean up stale rate limit records
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (record.timestamps.length === 0) {
      rateLimitMap.delete(ip);
    }
  }
}, 2 * 60 * 1000);

function geminiRateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const clientIp = req.ip || req.socket.remoteAddress || "anonymous";
  const now = Date.now();

  let record = rateLimitMap.get(clientIp);
  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(clientIp, record);
  }

  // Filter timestamps within current sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (record.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = record.timestamps[0];
    const retryAfterSec = Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000);
    res.setHeader("Retry-After", String(Math.max(1, retryAfterSec)));
    return res.status(429).json({
      error: "Rate limit exceeded. Too many AI processing requests. Please wait a moment before retrying.",
      retryAfterSeconds: Math.max(1, retryAfterSec),
    });
  }

  record.timestamps.push(now);
  next();
}

// Apply rate limiter to all /api/gemini routes
app.use("/api/gemini", geminiRateLimiter);

// Lazy initialize Gemini client
function createGeminiInstance(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function resolveApiKey(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const headerKey = req.headers["x-gemini-api-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }
  if (req.body && typeof req.body.customApiKey === "string" && req.body.customApiKey.trim()) {
    return req.body.customApiKey.trim();
  }
  return undefined;
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Verification endpoint for testing user-provided or environment API key
app.post("/api/gemini/verify", async (req, res) => {
  try {
    const customKey = resolveApiKey(req);
    const serverKey = process.env.GEMINI_API_KEY?.trim();
    const keyToTest = customKey || serverKey;

    if (!keyToTest) {
      return res.status(400).json({
        success: false,
        error: "No API key provided or configured in environment. Please configure an API key.",
      });
    }

    const ai = createGeminiInstance(keyToTest);
    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: "Respond with the word OK",
    });

    const text = (typeof response.text === "string" ? response.text : "").trim();

    return res.json({
      success: true,
      message: "Successfully authenticated with Google AI Studio!",
      model: "gemini-3.7-flash",
      sampleResponse: text || "OK",
    });
  } catch (error: any) {
    const errorMessage =
      error?.message ||
      (typeof error === "string" ? error : "") ||
      "Invalid Google AI Studio API key or connection error. Please verify key permissions.";
    console.error("Gemini API Verification Error:", errorMessage);
    return res.status(401).json({
      success: false,
      error: errorMessage,
    });
  }
});

// Helper utilities for robust base64 and mime-type handling
function extractRawBase64(input: string): string {
  if (!input) return "";
  const commaIndex = input.indexOf(",");
  if (input.startsWith("data:") && commaIndex !== -1) {
    return input.slice(commaIndex + 1).trim();
  }
  return input.trim();
}

function extractMimeType(input: string, fallback: string): string {
  if (input && input.startsWith("data:")) {
    const match = input.match(/^data:([^;,]+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return fallback;
}

function normalizeAudioMimeType(mime?: string, rawDataUrl?: string): string {
  const detected = mime || (rawDataUrl ? extractMimeType(rawDataUrl, "audio/mp4") : "audio/mp4");
  const lower = detected.toLowerCase();
  if (lower.includes("webm")) return "audio/webm";
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) return "audio/mp4";
  if (lower.includes("wav")) return "audio/wav";
  if (lower.includes("ogg")) return "audio/ogg";
  if (lower.includes("mp3") || lower.includes("mpeg")) return "audio/mp3";
  if (lower.includes("flac")) return "audio/flac";
  return "audio/mp4";
}

function normalizeImageMimeType(mime?: string, rawDataUrl?: string): string {
  const detected = mime || (rawDataUrl ? extractMimeType(rawDataUrl, "image/jpeg") : "image/jpeg");
  const lower = detected.toLowerCase();
  if (lower.includes("png")) return "image/png";
  if (lower.includes("webp")) return "image/webp";
  if (lower.includes("gif")) return "image/gif";
  if (lower.includes("svg")) return "image/svg+xml";
  return "image/jpeg";
}

// Helper function to call Gemini with key fallback, retry on 503/429, and model fallback
async function executeGeminiWithFallback(
  req: express.Request,
  params: {
    contents: any;
    config?: any;
  },
  preferredModels: string[] = ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]
): Promise<{ text: string; modelUsed: string; keyUsed: "custom" | "server_env" }> {
  const customKey = resolveApiKey(req);
  const serverKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : undefined;

  const keysToTry: Array<{ key: string; source: "custom" | "server_env" }> = [];
  if (customKey && customKey.trim()) {
    keysToTry.push({ key: customKey.trim(), source: "custom" });
  }
  if (serverKey && (!customKey || customKey.trim() !== serverKey)) {
    keysToTry.push({ key: serverKey, source: "server_env" });
  }

  if (keysToTry.length === 0) {
    const error: any = new Error("No Google AI Studio key configured. Please add your free AI Studio API key.");
    error.requiresKey = true;
    throw error;
  }

  let lastError: any = null;

  for (const { key, source } of keysToTry) {
    const ai = createGeminiInstance(key);

    for (const model of preferredModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: params.contents,
            config: params.config,
          });

          if (response) {
            const rawText =
              typeof response.text === "string"
                ? response.text
                : response.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
            return { text: rawText, modelUsed: model, keyUsed: source };
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          const isTransient =
            errMsg.includes("503") ||
            errMsg.includes("UNAVAILABLE") ||
            errMsg.includes("high demand") ||
            errMsg.includes("429") ||
            errMsg.includes("RESOURCE_EXHAUSTED") ||
            errMsg.includes("resource_exhausted");

          if (isTransient && attempt === 0) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          break; // Try next model
        }
      }
    }

    if (source === "custom" && keysToTry.length > 1) {
      console.warn(
        `Custom API key failed (${lastError?.message || lastError}). Retrying with server environment GEMINI_API_KEY...`
      );
    }
  }

  const errStr = String(lastError?.message || lastError || "");
  const isQuota =
    errStr.includes("resource_exhausted") ||
    errStr.includes("RESOURCE_EXHAUSTED") ||
    errStr.includes("quota") ||
    errStr.includes("429") ||
    errStr.includes("limit: 25000000");

  if (isQuota) {
    const friendlyError: any = new Error(
      "Google AI Studio quota limit exceeded for this key. Please add your free personal API key from aistudio.google.com to continue with your private quota."
    );
    friendlyError.isQuotaExceeded = true;
    friendlyError.requiresKey = true;
    throw friendlyError;
  }

  throw lastError || new Error("Failed to communicate with Google AI Studio.");
}

// 1. Handwritten Note OCR Endpoint
app.post("/api/gemini/ocr", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 in request body." });
    }

    const cleanBase64 = extractRawBase64(imageBase64);
    const validMime = normalizeImageMimeType(mimeType, imageBase64);
    const prompt = "Extract all handwritten and printed text verbatim without markdown alterations.";

    const { text, modelUsed } = await executeGeminiWithFallback(req, {
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: validMime,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    return res.json({
      ocrText: text || "",
      confidence: 0.98,
      source: modelUsed,
    });
  } catch (error: any) {
    console.error("Gemini OCR Error:", error);
    res.status(500).json({
      error: error?.message || "Failed to process OCR scan with Gemini.",
    });
  }
});

// 2. Audio Transcription Endpoint
app.post("/api/gemini/transcribe", async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing audioBase64 in request body." });
    }

    const cleanBase64 = extractRawBase64(audioBase64);
    const validMime = normalizeAudioMimeType(mimeType, audioBase64);
    const prompt =
      "Accurately transcribe this audio recording into clean, speaker-attributed verbatim text. Identify distinct speakers if audible and preserve technical terms.";

    const { text, modelUsed } = await executeGeminiWithFallback(
      req,
      {
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: validMime,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      },
      ["gemini-3.5-transcribe", "gemini-3.7-flash", "gemini-flash-latest"]
    );

    return res.json({
      transcript: text || "",
      source: modelUsed,
    });
  } catch (error: any) {
    console.error("Gemini Transcription Error:", error);
    res.status(500).json({
      error: error?.message || "Failed to transcribe audio with Gemini.",
    });
  }
});

// 3. AI Summary Studio & Synthesis Endpoint
app.post("/api/gemini/summary", async (req, res) => {
  try {
    const {
      format = "executive",
      eventTitle = "Untitled Note",
      currentBody = "",
      transcripts = [],
      ocrScans = [],
      checklists = [],
      customInstructions = "",
    } = req.body;

    const rawTitle = typeof eventTitle === "string" && eventTitle.trim() ? eventTitle.trim() : "Untitled Note";
    const rawBody = typeof currentBody === "string" ? currentBody.trim() : "";

    // Normalize transcripts
    let transcriptsText = "";
    if (Array.isArray(transcripts)) {
      transcriptsText = transcripts
        .map((t: any) => (typeof t === "string" ? t : t?.transcript_text || ""))
        .filter(Boolean)
        .join("\n\n");
    } else if (typeof transcripts === "string") {
      transcriptsText = transcripts.trim();
    }

    // Normalize OCR scans
    let ocrText = "";
    if (Array.isArray(ocrScans)) {
      ocrText = ocrScans
        .map((s: any) => (typeof s === "string" ? s : s?.ocr_text || ""))
        .filter(Boolean)
        .join("\n\n");
    } else if (typeof ocrScans === "string") {
      ocrText = ocrScans.trim();
    }

    // Normalize checklists
    let checklistText = "";
    if (Array.isArray(checklists)) {
      checklistText = checklists
        .map((c: any) => (typeof c === "string" ? c : `[${c.is_completed ? "x" : " "}] ${c.text || ""}`))
        .filter(Boolean)
        .join("\n");
    }

    const aggregatedContext = [
      rawBody ? `### Note Content:\n"""\n${rawBody}\n"""` : "",
      transcriptsText ? `### Audio Transcripts:\n"""\n${transcriptsText}\n"""` : "",
      ocrText ? `### Handwritten OCR Scans:\n"""\n${ocrText}\n"""` : "",
      checklistText ? `### Checklist Tasks:\n"""\n${checklistText}\n"""` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    let formatPrompt = "";
    switch (format) {
      case "action_items":
        formatPrompt = `Extract ALL actionable tasks, deliverables, deadlines, and follow-ups. Format exclusively as an interactive markdown checklist with empty checkboxes [ ] (or checked [x] if already completed). Include assignee and deadline in parentheses if mentioned. If no explicit tasks exist, derive 3-5 logical next steps.`;
        break;
      case "tldr":
        formatPrompt = `Generate a high-density, executive TL;DR summary. Provide:
1. A single 1-2 sentence core thesis.
2. 3 to 5 high-impact bullet points highlighting key insights, numbers, or decisions.
Keep it strictly under 150 words. Do not use emojis.`;
        break;
      case "outline":
        formatPrompt = `Synthesize into a clear, hierarchical conceptual outline. Use clean Markdown headings (### Main Topic, #### Sub-topic) with indented bullet points, key definitions, and open questions for future discussion.`;
        break;
      case "clean_notes":
        formatPrompt = `Refactor and polish the raw content into clean, readable, professional notes. Fix fragmented thoughts, eliminate verbal filler from speech transcripts, structure into logical paragraphs with bold key terms, and preserve all facts, names, and decisions.`;
        break;
      case "executive":
      default:
        formatPrompt = `Generate comprehensive Executive Meeting Minutes & Synthesis. Structure with clean Markdown sections:
### Executive Summary
(2-3 clear sentences summarizing purpose and primary outcomes)

### Key Decisions
(Bulleted list of agreed choices and finalized directions)

### Action Items
(Checklist items [ ] with assignees and timelines if known)

### Discussion Highlights
(Brief thematic bullets covering notable points raised)`;
        break;
    }

    const fullPrompt = `You are an expert executive synthesis assistant powered by Google AI Studio.

Note/Meeting Title: "${rawTitle}"

Target Format: ${format}
${customInstructions ? `Custom User Guidance: ${customInstructions}\n` : ""}

Task Instructions:
${formatPrompt}

Available Context:
${aggregatedContext || "No note body or transcripts provided. Please generate a clean template matching the requested format for the given title."}

CRITICAL RULES:
- Output clean Markdown directly.
- Do NOT wrap in conversational intro/outro (e.g. "Here is your summary").
- Avoid emojis.
- Maintain high information density and professional tone.`;

    const { text, modelUsed, keyUsed } = await executeGeminiWithFallback(req, {
      contents: fullPrompt,
    });

    return res.json({
      summary: text || "",
      format,
      source: modelUsed,
      keyUsed,
    });
  } catch (error: any) {
    console.error("Gemini Summary Error:", error);
    const isQuota = Boolean(error?.isQuotaExceeded) || String(error?.message || "").includes("quota") || String(error?.message || "").includes("resource_exhausted") || String(error?.message || "").includes("RESOURCE_EXHAUSTED");
    res.status(isQuota ? 429 : 500).json({
      error: error?.message || "Failed to generate AI summary with Gemini.",
      isQuotaExceeded: isQuota,
      requiresKey: isQuota || Boolean(error?.requiresKey),
    });
  }
});

// 4. Meeting Minutes Generation Endpoint (backward compatible alias)
app.post("/api/gemini/meeting-minutes", async (req, res) => {
  try {
    const { transcript, currentBody = "", eventTitle = "Project Meeting" } = req.body;
    const rawTranscript = typeof transcript === "string" ? transcript.trim() : "";
    const rawBody = typeof currentBody === "string" ? currentBody.trim() : "";
    const rawTitle = typeof eventTitle === "string" && eventTitle.trim() ? eventTitle.trim() : "Project Meeting";

    const prompt = (rawTranscript || rawBody)
      ? `Analyse the following transcript and notes. Generate concise bullet points for key decisions, action items, and summaries. Format with clean markdown headers (### Executive Summary, ### Key Decisions, ### Action Items with checkboxes [ ] and assignees if mentioned). Do not include emojis in the output.

Event Title: ${rawTitle}

${rawTranscript ? `Transcript Content:\n"""\n${rawTranscript}\n"""\n` : ""}
${rawBody ? `Additional Note Context:\n"""\n${rawBody}\n"""` : ""}`
      : `Create a structured, professional meeting agenda and minutes outline for a meeting titled "${rawTitle}". Include formatted markdown sections for ### Executive Summary, ### Discussion Topics, ### Key Decisions, and ### Action Items (with empty checkboxes [ ]). Keep it concise, practical, and clean without emojis.`;

    const { text, modelUsed, keyUsed } = await executeGeminiWithFallback(req, {
      contents: prompt,
    });

    const meetingMinutes = `\n\n---\n### Meeting Summary\n${text || ""}`;
    return res.json({
      meetingMinutes,
      source: modelUsed,
      keyUsed,
    });
  } catch (error: any) {
    console.error("Gemini Meeting Minutes Error:", error);
    const isQuota = Boolean(error?.isQuotaExceeded) || String(error?.message || "").includes("quota") || String(error?.message || "").includes("resource_exhausted") || String(error?.message || "").includes("RESOURCE_EXHAUSTED");
    res.status(isQuota ? 429 : 500).json({
      error: error?.message || "Failed to generate meeting minutes with Gemini.",
      isQuotaExceeded: isQuota,
      requiresKey: isQuota || Boolean(error?.requiresKey),
    });
  }
});

// --- CLOUD BACKUP ROUTES ---

app.get("/api/cloud/config", (req, res) => {
  res.status(501).json({ error: "Cloud backup is not implemented on this server." });
});

app.get("/api/cloud/:provider/connect", (req, res) => {
  res.status(501).send("Cloud authentication is not implemented.");
});

app.get("/api/cloud/:provider/callback", (req, res) => {
  res.status(501).send("Cloud authentication is not implemented.");
});

app.post("/api/cloud/:provider/disconnect", (req, res) => {
  res.status(501).json({ error: "Not implemented" });
});

app.post("/api/cloud/:provider/backup", (req, res) => {
  res.status(501).json({ error: "Not implemented" });
});

// Explicit 404 handler for unmatched /api/* routes (prevents falling through to SPA HTML)
app.all("/api/*", (req, res) => {
  res.status(404).json({
    error: "API route not found",
    path: req.originalUrl || req.path,
  });
});

// Vite middleware setup & SPA static fallback
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VellumScribe Server running on port ${PORT}`);
  });
}

startServer();
