# Registratore riunioni

Web app (PWA) per registrare riunioni dal cellulare o dal PC e ottenere automaticamente verbale, riassunto o documento tecnico.

## Come funziona

1. Premi **Registra**. L'audio viene caricato sul server a blocchi di 10 secondi mentre registri, così una connessione instabile non fa perdere la riunione.
2. Premi **Stop** e scegli quali documenti generare.
3. Il server, in background, trascrive l'audio separando chi parla (AssemblyAI) e genera i documenti con Claude. Puoi chiudere l'app: quando i documenti sono pronti compaiono nell'**Archivio** e, se l'app è aperta, ricevi una notifica.

Su iPhone una web app smette di registrare se lo schermo si spegne: l'app chiede al telefono di tenere lo schermo acceso durante la registrazione, ma va lasciata in primo piano.

## Struttura

- `web/`: interfaccia React installabile come PWA (Vite + vite-plugin-pwa).
- `server/`: API Fastify, database SQLite, coda di elaborazione in background.
  - `documents.ts`: tipi di documento e relative istruzioni, da personalizzare.
  - `transcribe.ts`: trascrizione con AssemblyAI.
  - `generate.ts`: generazione con Claude.

## Avvio in locale

```bash
cp .env.example .env   # inserisci le chiavi, oppure MOCK_AI=1 per provare senza servizi esterni
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

La cartella `/data` contiene database, audio e documenti: va montata su un disco persistente.
