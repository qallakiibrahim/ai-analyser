import React, { useState, useMemo, useEffect } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  Settings,
  RotateCcw,
  AlertCircle,
  Split,
  Plus,
  X,
  Sparkles,
  Ban,
} from 'lucide-react';
import {
  Anomaly,
  ChartPoint,
  ExcludedPoint,
  ProductionRow,
  SpecLimits,
  StatsResult,
} from '@/src/lib/stats';
import {
  StagingMode,
  StagedChartPoint,
  buildStagedChartSeries,
  detectAutomaticStageSplits,
} from '@/src/lib/staging';
import { StageContextSnapshot } from '@/src/lib/aiContext';
import { PointToExclude } from './ExcludePointModal';
import { cn } from '@/src/lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

const ReferenceAreaAny = ReferenceArea as any;

interface ControlChartsProps {
  rows: ProductionRow[];
  allRows: ProductionRow[];
  categoryColumns: string[];
  selectedMetric: string;
  spec: SpecLimits;
  onUpdateSpec: (patch: Partial<SpecLimits>) => void;
  stats: StatsResult;
  series: ChartPoint[];
  anomalies: Anomaly[];
  excludedPoints: Record<number, ExcludedPoint>;
  onRequestExclude: (pt: PointToExclude) => void;
  onRestorePoint: (rowIndex: number) => void;
  onRestoreAll: () => void;
  showMovingAverage: boolean;
  onToggleMovingAverage: (v: boolean) => void;
  onStageSnapshotChange?: (snapshot: StageContextSnapshot) => void;
}

interface CombinedIChartPoint {
  rowIndex: number;
  label: string;
  value: number | null;
  excludedValue: number | null;
  isExcluded: boolean;
  excludedReason?: string;
  mr: number | null;
  movingAverage: number | null;
  isOos: boolean;
  hasAnomaly: boolean;
  mrOutOfControl: boolean;
  anomalies: Anomaly[];
  primaryBadge?: string;
  stageIndex?: number;
  stageLabel?: string;
  stageMean: number | null;
  stageUcl: number | null;
  stageLcl: number | null;
  stageMrBar: number | null;
  stageUclMr: number | null;
  isStageStart?: boolean;
}

function downsampleStagedPoints(
  points: StagedChartPoint[],
  maxPoints: number = 400
): { displayPoints: StagedChartPoint[]; isDownsampled: boolean } {
  if (points.length <= maxPoints) {
    return { displayPoints: points, isDownsampled: false };
  }
  const kept = new Set<number>([0, points.length - 1]);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.isOos || p.hasAnomaly || p.mrOutOfControl || p.isStageStart) {
      kept.add(i);
      if (i > 0 && p.isStageStart) kept.add(i - 1);
    }
  }
  const remaining = Math.max(50, maxPoints - kept.size);
  const step = points.length / remaining;
  for (let s = 0; s < remaining; s++) {
    kept.add(Math.min(points.length - 1, Math.floor(s * step)));
  }
  const sorted = Array.from(kept).sort((a, b) => a - b);
  return {
    displayPoints: sorted.map((idx) => points[idx]),
    isDownsampled: true,
  };
}

function fmt(val: number | null | undefined, digits: number = 3): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '–';
  return val.toFixed(digits);
}

export function ControlCharts({
  rows,
  allRows,
  categoryColumns,
  selectedMetric,
  spec,
  onUpdateSpec,
  stats,
  series,
  anomalies,
  excludedPoints,
  onRequestExclude,
  onRestorePoint,
  onRestoreAll,
  showMovingAverage,
  onToggleMovingAverage,
  onStageSnapshotChange,
}: ControlChartsProps) {
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('line');
  const [showSigmaZones, setShowSigmaZones] = useState(true);
  const [showSpecLines, setShowSpecLines] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // SPC Staging state
  const [stagingMode, setStagingMode] = useState<StagingMode>('none');
  const [manualSplitRows, setManualSplitRows] = useState<number[]>([]);
  const [manualStageLabels, setManualStageLabels] = useState<Record<number, string>>({});
  const [newSplitInput, setNewSplitInput] = useState<string>('');
  const [newSplitLabel, setNewSplitLabel] = useState<string>('');
  const [stageCategoryCol, setStageCategoryCol] = useState<string>(categoryColumns[0] || '');

  // Keep stageCategoryCol valid when dataset changes
  useEffect(() => {
    if (categoryColumns.length === 0) {
      setStageCategoryCol('');
      if (stagingMode === 'category') setStagingMode('none');
    } else if (!categoryColumns.includes(stageCategoryCol)) {
      setStageCategoryCol(categoryColumns[0]);
    }
  }, [categoryColumns, stageCategoryCol, stagingMode]);

  // Reset manual splits when dataset row range changes dramatically
  useEffect(() => {
    if (series.length === 0) return;
    const minRow = series[0].rowIndex;
    const maxRow = series[series.length - 1].rowIndex;
    setManualSplitRows((prev) => prev.filter((r) => r > minRow && r <= maxRow));
  }, [series]);

  // Customizable axes & labels
  const [showXAxis, setShowXAxis] = useState(true);
  const [showYAxis, setShowYAxis] = useState(true);
  const [xAxisLabel, setXAxisLabel] = useState('Tid / Rad');
  const [yAxisLabel, setYAxisLabel] = useState('');

  // Zoom state using unique rowIndex (never collides on duplicate timestamps!)
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  // Build Staged SPC Series (handles none / auto / manual / category)
  const staged = useMemo(
    () =>
      buildStagedChartSeries(
        rows,
        series,
        selectedMetric,
        spec,
        stats,
        stagingMode,
        manualSplitRows,
        stageCategoryCol,
        manualStageLabels
      ),
    [
      rows,
      series,
      selectedMetric,
      spec,
      stats,
      stagingMode,
      manualSplitRows,
      stageCategoryCol,
      manualStageLabels,
    ]
  );

  const isMultiStage = staged.stages.length > 1;

  useEffect(() => {
    if (!onStageSnapshotChange) return;
    onStageSnapshotChange({
      mode: staged.mode,
      autoNote: staged.autoNote,
      splitRows: staged.splitRows,
      stages: staged.stages.map((st) => ({
        stageIndex: st.stageIndex,
        label: st.label,
        startRow: st.startRow,
        endRow: st.endRow,
        count: st.count,
        mean: Number(st.stats.mean.toFixed(4)),
        stdDev: Number(st.stats.stdDev.toFixed(4)),
        cpk: st.stats.cpk !== null ? Number(st.stats.cpk.toFixed(3)) : null,
        ppk: st.stats.ppk !== null ? Number(st.stats.ppk.toFixed(3)) : null,
        mrBar: Number(st.stats.mrBar.toFixed(4)),
        oosCount: st.stats.oosCount,
      })),
    });
  }, [staged, onStageSnapshotChange]);

  const visibleSeries = useMemo(() => {
    const filtered = zoomRange
      ? staged.points.filter((p) => p.rowIndex >= zoomRange[0] && p.rowIndex <= zoomRange[1])
      : staged.points;
    return downsampleStagedPoints(filtered, 400);
  }, [staged.points, zoomRange]);

  const excludedRowsList = useMemo(() => {
    return allRows
      .filter((r) => Boolean(excludedPoints[r.rowIndex]) && typeof r.values[selectedMetric] === 'number')
      .map((r) => ({
        rowIndex: r.rowIndex,
        label: r.label,
        value: r.values[selectedMetric],
        reason: excludedPoints[r.rowIndex].reason,
        excludedAt: excludedPoints[r.rowIndex].excludedAt,
      }))
      .sort((a, b) => a.rowIndex - b.rowIndex);
  }, [allRows, excludedPoints, selectedMetric]);

  const combinedIPoints = useMemo((): CombinedIChartPoint[] => {
    const activeMapped: CombinedIChartPoint[] = visibleSeries.displayPoints.map((p) => ({
      rowIndex: p.rowIndex,
      label: p.label,
      value: p.value,
      excludedValue: null,
      isExcluded: false,
      mr: p.mr,
      movingAverage: p.movingAverage,
      isOos: p.isOos,
      hasAnomaly: p.hasAnomaly,
      mrOutOfControl: p.mrOutOfControl,
      anomalies: p.anomalies,
      primaryBadge: p.primaryBadge,
      stageIndex: p.stageIndex,
      stageLabel: p.stageLabel,
      stageMean: p.stageMean,
      stageUcl: p.stageUcl,
      stageLcl: p.stageLcl,
      stageMrBar: p.stageMrBar,
      stageUclMr: p.stageUclMr,
      isStageStart: p.isStageStart,
    }));

    const excludedMapped: CombinedIChartPoint[] = excludedRowsList
      .filter((e) => !zoomRange || (e.rowIndex >= zoomRange[0] && e.rowIndex <= zoomRange[1]))
      .map((e) => ({
        rowIndex: e.rowIndex,
        label: e.label,
        value: null,
        excludedValue: e.value,
        isExcluded: true,
        excludedReason: e.reason,
        mr: null,
        movingAverage: null,
        isOos: false,
        hasAnomaly: false,
        mrOutOfControl: false,
        anomalies: [],
        stageMean: null,
        stageUcl: null,
        stageLcl: null,
        stageMrBar: null,
        stageUclMr: null,
      }));

    if (excludedMapped.length === 0) return activeMapped;
    return [...activeMapped, ...excludedMapped].sort((a, b) => a.rowIndex - b.rowIndex);
  }, [visibleSeries.displayPoints, excludedRowsList, zoomRange]);

  const yDomainI = useMemo((): [number, number] => {
    if (combinedIPoints.length === 0) return [0, 10];
    const candidates: number[] = [];
    for (const p of combinedIPoints) {
      if (p.value !== null) candidates.push(p.value);
      if (p.excludedValue !== null) candidates.push(p.excludedValue);
      if (p.stageUcl !== null) candidates.push(p.stageUcl);
      if (p.stageLcl !== null) candidates.push(p.stageLcl);
    }
    if (showSpecLines && spec.usl > spec.lsl) {
      candidates.push(spec.usl, spec.lsl);
    }
    const min = Math.min(...candidates);
    const max = Math.max(...candidates);
    const pad = Math.max((max - min) * 0.1, 0.05);
    return [Number((min - pad).toFixed(4)), Number((max + pad).toFixed(4))];
  }, [combinedIPoints, showSpecLines, spec.usl, spec.lsl]);

  const mrPoints = useMemo(
    () => visibleSeries.displayPoints.filter((p) => p.mr !== null),
    [visibleSeries.displayPoints]
  );

  const yDomainMR = useMemo((): [number, number] => {
    const maxStageUclMr = staged.stages.reduce(
      (acc, s) => Math.max(acc, s.stats.uclMr),
      stats.uclMr
    );
    const mrs = mrPoints.map((p) => p.mr as number);
    const maxVal = Math.max(maxStageUclMr, ...(mrs.length > 0 ? mrs : [1]));
    return [0, Number((maxVal * 1.15 || 1).toFixed(4))];
  }, [mrPoints, staged.stages, stats.uclMr]);

  const handleMouseUp = () => {
    if (dragStart !== null && dragEnd !== null && dragStart !== dragEnd) {
      const left = Math.min(dragStart, dragEnd);
      const right = Math.max(dragStart, dragEnd);
      setZoomRange([left, right]);
    } else if (dragStart !== null) {
      // Single click on a point -> open Special Cause exclusion modal (or restore if already excluded)
      const clicked = combinedIPoints.find((p) => p.rowIndex === dragStart);
      if (clicked) {
        if (clicked.isExcluded) {
          onRestorePoint(clicked.rowIndex);
        } else if (clicked.value !== null) {
          onRequestExclude({
            rowIndex: clicked.rowIndex,
            label: clicked.label,
            value: clicked.value,
            metric: selectedMetric,
          });
        }
      }
    }
    setDragStart(null);
    setDragEnd(null);
  };

  const resetZoom = () => {
    setZoomRange(null);
    setDragStart(null);
    setDragEnd(null);
  };

  const handleAddManualSplit = () => {
    if (series.length < 4) return;
    const minRow = series[0].rowIndex + 1;
    const maxRow = series[series.length - 1].rowIndex;
    const parsed = parseInt(newSplitInput, 10);
    if (!Number.isFinite(parsed) || parsed < minRow || parsed > maxRow) return;
    setManualSplitRows((prev) => Array.from(new Set([...prev, parsed])).sort((a, b) => a - b));
    if (newSplitLabel.trim()) {
      setManualStageLabels((prev) => ({ ...prev, [parsed]: newSplitLabel.trim() }));
    }
    setNewSplitInput('');
    setNewSplitLabel('');
    setStagingMode('manual');
  };

  const handleRemoveManualSplit = (rowNum: number) => {
    setManualSplitRows((prev) => prev.filter((r) => r !== rowNum));
    setManualStageLabels((prev) => {
      const next = { ...prev };
      delete next[rowNum];
      return next;
    });
  };

  const handleCopyAutoSplitsToManual = () => {
    const detected = detectAutomaticStageSplits(rows, selectedMetric, 4);
    if (detected.length > 0) {
      setManualSplitRows(detected);
    } else if (series.length >= 6) {
      setManualSplitRows([series[Math.floor(series.length / 2)].rowIndex]);
    }
    setStagingMode('manual');
  };

  const labelByRow = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of combinedIPoints) {
      map.set(p.rowIndex, p.label);
    }
    return map;
  }, [combinedIPoints]);

  const resolvedYLabel = yAxisLabel.trim() || selectedMetric;

  const CustomITooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: CombinedIChartPoint = payload[0].payload;
    if (pt.isExcluded) {
      return (
        <div className="bg-card border border-border p-3.5 rounded-lg shadow-lg max-w-xs space-y-2 text-xs">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-1.5">
            <span className="font-mono tabular-nums font-semibold text-muted-foreground line-through">
              Rad #{pt.rowIndex}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">{pt.label}</span>
          </div>
          <div className="flex justify-between gap-6 font-mono tabular-nums">
            <span className="text-muted-foreground font-sans">{selectedMetric}:</span>
            <span className="font-semibold text-muted-foreground line-through">
              {pt.excludedValue !== null ? pt.excludedValue.toFixed(4) : '–'}
            </span>
          </div>
          <div className="pt-1.5 border-t border-border space-y-1">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Exkluderad (Special Cause)
            </p>
            <p className="text-[11px] text-foreground leading-snug">{pt.excludedReason}</p>
          </div>
          <p className="text-[11px] text-primary pt-1 border-t border-border">
            Klicka på punkten för att återställa i analysen
          </p>
        </div>
      );
    }

    return (
      <div className="bg-card border border-border p-3.5 rounded-lg shadow-lg max-w-xs space-y-2 text-xs">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-1.5">
          <span className="font-mono tabular-nums font-semibold text-foreground">
            Rad #{pt.rowIndex}
          </span>
          <span className="font-mono tabular-nums text-muted-foreground">{pt.label}</span>
        </div>
        {isMultiStage && pt.stageMean !== null && pt.stageLcl !== null && pt.stageUcl !== null && (
          <div className="text-[11px] font-medium text-primary">
            {pt.stageLabel} · CL {pt.stageMean.toFixed(3)} · [{pt.stageLcl.toFixed(3)},{' '}
            {pt.stageUcl.toFixed(3)}]
          </div>
        )}
        <div className="space-y-1 font-mono tabular-nums">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground font-sans">{selectedMetric}:</span>
            <span className="font-semibold text-foreground">
              {pt.value !== null ? pt.value.toFixed(4) : '–'}
            </span>
          </div>
          {pt.mr !== null && (
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground font-sans">Moving Range (MR):</span>
              <span className="text-foreground">{pt.mr.toFixed(4)}</span>
            </div>
          )}
          {pt.movingAverage !== null && (
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground font-sans">Glidande medel (5):</span>
              <span className="text-foreground">{pt.movingAverage.toFixed(4)}</span>
            </div>
          )}
        </div>
        <div className="pt-1.5 border-t border-border flex items-center justify-between">
          <span className="text-muted-foreground">Toleransstatus</span>
          <span
            className={cn(
              'font-semibold',
              pt.isOos
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {pt.isOos ? 'Utanför spec (OOS)' : 'Inom tolerans'}
          </span>
        </div>
        {pt.anomalies.length > 0 && (
          <div className="pt-1.5 border-t border-border space-y-1">
            <p className="font-semibold text-rose-600 dark:text-rose-400">
              Regelbrott ({pt.anomalies.length}):
            </p>
            {pt.anomalies.map((a) => (
              <p key={a.id} className="text-[11px] text-muted-foreground leading-snug">
                <span className="font-mono font-semibold text-foreground">{a.ruleCode}:</span>{' '}
                {a.explanation}
              </p>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
          Klicka på punkten för att exkludera som Special Cause
        </p>
      </div>
    );
  };

  const CustomMRTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: StagedChartPoint = payload[0].payload;
    return (
      <div className="bg-card border border-border p-3 rounded-lg shadow-lg text-xs space-y-1">
        <div className="flex justify-between gap-4 font-mono tabular-nums">
          <span className="font-semibold text-foreground">Rad #{pt.rowIndex}</span>
          <span className="text-muted-foreground">{pt.label}</span>
        </div>
        {isMultiStage && (
          <div className="text-[11px] font-medium text-primary">{pt.stageLabel}</div>
        )}
        <div className="flex justify-between gap-6 font-mono tabular-nums">
          <span className="font-sans text-muted-foreground">Moving Range:</span>
          <span
            className={cn(
              'font-semibold',
              pt.mrOutOfControl ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'
            )}
          >
            {pt.mr !== null ? pt.mr.toFixed(4) : '–'}
          </span>
        </div>
        <div className="flex justify-between gap-6 font-mono tabular-nums">
          <span className="font-sans text-muted-foreground">UCL_MR:</span>
          <span className="text-muted-foreground">{pt.stageUclMr.toFixed(4)}</span>
        </div>
      </div>
    );
  };

  const anomalySummary = useMemo(() => {
    const counts: Record<string, { code: string; count: number; sample: Anomaly }> = {};
    for (const a of anomalies) {
      if (!counts[a.ruleCode]) {
        counts[a.ruleCode] = { code: a.ruleCode, count: 0, sample: a };
      }
      counts[a.ruleCode].count += 1;
    }
    return Object.values(counts);
  }, [anomalies]);

  return (
    <section aria-label="I-MR Kontrollgrafer" className="space-y-6">
      <Card padding="none" className="p-5 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              I-MR Kontrollgraf — {selectedMetric}
            </h2>
            <p className="text-xs text-muted-foreground">
              Klicka på en punkt för att exkludera (Special Cause) · Dra för att zooma ·{' '}
              <span className="font-mono tabular-nums">
                {spec.lslLabel}: {spec.lsl} / {spec.uslLabel}: {spec.usl}
              </span>
              {excludedRowsList.length > 0 && (
                <span>
                  {' '}
                  ·{' '}
                  <strong className="text-amber-700 dark:text-amber-400">
                    {excludedRowsList.length} exkluderad(e)
                  </strong>
                </span>
              )}
              {isMultiStage && (
                <span>
                  {' '}
                  · <strong className="text-primary">{staged.stages.length} steg aktiva</strong>
                </span>
              )}
              {zoomRange && (
                <span>
                  {' '}
                  · Zoomad vy (rad #{zoomRange[0]}–#{zoomRange[1]})
                </span>
              )}
              {visibleSeries.isDownsampled && (
                <span>
                  {' '}
                  · Visar {visibleSeries.displayPoints.length} av {series.length} aktiva punkter
                  (100 % i statistiken)
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {zoomRange && (
              <Button variant="outline" size="sm" onClick={resetZoom}>
                <RotateCcw className="w-3.5 h-3.5" />
                Återställ zoom
              </Button>
            )}
            <Button
              variant={showSettings ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setShowSettings((prev) => !prev)}
            >
              <Settings className="w-3.5 h-3.5" />
              Grafalternativ
            </Button>
          </div>
        </div>

        {/* Inline SPC Spec Limits (LSL / Target / USL) + Staging Control Bar */}
        <div className="p-3.5 rounded-lg border border-border bg-muted/35 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            {/* Direct LSL / Target / USL Controls right in SPC */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-foreground whitespace-nowrap">
                Toleransgränser:
              </span>
              <label className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{spec.lslLabel || 'LSL'}</span>
                <input
                  type="number"
                  step="any"
                  aria-label="Nedre toleransgräns LSL i SPC"
                  value={spec.lsl}
                  onChange={(e) => onUpdateSpec({ lsl: parseFloat(e.target.value) || 0 })}
                  className="w-20 h-8 px-2 font-mono tabular-nums text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Target</span>
                <input
                  type="number"
                  step="any"
                  aria-label="Målvärde Target i SPC"
                  value={spec.target}
                  onChange={(e) => onUpdateSpec({ target: parseFloat(e.target.value) || 0 })}
                  className="w-20 h-8 px-2 font-mono tabular-nums text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{spec.uslLabel || 'USL'}</span>
                <input
                  type="number"
                  step="any"
                  aria-label="Övre toleransgräns USL i SPC"
                  value={spec.usl}
                  onChange={(e) => onUpdateSpec({ usl: parseFloat(e.target.value) || 0 })}
                  className="w-20 h-8 px-2 font-mono tabular-nums text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSpecLines}
                  onChange={(e) => setShowSpecLines(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                />
                Visa i graf
              </label>
            </div>

            {/* SPC Staging Mode Switcher */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-foreground inline-flex items-center gap-1.5 whitespace-nowrap">
                <Split className="w-3.5 h-3.5 text-primary" />
                Stagning (Stages):
              </span>
              <div className="inline-flex bg-card border border-border p-0.5 rounded-lg">
                {(
                  [
                    { id: 'none', label: 'Av' },
                    { id: 'auto', label: 'Automatisk' },
                    { id: 'manual', label: 'Manuell' },
                    ...(categoryColumns.length > 0
                      ? [{ id: 'category' as StagingMode, label: 'Per grupp' }]
                      : []),
                  ] as Array<{ id: StagingMode; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'manual' && manualSplitRows.length === 0 && series.length >= 6) {
                        const autoDetected = detectAutomaticStageSplits(rows, selectedMetric, 4);
                        setManualSplitRows(
                          autoDetected.length > 0
                            ? autoDetected
                            : [series[Math.floor(series.length / 2)].rowIndex]
                        );
                      }
                      setStagingMode(item.id);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer',
                      stagingMode === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {stagingMode === 'category' && categoryColumns.length > 0 && (
                <select
                  aria-label="Välj kolumn för stagning"
                  value={stageCategoryCol}
                  onChange={(e) => setStageCategoryCol(e.target.value)}
                  className="h-8 px-2.5 text-xs font-medium bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {categoryColumns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Automatic Staging Feedback Banner with IATF 16949 Compliance Note */}
          {stagingMode === 'auto' && staged.autoNote && (
            <div className="pt-2.5 border-t border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-foreground">
                  <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{staged.autoNote}</span>
                </div>
                <p className="text-[11px] text-muted-foreground pl-5">
                  Analysläge (IATF 16949): bekräfta skiftet mot verklig processändring i loggen och
                  konvertera till <strong className="text-foreground">Manuell</strong> före PPAP-rapportering.
                </p>
              </div>
              {staged.splitRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyAutoSplitsToManual}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer whitespace-nowrap self-start sm:self-center"
                >
                  Konvertera till manuella steg →
                </button>
              )}
            </div>
          )}

          {/* Manual Split Points Editor */}
          {stagingMode === 'manual' && (
            <div className="pt-2.5 border-t border-border/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Brytpunkter (ny fas startar vid rad):</span>
                {manualSplitRows.length === 0 ? (
                  <span className="text-muted-foreground italic">Inga brytpunkter tillagda</span>
                ) : (
                  manualSplitRows.map((rowNum) => (
                    <span
                      key={rowNum}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-card border border-border text-foreground"
                    >
                      <span className="font-mono tabular-nums font-medium">#{rowNum}</span>
                      {manualStageLabels[rowNum] && (
                        <span className="text-muted-foreground">· {manualStageLabels[rowNum]}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveManualSplit(rowNum)}
                        aria-label={`Ta bort brytpunkt vid rad ${rowNum}`}
                        className="text-muted-foreground hover:text-rose-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="number"
                  min={series.length > 0 ? series[0].rowIndex + 1 : 2}
                  max={series.length > 0 ? series[series.length - 1].rowIndex : 100}
                  value={newSplitInput}
                  onChange={(e) => setNewSplitInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddManualSplit();
                  }}
                  placeholder={`Rad (${series[0]?.rowIndex ? series[0].rowIndex + 1 : 2}–${
                    series[series.length - 1]?.rowIndex ?? 60
                  })`}
                  className="w-24 h-8 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="text"
                  value={newSplitLabel}
                  onChange={(e) => setNewSplitLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddManualSplit();
                  }}
                  placeholder="Orsak / fas (t.ex. Nytt verktyg)"
                  className="w-44 h-8 px-2.5 text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button variant="outline" size="sm" onClick={handleAddManualSplit}>
                  <Plus className="w-3.5 h-3.5" />
                  Lägg till steg
                </Button>
                <button
                  type="button"
                  onClick={handleCopyAutoSplitsToManual}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer ml-1 whitespace-nowrap"
                >
                  Hämta auto
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Chart Controls (Type, Overlays, Limit Labels & Axes) */}
        {showSettings && (
          <div className="p-4 sm:p-5 bg-muted/50 rounded-lg border border-border space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Visualization & Overlays */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">Graftyp &amp; analyslager</p>
                <div className="flex bg-card border border-border p-0.5 rounded-lg">
                  {(['line', 'area', 'bar'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setChartType(type)}
                      className={cn(
                        'flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                        chartType === type
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {type === 'line' ? 'Linje' : type === 'area' ? 'Yta' : 'Stapel'}
                    </button>
                  ))}
                </div>
                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showSigmaZones}
                      onChange={(e) => setShowSigmaZones(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    Visa σ-zoner (±1σ / ±2σ / ±3σ)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMovingAverage}
                      onChange={(e) => onToggleMovingAverage(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    Glidande medelvärde (5 punkter)
                  </label>
                </div>
              </div>

              {/* Spec Limit Labels */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">Etiketter för toleransgränser</p>
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label htmlFor="usl-label-input" className="text-xs text-muted-foreground">
                      Namn på övre gräns (USL)
                    </label>
                    <input
                      id="usl-label-input"
                      type="text"
                      value={spec.uslLabel}
                      onChange={(e) => onUpdateSpec({ uslLabel: e.target.value })}
                      placeholder="t.ex. USL eller Max"
                      className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="lsl-label-input" className="text-xs text-muted-foreground">
                      Namn på nedre gräns (LSL)
                    </label>
                    <input
                      id="lsl-label-input"
                      type="text"
                      value={spec.lslLabel}
                      onChange={(e) => onUpdateSpec({ lslLabel: e.target.value })}
                      placeholder="t.ex. LSL eller Min"
                      className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Axis Settings */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-foreground">Axelinställningar</p>
                <div className="space-y-2.5">
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs text-foreground cursor-pointer">
                      <span>Visa X-axel</span>
                      <input
                        type="checkbox"
                        checked={showXAxis}
                        onChange={(e) => setShowXAxis(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                    </label>
                    {showXAxis && (
                      <input
                        type="text"
                        value={xAxisLabel}
                        onChange={(e) => setXAxisLabel(e.target.value)}
                        placeholder="Etikett för X-axel"
                        className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs text-foreground cursor-pointer">
                      <span>Visa Y-axel</span>
                      <input
                        type="checkbox"
                        checked={showYAxis}
                        onChange={(e) => setShowYAxis(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                    </label>
                    {showYAxis && (
                      <input
                        type="text"
                        value={yAxisLabel}
                        onChange={(e) => setYAxisLabel(e.target.value)}
                        placeholder={`Standard: ${selectedMetric}`}
                        className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Individuals (I) Chart */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold text-foreground">
                Individuella mätvärden (I-Chart)
              </span>
              {/* Crisp inline chart legend */}
              <div className="hidden sm:flex items-center gap-3.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-primary inline-block rounded-full" />
                  Mätvärde
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0 border-t border-dashed border-amber-600 inline-block" />
                  UCL/LCL
                </span>
                {showSpecLines && spec.usl > spec.lsl && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0 border-t border-dashed border-rose-600 inline-block" />
                    {spec.uslLabel || 'USL'}/{spec.lslLabel || 'LSL'}
                  </span>
                )}
                {excludedRowsList.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono font-bold text-slate-500">×</span>
                    Exkluderad
                  </span>
                )}
              </div>
            </div>
            <span className="font-mono tabular-nums">
              {isMultiStage
                ? `Stegvisa kontrollgränser (${staged.stages.length} steg)`
                : `LCL: ${stats.lcl.toFixed(3)} · Mean: ${stats.mean.toFixed(3)} · UCL: ${stats.ucl.toFixed(3)}`}
            </span>
          </div>

          <div className="h-[330px] sm:h-[370px] w-full cursor-crosshair select-none">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={combinedIPoints}
                margin={{
                  top: 16,
                  right: 40,
                  left: showYAxis ? 16 : 8,
                  bottom: showXAxis && xAxisLabel ? 20 : 8,
                }}
                onMouseDown={(e: any) => {
                  if (e && e.activeLabel !== undefined) {
                    setDragStart(Number(e.activeLabel));
                    setDragEnd(null);
                  }
                }}
                onMouseMove={(e: any) => {
                  if (dragStart !== null && e && e.activeLabel !== undefined) {
                    setDragEnd(Number(e.activeLabel));
                  }
                }}
                onMouseUp={handleMouseUp}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                  strokeOpacity={0.75}
                />
                <XAxis
                  dataKey="rowIndex"
                  type="number"
                  hide={!showXAxis}
                  domain={['dataMin', 'dataMax']}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tick={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
                  tickFormatter={(rowIdx) => labelByRow.get(Number(rowIdx)) || `#${rowIdx}`}
                  label={
                    showXAxis && xAxisLabel
                      ? {
                          value: xAxisLabel,
                          position: 'insideBottom',
                          offset: -12,
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }
                      : undefined
                  }
                />
                <YAxis
                  hide={!showYAxis}
                  domain={yDomainI}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tick={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
                  width={62}
                  tickFormatter={(v) => Number(v).toFixed(2)}
                  label={
                    showYAxis && resolvedYLabel
                      ? {
                          value: resolvedYLabel,
                          angle: -90,
                          position: 'insideLeft',
                          offset: -4,
                          style: { textAnchor: 'middle' },
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }
                      : undefined
                  }
                />
                <Tooltip content={<CustomITooltip />} />

                {/* True Sigma Zone Bands (±1σ, ±2σ, ±3σ) in single-stage mode */}
                {!isMultiStage && showSigmaZones && stats.stdDevWithin > 1e-12 && (
                  <>
                    <ReferenceAreaAny
                      y1={stats.lcl}
                      y2={stats.zone2Lower}
                      fill="#f59e0b"
                      fillOpacity={0.07}
                      ifOverflow="extendDomain"
                    />
                    <ReferenceAreaAny
                      y1={stats.zone2Upper}
                      y2={stats.ucl}
                      fill="#f59e0b"
                      fillOpacity={0.07}
                      ifOverflow="extendDomain"
                    />
                    <ReferenceAreaAny
                      y1={stats.zone1Lower}
                      y2={stats.zone1Upper}
                      fill="#16a34a"
                      fillOpacity={0.05}
                      ifOverflow="extendDomain"
                    />
                  </>
                )}

                {/* Zoom Drag Selection */}
                {dragStart !== null && dragEnd !== null && (
                  <ReferenceAreaAny
                    x1={Math.min(dragStart, dragEnd)}
                    x2={Math.max(dragStart, dragEnd)}
                    fill="var(--primary)"
                    fillOpacity={0.15}
                  />
                )}

                {/* Vertical Stage Boundary Lines when Staging is Active */}
                {isMultiStage &&
                  staged.stages.slice(1).map((st) => (
                    <ReferenceLine
                      key={`stage-div-${st.stageIndex}`}
                      x={st.startRow}
                      stroke="#6366f1"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{
                        value: st.label,
                        position: 'insideTopRight',
                        fill: '#6366f1',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  ))}

                {/* Specification Limits (USL / LSL) */}
                {showSpecLines && spec.usl > spec.lsl && (
                  <>
                    <ReferenceLine
                      y={spec.usl}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{
                        value: spec.uslLabel || 'USL',
                        position: 'right',
                        fill: '#dc2626',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                    <ReferenceLine
                      y={spec.lsl}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{
                        value: spec.lslLabel || 'LSL',
                        position: 'right',
                        fill: '#dc2626',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                  </>
                )}

                {/* Single-stage Control Limits OR Stepped Multi-Stage Control Limits */}
                {!isMultiStage ? (
                  <>
                    <ReferenceLine
                      y={stats.ucl}
                      stroke="#d97706"
                      strokeDasharray="5 4"
                      label={{
                        value: 'UCL',
                        position: 'insideTopLeft',
                        fill: '#d97706',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                    <ReferenceLine
                      y={stats.lcl}
                      stroke="#d97706"
                      strokeDasharray="5 4"
                      label={{
                        value: 'LCL',
                        position: 'insideBottomLeft',
                        fill: '#d97706',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                    <ReferenceLine
                      y={stats.mean}
                      stroke="var(--primary)"
                      strokeOpacity={0.55}
                      label={{
                        value: 'CL',
                        position: 'insideTopRight',
                        fill: 'var(--primary)',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Line
                      type="stepAfter"
                      dataKey="stageUcl"
                      stroke="#d97706"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      name="UCL (Steg)"
                    />
                    <Line
                      type="stepAfter"
                      dataKey="stageLcl"
                      stroke="#d97706"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      name="LCL (Steg)"
                    />
                    <Line
                      type="stepAfter"
                      dataKey="stageMean"
                      stroke="#059669"
                      strokeWidth={1.5}
                      strokeOpacity={0.85}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                      name="CL (Steg)"
                    />
                  </>
                )}

                {chartType === 'area' && (
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity={0.12}
                    strokeWidth={2}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
                {chartType === 'bar' && (
                  <Bar
                    dataKey="value"
                    fill="var(--primary)"
                    radius={[3, 3, 0, 0]}
                    opacity={0.8}
                    isAnimationActive={false}
                  />
                )}
                {chartType === 'line' && (
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    connectNulls
                    isAnimationActive={false}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (cx === undefined || cy === undefined)
                        return <g key={`empty-${props.index}`} />;
                      const pt: CombinedIChartPoint = payload;
                      if (pt.isExcluded || pt.value === null) {
                        return <g key={`empty-excl-${pt.rowIndex}`} />;
                      }
                      const outOfStageControl =
                        isMultiStage &&
                        pt.stageUcl !== null &&
                        pt.stageLcl !== null &&
                        (pt.value > pt.stageUcl || pt.value < pt.stageLcl);
                      if (pt.isOos || pt.hasAnomaly || outOfStageControl) {
                        const color = pt.isOos ? '#dc2626' : '#d97706';
                        return (
                          <g key={`dot-${pt.rowIndex}`} style={{ pointerEvents: 'none' }}>
                            <circle cx={cx} cy={cy} r={6} fill={color} fillOpacity={0.2} />
                            <circle
                              cx={cx}
                              cy={cy}
                              r={3.5}
                              fill={color}
                              stroke="var(--card)"
                              strokeWidth={1.5}
                            />
                            {pt.primaryBadge && visibleSeries.displayPoints.length <= 120 && (
                              <text
                                x={cx}
                                y={cy - 10}
                                textAnchor="middle"
                                fontSize={9}
                                fontWeight={700}
                                fill={color}
                              >
                                {pt.primaryBadge}
                              </text>
                            )}
                          </g>
                        );
                      }
                      if (visibleSeries.displayPoints.length > 150) {
                        return <g key={`dot-${pt.rowIndex}`} />;
                      }
                      return (
                        <circle
                          key={`dot-${pt.rowIndex}`}
                          cx={cx}
                          cy={cy}
                          r={2.5}
                          fill="var(--primary)"
                        />
                      );
                    }}
                  />
                )}

                {/* Excluded Special Cause Points Overlay (Hollow gray circle with X) */}
                {excludedRowsList.length > 0 && (
                  <Line
                    type="monotone"
                    dataKey="excludedValue"
                    stroke="none"
                    isAnimationActive={false}
                    activeDot={false}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      if (cx === undefined || cy === undefined || !payload?.isExcluded) {
                        return <g key={`excl-none-${props.index}`} />;
                      }
                      return (
                        <g key={`excl-${payload.rowIndex}`} style={{ pointerEvents: 'none' }}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={6}
                            fill="var(--card)"
                            stroke="#94a3b8"
                            strokeWidth={1.5}
                            strokeDasharray="2 2"
                          />
                          <line
                            x1={cx - 3.5}
                            y1={cy - 3.5}
                            x2={cx + 3.5}
                            y2={cy + 3.5}
                            stroke="#64748b"
                            strokeWidth={1.6}
                          />
                          <line
                            x1={cx + 3.5}
                            y1={cy - 3.5}
                            x2={cx - 3.5}
                            y2={cy + 3.5}
                            stroke="#64748b"
                            strokeWidth={1.6}
                          />
                        </g>
                      );
                    }}
                  />
                )}

                {showMovingAverage && (
                  <Line
                    type="monotone"
                    dataKey="movingAverage"
                    stroke="#0284c7"
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Moving Range (MR) Chart */}
        <div className="pt-5 border-t border-border space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              Rörlig variationsvidd (Moving Range / MR-Chart)
            </span>
            <span className="font-mono tabular-nums">
              {isMultiStage
                ? 'Stegvis MR-bar & UCL_MR (nollställs vid steggräns)'
                : `MR-bar: ${stats.mrBar.toFixed(3)} · UCL_MR (D₄ = 3.267): ${stats.uclMr.toFixed(3)}`}
            </span>
          </div>

          <div className="h-[160px] w-full select-none">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={mrPoints}
                margin={{ top: 8, right: 38, left: showYAxis ? 16 : 8, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                  strokeOpacity={0.75}
                />
                <XAxis
                  dataKey="rowIndex"
                  type="number"
                  hide={!showXAxis}
                  domain={['dataMin', 'dataMax']}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tick={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
                  tickFormatter={(rowIdx) => labelByRow.get(Number(rowIdx)) || `#${rowIdx}`}
                />
                <YAxis
                  hide={!showYAxis}
                  domain={yDomainMR}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tick={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}
                  width={62}
                  tickFormatter={(v) => Number(v).toFixed(2)}
                />
                <Tooltip content={<CustomMRTooltip />} />

                {isMultiStage &&
                  staged.stages.slice(1).map((st) => (
                    <ReferenceLine
                      key={`mr-div-${st.stageIndex}`}
                      x={st.startRow}
                      stroke="#6366f1"
                      strokeDasharray="4 3"
                      strokeWidth={1.25}
                    />
                  ))}

                {!isMultiStage ? (
                  <>
                    <ReferenceLine
                      y={stats.uclMr}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      label={{
                        value: 'UCL_MR',
                        position: 'right',
                        fill: '#dc2626',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                    <ReferenceLine y={stats.mrBar} stroke="var(--primary)" strokeOpacity={0.55} />
                  </>
                ) : (
                  <>
                    <Line
                      type="stepAfter"
                      dataKey="stageUclMr"
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      strokeWidth={1.4}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="stageMrBar"
                      stroke="#059669"
                      strokeWidth={1.3}
                      strokeOpacity={0.75}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </>
                )}

                <Line
                  type="monotone"
                  dataKey="mr"
                  stroke="#64748b"
                  strokeWidth={1.75}
                  isAnimationActive={false}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (cx === undefined || cy === undefined)
                      return <g key={`mr-e-${props.index}`} />;
                    const pt: StagedChartPoint = payload;
                    if (pt.mrOutOfControl) {
                      return (
                        <circle
                          key={`mr-${pt.rowIndex}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill="#dc2626"
                          stroke="var(--card)"
                          strokeWidth={1.5}
                        />
                      );
                    }
                    return <g key={`mr-${pt.rowIndex}`} />;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-Stage Summary Table when Staging is active */}
        {isMultiStage && (
          <div className="pt-5 border-t border-border space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Sammanfattning per steg ({staged.stages.length} faser)
              </span>
              <span className="text-muted-foreground">
                Varje steg har egna kontrollgränser (UCL/CL/LCL) och kapabilitet
              </span>
            </div>
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                    <th className="py-2 px-3 font-semibold">Steg</th>
                    <th className="py-2 px-3 font-semibold">Rader</th>
                    <th className="py-2 px-3 font-semibold text-right">N</th>
                    <th className="py-2 px-3 font-semibold text-right">Medel (CL)</th>
                    <th className="py-2 px-3 font-semibold text-right">LCL / UCL</th>
                    <th className="py-2 px-3 font-semibold text-right">MR-bar / UCL_MR</th>
                    <th className="py-2 px-3 font-semibold text-right">Cpk</th>
                    <th className="py-2 px-3 font-semibold text-right">Ppk</th>
                    <th className="py-2 px-3 font-semibold text-right">OOS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono tabular-nums">
                  {staged.stages.map((st) => (
                    <tr key={st.stageIndex} className="hover:bg-muted/30">
                      <td className="py-2 px-3 font-sans font-semibold text-foreground">
                        {st.label}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        #{st.startRow}–#{st.endRow}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">{st.count}</td>
                      <td className="py-2 px-3 text-right font-semibold text-foreground">
                        {st.stats.mean.toFixed(4)}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {st.stats.lcl.toFixed(3)} / {st.stats.ucl.toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {st.stats.mrBar.toFixed(3)} / {st.stats.uclMr.toFixed(3)}
                      </td>
                      <td
                        className={cn(
                          'py-2 px-3 text-right font-semibold',
                          st.stats.cpk === null
                            ? 'text-muted-foreground'
                            : st.stats.cpk >= 1.33
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : st.stats.cpk >= 1.0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-rose-700 dark:text-rose-400'
                        )}
                      >
                        {fmt(st.stats.cpk, 3)}
                      </td>
                      <td className="py-2 px-3 text-right text-foreground">
                        {fmt(st.stats.ppk, 3)}
                      </td>
                      <td className="py-2 px-3 text-right text-foreground">{st.stats.oosCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Excluded Points — Special Cause Traceability Log */}
        {excludedRowsList.length > 0 && (
          <div className="pt-5 border-t border-border space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <Ban className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Exkluderade punkter — Special Cause-logg ({excludedRowsList.length} st)
              </span>
              <Button variant="outline" size="sm" onClick={onRestoreAll}>
                <RotateCcw className="w-3.5 h-3.5" />
                Återställ alla ({excludedRowsList.length})
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                    <th className="py-2 px-3 font-semibold w-20">Rad</th>
                    <th className="py-2 px-3 font-semibold">Tidpunkt</th>
                    <th className="py-2 px-3 font-semibold text-right">Värde</th>
                    <th className="py-2 px-3 font-semibold">Dokumenterad Special Cause-orsak</th>
                    <th className="py-2 px-3 font-semibold text-right w-28">Åtgärd</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {excludedRowsList.map((item) => (
                    <tr key={item.rowIndex} className="hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono tabular-nums text-muted-foreground">
                        #{item.rowIndex}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                        {item.label}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-right text-muted-foreground line-through">
                        {item.value.toFixed(4)}
                      </td>
                      <td className="py-2 px-3 text-foreground">{item.reason}</td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onRestorePoint(item.rowIndex)}
                          className="text-xs font-medium text-primary hover:underline cursor-pointer"
                        >
                          Återställ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Compact Rule Violation Breakdown */}
        {anomalySummary.length > 0 && (
          <div className="pt-5 border-t border-border space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                Detekterade regelbrott ({anomalies.length} st)
              </span>
              <span className="text-muted-foreground">
                Se alla enskilda rader under Data &amp; Export
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {anomalySummary.map((item) => (
                <div
                  key={item.code}
                  className="p-3 rounded-lg border border-border bg-muted/30 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between font-mono tabular-nums">
                    <span
                      className={cn(
                        'font-semibold',
                        item.sample.severity === 'critical'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-700 dark:text-amber-400'
                      )}
                    >
                      {item.code}
                    </span>
                    <span className="text-muted-foreground">{item.count} förekomster</span>
                  </div>
                  <p className="text-muted-foreground leading-snug line-clamp-2">
                    {item.sample.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
