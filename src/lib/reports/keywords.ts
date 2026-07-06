// Keywords do funil E0-E8 — porta do framework Python (COLT junho/2026).
// A fonte de verdade em produção é a tabela report_keywords (seed = estes
// valores, sem os termos exclusivos da COLT); este default é o fallback.

export type ReportKeywords = {
  E1: string[];
  E2: string[];
  E3: string[];
  E4: string[];
  E5_TENTOU: string[];
  E5_AGENDOU: string[];
  E5_PEDIU_DADOS: string[];
  E5_VALIDANDO: string[];
  E6: string[];
  E7: string[];
  E8: string[];
};

export const KEYWORD_STAGES = [
  "E1",
  "E2",
  "E3",
  "E4",
  "E5_TENTOU",
  "E5_AGENDOU",
  "E5_PEDIU_DADOS",
  "E5_VALIDANDO",
  "E6",
  "E7",
  "E8",
] as const;

export const DEFAULT_KEYWORDS: ReportKeywords = {
  E1: ["primeira vez", "já é nosso paciente", "com quem eu falo", "como posso te chamar", "tudo bem", "olá", "ola", "oi tudo", "que bom ter você", "bem-vindo"],
  E2: ["o que mais te incomoda", "mastigar", "mastigação", "mastigacao", "vergonha de sorrir", "aparência dos dentes", "falta de dentes", "dificuldade para comer", "o que te trouxe", "qual o seu interesse", "me conta", "dificuldade", "incômodo", "incomodo", "estética", "dentes"],
  E3: ["adiar", "só piora", "so piora", "piora", "jantar com amigos", "fotos de família", "aproveitar a vida", "entendo como", "entendo perfeitamente", "muitos pacientes chegam", "impede", "limita", "prejudica", "poxa"],
  E4: ["agenda dela é muito disputada", "agenda da clínica é muito disputada", "vaga prioritária", "prioridade", "avaliação", "avaliacao", "especialista", "direito de sorrir", "tenta imaginar", "daqui a uns dias", "minha palavra", "se eu conseguisse", "você me daria", "sua palavra"],
  E5_TENTOU: ["agenda da clínica", "separei as duas melhores", "opção 1", "opcao 1", "opção 2", "opcao 2", "🗓", "qual fica melhor", "horário disponível", "verificar_disponibilidade", "vagas que surgiram", "melhores vagas", "horario", "horário", "data disponível"],
  E5_AGENDOU: ["agendamento confirmado", "confirmado com sucesso", "ficou agendado", "ficou marcado", "sua consulta", "agendado pela ia", "te esperamos", "estamos te esperando", "vaga confirmada", "agendado com sucesso", "agendamento realizado"],
  E5_PEDIU_DADOS: ["nome completo", "data de nascimento", "cpf", "pra confirmar", "para confirmar", "também envie", "tambem envie", "completar o cadastro", "pra completar", "me manda seu nome", "me envia seu nome", "seus dados", "seu nome completo", "envie seu nome"],
  E5_VALIDANDO: ["realizar_agendamento", "realizando o agend", "processando", "verificando os seus dados", "verificar os dados", "verificando os dados", "um momento", "já estou realizando", "estou realizando", "analisando os dados", "vou confirmar"],
  E6: ["clínica agradece", "transformar seu sorriso", "ficou mais alguma dúvida", "finalizar atendimento", "tchau", "até mais", "obrigada pela confiança", "até logo", "ate logo"],
  E7: ["transferir_atendimento", "transferindo para", "passar seu contato", "vou passar para", "instabilidade", "transferir", "passar o bastão"],
  E8: ["melhoria_banco_conhecimento", "banco de conhecimento", "confirmar esse detalhe", "assessoria da clínica", "informação imprecisa", "excelente pergunta"],
};
