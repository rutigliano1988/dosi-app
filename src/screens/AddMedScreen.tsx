import { useState } from 'react';
import type { Theme, PillColorKey } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine, MedForm, FreqKind } from '../data/types';
import { PILL_COLORS } from '../theme/tokens';
import { I } from '../icons';
import Btn from '../components/Btn';
import SegmentedRow from '../components/SegmentedRow';

interface FormData {
  name: string;
  dose: string;
  form: MedForm;
  color: PillColorKey;
  freq: FreqKind;
  times: string[];
  duration: string;
  days: number;
  stock: number;
  expiry: string;
  notes: string;
}

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  mode?: 'add' | 'edit';
  initialData?: Medicine | null;
  onCancel: () => void;
  onSave: (data: FormData) => void;
}

function Field({ theme, label, hint, children }: {
  theme: Theme; label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.textDim, marginBottom: 8 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 12, color: theme.textSoft, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function TextInput({ theme, value, onChange, placeholder, big }: {
  theme: Theme; value: string; onChange: (v: string) => void;
  placeholder?: string; big?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', height: big ? 58 : 50,
        background: theme.surface, color: theme.text,
        border: `1px solid ${theme.borderStrong}`, borderRadius: 14,
        padding: '0 16px', fontSize: big ? 18 : 15, fontWeight: 500,
        fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
      }}
    />
  );
}

function StepBasics({ theme, t, data, upd }: { theme: Theme; t: Props['t']; data: FormData; upd: (k: keyof FormData, v: unknown) => void }) {
  return (
    <div style={{ padding: '20px 24px 0' }}>
      <Field theme={theme} label={t('name')}>
        <TextInput theme={theme} value={data.name} onChange={v => upd('name', v)} placeholder={t('namePlaceholder')} big />
      </Field>
      <Field theme={theme} label={t('dose')}>
        <TextInput theme={theme} value={data.dose} onChange={v => upd('dose', v)} placeholder="500 mg" />
      </Field>
      <Field theme={theme} label={t('form')}>
        <SegmentedRow theme={theme} value={data.form} onChange={v => upd('form', v)} options={[
          { id: 'capsule', label: t('formCapsule') },
          { id: 'pill',    label: t('formPill') },
          { id: 'syrup',   label: t('formSyrup') },
          { id: 'drops',   label: t('formDrops') },
        ]} />
      </Field>
      <Field theme={theme} label={t('color')}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(Object.keys(PILL_COLORS) as PillColorKey[]).map(k => {
            const sel = data.color === k;
            const c = PILL_COLORS[k];
            return (
              <button key={k} onClick={() => upd('color', k)} style={{
                width: 44, height: 44, borderRadius: 14, border: 0,
                background: c.soft, cursor: 'pointer', position: 'relative',
                boxShadow: sel ? `0 0 0 3px ${theme.bg}, 0 0 0 5px ${c.dot}` : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: c.dot }} />
              </button>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

function StepSchedule({ theme, t, data, upd }: { theme: Theme; t: Props['t']; data: FormData; upd: (k: keyof FormData, v: unknown) => void }) {
  return (
    <div style={{ padding: '20px 24px 0' }}>
      <Field theme={theme} label={t('frequency')}>
        <SegmentedRow theme={theme} value={data.freq} onChange={v => upd('freq', v)} options={[
          { id: 'daily', label: t('everyDay') },
          { id: 'hours', label: t('everyXHours').replace('{x}', '8') },
          { id: 'days',  label: t('certainDays') },
        ]} />
      </Field>
      <Field theme={theme} label={t('times')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.times.map((time, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: theme.surface, border: `1px solid ${theme.borderStrong}`,
              borderRadius: 14, padding: '10px 14px',
            }}>
              <span style={{ color: theme.textDim }}>{I.clock(18, theme.textDim)}</span>
              <input
                value={time}
                onChange={e => upd('times', data.times.map((tt, j) => j === i ? e.target.value : tt))}
                style={{
                  flex: 1, border: 0, background: 'transparent', color: theme.text,
                  fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              {data.times.length > 1 && (
                <button
                  onClick={() => upd('times', data.times.filter((_, j) => j !== i))}
                  style={{ background: 'transparent', border: 0, color: theme.textSoft, cursor: 'pointer', display: 'flex' }}
                >
                  {I.close(18, theme.textSoft)}
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => upd('times', [...data.times, '14:00'])}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              height: 46, borderRadius: 14, border: `1.5px dashed ${theme.borderStrong}`,
              background: 'transparent', color: theme.accent, cursor: 'pointer',
              fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
            }}
          >
            {I.plus(18, theme.accent)} {t('addTime')}
          </button>
        </div>
      </Field>
      <Field theme={theme} label={t('duration')}>
        <SegmentedRow theme={theme} value={data.duration} onChange={v => upd('duration', v)} options={[
          { id: 'ongoing', label: t('ongoing') },
          { id: 'forDays', label: t('forDays').replace('{n}', String(data.days)) },
          { id: 'until',   label: t('untilDate') },
        ]} />
      </Field>
    </div>
  );
}

function StepStock({ theme, t, data, upd }: { theme: Theme; t: Props['t']; data: FormData; upd: (k: keyof FormData, v: unknown) => void }) {
  return (
    <div style={{ padding: '20px 24px 0' }}>
      <Field theme={theme} label={t('stockNow')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => upd('stock', Math.max(0, data.stock - 1))} style={{
            width: 50, height: 50, borderRadius: 14, border: `1px solid ${theme.borderStrong}`,
            background: theme.surface, color: theme.text, fontSize: 22, fontWeight: 600, cursor: 'pointer',
          }}>âˆ’</button>
          <div style={{
            flex: 1, height: 50, borderRadius: 14, background: theme.surface,
            border: `1px solid ${theme.borderStrong}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums',
          }}>
            {data.stock}
          </div>
          <button onClick={() => upd('stock', data.stock + 1)} style={{
            width: 50, height: 50, borderRadius: 14, border: `1px solid ${theme.borderStrong}`,
            background: theme.surface, color: theme.text, fontSize: 22, fontWeight: 600, cursor: 'pointer',
          }}>+</button>
        </div>
      </Field>
      <Field theme={theme} label={t('expiryDate')}>
        <TextInput theme={theme} value={data.expiry} onChange={v => upd('expiry', v)} placeholder="YYYY-MM-DD" />
      </Field>
      <Field theme={theme} label={t('notes')} hint="Opcional.">
        <textarea
          value={data.notes}
          onChange={e => upd('notes', e.target.value)}
          placeholder={t('notesPlaceholder')}
          style={{
            width: '100%', minHeight: 96, padding: 14,
            background: theme.surface, color: theme.text,
            border: `1px solid ${theme.borderStrong}`, borderRadius: 14,
            fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5, outline: 'none',
            resize: 'none', boxSizing: 'border-box',
          }}
        />
      </Field>
    </div>
  );
}

export default function AddMedScreen({ theme, t, mode = 'add', initialData, onCancel, onSave }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<FormData>({
    name:     initialData?.name ?? '',
    dose:     initialData?.dose ?? '500 mg',
    form:     initialData?.form ?? 'capsule',
    color:    initialData?.color ?? 'coral',
    freq:     initialData?.schedule?.freq ?? 'daily',
    times:    initialData?.schedule?.times ?? ['08:00'],
    duration: initialData?.duration?.kind === 'days' ? 'forDays' : 'ongoing',
    days:     initialData?.duration?.days ?? 7,
    stock:    initialData?.stock ?? 30,
    expiry:   initialData?.expiry ?? '2027-01-15',
    notes:    initialData?.notes ?? '',
  });

  const upd = (k: keyof FormData, v: unknown) => setData(s => ({ ...s, [k]: v }));
  const STEPS = 3;

  const stepTitle = mode === 'edit' && step === 0 ? t('editMedTitle')
    : step === 0 ? t('addMedTitle')
    : step === 1 ? t('schedule')
    : t('stock');

  return (
    <div style={{ paddingTop: 8, paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '8px 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={step === 0 ? onCancel : () => setStep(step - 1)} style={{
          width: 42, height: 42, borderRadius: 14, background: theme.surface,
          border: `1px solid ${theme.border}`, color: theme.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          {step === 0 ? I.close(20, theme.text) : I.back(20, theme.text)}
        </button>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: theme.textDim,
          letterSpacing: 0.5, textTransform: 'uppercase',
        }}>
          {t('step')} {step + 1} {t('of')} {STEPS}
        </div>
        <div style={{ width: 42 }} />
      </div>

      {/* Progress bar */}
      <div style={{ padding: '0 16px 18px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? theme.accent : theme.surface2,
              transition: 'background .25s',
            }} />
          ))}
        </div>
      </div>

      <div style={{ padding: '0 24px 8px' }}>
        <div style={{
          fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 32,
          fontWeight: 500, letterSpacing: -0.6, color: theme.text, lineHeight: 1.1,
        }}>
          {stepTitle}
        </div>
      </div>

      {step === 0 && <StepBasics theme={theme} t={t} data={data} upd={upd} />}
      {step === 1 && <StepSchedule theme={theme} t={t} data={data} upd={upd} />}
      {step === 2 && <StepStock theme={theme} t={t} data={data} upd={upd} />}

      {/* Footer nav */}
      <div style={{
        position: 'fixed', left: 12, right: 12, bottom: 28,
        background: theme.surface, borderRadius: 22, padding: 10,
        border: `1px solid ${theme.border}`,
        boxShadow: '0 6px 30px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
        display: 'flex', gap: 8, zIndex: 30,
      }}>
        {step > 0 && (
          <Btn theme={theme} kind="secondary" size="md" onClick={() => setStep(step - 1)} style={{ flex: 1 }}>
            {t('back')}
          </Btn>
        )}
        <Btn
          theme={theme} kind="primary" size="md"
          onClick={() => step === STEPS - 1 ? onSave(data) : setStep(step + 1)}
          style={{ flex: 2 }}
        >
          {step === STEPS - 1 ? t('save') : t('next')}
        </Btn>
      </div>
    </div>
  );
}
