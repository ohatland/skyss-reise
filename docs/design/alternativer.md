# Alternativer og kartlegging

Skissene ligger i [alternativer.html](alternativer.html). Kartleggingen ble godkjent 13. november 2026.

## Hva skjermene er til

Dette er innstillingsskjermer, ikke statusskjermer. Brukeren beskrev forskjellen slik: statusskjermene skal gi konkret informasjon ved ett raskt blikk, mens innstillingsskjermene skal vurderes nøye og kan ha mer informasjon og detaljer.

Bruksmåten er en kartleggingsøkt: finne så mange gode alternativer som mulig, lagre dem, og deretter ikke forholde seg til dem igjen. Forsiden viser så det raskeste alternativet akkurat nå.

## Kartlegging (godkjent)

### Oppsett

- Reisetype, fra, til og tidsrom.
- «Søk også via» er det eneste brukeren styrer: holdeplasser søket skal tvinges innom, som brikker. Det er slik båten og andre omveier kommer med.
- Søkemåtene er ikke valgbare. Appen bruker alle, og de forklares i én setning.
- Startknappen er fremhevet.

### Resultat

- Ett alternativ per rad: rutekjede, byttesteder, og tre tall (reisetid, antall bytter, gangavstand).
- Linjer som kjører samme strekning er slått sammen i én etappe («400, 410»).
- Gruppert etter siste bytte, fordi alternativer i samme gruppe ender på samme buss og derfor konkurrerer med hverandre.
- «Ny» markerer alternativer brukeren ikke hadde fra før.
- Avkrysning per rad, og én knapp for å lagre de valgte.
- Sjeldnere forslag ligger sammenslått nederst.
- «Søk via holdeplass» og «Bygg selv» for å legge til mer.

## Justere lagrede alternativer (godkjent 13. november 2026)

Tegnet før kartleggingen kom til, og godkjent som tegnet etterpå. Skjermene brukes sjelden, etter at kartleggingen er gjort.

- **Gangtid gjelder byttestedet,** ikke det enkelte alternativet. Brukeren setter den én gang, og den gjelder alle alternativer som bruker samme bytte.
- **Liste** per reisetype, med samme bryter som forsiden.
- **Redigere ett alternativ:** tabell med rute, strekning og gangtid. Gangtiden står på raden for bussen det byttes til.
- **Endre én etappe:** ruter som brikker, fra, til, og gangtid med Enturs anslag til sammenligning. «Går også her» foreslår andre linjer på samme strekning.

## Fra dør til dør (avgjort 13. november 2026)

- **Kartleggingen søker fra og til jobbadressen,** ikke fra en holdeplass. Entur tar da selv med gangen og velger holdeplass. Et slikt søk fant Blomsterdalen (linje 51 og 53, 10 minutter fra jobben), som brukeren ikke hadde nevnt.
- **Bare det periodebilletten dekker.** Billetten gjelder buss, bybane, båt og tog innenfor sonen. Søkene bruker `whiteListed: { authorities: ["SKY:Authority:SKY", "VYG:Authority:VYT"] }`, altså Skyss og Vy tog. Flybussen (NOR-WAY Bussekspress) er privat og skal aldri foreslås. Det er testet at dette fjerner FB50 fra forslagene. Sonegrensen kontrolleres ikke.
- Prøvekartleggingen under ble gjort fra Birkelandsskiftet, før dette ble avgjort, og må kjøres på nytt fra adressen.

## Datamodell som følger av dette

- En reisetype går mellom to steder, hjem og jobb.
- Et alternativ er kjeden mellom en holdeplass nær adressen og den andre enden av reisen.
- En forbindelse er en vei mellom adressen og en slik holdeplass: bare gange, eller en kort tur med for eksempel 57. Forbindelsene lagres per holdeplass og gjelder alle alternativer derfra.

- Et alternativ er en rekke etapper.
- En etappe har en fra-holdeplass, en til-holdeplass og én eller flere ruter. Brukeren bekreftet 13. november at en etappe kan ha flere ruter.
- En etappe kan også være gange mellom to holdeplasser.
- Forsiden viser bare den ruten som faktisk går først.

## Slik må kartleggingen søke

Funn fra prøvekartleggingen, Birkelandsskiftet til Krokåsskiftet, mandag 16. november 2026 kl. 14:30–16:50, rutetid:

- Vanlig søk fant 11 av 35 rutemønstre. Ett søk holder ikke.
- Bybanen til Sandslivegen kom først når 50E ble utelukket eller gange ble gjort billigere.
- Båten kom bare når søket ble tvunget via Strandkaiterminalen.
- Linje 53 via Gomarshaug kom først når både 50E og 51 ble utelukket.

Søkeoppsettene som ble brukt mot `trip` i reiseplanleggeren, alle med `numTripPatterns: 25` og `searchWindow: 20`, hvert 20. minutt:

| Oppsett | Parametre |
|---|---|
| Vanlig | ingen |
| Flere bytter | `maximumAdditionalTransfers: 3`, `transferPenalty: 0` |
| Mer gange | `walkReluctance: 1.5`, `maximumAdditionalTransfers: 2` |
| Uten raskeste linje | `banned: { lines: [...] }` |
| Via holdeplass | `via: [{ visit: { stopLocationIds: [...] } }]` |

Mønstre slås sammen når de har samme rekke av holdeplasser og bare linjen er ulik.

## Resultat av prøvekartleggingen

19 alternativer etter sammenslåing. De ni viktigste:

| Gruppe | Alternativ | Reisetid | Brukerens eksempel? |
|---|---|---|---|
| Via Storavatnet | 51, 50E → Dolvik → 23, 23E → Storavatnet → 400, 410 | 51–64 min | Nei |
| Via Storavatnet | 1 → Sandslivegen → 23, 23E → Storavatnet → 400, 410 | 50–67 min | Ja |
| Via Storavatnet | Gå til Kokstadskiftet → 23, 23E → Storavatnet → 400, 410 | 56–84 min | Ja |
| Via Storavatnet | 53 → Gomarshaug → 23E → Storavatnet → 400 | 72 min | Nei |
| Via Møhlenpris | 50E → Møhlenpris → 400, 410 | 57–69 min | Ja |
| Via Bergen busstasjon | 1, 51 → Bergen busstasjon → 400, 410 | 61–77 min | Nei |
| Via Bergen busstasjon | 1 → Lagunen → 67 → Bergen busstasjon → 410 | 60 min | Ja |
| Med båt | 50E → Festplassen → gå → 490 → Kleppestø → 400 | 79 min | Nei |
| Med båt | 1 → Byparken → gå → 490 → Kleppestø → 400 | 82–117 min | Ja |

Forbehold: én mandag ettermiddag, rutetid uten sanntid, og bare fra Birkelandsskiftet, ikke Grana.

## Første kartlegging i appen, fra jobbadressen

Kjørt 13. november 2026 for Fra jobb, mandag 16. november kl. 14:30–16:50, med 56 søk. Resultat: 37 alternativer, 65–104 minutter dør til dør.

- **For mange å vurdere.** Mange var samme reise med ulik vei fra jobben til første holdeplass: gå til Birkelandsskiftet, 57 fra Grana, eller 53 eller 56 fra Blomsterdalen. «50E → 400, 410 via Møhlenpris» fantes i tre utgaver.
- **Avgjort samme dag: de slås sammen.** Hvert alternativ står én gang og begynner på en holdeplass nær jobben. Veiene dit vises som en liten linje under («Fra jobb: gå 20 min · 53 fra Blomsterdalen · 57 fra Grana») og lagres for seg per holdeplass. Appen velger selv veien når brukeren skal reise. Etter sammenslåing: 21 alternativer.
- **Slik deles en reise:** holdeplassene brukeren kan gå rett til fra adressen, er ankere. Fra jobb kuttes reisen ved det siste kjøretøyet som tas fra et anker; til jobb ved det første som ender på et anker. Det før eller etter kuttet er veien til eller fra adressen.
- **Nye funn:** linje 53 og 56 fra Blomsterdalen til Birkelandsskiftet, linje 23 fra Bergen lufthavn, og båtlinjene 2075 og 2080 fra Flesland kai til Strandkaiterminalen. Periodebilletten gjelder på båt innenfor sonen, så de er med.
- **Sjeldne forslag** er de med flere enn tre bytter, eller som er mer enn halvannen gang så trege som det raskeste. Båt regnes aldri som sjelden bare fordi den er treg. Grensene er et forslag.
- **Forhåndsvalg:** første gang er alle som ikke er sjeldne, krysset av. Senere kartlegginger krysser av dem som allerede er lagret.
- **Birkelandsskiftet har to ID-er hos Entur:** `NSR:StopPlace:58537` fra adressesøket og `NSR:StopPlace:30168` i reiseforslagene. Kode som sammenligner holdeplasser, må ta høyde for det.

## Kartlegging for Til jobb

Kjørt 13. november 2026, mandag 16. november kl. 06:30–08:30, med 49 søk. Resultat: 34 alternativer, 67–105 minutter dør til dør.

- **Fortsatt mange.** To ting blåser opp listen. Det første er hjemmeenden: nesten alle reiser finnes både med 400 eller 410 direkte og med 403 til Kleppestø og 407 videre. Det andre er hvor brukeren går av: samme buss 51 står én gang med avstigning på Birkelandsskiftet og én gang på Blomsterdalen.
- **Avgjort 13. november 2026:** motoren behandler de lagrede alternativene som et nett av etapper og kombinerer dem selv. En etappe fra ett alternativ kan følges av en etappe fra et annet der de møtes. Ingen holdeplass passeres to ganger, og en reise har høyst fem kjøretøy. Konsekvensen er at appen kan vise en kombinasjon brukeren ikke har sett i listen.

## Gangtid ved bytte

Avgjort 13. november 2026 etter brukerens beskrivelse: 0:00 er riktig for det meste, særlig når neste buss går samme vei, men på Møhlenpris må man krysse veien, og det tar omtrent 30 sekunder med hard løping.

- **Gangtid gjelder per par av plattformer,** ikke per holdeplass. Samme holdeplass kan bety å bli stående eller å krysse veien.
- **Entur skiller dem allerede.** På Møhlenpris gir Entur 2:32 fra 50E til 400 eller 410 (annen plattform) og 0:00 fra 50E til linje 3 (samme plattform). På Bergen busstasjon gir den 1:33 til 2:51 avhengig av plattform.
- **Brukerens egen tid** settes på den ene plattformkombinasjonen og gjelder alle alternativer som bruker den. Å sette 0:30 på krysningen på Møhlenpris endrer ikke byttet til linje 3.
- **Redigeringsskjermen** viser bare gangtidene som hører til linjene i de to etappene. Er det flere, merkes de med plattformbokstaver, eller «samme plattform» og «annen plattform» der holdeplassen ikke har bokstaver.
- **Rekkefølge når motoren slår opp en gangtid:** brukerens tid for plattformparet, så Enturs tid for plattformparet, ellers 0.
- **Nye funn for morgenen:** Bybanen fra Sandslivegen til Bergen lufthavn (17 minutter å gå til jobben), linje 53 til Ådlandsflaten (11 minutter), og linje 24 via Sandeide.

## Bygg selv og endring av ruter

Laget 13. november 2026.

- **Bygg selv** legger til én etappe om gangen: fra-holdeplass, til-holdeplass, og så «Finn ruter» eller «Gå hit». Neste etappe starter der forrige sluttet. Appen slår opp hos Entur hvilke linjer som går direkte, og bruker holdeplassene Entur selv bruker i reiser.
- **Et egenbygd alternativ trenger ikke nå helt frem.** Siden appen kombinerer etapper selv, er også en delstrekning nyttig. Skjermen sier fra når kjeden ikke ender på den andre enden av reisen.
- **Starter alternativet på en holdeplass ingen vei fra jobben fører til,** henter appen gangtiden dit fra Entur og lagrer den som forbindelse.
- **Rutene på en etappe** endres ved å trykke på dem i alternativet. «Går også her» viser linjer Entur kjenner på strekningen. En etappe må ha minst én rute.
- **Oppslaget av direkte ruter er et vanlig søk som filtreres etterpå.** `maximumTransfers: 0` virker ikke: Entur svarer da med å gå hele veien.
- **Birkelandsskiftet har minst tre ID-er hos Entur:** `58537` fra holdeplassøket, `30168` for bussterminalen i reiser, og `30162` i gangsvaret. Derfor brukes alltid ID-ene fra reisesvarene i lagrede etapper.

## Senere forbedring

Kartleggingen bør vise hvor ofte hvert alternativ er raskest. Det lot seg ikke måle med Enturs søk alene: alternativene via Storavatnet og Møhlenpris ender på samme 400 eller 410 og kommer frem samtidig, og Entur viser bare noen av dem per søk. Tallet må regnes med appens egen motor, den samme som driver forsiden.

## Avvist eller erstattet

- «Funnet N ganger» per alternativ. Tallet sa mest om hvordan Entur siler forslag.
- Avkrysning av søkemåter i oppsettet.
- En egen skjerm «Nytt alternativ» med forslag fra Entur og «Fest»-knapp. Den er erstattet av kartleggingen.
