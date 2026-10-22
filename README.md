# Registratore riunioni

Web app (PWA) per registrare riunioni dal cellulare o dal PC e ottenere automaticamente verbale, riassunto o documento tecnico.

## Come funziona

1. Premi **Registra**. L'audio viene caricato sul server a blocchi di 10 secondi mentre registri, così una connessione instabile non fa perdere la riunione.
2. Premi **Stop** e scegli quali documenti vuoi: verbale, riassunto, documento tecnico.
3. Il server trascrive l'audio in background con [Whisper](https://github.com/ggml-org/whisper.cpp), gratis e senza servizi esterni. Puoi chiudere l'app.
4. Nell'**Archivio**, per ogni documento: **Copia il testo per Claude** (trascrizione più istruzioni già pronte), **Apri Claude** e incolla, poi incolla la risposta nell'app per conservarla.

Nessun servizio a pagamento: la trascrizione gira sul server e il documento lo scrive Claude nella tua chat.

Su iPhone una web app smette di registrare se lo schermo si spegne: l'app chiede al telefono di tenere lo schermo acceso durante la registrazione, ma va lasciata in primo piano.

## Struttura

- `web/`: interfaccia React installabile come PWA (Vite + vite-plugin-pwa).
- `server/`: API Fastify, database SQLite, coda di trascrizione in background.
  - `documents.ts`: tipi di documento e relative istruzioni, da personalizzare.
  - `prompt.ts`: il testo da copiare in Claude.
  - `transcribe.ts`: trascrizione con whisper.cpp.

## Avvio in locale

```bash
brew install whisper-cpp ffmpeg   # su Mac; su Linux compila whisper.cpp e installa ffmpeg
mkdir -p models && curl -L -o models/ggml-small.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
cp .env.example .env   # oppure MOCK_TRANSCRIPTION=1 per provare senza Whisper
npm install
npm run dev            # interfaccia su http://localhost:5173, API su :3000
```

## Produzione

```bash
npm run build
npm start              # serve interfaccia e API sulla porta PORT
```

Serve un server sempre acceso con HTTPS (necessario per usare il microfono dal browser) e una cartella persistente per `DATA_DIR`.

Con Docker (Railway, VPS o server proprio):

```bash
docker build -t registratore-riunioni .
docker run -p 3000:3000 -v registratore-dati:/data --env-file .env registratore-riunioni
```

La cartella `/data` contiene database, audio e documenti: va montata su un disco persistente. L'immagine include whisper.cpp e il modello `small`; per una trascrizione più precisa ma più lenta usa `--build-arg WHISPER_MODEL=large-v3-turbo`.

## Tempi di trascrizione

Indicativamente, il modello `small` trascrive un'ora di audio in pochi minuti su un Mac con chip Apple, e in 15-30 minuti su un server con 4 core.
