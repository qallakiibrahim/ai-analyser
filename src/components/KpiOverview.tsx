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

const TONE_BAR: Record<StatusTone, string> = {
  healthy: 'bg-emerald-600 dark:bg-emerald-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  critical: 'bg-rose-600 dark:bg-rose-400',
  neutral: 'bg-muted-foreground/40',
};

const TONE_GLYPH: Record<StatusTone, string> = {
  healthy: '●',
  warning: '▲',
  critical: '✖',
  neutral: '○',
};

function CapabilityGauge({ value, tone }: { value: number | null; tone: StatusTone }) {
  // Scale 0.0 -> 2.0 (1.00 = 50%, 1.33 = 66.5%)
  const pct = value !== null && Number.isFinite(value)
    ? Math.max(0, Math.min(100, (value / 2.0) * 100))
    : 0;

  return (
    <div className="relative h-1.5 w-full rounded-full bg-muted overflow-visible" aria-hidden="true">
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', TONE_BAR[tone])}
        style={{ width: `${pct}%` }}
      />
      {/* 1.00 minimum threshold tick */}
      <span
        className="absolute -top-0.5 bottom-0 w-px h-2.5 bg-foreground/25"
        style={{ left: '50%' }}
        title="1.00 minimum"
      />
      {/* 1.33 capable threshold tick */}
      <span
        className="absolute -top-0.5 bottom-0 w-px h-2.5 bg-emerald-600/60 dark:bg-emerald-400/60"
        style={{ left: '66.5%' }}
        title="1.33 kapabel"
      />
    </div>
  );
}

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
      ? 'Marginal'
      : 'Otillräcklig';

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
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] text-xs sm:text-sm text-amber-900 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="space-y-0.5">
            {stats.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </div>
      )}

      {/* 4 Primary Instrument KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="none" className="p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Cpk · Potential</span>
            <span className={cn('font-semibold whitespace-nowrap', TONE_TEXT[cpkTone])}>
              {TONE_GLYPH[cpkTone]} {cpkLabel}
            </span>
          </div>
          <div className="space-y-2.5">
            <div className="font-mono tabular-nums text-3xl font-bold tracking-tight text-foreground leading-none">
              {formatNum(stats.cpk, 3)}
            </div>
            <CapabilityGauge value={stats.cpk} tone={cpkTone} />
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums flex items-center justify-between">
            <span>Cp {formatNum(stats.cp, 3)}</span>
            <span>σ Within {formatNum(stats.stdDevWithin, 4)}</span>
          </div>
        </Card>

        <Card padding="none" className="p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Ppk · Prestanda</span>
            <span className={cn('font-semibold whitespace-nowrap', TONE_TEXT[ppkTone])}>
              {TONE_GLYPH[ppkTone]} {ppkLabel}
            </span>
          </div>
          <div className="space-y-2.5">
            <div className="font-mono tabular-nums text-3xl font-bold tracking-tight text-foreground leading-none">
              {formatNum(stats.ppk, 3)}
            </div>
            <CapabilityGauge value={stats.ppk} tone={ppkTone} />
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            {stats.isNormal === false && nonNormalPpk !== null && nonNormalPpk !== undefined ? (
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                ISO 22514 Ppk: {formatNum(nonNormalPpk, 3)} (rek. vid skev data)
              </span>
            ) : (
              <div className="flex items-center justify-between">
                <span>Pp {formatNum(stats.pp, 3)}</span>
                <span>σ Overall {formatNum(stats.stdDev, 4)}</span>
              </div>
            )}
          </div>
        </Card>

        <Card padding="none" className="p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Normalitetstest</span>
            <span className={cn('font-semibold whitespace-nowrap', TONE_TEXT[normTone])}>
              {TONE_GLYPH[normTone]}{' '}
              {stats.isNormal === null ? 'Ej bedömd' : stats.isNormal ? 'OK (α = 0.05)' : 'Avvikande'}
            </span>
          </div>
          <div className="text-[28px] font-bold tracking-tight text-foreground leading-none py-1">
            {normValue}
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums truncate" title={normSub}>
            {normSub}
          </div>
        </Card>

        <Card padding="none" className="p-4 sm:p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Processkontroll (I-MR)</span>
            <span className={cn('font-semibold whitespace-nowrap', TONE_TEXT[controlTone])}>
              {TONE_GLYPH[controlTone]}{' '}
              {criticalCount > 0 ? 'Kritisk' : anomalies.length > 0 ? 'Observera' : 'I kontroll'}
            </span>
          </div>
          <div className="text-[28px] font-bold tracking-tight text-foreground leading-none py-1">
            {controlValue}
          </div>
          <div className="text-xs text-muted-foreground font-mono tabular-nums truncate" title={controlSub}>
            {controlSub}
          </div>
        </Card>
      </div>

      {/* Precision Secondary Metrology Strip (Flat, hairline-divided) */}
      <Card padding="none" className="bg-card">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 lg:divide-x divide-border">
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground">Medel / Median</p>
            <p className="font-mono tabular-nums text-[13px] font-semibold text-foreground mt-1">
              {formatNum(stats.mean, 3)} <span className="text-muted-foreground font-normal">/</span>{' '}
              {formatNum(stats.median, 3)}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground">Min / Max</p>
            <p className="font-mono tabular-nums text-[13px] font-semibold text-foreground mt-1">
              {formatNum(stats.min, 3)} <span className="text-muted-foreground font-normal">/</span>{' '}
              {formatNum(stats.max, 3)}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground">Kontrollgränser (3σ)</p>
            <p className="font-mono tabular-nums text-[13px] font-semibold text-foreground mt-1">
              {formatNum(stats.lcl, 3)} <span className="text-muted-foreground font-normal">–</span>{' '}
              {formatNum(stats.ucl, 3)}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground">MR-bar / UCL_MR</p>
            <p className="font-mono tabular-nums text-[13px] font-semibold text-foreground mt-1">
              {formatNum(stats.mrBar, 3)} <span className="text-muted-foreground font-normal">/</span>{' '}
              {formatNum(stats.uclMr, 3)}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground">Skevhet / Toppighet</p>
            <p className="font-mono tabular-nums text-[13px] font-semibold text-foreground mt-1">
              {formatNum(stats.skewness, 2)} <span className="text-muted-foreground font-normal">/</span>{' '}
              {formatNum(stats.kurtosis, 2)}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground">PPM (Obs / Förv)</p>
            <p className="font-mono tabular-nums text-[13px] font-semibold text-foreground mt-1">
              {Math.round(stats.ppmObserved).toLocaleString('sv-SE')}{' '}
              <span className="text-muted-foreground font-normal">/</span>{' '}
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
