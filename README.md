# Entre Páginas

Biblioteca pessoal em português: busca federada, catálogo crescente, estante, favoritos, solicitações automáticas e revisão administrativa de PDFs autorizados.

## Projeto criado

- Supabase: [entre-paginas](https://supabase.com/dashboard/project/nysmbvjjqbzzbjuuxeei), região São Paulo (`sa-east-1`).
- PostgreSQL com schema privado `entre_paginas`. A migration já foi aplicada neste ambiente.
- Frontend React + TypeScript + Vite + Tailwind; backend Express + TypeScript; consultas SQL parametrizadas com `pg`. PostgreSQL substitui SQLite/Prisma para usar o Supabase solicitado.
- Autenticação própria no backend: bcrypt, sessões opacas com hash no banco, cookies HTTP-only/SameSite, verificação de origem e limites por IP. O cadastro público não existe. O Supabase Auth não é usado.

## Abrir localmente

Requer Node.js 22.12+ e PostgreSQL/Supabase. Neste workspace, `.env` já contém a conexão real; não compartilhe esse arquivo.

```powershell
npm ci
npm run dev
```

Abra **http://localhost:5173**. API: `http://localhost:3001/api`.

O acesso inicial do administrador foi gerado aleatoriamente e está em **`.local/admin-access.json`**, ignorado pelo Git. O e-mail é `lucas@entre-paginas.local`; não existe senha fixa no código. Após entrar, use Administração → Criar leitor para criar a conta de leitura.

Para uma nova instalação:

1. Copie `.env.example` para `.env` e configure `DATABASE_URL` com o pooler de sessão do seu Supabase.
2. Execute `npm run db:migrate`.
3. Crie o primeiro administrador com senha fornecida pelo ambiente:

```powershell
$securePassword = Read-Host 'Senha do administrador (mínimo 12 caracteres)' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $securePassword).Password
npm run admin:create -- seu-email@example.com "Seu nome"
Remove-Item Env:ADMIN_PASSWORD
```

O certificado público em `certs/supabase-ca.crt` foi obtido da distribuição oficial do Supabase. A conexão verifica CA e hostname; TLS não foi desativado. Caso o projeto use outra CA, atualize o certificado a partir do dashboard oficial.

## Fontes e cobertura real

| Integração                   | O que faz                                                                                                                       | Dependência / limite                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Library                 | Busca obras, autores e capas; link oficial                                                                                      | Sem chave. Obras sem edição identificada mantêm idioma/edição vazios                                                                                                                           |
| Google Books                 | Metadados e candidatos somente com `pdf.downloadLink`, acesso completo, domínio público e país correspondente                   | Chave opcional `GOOGLE_BOOKS_KEY`; sem chave, houve HTTP 429 neste ambiente                                                                                                                    |
| OAPEN                        | Busca livros e bitstreams PDF originais com licença aberta                                                                      | API REST pública; algumas consultas demoraram além do timeout                                                                                                                                  |
| DOAB                         | Busca livros de acesso aberto; bitstreams, se efetivamente fornecidos                                                           | Muitos registros são apenas metadados; não inventa URL de download                                                                                                                             |
| Project Gutenberg / Gutendex | Obras, autores, formatos e eventual PDF declarado                                                                               | Fonte apresentou timeout neste ambiente. EPUB não é convertido nem anunciado como PDF; domínio público nos EUA exige revisão regional                                                          |
| Internet Archive             | Metadados, leitura/empréstimo e inspeção de até três itens com licença Creative Commons declarada para localizar PDFs originais | Licença do depositante exige revisão. Itens restritos, amostras e arquivos sem licença não viram candidatos; o caminho de PDFs licenciados precisa de validação adicional com um item adequado |
| OpenAlex                     | Busca livros e candidatos de repositórios com PDF e licença declarada                                                           | Opcional: `OPENALEX_API_KEY`; não testado sem credencial                                                                                                                                       |
| Brave Search                 | Descoberta adicional em toda a web, incluindo bibliotecas, editoras e repositórios                                              | Opcional: `BRAVE_SEARCH_KEY`; retorna **pistas para revisão**, nunca livros inventados ou PDFs aprovados                                                                                       |
| Inclusão administrativa      | Permite PDFs de bibliotecas, universidades, autores e editoras com evidência verificável                                        | Aplica as mesmas validações de rede/arquivo e exige revisão bibliográfica/da licença                                                                                                           |

As pesquisas não se limitam a uma lista pré-cadastrada. Cada consulta vai às fontes e incorpora os metadados encontrados. Os conectores possuem limites por consulta e paginação dos resultados agregados; esta versão não varre todos os resultados possíveis de cada provedor.

Não é possível garantir literalmente todas as fontes da internet. `server/web-discovery.ts` inclui uma lista de instituições para expansão (Domínio Público, Brasiliana USP, BNDigital, SciELO, Fiocruz, repositórios universitários, OpenStax, BCcampus, Gallica, Europeana, HathiTrust, entre outras). **Essa lista é referência para expansão, não integrações já implementadas**. Com a chave Brave, a busca web é ampla e não depende de uma lista fechada. As pistas aparecem no histórico da tarefa administrativa; o administrador pode registrar uma fonte autorizada encontrada. Sites sem API implementada não são anunciados como conectores ativos.

Documentação consultada:

- [Open Library Search API](https://openlibrary.org/dev/docs/api/search)
- [Google Books Volume](https://developers.google.com/books/docs/v1/reference/volumes)
- [OAPEN REST API](https://www.oapen.org/article/8185269-search-using-a-rest-api)
- [Gutendex](https://gutendex.com/)
- [Internet Archive APIs](https://archive.org/developers/)
- [OpenAlex](https://docs.openalex.org/)
- [Brave Search API](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started)

## Fluxo de uso

1. Entre e pesquise título, autor ou ISBN. O catálogo inclui livros sem PDF.
2. Uma correspondência exata sem PDF gera uma solicitação vinculada. Consultas ambíguas/sem identificação preservam a consulta original com os campos desconhecidos vazios. É possível selecionar um resultado ou preencher os dados na opção “Solicitar um livro”.
3. Pedidos iguais usam restrições únicas e upserts; repetir a solicitação não aumenta a contagem do mesmo leitor.
4. Administração reúne interessados, prioridade, status, datas, observações, tentativas e candidatos. “Buscar agora” cria uma tarefa persistente executada pelo worker.
5. O worker consulta as fontes, registra falhas e rejeições, valida até oito candidatos e encaminha a revisão. Títulos/idiomas diferentes ficam registrados como correspondência incerta, sem publicação.
6. O administrador inspeciona o arquivo completo, autoria, edição, idioma e autorização regional. Apenas confirmar a revisão e passar na revalidação técnica permite publicar.
7. A aprovação atualiza solicitações e avisos dos interessados na mesma transação. Não há envio de e-mails.
8. O download recebe ID de uma fonte aprovada, revalida e entrega o PDF com nome correto. Uma falha retira aquela fonte da disponibilidade, mantendo outras fontes aprovadas.

Busca incompleta é diferente de ausência definitiva. Fontes com falha não apagam os resultados das demais. A revisão humana da correspondência, do livro completo e da licença é indispensável: a presença de `%PDF-` ou de um link não comprova autorização editorial.

## Segurança e persistência

- Schema privado fora do Data API; permissões revogadas para `anon`/`authenticated` e RLS habilitada. O frontend não recebe credenciais do banco ou chaves dos provedores.
- HTTPS público apenas, DNS verificado e fixado na conexão, validação de cada redirect, bloqueio de IPs privados/reservados, máximo quatro redirects, timeout total de 20 segundos e limite de 35 MB por PDF.
- Validação de status HTTP, Content-Type, assinatura, EOF, estrutura PDF, criptografia e existência de páginas. HTML/EPUB/arquivos truncados não são oferecidos como PDF.
- PDFs são baixados sob demanda e ficam somente em memória durante a operação; não são importados acervos inteiros. O limite do arquivo é proposital e pode excluir livros grandes.
- O contador representa **downloads iniciados**, não conclusão no navegador.
- Cache persistente por 15 minutos, até três buscas federadas em paralelo e intervalo mínimo entre chamadas de cada provedor. Há limites adicionais por IP nos endpoints.
- Worker de uma instância, uma tarefa de cada vez, unicidade de tarefa ativa e recuperação limitada de tarefas interrompidas. Uma tentativa sem resultado pode ser repetida manualmente, sem repetição automática infinita.
- Dados persistem no Supabase. Não há dependência de disco local persistente para o banco. Para hospedar, basta manter uma instância Node em execução e configurar backups do projeto conforme a necessidade.

## Produção

```powershell
npm run build
$env:NODE_ENV = 'production'
$env:APP_ORIGIN = 'https://seu-dominio.example'
$env:HOST = '0.0.0.0'
npm start
```

O Express serve `dist` e `/api` na porta `PORT` (3001 por padrão). Use HTTPS no proxy/host; cookies `Secure` são ativados em produção. Não execute múltiplas instâncias do worker desta versão. Ajuste explicitamente `trust proxy` se implantar atrás de proxy para que o limite por IP corresponda ao leitor; não confie indiscriminadamente em cabeçalhos encaminhados.

## Verificações

```powershell
npm test
npm run build
```

Os testes usam um schema temporário exclusivo `ep_test_<timestamp>` no PostgreSQL configurado, removido ao final. **Não inserem fixtures no catálogo real**. Cobrem SSRF, falsos PDFs, normalização, autenticação, CSRF, autorização, isolamento por leitor, busca parcial, solicitação não identificada, concorrência/deduplicação, fila, retomada após reinício e união de interessados/histórico.

Também foi executado o fluxo real por HTTP: busca “Dom Casmurro”, resultados de fontes públicas, solicitação, inclusão e validação de “Urban Water Demand Management” (Springer, 2023), revisão da licença CC BY 4.0 na página 5, aprovação, aviso interno e download do PDF de 3.840.141 bytes. O registro é um livro real e permanece no catálogo. A evidência local está em `.local/live-smoke.json`.

`scripts/live-smoke.ts` é uma verificação **manual e mutável** desse caso real e pressupõe que a licença/edição já tenham sido conferidas; não faz parte de `npm test` nem deve ser executada automaticamente em CI.

## Limites conhecidos

Os ajustes específicos de tablet/iPad, incluindo retrato, paisagem, toque, teclado e Split View, estão documentados em [docs/IPAD-QA.md](docs/IPAD-QA.md), com a matriz de revisão visual pendente.

- Nenhum navegador estava conectado à sessão de desenvolvimento (Browser/Chrome indisponíveis). A validação visual e o fluxo interativo no navegador ainda precisam ser feitos; não são apresentados como concluídos.
- Google Books sem chave retornou 429; Gutendex e algumas consultas OAPEN tiveram timeout. Isso aparece na interface. Não houve contorno de bloqueios ou DRM.
- Uma obra Open Library não equivale a uma edição: não atribuímos a ela arbitrariamente o primeiro idioma/ISBN de uma lista de edições.
- A deduplicação é conservadora: ISBN, idioma e edição; na ausência de ISBN, título/autor/idioma/edição conhecidos. Casos incompletos preservam a identidade da fonte e podem exigir revisão.
- Alguns pedidos podem não ter PDF autorizado, especialmente edições comerciais contemporâneas. Continuam no catálogo e na fila.
- Chaves opcionais Brave/OpenAlex não foram fornecidas; essas integrações estão implementadas, mas não foram validadas com credenciais reais.
- Conta pessoal: sem recuperação de senha por e-mail, sem envio de mensagens, sem OCR e sem varredura de acervos inteiros. Criação de leitores é exclusiva do administrador.

## Estrutura

```text
src/                 Interface, tipos e cliente HTTP
server/providers.ts  Adaptadores e cache de busca
server/workflow.ts   Solicitações, fila, validação e aprovação
server/safe-fetch.ts Rede segura e validação PDF
server/index.ts      API, autenticação e autorização
supabase/migrations  Estrutura PostgreSQL e restrições
tests/               Regras de segurança e integração isolada
scripts/             Verificação real manual
certs/               Certificado público do Supabase
```
