import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { DOCUMENT_TYPES, type DocumentType } from "./documents.js";

const client = new Anthropic();

const SYSTEM = `Sei l'assistente di un'app che registra riunioni. Ricevi la trascrizione di un incontro, con i partecipanti indicati come "Partecipante A", "Partecipante B" e così via, e produci il documento richiesto in italiano, in Markdown. Basati solo su quanto detto nella trascrizione: non inventare nomi, date, numeri o decisioni. Se un'informazione utile manca, scrivi che non è emersa. Restituisci solo il documento, senza premesse.`;

export async function generateDocument(
  type: DocumentType,
  title: string,
  date: string,
  transcript: string,
): Promise<string> {
  const doc = DOCUMENT_TYPES[type];
  if (config.mockAi) return `# ${doc.label}\n\n_${title}, ${date}_\n\nDocumento di prova generato senza servizi esterni.`;

  const message = await client.beta.messages
    .stream({
      model: "claude-opus-5-5",
      max_tokens: 64000,
      output_config: { effort: "medium" },
      // Se il modello rifiuta la richiesta, l'API la ripete su un modello di riserva
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<trascrizione>\n${transcript}\n</trascrizione>\n\nTitolo dell'incontro: ${title}\nData: ${date}\n\nDocumento richiesto: ${doc.label}.\n${doc.instructions}`,
        },
      ],
    })
    .finalMessage();

  if (message.stop_reason === "refusal") throw new Error("Claude ha rifiutato di generare il documento");
  const text = message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  if (!text) throw new Error("Claude non ha restituito testo");
  return text;
}
