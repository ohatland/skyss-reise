# Om bord-skjermen

Godkjent 13. november 2026. Skissen ligger i [om-bord.html](om-bord.html).

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
- **Nederst:** en flaggknapp for «merk» og knappen «Jeg har byttet», begge nedtonet.

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
