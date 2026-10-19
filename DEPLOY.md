# Deploy do #GIRO

Ordem recomendada: **Supabase → configuração do front → e-mails → publicação → primeiro acesso**.

## 1. Projeto Supabase

1. Crie um projeto em <https://supabase.com>.
2. Em **SQL Editor**, cole e execute o arquivo `supabase/sql/giro_deploy.sql` (tabelas, gatilhos de histórico e regras de acesso). Ele pode ser reexecutado sem erro nas funções, gatilhos e políticas.
3. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**.

## 2. Configurar o front

Edite `js/config.js`:

```js
const CFG = { url: 'https://SEU-PROJETO.supabase.co', key: 'SUA_CHAVE_ANON' };
```

A chave `anon` é pública por desenho; quem protege os dados são as políticas RLS. Nunca coloque a chave `service_role` no front.

## 3. Autenticação por e-mail

Em **Authentication**:

1. **Providers > Email**: habilitado, com **Confirm email** ligado.
2. **SMTP Settings**: ative o SMTP próprio (para o Auth, a porta 587 funciona). Sem isso o limite de envios é muito baixo.
3. **Email Templates > Invite user**: cole o conteúdo de `templates/convite.html` e use o assunto "Você foi convidado para o #GIRO".
4. **URL Configuration**: defina **Site URL** e inclua o mesmo endereço em **Redirect URLs** (use a URL final do site, passo 6).
5. (Opcional) Aumente o tamanho mínimo da senha para 8.

## 4. Notificações por e-mail (Edge Functions)

> As Edge Functions do Supabase **não abrem conexões nas portas 25 e 587**. Use SMTP com TLS direto na **porta 465**.

Instale a [Supabase CLI](https://supabase.com/docs/guides/cli), entre no repositório e execute:

```
supabase login
supabase link --project-ref SEU_PROJECT_REF

supabase secrets set \
  SMTP_HOST=smtp.seudominio.com SMTP_PORT=465 \
  SMTP_USER=usuario SMTP_PASS=senha \
  SMTP_FROM="#GIRO <giro@seudominio.com>" \
  SITE_URL=https://SEU-USUARIO.github.io/SEU-REPO \
  WEBHOOK_SECRET=UM_TEXTO_ALEATORIO_LONGO

supabase functions deploy notificar-etiqueta --no-verify-jwt
supabase functions deploy notificar-empenho  --no-verify-jwt
```

`--no-verify-jwt` é necessário porque quem chama é o webhook do banco; a proteção é o header `x-webhook-secret`.

Crie dois webhooks em **Database > Webhooks** (tipo **HTTP Request**, método **POST**, header `x-webhook-secret` com o valor de `WEBHOOK_SECRET`):

| Webhook | Tabela | Evento | URL |
|---|---|---|---|
| etiqueta | `movimentacoes` | Insert | `https://SEU_PROJECT_REF.supabase.co/functions/v1/notificar-etiqueta` |
| empenho | `requisicoes` | Update | `https://SEU_PROJECT_REF.supabase.co/functions/v1/notificar-empenho` |

Se editar um HTML em `templates/`, atualize o `template.ts` da função correspondente com o mesmo conteúdo.

## 5. Repositório e GitHub Pages

```
git init
git add .
git commit -m "MVP #GIRO"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

No GitHub: **Settings > Pages > Source: GitHub Actions**. O workflow `.github/workflows/pages.yml` publica apenas `index.html`, `css/`, `js/` e `assets/` a cada push na `main`. O endereço final será `https://SEU-USUARIO.github.io/SEU-REPO/`.

Volte ao Supabase e confirme que **Site URL**, **Redirect URLs** e o secret `SITE_URL` usam esse endereço.

## 6. Primeiro acesso e papéis

1. Abra o site e use **Criar conta**; confirme o e-mail.
2. Torne-se admin no SQL Editor:
   ```sql
   update perfis set papel = 'admin' where email = 'voce@empresa.com';
   ```
3. Cadastre os demais usuários e defina os papéis:
   ```sql
   update perfis set papel = 'oficina' where email = 'fulano@empresa.com';  -- campo | oficina | estoque | admin
   ```

## 7. Teste de fumaça

1. Como **campo**: registre uma remoção e confira o e-mail "Etiqueta gerada" na oficina.
2. Como **oficina**: receba e libere para o estoque.
3. Como **estoque**: confirme o recebimento.
4. Como **campo**: crie uma requisição a partir de uma etiqueta GR (botão Requisitar). Como **estoque**: empenhe e confira o e-mail "Material empenhado"; registre o envio.
5. Como **campo**: confirme o recebimento e verifique o histórico.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Confirme seu e-mail..." ao entrar | Conta ainda não confirmada |
| Link do e-mail não volta ao sistema | Site URL / Redirect URLs não configurados |
| E-mails do Auth não chegam | SMTP do Auth não configurado ou limite padrão do Supabase |
| Função não envia e-mail | Porta 587/25 (bloqueadas), secrets ausentes ou webhook sem o header `x-webhook-secret` |
| Erro de permissão ao atuar | Papel do usuário diferente do esperado (tabela `perfis`) |
