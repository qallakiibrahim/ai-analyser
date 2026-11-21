import React, { useMemo, useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  GitCompare,
  Layers,
  Activity,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import {
  ProductionRow,
  SpecLimits,
  StatsResult,
  ChartPoint,
} from '@/src/lib/stats';
import {
  ColumnTriageItem,
  CorrelationFinding,
  NonNormalCapability,
  QQPoint,
  analyzeBeforeAfter,
  analyzeGroups,
} from '@/src/lib/advancedStats';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '@/src/lib/utils';

type AutopilotSection = 'all' | 'triage' | 'normality' | 'correlation' | 'phases' | 'groups';

interface AutopilotViewProps {
  rows: ProductionRow[];
  columns: string[];
  categoryColumns: string[];
  selectedMetric: string;
  spec: SpecLimits;
  stats: StatsResult;
  chartSeries: ChartPoint[];
  triageItems: ColumnTriageItem[];
  nonNormalCap: NonNormalCapability;
  qqPoints: QQPoint[];
  correlations: CorrelationFinding[];
  onSelectMetric: (col: string, jumpToDashboard?: boolean) => void;
  onOpenRegression?: () => void;
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

export function AutopilotView({
  rows,
  columns,
  categoryColumns,
  selectedMetric,
  spec,
  stats,
  chartSeries,
  triageItems,
  nonNormalCap,
  qqPoints,
  correlations,
  onSelectMetric,
  onOpenRegression,
}: AutopilotViewProps) {
  const [section, setSection] = useState<AutopilotSection>('all');
  const [selectedPredictor, setSelectedPredictor] = useState<string>('');
  const [selectedCategoryCol, setSelectedCategoryCol] = useState<string>(categoryColumns[0] || '');

  // Default split row: ~68% through the series (catches late drift in sample data cleanly)
  const minSplitRow = rows.length >= 6 ? rows[3].rowIndex : 1;
  const maxSplitRow = rows.length >= 6 ? rows[rows.length - 3].rowIndex : Math.max(1, rows.length);
  const defaultSplitRow =
    rows.length >= 6 ? rows[Math.floor(rows.length * 0.68)].rowIndex : minSplitRow;
  const [splitRow, setSplitRow] = useState<number>(defaultSplitRow);

  // Keep splitRow in valid bounds whenever dataset size changes
  useEffect(() => {
    if (rows.length >= 6) {
      setSplitRow(rows[Math.floor(rows.length * 0.68)].rowIndex);
    }
  }, [rows.length]);

  // Keep selectedPredictor synced with strongest available correlation
  useEffect(() => {
    if (correlations.length === 0) {
      setSelectedPredictor('');
    } else if (!correlations.some((c) => c.predictor === selectedPredictor)) {
      setSelectedPredictor(correlations[0].predictor);
    }
  }, [correlations, selectedPredictor]);

  // Keep selectedCategoryCol synced with available categoryColumns
  useEffect(() => {
    if (categoryColumns.length === 0) {
      setSelectedCategoryCol('');
    } else if (!categoryColumns.includes(selectedCategoryCol)) {
      setSelectedCategoryCol(categoryColumns[0]);
    }
  }, [categoryColumns, selectedCategoryCol]);

  const activeCorrelation = useMemo(
    () => correlations.find((c) => c.predictor === selectedPredictor) || correlations[0] || null,
    [correlations, selectedPredictor]
  );

  const beforeAfter = useMemo(
    () => analyzeBeforeAfter(rows, selectedMetric, splitRow, spec.usl, spec.lsl, spec.target),
    [rows, selectedMetric, splitRow, spec.usl, spec.lsl, spec.target]
  );

  const groupAnova = useMemo(() => {
    if (!selectedCategoryCol) return null;
    return analyzeGroups(rows, selectedMetric, selectedCategoryCol, spec.usl, spec.lsl);
  }, [rows, selectedMetric, selectedCategoryCol, spec.usl, spec.lsl]);

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

  const qqReferenceLine = useMemo(
    () => [
      { expectedValue: qqBounds.min, refLine: qqBounds.min },
      { expectedValue: qqBounds.max, refLine: qqBounds.max },
    ],
    [qqBounds]
  );

  const phaseChartData = useMemo(() => {
    if (!beforeAfter) return [];
    const step = chartSeries.length > 350 ? Math.ceil(chartSeries.length / 350) : 1;
    return chartSeries
      .filter((_, i) => i % step === 0 || i === chartSeries.length - 1)
      .map((pt) => ({
        rowIndex: pt.rowIndex,
        label: pt.label,
        beforeVal: pt.rowIndex < splitRow ? pt.value : null,
        afterVal: pt.rowIndex >= splitRow ? pt.value : null,
        beforeMean: pt.rowIndex < splitRow ? beforeAfter.before.mean : null,
        afterMean: pt.rowIndex >= splitRow ? beforeAfter.after.mean : null,
      }));
  }, [chartSeries, beforeAfter, splitRow]);

  // Global scale for horizontal SVG/CSS boxplot
  const boxplotScale = useMemo(() => {
    if (!groupAnova || groupAnova.groups.length === 0) return { min: 0, max: 1 };
    let min = Math.min(...groupAnova.groups.map((g) => g.min));
    let max = Math.max(...groupAnova.groups.map((g) => g.max));
    if (spec.usl > spec.lsl) {
      min = Math.min(min, spec.lsl);
      max = Math.max(max, spec.usl);
    }
    const pad = (max - min) * 0.06 || 0.5;
    return { min: min - pad, max: max + pad };
  }, [groupAnova, spec.lsl, spec.usl]);

  const criticalCols = triageItems.filter((t) => t.status === 'critical').length;
  const warningCols = triageItems.filter((t) => t.status === 'warning').length;
  const healthyCols = triageItems.filter((t) => t.status === 'healthy').length;

  const showSection = (s: AutopilotSection) => section === 'all' || section === s;

  const SECTIONS: Array<{ id: AutopilotSection; label: string }> = [
    { id: 'all', label: 'Alla analyser' },
    { id: 'triage', label: `Triage (${columns.length})` },
    { id: 'normality', label: 'Q-Q & ISO 22514' },
    { id: 'correlation', label: 'Korrelation' },
    { id: 'phases', label: 'Före / Efter' },
    { id: 'groups', label: 'Grupper & ANOVA' },
  ];

  return (
    <div className="space-y-6">
      {/* Compact Autopilot Summary & Section Filter */}
      <Card padding="none" className="px-5 py-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Statistisk Autopilot — Automatisk screening &amp; hypotestest
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analyserar alla kolumner, korrelationer, normalitet (ISO 22514), fasskift och skift-/maskinskillnader utan manuella menyval.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-rose-700 dark:text-rose-400 font-semibold">
              {criticalCols} kritiska
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-amber-700 dark:text-amber-400 font-semibold">
              {warningCols} varning
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              {healthyCols} kapabla
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer',
                section === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </Card>

      {/* SECTION 1: Multi-Column Batch Triage */}
      {showSection('triage') && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  1. Multi-kolumns Triage (rangordnad från mest kritisk till stabil)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Jämför samtliga {triageItems.length} mätkolumner samtidigt — klicka på en rad för att inspektera kolumnen.
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              Aktiv kolumn: <strong className="text-foreground">{selectedMetric}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                  <th className="py-2.5 px-4 font-semibold">Kolumn</th>
                  <th className="py-2.5 px-3 font-semibold text-right">N</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Cpk</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Ppk</th>
                  <th className="py-2.5 px-3 font-semibold text-right">ISO 22514 Ppk</th>
                  <th className="py-2.5 px-3 font-semibold text-right">OOS (PPM)</th>
                  <th className="py-2.5 px-3 font-semibold">Normalitet</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Regelbrott</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {triageItems.map((item) => {
                  const isActive = item.column === selectedMetric;
                  const statusTone =
                    item.status === 'critical'
                      ? 'text-rose-700 dark:text-rose-400'
                      : item.status === 'warning'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400';
                  const statusLabel =
                    item.status === 'critical'
                      ? 'Kritisk'
                      : item.status === 'warning'
                      ? 'Varning'
                      : 'Kapabel';

                  return (
                    <tr
                      key={item.column}
                      onClick={() => onSelectMetric(item.column, false)}
                      className={cn(
                        'transition-colors cursor-pointer',
                        isActive ? 'bg-primary/5' : 'hover:bg-muted/40'
                      )}
                    >
                      <td className="py-2.5 px-4 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{item.column}</span>
                          {isActive && (
                            <span className="text-[11px] font-medium text-primary">· Vald</span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-muted-foreground">
                          [{fmt(item.lsl, 2)} – {fmt(item.usl, 2)}]
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                        {item.count}
                      </td>
                      <td className={cn('py-2.5 px-3 font-semibold', statusTone)}>
                        {statusLabel}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-foreground">
                        {fmt(item.cpk, 3)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground">
                        {fmt(item.ppk, 3)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground">
                        {fmt(item.nonNormalPpk, 3)}
                        {item.recommendedMethod !== 'Normal' && (
                          <span className="block text-[10px] font-sans text-amber-700 dark:text-amber-400">
                            Rekommenderad
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground">
                        {item.oosCount}{' '}
                        <span className="text-muted-foreground">
                          ({Math.round(item.ppmObserved).toLocaleString('sv-SE')})
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {item.isNormal === null ? (
                          <span className="text-muted-foreground">N &lt; 8</span>
                        ) : item.isNormal ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            Normal <span className="font-mono tabular-nums text-muted-foreground">(p={fmtP(item.normalityPValue)})</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">
                            Ej normal <span className="font-mono tabular-nums text-muted-foreground">(p={fmtP(item.normalityPValue)})</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground">
                        {item.anomalyCount}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMetric(item.column, true);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
                        >
                          Öppna I-MR
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* SECTION 2: Normal Probability Plot (Q-Q) & ISO 22514 Non-Normal Capability */}
      {showSection('normality') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card padding="none" className="lg:col-span-7 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    2. Normal Probability Plot (Q-Q-plot) — {selectedMetric}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Punkter nära diagonalen bekräftar normalfördelning. Böjda svansar indikerar skevhet eller outliers.
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  'text-xs font-semibold whitespace-nowrap',
                  stats.isNormal === null
                    ? 'text-muted-foreground'
                    : stats.isNormal
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                )}
              >
                {stats.isNormal === null
                  ? 'N < 8'
                  : stats.isNormal
                  ? `Normal (p = ${fmtP(stats.normalityPValue)})`
                  : `Ej normal (p = ${fmtP(stats.normalityPValue)})`}
              </span>
            </div>

            <div className="h-[270px] w-full">
              {qqPoints.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 10, right: 16, bottom: 18, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      type="number"
                      dataKey="expectedValue"
                      domain={[qqBounds.min, qqBounds.max]}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      label={{
                        value: 'Förväntat normalvärde',
                        position: 'insideBottom',
                        offset: -10,
                        fontSize: 11,
                        fill: 'var(--muted-foreground)',
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="observedValue"
                      domain={[qqBounds.min, qqBounds.max]}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      width={52}
                      label={{
                        value: 'Observerat',
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
                        name === 'observedValue' ? 'Observerat' : 'Referenslinje',
                      ]}
                    />
                    <Line
                      data={qqReferenceLine}
                      dataKey="refLine"
                      type="linear"
                      stroke="#94a3b8"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                      name="Referenslinje"
                    />
                    <Scatter
                      data={qqPoints}
                      dataKey="observedValue"
                      fill="#1d4ed8"
                      fillOpacity={0.75}
                      isAnimationActive={false}
                      name="observedValue"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Minst 3 mätpunkter krävs för Q-Q-plot.
                </div>
              )}
            </div>
          </Card>

          <Card padding="none" className="lg:col-span-5 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">
                Normal vs Icke-normal kapabilitet (ISO 22514-2)
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                När processdata är skev eller har tunga svansar överskattar eller underskattar standard-Ppk kassationsrisken. ISO 22514 percentilmetoden beräknar kapabilitet direkt från 0.135%-, 50%- och 99.865%-percentilerna.
              </p>

              <div
                className={cn(
                  'p-3 rounded-lg border text-xs flex items-start gap-2.5',
                  stats.isNormal === false
                    ? 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
                )}
              >
                {stats.isNormal === false ? (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>
                  {stats.isNormal === false
                    ? 'Rekommendation: Data avviker signifikant från normalfördelning. Använd ISO 22514 Percentil Ppk nedan som styrande kapabilitetsmått.'
                    : 'Normalfördelningsantagandet stöds (p ≥ 0.05). Standard Normal Cpk/Ppk är lämplig som primär bedömning.'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Standard Normal Ppk</p>
                <p className="font-mono tabular-nums text-xl font-bold text-foreground">
                  {fmt(stats.ppk, 3)}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-muted-foreground">
                  Pp: {fmt(stats.pp, 3)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">ISO 22514 Percentil Ppk</p>
                <p className="font-mono tabular-nums text-xl font-bold text-primary">
                  {fmt(nonNormalCap.ppk, 3)}
                </p>
                <p className="text-[11px] font-mono tabular-nums text-muted-foreground">
                  Pp: {fmt(nonNormalCap.pp, 3)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border text-xs">
              <div>
                <span className="text-muted-foreground block">P0.135</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  {fmt(nonNormalCap.p0135, 3)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Median (P50)</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  {fmt(nonNormalCap.median, 3)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">P99.865</span>
                <span className="font-mono tabular-nums font-semibold text-foreground">
                  {fmt(nonNormalCap.p99865, 3)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SECTION 3: Automatic Correlation & Regression Scanner */}
      {showSection('correlation') && (
        <Card padding="none" className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  3. Automatisk Korrelations- &amp; Regressionsskanning mot {selectedMetric}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Hittar automatiskt vilka processparametrar som driver variationen i {selectedMetric} (Pearson r, R² och t-test).
                </p>
              </div>
            </div>
            {onOpenRegression && (
              <Button variant="outline" size="sm" onClick={onOpenRegression}>
                Öppna multipel regression
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {correlations.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              Importera ett dataset med minst två numeriska kolumner för att skanna samband mellan variabler.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Ranked table */}
              <div className="lg:col-span-5 border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                      <th className="py-2 px-3 font-semibold">Prediktor (X)</th>
                      <th className="py-2 px-2.5 font-semibold text-right">r</th>
                      <th className="py-2 px-2.5 font-semibold text-right">R²</th>
                      <th className="py-2 px-3 font-semibold text-right">p-värde</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {correlations.map((c) => {
                      const active = activeCorrelation?.predictor === c.predictor;
                      return (
                        <tr
                          key={c.predictor}
                          onClick={() => setSelectedPredictor(c.predictor)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            active ? 'bg-primary/8' : 'hover:bg-muted/40'
                          )}
                        >
                          <td className="py-2.5 px-3 font-medium text-foreground">
                            <div>{c.predictor}</div>
                            <div
                              className={cn(
                                'text-[11px]',
                                c.isSignificant
                                  ? 'text-primary font-medium'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {c.strength} · {c.direction}
                            </div>
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-foreground">
                            {c.r >= 0 ? '+' : ''}
                            {c.r.toFixed(3)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-muted-foreground">
                            {(c.rSquared * 100).toFixed(1)}%
                          </td>
                          <td
                            className={cn(
                              'py-2.5 px-3 text-right font-mono tabular-nums',
                              c.isSignificant
                                ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                : 'text-muted-foreground'
                            )}
                          >
                            {fmtP(c.pValue)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Scatter + Fitted Line */}
              {activeCorrelation && (
                <div className="lg:col-span-7 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-foreground">
                      {activeCorrelation.predictor} → {activeCorrelation.target}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      y = {activeCorrelation.intercept.toFixed(3)}{' '}
                      {activeCorrelation.slope >= 0 ? '+' : '−'}{' '}
                      {Math.abs(activeCorrelation.slope).toFixed(4)}·x · R² ={' '}
                      {(activeCorrelation.rSquared * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart margin={{ top: 8, right: 16, bottom: 18, left: 6 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          domain={['auto', 'auto']}
                          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                          label={{
                            value: activeCorrelation.predictor,
                            position: 'insideBottom',
                            offset: -10,
                            fontSize: 11,
                            fill: 'var(--muted-foreground)',
                          }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
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
                          formatter={(val: unknown, name: string) => [
                            typeof val === 'number' ? val.toFixed(4) : String(val),
                            name === 'y' ? activeCorrelation.target : 'Regressionslinje',
                          ]}
                        />
                        <Scatter
                          data={activeCorrelation.scatter}
                          dataKey="y"
                          fill="#1d4ed8"
                          fillOpacity={0.7}
                          isAnimationActive={false}
                          name="y"
                        />
                        <Line
                          data={activeCorrelation.linePoints}
                          dataKey="fitted"
                          type="linear"
                          stroke="#e11d48"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                          name="Regressionslinje"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {activeCorrelation.isSignificant ? (
                      <>
                        <strong className="text-foreground">Statistiskt signifikant samband</strong>{' '}
                        (p = {fmtP(activeCorrelation.pValue)}):{' '}
                        <span className="font-mono tabular-nums font-medium text-foreground">
                          {(activeCorrelation.rSquared * 100).toFixed(1)} %
                        </span>{' '}
                        av variationen i {activeCorrelation.target} samvarierar linjärt med{' '}
                        {activeCorrelation.predictor}.
                      </>
                    ) : (
                      <>
                        Inget statistiskt signifikant linjärt samband mellan{' '}
                        {activeCorrelation.predictor} och {activeCorrelation.target} (p ={' '}
                        {fmtP(activeCorrelation.pValue)}).
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* SECTION 4: Before / After Phase Split + Welch 2-Sample t-Test & F-Test */}
      {showSection('phases') && (
        <Card padding="none" className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  4. Fasuppdelning (Före / Efter) — Welch t-test &amp; F-test
                </h3>
                <p className="text-xs text-muted-foreground">
                  Bevisa statistiskt om en maskinjustering, verktygsbyte eller processändring vid vald rad gav verklig effekt.
                </p>
              </div>
            </div>

            {rows.length >= 6 && (
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="split-row-slider" className="text-muted-foreground whitespace-nowrap">
                  Brytpunkt (rad):
                </label>
                <input
                  id="split-row-slider"
                  type="range"
                  min={minSplitRow}
                  max={maxSplitRow}
                  value={splitRow}
                  onChange={(e) => setSplitRow(Number(e.target.value))}
                  className="w-32 accent-primary cursor-pointer"
                />
                <input
                  type="number"
                  min={minSplitRow}
                  max={maxSplitRow}
                  value={splitRow}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      setSplitRow(Math.max(minSplitRow, Math.min(maxSplitRow, v)));
                    }
                  }}
                  className="w-16 h-8 px-2 font-mono tabular-nums text-xs bg-card border border-border rounded-lg"
                />
              </div>
            )}
          </div>

          {!beforeAfter ? (
            <p className="text-xs text-muted-foreground py-3">
              Minst 6 mätpunkter (3 före och 3 efter brytpunkten) krävs för Före/Efter-hypotestest.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Verdict Banner */}
              <div
                className={cn(
                  'p-3.5 rounded-lg border text-xs leading-relaxed',
                  beforeAfter.meanChangedSignificantly || beforeAfter.spreadChangedSignificantly
                    ? 'border-primary/30 bg-primary/5 text-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground'
                )}
              >
                <span className="font-semibold text-foreground">Slutsats: </span>
                {beforeAfter.verdict}
              </div>

              {/* Dual-Phase Line Chart */}
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={phaseChartData} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="rowIndex"
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
                    />
                    <ReferenceLine
                      x={splitRow}
                      stroke="#e11d48"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{
                        value: `Brytpunkt #${splitRow}`,
                        position: 'insideTopRight',
                        fill: '#e11d48',
                        fontSize: 11,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="beforeVal"
                      stroke="#1d4ed8"
                      strokeWidth={1.75}
                      dot={false}
                      name="Före"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="afterVal"
                      stroke="#059669"
                      strokeWidth={1.75}
                      dot={false}
                      name="Efter"
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="beforeMean"
                      stroke="#1d4ed8"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      dot={false}
                      name="Medel Före"
                      isAnimationActive={false}
                    />
                    <Line
                      type="linear"
                      dataKey="afterMean"
                      stroke="#059669"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      dot={false}
                      name="Medel Efter"
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Comparison Table + Hypothesis Test Stats */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                        <th className="py-2 px-3 font-semibold">Fas</th>
                        <th className="py-2 px-3 font-semibold text-right">N</th>
                        <th className="py-2 px-3 font-semibold text-right">Medel</th>
                        <th className="py-2 px-3 font-semibold text-right">σ Overall</th>
                        <th className="py-2 px-3 font-semibold text-right">Cpk</th>
                        <th className="py-2 px-3 font-semibold text-right">Ppk</th>
                        <th className="py-2 px-3 font-semibold text-right">OOS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono tabular-nums">
                      <tr>
                        <td className="py-2 px-3 font-sans font-semibold text-blue-700 dark:text-blue-400">
                          Före (rad &lt; {splitRow})
                        </td>
                        <td className="py-2 px-3 text-right">{beforeAfter.before.count}</td>
                        <td className="py-2 px-3 text-right">{fmt(beforeAfter.before.mean, 4)}</td>
                        <td className="py-2 px-3 text-right">{fmt(beforeAfter.before.stdDev, 4)}</td>
                        <td className="py-2 px-3 text-right">{fmt(beforeAfter.before.cpk, 3)}</td>
                        <td className="py-2 px-3 text-right">{fmt(beforeAfter.before.ppk, 3)}</td>
                        <td className="py-2 px-3 text-right">{beforeAfter.before.oosCount}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-sans font-semibold text-emerald-700 dark:text-emerald-400">
                          Efter (rad ≥ {splitRow})
                        </td>
                        <td className="py-2 px-3 text-right">{beforeAfter.after.count}</td>
                        <td className="py-2 px-3 text-right">{fmt(beforeAfter.after.mean, 4)}</td>
                        <td className="py-2 px-3 text-right">{fmt(beforeAfter.after.stdDev, 4)}</td>
                        <td className="py-2 px-3 text-right">{fmt(beforeAfter.after.cpk, 3)}</td>
                        <td className="py-2 px-3 text-right">{fmt(beforeAfter.after.ppk, 3)}</td>
                        <td className="py-2 px-3 text-right">{beforeAfter.after.oosCount}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="lg:col-span-5 grid grid-cols-2 gap-3 border border-border rounded-lg p-3.5 text-xs">
                  <div className="space-y-1">
                    <span className="text-muted-foreground block">Welch 2-sample t-test</span>
                    <span className="font-mono tabular-nums text-base font-bold text-foreground block">
                      p = {fmtP(beforeAfter.tPValue)}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-muted-foreground block">
                      t = {fmt(beforeAfter.tStat, 2)} · df = {fmt(beforeAfter.welchDf, 1)}
                    </span>
                    <span
                      className={cn(
                        'font-semibold block',
                        beforeAfter.meanChangedSignificantly
                          ? 'text-primary'
                          : 'text-muted-foreground'
                      )}
                    >
                      {beforeAfter.meanChangedSignificantly ? 'Signifikant skift' : 'Ej signifikant'}
                    </span>
                  </div>
                  <div className="space-y-1 border-l border-border pl-3">
                    <span className="text-muted-foreground block">F-test för varians</span>
                    <span className="font-mono tabular-nums text-base font-bold text-foreground block">
                      p = {fmtP(beforeAfter.fPValue)}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-muted-foreground block">
                      F = {fmt(beforeAfter.fStat, 2)} · Δ = {beforeAfter.meanDiff >= 0 ? '+' : ''}
                      {fmt(beforeAfter.meanDiff, 3)}
                    </span>
                    <span
                      className={cn(
                        'font-semibold block',
                        beforeAfter.spreadChangedSignificantly
                          ? 'text-primary'
                          : 'text-muted-foreground'
                      )}
                    >
                      {beforeAfter.spreadChangedSignificantly
                        ? 'Signifikant spridning'
                        : 'Stabil spridning'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* SECTION 5: Categorical Group Comparison (One-Way ANOVA + Visual Boxplot) */}
      {showSection('groups') && (
        <Card padding="none" className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  5. Gruppjämförelse (One-Way ANOVA &amp; Boxplot) — {selectedMetric}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Jämför skift, maskiner, operatörer eller batcher automatiskt med variansanalys (ANOVA).
                </p>
              </div>
            </div>

            {categoryColumns.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="anova-cat-col" className="text-muted-foreground">
                  Gruppera efter:
                </label>
                <select
                  id="anova-cat-col"
                  value={selectedCategoryCol}
                  onChange={(e) => setSelectedCategoryCol(e.target.value)}
                  className="h-8 px-2.5 text-xs font-medium bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {categoryColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {categoryColumns.length === 0 || !groupAnova ? (
            <div className="p-4 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground leading-relaxed">
              Inga kategorikolumner (t.ex. <strong className="text-foreground">Skift</strong>,{' '}
              <strong className="text-foreground">Maskin</strong>,{' '}
              <strong className="text-foreground">Operatör</strong> eller{' '}
              <strong className="text-foreground">Batch</strong> med 2–20 unika värden) hittades i
              detta dataset. Lägg till en sådan textkolumn i din Excel/CSV-fil så aktiveras One-Way
              ANOVA och boxplot automatiskt vid import.
            </div>
          ) : (
            <div className="space-y-5">
              {/* ANOVA Verdict + Metrics */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-lg border border-border bg-muted/30 text-xs">
                <div className="leading-relaxed text-foreground">
                  <span className="font-semibold">ANOVA-bedömning: </span>
                  {groupAnova.verdict}
                </div>
                <div className="flex items-center gap-4 font-mono tabular-nums shrink-0 text-muted-foreground">
                  <span>F = {fmt(groupAnova.fStat, 2)}</span>
                  <span>
                    df = ({groupAnova.dfBetween}, {groupAnova.dfWithin})
                  </span>
                  <span
                    className={cn(
                      'font-semibold',
                      groupAnova.isSignificant
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    )}
                  >
                    p = {fmtP(groupAnova.pValue)}
                  </span>
                  <span>η² = {((groupAnova.etaSquared ?? 0) * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* Clean Horizontal Boxplot Visualization */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Fördelning per grupp (Min — Q1 — Median — Q3 — Max, prick = Medel)</span>
                  {spec.usl > spec.lsl && (
                    <span className="font-mono tabular-nums">
                      LSL {fmt(spec.lsl, 2)} · USL {fmt(spec.usl, 2)}
                    </span>
                  )}
                </div>

                <div className="space-y-2.5">
                  {groupAnova.groups.map((g) => {
                    const span = Math.max(1e-9, boxplotScale.max - boxplotScale.min);
                    const pct = (v: number) =>
                      `${Math.max(0, Math.min(100, ((v - boxplotScale.min) / span) * 100))}%`;
                    const boxLeft = ((g.q1 - boxplotScale.min) / span) * 100;
                    const boxWidth = Math.max(1.2, ((g.q3 - g.q1) / span) * 100);
                    const whiskerLeft = ((g.min - boxplotScale.min) / span) * 100;
                    const whiskerWidth = Math.max(1, ((g.max - g.min) / span) * 100);

                    return (
                      <div key={g.group} className="grid grid-cols-12 gap-3 items-center text-xs">
                        <div className="col-span-3 sm:col-span-2 font-medium text-foreground truncate" title={g.group}>
                          {g.group}{' '}
                          <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                            (n={g.count})
                          </span>
                        </div>

                        <div className="col-span-9 sm:col-span-10 relative h-8 bg-muted/40 rounded border border-border/70">
                          {/* LSL / USL reference lines */}
                          {spec.usl > spec.lsl && (
                            <>
                              <div
                                className="absolute top-0 bottom-0 border-l border-dashed border-rose-500/70"
                                style={{ left: pct(spec.lsl) }}
                                title={`LSL: ${spec.lsl}`}
                              />
                              <div
                                className="absolute top-0 bottom-0 border-l border-dashed border-rose-500/70"
                                style={{ left: pct(spec.usl) }}
                                title={`USL: ${spec.usl}`}
                              />
                            </>
                          )}
                          {/* Whisker line (min to max) */}
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-slate-400 dark:bg-slate-500"
                            style={{ left: `${whiskerLeft}%`, width: `${whiskerWidth}%` }}
                          />
                          {/* Min & Max caps */}
                          <div
                            className="absolute top-2 bottom-2 w-0.5 bg-slate-500"
                            style={{ left: pct(g.min) }}
                          />
                          <div
                            className="absolute top-2 bottom-2 w-0.5 bg-slate-500"
                            style={{ left: pct(g.max) }}
                          />
                          {/* IQR Box (Q1 to Q3) */}
                          <div
                            className="absolute top-1.5 bottom-1.5 bg-primary/20 border border-primary rounded-xs"
                            style={{ left: `${boxLeft}%`, width: `${boxWidth}%` }}
                            title={`Q1: ${fmt(g.q1, 3)} | Median: ${fmt(g.median, 3)} | Q3: ${fmt(g.q3, 3)}`}
                          />
                          {/* Median vertical bar */}
                          <div
                            className="absolute top-1.5 bottom-1.5 w-0.5 bg-primary"
                            style={{ left: pct(g.median) }}
                          />
                          {/* Mean dot */}
                          <div
                            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-rose-600"
                            style={{ left: pct(g.mean) }}
                            title={`Medel: ${fmt(g.mean, 4)}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Group Summary Table */}
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                      <th className="py-2 px-3 font-semibold">{selectedCategoryCol}</th>
                      <th className="py-2 px-3 font-semibold text-right">N</th>
                      <th className="py-2 px-3 font-semibold text-right">Medel</th>
                      <th className="py-2 px-3 font-semibold text-right">Median</th>
                      <th className="py-2 px-3 font-semibold text-right">σ</th>
                      <th className="py-2 px-3 font-semibold text-right">Min / Max</th>
                      <th className="py-2 px-3 font-semibold text-right">Cpk</th>
                      <th className="py-2 px-3 font-semibold text-right">OOS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono tabular-nums">
                    {groupAnova.groups.map((g) => (
                      <tr key={g.group}>
                        <td className="py-2 px-3 font-sans font-semibold text-foreground">
                          {g.group}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">{g.count}</td>
                        <td className="py-2 px-3 text-right text-foreground font-semibold">
                          {fmt(g.mean, 4)}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {fmt(g.median, 4)}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {fmt(g.stdDev, 4)}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {fmt(g.min, 3)} / {fmt(g.max, 3)}
                        </td>
                        <td
                          className={cn(
                            'py-2 px-3 text-right font-semibold',
                            g.cpk === null
                              ? 'text-muted-foreground'
                              : g.cpk >= 1.33
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : g.cpk >= 1.0
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400'
                          )}
                        >
                          {fmt(g.cpk, 3)}
                        </td>
                        <td className="py-2 px-3 text-right text-foreground">{g.oosCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
