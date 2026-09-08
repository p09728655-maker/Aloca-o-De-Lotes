# Mapa dos Trilhos — PPCP Patrimar

Monta no tablet o **mapa dos trilhos da embalagem** de um produto — qual item entra
em qual trilho da esteira, em que ordem, e onde começa a faixa de cada OP —, guarda
esse mapa numa planilha e imprime a folha que fica pendurada na linha.

A lógica é **PRODUTO → MAPA**, e para nisso.

O app **não** é programador de produção e não substitui o ERP. Ele não sabe o que é
lote, não confere peça, não guarda quem embalou. A programação continua no ERP/PPCP
e a conferência continua no chão de fábrica.

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

## A aba `MAPA`

Uma aba, uma linha por trilho:

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

## Como se usa

**Produto que já tem mapa** — digite o código. O app abre o mapa salvo.

**Produto novo, com o mapa já em planilha** — *Importar Excel*. O app lê os dois
formatos e diz quantos mapas achou no arquivo; toque no que quer abrir, ponha o
código do produto e salve.

**Produto novo, do zero** — ponha código e descrição, ajuste o número de trilhos, e
no `+` de cada trilho acrescente os itens. O botão `OP` marca onde começa cada posto.

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
| Conferência peça a peça | é controle de chão de fábrica, não de cadastro de mapa |
| Cadastro de colaboradores e operador por OP | o rodízio muda todo dia; a folha impressa deixa o campo em branco |
| Rastro e histórico do lote | assunto do ERP |
| Versionamento do mapa | o histórico de revisões da planilha já resolve |
| Perfil PPCP × Operador | sem conferência não há dois perfis |
| Casamento de descrição com código do ERP | os mapas reais nunca tiveram código |

O app foi de 3.740 para 1.485 linhas, e o Apps Script de 587 para 244.

As abas `MAPAS`, `MAPA_TRILHOS`, `LOTES`, `CONFERENCIAS`, `REGISTRO` e
`COLABORADORES` da planilha antiga não são mais lidas nem escritas. Elas continuam
onde estão — nada foi apagado.
