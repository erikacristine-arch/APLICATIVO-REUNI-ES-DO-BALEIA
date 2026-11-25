/**
 * Reuniões do Baleia — servidor (Google Apps Script)
 * Guarda as reuniões e a pontuação de todas as seções nesta planilha.
 * O conteúdo de cada reunião chega embaralhado (criptografado) pelo app;
 * aqui só se guarda e se confere a palavra-código antes de gravar ou apagar.
 * Não é preciso editar nada neste arquivo.
 */

// Conferência das palavras-código (não revela as palavras).
const VER = __VER__;

const ABAS = { reunioes: 'Reuniões', planos: 'Formulários', jogos: 'Banco de jogos' };
const PEDACO = 45000; // limite seguro de caracteres por célula

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Reuniões do Baleia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function aba_(c) {
  if (!ABAS[c]) throw new Error('coleção inválida');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(ABAS[c]);
  if (!s) {
    s = ss.insertSheet(ABAS[c]);
    s.getRange(1, 1, 1, 4).setValues([['id', 'secao', 'atualizadoEm', 'dados (embaralhados)']]);
    s.setFrozenRows(1);
  }
  return s;
}

function linhas_(s) {
  const n = s.getLastRow();
  if (n < 2) return [];
  return s.getRange(2, 1, n - 1, Math.max(4, s.getLastColumn())).getValues();
}

function objeto_(linha) {
  const json = linha.slice(3).map(String).join('');
  return json ? JSON.parse(json) : {};
}

function acha_(s, id) {
  const n = s.getLastRow();
  if (n < 2) return 0;
  const ids = s.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return i + 2;
  return 0;
}

function confere_(secao, prova) {
  const esperado = VER[secao];
  if (!esperado) throw new Error('codigo: seção inválida');
  const p = String(prova || '');
  if (!/^[0-9a-f]{64}$/.test(p)) throw new Error('codigo: palavra-código ausente');
  const bytes = [];
  for (let i = 0; i < p.length; i += 2) {
    const b = parseInt(p.substr(i, 2), 16);
    bytes.push(b > 127 ? b - 256 : b);
  }
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  const hex = d.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  if (hex !== esperado) throw new Error('codigo: palavra-código não confere');
}

function grava_(s, linha, id, secao, o) {
  const json = JSON.stringify(o);
  const partes = [];
  for (let i = 0; i < json.length; i += PEDACO) partes.push(json.slice(i, i + PEDACO));
  const vals = [id, secao, o.atualizadoEm || new Date().toISOString()].concat(partes);
  const largura = Math.max(vals.length, s.getLastColumn(), 4);
  while (vals.length < largura) vals.push('');
  const n = linha || s.getLastRow() + 1;
  const r = s.getRange(n, 1, 1, largura);
  r.setNumberFormat('@');
  r.setValues([vals]);
}

function trava_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Chamadas do app ---------- */

function apiList(c) {
  return linhas_(aba_(c)).filter(function (r) { return r[0]; }).map(function (r) {
    const o = objeto_(r);
    o.id = String(r[0]);
    o.secao = String(r[1]);
    return o;
  });
}

function apiGet(c, id) {
  const s = aba_(c);
  const n = acha_(s, String(id));
  if (!n) return null;
  const r = s.getRange(n, 1, 1, Math.max(4, s.getLastColumn())).getValues()[0];
  const o = objeto_(r);
  o.secao = String(r[1]);
  return o;
}

function apiSet(c, id, json, prova) {
  const o = JSON.parse(json);
  const secao = String(o.secao || '');
  confere_(secao, prova);
  return trava_(function () {
    const s = aba_(c);
    const n = acha_(s, String(id));
    if (n && c === 'jogos') throw new Error('ja_existe: o banco de jogos não aceita sobrescrever um jogo');
    if (n && String(s.getRange(n, 2).getValue()) !== secao) throw new Error('codigo: reunião de outra seção');
    grava_(s, n, String(id), secao, o);
    return true;
  });
}

function apiUpdate(c, id, json, prova) {
  const parte = JSON.parse(json);
  return trava_(function () {
    const s = aba_(c);
    const n = acha_(s, String(id));
    if (!n) throw new Error('not_found');
    const r = s.getRange(n, 1, 1, Math.max(4, s.getLastColumn())).getValues()[0];
    const secao = String(r[1]);
    confere_(secao, prova);
    const o = objeto_(r);
    for (const k in parte) o[k] = parte[k];
    o.secao = secao;
    grava_(s, n, String(id), secao, o);
    return true;
  });
}

function apiDelete(c, id, prova) {
  return trava_(function () {
    const s = aba_(c);
    const n = acha_(s, String(id));
    if (!n) return true;
    confere_(String(s.getRange(n, 2).getValue()), prova);
    s.deleteRow(n);
    return true;
  });
}

// Salva a reunião e o formulário numa chamada só (mais rápido).
function apiSaveReuniao(id, resumoJson, pontosJson, planoJson, prova) {
  const resumo = JSON.parse(resumoJson), pontos = JSON.parse(pontosJson), plano = JSON.parse(planoJson);
  const secao = String(resumo.secao || '');
  confere_(secao, prova);
  return trava_(function () {
    const s = aba_('reunioes');
    const n = acha_(s, String(id));
    let o = {};
    if (n) {
      const r = s.getRange(n, 1, 1, Math.max(4, s.getLastColumn())).getValues()[0];
      if (String(r[1]) !== secao) throw new Error('codigo: reunião de outra seção');
      o = objeto_(r);
    }
    for (const k in resumo) o[k] = resumo[k];
    if (!o.p && pontos.p) o.p = pontos.p;
    o.secao = secao;
    grava_(s, n, String(id), secao, o);
    const f = aba_('planos');
    const m = acha_(f, String(id));
    plano.secao = secao;
    grava_(f, m, String(id), secao, plano);
    return true;
  });
}
