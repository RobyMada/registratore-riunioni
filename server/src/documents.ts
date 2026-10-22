export const DOCUMENT_TYPES = {
  verbale: {
    label: "Verbale della riunione",
    instructions: `Redigi il verbale formale della riunione. Includi: data, partecipanti (usa i nomi se emergono dalla conversazione, altrimenti "Partecipante A", "Partecipante B"), ordine del giorno ricostruito, sintesi della discussione per punto, decisioni prese, azioni da svolgere con responsabile e scadenza quando indicati, punti rimasti aperti.`,
  },
  riassunto: {
    label: "Riassunto dell'incontro",
    instructions: `Scrivi un riassunto chiaro e breve dell'incontro, leggibile in due minuti: contesto, temi principali, conclusioni e prossimi passi.`,
  },
  tecnico: {
    label: "Documento tecnico",
    instructions: `Ricava dalla conversazione un documento tecnico strutturato: obiettivo, requisiti, soluzioni o architetture discusse con pro e contro, scelte tecniche fatte e motivazioni, rischi, questioni aperte e attività successive. Riporta fedelmente dati, numeri e nomi tecnici citati.`,
  },
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && value in DOCUMENT_TYPES;
}
