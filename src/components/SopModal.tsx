import React from 'react';
import { X, BookOpen } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface SopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SopModal({ isOpen, onClose }: SopModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <Card
        padding="none"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Metodguide &amp; SOP (SPC)
              </h2>
              <p className="text-xs text-muted-foreground">
                Statistiska definitioner och arbetsflöde för offline Excel/CSV-analys
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng metodguide">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">1. Import av Excel &amp; CSV</h3>
            <p>
              Importera filer (.xlsx, .xls, .csv) eller klistra in tabeller direkt från Excel.
              Systemet tolkar svenska decimalkomman, Excel-datumserienummer och låter dig välja
              valfria numeriska kolumner utan att lägga till syntetiska data.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              2. I-MR kontrollgrafer &amp; Kapabilitet (Cp/Cpk vs Pp/Ppk)
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">I-Chart &amp; MR-Chart:</strong> Verifiera
                alltid först att Moving Range-grafen (MR) ligger under UCL_MR (D₄ = 3.267 · MR-bar)
                innan Cp/Cpk tolkas.
              </li>
              <li>
                <strong className="text-foreground">Cp / Cpk (Potential):</strong> Beräknas med
                kortsiktig spridning σ Within = MR-bar / 1.128 (Shewhart-metoden).
              </li>
              <li>
                <strong className="text-foreground">Pp / Ppk (Prestanda):</strong> Beräknas med
                total standardavvikelse (σ Overall) över hela datasetet. En stor skillnad mellan Cpk
                och Ppk indikerar drift eller skift över tid.
              </li>
              <li>
                <strong className="text-foreground">PPM / DPMO:</strong> Visar både faktiskt
                observerad andel utanför spec och teoretiskt förväntad PPM enligt normalfördelning.
              </li>
              <li>
                <strong className="text-foreground">SPC-Stagning (Stages):</strong> Dela upp I-MR-grafen
                i separata faser med egna kontrollgränser (UCL/CL/LCL och UCL_MR) — antingen{' '}
                <strong className="text-foreground">Automatiskt</strong> (skiftdetektering via Welch
                t-test), <strong className="text-foreground">Manuellt</strong> vid valfria radnummer
                eller <strong className="text-foreground">Per grupp</strong> (t.ex. Skift / Maskin).
              </li>
              <li>
                <strong className="text-foreground">Exkludera Special Cause-punkter:</strong> Klicka
                direkt på en mätpunkt i I-grafen eller välj <strong className="text-foreground">Exkludera</strong>{' '}
                under Data &amp; Export och ange en verifierad rotorsak (IATF 16949). Exkluderade
                punkter tas bort ur kontrollgränser och Cpk/Ppk, visas som grå ×-markeringar i
                grafen, sparas i spårbarhetsloggen och inkluderas i Excel/CSV-exporten.
              </li>
            </ul>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              3. Normalitetstest (D&apos;Agostino-Pearson K²)
            </h3>
            <p>
              Appen använder D&apos;Agostino-Pearsons omnibustest som väger samman både skevhet
              (skewness) och toppighet/svansar (kurtosis) för serier med minst 8 mätpunkter. Om
              p &lt; 0.05 avviker datan från normalfördelning och parametriska index (Cpk/Ppk,
              förväntad PPM) bör tolkas med försiktighet.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              4. Nelson / Western Electric-regler (T1–T8)
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>T1: En punkt utanför ±3σ (UCL / LCL)</li>
              <li>T2: 9 punkter i rad på samma sida om medelvärdet</li>
              <li>T3: 6 punkter i rad som stadigt ökar eller minskar</li>
              <li>T4: 14 punkter i rad som alternerar upp och ner</li>
              <li>T5: 2 av 3 punkter utanför ±2σ på samma sida</li>
              <li>T6: 4 av 5 punkter utanför ±1σ på samma sida</li>
              <li>T7: 15 punkter i rad inom ±1σ (stratifiering)</li>
              <li>T8: 8 punkter i rad utanför ±1σ (mixture-mönster)</li>
            </ul>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">5. Export &amp; AI-analys</h3>
            <p>
              Under fliken <strong className="text-foreground">Data &amp; Export</strong> kan du
              filtrera ut rader utanför spec eller med Nelson-avvikelser och exportera en komplett
              Excel-fil med både nyckeltalsblad och sanerad mätdata. AI-analysen körs på servern
              och skickar hela datasetets statistiska profil för rotorsaksbedömning.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              6. Statistisk Autopilot, Artikelmallar &amp; Sixpack (PPAP)
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-foreground">Multi-kolumns Triage:</strong> Skannar och
                rangordnar samtliga mätkolumner samtidigt från mest kritisk till stabil.
              </li>
              <li>
                <strong className="text-foreground">Q-Q-plot &amp; ISO 22514-2:</strong> Beräknar
                automatiskt icke-normal percentil-Ppk (0.135% / 50% / 99.865%) när normalitetstestet
                varnar (p &lt; 0.05).
              </li>
              <li>
                <strong className="text-foreground">Korrelation &amp; Regression:</strong> Testar
                automatiskt linjärt samband (Pearson r, R², t-test) mellan aktiv variabel och övriga
                kolumner.
              </li>
              <li>
                <strong className="text-foreground">Före / Efter-test:</strong> Delar serien vid
                valfri brytpunkt och kör Welch 2-sample t-test (medel) samt F-test (spridning).
              </li>
              <li>
                <strong className="text-foreground">One-Way ANOVA &amp; Boxplot:</strong> Jämför
                automatiskt skift, maskiner, operatörer eller batcher när textkolumner (2–20 grupper)
                finns i filen.
              </li>
              <li>
                <strong className="text-foreground">Artikelmallar &amp; Sixpack:</strong> Spara
                återkommande artiklars toleranser lokalt och skriv ut en 1-sides PPAP Capability
                Sixpack med ett klick.
              </li>
            </ul>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              7. Multipel Regression &amp; Modelloptimering (Flera X mot Y)
            </h3>
            <p>
              Under fliken <strong className="text-foreground">Regression</strong> modellerar du
              valfri resultatvariabel (Y) mot flera processfaktorer (X) samtidigt.{' '}
              <strong className="text-foreground">Hitta optimal modell</strong> söker igenom
              kombinationer av faktorer (och valfri kurvatur X²) för att maximera justerat R² /
              minimera AICc och rensa bort brusvariabler. Använd{' '}
              <strong className="text-foreground">Pareto-diagrammet</strong> för att se vilka
              faktorer som passerar signifikansgränsen (α = 0.05) och{' '}
              <strong className="text-foreground">Response Optimizer</strong> för att räkna ut
              optimala maskininställningar mot målvärde, min eller max.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">
              8. DOE — Försöksplanering (2² / 2³ / 2⁴⁻¹ / 2⁴)
            </h3>
            <p>
              Under fliken <strong className="text-foreground">DOE</strong> skapar du 2-nivåers
              faktorförsök (inklusive halvfraktion 2⁴⁻¹ Upplösning IV, replikat och centrumpunkter
              för kurvaturtest). Exportera den slumpade körplanen till Excel för verkstaden, mata
              in mätvärden och få automatiskt <strong className="text-foreground">Pareto-diagram</strong>{' '}
              (med exakt OLS t-test eller Lenths metod vid mättade försök),{' '}
              <strong className="text-foreground">Huvudeffektdiagram</strong>,{' '}
              <strong className="text-foreground">Samspelsdiagram</strong> och{' '}
              <strong className="text-foreground">DOE Optimizer</strong>.
            </p>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Stäng
          </Button>
        </div>
      </Card>
    </div>
  );
}
