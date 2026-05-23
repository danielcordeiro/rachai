# Testes

Cobrem as **funções financeiras puras** (parsing de valores e cálculo de acerto),
que são a parte crítica do app. Sem dependências externas — só o Node.

## Rodar

```bash
npm test
# ou
node tests/unit.mjs
```

Sai com código **0** se tudo passar, **1** se algo falhar (bom para CI / pre-commit).

## O que é coberto (`unit.mjs`)

- **`parseAmountToCents`** — conversão de valor digitado para centavos, incluindo
  a desambiguação pt-BR/en-US (ex.: `"1.500"` → R$ 1.500,00, e não R$ 1,50).
- **`computeBalances`** — divisão igual com distribuição do resto em centavos;
  a soma dos saldos é sempre 0.
- **`computeTotals`** — "pago" e "consumido" por pessoa somam o total do evento.
- **`applyPayments`** — acerto vivo: pagamentos abatem o saldo e preservam a soma.
- **Nova despesa após pagamento** — não perde o que já foi pago.
- **Teste de propriedade** — 200 cenários aleatórios (pessoas, despesas e
  pagamentos parciais): as transferências sugeridas sempre quitam todos os saldos,
  nunca são ≤ 0, e o total é ≤ n−1 transferências.

> Estas funções vivem em `js/settlement.js` e `js/ui.js` e são importadas
> diretamente, então os testes exercitam exatamente o código que roda no navegador.
