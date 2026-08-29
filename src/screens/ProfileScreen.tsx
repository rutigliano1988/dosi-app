import { useState } from 'react';
import type { Theme, ThemeName } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { CaregiverRow } from '../data/types';
import { I } from '../icons';
import TopBar from '../components/TopBar';
import Card from '../components/Card';

interface Props {
  theme: Theme;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: Lang;
  themeName: ThemeName;
  userName: string;
  account: { userId: string | null; email: string | null; isAnonymous: boolean };
  onUserNameChange: (name: string) => void;
  onThemeChange: (t: ThemeName) => void;
  onLangChange: (l: Lang) => void;
  onLinkAccount: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onResetData: () => void;
  pushState: 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied';
  onEnablePush: () => void;
  onDisablePush: () => void;
  caregiver: CaregiverRow | null;
  caredForCount: number;
  onAddCaregiver: () => void;
  onManageCaregiver: () => void;
  onRemoveCaregiver: () => void;
  onBecomeCaregiver: () => void;
  onOpenCaredFor: () => void;
  pendingSync?: number;
  onFlushSync?: () => void;
}

function SectionTitle({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, color: theme.textDim, fontWeight: 700, letterSpacing: 0.6,
      textTransform: 'uppercase', padding: '0 4px 8px',
    }}>
      {children}
    </div>
  );
}

function Row({
  theme, icon, label, value, onPress, danger, first,
}: {
  theme: Theme;
  icon: (s?: number, c?: string) => React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  first?: boolean;
}) {
  const color = danger ? theme.danger : theme.text;
  return (
    <div
      onClick={onPress}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px',
        borderTop: first ? 'none' : `1px solid ${theme.border}`,
        cursor: onPress ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: theme.surface2, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon(18, color)}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 15, color, fontWeight: 500 }}>
        {label}
      </div>
      {value != null && (
        <div style={{ fontSize: 13.5, color: theme.textDim, fontWeight: 500 }}>{value}</div>
      )}
      {onPress && <span style={{ color: theme.textSoft }}>{I.chev(14, theme.textSoft)}</span>}
    </div>
  );
}

export default function ProfileScreen({
  theme, t, lang, themeName, userName, account,
  onUserNameChange, onThemeChange, onLangChange,
  onLinkAccount, onSignIn, onSignOut, onResetData,
  pushState, onEnablePush, onDisablePush,
  caregiver, caredForCount,
  onAddCaregiver, onManageCaregiver, onRemoveCaregiver, onBecomeCaregiver, onOpenCaredFor,
  pendingSync = 0, onFlushSync,
}: Props) {
  const isDark = themeName === 'dark';
  const themeLabel = isDark
    ? (lang === 'es' ? 'Oscuro' : 'Dark')
    : (lang === 'es' ? 'Claro' : 'Light');
  const langLabel = lang === 'es' ? 'Español' : 'English';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(userName);

  const initial = userName.trim() ? userName.trim().charAt(0).toUpperCase() : '';

  const inputStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, height: 44,
    background: theme.surface, color: theme.text,
    border: `1px solid ${theme.borderStrong}`, borderRadius: 12,
    padding: '0 14px', fontSize: 16, fontWeight: 600,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };

  const commitName = () => {
    onUserNameChange(draft.trim());
    setEditing(false);
  };

  return (
    <div style={{ paddingTop: 8, paddingBottom: 120 }}>
      <TopBar theme={theme} title={t('profileTitle')} />

      {/* User card */}
      <div style={{ padding: '0 16px 16px' }}>
        <Card theme={theme} style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
            background: theme.accentSoft, color: theme.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 30, fontWeight: 500,
          }}>
            {initial || I.user(30, theme.accent)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitName(); }}
                  placeholder={t('namePlaceholderShort')}
                  style={inputStyle}
                />
                <button
                  onClick={commitName}
                  aria-label={t('editName')}
                  style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: theme.accent, border: 0, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {I.check(18, theme.accentText)}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700,
                  color: theme.text, letterSpacing: -0.3,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {userName.trim() || t('namePlaceholderShort')}
                </div>
                <button
                  onClick={() => { setDraft(userName); setEditing(true); }}
                  aria-label={t('editName')}
                  style={{
                    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                    background: theme.surface2, border: `1px solid ${theme.border}`,
                    color: theme.text, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {I.edit(18, theme.text)}
                </button>
              </div>
            )}
            <div style={{ fontSize: 13, color: theme.textDim, marginTop: 4 }}>
              {account.email ?? t('accountAnon')}
            </div>
          </div>
        </Card>
      </div>

      {/* Persistence warning */}
      {!account.email && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{
            background: theme.warnSoft, color: theme.warn,
            fontSize: 12.5, lineHeight: 1.45, fontWeight: 500,
            borderRadius: 14, padding: '12px 14px',
          }}>
            {t('persistWarning')}
          </div>
        </div>
      )}

      {/* Account */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle theme={theme}>{t('accountSection')}</SectionTitle>
        <Card theme={theme} style={{ overflow: 'hidden' }}>
          {!account.email ? (
            <>
              <Row theme={theme} icon={I.user} label={t('accountSaveCta')} onPress={onLinkAccount} first />
              <Row theme={theme} icon={I.share} label={t('accountSignInCta')} onPress={onSignIn} />
            </>
          ) : (
            <>
              <Row theme={theme} icon={I.user} label={account.email} first />
              <Row theme={theme} icon={I.back} label={t('accountSignOut')} onPress={onSignOut} danger />
            </>
          )}
          {pendingSync > 0 && (
            <Row
              theme={theme}
              icon={I.alert}
              label={t('syncPendingRow', { n: pendingSync })}
              onPress={onFlushSync}
            />
          )}
        </Card>
      </div>

      {/* Reminders */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle theme={theme}>{t('pushSection')}</SectionTitle>
        <Card theme={theme} style={{ overflow: 'hidden' }}>
          {pushState === 'granted' ? (
            <Row theme={theme} icon={I.bell} label={t('pushRowOn')} onPress={onDisablePush} first />
          ) : pushState === 'default' ? (
            <Row theme={theme} icon={I.bell} label={t('pushRowOff')} onPress={onEnablePush} first />
          ) : pushState === 'needs-install' ? (
            <Row theme={theme} icon={I.bell} label={t('pushRowNeedsInstall')} first />
          ) : pushState === 'denied' ? (
            <Row theme={theme} icon={I.bell} label={t('pushRowDenied')} first />
          ) : (
            <Row theme={theme} icon={I.bell} label={t('pushRowUnsupported')} first />
          )}
        </Card>
      </div>

      {/* Caregiver */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle theme={theme}>{t('cgSection')}</SectionTitle>
        <Card theme={theme} style={{ overflow: 'hidden' }}>
          {(() => {
            const cg = caregiver;
            const pending = cg && !cg.caregiverUserId && cg.pairCode;
            const expired = pending && cg.pairCodeExpiresAt != null && Date.parse(cg.pairCodeExpiresAt) <= Date.now();
            const hours = pending && cg.pairCodeExpiresAt
              ? Math.max(0, Math.ceil((Date.parse(cg.pairCodeExpiresAt) - Date.now()) / 3_600_000))
              : 0;
            if (!cg) return <Row theme={theme} icon={I.heart} label={t('cgAddRow')} onPress={onAddCaregiver} first />;
            if (cg.caregiverUserId) return <Row theme={theme} icon={I.heart} label={t('cgActiveRow', { name: cg.name || '—' })} onPress={onRemoveCaregiver} first />;
            if (expired) return <Row theme={theme} icon={I.heart} label={t('cgExpiredRow')} onPress={onManageCaregiver} first />;
            return <Row theme={theme} icon={I.heart} label={t('cgPendingRow', { code: cg.pairCode || '', h: hours })} onPress={onManageCaregiver} first />;
          })()}
          <Row theme={theme} icon={I.share} label={t('cgBecomeRow')} onPress={onBecomeCaregiver} />
          {caredForCount > 0 && (
            <Row theme={theme} icon={I.user} label={t('cgCaredForRow', { n: caredForCount })} onPress={onOpenCaredFor} />
          )}
        </Card>
      </div>

      {/* Accessibility */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle theme={theme}>{t('accessibility')}</SectionTitle>
        <Card theme={theme} style={{ overflow: 'hidden' }}>
          <Row
            theme={theme}
            icon={isDark ? I.moon : I.sun}
            label={t('theme')}
            value={themeLabel}
            onPress={() => onThemeChange(isDark ? 'light' : 'dark')}
            first
          />
          <Row
            theme={theme}
            icon={I.globe}
            label={t('language')}
            value={langLabel}
            onPress={() => onLangChange(lang === 'es' ? 'en' : 'es')}
          />
        </Card>
      </div>

      {/* General */}
      <div style={{ padding: '0 16px 16px' }}>
        <SectionTitle theme={theme}>General</SectionTitle>
        <Card theme={theme} style={{ overflow: 'hidden' }}>
          <Row theme={theme} icon={I.user} label={t('aboutDosi')} value={t('aboutVersion')} first />
          <Row
            theme={theme}
            icon={I.share}
            label={t('privacyLink')}
            onPress={() => window.open('/privacy.html', '_blank')}
          />
        </Card>
      </div>

      {/* Danger zone */}
      <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <button onClick={onResetData} style={{
          background: 'transparent', border: `1px solid ${theme.border}`,
          color: theme.danger, padding: '10px 16px', borderRadius: 999,
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          {I.trash(14, theme.danger)} {t('resetData')}
        </button>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
