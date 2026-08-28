// Edge Function: send-reminders
// Cron (cada minuto) con header `X-Cron-Secret`. Materializa las dosis de hoy en
// la zona horaria del usuario, envía avisos de toma y alertas de stock/caducidad.
import { sbAdmin, webpushSend, type PushRow } from '../_shared/edge.ts';
import { isoDate, nowInTz, buildTodayDoses, medState } from '../_shared/schedule.ts';
import { dueReminder, stockAlertDecision, expiryAlertDecision, daysLeft } from '../_shared/reminders.ts';
import { rowToMed, type Medicine } from '../_shared/types.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  if (req.headers.get('X-Cron-Secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }

  const sb = sbAdmin();
  const { data: subs, error: subErr } = await sb.from('push_subscriptions').select('*');
  if (subErr) return new Response(subErr.message, { status: 500 });

  type Sub = Record<string, unknown> & PushRow & {
    user_id: string;
    timezone: string;
    last_seen_at: string;
  };

  const byUser = new Map<string, Sub[]>();
  for (const s of (subs ?? []) as Sub[]) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  let pushes = 0;

  for (const [userId, userSubs] of byUser) {
   try {
    // Zona horaria: la de la suscripción vista más recientemente.
    const tz = [...userSubs].sort(
      (a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at),
    )[0].timezone;
    const now = nowInTz(tz);
    const today = isoDate(now);

    const { data: medRows, error: medErr } = await sb.from('medicines').select('*').eq('user_id', userId);
    if (medErr) { console.error('[send-reminders] medicines', userId, medErr); continue; }
    const meds: Medicine[] = (medRows ?? []).map((r) => rowToMed(r as Record<string, unknown>));

    // 1) Materializar las dosis de hoy. `ignoreDuplicates` => nunca pisa
    //    filas ya tomadas / saltadas / pospuestas.
    const fresh = buildTodayDoses(meds, now);
    if (fresh.length > 0) {
      await sb.from('doses').upsert(
        fresh.map((d) => ({
          id: d.id,
          user_id: userId,
          med_id: d.medId,
          date: today,
          time: d.time,
          total_min: d.totalMin,
          status: 'upcoming',
        })),
        { onConflict: 'id', ignoreDuplicates: true },
      );
    }

    // 2) Avisos de toma.
    const { data: dosesHoy, error: dosesErr } = await sb
      .from('doses').select('*').eq('user_id', userId).eq('date', today);
    if (dosesErr) { console.error('[send-reminders] doses', userId, dosesErr); continue; }

    for (const dose of dosesHoy ?? []) {
      const doseRow = {
        time: dose.time as string,
        status: dose.status as string,
        reminded_count: (dose.reminded_count ?? 0) as number,
        reminded_at: (dose.reminded_at ?? null) as string | null,
      };
      if (!dueReminder(doseRow, now)) continue;

      const med = meds.find((m) => m.id === dose.med_id);
      if (!med) continue;

      const firstNote = med.notes ? ' · ' + med.notes.split('.')[0] : '';
      const payload = {
        kind: 'dose',
        title: `Hora de tu ${med.name}`,
        body: med.dose + firstNote,
        tag: dose.id as string,
        doseId: dose.id as string,
        actionUrl: `${SUPABASE_URL}/functions/v1/dose-action`,
      };

      for (const sub of userSubs) {
        const status = await webpushSend(
          sub,
          JSON.stringify({ ...payload, endpoint: sub.endpoint, secret: sub.action_secret }),
        );
        if (status === 404 || status === 410) {
          await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else if (status === 0) {
          pushes++;
        }
      }

      await sb.from('doses')
        .update({
          reminded_count: ((dose.reminded_count ?? 0) as number) + 1,
          reminded_at: now.toISOString(),
        })
        .eq('id', dose.id);
    }

    // 3) Alertas de stock / caducidad — solo para medicinas activas.
    for (const med of meds) {
      if (medState(med, now) !== 'active') continue;

      // stock
      const stockSent = await sb.from('sent_alerts')
        .select('med_id')
        .eq('user_id', userId).eq('med_id', med.id).eq('kind', 'stock')
        .maybeSingle();
      const stockDec = stockAlertDecision(med, Boolean(stockSent.data));
      if (stockDec === 'send') {
        for (const sub of userSubs) {
          const st = await webpushSend(sub, JSON.stringify({
            kind: 'stock',
            title: `Se acaba tu ${med.name}`,
            body: `Te quedan ~${daysLeft(med)} días`,
            tag: `stock-${med.id}`,
            endpoint: sub.endpoint,
            secret: sub.action_secret,
          }));
          if (st === 404 || st === 410) {
            await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          } else if (st === 0) {
            pushes++;
          }
        }
        await sb.from('sent_alerts').upsert(
          { user_id: userId, med_id: med.id, kind: 'stock', sent_at: new Date().toISOString() },
          { onConflict: 'user_id,med_id,kind' },
        );
      } else if (stockDec === 'clear') {
        await sb.from('sent_alerts').delete()
          .eq('user_id', userId).eq('med_id', med.id).eq('kind', 'stock');
      }

      // caducidad
      const expSent = await sb.from('sent_alerts')
        .select('med_id')
        .eq('user_id', userId).eq('med_id', med.id).eq('kind', 'expiry')
        .maybeSingle();
      const expDec = expiryAlertDecision(med, now, Boolean(expSent.data));
      if (expDec === 'send') {
        for (const sub of userSubs) {
          const st = await webpushSend(sub, JSON.stringify({
            kind: 'expiry',
            title: `${med.name} caduca pronto`,
            body: `El ${med.expiry}`,
            tag: `expiry-${med.id}`,
            endpoint: sub.endpoint,
            secret: sub.action_secret,
          }));
          if (st === 404 || st === 410) {
            await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          } else if (st === 0) {
            pushes++;
          }
        }
        await sb.from('sent_alerts').upsert(
          { user_id: userId, med_id: med.id, kind: 'expiry', sent_at: new Date().toISOString() },
          { onConflict: 'user_id,med_id,kind' },
        );
      } else if (expDec === 'clear') {
        await sb.from('sent_alerts').delete()
          .eq('user_id', userId).eq('med_id', med.id).eq('kind', 'expiry');
      }
    }
   } catch (e) {
     console.error('[send-reminders]', userId, e);
   }
  }

  return new Response(JSON.stringify({ users: byUser.size, pushes }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
