import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  Sparkles,
  Copy,
  Check,
  SlidersHorizontal,
  Target,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { ProductionRow, SpecLimits } from '@/src/lib/stats';
import {
  OptimizationGoal,
  RegressionTermSpec,
  buildLinearTerms,
  buildTermsWithQuadratics,
  findOptimalModel,
  fitMultipleRegression,
  optimizeResponse,
  predictWithInterval,
} from '@/src/lib/regression';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '@/src/lib/utils';

interface RegressionViewProps {
  rows: ProductionRow[];
  columns: string[];
  selectedMetric: string;
  spec: SpecLimits;
  onSelectMetric: (col: string) => void;
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

export function RegressionView({
  rows,
  columns,
  selectedMetric,
  spec,
  onSelectMetric,
  onNotify,
}: RegressionViewProps) {
  const candidateFactors = useMemo(
    () => columns.filter((c) => c !== selectedMetric),
    [columns, selectedMetric]
  );

  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const [quadraticFactors, setQuadraticFactors] = useState<string[]>([]);
  const [allowCurvature, setAllowCurvature] = useState<boolean>(false);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [diagnosticChart, setDiagnosticChart] = useState<'actual-vs-pred' | 'residuals'>(
    'actual-vs-pred'
  );
  const [copiedEq, setCopiedEq] = useState<boolean>(false);

  // Response Optimizer State
  const [optGoal, setOptGoal] = useState<OptimizationGoal>('target');
  const [optTarget, setOptTarget] = useState<number>(spec.target);
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({});

  // Sync optimizer target when active metric or spec target changes
  useEffect(() => {
    setOptTarget(spec.target);
  }, [selectedMetric, spec.target]);

  // Auto-run optimal model finder when target Y, columns, or row count changes
  useEffect(() => {
    if (candidateFactors.length === 0) {
      setSelectedFactors([]);
      setQuadraticFactors([]);
      setAutoNote(null);
      return;
    }
    const rec = findOptimalModel(rows, selectedMetric, candidateFactors, allowCurvature);
    if (rec) {
      setSelectedFactors(rec.selectedFactors);
      setQuadraticFactors(
        rec.selectedTerms.filter((t) => t.degree === 2).map((t) => t.factor)
      );
      setAutoNote(rec.explanation);
    } else {
      setSelectedFactors(candidateFactors.slice(0, 3));
      setQuadraticFactors([]);
      setAutoNote(null);
    }
  }, [rows, selectedMetric, candidateFactors, allowCurvature]);

  const activeTerms: RegressionTermSpec[] = useMemo(() => {
    if (selectedFactors.length === 0) return [];
    const validQuads = quadraticFactors.filter((qf) => selectedFactors.includes(qf));
    return validQuads.length > 0
      ? buildTermsWithQuadratics(selectedFactors, validQuads)
      : buildLinearTerms(selectedFactors);
  }, [selectedFactors, quadraticFactors]);

  const model = useMemo(
    () => fitMultipleRegression(rows, selectedMetric, activeTerms),
    [rows, selectedMetric, activeTerms]
  );

  // Initialize simulator slider values to factor means whenever model factors change
  useEffect(() => {
    if (!model) return;
    setSliderValues((prev) => {
      const next: Record<string, number> = {};
      for (const f of model.factors) {
        const range = model.factorRanges[f];
        if (
          prev[f] !== undefined &&
          prev[f] >= range.min &&
          prev[f] <= range.max
        ) {
          next[f] = prev[f];
        } else {
          const span = range.max - range.min;
          const dec = span < 1 ? 4 : span < 20 ? 3 : span < 200 ? 2 : 1;
          next[f] = Number(range.mean.toFixed(dec));
        }
      }
      return next;
    });
  }, [model]);

  const handleFindOptimal = () => {
    const rec = findOptimalModel(rows, selectedMetric, candidateFactors, allowCurvature);
    if (!rec) {
      onNotify('error', 'Behöver fler mätpunkter eller X-faktorer för att bygga en modell.');
      return;
    }
    setSelectedFactors(rec.selectedFactors);
    setQuadraticFactors(
      rec.selectedTerms.filter((t) => t.degree === 2).map((t) => t.factor)
    );
    setAutoNote(rec.explanation);
    onNotify(
      'success',
      `Optimal modell vald (${rec.selectedFactors.length} faktor${
        rec.selectedFactors.length === 1 ? '' : 'er'
      }, justerat R² = ${(rec.result.adjRSquared * 100).toFixed(1)} %).`
    );
  };

  const handleSelectAllFactors = () => {
    setSelectedFactors(candidateFactors);
    setQuadraticFactors([]);
    setAutoNote('Manuellt läge: samtliga tillgängliga X-faktorer inkluderade i modellen.');
  };

  const toggleFactor = (factor: string) => {
    setAutoNote(null);
    setSelectedFactors((prev) => {
      if (prev.includes(factor)) {
        setQuadraticFactors((q) => q.filter((x) => x !== factor));
        return prev.filter((x) => x !== factor);
      }
      return [...prev, factor];
    });
  };

  const toggleQuadratic = (factor: string) => {
    setAutoNote(null);
    setQuadraticFactors((prev) =>
      prev.includes(factor) ? prev.filter((x) => x !== factor) : [...prev, factor]
    );
  };

  const handleRunOptimizer = () => {
    if (!model) return;
    const sol = optimizeResponse(model, optGoal, optTarget);
    setSliderValues(sol.settings);
    onNotify(
      'success',
      `Optimala inställningar beräknade — förutspått ${selectedMetric}: ${sol.predictedY.toFixed(4)}.`
    );
  };

  const handleResetSliders = () => {
    if (!model) return;
    const defaults: Record<string, number> = {};
    for (const f of model.factors) {
      const r = model.factorRanges[f];
      const span = r.max - r.min;
      const dec = span < 1 ? 4 : span < 20 ? 3 : span < 200 ? 2 : 1;
      defaults[f] = Number(r.mean.toFixed(dec));
    }
    setSliderValues(defaults);
  };

  const handleCopyEquation = async () => {
    if (!model) return;
    try {
      await navigator.clipboard.writeText(model.equationText);
      setCopiedEq(true);
      setTimeout(() => setCopiedEq(false), 1800);
      onNotify('success', 'Modellekvationen kopierad till urklipp.');
    } catch {
      onNotify('info', 'Kunde inte kopiera automatiskt — markera ekvationen manuellt.');
    }
  };

  // Pareto chart data (absolute t-statistics sorted highest to lowest)
  const paretoData = useMemo(() => {
    if (!model) return [];
    return model.coefficients
      .filter((c) => c.degree > 0)
      .map((c) => ({
        term: c.term,
        absT: Number(Math.abs(c.tStat).toFixed(3)),
        tStat: c.tStat,
        pValue: c.pValue,
        isSignificant: c.isSignificant,
        direction: c.estimate >= 0 ? 'Ökar Y' : 'Minskar Y',
      }))
      .sort((a, b) => b.absT - a.absT);
  }, [model]);

  // Bounds for Actual vs Predicted 45° reference line
  const fitBounds = useMemo(() => {
    if (!model || model.points.length === 0) return { min: 0, max: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const pt of model.points) {
      if (pt.actual < min) min = pt.actual;
      if (pt.predicted < min) min = pt.predicted;
      if (pt.actual > max) max = pt.actual;
      if (pt.predicted > max) max = pt.predicted;
    }
    const pad = (max - min) * 0.06 || 0.5;
    return { min: Number((min - pad).toFixed(4)), max: Number((max + pad).toFixed(4)) };
  }, [model]);

  const idealFitLine = useMemo(
    () => [
      { predicted: fitBounds.min, ideal: fitBounds.min },
      { predicted: fitBounds.max, ideal: fitBounds.max },
    ],
    [fitBounds]
  );

  // Live Simulator Prediction
  const livePrediction = useMemo(() => {
    if (!model) return null;
    const ready = model.factors.every((f) => Number.isFinite(sliderValues[f]));
    if (!ready) return null;
    return predictWithInterval(model, sliderValues);
  }, [model, sliderValues]);

  const isWithinSpec =
    livePrediction !== null &&
    spec.usl > spec.lsl &&
    livePrediction.predictedY >= spec.lsl &&
    livePrediction.predictedY <= spec.usl;

  const isIntervalWithinSpec =
    livePrediction !== null &&
    spec.usl > spec.lsl &&
    livePrediction.low >= spec.lsl &&
    livePrediction.high <= spec.usl;

  if (columns.length < 2) {
    return (
      <Card padding="lg" className="text-center space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Regressionsanalys kräver minst två numeriska kolumner
        </h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
          Importera en Excel- eller CSV-fil med både en resultatvariabel (Y) och en eller flera
          processparametrar (X), t.ex. temperatur, tryck, matning eller varvtal.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Control Card: Choose Y, Auto-Optimal Model, Toggle X Factors */}
      <Card padding="none" className="p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Regressionsanalys &amp; Modelloptimering (Flera X mot Y)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Välj resultatvariabel (Y) — appen hittar automatiskt vilka faktorer (X) som styr
              utfallet och räknar ut optimala processinställningar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground mr-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowCurvature}
                onChange={(e) => setAllowCurvature(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
              Testa kurvatur (X²)
            </label>
            <Button variant="primary" size="sm" onClick={handleFindOptimal}>
              <Sparkles className="w-4 h-4" />
              Hitta optimal modell
            </Button>
            <Button variant="outline" size="sm" onClick={handleSelectAllFactors}>
              Alla faktorer
            </Button>
          </div>
        </div>

        {/* Target Y & Candidate X Factors */}
        <div className="pt-4 border-t border-border grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-4 space-y-1.5">
            <label htmlFor="reg-target-y" className="text-xs font-semibold text-foreground block">
              Resultatvariabel (Y — det du vill styra)
            </label>
            <select
              id="reg-target-y"
              value={selectedMetric}
              onChange={(e) => onSelectMetric(e.target.value)}
              className="w-full h-9 px-3 text-sm font-medium bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {columns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
            <p className="text-[11px] font-mono tabular-nums text-muted-foreground">
              LSL {spec.lsl} · Target {spec.target} · USL {spec.usl}
            </p>
          </div>

          <div className="lg:col-span-8 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Faktorer i modellen (X — klicka för att slå av/på)
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {selectedFactors.length} av {candidateFactors.length} valda
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {candidateFactors.map((factor) => {
                const active = selectedFactors.includes(factor);
                const hasQuad = quadraticFactors.includes(factor);
                return (
                  <div
                    key={factor}
                    className={cn(
                      'inline-flex items-center rounded-lg border text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/8 text-foreground font-medium'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFactor(factor)}
                      className="px-3 py-1.5 flex items-center gap-2 cursor-pointer"
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full',
                          active ? 'bg-primary' : 'bg-muted-foreground/40'
                        )}
                      />
                      {factor}
                    </button>
                    {active && (
                      <button
                        type="button"
                        onClick={() => toggleQuadratic(factor)}
                        title={`Lägg till eller ta bort kurvatur (${factor}²)`}
                        className={cn(
                          'px-2 py-1.5 border-l border-border/70 font-mono text-[11px] cursor-pointer transition-colors rounded-r-lg',
                          hasQuad
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        )}
                      >
                        +X²
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Auto-selection explanation */}
        {autoNote && (
          <div className="p-3 rounded-lg border border-primary/25 bg-primary/5 text-xs text-foreground leading-relaxed flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>{autoNote}</span>
          </div>
        )}
      </Card>

      {!model ? (
        <Card padding="lg" className="text-center space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Välj minst en X-faktor ovan för att beräkna regressionsmodellen
          </p>
          <p className="text-xs text-muted-foreground">
            Modellen kräver fler giltiga mätpunkter (N) än antal parametrar i ekvationen.
          </p>
        </Card>
      ) : (
        <>
          {/* 4 Model Quality KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card padding="sm" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Förklaringsgrad (R²)</span>
                <span
                  className={cn(
                    'font-semibold',
                    model.adjRSquared >= 0.7
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : model.adjRSquared >= 0.4
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-rose-700 dark:text-rose-400'
                  )}
                >
                  {model.adjRSquared >= 0.7
                    ? 'Stark'
                    : model.adjRSquared >= 0.4
                    ? 'Måttlig'
                    : 'Svag'}
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-foreground">
                {(model.rSquared * 100).toFixed(1)} %
              </div>
              <div className="text-xs font-mono tabular-nums text-muted-foreground">
                Justerat R²: {(model.adjRSquared * 100).toFixed(1)} % · N = {model.n}
              </div>
            </Card>

            <Card padding="sm" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Modellens p-värde (ANOVA)</span>
                <span
                  className={cn(
                    'font-semibold',
                    model.modelPValue < 0.05
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-700 dark:text-rose-400'
                  )}
                >
                  {model.modelPValue < 0.05 ? 'Signifikant' : 'Ej signifikant'}
                </span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-foreground">
                {fmtP(model.modelPValue)}
              </div>
              <div className="text-xs font-mono tabular-nums text-muted-foreground">
                F({model.dfModel}, {model.dfError}) = {fmt(model.fStat, 2)}
              </div>
            </Card>

            <Card padding="sm" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Modellfel (S / RMSE)</span>
                <span className="text-muted-foreground font-medium">Precision</span>
              </div>
              <div className="font-mono tabular-nums text-2xl font-bold text-foreground">
                {fmt(model.rmse, 4)}
              </div>
              <div className="text-xs font-mono tabular-nums text-muted-foreground">
                MAE: {fmt(model.mae, 4)} · AICc: {fmt(model.aicc, 1)}
              </div>
            </Card>

            <Card padding="sm" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Modelldiagnostik</span>
                <span
                  className={cn(
                    'font-semibold',
                    model.collinearWarning
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  )}
                >
                  {model.collinearWarning ? 'Multikollinearitet' : 'Stabil'}
                </span>
              </div>
              <div className="text-xl font-bold text-foreground">
                {model.coefficients.filter((c) => c.degree > 0 && c.isSignificant).length} /{' '}
                {model.terms.length} termer
              </div>
              <div className="text-xs font-mono tabular-nums text-muted-foreground">
                signifikanta · DW: {fmt(model.durbinWatson, 2)}
              </div>
            </Card>
          </div>

          {/* Model Equation & Plain-Swedish Summary */}
          <Card padding="none" className="p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Regressionsmodellens ekvation
              </span>
              <button
                type="button"
                onClick={handleCopyEquation}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer self-start"
              >
                {copiedEq ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedEq ? 'Kopierad' : 'Kopiera ekvation'}
              </button>
            </div>
            <div className="px-3.5 py-2.5 rounded-lg bg-muted/50 border border-border font-mono text-xs sm:text-sm text-foreground overflow-x-auto whitespace-nowrap">
              {model.equationText}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{model.summaryVerdict}</p>
            {model.collinearWarning && (
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Hög samvariation (VIF &gt; 5) mellan vissa X-faktorer. Prova knappen &ldquo;Hitta
                  optimal modell&rdquo; för att rensa bort överlappande variabler.
                </span>
              </div>
            )}
          </Card>

          {/* 2 Core Visuals: Pareto of Standardized Effects + Actual vs Predicted / Residuals */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Pareto Chart of Factor Importance */}
            <Card padding="none" className="lg:col-span-6 p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Pareto-diagram över faktoreffekter (|t-värde|)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Staplar som passerar den röda gränsen (α = 0.05) har verklig effekt på{' '}
                    {selectedMetric}.
                  </p>
                </div>
                <span className="font-mono tabular-nums text-[11px] text-rose-600 dark:text-rose-400 whitespace-nowrap">
                  Gräns: {model.tCritical05.toFixed(2)}
                </span>
              </div>

              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={paretoData}
                    layout="vertical"
                    margin={{ top: 6, right: 22, bottom: 8, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      domain={[
                        0,
                        (dataMax: number) => Math.max(dataMax * 1.12, model.tCritical05 * 1.25),
                      ]}
                    />
                    <YAxis
                      type="category"
                      dataKey="term"
                      width={135}
                      tick={{ fontSize: 11, fill: 'var(--foreground)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(val: unknown, _name: string, item: { payload?: { direction: string; pValue: number } }) => [
                        `|t| = ${Number(val).toFixed(2)} (${item.payload?.direction ?? ''}, p = ${fmtP(
                          item.payload?.pValue
                        )})`,
                        'Effektstyrka',
                      ]}
                    />
                    <ReferenceLine
                      x={model.tCritical05}
                      stroke="#e11d48"
                      strokeDasharray="4 3"
                      strokeWidth={1.75}
                    />
                    <Bar dataKey="absT" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
                      {paretoData.map((entry) => (
                        <Cell
                          key={entry.term}
                          fill={entry.isSignificant ? '#1d4ed8' : '#94a3b8'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Actual vs Predicted OR Residuals Diagnostic Chart */}
            <Card padding="none" className="lg:col-span-6 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {diagnosticChart === 'actual-vs-pred'
                      ? `Faktiskt vs Förutspått (${selectedMetric})`
                      : 'Residualer vs Förutspått (Modellkontroll)'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {diagnosticChart === 'actual-vs-pred'
                      ? 'Ju närmare diagonalen punkterna ligger, desto mer träffsäker är modellen.'
                      : 'Slumpmässigt moln runt 0 utan tydlig båge visar att modellen är väl anpassad.'}
                  </p>
                </div>

                <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setDiagnosticChart('actual-vs-pred')}
                    className={cn(
                      'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
                      diagnosticChart === 'actual-vs-pred'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Passning
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiagnosticChart('residuals')}
                    className={cn(
                      'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
                      diagnosticChart === 'residuals'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Residualer
                  </button>
                </div>
              </div>

              <div className="h-[260px] w-full">
                {diagnosticChart === 'actual-vs-pred' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={{ top: 8, right: 16, bottom: 18, left: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        type="number"
                        dataKey="predicted"
                        domain={[fitBounds.min, fitBounds.max]}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        label={{
                          value: 'Förutspått (Ŷ)',
                          position: 'insideBottom',
                          offset: -10,
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="actual"
                        domain={[fitBounds.min, fitBounds.max]}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        width={52}
                        label={{
                          value: 'Faktiskt (Y)',
                          angle: -90,
                          position: 'insideLeft',
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          borderColor: 'var(--border)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(val: unknown, name: string) => [
                          typeof val === 'number' ? val.toFixed(4) : String(val),
                          name === 'actual' ? 'Faktiskt Y' : 'Ideallinje',
                        ]}
                      />
                      <Line
                        data={idealFitLine}
                        dataKey="ideal"
                        type="linear"
                        stroke="#94a3b8"
                        strokeDasharray="5 4"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                        name="Ideallinje"
                      />
                      <Scatter
                        data={model.points}
                        dataKey="actual"
                        fill="#1d4ed8"
                        fillOpacity={0.75}
                        isAnimationActive={false}
                        name="actual"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart margin={{ top: 8, right: 16, bottom: 18, left: 6 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        type="number"
                        dataKey="predicted"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        label={{
                          value: 'Förutspått (Ŷ)',
                          position: 'insideBottom',
                          offset: -10,
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="residual"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                        width={52}
                        label={{
                          value: 'Residual (Y − Ŷ)',
                          angle: -90,
                          position: 'insideLeft',
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          borderColor: 'var(--border)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(val: unknown) => [
                          typeof val === 'number' ? val.toFixed(4) : String(val),
                          'Residual',
                        ]}
                      />
                      <ReferenceLine y={0} stroke="#64748b" strokeWidth={1.5} />
                      <ReferenceLine
                        y={2 * model.rmse}
                        stroke="#f59e0b"
                        strokeDasharray="4 3"
                      />
                      <ReferenceLine
                        y={-2 * model.rmse}
                        stroke="#f59e0b"
                        strokeDasharray="4 3"
                      />
                      <Scatter
                        data={model.points}
                        dataKey="residual"
                        fill="#0f766e"
                        fillOpacity={0.75}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* Interactive Response Optimizer ("Vad-om-simulator & Optimala inställningar") */}
          <Card padding="none" className="p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Optimala inställningar &amp; Vad-om-simulator (Response Optimizer)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Dra i reglagen för att testa processändringar i realtid, eller låt appen räkna ut
                    optimala inställningar inom maskinens observerade arbetsområde.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Optimeringsmål"
                  value={optGoal}
                  onChange={(e) => setOptGoal(e.target.value as OptimizationGoal)}
                  className="h-9 px-2.5 text-xs font-medium bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="target">Mål: Träffa målvärde</option>
                  <option value="minimize">Mål: Minimera Y</option>
                  <option value="maximize">Mål: Maximera Y</option>
                </select>

                {optGoal === 'target' && (
                  <input
                    type="number"
                    step="any"
                    aria-label="Målvärde för optimering"
                    value={optTarget}
                    onChange={(e) => setOptTarget(parseFloat(e.target.value) || 0)}
                    className="h-9 w-24 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}

                <Button variant="primary" size="sm" onClick={handleRunOptimizer}>
                  <Target className="w-4 h-4" />
                  Beräkna optimala inställningar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetSliders}
                  title="Återställ reglage till medelvärde"
                >
                  <RotateCcw className="w-4 h-4" />
                  Medel
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Sliders */}
              <div className="lg:col-span-7 space-y-4">
                {model.factors.map((factor) => {
                  const range = model.factorRanges[factor];
                  const span = Math.max(1e-6, range.max - range.min);
                  const step = Number((span / 100).toPrecision(2)) || 0.01;
                  const val = sliderValues[factor] ?? range.mean;

                  return (
                    <div key={factor} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">{factor}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                            [{fmt(range.min, 2)} – {fmt(range.max, 2)}]
                          </span>
                          <input
                            type="number"
                            step={step}
                            value={val}
                            onChange={(e) => {
                              const parsed = parseFloat(e.target.value);
                              if (Number.isFinite(parsed)) {
                                setSliderValues((prev) => ({ ...prev, [factor]: parsed }));
                              }
                            }}
                            className="w-24 h-7 px-2 font-mono tabular-nums text-xs text-right bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={range.min}
                        max={range.max}
                        step={step}
                        value={Math.max(range.min, Math.min(range.max, val))}
                        onChange={(e) =>
                          setSliderValues((prev) => ({
                            ...prev,
                            [factor]: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-primary cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Live Predicted Y Readout */}
              <div className="lg:col-span-5 border border-border rounded-xl p-5 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">
                    Förutspått {selectedMetric}
                  </span>
                  {spec.usl > spec.lsl && livePrediction && (
                    <span
                      className={cn(
                        'font-semibold inline-flex items-center gap-1',
                        isIntervalWithinSpec
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : isWithinSpec
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-rose-700 dark:text-rose-400'
                      )}
                    >
                      {isIntervalWithinSpec ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {isIntervalWithinSpec
                        ? 'Säkert inom spec'
                        : isWithinSpec
                        ? 'Inom spec (snäv marginal)'
                        : 'Utanför tolerans'}
                    </span>
                  )}
                </div>

                <div className="font-mono tabular-nums text-3xl font-bold tracking-tight text-foreground">
                  {livePrediction ? livePrediction.predictedY.toFixed(4) : '–'}
                </div>

                {livePrediction && (
                  <div className="space-y-1.5 text-xs text-muted-foreground font-mono tabular-nums pt-2 border-t border-border">
                    <div className="flex justify-between">
                      <span>95 % prediktionsintervall:</span>
                      <span className="text-foreground font-medium">
                        [{livePrediction.low.toFixed(3)}, {livePrediction.high.toFixed(3)}]
                      </span>
                    </div>
                    {optGoal === 'target' && (
                      <div className="flex justify-between">
                        <span>Avvikelse från mål ({optTarget}):</span>
                        <span className="text-foreground font-medium">
                          {livePrediction.predictedY - optTarget >= 0 ? '+' : ''}
                          {(livePrediction.predictedY - optTarget).toFixed(4)}
                        </span>
                      </div>
                    )}
                    {spec.usl > spec.lsl && (
                      <div className="flex justify-between">
                        <span>Toleransintervall:</span>
                        <span>
                          [{spec.lsl}, {spec.usl}]
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Coefficient Table */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Koefficienttabell (OLS-skattning &amp; Signifikanstest)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Visar hur mycket {selectedMetric} förändras per +1 enhet i varje X-faktor när
                  övriga faktorer hålls konstanta.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                    <th className="py-2.5 px-4 font-semibold">Term</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Koefficient (β)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Std.fel</th>
                    <th className="py-2.5 px-3 font-semibold text-right">95 % KI</th>
                    <th className="py-2.5 px-3 font-semibold text-right">t-värde</th>
                    <th className="py-2.5 px-3 font-semibold text-right">p-värde</th>
                    <th className="py-2.5 px-3 font-semibold text-right">VIF</th>
                    <th className="py-2.5 px-4 font-semibold">Bedömning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono tabular-nums">
                  {model.coefficients.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-4 font-sans font-semibold text-foreground">
                        {c.term}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                        {c.estimate >= 0 ? '+' : ''}
                        {c.estimate.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {c.stdError.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap">
                        [{c.ciLow.toFixed(3)}, {c.ciHigh.toFixed(3)}]
                      </td>
                      <td className="py-2.5 px-3 text-right text-foreground">
                        {c.tStat.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 px-3 text-right font-semibold',
                          c.isSignificant
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-muted-foreground'
                        )}
                      >
                        {fmtP(c.pValue)}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 px-3 text-right',
                          c.vif !== null && c.vif > 5
                            ? 'text-amber-700 dark:text-amber-400 font-semibold'
                            : 'text-muted-foreground'
                        )}
                      >
                        {c.vif !== null ? c.vif.toFixed(2) : '–'}
                      </td>
                      <td className="py-2.5 px-4 font-sans">
                        {c.degree === 0 ? (
                          <span className="text-muted-foreground">Skärningspunkt</span>
                        ) : c.isSignificant ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            Signifikant ({c.estimate >= 0 ? 'positiv' : 'negativ'})
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
        </>
      )}
    </div>
  );
}
