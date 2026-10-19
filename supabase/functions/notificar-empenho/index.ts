// Edge Function: envia o e-mail "Material empenhado" ao solicitante quando o estoque empenha uma requisição.
// Disparo: Database Webhook (tabela requisicoes, evento UPDATE) com o header x-webhook-secret.
// Importante: Edge Functions do Supabase não abrem conexões nas portas 25 e 587; use SMTP com TLS direto (porta 465).
//
// Secrets necessários (supabase secrets set ...):
//   SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_FROM, SITE_URL, WEBHOOK_SECRET
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ASSUNTO, TEMPLATE } from "./template.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (d?: string) => (d ? d.split("-").reverse().join("/") : "");
const vars = (t: string, v: Record<string, unknown>, escapar: boolean) =>
  t.replace(/\{\{(\w+)\}\}/g, (_, k) => (escapar ? esc(v[k]) : String(v[k] ?? "").replace(/[\r\n]+/g, " ")));

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET")) {
    return new Response("não autorizado", { status: 401 });
  }
  const { type, record: m, old_record: antigo } = await req.json();
  if (type !== "UPDATE" || m?.status !== "empenhada" || antigo?.status === "empenhada") return new Response("ignorado");

  // Destinatário: quem fez a requisição
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  if (!m.created_by) return new Response("sem solicitante");
  const { data, error } = await sb.from("perfis").select("email").eq("id", m.created_by).not("email", "is", null);
  if (error) return new Response(error.message, { status: 500 });
  const para = [...new Set((data ?? []).map((p) => p.email as string))];
  if (!para.length) return new Response("sem destinatários");

  const site = env("SITE_URL").replace(/\/$/, "");
  const v = {
    ...m,
    numero_etiqueta: m.numero,
    data_empenho: fmt(m.empenho_data),
    responsavel_estoque: m.empenho_resp,
    link: `${site}/?aba=req`,
    site_url: site,
  };
  const assunto = vars(ASSUNTO, v, false);
  const html = vars(TEMPLATE, v, true);

  const smtp = new SMTPClient({
    connection: {
      hostname: env("SMTP_HOST"),
      port: Number(env("SMTP_PORT") || 465),
      tls: true,
      auth: { username: env("SMTP_USER"), password: env("SMTP_PASS") },
    },
  });
  try {
    for (const to of para) {
      await smtp.send({ from: env("SMTP_FROM"), to, subject: assunto, content: `Material empenhado (etiqueta ${m.numero}). Acesse: ${v.link}`, html });
    }
  } catch (e) {
    console.error("falha no envio SMTP:", e);
    return new Response("falha no envio", { status: 500 });
  } finally {
    await smtp.close();
  }
  return new Response(`enviado para ${para.length} destinatário(s)`);
});
