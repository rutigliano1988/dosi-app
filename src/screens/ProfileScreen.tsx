import type { Theme, ThemeName } from '../theme/tokens';
import type { Lang } from '../i18n/strings';
import type { Caregiver } from '../data/types';
import { I } from '../icons';
import TopBar from '../components/TopBar';
import Card from '../components/Card';
import Btn from '../components/Btn';

interface Props {
  theme: Theme;
  t: (key: string) => string;
  lang: Lang;
  themeName: ThemeName;
  caregivers: Caregiver[];
  onThemeChange: (t: ThemeName) => void;
  onLangChange: (l: Lang) => void;
  onInviteCaregiver: () => void;
  onManageCaregiver: (cg: Caregiver) => void;
  onResetData: () => void;
  onLoadDemo: () => void;
}

function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22', color, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Instrument Serif", Georgia, serif',
      fontSize: size * 0.42, fontWeight: 500,
    }}>
      {name.charAt(0)}
    </div>
  );
}

function ToggleSwitch({ on, accentColor }: { on: boolean; accentColor: string }) {
  return (
    <div style={{
      width: 42, height: 24, borderRadius: 14, position: 'relative',
      background: on ? accentColor : 'rgba(28,24,18,0.14)', flexShrink: 0,
      transition: 'background .2s',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: on ? 20 : 2,
        width: 20, height: 20, borderRadius: 10, background: '#fff',
        transition: 'left .15s',
      }} />
    </div>
  );
}

export default function ProfileScreen({
  theme, t, lang, themeName, caregivers,
  onThemeChange, onLangChange,
  onInviteCaregiver, onManageCaregiver, onResetData, onLoadDemo,
}: Props) {
  const isDark = themeName === 'dark';
  const themeLabel = isDark
    ? (lang === 'es' ? 'Oscuro' : 'Dark')
    : (lang === 'es' ? 'Claro' : 'Light');
  const langLabel = lang === 'es' ? 'Español' : 'English';

  const settingsGroups = [
    {
      title: t('accessibility'),
      items: [
        {
          icon: I.sun,
          label: t('theme'),
          value: themeLabel,
          onPress: () => onThemeChange(isDark ? 'light' : 'dark'),
        },
        {
          icon: I.globe,
          label: t('language'),
          value: langLabel,
          onPress: () => onLangChange(lang === 'es' ? 'en' : 'es'),
        },
        {
          icon: I.edit,
          label: lang === 'es' ? 'Tamaño de texto' : 'Text size',
          value: lang === 'es' ? 'Mediano' : 'Medium',
        },
      ],
    },
    {
      title: t('notifications'),
      items: [
        { icon: I.bell, label: lang === 'es' ? 'Recordatorios' : 'Reminders', toggle: true, on: true },
        { icon: I.alert, label: lang === 'es' ? 'Alertas de stock' : 'Stock alerts', toggle: true, on: true },
        { icon: I.clock, label: lang === 'es' ? 'Posponer por defecto' : 'Default snooze', value: '10 min' },
      ],
    },
    {
      title: 'General',
      items: [
        { icon: I.share, label: t('healthSync'), value: lang === 'es' ? 'Conectado' : 'Connected' },
        { icon: I.user, label: t('aboutDosi'), value: 'v1.0' },
      ],
    },
  ];

  return (
    <div style={{ paddingTop: 8, paddingBottom: 120 }}>
      <TopBar theme={theme} title={t('profileTitle')} />

      {/* User card */}
      <div style={{ padding: '0 16px 16px' }}>
        <Card theme={theme} style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: theme.accentSoft, color: theme.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 30, fontWeight: 500,
          }}>
            {t('greetingName').charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: theme.text, letterSpacing: -0.3 }}>
              {t('greetingName')} García
            </div>
            <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2 }}>
              maria.g@email · {lang === 'es' ? '6 medicinas activas' : '6 active medicines'}
            </div>
          </div>
          <button style={{
            width: 38, height: 38, borderRadius: 12, background: theme.surface2,
            border: `1px solid ${theme.border}`, color: theme.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {I.edit(18, theme.text)}
          </button>
        </Card>
      </div>

      {/* Caregivers */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{
          fontSize: 12, color: theme.textDim, fontWeight: 700, letterSpacing: 0.6,
          textTransform: 'uppercase', padding: '0 4px 8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{t('caregivers')}</span>
          <span style={{ color: theme.textSoft, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
            {caregivers.length} {lang === 'es' ? 'activos' : 'active'}
          </span>
        </div>
        <Card theme={theme} style={{ overflow: 'hidden' }}>
          {caregivers.map((cg, i) => (
            <div key={cg.id} onClick={() => onManageCaregiver(cg)} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 16px', cursor: 'pointer',
              borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
            }}>
              <Avatar name={cg.name} color={cg.color} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, letterSpacing: -0.1 }}>
                  {cg.name}{' '}
                  <span style={{ color: theme.textDim, fontWeight: 500 }}>· {t(cg.relationKey)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: theme.textDim, marginTop: 2 }}>
                  {cg.permission === 'edit' ? t('cgPermissionFull') : t('cgPermissionViewOnly')}
                </div>
              </div>
              <span style={{ color: theme.textSoft }}>{I.chev(14, theme.textSoft)}</span>
            </div>
          ))}
          <div onClick={onInviteCaregiver} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 16px', cursor: 'pointer',
            borderTop: `1px solid ${theme.border}`,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: theme.accentSoft, color: theme.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {I.plus(20, theme.accent)}
            </div>
            <div style={{ flex: 1, fontSize: 15, color: theme.accent, fontWeight: 700, letterSpacing: -0.1 }}>
              {t('cgAddNew')}
            </div>
          </div>
        </Card>
      </div>

      {/* Settings groups */}
      {settingsGroups.map((g, gi) => (
        <div key={gi} style={{ padding: '0 16px 16px' }}>
          <div style={{
            fontSize: 12, color: theme.textDim, fontWeight: 700, letterSpacing: 0.6,
            textTransform: 'uppercase', padding: '0 4px 8px',
          }}>
            {g.title}
          </div>
          <Card theme={theme} style={{ overflow: 'hidden' }}>
            {g.items.map((it, i) => (
              <div
                key={i}
                onClick={'onPress' in it ? it.onPress : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px',
                  borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
                  cursor: 'onPress' in it ? 'pointer' : 'default',
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: theme.surface2, color: theme.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {it.icon(18, theme.text)}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 15, color: theme.text, fontWeight: 500 }}>
                  {it.label}
                </div>
                {'toggle' in it && it.toggle ? (
                  <ToggleSwitch on={it.on ?? false} accentColor={theme.accent} />
                ) : (
                  <>
                    <div style={{ fontSize: 13.5, color: theme.textDim, fontWeight: 500 }}>
                      {'value' in it ? it.value : ''}
                    </div>
                    <span style={{ color: theme.textSoft }}>{I.chev(14, theme.textSoft)}</span>
                  </>
                )}
              </div>
            ))}
          </Card>
        </div>
      ))}

      <div style={{ padding: '0 16px 8px' }}>
        <Btn theme={theme} kind="secondary" size="md" full>{t('signOut')}</Btn>
      </div>

      <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button onClick={onLoadDemo} style={{
          background: 'transparent', border: `1px solid ${theme.border}`,
          color: theme.textDim, padding: '10px 16px', borderRadius: 999,
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          {I.plus(14, theme.textDim)} {t('loadDemo')}
        </button>
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
