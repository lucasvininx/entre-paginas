# Publicação

Endereço: https://entre-paginas-wheat.vercel.app

O frontend está na Vercel e a API Express é uma função na região `gru1`. O banco é o projeto Supabase `nysmbvjjqbzzbjuuxeei`, schema privado `entre_paginas`.

## Atualizações

```powershell
npm ci
npm run db:migrate
npm test
npm run build
vercel deploy --prod --yes
```

O workspace já está vinculado ao projeto Vercel `entre-paginas`. As migrations são idempotentes. Não execute scripts manuais de catálogo como parte do deploy.

## Variáveis na Vercel

Em Project → Settings → Environment Variables, configure para Production e publique novamente após alterações:

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Pooler Supabase; já configurada |
| `NODE_ENV` | `production`; já configurada |
| `REGION` | `BR`; já configurada |
| `CRON_SECRET` | Segredo do cron; já configurado |
| `BRAVE_SEARCH_KEY` | Busca web ampla; configurada e verificada em produção |
| `GOOGLE_BOOKS_KEY` | Opcional, quota do Google Books |
| `OPENALEX_API_KEY` | Opcional, OpenAlex |
| `APP_ORIGIN` | Origem HTTPS se adicionar domínio próprio; os domínios de produção/deploy informados pela Vercel já são aceitos |

Chaves ficam exclusivamente no backend; não use prefixo `VITE_`. `.env` e `.local` são excluídos do deploy.

Para obter Brave: entre em https://api-dashboard.search.brave.com/, ative um plano e crie a chave em API Keys. Configure `BRAVE_SEARCH_KEY` e faça novo deploy. Sem chave, a interface informa que a busca web aguarda configuração. Os outros conectores continuam disponíveis. A pesquisa Brave não limita domínios, mas nenhum mecanismo garante cobertura de todos os sites. Resultados são pistas sujeitas à revisão de autorização, não PDFs automaticamente aprovados.

## Fila e downloads

“Buscar agora” registra uma tarefa no banco e aciona `waitUntil`. Uma trava transacional e lease de dez minutos evitam execução simultânea e conclusão por um worker antigo. Tarefas interrompidas têm recuperação limitada. A administração também aciona a fila; o cron protegido roda diariamente às 08:00 UTC. A fila não é um serviço contínuo de alta vazão: tarefas pendentes podem esperar a próxima abertura administrativa ou cron.

A função tem duração máxima de 300 segundos. O worker limita a validação a três candidatos e ao tempo restante. PDFs de até 35 MB são validados antes do envio em fluxo. O download real conferido em produção tem 3.840.141 bytes; o teste local de fluxo cobre 6 MB. Downloads maiores ainda precisam de verificação na infraestrutura publicada.

## Contas e conferência

Administrador: `.local/admin-access.json`. Analima: `.local/analima-access.json`. Esses arquivos locais contêm as senhas geradas e não são publicados.

Login, permissões, solicitações e download foram conferidos no endereço público em 30/09/2026. A revisão visual no Safari/iPad permanece pendente conforme [IPAD-QA.md](IPAD-QA.md).

A busca Brave foi ativada e testada no endereço público em 30/09/2026: a consulta “Sweethand” retornou 20 pistas web. Evidência local em `.local/brave-online-smoke.json`. Nessa consulta, Google Books retornou HTTP 429 e Gutenberg teve timeout; os demais resultados foram preservados.

Sweethand consta no catálogo e nas solicitações com prioridade alta. A edição oficial é identificada pelo ISBN 9780349429755. Ainda não há um PDF completo autorizado disponível no sistema.
