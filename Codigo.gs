/**
 * Mapa dos Trilhos — gravação no Google Sheets
 * PPCP · Patrimar Móveis
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

var AB_MAPA = 'MAPA';

/* Uma linha por TRILHO, inclusive o vazio — é assim que o número de trilhos
   da esteira e a fronteira de cada OP sobrevivem à ida e volta da planilha.
   Trilho com dois itens ocupa duas linhas, distinguidas pelo SEQ.
   O cabeçalho do mapa (descrição, nº de trilhos, velocidade, nº do esquema)
   se repete em toda linha: é redundante, e é de propósito — assim a aba abre
   no Power BI sem relacionamento nenhum. */
var CAB_MAPA = ['COD_PRODUTO', 'DESC_PRODUTO', 'N_TRILHOS', 'VELOCIDADE', 'N_ESQUEMA',
                'TRILHO', 'OP', 'SEQ', 'COD_ITEM', 'DESC_ITEM', 'QTD', 'INSUMO',
                'ATUALIZADO_EM'];

/* ---------------------------------------------------------------- */

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

    if (p.acao === 'salvar')  return json(salvarMapa(ss, p));
    if (p.acao === 'excluir') return json(excluirMapa(ss, p));
    /* Ler também vem por POST: o app usa um transporte só — POST com
       text/plain, que é o que não dispara o preflight CORS que o Apps
       Script não responde. Um caminho testado vale mais que dois meio
       testados. O doGet abaixo fica para conferir no navegador. */
    if (p.acao === 'lista')   return json(listarProdutos(ss));
    if (p.acao === 'mapa')    return json(lerMapa(ss, p.cod));
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
  var cod = normCod(p.cod);
  if (!cod) return { ok: false, erro: 'cod_produto e obrigatorio' };
  if (!p.linhas || !p.linhas.length) return { ok: false, erro: 'mapa vazio' };

  var sh = aba(ss, AB_MAPA, CAB_MAPA);
  var antigas = linhasDoProduto(sh, cod);
  apagarLinhas(sh, antigas);

  var ts = new Date();
  var novas = p.linhas.map(function (l) {
    return [cod, p.desc || '', p.n_trilhos || 0, p.velocidade || '', p.n_esquema || '',
            l.trilho, l.op || 0, l.seq || 1, l.cod_item || '', l.desc_item || '',
            l.qtd || '', l.insumo ? 'SIM' : '', ts];
  });
  var ini = sh.getLastRow() + 1;
  garantirLinhas(sh, ini + novas.length - 1);
  sh.getRange(ini, 1, novas.length, CAB_MAPA.length).setValues(novas);

  return { ok: true, cod: cod, gravadas: novas.length, substituidas: antigas.length };
}

function excluirMapa(ss, p) {
  var cod = normCod(p.cod);
  if (!cod) return { ok: false, erro: 'cod_produto e obrigatorio' };
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
                   velocidade: String(r[3] || ''), n_esquema: String(r[4] || ''),
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
      cab = { cod: cod, desc: String(r[1] || ''), n_trilhos: Number(r[2]) || 0,
              velocidade: String(r[3] || ''), n_esquema: String(r[4] || '') };
    }
    /* OP zero é trilho antes do primeiro posto — a caixa entra na esteira
       ali. Trocar esse 0 por 1 faria a divisa da OP 01 saltar para o trilho
       1 toda vez que o mapa voltasse da planilha. A quantidade vai crua: o
       app normaliza vírgula e ponto melhor do que o Number daqui. */
    linhas.push({ trilho: Number(r[5]) || 0, op: Number(r[6]) || 0, seq: Number(r[7]) || 1,
                  cod_item: String(r[8] || ''), desc_item: String(r[9] || ''),
                  qtd: (r[10] === '' || r[10] === null) ? 0 : r[10],
                  insumo: String(r[11] || '') === 'SIM' });
  });
  if (!cab) return { ok: true, achou: false };
  return { ok: true, achou: true, mapa: cab, linhas: linhas };
}

/* ---------------------------------------------------------------- */

/** Só dígitos e letras: o ERP escreve 501.118.001 e o app manda 501118001. */
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

  /* A planilha nasce com uma aba vazia chamada "Página1"/"Sheet1". Ela não
     atrapalha, mas confunde quem abre o arquivo procurando o mapa. */
  ['Página1', 'Pagina1', 'Sheet1'].forEach(function (n) {
    var s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  Logger.log('aba MAPA pronta');
}
