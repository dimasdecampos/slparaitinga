// Projeto Supabase "estoura" (compartilhado com o app Estoura e o Monitor dos Rios; as tabelas da agenda são só as de supabase/schema.sql).
// A chave aqui é a "publishable": ela é pública por natureza; a segurança vem das regras (RLS) em supabase/schema.sql.
// Nunca coloque a chave "secret" ou "service_role" neste arquivo.
window.AGENDA_CONFIG = {
  supabaseUrl: 'https://smlhkifwlbqsvfsixkvo.supabase.co',
  supabaseKey: 'sb_publishable_FvMdZ86fu1QYZ1HLEfMmwg_awn-6rhu',
};
