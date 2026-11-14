# Før avreise-skjermen

Godkjent 13. november 2026. Skissen ligger i [for-avreise.html](for-avreise.html).

Skjermen bruker de samme kortene og reglene som [om bord-skjermen](om-bord.md). Her står bare det som er annerledes.

## Regler

- **Dette er forsiden.** Appen har ingen egen hjem-skjerm og åpner rett her.
- **Bryter øverst** mellom Til jobb og Fra jobb erstatter overskriften.
- **Appen velger reisetype etter posisjon ved åpning** (bekreftet 13. november 2026): Til jobb når brukeren er på Askøy, Fra jobb når brukeren er nær jobben. Mangler posisjonen, eller er brukeren et annet sted, velges det etter klokkeslett: Til jobb før klokken 12, Fra jobb etter. Hvor nær «nær» er, er ikke fastsatt; forslaget er nærmeste startholdeplass innenfor tre kilometer.
- **Om bord-modus startes på to måter** (bekreftet 13. november 2026): knappen nederst gjelder alltid det øverste kortet, og et trykk på et annet kort starter om bord for den bussen.
- **Tannhjul** til høyre for bryteren fører til redigering av alternativer, gangtider og logg.
- **Avgangstid til venstre, ankomsttid til høyre** øverst i kortet. Ankomsttiden er halvfet, slik at den fortsatt er det viktigste tallet.
- **Den store avgangstiden er forventet avgang**, altså når bussen faktisk går.
- **Merking ved avgangstiden** (presisert 14. november 2026, se under):
  - Avviker Enturs forventede tid fra ruten, står rutetiden liten og gjennomstreket ved siden av (`07:09` og gjennomstreket `07:07`). Det gjelder både forsinket og for tidlig, og både for en buss som er underveis, og for en som ikke har startet.
  - Er bussen underveis og i rute, står det «sanntid».
  - Er bussen i rute, men har ikke startet på turen eller har ikke sanntid, står det «rutetid».
- **Merkingen er dempet og uten farge.** Farge er forbeholdt overgangstiden.
- **Første rad i tabellen er bussen brukeren går på**, med rute og holdeplass, men uten tall i kolonnen for overgangstid.
- **Busser som ikke har startet på turen** får en liten linje under tabellen med Enturs typiske forsinkelse: «Typisk fremme 6 min senere». Linjen står ikke når den typiske forsinkelsen er null minutter. Bybanen og båten regnes som presise og får den ikke.
- **«Avgang {startholdeplass}» og «Fremme {sluttstopp}»** følger samme regel som på om bord-skjermen: bare i første kort når alle kortene har samme holdeplass, ellers i alle.
- **Nederst:** flaggknapp for «merk» og en knapp som starter om bord-modus, for eksempel «Jeg er på 400 fra 07:09».

## Dør til dør (avgjort 13. november 2026)

Reisen regnes helt fra og til jobben, fordi gangen er en stor del av den: 4 minutter til Grana, 20 minutter til Birkelandsskiftet.

- **Gange er en egen rad** i tabellen: «Gå» i rutekolonnen, «til» eller «fra» holdeplassen i midten, og gangtiden i minutter til høyre, uten sekunder og uten farge.
- **Til jobb:** det store tallet til høyre er «Fremme jobb», med gangen fra siste holdeplass regnet inn. Gangen er siste rad. Venstre side er som før: bussens avgang fra Krokåsskiftet med merking.
- **Fra jobb:** det store tallet til venstre er «Gå fra jobb», altså når brukeren senest må gå. Gangen er første rad. Bussens avgangstid står liten under holdeplassnavnet på neste rad, med samme merking som ellers: «går 15:37, sanntid», «går 16:03, rutetid», eller gjennomstreket rutetid ved avvik.
- **Avganger brukeren ikke rekker** med gangtiden regnet inn, vises ikke.
- **Bare Skyss-linjer.** Flybussen er ikke med i periodebilletten og skal aldri vises.

Variant B, med bussens avgang stort også på Fra jobb og «fra jobb senest» i første rad, ble valgt bort.

Gangtid hjemmefra til Krokåsskiftet er ikke lagt inn. Settes den, kan Til jobb vise «Gå hjemmefra» på samme måte.

## Avvist

- Et tall for tid til avgang i kolonnen for overgangstid på første rad. Det ble oppfattet som uforståelig, fordi det ikke er en overgang mellom to busser.
- Tekst som «2 min forsinket» etter avgangstiden. Gjennomstreket rutetid ble valgt i stedet.

## Ikke avgjort

- **Avstandsgrensen** for valg av reisetype etter posisjon.

## Avgjort 13. november 2026

- **Ett kort per reise.** En avgang som gir to ulike reiser videre, står i to kort. Kortene sorteres etter når brukeren er fremme. Hva som er én reise, ble presisert 14. november.

## Avgjort 14. november 2026

Avgjort av brukeren etter at motoren var bygget og kjørt mot Entur. Motoren ligger i `src/engine`.

- **Et bytte prognosen sier er tapt, vises ikke før avreise.** En reise der et bytte har negativ overgangstid, er ikke med blant kortene. Regelen fra [om bord-skjermen](om-bord.md) (rødt mens brukeren er under ett minutt for sen, med «Rekker du den ikke: fremme 08:29») gjelder om bord, der brukeren allerede sitter på bussen. I motoren er dette et valg (`missedGraceSeconds`) som er av før avreise.
- **«Sanntid» betyr at kjøretøyet er underveis på turen.** Entur setter sanntidsflagget også på avganger flere timer frem, for busser som ikke har startet, og tiden er da ikke målt. En avgang merkes derfor «sanntid» bare når Entur har registrert at kjøretøyet har gått fra turens første holdeplass. Har det ikke startet, merkes avgangen «rutetid», og Enturs typiske forsinkelse vises for den. Bybanen og båten regnes som presise som før.
- **Ett kort per siste kjøretøy.** Reiser som ender med samme kjøretøy på samme tur, konkurrerer med hverandre og er ett kort. De andre reisene i gruppen følger med bak kortet (`alternatives`), slik at en skjerm kan vise dem senere. Kortene sorteres på ankomst som før.
  - **Rekkefølgen innen et kort:** først den som er tidligst fremme dør til dør, så en reise med bare grønne bytter foran en med et gult, så den som går senest fra start, så den med størst minste overgangstid, så den med færrest bytter. Et bytte er grønt når overgangstiden er over 3:00. En reise uten bytter regnes som grønn.
  - Bakgrunn for at grønt går foran senest start: lørdag 14. november ble kortet med ankomst 16:07 reisen 53, Bybanen, 600, 400 (start 14:41, minste overgangstid 2:38), foran 50E, 400 (start 14:37, minste overgangstid 6:53).
  - **Veien mellom holdeplassen og jobben teller ikke.** Appen velger selv den veien, slik det er avgjort for alternativene («Appen velger selv veien når brukeren skal reise», [alternativer.md](alternativer.md)). Kortet avgjøres derfor av det siste kjøretøyet som ikke hører til forbindelsen mellom ankerholdeplassen og adressen. Til jobb er «Bybanen til Birkelandsskiftet og gå 20 min» og «Bybanen til Birkelandsskiftet, 56 til Ådlandsflaten og gå 11 min» samme kort.
  - Går samme kjøretøy forbi flere ankerholdeplasser (51 til Birkelandsskiftet eller Blomsterdalen), er det også ett kort. Appen velger selv hvor brukeren går av.
  - Fra jobb ligger forbindelsen i starten av reisen, så der avgjør det siste kjøretøyet til Krokåsskiftet.
  - Bakgrunn: en mandag morgen etter rutetid ga Til jobb 547 reiser. 168 av dem var de samme kjøretøyene med et annet byttested.
- **Avvik vises også for en buss som ikke har startet.** Entur gir av og til en forventet tid som avviker fra ruten for en buss som ikke har startet. I en måling 14. november 2026 gjaldt det 108 av 602 slike avganger, med opptil seks minutters avvik. Appen viser og regner med Enturs tid, og rutetiden står da gjennomstreket ved siden av, slik som for en buss underveis. Avgangen merkes aldri «sanntid» før bussen har startet. Linjen med typisk forsinkelse gjelder fortsatt.
- **Et kort som et annet kort slår, skjules.** Et kort skjules når et annet kort går samtidig eller senere fra start og er fremme samtidig eller tidligere dør til dør, og er bedre på minst ett av de to. «Start» er når brukeren må gå: avgangen fra Krokåsskiftet til jobb, og «Gå fra jobb»-tiden fra jobb.
  - **Unntak:** et kort med bare grønne bytter skjules ikke av et kort med et gult bytte.
  - **To kort som er helt like på start og ankomst,** skjuler ikke hverandre. Begge vises, i den rekkefølgen de er rangert: bare grønne bytter først, så størst minste overgangstid, så færrest bytter.
  - De skjulte kortene forsvinner ikke. `planTrips` gir dem i `hidden` ved siden av de viste i `trips`, slik at skjermen kan ha «Vis flere».
  - Følge: regelen fra 13. november om at en avgang som gir to ulike reiser videre, står i to kort, gjelder nå bare når ingen av de to slår den andre. I skissen ville kortet 07:09 med ankomst 08:27 være skjult bak kortet 07:09 med ankomst 08:16.
- **Typisk forsinkelse på null vises ikke.** Linjen «Typisk fremme N min senere» står ikke når Enturs median runder av til null minutter eller er negativ.
- **Gange mellom to holdeplasser underveis er en egen rad:** «Gå», fra og til, og minutter, slik gangen til og fra jobben vises. Overgangstiden på neste rad har gangen regnet inn.
- **Reisetid nå mot rutetid vises ikke på forsiden.** Motoren regner den ut (`durationSeconds` og `scheduledDurationSeconds`), og tallet beholdes til trafikkbildet i fase 6.
