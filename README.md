# Mapa dos Trilhos — PPCP Patrimar

Monta no tablet o **mapa dos trilhos da embalagem** de um produto — qual item entra
em qual trilho da esteira, em que ordem, e qual OP cobre cada faixa de trilhos —
salva esse mapa como padrão do produto e grava quem estava em cada OP naquele lote.

O que o app **não** faz: não confere. Sem leitura de código de barras, o registro é
declaração — serve para apurar depois, não para impedir que a caixa saia errada.

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
Execute `garantirAbas()` uma vez (autoriza e cria as três abas).
Depois `Implantar > Nova implantação > Aplicativo da Web`, executar como **Eu**,
acesso para **Qualquer pessoa**. Copie a URL que termina em `/exec`.

**2. App** — publique `index.html` na Vercel apontando para o repositório (sem build).
Abra, toque no ⚙ e cole a URL do `/exec`.

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
| `MAPA_TRILHOS` | COD_PRODUTO · DESC_PRODUTO · N_TRILHOS · TRILHO · OP · SEQ · COD_ITEM · DESC_ITEM · QTD · TIPO · VELOCIDADE · N_ESQUEMA · ATUALIZADO_EM |
| `REGISTRO` | TS · ID_ENVIO · LOTE · COR · DATA_EMB · COD_PRODUTO · DESC_PRODUTO · VOLUMES · N_POSTOS · POSTO · MATRICULA · NOME · COD_PECA · DESC_PECA · QTD · TIPO |
| `COLABORADORES` | MATRICULA · NOME · ATIVO · CADASTRADO_EM |

Em `REGISTRO`, `POSTO` guarda o número da OP e `COD_PECA` o código do item — nomes
herdados de quando o app pensava em postos, mantidos para não quebrar quem já lê a aba.

`MAPA_TRILHOS` é sobrescrito por produto: o mapa é o desenho vigente da esteira, não
histórico. `REGISTRO` é append-only e guarda o snapshot completo, não a referência —
o mapa vai mudar com o tempo e o histórico não pode mudar junto.

A aba `ALOCACAO_PADRAO` deixou de ser usada quando o mapa passou a viver em
`MAPA_TRILHOS`. Se ela já existir na sua planilha, pode apagar.

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
