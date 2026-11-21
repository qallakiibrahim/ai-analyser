import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  FlaskConical,
  Shuffle,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  Target,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import {
  DoeDesignType,
  DoeFactor,
  DoeGoal,
  DoeRun,
  analyzeDoe,
  buildInteractionPlotData,
  codedToActual,
  createSampleDoeExperiment,
  generateDoeDesign,
  getDesignLabel,
  getFactorCountForDesign,
  optimizeDoeSettings,
  randomizeRunOrder,
} from '@/src/lib/doe';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '@/src/lib/utils';

interface DoeViewProps {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

function fmt(val: number | null | undefined, digits: number = 3): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '–';
  return val.toFixed(digits);
}

function fmtP(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '–';
  if (p < 0.0001) return '< 0.0001';
  return p.toFixed(4);
}

function parseCellNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim().replace(',', '.');
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export function DoeView({ onNotify }: DoeViewProps) {
  const initial = useMemo(() => createSampleDoeExperiment(), []);

  // Experiment Setup State
  const [experimentName, setExperimentName] = useState<string>(initial.experimentName);
  const [responseName, setResponseName] = useState<string>(initial.responseName);
  const [responseUnit, setResponseUnit] = useState<string>(initial.responseUnit);
  const [design, setDesign] = useState<DoeDesignType>(initial.design);
  const [replicates, setReplicates] = useState<number>(1);
  const [centerPoints, setCenterPoints] = useState<number>(3);
  const [goal, setGoal] = useState<DoeGoal>(initial.goal);
  const [targetValue, setTargetValue] = useState<number>(initial.targetValue);
  const [factors, setFactors] = useState<DoeFactor[]>(initial.factors);
  const [runs, setRuns] = useState<DoeRun[]>(initial.runs);
  const [includeInteractions, setIncludeInteractions] = useState<boolean>(true);
  const [equationMode, setEquationMode] = useState<'actual' | 'coded'>('actual');
  const [copiedEq, setCopiedEq] = useState<boolean>(false);

  // Interaction pair selection
  const [interFactorA, setInterFactorA] = useState<string>('A');
  const [interFactorB, setInterFactorB] = useState<string>('B');

  const importFileRef = useRef<HTMLInputElement>(null);

  const activeFactorCount = getFactorCountForDesign(design);
  const activeFactors = useMemo(
    () => factors.slice(0, activeFactorCount),
    [factors, activeFactorCount]
  );

  // Run live DOE statistical analysis whenever runs / design / factors change
  const analysis = useMemo(
    () =>
      analyzeDoe(
        design,
        activeFactors,
        runs,
        responseName || 'Resultat (Y)',
        includeInteractions
      ),
    [design, activeFactors, runs, responseName, includeInteractions]
  );

  // Auto-pick the strongest 2-factor interaction for the Interaction Plot
  useEffect(() => {
    if (!analysis) return;
    const validCodes = activeFactors.map((f) => f.code);
    if (!validCodes.includes(interFactorA) || !validCodes.includes(interFactorB) || interFactorA === interFactorB) {
      const topInter = analysis.effects.find((e) => e.isInteraction);
      if (topInter && topInter.factors.length === 2) {
        setInterFactorA(topInter.factors[0]);
        setInterFactorB(topInter.factors[1]);
      } else if (activeFactors.length >= 2) {
        setInterFactorA(activeFactors[0].code);
        setInterFactorB(activeFactors[1].code);
      }
    }
  }, [analysis, activeFactors, interFactorA, interFactorB]);

  const interactionPlot = useMemo(() => {
    if (!analysis) return null;
    const fA = activeFactors.find((f) => f.code === interFactorA) || activeFactors[0];
    const fB =
      activeFactors.find((f) => f.code === interFactorB && f.code !== fA.code) ||
      activeFactors[1];
    if (!fA || !fB) return null;
    return buildInteractionPlotData(runs, fA, fB, analysis.effects);
  }, [analysis, activeFactors, interFactorA, interFactorB, runs]);

  const optimization = useMemo(() => {
    if (!analysis) return null;
    return optimizeDoeSettings(analysis, activeFactors, design, goal, targetValue);
  }, [analysis, activeFactors, design, goal, targetValue]);

  // Handlers
  const handleUpdateFactor = (code: string, patch: Partial<DoeFactor>) => {
    setFactors((prev) => {
      const nextFactors = prev.map((f) => (f.code === code ? { ...f, ...patch } : f));
      const updatedFactor = nextFactors.find((f) => f.code === code);
      if (updatedFactor && (patch.low !== undefined || patch.high !== undefined)) {
        // Recalculate actual run levels live without wiping user's entered Y measurements
        setRuns((prevRuns) =>
          prevRuns.map((r) => ({
            ...r,
            actual: {
              ...r.actual,
              [code]: codedToActual(
                r.coded[code] ?? 0,
                updatedFactor.low,
                updatedFactor.high
              ),
            },
          }))
        );
      }
      return nextFactors;
    });
  };

  const handleRebuildDesign = (
    nextDesign: DoeDesignType = design,
    nextReps: number = replicates,
    nextCenters: number = centerPoints
  ) => {
    const k = getFactorCountForDesign(nextDesign);
    const fresh = generateDoeDesign(
      nextDesign,
      factors.slice(0, k),
      nextReps,
      nextCenters,
      true
    );
    setDesign(nextDesign);
    setReplicates(nextReps);
    setCenterPoints(nextCenters);
    setRuns(fresh);
    onNotify(
      'info',
      `Skapade ny försöksplan (${getDesignLabel(nextDesign)}, ${fresh.length} körningar, slumpad körordning).`
    );
  };

  const handleRandomize = () => {
    setRuns((prev) => randomizeRunOrder(prev));
    onNotify('info', 'Körordningen slumpades om.');
  };

  const handleSortByStd = () => {
    setRuns((prev) => [...prev].sort((a, b) => a.stdOrder - b.stdOrder));
  };

  const handleUpdateResponse = (runId: string, raw: string) => {
    const trimmed = raw.trim().replace(',', '.');
    const num = trimmed === '' ? null : Number(trimmed);
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? { ...r, response: num !== null && Number.isFinite(num) ? num : null }
          : r
      )
    );
  };

  const handleClearResponses = () => {
    setRuns((prev) => prev.map((r) => ({ ...r, response: null })));
    onNotify('info', 'Alla uppmätta Y-värden rensades.');
  };

  const handleLoadSample = () => {
    const fresh = createSampleDoeExperiment();
    setExperimentName(fresh.experimentName);
    setResponseName(fresh.responseName);
    setResponseUnit(fresh.responseUnit);
    setDesign(fresh.design);
    setReplicates(1);
    setCenterPoints(3);
    setGoal(fresh.goal);
    setTargetValue(fresh.targetValue);
    setFactors(fresh.factors);
    setRuns(fresh.runs);
    setInterFactorA('A');
    setInterFactorB('B');
    onNotify('success', 'Laddade exempel-DOE: CNC-svarvning (2³ + 3 centrumpunkter).');
  };

  const handleExportRunSheet = () => {
    const respHeader = responseUnit
      ? `${responseName} (${responseUnit})`
      : responseName || 'Resultat (Y)';
    const sheetRows = runs.map((r) => {
      const obj: Record<string, string | number> = {
        Körordning: r.runOrder,
        StdOrdning: r.stdOrder,
        Typ: r.pointType === 'center' ? 'Centrum' : 'Hörn',
      };
      for (const f of activeFactors) {
        const colName = f.unit ? `${f.name} (${f.unit})` : f.name;
        obj[colName] = r.actual[f.code];
      }
      obj[respHeader] = r.response !== null ? r.response : '';
      return obj;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, 'DOE-Körplan');

    if (analysis) {
      const effRows = analysis.effects.map((e) => ({
        Kod: e.code,
        Term: e.label,
        Effekt: Number(e.effect.toFixed(4)),
        Koefficient: Number(e.coef.toFixed(4)),
        't-värde': e.tStat !== null ? Number(e.tStat.toFixed(3)) : 'Lenth',
        'p-värde': e.pValue !== null ? Number(e.pValue.toFixed(4)) : 'Lenth',
        Signifikant: e.isSignificant ? 'JA' : 'Nej',
      }));
      const wsEff = XLSX.utils.json_to_sheet(effRows);
      XLSX.utils.book_append_sheet(wb, wsEff, 'DOE-Effekter');
    }

    const safeName =
      experimentName.replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, '_').replace(/^_+|_+$/g, '') || 'DOE_plan';
    XLSX.writeFile(wb, `${safeName}.xlsx`);
    onNotify('success', 'Försöksplan exporterad till Excel (.xlsx).');
  };

  const handleImportResponses = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        if (!(evt.target?.result instanceof ArrayBuffer)) return;
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const importedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (importedRows.length === 0) {
          throw new Error('Filen saknar rader.');
        }

        const headers = Object.keys(importedRows[0]);
        const responseCol =
          headers.find(
            (h) =>
              h.toLowerCase().includes(responseName.toLowerCase()) ||
              h.toLowerCase().includes('resultat') ||
              h.toLowerCase() === 'y'
          ) || headers[headers.length - 1];

        const stdCol = headers.find((h) => h.toLowerCase().includes('std'));
        const runCol = headers.find((h) => h.toLowerCase().includes('kör'));

        let matched = 0;
        const nextRuns = runs.map((r, idx) => {
          let sourceRow: Record<string, unknown> | undefined;
          if (stdCol) {
            sourceRow = importedRows.find(
              (ir) => parseCellNumber(ir[stdCol]) === r.stdOrder
            );
          }
          if (!sourceRow && runCol) {
            sourceRow = importedRows.find(
              (ir) => parseCellNumber(ir[runCol]) === r.runOrder
            );
          }
          if (!sourceRow && importedRows[idx]) {
            sourceRow = importedRows[idx];
          }
          if (!sourceRow) return r;
          const val = parseCellNumber(sourceRow[responseCol]);
          if (val !== null) {
            matched++;
            return { ...r, response: val };
          }
          return r;
        });

        setRuns(nextRuns);
        onNotify(
          'success',
          `Läste in ${matched} mätvärden från kolumnen "${responseCol}".`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        onNotify('error', `Kunde inte läsa in DOE-resultat: ${msg}`);
      } finally {
        if (importFileRef.current) importFileRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCopyEquation = async () => {
    if (!analysis) return;
    const text =
      equationMode === 'actual' ? analysis.actualEquation : analysis.codedEquation;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedEq(true);
      setTimeout(() => setCopiedEq(false), 1800);
      onNotify('success', 'DOE-ekvation kopierad till urklipp.');
    } catch {
      onNotify('info', 'Markera ekvationen manuellt för att kopiera.');
    }
  };

  const completedCount = runs.filter(
    (r) => r.response !== null && Number.isFinite(r.response)
  ).length;

  return (
    <div className="space-y-6">
      {/* STEP 1: Design Builder */}
      <Card padding="none" className="p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <FlaskConical className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">
                DOE — Försöksplanering (Design of Experiments)
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bygg 2-nivåers faktorförsök, exportera slumpad körplan till produktionen och
                analysera huvudeffekter, samspel (interactions), kurvatur och optimala inställningar.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleLoadSample}>
              <RotateCcw className="w-4 h-4" />
              Ladda exempel-DOE (CNC)
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleRebuildDesign(design, replicates, centerPoints)}
            >
              <Sparkles className="w-4 h-4" />
              Skapa ny körplan
            </Button>
          </div>
        </div>

        {/* Design Parameters Row */}
        <div className="pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 space-y-1">
            <label htmlFor="doe-design-type" className="text-xs font-medium text-muted-foreground">
              Försöksdesign
            </label>
            <select
              id="doe-design-type"
              value={design}
              onChange={(e) => handleRebuildDesign(e.target.value as DoeDesignType, replicates, centerPoints)}
              className="w-full h-9 px-3 text-xs font-medium bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="2^2">2² Full faktoriell (2 faktorer, 4 hörn)</option>
              <option value="2^3">2³ Full faktoriell (3 faktorer, 8 hörn)</option>
              <option value="2^4-1">2⁴⁻¹ Halvfraktion Res IV (4 faktorer, 8 hörn)</option>
              <option value="2^4">2⁴ Full faktoriell (4 faktorer, 16 hörn)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="doe-response-name" className="text-xs font-medium text-muted-foreground">
              Resultatvariabel (Y)
            </label>
            <input
              id="doe-response-name"
              type="text"
              value={responseName}
              onChange={(e) => setResponseName(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="doe-response-unit" className="text-xs font-medium text-muted-foreground">
              Enhet
            </label>
            <input
              id="doe-response-unit"
              type="text"
              value={responseUnit}
              onChange={(e) => setResponseUnit(e.target.value)}
              placeholder="t.ex. µm, mm"
              className="w-full h-9 px-3 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="doe-replicates" className="text-xs font-medium text-muted-foreground">
              Replikat (upprepningar)
            </label>
            <select
              id="doe-replicates"
              value={replicates}
              onChange={(e) => handleRebuildDesign(design, Number(e.target.value), centerPoints)}
              className="w-full h-9 px-3 text-xs font-mono bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={1}>1 (Standard)</option>
              <option value={2}>2 (Dubbla körningar)</option>
              <option value={3}>3 (Tripla körningar)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="doe-centers" className="text-xs font-medium text-muted-foreground">
              Centrumpunkter (kurvatur)
            </label>
            <select
              id="doe-centers"
              value={centerPoints}
              onChange={(e) => handleRebuildDesign(design, replicates, Number(e.target.value))}
              className="w-full h-9 px-3 text-xs font-mono bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={0}>0 (Inga)</option>
              <option value={2}>2 centrumpunkter</option>
              <option value={3}>3 centrumpunkter (Rek.)</option>
              <option value={4}>4 centrumpunkter</option>
            </select>
          </div>
        </div>

        {/* Factor Levels Editor */}
        <div className="pt-4 border-t border-border space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">
              Steg 1 — Faktorinställningar (Låg = −1, Hög = +1)
            </span>
            <span className="text-muted-foreground font-mono tabular-nums">
              {activeFactors.length} aktiva faktorer · {runs.length} totala körningar
            </span>
          </div>

          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                  <th className="py-2 px-3 font-semibold w-14">Kod</th>
                  <th className="py-2 px-3 font-semibold">Faktornamn</th>
                  <th className="py-2 px-3 font-semibold w-28">Enhet</th>
                  <th className="py-2 px-3 font-semibold w-32">Låg nivå (−1)</th>
                  <th className="py-2 px-3 font-semibold w-32">Hög nivå (+1)</th>
                  <th className="py-2 px-3 font-semibold w-28 text-right">Centrum (0)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeFactors.map((f) => (
                  <tr key={f.code}>
                    <td className="py-2 px-3 font-mono font-bold text-primary">{f.code}</td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={f.name}
                        onChange={(e) => handleUpdateFactor(f.code, { name: e.target.value })}
                        className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={f.unit}
                        onChange={(e) => handleUpdateFactor(f.code, { unit: e.target.value })}
                        className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="any"
                        value={f.low}
                        onChange={(e) =>
                          handleUpdateFactor(f.code, { low: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full h-8 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="any"
                        value={f.high}
                        onChange={(e) =>
                          handleUpdateFactor(f.code, { high: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full h-8 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                      {codedToActual(0, f.low, f.high)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* STEP 2: Interactive Run Matrix & Data Entry */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Steg 2 — Körplan &amp; Uppmätta resultat ({completedCount} / {runs.length} ifyllda)
            </h3>
            <p className="text-xs text-muted-foreground">
              Skriv in uppmätt {responseName} direkt i tabellen eller exportera körplanen till Excel
              för verkstaden och importera tillbaka svaren.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportResponses}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={handleRandomize}>
              <Shuffle className="w-3.5 h-3.5" />
              Slumpa ordning
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSortByStd}>
              Std-ordning
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportRunSheet}>
              <Download className="w-3.5 h-3.5" />
              Exportera (.xlsx)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importFileRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              Importera Y
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearResponses}
              title="Rensa alla inmatade Y-värden"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Rensa Y
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-muted border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Kör #</th>
                <th className="py-2.5 px-3 font-semibold">Std #</th>
                <th className="py-2.5 px-3 font-semibold">Typ</th>
                {activeFactors.map((f) => (
                  <th key={f.code} className="py-2.5 px-3 font-semibold text-right">
                    {f.code}: {f.name}
                    {f.unit ? ` (${f.unit})` : ''}
                  </th>
                ))}
                <th className="py-2.5 px-4 font-semibold text-right w-40">
                  {responseName}
                  {responseUnit ? ` (${responseUnit})` : ''} (Y)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono tabular-nums">
              {runs.map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    'transition-colors',
                    r.pointType === 'center' ? 'bg-primary/5' : 'hover:bg-muted/40'
                  )}
                >
                  <td className="py-2 px-3 font-semibold text-foreground">{r.runOrder}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.stdOrder}</td>
                  <td className="py-2 px-3 font-sans">
                    <span
                      className={cn(
                        'font-medium',
                        r.pointType === 'center' ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {r.pointType === 'center' ? 'Centrum (0)' : 'Hörn'}
                    </span>
                  </td>
                  {activeFactors.map((f) => {
                    const c = r.coded[f.code] ?? 0;
                    return (
                      <td key={f.code} className="py-2 px-3 text-right text-foreground">
                        <span>{r.actual[f.code]}</span>
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          ({c > 0 ? '+1' : c < 0 ? '−1' : '0'})
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-4 text-right">
                    <input
                      type="number"
                      step="any"
                      value={r.response ?? ''}
                      onChange={(e) => handleUpdateResponse(r.id, e.target.value)}
                      placeholder="Mätvärde..."
                      className="w-28 h-8 px-2.5 text-right font-mono tabular-nums text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* STEP 3: Live DOE Analysis & Optimization */}
      {!analysis ? (
        <Card padding="lg" className="text-center space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Fyll i minst {activeFactors.length + 1} mätvärden i körplanen ovan för att starta
            DOE-analysen
          </p>
          <p className="text-xs text-muted-foreground">
            Du kan också klicka på &ldquo;Ladda exempel-DOE (CNC)&rdquo; längst upp för att se ett
            färdigt 2³-försök med samspelseffekter och optimering.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Header & Interaction Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Steg 3 — Automatisk DOE-analys &amp; Optimering ({analysis.nCompleted} av{' '}
                {analysis.nTotal} körningar)
              </h3>
              <p className="text-xs text-muted-foreground">{analysis.summaryVerdict}</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={includeInteractions}
                onChange={(e) => setIncludeInteractions(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              Inkludera 2-faktorssamspel (A×B)
            </label>
          </div>

          {analysis.aliasSummary && (
            <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{analysis.aliasSummary}</span>
            </div>
          )}

          {/* 4 DOE Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card padding="sm" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Förklaringsgrad (R²)</span>
                <span className="font-semibold text-primary">
                  {analysis.inferenceMethod === 'ols-t' ? 'OLS t-test' : 'Lenth ME'}
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-foreground">
                {(analysis.rSquared * 100).toFixed(1)} %
              </div>
              <div className="text-xs font-mono tabular-nums text-muted-foreground">
                Just. R²: {(analysis.adjRSquared * 100).toFixed(1)} % · df_fel = {analysis.dfError}
              </div>
            </Card>

            <Card padding="sm" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Starkaste effekt</span>
                <span
                  className={cn(
                    'font-semibold',
                    analysis.effects[0]?.isSignificant
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-muted-foreground'
                  )}
                >
                  {analysis.effects[0]?.isSignificant ? 'Signifikant' : 'Ej signifikant'}
                </span>
              </div>
              <div className="text-lg font-bold text-foreground truncate" title={analysis.effects[0]?.label}>
                {analysis.effects[0]?.label ?? '–'}
              </div>
              <div className="text-xs font-mono tabular-nums text-muted-foreground">
                Effekt: {analysis.effects[0] ? (analysis.effects[0].effect >= 0 ? '+' : '') + analysis.effects[0].effect.toFixed(3) : '–'}{' '}
                {responseUnit}
              </div>
            </Card>

            <Card padding="sm" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Kurvaturtest (Centrum)</span>
                <span
                  className={cn(
                    'font-semibold',
                    !analysis.curvature.hasCenterPoints
                      ? 'text-muted-foreground'
                      : analysis.curvature.isSignificant
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  )}
                >
                  {!analysis.curvature.hasCenterPoints
                    ? 'Ej testad'
                    : analysis.curvature.isSignificant
                    ? 'Kurvatur!'
                    : 'Linjär OK'}
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-foreground">
                {analysis.curvature.pValue !== null
                  ? `p = ${fmtP(analysis.curvature.pValue)}`
                  : analysis.curvature.hasCenterPoints
                  ? `Δ ${fmt(analysis.curvature.difference, 3)}`
                  : '–'}
              </div>
              <div className="text-xs font-mono tabular-nums text-muted-foreground truncate">
                {analysis.curvature.hasCenterPoints
                  ? `Centrum ${fmt(analysis.curvature.centerMean, 3)} vs Hörn ${fmt(analysis.curvature.cornerMean, 3)}`
                  : 'Lägg till 2–3 centrumpunkter'}
              </div>
            </Card>

            <Card padding="sm" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Optimalt förutspått Y</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {goal === 'minimize' ? 'Minimera' : goal === 'maximize' ? 'Maximera' : 'Målvärde'}
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-foreground">
                {optimization ? optimization.predictedY.toFixed(3) : '–'}{' '}
                <span className="text-sm font-normal text-muted-foreground">{responseUnit}</span>
              </div>
              <div className="text-xs font-mono tabular-nums text-muted-foreground">
                Totalmedel i försök: {analysis.grandMean.toFixed(3)}
              </div>
            </Card>
          </div>

          {/* Pareto Chart + Interaction Plot */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Pareto Chart of Effects */}
            <Card padding="none" className="lg:col-span-6 p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Pareto-diagram över effekter ({analysis.paretoMetricLabel})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {analysis.inferenceMethod === 'ols-t'
                      ? 'Staplar förbi röd linje (α = 0.05) är statistiskt signifikanta drivkrafter.'
                      : 'Mättat försök (df_fel = 0): använder automatiskt Lenths metod (ME) likt Minitab.'}
                  </p>
                </div>
                <span className="font-mono tabular-nums text-[11px] text-rose-600 dark:text-rose-400 whitespace-nowrap">
                  Gräns: {analysis.paretoThreshold}
                </span>
              </div>

              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analysis.effects}
                    layout="vertical"
                    margin={{ top: 6, right: 20, bottom: 8, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      domain={[
                        0,
                        (dataMax: number) => Math.max(dataMax * 1.15, analysis.paretoThreshold * 1.25),
                      ]}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={145}
                      tick={{ fontSize: 11, fill: 'var(--foreground)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(
                        val: unknown,
                        _name: string,
                        item: { payload?: { effect: number; pValue: number | null } }
                      ) => [
                        `${Number(val).toFixed(3)} (Effekt: ${
                          (item.payload?.effect ?? 0) >= 0 ? '+' : ''
                        }${fmt(item.payload?.effect, 4)}${
                          item.payload?.pValue !== null && item.payload?.pValue !== undefined
                            ? `, p = ${fmtP(item.payload.pValue)}`
                            : ''
                        })`,
                        analysis.paretoMetricLabel,
                      ]}
                    />
                    {analysis.paretoThreshold > 0 && (
                      <ReferenceLine
                        x={analysis.paretoThreshold}
                        stroke="#e11d48"
                        strokeDasharray="4 3"
                        strokeWidth={1.75}
                      />
                    )}
                    <Bar
                      dataKey="absDisplayValue"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={26}
                      isAnimationActive={false}
                    >
                      {analysis.effects.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill={entry.isSignificant ? '#1d4ed8' : '#94a3b8'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Interaction Plot */}
            <Card padding="none" className="lg:col-span-6 p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Samspelsdiagram (Interaction Plot)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Parallella linjer = inget samspel. Korsande/lutande linjer = faktorerna påverkar
                    varandra.
                  </p>
                </div>

                {activeFactors.length >= 2 && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <select
                      aria-label="Samspelsfaktor X"
                      value={interFactorA}
                      onChange={(e) => {
                        const nextA = e.target.value;
                        setInterFactorA(nextA);
                        if (nextA === interFactorB) {
                          const other = activeFactors.find((f) => f.code !== nextA);
                          if (other) setInterFactorB(other.code);
                        }
                      }}
                      className="h-8 px-2 text-xs bg-card border border-border rounded-md"
                    >
                      {activeFactors.map((f) => (
                        <option key={f.code} value={f.code}>
                          {f.code}: {f.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-muted-foreground">×</span>
                    <select
                      aria-label="Samspelsfaktor linje"
                      value={interFactorB}
                      onChange={(e) => setInterFactorB(e.target.value)}
                      className="h-8 px-2 text-xs bg-card border border-border rounded-md"
                    >
                      {activeFactors
                        .filter((f) => f.code !== interFactorA)
                        .map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.code}: {f.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {interactionPlot ? (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={interactionPlot.points}
                      margin={{ top: 10, right: 20, bottom: 8, left: 6 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="levelALabel"
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        width={52}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          borderColor: 'var(--border)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(val: unknown) => [
                          typeof val === 'number' ? val.toFixed(4) : '–',
                          responseName,
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine
                        y={analysis.grandMean}
                        stroke="#94a3b8"
                        strokeDasharray="4 4"
                      />
                      <Line
                        type="linear"
                        dataKey="bLowMean"
                        name={`${interactionPlot.factorB.name} Låg (${interactionPlot.factorB.low})`}
                        stroke="#1d4ed8"
                        strokeWidth={2.25}
                        dot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                      <Line
                        type="linear"
                        dataKey="bHighMean"
                        name={`${interactionPlot.factorB.name} Hög (${interactionPlot.factorB.high})`}
                        stroke="#e11d48"
                        strokeWidth={2.25}
                        dot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </Card>
          </div>

          {/* Main Effects Plot Grid */}
          <Card padding="none" className="p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Huvudeffektdiagram (Main Effects Plot) — {responseName}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Brantare lutning mellan Låg (−1) och Hög (+1) betyder starkare direkt effekt på{' '}
                  {responseName}. Streckad linje visar försökets medelvärde ({analysis.grandMean.toFixed(3)}).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {analysis.mainEffectsPlot.map((series) => {
                const miniData = [
                  { level: `${series.lowLevel}`, mean: Number(series.lowMean.toFixed(4)) },
                  { level: `${series.highLevel}`, mean: Number(series.highMean.toFixed(4)) },
                ];
                return (
                  <div
                    key={series.code}
                    className="border border-border rounded-lg p-3 space-y-2 bg-muted/20"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground truncate" title={series.name}>
                        {series.code}: {series.name}
                      </span>
                      <span
                        className={cn(
                          'font-mono tabular-nums font-semibold',
                          series.delta >= 0
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        )}
                      >
                        {series.delta >= 0 ? '+' : ''}
                        {series.delta.toFixed(3)}
                      </span>
                    </div>
                    <div className="h-[135px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={miniData}
                          margin={{ top: 8, right: 16, bottom: 2, left: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            dataKey="level"
                            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                          />
                          <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                            width={42}
                          />
                          <ReferenceLine
                            y={analysis.grandMean}
                            stroke="#94a3b8"
                            strokeDasharray="3 3"
                          />
                          <Line
                            type="linear"
                            dataKey="mean"
                            stroke="#1d4ed8"
                            strokeWidth={2.25}
                            dot={{ r: 4 }}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* DOE Response Optimizer + Model Equation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card padding="none" className="lg:col-span-6 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Optimala maskininställningar (DOE Optimizer)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Beräknar bästa faktorkombination inklusive samspelseffekter.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    aria-label="DOE-mål"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value as DoeGoal)}
                    className="h-8 px-2.5 text-xs font-medium bg-card border border-border rounded-lg"
                  >
                    <option value="minimize">Minimera Y</option>
                    <option value="maximize">Maximera Y</option>
                    <option value="target">Träffa målvärde</option>
                  </select>
                  {goal === 'target' && (
                    <input
                      type="number"
                      step="any"
                      value={targetValue}
                      onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
                      className="h-8 w-20 px-2 font-mono tabular-nums text-xs bg-card border border-border rounded-lg"
                    />
                  )}
                </div>
              </div>

              {optimization && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {activeFactors.map((f) => {
                      const codedVal = optimization.codedSettings[f.code] ?? 0;
                      const levelHint =
                        codedVal <= -0.95
                          ? 'Låg (−1)'
                          : codedVal >= 0.95
                          ? 'Hög (+1)'
                          : `Mellan (${codedVal.toFixed(2)})`;
                      return (
                        <div
                          key={f.code}
                          className="p-3 rounded-lg border border-border bg-muted/30 space-y-0.5"
                        >
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              {f.code}: {f.name}
                            </span>
                            <span className="font-mono">{levelHint}</span>
                          </div>
                          <div className="font-mono tabular-nums text-base font-bold text-foreground">
                            {optimization.actualSettings[f.code]}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                              {f.unit}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Förutspått resultat ({responseName}) vid optimal inställning:</span>
                    </div>
                    <span className="font-mono tabular-nums text-base font-bold text-foreground">
                      {optimization.predictedY.toFixed(4)} {responseUnit}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            {/* Model Equation & Curvature Note */}
            <Card padding="none" className="lg:col-span-6 p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    DOE-ekvation &amp; Kurvaturbedömning
                  </h4>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-border p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setEquationMode('actual')}
                        className={cn(
                          'px-2 py-0.5 rounded-md font-medium cursor-pointer',
                          equationMode === 'actual'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        Verkliga
                      </button>
                      <button
                        type="button"
                        onClick={() => setEquationMode('coded')}
                        className={cn(
                          'px-2 py-0.5 rounded-md font-medium cursor-pointer',
                          equationMode === 'coded'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        Kodade (−1/+1)
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyEquation}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
                    >
                      {copiedEq ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedEq ? 'Kopierad' : 'Kopiera'}
                    </button>
                  </div>
                </div>

                <div className="px-3.5 py-2.5 rounded-lg bg-muted/50 border border-border font-mono text-xs text-foreground overflow-x-auto whitespace-nowrap">
                  {equationMode === 'actual' ? analysis.actualEquation : analysis.codedEquation}
                </div>
              </div>

              <div
                className={cn(
                  'p-3.5 rounded-lg border text-xs leading-relaxed flex items-start gap-2.5',
                  analysis.curvature.isSignificant
                    ? 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-border bg-muted/30 text-muted-foreground'
                )}
              >
                {analysis.curvature.isSignificant ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                )}
                <span>{analysis.curvature.message}</span>
              </div>
            </Card>
          </div>

          {/* Complete Effects Table */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h4 className="text-sm font-semibold text-foreground">
                Effekt- &amp; Koefficienttabell (Kodade enheter −1 till +1)
              </h4>
              <p className="text-xs text-muted-foreground">
                Effekten anger hur mycket {responseName} förändras när faktorn går från Låg (−1) till
                Hög (+1).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-4 font-semibold">Kod</th>
                    <th className="py-2.5 px-3 font-semibold">Term</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Effekt (ΔY)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Kodad β</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Std.fel</th>
                    <th className="py-2.5 px-3 font-semibold text-right">t-värde</th>
                    <th className="py-2.5 px-3 font-semibold text-right">p-värde</th>
                    <th className="py-2.5 px-4 font-semibold">Bedömning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono tabular-nums">
                  {analysis.effects.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="py-2.5 px-4 font-bold text-primary">{e.code}</td>
                      <td className="py-2.5 px-3 font-sans font-medium text-foreground">
                        {e.label}
                        {e.aliasNote && (
                          <span className="ml-2 text-[11px] text-muted-foreground">
                            ({e.aliasNote})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                        {e.effect >= 0 ? '+' : ''}
                        {e.effect.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {e.coef >= 0 ? '+' : ''}
                        {e.coef.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {fmt(e.stdError, 4)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-foreground">
                        {fmt(e.tStat, 2)}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 px-3 text-right font-semibold',
                          e.isSignificant
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        {e.pValue !== null ? fmtP(e.pValue) : 'Lenth'}
                      </td>
                      <td className="py-2.5 px-4 font-sans">
                        {e.isSignificant ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            Signifikant
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Ej signifikant</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
