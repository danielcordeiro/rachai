// Camada de acesso ao Supabase. Todo acesso passa pelas funções RPC
// (SECURITY DEFINER) — a publishable key não consegue ler as tabelas direto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.RACHAI_CONFIG || {};

export const isConfigured =
  !!cfg.SUPABASE_URL &&
  !!cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("SUA_") &&
  !cfg.SUPABASE_ANON_KEY.includes("SUA_");

const supabase = isConfigured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
  : null;

/** Executa uma RPC e devolve os dados, lançando erro amigável em caso de falha. */
async function rpc(fn, params) {
  if (!supabase) throw new Error("App não configurado (veja o config.js).");
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new Error(error.message || "Erro ao falar com o servidor.");
  return data;
}

/** Id anônimo do navegador (não-PII), só para contar visitantes únicos. */
function sessionId() {
  const KEY = "rachai:sid";
  try {
    let sid = localStorage.getItem(KEY);
    if (!sid) {
      sid = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
      localStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return ""; // localStorage indisponível: segue sem sid
  }
}

export const db = {
  createEvent: (name) => rpc("create_event", { p_name: name }),
  getEvent: (eventId) => rpc("get_event", { p_event: eventId }),

  addPerson: (eventId, name) => rpc("add_person", { p_event: eventId, p_name: name }),
  renamePerson: (personId, name) => rpc("rename_person", { p_person: personId, p_name: name }),
  deletePerson: (personId) => rpc("delete_person", { p_person: personId }),

  addGroup: (eventId, name, memberIds) =>
    rpc("add_group", { p_event: eventId, p_name: name, p_member_ids: memberIds }),
  updateGroup: (groupId, name, memberIds) =>
    rpc("update_group", { p_group: groupId, p_name: name, p_member_ids: memberIds }),
  deleteGroup: (groupId) => rpc("delete_group", { p_group: groupId }),

  addExpense: (eventId, payerId, description, amountCents, participantIds) =>
    rpc("add_expense", {
      p_event: eventId,
      p_payer: payerId,
      p_description: description,
      p_amount_cents: amountCents,
      p_participant_ids: participantIds,
    }),
  updateExpense: (expenseId, payerId, description, amountCents, participantIds) =>
    rpc("update_expense", {
      p_expense: expenseId,
      p_payer: payerId,
      p_description: description,
      p_amount_cents: amountCents,
      p_participant_ids: participantIds,
    }),
  deleteExpense: (expenseId) => rpc("delete_expense", { p_expense: expenseId }),

  setEventClosed: (eventId, closed) =>
    rpc("set_event_closed", { p_event: eventId, p_closed: closed }),

  addShoppingItem: (eventId, name, qty) =>
    rpc("add_shopping_item", { p_event: eventId, p_name: name, p_qty: qty }),
  updateShoppingItem: (itemId, name, qty, bought, leftover, missing) =>
    rpc("update_shopping_item", {
      p_item: itemId,
      p_name: name,
      p_qty: qty,
      p_bought: bought,
      p_leftover: leftover,
      p_missing: missing,
    }),
  deleteShoppingItem: (itemId) => rpc("delete_shopping_item", { p_item: itemId }),

  addPayment: (eventId, fromId, toId, amountCents) =>
    rpc("add_payment", { p_event: eventId, p_from: fromId, p_to: toId, p_amount_cents: amountCents }),
  deletePayment: (paymentId) => rpc("delete_payment", { p_payment: paymentId }),

  getApiToken: (eventId) => rpc("get_api_token", { p_event: eventId }),
  rotateApiToken: (eventId) => rpc("rotate_api_token", { p_event: eventId }),

  /** Registra um evento de uso. Fire-and-forget: nunca lança nem bloqueia a UI. */
  track(name, path) {
    if (!supabase) return;
    supabase.rpc("track", {
      p_name: name,
      p_path: path || "",
      p_session: sessionId(),
      p_referrer: (typeof document !== "undefined" && document.referrer) || "",
    }).then(() => {}, () => {}); // ignora qualquer falha
  },
};
