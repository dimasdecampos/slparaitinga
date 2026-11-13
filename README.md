<p align="center"><img src="portal/img/logo.svg" alt="slparaitinga" width="320"></p>

# slparaitinga

Site da cidade de **São Luiz do Paraitinga (SP)**: agenda ao vivo, festas, lugares, história e serviços, feito com quem mora aqui.

## A ideia

Um portal único onde morador e visitante encontram o que está acontecendo na cidade:

- **Agenda ao vivo**: eventos enviados pelos próprios moradores, com confirmação e denúncia de informação errada.
- **Festas**: o calendário popular e religioso (Festival de Marchinhas, Carnaval, Semana Santa, Festa do Divino, São Luís de Tolosa, Festa do Saci), com as datas calculadas automaticamente a cada ano.
- **Lugares**: mapa do centro histórico com praças, igrejas, pontos de cultura e serviços.
- **História**: linha do tempo da cidade.
- **Serviços**: telefones úteis, previsão do tempo e avisos da Prefeitura.
- **Cidade em 3D**: o centro histórico montado a partir do OpenStreetMap e do relevo.

## Identidade visual

A marca é a **flor de chita**, o tecido que veste o Carnaval de marchinhas e as festas de rua.

| Arquivo | Uso |
| --- | --- |
| [`portal/img/logo.svg`](portal/img/logo.svg) | Logo completo (flor + nome) |
| [`portal/img/favicon.svg`](portal/img/favicon.svg) | Ícone do site |

Cores: vermelho `#e5243b`, amarelo `#ffd23f`, verde `#22a35a`. Fonte: Plus Jakarta Sans.
O desenho da flor fica em um só lugar, no início de `portal/build-site.mjs` (`MARCA` e `FLOR_DESENHO`).

## Estrutura

```
portal/     site estático (HTML gerado, CSS e JS)
cidade3d/   cidade em 3D a partir do OpenStreetMap e do relevo
supabase/   banco de dados da agenda (schema.sql com as regras de acesso)
```

## Como rodar

Precisa do Node.js 18 ou mais novo.

```sh
node portal/collect.mjs      # baixa avisos da Prefeitura, agenda, clima e notícias
node portal/build-site.mjs   # gera as páginas HTML em portal/
npx serve portal             # abre o site em http://localhost:3000
```

Para a agenda com envio de eventos, crie um projeto no Supabase, rode `supabase/schema.sql` e preencha `portal/config.js` com a URL e a chave pública (anon).

Para ativar canonical, Open Graph e sitemap, preencha `url` em `portal/site.config.json` com o domínio final.
