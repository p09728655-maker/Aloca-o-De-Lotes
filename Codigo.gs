/**
 * Alocação da Embalagem — gravação no Google Sheets
 * PPCP · Patrimar Móveis
 *
 * Implantação:
 *   1. Extensões > Apps Script na própria planilha
 *   2. Cole este arquivo, ajuste SHEET_ID se necessário
 *   3. Execute garantirAbas() uma vez (autoriza e cria as abas)
 *   4. Implantar > Nova implantação > Aplicativo da Web
 *        Executar como: Eu
 *        Quem tem acesso: Qualquer pessoa
 *   5. Copie a URL /exec e cole no ⚙ do app
 *
 * Toda gravação carrega id_envio. Reenvio com o mesmo id é descartado —
 * é o que impede lote lançado em duplicidade quando o Wi-Fi da fábrica cai.
 */

var SHEET_ID = '1W9bK_IoWknk8eKFbSWCMxILAQcaXuWD2gG7B0jcwFzg';

var AB_REG   = 'REGISTRO';
var AB_PAD   = 'ALOCACAO_PADRAO';
var AB_COL   = 'COLABORADORES';

var CAB_REG = ['TS','ID_ENVIO','LOTE','COR','DATA_EMB','COD_PRODUTO','DESC_PRODUTO',
               'VOLUMES','N_POSTOS','POSTO','MATRICULA','NOME','COD_PECA','DESC_PECA',
               'QTD','TIPO'];
var CAB_PAD = ['COD_PRODUTO','POSTO','COD_PECA','QTD','ATUALIZADO_EM'];
var CAB_COL = ['MATRICULA','NOME','ATIVO','CADASTRADO_EM'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json({ ok: false, erro: 'servidor ocupado, tente de novo' });
  }
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, erro: 'requisicao vazia' });
    }
    var p = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SHEET_ID);

    if (p.acao === 'salvar_lote')  return json(salvarLote(ss, p));
    if (p.acao === 'colaborador')  return json(salvarColaborador(ss, p));
    return json({ ok: false, erro: 'acao desconhecida: ' + p.acao });

  } catch (err) {
    return json({ ok: false, erro: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json({ ok: true, servico: 'alocacao-embalagem', ts: new Date().toISOString() });
}

/* ---------------------------------------------------------------- */

function salvarLote(ss, p) {
  if (!p.lote || !p.cod_produto) return { ok: false, erro: 'lote e cod_produto sao obrigatorios' };
  if (!p.linhas || !p.linhas.length) return { ok: false, erro: 'nenhuma linha para gravar' };

  var reg = aba(ss, AB_REG, CAB_REG);

  // idempotência: id_envio já gravado significa reenvio, não lançamento novo
  if (p.id_envio && jaGravado(reg, p.id_envio)) {
    return { ok: true, duplicado: true, linhas: 0 };
  }

  var ts = new Date();
  var linhas = p.linhas.map(function (l) {
    return [ts, p.id_envio || '', p.lote, p.cor || '', p.data_emb || '',
            p.cod_produto, p.desc_produto || '', p.volumes || 0, p.n_postos || 0,
            l.posto, l.matricula || '', l.nome || '', l.cod_peca,
            l.desc_peca || '', l.qtd || 0, l.tipo || ''];
  });
  reg.getRange(reg.getLastRow() + 1, 1, linhas.length, CAB_REG.length).setValues(linhas);

  atualizarPadrao(ss, p, ts);
  return { ok: true, linhas: linhas.length };
}

/**
 * O padrão é sobrescrito por produto: a alocação mais recente vale.
 * O histórico não se perde — ele mora em REGISTRO, que é append-only.
 */
function atualizarPadrao(ss, p, ts) {
  var sh = aba(ss, AB_PAD, CAB_PAD);
  var cod = String(p.cod_produto);
  var ult = sh.getLastRow();

  if (ult > 1) {
    var vals = sh.getRange(2, 1, ult - 1, 1).getValues();
    // apaga de baixo para cima para os índices não escorregarem
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]) === cod) sh.deleteRow(i + 2);
    }
  }
  var novas = p.linhas.map(function (l) {
    return [cod, l.posto, l.cod_peca, l.qtd || 0, ts];
  });
  if (novas.length) {
    sh.getRange(sh.getLastRow() + 1, 1, novas.length, CAB_PAD.length).setValues(novas);
  }
}

function salvarColaborador(ss, p) {
  var mat = String(p.matricula || '').trim();
  var nome = String(p.nome || '').trim();
  if (!mat || !nome) return { ok: false, erro: 'matricula e nome sao obrigatorios' };

  var sh = aba(ss, AB_COL, CAB_COL);
  var ult = sh.getLastRow();
  if (ult > 1) {
    var vals = sh.getRange(2, 1, ult - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === mat) {
        return { ok: false, erro: 'matricula ' + mat + ' ja cadastrada' };
      }
    }
  }
  sh.appendRow([mat, nome, 'SIM', new Date()]);
  return { ok: true };
}

/* ---------------------------------------------------------------- */

function jaGravado(sh, id) {
  var ult = sh.getLastRow();
  if (ult < 2) return false;
  // olha só as últimas 5.000 linhas: reenvio é sempre recente e varrer a
  // aba inteira ficaria lento conforme o histórico cresce
  var ini = Math.max(2, ult - 5000);
  var vals = sh.getRange(ini, 2, ult - ini + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) return true;
  }
  return false;
}

function aba(ss, nome, cab) {
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cab.length).setValues([cab]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cab.length).setFontWeight('bold');
  }
  return sh;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Rode uma vez pelo editor para autorizar o script e criar as três abas. */
function garantirAbas() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  aba(ss, AB_REG, CAB_REG);
  aba(ss, AB_PAD, CAB_PAD);
  aba(ss, AB_COL, CAB_COL);
  Logger.log('abas prontas');
}
