// Rachaí — app principal: roteamento por hash, telas e formulários.
import { db, isConfigured } from "./db.js";
import { el, fmtBRL, parseAmountToCents, toast, confirmAction, copyText, clear } from "./ui.js";
import { computeBalances, minimizeTransactions, totalSpent } from "./settlement.js";

const root = () => document.getElementById("app");

const state = {
  eventId: null,
  snapshot: null, // { event, people, groups, expenses }
  tab: "despesas",
  loading: false,
};

// ---------------------------------------------------------------------------
// "Quem é você?" por evento (localStorage)
// ---------------------------------------------------------------------------
const meKey = (eventId) => `rachai:me:${eventId}`;
const getMe = (eventId) => localStorage.getItem(meKey(eventId));
const setMe = (eventId, personId) => {
  if (personId) localStorage.setItem(meKey(eventId), personId);
  else localStorage.removeItem(meKey(eventId));
};

// ---------------------------------------------------------------------------
// Helpers de dados
// ---------------------------------------------------------------------------
const peopleMap = () => {
  const m = new Map();
  for (const p of state.snapshot?.people || []) m.set(p.id, p);
  return m;
};
const nameOf = (id) => peopleMap().get(id)?.name || "(removido)";

// ---------------------------------------------------------------------------
// Roteamento
// ---------------------------------------------------------------------------
function parseRoute() {
  const h = location.hash.replace(/^#/, "");
  const m = h.match(/^\/e\/([0-9a-fA-F-]{36})/);
  return m ? { name: "event", eventId: m[1] } : { name: "home" };
}

async function router() {
  const r = parseRoute();
  if (r.name === "event") {
    if (state.eventId !== r.eventId) {
      state.eventId = r.eventId;
      state.snapshot = null;
      state.tab = "despesas";
      await loadSnapshot();
    } else {
      render();
    }
  } else {
    state.eventId = null;
    state.snapshot = null;
    render();
  }
}

async function loadSnapshot() {
  state.loading = true;
  render();
  try {
    const snap = await db.getEvent(state.eventId);
    if (!snap) {
      state.snapshot = null;
      state.loading = false;
      renderNotFound();
      return;
    }
    state.snapshot = snap;
  } catch (e) {
    toast(e.message, "error");
  } finally {
    state.loading = false;
    if (state.snapshot) render();
  }
}

async function reload() {
  try {
    state.snapshot = await db.getEvent(state.eventId);
    render();
  } catch (e) {
    toast(e.message, "error");
  }
}

// ---------------------------------------------------------------------------
// Render principal
// ---------------------------------------------------------------------------
function render() {
  if (!isConfigured) return renderNotConfigured();
  const r = parseRoute();
  if (r.name === "home") return renderHome();
  if (state.loading && !state.snapshot) return renderLoading();
  if (state.snapshot) return renderEvent();
}

function shell(...children) {
  const app = root();
  clear(app);
  app.append(...children);
}

function header(subtitle) {
  return el("header", { class: "topbar" }, [
    el("a", { class: "brand", href: "#/" }, [
      el("span", { class: "brand__logo", text: "🧮" }),
      el("span", { class: "brand__name", text: "Rachaí" }),
    ]),
    subtitle ? el("span", { class: "topbar__sub", text: subtitle }) : null,
  ]);
}

// ---------------------------------------------------------------------------
// Telas de estado
// ---------------------------------------------------------------------------
function renderNotConfigured() {
  shell(
    header(),
    el("main", { class: "wrap" }, [
      el("div", { class: "card empty" }, [
        el("h2", { text: "App não configurado" }),
        el("p", {
          html: "Edite o arquivo <code>config.js</code> com a URL e a chave pública do seu projeto Supabase.",
        }),
      ]),
    ])
  );
}

function renderLoading() {
  shell(header(), el("main", { class: "wrap" }, [el("div", { class: "spinner" })]));
}

function renderNotFound() {
  shell(
    header(),
    el("main", { class: "wrap" }, [
      el("div", { class: "card empty" }, [
        el("h2", { text: "Evento não encontrado 😕" }),
        el("p", { text: "O link pode estar incorreto ou o evento foi removido." }),
        el("a", { class: "btn btn--primary", href: "#/", text: "Criar um novo evento" }),
      ]),
    ])
  );
}

// ---------------------------------------------------------------------------
// HOME — criar evento
// ---------------------------------------------------------------------------
function renderHome() {
  const input = el("input", {
    class: "input",
    type: "text",
    placeholder: "Ex.: Churrasco do sábado, Viagem pra praia…",
    maxlength: "80",
    autocomplete: "off",
  });
  const create = async () => {
    const name = input.value.trim();
    if (!name) return toast("Dê um nome ao evento.", "error");
    btn.disabled = true;
    btn.textContent = "Criando…";
    try {
      const id = await db.createEvent(name);
      location.hash = `#/e/${id}`;
    } catch (e) {
      toast(e.message, "error");
      btn.disabled = false;
      btn.textContent = "Criar evento";
    }
  };
  input.addEventListener("keydown", (e) => e.key === "Enter" && create());
  const btn = el("button", { class: "btn btn--primary btn--lg", text: "Criar evento", onClick: create });

  shell(
    header(),
    el("main", { class: "wrap hero" }, [
      el("div", { class: "hero__pitch" }, [
        el("h1", { class: "hero__title", text: "Rachou, resolveu." }),
        el("p", {
          class: "hero__sub",
          text: "Crie um evento, compartilhe o link, cada um lança suas despesas e o Rachaí calcula quem paga quem — com o mínimo de transferências.",
        }),
      ]),
      el("div", { class: "card" }, [
        el("label", { class: "label", text: "Nome do evento" }),
        input,
        btn,
        el("ul", { class: "hero__steps" }, [
          el("li", { text: "1. Cadastre as pessoas (e grupos, se quiser)." }),
          el("li", { text: "2. Compartilhe o link com a galera." }),
          el("li", { text: "3. Cada um lança o que pagou." }),
          el("li", { text: "4. Toque em Acerto e veja quem paga quem." }),
        ]),
      ]),
    ])
  );
  setTimeout(() => input.focus(), 0);
}

// ---------------------------------------------------------------------------
// EVENTO
// ---------------------------------------------------------------------------
function renderEvent() {
  const { event } = state.snapshot;
  const tabs = el("nav", { class: "tabs" }, [
    tabBtn("despesas", "Despesas"),
    tabBtn("compras", "Compras"),
    tabBtn("pessoas", "Pessoas"),
    tabBtn("acerto", "Acerto"),
  ]);

  const body = el("div", { class: "tabbody" });
  if (state.tab === "pessoas") body.append(peopleTab());
  else if (state.tab === "compras") body.append(shoppingTab());
  else if (state.tab === "acerto") body.append(settlementTab());
  else body.append(expensesTab());

  shell(
    header(),
    el("main", { class: "wrap" }, [
      eventHeader(event),
      tabs,
      body,
    ])
  );
}

function tabBtn(key, label) {
  return el("button", {
    class: "tab" + (state.tab === key ? " tab--active" : ""),
    text: label,
    onClick: () => {
      state.tab = key;
      render();
    },
  });
}

function eventHeader(event) {
  const link = `${location.origin}${location.pathname}#/e/${event.id}`;
  const share = async () => {
    const url = link;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Rachaí — ${event.name}`, url });
        return;
      } catch { /* usuário cancelou */ }
    }
    const ok = await copyText(url);
    toast(ok ? "Link copiado!" : "Não consegui copiar o link.", ok ? "success" : "error");
  };

  const me = getMe(event.id);
  const meLabel = me ? `Você: ${nameOf(me)}` : "Quem é você?";

  return el("div", { class: "evhead" }, [
    el("div", { class: "evhead__top" }, [
      el("h1", { class: "evhead__title", text: event.name }),
      event.closed ? el("span", { class: "badge badge--closed", text: "Fechado" }) : null,
    ]),
    el("div", { class: "evhead__actions" }, [
      el("button", { class: "btn btn--ghost", onClick: share }, [
        el("span", { text: "🔗 Compartilhar link" }),
      ]),
      el("button", {
        class: "btn btn--ghost",
        text: meLabel,
        onClick: () => openWhoAmI(),
      }),
    ]),
  ]);
}

function openWhoAmI() {
  const people = state.snapshot.people;
  const current = getMe(state.eventId);
  const list = el("div", { class: "choicelist" },
    people.length
      ? people.map((p) =>
          el("button", {
            class: "choice" + (p.id === current ? " choice--on" : ""),
            text: p.name,
            onClick: () => {
              setMe(state.eventId, p.id);
              close();
              render();
            },
          })
        )
      : [el("p", { class: "muted", text: "Cadastre pessoas primeiro na aba Pessoas." })]
  );
  const clearBtn = el("button", {
    class: "btn btn--ghost",
    text: "Não sou ninguém da lista",
    onClick: () => { setMe(state.eventId, null); close(); render(); },
  });
  const { close } = openModal("Quem é você?", el("div", {}, [list, clearBtn]));
}

// ---------------------------------------------------------------------------
// ABA PESSOAS (+ grupos)
// ---------------------------------------------------------------------------
function peopleTab() {
  const { people, groups } = state.snapshot;
  const wrap = el("div", {});

  // adicionar pessoa
  const nameInput = el("input", { class: "input", placeholder: "Nome da pessoa", maxlength: "60" });
  const add = async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      await db.addPerson(state.eventId, name);
      nameInput.value = "";
      await reload();
      nameInput.focus();
    } catch (e) { toast(e.message, "error"); }
  };
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && add());

  wrap.append(
    el("div", { class: "addrow" }, [
      nameInput,
      el("button", { class: "btn btn--primary", text: "Adicionar", onClick: add }),
    ])
  );

  // lista de pessoas
  if (!people.length) {
    wrap.append(el("p", { class: "muted pad", text: "Nenhuma pessoa ainda. Adicione a galera acima." }));
  } else {
    wrap.append(
      el("ul", { class: "list" }, people.map((p) =>
        el("li", { class: "list__item" }, [
          el("span", { class: "list__name", text: p.name }),
          el("div", { class: "list__actions" }, [
            iconBtn("✏️", "Renomear", () => renamePerson(p)),
            iconBtn("🗑️", "Excluir", () => removePerson(p)),
          ]),
        ])
      ))
    );
  }

  // grupos
  wrap.append(el("h3", { class: "section", text: "Grupos" }));
  wrap.append(el("p", { class: "muted small", text: "Atalhos para pré-selecionar pessoas ao lançar uma despesa." }));

  if (groups.length) {
    wrap.append(
      el("ul", { class: "list" }, groups.map((g) =>
        el("li", { class: "list__item" }, [
          el("div", {}, [
            el("span", { class: "list__name", text: g.name }),
            el("span", { class: "muted small", text: ` · ${g.member_ids.length} pessoa(s)` }),
          ]),
          el("div", { class: "list__actions" }, [
            iconBtn("✏️", "Editar", () => openGroupForm(g)),
            iconBtn("🗑️", "Excluir", () => removeGroup(g)),
          ]),
        ])
      ))
    );
  }
  wrap.append(
    el("button", {
      class: "btn btn--ghost btn--block",
      text: "+ Novo grupo",
      onClick: () => openGroupForm(null),
      disabled: people.length === 0 ? "" : null,
    })
  );

  return wrap;
}

async function renamePerson(p) {
  const name = window.prompt("Novo nome:", p.name);
  if (name == null) return;
  if (!name.trim()) return toast("Nome não pode ficar vazio.", "error");
  try {
    await db.renamePerson(p.id, name.trim());
    await reload();
  } catch (e) { toast(e.message, "error"); }
}

async function removePerson(p) {
  if (!confirmAction(`Excluir "${p.name}"?`)) return;
  try {
    await db.deletePerson(p.id);
    if (getMe(state.eventId) === p.id) setMe(state.eventId, null);
    await reload();
  } catch (e) { toast(e.message, "error"); }
}

function openGroupForm(group) {
  const isEdit = !!group;
  const people = state.snapshot.people;
  const nameInput = el("input", {
    class: "input",
    placeholder: "Nome do grupo (ex.: Quarto 1, Casados…)",
    value: isEdit ? group.name : "",
    maxlength: "60",
  });
  const selected = new Set(isEdit ? group.member_ids : []);
  const checks = el("div", { class: "checks" }, people.map((p) =>
    personCheck(p, selected.has(p.id), (on) => on ? selected.add(p.id) : selected.delete(p.id))
  ));

  const save = async () => {
    const name = nameInput.value.trim();
    if (!name) return toast("Dê um nome ao grupo.", "error");
    try {
      if (isEdit) await db.updateGroup(group.id, name, [...selected]);
      else await db.addGroup(state.eventId, name, [...selected]);
      close();
      await reload();
    } catch (e) { toast(e.message, "error"); }
  };

  const { close } = openModal(isEdit ? "Editar grupo" : "Novo grupo",
    el("div", {}, [
      el("label", { class: "label", text: "Nome" }),
      nameInput,
      el("label", { class: "label", text: "Membros" }),
      checks,
      el("button", { class: "btn btn--primary btn--block", text: "Salvar", onClick: save }),
    ])
  );
}

async function removeGroup(g) {
  if (!confirmAction(`Excluir o grupo "${g.name}"? (as pessoas continuam)`)) return;
  try {
    await db.deleteGroup(g.id);
    await reload();
  } catch (e) { toast(e.message, "error"); }
}

// ---------------------------------------------------------------------------
// ABA DESPESAS
// ---------------------------------------------------------------------------
function expensesTab() {
  const { people, expenses } = state.snapshot;
  const wrap = el("div", {});

  if (!people.length) {
    wrap.append(el("p", { class: "muted pad", text: "Cadastre as pessoas na aba Pessoas antes de lançar despesas." }));
    return wrap;
  }

  wrap.append(
    el("button", {
      class: "btn btn--primary btn--block",
      text: "+ Nova despesa",
      onClick: () => openExpenseForm(null),
    })
  );

  if (!expenses.length) {
    wrap.append(el("p", { class: "muted pad", text: "Nenhuma despesa lançada ainda." }));
    return wrap;
  }

  wrap.append(
    el("div", { class: "summary" }, [
      el("span", { text: "Total do evento" }),
      el("strong", { text: fmtBRL(totalSpent(expenses)) }),
    ])
  );

  wrap.append(
    el("ul", { class: "list" }, expenses.map((x) => {
      const parts = x.participant_ids.map(nameOf).join(", ");
      const isAll = x.participant_ids.length === people.length;
      return el("li", { class: "expense" }, [
        el("div", { class: "expense__main", onClick: () => openExpenseForm(x) }, [
          el("div", { class: "expense__desc", text: x.description || "Despesa" }),
          el("div", { class: "expense__meta" }, [
            el("span", { text: `Pagou: ${nameOf(x.payer_id)}` }),
            el("span", { text: " · " }),
            el("span", { text: isAll ? "Todos" : `${x.participant_ids.length}: ${parts}` }),
          ]),
        ]),
        el("div", { class: "expense__right" }, [
          el("span", { class: "expense__amount", text: fmtBRL(x.amount_cents) }),
          iconBtn("🗑️", "Excluir", () => removeExpense(x)),
        ]),
      ]);
    }))
  );

  return wrap;
}

function openExpenseForm(expense) {
  const isEdit = !!expense;
  const { people, groups } = state.snapshot;

  const descInput = el("input", {
    class: "input",
    placeholder: "Descrição (ex.: Pizza, Uber, Mercado)",
    value: isEdit ? expense.description : "",
    maxlength: "80",
  });
  const amountInput = el("input", {
    class: "input",
    type: "text",
    inputmode: "decimal",
    placeholder: "0,00",
    value: isEdit ? (expense.amount_cents / 100).toFixed(2).replace(".", ",") : "",
  });

  const defaultPayer = isEdit ? expense.payer_id : (getMe(state.eventId) || people[0].id);
  const payerSelect = el("select", { class: "input" },
    people.map((p) => el("option", { value: p.id, text: p.name, selected: p.id === defaultPayer ? "" : null }))
  );

  // participantes
  const selected = new Set(isEdit ? expense.participant_ids : people.map((p) => p.id));
  const checkNodes = new Map();
  const personChecks = el("div", { class: "checks" }, people.map((p) => {
    const node = personCheck(p, selected.has(p.id), (on) => {
      on ? selected.add(p.id) : selected.delete(p.id);
      syncAllToggle();
    });
    checkNodes.set(p.id, node.querySelector("input"));
    return node;
  }));

  const allToggle = el("label", { class: "alltoggle" }, [
    el("input", { type: "checkbox", checked: selected.size === people.length ? "" : null,
      onChange: (e) => {
        selected.clear();
        if (e.target.checked) people.forEach((p) => selected.add(p.id));
        for (const [id, input] of checkNodes) input.checked = selected.has(id);
      },
    }),
    el("span", { text: "Todos" }),
  ]);
  function syncAllToggle() {
    allToggle.querySelector("input").checked = selected.size === people.length;
  }

  const groupChips = groups.length
    ? el("div", { class: "chips" }, groups.map((g) =>
        el("button", { class: "chip", text: g.name, onClick: () => {
          selected.clear();
          g.member_ids.forEach((id) => selected.add(id));
          for (const [id, input] of checkNodes) input.checked = selected.has(id);
          syncAllToggle();
        }})
      ))
    : null;

  const save = async () => {
    const cents = parseAmountToCents(amountInput.value);
    if (cents == null || cents <= 0) return toast("Informe um valor válido.", "error");
    if (selected.size === 0) return toast("Selecione ao menos um participante.", "error");
    try {
      const ids = [...selected];
      if (isEdit) await db.updateExpense(expense.id, payerSelect.value, descInput.value, cents, ids);
      else await db.addExpense(state.eventId, payerSelect.value, descInput.value, cents, ids);
      close();
      await reload();
    } catch (e) { toast(e.message, "error"); }
  };

  const { close } = openModal(isEdit ? "Editar despesa" : "Nova despesa",
    el("div", {}, [
      el("label", { class: "label", text: "Descrição" }),
      descInput,
      el("label", { class: "label", text: "Valor" }),
      amountInput,
      el("label", { class: "label", text: "Quem pagou" }),
      payerSelect,
      el("div", { class: "label-row" }, [
        el("label", { class: "label", text: "Dividir entre" }),
        allToggle,
      ]),
      groupChips,
      personChecks,
      el("button", { class: "btn btn--primary btn--block", text: "Salvar", onClick: save }),
    ])
  );
  setTimeout(() => descInput.focus(), 0);
}

async function removeExpense(x) {
  if (!confirmAction(`Excluir "${x.description || "esta despesa"}"?`)) return;
  try {
    await db.deleteExpense(x.id);
    await reload();
  } catch (e) { toast(e.message, "error"); }
}

// ---------------------------------------------------------------------------
// ABA ACERTO
// ---------------------------------------------------------------------------
function settlementTab() {
  const { people, expenses } = state.snapshot;
  const wrap = el("div", {});

  if (!expenses.length) {
    wrap.append(el("p", { class: "muted pad", text: "Sem despesas para acertar ainda." }));
    return wrap;
  }

  const balances = computeBalances(people, expenses);
  const transfers = minimizeTransactions(balances);

  // resumo de transferências
  wrap.append(el("h3", { class: "section", text: "Quem paga quem" }));
  if (!transfers.length) {
    wrap.append(el("div", { class: "card empty", text: "Tudo certo — ninguém deve nada! 🎉" }));
  } else {
    wrap.append(
      el("ul", { class: "transfers" }, transfers.map((t) =>
        el("li", { class: "transfer" }, [
          el("span", { class: "transfer__from", text: nameOf(t.from) }),
          el("span", { class: "transfer__arrow", text: "→" }),
          el("span", { class: "transfer__to", text: nameOf(t.to) }),
          el("span", { class: "transfer__amount", text: fmtBRL(t.amount_cents) }),
        ])
      ))
    );
    wrap.append(
      el("p", { class: "muted small center", text: `${transfers.length} transferência(s) para quitar tudo.` })
    );
    wrap.append(
      el("button", {
        class: "btn btn--ghost btn--block",
        text: "📋 Copiar resumo",
        onClick: () => copyResume(transfers),
      })
    );
  }

  // saldos individuais
  wrap.append(el("h3", { class: "section", text: "Saldo de cada um" }));
  wrap.append(
    el("ul", { class: "list" }, people.map((p) => {
      const b = balances.get(p.id) || 0;
      const cls = b > 0 ? "pos" : b < 0 ? "neg" : "zero";
      const label = b > 0 ? "a receber" : b < 0 ? "a pagar" : "quitado";
      return el("li", { class: "list__item" }, [
        el("span", { class: "list__name", text: p.name }),
        el("span", { class: `balance balance--${cls}`, text: `${fmtBRL(Math.abs(b))} ${label}` }),
      ]);
    }))
  );

  return wrap;
}

async function copyResume(transfers) {
  const { event } = state.snapshot;
  const lines = [
    `💸 Acerto — ${event.name}`,
    ...transfers.map((t) => `• ${nameOf(t.from)} paga ${fmtBRL(t.amount_cents)} para ${nameOf(t.to)}`),
  ];
  const ok = await copyText(lines.join("\n"));
  toast(ok ? "Resumo copiado!" : "Não consegui copiar.", ok ? "success" : "error");
}

// ---------------------------------------------------------------------------
// ABA COMPRAS (lista de compras)
// ---------------------------------------------------------------------------
function shoppingTab() {
  const items = state.snapshot.shopping || [];
  const wrap = el("div", {});

  // adicionar item rápido
  const nameInput = el("input", { class: "input", placeholder: "Item (ex.: Gelo, Cerveja, Isca)", maxlength: "80" });
  const qtyInput = el("input", { class: "input input--qty", placeholder: "Qtd", maxlength: "20" });
  const add = async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    try {
      await db.addShoppingItem(state.eventId, name, qtyInput.value.trim());
      nameInput.value = "";
      qtyInput.value = "";
      await reload();
      nameInput.focus();
    } catch (e) { toast(e.message, "error"); }
  };
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && qtyInput.focus());
  qtyInput.addEventListener("keydown", (e) => e.key === "Enter" && add());

  wrap.append(
    el("div", { class: "addrow" }, [
      nameInput,
      qtyInput,
      el("button", { class: "btn btn--primary", text: "Add", onClick: add }),
    ])
  );

  if (!items.length) {
    wrap.append(el("p", { class: "muted pad", text: "Lista vazia. Adicione os itens que precisam ser comprados." }));
    return wrap;
  }

  const boughtCount = items.filter((i) => i.bought).length;
  wrap.append(
    el("div", { class: "summary" }, [
      el("span", { text: "Comprados" }),
      el("strong", { text: `${boughtCount}/${items.length}` }),
    ])
  );

  wrap.append(
    el("ul", { class: "list" }, items.map((item) => {
      const check = el("input", { type: "checkbox", checked: item.bought ? "" : null,
        onChange: () => toggleBought(item) });
      const badges = el("div", { class: "shop__badges" }, [
        item.leftover ? el("span", { class: "tag tag--left", text: `↩️ sobrou: ${item.leftover}` }) : null,
        item.missing ? el("span", { class: "tag tag--miss", text: `⚠️ faltou: ${item.missing}` }) : null,
      ]);
      return el("li", { class: "shop" + (item.bought ? " shop--done" : "") }, [
        el("label", { class: "shop__check" }, [check]),
        el("div", { class: "shop__main", onClick: () => openItemForm(item) }, [
          el("div", { class: "shop__name" }, [
            el("span", { text: item.name }),
            item.qty ? el("span", { class: "shop__qty", text: item.qty }) : null,
          ]),
          (item.leftover || item.missing) ? badges : null,
        ]),
        iconBtn("🗑️", "Excluir", () => removeItem(item)),
      ]);
    }))
  );

  wrap.append(
    el("button", { class: "btn btn--ghost btn--block", text: "📋 Copiar lista", onClick: () => copyShopping(items) })
  );

  return wrap;
}

async function toggleBought(item) {
  try {
    await db.updateShoppingItem(item.id, item.name, item.qty, !item.bought, item.leftover, item.missing);
    await reload();
  } catch (e) { toast(e.message, "error"); }
}

function openItemForm(item) {
  const nameInput = el("input", { class: "input", value: item.name, maxlength: "80" });
  const qtyInput = el("input", { class: "input", value: item.qty, placeholder: "ex.: 2 kg, 3 caixas", maxlength: "20" });
  const boughtInput = el("input", { type: "checkbox", checked: item.bought ? "" : null });
  const leftoverInput = el("input", { class: "input", value: item.leftover, placeholder: "o que sobrou (ex.: 1 pacote)", maxlength: "80" });
  const missingInput = el("input", { class: "input", value: item.missing, placeholder: "o que faltou (ex.: mais 2 kg)", maxlength: "80" });

  const save = async () => {
    const name = nameInput.value.trim();
    if (!name) return toast("Nome do item é obrigatório.", "error");
    try {
      await db.updateShoppingItem(
        item.id, name, qtyInput.value.trim(),
        boughtInput.checked, leftoverInput.value.trim(), missingInput.value.trim()
      );
      close();
      await reload();
    } catch (e) { toast(e.message, "error"); }
  };

  const { close } = openModal("Editar item",
    el("div", {}, [
      el("label", { class: "label", text: "Item" }),
      nameInput,
      el("label", { class: "label", text: "Quantidade" }),
      qtyInput,
      el("label", { class: "check check--inline" }, [boughtInput, el("span", { text: "Comprado" })]),
      el("hr", { class: "divider" }),
      el("p", { class: "muted small", text: "Preencha após o evento — fica salvo para consultar no próximo:" }),
      el("label", { class: "label", text: "Sobrou" }),
      leftoverInput,
      el("label", { class: "label", text: "Faltou" }),
      missingInput,
      el("button", { class: "btn btn--primary btn--block", text: "Salvar", onClick: save }),
    ])
  );
}

async function removeItem(item) {
  if (!confirmAction(`Excluir "${item.name}" da lista?`)) return;
  try {
    await db.deleteShoppingItem(item.id);
    await reload();
  } catch (e) { toast(e.message, "error"); }
}

async function copyShopping(items) {
  const { event } = state.snapshot;
  const lines = [`🛒 Lista — ${event.name}`];
  for (const i of items) {
    const mark = i.bought ? "✅" : "⬜";
    const qty = i.qty ? ` (${i.qty})` : "";
    let extra = "";
    if (i.leftover) extra += ` — sobrou: ${i.leftover}`;
    if (i.missing) extra += ` — faltou: ${i.missing}`;
    lines.push(`${mark} ${i.name}${qty}${extra}`);
  }
  const ok = await copyText(lines.join("\n"));
  toast(ok ? "Lista copiada!" : "Não consegui copiar.", ok ? "success" : "error");
}

// ---------------------------------------------------------------------------
// Componentes reutilizáveis
// ---------------------------------------------------------------------------
function iconBtn(icon, title, onClick) {
  return el("button", { class: "iconbtn", title, "aria-label": title, text: icon, onClick });
}

function personCheck(person, checked, onToggle) {
  const input = el("input", { type: "checkbox", checked: checked ? "" : null,
    onChange: (e) => onToggle(e.target.checked) });
  return el("label", { class: "check" }, [input, el("span", { text: person.name })]);
}

function openModal(title, contentNode) {
  const overlay = el("div", { class: "overlay" });
  const close = () => { overlay.classList.remove("overlay--show"); setTimeout(() => overlay.remove(), 200); };
  const sheet = el("div", { class: "sheet" }, [
    el("div", { class: "sheet__head" }, [
      el("h2", { class: "sheet__title", text: title }),
      el("button", { class: "iconbtn", text: "✕", "aria-label": "Fechar", onClick: close }),
    ]),
    el("div", { class: "sheet__body" }, [contentNode]),
  ]);
  overlay.append(sheet);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  void overlay.offsetWidth;
  overlay.classList.add("overlay--show");
  return { close };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
window.addEventListener("hashchange", router);
router();
