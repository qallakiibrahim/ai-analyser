import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "2mb" }));

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

interface AnalyzeRequestPayload {
  datasetName: string;
  metric: string;
  stats: Record<string, unknown>;
  anomalySummary: {
    total: number;
    oosCount: number;
    mrOutOfControlCount: number;
    byRule: Record<string, number>;
    highlights: Array<{
      rowIndex: number;
      label: string;
      value: number;
      rule: string;
      explanation: string;
    }>;
  };
  sampledPoints: Array<{
    rowIndex: number;
    label: string;
    value: number;
    mr?: number | null;
  }>;
  totalRows: number;
}

function isTransientOverloadError(error: unknown): boolean {
  const rawMsg = error instanceof Error ? error.message : String(error);
  return (
    rawMsg.includes("503") ||
    rawMsg.includes("UNAVAILABLE") ||
    rawMsg.includes("Service Unavailable") ||
    rawMsg.includes("high demand") ||
    rawMsg.includes("overloaded")
  );
}

function formatGeminiError(error: unknown): { status: number; message: string } {
  const rawMsg = error instanceof Error ? error.message : "Okänt fel vid AI-analys";
  if (rawMsg.includes("PERMISSION_DENIED") || rawMsg.includes("API_KEY_INVALID") || rawMsg.includes("403")) {
    return {
      status: 403,
      message: "Ogiltig eller saknad Gemini API-nyckel. Kontrollera GEMINI_API_KEY under Settings > Secrets.",
    };
  }
  if (rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("429")) {
    return {
      status: 429,
      message: "AI-kvoten är tillfälligt full. Försök igen om en liten stund eller kontrollera din API-nyckel under Settings > Secrets.",
    };
  }
  if (isTransientOverloadError(error)) {
    return {
      status: 503,
      message: "AI-tjänsten har tillfälligt mycket hög belastning (503). Försök igen om några sekunder.",
    };
  }
  if (rawMsg.includes("AbortError") || rawMsg.includes("aborted") || rawMsg.includes("timed out")) {
    return {
      status: 504,
      message: "AI-analysen tog för lång tid (timeout). Försök igen om ett ögonblick.",
    };
  }
  return {
    status: 502,
    message: "Kunde inte slutföra AI-analysen just nu. Försök igen om en stund.",
  };
}

function detectReportStatus(report: string): "RÖD" | "GUL" | "GRÖN" {
  const statusLineMatch = report.match(/\*\*Status:\*\*\s*([^\n]+)/i);
  const statusText = (statusLineMatch ? statusLineMatch[1] : report.slice(0, 400)).toUpperCase();
  if (statusText.includes("RÖD")) return "RÖD";
  if (statusText.includes("GUL")) return "GUL";
  return "GRÖN";
}

interface ModelAttempt {
  model: string;
  thinkingLevel?: ThinkingLevel;
  timeoutMs: number;
  delayBeforeMs: number;
}

const ANALYSIS_MODEL_ATTEMPTS: ModelAttempt[] = [
  { model: "gemini-4-hydrogen", thinkingLevel: ThinkingLevel.LOW, timeoutMs: 15_000, delayBeforeMs: 0 },
  { model: "gemini-3.1-flash-lite", timeoutMs: 25_000, delayBeforeMs: 600 },
  { model: "gemini-4-hydrogen", thinkingLevel: ThinkingLevel.LOW, timeoutMs: 25_000, delayBeforeMs: 1_500 },
];

async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Request aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Request aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function createAttemptSignal(parentSignal: AbortSignal, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const attemptController = new AbortController();
  const timer = setTimeout(() => attemptController.abort(new Error("Attempt timed out")), timeoutMs);
  const onParentAbort = () => attemptController.abort(parentSignal.reason || new Error("Client disconnected"));
  if (parentSignal.aborted) {
    onParentAbort();
  } else {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }
  return {
    signal: attemptController.signal,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", onParentAbort);
    },
  };
}

app.post("/api/analyze", async (req: Request, res: Response) => {
  const ai = getAiClient();
  if (!ai) {
    return res.status(503).json({
      error: "AI-tjänsten saknar konfiguration. Kontrollera GEMINI_API_KEY under Settings > Secrets.",
    });
  }

  const body = req.body as Partial<AnalyzeRequestPayload>;
  if (!body || typeof body.metric !== "string" || !body.metric.trim() || !body.stats || typeof body.stats !== "object") {
    return res.status(400).json({ error: "Ogiltig analysförfrågan: mätvariabel och statistik krävs." });
  }

  const datasetName = typeof body.datasetName === "string" ? body.datasetName.slice(0, 160) : "Importerat dataset";
  const metric = body.metric.trim().slice(0, 100);
  const totalRows = typeof body.totalRows === "number" && Number.isFinite(body.totalRows) ? Math.max(0, Math.floor(body.totalRows)) : 0;
  const statsJson = JSON.stringify(body.stats, null, 2).slice(0, 8000);
  const anomalyJson = JSON.stringify(body.anomalySummary || {}, null, 2).slice(0, 8000);
  const sampledPoints = Array.isArray(body.sampledPoints) ? body.sampledPoints.slice(0, 60) : [];
  const pointsText = sampledPoints
    .map((p) => {
      const idx = typeof p.rowIndex === "number" ? p.rowIndex : 0;
      const lbl = typeof p.label === "string" ? p.label.slice(0, 40) : "";
      const val = typeof p.value === "number" && Number.isFinite(p.value) ? p.value.toFixed(4) : "N/A";
      const mr = typeof p.mr === "number" && Number.isFinite(p.mr) ? ` | MR=${p.mr.toFixed(4)}` : "";
      return `#${idx} (${lbl}): ${val}${mr}`;
    })
    .join("\n");

  const today = new Date().toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const systemInstruction = `Du är en Senior Statistiker och Kvalitets-/Produktionsingenjör inom industriell kvalitetsteknik (expert på SPC, I-MR, Cp/Cpk, Pp/Ppk, D'Agostino-Pearson normalitetstest, Nelson Rules och rotorsaksanalys / RCA).
Skriv alltid på saklig, koncis och handlingsbar svenska.
Skilj tydligt på Common Cause (inbyggd systemvariation) och Special Cause (särskilda störningar som termisk drift, verktygsslitage, fixtur/uppspänning, råmaterialbatch, mätupplösning eller överjustering/tampering).
Om processen faktiskt är stabil och kapabel, säg det tydligt och undvik att hitta på problem.
Svara direkt med efterfrågad Markdown-rapport utan kodblock runt hela svaret. Håll rapporten skarp och kärnfull (ca 350–550 ord).`;

  const prompt = `Analysera följande fullständiga processdata och sammanställ en produktionsrapport:
- Dataset: ${datasetName} (${totalRows} mätpunkter totalt)
- Mätvariabel: ${metric}
- Fullständig statistikprofil:
${statsJson}
- Sammanfattning av avvikelser (alla rader):
${anomalyJson}
- Representativt urval av mätpunkter över hela serien (start, avvikelser, mitt, slut):
${pointsText}

Använd exakt följande Markdown-struktur (utan kodblock runt hela svaret):

# PRODUKTIONSRAPPORT: [KORT SAKLIG RUBRIK]
**Datum:** ${today}  
**Dataset:** ${datasetName} (${totalRows} punkter)  
**Mätvariabel:** ${metric}  
**Status:** [RÖD / GUL / GRÖN]  

## 1. Övergripande bedömning
[Tydlig sammanfattning av I-MR-stabilitet (både Moving Range och individer), kortsiktig potential (Cp/Cpk) vs långsiktig prestanda (Pp/Ppk), normalfördelningens giltighet (D'Agostino-Pearson K² p-värde, skevhet/kurtosis) och PPM utanför tolerans.]

## 2. Centrala observationer & rotorsaksdiagnostik
[Konkreta fynd med hänvisning till radnummer/tidpunkter, brutna Nelson/Western Electric-regler eller bekräftad stabilitet. Skilj på Common Cause och Special Cause och koppla observerade mönster till sannolika fysiska/processrelaterade orsaker.]

## 3. Risk- och trendbedömning
[Sannolikhet för kassation eller toleransöverskridande om processen fortsätter som i slutet av mätserien.]

## 4. Rekommenderade ingenjörsåtgärder
[3–5 numrerade, konkreta och realistiska åtgärder anpassade efter utfallet. Om processen är GRÖN, fokusera på bevakning och bibehållen kontroll.]

## 5. Beslutspunkt
[Tydligt kriterium för när processen bör stoppas, justeras eller frisläppas.]`;

  const wantsStream = req.headers.accept?.includes("text/event-stream");
  const requestController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      requestController.abort();
    }
  });

  if (wantsStream) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(": connected\n\n");

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": ping\n\n");
      }
    }, 8_000);

    try {
      let fullReport = "";
      let lastError: unknown = null;

      for (let i = 0; i < ANALYSIS_MODEL_ATTEMPTS.length; i++) {
        const attempt = ANALYSIS_MODEL_ATTEMPTS[i];
        await sleepWithSignal(attempt.delayBeforeMs, requestController.signal);
        const { signal, cleanup } = createAttemptSignal(requestController.signal, attempt.timeoutMs);

        try {
          const stream = await ai.models.generateContentStream({
            model: attempt.model,
            contents: prompt,
            config: {
              systemInstruction,
              ...(attempt.thinkingLevel ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } } : {}),
              abortSignal: signal,
            },
          });

          for await (const chunk of stream) {
            const piece = chunk.text || "";
            if (piece) {
              fullReport += piece;
              if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify({ chunk: piece })}\n\n`);
              }
            }
          }

          cleanup();
          lastError = null;
          break;
        } catch (error: unknown) {
          cleanup();
          lastError = error;
          if (requestController.signal.aborted || fullReport.length > 0) {
            throw error;
          }
          const isTimeout = error instanceof Error && (error.name === "AbortError" || error.message.includes("timed out"));
          const canRetry = (isTransientOverloadError(error) || isTimeout) && i < ANALYSIS_MODEL_ATTEMPTS.length - 1;
          if (!canRetry) {
            throw error;
          }
          console.warn(`AI stream attempt ${i + 1} (${attempt.model}) unavailable/timed out, trying next fallback...`);
        }
      }

      if (lastError) {
        throw lastError;
      }

      const finalReport = fullReport.trim() || "Kunde inte generera analysrapport.";
      const status = detectReportStatus(finalReport);
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            done: true,
            report: finalReport,
            status,
            generatedAt: new Date().toISOString(),
          })}\n\n`
        );
        res.end();
      }
    } catch (error: unknown) {
      const formatted = formatGeminiError(error);
      console.error("Server AI Analysis stream error:", error instanceof Error ? error.message : error);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: formatted.message })}\n\n`);
        res.end();
      }
    } finally {
      clearInterval(heartbeat);
    }
    return;
  }

  try {
    let report = "";
    let lastError: unknown = null;

    for (let i = 0; i < ANALYSIS_MODEL_ATTEMPTS.length; i++) {
      const attempt = ANALYSIS_MODEL_ATTEMPTS[i];
      await sleepWithSignal(attempt.delayBeforeMs, requestController.signal);
      const { signal, cleanup } = createAttemptSignal(requestController.signal, attempt.timeoutMs);

      try {
        const response = await ai.models.generateContent({
          model: attempt.model,
          contents: prompt,
          config: {
            systemInstruction,
            ...(attempt.thinkingLevel ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } } : {}),
            abortSignal: signal,
          },
        });
        cleanup();
        report = response.text || "";
        lastError = null;
        break;
      } catch (error: unknown) {
        cleanup();
        lastError = error;
        if (requestController.signal.aborted) {
          throw error;
        }
        const isTimeout = error instanceof Error && (error.name === "AbortError" || error.message.includes("timed out"));
        const canRetry = (isTransientOverloadError(error) || isTimeout) && i < ANALYSIS_MODEL_ATTEMPTS.length - 1;
        if (!canRetry) {
          throw error;
        }
        console.warn(`AI attempt ${i + 1} (${attempt.model}) unavailable/timed out, trying next fallback...`);
      }
    }

    if (lastError) {
      throw lastError;
    }

    const finalReport = report.trim() || "Kunde inte generera analysrapport.";
    const status = detectReportStatus(finalReport);

    return res.json({
      report: finalReport,
      status,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const formatted = formatGeminiError(error);
    console.error("Server AI Analysis error:", error instanceof Error ? error.message : error);
    return res.status(formatted.status).json({
      error: formatted.message,
    });
  }
});

// Valfri demoläge-endpoint för sekundär testsimulering
app.get("/api/demo-point", (_req: Request, res: Response) => {
  const randNorm = () => {
    const u1 = Math.max(Math.random(), 1e-10);
    const u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };
  const feedRate = Number(Math.max(0.13, Math.min(0.27, 0.2 + randNorm() * 0.028)).toFixed(4));
  const spindleRpm = Number((2500 + randNorm() * 95).toFixed(1));
  const coolantTemp = Number((22.0 + randNorm() * 0.9).toFixed(2));
  const diameter = Number(
    (10.0 + (coolantTemp - 21.8) * 0.115 + (feedRate - 0.2) * 2.1 + randNorm() * 0.12).toFixed(4)
  );
  const roughness = Number(
    Math.max(0.65, 1.55 + (feedRate - 0.2) * 5.2 + (coolantTemp - 21.8) * 0.04 + randNorm() * 0.1).toFixed(3)
  );

  res.json({
    timestamp: new Date().toISOString(),
    values: {
      "Diameter (mm)": diameter,
      "Ytfinhet Ra (µm)": roughness,
      "Kylvätsketemp (°C)": coolantTemp,
      "Matning (mm/varv)": feedRate,
      "Spindelvarvtal (RPM)": spindleRpm,
    },
  });
});

// Säkerställ att okända /api/*-anrop alltid returnerar JSON (aldrig HTML)
app.all("/api/*", (_req: Request, res: Response) => {
  res.status(404).json({ error: "API-endpoint hittades inte." });
});

// JSON-felhanterare för t.ex. ogiltig JSON-body eller för stor förfrågan (413)
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/api/")) {
    return next(err);
  }
  const status =
    typeof err === "object" && err !== null && "status" in err && typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : 500;
  if (status === 413) {
    return res.status(413).json({ error: "Analysunderlaget är för stort för servern (max 2 MB)." });
  }
  if (status === 400) {
    return res.status(400).json({ error: "Ogiltigt JSON-format i förfrågan." });
  }
  return res.status(status).json({ error: "Ett oväntat serverfel uppstod vid API-anropet." });
});

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
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
