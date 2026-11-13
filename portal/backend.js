// Camada de dados da agenda colaborativa.
// Com window.AGENDA_CONFIG preenchido (config.js) usa o Supabase; senão roda em modo demonstração,
// guardando tudo só neste navegador.

export const CATEGORIAS = ['Festa e tradição', 'Música', 'Religioso', 'Esporte', 'Cultura', 'Feira e comércio', 'Comunidade', 'Outros'];
const MIN = 6e4, HORA = 36e5;
export const ANTES = 30 * MIN, DEPOIS = 2 * HORA; // janela para confirmar e enviar fotos

export function janelaAberta(ev, agora = Date.now()) {
  return agora >= new Date(ev.inicio) - ANTES && agora <= +new Date(ev.fim) + DEPOIS;
}
export function acontecendo(ev, agora = Date.now()) {
  return agora >= new Date(ev.inicio) - 15 * MIN && agora <= +new Date(ev.fim);
}

export async function criarBackend() {
  const cfg = window.AGENDA_CONFIG || {};
  if (cfg.supabaseUrl && cfg.supabaseKey) {
    try { return await supabaseBackend(cfg); }
    catch (e) { console.error('[agenda] Supabase indisponível, usando demonstração', e); }
  }
  return demoBackend();
}

// ======================= Supabase =======================
async function supabaseBackend(cfg) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseKey);
  let perfil = null;
  const ouvintes = new Set();
  async function carregarPerfil(session) {
    if (!session?.user) { perfil = null; return; }
    const { data } = await sb.from('perfis').select('id, nome').eq('id', session.user.id).maybeSingle();
    perfil = data || { id: session.user.id, nome: session.user.email.split('@')[0] };
  }
  await carregarPerfil((await sb.auth.getSession()).data.session);
  sb.auth.onAuthStateChange((_e, session) => { setTimeout(async () => { await carregarPerfil(session); ouvintes.forEach(f => f(perfil)); }, 0); });
  const falhou = (error, msg) => { if (error) { console.error(error); throw new Error(traduzir(error) || msg); } };
  const urlFoto = p => p ? sb.storage.from('fotos').getPublicUrl(p).data.publicUrl : null;

  return {
    modo: 'supabase',
    usuario: () => perfil,
    aoMudarUsuario: f => ouvintes.add(f),
    precisaEmail: true,
    google: true,
    async entrarComGoogle() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0].split('?')[0], queryParams: { prompt: 'select_account' } } });
      falhou(error, 'Não foi possível entrar com o Google.');
    },
    async entrar({ email, nome }) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { data: { nome }, emailRedirectTo: location.href.split('#')[0] } });
      falhou(error, 'Não foi possível enviar o link.');
      return { aguardandoEmail: true };
    },
    async sair() { await sb.auth.signOut(); },
    async listarEventos(de, ate) {
      const { data, error } = await sb.from('eventos_resumo').select('*').gte('fim', de.toISOString()).lte('inicio', ate.toISOString()).order('inicio').limit(300);
      falhou(error, 'Não foi possível carregar a agenda.');
      let meus = new Set();
      if (perfil && data.length) {
        const r = await sb.from('confirmacoes').select('evento_id').eq('usuario_id', perfil.id).in('evento_id', data.map(e => e.id));
        meus = new Set((r.data || []).map(x => x.evento_id));
      }
      return data.map(e => ({ ...e, eu_confirmei: meus.has(e.id) }));
    },
    async criarEvento(ev) {
      const { error } = await sb.from('eventos').insert(ev);
      falhou(error, 'Não foi possível salvar o evento.');
    },
    async confirmar(id) {
      const { error } = await sb.from('confirmacoes').insert({ evento_id: id });
      if (error?.code === '23505') return; // já confirmado
      falhou(error, 'Não foi possível confirmar.');
    },
    async listarRegistros(ids) {
      if (!ids.length) return [];
      const { data, error } = await sb.from('registros_resumo').select('*').in('evento_id', ids).order('criado_em', { ascending: false }).limit(200);
      falhou(error, 'Não foi possível carregar as fotos.');
      return data.map(r => ({ ...r, foto_url: urlFoto(r.foto) }));
    },
    async enviarRegistro(eventoId, foto, legenda) {
      let caminho = null;
      if (foto) {
        caminho = `${perfil.id}/${eventoId}-${Date.now()}.jpg`;
        const up = await sb.storage.from('fotos').upload(caminho, foto, { contentType: 'image/jpeg' });
        falhou(up.error, 'Não foi possível enviar a foto.');
      }
      const { error } = await sb.from('registros').insert({ evento_id: eventoId, legenda, foto: caminho });
      if (error && caminho) await sb.storage.from('fotos').remove([caminho]);
      falhou(error, 'Não foi possível publicar.');
    },
    async denunciar(tipo, id, motivo) {
      const { error } = await sb.from('denuncias').insert({ tipo, alvo_id: id, motivo });
      if (error?.code === '23505') return;
      falhou(error, 'Não foi possível enviar a denúncia.');
    },
  };
}

function traduzir(e) {
  const m = (e.message || '').toLowerCase();
  if (m.includes('row-level security')) return 'Ação não permitida agora (o evento pode estar fora do horário ou você atingiu o limite).';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (m.includes('invalid') && m.includes('email')) return 'E-mail inválido.';
  if (m.includes('check constraint')) return 'Confira os dados: algum campo está fora do tamanho ou a data de fim é antes do início.';
  return null;
}

// ======================= Demonstração =======================
function demoBackend() {
  const CHAVE = 'agenda-demo-v1';
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; } };
  const gravar = d => { try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch {} };
  let db = ler();
  if (!db || db.versao !== 1) { db = semear(); gravar(db); }
  const ouvintes = new Set();
  const fotosMem = new Map(); // fotos ficam só na memória desta aba
  const eu = () => db.sessao;

  return {
    modo: 'demo',
    usuario: eu,
    aoMudarUsuario: f => ouvintes.add(f),
    precisaEmail: false,
    async entrar({ nome }) {
      db.sessao = { id: 'u-' + Math.random().toString(36).slice(2, 9), nome: nome.trim().slice(0, 60) || 'Visitante' };
      gravar(db); ouvintes.forEach(f => f(db.sessao)); return {};
    },
    async sair() { db.sessao = null; gravar(db); ouvintes.forEach(f => f(null)); },
    async listarEventos(de, ate) {
      return db.eventos.filter(e => !e.oculto && new Date(e.fim) >= de && new Date(e.inicio) <= ate)
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
        .map(e => {
          const c = db.confirmacoes.filter(x => x.evento_id === e.id);
          return { ...e, confirmacoes: c.length, ultima_confirmacao: c.map(x => x.criado_em).sort().pop() || null,
            registros: db.registros.filter(r => r.evento_id === e.id).length, eu_confirmei: !!eu() && c.some(x => x.usuario_id === eu().id) };
        });
    },
    async criarEvento(ev) {
      if (!eu()) throw new Error('Entre para adicionar eventos.');
      db.eventos.push({ ...ev, id: Date.now(), criado_por: eu().id, autor: eu().nome, criado_em: new Date().toISOString() }); gravar(db);
    },
    async confirmar(id) {
      const ev = db.eventos.find(e => e.id === id);
      if (!eu()) throw new Error('Entre para confirmar.');
      if (!ev || !janelaAberta(ev)) throw new Error('Só dá para confirmar enquanto o evento está acontecendo.');
      if (!db.confirmacoes.some(c => c.evento_id === id && c.usuario_id === eu().id)) { db.confirmacoes.push({ evento_id: id, usuario_id: eu().id, criado_em: new Date().toISOString() }); gravar(db); }
    },
    async listarRegistros(ids) {
      return db.registros.filter(r => ids.includes(r.evento_id)).sort((a, b) => b.criado_em.localeCompare(a.criado_em))
        .map(r => ({ ...r, foto_url: fotosMem.get(r.id) || r.foto_demo || null }));
    },
    async enviarRegistro(eventoId, foto, legenda) {
      const ev = db.eventos.find(e => e.id === eventoId);
      if (!eu()) throw new Error('Entre para enviar fotos.');
      if (!ev || !janelaAberta(ev)) throw new Error('Só dá para enviar fotos enquanto o evento está acontecendo.');
      const r = { id: Date.now(), evento_id: eventoId, usuario_id: eu().id, autor: eu().nome, legenda, criado_em: new Date().toISOString() };
      if (foto) fotosMem.set(r.id, URL.createObjectURL(foto));
      db.registros.push(r); gravar(db);
    },
    async denunciar() {},
  };
}

// Dados de exemplo, relativos ao momento em que a demonstração é aberta.
function semear() {
  const agora = new Date(), dia = (d, h, m = 0) => { const x = new Date(agora); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const rel = min => new Date(agora.getTime() + min * MIN).toISOString();
  const autores = { a: { id: 'u-ana', nome: 'Ana (exemplo)' }, b: { id: 'u-ze', nome: 'Zé do Bloco (exemplo)' }, c: { id: 'u-par', nome: 'Paróquia (exemplo)' } };
  const ev = (id, a, o) => ({ id, criado_por: autores[a].id, autor: autores[a].nome, criado_em: rel(-3000), descricao: '', ...o });
  const eventos = [
    ev(1, 'a', { titulo: 'Dança de fitas na praça', local: 'Praça Dr. Oswaldo Cruz', categoria: 'Festa e tradição', inicio: rel(-40), fim: rel(80), descricao: 'Apresentação do grupo de dança de fitas com as crianças da escola. EVENTO DE EXEMPLO.' }),
    ev(2, 'b', { titulo: 'Ensaio aberto do bloco', local: 'Largo do Teatro', categoria: 'Música', inicio: rel(-10), fim: rel(110), descricao: 'Ensaio das marchinhas para o Carnaval, aberto a quem quiser cantar junto. EVENTO DE EXEMPLO.' }),
    ev(3, 'c', { titulo: 'Missa e procissão', local: 'Igreja Matriz', categoria: 'Religioso', inicio: dia(1, 18, 30), fim: dia(1, 20, 30) }),
    ev(4, 'a', { titulo: 'Feira de produtores rurais', local: 'Mercado Municipal', categoria: 'Feira e comércio', inicio: dia(2, 8), fim: dia(2, 13), descricao: 'Queijos, verduras, doces e artesanato da zona rural. EVENTO DE EXEMPLO.' }),
    ev(5, 'b', { titulo: 'Roda de viola caipira', local: 'Casa de Oswaldo Cruz', categoria: 'Cultura', inicio: dia(2, 19), fim: dia(2, 22) }),
    ev(6, 'a', { titulo: 'Mutirão de limpeza do rio', local: 'Parque Linear Urbano', categoria: 'Comunidade', inicio: dia(5, 8), fim: dia(5, 12) }),
  ];
  const confirmacoes = ['u-ze', 'u-par', 'u-x1', 'u-x2', 'u-x3'].map((u, i) => ({ evento_id: 1, usuario_id: u, criado_em: rel(-30 + i * 5) }))
    .concat([{ evento_id: 2, usuario_id: 'u-ana', criado_em: rel(-4) }]);
  const registros = [
    { id: 101, evento_id: 1, usuario_id: 'u-ze', autor: 'Zé do Bloco (exemplo)', legenda: 'Dança de fitas acontecendo agora na praça! Tá lindo demais', criado_em: rel(-12), foto_demo: fotoDemo('#b5552f', '#f2c14e', '#2f6f8a') },
    { id: 102, evento_id: 1, usuario_id: 'u-par', autor: 'Paróquia (exemplo)', legenda: 'Praça cheia, ainda dá tempo de chegar', criado_em: rel(-5) },
  ];
  return { versao: 1, sessao: null, eventos, confirmacoes, registros };
}

function fotoDemo(...cores) { // ilustração simples de fitas coloridas para a demonstração
  const fitas = cores.map((c, i) => `<path d="M200 40 C ${120 + i * 60} 120, ${60 + i * 110} 180, ${40 + i * 150} 260" stroke="${c}" stroke-width="10" fill="none"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e9dfc9"/><rect y="230" width="400" height="70" fill="#a7b77a"/><line x1="200" y1="20" x2="200" y2="270" stroke="#6b4a2b" stroke-width="8"/>${fitas}<circle cx="200" cy="22" r="10" fill="#d9a441"/><text x="200" y="292" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#3b3b3b">foto de exemplo</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
