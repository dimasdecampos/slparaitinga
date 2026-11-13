// Lista de sugestões para campos de texto (substitui o <datalist>, que cada navegador mostra de um jeito
// e no celular quase some). Igual no notebook e no celular: abre abaixo do campo, filtra enquanto digita,
// funciona com toque, mouse e teclado (setas, Enter, Esc). Uso: ligarSugestoes(input) com input.list apontando
// para um <datalist>; as opções saem dele e o list nativo é desligado.
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let seq = 0;

export function ligarSugestoes(input) {
  const fonte = input.list || document.getElementById(input.getAttribute('list') || '');
  if (!fonte) return;
  const opcoes = [...fonte.options].map(o => o.value).filter(Boolean);
  input.removeAttribute('list');
  const id = `sug-${++seq}`;
  const caixa = document.createElement('div'); caixa.className = 'sug-caixa';
  input.replaceWith(caixa); caixa.append(input);
  const lista = document.createElement('ul'); lista.className = 'sug-lista'; lista.id = id; lista.setAttribute('role', 'listbox'); lista.hidden = true;
  caixa.append(lista);
  Object.assign(input, { autocomplete: 'off' });
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', id); input.setAttribute('aria-expanded', 'false');
  let ativo = -1, visiveis = [];

  function mostrar() {
    const q = norm(input.value.trim());
    visiveis = opcoes.filter(o => !q || norm(o).includes(q)).filter(o => norm(o) !== q).slice(0, 8);
    ativo = -1;
    lista.innerHTML = visiveis.map((o, i) => `<li role="option" id="${id}-${i}" aria-selected="false">${o.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</li>`).join('');
    lista.hidden = !visiveis.length; input.setAttribute('aria-expanded', String(!lista.hidden));
  }
  function fechar() { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function marcar(i) {
    ativo = (i + visiveis.length) % visiveis.length;
    [...lista.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === ativo)));
    const li = lista.children[ativo]; input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' });
  }
  function escolher(i) { input.value = visiveis[i]; input.dispatchEvent(new Event('input', { bubbles: true })); fechar(); }

  input.addEventListener('focus', mostrar);
  input.addEventListener('input', e => { if (e.isTrusted) mostrar(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) mostrar(); if (visiveis.length) marcar(ativo + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (visiveis.length) marcar(ativo - 1); }
    else if (e.key === 'Enter' && !lista.hidden && ativo >= 0) { e.preventDefault(); escolher(ativo); }
    else if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); e.stopPropagation(); fechar(); } // não fecha o diálogo junto
  });
  input.addEventListener('blur', () => setTimeout(fechar, 120));
  // pointerdown (antes do blur) para funcionar igual com mouse e com toque
  lista.addEventListener('pointerdown', e => { const li = e.target.closest('li'); if (!li) return; e.preventDefault(); escolher([...lista.children].indexOf(li)); });
}
