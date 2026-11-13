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
- **Merking ved avgangstiden:**
  - Avviker bussen fra ruten, står rutetiden liten og gjennomstreket ved siden av (`07:09` og gjennomstreket `07:07`). Det gjelder både forsinket og for tidlig.
  - Er bussen i rute og har sanntid, står det «sanntid».
  - Har bussen ikke sanntid, står det «rutetid».
- **Merkingen er dempet og uten farge.** Farge er forbeholdt overgangstiden.
- **Første rad i tabellen er bussen brukeren går på**, med rute og holdeplass, men uten tall i kolonnen for overgangstid.
- **Busser uten sanntid** får en liten linje under tabellen med Enturs typiske forsinkelse: «Typisk fremme 6 min senere».
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

- **Ett kort per reise.** En avgang som gir to ulike reiser videre, står i to kort. Kortene sorteres etter når brukeren er fremme.
