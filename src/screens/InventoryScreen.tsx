import { useState } from 'react';
import type { Theme } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Medicine } from '../data/types';
import { I } from '../icons';
import TopBar from '../components/TopBar';
import IconBtn from '../components/IconBtn';
import SectionList from '../components/SectionList';
import Badge from '../components/Badge';
import EmptyState from '../components/EmptyState';
import PillGlyph from '../components/PillGlyph';
import Btn from '../components/Btn';

interface Props {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  meds: Medicine[];
  onOpenMed: (id: string) => void;
  onAdd: () => void;
  onShowStockAlert: (med: Medicine) => void;
}

function InventoryRow({ theme, t, med, onOpen, warn }: {
  theme: Theme;
  t: (key: string) => string;
  med: Medicine;
  onOpen: () => void;
  warn?: boolean;
}) {
  const dosesPerDay = med.schedule.times.length;
  const daysLeft = Math.floor(med.stock / dosesPerDay);
  const expSoon = new Date(med.expiry).getTime() - Date.now() < 90 * 24 * 60 * 60 * 1000;

  return (
    <div onClick={onOpen} style={{
      background: theme.surface, borderRadius: 18,
      border: `1px solid ${theme.border}`,
      padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
    }}>
      <PillGlyph color={med.color} size={48} form={med.form} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: theme.text, letterSpacing: -0.2 }}>
            {med.name}
          </div>
          {warn && <Badge theme={theme} kind="warn">{t('lowStock')}</Badge>}
          {expSoon && !warn && <Badge theme={theme} kind="warn">{t('expSoon')}</Badge>}
        </div>
        <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2 }}>
          {med.dose} Â· {med.schedule.times.length}Ã— / dÃ­a
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: 18, fontWeight: 700,
          color: warn ? theme.warn : theme.text,
          fontVariantNumeric: 'tabular-nums', letterSpacing: -0.3,
        }}>
          {med.stock}
        </div>
        <div style={{ fontSize: 11.5, color: theme.textDim, marginTop: 1 }}>
          {t('enoughFor')} {daysLeft}d
        </div>
      </div>
      <span style={{ color: theme.textSoft }}>{I.chev(16, theme.textSoft)}</span>
    </div>
  );
}

export default function InventoryScreen({ theme, t, meds, onOpenMed, onAdd, onShowStockAlert }: Props) {
  const [q, setQ] = useState('');

  if (!meds || meds.length === 0) {
    return (
      <div style={{ paddingTop: 8, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TopBar theme={theme} title={t('inventoryTitle')}
          right={<IconBtn theme={theme} onClick={onAdd}>{I.plus(22, theme.text)}</IconBtn>}
        />
        <EmptyState
          theme={theme}
          icon={I.box(56, theme.accent)}
          title={t('emptyInvTitle')}
          message={t('emptyInvMsg')}
          primary={{ label: t('emptyInvCta'), icon: I.plus(18, theme.accentText), onClick: onAdd }}
        />
      </div>
    );
  }

  const filtered = meds.filter(m => m.name.toLowerCase().includes(q.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => a.stock - b.stock);
  const lowStock = sorted.filter(m => m.stock <= 6);
  const normalStock = sorted.filter(m => m.stock > 6);

  return (
    <div style={{ paddingTop: 8, paddingBottom: 120 }}>
      <TopBar theme={theme} title={t('inventoryTitle')}
        right={<IconBtn theme={theme} onClick={onAdd}>{I.plus(22, theme.text)}</IconBtn>}
      />

      {/* Search */}
      <div style={{ padding: '0 16px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: theme.surface, border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: '0 14px', height: 48,
        }}>
          <span style={{ color: theme.textDim }}>{I.search(20, theme.textDim)}</span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            style={{
              flex: 1, border: 0, background: 'transparent', color: theme.text,
              fontSize: 15, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>
      </div>

      {/* No search results */}
      {q.trim() && sorted.length === 0 && (
        <div style={{ padding: '20px 28px 40px', textAlign: 'center' }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: theme.surface2, color: theme.textDim,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '12px auto 16px',
          }}>
            {I.search(36, theme.textDim)}
          </div>
          <div style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontSize: 22, fontWeight: 500, letterSpacing: -0.4,
            color: theme.text, marginBottom: 6, lineHeight: 1.2,
          }}>
            {t('emptySearchTitle')}
          </div>
          <div style={{ fontSize: 14, color: theme.textDim, marginBottom: 18 }}>
            {t('emptySearchMsg')}
          </div>
          <Btn theme={theme} kind="primary" size="md" onClick={onAdd}>
            {I.plus(16, theme.accentText)} {t('emptySearchCta').replace('{q}', q.trim())}
          </Btn>
        </div>
      )}

      {/* Low stock section */}
      {lowStock.length > 0 && (
        <SectionList theme={theme} title={t('lowStock')}>
          {lowStock.map(m => (
            <InventoryRow
              key={m.id} theme={theme} t={t} med={m}
              onOpen={() => onShowStockAlert(m)} warn
            />
          ))}
        </SectionList>
      )}

      {/* Normal inventory */}
      {normalStock.length > 0 && (
        <SectionList theme={theme} title={t('inventoryTitle')}>
          {normalStock.map(m => (
            <InventoryRow key={m.id} theme={theme} t={t} med={m} onOpen={() => onOpenMed(m.id)} />
          ))}
        </SectionList>
      )}
    </div>
  );
}
