import { DOCUMENT_TYPES, type DocumentType } from "./documents.js";

/** Il testo che l'utente copia in Claude per ottenere il documento. */
export function buildPrompt(type: DocumentType, title: string, date: string, transcript: string) {
  const doc = DOCUMENT_TYPES[type];
  return `Ti incollo la trascrizione automatica di una riunione. Ogni riga riporta il minuto e quanto detto, senza indicare chi parla: se dal contesto si capisce chi interviene, puoi indicarlo, altrimenti non attribuire le frasi a nessuno. La trascrizione può contenere errori di riconoscimento: correggili quando il senso è chiaro.

Scrivi in italiano il documento richiesto, basandoti solo su quanto detto nella trascrizione: non inventare nomi, date, numeri o decisioni. Se un'informazione utile manca, scrivi che non è emersa. Restituisci solo il documento, senza premesse.

Titolo dell'incontro: ${title}
Data: ${date}

Documento richiesto: ${doc.label}.
${doc.instructions}

<trascrizione>
${transcript}
</trascrizione>`;
}
