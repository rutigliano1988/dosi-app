import { useState } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import { I } from '../icons';
import Btn from '../components/Btn';
import PillGlyph from '../components/PillGlyph';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  onDone: () => void;
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

function ArtHeart({ theme }: { theme: Theme }) {
  return (
    <div style={{ width: 220, height: 220, position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 30, borderRadius: '50%',
        background: theme.successSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {I.heart(100, theme.success, true)}
      </div>
      <div style={{
        position: 'absolute', top: 14, right: 14, width: 56, height: 56, borderRadius: 16,
        background: theme.surface, border: `1px solid ${theme.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: theme.text, fontSize: 18, fontWeight: 700,
      }}>M</div>
      <div style={{
        position: 'absolute', bottom: 18, left: 22, width: 48, height: 48, borderRadius: 14,
        background: theme.surface, border: `1px solid ${theme.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: theme.text, fontSize: 16, fontWeight: 700,
      }}>J</div>
    </div>
  );
}

export default function OnboardingScreen({ theme, t, onDone }: Props) {
  const [step, setStep] = useState(0);

  const slides = [
    { title: t('ob1Title'), sub: t('ob1Sub'), art: 'bell' as const },
    { title: t('ob2Title'), sub: t('ob2Sub'), art: 'box' as const },
    { title: t('ob3Title'), sub: t('ob3Sub'), art: 'heart' as const },
  ];

  const s = slides[step];
  const isLast = step === slides.length - 1;

  const art = () => {
    if (s.art === 'bell') return <ArtBell theme={theme} />;
    if (s.art === 'box') return <ArtBox theme={theme} />;
    return <ArtHeart theme={theme} />;
  };

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: theme.bg, color: theme.text, padding: '60px 28px 32px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {!isLast && (
          <button onClick={onDone} style={{
            background: 'transparent', border: 0, color: theme.textDim,
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {t('skip')}
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>{art()}</div>
        <div>
          <div style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontSize: 38, fontWeight: 500, lineHeight: 1.05, letterSpacing: -0.8,
            color: theme.text, marginBottom: 12,
          }}>
            {s.title}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: theme.textDim }}>{s.sub}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 22 : 8, height: 8, borderRadius: 4,
              background: i === step ? theme.accent : theme.borderStrong,
              transition: 'width .25s, background .2s',
            }} />
          ))}
        </div>
        <Btn theme={theme} kind="primary" size="md" onClick={() => isLast ? onDone() : setStep(step + 1)}>
          {isLast ? t('start') : t('next')}
          <span style={{ marginLeft: 2 }}>{I.chev(16, theme.accentText)}</span>
        </Btn>
      </div>
    </div>
  );
}
