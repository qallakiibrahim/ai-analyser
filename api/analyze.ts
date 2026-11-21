import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export const maxDuration = 60;

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

interface ModelAttempt {
  model: string;
  thinkingLevel?: ThinkingLevel;
  timeoutMs: number;
  delayBeforeMs: number;
}

const ANALYSIS_MODEL_ATTEMPTS: ModelAttempt[] = [
  { model: "gemini-4-hydrogen", thinkingLevel: ThinkingLevel.LOW, timeoutMs: 14_000, delayBeforeMs: 0 },
  { model: "gemini-3.1-flash-lite", timeoutMs: 22_000, delayBeforeMs: 500 },
  { model: "gemini-4-hydrogen", thinkingLevel: ThinkingLevel.LOW, timeoutMs: 18_000, delayBeforeMs: 1_000 },
];

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function getAiClient(): GoogleGenAI | null {
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
      message:
        "Ogiltig eller saknad Gemini API-nyckel. Kontrollera GEMINI_API_KEY i Vercel (Environment Variables) eller Settings > Secrets.",
    };
  }
  if (rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("429")) {
    return {
      status: 429,
      message: "AI-kvoten är tillfälligt full. Försök igen om en liten stund eller kontrollera din API-nyckel.",
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

function createAttemptSignal(
  parentSignal: AbortSignal,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
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

export async function POST(request: Request): Promise<Response> {
  const ai = getAiClient();
  if (!ai) {
    return Response.json(
      {
        error:
          "AI-tjänsten saknar konfiguration. Lägg till GEMINI_API_KEY under Vercel Project Settings > Environment Variables och deploya om.",
      },
      { status: 503 }
    );
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_BODY_BYTES) {
    return Response.json(
      { error: "Analysunderlaget är för stort för servern (max 2 MB)." },
      { status: 413 }
    );
  }

  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "Kunde inte läsa förfrågan." }, { status: 400 });
  }

  if (rawBody.length > MAX_BODY_BYTES) {
    return Response.json(
      { error: "Analysunderlaget är för stort för servern (max 2 MB)." },
      { status: 413 }
    );
  }

  let body: Partial<AnalyzeRequestPayload>;
  try {
    body = JSON.parse(rawBody) as Partial<AnalyzeRequestPayload>;
  } catch {
    return Response.json({ error: "Ogiltigt JSON-format i förfrågan." }, { status: 400 });
  }

  if (
    !body ||
    typeof body.metric !== "string" ||
    !body.metric.trim() ||
    !body.stats ||
    typeof body.stats !== "object" ||
    Array.isArray(body.stats)
  ) {
    return Response.json(
      { error: "Ogiltig analysförfrågan: mätvariabel och statistik krävs." },
      { status: 400 }
    );
  }

  const datasetName =
    typeof body.datasetName === "string" ? body.datasetName.slice(0, 160) : "Importerat dataset";
  const metric = body.metric.trim().slice(0, 100);
  const totalRows =
    typeof body.totalRows === "number" && Number.isFinite(body.totalRows)
      ? Math.max(0, Math.floor(body.totalRows))
      : 0;
  const statsJson = JSON.stringify(body.stats, null, 2).slice(0, 8000);
  const anomalyJson = JSON.stringify(body.anomalySummary || {}, null, 2).slice(0, 8000);
  const sampledPoints = Array.isArray(body.sampledPoints) ? body.sampledPoints.slice(0, 60) : [];
  const pointsText = sampledPoints
    .map((p) => {
      const idx = typeof p.rowIndex === "number" ? p.rowIndex : 0;
      const lbl = typeof p.label === "string" ? p.label.slice(0, 40) : "";
      const val =
        typeof p.value === "number" && Number.isFinite(p.value) ? p.value.toFixed(4) : "N/A";
      const mr =
        typeof p.mr === "number" && Number.isFinite(p.mr) ? ` | MR=${p.mr.toFixed(4)}` : "";
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

  const wantsStream = (request.headers.get("accept") || "").includes("text/event-stream");
  const parentSignal = request.signal;

  if (wantsStream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const enqueueText = (text: string) => {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // Stream closed by client
          }
        };

        enqueueText(": connected\n\n");
        const heartbeat = setInterval(() => {
          enqueueText(": ping\n\n");
        }, 8_000);

        try {
          let fullReport = "";
          let lastError: unknown = null;

          for (let i = 0; i < ANALYSIS_MODEL_ATTEMPTS.length; i++) {
            const attempt = ANALYSIS_MODEL_ATTEMPTS[i];
            await sleepWithSignal(attempt.delayBeforeMs, parentSignal);
            const { signal, cleanup } = createAttemptSignal(parentSignal, attempt.timeoutMs);

            try {
              const stream = await ai.models.generateContentStream({
                model: attempt.model,
                contents: prompt,
                config: {
                  systemInstruction,
                  ...(attempt.thinkingLevel
                    ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } }
                    : {}),
                  abortSignal: signal,
                },
              });

              for await (const chunk of stream) {
                const piece = chunk.text || "";
                if (piece) {
                  fullReport += piece;
                  enqueueText(`data: ${JSON.stringify({ chunk: piece })}\n\n`);
                }
              }

              cleanup();
              lastError = null;
              break;
            } catch (error: unknown) {
              cleanup();
              lastError = error;
              if (parentSignal.aborted || fullReport.length > 0) {
                throw error;
              }
              const isTimeout =
                error instanceof Error &&
                (error.name === "AbortError" || error.message.includes("timed out"));
              const canRetry =
                (isTransientOverloadError(error) || isTimeout) &&
                i < ANALYSIS_MODEL_ATTEMPTS.length - 1;
              if (!canRetry) {
                throw error;
              }
            }
          }

          if (lastError) {
            throw lastError;
          }

          const finalReport = fullReport.trim() || "Kunde inte generera analysrapport.";
          const status = detectReportStatus(finalReport);
          enqueueText(
            `data: ${JSON.stringify({
              done: true,
              report: finalReport,
              status,
              generatedAt: new Date().toISOString(),
            })}\n\n`
          );
        } catch (error: unknown) {
          const formatted = formatGeminiError(error);
          console.error("Vercel AI Analysis stream error:", error instanceof Error ? error.message : error);
          enqueueText(`data: ${JSON.stringify({ error: formatted.message })}\n\n`);
        } finally {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  try {
    let report = "";
    let lastError: unknown = null;

    for (let i = 0; i < ANALYSIS_MODEL_ATTEMPTS.length; i++) {
      const attempt = ANALYSIS_MODEL_ATTEMPTS[i];
      await sleepWithSignal(attempt.delayBeforeMs, parentSignal);
      const { signal, cleanup } = createAttemptSignal(parentSignal, attempt.timeoutMs);

      try {
        const response = await ai.models.generateContent({
          model: attempt.model,
          contents: prompt,
          config: {
            systemInstruction,
            ...(attempt.thinkingLevel
              ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } }
              : {}),
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
        if (parentSignal.aborted) {
          throw error;
        }
        const isTimeout =
          error instanceof Error &&
          (error.name === "AbortError" || error.message.includes("timed out"));
        const canRetry =
          (isTransientOverloadError(error) || isTimeout) &&
          i < ANALYSIS_MODEL_ATTEMPTS.length - 1;
        if (!canRetry) {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    const finalReport = report.trim() || "Kunde inte generera analysrapport.";
    const status = detectReportStatus(finalReport);
    return Response.json({
      report: finalReport,
      status,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const formatted = formatGeminiError(error);
    console.error("Vercel AI Analysis error:", error instanceof Error ? error.message : error);
    return Response.json({ error: formatted.message }, { status: formatted.status });
  }
}
