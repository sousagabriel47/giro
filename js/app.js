const demo = !CFG.url;

const $ = id => document.getElementById(id);
const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const fd = d => d ? d.split('-').reverse().join('/') : '';
const hoje = () => new Date().toISOString().slice(0, 10);
const ST = {
  enviado_oficina: ['Enviado à oficina', 'warning'], em_reparo: ['Em reparo', 'info'],
  enviado_estoque: ['Enviado ao estoque', 'primary'], enviado_campo: ['Enviado ao campo', 'primary'],
  recebido: ['Recebido', 'success']
};
const AC = { receber: 'Receber', liberar: 'Liberar', confirmar: 'Confirmar recebimento' };
let sb, me, rows = [];

Object.entries(ST).forEach(([k, v]) => $('f').insertAdjacentHTML('beforeend', `<option value="${k}">${v[0]}</option>`));

// ===== Camada de dados (Supabase ou demonstração local) =====
const L = { get: () => JSON.parse(localStorage.giro || '[]'), set: v => localStorage.giro = JSON.stringify(v) };
const ev = (m, status) => (m.hist = m.hist || []).push({ status, user_nome: me.nome, created_at: new Date().toISOString() });

async function listar() {
  if (demo) return L.get();
  const { data, error } = await sb.from('movimentacoes').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data;
}
async function criar(m) {
  if (demo) {
    const a = L.get(); m.id = crypto.randomUUID(); m.numero = 'GR' + String(a.length + 1).padStart(6, '0');
    m.status = 'enviado_oficina'; m.data_remocao = hoje(); ev(m, m.status); a.unshift(m); L.set(a); return;
  }
  const { error } = await sb.from('movimentacoes').insert(m); if (error) throw error;
}
async function atualizar(id, p) {
  if (demo) { const a = L.get(), m = a.find(x => x.id == id); Object.assign(m, p); ev(m, p.status); L.set(a); return; }
  const { error } = await sb.from('movimentacoes').update(p).eq('id', id); if (error) throw error;
}
async function eventos(id) {
  if (demo) return L.get().find(x => x.id == id).hist || [];
  const { data } = await sb.from('eventos').select('*').eq('mov_id', id).order('created_at'); return data || [];
}

// ===== Acesso =====
function abrirApp() {
  $('vLogin').classList.add('d-none'); $('vApp').classList.remove('d-none');
  $('uNome').textContent = me.nome; $('uPapel').textContent = me.papel;
  $('nOrigem').value = me.area || '';
  $('bNova').classList.toggle('d-none', !['campo', 'admin'].includes(me.papel));
  $('bReq').classList.toggle('d-none', !['campo', 'admin'].includes(me.papel));
  $('rDestino').value = me.area || '';
  const par = new URLSearchParams(location.search), p = par.get('q'); if (p) $('q').value = p;
  carregar(); carregarReq();
  if (par.get('aba') === 'req') document.querySelector('#tabs [data-t=Req]').click();
}
function entrarDemo() {
  if (!$('dNome').value.trim()) return alert('Informe seu nome.');
  me = { nome: $('dNome').value.trim(), area: $('dArea').value.trim(), papel: $('dPapel').value };
  sessionStorage.giroMe = JSON.stringify(me); abrirApp();
}
async function perfil() {
  const { data: { user } } = await sb.auth.getUser();
  const { data } = await sb.from('perfis').select('*').eq('id', user.id).single();
  me = { ...data, id: user.id }; abrirApp();
}
const BASE = location.href.split('?')[0].split('#')[0];   // página para onde os links do e-mail voltam
const DOMINIO = '';                                       // ex.: '@empresa.com.br' (validação só no navegador)
const msgErro = e => /not confirmed/i.test(e.message) ? 'Confirme seu e-mail pelo link enviado antes de entrar.'
  : /invalid login/i.test(e.message) ? 'E-mail ou senha incorretos.' : e.message;
async function entrar() {
  const { error } = await sb.auth.signInWithPassword({ email: $('aEmail').value.trim(), password: $('aSenha').value });
  error ? alert(msgErro(error)) : perfil();
}
async function criarConta() {
  const email = $('aEmail').value.trim(), nome = $('aNome').value.trim();
  if (!nome) return alert('Informe seu nome.');
  if (DOMINIO && !email.toLowerCase().endsWith(DOMINIO)) return alert('Use seu e-mail corporativo (' + DOMINIO + ').');
  if ($('aSenha').value.length < 8) return alert('A senha deve ter pelo menos 8 caracteres.');
  const { error } = await sb.auth.signUp({ email, password: $('aSenha').value, options: { data: { nome }, emailRedirectTo: BASE } });
  alert(error ? msgErro(error) : 'Conta criada. Confirme o e-mail pelo link enviado e depois entre. O papel é definido pelo administrador.');
}
async function esqueci() {
  const email = $('aEmail').value.trim();
  if (!email) return alert('Digite seu e-mail no campo acima.');
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: BASE });
  alert(error ? msgErro(error) : 'Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
}
async function sair() { if (!demo) await sb.auth.signOut(); sessionStorage.removeItem('giroMe'); location.reload(); }

// ===== Lista e ações =====
async function carregar() { try { rows = await listar(); pintar(); } catch (e) { alert(e.message); } }
function acao(m) {
  const p = me.papel, a = p === 'admin', s = m.status;
  if ((p === 'oficina' || a) && s === 'enviado_oficina') return 'receber';
  if ((p === 'oficina' || a) && s === 'em_reparo') return 'liberar';
  if (((p === 'estoque' || a) && s === 'enviado_estoque') || ((p === 'campo' || a) && s === 'enviado_campo')) return 'confirmar';
}
function pintar() {
  const q = $('q').value.toLowerCase(), f = $('f').value;
  $('pend').textContent = rows.filter(m => m.status.startsWith('enviado')).length;
  $('tb').innerHTML = rows.filter(m => (!f || m.status === f) &&
    (!q || [m.numero, m.serie, m.cod_material, m.nome, m.origem, m.destino].join(' ').toLowerCase().includes(q)))
    .map(m => {
      const [t, c] = ST[m.status], a = acao(m);
      return `<tr><td><b class="text-danger">${esc(m.numero)}</b></td>
        <td>${esc(m.cod_material)}<br><small class="text-muted">${esc(m.nome)}</small></td><td>${esc(m.serie)}</td>
        <td><small>${esc(m.origem)} → ${esc(m.destino)}</small></td>
        <td><span class="badge text-bg-${c}">${t}</span></td>
        <td class="text-nowrap">${a ? `<button class="btn btn-sm btn-primary" onclick="agir('${a}','${m.id}')">${AC[a]}</button> ` : ''}
        ${['campo', 'admin'].includes(me.papel) && !reqs.some(r => r.mov_id == m.id) ? `<button class="btn btn-sm btn-outline-primary" onclick="abrirReq('${m.id}')">Requisitar</button> ` : ''}
        <button class="btn btn-sm btn-outline-secondary" onclick="imprimir('${m.id}')">Etiqueta</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="hist('${m.id}')">Histórico</button></td></tr>`;
    }).join('') || '<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma movimentação. Registre uma remoção para começar.</td></tr>';
}
async function mudar(id, p) { try { await atualizar(id, p); await carregar(); } catch (e) { alert(e.message); } }
function agir(a, id) {
  if (a === 'liberar') { $('lid').value = id; return modal('mLib').show(); }
  mudar(id, { status: a === 'receber' ? 'em_reparo' : 'recebido' });
}
$('fLib').onsubmit = async e => {
  e.preventDefault(); const l = $('lLocal').value;
  await mudar($('lid').value, { status: l === 'Estoque' ? 'enviado_estoque' : 'enviado_campo', condicao: $('lCond').value, local_envio: l, lib_data: hoje(), lib_resp: me.nome });
  modal('mLib').hide();
};
$('fNova').onsubmit = async e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  f.qtde = +f.qtde; f.falha_aberta = !!f.falha_aberta; f.responsavel = me.nome;
  try { await criar(f); modal('mNova').hide(); e.target.reset(); $('nOrigem').value = me.area || ''; await carregar(); }
  catch (er) { alert(er.message); }
};
async function hist(id) {
  const h = await eventos(id), m = rows.find(x => x.id == id);
  $('gTit').textContent = 'Histórico ' + m.numero;
  $('gBody').innerHTML = '<ul class="list-group">' + h.map(x => `<li class="list-group-item d-flex justify-content-between"><span>${ST[x.status][0]}<br><small class="text-muted">${esc(x.user_nome)}</small></span><small>${new Date(x.created_at).toLocaleString('pt-BR')}</small></li>`).join('') + '</ul>';
  modal('mGen').show();
}

// ===== Etiqueta (HTML para impressão, duas vias) =====
function imprimir(id) {
  let m = rows.find(x => x.id == id);
  m = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'string' ? esc(v) : v]));
  const q = qrcode(0, 'M'); q.addData(location.href.split('?')[0] + '?q=' + m.numero); q.make();
  const qr = q.createDataURL(4), A = new URL('assets/', location.href).href;
  const box = (l, v, s = '') => `<div class="b" style="${s}"><small>${l}</small><div>${v ?? ''}</div></div>`;
  const head = t => `<div class="h"><img src="${A}logo_metro.png" height="24"><b>ETIQUETA DE COMPONENTE</b></div><div class="t">${t}</div>`;
  const ident = box('Número Etiqueta', `<b class="n">${m.numero}</b>`) + box('Código do Material', `<b class="c">${m.cod_material}</b>`) +
    box('Nome do Componente', m.nome) + `<div class="r">${box('Qtde', `<b>${m.qtde}</b>`)}${box('Unid.', m.unidade)}${box('Nº Componente/Série', m.serie)}</div>` + box('Origem', m.origem);
  const foot = `<div class="f"><img src="${qr}" width="70"><small>Etiqueta Digital gerada automaticamente pela aplicação "#GIRO".<br>Leia o QR Code com a câmera de um smartphone para mais detalhes dessa transação.</small></div>`;
  const via1 = head('1ª Via – Dados de Defeito/Falha e/ou Movimentação e Controle do Giro') + ident +
    `<div class="r">${box('Data da Remoção', fd(m.data_remocao))}${box('Falha Aberta?', m.falha_aberta ? 'Sim' : 'Não')}${box('Nº da Falha', m.num_falha)}</div>` +
    box('Causa da Remoção', m.causa) + box('Responsável pelas Informações', m.responsavel) +
    box('Controle do Giro (Origem → Destino)', `${m.origem} → ${m.destino}`) + box('Detalhes do Pedido / Falha ou Defeito', m.detalhes, 'min-height:70px') + foot;
  const ck = c => (m.condicao === c ? '☒ ' : '☐ ') + c;
  const via2 = head('2ª Via – Dados de Liberação/Estoque/Condição') + ident +
    box('Condição do componente', ['Bom para uso', 'Não utilizável', 'Liberado sob concessão', 'Outro'].map(ck).join('<br>')) +
    box('Local de Envio', m.local_envio) + `<div class="r">${box('Data de Liberação', fd(m.lib_data))}${box('Responsável', m.lib_resp)}</div>` + foot;
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${m.numero}</title><style>
  @page{size:A4;margin:8mm}body{font:11px 'Segoe UI',Arial,sans-serif;color:#404040;margin:0}
  .w{display:flex;gap:8mm}.v{width:50%;border:2px solid #404040;padding:6px;box-sizing:border-box}
  .h{display:flex;align-items:center;gap:8px;margin-bottom:2px}.t{font-size:9px;margin-bottom:6px}
  .b{border:1px dashed #7F7F7F;padding:2px 4px;margin-bottom:4px}.b small{display:block;font-size:8px}
  .r{display:flex;gap:4px}.r .b{flex:1}.n{color:#C00000;font-size:20px}.c{font-size:18px}
  .f{display:flex;gap:6px;align-items:center;border-top:1px solid #595959;padding-top:4px;margin-top:6px}.f small{font-size:8px}
  </style><div class="w"><div class="v">${via1}</div><div class="v">${via2}</div></div>`);
  w.document.close(); setTimeout(() => w.print(), 500);
}

// ===== Requisições e empenho =====
const SR = { solicitada: ['Solicitada', 'warning'], empenhada: ['Empenhada', 'info'], enviada: ['Enviada ao campo', 'primary'], recebida: ['Recebida', 'success'] };
const AR = { empenhar: 'Empenhar', enviar: 'Registrar envio', receber: 'Confirmar recebimento' };
let reqs = [];
Object.entries(SR).forEach(([k, v]) => $('fr').insertAdjacentHTML('beforeend', `<option value="${k}">${v[0]}</option>`));
const LR = { get: () => JSON.parse(localStorage.giroReq || '[]'), set: v => localStorage.giroReq = JSON.stringify(v) };
async function listarReq() {
  if (demo) return LR.get();
  const { data, error } = await sb.from('requisicoes').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data;
}
async function criarReq(r) {
  if (demo) {
    const a = LR.get(), m = rows.find(x => x.id == r.mov_id);
    if (a.some(x => x.mov_id == r.mov_id)) throw new Error('Esta etiqueta já tem requisição.');
    Object.assign(r, { id: crypto.randomUUID(), numero: m.numero, cod_material: m.cod_material, nome: m.nome, unidade: m.unidade, status: 'solicitada' });
    a.unshift(r); LR.set(a); return;
  }
  const { error } = await sb.from('requisicoes').insert(r); if (error) throw error;
}
async function atualizarReq(id, p) {
  if (demo) { const a = LR.get(); Object.assign(a.find(x => x.id == id), p); LR.set(a); return; }
  const { error } = await sb.from('requisicoes').update(p).eq('id', id); if (error) throw error;
}
function acaoReq(r) {
  const p = me.papel, a = p === 'admin', s = r.status;
  if ((p === 'estoque' || a) && s === 'solicitada') return 'empenhar';
  if ((p === 'estoque' || a) && s === 'empenhada') return 'enviar';
  if ((p === 'campo' || a) && s === 'enviada') return 'receber';
}
async function carregarReq() { try { reqs = await listarReq(); pintarReq(); pintar(); } catch (e) { alert(e.message); } }
function pintarReq() {
  const f = $('fr').value;
  $('pendReq').textContent = reqs.filter(r => r.status !== 'recebida').length;
  $('tbr').innerHTML = reqs.filter(r => !f || r.status === f).map(r => {
    const [t, c] = SR[r.status], a = acaoReq(r);
    return `<tr><td><b>${esc(r.numero)}</b><br><small class="text-muted">${esc(r.solicitante)}</small></td>
      <td>${esc(r.cod_material)}<br><small class="text-muted">${esc(r.nome)}</small></td><td>${esc(r.qtde)} ${esc(r.unidade)}</td>
      <td>${esc(r.area_destino)}</td><td><span class="badge text-bg-${c}">${t}</span></td>
      <td>${a ? `<button class="btn btn-sm btn-primary" onclick="agirReq('${a}','${r.id}')">${AR[a]}</button>` : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma requisição.</td></tr>';
}
async function mudarReq(id, p) { try { await atualizarReq(id, p); await carregarReq(); } catch (e) { alert(e.message); } }
function agirReq(a, id) {
  if (a === 'empenhar') { $('eid').value = id; $('eObs').value = ''; return modal('mEmp').show(); }
  mudarReq(id, a === 'enviar' ? { status: 'enviada' } : { status: 'recebida', recebido_data: hoje(), recebido_resp: me.nome });
}
$('fEmp').onsubmit = async e => {
  e.preventDefault();
  await mudarReq($('eid').value, { status: 'empenhada', empenho_data: hoje(), empenho_resp: me.nome, observacao: $('eObs').value });
  modal('mEmp').hide();
};
function abrirReq(id) {
  const livres = rows.filter(m => !reqs.some(r => r.mov_id == m.id));
  if (!livres.length) return alert('Todas as etiquetas já têm requisição.');
  $('rMov').innerHTML = livres.map(m => `<option value="${m.id}">${esc(m.numero)} | ${esc(m.cod_material)} | ${esc(m.nome)}</option>`).join('');
  if (id) $('rMov').value = id;
  modal('mReq').show();
}
$('fReq').onsubmit = async e => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  f.qtde = +f.qtde; f.solicitante = me.nome;
  try { await criarReq(f); pintar(); modal('mReq').hide(); e.target.reset(); $('rDestino').value = me.area || ''; await carregarReq(); }
  catch (er) { alert(er.message); }
};
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  $('pMov').classList.toggle('d-none', b.dataset.t !== 'Mov');
  $('pReq').classList.toggle('d-none', b.dataset.t !== 'Req');
});

// ===== Início =====
(async () => {
  if (demo) {
    $('demoBox').classList.remove('d-none');
    if (sessionStorage.giroMe) { me = JSON.parse(sessionStorage.giroMe); abrirApp(); }
    return;
  }
  $('authBox').classList.remove('d-none');
  sb = supabase.createClient(CFG.url, CFG.key);
  sb.auth.onAuthStateChange(async (evento) => {
    if (evento !== 'PASSWORD_RECOVERY') return;
    const nova = prompt('Digite sua nova senha (mínimo 8 caracteres):');
    if (!nova || nova.length < 8) return alert('Senha não alterada. Peça um novo link em "Esqueci minha senha".');
    const { error } = await sb.auth.updateUser({ password: nova });
    alert(error ? msgErro(error) : 'Senha alterada com sucesso.');
    perfil();
  });
  const { data: { session } } = await sb.auth.getSession(); if (session) perfil();
})();
