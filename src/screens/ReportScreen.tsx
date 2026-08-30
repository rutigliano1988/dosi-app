import { useMemo, useState } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine, Dose } from '../data/types';
import { isoDate } from '../lib/schedule';
import { buildReport, reportFileName } from '../lib/report';
import { I } from '../icons';
import Card from '../components/Card';
import SegmentedRow from '../components/SegmentedRow';
import Btn from '../components/Btn';

interface Props {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  meds: Medicine[];
  historyDoses: Dose[];
  userName: string;
  onBack: () => void;
}

export default function ReportScreen({ theme, t, lang, meds, historyDoses, userName, onBack }: Props) {
  const [days, setDays] = useState<'30' | '90'>('30');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const now = useMemo(() => new Date(), []);
  const data = useMemo(() => {
    const n = days === '30' ? 30 : 90;
    const from = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1)));
    return buildReport(meds, historyDoses, from, isoDate(now), now, userName || (lang === 'es' ? 'Paciente' : 'Patient'));
  }, [days, meds, historyDoses, now, userName, lang]);

  async function savePdf() {
    setBusy(true); setErr(false);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      renderPdf(doc, data, t);
      const blob = doc.output('blob');
      const file = new File([blob], reportFileName(data.userName, data.fromISO, data.toISO), { type: 'application/pdf' });
      // navigator.canShare / share con archivos (móvil/PWA); si no, descarga
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: t('reportShareTitle') });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (e) {
      console.error('[dosi] report pdf', e);
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  const pct = data.summary.rate === null ? '—' : Math.round(data.summary.rate * 100) + '%';

  return (
    <div style={{ padding: '8px 16px 120px' }}>
      <button onClick={onBack} style={{
        width: 42, height: 42, borderRadius: 14, background: theme.surface,
        border: `1px solid ${theme.border}`, color: theme.text, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {I.back(20, theme.text)}
      </button>

      <h1 style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 28, fontWeight: 500, color: theme.text, margin: '14px 0 4px' }}>
        {t('reportForDoctor')}
      </h1>

      <div style={{ margin: '12px 0' }}>
        <SegmentedRow theme={theme} value={days} onChange={(v) => setDays(v as '30' | '90')}
          options={[{ id: '30', label: t('reportPeriod30') }, { id: '90', label: t('reportPeriod90') }]} />
      </div>

      {/* Vista previa */}
      <Card theme={theme} style={{ padding: 18 }}>
        <div style={{ fontSize: 12.5, color: theme.textDim }}>
          {data.userName} · {data.fromISO} – {data.toISO}
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, color: theme.text, fontFamily: '"Instrument Serif", Georgia, serif', lineHeight: 1.1, marginTop: 6 }}>
          {pct}
        </div>
        <div style={{ fontSize: 13, color: theme.textDim }}>
          {t('reportSummaryLine', { taken: data.summary.taken, missed: data.summary.missed, skipped: data.summary.skipped, meds: data.activeMedCount })}
        </div>
      </Card>

      {data.medLines.length > 0 && (
        <Card theme={theme} style={{ padding: 18, marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            {t('reportMedTableHeading')}
          </div>
          {data.medLines.map((ml) => (
            <div key={ml.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${theme.border}`, fontSize: 13.5 }}>
              <span style={{ color: theme.text }}>{ml.name}</span>
              <span style={{ color: theme.textDim }}>
                {ml.taken}/{ml.taken + ml.missed} · {ml.rate === null ? '—' : Math.round(ml.rate * 100) + '%'}
              </span>
            </div>
          ))}
        </Card>
      )}

      <Card theme={theme} style={{ padding: 18, marginTop: 12 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
          {t('reportIncidentsHeading')}
        </div>
        {data.incidents.length === 0 ? (
          <div style={{ fontSize: 13.5, color: theme.textDim }}>{t('reportNoIncidents')}</div>
        ) : data.incidents.slice(0, 40).map((inc, i) => (
          <div key={i} style={{ fontSize: 13, color: theme.text, padding: '3px 0' }}>
            {inc.dateISO} {inc.time} · {inc.medName} · {inc.kind === 'missed' ? t('incidentMissed') : t('incidentSkipped')}
          </div>
        ))}
      </Card>

      {err && <div style={{ color: theme.danger, fontSize: 13, marginTop: 12 }}>{t('reportError')}</div>}

      <Btn theme={theme} kind="primary" size="md" style={{ width: '100%', marginTop: 16 }} onClick={savePdf} disabled={busy}>
        {busy ? t('reportGenerating') : t('reportSavePdf')}
      </Btn>
    </div>
  );
}

// ─── Dibujo del PDF ──────────────────────────────────────────────────────────
function renderPdf(
  doc: import('jspdf').jsPDF,
  data: import('../lib/report').ReportData,
  t: (k: string, v?: Record<string, string | number>) => string,
) {
  const M = 48;
  let y = 64;
  const line = (txt: string, size = 11, gap = 16) => { doc.setFontSize(size); doc.text(txt, M, y); y += gap; };

  doc.setFont('helvetica', 'bold'); line(`${t('reportTitle')} — ${data.userName}`, 16, 22);
  doc.setFont('helvetica', 'normal');
  line(`${data.fromISO}  –  ${data.toISO}`, 11, 14);
  line(t('reportGeneratedOn', { date: data.generatedISO }), 10, 22);

  const pct = data.summary.rate === null ? '—' : Math.round(data.summary.rate * 100) + '%';
  doc.setFont('helvetica', 'bold'); line(t('reportSummaryHeading'), 12, 16);
  doc.setFont('helvetica', 'normal');
  line(`${t('adherence')}: ${pct}`, 11, 14);
  line(t('reportSummaryLine', { taken: data.summary.taken, missed: data.summary.missed, skipped: data.summary.skipped, meds: data.activeMedCount }), 11, 22);

  if (data.medLines.length === 0) {
    line(t('reportNoData'), 11, 20);
  } else {
    doc.setFont('helvetica', 'bold'); line(t('reportMedTableHeading'), 12, 16);

    // ── Tabla por medicina, dibujada a mano con primitivas de jsPDF ──
    // Offsets de columna fijos sobre el ancho útil (M .. M+TABLE_W).
    const TABLE_W = 499;
    type Col = { x: number; w: number; align: 'left' | 'right'; head: string };
    const cols: Col[] = [
      { x: M,       w: 150, align: 'left',  head: t('reportColMed') },
      { x: M + 150, w: 145, align: 'left',  head: t('reportColSchedule') },
      { x: M + 295, w: 45,  align: 'right', head: t('reportColTaken') },
      { x: M + 345, w: 45,  align: 'right', head: t('reportColMissed') },
      { x: M + 395, w: 50,  align: 'right', head: t('reportColSkipped') },
      { x: M + 450, w: 49,  align: 'right', head: t('reportColRate') },
    ];
    const ROW_H = 15;
    const PAGE_LIMIT = 760;
    const CELL_FONT = 9.5;

    // Recorta un texto para que quepa en cellW (a la fuente actual), con elipsis.
    const clip = (txt: string, cellW: number): string => {
      if (doc.getTextWidth(txt) <= cellW) return txt;
      let s = txt;
      while (s.length > 1 && doc.getTextWidth(s + '…') > cellW) s = s.slice(0, -1);
      return s + '…';
    };

    const drawHeaderRow = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(CELL_FONT);
      for (const c of cols) {
        const tx = c.align === 'right' ? c.x + c.w : c.x;
        doc.text(c.head, tx, y, { align: c.align });
      }
      y += 5;
      doc.setLineWidth(0.5);
      doc.line(M, y, M + TABLE_W, y);
      y += ROW_H - 4;
      doc.setFont('helvetica', 'normal');
    };

    drawHeaderRow();

    for (const ml of data.medLines) {
      if (y > PAGE_LIMIT) {
        doc.addPage();
        y = 64;
        drawHeaderRow();
      }
      const rate = ml.rate === null ? '—' : Math.round(ml.rate * 100) + '%';
      const cells = [
        clip(ml.name, cols[0].w - 4),
        clip(ml.scheduleText, cols[1].w - 4),
        String(ml.taken),
        String(ml.missed),
        String(ml.skipped),
        rate,
      ];
      doc.setFontSize(CELL_FONT);
      cells.forEach((val, i) => {
        const c = cols[i];
        const tx = c.align === 'right' ? c.x + c.w : c.x;
        doc.text(val, tx, y, { align: c.align });
      });
      y += 4;
      doc.setLineWidth(0.2);
      doc.setDrawColor(210);
      doc.line(M, y, M + TABLE_W, y);
      doc.setDrawColor(0);
      y += ROW_H - 4;
    }
    y += 10;
    doc.setFontSize(11);
  }

  doc.setFont('helvetica', 'bold'); line(t('reportIncidentsHeading'), 12, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  if (data.incidents.length === 0) {
    line(t('reportNoIncidents'), 10, 16);
  } else {
    for (const inc of data.incidents) {
      const kind = inc.kind === 'missed' ? t('incidentMissed') : t('incidentSkipped');
      doc.text(`${inc.dateISO} ${inc.time} · ${inc.medName} · ${kind}`, M, y);
      y += 12;
      if (y > 780) { doc.addPage(); y = 64; }
    }
  }

  doc.setFontSize(8);
  doc.text(t('reportFooter'), M, 812, { maxWidth: 500 });
}
