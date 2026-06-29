import React, { useState, useEffect, useRef } from 'react';
import { getTheme, type ThemeName } from './theme/tokens';
import { tstr, type Lang } from './i18n/strings';
import { INITIAL_MEDS, PATIENT_CAREGIVERS } from './data/mock';
import { buildTodayDoses, shiftTime } from './data/buildTodayDoses';
import { dosiStore } from './data/store';
import { ensureSession } from './lib/supabase';
import { pullAll, pullHistory, pushMeds, pushMed, deleteMed, pushDose, pushDoses } from './data/sync';
import type { Medicine, Dose, Caregiver } from './data/types';
import { I } from './icons';

import BottomNav from './components/BottomNav';
import ConfirmDialog from './components/ConfirmDialog';
import Toast from './components/Toast';

import OnboardingScreen from './screens/OnboardingScreen';
import HomeScreen from './screens/HomeScreen';
import InventoryScreen from './screens/InventoryScreen';
import CalendarScreen from './screens/CalendarScreen';
import ProfileScreen from './screens/ProfileScreen';
import AddMedScreen from './screens/AddMedScreen';
import DetailScreen from './screens/DetailScreen';
import NotificationToast from './screens/NotificationToast';
import ConfirmTakenOverlay from './screens/ConfirmTakenOverlay';
import StockAlertSheet from './screens/StockAlertSheet';
import InviteCaregiverSheet from './screens/InviteCaregiverSheet';
import ManageCaregiverSheet from './screens/ManageCaregiverSheet';

export type ScreenId = 'onboarding' | 'main' | 'addMed' | 'detail';
export type TabId = 'home' | 'inventory' | 'calendar' | 'profile';

const SETTINGS_KEY = 'dosi-settings';

function readSettings(): { themeName?: ThemeName; lang?: Lang } {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return {};
}

interface AppProps {
  themeName?: ThemeName;
  lang?: Lang;
  persistKey?: string;
}

interface ToastData {
  message: string;
  kind: 'neutral' | 'success' | 'danger';
  icon?: React.ReactNode;
}

export default function App({ themeName: initialTheme = 'light', lang: initialLang = 'es', persistKey }: AppProps) {
  const saved = readSettings();

  const [themeName, setThemeNameState] = useState<ThemeName>(saved.themeName ?? initialTheme);
  const [lang, setLangState] = useState<Lang>(saved.lang ?? initialLang);

  const theme = getTheme(themeName);
  const t = (key: string, vars?: Record<string, string | number>) => tstr(lang, key, vars);

  const stored = persistKey ? dosiStore.read(persistKey) : null;
  const todayStr = dosiStore.todayStr();

  const startMeds = stored?.meds ?? INITIAL_MEDS;
  const startDoses = (stored?.doses && stored.date === todayStr)
    ? stored.doses
    : buildTodayDoses(startMeds, new Date().getHours(), { autoMarkTaken: !persistKey });

  const userId = useRef<string | null>(null);

  const [screen, setScreen] = useState<ScreenId>('onboarding');
  const [tab, setTab] = useState<TabId>('home');
  const [meds, setMeds] = useState<Medicine[]>(startMeds);
  const [doses, setDoses] = useState<Dose[]>(startDoses);
  const [historyDoses, setHistoryDoses] = useState<Dose[]>([]);
  const [selMedId, setSelMedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [notif, setNotif] = useState<{ med: Medicine; dose: Dose } | null>(null);
  const [confirm, setConfirm] = useState<{ med: Medicine; time: string } | null>(null);
  const [stockAlertMed, setStockAlertMed] = useState<Medicine | null>(null);
  const stockAlertShown = useRef(new Set<string>());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manageCg, setManageCg] = useState<Caregiver | null>(null);
  const [confirmPause, setConfirmPause] = useState<Medicine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Medicine | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Persist settings changes
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ themeName, lang }));
  }, [themeName, lang]);

  useEffect(() => {
    if (!persistKey) return;
    dosiStore.write(persistKey, { meds, doses, date: todayStr });
  }, [meds, doses, persistKey, todayStr]);

  // Supabase: authenticate → pull remote data → seed remote if empty
  useEffect(() => {
    (async () => {
      const uid = await ensureSession();
      if (!uid) return;
      userId.current = uid;

      const [remote, history] = await Promise.all([
        pullAll(uid),
        pullHistory(uid, 7),
      ]);

      setHistoryDoses(history);

      if (remote) {
        setMeds(remote.meds);
        if (remote.doses.length > 0) {
          setDoses(remote.doses);
        } else {
          const fresh = buildTodayDoses(remote.meds, new Date().getHours());
          setDoses(fresh);
          pushDoses(fresh, uid);
        }
      } else {
        await pushMeds(startMeds, uid);
        await pushDoses(startDoses, uid);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevMedsCount = useRef(meds.length);
  useEffect(() => {
    if (meds.length === prevMedsCount.current) return;
    prevMedsCount.current = meds.length;
    setDoses(prev => {
      const fresh = buildTodayDoses(meds, new Date().getHours(), { autoMarkTaken: !persistKey });
      return fresh.map(fd => {
        const existing = prev.find(p => p.medId === fd.medId && p.time === fd.time);
        return existing ? { ...fd, status: existing.status } : fd;
      });
    });
  }, [meds, persistKey]);

  const setThemeName = (name: ThemeName) => setThemeNameState(name);
  const setLang = (l: Lang) => setLangState(l);

  const showNotif = () => {
    const upcoming = doses.find(d => d.status === 'upcoming' || d.status === 'now');
    if (!upcoming) return;
    const med = meds.find(m => m.id === upcoming.medId);
    if (med) setNotif({ med, dose: upcoming });
  };

  const markTaken = (doseId: string) => {
    const d = doses.find(x => x.id === doseId);
    if (!d) return;
    const med = meds.find(m => m.id === d.medId);
    if (!med) return;
    const updatedDose: Dose = { ...d, status: 'taken' };
    const updatedMed: Medicine = { ...med, stock: Math.max(0, med.stock - 1) };
    setDoses(ds => ds.map(x => x.id === doseId ? updatedDose : x));
    setMeds(ms => ms.map(m => m.id === d.medId ? updatedMed : m));
    // Also update historyDoses for today so CalendarScreen stays in sync
    setHistoryDoses(hs => hs.map(h => h.id === doseId ? { ...h, status: 'taken' as const } : h));
    setConfirm({ med, time: d.time });
    setNotif(null);
    if (userId.current) {
      pushDose(updatedDose, userId.current);
      pushMed(updatedMed, userId.current);
    }
    setTimeout(() => {
      const newStock = updatedMed.stock;
      if (newStock > 0 && newStock <= 6 && !stockAlertShown.current.has(med.id)) {
        stockAlertShown.current.add(med.id);
        setStockAlertMed(updatedMed);
      }
    }, 1800);
  };

  const snoozeDose = (doseId: string) => {
    setNotif(null);
    setDoses(ds => ds.map(x => {
      if (x.id !== doseId) return x;
      const updated = { ...x, time: shiftTime(x.time, 10) };
      if (userId.current) pushDose(updated, userId.current);
      return updated;
    }));
  };

  const skipDose = (doseId: string) => {
    setNotif(null);
    setDoses(ds => ds.map(x => {
      if (x.id !== doseId) return x;
      const updated = { ...x, status: 'skipped' as const };
      if (userId.current) pushDose(updated, userId.current);
      return updated;
    }));
  };

  const openMed = (medId: string) => { setSelMedId(medId); setScreen('detail'); };
  const onTabChange = (id: TabId) => { setTab(id); setScreen('main'); };

  const showTabs = screen === 'main';
  const showFab = screen === 'main' && tab === 'home';

  let body: React.ReactNode = null;

  if (screen === 'onboarding') {
    body = <OnboardingScreen theme={theme} t={t} lang={lang} onDone={() => setScreen('main')} />;
  } else if (screen === 'addMed') {
    const isEdit = !!editing;
    body = (
      <AddMedScreen
        theme={theme} t={t} lang={lang}
        mode={isEdit ? 'edit' : 'add'}
        initialData={editing}
        onCancel={() => { setScreen(isEdit ? 'detail' : 'main'); setEditing(null); }}
        onSave={d => {
          if (isEdit && editing) {
            const updated: Medicine = {
              ...editing,
              name: d.name || editing.name,
              dose: d.dose, form: d.form, color: d.color,
              schedule: { ...editing.schedule, freq: d.freq, times: d.times },
              stock: d.stock, expiry: d.expiry, notes: d.notes,
            };
            setMeds(ms => ms.map(m => m.id === editing.id ? updated : m));
            if (userId.current) pushMed(updated, userId.current);
            setToast({ message: t('toastSaved'), kind: 'success', icon: I.check(16, '#fff') });
            setScreen('detail'); setEditing(null);
          } else {
            const newMed: Medicine = {
              id: crypto.randomUUID(),
              name: d.name || 'Nueva medicina',
              dose: d.dose, form: d.form, color: d.color,
              schedule: { freq: d.freq, times: d.times },
              duration: d.duration === 'forDays'
                ? { kind: 'days', days: d.days, startedDay: 1 }
                : { kind: 'ongoing' },
              stock: d.stock, expiry: d.expiry, notes: d.notes,
            };
            setMeds(ms => [...ms, newMed]);
            if (userId.current) pushMed(newMed, userId.current);
            setScreen('main'); setTab('inventory');
          }
        }}
      />
    );
  } else if (screen === 'detail') {
    const med = meds.find(m => m.id === selMedId);
    body = (
      <DetailScreen
        theme={theme} t={t} lang={lang}
        med={med ?? null}
        onBack={() => setScreen('main')}
        onShowStockAlert={() => med && setStockAlertMed(med)}
        onEdit={() => { if (med) { setEditing(med); setScreen('addMed'); } }}
        onPauseToggle={() => {
          if (!med) return;
          if (med.paused) {
            const updated = { ...med, paused: false };
            setMeds(ms => ms.map(m => m.id === med.id ? updated : m));
            if (userId.current) pushMed(updated, userId.current);
            setToast({ message: t('toastResumed', { name: med.name }), kind: 'success', icon: I.check(16, '#fff') });
          } else {
            setConfirmPause(med);
          }
        }}
        onDelete={() => med && setConfirmDelete(med)}
      />
    );
  } else {
    if (tab === 'home') {
      body = (
        <HomeScreen
          theme={theme} t={t} lang={lang}
          meds={meds} doses={doses}
          onMark={markTaken} onSnooze={snoozeDose} onSkip={skipDose}
          onAddMed={() => setScreen('addMed')}
          onOpenMed={openMed}
          onShowNotif={showNotif}
        />
      );
    } else if (tab === 'inventory') {
      body = (
        <InventoryScreen
          theme={theme} t={t} lang={lang}
          meds={meds}
          onOpenMed={openMed}
          onAdd={() => setScreen('addMed')}
          onShowStockAlert={med => setStockAlertMed(med)}
        />
      );
    } else if (tab === 'calendar') {
      body = (
        <CalendarScreen
          theme={theme} t={t} lang={lang}
          meds={meds}
          doses={doses}
          historyDoses={historyDoses}
        />
      );
    } else if (tab === 'profile') {
      body = (
        <ProfileScreen
          theme={theme} t={t} lang={lang}
          themeName={themeName}
          caregivers={PATIENT_CAREGIVERS}
          onThemeChange={setThemeName}
          onLangChange={setLang}
          onInviteCaregiver={() => setInviteOpen(true)}
          onManageCaregiver={cg => setManageCg(cg)}
          onResetData={() => setConfirmReset(true)}
          onLoadDemo={() => {
            const freshDoses = buildTodayDoses(INITIAL_MEDS, new Date().getHours(), { autoMarkTaken: true });
            setMeds(INITIAL_MEDS);
            setDoses(freshDoses);
            if (userId.current) {
              pushMeds(INITIAL_MEDS, userId.current);
              pushDoses(freshDoses, userId.current);
            }
            setToast({ message: t('loadDemo'), kind: 'success', icon: I.check(16, '#fff') });
          }}
        />
      );
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: theme.bg, color: theme.text,
      fontFamily: '"Plus Jakarta Sans", -apple-system, system-ui, sans-serif',
      fontSize: 15, lineHeight: 1.4,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 50, zIndex: 5,
        background: `linear-gradient(${theme.bg}, ${theme.bg}00)`,
        pointerEvents: 'none',
      }} />

      <div style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', paddingTop: 48 }}>
        {body}
      </div>

      {showFab && (
        <button
          onClick={() => setScreen('addMed')}
          style={{
            position: 'absolute', right: 22, bottom: 110, zIndex: 25,
            width: 56, height: 56, borderRadius: 18,
            background: theme.accent, color: theme.accentText,
            border: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 10px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)',
          }}
        >
          {I.plus(26, theme.accentText)}
        </button>
      )}

      {showTabs && <BottomNav theme={theme} active={tab} onChange={onTabChange} t={t} />}

      {notif && (
        <NotificationToast
          theme={theme} t={t} lang={lang}
          med={notif.med} dose={notif.dose}
          onClose={() => setNotif(null)}
          onTake={() => markTaken(notif.dose.id)}
          onSnooze={() => snoozeDose(notif.dose.id)}
          onSkip={() => skipDose(notif.dose.id)}
        />
      )}

      {confirm && (
        <ConfirmTakenOverlay
          theme={theme} t={t} lang={lang}
          med={confirm.med} time={confirm.time}
          onDone={() => setConfirm(null)}
        />
      )}

      {stockAlertMed && (
        <StockAlertSheet
          theme={theme} t={t} lang={lang}
          med={stockAlertMed}
          onClose={() => setStockAlertMed(null)}
          onRefill={() => {
            const updated = { ...stockAlertMed, stock: stockAlertMed.stock + 30 };
            setMeds(ms => ms.map(m => m.id === stockAlertMed.id ? updated : m));
            if (userId.current) pushMed(updated, userId.current);
            setStockAlertMed(null);
          }}
          onRemind={() => setStockAlertMed(null)}
        />
      )}

      {inviteOpen && (
        <InviteCaregiverSheet theme={theme} t={t} lang={lang} onClose={() => setInviteOpen(false)} />
      )}

      {manageCg && (
        <ManageCaregiverSheet theme={theme} t={t} lang={lang} caregiver={manageCg} onClose={() => setManageCg(null)} />
      )}

      {confirmPause && (
        <ConfirmDialog
          theme={theme}
          title={t('confirmPauseTitle', { name: confirmPause.name })}
          message={t('confirmPauseMsg')}
          confirmLabel={t('confirmPause')}
          confirmIcon={I.pause(16, theme.accentText)}
          confirmKind="primary"
          onCancel={() => setConfirmPause(null)}
          onConfirm={() => {
            const updated = { ...confirmPause, paused: true };
            setMeds(ms => ms.map(m => m.id === confirmPause.id ? updated : m));
            if (userId.current) pushMed(updated, userId.current);
            setConfirmPause(null);
            setToast({ message: t('toastPaused', { name: confirmPause.name }), kind: 'success', icon: I.pause(16, '#fff') });
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          theme={theme}
          title={t('confirmDeleteTitle', { name: confirmDelete.name })}
          message={t('confirmDeleteMsg')}
          confirmLabel={t('confirmDelete')}
          confirmIcon={I.trash(16, '#fff')}
          confirmKind="danger"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const id = confirmDelete.id;
            const name = confirmDelete.name;
            setMeds(ms => ms.filter(m => m.id !== id));
            setDoses(ds => ds.filter(d => d.medId !== id));
            if (userId.current) deleteMed(id);
            setConfirmDelete(null);
            setScreen('main');
            setToast({ message: t('toastDeleted', { name }), kind: 'danger', icon: I.trash(16, '#fff') });
          }}
        />
      )}

      {confirmReset && (
        <ConfirmDialog
          theme={theme}
          title={t('resetConfirmTitle')}
          message={t('resetConfirmMsg')}
          confirmLabel={t('resetData')}
          confirmIcon={I.trash(16, '#fff')}
          confirmKind="danger"
          onCancel={() => setConfirmReset(false)}
          onConfirm={async () => {
            if (persistKey) dosiStore.clear(persistKey);
            if (userId.current) {
              for (const m of meds) await deleteMed(m.id);
            }
            setMeds([]); setDoses([]); setHistoryDoses([]);
            setConfirmReset(false);
            setTab('home'); setScreen('main');
            setToast({ message: t('resetData'), kind: 'danger', icon: I.trash(16, '#fff') });
          }}
        />
      )}

      {toast && (
        <Toast theme={theme} message={toast.message} icon={toast.icon} kind={toast.kind} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
