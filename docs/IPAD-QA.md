# Interface para iPad

## Implementado

- Layout fluido por largura da janela, compatível com retrato, paisagem e janelas reduzidas/Split View.
- Catálogo com duas colunas até 699 px, três de 700 a 959 px e quatro de 960 a 1366 px (larguras CSS). O desktop maior mantém cinco.
- Navegação recolhível até 1100 px, com estado expandido anunciado a tecnologias assistivas.
- Texto ampliado e alvos de toque de pelo menos 44 × 44 px nos botões/ações para tablets e dispositivos com ponteiro de toque, inclusive com trackpad conectado.
- Campos de 16 px, filtros que redistribuem colunas e formulários sem larguras mínimas que forcem a página a crescer.
- Painel administrativo em cartões abaixo de 1024 px; cada campo mantém seu rótulo e a semântica de tabela.
- Diálogos limitados ao viewport visível com `VisualViewport`, rolagem interna, cabeçalho fixo e respeito às áreas seguras. Rotação e abertura do teclado atualizam o espaço disponível.
- Diálogos administrativos sobrepostos mantêm foco e bloqueio de rolagem até fechar o último diálogo.
- Zoom por gesto continua habilitado; não foi definido `user-scalable=no` ou limite de escala.

## Validação disponível

A compilação TypeScript/Vite valida os módulos e processa o CSS. A sessão continua sem navegador conectado, portanto **não foi possível executar a matriz visual abaixo ou certificar o comportamento em Safari/iPad físico**. Dimensões abaixo são cenários de QA em pixels CSS, não resultados de testes executados.

## Matriz de conferência visual pendente

| Janela                                 | Cenário                                 |
| -------------------------------------- | --------------------------------------- |
| 744 × 1133 e 1133 × 744                | Tablet compacto em ambas as orientações |
| 768 × 1024 e 1024 × 768                | Tablet com proporção 4:3                |
| 820 × 1180 e 1180 × 820                | Tablet intermediário                    |
| 834 × 1194 e 1194 × 834                | Tablet intermediário maior              |
| 1024 × 1366 e 1366 × 1024              | Tablet grande                           |
| 320, 375, 507, 639 e 694 px de largura | Split View / janelas estreitas          |
| 1440 × 900                             | Regressão de desktop                    |

Em cada tamanho: verificar ausência de rolagem horizontal da página, navegação completa com administrador e leitor, cartões com títulos extensos, filtros, paginação, estante, solicitações e ficha do livro. Abrir login/solicitação/criação de leitor, focar campos inferiores com teclado aberto e girar o aparelho. Abrir uma fonte sobre o diálogo administrativo, fechá-la e confirmar que o diálogo anterior ainda rola e recebe foco. Conferir também zoom, teclado externo, seletor de data e download pelo Safari.

O endereço `localhost` pertence ao computador que executa a aplicação; no iPad, os testes precisam usar uma implantação HTTPS acessível ou um servidor de desenvolvimento configurado na rede local, com a origem correspondente autorizada no backend.
