import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_PASSWORD = "demo1234";

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Empresa Demo", slug: "demo" },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const users = [
    { name: "Ana Admin", email: "admin@demo.com", role: "ADMIN" },
    { name: "Carlos Agente", email: "agente@demo.com", role: "AGENT" },
    { name: "Sara Solicitante", email: "solicitante@demo.com", role: "REQUESTER" },
  ] as const;

  const created = [];
  for (const u of users) {
    created.push(
      await prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name, role: u.role, passwordHash },
        create: { ...u, passwordHash, organizationId: org.id },
      }),
    );
  }
  const [admin, agent, requester] = created;

  console.log(`Seed ok: ${users.length} usuários na organização "${org.name}".`);

  // Catálogo de serviços. `update: {}` preserva o que o admin editar depois.
  const catalog = [
    {
      name: "Acesso a sistema",
      description: "Pedir ou alterar acesso a ERP, CRM, intranet e outros.",
      defaultPriority: "MEDIUM",
      fields: [
        {
          key: "sistema",
          label: "Sistema",
          type: "SELECT",
          required: true,
          options: ["ERP", "CRM", "Intranet", "E-mail"],
        },
        {
          key: "nivel",
          label: "Nível de acesso",
          type: "SELECT",
          required: true,
          options: ["Leitura", "Escrita", "Administrador"],
        },
        {
          key: "justificativa",
          label: "Justificativa",
          type: "TEXTAREA",
          required: true,
          options: [],
        },
        {
          key: "prazo",
          label: "Prazo desejado",
          type: "DATE",
          required: false,
          options: [],
        },
      ],
    },
    {
      name: "Novo equipamento",
      description: "Notebook, monitor, periféricos e outros equipamentos.",
      defaultPriority: "LOW",
      fields: [
        {
          key: "equipamento",
          label: "Equipamento",
          type: "SELECT",
          required: true,
          options: ["Notebook", "Monitor", "Teclado e mouse", "Headset"],
        },
        {
          key: "quantidade",
          label: "Quantidade",
          type: "NUMBER",
          required: true,
          options: [],
        },
        {
          key: "centro_custo",
          label: "Centro de custo",
          type: "TEXT",
          required: false,
          options: [],
        },
      ],
    },
    {
      name: "Problema de rede ou VPN",
      description: "Internet lenta, queda de conexão ou VPN que não conecta.",
      defaultPriority: "HIGH",
      fields: [
        {
          key: "local",
          label: "Onde você está?",
          type: "SELECT",
          required: true,
          options: ["Escritório", "Home office"],
        },
        {
          key: "erro",
          label: "Mensagem de erro",
          type: "TEXT",
          required: false,
          options: [],
        },
        {
          key: "desde",
          label: "Desde quando acontece",
          type: "DATE",
          required: false,
          options: [],
        },
      ],
    },
  ] as const;

  for (const s of catalog) {
    await prisma.service.upsert({
      where: { organizationId_name: { organizationId: org.id, name: s.name } },
      update: {},
      create: {
        name: s.name,
        description: s.description,
        defaultPriority: s.defaultPriority,
        fields: s.fields.map((f) => ({ ...f, options: [...f.options] })),
        organizationId: org.id,
      },
    });
  }
  console.log(`Seed ok: ${catalog.length} serviços no catálogo.`);

  // Chamados de exemplo: só se a organização ainda não tiver nenhum,
  // para o seed poder rodar de novo sem duplicar nem sobrescrever dados.
  const existing = await prisma.ticket.count({
    where: { organizationId: org.id },
  });
  if (existing > 0) {
    console.log(`Chamados já existem (${existing}); exemplos não recriados.`);
    return;
  }

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

  const samples = [
    {
      title: "Não consigo acessar meu e-mail corporativo",
      description:
        "Desde cedo aparece 'senha incorreta' no Outlook, mas a senha é a mesma de sempre.",
      status: "OPEN",
      priority: "HIGH",
      createdAt: hoursAgo(2),
      comments: [],
    },
    {
      title: "Impressora do 3º andar não imprime",
      description:
        "A fila de impressão trava no documento e ninguém do setor consegue imprimir.",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      assigneeId: agent.id,
      createdAt: hoursAgo(26),
      comments: [
        { authorId: agent.id, body: "Já estou verificando o spooler do servidor." },
        {
          authorId: agent.id,
          body: "Suspeita de driver desatualizado após a última atualização.",
          internal: true,
        },
      ],
    },
    {
      title: "Solicitação de acesso à pasta Financeiro",
      description:
        "Preciso de acesso de leitura à pasta Financeiro para o fechamento do mês.",
      status: "WAITING",
      priority: "LOW",
      assigneeId: admin.id,
      createdAt: hoursAgo(50),
      comments: [
        {
          authorId: admin.id,
          body: "Preciso da aprovação do gestor da área antes de liberar.",
        },
      ],
    },
    {
      title: "VPN desconecta a cada 10 minutos",
      description:
        "Trabalhando em home office, a VPN cai sozinha e perco a sessão dos sistemas.",
      status: "RESOLVED",
      priority: "HIGH",
      assigneeId: agent.id,
      createdAt: hoursAgo(120),
      resolvedAt: hoursAgo(96),
      comments: [
        {
          authorId: agent.id,
          body: "Atualizei o cliente de VPN para a versão mais recente. Pode testar?",
        },
        { authorId: requester.id, body: "Funcionou, obrigada!" },
      ],
    },
    {
      title: "Instalar o Visual Studio Code no meu computador",
      description: "Preciso do VS Code para as atividades do novo projeto.",
      status: "CLOSED",
      priority: "LOW",
      assigneeId: agent.id,
      createdAt: hoursAgo(200),
      resolvedAt: hoursAgo(190),
      comments: [],
    },
    {
      title: "Servidor de arquivos fora do ar",
      description:
        "Ninguém do departamento consegue abrir os arquivos compartilhados.",
      status: "OPEN",
      priority: "CRITICAL",
      requesterId: admin.id,
      createdAt: hoursAgo(1),
      comments: [],
    },
  ] as const;

  for (const s of samples) {
    const { comments, ...ticket } = s;
    await prisma.ticket.create({
      data: {
        organizationId: org.id,
        requesterId: requester.id,
        ...ticket,
        comments: {
          create: comments.map((c, i) => ({
            ...c,
            createdAt: new Date(s.createdAt.getTime() + (i + 1) * 3_600_000),
          })),
        },
      },
    });
  }

  console.log(`Seed ok: ${samples.length} chamados de exemplo criados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
