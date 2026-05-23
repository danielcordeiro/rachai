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
 * Converte texto digitado em centavos (inteiro), tratando separadores pt-BR e en-US.
 * Regras de desambiguação:
 *  - "1.234,56" (vírgula decimal) e "1,234.56" (ponto decimal): o ÚLTIMO separador é o decimal.
 *  - só vírgula  -> decimal: "12,50" => 1250
 *  - só ponto    -> decimal apenas se for 1 ponto seguido de 1-2 dígitos ("12.5", "12.50");
 *                   caso contrário é separador de milhar ("1.500" => 1500, "1.234.567" => 1234567)
 * Retorna null se inválido (vazio, NaN ou negativo).
 */
export function parseAmountToCents(str) {
  if (str == null) return null;
  let s = String(str).trim().replace(/[^\d.,-]/g, ""); // mantém dígitos, . , -
  if (!s || s === "-") return null;
  if (s.includes("-")) return null; // não aceitamos valores negativos

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // vírgula é o decimal (pt-BR)
    } else {
      s = s.replace(/,/g, ""); // ponto é o decimal (en-US)
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    const dec = parts[parts.length - 1];
    if (!(parts.length === 2 && dec.length <= 2)) {
      s = s.replace(/\./g, ""); // pontos são separador de milhar
    }
  }

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
