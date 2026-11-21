import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Anomaly, StatsResult } from '@/src/lib/stats';
import { cn } from '@/src/lib/utils';
import { Card } from './ui/Card';

interface KpiOverviewProps {
  stats: StatsResult;
  anomalies: Anomaly[];
  nonNormalPpk?: number | null;
}

function formatNum(val: number | null | undefined, digits: number = 3): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '–';
  return val.toFixed(digits);
}

type StatusTone = 'healthy' | 'warning' | 'critical' | 'neutral';

const TONE_TEXT: Record<StatusTone, string> = {
  healthy: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  critical: 'text-rose-700 dark:text-rose-400',
  neutral: 'text-muted-foreground',
};

export function KpiOverview({ stats, anomalies, nonNormalPpk }: KpiOverviewProps) {
  const cpkTone: StatusTone =
    stats.cpk === null
      ? 'neutral'
      : stats.cpk >= 1.33
      ? 'healthy'
      : stats.cpk >= 1.0
      ? 'warning'
      : 'critical';

  const cpkLabel =
    stats.cpk === null
      ? 'Ej beräkningsbar'
      : stats.cpk >= 1.33
      ? 'Kapabel (≥ 1.33)'
      : stats.cpk >= 1.0
      ? 'Marginal (1.0–1.33)'
      : 'Ej kapabel (< 1.0)';

  const ppkTone: StatusTone =
    stats.ppk === null
      ? 'neutral'
      : stats.ppk >= 1.33
      ? 'healthy'
      : stats.ppk >= 1.0
      ? 'warning'
      : 'critical';

  const ppkLabel =
    stats.ppk === null
      ? 'Ej beräkningsbar'
      : stats.ppk >= 1.33
      ? 'God prestanda'
      : stats.ppk >= 1.0
      ? 'Marginal prestanda'
      : 'Otillräcklig prestanda';

  const normTone: StatusTone =
    stats.isNormal === null ? 'neutral' : stats.isNormal ? 'healthy' : 'warning';
  const normValue =
    stats.isNormal === null ? 'N < 8' : stats.isNormal ? 'Normal' : 'Ej normal';
  const normSub =
    stats.normalityPValue !== null
      ? `D'Agostino-Pearson p = ${stats.normalityPValue.toFixed(4)}`
      : 'Kräver minst 8 mätpunkter';

  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  const controlTone: StatusTone =
    criticalCount > 0 ? 'critical' : anomalies.length > 0 ? 'warning' : 'healthy';
  const controlValue =
    criticalCount > 0 ? 'Ur kontroll' : anomalies.length > 0 ? 'Varning' : 'Stabil';
  const controlSub = `${stats.oosCount} OOS · ${stats.mrOutOfControlCount} MR-larm · ${anomalies.length} regelbrott`;

  return (
    <section aria-label="Nyckeltal" className="space-y-4">
      {stats.warnings.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {stats.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </div>
      )}

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="sm" className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Cpk (Kortsiktig potential)</span>
            <span className={cn('font-semibold', TONE_TEXT[cpkTone])}>{cpkLabel}</span>
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold tracking-tight text-foreground">
            {formatNum(stats.cpk, 3)}
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            Cp: {formatNum(stats.cp, 3)} · σ Within: {formatNum(stats.stdDevWithin, 4)}
          </div>
        </Card>

        <Card padding="sm" className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Ppk (Faktisk prestanda)</span>
            <span className={cn('font-semibold', TONE_TEXT[ppkTone])}>{ppkLabel}</span>
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold tracking-tight text-foreground">
            {formatNum(stats.ppk, 3)}
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            {stats.isNormal === false && nonNormalPpk !== null && nonNormalPpk !== undefined ? (
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                ISO 22514 Ppk: {formatNum(nonNormalPpk, 3)} (rek. vid skev data)
              </span>
            ) : (
              <>
                Pp: {formatNum(stats.pp, 3)} · σ Overall: {formatNum(stats.stdDev, 4)}
              </>
            )}
          </div>
        </Card>

        <Card padding="sm" className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Normalitetstest</span>
            <span className={cn('font-semibold', TONE_TEXT[normTone])}>
              {stats.isNormal === null ? 'Ej bedömd' : stats.isNormal ? 'OK (α = 0.05)' : 'Avvikande'}
            </span>
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">{normValue}</div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums truncate" title={normSub}>
            {normSub}
          </div>
        </Card>

        <Card padding="sm" className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Processkontroll (I-MR)</span>
            <span className={cn('font-semibold', TONE_TEXT[controlTone])}>
              {criticalCount > 0 ? 'Kritisk' : anomalies.length > 0 ? 'Observera' : 'I kontroll'}
            </span>
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">{controlValue}</div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums truncate" title={controlSub}>
            {controlSub}
          </div>
        </Card>
      </div>

      {/* Compact Secondary Statistics Strip (Flat, no nested cards) */}
      <Card padding="none" className="px-5 py-3.5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-3 gap-x-6 divide-y sm:divide-y-0 border-border">
          <div>
            <p className="text-xs text-muted-foreground">Medel / Median</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-foreground mt-0.5">
              {formatNum(stats.mean, 3)} / {formatNum(stats.median, 3)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Min / Max</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-foreground mt-0.5">
              {formatNum(stats.min, 3)} / {formatNum(stats.max, 3)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Kontrollgränser (3σ)</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-foreground mt-0.5">
              {formatNum(stats.lcl, 3)} – {formatNum(stats.ucl, 3)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">MR-bar / UCL_MR</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-foreground mt-0.5">
              {formatNum(stats.mrBar, 3)} / {formatNum(stats.uclMr, 3)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Skewness / Kurtosis</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-foreground mt-0.5">
              {formatNum(stats.skewness, 2)} / {formatNum(stats.kurtosis, 2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">PPM (Obs / Förv)</p>
            <p className="font-mono tabular-nums text-sm font-semibold text-foreground mt-0.5">
              {Math.round(stats.ppmObserved).toLocaleString('sv-SE')} /{' '}
              {stats.ppmExpected !== null
                ? Math.round(stats.ppmExpected).toLocaleString('sv-SE')
                : '–'}
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
