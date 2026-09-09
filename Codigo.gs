/**
 * RitmoPatrimar — Mapa dos Trilhos · Embalagem
 * Gravação no Google Sheets · PPCP Patrimar Móveis
 *
 * Uma aba, uma linha por trilho. Nada além disso.
 *
 * Implantação:
 *   1. Na planilha: Extensões > Apps Script
 *   2. Cole este arquivo
 *   3. Execute garantirAbas() uma vez (autoriza o script e cria a aba MAPA)
 *   4. Implantar > Nova implantação > Aplicativo da Web
 *        Executar como:      Eu
 *        Quem tem acesso:    Qualquer pessoa
 *   5. Copie a URL que termina em /exec e cole no ⚙ do app
 *
 * A planilha NÃO precisa ficar pública: o app lê e grava pelo /exec, que
 * roda como você. É um passo a menos de configuração e um buraco a menos
 * de segurança do que a versão que lia a planilha por link aberto.
 */

var SHEET_ID = '1D_GSK7D1SFQCyhgxuqjwawc1tflcm6-5_LQhAMMjh5g';

var AB_MAPA  = 'MAPA';
var AB_COLAB = 'COLABORADORES';
var AB_CONF  = 'CONFERENCIA';

/* Uma linha por TRILHO, inclusive o vazio — é assim que o número de trilhos
   da esteira e a fronteira de cada OP sobrevivem à ida e volta da planilha.
   Trilho com dois itens ocupa duas linhas, distinguidas pelo SEQ.
   O cabeçalho do mapa (descrição, nº de trilhos, velocidade, nº do esquema)
   se repete em toda linha: é redundante, e é de propósito — assim a aba abre
   no Power BI sem relacionamento nenhum. */
var CAB_MAPA = ['COD_PRODUTO', 'DESC_PRODUTO', 'N_TRILHOS', 'VELOCIDADE', 'N_ESQUEMA',
                'TRILHO', 'OP', 'SEQ', 'COD_ITEM', 'DESC_ITEM', 'QTD', 'INSUMO',
                'ATUALIZADO_EM', 'SUSPENSO'];
/* SUSPENSO entra DEPOIS de ATUALIZADO_EM, e não ao lado de INSUMO, que era o
   lugar natural dele. Motivo: aba() só sabe acrescentar coluna no fim. Enfiada
   no meio, a coluna nova cairia em cima da data das linhas ja gravadas e o app
   leria carimbo de hora como marca de suspenso. Coluna em branco nas linhas
   antigas quer dizer "nao suspenso", que e a resposta certa para elas. */

var CAB_COLAB = ['MATRICULA', 'NOME', 'ATIVO', 'CADASTRADO_EM'];

/* Uma linha por peça conferida na caixa de amostra. Carrega a OP e QUEM
   estava nela — é assim que o rodízio fica registrado sem precisar de uma
   segunda aba: quem estava na OP 04 do lote 25055 são os nomes das linhas
   de OP 04 daquele lote.
   Gravar de novo o mesmo lote e produto SUBSTITUI: uma caixa de amostra por
   lote, e o que está na tela é o que vale. */
var CAB_CONF = ['TS', 'LOTE', 'DATA_EMB', 'COD_PRODUTO', 'DESC_PRODUTO',
                'TRILHO', 'OP', 'COD_ITEM', 'DESC_ITEM', 'QTD',
                'MATRICULA', 'NOME', 'RESULTADO', 'OBS',
                'MAT_CONFERENTE', 'NOME_CONFERENTE'];   // quem fez a conferencia

/* O editor do Apps Script lista TODAS as funções no seletor do botão
   Executar, e quem clicar em salvarMapa ali recebe os dados vazios. Sem
   esta mensagem o retorno é um "Cannot read properties of undefined" que
   não diz o que fazer. */
var RODE_NO_APP = 'esta funcao e chamada pelo app, com os dados do mapa. ' +
                  'No editor, rode garantirAbas() ou testar().';

/* ---------------------------------------------------------------- */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json({ ok: false, erro: 'A planilha esta ocupada com outra gravacao. Tente de novo em alguns segundos.' });
  }
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, erro: 'requisicao vazia' });
    }
    var p = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.openById(SHEET_ID);

    if (p.acao === 'salvar')  return json(salvarMapa(ss, p));
    if (p.acao === 'excluir') return json(excluirMapa(ss, p));
    /* Ler também vem por POST: o app usa um transporte só — POST com
       text/plain, que é o que não dispara o preflight CORS que o Apps
       Script não responde. Um caminho testado vale mais que dois meio
       testados. O doGet abaixo fica para conferir no navegador. */
    if (p.acao === 'lista')   return json(listarProdutos(ss));
    if (p.acao === 'mapa')    return json(lerMapa(ss, p.cod));
    if (p.acao === 'colaboradores')  return json(listarColaboradores(ss));
    if (p.acao === 'novo_colaborador') return json(novoColaborador(ss, p));
    if (p.acao === 'conferir')       return json(gravarConferencia(ss, p));
    if (p.acao === 'conferencia')    return json(lerConferencia(ss, p));
    if (p.acao === 'relatorio')      return json(relatorioConferencia(ss, p));
    return json({ ok: false, erro: 'acao desconhecida: ' + p.acao });

  } catch (err) {
    return json({ ok: false, erro: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var acao = (e && e.parameter && e.parameter.acao) || 'lista';
    if (acao === 'mapa') return json(lerMapa(ss, (e.parameter.cod || '')));
    return json(listarProdutos(ss));
  } catch (err) {
    return json({ ok: false, erro: String(err && err.message ? err.message : err) });
  }
}

/* ---------------------------------------------------------------- */

/**
 * Salvar é substituir: as linhas daquele produto saem e as novas entram.
 * Sem versão, sem histórico — foi a decisão de projeto. Quem quiser o mapa
 * de antes tira do histórico de revisões da própria planilha (Arquivo >
 * Histórico de versões), que o Google guarda de graça.
 */
function salvarMapa(ss, p) {
  if (!p) return { ok: false, erro: RODE_NO_APP };
  var cod = normCod(p.cod);
  if (!cod) return { ok: false, erro: 'Falta o codigo do produto.' };
  if (!p.linhas || !p.linhas.length) return { ok: false, erro: 'O mapa esta vazio.' };

  var sh = aba(ss, AB_MAPA, CAB_MAPA);
  var antigas = linhasDoProduto(sh, cod);

  var ts = new Date();
  var novas = p.linhas.map(function (l) {
    return [cod, p.desc || '', p.n_trilhos || 0, p.velocidade || '', p.n_esquema || '',
            l.trilho, l.op || 0, l.seq || 1, l.cod_item || '', l.desc_item || '',
            l.qtd || '', l.insumo ? 'SIM' : '', ts, l.suspenso ? 'SIM' : ''];
  });
  /* Grava as novas ANTES de apagar as antigas. Apagando primeiro, uma falha
     no meio (cota, timeout, celula invalida) deixava o produto sem mapa
     nenhum na planilha. As linhas antigas estao antes das novas, entao os
     indices continuam valendo depois do append. */
  var ini = sh.getLastRow() + 1;
  garantirLinhas(sh, ini + novas.length - 1);
  [1, 2, 5, 9, 10].forEach(function (col) {   // codigos e textos: nao viram numero nem formula
    sh.getRange(ini, col, novas.length, 1).setNumberFormat('@');
  });
  sh.getRange(ini, 1, novas.length, CAB_MAPA.length).setValues(novas);
  SpreadsheetApp.flush();
  apagarLinhas(sh, antigas);

  return { ok: true, cod: cod, gravadas: novas.length, substituidas: antigas.length };
}

function excluirMapa(ss, p) {
  if (!p) return { ok: false, erro: RODE_NO_APP };
  var cod = normCod(p.cod);
  if (!cod) return { ok: false, erro: 'Falta o codigo do produto.' };
  var sh = aba(ss, AB_MAPA, CAB_MAPA);
  var linhas = linhasDoProduto(sh, cod);
  apagarLinhas(sh, linhas);
  return { ok: true, cod: cod, apagadas: linhas.length };
}

/** Só o cabeçalho de cada produto — é o que o app precisa para a lista. */
function listarProdutos(ss) {
  var sh = aba(ss, AB_MAPA, CAB_MAPA);
  var ult = sh.getLastRow();
  if (ult < 2) return { ok: true, produtos: [] };

  var vals = sh.getRange(2, 1, ult - 1, CAB_MAPA.length).getValues();
  var por = {};
  vals.forEach(function (r) {
    var cod = normCod(r[0]);
    if (!cod) return;
    if (!por[cod]) {
      por[cod] = { cod: cod, desc: String(r[1] || ''), n_trilhos: Number(r[2]) || 0,
                   velocidade: r[3], n_esquema: String(r[4] || ''),
                   itens: 0, atualizado: '' };
    }
    if (r[9]) por[cod].itens++;
    var ts = r[12] instanceof Date ? r[12].toISOString() : String(r[12] || '');
    if (ts > por[cod].atualizado) por[cod].atualizado = ts;
  });

  var out = Object.keys(por).map(function (k) { return por[k]; });
  out.sort(function (a, b) { return a.cod < b.cod ? -1 : 1; });
  return { ok: true, produtos: out };
}

function lerMapa(ss, codBruto) {
  var cod = normCod(codBruto);
  if (!cod) return { ok: false, erro: 'cod e obrigatorio' };

  var sh = aba(ss, AB_MAPA, CAB_MAPA);
  var ult = sh.getLastRow();
  if (ult < 2) return { ok: true, achou: false };

  var vals = sh.getRange(2, 1, ult - 1, CAB_MAPA.length).getValues();
  var cab = null, linhas = [];
  vals.forEach(function (r) {
    if (normCod(r[0]) !== cod) return;
    if (!cab) {
      /* Velocidade vai crua: o Sheets guarda 8,5 como o número 8.5, e um
         String() aqui devolveria "8.5" com ponto para a folha impressa. Quem
         põe a vírgula de volta é o app, que sabe que isso é para ler. */
      cab = { cod: cod, desc: String(r[1] || ''), n_trilhos: Number(r[2]) || 0,
              velocidade: r[3], n_esquema: String(r[4] || '') };
    }
    /* OP zero é trilho antes do primeiro posto — a caixa entra na esteira
       ali. Trocar esse 0 por 1 faria a divisa da OP 01 saltar para o trilho
       1 toda vez que o mapa voltasse da planilha. A quantidade vai crua: o
       app normaliza vírgula e ponto melhor do que o Number daqui. */
    linhas.push({ trilho: Number(r[5]) || 0, op: Number(r[6]) || 0, seq: Number(r[7]) || 1,
                  cod_item: String(r[8] || ''), desc_item: String(r[9] || ''),
                  qtd: (r[10] === '' || r[10] === null) ? 0 : r[10],
                  insumo: String(r[11] || '') === 'SIM',
                  suspenso: String(r[13] || '') === 'SIM' });
  });
  if (!cab) return { ok: true, achou: false };
  return { ok: true, achou: true, mapa: cab, linhas: linhas };
}

/* ---------------------------------------------------------------- */

/** A equipe da embalagem. Matrícula é a chave — o Power BI agrupa por ela,
    não pelo nome, que cada um escreve de um jeito. */
function listarColaboradores(ss) {
  var sh = aba(ss, AB_COLAB, CAB_COLAB);
  var ult = sh.getLastRow();
  if (ult < 2) return { ok: true, colaboradores: [] };

  var vals = sh.getRange(2, 1, ult - 1, CAB_COLAB.length).getValues();
  var out = [], vistos = {};
  vals.forEach(function (r) {
    var mat = String(r[0] || '').trim(), nome = String(r[1] || '').trim();
    if (!mat || !nome || vistos[mat]) return;
    if (/^(N|NAO|0|FALSE|INATIVO|DEMITID)/i.test(String(r[2] || 'SIM').trim())) return;
    vistos[mat] = true;
    out.push({ mat: mat, nome: nome });
  });
  out.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  return { ok: true, colaboradores: out };
}

function novoColaborador(ss, p) {
  if (!p) return { ok: false, erro: RODE_NO_APP };
  var mat = String(p.mat || '').trim(), nome = String(p.nome || '').trim();
  if (!mat || !nome) return { ok: false, erro: 'Matricula e nome sao obrigatorios.' };

  var sh = aba(ss, AB_COLAB, CAB_COLAB);
  var ult = sh.getLastRow();
  if (ult >= 2) {
    var mats = sh.getRange(2, 1, ult - 1, 1).getValues();
    for (var i = 0; i < mats.length; i++) {
      if (String(mats[i][0] || '').trim() === mat) {
        return { ok: false, erro: 'matricula ' + mat + ' ja cadastrada' };
      }
    }
  }
  garantirLinhas(sh, ult + 1);
  sh.getRange(ult + 1, 1, 1, CAB_COLAB.length).setValues([[mat, nome, 'SIM', new Date()]]);
  return { ok: true, mat: mat, nome: nome };
}

/**
 * A conferência da caixa de amostra. Substitui o que já houver daquele lote
 * e produto: é uma caixa por lote, e o que está na tela é o que vale. Gravar
 * duas vezes não duplica — o que também deixa a fila de envio do app segura
 * de reenviar sem medo.
 */
function gravarConferencia(ss, p) {
  if (!p) return { ok: false, erro: RODE_NO_APP };
  var lote = String(p.lote || '').trim();
  var cod = normCod(p.cod);
  if (!lote) return { ok: false, erro: 'Falta o numero do lote.' };
  if (!cod)  return { ok: false, erro: 'Falta o codigo do produto.' };
  if (!p.linhas || !p.linhas.length) return { ok: false, erro: 'Nenhuma peca para conferir.' };

  /* Uma pessoa, um posto: a mesma matricula em duas OPs do lote e recusada
     aqui tambem, para o app antigo ou um POST a mao nao gravarem rodizio
     de mentira. */
  var opDaMat = {};
  for (var i = 0; i < p.linhas.length; i++) {
    var op = Number(p.linhas[i].op) || 0, mat = String(p.linhas[i].mat || '').trim();
    if (!op || !mat) continue;
    if (opDaMat[mat] && opDaMat[mat] !== op) {
      return { ok: false, erro: 'O colaborador ' + mat + ' esta na OP ' + dois(opDaMat[mat]) +
               ' e na OP ' + dois(op) + '. Cada OP tem o seu.' };
    }
    /* Peca sem marca nao pode virar OK: a decisao "nada e OK so porque
       ninguem olhou" tem de valer tambem para app antigo em cache. */
    var r = String(p.linhas[i].resultado || '');
    if (r !== 'OK' && r !== 'DIVERGENTE') {
      return { ok: false, erro: 'A peca do trilho ' + (p.linhas[i].trilho || '?') +
               ' esta como ' + (r || 'sem resultado') + '. Atualize o app e confira de novo.' };
    }
    opDaMat[mat] = op;
  }

  var sh = aba(ss, AB_CONF, CAB_CONF);
  var antigas = linhasDoLote(sh, lote, cod);

  var ts = new Date();
  var dataEmb = paraData(p.data_emb);
  var novas = p.linhas.map(function (l) {
    return [ts, lote, dataEmb, cod, p.desc || '',
            l.trilho, l.op || 0, l.cod_item || '', l.desc_item || '', l.qtd || '',
            String(l.mat || ''), l.nome || '',
            l.resultado === 'DIVERGENTE' ? 'DIVERGENTE' : 'OK', l.obs || '',
            String(p.conf_mat || ''), p.conf_nome || ''];
  });
  /* Grava as novas ANTES de apagar as antigas: apagando primeiro, uma falha
     no meio deixava o lote sem conferencia nenhuma. As antigas estao antes
     das novas, entao os indices continuam valendo depois do append. */
  var ini = sh.getLastRow() + 1;
  garantirLinhas(sh, ini + novas.length - 1);
  /* Sem isto o Sheets interpreta o texto: lote '025055' vira o numero 25055
     e deixa de casar na substituicao (duplicava em vez de substituir), OBS
     comecando com '=' virava formula, e matricula perdia o zero a esquerda. */
  [2, 4, 5, 8, 9, 11, 12, 14, 15, 16].forEach(function (col) {
    sh.getRange(ini, col, novas.length, 1).setNumberFormat('@');
  });
  sh.getRange(ini, 1, novas.length, CAB_CONF.length).setValues(novas);
  SpreadsheetApp.flush();
  apagarLinhas(sh, antigas);

  var div = 0;
  novas.forEach(function (r) { if (r[12] === 'DIVERGENTE') div++; });
  return { ok: true, lote: lote, cod: cod, gravadas: novas.length,
           substituidas: antigas.length, divergentes: div };
}

/** O que já está gravado para aquele lote e produto — para a tela abrir
    mostrando o que foi conferido em vez de uma folha em branco. */
function lerConferencia(ss, p) {
  if (!p) return { ok: false, erro: RODE_NO_APP };
  var lote = String(p.lote || '').trim();
  var cod = normCod(p.cod);
  if (!lote || !cod) return { ok: false, erro: 'lote e cod sao obrigatorios' };

  var sh = aba(ss, AB_CONF, CAB_CONF);
  var linhas = linhasDoLote(sh, lote, cod);
  if (!linhas.length) return { ok: true, achou: false };

  /* Um getRange por linha eram 21 chamadas e 2 a 4 segundos de espera no
     tablet. O bloco inteiro vem de uma vez. */
  var tudo = sh.getRange(2, 1, sh.getLastRow() - 1, CAB_CONF.length).getValues();
  var out = [], dataEmb = '';
  linhas.forEach(function (n) {
    var r = tudo[n - 2];
    if (!r) return;
    if (!dataEmb) dataEmb = dataISO(r[2]);
    out.push({ trilho: Number(r[5]) || 0, op: Number(r[6]) || 0,
               cod_item: String(r[7] || ''), desc_item: String(r[8] || ''), qtd: r[9],
               mat: String(r[10] || ''), nome: String(r[11] || ''),
               resultado: String(r[12] || 'OK'), obs: String(r[13] || ''),
               conf_mat: String(r[14] || ''), conf_nome: String(r[15] || '') });
  });
  return { ok: true, achou: true, data_emb: dataEmb, linhas: out };
}

/**
 * Busca por lote OU por data da embalagem. Devolve as linhas cruas; quem
 * agrupa por lote × produto é o app, que também imprime.
 */
function relatorioConferencia(ss, p) {
  if (!p) return { ok: false, erro: RODE_NO_APP };
  var lote = String(p.lote || '').trim();
  var data = String(p.data || '').trim();
  if (!lote && !data) return { ok: false, erro: 'Informe o lote ou a data.' };

  var sh = aba(ss, AB_CONF, CAB_CONF);
  var ult = sh.getLastRow();
  if (ult < 2) return { ok: true, linhas: [] };

  var vals = sh.getRange(2, 1, ult - 1, CAB_CONF.length).getValues();
  var out = [];
  vals.forEach(function (r) {
    var l = String(r[1] || '').trim(), d = dataISO(r[2]);
    if (lote && l !== lote) return;
    if (data && d !== data) return;
    out.push({ ts: r[0] instanceof Date ? r[0].toISOString() : String(r[0] || ''),
               lote: l, data_emb: d, cod: normCod(r[3]), desc: String(r[4] || ''),
               trilho: Number(r[5]) || 0, op: Number(r[6]) || 0,
               cod_item: String(r[7] || ''), desc_item: String(r[8] || ''), qtd: r[9],
               mat: String(r[10] || ''), nome: String(r[11] || ''),
               resultado: String(r[12] || 'OK'), obs: String(r[13] || ''),
               conf_mat: String(r[14] || ''), conf_nome: String(r[15] || '') });
  });
  return { ok: true, linhas: out };
}

/* A data da embalagem entra na célula como DATA, não como texto: é o que
   faz o filtro da planilha, o Power BI e a busca por data funcionarem sem
   adivinhar se "08/09" é agosto ou setembro. O app manda yyyy-mm-dd. */
function paraData(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/* O caminho de volta, e tolerante: célula que virou Date, texto que ficou
   yyyy-mm-dd, ou dd/mm/yyyy digitado na mão na planilha. */
function dataISO(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var t = String(v || '').trim();
  var m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return t;
}

/* Lote e produto juntos: o mesmo lote tem VOL 1/2 e VOL 2/2, que são
   códigos diferentes e conferências diferentes. */
function linhasDoLote(sh, lote, cod) {
  var ult = sh.getLastRow();
  if (ult < 2) return [];
  var vals = sh.getRange(2, 2, ult - 1, 3).getValues();   // LOTE, DATA_EMB, COD_PRODUTO
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === lote && normCod(vals[i][2]) === cod) out.push(i + 2);
  }
  return out;
}

/* ---------------------------------------------------------------- */

/** Só dígitos e letras: o ERP escreve 501.118.001 e o app manda 501118001. */
function dois(n) { n = String(n || ''); return n.length < 2 ? '0' + n : n; }

function normCod(c) {
  return String(c == null ? '' : c).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function linhasDoProduto(sh, cod) {
  var ult = sh.getLastRow();
  if (ult < 2) return [];
  var col = sh.getRange(2, 1, ult - 1, 1).getValues();
  var out = [];
  for (var i = 0; i < col.length; i++) {
    if (normCod(col[i][0]) === cod) out.push(i + 2);
  }
  return out;
}

/* De trás para frente e em blocos: apagar a linha 5 primeiro faria a 9 virar
   8 e o índice seguinte apagaria a linha errada. As linhas de um produto são
   gravadas juntas, então quase sempre isso vira uma chamada só em vez de
   trinta — o que importa quando o tablet está esperando a resposta. */
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

/* deleteRow encolhe a planilha, e getRange além da última linha existente
   estoura. Sem isto, salvar mapa depois de apagar vários dava "Those rows
   are out of bounds" justamente para quem usa o app há mais tempo. */
function garantirLinhas(sh, ate) {
  var max = sh.getMaxRows();
  if (ate > max) sh.insertRowsAfter(max, ate - max);
}

function aba(ss, nome, cab) {
  var sh = ss.getSheetByName(nome);
  if (!sh) sh = ss.insertSheet(nome);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cab.length).setValues([cab]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cab.length).setFontWeight('bold');
  } else if (sh.getLastColumn() < cab.length) {
    /* coluna nova numa aba que ja existe: completa o cabecalho, as linhas
       antigas ficam em branco nela */
    var de = sh.getLastColumn();
    sh.getRange(1, de + 1, 1, cab.length - de).setValues([cab.slice(de)]);
    sh.getRange(1, de + 1, 1, cab.length - de).setFontWeight('bold');
  }
  return sh;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Rode uma vez pelo editor para autorizar o script e criar a aba MAPA.
    Rodar de novo é seguro: aba que já existe não é tocada. */
function garantirAbas() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  aba(ss, AB_MAPA, CAB_MAPA);
  aba(ss, AB_COLAB, CAB_COLAB);
  aba(ss, AB_CONF, CAB_CONF);

  /* A planilha nasce com uma aba vazia chamada "Página1"/"Sheet1". Ela não
     atrapalha, mas confunde quem abre o arquivo procurando o mapa. */
  ['Página1', 'Pagina1', 'Sheet1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  Logger.log('abas MAPA, COLABORADORES e CONFERENCIA prontas');
}

/**
 * Rode no editor para provar a gravação de ponta a ponta contra a planilha
 * de verdade: grava um mapa de teste, lê de volta, confere item por item e
 * apaga no fim. Nenhum mapa seu é tocado — o código usado é TESTE000.
 *
 * O resultado sai no Registro de execução. "TUDO CERTO" quer dizer que o
 * caminho app → planilha → app está inteiro.
 */
function testar() {
  var COD = 'TESTE000';
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var erros = [];

  /* Trilho 1 vazio, 2 com a caixa antes do primeiro posto (OP 0), e 3 com
     peça e insumo juntos: são os três casos que já quebraram alguma coisa.
     A isomanta do trilho 3 vai marcada como suspensa — é a única linha que
     prova a coluna SUSPENSO indo e voltando. */
  var linhas = [
    { trilho: 1, op: 0, seq: 1, cod_item: '',          desc_item: '',                  qtd: '', insumo: false, suspenso: false },
    { trilho: 2, op: 0, seq: 1, cod_item: '607001700', desc_item: 'CX DE TESTE',       qtd: 1,  insumo: true,  suspenso: false },
    { trilho: 3, op: 1, seq: 1, cod_item: '760001006', desc_item: 'PECA DE TESTE',     qtd: 2,  insumo: false, suspenso: false },
    { trilho: 3, op: 1, seq: 2, cod_item: '',          desc_item: 'ISOMANTA DE TESTE', qtd: 1,  insumo: true,  suspenso: true  }
  ];

  try {
    var g = salvarMapa(ss, { cod: COD, desc: 'MAPA DE TESTE', n_trilhos: 3,
                             velocidade: 8.5, n_esquema: '9', linhas: linhas });
    if (!g.ok) erros.push('nao gravou: ' + g.erro);
    else if (g.gravadas !== 4) erros.push('gravou ' + g.gravadas + ' linhas, esperava 4');

    var l = lerMapa(ss, COD);
    if (!l.achou) {
      erros.push('nao li de volta o mapa que acabou de gravar');
    } else {
      if (l.mapa.desc !== 'MAPA DE TESTE') erros.push('descricao voltou como "' + l.mapa.desc + '"');
      if (l.mapa.n_trilhos !== 3)          erros.push('n_trilhos voltou ' + l.mapa.n_trilhos + ', esperava 3');
      if (Number(l.mapa.velocidade) !== 8.5) erros.push('velocidade voltou "' + l.mapa.velocidade + '"');
      if (l.linhas.length !== 4)           erros.push('voltaram ' + l.linhas.length + ' linhas, esperava 4');

      var t2 = null, t3 = [];
      l.linhas.forEach(function (x) {
        if (x.trilho === 2) t2 = x;
        if (x.trilho === 3) t3.push(x);
      });
      if (!t2)                  erros.push('o trilho 2 nao voltou');
      else {
        if (t2.op !== 0)        erros.push('trilho antes do 1o posto voltou com OP ' + t2.op + ', esperava 0');
        if (t2.insumo !== true) erros.push('a marca de insumo nao voltou');
        if (t2.suspenso !== false) erros.push('a caixa voltou marcada como suspensa');
      }
      if (t3.length !== 2)      erros.push('o trilho com dois itens voltou com ' + t3.length);
      else {
        if (Number(t3[0].qtd) !== 2) erros.push('a quantidade voltou ' + t3[0].qtd + ', esperava 2');
        if (t3[0].suspenso !== false) erros.push('a peca voltou marcada como suspensa');
        if (t3[1].suspenso !== true)  erros.push('a marca de suspenso nao voltou');
      }
    }
  } catch (err) {
    erros.push('excecao: ' + (err && err.message ? err.message : err));
  }

  /* Limpeza sempre, mesmo se algo acima falhou: teste que deixa sujeira na
     planilha de produção só é rodado uma vez. */
  var sobrou = '';
  try {
    excluirMapa(ss, { cod: COD });
    if (lerMapa(ss, COD).achou) sobrou = ' (ATENCAO: a linha de teste nao saiu da aba MAPA)';
  } catch (err) {
    sobrou = ' (ATENCAO: nao consegui apagar o mapa de teste: ' + err + ')';
  }

  if (erros.length) {
    Logger.log('FALHOU:\n- ' + erros.join('\n- ') + sobrou);
  } else {
    Logger.log('TUDO CERTO: gravou, leu de volta igual e apagou. ' +
               'O caminho app -> planilha -> app esta inteiro.' + sobrou);
  }
}
