import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { Copy, Check, Sparkles, TrendingUp } from 'lucide-react';
import { ProductionRow, SpecLimits } from '@/src/lib/stats';
import {
  FittedLineDegree,
  compareFittedLineModels,
  getDegreeLabel,
} from '@/src/lib/regression';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { cn } from '@/src/lib/utils';

interface FittedLinePlotCardProps {
  rows: ProductionRow[];
  target: string;
  candidateFactors: string[];
  preferredFactor: string | null;
  spec: SpecLimits;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

const DEGREES: FittedLineDegree[] = [1, 2, 3];

function fmtP(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '–';
  if (p < 0.0001) return '< 0.0001';
  return p.toFixed(4);
}

function fmtNum(val: number | null | undefined, digits: number = 4): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '–';
  return val.toFixed(digits);
}

export function FittedLinePlotCard({
  rows,
  target,
  candidateFactors,
  preferredFactor,
  spec,
  onNotify,
}: FittedLinePlotCardProps) {
  const [selectedX, setSelectedX] = useState<string>(
    preferredFactor || candidateFactors[0] || ''
  );
  const [degree, setDegree] = useState<FittedLineDegree>(1);
  const [userPickedDegree, setUserPickedDegree] = useState<boolean>(false);
  const [showCi, setShowCi] = useState<boolean>(true);
  const [showPi, setShowPi] = useState<boolean>(true);
  const [showSpec, setShowSpec] = useState<boolean>(false);
  const [copiedEq, setCopiedEq] = useState<boolean>(false);

  // Keep selected X valid whenever target or available columns change
  useEffect(() => {
    if (candidateFactors.length === 0) {
      setSelectedX('');
      return;
    }
    if (!candidateFactors.includes(selectedX)) {
      setSelectedX(
        preferredFactor && candidateFactors.includes(preferredFactor)
          ? preferredFactor
          : candidateFactors[0]
      );
      setUserPickedDegree(false);
    }
  }, [candidateFactors, preferredFactor, selectedX]);

  // Train Linear (1), Quadratic (2), and Cubic (3) models simultaneously
  const comparison = useMemo(() => {
    if (!selectedX || !target) return null;
    return compareFittedLineModels(rows, target, selectedX);
  }, [rows, target, selectedX]);

  // Automatically pick recommended curve shape when factor/target changes unless user manually overrode
  useEffect(() => {
    if (!comparison) return;
    if (!userPickedDegree) {
      setDegree(comparison.recommendedDegree);
    } else if (!comparison.models[degree]) {
      setDegree(comparison.recommendedDegree);
    }
  }, [comparison, userPickedDegree, degree]);

  const activeModel = comparison?.models[degree] ?? comparison?.models[1] ?? null;

  const chartDomains = useMemo(() => {
    if (!activeModel) return null;
    const xSpan = Math.max(1e-6, activeModel.xMax - activeModel.xMin);
    const xPad = xSpan * 0.04;

    let yLo = activeModel.yMin;
    let yHi = activeModel.yMax;
    if (!showPi) {
      const yVals = activeModel.scatterPoints.map((p) => p.y);
      const fitVals = activeModel.curvePoints.flatMap((p) =>
        showCi ? [p.ciLow, p.ciHigh] : [p.fit]
      );
      yLo = Math.min(...yVals, ...fitVals);
      yHi = Math.max(...yVals, ...fitVals);
    }
    if (showSpec && spec.usl > spec.lsl) {
      yLo = Math.min(yLo, spec.lsl);
      yHi = Math.max(yHi, spec.usl);
    }
    const ySpan = Math.max(1e-6, yHi - yLo);
    const yPad = ySpan * 0.08;

    return {
      xMin: Number((activeModel.xMin - xPad).toFixed(4)),
      xMax: Number((activeModel.xMax + xPad).toFixed(4)),
      yMin: Number((yLo - yPad).toFixed(4)),
      yMax: Number((yHi + yPad).toFixed(4)),
    };
  }, [activeModel, showCi, showPi, showSpec, spec.lsl, spec.usl]);

  const handleCopyEquation = async () => {
    if (!activeModel) return;
    try {
      await navigator.clipboard.writeText(activeModel.equationText);
      setCopiedEq(true);
      setTimeout(() => setCopiedEq(false), 1800);
      onNotify('success', 'Kurvekvationen kopierad till urklipp.');
    } catch {
      onNotify('info', 'Markera ekvationen manuellt för att kopiera.');
    }
  };

  if (candidateFactors.length === 0) return null;

  return (
    <Card padding="none" className="p-5 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-start gap-2.5">
          <TrendingUp className="w-4 h-4 text-primary shrink-0 mt-1" />
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Fitted Line Plot — Anpassad linje &amp; kurvböjning ({target} mot {selectedX})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Träna och jämför rak linje (Linjär), parabel (Kvadratisk X²) och S-kurva (Kubisk X³)
              direkt mot mätpunkterna med 95 % konfidens- och prediktionsband.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Factor X selector */}
          <select
            aria-label="Välj X-faktor för Fitted Line Plot"
            value={selectedX}
            onChange={(e) => {
              setSelectedX(e.target.value);
              setUserPickedDegree(false);
            }}
            className="h-9 px-2.5 text-xs font-medium bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {candidateFactors.map((f) => (
              <option key={f} value={f}>
                X: {f}
              </option>
            ))}
          </select>

          {/* Curve Degree Segmented Selector */}
          <div
            role="group"
            aria-label="Välj kurvform"
            className="inline-flex items-center p-1 bg-muted rounded-lg border border-border/70"
          >
            {DEGREES.map((d) => {
              const available = Boolean(comparison?.models[d]);
              const active = degree === d;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    setDegree(d);
                    setUserPickedDegree(true);
                  }}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:pointer-events-none',
                    active
                      ? 'bg-card text-foreground shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {getDegreeLabel(d)}
                </button>
              );
            })}
          </div>

          {comparison && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDegree(comparison.recommendedDegree);
                setUserPickedDegree(false);
                onNotify(
                  'info',
                  `Valde rekommenderad kurvform: ${getDegreeLabel(comparison.recommendedDegree)}.`
                );
              }}
              title="Välj den böjning som ger bäst AICc utan överanpassning"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Auto
            </Button>
          )}
        </div>
      </div>

      {!activeModel || !chartDomains ? (
        <div className="py-10 text-center text-xs text-muted-foreground">
          Behöver minst 4 mätpunkter med variation i <span className="font-semibold text-foreground">{selectedX}</span> för att rita Fitted Line Plot.
        </div>
      ) : (
        <>
          {/* Inline Legend + Band Toggles + Key Fit Readout */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-700/80 inline-block" />
                <span>Mätvärden ({activeModel.n})</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-rose-600 inline-block" />
                <span className="text-foreground font-medium">{activeModel.degreeLabel}</span>
              </span>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCi}
                  onChange={(e) => setShowCi(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                />
                <span className="w-4 border-t-2 border-dashed border-sky-600 inline-block" />
                <span>95 % CI</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPi}
                  onChange={(e) => setShowPi(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                />
                <span className="w-4 border-t-2 border-dotted border-amber-600 inline-block" />
                <span>95 % PI</span>
              </label>

              {spec.usl > spec.lsl && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showSpec}
                    onChange={(e) => setShowSpec(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                  />
                  <span>USL/LSL</span>
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums text-xs text-muted-foreground">
              <span>
                R² <strong className="text-foreground">{(activeModel.rSquared * 100).toFixed(1)} %</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Just. R²{' '}
                <strong className="text-foreground">
                  {(activeModel.adjRSquared * 100).toFixed(1)} %
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                S <strong className="text-foreground">{fmtNum(activeModel.rmse, 4)}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                p <strong className="text-foreground">{fmtP(activeModel.modelPValue)}</strong>
              </span>
            </div>
          </div>

          {/* Interactive Fitted Line Plot Chart */}
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 10, right: 20, bottom: 24, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  allowDuplicatedCategory={false}
                  domain={[chartDomains.xMin, chartDomains.xMax]}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                  label={{
                    value: selectedX,
                    position: 'insideBottom',
                    offset: -14,
                    fontSize: 11,
                    fill: 'var(--muted-foreground)',
                  }}
                />
                <YAxis
                  type="number"
                  domain={[chartDomains.yMin, chartDomains.yMax]}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}
                  width={58}
                  label={{
                    value: target,
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
                    fontFamily: 'var(--font-mono)',
                  }}
                  labelFormatter={(val) => `${selectedX} = ${Number(val).toFixed(3)}`}
                  formatter={(val: unknown, name: string) => {
                    const formatted = typeof val === 'number' ? val.toFixed(4) : String(val);
                    const labelMap: Record<string, string> = {
                      y: `Uppmätt ${target}`,
                      fit: 'Anpassad kurva (Ŷ)',
                      ciHigh: '95 % CI övre',
                      ciLow: '95 % CI undre',
                      piHigh: '95 % PI övre',
                      piLow: '95 % PI undre',
                    };
                    return [formatted, labelMap[name] ?? name];
                  }}
                />

                {showSpec && spec.usl > spec.lsl && (
                  <>
                    <ReferenceLine
                      y={spec.usl}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      strokeWidth={1.25}
                      label={{ value: 'USL', position: 'right', fontSize: 10, fill: '#dc2626' }}
                    />
                    <ReferenceLine
                      y={spec.lsl}
                      stroke="#dc2626"
                      strokeDasharray="4 3"
                      strokeWidth={1.25}
                      label={{ value: 'LSL', position: 'right', fontSize: 10, fill: '#dc2626' }}
                    />
                  </>
                )}

                {/* 95% Prediction Interval Band */}
                {showPi && (
                  <>
                    <Line
                      data={activeModel.curvePoints}
                      dataKey="piHigh"
                      type="monotone"
                      stroke="#d97706"
                      strokeWidth={1.25}
                      strokeDasharray="2 3"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      data={activeModel.curvePoints}
                      dataKey="piLow"
                      type="monotone"
                      stroke="#d97706"
                      strokeWidth={1.25}
                      strokeDasharray="2 3"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  </>
                )}

                {/* 95% Confidence Interval Band */}
                {showCi && (
                  <>
                    <Line
                      data={activeModel.curvePoints}
                      dataKey="ciHigh"
                      type="monotone"
                      stroke="#0284c7"
                      strokeWidth={1.35}
                      strokeDasharray="6 3"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      data={activeModel.curvePoints}
                      dataKey="ciLow"
                      type="monotone"
                      stroke="#0284c7"
                      strokeWidth={1.35}
                      strokeDasharray="6 3"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  </>
                )}

                {/* Observed Data Points */}
                <Scatter
                  data={activeModel.scatterPoints}
                  dataKey="y"
                  fill="#1d4ed8"
                  fillOpacity={0.72}
                  isAnimationActive={false}
                  name="y"
                />

                {/* Fitted Polynomial Curve */}
                <Line
                  data={activeModel.curvePoints}
                  dataKey="fit"
                  type="monotone"
                  stroke="#e11d48"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                  name="fit"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Equation & Curve Comparison Table */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="px-3 py-2 rounded-lg bg-muted/50 border border-border font-mono text-xs text-foreground overflow-x-auto whitespace-nowrap flex-1">
                {activeModel.equationText}
              </div>
              <button
                type="button"
                onClick={handleCopyEquation}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer shrink-0 self-start sm:self-center"
              >
                {copiedEq ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedEq ? 'Kopierad' : 'Kopiera kurvekvation'}
              </button>
            </div>

            {comparison && (
              <div className="space-y-2">
                <div className="overflow-x-auto border border-border rounded-lg">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/60 border-b border-border text-muted-foreground">
                        <th className="py-2 px-3 font-semibold">Kurvform (klicka för att växla)</th>
                        <th className="py-2 px-3 font-semibold text-right">R²</th>
                        <th className="py-2 px-3 font-semibold text-right">Just. R²</th>
                        <th className="py-2 px-3 font-semibold text-right">S (RMSE)</th>
                        <th className="py-2 px-3 font-semibold text-right">p (högsta term)</th>
                        <th className="py-2 px-3 font-semibold text-right">AICc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono tabular-nums">
                      {DEGREES.map((d) => {
                        const m = comparison.models[d];
                        const isSelected = degree === d;
                        const isRec = comparison.recommendedDegree === d;
                        return (
                          <tr
                            key={d}
                            onClick={() => {
                              if (!m) return;
                              setDegree(d);
                              setUserPickedDegree(true);
                            }}
                            className={cn(
                              'transition-colors',
                              m ? 'cursor-pointer' : 'opacity-45',
                              isSelected
                                ? 'bg-primary/8 font-semibold'
                                : m
                                ? 'hover:bg-muted/40'
                                : ''
                            )}
                          >
                            <td className="py-2 px-3 font-sans text-foreground">
                              <div className="flex items-center gap-2">
                                <span className={cn(isSelected && 'text-primary font-semibold')}>
                                  {getDegreeLabel(d)}
                                </span>
                                {isRec && m && (
                                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                    · Rekommenderad
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right text-foreground">
                              {m ? `${(m.rSquared * 100).toFixed(1)} %` : '–'}
                            </td>
                            <td className="py-2 px-3 text-right text-foreground">
                              {m ? `${(m.adjRSquared * 100).toFixed(1)} %` : '–'}
                            </td>
                            <td className="py-2 px-3 text-right text-muted-foreground">
                              {m ? fmtNum(m.rmse, 4) : '–'}
                            </td>
                            <td
                              className={cn(
                                'py-2 px-3 text-right',
                                m?.isHighestTermSignificant
                                  ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {m ? fmtP(m.highestTermPValue) : '–'}
                            </td>
                            <td className="py-2 px-3 text-right text-muted-foreground">
                              {m ? fmtNum(m.aicc, 1) : '–'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {comparison.recommendationReason}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
