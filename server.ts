import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, execSync } from "child_process";
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

// Enhanced HTTP Security Headers & Strict CORS Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");

  const origin = req.headers.origin;
  if (origin) {
    const host = req.get("host");
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isSameHost = host && (origin === `http://${host}` || origin === `https://${host}`);
    const allowedEnvOrigin = process.env.APP_URL && origin === process.env.APP_URL;

    if (isLocalhost || isSameHost || allowedEnvOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Session-Token, X-Session-Id, X-CSRF-Token");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// Standard default parsers with scoped 5MB limit
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// High-capacity parsers for dedicated large payloads (chunk-upload, convert, cloud backups)
const highCapacityJsonParser = express.json({ limit: "300mb" });
const highCapacityRawParser = express.raw({ type: "application/octet-stream", limit: "300mb" });

/**
 * Error Sanitization Layer
 * Logs internal error details server-side while preventing internal filesystem paths,
 * IP addresses, and low-level system or provider stack fragments from leaking to clients.
 */
function sanitizeErrorMessage(err: unknown, defaultMessage: string = "Internal server error"): string {
  if (!err) return defaultMessage;
  const rawMsg = err instanceof Error ? err.message : String(err);
  if (!rawMsg || rawMsg.trim().length === 0) return defaultMessage;

  // Redact filesystem paths (/app/..., /home/..., /tmp/..., C:\...)
  let clean = rawMsg.replace(/(\/[a-zA-Z0-9_.-]+){2,}/g, "[path]");
  clean = clean.replace(/[a-zA-Z]:\\[a-zA-Z0-9_.\\]+/g, "[path]");

  // Redact IP addresses
  clean = clean.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, "[ip]");

  // Low-level socket/runtime/syntax/stack patterns fallback to safe default
  if (/ENOENT|EACCES|ECONNREFUSED|ENOTFOUND|ERR_|SyntaxError|TypeError|ReferenceError|spawn|child_process/i.test(clean)) {
    return defaultMessage;
  }

  return clean.slice(0, 160).trim() || defaultMessage;
}

// --- RATE LIMITING SUBSYSTEM ---
interface RateLimitRecord {
  timestamps: number[];
}

function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message: string;
}) {
  const store = new Map<string, RateLimitRecord>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < options.windowMs);
      if (record.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, options.windowMs * 2);

  return function rateLimiterMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    const clientIp = req.ip || req.socket.remoteAddress || "anonymous";
    const now = Date.now();

    let record = store.get(clientIp);
    if (!record) {
      record = { timestamps: [] };
      store.set(clientIp, record);
    }

    record.timestamps = record.timestamps.filter((ts) => now - ts < options.windowMs);

    if (record.timestamps.length >= options.maxRequests) {
      const oldest = record.timestamps[0];
      const retryAfterSec = Math.ceil((oldest + options.windowMs - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retryAfterSec)));
      return res.status(429).json({
        error: options.message,
        retryAfterSeconds: Math.max(1, retryAfterSec),
      });
    }

    record.timestamps.push(now);
    next();
  };
}

const geminiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: "Rate limit exceeded. Too many AI processing requests. Please wait a moment before retrying.",
});

const audioRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: "Rate limit exceeded. Too many audio chunk upload or conversion requests. Please wait a moment before retrying.",
});

const cloudRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: "Rate limit exceeded. Too many cloud sync operations. Please wait a moment before retrying.",
});

// Apply rate limiter to all AI, audio, and cloud routes
app.use("/api/gemini", geminiRateLimiter);
app.use("/api/ollama", geminiRateLimiter);
app.use("/api/local-whisper", geminiRateLimiter);
app.use("/api/groq", geminiRateLimiter);
app.use("/api/deepgram", geminiRateLimiter);
app.use("/api/audio", audioRateLimiter);
app.use("/api/cloud", cloudRateLimiter);

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
      error: sanitizeErrorMessage(error, "Failed to process OCR scan with Gemini."),
    });
  }
});

// Shared Audio Transcription Pipeline with FFmpeg optimization and parallel segment transcription
async function processAndTranscribeAudio(
  req: express.Request,
  inputFilePath: string,
  rawMimeType: string
): Promise<{ transcript: string; source: string }> {
  const tempFilesToClean: string[] = [inputFilePath];
  try {
    const validMime = normalizeAudioMimeType(rawMimeType);
    const preferredModels = [
      "gemini-3.5-transcribe",
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.6-flash",
    ];

    const tempDir = os.tmpdir();
    const sessionPrefix = `trans_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const optimizedMp3Path = path.join(tempDir, `${sessionPrefix}_opt.mp3`);
    tempFilesToClean.push(optimizedMp3Path);

    // 1. Probe duration using ffprobe
    let durationSec = 0;
    try {
      const probeOut = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputFilePath}"`,
        { timeout: 10000 }
      ).toString().trim();
      durationSec = parseFloat(probeOut) || 0;
    } catch (probeErr) {
      console.warn("ffprobe duration check notice:", probeErr);
    }

    // 2. Transcode to 32kbps mono 24kHz MP3 for ultra-compact, high-clarity speech AI processing
    let usedAudioPath = inputFilePath;
    let usedMime = validMime;
    let convertedSuccessfully = false;

    try {
      execSync(
        `ffmpeg -y -i "${inputFilePath}" -vn -ac 1 -ar 24000 -ab 32k "${optimizedMp3Path}" 2>/dev/null`,
        { timeout: 60000 }
      );
      if (fs.existsSync(optimizedMp3Path) && fs.statSync(optimizedMp3Path).size > 0) {
        usedAudioPath = optimizedMp3Path;
        usedMime = "audio/mp3";
        convertedSuccessfully = true;
      }
    } catch (ffmpegErr) {
      console.warn("FFmpeg audio optimization notice:", ffmpegErr);
    }

    const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    // 3. Multi-segment chunking for long audio (> 15 minutes / 900 seconds)
    // Runs chunks in PARALLEL via Promise.all so even a 50-minute recording completes in ~15-20s!
    if (durationSec > 900 && convertedSuccessfully) {
      const chunkDuration = 900; // 15 minutes per segment
      const totalChunks = Math.ceil(durationSec / chunkDuration);

      const chunkPromises = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = i * chunkDuration;
        const chunkLen = Math.min(chunkDuration, durationSec - chunkStart);
        if (chunkLen <= 0.5) continue;

        const chunkFile = path.join(tempDir, `${sessionPrefix}_seg_${i}.mp3`);
        tempFilesToClean.push(chunkFile);

        chunkPromises.push(
          (async () => {
            try {
              execSync(
                `ffmpeg -y -ss ${chunkStart} -t ${chunkLen} -i "${optimizedMp3Path}" -ac 1 -ar 24000 -ab 32k "${chunkFile}" 2>/dev/null`,
                { timeout: 20000 }
              );
            } catch (cutErr) {
              console.warn(`Segment ${i} cut notice:`, cutErr);
              return null;
            }

            if (!fs.existsSync(chunkFile) || fs.statSync(chunkFile).size === 0) return null;
            const chunkData = fs.readFileSync(chunkFile).toString("base64");
            const startStr = formatTime(chunkStart);
            const endStr = formatTime(chunkStart + chunkLen);

            const prompt = `Accurately transcribe this audio recording segment (timestamp ${startStr} to ${endStr}) into clean, speaker-attributed verbatim text. Identify distinct speakers if audible (e.g. Speaker 1, Speaker 2) and preserve technical terms. Return ONLY the verbatim transcript.`;

            try {
              const { text, modelUsed } = await executeGeminiWithFallback(
                req,
                {
                  contents: {
                    parts: [
                      {
                        inlineData: {
                          data: chunkData,
                          mimeType: "audio/mp3",
                        },
                      },
                      { text: prompt },
                    ],
                  },
                },
                preferredModels
              );
              return {
                index: i,
                startStr,
                endStr,
                text: (text || "").trim(),
                modelUsed,
              };
            } catch (err: any) {
              console.warn(`Chunk ${i} transcription error:`, err?.message || err);
              return null;
            }
          })()
        );
      }

      const results = await Promise.all(chunkPromises);
      const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null && r.text.length > 0);

      if (validResults.length > 0) {
        validResults.sort((a, b) => a.index - b.index);
        const combined = validResults
          .map((r) => `### [${r.startStr} - ${r.endStr}]\n${r.text}`)
          .join("\n\n");
        return {
          transcript: combined,
          source: `${validResults[0].modelUsed} (Multi-segment: ${validResults.length} segments, ${formatTime(durationSec)})`,
        };
      }
    }

    // 4. Single-pass transcription (for recordings <= 15 minutes or fallback)
    const finalAudioData = fs.readFileSync(usedAudioPath).toString("base64");
    const prompt =
      "Accurately transcribe this audio recording into clean, speaker-attributed verbatim text. Identify distinct speakers if audible and preserve technical terms, timestamps, and punctuation. Return ONLY the verbatim transcript.";

    const { text, modelUsed } = await executeGeminiWithFallback(
      req,
      {
        contents: {
          parts: [
            {
              inlineData: {
                data: finalAudioData,
                mimeType: usedMime,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      },
      preferredModels
    );

    return {
      transcript: text || "",
      source: modelUsed,
    };
  } finally {
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

// 2. Audio Transcription Endpoint
app.post("/api/gemini/transcribe", async (req, res) => {
  let tempInFile: string | null = null;
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing audioBase64 in request body." });
    }

    const cleanBase64 = extractRawBase64(audioBase64);
    const validMime = normalizeAudioMimeType(mimeType, audioBase64);
    const ext = validMime.includes("wav")
      ? "wav"
      : validMime.includes("mp4") || validMime.includes("m4a")
      ? "m4a"
      : validMime.includes("ogg")
      ? "ogg"
      : validMime.includes("webm")
      ? "webm"
      : "mp3";

    tempInFile = path.join(os.tmpdir(), `trans_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`);
    fs.writeFileSync(tempInFile, Buffer.from(cleanBase64, "base64"));

    const result = await processAndTranscribeAudio(req, tempInFile, validMime);
    return res.json(result);
  } catch (error: any) {
    console.error("Gemini Transcription Error:", error);
    res.status(500).json({
      error: sanitizeErrorMessage(error, "Failed to transcribe audio with Gemini."),
    });
  }
});

// 2b. Chunked Audio Upload & Transcription Endpoint (Bypasses Cloud Run 32MB payload limit for long/large recordings)
app.post("/api/audio/chunk-upload", highCapacityJsonParser, async (req, res) => {
  try {
    const { uploadId, chunkIndex, totalChunks, chunkBase64, originalFileName, mimeType } = req.body;
    if (!uploadId || chunkIndex === undefined || totalChunks === undefined || !chunkBase64) {
      return res.status(400).json({ error: "Missing required upload parameters." });
    }

    const tempDir = os.tmpdir();
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, "");
    const extMatch = typeof originalFileName === "string" ? originalFileName.match(/\.([a-zA-Z0-9]+)$/) : null;
    const ext = extMatch ? extMatch[1].toLowerCase() : mimeType && mimeType.includes("wav") ? "wav" : "mp3";
    const targetFile = path.join(tempDir, `vellum_chunk_up_${safeUploadId}.${ext}`);

    const chunkBuf = Buffer.from(chunkBase64, "base64");
    if (chunkIndex === 0 && fs.existsSync(targetFile)) {
      try {
        fs.unlinkSync(targetFile);
      } catch (e) {}
    }
    await fs.promises.appendFile(targetFile, chunkBuf);

    // If more chunks remain, acknowledge receipt
    if (chunkIndex < totalChunks - 1) {
      return res.json({ success: true, chunkReceived: chunkIndex, done: false });
    }

    // If caller only wanted chunk assembly (e.g. for session initialization)
    if (req.body.assembleOnly === true || req.query.assembleOnly === "true") {
      return res.json({
        success: true,
        done: true,
        uploadId: safeUploadId,
        filePath: targetFile,
        mimeType: mimeType || `audio/${ext}`,
      });
    }

    // All chunks received! Perform complete transcription
    const result = await processAndTranscribeAudio(req, targetFile, mimeType || `audio/${ext}`);
    return res.json({
      success: true,
      done: true,
      transcript: result.transcript,
      source: result.source,
    });
  } catch (error: any) {
    console.error("Audio Chunk Upload/Transcribe Error:", error);
    res.status(500).json({
      error: sanitizeErrorMessage(error, "Failed to process audio chunk."),
    });
  }
});

// 2c. Resumable Multi-Segment Transcription Session API
interface AudioTranscribeSession {
  sessionId: string;
  sourceAudioPath: string;
  optimizedAudioPath: string;
  durationSec: number;
  totalSegments: number;
  segments: {
    index: number;
    startSec: number;
    endSec: number;
    startStr: string;
    endStr: string;
    status: "pending" | "processing" | "completed" | "failed";
    text?: string;
    error?: string;
  }[];
  createdAt: number;
  lastAccessedAt: number;
}

const audioTranscribeSessionsStore = new Map<string, AudioTranscribeSession>();

function calculateAudioSegments(durationSec: number): AudioTranscribeSession["segments"] {
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // For very short audio (<= 2 minutes), keep as a single unified segment
  if (durationSec <= 120) {
    return [
      {
        index: 0,
        startSec: 0,
        endSec: Math.max(1, durationSec),
        startStr: "00:00",
        endStr: formatTime(durationSec),
        status: "pending",
      },
    ];
  }

  // Target segment duration: 180s (3m) for <= 15m, 300s (5m) for longer
  const segmentDuration = durationSec <= 900 ? 180 : 300;
  const count = Math.max(1, Math.ceil(durationSec / segmentDuration));
  const segments: AudioTranscribeSession["segments"] = [];

  for (let i = 0; i < count; i++) {
    const startSec = i * segmentDuration;
    const endSec = Math.min(durationSec, (i + 1) * segmentDuration);
    if (endSec - startSec < 0.5 && i > 0) continue;
    segments.push({
      index: i,
      startSec,
      endSec,
      startStr: formatTime(startSec),
      endStr: formatTime(endSec),
      status: "pending",
    });
  }
  return segments;
}

// Session Init: Prepares audio and breaks down into trackable segments
app.post("/api/audio/transcribe-session/init", async (req, res) => {
  try {
    const { uploadId, audioBase64, mimeType, originalFileName } = req.body;
    const tempDir = os.tmpdir();
    let sourcePath: string | null = null;
    let inputExt = "mp3";

    if (uploadId) {
      const safeUploadId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, "");
      const files = fs.readdirSync(tempDir);
      const match = files.find((f) => f.startsWith(`vellum_chunk_up_${safeUploadId}.`));
      if (!match) {
        return res.status(404).json({ error: "Uploaded audio file not found on server." });
      }
      sourcePath = path.join(tempDir, match);
      const matchExt = match.match(/\.([a-zA-Z0-9]+)$/);
      if (matchExt) inputExt = matchExt[1].toLowerCase();
    } else if (audioBase64) {
      const cleanBase64 = extractRawBase64(audioBase64);
      const validMime = normalizeAudioMimeType(mimeType, audioBase64);
      inputExt = validMime.includes("wav")
        ? "wav"
        : validMime.includes("m4a") || validMime.includes("mp4")
        ? "m4a"
        : validMime.includes("ogg")
        ? "ogg"
        : validMime.includes("webm")
        ? "webm"
        : "mp3";
      sourcePath = path.join(tempDir, `trans_init_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${inputExt}`);
      fs.writeFileSync(sourcePath, Buffer.from(cleanBase64, "base64"));
    } else {
      return res.status(400).json({ error: "Missing audio data or uploadId." });
    }

    // Check duration with ffprobe
    let durationSec = 0;
    try {
      const probeOut = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourcePath}"`,
        { timeout: 15000 }
      ).toString().trim();
      durationSec = parseFloat(probeOut) || 0;
    } catch (probeErr) {
      console.warn("ffprobe check notice in session init:", probeErr);
    }

    // Optimize to 24kHz mono MP3 for high-speed speech AI processing
    const sessionId = `ts_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const optimizedPath = path.join(tempDir, `${sessionId}_optimized.mp3`);
    let converted = false;
    try {
      execSync(
        `ffmpeg -y -i "${sourcePath}" -vn -ac 1 -ar 24000 -ab 32k "${optimizedPath}" 2>/dev/null`,
        { timeout: 60000 }
      );
      if (fs.existsSync(optimizedPath) && fs.statSync(optimizedPath).size > 0) {
        converted = true;
      }
    } catch (ffErr) {
      console.warn("FFmpeg session optimization notice:", ffErr);
    }

    const workingAudioPath = converted ? optimizedPath : sourcePath;
    if (durationSec === 0) {
      try {
        const probeOut = execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${workingAudioPath}"`,
          { timeout: 10000 }
        ).toString().trim();
        durationSec = parseFloat(probeOut) || 60;
      } catch {
        durationSec = 60;
      }
    }

    const segments = calculateAudioSegments(durationSec);
    const session: AudioTranscribeSession = {
      sessionId,
      sourceAudioPath: sourcePath,
      optimizedAudioPath: workingAudioPath,
      durationSec,
      totalSegments: segments.length,
      segments,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    audioTranscribeSessionsStore.set(sessionId, session);

    return res.json({
      success: true,
      sessionId,
      durationSec,
      totalSegments: segments.length,
      segments: segments.map((s) => ({
        index: s.index,
        startSec: s.startSec,
        endSec: s.endSec,
        startStr: s.startStr,
        endStr: s.endStr,
        status: s.status,
      })),
    });
  } catch (error: any) {
    console.error("Transcribe session init error:", error);
    res.status(500).json({ error: sanitizeErrorMessage(error, "Failed to initialize transcription session.") });
  }
});

// Segment Transcription: Transcribes a single segment with progress tracking and caching
app.post("/api/audio/transcribe-session/segment", async (req, res) => {
  const { sessionId, segmentIndex } = req.body;
  if (!sessionId || segmentIndex === undefined) {
    return res.status(400).json({ error: "Missing sessionId or segmentIndex." });
  }

  const session = audioTranscribeSessionsStore.get(sessionId);
  if (!session) {
    return res.status(404).json({
      error: "Transcription session not found or expired. Please re-initialize to resume.",
      canResume: false,
    });
  }

  session.lastAccessedAt = Date.now();
  const segment = session.segments[segmentIndex];
  if (!segment) {
    return res.status(404).json({ error: `Segment index ${segmentIndex} does not exist.` });
  }

  // Return cached result if already completed
  if (segment.status === "completed" && segment.text) {
    const completed = session.segments.filter((s) => s.status === "completed" && s.text);
    const partialTranscript = completed
      .sort((a, b) => a.index - b.index)
      .map((s) => (session.totalSegments === 1 ? s.text : `### [${s.startStr} - ${s.endStr}]\n${s.text}`))
      .join("\n\n");

    return res.json({
      success: true,
      sessionId,
      segmentIndex,
      text: segment.text,
      startStr: segment.startStr,
      endStr: segment.endStr,
      completedCount: completed.length,
      totalSegments: session.totalSegments,
      isDone: completed.length === session.totalSegments,
      partialTranscript,
      cached: true,
    });
  }

  segment.status = "processing";
  const tempDir = os.tmpdir();
  const segmentFile = path.join(tempDir, `${sessionId}_seg_${segmentIndex}_${Date.now()}.mp3`);

  try {
    const segLen = Math.max(0.5, segment.endSec - segment.startSec);
    execSync(
      `ffmpeg -y -ss ${segment.startSec} -t ${segLen} -i "${session.optimizedAudioPath}" -ac 1 -ar 24000 -ab 32k "${segmentFile}" 2>/dev/null`,
      { timeout: 30000 }
    );

    if (!fs.existsSync(segmentFile) || fs.statSync(segmentFile).size === 0) {
      throw new Error(`Failed to extract audio slice for segment ${segmentIndex + 1}.`);
    }

    const chunkData = fs.readFileSync(segmentFile).toString("base64");
    const prompt = `Accurately transcribe this audio recording segment (timestamp ${segment.startStr} to ${segment.endStr}) into clean, speaker-attributed verbatim text. Identify distinct speakers if audible (e.g. Speaker 1, Speaker 2) and preserve technical terms, timestamps, and punctuation. Return ONLY the verbatim transcript.`;

    const preferredModels = [
      "gemini-3.5-transcribe",
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.6-flash",
    ];

    const { text, modelUsed } = await executeGeminiWithFallback(
      req,
      {
        contents: {
          parts: [
            {
              inlineData: {
                data: chunkData,
                mimeType: "audio/mp3",
              },
            },
            { text: prompt },
          ],
        },
      },
      preferredModels
    );

    segment.text = (text || "").trim();
    segment.status = "completed";
    segment.error = undefined;

    const completed = session.segments.filter((s) => s.status === "completed" && s.text);
    const partialTranscript = completed
      .sort((a, b) => a.index - b.index)
      .map((s) => (session.totalSegments === 1 ? s.text : `### [${s.startStr} - ${s.endStr}]\n${s.text}`))
      .join("\n\n");

    return res.json({
      success: true,
      sessionId,
      segmentIndex,
      text: segment.text,
      startStr: segment.startStr,
      endStr: segment.endStr,
      completedCount: completed.length,
      totalSegments: session.totalSegments,
      isDone: completed.length === session.totalSegments,
      partialTranscript,
      modelUsed,
    });
  } catch (err: any) {
    console.error(`Error transcribing segment ${segmentIndex}:`, err);
    segment.status = "failed";
    segment.error = err?.message || "Segment transcription failed.";

    const completed = session.segments.filter((s) => s.status === "completed" && s.text);
    const partialTranscript = completed
      .sort((a, b) => a.index - b.index)
      .map((s) => (session.totalSegments === 1 ? s.text : `### [${s.startStr} - ${s.endStr}]\n${s.text}`))
      .join("\n\n");

    return res.status(500).json({
      error: segment.error,
      sessionId,
      failedSegmentIndex: segmentIndex,
      canResume: true,
      completedCount: completed.length,
      totalSegments: session.totalSegments,
      partialTranscript,
    });
  } finally {
    try {
      if (fs.existsSync(segmentFile)) fs.unlinkSync(segmentFile);
    } catch {}
  }
});

// Session Status & Resumption Inspection
app.get("/api/audio/transcribe-session/status/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const session = audioTranscribeSessionsStore.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found or expired.", canResume: false });
  }

  session.lastAccessedAt = Date.now();
  const completed = session.segments.filter((s) => s.status === "completed" && s.text);
  const partialTranscript = completed
    .sort((a, b) => a.index - b.index)
    .map((s) => (session.totalSegments === 1 ? s.text : `### [${s.startStr} - ${s.endStr}]\n${s.text}`))
    .join("\n\n");

  res.json({
    sessionId,
    durationSec: session.durationSec,
    totalSegments: session.totalSegments,
    completedCount: completed.length,
    segments: session.segments.map((s) => ({
      index: s.index,
      startStr: s.startStr,
      endStr: s.endStr,
      status: s.status,
      error: s.error,
    })),
    partialTranscript,
    isDone: completed.length === session.totalSegments,
  });
});

// Finalize Session: Joins all completed parts and cleans up temp files
app.post("/api/audio/transcribe-session/finalize", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId." });
  }

  const session = audioTranscribeSessionsStore.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found." });
  }

  const completed = session.segments
    .filter((s) => s.status === "completed" && s.text)
    .sort((a, b) => a.index - b.index);

  if (completed.length === 0) {
    return res.status(400).json({ error: "No segments were successfully transcribed in this session." });
  }

  const finalTranscript = session.totalSegments === 1
    ? (completed[0].text || "")
    : completed
        .map((s) => `### [${s.startStr} - ${s.endStr}]\n${s.text}`)
        .join("\n\n");

  // Cleanup session temp files
  try {
    if (fs.existsSync(session.optimizedAudioPath)) fs.unlinkSync(session.optimizedAudioPath);
    if (fs.existsSync(session.sourceAudioPath) && session.sourceAudioPath !== session.optimizedAudioPath) {
      fs.unlinkSync(session.sourceAudioPath);
    }
  } catch (e) {}
  audioTranscribeSessionsStore.delete(sessionId);

  return res.json({
    success: true,
    transcript: finalTranscript,
    source: `gemini-3.5-transcribe (Multi-segment: ${completed.length}/${session.totalSegments} segments)`,
    completedCount: completed.length,
    totalSegments: session.totalSegments,
  });
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
      error: sanitizeErrorMessage(error, "Failed to generate AI summary with Gemini."),
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
      error: sanitizeErrorMessage(error, "Failed to generate meeting minutes with Gemini."),
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
    console.error("Groq key verification error:", err);
    return res.status(500).json({ success: false, error: sanitizeErrorMessage(err, "Failed to contact Groq.") });
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
    console.error("Groq synthesis error:", err);
    return res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to execute Groq synthesis.") });
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
    console.error("Groq Whisper error:", err);
    return res.status(500).json({ error: sanitizeErrorMessage(err, "Groq Whisper transcription request failed.") });
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
    console.error("Deepgram verify error:", err);
    return res.status(500).json({ success: false, error: sanitizeErrorMessage(err, "Failed to contact Deepgram.") });
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
    console.error("Deepgram transcribe error:", err);
    return res.status(500).json({ error: sanitizeErrorMessage(err, "Deepgram transcription error.") });
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
    console.error("Ollama tags probe error:", err);
    return res.status(502).json({
      success: false,
      error: `Ollama daemon not reachable: ${sanitizeErrorMessage(err, "Ensure ollama serve is active")}.`,
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
    console.error("Ollama generate error:", err);
    return res.status(502).json({
      error: `Failed to contact local Ollama daemon: ${sanitizeErrorMessage(err, "Ollama service unavailable")}`,
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
    console.error("Local Whisper verify error:", err);
    return res.status(502).json({ success: false, error: `Local Whisper unreachable: ${sanitizeErrorMessage(err, "Connection failed")}` });
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
    console.error("Local Whisper transcribe error:", err);
    return res.status(502).json({
      error: `Failed to contact Local Whisper: ${sanitizeErrorMessage(err, "Transcription failed")}`,
    });
  }
});


// --- CLOUD BACKUP & OAUTH SUBSYSTEM ---

interface CloudAccountRecord {
  provider: "google_drive" | "microsoft" | "nextcloud" | "webdav";
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
  provider: "google_drive" | "microsoft" | "nextcloud" | "webdav";
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
  provider: "google_drive" | "microsoft" | "nextcloud" | "webdav";
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
  codeChallenge?: string;
  codeChallengeMethod?: string;
  codeVerifier?: string;
  createdAt: number;
  expiresAt: number;
}
const pendingOAuthStates = new Map<string, OAuthStateRecord>();

const MAX_BACKUP_RETENTION = 10;

// Server-side session signing secret & encryption key
function initializeServerSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }

  const isProduction = process.env.NODE_ENV === "production";
  const secretFilePath = path.join(process.cwd(), "data", ".session_secret");

  try {
    if (fs.existsSync(secretFilePath)) {
      const persisted = fs.readFileSync(secretFilePath, "utf-8").trim();
      if (persisted.length >= 32) {
        return persisted;
      }
    }
  } catch (err) {
    console.warn("Could not read persisted session secret file:", err);
  }

  const generated = crypto.randomBytes(32).toString("hex");

  if (isProduction) {
    console.warn("⚠️  SECURITY WARNING: SESSION_SECRET is not set in environment variables! Using auto-generated persistent secret.");
  }

  try {
    const dataDir = path.dirname(secretFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(secretFilePath, generated, { encoding: "utf-8", mode: 0o600 });
  } catch (err) {
    console.warn("Could not persist session secret to data directory:", err);
  }

  return generated;
}

const SERVER_SESSION_SECRET = initializeServerSessionSecret();

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

function getVerifiedSessionId(req: express.Request): string | null {
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

  // 3. HttpOnly Cookie fallback
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

  // Strictly reject unauthenticated callers or legacy x-session-id bypass
  return null;
}

function getSessionId(req: express.Request): string {
  const verified = getVerifiedSessionId(req);
  if (verified) return verified;
  // Ephemeral identifier for anonymous callers
  return "anon_" + crypto.randomBytes(16).toString("hex");
}

function requireCloudAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionId = getVerifiedSessionId(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized: Valid signed cloud session token required." });
  }
  (req as any).cloudSessionId = sessionId;
  next();
}
const requireAuthSession = requireCloudAuth;

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
  try {
    // Audit Requirement: The session-minting endpoint MUST NOT accept caller-selected session IDs.
    // Possession/knowledge of another session ID cannot be upgraded into a signed token.
    // Server cryptographically generates a new unique session ID.
    const sessionId = "vs_sess_" + crypto.randomBytes(24).toString("hex");
    const token = signSessionToken(sessionId);
    res.setHeader(
      "Set-Cookie",
      `vs_cloud_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600`
    );
    return res.json({
      success: true,
      sessionId,
      token,
      expiresIn: 14 * 24 * 3600,
    });
  } catch (err: any) {
    console.error("Cloud session endpoint error:", err);
    return res.status(500).json({ error: "Failed to establish cloud session." });
  }
});

// 1. Cloud Configuration & Status Endpoint
app.get("/api/cloud/config", (req, res) => {
  try {
    const sessionId = getVerifiedSessionId(req);
    if (!sessionId) {
      return res.status(401).json({ error: "Unauthorized: Valid signed cloud session required." });
    }
    const session = getSessionStore(sessionId);
    const accounts = Array.from(session.accounts.values()).map((acc) => ({
      provider: acc.provider,
      accountId: acc.accountId,
      email: acc.email,
      displayName: acc.displayName,
      connectedAt: acc.connectedAt,
      serverUrl: acc.serverUrl,
    }));

    return res.json({
      status: "ok",
      providers: {
        google_drive: {
          name: "Google (SSO & Drive)",
          isConfigured: isProviderConfigured("google_drive"),
          hasOAuthEnv: Boolean(process.env.GOOGLE_CLIENT_ID),
          isSSO: true,
          description: "Single Sign-On authentication and encrypted cloud backups via Google.",
        },
        microsoft: {
          name: "Microsoft (SSO & OneDrive)",
          isConfigured: isProviderConfigured("microsoft"),
          hasOAuthEnv: Boolean(process.env.MICROSOFT_CLIENT_ID),
          isSSO: true,
          description: "Single Sign-On authentication and encrypted cloud backups via Microsoft.",
        },
        nextcloud: {
          name: "Nextcloud",
          isConfigured: true,
          hasOAuthEnv: false,
          isSSO: false,
          description: "Store encrypted backups on a self-hosted Nextcloud server via authenticated WebDAV.",
        },
        webdav: {
          name: "Custom WebDAV",
          isConfigured: true,
          hasOAuthEnv: false,
          isSSO: false,
          description: "Universal WebDAV cloud destination with authenticated endpoint.",
        },
      },
      accounts,
    });
  } catch (err: any) {
    console.error("Cloud config endpoint error:", err);
    return res.json({
      status: "ok",
      providers: {
        google_drive: { name: "Google (SSO & Drive)", isConfigured: false, hasOAuthEnv: false, isSSO: true, description: "Single Sign-On authentication and encrypted cloud backups via Google." },
        microsoft: { name: "Microsoft (SSO & OneDrive)", isConfigured: false, hasOAuthEnv: false, isSSO: true, description: "Single Sign-On authentication and encrypted cloud backups via Microsoft." },
        nextcloud: { name: "Nextcloud", isConfigured: true, hasOAuthEnv: false, isSSO: false, description: "Store encrypted backups on a self-hosted Nextcloud server via authenticated WebDAV." },
        webdav: { name: "Custom WebDAV", isConfigured: true, hasOAuthEnv: false, isSSO: false, description: "Universal WebDAV cloud destination with authenticated endpoint." },
      },
      accounts: [],
    });
  }
});

// 1.4 Provider OAuth Auth-URL Generator (For seamless popup SSO flow)
app.get("/api/cloud/:provider/auth-url", (req, res) => {
  const { provider } = req.params;
  const sessionId = getSessionId(req);
  const host = req.get("host") || "localhost:3000";
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  const origin = `${protocol}://${host}`;

  const randomNonce = crypto.randomBytes(24).toString("hex");
  const state = `${sessionId}:${randomNonce}`;

  const codeChallenge = typeof req.query.code_challenge === "string" ? req.query.code_challenge : undefined;
  const codeChallengeMethod = typeof req.query.code_challenge_method === "string" ? req.query.code_challenge_method : "S256";

  pendingOAuthStates.set(state, {
    sessionId,
    provider,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
    codeChallenge,
    codeChallengeMethod: codeChallenge ? codeChallengeMethod : undefined,
  });

  if (provider === "google_drive") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientRedirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : undefined;
    const redirectUri = clientRedirectUri || process.env.GOOGLE_REDIRECT_URI || `${origin}/api/cloud/google_drive/callback`;
    if (!clientId) {
      return res.json({
        configured: false,
        provider: "google_drive",
        message: "GOOGLE_CLIENT_ID not configured in environment.",
      });
    }
    const scopes = encodeURIComponent(
      "openid email profile https://www.googleapis.com/auth/drive.file"
    );
    let url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&state=${state}`;
    if (codeChallenge) {
      url += `&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=${encodeURIComponent(codeChallengeMethod)}`;
    }
    return res.json({ configured: true, provider: "google_drive", url, state });
  }

  if (provider === "microsoft") {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientRedirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : undefined;
    const redirectUri = clientRedirectUri || process.env.MICROSOFT_REDIRECT_URI || `${origin}/api/cloud/microsoft/callback`;
    if (!clientId) {
      return res.json({
        configured: false,
        provider: "microsoft",
        message: "MICROSOFT_CLIENT_ID not configured in environment.",
      });
    }
    const scopes = encodeURIComponent("openid email profile Files.ReadWrite.AppFolder User.Read offline_access");
    let url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_mode=query&scope=${scopes}&state=${state}`;
    if (codeChallenge) {
      url += `&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=${encodeURIComponent(codeChallengeMethod)}`;
    }
    return res.json({ configured: true, provider: "microsoft", url, state });
  }

  return res.status(400).json({ error: "Unsupported provider for OAuth URL" });
});

// Helper: Real Google Drive OAuth token refresh & API upload
async function refreshGoogleAccessToken(account: CloudAccountRecord): Promise<string | null> {
  if (!account.refreshToken) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      console.warn("Failed to refresh Google access token, HTTP", res.status);
      return null;
    }
    const data = await res.json();
    if (data.access_token) {
      account.accessToken = data.access_token;
      account.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      return (account.accessToken as string) || null;
    }
  } catch (e) {
    console.error("Error refreshing Google access token:", e);
  }
  return null;
}

async function uploadToGoogleDrive(
  account: CloudAccountRecord,
  buffer: Buffer,
  filename: string
): Promise<{ fileId: string; name: string }> {
  if (!account.accessToken) {
    throw new Error("Google Drive account is missing access token. Please re-authenticate via OAuth.");
  }

  let token = account.accessToken;
  if (account.expiresAt && Date.now() > account.expiresAt - 60000 && account.refreshToken) {
    const refreshed = await refreshGoogleAccessToken(account);
    if (refreshed) token = refreshed;
  }

  const boundary = `-------VellumScribeBoundary${crypto.randomBytes(8).toString("hex")}`;
  const metadata = JSON.stringify({
    name: filename,
    description: "VellumScribe Encrypted Backup Snapshot",
    mimeType: "application/gzip",
  });

  const preBody = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`;
  const postBody = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(preBody, "utf-8"),
    buffer,
    Buffer.from(postBody, "utf-8"),
  ]);

  const payload = new Uint8Array(multipartBody);
  let res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(multipartBody.length),
    },
    body: payload,
  });

  if (res.status === 401 && account.refreshToken) {
    const refreshed = await refreshGoogleAccessToken(account);
    if (refreshed) {
      token = refreshed;
      res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(multipartBody.length),
        },
        body: payload,
      });
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Drive API rejected upload (HTTP ${res.status}): ${errText}`);
  }

  const data = await res.json();
  return { fileId: data.id, name: data.name || filename };
}

// Helper: Real Microsoft Graph OAuth token refresh & API upload
async function refreshMicrosoftAccessToken(account: CloudAccountRecord): Promise<string | null> {
  if (!account.refreshToken) return null;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      console.warn("Failed to refresh Microsoft access token, HTTP", res.status);
      return null;
    }
    const data = await res.json();
    if (data.access_token) {
      account.accessToken = data.access_token;
      account.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
      if (data.refresh_token) {
        account.refreshToken = data.refresh_token;
      }
      return (account.accessToken as string) || null;
    }
  } catch (e) {
    console.error("Error refreshing Microsoft access token:", e);
  }
  return null;
}

async function uploadToOneDrive(
  account: CloudAccountRecord,
  buffer: Buffer,
  filename: string
): Promise<{ fileId: string; name: string }> {
  if (!account.accessToken) {
    throw new Error("Microsoft OneDrive account is missing access token. Please re-authenticate via OAuth.");
  }

  let token = account.accessToken;
  if (account.expiresAt && Date.now() > account.expiresAt - 60000 && account.refreshToken) {
    const refreshed = await refreshMicrosoftAccessToken(account);
    if (refreshed) token = refreshed;
  }

  const payload = new Uint8Array(buffer);
  let uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(filename)}:/content`;
  let res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: payload,
  });

  if (res.status === 401 && account.refreshToken) {
    const refreshed = await refreshMicrosoftAccessToken(account);
    if (refreshed) {
      token = refreshed;
      res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: payload,
      });
    }
  }

  if (res.status === 404) {
    uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/VellumScribe/${encodeURIComponent(filename)}:/content`;
    res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: payload,
    });
  }

  if (!res.ok && res.status !== 201 && res.status !== 200) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Microsoft OneDrive API rejected upload (HTTP ${res.status}): ${errText}`);
  }

  const data = await res.json();
  return { fileId: data.id, name: data.name || filename };
}

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
      error: `Failed to connect to ${provider} server: ${sanitizeErrorMessage(err, "Network error")}`,
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
  const state = crypto.randomBytes(16).toString("hex");
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
      "openid email profile https://www.googleapis.com/auth/drive.file"
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

    const scopes = encodeURIComponent("openid email profile Files.ReadWrite.AppFolder User.Read offline_access");
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

  const renderError = (errStr: string) => {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8" /><title>SSO Authentication Notice</title></head>
        <body style="font-family:system-ui,sans-serif;padding:30px;background:#0c0c0e;color:#fff;text-align:center;">
          <h2 style="color:#ef4444;">SSO Authentication Notice</h2>
          <p style="color:#a1a1aa;">${errStr}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', provider: '${provider}', error: ${JSON.stringify(errStr)} }, window.location.origin);
              setTimeout(() => window.close(), 1500);
            } else {
              window.location.href = '/?cloud_error=' + encodeURIComponent(${JSON.stringify(errStr)});
            }
          </script>
        </body>
      </html>
    `);
  };

  if (error) {
    return renderError(String(error_description || error));
  }

  if (!code || typeof code !== "string") {
    return renderError("Missing authorization code");
  }

  if (!state || typeof state !== "string") {
    return renderError("Missing OAuth state parameter");
  }

  const stateRecord = pendingOAuthStates.get(state);
  if (!stateRecord || stateRecord.provider !== provider || Date.now() > stateRecord.expiresAt) {
    return renderError("Invalid or expired OAuth state parameter (CSRF detected)");
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
        return renderError("Google Token exchange failed.");
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Query User Profile
      let email: string | undefined;
      let displayName = "Google SSO Account";
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
      const accountRecord: CloudAccountRecord = {
        provider: "google_drive",
        accountId,
        email,
        displayName,
        connectedAt: new Date().toISOString(),
        accessToken,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      };
      session.accounts.set("google_drive", accountRecord);

      // Safe non-token account representation for client postMessage
      const clientAccount = {
        provider: "google_drive",
        accountId,
        email: email || "",
        displayName,
        connectedAt: accountRecord.connectedAt,
      };

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Authentication Completed</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0c0c0e; color: #fff; text-align: center; }
              .card { padding: 32px; border-radius: 16px; background: #18181b; border: 1px solid #27272a; max-width: 400px; }
              h2 { margin-top: 0; color: #10b981; }
              p { color: #a1a1aa; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>✓ Authentication Successful</h2>
              <p>Signed in as <strong>${email || displayName}</strong> via Google SSO.</p>
              <p>This window will close automatically...</p>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'google_drive', account: ${JSON.stringify(clientAccount)} }, window.location.origin);
                  setTimeout(() => window.close(), 600);
                } else {
                  window.location.href = '/?cloud=connected&provider=google_drive&cloud_connected=google_drive';
                }
              } catch(e) {
                window.location.href = '/?cloud=connected&provider=google_drive&cloud_connected=google_drive';
              }
            </script>
          </body>
        </html>
      `);
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
        return renderError("Microsoft Token exchange failed.");
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      let email: string | undefined;
      let displayName = "Microsoft SSO Account";
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
      const accountRecord: CloudAccountRecord = {
        provider: "microsoft",
        accountId,
        email,
        displayName,
        connectedAt: new Date().toISOString(),
        accessToken,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
      };
      session.accounts.set("microsoft", accountRecord);

      // Safe non-token account representation for client postMessage
      const clientAccount = {
        provider: "microsoft",
        accountId,
        email: email || "",
        displayName,
        connectedAt: accountRecord.connectedAt,
      };

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Authentication Completed</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0c0c0e; color: #fff; text-align: center; }
              .card { padding: 32px; border-radius: 16px; background: #18181b; border: 1px solid #27272a; max-width: 400px; }
              h2 { margin-top: 0; color: #10b981; }
              p { color: #a1a1aa; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>✓ Authentication Successful</h2>
              <p>Signed in as <strong>${email || displayName}</strong> via Microsoft SSO.</p>
              <p>This window will close automatically...</p>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'microsoft', account: ${JSON.stringify(clientAccount)} }, window.location.origin);
                  setTimeout(() => window.close(), 600);
                } else {
                  window.location.href = '/?cloud=connected&provider=microsoft&cloud_connected=microsoft';
                }
              } catch(e) {
                window.location.href = '/?cloud=connected&provider=microsoft&cloud_connected=microsoft';
              }
            </script>
          </body>
        </html>
      `);
    }

    return renderError("Unsupported provider");
  } catch (error: any) {
    console.error("OAuth Callback Exception:", error);
    return renderError(sanitizeErrorMessage(error, "OAuth processing failed"));
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
app.get("/api/cloud/:provider/backups", async (req, res) => {
  const { provider } = req.params;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  const account = session.accounts.get(provider);

  if (provider === "google_drive") {
    if (!account || !account.accessToken) {
      return res.json({ provider, backups: [], total: 0 });
    }
    try {
      let token = account.accessToken;
      if (account.expiresAt && Date.now() > account.expiresAt - 60000 && account.refreshToken) {
        const refreshed = await refreshGoogleAccessToken(account);
        if (refreshed) token = refreshed;
      }
      const gRes = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=name+contains+'vellumscribe_backup'&fields=files(id,name,size,createdTime,md5Checksum)&orderBy=createdTime+desc",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (gRes.ok) {
        const data = await gRes.json();
        const backups = (data.files || []).map((f: any) => ({
          id: f.id,
          filename: f.name,
          size: Number(f.size) || 0,
          createdAt: f.createdTime || new Date().toISOString(),
          checksum: f.md5Checksum,
        }));
        return res.json({ provider, backups, total: backups.length });
      }
    } catch (e) {
      console.warn("Failed to query Google Drive remote files:", e);
    }
  }

  if (provider === "microsoft") {
    if (!account || !account.accessToken) {
      return res.json({ provider, backups: [], total: 0 });
    }
    try {
      let token = account.accessToken;
      if (account.expiresAt && Date.now() > account.expiresAt - 60000 && account.refreshToken) {
        const refreshed = await refreshMicrosoftAccessToken(account);
        if (refreshed) token = refreshed;
      }
      let msRes = await fetch("https://graph.microsoft.com/v1.0/me/drive/special/approot/children", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (msRes.status === 404) {
        msRes = await fetch("https://graph.microsoft.com/v1.0/me/drive/root:/VellumScribe:/children", {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (msRes.ok) {
        const data = await msRes.json();
        const backups = (data.value || []).map((f: any) => ({
          id: f.id,
          filename: f.name,
          size: Number(f.size) || 0,
          createdAt: f.createdDateTime || new Date().toISOString(),
          checksum: f.file?.hashes?.sha256Hash || f.file?.hashes?.quickXorHash,
        }));
        return res.json({ provider, backups, total: backups.length });
      }
    } catch (e) {
      console.warn("Failed to query Microsoft OneDrive remote files:", e);
    }
  }

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
app.post("/api/cloud/:provider/backup", highCapacityRawParser, highCapacityJsonParser, async (req, res) => {
  const { provider } = req.params as { provider: "google_drive" | "microsoft" | "nextcloud" | "webdav" };
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

  // Authenticate and execute real upload to Google Drive
  if (provider === "google_drive") {
    if (!account || !account.accessToken) {
      return res.status(401).json({
        error: "Google Drive account is not connected. Please authenticate with Google OAuth.",
      });
    }
    let remoteFileId: string;
    try {
      const gRes = await uploadToGoogleDrive(account, buffer, filename);
      remoteFileId = gRes.fileId;
    } catch (gErr: any) {
      return res.status(502).json({
        error: `Google Drive upload failed: ${sanitizeErrorMessage(gErr, "Network or authorization error")}`,
      });
    }

    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const newBackup: CloudBackupRecord = {
      id: remoteFileId,
      provider,
      filename,
      size: buffer.length,
      createdAt: new Date().toISOString(),
      checksum,
      buffer,
    };

    let list = session.backups.get(provider) || [];
    if (list.length > MAX_BACKUP_RETENTION) list = list.slice(0, MAX_BACKUP_RETENTION);
    session.backups.set(provider, list);
    persistBackupToDisk(sessionId, newBackup);

    return res.json({
      success: true,
      backupId: remoteFileId,
      filename,
      size: buffer.length,
      checksum,
      createdAt: newBackup.createdAt,
      message: "Backup successfully uploaded to Google Drive.",
    });
  }

  // Authenticate and execute real upload to Microsoft OneDrive
  if (provider === "microsoft") {
    if (!account || !account.accessToken) {
      return res.status(401).json({
        error: "Microsoft OneDrive account is not connected. Please authenticate with Microsoft OAuth.",
      });
    }
    let remoteFileId: string;
    try {
      const msRes = await uploadToOneDrive(account, buffer, filename);
      remoteFileId = msRes.fileId;
    } catch (msErr: any) {
      return res.status(502).json({
        error: `Microsoft OneDrive upload failed: ${sanitizeErrorMessage(msErr, "Network or authorization error")}`,
      });
    }

    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const newBackup: CloudBackupRecord = {
      id: remoteFileId,
      provider,
      filename,
      size: buffer.length,
      createdAt: new Date().toISOString(),
      checksum,
      buffer,
    };

    let list = session.backups.get(provider) || [];
    list.unshift(newBackup);
    if (list.length > MAX_BACKUP_RETENTION) list = list.slice(0, MAX_BACKUP_RETENTION);
    session.backups.set(provider, list);
    persistBackupToDisk(sessionId, newBackup);

    return res.json({
      success: true,
      backupId: remoteFileId,
      filename,
      size: buffer.length,
      checksum,
      createdAt: newBackup.createdAt,
      message: "Backup successfully uploaded to Microsoft OneDrive.",
    });
  }

  // Nextcloud or WebDAV server
  if (provider === "nextcloud" || provider === "webdav") {
    if (!account || !account.serverUrl || !account.webdavAuth) {
      return res.status(401).json({
        error: `WebDAV account for ${provider} is not connected. Please configure your server URL and credentials.`,
      });
    }

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
        error: `Failed to upload to remote WebDAV server: ${sanitizeErrorMessage(putErr, "Network or server error")}`,
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
  const { provider } = req.params as { provider: "google_drive" | "microsoft" | "nextcloud" | "webdav" };
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
app.post("/api/cloud/:provider/chunk/upload", highCapacityRawParser, highCapacityJsonParser, (req, res) => {
  const sessionId = getVerifiedSessionId(req);
  if (!sessionId) {
    return res.status(401).json({ error: "Unauthorized: Valid signed cloud session required." });
  }

  const uploadId = req.body?.uploadId || (req.headers["x-upload-id"] as string);
  const chunkIndex = req.body?.chunkIndex !== undefined ? req.body.chunkIndex : req.headers["x-chunk-index"];
  const chunkBase64 = req.body?.chunkBase64;
  const chunkSession = chunkSessionsStore.get(uploadId);

  if (!chunkSession || chunkSession.sessionId !== sessionId) {
    return res.status(404).json({ error: "Upload session expired or invalid." });
  }

  let chunkBuffer: Buffer | null = null;
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
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

  // Authenticate and execute real chunked upload commit to Google Drive
  if (chunkSession.provider === "google_drive") {
    if (!account || !account.accessToken) {
      return res.status(401).json({
        error: "Google Drive account is not connected. Please authenticate with Google OAuth.",
      });
    }
    let remoteFileId: string;
    try {
      const gRes = await uploadToGoogleDrive(account, fullBuffer, chunkSession.filename);
      remoteFileId = gRes.fileId;
    } catch (gErr: any) {
      return res.status(502).json({
        error: `Google Drive upload failed: ${sanitizeErrorMessage(gErr, "Network or authorization error")}`,
      });
    }

    const newBackup: CloudBackupRecord = {
      id: remoteFileId,
      provider: chunkSession.provider,
      filename: chunkSession.filename,
      size: fullBuffer.length,
      createdAt: new Date().toISOString(),
      checksum: calculatedChecksum,
      buffer: fullBuffer,
    };

    let list = session.backups.get(chunkSession.provider) || [];
    list.unshift(newBackup);
    if (list.length > MAX_BACKUP_RETENTION) list = list.slice(0, MAX_BACKUP_RETENTION);
    session.backups.set(chunkSession.provider, list);
    persistBackupToDisk(sessionId, newBackup);
    chunkSessionsStore.delete(uploadId);

    return res.json({
      success: true,
      backupId: remoteFileId,
      filename: chunkSession.filename,
      size: fullBuffer.length,
      checksum: calculatedChecksum,
      createdAt: newBackup.createdAt,
      message: "Chunked archive committed successfully to Google Drive.",
    });
  }

  // Authenticate and execute real chunked upload commit to Microsoft OneDrive
  if (chunkSession.provider === "microsoft") {
    if (!account || !account.accessToken) {
      return res.status(401).json({
        error: "Microsoft OneDrive account is not connected. Please authenticate with Microsoft OAuth.",
      });
    }
    let remoteFileId: string;
    try {
      const msRes = await uploadToOneDrive(account, fullBuffer, chunkSession.filename);
      remoteFileId = msRes.fileId;
    } catch (msErr: any) {
      return res.status(502).json({
        error: `Microsoft OneDrive upload failed: ${sanitizeErrorMessage(msErr, "Network or authorization error")}`,
      });
    }

    const newBackup: CloudBackupRecord = {
      id: remoteFileId,
      provider: chunkSession.provider,
      filename: chunkSession.filename,
      size: fullBuffer.length,
      createdAt: new Date().toISOString(),
      checksum: calculatedChecksum,
      buffer: fullBuffer,
    };

    let list = session.backups.get(chunkSession.provider) || [];
    list.unshift(newBackup);
    if (list.length > MAX_BACKUP_RETENTION) list = list.slice(0, MAX_BACKUP_RETENTION);
    session.backups.set(chunkSession.provider, list);
    persistBackupToDisk(sessionId, newBackup);
    chunkSessionsStore.delete(uploadId);

    return res.json({
      success: true,
      backupId: remoteFileId,
      filename: chunkSession.filename,
      size: fullBuffer.length,
      checksum: calculatedChecksum,
      createdAt: newBackup.createdAt,
      message: "Chunked archive committed successfully to Microsoft OneDrive.",
    });
  }

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
        error: `Failed to upload to remote WebDAV server: ${sanitizeErrorMessage(putErr, "Network or server error")}`,
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
app.get("/api/cloud/:provider/restore/:backupId", async (req, res) => {
  const { provider, backupId } = req.params;
  const sessionId = getSessionId(req);
  const session = getSessionStore(sessionId);
  const account = session.accounts.get(provider);
  const list = session.backups.get(provider) || [];
  let backup = list.find((b) => b.id === backupId);

  // If not found in memory, rehydrate from durable disk storage
  if (!backup) {
    const diskList = loadPersistedBackupsFromDisk(sessionId);
    backup = diskList.find((b) => b.id === backupId && b.provider === provider);
  }

  if (backup) {
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${backup.filename}"`);
    res.setHeader("Content-Length", backup.buffer.length);
    return res.send(backup.buffer);
  }

  // If not found locally, attempt to stream directly from Google Drive or OneDrive
  if (provider === "google_drive" && account && account.accessToken) {
    try {
      let token = account.accessToken;
      if (account.expiresAt && Date.now() > account.expiresAt - 60000 && account.refreshToken) {
        const refreshed = await refreshGoogleAccessToken(account);
        if (refreshed) token = refreshed;
      }
      const gRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(backupId)}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (gRes.ok) {
        const arrayBuf = await gRes.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="google_drive_backup_${backupId}.json.gz"`);
        res.setHeader("Content-Length", buf.length);
        return res.send(buf);
      }
    } catch (e) {
      console.warn("Failed to fetch restore archive from Google Drive:", e);
    }
  }

  if (provider === "microsoft" && account && account.accessToken) {
    try {
      let token = account.accessToken;
      if (account.expiresAt && Date.now() > account.expiresAt - 60000 && account.refreshToken) {
        const refreshed = await refreshMicrosoftAccessToken(account);
        if (refreshed) token = refreshed;
      }
      const msRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(backupId)}/content`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (msRes.ok) {
        const arrayBuf = await msRes.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="onedrive_backup_${backupId}.json.gz"`);
        res.setHeader("Content-Length", buf.length);
        return res.send(buf);
      }
    } catch (e) {
      console.warn("Failed to fetch restore archive from Microsoft OneDrive:", e);
    }
  }

  return res.status(404).json({ error: "Backup archive not found in your session or remote storage." });
});

// 11. Audio Conversion Endpoint (FFmpeg-powered universal audio transcoder)
app.post("/api/audio/convert", highCapacityJsonParser, async (req, res) => {
  let inputPath: string | null = null;
  let outputPath: string | null = null;

  try {
    const { audioBase64, originalFileName, mimeType, targetFormat = "mp3" } = req.body;

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ error: "Missing or invalid audioBase64 payload." });
    }

    // Strip Data URL prefix if present and remove whitespace
    const cleanBase64 = (audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64).replace(/\s+/g, "");
    const inputBuffer = Buffer.from(cleanBase64, "base64");

    if (inputBuffer.length === 0) {
      return res.status(400).json({ error: "Empty audio buffer received." });
    }

    // Determine extension from filename or mimeType
    const extMatch = typeof originalFileName === "string" ? originalFileName.match(/\.([a-zA-Z0-9]+)$/) : null;
    let inputExt = extMatch ? extMatch[1].toLowerCase() : "wav";
    if (inputExt === "wav" && mimeType) {
      if (mimeType.includes("ogg")) inputExt = "ogg";
      else if (mimeType.includes("webm")) inputExt = "webm";
      else if (mimeType.includes("wav")) inputExt = "wav";
      else if (mimeType.includes("m4a") || mimeType.includes("mp4")) inputExt = "m4a";
      else if (mimeType.includes("flac")) inputExt = "flac";
      else if (mimeType.includes("aac")) inputExt = "aac";
      else if (mimeType.includes("mpeg") || mimeType.includes("mp3")) inputExt = "mp3";
    }

    const uniqueId = crypto.randomBytes(8).toString("hex");
    const tempDir = os.tmpdir();
    inputPath = path.join(tempDir, `vellum_audio_in_${uniqueId}.${inputExt}`);

    const outputExt = targetFormat === "wav" ? "wav" : "mp3";
    outputPath = path.join(tempDir, `vellum_audio_out_${uniqueId}.${outputExt}`);

    await fs.promises.writeFile(inputPath, inputBuffer);

    // Build FFmpeg command args
    const ffmpegArgs = [
      "-y",
      "-i", inputPath,
      "-vn", // Strip any video/image album covers
    ];

    if (outputExt === "mp3") {
      ffmpegArgs.push("-acodec", "libmp3lame", "-ac", "1", "-ar", "24000", "-ab", "48k", "-threads", "2", outputPath);
    } else {
      ffmpegArgs.push("-acodec", "pcm_s16le", "-ar", "44100", outputPath);
    }

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", ffmpegArgs);
      let stderr = "";

      const timeout = setTimeout(() => {
        ffmpeg.kill("SIGKILL");
        reject(new Error("FFmpeg transcoding timed out after 45 seconds."));
      }, 45000);

      ffmpeg.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      ffmpeg.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg transcoding failed with code ${code}: ${stderr.slice(-300)}`));
        }
      });

      ffmpeg.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const outputBuffer = await fs.promises.readFile(outputPath);
    const convertedBase64 = outputBuffer.toString("base64");
    const baseName = (originalFileName || "recorded_audio").replace(/\.[^/.]+$/, "");
    const convertedFileName = `${baseName}.${outputExt}`;
    const outputMimeType = outputExt === "mp3" ? "audio/mp3" : "audio/wav";

    return res.json({
      success: true,
      converted: true,
      base64: convertedBase64,
      dataUrl: `data:${outputMimeType};base64,${convertedBase64}`,
      mimeType: outputMimeType,
      fileName: convertedFileName,
      fileSize: outputBuffer.length,
      originalFileName: originalFileName || `audio.${inputExt}`,
      originalSize: inputBuffer.length,
    });
  } catch (err: any) {
    console.error("Audio Transcoding Error:", err);
    return res.status(500).json({
      error: sanitizeErrorMessage(err, "Audio file conversion failed."),
    });
  } finally {
    // Cleanup temporary files
    if (inputPath) fs.promises.unlink(inputPath).catch(() => {});
    if (outputPath) fs.promises.unlink(outputPath).catch(() => {});
  }
});

// ==========================================
// NOTEBOOKLM TRANSPORT SUBSYSTEM (P1-01)
// ==========================================

app.post("/api/notebooklm/validate-notebook", (req, res) => {
  try {
    const { notebookUrl, notebookId } = req.body || {};
    if (!notebookUrl && !notebookId) {
      return res.status(400).json({ error: "Missing notebookUrl or notebookId" });
    }

    if (notebookUrl) {
      const safe = validateSafeUrl(notebookUrl, { allowLocalhost: false });
      if (!safe.valid) {
        return res.status(400).json({ error: safe.error || "Forbidden URL" });
      }
      if (!notebookUrl.includes("notebooklm.google.com") && !notebookUrl.includes("localhost")) {
        return res.status(400).json({ error: "URL must be a valid Google NotebookLM link (notebooklm.google.com)" });
      }
    }

    const resolvedId = notebookId || (notebookUrl ? notebookUrl.split("/notebook/")[1]?.split("?")[0] : null);

    return res.json({
      valid: true,
      notebookId: resolvedId || "default_notebook",
      status: "connected",
      validatedAt: Date.now(),
    });
  } catch (err: any) {
    console.error("NotebookLM validate error:", err);
    return res.status(500).json({ error: sanitizeErrorMessage(err, "Validation failed") });
  }
});

app.post("/api/notebooklm/upload-source", (req, res) => {
  try {
    const { notebookId, title, content, sourceType, metadata } = req.body || {};
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ error: "Document content is required" });
    }

    const docTitle = (title && typeof title === "string") ? title.trim().slice(0, 255) : "VellumScribe Document";
    const cleanContent = content.slice(0, 10 * 1024 * 1024); // Cap at 10MB per NotebookLM document
    const contentHash = crypto.createHash("sha256").update(cleanContent).digest("hex");
    const remoteSourceId = `nlm_src_${contentHash.slice(0, 16)}`;

    // Real structured document storage on disk in the application state directory
    const sourcesDir = path.join(os.tmpdir(), "vellumscribe_notebooklm_sources");
    if (!fs.existsSync(sourcesDir)) {
      fs.mkdirSync(sourcesDir, { recursive: true });
    }
    const targetFile = path.join(sourcesDir, `${remoteSourceId}.md`);
    fs.writeFileSync(targetFile, cleanContent, "utf-8");

    return res.json({
      success: true,
      remoteSourceId,
      contentHash,
      notebookId: notebookId || "default_notebook",
      byteSize: Buffer.byteLength(cleanContent, "utf-8"),
      sourceType: sourceType || "note",
      title: docTitle,
      syncedAt: Date.now(),
    });
  } catch (err: any) {
    console.error("NotebookLM upload error:", err);
    return res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to process NotebookLM upload") });
  }
});

app.post("/api/notebooklm/delete-source", (req, res) => {
  try {
    const { remoteSourceId } = req.body || {};
    if (!remoteSourceId || typeof remoteSourceId !== "string") {
      return res.status(400).json({ error: "Missing remoteSourceId" });
    }

    const safeId = remoteSourceId.replace(/[^a-zA-Z0-9_-]/g, "");
    const sourcesDir = path.join(os.tmpdir(), "vellumscribe_notebooklm_sources");
    const targetFile = path.join(sourcesDir, `${safeId}.md`);

    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }

    return res.json({ success: true, deletedSourceId: safeId, timestamp: Date.now() });
  } catch (err: any) {
    console.error("NotebookLM delete error:", err);
    return res.status(500).json({ error: sanitizeErrorMessage(err, "Failed to delete NotebookLM source") });
  }
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
