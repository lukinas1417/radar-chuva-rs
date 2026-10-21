# Radar de Chuva RS

Mapa web da chuva acumulada (1 h, 6 h, 24 h e 48 h) nos municípios do Rio Grande do Sul, com dados
em tempo quase real dos pluviômetros do CEMADEN e da Defesa Civil do RS, e do nível dos rios (125 estações da Defesa
Civil do RS, com a situação de normalidade, atenção, alerta ou inundação). Municípios sem pluviômetro
ativo aparecem em cinza: o mapa mostra também onde **não há** dado.

> Projeto de portfólio. **Não substitui os alertas oficiais da Defesa Civil** (SMS 40199 com o CEP, ou 199).

## Como rodar

Requer Node 22+. Sem dependências.

```sh
node scripts/fetch-municipios.mjs   # malha municipal do IBGE (uma vez)
node scripts/fetch-chuva.mjs        # estações de chuva do CEMADEN (repetir para atualizar)
node scripts/fetch-rios.mjs         # estações de rio da Defesa Civil RS (opcional)
node scripts/serve.mjs              # http://localhost:8080
```

## Como funciona

- `scripts/fetch-chuva.mjs` consulta o endpoint público do Mapa Interativo do CEMADEN e grava
  `data/chuva-rs.json` normalizado.
- O CEMADEN só preenche o acumulado quando choveu na janela. Por isso `"-"` em estação com leitura
  recente (últimas 3 h) vira **0 mm**, e estação sem leitura recente vira **sem dado** (`null`).
- A API da Defesa Civil também traz a chuva de seus pluviômetros. `fetch-rios.mjs` atribui cada estação a um
  município por ponto-em-polígono na malha do IBGE, e o site junta as duas fontes.
- O valor de cada município é o maior acumulado entre as estações ativas dele (das duas fontes).
- Como a atribuição usa a malha simplificada, estações muito próximas de uma divisa podem cair no município vizinho.
- `scripts/fetch-rios.mjs` consulta a [API da Defesa Civil do RS](https://sistemas.defesacivil.rs.gov.br/api-redehidrometeorologica)
  (GraphQL, dados a cada 5 minutos). A API só aceita o texto exato da consulta documentada, guardado em
  `scripts/consultas/tags_data.graphql`.
- A cor de cada estação de rio é a situação informada pela Defesa Civil. Os valores das cotas não são
  expostos pela API, então o site mostra o nível em metros e a situação, mas não a distância até a cota.
- A camada de rios é opcional: se a API falhar, o site publica só com a chuva.
- O site é estático (MapLibre GL, sem mapa-base de terceiros).

## Cobertura atual

Em 21/10/2026: pluviômetros ativos em 222 dos 497 municípios do RS (187 só pelo CEMADEN; +35 pela Defesa Civil) e 125 estações de rio.

## Limitações conhecidas

- O endpoint de chuva do CEMADEN não é documentado oficialmente e pode mudar. O endpoint oficial (PED) exige token.
- A API da Defesa Civil não declara licença de uso; a fonte é citada no site.
- Mais da metade dos municípios não tem pluviômetro do CEMADEN.
- Ainda não há camada de risco (cartas do SGB cobrem só 26 municípios gaúchos) nem dados da ANA.

## Fontes

DADOS DA REDE OBSERVACIONAL DO CEMADEN/MCTIC (citação exigida pelas regras de utilização da PED), Rede Hidrometeorológica da Defesa Civil do RS e malha municipal do IBGE.

## Licença

O código é distribuído sob a licença [MIT](LICENSE). Os **dados** não são cobertos por ela: pertencem
ao CEMADEN, à Defesa Civil do RS e ao IBGE, e seguem os termos de cada órgão.
