import React, { useState, useEffect, useRef } from 'react';
import { getTheme, type ThemeName } from './theme/tokens';
import { tstr, type Lang } from './i18n/strings';
import { buildTodayDoses, shiftTime, expandTimes, isoDate } from './lib/schedule';
import { readSettings, writeSettings } from './data/settings';
import { dosiStore } from './data/store';
import { ensureSession, getAccount, signOutToAnon, supabase } from './lib/supabase';
import { pullAll, pullHistory, backfillHistory, pushMed, deleteMed, pushDose, pushDoses, mergeHistoryDose } from './data/sync';
import { enqueue, outboxSize, clearOutbox, flushOutbox } from './data/outbox';
import type { Medicine, Dose } from './data/types';
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
import AuthSheet from './screens/AuthSheet';
import PushSheet from './screens/PushSheet';
import CaregiverSheet from './screens/CaregiverSheet';
import CaregiverScreen from './screens/CaregiverScreen';
import ReportScreen from './screens/ReportScreen';
import { myCaregiverRow, createPairCode, regeneratePairCode, cancelCaregiver, acceptCode, listPatients } from './lib/caregiver';
import type { CaregiverRow } from './data/types';
import { pushSupported, pushPermission, needsInstallFirst, enablePush, disablePush, syncPush, pushHasSubscription } from './lib/push';

export type ScreenId = 'onboarding' | 'main' | 'addMed' | 'detail' | 'caregiver' | 'report';
export type TabId = 'home' | 'inventory' | 'calendar' | 'profile';

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
  const [userName, setUserName] = useState<string>(saved.userName ?? '');

  const theme = getTheme(themeName);
  const t = (key: string, vars?: Record<string, string | number>) => tstr(lang, key, vars);

  const stored = persistKey ? dosiStore.read(persistKey) : null;
  const todayStr = dosiStore.todayStr();

  const startMeds = stored?.meds ?? [];
  const startDoses = (stored?.doses && stored.date === todayStr)
    ? stored.doses
    : buildTodayDoses(startMeds, new Date());

  const userId = useRef<string | null>(null);

  const [screen, setScreen] = useState<ScreenId>(saved.onboarded ? 'main' : 'onboarding');
  const [tab, setTab] = useState<TabId>('home');
  const [meds, setMeds] = useState<Medicine[]>(startMeds);
  const [doses, setDoses] = useState<Dose[]>(startDoses);
  const [historyDoses, setHistoryDoses] = useState<Dose[]>([]);
  const [selMedId, setSelMedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [resumeMode, setResumeMode] = useState(false);
  const [notif, setNotif] = useState<{ med: Medicine; dose: Dose } | null>(null);
  const [confirm, setConfirm] = useState<{ med: Medicine; time: string } | null>(null);
  const [stockAlertMed, setStockAlertMed] = useState<Medicine | null>(null);
  const stockAlertShown = useRef(new Set<string>());
  const [account, setAccount] = useState<{ userId: string | null; email: string | null; isAnonymous: boolean }>(
    { userId: null, email: null, isAnonymous: true }
  );
  const [authSheet, setAuthSheet] = useState<'link' | 'signin' | null>(null);
  const [pushSheet, setPushSheet] = useState(false);
  const [pushAsked, setPushAsked] = useState<boolean>(saved.pushAsked);
  const [pushBannerDismissed, setPushBannerDismissed] = useState<boolean>(saved.pushBannerDismissed);
  // force pushState/showPushBanner recompute after permission change
  const [pushTick, setPushTick] = useState(0);
  const [pushSubscribed, setPushSubscribed] = useState<boolean | null>(null);

  const [caregiver, setCaregiver] = useState<CaregiverRow | null>(null);
  const [caredForCount, setCaredForCount] = useState(0);
  const [cgSheet, setCgSheet] = useState<'show' | 'enter' | null>(null);
  const [confirmRemoveCg, setConfirmRemoveCg] = useState(false);

  const refreshCaregiver = () =>
    Promise.all([
      myCaregiverRow().then(setCaregiver),
      listPatients().then((p) => setCaredForCount(p.length)),
    ]);

  void pushTick; // dependency so pushState/showPushBanner recompute after each permission change
  const perm = pushPermission();
  const pushState: 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied' =
    !pushSupported() ? 'unsupported'
    : needsInstallFirst() ? 'needs-install'
    : perm === 'denied' ? 'denied'
    : perm === 'granted' && pushSubscribed !== false ? 'granted'
    : 'default';

  const showPushBanner =
    pushSupported() && !needsInstallFirst() && pushState === 'default' && !pushBannerDismissed;
  const [confirmPause, setConfirmPause] = useState<Medicine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Medicine | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [pendingSync, setPendingSync] = useState(0);

  const persistMed = (med: Medicine) => {
    const uid = userId.current;
    if (uid) {
      pushMed(med, uid).catch(() => { enqueue({ t: 'med', med }); setPendingSync(outboxSize()); });
    } else {
      enqueue({ t: 'med', med }); setPendingSync(outboxSize());
    }
  };
  const persistDose = (dose: Dose) => {
    const uid = userId.current;
    if (uid) {
      pushDose(dose, uid).catch(() => { enqueue({ t: 'dose', dose }); setPendingSync(outboxSize()); });
    } else {
      enqueue({ t: 'dose', dose }); setPendingSync(outboxSize());
    }
  };
  const persistDelMed = (id: string) => {
    const uid = userId.current;
    if (uid) {
      deleteMed(id).catch(() => { enqueue({ t: 'delMed', id }); setPendingSync(outboxSize()); });
    } else {
      enqueue({ t: 'delMed', id }); setPendingSync(outboxSize());
    }
  };

  const flushSync = () => {
    const uid = userId.current;
    if (uid) flushOutbox(uid).then(setPendingSync);
  };

  // Persist settings changes
  useEffect(() => {
    writeSettings({ themeName, lang, userName });
  }, [themeName, lang, userName]);

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
      setAccount(await getAccount());
      refreshCaregiver();
      if (pushPermission() === 'granted') { syncPush(uid).catch(() => {}).then(refreshPushSubscribed); }
      setPendingSync(await flushOutbox(uid));

      const [remote, history] = await Promise.all([
        pullAll(uid),
        pullHistory(uid, 90),
      ]);

      setHistoryDoses(history);

      if (remote) {
        setMeds(remote.meds);
        if (remote.doses.length > 0) {
          setDoses(remote.doses);
        } else {
          const fresh = buildTodayDoses(remote.meds, new Date());
          setDoses(fresh);
          pushDoses(fresh, uid);
        }
        // Rellena huecos del historial sin bloquear; refresca si insertó algo.
        backfillHistory(uid, remote.meds, 90)
          .then((n) => { if (n > 0) pullHistory(uid, 90).then(setHistoryDoses); })
          .catch(() => {});
      }
      // sin else: remoto vacío → el usuario empieza vacío; el primer pushMed
      // ocurre cuando crea su primera medicina
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush the offline write outbox whenever connectivity returns
  useEffect(() => {
    const onOnline = () => {
      const uid = userId.current;
      if (uid) flushOutbox(uid).then(setPendingSync);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  // Rebuild today's doses whenever any schedule-relevant field changes
  // (pause/resume, freq, weekdays, times, duration) — not just the med count.
  const schedSig = meds
    .map(m => `${m.id}|${m.paused ? 1 : 0}|${m.schedule.freq}|${(m.schedule.weekdays ?? []).join(',')}|${expandTimes(m).join(',')}|${m.duration.kind}:${m.duration.days ?? ''}:${m.duration.until ?? ''}:${m.duration.startedOn}`)
    .join(';');
  const prevSchedSig = useRef(schedSig);
  useEffect(() => {
    if (schedSig === prevSchedSig.current) return;
    prevSchedSig.current = schedSig;
    setDoses(prev => {
      const fresh = buildTodayDoses(meds, new Date());
      return fresh.map(fd => {
        const existing = prev.find(p => p.medId === fd.medId && p.time === fd.time);
        return existing ? { ...fd, status: existing.status } : fd;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedSig, meds]);

  const setThemeName = (name: ThemeName) => setThemeNameState(name);
  const setLang = (l: Lang) => setLangState(l);

  const refreshPushSubscribed = () => { pushHasSubscription().then(setPushSubscribed); };

  // Resolve push subscription state independent of the auth boot, so an
  // already-enabled user does not flash "reminders off" on cold load / offline.
  useEffect(() => { refreshPushSubscribed(); }, []);

  const doEnablePush = async () => {
    const uid = userId.current;
    if (!uid) return 'denied' as const;
    const r = await enablePush(uid);
    setPushTick(n => n + 1);
    refreshPushSubscribed();
    if (r === 'ok') setToast({ message: t('pushEnabledToast'), kind: 'success', icon: I.check(16, '#fff') });
    if (r === 'denied') setToast({ message: t('pushDenied'), kind: 'neutral' });
    if (r === 'error') setToast({ message: t('pushErrorGeneric'), kind: 'danger' });
    return r;
  };

  const doDisablePush = async () => {
    await disablePush();
    setPushTick(n => n + 1);
    refreshPushSubscribed();
    setToast({ message: t('pushDisabledToast'), kind: 'neutral' });
  };

  const dismissPushBanner = () => {
    setPushBannerDismissed(true);
    writeSettings({ pushBannerDismissed: true });
  };

  const markPushAsked = () => {
    setPushAsked(true);
    writeSettings({ pushAsked: true });
  };

  const handleAddCaregiver = async () => {
    try {
      if (!caregiver || (!caregiver.caregiverUserId && !caregiver.pairCode)) {
        await createPairCode(userName);
      }
      await refreshCaregiver();
      setCgSheet('show');
    } catch {
      setToast({ message: t('pushErrorGeneric'), kind: 'danger' });
    }
  };
  const handleRegenCode = async () => { await regeneratePairCode(); await refreshCaregiver(); };
  const handleCancelCode = async () => { await cancelCaregiver(); await refreshCaregiver(); setCgSheet(null); };
  const handleBecomeCaregiver = () => {
    if (!pushSupported() || pushPermission() !== 'granted') { setPushSheet(true); return; }
    setCgSheet('enter');
  };
  const submitCaregiverCode = async (code: string): Promise<'ok' | 'bad-code' | 'self' | 'no-push' | 'network'> => {
    const r = await acceptCode(code, userName);
    if ('error' in r) return r.error;
    refreshCaregiver();
    setToast({ message: t('cgAcceptedToast', { name: r.ownerName || '—' }), kind: 'success', icon: I.check(16, '#fff') });
    return 'ok';
  };

  const handleSignOut = async () => {
    if (persistKey) dosiStore.clear(persistKey);
    await disablePush().catch(() => {});
    setPushSubscribed(false);
    const prevUid = userId.current;
    if (prevUid) {
      await supabase.from('caregivers').delete()
        .or(`owner_user_id.eq.${prevUid},caregiver_user_id.eq.${prevUid}`)
        .then(() => {}, () => {});
    }
    setCaregiver(null); setCaredForCount(0);
    const uid = await signOutToAnon();
    userId.current = uid;
    clearOutbox(); setPendingSync(0);
    setMeds([]); setDoses([]); setHistoryDoses([]);
    setAccount(await getAccount());
    setTab('home'); setScreen('main');
    setToast({ message: t('signedOutToast'), kind: 'neutral' });
  };

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
    setHistoryDoses(hs => mergeHistoryDose(hs, updatedDose, 'taken', isoDate(new Date())));
    setConfirm({ med, time: d.time });
    setNotif(null);
    persistDose(updatedDose);
    persistMed(updatedMed);
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
    const target = doses.find(x => x.id === doseId);
    if (!target) return;
    const updated = { ...target, time: shiftTime(target.time, 10) };
    setDoses(ds => ds.map(x => x.id === doseId ? updated : x));
    persistDose(updated);
  };

  const skipDose = (doseId: string) => {
    setNotif(null);
    const target = doses.find(x => x.id === doseId);
    if (!target) return;
    const updated: Dose = { ...target, status: 'skipped' };
    setDoses(ds => ds.map(x => x.id === doseId ? updated : x));
    setHistoryDoses(hs => mergeHistoryDose(hs, updated, 'skipped', isoDate(new Date())));
    persistDose(updated);
  };

  const openMed = (medId: string) => { setSelMedId(medId); setScreen('detail'); };
  const onTabChange = (id: TabId) => { setTab(id); setScreen('main'); };

  const showTabs = screen === 'main';
  const showFab = screen === 'main' && tab === 'home';

  let body: React.ReactNode = null;

  if (screen === 'onboarding') {
    body = <OnboardingScreen theme={theme} t={t} lang={lang} onDone={(name) => {
      if (name) setUserName(name);
      writeSettings({ onboarded: true });
      setScreen('main');
    }} />;
  } else if (screen === 'addMed') {
    const isEdit = !!editing;
    body = (
      <AddMedScreen
        theme={theme} t={t} lang={lang}
        mode={isEdit ? 'edit' : 'add'}
        initialData={editing}
        onCancel={() => { setScreen(isEdit ? 'detail' : 'main'); setEditing(null); setResumeMode(false); }}
        onSave={d => {
          const cleanTimes = [...new Set(d.times)].sort();
          const buildSchedule = (): Medicine['schedule'] =>
            d.freq === 'interval'
              ? { freq: 'interval', times: [d.times[0] ?? '08:00'], intervalHours: d.intervalHours }
              : d.freq === 'weekdays'
              ? { freq: 'weekdays', times: cleanTimes, weekdays: d.weekdays }
              : { freq: 'daily', times: cleanTimes };
          const buildDuration = (startedOn: string): Medicine['duration'] =>
            d.duration === 'days'
              ? { kind: 'days', days: d.days, startedOn }
              : d.duration === 'until'
              ? { kind: 'until', until: d.until, startedOn }
              : { kind: 'ongoing', startedOn };

          if (isEdit && editing) {
            const updated: Medicine = {
              ...editing,
              name: d.name || editing.name,
              dose: d.dose, form: d.form, color: d.color,
              schedule: buildSchedule(),
              duration: buildDuration(resumeMode ? todayStr : editing.duration.startedOn),
              stock: d.stock,
              expiry: d.expiry || undefined,
              notes: d.notes || undefined,
              paused: resumeMode ? false : editing.paused,
            };
            setMeds(ms => ms.map(m => m.id === editing.id ? updated : m));
            persistMed(updated);
            setToast({ message: t('toastSaved'), kind: 'success', icon: I.check(16, '#fff') });
            setScreen('detail'); setEditing(null); setResumeMode(false);
          } else {
            const newMed: Medicine = {
              id: crypto.randomUUID(),
              name: d.name || t('addMed'),
              dose: d.dose, form: d.form, color: d.color,
              schedule: buildSchedule(),
              duration: buildDuration(todayStr),
              stock: d.stock,
              expiry: d.expiry || undefined,
              notes: d.notes || undefined,
            };
            setMeds(ms => [...ms, newMed]);
            persistMed(newMed);
            if (meds.length === 0 && !pushAsked && pushSupported() && pushPermission() === 'default') {
              setPushSheet(true);
            }
            markPushAsked();
            setScreen('main'); setTab('inventory'); setResumeMode(false);
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
        historyDoses={historyDoses.filter(h => h.medId === selMedId)}
        onBack={() => setScreen('main')}
        onShowStockAlert={() => med && setStockAlertMed(med)}
        onEdit={() => { if (med) { setEditing(med); setResumeMode(false); setScreen('addMed'); } }}
        onResumeExtend={() => { if (med) { setEditing(med); setResumeMode(true); setScreen('addMed'); } }}
        onPauseToggle={() => {
          if (!med) return;
          if (med.paused) {
            const updated = { ...med, paused: false };
            setMeds(ms => ms.map(m => m.id === med.id ? updated : m));
            persistMed(updated);
            setToast({ message: t('toastResumed', { name: med.name }), kind: 'success', icon: I.check(16, '#fff') });
          } else {
            setConfirmPause(med);
          }
        }}
        onDelete={() => med && setConfirmDelete(med)}
      />
    );
  } else if (screen === 'caregiver') {
    body = (
      <CaregiverScreen
        theme={theme} t={t} lang={lang}
        onBack={() => { setScreen('main'); setTab('profile'); }}
        onEnablePush={() => { doEnablePush(); }}
      />
    );
  } else if (screen === 'report') {
    body = (
      <ReportScreen
        theme={theme} t={t} lang={lang}
        meds={meds}
        historyDoses={historyDoses}
        userName={userName}
        onBack={() => { setScreen('main'); setTab('profile'); }}
      />
    );
  } else {
    if (tab === 'home') {
      body = (
        <HomeScreen
          theme={theme} t={t} lang={lang}
          userName={userName}
          meds={meds} doses={doses}
          onMark={markTaken} onSnooze={snoozeDose} onSkip={skipDose}
          onAddMed={() => setScreen('addMed')}
          onOpenMed={openMed}
          onShowNotif={showNotif}
          showPushBanner={showPushBanner}
          onEnablePush={() => { doEnablePush(); }}
          onDismissPushBanner={dismissPushBanner}
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
          userName={userName}
          account={account}
          onUserNameChange={setUserName}
          onThemeChange={setThemeName}
          onLangChange={setLang}
          onLinkAccount={() => setAuthSheet('link')}
          onSignIn={() => setAuthSheet('signin')}
          onSignOut={handleSignOut}
          onResetData={() => setConfirmReset(true)}
          pushState={pushState}
          onEnablePush={() => { doEnablePush(); }}
          onDisablePush={() => { doDisablePush(); }}
          caregiver={caregiver}
          caredForCount={caredForCount}
          onAddCaregiver={handleAddCaregiver}
          onManageCaregiver={() => setCgSheet('show')}
          onRemoveCaregiver={() => setConfirmRemoveCg(true)}
          onBecomeCaregiver={handleBecomeCaregiver}
          onOpenCaredFor={() => setScreen('caregiver')}
          onOpenReport={meds.length > 0 ? () => setScreen('report') : undefined}
          pendingSync={pendingSync}
          onFlushSync={flushSync}
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

      {pendingSync > 0 && (
        <button
          onClick={flushSync}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6,
            background: theme.warnSoft, color: theme.warn, border: 0,
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
            padding: '6px 12px', cursor: 'pointer', textAlign: 'center',
          }}
        >
          {t('syncPending', { n: pendingSync })}
        </button>
      )}

      <div style={{
        height: '100%', overflowY: 'auto', overflowX: 'hidden',
        paddingTop: pendingSync > 0 ? 84 : 48,
      }}>
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
            persistMed(updated);
            setStockAlertMed(null);
          }}
          onRemind={() => setStockAlertMed(null)}
        />
      )}

      {authSheet && (
        <AuthSheet
          theme={theme} t={t}
          mode={authSheet}
          onClose={() => setAuthSheet(null)}
          onSuccess={async ({ userId: newUid }) => {
            setAuthSheet(null);
            if (newUid && newUid !== userId.current) {
              userId.current = newUid;
              if (pushPermission() === 'granted') {
                (async () => {
                  await disablePush().catch(() => {});   // unsubscribes browser sub; row delete may RLS-fail (dead endpoint, GC'd by send-reminders 404)
                  const r = await enablePush(newUid).catch(() => 'error' as const); // fresh subscribe -> new endpoint -> clean insert under newUid
                  if (r !== 'ok') setToast({ message: t('pushErrorGeneric'), kind: 'danger' });
                  refreshPushSubscribed();
                })();
              }
              flushOutbox(newUid).then(setPendingSync);
              const [remote, history] = await Promise.all([pullAll(newUid), pullHistory(newUid, 90)]);
              const rMeds = remote?.meds ?? [];
              const rDoses = (remote?.doses && remote.doses.length > 0)
                ? remote.doses
                : buildTodayDoses(rMeds, new Date());
              setMeds(rMeds);
              setDoses(rDoses);
              setHistoryDoses(history);
              if ((!remote?.doses || remote.doses.length === 0) && rMeds.length > 0) {
                pushDoses(rDoses, newUid);
              }
              if (rMeds.length > 0) {
                // Rellena huecos del historial sin bloquear; refresca si insertó algo.
                backfillHistory(newUid, rMeds, 90)
                  .then((n) => { if (n > 0) pullHistory(newUid, 90).then(setHistoryDoses); })
                  .catch(() => {});
              }
              setAccount(await getAccount());
              refreshCaregiver();
              setToast({ message: t('authSignedInToast'), kind: 'success', icon: I.check(16, '#fff') });
            } else {
              const acc = await getAccount();
              setAccount(acc);
              if (acc.email && !acc.isAnonymous) {
                setToast({ message: t('authLinkedToast'), kind: 'success', icon: I.check(16, '#fff') });
              } else {
                setToast({ message: t('authLinkPending'), kind: 'neutral' });
              }
            }
          }}
        />
      )}

      {pushSheet && (
        <PushSheet
          theme={theme} t={t}
          onClose={() => setPushSheet(false)}
          onEnable={doEnablePush}
        />
      )}

      {cgSheet === 'show' && (
        <CaregiverSheet
          theme={theme} t={t} mode="show"
          code={caregiver?.pairCode ?? undefined}
          expiresAt={caregiver?.pairCodeExpiresAt ?? null}
          onClose={() => setCgSheet(null)}
          onRegenerate={handleRegenCode}
          onCancelCode={handleCancelCode}
        />
      )}
      {cgSheet === 'enter' && (
        <CaregiverSheet
          theme={theme} t={t} mode="enter"
          onClose={() => setCgSheet(null)}
          onSubmitCode={submitCaregiverCode}
        />
      )}
      {confirmRemoveCg && (
        <ConfirmDialog
          theme={theme}
          title={t('cgRemoveTitle')}
          message={t('cgRemoveMsg')}
          confirmLabel={t('cgRemoveConfirm')}
          confirmIcon={I.trash(16, '#fff')}
          confirmKind="danger"
          onCancel={() => setConfirmRemoveCg(false)}
          onConfirm={async () => {
            await cancelCaregiver();
            if (caregiver?.caregiverUserId) {
              await supabase.from('caregivers').delete().eq('id', caregiver.id).then(() => {}, () => {});
            }
            setConfirmRemoveCg(false);
            refreshCaregiver();
            setToast({ message: t('cgRemovedToast'), kind: 'neutral' });
          }}
        />
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
            persistMed(updated);
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
            persistDelMed(id);
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
            clearOutbox(); setPendingSync(0);
            if (userId.current) {
              try { for (const m of meds) await deleteMed(m.id); } catch { /* wipe proceeds locally */ }
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
