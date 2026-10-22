# Radar de Chuva RS

**[Ver ao vivo](https://lukinas1417.github.io/radar-chuva-rs/)**

Mapa web, em tela cheia, da chuva acumulada (1 h, 6 h, 24 h e 48 h) em cada município do Rio Grande do Sul, com
a situação dos rios. Os dados vêm quase em tempo real dos pluviômetros do CEMADEN e da Defesa Civil do RS. O
contorno dos municípios com rio em atenção, alerta ou inundação pulsa suavemente, e o relevo 3D é opcional.

> Projeto de portfólio. **Não substitui os alertas oficiais da Defesa Civil** (SMS 40199 com o CEP, ou 199).

![Mapa do RS com a chuva por município e contornos de rios em risco](docs/tela-desktop.png)

<p>
  <img src="docs/tela-cartao.png" alt="Cartão compacto de um município" width="62%">
  <img src="docs/tela-celular.png" alt="Versão para celular" width="22%">
</p>

## Por que existe

Os dados públicos de chuva e de rios do Brasil existem, mas estão espalhados em portais difíceis de ler. A ideia
foi juntar as fontes oficiais em uma única tela que qualquer pessoa entenda de relance: "quanto choveu na minha
cidade e como está o rio?". O mapa mostra também onde **não há** dado, porque a ausência de pluviômetro não
significa ausência de chuva.

## Decisões técnicas

O que o sistema precisa ter para ser confiável, os modos de falha tratados e os limites conhecidos estão em
[docs/arquitetura.md](docs/arquitetura.md). Um resumo:

- **Fontes instáveis são o caso normal.** O endpoint público do CEMADEN recusa conexões de forma intermitente, e o da
  Defesa Civil chegou a ficar com certificado vencido. O workflow tenta de novo, reaproveita o último dado publicado
  se a coleta falhar e o site avisa em âmbar quando o dado passa de 1 hora.
- **"Sem dado" nunca vira "sem problema".** Estação sem leitura recente é `null`, não zero, e a pílula de rios
  nunca indica normalidade quando não há leitura. A situação do rio é rotulada como informada pela Defesa Civil,
  porque a API não expõe as cotas e a própria documentação é ambígua sobre o que o status representa.
- **Sem build, sem dependências e sem servidor.** O site é estático (MapLibre GL). Um workflow do GitHub Actions
  coleta os dados a cada 15 minutos e publica no Pages, sem gerar commits.
- **Geometria compartilhada.** O mesmo ponto-em-polígono (`src/geo.js`) atribui cada estação ao seu município na
  coleta (Node) e acha a cidade do usuário no navegador.
- **Privacidade.** A localização é usada só no navegador e nunca é enviada nem guardada. As fontes de texto ficam
  no próprio repositório, sem Google Fonts.
- **Acessibilidade.** Busca como combobox com teclado, `aria-*` nos controles e respeito a `prefers-reduced-motion`.

## Interface

- Mapa em tela cheia; tudo o mais flutua sobre ele em painéis de vidro fosco.
- **Sua cidade:** o botão de localização (ou o convite na primeira visita) acha o município e abre o cartão dele.
- O cartão abre **compacto** (chuva e situação do rio) e expande para barras, rios e estações. Em municípios sem
  pluviômetro, mostra os vizinhos com dado.
- O link guarda o município e a janela de tempo (`#m=4314902&j=24h`), então dá para compartilhar uma cidade.
- Vista de cima por padrão; o botão de relevo liga a vista 3D.

## Como rodar

Requer Node 22+. Sem dependências.

```sh
node scripts/fetch-municipios.mjs   # malha municipal do IBGE (uma vez)
node scripts/fetch-chuva.mjs        # estações de chuva do CEMADEN (repetir para atualizar)
node scripts/fetch-rios.mjs         # estações de rio e chuva da Defesa Civil RS (opcional)
node scripts/serve.mjs              # http://localhost:8080
```

## Como funciona

- `scripts/fetch-chuva.mjs` consulta o endpoint público do Mapa Interativo do CEMADEN e grava
  `data/chuva-rs.json`. O CEMADEN só preenche o acumulado quando choveu na janela, então `"-"` em estação com
  leitura recente (últimas 3 h) vira **0 mm**, e estação sem leitura recente vira **sem dado**.
- `scripts/fetch-rios.mjs` consulta a [API da Defesa Civil do RS](https://sistemas.defesacivil.rs.gov.br/api-redehidrometeorologica)
  (GraphQL, dados a cada 5 minutos). A API só aceita o texto exato da consulta documentada, guardado em
  `scripts/consultas/tags_data.graphql`. Ela traz o nível dos rios e a chuva dos pluviômetros da Defesa Civil.
- O valor de cada município é o maior acumulado entre as estações ativas dele, das duas fontes.
- O contorno luminoso usa a pior situação de rio informada pela Defesa Civil entre as estações do município.
- O relevo 3D vem dos tiles públicos Terrarium (Mapzen/AWS); as demais camadas são desenhadas a partir da malha do IBGE.

## Cobertura e limitações

- Com as duas fontes ativas: pluviômetros em 222 dos 497 municípios (187 pelo CEMADEN, mais 35 pela Defesa Civil) e
  125 estações de rio. Mais da metade dos municípios não tem pluviômetro nessas redes.
- O endpoint de chuva do CEMADEN não é documentado oficialmente e pode mudar. O oficial (PED) usa token que expira em
  poucas horas e login com captcha, o que impede o uso em coleta agendada.
- A API da Defesa Civil não declara licença de uso; a fonte é citada no site. A atribuição das estações aos
  municípios usa uma malha simplificada, então estações junto a uma divisa podem cair no município vizinho.
- Ainda não há camada de risco de inundação (as cartas do SGB cobrem só 26 municípios gaúchos).

## Fontes

DADOS DA REDE OBSERVACIONAL DO CEMADEN/MCTIC (citação exigida pelas regras de utilização da PED), Rede
Hidrometeorológica da Defesa Civil do RS, malha municipal do IBGE e relevo Terrarium (Mapzen/AWS).

## Autor

Lucas de Mélo Berra, desenvolvedor Full Stack. [Portfólio](https://lukinas1417.github.io/) · [GitHub](https://github.com/lukinas1417).

## Licença

O código é distribuído sob a licença [MIT](LICENSE). Os **dados** não são cobertos por ela: pertencem
ao CEMADEN, à Defesa Civil do RS e ao IBGE, e seguem os termos de cada órgão.
