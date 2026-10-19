# #GIRO | Controle de Movimentações dos Equipamentos de Giro

MVP web para controle e rastreabilidade da movimentação de equipamentos e materiais de giro entre **campo**, **oficina** e **estoque**, com etiqueta digital, histórico, requisições de material e notificações por e-mail.

**Stack:** HTML, CSS e JavaScript com Bootstrap 5 · Supabase (Postgres, Auth, RLS, Edge Functions) · GitHub Pages.

## Papéis

| Papel | O que faz |
|---|---|
| Campo | Registra a remoção do equipamento e o envia à oficina. Faz requisições de material (a partir da etiqueta GR) e confirma o recebimento (da oficina e do estoque). |
| Oficina | Recebe o material, repara e libera (condição e destino: estoque ou campo). |
| Estoque | Confirma recebimentos, empenha e envia o material requisitado. |
| Admin | Acesso total (gestão de usuários e correções). |

## Fluxos

- **Remoção e reparo:** `enviado à oficina → em reparo → enviado ao estoque / enviado ao campo → recebido`
- **Requisição de material:** `solicitada → empenhada → enviada ao campo → recebida`. Ela é identificada pelo **número da etiqueta GR** que acompanha o equipamento (não há número RQ); cada etiqueta aceita uma requisição.
- Cada mudança de status é gravada no histórico por gatilho no banco, e as regras de acesso (RLS) limitam cada papel aos status que lhe cabem.

## Estrutura do repositório

```
index.html                 Marcação do app
css/style.css              Tema (azul #345B87, fundo #F2F2F2)
js/config.js               URL e chave anon do Supabase  <- editar
js/app.js                  Login, movimentações, requisições, etiqueta
assets/                    Logos do giro e do Metrô
templates/                 Modelos de e-mail (convite, etiqueta gerada, material empenhado)
supabase/sql/              giro_deploy.sql (banco completo, executar uma vez)
supabase/functions/        notificar-etiqueta e notificar-empenho (Edge Functions)
.github/workflows/         Publicação automática no GitHub Pages
docs/                      Documentação, dicionário de dados e comparativo on-premise (PDF)
DEPLOY.md                  Passo a passo de implantação
```

## Teste local (modo demonstração)

Com `js/config.js` vazio, o app roda sem backend e guarda os dados no navegador:

```
python3 -m http.server 8000
```

Abra `http://localhost:8000`, escolha um papel e teste o fluxo. Para colocar em produção, siga o **[DEPLOY.md](DEPLOY.md)**.

## Fora do MVP

Registro de material pago, reparo externo, painel de indicadores, tela de administração de papéis e réplica fiel do layout da etiqueta de referência (a etiqueta atual é uma versão simplificada em duas vias).
