// Helpers de UI: criação de DOM, formatação de dinheiro, toasts e clipboard.

/** Cria um elemento DOM. attrs aceita: class, text, html, on{Event}, e atributos. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** Formata centavos como moeda BRL: 123456 -> "R$ 1.234,56". */
export function fmtBRL(cents) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Converte texto digitado ("12,50", "12.50", "1.234,56", "R$ 10") em centavos.
 * Retorna null se inválido.
 */
export function parseAmountToCents(str) {
  if (str == null) return null;
  let s = String(str).trim().replace(/[R$\s]/gi, "");
  if (!s) return null;
  // Se tem vírgula, ela é o separador decimal (pt-BR); pontos são milhar.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const num = Number(s);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

let toastTimer = null;
/** Mostra um toast temporário. type: "info" | "success" | "error". */
export function toast(msg, type = "info") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  root.innerHTML = "";
  const t = el("div", { class: `toast toast--${type}`, role: "status", text: msg });
  root.append(t);
  clearTimeout(toastTimer);
  // força reflow para a transição entrar
  void t.offsetWidth;
  t.classList.add("toast--show");
  toastTimer = setTimeout(() => {
    t.classList.remove("toast--show");
    setTimeout(() => t.remove(), 250);
  }, type === "error" ? 4500 : 2600);
}

/** Confirmação simples (nativa, confiável no mobile). */
export function confirmAction(message) {
  return window.confirm(message);
}

/** Copia texto para a área de transferência, com fallback. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el("textarea", { value: text });
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** Esvazia um container. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
