import { useState } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import { I } from '../icons';
import Btn from '../components/Btn';
import PillGlyph from '../components/PillGlyph';
import ProgressRing from '../components/ProgressRing';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  onDone: (name: string) => void;
}

function ArtBell({ theme }: { theme: Theme }) {
  return (
    <div style={{ position: 'relative', width: 220, height: 220 }}>
      <div style={{ position: 'absolute', inset: 30, borderRadius: '50%', background: theme.accentSoft }} />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: theme.accent,
      }}>
        {I.bell(100, theme.accent)}
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute', borderRadius: '50%',
          inset: -8 + i * 14,
          border: `1.5px solid ${theme.accent}`,
          opacity: 0.18 - i * 0.05,
        }} />
      ))}
    </div>
  );
}

function ArtBox({ theme }: { theme: Theme }) {
  return (
    <div style={{ width: 220, height: 220, position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 30, borderRadius: 32, background: theme.surface,
        border: `1px solid ${theme.border}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 18,
      }}>
        {(['coral', 'sage', 'ocean', 'amber'] as const).map(c => (
          <div key={c} style={{
            borderRadius: 14, background: theme.surface2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PillGlyph color={c} size={40} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ArtProgress({ theme }: { theme: Theme }) {
  return (
    <div style={{ width: 220, height: 220, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', background: theme.accentSoft }} />
      <ProgressRing theme={theme} value={0.72} size={128} />
    </div>
  );
}

export default function OnboardingScreen({ theme, t, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');

  const slides = [
    { title: t('ob1Title'), sub: t('ob1Sub'), art: 'bell' as const },
    { title: t('ob2Title'), sub: t('ob2Sub'), art: 'box' as const },
    { title: t('ob3Title'), sub: t('ob3Sub'), art: 'progress' as const },
  ];

  const totalSteps = slides.length + 1;
  const isNameStep = step === slides.length;
  const isLast = step === totalSteps - 1;

  const art = () => {
    const a = slides[step].art;
    if (a === 'bell') return <ArtBell theme={theme} />;
    if (a === 'box') return <ArtBox theme={theme} />;
    return <ArtProgress theme={theme} />;
  };

  const title = isNameStep ? t('ob4Title') : slides[step].title;
  const sub = isNameStep ? t('ob4Sub') : slides[step].sub;

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 52,
    background: theme.surface, color: theme.text,
    border: `1px solid ${theme.borderStrong}`, borderRadius: 14,
    padding: '0 16px', fontSize: 16, fontWeight: 500,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: theme.bg, color: theme.text, padding: '60px 28px 32px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {!isLast && (
          <button onClick={() => onDone('')} style={{
            background: 'transparent', border: 0, color: theme.textDim,
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {t('skip')}
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
        {!isNameStep && <div style={{ display: 'flex', justifyContent: 'center' }}>{art()}</div>}
        <div>
          <div style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: -0.8,
            color: theme.text, marginBottom: 12,
          }}>
            {title}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: theme.textDim }}>{sub}</div>
        </div>
        {isNameStep && (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('ob4Placeholder')}
            style={inputStyle}
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{
              width: i === step ? 22 : 8, height: 8, borderRadius: 4,
              background: i === step ? theme.accent : theme.borderStrong,
              transition: 'width .25s, background .2s',
            }} />
          ))}
        </div>
        <Btn theme={theme} kind="primary" size="md" onClick={() => isLast ? onDone(name.trim()) : setStep(step + 1)}>
          {isLast ? t('obStart') : t('next')}
          <span style={{ marginLeft: 2 }}>{I.chev(16, theme.accentText)}</span>
        </Btn>
      </div>
    </div>
  );
}
