# ITSM Portfolio

[![CI](https://github.com/marc0n1/itsm-portfolio/actions/workflows/ci.yml/badge.svg)](https://github.com/marc0n1/itsm-portfolio/actions/workflows/ci.yml)

Sistema de service desk (ITSM) com abertura e atendimento de chamados, catálogo de serviços, quadro Kanban, SLA e dashboard de indicadores.

**Stack:** Next.js (App Router, Server Actions) · TypeScript · Prisma + PostgreSQL · Playwright · Node test runner

## Funcionalidades

- **Autenticação e papéis:** Administrador, Agente e Solicitante, com sessão por JWT em cookie e rotas protegidas.
- **Gestão de usuários (admin):** criar, editar nome e perfil, desativar/reativar e redefinir a senha. Desativar derruba a sessão aberta na hora e a pessoa deixa de aparecer como responsável, mas o histórico dela é preservado. O admin não altera o próprio perfil nem se desativa, e a organização nunca fica sem um administrador ativo. Senhas: mínimo de 8 caracteres e no máximo 72 bytes (limite real do bcrypt).
- **Proteção contra força bruta:** depois de 5 senhas erradas em 15 minutos para a mesma conta e IP, o login é bloqueado (até com a senha certa) e libera sozinho. Há um segundo freio por IP (20 falhas) e a resposta é a mesma para contas que não existem. Os registros ficam no banco, então valem com várias instâncias.
- **Chamados:** criação, listagem, detalhe, comentários públicos e notas internas (invisíveis ao solicitante). Cada solicitante só enxerga os próprios chamados.
- **Catálogo de serviços:** o admin cria serviços com formulários dinâmicos; o servidor valida as respostas e serviços desativados não aceitam novos chamados.
- **Anexos:** upload na abertura do chamado e nos comentários (até 3 arquivos de 5 MB: png, jpg, pdf, txt, log, csv). O servidor valida extensão e assinatura do conteúdo, grava com nome aleatório fora de `public` e só entrega o download a quem pode ver o chamado; anexos de nota interna ficam restritos à equipe. Imagens (png/jpg) têm miniatura e visualização ampliada. Quem enviou o arquivo, ou a equipe, pode removê-lo (com confirmação), e a remoção aparece no histórico do chamado.
- **Notificações:** sino no cabeçalho com contador de não lidas, atualizado a cada 30 s. Avisa atribuição (novo responsável), mudança de status (solicitante) e comentários (o outro lado da conversa e o responsável). Nota interna só avisa a equipe, e quem faz a ação nunca é notificado. Cada pessoa só vê as próprias.
- **Histórico de auditoria:** linha do tempo interna em cada chamado (abertura e mudanças de status, prioridade e responsável, com autor e data). Só a equipe vê.
- **Quadro Kanban:** arrastar e soltar entre colunas de status (com seletor "Mover para" como alternativa), ordenado por urgência, com filtro "Atribuídos a mim". Visível só para a equipe.
- **SLA:** metas de primeira resposta e resolução configuráveis pelo admin. O relógio pausa em "Aguardando" e retoma ao sair, e só o comentário público da equipe conta como primeira resposta.
- **Dashboard:** indicadores de SLA (conformidade, em risco, estourados, tempos médios) e gráfico diário, restritos à equipe.
- **Tema:** suporte a modo escuro com texto legível.

## Como rodar

Pré-requisitos: Node.js, Docker.

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example .env
# edite SESSION_SECRET (o comando para gerar está no próprio .env.example)

# 3. Banco de dados
docker compose up -d
npx prisma migrate deploy
npx prisma db seed

# 4. Aplicação
npm run dev
```

Acesse http://localhost:3000.

### Usuários de demonstração

Senha de todos: `demo1234`

| Perfil      | E-mail                |
| ----------- | --------------------- |
| Admin       | admin@demo.com        |
| Agente      | agente@demo.com       |
| Solicitante | solicitante@demo.com  |

Os anexos ficam em `storage/uploads` (ignorado pelo git); use `UPLOAD_DIR` para trocar o local.

Apagar um chamado remove os anexos do banco, mas não os arquivos do disco. Para limpar as sobras:

```bash
npm run storage:cleanup            # simulação: só lista os órfãos
npm run storage:cleanup -- --apply # apaga de verdade
```

Por segurança, arquivos com menos de 1 hora são ignorados (podem ser um upload em andamento; ajuste com `--grace-minutes=N`).

### Atrás de um proxy

O limite por IP lê `X-Forwarded-For`, mas só se `TRUST_PROXY=1` estiver definido. Ligue isso apenas quando houver um proxy/CDN que sobrescreva o cabeçalho; caso contrário, qualquer cliente poderia forjá-lo. Sem a variável, vale só o limite por conta.

## Testes

```bash
npm run test:unit   # regras de SLA e transições de status
npm run test:e2e    # fluxos completos no navegador (Playwright)
npm run lint
```

Os testes e2e usam o Microsoft Edge instalado e compartilham o banco de desenvolvimento, por isso rodam em série. Rode o seed antes para garantir os usuários de demonstração.

### Integração contínua

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda a cada push na `main` e em pull requests, em dois jobs: lint + `tsc` + testes unitários, e os testes e2e com um Postgres de serviço (migrations + seed, Chromium do Playwright). Se o e2e falhar, o relatório do Playwright fica como artefato por 7 dias.

## Estrutura

```
src/app/(app)/   páginas autenticadas (chamados, quadro, catálogo, dashboard, admin)
src/lib/         regras de negócio e consultas (SLA, status, dashboard)
prisma/          schema, migrations e seed
e2e/             testes de ponta a ponta
```
