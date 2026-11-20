# ITSM Portfolio

Sistema de service desk (ITSM) com abertura e atendimento de chamados, catálogo de serviços, quadro Kanban, SLA e dashboard de indicadores.

**Stack:** Next.js (App Router, Server Actions) · TypeScript · Prisma + PostgreSQL · Playwright · Node test runner

## Funcionalidades

- **Autenticação e papéis:** Administrador, Agente e Solicitante, com sessão por JWT em cookie e rotas protegidas.
- **Chamados:** criação, listagem, detalhe, comentários públicos e notas internas (invisíveis ao solicitante). Cada solicitante só enxerga os próprios chamados.
- **Catálogo de serviços:** o admin cria serviços com formulários dinâmicos; o servidor valida as respostas e serviços desativados não aceitam novos chamados.
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

## Testes

```bash
npm run test:unit   # regras de SLA e transições de status
npm run test:e2e    # fluxos completos no navegador (Playwright)
npm run lint
```

Os testes e2e usam o Microsoft Edge instalado e compartilham o banco de desenvolvimento, por isso rodam em série. Rode o seed antes para garantir os usuários de demonstração.

## Estrutura

```
src/app/(app)/   páginas autenticadas (chamados, quadro, catálogo, dashboard, admin)
src/lib/         regras de negócio e consultas (SLA, status, dashboard)
prisma/          schema, migrations e seed
e2e/             testes de ponta a ponta
```
