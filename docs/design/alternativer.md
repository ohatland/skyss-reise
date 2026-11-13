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
- **Bare Skyss-linjer.** Søkene bruker `whiteListed: { authorities: ["SKY:Authority:SKY"] }`. Flybussen (NOR-WAY Bussekspress) er ikke med i periodebilletten og skal aldri foreslås. Det er testet at dette fjerner FB50 fra forslagene.
- Prøvekartleggingen under ble gjort fra Birkelandsskiftet, før dette ble avgjort, og må kjøres på nytt fra adressen.

## Datamodell som følger av dette

- En reisetype går mellom to steder, hjem og jobb. Hvert sted har holdeplassene brukeren bruker, med gangtid til hver.

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

## Senere forbedring

Kartleggingen bør vise hvor ofte hvert alternativ er raskest. Det lot seg ikke måle med Enturs søk alene: alternativene via Storavatnet og Møhlenpris ender på samme 400 eller 410 og kommer frem samtidig, og Entur viser bare noen av dem per søk. Tallet må regnes med appens egen motor, den samme som driver forsiden.

## Avvist eller erstattet

- «Funnet N ganger» per alternativ. Tallet sa mest om hvordan Entur siler forslag.
- Avkrysning av søkemåter i oppsettet.
- En egen skjerm «Nytt alternativ» med forslag fra Entur og «Fest»-knapp. Den er erstattet av kartleggingen.
