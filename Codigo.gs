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
var AB_MAPAS = 'MAPAS';
var AB_LOTES = 'LOTES';
var AB_CONF  = 'CONFERENCIAS';

/* POSTO guarda o número da OP e COD_PECA o código do item — nomes herdados de
   quando o app pensava em postos, mantidos para não quebrar o que já leu a aba. */
var CAB_REG = ['TS','ID_ENVIO','LOTE','COR','DATA_EMB','COD_PRODUTO','DESC_PRODUTO',
               'VOLUMES','N_POSTOS','POSTO','MATRICULA','NOME','COD_PECA','DESC_PECA',
               'QTD','TIPO'];
var CAB_COL = ['MATRICULA','NOME','ATIVO','CADASTRADO_EM'];

/* O mapa dos trilhos é o desenho da esteira para um produto: qual item entra
   em qual trilho, em que ordem, e qual OP cobre aquele trilho. Uma linha por
   item — trilho com dois itens ocupa duas linhas, trilho vazio não ocupa
   nenhuma (o número dele volta pelo N_TRILHOS do cabeçalho).
   VERSAO amarra a linha a uma versão do mapa: salvar de novo não apaga mais
   nada, acrescenta as linhas da versão nova. Linha antiga sem VERSAO é da
   época pré-versionamento e vale como V1. */
var CAB_MAPA = ['COD_PRODUTO','DESC_PRODUTO','N_TRILHOS','TRILHO','OP','SEQ',
                'COD_ITEM','DESC_ITEM','QTD','TIPO','VELOCIDADE','N_ESQUEMA',
                'ATUALIZADO_EM','VERSAO'];

/* Cabeçalho de cada versão do mapa: quem criou, quando, por quê, e qual está
   ATIVA. Só uma versão fica ATIVA por produto — as demais viram INATIVA mas
   nunca são apagadas: é o que permite mostrar, meses depois, que o LT 123
   foi conferido no mapa V02 mesmo que hoje a vigente seja a V03. */
var CAB_MAPAS = ['COD_PRODUTO','DESC_PRODUTO','VERSAO','STATUS','DATA',
                 'RESPONSAVEL','MOTIVO','N_TRILHOS','VELOCIDADE','N_ESQUEMA',
                 'ID_ENVIO'];

/* Uma linha por lote × produto, criada quando a conferência começa. A VERSAO
   gravada aqui é a amarração que não muda mais: mapa novo vale para lote
   novo, nunca retroage sobre lote iniciado. N_VOLUMES é quantas caixas o
   lote tem (vem da programação) e VOL_CONCLUIDOS quantas já passaram
   inteiras pela conferência — o lote só conclui quando as duas colunas
   se igualam. */
var CAB_LOTES = ['LOTE','COR','COD_PRODUTO','DESC_PRODUTO','VERSAO',
                 'DATA_INICIO','DATA_CONCLUSAO','STATUS','N_VOLUMES',
                 'VOL_CONCLUIDOS'];

/* Append-only: cada toque em “Conferir” do operador vira uma linha, com peça,
   trilho, volume (qual das caixas do lote), quem conferiu e quando.
   RESULTADO é OK ou DIVERGENTE. Linha antiga sem VOLUME vale como volume 1. */
var CAB_CONF = ['TS','ID_ENVIO','LOTE','COD_PRODUTO','VERSAO','TRILHO',
                'COD_PECA','DESC_PECA','QTD','MATRICULA','NOME','RESULTADO',
                'OBS','VOLUME'];

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
    if (p.acao === 'iniciar_lote') return json(iniciarLote(ss, p));
    if (p.acao === 'conferir')     return json(conferir(ss, p));
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

  /* O id_envio só pega reenvio do MESMO pacote, que é o caso do Wi-Fi caindo.
     Não pega o líder tocando em Gravar lote de novo: aí o id é outro e as duas
     gravações entram, dobrando a quantidade de todo indicador feito em cima.
     Regravar o mesmo lote é legítimo — corrigir um nome, refazer o rodízio —,
     então em vez de recusar, pergunta e substitui. */
  var antigas = linhasDoLote(reg, p.lote, p.cod_produto);
  if (antigas.length && !p.substituir) {
    return { ok: false, erro: 'ja_gravado', lote: p.lote, cod_produto: p.cod_produto,
             linhas_antigas: antigas.length };
  }
  if (antigas.length) apagarLinhas(reg, antigas);

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
 * Grava o mapa de um produto como uma VERSÃO NOVA, sem apagar as anteriores.
 * O cabeçalho da versão (data, responsável, motivo, status) vai para MAPAS;
 * as linhas item→trilho vão para MAPA_TRILHOS com o número da versão. Só uma
 * versão fica ATIVA por produto — as anteriores viram INATIVA mas continuam
 * gravadas: lote que começou a conferência na V02 mostra V02 para sempre.
 */
function salvarMapa(ss, p) {
  if (!p.cod_produto) return { ok: false, erro: 'cod_produto obrigatorio' };
  if (!p.trilhos || !p.trilhos.length) return { ok: false, erro: 'mapa vazio' };

  var cab = aba(ss, AB_MAPAS, CAB_MAPAS);
  var itens = aba(ss, AB_MAPA, CAB_MAPA);
  garantirColunaVersao(itens);

  var cod = String(p.cod_produto);
  if (p.id_envio && jaGravadoNaCol(cab, 11, p.id_envio)) {
    return { ok: true, duplicado: true };
  }

  // próxima versão: 1 + a maior já vista, no cabeçalho ou nas linhas de item
  // (linha antiga sem VERSAO conta como V1)
  var versao = maxVersaoItens(itens, cod);
  var ult = cab.getLastRow();
  if (ult > 1) {
    var vals = cab.getRange(2, 1, ult - 1, CAB_MAPAS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) !== cod) continue;
      versao = Math.max(versao, parseInt(vals[i][2], 10) || 0);
      if (String(vals[i][3]).toUpperCase() === 'ATIVA') {
        cab.getRange(i + 2, 4).setValue('INATIVA');
      }
    }
  }
  versao++;

  var ts = new Date();
  cab.appendRow([cod, p.desc_produto || '', versao, 'ATIVA', ts,
                 p.responsavel || '', p.motivo || '', p.n_trilhos || 0,
                 p.velocidade || '', p.n_esquema || '', p.id_envio || '']);

  var novas = p.trilhos.map(function (t) {
    return [cod, p.desc_produto || '', p.n_trilhos || 0, t.trilho, t.op || '',
            t.seq || 1, t.cod_item, t.desc_item || '', t.qtd || 0, t.tipo || '',
            p.velocidade || '', p.n_esquema || '', ts, versao];
  });
  var ini = itens.getLastRow() + 1;
  garantirLinhas(itens, ini + novas.length);
  itens.getRange(ini, 1, novas.length, CAB_MAPA.length).setValues(novas);

  return { ok: true, versao: versao, linhas: novas.length };
}

/**
 * Amarra o lote à versão vigente do mapa no momento em que a conferência
 * começa. Se o lote já foi iniciado, devolve a amarração que existe — trocar
 * a versão de um lote iniciado reescreveria o histórico, e isso não acontece
 * por aqui em hipótese nenhuma.
 */
function iniciarLote(ss, p) {
  if (!p.lote || !p.cod_produto) {
    return { ok: false, erro: 'lote e cod_produto sao obrigatorios' };
  }
  var sh = aba(ss, AB_LOTES, CAB_LOTES);
  garantirColunas(sh, CAB_LOTES);
  var r = acharLinhaLote(sh, p.lote, p.cod_produto);
  if (r) {
    return { ok: true, ja_iniciado: true,
             versao: parseInt(sh.getRange(r, 5).getValue(), 10) || 0,
             status: String(sh.getRange(r, 8).getValue() || ''),
             n_volumes: parseInt(sh.getRange(r, 9).getValue(), 10) || 0 };
  }
  var versao = parseInt(p.versao, 10) || versaoAtiva(ss, p.cod_produto);
  if (!versao) return { ok: false, erro: 'produto sem mapa ativo' };
  sh.appendRow([String(p.lote), p.cor || '', String(p.cod_produto),
                p.desc_produto || '', versao, new Date(), '', 'EM CONFERENCIA',
                parseInt(p.n_volumes, 10) || 1, 0]);
  return { ok: true, versao: versao, status: 'EM CONFERENCIA' };
}

/**
 * Registra as peças conferidas (append-only, idempotente por id_envio) e
 * atualiza o status do lote. O status vem calculado do tablet, que é quem
 * sabe quantas peças o mapa daquela versão tem.
 */
function conferir(ss, p) {
  if (!p.lote || !p.cod_produto) {
    return { ok: false, erro: 'lote e cod_produto sao obrigatorios' };
  }
  if (!p.itens || !p.itens.length) {
    return { ok: false, erro: 'nenhuma peca para registrar' };
  }
  var sh = aba(ss, AB_CONF, CAB_CONF);
  garantirColunasUmaVez(sh, CAB_CONF);
  if (p.id_envio && jaGravadoNaCol(sh, 2, p.id_envio)) {
    atualizarStatusLote(ss, p);   // o reenvio ainda pode carregar status mais novo
    return { ok: true, duplicado: true, linhas: 0 };
  }
  var ts = new Date();
  var linhas = p.itens.map(function (x) {
    return [ts, p.id_envio || '', String(p.lote), String(p.cod_produto),
            parseInt(p.versao, 10) || 0, x.trilho, x.cod_peca, x.desc_peca || '',
            x.qtd || 0, x.matricula || '', x.nome || '',
            x.resultado || 'OK', x.obs || '',
            parseInt(x.volume || p.volume, 10) || 1];
  });
  var ini = sh.getLastRow() + 1;
  garantirLinhas(sh, ini + linhas.length);
  sh.getRange(ini, 1, linhas.length, CAB_CONF.length).setValues(linhas);

  atualizarStatusLote(ss, p);
  return { ok: true, linhas: linhas.length };
}

/**
 * Antes isto custava até três leituras e quatro escritas soltas na planilha,
 * cada uma com sua ida ao servidor do Sheets — por peça conferida. Agora as
 * quatro colunas móveis (DATA_CONCLUSAO, STATUS, N_VOLUMES, VOL_CONCLUIDOS)
 * são lidas de uma vez, decididas em memória e devolvidas numa escrita só, e
 * só quando alguma mudou.
 */
function atualizarStatusLote(ss, p) {
  var sh = aba(ss, AB_LOTES, CAB_LOTES);
  garantirColunasUmaVez(sh, CAB_LOTES);
  var ts = new Date();
  var r = acharLinhaLote(sh, p.lote, p.cod_produto);
  if (!r) {
    // conferência chegou antes do iniciar_lote (fila offline fora de ordem):
    // cria a amarração aqui mesmo, com a versão que o tablet estava usando
    sh.appendRow([String(p.lote), p.cor || '', String(p.cod_produto),
                  p.desc_produto || '', parseInt(p.versao, 10) || 0, ts,
                  p.status_lote === 'CONCLUIDA' ? ts : '',
                  p.status_lote || 'EM CONFERENCIA',
                  parseInt(p.n_volumes, 10) || 1,
                  parseInt(p.vol_concluidos, 10) || 0]);
    return;
  }

  var faixa = sh.getRange(r, 7, 1, 4);          // DATA_CONCLUSAO .. VOL_CONCLUIDOS
  var v = faixa.getValues()[0];
  var antes = String(v[0]) + '|' + String(v[1]) + '|' + String(v[2]) + '|' + String(v[3]);

  if (p.status_lote) {
    v[1] = p.status_lote;
    if (p.status_lote === 'CONCLUIDA') { if (!v[0]) v[0] = ts; }
    else v[0] = '';
  }
  if (parseInt(p.n_volumes, 10) > 0 && !v[2]) v[2] = parseInt(p.n_volumes, 10);
  if (p.vol_concluidos !== undefined) v[3] = parseInt(p.vol_concluidos, 10) || 0;

  if (String(v[0]) + '|' + String(v[1]) + '|' + String(v[2]) + '|' + String(v[3]) !== antes) {
    faixa.setValues([v]);
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

/**
 * Linhas já gravadas para um lote e produto. Olha só as últimas 5.000: regravar
 * é sempre coisa do mesmo dia, e varrer o histórico inteiro ficaria lento.
 * Colunas 3 a 6 do REGISTRO são LOTE, COR, DATA_EMB e COD_PRODUTO.
 */
function linhasDoLote(sh, lote, cod) {
  var ult = sh.getLastRow();
  if (ult < 2) return [];
  var ini = Math.max(2, ult - 5000);
  var vals = sh.getRange(ini, 3, ult - ini + 1, 4).getValues();
  var achadas = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === String(lote).trim() &&
        String(vals[i][3]).trim() === String(cod).trim()) achadas.push(ini + i);
  }
  return achadas;
}

/**
 * Apaga as linhas de baixo para cima e em blocos: as linhas de uma gravação
 * são contíguas, e uma chamada por bloco em vez de uma por linha é a diferença
 * entre um segundo e meio minuto num mapa de 28 trilhos.
 */
function apagarLinhas(sh, linhas) {
  var ord = linhas.slice().sort(function (a, b) { return b - a; });
  var i = 0;
  while (i < ord.length) {
    var fim = ord[i], j = i;
    while (j + 1 < ord.length && ord[j + 1] === ord[j] - 1) j++;
    sh.deleteRows(ord[j], fim - ord[j] + 1);
    i = j + 1;
  }
}

function jaGravado(sh, id) { return jaGravadoNaCol(sh, 2, id); }

function jaGravadoNaCol(sh, col, id) {
  var ult = sh.getLastRow();
  if (ult < 2) return false;
  // olha só as últimas 5.000 linhas: reenvio é sempre recente e varrer a
  // aba inteira ficaria lento conforme o histórico cresce
  var ini = Math.max(2, ult - 5000);
  var vals = sh.getRange(ini, col, ult - ini + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) return true;
  }
  return false;
}

/* Aba criada por uma versão antiga do script pode ter menos colunas que o
   cabeçalho atual pede. Completa o que falta sem tocar nas linhas de dados —
   célula vazia em linha antiga é lida com o padrão (VERSAO→1, VOLUME→1). */
function garantirColunas(sh, cab) {
  if (sh.getMaxColumns() < cab.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), cab.length - sh.getMaxColumns());
  }
  var atual = sh.getRange(1, 1, 1, cab.length).getValues()[0];
  for (var c = 0; c < cab.length; c++) {
    if (String(atual[c]).trim() !== cab[c]) {
      sh.getRange(1, c + 1).setValue(cab[c]).setFontWeight('bold');
    }
  }
}

/**
 * garantirColunas lê o cabeçalho toda vez que é chamada, e numa conferência
 * isso é uma ida à planilha por peça só para reconfirmar o que já foi
 * confirmado. A aba migrada fica marcada no cache por 6h; cache frio confere
 * de novo, e o pior caso é o comportamento antigo.
 */
function garantirColunasUmaVez(sh, cab) {
  var chave = 'cols_' + sh.getSheetId() + '_' + cab.length;
  var c = null;
  try { c = CacheService.getScriptCache(); } catch (err) {}
  if (c && c.get(chave)) return;
  garantirColunas(sh, cab);
  if (c) c.put(chave, '1', 21600);
}

function garantirColunaVersao(sh) { garantirColunas(sh, CAB_MAPA); }

/** Maior versão presente nas linhas de item de um produto (sem VERSAO = 1). */
function maxVersaoItens(sh, cod) {
  var ult = sh.getLastRow();
  if (ult < 2) return 0;
  var max = 0;
  var vals = sh.getRange(2, 1, ult - 1, Math.min(sh.getMaxColumns(), 14)).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) !== cod) continue;
    max = Math.max(max, parseInt(vals[i][13], 10) || 1);
  }
  return max;
}

/** Versão ATIVA de um produto pela aba MAPAS; mapa antigo sem cabeçalho cai
    na maior versão das linhas de item. */
function versaoAtiva(ss, cod) {
  var sh = ss.getSheetByName(AB_MAPAS);
  var melhor = 0;
  if (sh && sh.getLastRow() > 1) {
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) === String(cod) &&
          String(vals[i][3]).toUpperCase() === 'ATIVA') {
        melhor = Math.max(melhor, parseInt(vals[i][2], 10) || 0);
      }
    }
  }
  if (melhor) return melhor;
  var itens = ss.getSheetByName(AB_MAPA);
  return itens ? maxVersaoItens(itens, String(cod)) : 0;
}

/** Linha (1-based) do lote × produto na aba LOTES, ou 0. */
function acharLinhaLote(sh, lote, cod) {
  var ult = sh.getLastRow();
  if (ult < 2) return 0;
  var vals = sh.getRange(2, 1, ult - 1, 3).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === String(lote).trim() &&
        String(vals[i][2]).trim() === String(cod).trim()) return i + 2;
  }
  return 0;
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

/** Rode uma vez pelo editor para autorizar o script e criar as abas.
    Rodar de novo depois de atualizar o script é seguro: aba que já existe
    não é tocada, só ganha a coluna VERSAO se ainda não tiver. */
function garantirAbas() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  aba(ss, AB_REG, CAB_REG);
  garantirColunas(aba(ss, AB_MAPA, CAB_MAPA), CAB_MAPA);
  aba(ss, AB_MAPAS, CAB_MAPAS);
  garantirColunas(aba(ss, AB_LOTES, CAB_LOTES), CAB_LOTES);
  garantirColunas(aba(ss, AB_CONF, CAB_CONF), CAB_CONF);
  aba(ss, AB_COL, CAB_COL);
  Logger.log('abas prontas');
}

/* ---------------------------------------------------------------- */

/**
 * Tira a duplicidade já gravada, mantendo a gravação mais recente de cada lote
 * e produto — que é a que o líder quis deixar valendo quando salvou de novo.
 * O log diz quantas linhas saíram; para ver o antes e o depois de um lote
 * específico, digite o número dele no app.
 */
function limparDuplicados() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var reg = ss.getSheetByName(AB_REG);
  var ult = reg ? reg.getLastRow() : 0;
  if (ult < 2) { Logger.log('REGISTRO vazio'); return; }

  var vals = reg.getRange(2, 1, ult - 1, 16).getValues();
  var ultimoEnvio = {}, quando = {};
  for (var i = 0; i < vals.length; i++) {
    var chave = String(vals[i][2]).trim() + '|' + String(vals[i][5]).trim();
    var ts = vals[i][0] instanceof Date ? vals[i][0].getTime() : 0;
    if (quando[chave] === undefined || ts >= quando[chave]) {
      quando[chave] = ts;
      ultimoEnvio[chave] = String(vals[i][1]);
    }
  }

  var apagar = [];
  for (var j = 0; j < vals.length; j++) {
    var k = String(vals[j][2]).trim() + '|' + String(vals[j][5]).trim();
    if (String(vals[j][1]) !== ultimoEnvio[k]) apagar.push(j + 2);
  }
  if (!apagar.length) { Logger.log('nada duplicado a limpar'); return; }
  apagarLinhas(reg, apagar);
  Logger.log(apagar.length + ' linha(s) antiga(s) apagada(s); ficou a gravação mais recente de cada lote');
}

/**
 * Zera um lote para testar o fluxo de novo do começo.
 *
 * Apaga desse lote: a amarração e o status (LOTES), as peças conferidas
 * (CONFERENCIAS) e o rodízio gravado (REGISTRO). NÃO toca em MAPAS nem em
 * MAPA_TRILHOS — o mapa é do produto, não do lote, e apagá-lo obrigaria a
 * remontar tudo. Nenhum outro lote é tocado.
 *
 * Como usar: escreva o número do lote em LOTE, rode, confira o log.
 * Deixe LOTE vazio e a função não faz nada — é a trava contra rodar
 * distraído e limpar o lote da vez anterior.
 *
 * ATENÇÃO: em produção isso apaga histórico de verdade, sem desfazer.
 * É ferramenta de teste; para tirar duplicidade use limparDuplicados().
 */
function limparLoteParaTeste() {
  var LOTE = '';            // ex.: '25055'
  var COD_PRODUTO = '';     // vazio = todos os produtos do lote

  var alvo = String(LOTE).trim();
  if (!alvo) { Logger.log('escreva o numero do lote em LOTE antes de rodar'); return; }
  var cod = String(COD_PRODUTO).trim();

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var contas = [];

  // aba, coluna do lote (1-based), coluna do produto (0 = não filtrar)
  [[AB_LOTES, 1, 3], [AB_CONF, 3, 4], [AB_REG, 3, 6]].forEach(function (alvoAba) {
    var nome = alvoAba[0], colLote = alvoAba[1], colCod = alvoAba[2];
    var sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) { contas.push(nome + ': 0'); return; }
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
    var apagar = [];
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][colLote - 1]).trim() !== alvo) continue;
      if (cod && String(vals[i][colCod - 1]).trim() !== cod) continue;
      apagar.push(i + 2);
    }
    if (apagar.length) apagarLinhas(sh, apagar);
    contas.push(nome + ': ' + apagar.length);
  });

  Logger.log('lote ' + alvo + (cod ? ' / produto ' + cod : '') +
             ' zerado — linhas apagadas por aba: ' + contas.join(' · ') +
             '. Mapas preservados.');
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
