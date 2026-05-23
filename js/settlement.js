// Cálculo do acerto (tudo em centavos para evitar erro de ponto flutuante).

/**
 * Saldo de cada pessoa = quanto pagou − quanto devia.
 * Divisão igual; o "resto" da divisão (em centavos) vai para os primeiros
 * participantes, garantindo que a soma feche exatamente o valor da despesa.
 * @returns {Map<string, number>} id da pessoa -> saldo em centavos (>0 recebe, <0 paga)
 */
export function computeBalances(people, expenses) {
  const bal = new Map();
  for (const p of people) bal.set(p.id, 0);

  for (const x of expenses) {
    const parts = x.participant_ids || [];
    const n = parts.length;
    if (n === 0) continue;
    const amount = x.amount_cents;
    const base = Math.floor(amount / n);
    const remainder = amount - base * n;

    // quem pagou recebe o valor cheio de volta
    bal.set(x.payer_id, (bal.get(x.payer_id) || 0) + amount);
    // cada participante deve sua parte; os primeiros `remainder` pagam +1 centavo
    parts.forEach((pid, i) => {
      const share = base + (i < remainder ? 1 : 0);
      bal.set(pid, (bal.get(pid) || 0) - share);
    });
  }
  return bal;
}

/**
 * Gera a lista de transferências minimizando a QUANTIDADE de transações:
 * casa repetidamente o maior devedor com o maior credor (greedy).
 * @returns {Array<{from: string, to: string, amount_cents: number}>}
 */
export function minimizeTransactions(balances) {
  const creditors = [];
  const debtors = [];
  for (const [id, amt] of balances) {
    if (amt > 0) creditors.push({ id, amt });
    else if (amt < 0) debtors.push({ id, amt: -amt });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) {
      transfers.push({ from: debtors[i].id, to: creditors[j].id, amount_cents: pay });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return transfers;
}

/** Total geral gasto no evento (em centavos). */
export function totalSpent(expenses) {
  return expenses.reduce((s, x) => s + x.amount_cents, 0);
}
