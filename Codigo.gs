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
var AB_COL   = 'COLABORADORES';
var AB_MAPA  = 'MAPA_TRILHOS';

/* POSTO guarda o número da OP e COD_PECA o código do item — nomes herdados de
   quando o app pensava em postos, mantidos para não quebrar o que já leu a aba. */
var CAB_REG = ['TS','ID_ENVIO','LOTE','COR','DATA_EMB','COD_PRODUTO','DESC_PRODUTO',
               'VOLUMES','N_POSTOS','POSTO','MATRICULA','NOME','COD_PECA','DESC_PECA',
               'QTD','TIPO'];
var CAB_COL = ['MATRICULA','NOME','ATIVO','CADASTRADO_EM'];

/* O mapa dos trilhos é o desenho da esteira para um produto: qual item entra
   em qual trilho, em que ordem, e qual OP cobre aquele trilho. Uma linha por
   item — trilho com dois itens ocupa duas linhas, trilho vazio não ocupa
   nenhuma (o número dele volta pelo N_TRILHOS do cabeçalho). */
var CAB_MAPA = ['COD_PRODUTO','DESC_PRODUTO','N_TRILHOS','TRILHO','OP','SEQ',
                'COD_ITEM','DESC_ITEM','QTD','TIPO','VELOCIDADE','N_ESQUEMA',
                'ATUALIZADO_EM'];

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
    if (p.acao === 'salvar_mapa')  return json(salvarMapa(ss, p));
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
  var ini = reg.getLastRow() + 1;
  garantirLinhas(reg, ini + linhas.length);
  reg.getRange(ini, 1, linhas.length, CAB_REG.length).setValues(linhas);

  return { ok: true, linhas: linhas.length };
}

/**
 * Grava o mapa dos trilhos de um produto. Sobrescreve o mapa anterior daquele
 * código: o mapa é o desenho vigente da esteira, não histórico. O que aconteceu
 * em cada lote fica em REGISTRO, que é append-only.
 *
 * Apagar linha a linha ficaria lento num mapa de 28 trilhos, então reescreve a
 * aba inteira sem as linhas do produto e devolve as novas de uma vez só.
 */
function salvarMapa(ss, p) {
  if (!p.cod_produto) return { ok: false, erro: 'cod_produto obrigatorio' };
  if (!p.trilhos || !p.trilhos.length) return { ok: false, erro: 'mapa vazio' };

  var sh = aba(ss, AB_MAPA, CAB_MAPA);
  var cod = String(p.cod_produto);
  var ts = new Date();
  var ult = sh.getLastRow();

  var mantidas = [];
  if (ult > 1) {
    var vals = sh.getRange(2, 1, ult - 1, CAB_MAPA.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) !== cod) mantidas.push(vals[i]);
    }
  }

  var novas = p.trilhos.map(function (t) {
    return [cod, p.desc_produto || '', p.n_trilhos || 0, t.trilho, t.op || '',
            t.seq || 1, t.cod_item, t.desc_item || '', t.qtd || 0, t.tipo || '',
            p.velocidade || '', p.n_esquema || '', ts];
  });

  var todas = mantidas.concat(novas);
  if (ult > 1) sh.getRange(2, 1, ult - 1, CAB_MAPA.length).clearContent();
  if (todas.length) {
    garantirLinhas(sh, todas.length + 1);
    sh.getRange(2, 1, todas.length, CAB_MAPA.length).setValues(todas);
  }
  return { ok: true, trilhos: p.n_trilhos || 0, linhas: novas.length };
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

/**
 * Aba nova nasce com 1.000 linhas e getRange() estoura se a linha pedida passar
 * do tamanho do grid — não cresce sozinha como o appendRow. REGISTRO ganha ~280
 * linhas por dia, então sem isto a gravação começaria a falhar na primeira
 * semana de fábrica. Cresce com folga para não chamar insertRowsAfter a cada
 * lote salvo.
 */
function garantirLinhas(sh, ate) {
  var max = sh.getMaxRows();
  if (ate > max) sh.insertRowsAfter(max, ate - max + 500);
}

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

/**
 * Devolve a aba, criando-a se não existir. Se a aba existir mas estiver vazia
 * — caso de quem criou na mão antes de rodar o script — escreve o cabeçalho
 * mesmo assim: sem ele o app não acha as colunas e a aba parece quebrada.
 */
function aba(ss, nome, cab) {
  var sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);
  if (sh.getLastRow() === 0) {
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

/** Rode uma vez pelo editor para autorizar o script e criar as abas. */
function garantirAbas() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  aba(ss, AB_REG, CAB_REG);
  aba(ss, AB_MAPA, CAB_MAPA);
  aba(ss, AB_COL, CAB_COL);
  Logger.log('abas prontas');
}

/**
 * Cadastro em lote da equipe da embalagem — mais rápido que digitar um a um
 * pelo tablet. Cole os nomes aqui, rode uma vez, apague a lista.
 * Formato: 'matricula, nome' por linha.
 */
function cadastrarEquipe() {
  var LISTA = [
    // '12345, MARIA DA SILVA',
    // '12346, JOAO SOUZA',
  ];
  if (!LISTA.length) { Logger.log('preencha LISTA antes de rodar'); return; }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = aba(ss, AB_COL, CAB_COL);
  var ja = {};
  var ult = sh.getLastRow();
  if (ult > 1) {
    sh.getRange(2, 1, ult - 1, 1).getValues().forEach(function (r) {
      ja[String(r[0]).trim()] = true;
    });
  }

  var novas = [], pulados = [];
  LISTA.forEach(function (linha) {
    var partes = String(linha).split(',');
    var mat = (partes.shift() || '').trim();
    var nome = partes.join(',').trim();
    if (!mat || !nome) { pulados.push(linha + ' (formato)'); return; }
    if (ja[mat]) { pulados.push(linha + ' (ja cadastrada)'); return; }
    ja[mat] = true;
    novas.push([mat, nome, 'SIM', new Date()]);
  });

  if (novas.length) {
    var ini = sh.getLastRow() + 1;
    garantirLinhas(sh, ini + novas.length);
    sh.getRange(ini, 1, novas.length, CAB_COL.length).setValues(novas);
  }
  Logger.log(novas.length + ' cadastrados; ' + pulados.length + ' pulados: ' + pulados.join(' | '));
}
