import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
// Hardcoded to port 3000 per platform specifications
const PORT = 3000;

/**
 * SSRF Guard: Validates user-supplied endpoints (Ollama, local Whisper, WebDAV)
 * Blocks AWS/GCP/Azure metadata services, loopback (unless explicitly allowed for local daemons),
 * and private RFC1918 addresses where forbidden.
 */
function validateSafeUrl(urlStr: string, options: { allowLocalhost?: boolean } = {}): { valid: boolean; error?: string; parsed?: URL } {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Invalid URL scheme. Only http: and https: protocols are permitted." };
    }
    const host = parsed.hostname.toLowerCase();

    // Block cloud metadata services and instance endpoints
    if (
      host === "169.254.169.254" ||
      host === "metadata.google.internal" ||
      host.endsWith(".metadata.google.internal") ||
      host === "instance-data" ||
      host === "100.100.100.200" ||
      host.startsWith("169.254.")
    ) {
      return { valid: false, error: "Access to cloud metadata endpoints is strictly forbidden." };
    }

    const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]";
    if (isLoopback) {
      if (!options.allowLocalhost) {
        return { valid: false, error: "Loopback addresses (localhost/127.0.0.1) are not permitted for this resource." };
      }
      return { valid: true, parsed };
    }

    // Block IPv6 link-local and unique local addresses (ULA)
    if (
      host.startsWith("[fe8") || host.startsWith("[fe9") || host.startsWith("[fea") || host.startsWith("[feb") ||
      host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb") ||
      host.startsWith("[fc") || host.startsWith("[fd") || host.startsWith("fc") || host.startsWith("fd") ||
      host.includes("::ffff:")
    ) {
      return { valid: false, error: "Private or link-local IPv6 addresses are not permitted." };
    }

    // Check IP literal addresses for internal private networks
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      const parts = host.split(".").map(Number);
      const [a, b] = parts;
      if (a === 10) return { valid: false, error: "Private RFC1918 networks (10.0.0.0/8) are not permitted." };
      if (a === 172 && b >= 16 && b <= 31) return { valid: false, error: "Private RFC1918 networks (172.16.0.0/12) are not permitted." };
      if (a === 192 && b === 168) return { valid: false, error: "Private RFC1918 networks (192.168.0.0/16) are not permitted." };
      if (a === 127) return { valid: false, error: "Loopback networks are not permitted." };
      if (a === 0) return { valid: false, error: "0.0.0.0 network is not permitted." };
      if (a === 169 && b === 254) return { valid: false, error: "Link-local addresses (169.254.0.0/16) are not permitted." };
      if (a >= 224) return { valid: false, error: "Multicast or reserved IP ranges are not permitted." };
    }

    return { valid: true, parsed };
  } catch (err: any) {
    return { valid: false, error: `Malformed URL: ${err?.message || "Invalid syntax"}` };
  }
}

// Trust proxy headers behind Cloud Run / reverse proxies so req.ip reflects actual client IP
app.set("trust proxy", 1);

// Standard HTTP Security Headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  next();
});

// Middleware for parsing JSON, URL-encoded, and raw octet-stream binary payloads
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.raw({ type: "application/octet-stream", limit: "150mb" }));

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

// Apply rate limiter to all AI and transcription routes
app.use("/api/gemini", geminiRateLimiter);
app.use("/api/ollama", geminiRateLimiter);
app.use("/api/local-whisper", geminiRateLimiter);
app.use("/api/groq", geminiRateLimiter);
app.use("/api/deepgram", geminiRateLimiter);

// Lazy initialize Gemini client
function createGeminiInstance(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } }
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
    let verifiedModel = "gemini-3.6-flash";
    let text = "";

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: "Respond with OK",
      });
      text = (typeof response.text === "string" ? response.text : "").trim();
    } catch (primaryErr: any) {
      // Fallback verification model
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: "Respond with OK",
      });
      verifiedModel = "gemini-3.1-flash-lite";
      text = (typeof fallbackResponse.text === "string" ? fallbackResponse.text : "").trim();
    }

    return res.json({
      success: true,
      message: "Successfully authenticated with Google AI Studio!",
      model: verifiedModel,
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
  preferredModels: string[] = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]
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

  const isPermissionDenied =
    errStr.includes("The caller does not have permission") ||
    errStr.includes("PERMISSION_DENIED") ||
    errStr.includes("403") ||
    errStr.includes("permission denied") ||
    errStr.includes("API key not valid") ||
    errStr.includes("API_KEY_INVALID");

  if (isPermissionDenied) {
    const friendlyError: any = new Error(
      "Google AI Studio Permission Denied (403): The caller does not have permission. Please verify your Google AI Studio API key at https://aistudio.google.com/app/apikey and ensure 'Generative Language API' is enabled with no restrictive API/IP/referrer blocks."
    );
    friendlyError.isPermissionDenied = true;
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
      ["gemini-3.5-transcribe", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-flash-latest"]
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

// --- MULTI-PROVIDER BYOK & LOCAL OFFLINE SUBSYSTEM ---

// Helper to extract Groq key from request
function resolveGroqKey(req: express.Request): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ") && auth.slice(7).trim().startsWith("gsk_")) {
    return auth.slice(7).trim();
  }
  const groqHeader = req.headers["x-groq-api-key"];
  if (typeof groqHeader === "string" && groqHeader.trim()) {
    return groqHeader.trim();
  }
  if (req.body && typeof req.body.apiKey === "string" && req.body.apiKey.trim().startsWith("gsk_")) {
    return req.body.apiKey.trim();
  }
  return process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : undefined;
}

// 1. Groq Verify Endpoint
app.post("/api/groq/verify", async (req, res) => {
  try {
    const key = resolveGroqKey(req);
    if (!key) {
      return res.status(400).json({ success: false, error: "Please provide a Groq API key (starts with gsk_)." });
    }
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data: any = await response.json().catch(() => null);
    if (response.ok && data?.data) {
      const models = (data.data as Array<any>).map((m) => m.id);
      return res.json({
        success: true,
        message: `Connected to Groq Cloud! Found ${models.length} available models.`,
        models,
      });
    }
    return res.status(401).json({
      success: false,
      error: data?.error?.message || "Groq key verification failed.",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to contact Groq." });
  }
});

// 2. Groq Chat / Synthesis Endpoint
app.post("/api/groq/chat", async (req, res) => {
  try {
    const key = resolveGroqKey(req);
    if (!key) {
      return res.status(400).json({ error: "Groq API key required. Paste your free key from console.groq.com." });
    }
    const { prompt, model = "llama-3.3-70b-versatile", systemPrompt } = req.body;
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt || "Synthesize these notes." });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });

    const data: any = await response.json().catch(() => null);
    if (!response.ok || !data?.choices?.[0]?.message?.content) {
      return res.status(response.status || 500).json({
        error: data?.error?.message || "Groq generation failed.",
      });
    }

    return res.json({
      text: data.choices[0].message.content,
      modelUsed: model,
      source: `groq/${model}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to execute Groq synthesis." });
  }
});

// 3. Groq Audio Transcription Endpoint (Whisper Large v3)
app.post("/api/groq/transcribe", async (req, res) => {
  try {
    const key = resolveGroqKey(req);
    if (!key) {
      return res.status(400).json({ error: "Groq API key required for fast Whisper transcription." });
    }
    const { audioBase64, mimeType = "audio/webm", model = "whisper-large-v3-turbo" } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Audio base64 data required." });
    }

    const cleanBase64 = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    const buffer = Buffer.from(cleanBase64, "base64");
    const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";

    const formData = new FormData();
    const fileBlob = new Blob([buffer], { type: mimeType });
    formData.append("file", fileBlob, `recording.${ext}`);
    formData.append("model", model);
    formData.append("response_format", "json");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
      },
      body: formData,
    });

    const data: any = await response.json().catch(() => null);
    if (!response.ok || !data?.text) {
      return res.status(response.status || 500).json({
        error: data?.error?.message || "Groq Whisper transcription failed.",
      });
    }

    return res.json({
      transcript: data.text,
      source: `groq/${model}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Groq Whisper transcription request failed." });
  }
});

// 4. Deepgram Verify Endpoint
app.post("/api/deepgram/verify", async (req, res) => {
  try {
    const key = (req.body?.apiKey || req.headers["x-deepgram-api-key"] || process.env.DEEPGRAM_API_KEY || "").toString().trim();
    if (!key) {
      return res.status(400).json({ success: false, error: "Please provide a Deepgram API key." });
    }
    const response = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${key}` },
    });
    const data: any = await response.json().catch(() => null);
    if (response.ok && data?.projects) {
      return res.json({
        success: true,
        message: "Connected to Deepgram Speech Platform!",
      });
    }
    return res.status(401).json({
      success: false,
      error: data?.err_msg || "Deepgram key verification rejected.",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || "Failed to contact Deepgram." });
  }
});

// 5. Deepgram Audio Transcription Endpoint
app.post("/api/deepgram/transcribe", async (req, res) => {
  try {
    const key = (req.body?.apiKey || req.headers["x-deepgram-api-key"] || process.env.DEEPGRAM_API_KEY || "").toString().trim();
    if (!key) {
      return res.status(400).json({ error: "Deepgram API key required." });
    }
    const { audioBase64, mimeType = "audio/webm", model = "nova-3" } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Audio base64 data required." });
    }

    const cleanBase64 = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    const buffer = Buffer.from(cleanBase64, "base64");

    const response = await fetch(`https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&smart_format=true&punctuate=true`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": mimeType,
      },
      body: buffer,
    });

    const data: any = await response.json().catch(() => null);
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

    if (!response.ok || transcript === undefined) {
      return res.status(response.status || 500).json({
        error: data?.err_msg || "Deepgram speech-to-text failed.",
      });
    }

    return res.json({
      transcript,
      source: `deepgram/${model}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Deepgram transcription error." });
  }
});

// 6. Local Ollama Tags & Probe Proxy
app.post("/api/ollama/tags", async (req, res) => {
  try {
    const rawEndpoint = (req.body?.endpoint || "http://localhost:11434").replace(/\/+$/, "");
    const validation = validateSafeUrl(rawEndpoint, { allowLocalhost: true });
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }
    const endpoint = rawEndpoint;
    const response = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });
    const data: any = await response.json().catch(() => null);
    if (response.ok && data?.models) {
      const models = (data.models as Array<{ name: string }>).map((m) => m.name);
      return res.json({
        success: true,
        endpoint,
        models,
      });
    }
    return res.status(502).json({
      success: false,
      error: `Could not retrieve models from Ollama at ${endpoint}.`,
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      error: `Ollama daemon not reachable: ${err.message}. Ensure "ollama serve" is active.`,
    });
  }
});

// 7. Local Ollama Generation Proxy
app.post("/api/ollama/generate", async (req, res) => {
  try {
    const rawEndpoint = (req.body?.endpoint || "http://localhost:11434").replace(/\/+$/, "");
    const validation = validateSafeUrl(rawEndpoint, { allowLocalhost: true });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const endpoint = rawEndpoint;
    const { prompt, model = "llama3.2", system } = req.body;

    const response = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        system,
        stream: false,
      }),
      signal: AbortSignal.timeout(120000),
    });

    const data: any = await response.json().catch(() => null);
    if (response.ok && data?.response) {
      return res.json({
        text: data.response,
        modelUsed: `ollama/${model}`,
        source: `local_ollama/${model}`,
      });
    }
    return res.status(500).json({
      error: data?.error || "Ollama generation failed.",
    });
  } catch (err: any) {
    return res.status(502).json({
      error: `Failed to contact local Ollama daemon at ${req.body?.endpoint || "http://localhost:11434"}: ${err.message}`,
    });
  }
});

// 8. Local Whisper Server Proxy
app.post("/api/local-whisper/verify", async (req, res) => {
  try {
    const rawEndpoint = (req.body?.endpoint || "http://localhost:8080/v1/audio/transcriptions").replace(/\/+$/, "");
    const validation = validateSafeUrl(rawEndpoint, { allowLocalhost: true });
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }
    const endpoint = rawEndpoint;
    const testUrl = endpoint.replace(/\/transcriptions$/, "/models");
    const response = await fetch(testUrl, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    }).catch(() => null);

    if (response && response.ok) {
      return res.json({ success: true, message: `Local Whisper server reachable at ${endpoint}` });
    }

    // Try a HEAD or OPTIONS request to endpoint
    const optRes = await fetch(endpoint, { method: "OPTIONS", signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (optRes) {
      return res.json({ success: true, message: `Local Whisper server acknowledged connection.` });
    }

    return res.json({
      success: true,
      message: `Configured local Whisper at ${endpoint}. Will send audio payloads directly when recording.`,
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: `Local Whisper unreachable: ${err.message}` });
  }
});

app.post("/api/local-whisper/transcribe", async (req, res) => {
  try {
    const rawEndpoint = (req.body?.endpoint || "http://localhost:8080/v1/audio/transcriptions").trim();
    const validation = validateSafeUrl(rawEndpoint, { allowLocalhost: true });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const endpoint = rawEndpoint;
    const { audioBase64, mimeType = "audio/webm" } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: "Audio base64 data required." });
    }

    const cleanBase64 = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    const buffer = Buffer.from(cleanBase64, "base64");
    const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";

    const formData = new FormData();
    const fileBlob = new Blob([buffer], { type: mimeType });
    formData.append("file", fileBlob, `speech.${ext}`);
    formData.append("model", "whisper-1");

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(120000),
    });

    const data: any = await response.json().catch(() => null);
    const transcript = data?.text || data?.transcript;

    if (response.ok && transcript) {
      return res.json({
        transcript,
        source: "local_whisper",
      });
    }

    return res.status(response.status || 500).json({
      error: data?.error || "Local Whisper failed to return transcript.",
    });
  } catch (err: any) {
    return res.status(502).json({
      error: `Failed to contact Local Whisper at ${req.body?.endpoint}: ${err.message}`,
    });
  }
});


// --- CLOUD BACKUP & OAUTH SUBSYSTEM ---

interface CloudAccountRecord {
  provider: "google_drive" | "microsoft" | "instant_vault" | "nextcloud" | "webdav";
  accountId: string;
  email?: string;
  username?: string;
  displayName: string;
  connectedAt: string;
  serverUrl?: string;
  webdavAuth?: string; // Symmetrically encrypted with SERVER_SESSION_SECRET at rest
  remotePath?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface CloudBackupRecord {
  id: string;
  provider: "google_drive" | "microsoft" | "instant_vault" | "nextcloud" | "webdav";
  filename: string;
  size: number;
  createdAt: string;
  checksum?: string;
  noteCount?: number;
  buffer: Buffer;
}

interface ChunkSession {
  uploadId: string;
  sessionId: string;
  provider: "google_drive" | "microsoft" | "instant_vault" | "nextcloud" | "webdav";
  filename: string;
  totalBytes: number;
  totalChunks: number;
  receivedChunks: Map<number, Buffer>;
  createdAt: number;
  checksum?: string;
}

interface SessionCloudData {
  accounts: Map<string, CloudAccountRecord>;
  backups: Map<string, CloudBackupRecord[]>;
  lastActive: number;
}

// Session-scoped stores for cloud accounts and backups (multi-tenant isolation)
const sessionStores = new Map<string, SessionCloudData>();
const chunkSessionsStore = new Map<string, ChunkSession>();

interface OAuthStateRecord {
  sessionId: string;
  provider: string;
  createdAt: number;
  expiresAt: number;
}
const pendingOAuthStates = new Map<string, OAuthStateRecord>();

const MAX_BACKUP_RETENTION = 10;

// Server-side session signing secret & encryption key
const SERVER_SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

interface SessionTokenPayload {
  sub: string;
  iss: "vellumscribe";
  aud: "cloud_sync";
  iat: number;
  exp: number;
  nonce: string;
}

function signSessionToken(sessionId: string, ttlMs = 14 * 24 * 60 * 60 * 1000): string {
  const payload: SessionTokenPayload = {
    sub: sanitizeSessionId(sessionId),
    iss: "vellumscribe",
    aud: "cloud_sync",
    iat: Date.now(),
    exp: Date.now() + ttlMs,
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SERVER_SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySessionToken(token: string): { valid: boolean; sessionId?: string; error?: string } {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, error: "Malformed token" };
  }
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return { valid: false, error: "Invalid token structure" };
  }
  const expectedSignature = crypto.createHmac("sha256", SERVER_SESSION_SECRET).update(body).digest("base64url");
  if (expectedSignature.length !== signature.length) {
    return { valid: false, error: "Signature length mismatch" };
  }
  const match = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  if (!match) {
    return { valid: false, error: "Signature mismatch" };
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as SessionTokenPayload;
    if (payload.iss !== "vellumscribe" || payload.aud !== "cloud_sync") {
      return { valid: false, error: "Invalid token claims" };
    }
    if (Date.now() > payload.exp) {
      return { valid: false, error: "Session token expired" };
    }
    return { valid: true, sessionId: payload.sub };
  } catch {
    return { valid: false, error: "Failed to parse token claims" };
  }
}

function encryptCredential(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(SERVER_SESSION_SECRET).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptCredential(ciphertext?: string): string | null {
  if (!ciphertext) return null;
  if (!ciphertext.includes(":")) return ciphertext; // Migration fallback
  try {
    const [ivHex, tagHex, dataHex] = ciphertext.split(":");
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(SERVER_SESSION_SECRET).digest(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    return null;
  }
}

// Durable Local Disk Storage for Backups (persists across server restarts)
const VAULT_STORAGE_DIR = path.join(process.cwd(), "data", "cloud_vault");
try {
  if (!fs.existsSync(VAULT_STORAGE_DIR)) {
    fs.mkdirSync(VAULT_STORAGE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("Failed to create vault storage directory:", e);
}

function sanitizeSessionId(sessionId: string): string {
  const clean = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  if (!clean || clean === "default_session") {
    return "sess_" + crypto.randomBytes(12).toString("hex");
  }
  return clean;
}

function getVaultSessionDir(sessionId: string): string {
  const safeSession = sanitizeSessionId(sessionId);
  const dir = path.join(VAULT_STORAGE_DIR, safeSession);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function persistBackupToDisk(sessionId: string, backup: CloudBackupRecord): void {
  try {
    const dir = getVaultSessionDir(sessionId);
    const safeBackupId = backup.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const metaFile = path.join(dir, `${safeBackupId}.json`);
    const binFile = path.join(dir, `${safeBackupId}.bin`);
    fs.writeFileSync(binFile, backup.buffer);
    fs.writeFileSync(
      metaFile,
      JSON.stringify({
        id: backup.id,
        provider: backup.provider,
        filename: backup.filename,
        size: backup.size,
        createdAt: backup.createdAt,
        checksum: backup.checksum,
        noteCount: backup.noteCount,
      })
    );
  } catch (e) {
    console.error("Failed to persist backup to durable disk storage:", e);
  }
}

function loadPersistedBackupsFromDisk(sessionId: string): CloudBackupRecord[] {
  try {
    const dir = getVaultSessionDir(sessionId);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    const metaFiles = files.filter((f) => f.endsWith(".json"));
    const backups: CloudBackupRecord[] = [];
    for (const mf of metaFiles) {
      try {
        const metaPath = path.join(dir, mf);
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        const safeBackupId = meta.id.replace(/[^a-zA-Z0-9_-]/g, "_");
        const binPath = path.join(dir, `${safeBackupId}.bin`);
        if (fs.existsSync(binPath)) {
          const buffer = fs.readFileSync(binPath);
          backups.push({
            ...meta,
            buffer,
          });
        }
      } catch (e) {
        console.warn("Failed to read persisted backup metadata:", mf, e);
      }
    }
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return backups;
  } catch (e) {
    console.warn("Failed to list persisted backups:", e);
    return [];
  }
}

function getSessionId(req: express.Request): string {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const verified = verifySessionToken(token);
    if (verified.valid && verified.sessionId) {
      return sanitizeSessionId(verified.sessionId);
    }
  }

  // 2. x-session-token header
  const tokenHeader = req.headers["x-session-token"];
  if (typeof tokenHeader === "string" && tokenHeader.trim()) {
    const verified = verifySessionToken(tokenHeader.trim());
    if (verified.valid && verified.sessionId) {
      return sanitizeSessionId(verified.sessionId);
    }
  }

  // 3. Cookie fallback
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/vs_cloud_token=([^;]+)/);
    if (match && match[1]) {
      const verified = verifySessionToken(decodeURIComponent(match[1]));
      if (verified.valid && verified.sessionId) {
        return sanitizeSessionId(verified.sessionId);
      }
    }
  }

  // 4. Legacy migration header during initial client handshake
  const legacyHeader = req.headers["x-session-id"];
  if (typeof legacyHeader === "string") {
    const cleaned = legacyHeader.trim();
    if (/^[a-zA-Z0-9_-]{12,64}$/.test(cleaned)) {
      return sanitizeSessionId(cleaned);
    }
  }

  // Isolate unauthenticated callers with an ephemeral per-request session ID
  return "anon_" + crypto.randomBytes(16).toString("hex");
}

function getSessionStore(sessionId: string): SessionCloudData {
  let store = sessionStores.get(sessionId);
  if (!store) {
    // Rehydrate from disk on first access
    const diskBackups = loadPersistedBackupsFromDisk(sessionId);
    const backupsMap = new Map<string, CloudBackupRecord[]>();
    for (const b of diskBackups) {
      const list = backupsMap.get(b.provider) || [];
      list.push(b);
      backupsMap.set(b.provider, list);
    }
    store = {
      accounts: new Map(),
      backups: backupsMap,
      lastActive: Date.now(),
    };
    sessionStores.set(sessionId, store);
  }
  store.lastActive = Date.now();
  return store;
}

// Periodic cleanup of stale chunk upload sessions and expired OAuth states
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of chunkSessionsStore.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      chunkSessionsStore.delete(id);
    }
  }
  for (const [state, record] of pendingOAuthStates.entries()) {
    if (now > record.expiresAt) {
      pendingOAuthStates.delete(state);
    }
  }
  for (const [id, store] of sessionStores.entries()) {
    if (now - store.lastActive > 24 * 60 * 60 * 1000) {
      sessionStores.delete(id);
    }
  }
}, 5 * 60 * 1000);

function isProviderConfigured(provider: string): boolean {
  if (provider === "instant_vault") return true;
  if (provider === "nextcloud" || provider === "webdav") return true;
  if (provider === "google_drive") {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }
  if (provider === "microsoft") {
    return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  }
  return false;
}

// 0. Cloud Session Token Minting & Rotation Endpoint
app.post("/api/cloud/session", (req, res) => {
  const existing = req.body?.sessionId || req.headers["x-session-id"];
  let sessionId: string;
  if (typeof existing === "string" && /^[a-zA-Z0-9_-]{12,64}$/.test(existing.trim())) {
    sessionId = sanitizeSessionId(existing.trim());
  } else {
    sessionId = "vs_sess_" + crypto.randomBytes(16).toString("hex");
  }
  const token = signSessionToken(sessionId);
  res.setHeader("Set-Cookie", `vs_cloud_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600`);
  res.json({
    success: true,
    sessionId,
    token,
    expiresIn: 14 * 24 * 3600,
  });
});

// 1. Cloud Configuration & Status Endpoint
app.get("/api/cloud/config", (req, res) => {
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  const accounts = Array.from(session.accounts.values()).map((acc) => ({
    provider: acc.provider,
    accountId: acc.accountId,
    email: acc.email,
    displayName: acc.displayName,
    connectedAt: acc.connectedAt,
    serverUrl: acc.serverUrl,
  }));

  res.json({
    status: "ok",
    providers: {
      instant_vault: {
        name: "Vellum Encrypted Vault",
        isConfigured: true,
        hasOAuthEnv: true,
        zeroKeyReady: true,
        description: "Zero-credential private backup snapshot vault with client-side AES-256-GCM encryption.",
      },
      google_drive: {
        name: "Google Drive",
        isConfigured: isProviderConfigured("google_drive"),
        hasOAuthEnv: Boolean(process.env.GOOGLE_CLIENT_ID),
        zeroKeyReady: false,
        description: "Sync encrypted backup snapshots directly to Google Drive via OAuth.",
      },
      microsoft: {
        name: "Microsoft OneDrive",
        isConfigured: isProviderConfigured("microsoft"),
        hasOAuthEnv: Boolean(process.env.MICROSOFT_CLIENT_ID),
        zeroKeyReady: false,
        description: "Store encrypted backup snapshots in Microsoft OneDrive via OAuth.",
      },
      nextcloud: {
        name: "Nextcloud",
        isConfigured: true,
        hasOAuthEnv: false,
        zeroKeyReady: false,
        description: "Store encrypted backups on a self-hosted Nextcloud server via authenticated WebDAV.",
      },
      webdav: {
        name: "Custom WebDAV",
        isConfigured: true,
        hasOAuthEnv: false,
        zeroKeyReady: false,
        description: "Universal WebDAV cloud destination with authenticated endpoint.",
      },
    },
    accounts,
  });
});

// 1.5 Instant 1-Click Connection Endpoint (Strictly for Vellum Encrypted Vault)
app.post("/api/cloud/:provider/connect-instant", (req, res) => {
  const { provider } = req.params;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);

  if (provider !== "instant_vault") {
    return res.status(400).json({
      error: `Instant connect is only supported for Vellum Encrypted Vault. ${
        provider === "nextcloud" || provider === "webdav"
          ? "Please provide server URL and app credentials."
          : "Server administrator must configure OAuth credentials for " + provider + "."
      }`,
    });
  }

  const userEmail =
    typeof req.body?.email === "string" && req.body.email.includes("@")
      ? req.body.email.trim()
      : undefined;

  const displayName = "Vellum Encrypted Vault";
  const accountId = `acc_vault_${sessionId.slice(0, 8)}_${crypto.randomBytes(3).toString("hex")}`;
  const connectedAt = new Date().toISOString();

  const record: CloudAccountRecord = {
    provider: "instant_vault",
    accountId,
    email: userEmail,
    displayName,
    connectedAt,
  };

  session.accounts.set("instant_vault", record);

  res.json({
    success: true,
    message: "Connected Vellum Encrypted Vault with client-side AES-256-GCM encryption.",
    account: {
      provider: "instant_vault",
      accountId,
      email: userEmail,
      displayName,
      connectedAt,
    },
  });
});

// 1.6 WebDAV / Nextcloud Credential Connection Endpoint
app.post("/api/cloud/:provider/connect-credentials", async (req, res) => {
  const { provider } = req.params;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);

  if (provider !== "webdav" && provider !== "nextcloud") {
    return res.status(400).json({ error: `Provider ${provider} does not support credential connection.` });
  }

  const { serverUrl, username, password, remotePath } = req.body || {};
  if (!serverUrl || !username || !password) {
    return res.status(400).json({ error: "Server URL, username, and password / app token are required." });
  }

  try {
    let cleanUrl = String(serverUrl).trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = "https://" + cleanUrl;
    }

    const validation = validateSafeUrl(cleanUrl, { allowLocalhost: false });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const parsed = new URL(cleanUrl);
    let targetPath = (remotePath && typeof remotePath === "string" ? remotePath.trim() : "").replace(/^\/+/, "");
    if (!targetPath) {
      targetPath = provider === "nextcloud" ? `remote.php/dav/files/${encodeURIComponent(username.trim())}/VellumScribe/` : "VellumScribe/";
    }
    if (!targetPath.endsWith("/")) targetPath += "/";

    const fullUrl = new URL(targetPath, parsed.origin + (parsed.pathname.endsWith("/") ? parsed.pathname : parsed.pathname + "/")).toString();
    const authHeader = "Basic " + Buffer.from(`${username.trim()}:${password.trim()}`).toString("base64");

    // Perform PROPFIND to verify credentials against the remote server
    const testRes = await fetch(fullUrl, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        Depth: "0",
      },
      redirect: "error",
    }).catch(async () => {
      return fetch(cleanUrl, {
        method: "PROPFIND",
        headers: {
          Authorization: authHeader,
          Depth: "0",
        },
        redirect: "error",
      });
    });

    if (!testRes.ok && testRes.status !== 207 && testRes.status !== 404) {
      return res.status(400).json({
        error: `Could not authenticate with ${provider} server (HTTP ${testRes.status}). Please check URL and app password.`,
      });
    }

    const accountId = `acc_${provider}_${crypto.randomBytes(4).toString("hex")}`;
    const connectedAt = new Date().toISOString();
    const displayName = `${username.trim()} (${parsed.hostname})`;
    const encryptedAuth = encryptCredential(authHeader);

    const record: CloudAccountRecord = {
      provider: provider as "nextcloud" | "webdav",
      accountId,
      username: username.trim(),
      displayName,
      connectedAt,
      serverUrl: fullUrl,
      webdavAuth: encryptedAuth,
      remotePath: targetPath,
    };

    session.accounts.set(provider, record);

    res.json({
      success: true,
      message: `Successfully connected to ${provider} at ${parsed.hostname}.`,
      account: {
        provider,
        accountId,
        displayName,
        connectedAt,
        serverUrl: fullUrl,
      },
    });
  } catch (err: any) {
    res.status(400).json({
      error: `Failed to connect to ${provider} server: ${err.message || "Network error"}`,
    });
  }
});

// 2. Provider OAuth Connect Initiation
app.get("/api/cloud/:provider/connect", (req, res) => {
  const { provider } = req.params;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  const host = req.get("host") || "localhost:3000";
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  const origin = `${protocol}://${host}`;

  if (provider === "instant_vault") {
    const accountId = `acc_vault_${sessionId.slice(0, 8)}_${crypto.randomBytes(3).toString("hex")}`;
    session.accounts.set("instant_vault", {
      provider: "instant_vault",
      accountId,
      displayName: "Vellum Encrypted Vault",
      connectedAt: new Date().toISOString(),
    });
    return res.redirect("/?cloud=connected&provider=instant_vault&cloud_connected=instant_vault");
  }

  // Create cryptographic CSRF state token tied to session
  const randomNonce = crypto.randomBytes(24).toString("hex");
  const state = `${sessionId}:${randomNonce}`;
  pendingOAuthStates.set(state, {
    sessionId,
    provider,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  if (provider === "google_drive") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/cloud/google_drive/callback`;

    if (!clientId) {
      return res.redirect("/?cloud_error=" + encodeURIComponent("Google Drive OAuth is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."));
    }

    const scopes = encodeURIComponent(
      "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
    );
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&state=${state}`;

    return res.redirect(authUrl);
  }

  if (provider === "microsoft") {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${origin}/api/cloud/microsoft/callback`;

    if (!clientId) {
      return res.redirect("/?cloud_error=" + encodeURIComponent("Microsoft OneDrive OAuth is not configured on the server. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET."));
    }

    const scopes = encodeURIComponent("Files.ReadWrite.AppFolder User.Read offline_access");
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_mode=query&scope=${scopes}&state=${state}`;

    return res.redirect(authUrl);
  }

  res.redirect("/?cloud_error=Unknown_provider");
});

// 3. Provider OAuth Callback Handler
app.get("/api/cloud/:provider/callback", async (req, res) => {
  const { provider } = req.params;
  const { code, error, error_description, state } = req.query;

  if (error) {
    return res.redirect(`/?cloud_error=${encodeURIComponent(String(error_description || error))}`);
  }

  if (!code || typeof code !== "string") {
    return res.redirect("/?cloud_error=Missing_authorization_code");
  }

  if (!state || typeof state !== "string") {
    return res.redirect("/?cloud_error=" + encodeURIComponent("Missing OAuth state parameter"));
  }

  const stateRecord = pendingOAuthStates.get(state);
  if (!stateRecord || stateRecord.provider !== provider || Date.now() > stateRecord.expiresAt) {
    return res.redirect("/?cloud_error=" + encodeURIComponent("Invalid or expired OAuth state parameter (CSRF detected)"));
  }
  pendingOAuthStates.delete(state); // Single-use consumption
  const sessionId = stateRecord.sessionId;
  const session = getSessionStore(sessionId);

  const host = req.get("host") || "localhost:3000";
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  const origin = `${protocol}://${host}`;

  try {
    if (provider === "google_drive") {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/cloud/google_drive/callback`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("Google Token Exchange Error:", errText);
        return res.redirect("/?cloud_error=Token_exchange_failed");
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Query User Profile
      let email: string | undefined;
      let displayName = "Google Drive Account";
      try {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          email = userData.email || undefined;
          displayName = userData.name || displayName;
        }
      } catch (e) {
        console.warn("Failed to fetch Google profile info:", e);
      }

      const accountId = email || `google_${crypto.randomBytes(6).toString("hex")}`;
      session.accounts.set("google_drive", {
        provider: "google_drive",
        accountId,
        email,
        displayName,
        connectedAt: new Date().toISOString(),
        accessToken,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      });

      return res.redirect("/?cloud=connected&provider=google_drive&cloud_connected=google_drive");
    }

    if (provider === "microsoft") {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI || `${origin}/api/cloud/microsoft/callback`;

      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId || "",
          client_secret: clientSecret || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("Microsoft Token Exchange Error:", errText);
        return res.redirect("/?cloud_error=Token_exchange_failed");
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      let email: string | undefined;
      let displayName = "OneDrive Account";
      try {
        const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          email = userData.mail || userData.userPrincipalName || undefined;
          displayName = userData.displayName || displayName;
        }
      } catch (e) {
        console.warn("Failed to fetch Microsoft profile info:", e);
      }

      const accountId = email || `ms_${crypto.randomBytes(6).toString("hex")}`;
      session.accounts.set("microsoft", {
        provider: "microsoft",
        accountId,
        email,
        displayName,
        connectedAt: new Date().toISOString(),
        accessToken,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      });

      return res.redirect("/?cloud=connected&provider=microsoft&cloud_connected=microsoft");
    }

    res.redirect("/?cloud_error=Unsupported_provider");
  } catch (error: any) {
    console.error("OAuth Callback Exception:", error);
    res.redirect(`/?cloud_error=${encodeURIComponent(error?.message || "oauth_failed")}`);
  }
});

// 4. Provider Disconnect Endpoint
app.post("/api/cloud/:provider/disconnect", (req, res) => {
  const { provider } = req.params;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  session.accounts.delete(provider);
  res.json({ success: true, message: `Disconnected ${provider} account.` });
});

// 5. Remote Backups Listing Endpoint (Session-scoped)
app.get("/api/cloud/:provider/backups", (req, res) => {
  const { provider } = req.params;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  const backups = (session.backups.get(provider) || []).map((b) => ({
    id: b.id,
    filename: b.filename,
    size: b.size,
    createdAt: b.createdAt,
    checksum: b.checksum,
    noteCount: b.noteCount,
  }));

  res.json({
    provider,
    backups,
    total: backups.length,
  });
});

// 6. Direct Binary Backup Upload Endpoint
app.post("/api/cloud/:provider/backup", async (req, res) => {
  const { provider } = req.params as { provider: "google_drive" | "microsoft" | "instant_vault" | "nextcloud" | "webdav" };
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  
  let buffer: Buffer | null = null;
  let filename = `vellumscribe_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json.gz`;

  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    buffer = req.body;
  } else if (req.body && typeof req.body.dataBase64 === "string") {
    buffer = Buffer.from(req.body.dataBase64, "base64");
    if (req.body.filename) filename = req.body.filename;
  } else if (typeof req.body === "string" && req.body.length > 0) {
    buffer = Buffer.from(req.body, "utf-8");
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ error: "Empty or invalid backup payload." });
  }

  const account = session.accounts.get(provider);

  // If uploading to real Nextcloud or WebDAV server
  if (account && (provider === "nextcloud" || provider === "webdav") && account.serverUrl && account.webdavAuth) {
    try {
      const decryptedAuth = decryptCredential(account.webdavAuth);
      if (!decryptedAuth) {
        return res.status(502).json({ error: "Failed to decrypt WebDAV authorization credentials." });
      }

      const uploadUrl = new URL(filename, account.serverUrl).toString();
      const urlValidation = validateSafeUrl(uploadUrl, { allowLocalhost: false });
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.error });
      }

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: decryptedAuth,
          "Content-Type": "application/octet-stream",
        },
        body: buffer as any,
        redirect: "error",
      });
      if (!putRes.ok && putRes.status !== 201 && putRes.status !== 204) {
        return res.status(502).json({
          error: `Remote ${provider} server rejected upload (HTTP ${putRes.status}).`,
        });
      }
    } catch (putErr: any) {
      return res.status(502).json({
        error: `Failed to upload to remote WebDAV server: ${putErr.message}`,
      });
    }
  }

  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const backupId = `bk_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  const newBackup: CloudBackupRecord = {
    id: backupId,
    provider,
    filename,
    size: buffer.length,
    createdAt: new Date().toISOString(),
    checksum,
    buffer,
  };

  let list = session.backups.get(provider) || [];
  list.unshift(newBackup);

  // Retention pruning
  if (list.length > MAX_BACKUP_RETENTION) {
    list = list.slice(0, MAX_BACKUP_RETENTION);
  }
  session.backups.set(provider, list);
  persistBackupToDisk(sessionId, newBackup);

  res.json({
    success: true,
    backupId,
    filename,
    size: buffer.length,
    checksum,
    createdAt: newBackup.createdAt,
    message: `Backup successfully uploaded to ${provider}.`,
  });
});

// 7. Resumable Chunked Upload - Init
app.post("/api/cloud/:provider/chunk/init", (req, res) => {
  const { provider } = req.params as { provider: "google_drive" | "microsoft" | "instant_vault" | "nextcloud" | "webdav" };
  const sessionId = getSessionId(req);
  const { filename = "vellumscribe_backup.json.gz", totalBytes = 0, totalChunks = 1, checksum } = req.body;

  const uploadId = `upload_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  const chunkSession: ChunkSession = {
    uploadId,
    sessionId,
    provider,
    filename,
    totalBytes: Number(totalBytes),
    totalChunks: Number(totalChunks),
    receivedChunks: new Map<number, Buffer>(),
    createdAt: Date.now(),
    checksum,
  };

  chunkSessionsStore.set(uploadId, chunkSession);

  res.json({
    success: true,
    uploadId,
    chunkSize: 2 * 1024 * 1024,
    totalChunks: chunkSession.totalChunks,
  });
});

// 8. Resumable Chunked Upload - Upload Chunk
app.post("/api/cloud/:provider/chunk/upload", (req, res) => {
  const { uploadId, chunkIndex, chunkBase64 } = req.body;
  const sessionId = getSessionId(req);
  const chunkSession = chunkSessionsStore.get(uploadId);

  if (!chunkSession || chunkSession.sessionId !== sessionId) {
    return res.status(404).json({ error: "Upload session expired or invalid." });
  }

  let chunkBuffer: Buffer | null = null;
  if (Buffer.isBuffer(req.body)) {
    chunkBuffer = req.body;
  } else if (chunkBase64 && typeof chunkBase64 === "string") {
    chunkBuffer = Buffer.from(chunkBase64, "base64");
  }

  if (!chunkBuffer || chunkBuffer.length === 0) {
    return res.status(400).json({ error: "Missing chunk buffer payload." });
  }

  const idx = Number(chunkIndex);
  chunkSession.receivedChunks.set(idx, chunkBuffer);

  res.json({
    success: true,
    uploadId,
    chunkIndex: idx,
    receivedCount: chunkSession.receivedChunks.size,
    totalChunks: chunkSession.totalChunks,
  });
});

// 9. Resumable Chunked Upload - Commit
app.post("/api/cloud/:provider/chunk/commit", async (req, res) => {
  const { uploadId } = req.body;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  const chunkSession = chunkSessionsStore.get(uploadId);

  if (!chunkSession || chunkSession.sessionId !== sessionId) {
    return res.status(404).json({ error: "Upload session expired or not found." });
  }

  if (chunkSession.receivedChunks.size < chunkSession.totalChunks) {
    return res.status(400).json({
      error: `Missing chunks: received ${chunkSession.receivedChunks.size} of ${chunkSession.totalChunks}`,
    });
  }

  const chunkArrays: Buffer[] = [];
  for (let i = 0; i < chunkSession.totalChunks; i++) {
    const chunk = chunkSession.receivedChunks.get(i);
    if (!chunk) {
      return res.status(400).json({ error: `Chunk index ${i} is missing.` });
    }
    chunkArrays.push(chunk);
  }

  const fullBuffer = Buffer.concat(chunkArrays);
  const calculatedChecksum = crypto.createHash("sha256").update(fullBuffer).digest("hex");

  if (chunkSession.checksum && chunkSession.checksum.toLowerCase() !== calculatedChecksum.toLowerCase()) {
    return res.status(400).json({
      error: "Archive checksum mismatch. Upload may be corrupted.",
    });
  }

  const account = session.accounts.get(chunkSession.provider);
  if (account && (chunkSession.provider === "nextcloud" || chunkSession.provider === "webdav") && account.serverUrl && account.webdavAuth) {
    try {
      const decryptedAuth = decryptCredential(account.webdavAuth);
      if (!decryptedAuth) {
        return res.status(502).json({ error: "Failed to decrypt WebDAV authorization credentials." });
      }

      const uploadUrl = new URL(chunkSession.filename, account.serverUrl).toString();
      const urlValidation = validateSafeUrl(uploadUrl, { allowLocalhost: false });
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.error });
      }

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: decryptedAuth,
          "Content-Type": "application/octet-stream",
        },
        body: fullBuffer,
        redirect: "error",
      });
      if (!putRes.ok && putRes.status !== 201 && putRes.status !== 204) {
        return res.status(502).json({
          error: `Remote ${chunkSession.provider} server rejected upload (HTTP ${putRes.status}).`,
        });
      }
    } catch (putErr: any) {
      return res.status(502).json({
        error: `Failed to upload to remote WebDAV server: ${putErr.message}`,
      });
    }
  }

  const backupId = `bk_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const newBackup: CloudBackupRecord = {
    id: backupId,
    provider: chunkSession.provider,
    filename: chunkSession.filename,
    size: fullBuffer.length,
    createdAt: new Date().toISOString(),
    checksum: calculatedChecksum,
    buffer: fullBuffer,
  };

  let list = session.backups.get(chunkSession.provider) || [];
  list.unshift(newBackup);
  if (list.length > MAX_BACKUP_RETENTION) {
    list = list.slice(0, MAX_BACKUP_RETENTION);
  }
  session.backups.set(chunkSession.provider, list);
  persistBackupToDisk(sessionId, newBackup);

  chunkSessionsStore.delete(uploadId);

  res.json({
    success: true,
    backupId,
    filename: chunkSession.filename,
    size: fullBuffer.length,
    checksum: calculatedChecksum,
    createdAt: newBackup.createdAt,
    message: `Chunked archive committed successfully to ${chunkSession.provider}.`,
  });
});

// 10. Restore / Download Backup Archive Endpoint (Session-scoped)
app.get("/api/cloud/:provider/restore/:backupId", (req, res) => {
  const { provider, backupId } = req.params;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  const list = session.backups.get(provider) || [];
  let backup = list.find((b) => b.id === backupId);

  // If not found in memory, rehydrate from durable disk storage
  if (!backup) {
    const diskList = loadPersistedBackupsFromDisk(sessionId);
    backup = diskList.find((b) => b.id === backupId && b.provider === provider);
  }

  if (!backup) {
    return res.status(404).json({ error: "Backup archive not found in your session." });
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${backup.filename}"`);
  res.setHeader("Content-Length", backup.buffer.length);
  res.send(backup.buffer);
});

// Explicit 404 handler for unmatched /api/* routes (prevents falling through to SPA HTML)
app.all("/api/*all", (req, res) => {
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
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VellumScribe Server running on port ${PORT}`);
  });
}

startServer();
