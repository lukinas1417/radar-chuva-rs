# Radar de Chuva RS

Mapa web da chuva acumulada (1 h, 6 h, 24 h e 72 h) nos municípios do Rio Grande do Sul, com dados
em tempo quase real da rede de pluviômetros do CEMADEN. Municípios sem pluviômetro ativo aparecem
em cinza: o mapa mostra também onde **não há** dado.

> Projeto de portfólio. **Não substitui os alertas oficiais da Defesa Civil** (SMS 40199 com o CEP, ou 199).

## Como rodar

Requer Node 22+. Sem dependências.

```sh
node scripts/fetch-municipios.mjs   # malha municipal do IBGE (uma vez)
node scripts/fetch-chuva.mjs        # estações do CEMADEN (repetir para atualizar)
node scripts/serve.mjs              # http://localhost:8080
```

## Como funciona

- `scripts/fetch-chuva.mjs` consulta o endpoint público do Mapa Interativo do CEMADEN e grava
  `data/chuva-rs.json` normalizado.
- O CEMADEN só preenche o acumulado quando choveu na janela. Por isso `"-"` em estação com leitura
  recente (últimas 3 h) vira **0 mm**, e estação sem leitura recente vira **sem dado** (`null`).
- O valor de cada município é o maior acumulado entre as estações ativas dele.
- O site é estático (MapLibre GL, sem mapa-base de terceiros).

## Cobertura atual

Em 21/10/2026: 428 estações ativas em 187 dos 497 municípios do RS.

## Limitações conhecidas

- O endpoint usado não é documentado oficialmente e pode mudar. O endpoint oficial (PED) exige token.
- Mais da metade dos municípios não tem pluviômetro do CEMADEN.
- Ainda não há dados de nível de rio (ANA) nem de risco (SGB).

## Fontes

Rede Observacional do CEMADEN/MCTI (citar a fonte conforme os termos de uso da PED) e malha municipal do IBGE.
