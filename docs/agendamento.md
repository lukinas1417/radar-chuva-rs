# Manter o dado atualizado (agendamento gratuito)

## O problema

A coleta roda em um workflow do GitHub Actions. O gatilho `schedule` do GitHub **não é confiável**: em
21 e 22/10/2026 só 3 execuções agendadas aconteceram em cerca de 16 horas, em vez de uma a cada 15 minutos, e
nenhuma nas últimas 6 horas. Isso é um comportamento conhecido da plataforma (execuções agendadas podem ser
atrasadas ou descartadas). Sem outro gatilho, o dado de chuva envelhece sozinho.

O workflow já aceita disparo manual (`workflow_dispatch`). A solução é um serviço externo e gratuito chamar esse
disparo a cada 15 minutos. O `schedule` do GitHub continua no workflow como reserva.

Custo: zero. GitHub Pages e Actions são gratuitos em repositório público, e o serviço abaixo tem plano gratuito
(confira os termos atuais dele antes de depender).

## Opção recomendada: cron-job.org

### 1. Criar um token com o mínimo de permissão

No GitHub: **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**.

| Campo | Valor |
|---|---|
| Token name | `radar-chuva-rs cron` |
| Expiration | a maior validade permitida (anote a data para renovar) |
| Repository access | **Only select repositories** > `radar-chuva-rs` |
| Repository permissions | **Actions: Read and write** (o resto fica sem acesso) |

Copie o token quando ele for exibido: ele não aparece de novo. **Nunca o coloque no repositório, em issues ou em
conversas.** Com este escopo, quem o obtiver só consegue disparar workflows deste repositório.

### 2. Criar o job no cron-job.org

Crie uma conta gratuita em https://cron-job.org e um novo cron job:

| Campo | Valor |
|---|---|
| Title | `Radar RS` |
| URL | `https://api.github.com/repos/lukinas1417/radar-chuva-rs/actions/workflows/publicar.yml/dispatches` |
| Schedule | a cada 15 minutos (por exemplo, nos minutos 3, 18, 33 e 48) |
| Request method | `POST` |
| Request body | `{"ref":"main"}` |
| Headers | `Authorization: Bearer SEU_TOKEN` · `Accept: application/vnd.github+json` · `X-GitHub-Api-Version: 2022-11-28` · `Content-Type: application/json` |

Resposta esperada do GitHub: **HTTP 204** (sem corpo). Use o botão de teste do serviço para conferir.

### 3. Conferir que funciona

Em https://github.com/lukinas1417/radar-chuva-rs/actions, as execuções passam a aparecer com o evento
`workflow_dispatch` a cada 15 minutos, e o horário no canto do mapa acompanha.

## Manutenção

- **O token expira.** Anote a data e crie um novo antes de vencer; basta atualizar o cabeçalho do job. Se o token
  vencer, a única consequência é o dado voltar a envelhecer, e o site avisa na tela quando isso acontece.
- **Versão da API.** A resposta do GitHub traz os cabeçalhos `Deprecation` e `Sunset`: a versão `2022-11-28` da API
  será descontinuada em 10/03/2028. Antes disso, troque o valor de `X-GitHub-Api-Version` no job por uma versão mais
  nova (a lista está em https://docs.github.com/en/rest/about-the-rest-api/api-versions).
- Se o serviço sair do ar, o `schedule` do GitHub continua como reserva, ainda que irregular.

## Alternativas gratuitas

- **Cloudflare Worker com Cron Trigger**, chamando a mesma URL com o token guardado como segredo do Worker. Mantém
  tudo versionado em código, mas exige uma conta e uma ferramenta de deploy a mais.
- **Só o `schedule` do GitHub**, sem nada externo. Zero manutenção, mas o dado fica atualizado de forma irregular.

## Decisão

Foi escolhido o serviço externo simples por ter a menor manutenção para um projeto de uma pessoa. O custo é uma
dependência de terceiros e um token com validade, ambos com impacto limitado: a falha de qualquer um deles só faz o dado
envelhecer, e o site avisa.
