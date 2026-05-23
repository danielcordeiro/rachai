// Testes das funções financeiras puras do Rachaí.
// Rodar a partir da raiz do projeto:  node tests/unit.mjs
// Sem dependências externas — usa só o runtime do Node (ESM).
import { parseAmountToCents } from "../js/ui.js";
import {
  computeBalances, computeTotals, applyPayments, minimizeTransactions, totalSpent,
} from "../js/settlement.js";

let pass = 0;
let fail = 0;
const eq = (got, exp, msg) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (ok) { pass++; }
  else { fail++; console.log(`  ✗ ${msg}\n      esperado: ${JSON.stringify(exp)}\n      veio:     ${JSON.stringify(got)}`); }
};
const sum = (m) => [...m.values()].reduce((s, x) => s + x, 0);

// ---------------------------------------------------------------------------
console.log("parseAmountToCents — entradas de valor");
// ---------------------------------------------------------------------------
const casos = [
  ["30", 3000], ["30,50", 3050], ["1234,56", 123456],
  ["1.234,56", 123456],                 // pt-BR com milhar
  ["1234.56", 123456], ["1,234.56", 123456], // en-US
  ["1.500", 150000],                    // ponto = milhar (NÃO R$ 1,50)
  ["12.50", 1250], ["12.5", 1250],      // ponto = decimal (1-2 casas)
  ["R$ 1.000,00", 100000], ["  42  ", 4200], ["1000", 100000],
  ["1.234.567", 123456700], ["100.000", 10000000],
  ["10,999", 1100],                     // arredonda pro centavo
  ["0", 0], ["0,00", 0],
  ["", null], ["abc", null], ["-5", null], ["R$", null],
];
for (const [inp, exp] of casos) eq(parseAmountToCents(inp), exp, `parse("${inp}")`);

// ---------------------------------------------------------------------------
console.log("computeBalances — divisão igual com sobra de centavos");
// ---------------------------------------------------------------------------
{
  const people = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const exp = [{ payer_id: "a", amount_cents: 10000, participant_ids: ["a", "b", "c"] }];
  const bal = computeBalances(people, exp);
  eq(bal.get("a"), 10000 - 3334, "saldo A (pagou 100, deve 33,34)");
  eq(bal.get("b"), -3333, "saldo B");
  eq(bal.get("c"), -3333, "saldo C");
  eq(sum(bal), 0, "soma dos saldos = 0");
}

// ---------------------------------------------------------------------------
console.log("computeTotals — pago e consumido somam o total");
// ---------------------------------------------------------------------------
{
  const people = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const exp = [
    { payer_id: "a", amount_cents: 10000, participant_ids: ["a", "b", "c"] },
    { payer_id: "b", amount_cents: 3001, participant_ids: ["a", "b"] },
  ];
  const t = computeTotals(people, exp);
  const consumed = [...t.values()].reduce((s, x) => s + x.consumed, 0);
  const paid = [...t.values()].reduce((s, x) => s + x.paid, 0);
  eq(consumed, totalSpent(exp), "soma consumido = total");
  eq(paid, totalSpent(exp), "soma pago = total");
}

// ---------------------------------------------------------------------------
console.log("applyPayments — acerto vivo (pagamentos abatem o saldo)");
// ---------------------------------------------------------------------------
{
  const people = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const exp = [{ payer_id: "a", amount_cents: 9000, participant_ids: ["a", "b", "c"] }];
  const gross = computeBalances(people, exp); // a:+6000 b:-3000 c:-3000
  const net = applyPayments(gross, [{ from_id: "b", to_id: "a", amount_cents: 3000 }]);
  eq(net.get("a"), 3000, "A após receber de B");
  eq(net.get("b"), 0, "B quitado");
  eq(net.get("c"), -3000, "C inalterado");
  eq(sum(net), 0, "soma preservada = 0");
  eq(minimizeTransactions(net), [{ from: "c", to: "a", amount_cents: 3000 }], "transferência restante");
}

// ---------------------------------------------------------------------------
console.log("nova despesa após pagamento não perde o que já foi pago");
// ---------------------------------------------------------------------------
{
  const people = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const exp = [
    { payer_id: "a", amount_cents: 9000, participant_ids: ["a", "b", "c"] }, // a+6000 b-3000 c-3000
    { payer_id: "b", amount_cents: 3000, participant_ids: ["a", "b", "c"] }, // b+2000 a-1000 c-1000
  ];
  const pay = [{ from_id: "b", to_id: "a", amount_cents: 3000 }];
  const net = applyPayments(computeBalances(people, exp), pay);
  eq(net.get("a"), 2000, "A net");   // +6000-1000-3000
  eq(net.get("b"), 2000, "B net");   // -3000+2000+3000
  eq(net.get("c"), -4000, "C net");  // -3000-1000
  eq(sum(net), 0, "soma = 0");
}

// ---------------------------------------------------------------------------
console.log("propriedade — 200 cenários aleatórios sempre quitam");
// ---------------------------------------------------------------------------
{
  let seed = 987654321;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let trial = 0; trial < 200; trial++) {
    const n = 2 + Math.floor(rnd() * 7);
    const people = Array.from({ length: n }, (_, i) => ({ id: "p" + i }));
    const exp = [];
    const nExp = 1 + Math.floor(rnd() * 30);
    for (let k = 0; k < nExp; k++) {
      const payer = people[Math.floor(rnd() * n)].id;
      const amt = 1 + Math.floor(rnd() * 200000);
      const parts = people.filter(() => rnd() > 0.4).map((p) => p.id);
      if (!parts.length) parts.push(people[0].id);
      exp.push({ payer_id: payer, amount_cents: amt, participant_ids: parts });
    }
    // pagamentos parciais aleatórios
    const pays = [];
    const nPay = Math.floor(rnd() * 4);
    for (let k = 0; k < nPay && n >= 2; k++) {
      let f = Math.floor(rnd() * n), t = Math.floor(rnd() * n);
      if (f === t) t = (t + 1) % n;
      pays.push({ from_id: "p" + f, to_id: "p" + t, amount_cents: 1 + Math.floor(rnd() * 5000) });
    }
    const net = applyPayments(computeBalances(people, exp), pays);
    if (sum(net) !== 0) { eq(sum(net), 0, `trial ${trial}: soma net`); continue; }
    const tr = minimizeTransactions(net);
    if (tr.some((x) => x.amount_cents <= 0)) { eq(true, false, `trial ${trial}: transferência <= 0`); continue; }
    const check = new Map(net);
    for (const x of tr) {
      check.set(x.from, check.get(x.from) + x.amount_cents);
      check.set(x.to, check.get(x.to) - x.amount_cents);
    }
    const allZero = [...check.values()].every((v) => v === 0);
    eq(allZero, true, `trial ${trial}: transferências quitam todos`);
    eq(tr.length <= n - 1, true, `trial ${trial}: nº transferências <= n-1`);
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${fail === 0 ? "✅ TODOS PASSARAM" : "❌ FALHOU"} — ${pass} ok, ${fail} falha(s)`);
process.exit(fail === 0 ? 0 : 1);
