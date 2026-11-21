import React from 'react';
import Markdown from 'react-markdown';
import { Brain, Download, AlertCircle, RefreshCw } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface AiAnalysisViewProps {
  datasetName: string;
  selectedMetric: string;
  rowCount: number;
  aiAnalysis: string | null;
  analysisError: string | null;
  isAnalyzing: boolean;
  onRunAnalysis: () => void;
  onPrint: () => void;
}

export function AiAnalysisView({
  datasetName,
  selectedMetric,
  rowCount,
  aiAnalysis,
  analysisError,
  isAnalyzing,
  onRunAnalysis,
  onPrint,
}: AiAnalysisViewProps) {
  return (
    <section aria-label="AI-analys" className="max-w-4xl mx-auto space-y-6">
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">AI-produktionsanalys</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {datasetName} · {selectedMetric} ·{' '}
            <span className="font-mono tabular-nums">{rowCount} mätpunkter</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {aiAnalysis && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Download className="w-4 h-4" />
              Skriv ut / Spara PDF
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={onRunAnalysis}
            isLoading={isAnalyzing}
          >
            <Brain className="w-4 h-4" />
            {isAnalyzing ? 'Analyserar...' : aiAnalysis ? 'Kör ny analys' : 'Starta AI-analys'}
          </Button>
        </div>
      </div>

      <Card padding="none" className="card-print">
        <div className="p-6 sm:p-8">
          <div className="hidden print:block mb-6 border-b border-border pb-4">
            <h1 className="text-xl font-bold text-foreground">AI-produktionsanalys (SPC)</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {datasetName} · {selectedMetric} · {rowCount} mätpunkter ·{' '}
              {new Date().toLocaleDateString('sv-SE')}
            </p>
          </div>

          {analysisError && !isAnalyzing && (
            <div className="mb-6 p-4 rounded-lg border border-rose-500/30 bg-rose-500/5 flex items-start gap-3 text-sm text-rose-700 dark:text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Analysen kunde inte slutföras</p>
                <p className="text-xs">{analysisError}</p>
              </div>
            </div>
          )}

          {isAnalyzing ? (
            <div className="py-12 space-y-6">
              <div className="flex flex-col items-center text-center gap-3">
                <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    Kör trestegs SPC- och rotorsaksanalys på servern
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Utvärderar fullständig kapabilitetsprofil (I-MR, Cpk/Ppk, D&apos;Agostino-Pearson,
                    PPM och alla Nelson-regler) för {rowCount} rader...
                  </p>
                </div>
              </div>
              <div className="max-w-lg mx-auto space-y-2.5 pt-2">
                <div className="h-3.5 bg-muted rounded animate-pulse w-full" />
                <div className="h-3.5 bg-muted rounded animate-pulse w-5/6" />
                <div className="h-3.5 bg-muted rounded animate-pulse w-4/6" />
              </div>
            </div>
          ) : !aiAnalysis ? (
            <div className="py-14 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                <Brain className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-semibold text-foreground">
                  Ingen rapport genererad ännu
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  AI-analysen granskar hela datasetets nyckeltal, I-MR-stabilitet, normalitetstest
                  och samtliga Nelson-regelbrott och sammanställer en ingenjörsrapport på svenska.
                </p>
              </div>
              <Button variant="primary" size="md" onClick={onRunAnalysis}>
                <Brain className="w-4 h-4" />
                Starta AI-analys
              </Button>
            </div>
          ) : (
            <div className="prose max-w-none text-sm sm:text-base">
              <Markdown>{aiAnalysis}</Markdown>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
