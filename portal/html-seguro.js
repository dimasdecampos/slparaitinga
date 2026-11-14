// Limpeza de HTML do editor de festas. Módulo único, sem dependências: roda no navegador (painel /admin) e no Node (publicação).
// Só passam as tags e atributos da lista abaixo; todo o resto vira texto puro. É a defesa contra código injetado no conteúdo,
// já que a equipe grava HTML no banco e ele depois é mostrado no site e dentro do próprio painel.

const TAGS = new Set(['p', 'h2', 'h3', 'h4', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'br', 'hr']);
const VAZIAS = new Set(['br', 'hr']);
const SINONIMOS = { b: 'strong', i: 'em', h1: 'h2', h5: 'h4', h6: 'h4', div: 'p' };
const DESCARTA_COM_CONTEUDO = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'head', 'title']);

const escTexto = s => s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decAttr = s => s.replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Endereços aceitos em links: http(s), e-mail, telefone, âncora e caminhos do próprio site. Nada de javascript: ou data:.
export function enderecoSeguro(url) {
  const u = decAttr(String(url ?? '')).replace(/[\u0000- \u007f-\u009f]+/g, '').trim();
  if (!u || u.length > 2000) return null;
  if (/^(https?:\/\/|mailto:|tel:|#|\/(?!\/)|\.{1,2}\/)/i.test(u)) return u;
  if (/^[a-z0-9][a-z0-9._\-\/]*(\.html?)?(#[\w\-]*)?$/i.test(u) && !/^[a-z][a-z0-9+.\-]*:/i.test(u)) return u; // "historia.html", "festas/x.html"
  return null;
}

function abreTag(nome, attrs) {
  if (nome !== 'a') return `<${nome}>`;
  const m = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
  const href = m ? enderecoSeguro(m[1] ?? m[2] ?? m[3]) : null;
  if (!href) return null; // link sem endereço válido: só o texto
  return `<a href="${escAttr(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>`;
}

export function limparHtml(entrada) {
  const html = String(entrada ?? '').slice(0, 200000).replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
  const saida = [], abertas = [];
  let pos = 0, ignorarAte = null, m;
  while ((m = re.exec(html))) {
    const [tag, fecha, nomeBruto, attrs] = m;
    const antes = html.slice(pos, m.index);
    pos = m.index + tag.length;
    if (ignorarAte) { // dentro de <script> etc.: descarta tudo até fechar
      if (fecha && nomeBruto.toLowerCase() === ignorarAte) ignorarAte = null;
      continue;
    }
    if (antes) saida.push(escTexto(antes));
    const cru = nomeBruto.toLowerCase();
    if (!fecha && DESCARTA_COM_CONTEUDO.has(cru)) { ignorarAte = cru; continue; }
    const nome = SINONIMOS[cru] || cru;
    if (!TAGS.has(nome)) continue; // tag desconhecida: some a tag, fica o texto
    if (fecha) {
      if (VAZIAS.has(nome)) continue;
      const i = abertas.lastIndexOf(nome);
      if (i < 0) continue;
      while (abertas.length > i) saida.push(`</${abertas.pop()}>`); // fecha o que ficou aberto no caminho
    } else if (VAZIAS.has(nome)) {
      saida.push(`<${nome}>`);
    } else {
      // tags que não podem ficar uma dentro da outra (<li> dentro de <li>, bloco dentro de <p>): fecha a anterior
      const topo = abertas[abertas.length - 1];
      if ((nome === 'li' && topo === 'li') || (topo === 'p' && /^(p|h[2-4]|ul|ol|blockquote|hr)$/.test(nome))) saida.push(`</${abertas.pop()}>`);
      const aberta = abreTag(nome, attrs);
      if (aberta === null) continue;
      saida.push(aberta); abertas.push(nome);
    }
  }
  if (!ignorarAte) { const resto = html.slice(pos); if (resto) saida.push(escTexto(resto.replace(/<[^>]*$/, ''))); }
  while (abertas.length) saida.push(`</${abertas.pop()}>`);
  return saida.join('')
    .replace(/<(p|h2|h3|h4|strong|em|li|blockquote)>(\s|&nbsp;|<br>)*<\/\1>/g, '') // blocos vazios
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .trim();
}

// Texto simples → HTML (usado ao migrar o conteúdo antigo, que eram seções com parágrafos e links [texto](endereço)).
export function paragrafoParaHtml(texto) {
  const partes = [];
  let ultimo = 0, m;
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  while ((m = re.exec(texto))) {
    partes.push(escTexto(texto.slice(ultimo, m.index)));
    const href = enderecoSeguro(m[2]);
    partes.push(href ? `<a href="${escAttr(href)}">${escTexto(m[1])}</a>` : escTexto(m[1]));
    ultimo = m.index + m[0].length;
  }
  partes.push(escTexto(texto.slice(ultimo)));
  return `<p>${partes.join('')}</p>`;
}
export function secoesParaHtml(secoes) {
  return (secoes || []).map(s => `<h2>${escTexto(String(s.titulo ?? ''))}</h2>${(s.paragrafos || []).map(paragrafoParaHtml).join('')}`).join('');
}
// Texto puro do HTML (para o resumo e para a descrição das páginas).
export function htmlParaTexto(html) {
  return String(html ?? '').replace(/<\/(p|h\d|li|blockquote)>/g, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
