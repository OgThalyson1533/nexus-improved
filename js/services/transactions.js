/**
 * js/services/transactions.js
 * Utilitários para CRUD direto nas transações do Supabase (Opcional, se online-only).
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

export async function fetchRemoteTransactions() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false });
  if (error) console.error('[Transactions] Fetch erro:', error);
  return data || [];
}

export async function deleteRemoteTransaction(id) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) console.error('[Transactions] Delete erro:', error);
}
