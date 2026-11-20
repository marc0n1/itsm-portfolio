# ITSM Portfolio

Sistema de service desk (ITSM) com abertura e atendimento de chamados, catálogo de serviços, quadro Kanban, SLA e dashboard de indicadores.

**Stack:** Next.js (App Router, Server Actions) · TypeScript · Prisma + PostgreSQL · Playwright · Node test runner

## Funcionalidades

- **Autenticação e papéis:** Administrador, Agente e Solicitante, com sessão por JWT em cookie e rotas protegidas.
- **Chamados:** criação, listagem, detalhe, comentários públicos e notas internas (invisíveis ao solicitante). Cada solicitante só enxerga os próprios chamados.
- **Catálogo de serviços:** o admin cria serviços com formulários dinâmicos; o servidor valida as respostas e serviços desativados não aceitam novos chamados.
- **Anexos:** upload na abertura do chamado e nos comentários (até 3 arquivos de 5 MB: png, jpg, pdf, txt, log, csv). O servidor valida extensão e assinatura do conteúdo, grava com nome aleatório fora de `public` e só entrega o download a quem pode ver o chamado; anexos de nota interna ficam restritos à equipe. Imagens (png/jpg) têm miniatura e visualização ampliada. Quem enviou o arquivo, ou a equipe, pode removê-lo (com confirmação), e a remoção aparece no histórico do chamado.
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
