# Om bord-skjermen

Godkjent 13. november 2026, og utvidet 14. november 2026 med spørsmålene, «Vis flere» og knappen «Jeg har gått av». Skissen ligger i [om-bord.html](om-bord.html).

## Hva som er viktigst

To ting skal være lette å se, og ingenting annet skal konkurrere med dem:

1. Når brukeren er fremme ved sluttholdeplassen.
2. Hvor god margin det er på hvert bytte.

Den første skissen ble avvist som kaotisk fordi den hadde mange fokuspunkter. Regelen under er derfor at bare disse to tallene fremheves.

## Regler

- **Overskrift:** «Du er på {linje} mot {destinasjon}», tydelig, øverst.
- **Ett kort per alternativ.** Alle kortene har samme oppbygning. Det anbefalte står øverst og skiller seg bare ut med en svak bakgrunn.
- **Ankomsttid** står stort i kortet, i timer og minutter.
- **Byttene** står i en tabell med tre kolonner: rute, holdeplass og overgangstid. Én rad per bytte.
- **Overgangstid** er marginen etter gangtid, vist med sekunder (`4:00`). Det er det eneste stedet sekunder vises.
- **Farge på overgangstiden** erstatter ord som trygg, knapp og tapt: grønn over 3:00, gul fra 0:00 til 3:00, rød med minustegn under 0:00.
- **Fargeverdier:** i mørk modus `#97c459`, `#ef9f27` og `#f09595` (godkjent som de er). I lys modus `#15803d`, `#a16207` og `#dc2626` med halvfet skrift. De første lyse fargene ble avvist fordi kontrasten var for dårlig.
- **Plattform** står sammen med holdeplassnavnet der den finnes.
- **Kolonneoverskriftene** («Rute», «Holdeplass», «Overgangstid») står bare i det første kortet.
- **«Fremme {sluttstopp}»** står bare i det første kortet når alle alternativene ender på samme holdeplass. Ender de på ulike holdeplasser, står den i alle kortene.
- **Nederst:** en flaggknapp for «merk» og knappen «Jeg har gått av», begge nedtonet. Knappen het «Jeg har byttet» fram til 14. november 2026, se «Skjermen» under.

## Dør til dør (avgjort 13. november 2026)

- **Til jobb er ankomsttiden «Fremme jobb»,** med gangen fra siste holdeplass regnet inn. Kortene sorteres på den.
- **Gangen er siste rad** i tabellen: «Gå», «fra {holdeplass}» og gangtiden i minutter, uten sekunder og uten farge.
- Siden alle alternativer da ender på jobben, står «Fremme jobb» bare i det første kortet. Regelen om flere sluttstopp gjelder fortsatt hvis en reisetype ender på holdeplasser uten et felles sted bak.
- Fra jobb ender på Krokåsskiftet, og ankomsttiden gjelder holdeplassen inntil gangtid hjem er lagt inn.

## Bevisst utelatt

- Klokken.
- «Gå av om x min».
- Avgangstiden for bussen det byttes til.
- Forsinkelsen på bussen brukeren sitter på. Den er regnet inn i overgangstidene.
- Linjen «oppdatert for x s siden».

## Ikke avgjort

- **Sortering og fargegrenser** er bekreftet 13. november 2026: kortene sorteres etter ankomsttid, og overgangstiden er grønn over 3:00, gul fra 0:00 til 3:00 og rød under 0:00.
- **De nye fargene i lys modus** er ikke sett av brukeren ennå.
- **Når et bytte ryker** (avgjort 13. november 2026): er brukeren mindre enn ett minutt for sen, står avgangen fortsatt i kortet med rød overgangstid, og en liten linje under tabellen sier når brukeren er fremme med neste avgang («Rekker du den ikke: fremme 08:29»). Er brukeren mer enn ett minutt for sen, bytter kortet til neste avgang med ny ankomsttid og overgangstid.
- **Trafikkbildet** er avgjort i [trafikkbilde.md](trafikkbilde.md): en kølinje under overskriften når det er kø, og «kø» etter ankomsttiden på kortene som må gjennom den.

## Avgjort 14. november 2026

Avgjort av brukeren etter at logikken for om bord var bygget og kjørt mot Entur. Logikken ligger i `src/onboard`.

### Planen

- **Planen starter når brukeren sier at han har gått om bord.** Appen vet da holdeplassen han gikk på, kjøretøyet (turen hos Entur) og linjen.
- **Aktiv plan er den beste reisen videre:** tidligst fremme dør til dør blant reisene der hvert bytte har minst ett minutt i overgangstid. Med brukerens ord: «den raskeste som har en akseptabel margin på overgang (typisk 1+ min)». Grensen er `PLAN_MIN_MARGIN_SECONDS`.
- **Planen regnes på nytt ved hver oppdatering,** men appen holder på den, se «Hold på planen» under.
- **Er den første avgangen videre for knapp,** kan planen være en senere avgang samme vei. Den knappe reisen står da som et eget kort under planen.
- **Finnes ingen reise med minst ett minutt på alle bytter,** er planen den som er tidligst fremme uten tapt bytte. Finnes heller ikke det, er planen den som er tidligst fremme.
- **Planen står øverst** og skiller seg bare ut med den svake bakgrunnen. Ordet «Planen» står ikke på kortet; brukeren så det i skissen 14. november 2026 og svarte: «Fjern ordet Planen». De andre kortene står under, sortert på ankomst. Et kort som er tidligere fremme enn planen, men har et for knapt bytte, står dermed under planen.

### Hold på planen

Avgjort etter at en kjøring mot Entur viste at planen skiftet tre ganger på 16 minutter. På spørsmålet «Skal appen holde på planen til en annen reise er tidligere fremme eller planen ikke holder?» svarte brukeren: «Ja, hold på planen».

- **Appen holder på planen den har valgt** så lenge hvert bytte i den har minst ett minutt (`PLAN_MIN_MARGIN_SECONDS`).
- **Den bytter plan bare i to tilfeller:**
  - En annen reise med minst ett minutt på alle bytter er tidligere fremme dør til dør, regnet i hele minutter slik tiden vises. 16:34:59 er tidligere enn 16:35:00; 16:35:00 og 16:35:59 er samme tid.
  - Planen holder ikke lenger, fordi et bytte i den har falt under ett minutt, eller fordi kjøretøyet er innstilt eller har gått.
- **To reiser som er fremme i samme minutt,** bytter altså ikke plass øverst fordi marginene flytter seg. Det gjelder også to avganger samme vei.
- **De andre kortene kan bytte rekkefølge** under planen.
- **En plan som har mistet plassen, får den ikke tilbake** fordi den holder igjen. Den må være et helt minutt tidligere fremme.
- **Planen følger med når brukeren bytter kjøretøy** slik planen sa: resten av planen er da planen. Går brukeren på et kjøretøy som ikke var i planen, velges en ny.
- *Tolkning, ikke brukerens ord:* når ingen reise har ett minutt på alle bytter, holdes planen på samme måte så lenge ingen bytter i den er tapt og ingen annen slik reise er et helt minutt tidligere fremme. Kommer det en reise med ett minutt på alle bytter, blir den planen.

### Kort skal ikke forsvinne og komme tilbake

Brukerens ord: «selv om en overgang havner under ett minutt, eller ligger litt på minussiden, vil jeg ikke at de skal forsvinne, for å så komme tilbake igjen hvis det blir litt bedre tid på overgangen, men rekkefølgen kan endres».

*Tolkningen under er lagt fram for brukeren uten innvendinger, men er ikke godkjent ord for ord:*

- **Et kort blir stående** selv om et bytte faller under ett minutt eller går litt i minus, med gul eller rød overgangstid som før, og «Rekker du den ikke: fremme HH:MM» på det røde. Det er da ikke planen; planen flytter seg etter regelen over, og det knappe kortet står under.
- **Kortet fjernes først når et bytte er tapt med mer enn tre minutter.** Grensen var først ett minutt. I prøven mot Entur 14. november 2026 sto et kort rødt i fire minutter, ble fjernet og kom tilbake seks minutter senere med 0:17. Brukeren ble spurt «Skal et kort bli stående til byttet er tapt med mer enn tre minutter, ikke ett?» og svarte: «Ja, tre minutter».
- **Et kort som er fjernet, kommer ikke tilbake før overgangstiden er 0:00 eller bedre.** Mellom −3:00 og 0:00 skjer det ingenting, så kortet ikke blinker ut og inn rundt grensen.
- **Appen husker hvilke bytter som er gitt opp** i løpet av reisen (`PlanMemory` i økten).
- Regelen gjelder bytter som har vært vist. Et bytte som første gang sees mellom −1:00 og 0:00, vises i rødt. *Tolkning, ikke brukerens ord:* et bytte som første gang sees tapt med mer enn ett minutt, blir ikke et nytt rødt kort, selv om det er under tre minutter.

«Hold på planen» gjelder bare om bord. «Kort skal ikke forsvinne og komme tilbake» gjelder også forsiden, etter at brukeren svarte «Ja, også forsiden» samme kveld; se [for-avreise.md](for-avreise.md).

### Hvilke kort som vises

- **Ett kort per siste kjøretøy,** som på forsiden. Reiser som ender på samme kjøretøy, er ett kort, og de andre ligger bak kortet.
- **Ingen kort skjules fordi et annet er bedre.** Forsidens regel om kort som et annet kort slår, gjelder ikke om bord.
- **Kort som er fremme mer enn 30 minutter etter planen,** ligger bak «Vis flere».
- **Regelen om tapt bytte gjelder som før** for kortene som vises: rødt mens brukeren er under ett minutt for sen, og inntil tre minutter for et bytte som har vært vist, med «Rekker du den ikke: fremme HH:MM».
- **«Rekker du den ikke» regnes fra neste mulige reise videre uansett vei,** også gange, ikke bare neste avgang på samme vei. Tiden kan derfor være tidligere enn kortets egen ankomst.

### Gått av og byttet

- **Appen spør brukeren.** Brukeren skal ikke måtte huske å si fra.
- **«Gikk du av på {holdeplass}?»** når kjøretøyet har kommet til holdeplassen der planen sier bytte, eller der reisen ender. Spørsmålet står til det er besvart, også etter at kjøretøyet har kjørt videre.
  - Ja: brukeren venter på holdeplassen, og kortene gjelder reisene videre derfra.
  - Nei: brukeren er fortsatt om bord, og planen regnes fra kjøretøyets holdeplasser videre. Appen spør ikke mer om den holdeplassen.
- **«Er du på {linje} nå?»** når neste kjøretøy i planen har gått fra holdeplassen. Det spørres også når det første spørsmålet ikke er besvart, siden et ja svarer på begge.
  - Ja: appen følger det nye kjøretøyet fra holdeplassen der brukeren gikk på.
  - Nei: brukeren venter fortsatt på holdeplassen. Var det ikke kjent om han gikk av, spør appen om det.
- **Svarene er hendelser med kilde:** brukeren, eller appen selv. En automatisk gjenkjenning kan dermed svare på de samme spørsmålene.

### GPS og hastighet

Retningen er avgjort. Gjenkjenningen bygges når appen kjører på telefonen.

- **Appen skal helst finne svarene selv.** Den sammenligner telefonens posisjon med kjøretøyets.
- **Hastighet viser overgangen fra buss, båt eller bane til gange.** Forskjellen er tydelig, og hastighet virker også der kjøretøyet ikke melder posisjon.
- **Er appen usikker, spør den.**
- **GPS brukes bare under en aktiv reise,** som avgjort tidligere.
- Enturs posisjonstjeneste ble sjekket 14. november 2026 ca. 17:30: `https://api.entur.io/realtime/v2/vehicles/graphql` med `vehicles(codespaceId: "SKY")` ga 890 kjøretøy med `location`, `lastUpdated` og `serviceJourney { id }`. 323 var oppdatert siste to minutter, blant dem 400, 403, 50E, 51, 53, 57, 67 og 600. Bybanen (1) og båten (490) var ikke i uttrekket.

### Turrapporten

- **Rapporten sammenligner planen slik den sto da brukeren gikk om bord,** med det som faktisk skjedde: hvilke kjøretøy i planen som ble brukt, og hvilke bytter som ble gjort.
- **Siste anslag beholdes** ved siden av det første.

### Skjermen

Skissen ble lagt fram for brukeren 14. november 2026 med fire forslag. Svaret: «Fjern ordet Planen, ellers godkjent, gå videre».

- **Spørsmålet står i et felt mellom overskriften og kortene,** med knappene Ja og Nei. Det dekker ikke kortene, og kortene kan leses uten å svare.
- **«Jeg har gått av» erstatter «Jeg har byttet».** Appen spør selv om byttene i planen. Knappen er for når brukeren går av et annet sted enn planen sier. Han får da reisene videre fra holdeplassen kjøretøyet står ved, og sier fra når han er om bord på neste.
- **Den samme knappen er måten å avvike fra planen på.** Det er ingen egen funksjon for å følge et annet kort enn planen. Spørsmålene gjelder planen.
- **Et spørsmål som ikke besvares, blir stående** til neste spørsmål erstatter det eller reisen er over. Det faller ikke bort av seg selv.
- **Mens brukeren venter på en holdeplass,** er overskriften «Du venter på {holdeplass}», og kortene er som ellers.
- **«Vis flere ({antall})»** står under kortene når det finnes kort som er fremme mer enn 30 minutter etter planen.
- **Om bord startes fra forsiden** slik det ble bekreftet 13. november 2026, se [for-avreise.md](for-avreise.md): knappen nederst («Jeg er på 400 fra 07:09») gjelder det øverste kortet, og et trykk på et annet kort starter om bord for den bussen.

### Skjermen slik den er bygget

Bygget 14. november 2026 etter skissen og reglene over (`src/app/om-bord.tsx`, tekstene i `src/core/on-board.ts`, økten i `src/onboard/store.ts`). Punktene under er valg gjort under byggingen. *Ingen av dem er godkjent av brukeren ennå.*

- **Oppdatering hvert 20. sekund** mens skjermen er åpen og appen er i forgrunnen (`ON_BOARD_REFRESH_INTERVAL_MS`). Forsiden oppdaterer fortsatt hvert 30. sekund. Etter et svar eller «Jeg har gått av» oppdateres det med en gang.
- **Knappene nederst står fast nederst på skjermen,** både «Jeg er på …» på forsiden og «Jeg har gått av» om bord. De ruller ikke med kortene.
- **Hele kortet kan trykkes på forsiden,** også det øverste, som da gjør det samme som knappen.
- **Kortene om bord kan ikke trykkes.** Det er ingen funksjon for å følge et annet kort enn planen, se over.
- **Holdeplassen for «Jeg har gått av»** er den siste holdeplassen etter påstigning som kjøretøyet har kommet til, enten det står der eller har kjørt videre. For et kjøretøy uten sanntid går det etter tiden. Det lagres som et ja fra brukeren på «Gikk du av på {holdeplass}?», og det planen sa om bytte før, gjelder ikke lenger.
- **«Jeg har gått av» er nedtonet og gjør ingenting** før kjøretøyet har kommet til en holdeplass etter påstigning, og står ikke på skjermen mens brukeren venter på en holdeplass.
- **Reisen er over** når brukeren har gått av der planen ikke har noe kjøretøy videre: der reisen ender, eller der det bare er gange igjen. Appen går da tilbake til forsiden. Det gjelder også når det skjer med «Jeg har gått av».
- **Overskriften og spørsmålene har ikke plattform** («Du venter på Møhlenpris», «Gikk du av på Møhlenpris?»), slik skissen viser. Plattformen står i kortene.
- **«Typisk fremme N min senere» står ikke om bord.** Skissen har den ikke.
- **Spørsmålsfeltet har de blå fargene fra skissen,** lagt i temaet (`askBackground`, `askBorder`, `askText`).
- **Feil mot Entur** vises som på forsiden: «Fikk ikke oppdatert fra Entur. Tallene er fra HH:MM.» Et trykk på linjen prøver igjen.
- **Økten og turloggen ligger bare i minnet** så lenge appen er åpen. Lastes appen på nytt, er de borte, og skjermen går til forsiden.
- **Går brukeren av på en holdeplass som ikke er med i de lagrede alternativene,** har appen ingen reiser videre derfra. Avgjort av brukeren 14. november 2026 da skjermen ble bygget, med svaret «Avslutt-knapp»: skjermen sier «Ingen lagrede reiser videre fra {holdeplass}.» og har knappen «Avslutt reisen», som avslutter reisen og går tilbake til forsiden. Reservesøk hos Entur kommer senere. *Ordlyden i teksten og på knappen er min.*
- **Går brukeren tilbake til forsiden** (tilbakeknapp eller sveip), ligger økten fortsatt i minnet. Forsiden har da knappen «Tilbake til reisen» nederst, over knappen for det øverste kortet, så lenge reisen pågår. Avgjort av brukeren 15. november 2026 på spørsmålet «Skal jeg legge inn knappen «Tilbake til reisen» på forsiden?»: «Ja, legg inn». Et nytt trykk på et kort starter en ny reise og erstatter den som pågår. *Plasseringen og den svake bakgrunnen på knappen er min.*

### Ikke avgjort

- **Hvor turrapporten lagres.**

