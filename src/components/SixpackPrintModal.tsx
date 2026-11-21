import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Bar,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Printer, X } from 'lucide-react';
import {
  Anomaly,
  ChartPoint,
  HistogramBin,
  SpecLimits,
  StatsResult,
  downsampleChartSeries,
} from '@/src/lib/stats';
import { NonNormalCapability, QQPoint } from '@/src/lib/advancedStats';
import { Button } from './ui/Button';
import { cn } from '@/src/lib/utils';

interface SixpackPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  selectedMetric: string;
  spec: SpecLimits;
  stats: StatsResult;
  anomalies: Anomaly[];
  series: ChartPoint[];
  histogram: HistogramBin[];
  nonNormalCap: NonNormalCapability;
  qqPoints: QQPoint[];
  excludedCount?: number;
}

function fmt(val: number | null | undefined, digits: number = 3): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '–';
  return val.toFixed(digits);
}

export function SixpackPrintModal({
  isOpen,
  onClose,
  datasetName,
  selectedMetric,
  spec,
  stats,
  anomalies,
  series,
  histogram,
  nonNormalCap,
  qqPoints,
  excludedCount = 0,
}: SixpackPrintModalProps) {
  const { displayPoints } = useMemo(() => downsampleChartSeries(series, 250), [series]);

  const qqBounds = useMemo(() => {
    if (qqPoints.length === 0) return { min: 0, max: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const pt of qqPoints) {
      if (pt.expectedValue < min) min = pt.expectedValue;
      if (pt.observedValue < min) min = pt.observedValue;
      if (pt.expectedValue > max) max = pt.expectedValue;
      if (pt.observedValue > max) max = pt.observedValue;
    }
    const pad = (max - min) * 0.08 || 0.5;
    return { min: Number((min - pad).toFixed(4)), max: Number((max + pad).toFixed(4)) };
  }, [qqPoints]);

  const qqRef = useMemo(
    () => [
      { expectedValue: qqBounds.min, refLine: qqBounds.min },
      { expectedValue: qqBounds.max, refLine: qqBounds.max },
    ],
    [qqBounds]
  );

  if (!isOpen) return null;

  const effectivePpk =
    stats.isNormal === false && nonNormalCap.ppk !== null ? nonNormalCap.ppk : stats.ppk;
  const isPass =
    stats.oosCount === 0 &&
    stats.cpk !== null &&
    stats.cpk >= 1.33 &&
    effectivePpk !== null &&
    effectivePpk >= 1.33 &&
    stats.mrOutOfControlCount === 0;
  const isMarginal =
    !isPass &&
    stats.oosCount === 0 &&
    effectivePpk !== null &&
    effectivePpk >= 1.0;

  const verdictLabel = isPass
    ? 'GODKÄND (Cpk/Ppk ≥ 1.33)'
    : isMarginal
    ? 'MARGINAL (Kräver bevakning)'
    : 'EJ GODKÄND (Åtgärd krävs)';

  const verdictColor = isPass
    ? 'text-emerald-700 dark:text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
    : isMarginal
    ? 'text-amber-700 dark:text-amber-400 border-amber-500/40 bg-amber-500/10'
    : 'text-rose-700 dark:text-rose-400 border-rose-500/40 bg-rose-500/10';

  return (
    <div className="sixpack-print-overlay fixed inset-0 z-[100] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="sixpack-print-sheet w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-card text-foreground shadow-2xl">
        {/* Modal Toolbar (hidden in print) */}
        <div className="no-print sticky top-0 z-10 px-6 py-3.5 bg-card border-b border-border flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Capability Sixpack — PPAP / Revisionsrapport (1 sida)
            </h2>
            <p className="text-xs text-muted-foreground">
              Komplett utskriftsklar SPC-översikt (I-Chart, MR-Chart, Histogram, Q-Q &amp; Kapabilitet).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              Skriv ut / Spara PDF
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng Sixpack">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Printable Report Body */}
        <div className="p-6 space-y-5">
          {/* Header Block */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-border">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                Capability Sixpack Report · Production AI Analyst
              </p>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                {datasetName} — {selectedMetric}
              </h1>
              <p className="text-xs font-mono tabular-nums text-muted-foreground">
                Datum: {new Date().toLocaleString('sv-SE')} · N = {stats.count}
                {excludedCount > 0 ? ` (${excludedCount} exkl. Special Cause)` : ''} ·{' '}
                {spec.lslLabel} = {spec.lsl} · Target = {spec.target} · {spec.uslLabel} = {spec.usl}
              </p>
            </div>
            <div
              className={cn(
                'px-3.5 py-2 rounded-lg border text-xs font-bold whitespace-nowrap self-start',
                verdictColor
              )}
            >
              {verdictLabel}
            </div>
          </div>

          {/* 2x2 Sixpack Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. I-Chart */}
            <div className="border border-border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">I-Chart (Individuella värden)</span>
                <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                  UCL {fmt(stats.ucl, 3)} · CL {fmt(stats.mean, 3)} · LCL {fmt(stats.lcl, 3)}
                </span>
              </div>
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayPoints} margin={{ top: 6, right: 10, bottom: 2, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="rowIndex" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={44} />
                    <ReferenceLine y={stats.usl} stroke="#e11d48" strokeDasharray="4 3" />
                    <ReferenceLine y={stats.lsl} stroke="#e11d48" strokeDasharray="4 3" />
                    <ReferenceLine y={stats.ucl} stroke="#f59e0b" strokeDasharray="3 3" />
                    <ReferenceLine y={stats.lcl} stroke="#f59e0b" strokeDasharray="3 3" />
                    <ReferenceLine y={stats.mean} stroke="#64748b" />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#1d4ed8"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. MR-Chart */}
            <div className="border border-border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">MR-Chart (Moving Range)</span>
                <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                  UCL_MR {fmt(stats.uclMr, 3)} · MR-bar {fmt(stats.mrBar, 3)}
                </span>
              </div>
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayPoints} margin={{ top: 6, right: 10, bottom: 2, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="rowIndex" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <YAxis domain={[0, 'auto']} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={44} />
                    <ReferenceLine y={stats.uclMr} stroke="#e11d48" strokeDasharray="4 3" />
                    <ReferenceLine y={stats.mrBar} stroke="#64748b" />
                    <Line
                      type="monotone"
                      dataKey="mr"
                      stroke="#0f766e"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3. Capability Histogram */}
            <div className="border border-border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Kapabilitetshistogram</span>
                <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                  {spec.lslLabel} {spec.lsl} · {spec.uslLabel} {spec.usl}
                </span>
              </div>
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={histogram} margin={{ top: 6, right: 10, bottom: 2, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="binLabel" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={34} />
                    <Bar dataKey="count" fill="#3b82f6" fillOpacity={0.75} isAnimationActive={false} />
                    <Line
                      type="monotone"
                      dataKey="normalExpected"
                      stroke="#e11d48"
                      strokeWidth={1.75}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 4. Normal Probability Plot (Q-Q) */}
            <div className="border border-border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Normal Probability Plot (Q-Q)</span>
                <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                  K² p = {stats.normalityPValue !== null ? stats.normalityPValue.toFixed(4) : '–'}
                </span>
              </div>
              <div className="h-[175px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 6, right: 10, bottom: 2, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      type="number"
                      dataKey="expectedValue"
                      domain={[qqBounds.min, qqBounds.max]}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    />
                    <YAxis
                      type="number"
                      dataKey="observedValue"
                      domain={[qqBounds.min, qqBounds.max]}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      width={44}
                    />
                    <Line
                      data={qqRef}
                      dataKey="refLine"
                      type="linear"
                      stroke="#94a3b8"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Scatter
                      data={qqPoints}
                      dataKey="observedValue"
                      fill="#1d4ed8"
                      fillOpacity={0.75}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Compact Capability Summary Table */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border text-xs">
            <div className="border border-border rounded-lg p-3 space-y-1">
              <p className="font-semibold text-foreground">Kortsiktig (Within)</p>
              <p className="font-mono tabular-nums text-muted-foreground">
                Cp: <strong className="text-foreground">{fmt(stats.cp, 3)}</strong>
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                Cpk: <strong className="text-foreground">{fmt(stats.cpk, 3)}</strong>
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                σ Within: {fmt(stats.stdDevWithin, 4)}
              </p>
            </div>

            <div className="border border-border rounded-lg p-3 space-y-1">
              <p className="font-semibold text-foreground">Långsiktig (Overall)</p>
              <p className="font-mono tabular-nums text-muted-foreground">
                Pp: <strong className="text-foreground">{fmt(stats.pp, 3)}</strong>
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                Ppk: <strong className="text-foreground">{fmt(stats.ppk, 3)}</strong>
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                ISO 22514 Ppk: <strong className="text-primary">{fmt(nonNormalCap.ppk, 3)}</strong>
              </p>
            </div>

            <div className="border border-border rounded-lg p-3 space-y-1">
              <p className="font-semibold text-foreground">Fördelning &amp; Normalitet</p>
              <p className="font-mono tabular-nums text-muted-foreground">
                Medel / Med: {fmt(stats.mean, 3)} / {fmt(stats.median, 3)}
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                Skew / Kurt: {fmt(stats.skewness, 2)} / {fmt(stats.kurtosis, 2)}
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                Normal:{' '}
                <strong className="text-foreground">
                  {stats.isNormal === null ? 'N < 8' : stats.isNormal ? 'Ja' : 'Nej (Använd ISO)'}
                </strong>
              </p>
            </div>

            <div className="border border-border rounded-lg p-3 space-y-1">
              <p className="font-semibold text-foreground">Utfall &amp; Kontroll</p>
              <p className="font-mono tabular-nums text-muted-foreground">
                OOS: <strong className="text-foreground">{stats.oosCount}</strong> ({stats.oosPercent.toFixed(2)}%)
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                PPM (Obs/Förv): {Math.round(stats.ppmObserved).toLocaleString('sv-SE')} /{' '}
                {stats.ppmExpected !== null ? Math.round(stats.ppmExpected).toLocaleString('sv-SE') : '–'}
              </p>
              <p className="font-mono tabular-nums text-muted-foreground">
                Nelson-larm: {anomalies.length} (MR: {stats.mrOutOfControlCount})
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
