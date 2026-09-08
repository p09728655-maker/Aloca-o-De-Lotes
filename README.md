# RitmoPatrimar — Mapa dos Trilhos · Embalagem

Monta no tablet o **mapa dos trilhos da embalagem** de um produto — qual item entra
em qual trilho da esteira, em que ordem, e onde começa a faixa de cada OP —, guarda
esse mapa numa planilha, imprime a folha que fica pendurada na linha, e registra a
**conferência de uma caixa por lote** com quem estava em cada OP naquele dia.

São duas coisas com ritmos diferentes, e o app separa as duas:

- O **mapa** é do produto. É estável e vale para todo lote daquele código.
- A **conferência** é do lote. É o que aconteceu num dia, com aquelas pessoas.

O app não é programador de produção e não substitui o ERP: a programação continua
no ERP/PPCP.

## O desenho

O mapa é do **produto**: no próximo lote do mesmo código ele é reaproveitado inteiro.
Uma **OP cobre uma faixa contígua de trilhos**, como no mapa impresso — o app guarda
as fronteiras, não a lista, então mover a divisa entre a OP 03 e a OP 04 é um toque
em vez de reeditar trilho por trilho.

Um item é **quantidade + descrição**, como está escrito no mapa da linha. O código do
ERP é **opcional**: preenchido quando a planilha importada já traz, digitado quando
alguém quiser, e nunca adivinhado.

Isso é decisão de projeto, tirada dos mapas reais: as planilhas
`MAPA DOS TRILHOS DA EMBALGEM` que a linha usa hoje têm `OP`, um marcador de insumo,
`QTDE` e `DESCRIÇÃO DA PEÇA` — e **nenhuma coluna de código**. A versão anterior do
app gastava umas seiscentas linhas tentando casar aquele texto com o código do ERP
por sinônimo, abreviação e comparação de medidas, e ainda abria um diálogo de
pendências para o líder desempatar. Era a maior fonte de complicação do app, e
resolvia um problema que o processo não tem.

**Insumo ocupa trilho.** Isomanta, isopor, tabuleiro e a própria caixa estão na
sequência do mapa, lado a lado com painel de MDP. A única diferença é a coluna em que
saem na folha impressa — `Insumo`, separada de `Descrição da peça` — e a cor do chip
na tela. O app propõe a marcação pela descrição e o líder desmarca se errar.

**Trilho pode ter dois itens ou nenhum.** No mapa do ESCRIVANINHA TAURUS o trilho 3
leva o tampo *e* uma isomanta, e os trilhos 4 a 8 estão vazios. Trilho vazio também é
gravado: é assim que o número de trilhos da esteira e a fronteira de cada OP voltam
inteiros da planilha.

## Conferência do lote — uma caixa, não todas

A esteira não para. Num produto de 21 itens, confirmar peça por peça em **toda**
caixa é 21 toques por caixa enquanto as caixas continuam vindo — foi por isso que a
versão anterior do app carregava uma conferência que a linha não usava.

O que ficou é **amostragem**: uma caixa por lote. E a peça **nasce OK** — o toque
marca divergência, não o contrário. Exigir 21 toques para dizer "tudo certo" faz o
líder bater tudo no automático, que é pior do que não conferir.

As peças aparecem **agrupadas pela OP**, com o seletor de quem está nela no cabeçalho
do grupo: a pessoa fica ao lado das peças por que responde. Preenchidas as OPs e o
número do lote, o botão libera; enquanto falta alguma, ele diz qual.

**O rodízio não tem tabela própria.** Cada linha da conferência já carrega a OP e a
matrícula de quem estava nela, então "quem estava na OP 04 do lote 25055" são os
nomes das linhas de OP 04 daquele lote. Uma aba a menos para manter e uma tabela a
menos para o Power BI relacionar.

Gravar de novo o mesmo lote e produto **substitui** — uma caixa de amostra por lote,
e o que está na tela é o que vale. Isso também deixa a fila de envio segura: reenviar
não duplica.

O que fica gravado por peça: lote, data da embalagem, produto, trilho, OP, item,
quantidade, **matrícula e nome de quem estava na OP**, resultado (OK ou DIVERGENTE) e
a observação da divergência.

## Implantação

**1. Planilha** — a base é
[Mapa dos Trilhos — PPCP Patrimar](https://docs.google.com/spreadsheets/d/1D_GSK7D1SFQCyhgxuqjwawc1tflcm6-5_LQhAMMjh5g/edit).
Para usar outra, troque o `SHEET_ID` no alto do `Codigo.gs`.

**2. Apps Script** — na planilha, `Extensões > Apps Script`, cole `Codigo.gs`.
Execute `garantirAbas()` uma vez (autoriza o script e cria a aba `MAPA`).
Depois `Implantar > Nova implantação > Aplicativo da Web`, executar como **Eu**,
acesso para **Qualquer pessoa**. Copie a URL que termina em `/exec`.

No editor do Apps Script só existem **duas** funções para rodar na mão:
`garantirAbas()`, na instalação, e `testar()`, para conferir. Todas as outras
são chamadas pelo app com os dados do mapa — rodar `salvarMapa` pelo botão
Executar devolve um aviso dizendo isso.

**2b. Conferir a gravação** — rode `testar()` no editor. Ele grava um mapa no
código `TESTE000`, lê de volta, confere trilho a trilho e apaga no fim; nenhum
mapa seu é tocado. O resultado sai no *Registro de execução*: `TUDO CERTO`
significa que o caminho app → planilha → app está inteiro. Vale rodar depois
de qualquer alteração no `Codigo.gs`.

A planilha **não** precisa ficar pública. O `/exec` lê e grava em seu nome — é um
passo a menos de configuração e um buraco a menos de segurança do que a versão
anterior, que dependia de "qualquer pessoa com o link: leitor".

**3. App** — publique o repositório na Vercel (sem build, tudo estático). A URL
do `/exec` já vem preenchida no código, então o tablet abre funcionando; o ⚙
existe para apontar para outra implantação, e é o único campo de configuração.

**4. Instalar no tablet** — com o app aberto, toque em *Instalar no tablet* no
rodapé. Ele passa a abrir pelo ícone, em tela cheia. O botão só aparece quando o
navegador oferece a instalação; no iPad o caminho é
*Compartilhar > Adicionar à Tela de Início*.

## As abas

### `MAPA` — o padrão do produto

Uma linha por trilho:

| Coluna | O que guarda |
|---|---|
| `COD_PRODUTO` | só dígitos — o app manda `501118001`, o ERP escreve `501.118.001` |
| `DESC_PRODUTO` · `N_TRILHOS` · `VELOCIDADE` · `N_ESQUEMA` | cabeçalho do mapa, repetido em toda linha |
| `TRILHO` | 1 até o último, inclusive os vazios |
| `OP` | a OP daquele trilho; **0** é trilho antes do primeiro posto |
| `SEQ` | 1, 2… quando o trilho tem mais de um item |
| `COD_ITEM` · `DESC_ITEM` · `QTD` | o item; o código pode estar vazio |
| `INSUMO` | `SIM` quando é embalagem |
| `ATUALIZADO_EM` | data e hora da última gravação daquele produto |

O cabeçalho se repete em toda linha de propósito: assim a aba abre no Power BI sem
relacionamento nenhum.

**Salvar é substituir.** As linhas daquele produto saem e as novas entram — não há
versão nem histórico dentro do app. Quem precisar do mapa de antes usa
`Arquivo > Histórico de versões` da própria planilha, que o Google guarda de graça.

### `CONFERENCIA` — o que aconteceu no lote

Uma linha por peça da caixa de amostra:

| Coluna | O que guarda |
|---|---|
| `TS` | quando foi gravado |
| `LOTE` · `DATA_EMB` | o lote e a data da embalagem |
| `COD_PRODUTO` · `DESC_PRODUTO` | qual volume do lote |
| `TRILHO` · `OP` | onde a peça estava; OP **0** é antes do primeiro posto |
| `COD_ITEM` · `DESC_ITEM` · `QTD` | a peça |
| `MATRICULA` · `NOME` | **quem estava naquela OP naquele dia** |
| `RESULTADO` | `OK` ou `DIVERGENTE` |
| `OBS` | o que houve, quando divergente |

### `COLABORADORES` — a equipe

`MATRICULA · NOME · ATIVO · CADASTRADO_EM`. O botão **+ Colaborador** cadastra pelo
próprio tablet. A conferência grava a **matrícula**, não o nome digitado: é assim que
o Power BI agrupa a pessoa certa mesmo quando alguém escreve o nome de outro jeito.

## Três abas, uma tela de cada vez

No tablet, em pé, a conferência não pode morar embaixo de 30 trilhos. O app tem três
abas — **Mapa dos trilhos**, **Conferência do lote** e **Relatório** — e cada uma
ocupa a tela inteira. A aba fica gravada no aparelho: o tablet da esteira abre na
Conferência e fica nela.

Em tela larga (tablet deitado) trilhos e peças aparecem em **duas colunas**: o mapa
de 30 trilhos cabe sem rolar. Trilho vazio ocupa uma linha só, com `+` e `OP`.

## Relatório — buscar o que foi conferido

Por **lote** ou por **data da embalagem**. Cada conferência gravada vira um bloco:
lote, data, produto, quem estava em cada OP, quantas peças e quais divergiram — com a
observação e o nome de quem estava na OP da peça. *Imprimir relatório* tira uma folha
por conferência, com a divergência sublinhada para saltar aos olhos em impressora
preto e branco.

Depois de gravar uma conferência, a aba Relatório abre já com aquele lote no campo:
gravou, quer o papel, são dois toques.

A data da embalagem entra na planilha como **data de verdade** na célula, não como
texto — é o que faz a busca por dia, o filtro da planilha e o Power BI funcionarem
sem adivinhar se `08/09` é agosto ou setembro.

## Como se usa

**Produto que já tem mapa** — digite o código. O app abre o mapa salvo.

**Produto novo, com o mapa já em planilha** — *Importar Excel*. O app lê os dois
formatos e diz quantos mapas achou no arquivo; toque no que quer abrir, ponha o
código do produto e salve.

**Produto novo, do zero** — ponha código e descrição, ajuste o número de trilhos, e
no `+` de cada trilho acrescente os itens. O botão `OP` marca onde começa cada posto.

**Conferir um lote** — com o mapa na tela, preencha o lote e a data, diga quem está
em cada OP, toque nas peças que estiverem erradas e grave. Lote já conferido abre com
o que foi gravado, para quem volta corrigir uma divergência.

**Longe do computador** — *Folha em branco* imprime o mapa vazio com linha alta para
escrever à mão; depois alguém digita no app.

Sem rede o app continua funcionando: o que está na tela é guardado no aparelho a cada
toque, e a gravação entra numa fila que sai por *Reenviar pendentes*.

## O que o Importar Excel lê

**O mapa da linha** — a planilha `MAPA DOS TRILHOS DA EMBALGEM` como ela é hoje. O
leitor não depende da posição das colunas: acha a coluna do trilho pela sequência
`1, 2, 3…` mais longa da aba, a da OP pelas células no formato `OP 01`/`OP-01`, e as
de quantidade e descrição pelo cabeçalho. Aba com várias caixas empilhadas
(`1/2` e `2/2` uma embaixo da outra) vira um mapa por caixa.

**O modelo do app** — `TRILHO | OP | COD | DESCRIÇÃO ITEM | QTDE | …`, com o código
do produto em `A1`. É o formato de `modelo-mapa-trilhos.xlsx`, neste repositório. O
bloco `COD | DESCRIÇÃO | QTDE` pode repetir à direita para o segundo item do trilho.

O leitor foi testado contra cinco planilhas reais da fábrica — ESCRIVANINHA TAURUS,
HOME ANGEL 1.8, HOME RIPADO ANTARES 1.8, HOME RIPADO SUPREMO 2.3 e KIT 2 MESAS
CABECEIRA SLEEP —, das quais saíram 11 mapas. O TAURUS existe nos dois formatos no
mesmo arquivo e os dois leitores chegam ao mesmo mapa: 18 trilhos ocupados, 21 itens.

Uma ressalva sobre esses arquivos: o leitor é **fiel, não corretor**. Se a planilha
tem `15` na quantidade de um suporte (HOME RIPADO SUPREMO 2.3, trilho 19) ou uma nota
solta na coluna da descrição (`(ARRUMAR A MOLDURA LATERAL)`, trilho 25), isso entra no
mapa como está escrito. A caixa `CX 02/03` do HOME RIPADO ANTARES tem só as isomantas
preenchidas na planilha de origem, e é assim que ela chega — a tela mostra 2 itens, e
não é o app que está perdendo peça. Confira na tela antes de salvar.

## O que ficou de fora, e por quê

A versão anterior fazia cinco trabalhos empilhados. Quatro saíram:

| Saiu | Por quê |
|---|---|
| Busca de lote na programação | só servia para descobrir o código do produto; agora ele é digitado |
| Conferência peça a peça em **toda** caixa | a esteira não para; virou amostragem de uma caixa por lote |
| Rastro e histórico do lote | assunto do ERP |
| Versionamento do mapa | o histórico de revisões da planilha já resolve |
| Perfil PPCP × Operador | sem conferência não há dois perfis |
| Casamento de descrição com código do ERP | os mapas reais nunca tiveram código |

O app foi de 3.740 para pouco mais de 1.800 linhas, e o Apps Script de 587 para 464
— com a conferência já dentro dessa conta.

As abas `MAPAS`, `MAPA_TRILHOS`, `LOTES`, `CONFERENCIAS`, `REGISTRO` e
`COLABORADORES` da **planilha antiga** não são mais lidas nem escritas. Elas
continuam onde estão — nada foi apagado. A planilha nova é outro arquivo.
