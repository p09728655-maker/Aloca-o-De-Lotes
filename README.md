# Alocação da Embalagem — PPCP Patrimar

Registra **quem embalou qual peça em cada lote**, na linha de embalagem com 7 a 10 postos.

O que o app faz: distribui as peças da estrutura do produto entre os postos da esteira,
guarda essa distribuição como padrão do produto e grava no Google Sheets quem estava
em cada posto naquele lote.

O que o app **não** faz: não confere. Sem leitura de código de barras, o registro é
declaração — serve para apurar depois, não para impedir que a caixa saia errada.

## O desenho

O rodízio ergonômico move **pessoas entre postos**, não peças entre postos. Por isso as
duas coisas são separadas:

- **Peça → posto** depende do produto, é estável, fica salva em `ALOCACAO_PADRAO` e é
  reaproveitada no próximo lote do mesmo código.
- **Pessoa → posto** muda a cada rodízio, e é a única coisa que o líder refaz.

Na primeira vez que um produto aparece, o app propõe a distribuição; da segunda em
diante ele carrega o padrão e o líder só troca os nomes.

## Implantação

**1. Apps Script** — na planilha, `Extensões > Apps Script`, cole `Codigo.gs`.
Execute `garantirAbas()` uma vez (autoriza e cria as três abas novas).
Depois `Implantar > Nova implantação > Aplicativo da Web`, executar como **Eu**,
acesso para **Qualquer pessoa**. Copie a URL que termina em `/exec`.

**2. App** — publique `index.html` na Vercel apontando para o repositório (sem build).
Abra, toque no ⚙ e cole a URL do `/exec`.

**3. Colaboradores** — cadastre a equipe da embalagem pelo botão
*+ Cadastrar colaborador*. Grava direto na aba.

A planilha precisa continuar como **“qualquer pessoa com o link: leitor”** — é assim
que o app lê os lotes e a estrutura.

## Abas

Lidas (já existem, nada muda nelas):

| Aba | Origem |
|---|---|
| Programação | `gid 1540822534` — lote, cor, data prev. emb., código, descrição, qtd |
| ESTRUTURA | `gid 662403781` — CODIGO · PEÇA · QTD · DESCRICAO |

Criadas pelo Apps Script:

| Aba | Colunas |
|---|---|
| `REGISTRO` | TS · ID_ENVIO · LOTE · COR · DATA_EMB · COD_PRODUTO · DESC_PRODUTO · VOLUMES · N_POSTOS · POSTO · MATRICULA · NOME · COD_PECA · DESC_PECA · QTD · TIPO |
| `ALOCACAO_PADRAO` | COD_PRODUTO · POSTO · COD_PECA · QTD · ATUALIZADO_EM |
| `COLABORADORES` | MATRICULA · NOME · ATIVO · CADASTRADO_EM |

`REGISTRO` é append-only e guarda o snapshot completo, não a referência. O padrão vai
mudar com o tempo; o histórico não pode mudar junto.

## Decisões que precisam ser validadas na linha

**Ordem da esteira.** A distribuição automática usa esta sequência:
Fundos → Bases → Tampos → Laterais → Divisórias → Prateleiras → Travessas → Gavetas →
Pés → Outras. Isso é uma hipótese. Se a ordem real de embalagem for outra, ajuste a
constante `ORDEM_EMB` no `index.html` — ela vale para todos os produtos.

**Balanceamento.** Carga do posto = `qtd × fator`, com o fator vindo da área da peça
normalizada pela mediana do próprio produto e travado entre 0,5 e 3. Peça grande dá
mais trabalho, mas não proporcionalmente à área. Se na prática o que pesa for o número
de peças e não o tamanho, troque o fator por 1 em `calcularCargas()`.

**Blocos contíguos.** O posto 1 embala primeiro, então a alocação não pode saltar
peças. A distribuição automática resolve isso por programação dinâmica, minimizando a
carga do posto mais carregado sem quebrar a ordem.

## Volume e limites

Uma linha de `REGISTRO` por posto × peça. Um produto com 20 peças gera 20 linhas por
lote; 10 lotes por dia dão ~200 linhas/dia. O Sheets aguenta isso por anos — foi por
isso que não valeu a pena levar para o Supabase.

Cada envio carrega um `ID_ENVIO`. Se o tablet perder o Wi-Fi e reenviar, o Apps Script
descarta o duplicado em vez de lançar o lote duas vezes. O que não sai fica numa fila
no próprio aparelho e é reenviado quando a conexão volta, pelo botão
*Reenviar pendentes* ou sozinho ao detectar que voltou a rede.

## Antes de rodar na fábrica

Combine com a liderança da linha que esse dado é para descobrir **padrão, não pessoa**.
Peça que erra sempre, independentemente de quem está no posto, é problema de projeto de
embalagem ou de posição na esteira — e esse é o achado que vale dinheiro. No dia em que
o registro for usado para punir alguém, o líder vai parar de atualizar os nomes e a base
apodrece em uma semana.
