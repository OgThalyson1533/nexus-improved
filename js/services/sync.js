/**
 * js/services/sync.js
 * Sincroniza o LocalStorage (state) com o banco relacional Supabase.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';
import { currentUser } from './auth.js';
import { showToast } from '../utils/dom.js';

// Converte DD/MM/YYYY do local para YYYY-MM-DD do Postgres (DATE)
function toSqlDate(brDateStr) {
  if (!brDateStr) return new Date().toISOString().split('T')[0];
  const parts = brDateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return brDateStr; // Fallback
}

export async function syncToSupabase(state) {
  if (!isSupabaseConfigured || !currentUser) return;

  try {
    const uid = currentUser.id;

    // 1. Perfil
    if (state.profile) {
      await supabase.from('profiles').upsert({
        id: uid,
        nickname: state.profile.nickname,
        display_name: state.profile.displayName,
        handle: state.profile.handle,
        bio: state.profile.bio,
        avatar_url: state.profile.avatarImage,
        banner_url: state.profile.bannerImage,
        onboarding_completed: !state.isNewUser
      });
    }

    // 2. Transações
    if (state.transactions && state.transactions.length > 0) {
      const txRows = state.transactions.map(t => ({
        id: t.id,
        user_id: uid,
        date: toSqlDate(t.date),
        description: t.desc,
        category: t.cat,
        amount: t.value,
        payment: t.payment,
        card_id: t.cardId,
        recurring_template: t.recurringTemplate,
        installments: t.installments || 1,
        installment_current: t.installmentCurrent || 1
      }));
      // Upsert batch
      const { error } = await supabase.from('transactions').upsert(txRows);
      if (error) console.error('[Sync] Error syncing transactions:', error);
    }

    // 3. Metas
    if (state.goals && state.goals.length > 0) {
      const goalRows = state.goals.map(g => ({
        id: g.id,
        user_id: uid,
        name: g.nome,
        current_amount: g.atual,
        target_amount: g.total,
        theme: g.theme || 'generic',
        custom_image: g.img,
        deadline: g.deadline || null
      }));
      await supabase.from('goals').upsert(goalRows);
    }

    // 4. Cartões e Faturas
    if (state.cards && state.cards.length > 0) {
      const cardRows = state.cards.map(c => ({
        id: c.id,
        user_id: uid,
        name: c.name,
        flag: c.flag,
        card_type: c.cardType,
        color: c.color,
        card_limit: c.limit,
        closing_day: c.closing || null,
        due_day: c.due || null
      }));
      await supabase.from('cards').upsert(cardRows);

      // Faturas (Invoices)
      const invoiceRows = [];
      state.cards.forEach(card => {
        if (card.invoices && card.invoices.length > 0) {
          card.invoices.forEach(inv => {
            invoiceRows.push({
              id: inv.id,
              user_id: uid,
              card_id: card.id,
              description: inv.desc,
              category: inv.cat,
              amount: inv.value,
              installments: inv.installments || 1,
              installment_current: inv.installmentCurrent || 1
            });
          });
        }
      });
      if (invoiceRows.length > 0) {
        await supabase.from('card_invoices').upsert(invoiceRows);
      }
    }

    // 5. Investimentos
    if (state.investments && state.investments.length > 0) {
      const invRows = state.investments.map(i => ({
        id: i.id,
        user_id: uid,
        name: i.name,
        type: i.type,
        subtype: i.subtype,
        current_value: i.value,
        cost_basis: i.cost
      }));
      await supabase.from('investments').upsert(invRows);
    }

    // 6. Custos Fixos
    if (state.fixedExpenses && state.fixedExpenses.length > 0) {
      const fxRows = state.fixedExpenses.map(f => ({
        id: f.id,
        user_id: uid,
        name: f.name,
        category: f.cat,
        amount: f.value,
        execution_day: f.day,
        is_income: f.isIncome || false,
        is_active: f.active !== false
      }));
      await supabase.from('fixed_expenses').upsert(fxRows);
    }

    console.info('[Sync] Backup na nuvem concluído com sucesso.');

  } catch (error) {
    console.error('[Sync] Erro crítico no backup:', error);
  }
}

export async function syncFromSupabase(state) {
  if (!isSupabaseConfigured || !currentUser) return null;
  
  try {
    const uid = currentUser.id;
    console.info('[Sync] Pull from Supabase iniciado...');
    
    // Profiles
    const { data: profiles } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    let isOnboardingCompleted = false;
    if (profiles) {
      isOnboardingCompleted = profiles.onboarding_completed || false;
      state.profile = {
        nickname: profiles.nickname || (state.profile?.nickname || 'Anônimo'),
        displayName: profiles.display_name || (state.profile?.displayName || 'GrokFin User'),
        handle: profiles.handle || (state.profile?.handle || '@grokfin.user'),
        bio: profiles.bio || (state.profile?.bio || ''),
        avatarImage: profiles.avatar_url || (state.profile?.avatarImage || null),
        bannerImage: profiles.banner_url || (state.profile?.bannerImage || null)
      };
    }
    
    // Transactions
    const { data: txs } = await supabase.from('transactions').select('*').eq('user_id', uid);
    if (txs && txs.length) {
      state.transactions = txs.map(t => {
        const [year, month, day] = t.date.split('-');
        return {
          id: t.id,
          date: `${day}/${month}/${year}`,
          desc: t.description,
          cat: t.category,
          value: Number(t.amount),
          payment: t.payment,
          cardId: t.card_id,
          recurringTemplate: t.recurring_template,
          installments: t.installments,
          installmentCurrent: t.installment_current
        };
      });
    } else {
      state.transactions = []; // Usuário não tem txs no Supabase
    }

    // Goals
    const { data: gols } = await supabase.from('goals').select('*').eq('user_id', uid);
    if (gols && gols.length) {
      state.goals = gols.map(g => ({
        id: g.id,
        nome: g.name,
        atual: Number(g.current_amount),
        total: Number(g.target_amount),
        theme: g.theme,
        img: g.custom_image,
        deadline: g.deadline
      }));
    } else {
      state.goals = [];
    }

    // Fixed Expenses
    const { data: fixed } = await supabase.from('fixed_expenses').select('*').eq('user_id', uid);
    if (fixed && fixed.length) {
      state.fixedExpenses = fixed.map(f => ({
        id: f.id,
        name: f.name,
        cat: f.category,
        value: Number(f.amount),
        day: f.execution_day,
        isIncome: f.is_income,
        active: f.is_active
      }));
    } else {
      state.fixedExpenses = [];
    }

    // Budgets
    const { data: buds } = await supabase.from('budgets').select('*').eq('user_id', uid);
    if (buds && buds.length) {
      buds.forEach(b => {
        state.budgets[b.category] = Number(b.limit_amount);
      });
    }

    // Cards and Invoices
    const { data: cards } = await supabase.from('cards').select('*').eq('user_id', uid);
    if (cards && cards.length) {
      const { data: invoices } = await supabase.from('card_invoices').select('*').eq('user_id', uid);
      state.cards = cards.map(c => {
        const cInvs = (invoices || []).filter(inv => inv.card_id === c.id);
        return {
          id: c.id,
          name: c.name,
          flag: c.flag,
          cardType: c.card_type,
          color: c.color,
          limit: Number(c.card_limit),
          closing: c.closing_day,
          due: c.due_day,
          invoices: cInvs.map(inv => ({
            id: inv.id,
            desc: inv.description,
            cat: inv.category,
            value: Number(inv.amount),
            installments: inv.installments,
            installmentCurrent: inv.installment_current
          }))
        };
      });
    } else {
      state.cards = [];
    }

    // Investments
    const { data: invs } = await supabase.from('investments').select('*').eq('user_id', uid);
    if (invs && invs.length) {
      state.investments = invs.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        subtype: i.subtype,
        value: Number(i.current_value),
        cost: Number(i.cost_basis)
      }));
    } else {
      state.investments = [];
    }

    // A flag definitiva que o backend diz que o usuário já completou o onboarding visual
    if (isOnboardingCompleted) {
      state.isNewUser = false;
    } else if ((txs && txs.length) || (gols && gols.length)) {
      state.isNewUser = false;
    }

    console.info('[Sync] Pull from Supabase concluído com sucesso.');
    return true;

  } catch (err) {
    console.error('[Sync] Erro no Pull from Supabase:', err);
    return null;
  }
}
