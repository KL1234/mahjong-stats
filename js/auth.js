import { supabase } from './supabase.js';
import { EMAIL_DOMAIN } from './config.js';

export async function login(id, password) {
  const email = id.includes('@') ? id : `${id}@${EMAIL_DOMAIN}`;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
}
