# Mapa dos Trilhos — PPCP Patrimar

Monta no tablet o **mapa dos trilhos da embalagem** de um produto — qual item entra
em qual trilho da esteira, em que ordem, e qual OP cobre cada faixa de trilhos —,
guarda esse mapa como **padrão do produto com controle de versão**, e faz a
**conferência peça a peça** na hora de embalar, com histórico por lote.

A lógica é: **PRODUTO → MAPA → VERSÃO → LOTE → CONFERÊNCIA.**

- O mapa pertence ao **produto**, não ao lote.
- Toda alteração de disposição vira uma **versão nova** (V01, V02, …); a antiga
  fica guardada e só **uma versão fica ativa** por produto.
- Quando a conferência de um lote começa, o lote é **amarrado à versão vigente**
  naquele momento — e essa amarração nunca muda. Se amanhã o produto passar
  para a V03, o LT que começou na V02 continua mostrando V02, para sempre.
- Cada peça confirmada registra trilho, peça, quantidade, operador, data e hora.

O app **não** é programador de produção e não substitui o ERP: a programação
continua no ERP/PPCP. Sem leitura de código de barras, a conferência é o toque
do operador — o campo de código no diálogo de conferir é a trava opcional
contra peça trocada, não um coletor.

## O desenho

O mapa impresso que a linha usa hoje (`MAPA DOS TRILHOS DA EMBALAGEM`) tem três
coisas empilhadas, e o app separa as duas que mudam em ritmos diferentes:

- **Item → trilho** depende do produto, é estável, fica salvo em `MAPA_TRILHOS` e é
  reaproveitado no próximo lote do mesmo código.
- **Operador → OP** muda a cada rodízio, e é a única coisa que o líder refaz.

Na primeira vez que um produto aparece, o app propõe um mapa; da segunda em diante
ele carrega o mapa salvo e o líder só troca os nomes.

Uma **OP cobre uma faixa contígua de trilhos**, como no mapa impresso. O app guarda
as fronteiras, não a lista: mover a divisa entre a OP 03 e a OP 04 é um toque, em vez
de reeditar trilho por trilho.

## O que a ESTRUTURA real ensinou

Rodando a lógica contra as 623 linhas da aba `ESTRUTURA` (32 produtos), duas coisas
apareceram e mudaram o desenho:

**Insumo ocupa trilho.** ISOMANTA, ISOPOR, TABULEIRO, PERFIL PAPEL CARTÃO e a própria
caixa KRAFT estão na sequência do mapa impresso, lado a lado com painel de MDP. Uma
versão anterior filtrava insumo da lista por achar que era ruído de BOM — estava
errado, e o filtro foi removido. Nada da ESTRUTURA é descartado.

**A família do código classifica melhor que a descrição.** `3xx`/`4xx` são painéis,
`600` é matéria-prima, `603` é ferragem, `606` é fundo de HDF cortado, `601`/`602` são
vidro e espelho, `607` é embalagem, `611` é químico. O app usa isso só para colorir o
chip — peça em cinza, embalagem em roxo — para o líder distinguir de relance.

**Trilho pode ter dois itens ou nenhum.** No mapa do ARMÁRIO ENCANTO o trilho 2 leva
a lateral direita *e* uma isomanta, e os trilhos 3, 4 e 5 estão vazios. O modelo
aceita os dois casos.

## Implantação

**1. Apps Script** — na planilha, `Extensões > Apps Script`, cole `Codigo.gs`.
Execute `garantirAbas()` uma vez (autoriza e cria as abas — rodar de novo após
atualizar o script é seguro e completa o que faltar).
Depois `Implantar > Nova implantação > Aplicativo da Web`, executar como **Eu**,
acesso para **Qualquer pessoa**. Copie a URL que termina em `/exec`.

**2. App** — publique o repositório na Vercel (sem build, tudo estático).
Abra, toque no ⚙ e cole a URL do `/exec`.

**2b. Instalar no tablet** — com o app aberto, toque em *Instalar no tablet* no
rodapé. Ele passa a abrir pelo ícone, em tela cheia, sem barra de navegador. O
botão só aparece quando o navegador oferece a instalação; no iPad o caminho é
*Compartilhar > Adicionar à Tela de Início*.

**3. Colaboradores** — para cadastrar a equipe de uma vez, preencha a lista em
`cadastrarEquipe()` no Apps Script e rode. Para incluir alguém no meio do turno,
use o botão *+ Colaborador* no próprio tablet.

A planilha precisa continuar como **“qualquer pessoa com o link: leitor”** — é assim
que o app lê os lotes, a estrutura e o mapa salvo.

## Abas

Lidas (já existem, nada muda nelas):

| Aba | Origem |
|---|---|
| Programação | `gid 1540822534` — lote, cor, data prev. emb., código, descrição, qtd |
| ESTRUTURA | `gid 662403781` — CODIGO · PEÇA · QTD · DESCRICAO |

Criadas pelo Apps Script:

| Aba | Colunas |
|---|---|
| `MAPAS` | COD_PRODUTO · DESC_PRODUTO · VERSAO · STATUS · DATA · RESPONSAVEL · MOTIVO · N_TRILHOS · VELOCIDADE · N_ESQUEMA · ID_ENVIO |
| `MAPA_TRILHOS` | COD_PRODUTO · DESC_PRODUTO · N_TRILHOS · TRILHO · OP · SEQ · COD_ITEM · DESC_ITEM · QTD · TIPO · VELOCIDADE · N_ESQUEMA · ATUALIZADO_EM · VERSAO |
| `LOTES` | LOTE · COR · COD_PRODUTO · DESC_PRODUTO · VERSAO · DATA_INICIO · DATA_CONCLUSAO · STATUS · N_VOLUMES · VOL_CONCLUIDOS |
| `CONFERENCIAS` | TS · ID_ENVIO · LOTE · COD_PRODUTO · VERSAO · TRILHO · COD_PECA · DESC_PECA · QTD · MATRICULA · NOME · RESULTADO · OBS · VOLUME |
| `REGISTRO` | TS · ID_ENVIO · LOTE · COR · DATA_EMB · COD_PRODUTO · DESC_PRODUTO · VOLUMES · N_POSTOS · POSTO · MATRICULA · NOME · COD_PECA · DESC_PECA · QTD · TIPO |
| `COLABORADORES` | MATRICULA · NOME · ATIVO · CADASTRADO_EM |

Em `REGISTRO`, `POSTO` guarda o número da OP e `COD_PECA` o código do item — nomes
herdados de quando o app pensava em postos, mantidos para não quebrar quem já lê a aba.

`MAPAS` é o cabeçalho de cada versão (quem criou, quando, por quê, e qual está
ATIVA); `MAPA_TRILHOS` guarda as linhas item→trilho de **todas** as versões —
salvar um mapa **acrescenta** as linhas da versão nova, nunca apaga as antigas.
`LOTES` tem uma linha por lote × produto com a versão amarrada na largada da
conferência. `CONFERENCIAS` e `REGISTRO` são append-only: o que aconteceu não
é editado depois.

**Planilha que já rodava a versão anterior:** rode `garantirAbas()` de novo
depois de colar o `Codigo.gs` atualizado. Ele cria as abas novas e acrescenta a
coluna `VERSAO` em `MAPA_TRILHOS`; as linhas antigas ficam com a célula vazia e
valem como **V01** — nada precisa ser migrado na mão.

A aba `ALOCACAO_PADRAO` deixou de ser usada quando o mapa passou a viver em
`MAPA_TRILHOS`. Se ela já existir na sua planilha, pode apagar.

## Versões do mapa

Salvar mapa é sempre **criar versão** — a anterior nunca é editada nem apagada.
O diálogo de salvar pede responsável e motivo, que ficam no cabeçalho da versão
(aba `MAPAS`) e aparecem na barra roxa da tela de cadastro: versão, status,
data, quem criou e por quê.

O seletor *Versão do mapa* abre qualquer versão antiga para consulta (a barra
fica laranja avisando). Salvar em cima de uma versão antiga não a altera:
cria a próxima versão e a ativa. A numeração definitiva é do servidor — dois
tablets salvando ao mesmo tempo não geram duas V03.

## Perfis — PPCP × Operador

O seletor no topo alterna os dois modos e fica gravado no aparelho:

- **PPCP** — monta o mapa, cria versão, ativa, baixa o modelo, importa e exporta
  Excel, grava lote e consulta histórico.
- **Operador** — seleciona o lote, vê o mapa e confere, e só. Edição de mapa
  e **todas as impressões** ficam no perfil PPCP: a tela do operador é para
  marcar peça, sem botão que desvie disso.

A troca é organizacional, não é senha — o tablet da linha fica em *Operador* e
pronto. Quem precisar de trava de verdade resolve com dois aparelhos.

## Conferência do lote — peça a peça

O operador digita o lote; o app identifica o produto e carrega o mapa **da
versão amarrada ao lote** (ou a ativa, se a conferência ainda não começou).

**Uma conferência por produto do lote.** Os "volumes" de um lote são os
próprios produtos — VOL 1/2 e VOL 2/2 de cada cor são códigos distintos, e
cada um tem a sua conferência. Marcar a mesma lista de peças mais de uma vez
seria trabalho dobrado sem informação nova. A resposta para "todos passaram?"
está no rastro do lote: **"Conferência do lote: 4 de 6 produtos concluídos"**,
com quantos estão em andamento e quantos nem começaram. (A coluna VOLUME em
`CONFERENCIAS` fica guardada para o dia em que a linha quiser amostrar mais
de uma caixa por produto.)

A lista mostra todos os trilhos com três situações, as mesmas do mapa visual:

- 🟢 **OCUPADO** — peça conferida
- 🟡 **RESERVADO** — peça aguardando conferência
- ⚪ **LIVRE** — trilho sem peça nesta versão

O fluxo do operador é: chama o lote, escolhe o produto/volume, e em cada
peça toca em **✓ Conferir** — o diálogo pede **quem está conferindo na
hora** (o último usado já vem selecionado: rodízio custa um toque, rotina
custa zero; sem conferente marcado não sai registro nenhum). O diálogo
mostra o que é esperado naquele trilho e um campo opcional de código: se o código informado não é o
previsto, aparece o alerta **⚠ peça não prevista neste trilho** com o esperado
e o identificado, e o OK do operador trava — sobra **registrar divergência**
(vira `DIVERGENTE` em `CONFERENCIAS` e o lote fica 🔴 COM PENDÊNCIA) ou o PPCP
confirmar por cima, o que fica gravado na observação. Cada confirmação registra
lote, produto, versão, trilho, peça, quantidade, operador, data e hora.

O status do lote sai das peças, não de um botão: tudo OK = 🟢 **CONFERÊNCIA
CONCLUÍDA**, alguma divergência = 🔴 **COM PENDÊNCIA**, o resto = 🟡 **EM
CONFERÊNCIA** — com a barra de progresso do tipo *94% conferido · 1 peça
pendente*. Sem rede, a conferência continua: cada registro entra na fila local
e sai por *Reenviar pendentes*, como qualquer outro envio.

Para consultar depois: digite o lote e o rastro mostra a linha de conferência
(mapa/versão usada, status, início e conclusão) com o botão **Histórico peça a
peça** — quem conferiu o quê, em qual trilho, a que horas. Meses depois, a
resposta continua sendo a da versão da época.

## Decisões que precisam ser validadas na linha

**A sugestão inicial de mapa.** Quando o produto não tem mapa salvo, o app põe um item
por trilho na ordem em que a ESTRUTURA saiu do ERP. Isso é ponto de partida, não
palpite: o mapa impresso mostra que a sequência real não segue tipo nem tamanho, e
chutar uma ordem só daria trabalho de desfazer. O líder ajusta com as setas ↑↓.

**Nº de trilhos.** O padrão é 28, que é o do ARMÁRIO ENCANTO. Se a esteira tiver outro
número de trilhos, mude no campo — o valor fica por produto quando o mapa é salvo.

**Onde cada OP começa.** As fronteiras do mapa impresso do ARMÁRIO ENCANTO foram lidas
como OP 01 no trilho 1, OP 02 no 7, OP 03 no 10, OP 04 no 15, OP 05 no 18, OP 06 no 22
e OP 07 no 25 — mas no PDF as etiquetas de OP 02, 04 e 06 estão desenhadas *entre*
duas linhas, e não sobre uma. Se isso significa que esses operadores ficam do outro
lado da esteira e a faixa deles é outra, o app não sabe: as fronteiras são definidas
no tablet, pelo botão *+ OP aqui*.

## Importar e exportar o mapa em Excel

Montar 28 trilhos de dezenas de produtos na tela é lento. `modelo-mapa-trilhos.xlsx`
é o mesmo mapa que a embalagem já desenha, só que plano — uma aba por caixa, uma
linha por trilho, sem célula mesclada. A primeira linha diz de quem é o mapa e a
segunda é o cabeçalho:

| | | | | | | | |
|---|---|---|---|---|---|---|---|
| **501139001** | VOL 1/1 ARMARIO ENCANTO BRANCO | | | | | | |
| **TRILHO** | **OP** | **COD** | **DESCRIÇÃO ITEM** | **QTDE** | **COD** | **DESCRIÇÃO ITEM** | **QTDE** |
| 1 | OP 01 | 607.001.809 | CX 1/1 KRAFT 1875X360X93 ARMARIO ENCANTO | 1 | | | |
| 2 | | | | | | | |
| 5 | OP 02 | 797.003.001 | ARM ENCANTO PRAT 600X318X15 MDP 3 BCO | 2 | 607.005.215 | ISOMANTA 1/1 1900X370X0.05 | 2 |

O bloco `COD / DESCRIÇÃO ITEM / QTDE` repete: o primeiro é a peça, o segundo é o
insumo que vai junto naquele trilho. Precisa de um terceiro? São mais três colunas
à direita. Trilho vazio fica só com o número — não se apaga a linha, porque trilho
vazio também é trilho na esteira. A `OP` acompanha cada linha com item.

No app: **Importar Excel** no rodapé, escolhe o arquivo, e ele lê ali mesmo — sem
colar nada na planilha. Confere na tela e salva.

**Com o código escrito não há o que adivinhar.** O item entra direto, sem casamento
por texto e sem pergunta nenhuma: no mapa do ARMÁRIO ENCANTO os 21 itens entram
sozinhos. O que não tiver código o app procura pelo texto e **pergunta em vez de
chutar** — o que reconhece com folga entra, o ambíguo vira uma lista de candidatos
para o líder escolher. Código escrito que a `ESTRUTURA` não tem também vira
pergunta, com a estrutura inteira do produto para escolher.

**Exportar Excel** faz o caminho de volta: baixa o lote inteiro neste mesmo
formato, uma aba por volume — o da tela sai como está agora, salvo ou não, e os
outros saem da versão ativa. É por aí que se começa um produto novo: exporta o
parecido, troca o que muda e importa de volta. Ida e volta é fiel — o arquivo que
sai, relido, dá o mesmo mapa.

**Volume é quantos forem.** A aba é numerada pelo `VOL` da programação, não pela
ordem em que o arquivo foi montado: num produto de seis caixas com mapa só na
terceira, a aba sai como `MAPA CX03`. Volume ainda sem mapa fica de fora e o app
diz quantos foram, em vez de exportar aba muda. Na importação o nome da aba não
significa nada — quem identifica o mapa é o código na primeira linha —, então
`MAPA CX07` ou `CAIXA GRANDE` dá no mesmo.

**Um mapa para todas as cores.** Os códigos escritos são de uma cor só. Para o
mesmo mapa valer para as outras, uma aba `PRODUTOS` com `ABA_MAPA` e `COD_PRODUTO`
lista um código por cor (`COR`, `N_TRILHOS`, `VELOCIDADE` e `N_ESQUEMA` são
opcionais). O app acha a mesma peça na outra cor pelo `Nº` que vem depois de
MDP/MDF na descrição do ERP, que não muda de cor: a peça Nº 1 é `478001001` no
branco e `478001111` no alecrim. Insumo que não muda de cor sai com o mesmo código
nas três. O modelo antigo, só com texto (`TRILHO | OP | INSUMO | ITEM`, com a
quantidade na frente e o `Nº` no fim), continua entrando igual.

Aba que não é mapa — `COMO USAR`, rascunho — passa batido. Aba preenchida que não
diz de que produto é fica de fora, mas **com aviso na tela**, não em silêncio.

O `.xlsx` é lido e escrito no próprio navegador — um `.xlsx` é um ZIP com XML
dentro; na leitura o Chrome infla sozinho pelo `DecompressionStream` e, na escrita,
os arquivos vão guardados sem compactar, o que cabe em poucas linhas de ZIP. Sem
biblioteca externa, que a rede da fábrica não baixaria mesmo.

Importar um produto substitui o mapa que ele já tinha; os outros não são tocados.

## Gravar o mesmo lote duas vezes

O `ID_ENVIO` protege contra o tablet reenviar o **mesmo** pacote quando o Wi-Fi cai.
Ele nunca pegou o líder tocando em *Gravar lote* de novo: aí o id é outro, e as duas
gravações entram, dobrando a quantidade de todo indicador feito em cima.

Regravar é legítimo — corrigir um nome, refazer o rodízio —, então em vez de recusar,
o app pergunta: *“o lote X já foi gravado com N linhas. Substituir?”*. Substituir
apaga as linhas anteriores daquele lote e produto; cancelar mantém o que já estava.
Nenhum outro lote é tocado.

Para conferir, **digite o lote no app**. Ele consulta o `REGISTRO` e mostra o que já
foi gravado daquele lote: quantas linhas, quantas OPs, quem estava em cada uma, e um
aviso em laranja quando o lote foi gravado mais de uma vez.

Não existe aba de relatório: ela nasceria desatualizada no instante seguinte, e o
`REGISTRO` já tem tudo. A consulta filtra no servidor pelo `tq` do gviz, então o
tablet baixa só as linhas daquele lote em vez da aba inteira.

Para limpar duplicidade já gravada, `limparDuplicados()` no Apps Script mantém a
gravação mais recente de cada lote e apaga as antigas.

## Auditoria — quem pôs o quê na caixa

O caso de uso é a reclamação que chega dias depois: faltou peça, peça danificada.
Digite o lote (ele está na etiqueta do volume e no lançamento de FALTAS), toque em
*Conferência*, e sai por OP: quem embalou, matrícula, peça por peça com quantidade,
e **quando foi embalado**. *Imprimir conferência* leva isso para o papel com um
quadradinho ao lado de cada item.

Atenção para dois pontos que valem numa auditoria:

**Regravar substitui o registro.** Quando o líder regrava um lote e confirma a
substituição, as linhas anteriores daquele lote são apagadas — o que a auditoria
enxerga é a última gravação. Combine com a linha que regravação é para corrigir
erro no mesmo dia, não para reescrever histórico.

**O registro diz quem estava na OP, não quem pegou a peça na mão.** A peça entra na
caixa pela OP registrada, mas rodízio não anotado, cobertura de pausa e ajuda entre
postos não aparecem. Para responsabilizar alguém individualmente isso não basta —
para achar padrão (a mesma peça faltando na mesma OP, semana após semana), sobra.

Quando o lote foi gravado mais de uma vez, a conferência usa só a gravação mais
recente — somar as duas mostraria a peça em dobro e acusaria um erro que não existe.
O aviso de duplicidade continua aparecendo à parte.

Isso serve para apurar padrão, não pessoa. Peça que falta sempre, na mesma OP,
independentemente de quem está lá, é problema de projeto de embalagem ou de posição
na esteira — e esse é o achado que vale dinheiro.

## Folha em branco — o mapa que nasce no papel

*Folha em branco* (perfil PPCP) imprime o mapa vazio: os trilhos numerados com
linha alta para escrever à mão. É para quando o mapa é desenhado na própria
esteira, longe do computador — a linha preenche no papel e o PPCP sobe depois,
digitando no app ou pelo *Importar Excel*. Em qualquer impressão, escolher
**Salvar como PDF** no diálogo do navegador gera o arquivo direto, sem scanner.

As colunas são **as mesmas do modelo do Excel**, na mesma ordem — `Trilho`, `OP`,
`Cód.`, `Descrição do item`, `Qtde` e o segundo bloco para o insumo do trilho. Quem
digita depois transcreve coluna por coluna, sem traduzir nada no meio do caminho.

## Baixar o modelo

*Baixar modelo* (perfil PPCP) escreve o `.xlsx` em branco na hora, com o número de
trilhos que está na tela e, se houver produto aberto, já com o código dele em `A1` e
a linha da cor na aba `PRODUTOS`. Vem com a aba `COMO USAR` junto.

O líder não deveria depender de achar o anexo num e-mail de meses atrás nem de ter
rede para buscar o arquivo do repositório — o modelo sai do próprio app, que é a
mesma coisa que o *Importar* espera. O `modelo-mapa-trilhos.xlsx` do repositório é
esse mesmo arquivo com o mapa do ARMÁRIO ENCANTO preenchido, para servir de exemplo.

## Imprimir o mapa

*Imprimir mapa* gera a folha que fica pendurada na esteira, no mesmo desenho da que
a embalagem usa hoje: OP à esquerda, insumo, descrição da peça, e o número do trilho
à direita. Trilho vazio aparece como linha vazia — isso é informação, marca que
aquele trilho não recebe nada.

Cabe numa folha A4 com os 28 trilhos. Os campos de data e lote saem preenchidos
quando o lote está escolhido no app, e em branco para preencher à mão quando não está.

## Versões e atualização

A versão fica no rodapé do status (`v2.0.0`) e no ⚙. Quando alguém pergunta por
telefone qual versão está no tablet, é esse número.

O `sw.js` guarda o app no próprio aparelho, então ele abre e funciona sem rede —
o que muda é só a leitura da planilha, que sempre vai à rede porque servir uma
programação velha faria o líder montar o mapa do produto errado.

**Para publicar uma versão nova:** mude `VERSAO` em `index.html` **e** em `sw.js`,
e publique. É a troca de bytes do `sw.js` que faz o navegador perceber que há
versão nova. O app procura sozinho de meia em meia hora e toda vez que volta ao
primeiro plano; quando acha, mostra uma faixa laranja com *Atualizar agora*.

Quem decide a hora de trocar é o líder, não o navegador: trocar sozinho no meio
de um mapa pela metade jogaria fora o trabalho dele. Se houver envio na fila do
aparelho, o app avisa antes de atualizar.

## Volume e limites

Uma linha de `REGISTRO` por trilho × item. Um produto com 28 trilhos gera ~28 linhas
por lote; 10 lotes por dia dão ~280 linhas/dia. O Sheets aguenta isso por anos — foi
por isso que não valeu a pena levar para o Supabase.

Cada envio carrega um `ID_ENVIO`. Se o tablet perder o Wi-Fi e reenviar, o Apps Script
descarta o duplicado em vez de lançar o lote duas vezes. O que não sai fica numa fila
no próprio aparelho e é reenviado quando a conexão volta, pelo botão
*Reenviar pendentes* ou sozinho ao detectar que voltou a rede.

## Antes de rodar na fábrica

Combine com a liderança da linha que esse dado é para descobrir **padrão, não pessoa**.
Item que falta sempre, ou trilho que atrasa sempre, independentemente de quem está na
OP, é problema de projeto de embalagem ou de posição na esteira — e esse é o achado que
vale dinheiro. No dia em que o registro for usado para punir alguém, o líder vai parar
de atualizar os nomes e a base apodrece em uma semana.
