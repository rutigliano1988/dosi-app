import { useEffect, useState, useCallback } from 'react';
import type { Theme, PillColorKey } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import { I } from '../icons';
import TopBar from '../components/TopBar';
import ConfirmDialog from '../components/ConfirmDialog';
import PillGlyph from '../components/PillGlyph';
import { rowToMed } from '../data/sync';
import type { Medicine } from '../data/types';
import {
  listPatients, patientToday, markDoseForPatient, nudgePatient, stopCaring,
  type PatientDose,
} from '../lib/caregiver';

interface CaregiverScreenProps {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  onBack: () => void;
  onEnablePush: () => void;
}

type Patient = { relationId: string; patientId: string; ownerName: string | null };
type Today = { ownerName: string | null; patientNowMin: number; meds: Medicine[]; doses: PatientDose[] };

function deriveStatus(d: PatientDose, nowMin: number): 'taken' | 'skipped' | 'missed' | 'pending' {
  if (d.status === 'taken') return 'taken';
  if (d.status === 'skipped') return 'skipped';
  if (d.caregiverAlertedAt != null || d.totalMin < nowMin - 60) return 'missed';
  return 'pending';
}

export default function CaregiverScreen({ theme, t, lang, onBack, onEnablePush }: CaregiverScreenProps) {
  void lang;
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [sel, setSel] = useState<Patient | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<'gone' | 'no-push' | 'network' | ''>('');
  const [sentFor, setSentFor] = useState<Set<string>>(new Set());
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    listPatients().then((ps) => {
      setPatients(ps);
      if (ps.length === 1) setSel(ps[0]);
    });
  }, []);

  const load = useCallback(async (p: Patient) => {
    setLoading(true); setErr('');
    const r = await patientToday(p.patientId);
    setLoading(false);
    if ('error' in r) {
      if (r.error === 'not-your-patient') {
        setErr('gone');
        setPatients((prev) => (prev ?? []).filter((x) => x.relationId !== p.relationId));
        setSel(null);
      } else setErr(r.error);
      return;
    }
    setToday({
      ownerName: r.ownerName,
      patientNowMin: r.patientNowMin,
      meds: r.medicines.map((m) => rowToMed(m)),
      doses: [...r.doses].sort((a, b) => a.totalMin - b.totalMin),
    });
  }, []);

  useEffect(() => { if (sel) load(sel); }, [sel, load]);

  const name = today?.ownerName || sel?.ownerName || '';

  // ── lista de pacientes (más de uno) ──
  if (!sel) {
    return (
      <div style={{ paddingTop: 8, paddingBottom: 120 }}>
        <TopBar theme={theme} title={t('cgPatientsTitle')} left={<BackBtn theme={theme} onBack={onBack} />} />
        {err === 'gone' && <Banner theme={theme} text={t('cgGone')} />}
        <div style={{ padding: '0 16px' }}>
          {(patients ?? []).map((p) => (
            <div key={p.relationId} onClick={() => setSel(p)} style={rowStyle(theme)}>
              <div style={{ flex: 1, fontWeight: 600 }}>{p.ownerName || '—'}</div>
              {I.chev(16, theme.textSoft)}
            </div>
          ))}
          {patients != null && patients.length === 0 && (
            <div style={{ color: theme.textDim, fontSize: 14, padding: '24px 4px', textAlign: 'center' }}>
              {t('cgGone')}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── "Hoy de X" ──
  return (
    <div style={{ paddingTop: 8, paddingBottom: 120 }}>
      <TopBar
        theme={theme}
        title={t('cgTodayTitle', { name })}
        left={<BackBtn theme={theme} onBack={() => { setSel(null); setToday(null); }} />}
        right={
          <button onClick={() => sel && load(sel)} aria-label={t('cgRefresh')} style={{
            width: 36, height: 36, borderRadius: 12, background: theme.surface2, border: 0,
            color: theme.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{I.clock(18, theme.text)}</button>
        }
      />

      {err === 'no-push' && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ background: theme.warnSoft, color: theme.warn, borderRadius: 14, padding: '12px 14px', fontSize: 13 }}>
            {t('cgNeedPush')}{' '}
            <button onClick={onEnablePush} style={{ background: 'transparent', border: 0, color: theme.accent, fontWeight: 700, cursor: 'pointer' }}>
              {t('cgActivate')}
            </button>
          </div>
        </div>
      )}
      {err === 'network' && <Banner theme={theme} text={t('cgErrNetwork')} />}

      {loading && !today && (
        <div style={{ color: theme.textDim, textAlign: 'center', padding: 32 }}>…</div>
      )}

      {today && today.doses.length === 0 && (
        <div style={{ color: theme.textDim, fontSize: 14, padding: '24px 16px', textAlign: 'center' }}>
          {t('cgNoDoses', { name })}
        </div>
      )}

      {today && today.doses.map((d) => {
        const med = today.meds.find((m) => m.id === d.medId);
        const st = deriveStatus(d, today.patientNowMin);
        const done = st === 'taken' || st === 'skipped';
        const stLabel = { taken: 'cgStTaken', skipped: 'cgStSkipped', missed: 'cgStMissed', pending: 'cgStPending' }[st];
        const stColor = { taken: theme.success, skipped: theme.textSoft, missed: theme.danger, pending: theme.textDim }[st];
        return (
          <div key={d.id} style={{ padding: '0 16px 10px' }}>
            <div style={{
              background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 18,
              padding: '12px 14px', opacity: done ? 0.6 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <PillGlyph color={(med?.color ?? 'coral') as PillColorKey} size={40} form={med?.form ?? 'pill'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{med?.name ?? '—'}</div>
                  <div style={{ fontSize: 12.5, color: theme.textDim }}>{med?.dose ?? ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{d.time}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: stColor, textTransform: 'uppercase' }}>{t(stLabel)}</div>
                </div>
              </div>
              {!done && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={async () => { if (sel) { await markDoseForPatient(sel.patientId, d.id); load(sel); } }}
                    style={actBtn(theme, true)}>
                    {I.check(15, theme.accentText)} {t('cgMarkForHer')}
                  </button>
                  <button
                    disabled={sentFor.has(d.id)}
                    onClick={async () => {
                      if (!sel) return;
                      const r = await nudgePatient(sel.patientId, d.id);
                      if (r === 'skipped') { load(sel); return; }
                      setSentFor((s) => new Set(s).add(d.id));
                      setTimeout(() => setSentFor((s) => { const n = new Set(s); n.delete(d.id); return n; }), 60_000);
                    }}
                    style={actBtn(theme, false)}>
                    {sentFor.has(d.id) ? t('cgReminded') : t('cgRemind')}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {today && (
        <div style={{ padding: '16px 24px', textAlign: 'center' }}>
          <button onClick={() => setConfirmStop(true)} style={{
            background: 'transparent', border: `1px solid ${theme.border}`, color: theme.danger,
            padding: '10px 16px', borderRadius: 999, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
          }}>{t('cgStop')}</button>
        </div>
      )}

      {confirmStop && sel && (
        <ConfirmDialog
          theme={theme}
          title={t('cgStopTitle', { name })}
          message={t('cgStopMsg')}
          confirmLabel={t('cgStop')}
          confirmIcon={I.trash(16, '#fff')}
          confirmKind="danger"
          onCancel={() => setConfirmStop(false)}
          onConfirm={async () => { await stopCaring(sel.relationId); setConfirmStop(false); onBack(); }}
        />
      )}
    </div>
  );
}

function BackBtn({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  return (
    <button onClick={onBack} style={{
      width: 36, height: 36, borderRadius: 12, background: theme.surface2, border: 0,
      color: theme.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{I.back(18, theme.text)}</button>
  );
}
function Banner({ theme, text }: { theme: Theme; text: string }) {
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ background: theme.warnSoft, color: theme.warn, borderRadius: 14, padding: '12px 14px', fontSize: 13 }}>{text}</div>
    </div>
  );
}
function rowStyle(theme: Theme): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 12, padding: '16px 14px',
    background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16,
    marginBottom: 10, cursor: 'pointer',
  };
}
function actBtn(theme: Theme, primary: boolean): React.CSSProperties {
  return {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 40, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    background: primary ? theme.accent : theme.surface2,
    color: primary ? theme.accentText : theme.text,
    border: primary ? 0 : `1px solid ${theme.borderStrong}`,
  };
}
