# Mettere online l'app gratis (Oracle Cloud + Tailscale)

Tempo: circa un'ora, quasi tutta attesa. Costo: zero.

## 1. Crea l'account Oracle Cloud

1. Vai su <https://www.oracle.com/cloud/free/> e scegli **Start for free**.
2. Come "Home Region" scegli una regione vicina, per esempio **Italy Northwest (Milan)**. Non si può cambiare dopo.
3. Ti viene chiesta una carta di credito: serve solo come verifica. Finché usi risorse "Always Free" non paghi nulla.

## 2. Crea il server

1. Dalla console: **Compute → Instances → Create instance**.
2. **Image**: Canonical Ubuntu 24.04.
3. **Shape**: *Change shape → Ampere → VM.Standard.A1.Flex*, con **4 OCPU e 24 GB** di memoria. È tutto incluso nel piano gratuito.
   Se compare "Out of capacity", riprova più tardi o con un'altra *Availability domain*. È normale con il piano gratuito.
4. **Add SSH keys**: scegli *Generate a key pair for me* e scarica la chiave privata (file `.key`).
5. **Create**. Dopo un paio di minuti annota il **Public IP address**.

Non serve aprire porte: l'indirizzo HTTPS lo fornisce Tailscale.

## 3. Crea l'account Tailscale

Vai su <https://login.tailscale.com/start> e accedi, per esempio con Google o GitHub. Il piano personale è gratuito.

## 4. Installa l'app

Dal Mac, nel Terminale (sostituisci il percorso della chiave e l'IP):

```bash
chmod 600 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@IP_DEL_SERVER
```

Poi, sul server:

```bash
curl -fsSL https://raw.githubusercontent.com/RobyMada/registratore-riunioni/main/deploy/oracle-setup.sh | bash
```

Lo script:

- installa Docker;
- scarica l'app e genera la password di accesso, **annotala**;
- costruisce l'immagine con Whisper (10-20 minuti);
- avvia l'app, che riparte da sola se il server si riavvia.

Verso la fine stampa due link Tailscale:

1. il primo serve ad **aggiungere il server al tuo account**: aprilo e conferma;
2. il secondo serve ad **abilitare Funnel**, cioè l'accesso da internet: aprilo e conferma.

Alla fine compare l'indirizzo dell'app, del tipo `https://nome-server.tuo-account.ts.net`.

## 5. Installa l'app sul telefono

1. Apri l'indirizzo con Safari (iPhone) o Chrome (Android).
2. Inserisci la password.
3. **Condividi → Aggiungi alla schermata Home** (iPhone) oppure **⋮ → Installa app** (Android).

Sul PC basta aprire lo stesso indirizzo nel browser.

## Aggiornare l'app

Quando ci sono modifiche nuove, rientra sul server con `ssh` e rilancia lo stesso comando del punto 4. I dati restano.

## Comandi utili sul server

```bash
sudo docker logs -f registratore-riunioni    # vedere cosa sta facendo
sudo docker restart registratore-riunioni    # riavviare l'app
tailscale funnel status                      # vedere l'indirizzo pubblico
```
