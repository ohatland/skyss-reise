# Merk og logg

Godkjent 13. november 2026. Skissen ligger i [merk-og-logg.html](merk-og-logg.html).

Dette er oppslagsskjermer og kan ha mer innhold enn forsiden og om bord. Selve analysen gjøres i PostHog og sammen med Claude Code; loggen i appen er for å se over en tur og fylle inn notater.

## Merk

- **Ett trykk på flagget lagrer med en gang:** skjermbildet, posisjonen og tallene bak det appen viste. Merket skal ikke gå tapt om brukeren må løpe til neste buss.
- **Arket som kommer opp er valgfritt:** kategori, notat og «Ferdig».
- **Notatet kan skrives senere** fra loggen.
- **Kategorier** (bekreftet 13. november 2026): feil tid, mangler alternativ, uklart, treg app, idé.

## Loggen

Ligger bak tannhjulet.

- **Én rad per tur:** reisetype, tidsrom, hvor mye ankomsten avvek fra første anslag, og antall merker.
- **Merker uten notat** vises på raden.
- **«Appen» nederst:** når det sist ble sendt til PostHog, hvor mange hendelser som venter, feil siste døgn og versjon.

## Turrapporten

- **Øverst:** faktisk ankomst mot appens første anslag.
- **Samme tabell som på forsiden,** med to kolonner for overgangstid: anslått da brukeren valgte, og slik det faktisk gikk. Fargene følger reglene for overgangstid.
- **Hendelser i rekkefølge:** påstigning, endret anbefaling, bytter, merker og ankomst.
- **«Faktisk» overgangstid** regnes fra når bussen faktisk ankom og når neste faktisk gikk. GPS-sporet kan senere vise når brukeren selv sto på holdeplassen.

Turrapporten kan først fylles når om bord-modus logger bytter, altså etter fase 5.
