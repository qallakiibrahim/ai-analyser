import React, { useState, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  LineChart,
} from 'recharts';
import { CheckCircle2, AlertTriangle, AlertCircle, Brain, Settings, RotateCcw } from 'lucide-react';
import {
  HistogramBin,
  ProcessDiagnosis,
  RollingCapabilityPoint,
  SpecLimits,
  StatsResult,
} from '@/src/lib/stats';
import { cn } from '@/src/lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

const ReferenceAreaAny = ReferenceArea as any;

interface DistributionAndTrendProps {
  histogram: HistogramBin[];
  binCount: number;
  onBinCountChange: (bins: number) => void;
  stats: StatsResult;
  spec: SpecLimits;
  diagnosis: ProcessDiagnosis;
  rollingHistory: RollingCapabilityPoint[];
  rollingWindow: number;
  onRollingWindowChange: (win: number) => void;
  onRunAiAnalysis: () => void;
  isAnalyzing: boolean;
}

export function DistributionAndTrend({
  histogram,
  binCount,
  onBinCountChange,
  stats,
  spec,
  diagnosis,
  rollingHistory,
  rollingWindow,
  onRollingWindowChange,
  onRunAiAnalysis,
  isAnalyzing,
}: DistributionAndTrendProps) {
  const [rollingMetric, setRollingMetric] = useState<'cpk' | 'cp'>('cpk');

  // Histogram axis settings
  const [showDistSettings, setShowDistSettings] = useState(false);
  const [showDistXAxis, setShowDistXAxis] = useState(true);
  const [showDistYAxis, setShowDistYAxis] = useState(true);
  const [distXAxisLabel, setDistXAxisLabel] = useState('Mätvärde');
  const [distYAxisLabel, setDistYAxisLabel] = useState('Antal');

  // Rolling trend settings & click-and-drag zoom
  const [showTrendSettings, setShowTrendSettings] = useState(false);
  const [showTrendXAxis, setShowTrendXAxis] = useState(true);
  const [showTrendYAxis, setShowTrendYAxis] = useState(true);
  const [trendXAxisLabel, setTrendXAxisLabel] = useState('Tid / Rad');
  const [trendYAxisLabel, setTrendYAxisLabel] = useState('Kapabilitet');
  const [trendZoomRange, setTrendZoomRange] = useState<[number, number] | null>(null);
  const [trendDragStart, setTrendDragStart] = useState<number | null>(null);
  const [trendDragEnd, setTrendDragEnd] = useState<number | null>(null);

  const visibleRolling = useMemo(() => {
    if (!trendZoomRange) return rollingHistory;
    return rollingHistory.filter(
      (p) => p.rowIndex >= trendZoomRange[0] && p.rowIndex <= trendZoomRange[1]
    );
  }, [rollingHistory, trendZoomRange]);

  const trendLabelByRow = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of visibleRolling) {
      map.set(p.rowIndex, p.label);
    }
    return map;
  }, [visibleRolling]);

  const trendYDomain = useMemo((): [number, number] | ['auto', 'auto'] => {
    if (!trendZoomRange) return ['auto', 'auto'];
    const vals = visibleRolling
      .map((p) => p[rollingMetric])
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (vals.length === 0) return ['auto', 'auto'];
    const min = Math.min(...vals, 1.0);
    const max = Math.max(...vals, 1.33);
    const pad = Math.max((max - min) * 0.12, 0.1);
    return [Number((min - pad).toFixed(3)), Number((max + pad).toFixed(3))];
  }, [visibleRolling, rollingMetric, trendZoomRange]);

  const handleTrendMouseUp = () => {
    if (trendDragStart !== null && trendDragEnd !== null && trendDragStart !== trendDragEnd) {
      setTrendZoomRange([
        Math.min(trendDragStart, trendDragEnd),
        Math.max(trendDragStart, trendDragEnd),
      ]);
    }
    setTrendDragStart(null);
    setTrendDragEnd(null);
  };

  const resetTrendZoom = () => {
    setTrendZoomRange(null);
    setTrendDragStart(null);
    setTrendDragEnd(null);
  };

  const HistTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const bin: HistogramBin = payload[0].payload;
    return (
      <div className="bg-card border border-border p-3 rounded-lg shadow-lg text-xs space-y-1 font-mono tabular-nums">
        <p className="font-sans font-semibold text-foreground border-b border-border pb-1">
          Intervall: {bin.start.toFixed(3)} – {bin.end.toFixed(3)}
        </p>
        <div className="flex justify-between gap-6">
          <span className="font-sans text-muted-foreground">Observerat antal:</span>
          <span className="font-semibold text-foreground">{bin.count}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="font-sans text-muted-foreground">Normalfördelning (förv.):</span>
          <span className="text-foreground">{bin.normalExpected.toFixed(2)}</span>
        </div>
      </div>
    );
  };

  const TrendTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: RollingCapabilityPoint = payload[0].payload;
    return (
      <div className="bg-card border border-border p-3 rounded-lg shadow-lg text-xs space-y-1 font-mono tabular-nums">
        <p className="text-muted-foreground border-b border-border pb-1">
          Rad #{pt.rowIndex} · {pt.label}
        </p>
        <div className="flex justify-between gap-6">
          <span className="font-sans text-muted-foreground">Cpk:</span>
          <span className="font-semibold text-foreground">
            {pt.cpk !== null ? pt.cpk.toFixed(3) : '–'}
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="font-sans text-muted-foreground">Cp:</span>
          <span className="text-foreground">{pt.cp !== null ? pt.cp.toFixed(3) : '–'}</span>
        </div>
      </div>
    );
  };

  const diagColor =
    diagnosis.level === 'critical'
      ? 'text-rose-700 dark:text-rose-400 border-rose-500/30 bg-rose-500/[0.04]'
      : diagnosis.level === 'warning'
      ? 'text-amber-800 dark:text-amber-300 border-amber-500/30 bg-amber-500/[0.04]'
      : 'text-emerald-800 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.04]';

  const DiagIcon =
    diagnosis.level === 'critical'
      ? AlertCircle
      : diagnosis.level === 'warning'
      ? AlertTriangle
      : CheckCircle2;

  return (
    <section aria-label="Fördelning och kapabilitetstrend" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Histogram with Normal Curve + USL/LSL + Axis Settings */}
        <Card
          padding="none"
          className="lg:col-span-2 p-5 sm:p-6 flex flex-col justify-between space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Fördelningshistogram &amp; normalfördelningskurva
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Röda staplar anger intervall utanför tolerans ({spec.lslLabel || 'LSL'} /{' '}
                {spec.uslLabel || 'USL'})
              </p>
            </div>
            <Button
              variant={showDistSettings ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setShowDistSettings((prev) => !prev)}
            >
              <Settings className="w-3.5 h-3.5" />
              Grafalternativ
            </Button>
          </div>

          {showDistSettings && (
            <div className="p-4 bg-muted/50 rounded-lg border border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="hist-bins" className="text-xs font-semibold text-foreground block">
                  Antal staplar (Bins)
                </label>
                <input
                  id="hist-bins"
                  type="number"
                  min={4}
                  max={25}
                  value={binCount}
                  onChange={(e) =>
                    onBinCountChange(
                      Math.max(4, Math.min(25, parseInt(e.target.value, 10) || 12))
                    )
                  }
                  className="w-full h-8 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center justify-between text-xs font-semibold text-foreground cursor-pointer">
                  <span>Visa X-axel</span>
                  <input
                    type="checkbox"
                    checked={showDistXAxis}
                    onChange={(e) => setShowDistXAxis(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                </label>
                {showDistXAxis && (
                  <input
                    type="text"
                    value={distXAxisLabel}
                    onChange={(e) => setDistXAxisLabel(e.target.value)}
                    placeholder="Etikett X-axel"
                    className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center justify-between text-xs font-semibold text-foreground cursor-pointer">
                  <span>Visa Y-axel</span>
                  <input
                    type="checkbox"
                    checked={showDistYAxis}
                    onChange={(e) => setShowDistYAxis(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                </label>
                {showDistYAxis && (
                  <input
                    type="text"
                    value={distYAxisLabel}
                    onChange={(e) => setDistYAxisLabel(e.target.value)}
                    placeholder="Etikett Y-axel"
                    className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>
            </div>
          )}

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={histogram}
                margin={{
                  top: 14,
                  right: 16,
                  left: showDistYAxis && distYAxisLabel ? 12 : 0,
                  bottom: showDistXAxis && distXAxisLabel ? 20 : 8,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="midpoint"
                  type="number"
                  hide={!showDistXAxis}
                  domain={['dataMin', 'dataMax']}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => Number(v).toFixed(2)}
                  label={
                    showDistXAxis && distXAxisLabel
                      ? {
                          value: distXAxisLabel,
                          position: 'insideBottom',
                          offset: -12,
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }
                      : undefined
                  }
                />
                <YAxis
                  hide={!showDistYAxis}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  width={44}
                  allowDecimals={false}
                  label={
                    showDistYAxis && distYAxisLabel
                      ? {
                          value: distYAxisLabel,
                          angle: -90,
                          position: 'insideLeft',
                          style: { textAnchor: 'middle' },
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }
                      : undefined
                  }
                />
                <Tooltip content={<HistTooltip />} />

                {spec.usl > spec.lsl && (
                  <>
                    <ReferenceLine
                      x={spec.lsl}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      label={{
                        value: spec.lslLabel || 'LSL',
                        position: 'top',
                        fill: '#dc2626',
                        fontSize: 10,
                      }}
                    />
                    <ReferenceLine
                      x={spec.usl}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      label={{
                        value: spec.uslLabel || 'USL',
                        position: 'top',
                        fill: '#dc2626',
                        fontSize: 10,
                      }}
                    />
                  </>
                )}
                <ReferenceLine
                  x={stats.mean}
                  stroke="var(--primary)"
                  strokeDasharray="3 3"
                  label={{ value: 'Mean', position: 'top', fill: 'var(--primary)', fontSize: 10 }}
                />

                <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {histogram.map((entry, idx) => (
                    <Cell
                      key={`bin-${idx}`}
                      fill={entry.outOfSpec ? '#dc2626' : 'var(--primary)'}
                      fillOpacity={entry.outOfSpec ? 0.8 : 0.65}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="normalExpected"
                  stroke="#0f172a"
                  className="dark:stroke-slate-200"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Dynamic Process Diagnosis Card */}
        <Card
          padding="none"
          className={cn('p-5 sm:p-6 flex flex-col justify-between gap-5', diagColor)}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <DiagIcon className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                  Automatisk processbedömning
                </p>
                <h3 className="text-base font-semibold text-foreground leading-snug">
                  {diagnosis.headline}
                </h3>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">{diagnosis.summary}</p>

            <ul className="space-y-2 text-xs text-foreground/90 list-disc pl-4">
              {diagnosis.findings.map((finding, idx) => (
                <li key={idx} className="leading-relaxed">
                  {finding}
                </li>
              ))}
            </ul>
          </div>

          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={onRunAiAnalysis}
            isLoading={isAnalyzing}
          >
            <Brain className="w-4 h-4" />
            {isAnalyzing ? 'Kör AI-analys...' : 'Fördjupad AI-rotorsaksanalys'}
          </Button>
        </Card>
      </div>

      {/* Rolling Cp/Cpk Capability Trend with Click-and-Drag Zoom + Axis Settings */}
      <Card padding="none" className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Rullande kapabilitetstrend ({rollingMetric.toUpperCase()})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dra med musen för att zooma · Referenslinjer vid 1.33 (kapabel) och 1.00 (minimum)
              {trendZoomRange && (
                <span>
                  {' '}
                  · Zoomad vy (rad #{trendZoomRange[0]}–#{trendZoomRange[1]})
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {trendZoomRange && (
              <Button variant="outline" size="sm" onClick={resetTrendZoom}>
                <RotateCcw className="w-3.5 h-3.5" />
                Återställ zoom
              </Button>
            )}

            <div className="flex bg-muted p-0.5 rounded-lg border border-border">
              {(['cpk', 'cp'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRollingMetric(m)}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium uppercase transition-colors cursor-pointer',
                    rollingMetric === m
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            <Button
              variant={showTrendSettings ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setShowTrendSettings((prev) => !prev)}
            >
              <Settings className="w-3.5 h-3.5" />
              Grafalternativ
            </Button>
          </div>
        </div>

        {showTrendSettings && (
          <div className="p-4 bg-muted/50 rounded-lg border border-border grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="rolling-win" className="text-xs font-semibold text-foreground block">
                Rullande fönster (antal rader)
              </label>
              <input
                id="rolling-win"
                type="number"
                min={5}
                max={200}
                value={rollingWindow}
                onChange={(e) => {
                  onRollingWindowChange(
                    Math.max(5, Math.min(200, parseInt(e.target.value, 10) || 15))
                  );
                  resetTrendZoom();
                }}
                className="w-full h-8 px-2.5 font-mono tabular-nums text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-semibold text-foreground cursor-pointer">
                <span>Visa X-axel</span>
                <input
                  type="checkbox"
                  checked={showTrendXAxis}
                  onChange={(e) => setShowTrendXAxis(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
              </label>
              {showTrendXAxis && (
                <input
                  type="text"
                  value={trendXAxisLabel}
                  onChange={(e) => setTrendXAxisLabel(e.target.value)}
                  placeholder="Etikett X-axel"
                  className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-semibold text-foreground cursor-pointer">
                <span>Visa Y-axel</span>
                <input
                  type="checkbox"
                  checked={showTrendYAxis}
                  onChange={(e) => setShowTrendYAxis(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
              </label>
              {showTrendYAxis && (
                <input
                  type="text"
                  value={trendYAxisLabel}
                  onChange={(e) => setTrendYAxisLabel(e.target.value)}
                  placeholder="Etikett Y-axel"
                  className="w-full h-8 px-2.5 text-xs bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </div>
          </div>
        )}

        <div className="h-[240px] w-full cursor-crosshair select-none">
          {visibleRolling.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={visibleRolling}
                margin={{
                  top: 10,
                  right: 34,
                  left: showTrendYAxis && trendYAxisLabel ? 14 : 4,
                  bottom: showTrendXAxis && trendXAxisLabel ? 20 : 4,
                }}
                onMouseDown={(e: any) => {
                  if (e && e.activeLabel !== undefined) {
                    setTrendDragStart(Number(e.activeLabel));
                    setTrendDragEnd(null);
                  }
                }}
                onMouseMove={(e: any) => {
                  if (trendDragStart !== null && e && e.activeLabel !== undefined) {
                    setTrendDragEnd(Number(e.activeLabel));
                  }
                }}
                onMouseUp={handleTrendMouseUp}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="rowIndex"
                  type="number"
                  hide={!showTrendXAxis}
                  domain={['dataMin', 'dataMax']}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(rowIdx) => trendLabelByRow.get(Number(rowIdx)) || `#${rowIdx}`}
                  label={
                    showTrendXAxis && trendXAxisLabel
                      ? {
                          value: trendXAxisLabel,
                          position: 'insideBottom',
                          offset: -12,
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }
                      : undefined
                  }
                />
                <YAxis
                  hide={!showTrendYAxis}
                  domain={trendYDomain}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  width={48}
                  label={
                    showTrendYAxis && trendYAxisLabel
                      ? {
                          value: trendYAxisLabel,
                          angle: -90,
                          position: 'insideLeft',
                          style: { textAnchor: 'middle' },
                          fontSize: 11,
                          fill: 'var(--muted-foreground)',
                        }
                      : undefined
                  }
                />
                <Tooltip content={<TrendTooltip />} />

                {trendDragStart !== null && trendDragEnd !== null && (
                  <ReferenceAreaAny
                    x1={Math.min(trendDragStart, trendDragEnd)}
                    x2={Math.max(trendDragStart, trendDragEnd)}
                    fill="var(--primary)"
                    fillOpacity={0.15}
                  />
                )}

                <ReferenceLine
                  y={1.33}
                  stroke="#16a34a"
                  strokeDasharray="4 3"
                  label={{ value: '1.33', position: 'right', fill: '#16a34a', fontSize: 10 }}
                />
                <ReferenceLine
                  y={1.0}
                  stroke="#d97706"
                  strokeDasharray="4 3"
                  label={{ value: '1.00', position: 'right', fill: '#d97706', fontSize: 10 }}
                />
                <Line
                  type="monotone"
                  dataKey={rollingMetric}
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Behöver minst {rollingWindow} mätpunkter med giltiga toleranser för att visa rullande
              trend.
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
