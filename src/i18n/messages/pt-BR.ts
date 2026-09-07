/**
 * The source catalogue. `en.ts` is typed against this object, so adding a key
 * here without translating it there is a compile error rather than a string
 * that silently shows up in the wrong language.
 *
 * Values that need a number or a formatted amount are functions instead of
 * templates with placeholders: the compiler then checks the arguments too.
 */
export const ptBR = {
  common: {
    cancel: "Cancelar",
    save: "Salvar",
    saving: "Salvando…",
    saveChanges: "Salvar alterações",
    new: "Nova",
    select: "Selecione…",
    none: "—",
    wait: "Aguarde…",
    sessionExpired: "Sessão expirada. Entre novamente.",
    restore: "Restaurar",
  },

  nav: {
    summary: "Resumo",
    transactions: "Lançamentos",
    netWorth: "Patrimônio",
    settings: "Ajustes",
    newEntry: "Novo lançamento",
    main: "Navegação principal",
  },

  month: {
    previous: "Mês anterior",
    next: "Próximo mês",
    backToCurrent: "Voltar para o mês atual",
  },

  login: {
    title: "Entrar",
    tagline: "Para onde foi cada real deste mês.",
    email: "E-mail",
    emailPlaceholder: "voce@exemplo.com",
    password: "Senha",
    passwordHint: "Mínimo de 8 caracteres.",
    signIn: "Entrar",
    signUp: "Criar conta",
    noAccount: "Ainda não tenho conta",
    haveAccount: "Já tenho conta, quero entrar",
    invalidEmail: "Informe um e-mail válido.",
    shortPassword: "A senha precisa de pelo menos 8 caracteres.",
    badCredentials: "E-mail ou senha incorretos.",
    signUpFailed: "Não foi possível criar a conta. Tente outro e-mail.",
    confirmEmail: "Conta criada. Confirme o e-mail para entrar.",
    linkProblem:
      "O link de confirmação expirou ou já foi usado. Entre com e-mail e senha.",
    emailNotConfirmed:
      "Esta conta existe, mas o e-mail ainda não foi confirmado. A senha está certa.",
    resendConfirmation: "Reenviar e-mail de confirmação",
    confirmationResent: "E-mail de confirmação enviado. Confira sua caixa.",
    resendFailed: "Não foi possível reenviar o e-mail.",
    tooManyAttempts: "Tentativas demais. Espere um pouco e tente de novo.",
    tooManyEmails: "E-mails demais em pouco tempo. Tente de novo mais tarde.",
    accountExists: "Já existe uma conta com esse e-mail. Faça login.",
  },

  dashboard: {
    monthSpending: "Gastos do mês",
    income: "Entradas",
    leftOver: "Sobrou no mês",
    pace: "Ritmo do mês",
    paceSubtitle: (month: string) => `Acumulado dia a dia contra ${month}`,
    whereItWent: "Para onde foi",
    whereItWentSubtitle: "Toque numa categoria para abrir as subcategorias",
    emptyTitle: "Nada registrado ainda",
    emptyBody:
      "Cadastre o primeiro gasto e o painel começa a se preencher: comparativo com o mês passado, ranking de categorias e ritmo do mês.",
    emptyCta: "Registrar primeiro lançamento",
    invested: "Patrimônio investido",
    openNetWorth: "Abrir patrimônio",
  },

  delta: {
    noMovement: "sem movimento",
    sameAsLastMonth: "igual ao mês anterior",
    brandNew: "novo",
  },

  transactions: {
    title: "Lançamentos",
    outflow: "Saídas",
    inflow: "Entradas",
    emptyTitle: "Nenhum lançamento neste mês",
    emptyBody: "Registre um gasto ou uma entrada para começar.",
    emptyFiltered: "Nenhum gasto nessa categoria no período.",
    add: "Adicionar",
    removeFilter: "Remover filtro",
    transfer: "Transferência",
    transferTo: (account: string) => `${account} → destino`,
    noDescription: "Sem descrição",
    newTitle: "Novo lançamento",
    editTitle: "Editar lançamento",
    installmentNote: (number: number, total: number) =>
      `Parcela ${number} de ${total}. Alterações aqui valem só para esta parcela.`,
    deleteOne: "Excluir este lançamento",
    deleteGroup: (total: number) => `Excluir as ${total} parcelas`,
  },

  paymentMethods: {
    debit: "Débito",
    credit: "Crédito",
    pix: "Pix",
    cash: "Dinheiro",
    boleto: "Boleto",
    transfer: "Transferência",
    other: "Outra",
  },

  entryForm: {
    kindGroup: "Tipo de lançamento",
    expense: "Gasto",
    income: "Entrada",
    transfer: "Transferência",
    amount: "Valor",
    date: "Data",
    account: "Conta",
    sourceAccount: "Conta de origem",
    targetAccount: "Conta de destino",
    targetAccountHint: "Transferência entre suas contas não conta como gasto.",
    description: "Descrição",
    expensePlaceholder: "Almoço no centro",
    incomePlaceholder: "Salário de setembro",
    category: "Categoria",
    noCategory: "Sem categoria",
    subcategory: "Subcategoria",
    noSubcategory: "Sem subcategoria",
    noSubcategoriesHint: "Essa categoria ainda não tem subcategorias.",
    installments: "Parcelamento",
    oneOff: "À vista",
    oneOffHint: "Compra à vista.",
    installmentHint: (count: number, amount: string) =>
      `${count}x de ${amount}, uma por mês a partir da data acima.`,
    notes: "Observações",
    invalidAmount: "Informe um valor maior que zero.",
    invalidDate: "Data inválida.",
    pickAccount: "Escolha uma conta.",
    pickTargetAccount: "Escolha a conta de destino.",
    sameAccount: "A conta de destino precisa ser diferente da origem.",
    subcategoryNeedsCategory: "Escolha a categoria da subcategoria.",
    invalidSelection: "Seleção inválida.",
    invalidEntry: "Lançamento inválido.",
    transferShapeError:
      "Transferência precisa de duas contas diferentes e sem categoria.",
    subcategoryMismatch:
      "Essa subcategoria não pertence à categoria escolhida.",
    paymentMethod: "Forma de pagamento",
    noPaymentMethod: "Não informada",
    paymentMethodOnCard: "Compra no cartão é sempre crédito",
    creditNeedsCard:
      "Crédito só em conta do tipo cartão. Escolha o cartão ou outra forma de pagamento.",
    saveFailed: "Não foi possível salvar o lançamento.",
  },

  categories: {
    title: "Categorias",
    expenses: "Gastos",
    income: "Entradas",
    emptyTitle: "Nenhuma categoria",
    emptyBody:
      "Comece com o conjunto padrão, em português, e edite o que não servir.",
    emptyCta: "Criar categorias padrão",
    noSubcategories: "Sem subcategorias",
    subcategoryCount: (count: number) =>
      `${count} ${count === 1 ? "subcategoria" : "subcategorias"}`,
    newTitle: "Nova categoria",
    createCta: "Criar categoria",
    archivedNotice:
      "Categoria arquivada. Ela some dos formulários, mas os lançamentos antigos continuam ligados a ela.",
    subcategoriesTitle: "Subcategorias",
    subcategoriesSubtitle:
      "O nível fino: para onde o dinheiro dessa categoria realmente vai.",
    noSubcategoriesYet: "Nenhuma subcategoria ainda.",
    archivedCount: (count: number, names: string) =>
      `${count} arquivada(s): ${names}`,
    archiveCta: "Arquivar categoria",
    archiveNote:
      "Arquivar preserva o histórico. Excluir de vez não é possível enquanto houver lançamentos apontando para ela.",
    viewEntries: (name: string) => `Ver lançamentos de ${name}`,
    uncategorized: "Sem categoria",
    noSubcategoryBucket: "Sem subcategoria",
  },

  categoryForm: {
    name: "Nome",
    namePlaceholder: "Alimentação",
    kind: "Tipo",
    kindHint: "Define se a categoria aparece em gastos ou em entradas.",
    expense: "Gasto",
    income: "Entrada",
    description: "Descrição",
    descriptionPlaceholder: "O que entra aqui",
    color: "Cor",
    colorOption: (color: string) => `Cor ${color}`,
    image: "Imagem",
    imageHint: "PNG, JPG, WEBP ou SVG, até 2 MB.",
    removeImage: "Remover imagem atual",
    noImage: "sem imagem",
    nameRequired: "Dê um nome à categoria.",
    nameTooLong: "Nome muito longo.",
    invalidColor: "Cor inválida.",
    invalidCategory: "Categoria inválida.",
    duplicateCategory: "Já existe uma categoria com esse nome.",
    saveCategoryFailed: "Não foi possível salvar a categoria.",
  },

  subcategoryForm: {
    newTitle: "Nova subcategoria",
    inside: (name: string) => `Dentro de ${name}`,
    editIn: (name: string) => `Em ${name}`,
    createCta: "Criar subcategoria",
    namePlaceholder: "iFood",
    parent: "Categoria macro",
    parentHint: "A subcategoria vive dentro dessa categoria.",
    archivedNotice: "Subcategoria arquivada.",
    archiveCta: "Arquivar subcategoria",
    nameRequired: "Dê um nome à subcategoria.",
    invalidSubcategory: "Subcategoria inválida.",
    duplicateSubcategory: "Já existe uma subcategoria com esse nome.",
    saveSubcategoryFailed: "Não foi possível salvar a subcategoria.",
  },

  accounts: {
    title: "Contas",
    available: "Disponível",
    openBills: "Faturas em aberto",
    fundsTitle: "Contas e carteiras",
    cardsTitle: "Cartões de crédito",
    cardsSubtitle: "O valor é o quanto já foi gasto e ainda não foi pago",
    emptyTitle: "Nenhuma conta",
    emptyBody:
      "Cadastre onde seu dinheiro entra e sai: conta corrente, cartão, carteira.",
    emptyCta: "Criar conta",
    newTitle: "Nova conta",
    createCta: "Criar conta",
    currentBalance: (amount: string) => `Saldo atual: ${amount}`,
    archivedNotice: "Conta arquivada. Não aparece mais ao lançar.",
    archiveCta: "Arquivar conta",
    archiveNote: "Os lançamentos já feitos continuam intactos.",
    dueOn: (day: number) => `vence dia ${day}`,
    types: {
      checking: "Conta corrente",
      savings: "Poupança",
      credit_card: "Cartão de crédito",
      cash: "Dinheiro / carteira",
      investment: "Conta de investimento",
      other: "Outra",
    },
    form: {
      name: "Nome",
      namePlaceholder: "Nubank",
      kind: "Tipo",
      institution: "Instituição",
      institutionPlaceholder: "Nu Pagamentos",
      creditLimit: "Limite",
      closingDay: "Dia de fechamento",
      dueDay: "Dia de vencimento",
      openingBalance: "Saldo inicial",
      nameRequired: "Dê um nome à conta.",
      invalidDay: "Informe um dia entre 1 e 31.",
      invalidAccount: "Conta inválida.",
      duplicate: "Já existe uma conta com esse nome.",
      settlement: "Conta que paga a fatura",
      settlementHint: "Onde o dinheiro sai quando a fatura vence",
      noSettlement: "Não informada",
      invalidSettlement: "Escolha uma conta válida.",
      settlementCannotBeCard: "A conta que paga a fatura não pode ser outro cartão.",
      saveFailed: "Não foi possível salvar a conta.",
    },
  },

  investments: {
    title: "Patrimônio",
    newPosition: "Nova posição",
    total: "Total investido",
    noPositions: "Nenhuma posição cadastrada",
    positionCount: (count: number) =>
      `Somando ${count} ${count === 1 ? "posição" : "posições"}`,
    positionCountShort: (count: number) =>
      `${count} ${count === 1 ? "posição" : "posições"}`,
    evolution: "Evolução",
    evolutionSubtitle: "Cada ponto é uma vez em que você atualizou algum valor",
    netWorthTooltip: "Patrimônio",
    positions: "Posições",
    emptyTitle: "Nenhuma posição ainda",
    emptyBody:
      "Cadastre cada lugar onde seu dinheiro está: Nubank caixinha, ações, cripto. Depois é só atualizar os valores de tempos em tempos.",
    emptyCta: "Cadastrar posição",
    updateValues: "Atualizar valores",
    saveValues: "Salvar valores",
    editPosition: (name: string) => `Editar ${name}`,
    valueOf: (name: string) => `Valor de ${name}`,
    newTitle: "Nova posição",
    createCta: "Criar posição",
    archivedNotice: "Posição arquivada. Ela não entra mais no total.",
    archiveCta: "Arquivar posição",
    archiveNote: "O histórico de valores continua guardado.",
    form: {
      name: "Nome",
      namePlaceholder: "Nubank caixinha PJ",
      currentValue: "Valor atual",
      institution: "Instituição",
      institutionPlaceholder: "Nubank",
      kind: "Tipo",
      kindPlaceholder: "Renda fixa",
      notes: "Observações",
      nameRequired: "Dê um nome à posição.",
      invalidPosition: "Posição inválida.",
      duplicate: "Já existe uma posição com esse nome.",
      saveFailed: "Não foi possível salvar a posição.",
    },
  },

  settings: {
    title: "Ajustes",
    categories: "Categorias",
    categoriesDescription: "Macro categorias e subcategorias",
    accounts: "Contas e cartões",
    accountsDescription: "Onde o dinheiro entra e sai",
    language: "Idioma",
    languageDescription: "Idioma da interface",
    signedInAs: "Conectado como",
    signOut: "Sair",
    footer: "Julius · seus dados ficam no seu próprio Supabase",

    agentAccess: "Acesso para agentes",
    agentAccessDescription:
      "Um token deixa um assistente ler suas categorias e registrar lançamentos por você — por exemplo, a partir da foto de uma nota. Ele age como você e nada além disso.",
    mcpEndpoint: "Endereço do servidor MCP",
    tokenName: "Para que é este token",
    tokenNamePlaceholder: "Claude no celular",
    createToken: "Gerar token",
    tokenOnceWarning:
      "Copie agora: este token não aparece de novo. Se perder, gere outro e revogue este.",
    tokenLabel: "Token (para Claude Code e Desktop)",
    connectorUrl: "URL para o app do Claude no celular",
    connectorUrlNote:
      "No app, cole só a URL e deixe Client ID e Client Secret vazios. Ela carrega o token, então trate-a como senha.",
    copy: "Copiar",
    copied: "Copiado",
    tokenNameRequired: "Dê um nome ao token.",
    tokenFailed: "Não foi possível gerar o token.",
    revoke: "Revogar",
    removeToken: "Excluir",
    noTokens: "Nenhum token ainda.",
    tokenRevoked: "revogado",
    tokenNeverUsed: "nunca usado",
    tokenLastUsed: (when: string) => `usado ${when}`,
    tokenCreated: (when: string) => `criado ${when}`,
  },

  offline: {
    title: "Sem conexão",
    body: "O Julius precisa de internet para carregar seus lançamentos. Assim que a conexão voltar, é só puxar a tela para atualizar.",
  },

  meta: {
    description:
      "Controle de gastos, entradas e investimentos, com categorias em dois níveis.",
    shortcutName: "Novo lançamento",
    shortcutShortName: "Lançar",
  },

  charts: {
    day: (day: number) => `Dia ${day}`,
  },
};

/**
 * Deliberately not `as const`: literal types would force every other locale to
 * repeat the Portuguese strings verbatim. What we want checked is the shape --
 * the same keys, and the same arguments on the functions.
 */
export type Messages = typeof ptBR;
