import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_KEY as string;

export const supabase = createClient(url, key);

export async function ensureSession(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) { console.error('[dosi] auth error:', error.message); return null; }
  return data.user?.id ?? null;
}

export async function getAccount(): Promise<{ userId: string | null; email: string | null; isAnonymous: boolean }> {
  // @supabase/auth-js 2.108: User expone `email?: string` e `is_anonymous?: boolean`.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, email: null, isAnonymous: true };
  return {
    userId: user.id,
    email: user.email ?? null,
    isAnonymous: user.is_anonymous ?? !user.email,
  };
}

// ─── Vincular email a la cuenta anónima actual (conserva user_id y datos) ─────

export async function linkEmail(email: string): Promise<void> {
  // updateUser({ email }) inicia un cambio de email: Supabase envía un enlace y/o
  // un OTP de 6 dígitos a la dirección nueva (docs: guides/auth/auth-anonymous
  // "Convert an anonymous user to a permanent user" + reference/javascript/auth-updateuser).
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message);
}

export async function confirmEmailChange(email: string, token: string): Promise<void> {
  // type 'email_change': valor de EmailOtpType que confirma un cambio de email
  // iniciado con updateUser({ email }). Verificado contra los tipos de
  // @supabase/auth-js 2.108 (EmailOtpType incluye 'email_change'; ResendParams
  // solo admite 'signup' | 'email_change' para reenviar). La doc de
  // reference/javascript/auth-verifyotp no da un ejemplo explícito de este flujo,
  // pero 'email_change' es el tipo asociado a la plantilla "Change Email Address".
  // Nota: si "Secure email change" está activo, un usuario con email previo
  // recibiría 2 confirmaciones; un usuario anónimo (sin email) recibe solo 1.
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
  if (error) throw new Error(error.message);
}

// ─── Iniciar sesión con un email ya existente (otro dispositivo) ──────────────

export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw new Error(error.message);
}

export async function confirmSignIn(email: string, token: string): Promise<string> {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(error.message);
  const uid = data.user?.id;
  if (!uid) throw new Error('sin usuario tras verificar');
  return uid;
}

// ─── Cerrar sesión → volver a anónimo ────────────────────────────────────────

export async function signOutToAnon(): Promise<string | null> {
  await supabase.auth.signOut();
  return ensureSession();
}
