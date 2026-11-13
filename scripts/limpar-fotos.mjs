// Apaga as fotos da agenda que não são de hoje (horário de Brasília): arquivos do Storage e linhas da tabela "registros".
// Roda todo dia logo depois da meia-noite pelo GitHub Actions (.github/workflows/limpar-fotos.yml).
// Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (secrets do repositório). A chave service_role nunca vai para o site.
const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const H = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' };

// meia-noite de hoje em Brasília (UTC-3, sem horário de verão desde 2019)
const hojeBR = new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10);
const corte = new Date(`${hojeBR}T00:00:00-03:00`);
console.log('Apagando fotos anteriores a', corte.toISOString());

async function chamar(caminho, opcoes) {
  const r = await fetch(`${URL_BASE}${caminho}`, { ...opcoes, headers: { ...H, ...(opcoes?.headers || {}) } });
  if (!r.ok) throw new Error(`${opcoes?.method || 'GET'} ${caminho}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
const listar = prefixo => chamar('/storage/v1/object/list/fotos', { method: 'POST', body: JSON.stringify({ prefix: prefixo, limit: 1000, offset: 0 }) });

// 1) arquivos: cada pessoa tem uma pasta (id do usuário)
const pastas = (await listar('')).filter(x => x.id === null).map(x => x.name);
const velhos = [];
for (const pasta of pastas) for (const o of await listar(pasta + '/')) if (o.id && new Date(o.created_at) < corte) velhos.push(`${pasta}/${o.name}`);
for (let i = 0; i < velhos.length; i += 100)
  await chamar('/storage/v1/object/fotos', { method: 'DELETE', body: JSON.stringify({ prefixes: velhos.slice(i, i + 100) }) });
console.log('Arquivos apagados:', velhos.length);

// 2) linhas (fotos e legendas) de antes de hoje
const apagadas = await chamar(`/rest/v1/registros?criado_em=lt.${encodeURIComponent(corte.toISOString())}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
console.log('Registros apagados:', apagadas.length);
