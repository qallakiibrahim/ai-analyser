import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
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

app.post("/api/analyze", async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    return res.status(503).json({
      error: "AI-tjänsten saknar konfiguration. Kontrollera GEMINI_API_KEY under Settings > Secrets.",
    });
  }

  const body = req.body as Partial<AnalyzeRequestPayload>;
  if (!body || typeof body.metric !== "string" || !body.stats || typeof body.stats !== "object") {
    return res.status(400).json({ error: "Ogiltig analysförfrågan: mätvariabel och statistik krävs." });
  }

  const datasetName = typeof body.datasetName === "string" ? body.datasetName.slice(0, 160) : "Importerat dataset";
  const metric = body.metric.slice(0, 100);
  const totalRows = typeof body.totalRows === "number" ? body.totalRows : 0;
  const statsJson = JSON.stringify(body.stats, null, 2).slice(0, 8000);
  const anomalyJson = JSON.stringify(body.anomalySummary || {}, null, 2).slice(0, 8000);
  const sampledPoints = Array.isArray(body.sampledPoints) ? body.sampledPoints.slice(0, 60) : [];
  const pointsText = sampledPoints
    .map((p) => `#${p.rowIndex} (${p.label}): ${typeof p.value === "number" ? p.value.toFixed(4) : "N/A"}${typeof p.mr === "number" ? ` | MR=${p.mr.toFixed(4)}` : ""}`)
    .join("\n");

  const today = new Date().toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  try {
    // Steg 1: Statistisk granskning
    const step1Prompt = `Du är en Senior Statistiker inom industriell kvalitetsteknik (expert på SPC, I-MR, Cp/Cpk, Pp/Ppk, D'Agostino-Pearson normalitetstest och Nelson Rules).
Analysera följande fullständiga processdata på svenska:
- Dataset: ${datasetName} (${totalRows} mätpunkter totalt)
- Mätvariabel: ${metric}
- Fullständig statistikprofil:
${statsJson}
- Sammanfattning av avvikelser (alla rader):
${anomalyJson}
- Representativt urval av mätpunkter över hela serien (start, avvikelser, mitt, slut):
${pointsText}

Ge en koncis, strikt teknisk och faktabaserad bedömning av:
1. I-MR stabilitet (är Moving Range och individerna i statistisk kontroll?)
2. Skillnad mellan kortsiktig potential (Cp/Cpk) och faktisk långsiktig prestanda (Pp/Ppk), samt PPM utanför tolerans.
3. Normalfördelningens giltighet (D'Agostino-Pearson K² p-värde, skewness, kurtosis) och hur det påverkar tolkningen av Cpk/Ppk.
4. Konkreta Nelson/Western Electric-mönster (skift, drift, oscillation, mixture, hugging).`;

    const step1 = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: step1Prompt,
    });
    const technicalSummary = step1.text || "";

    // Steg 2: Rotorsaksdiagnostik
    const step2Prompt = `Du är en erfaren Kvalitets- och Produktionsingenjör specialiserad på rotorsaksanalys (RCA) för verkstads- och processindustri.
Baserat på denna statistiska granskning av "${metric}" i "${datasetName}":
${technicalSummary}

Förklara sannolika fysiska och processrelaterade orsaker bakom observerade mönster:
- Skilj tydligt på Common Cause (inbyggd systemvariation) och Special Cause (särskilda störningar).
- Koppla konkreta mönster till tänkbara orsaker (t.ex. termisk drift, verktygsslitage, uppspänning/fixtur, råmaterialbatch, mätfel/upplösning, överjustering/tampering).
- Om processen faktiskt är stabil och kapabel, säg det tydligt och undvik att hitta på problem.
Svara på svenska, strukturerat och sakligt.`;

    const step2 = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: step2Prompt,
    });
    const diagnosticSummary = step2.text || "";

    // Steg 3: Ingenjörsrapport med konkreta åtgärder
    const step3Prompt = `Du är en Senior Produktionsrådgivare. Sammanställ en skarp, objektiv och handlingsbar produktionsrapport på svenska baserad på underlaget nedan.

Teknisk statistik:
${technicalSummary}

Rotorsaksdiagnostik:
${diagnosticSummary}

Använd exakt följande Markdown-struktur (utan kodblock runt hela svaret):

# PRODUKTIONSRAPPORT: [KORT SAKLIG RUBRIK]
**Datum:** ${today}  
**Dataset:** ${datasetName} (${totalRows} punkter)  
**Mätvariabel:** ${metric}  
**Status:** [RÖD / GUL / GRÖN]  

## 1. Övergripande bedömning
[Tydlig sammanfattning av statistisk kontroll (I-MR), kapabilitet (Cpk vs Ppk), normalfördelning och PPM.]

## 2. Centrala observationer i datan
[Konkreta fynd med hänvisning till radnummer/tidpunkter och brutna Nelson-regler eller bekräftad stabilitet.]

## 3. Risk- och trendbedömning
[Sannolikhet för kassation eller toleransöverskridande om processen fortsätter som i slutet av mätserien.]

## 4. Rekommenderade ingenjörsåtgärder
[3–5 numrerade, konkreta och realistiska åtgärder anpassade efter utfallet. Om processen är GRÖN, fokusera på bevakning och bibehållen kontroll.]

## 5. Beslutspunkt
[Tydligt kriterium för när processen bör stoppas, justeras eller frisläppas.]`;

    const step3 = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: step3Prompt,
    });

    const report = step3.text || "Kunde inte generera analysrapport.";
    let status: "RÖD" | "GUL" | "GRÖN" = "GRÖN";
    const statusLineMatch = report.match(/\*\*Status:\*\*\s*([^\n]+)/i);
    const statusText = (statusLineMatch ? statusLineMatch[1] : report.slice(0, 400)).toUpperCase();
    if (statusText.includes("RÖD")) status = "RÖD";
    else if (statusText.includes("GUL")) status = "GUL";

    return res.json({
      report,
      status,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Okänt fel vid AI-analys";
    console.error("Server AI Analysis error:", message);
    return res.status(502).json({
      error: `Kunde inte slutföra AI-analysen: ${message}`,
    });
  }
});

// Valfri demoläge-endpoint för sekundär testsimulering
app.get("/api/demo-point", (_req, res) => {
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
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
