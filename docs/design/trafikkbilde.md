# Trafikkbildet

Godkjent 13. november 2026. Skissen ligger i [trafikkbilde.html](trafikkbilde.html).

Trafikkbildet beskriver og advarer. Det spår ikke ankomsttider. Tallene er hva bussene foran faktisk brukte på hver delstrekning, målt på alle linjer som kjører den.

## På forsiden og om bord

- **Kølinjen** vises bare når det er kø. Den står øverst, under bryteren på forsiden og under overskriften om bord.
- **Innhold:** hvor køen står, kjøretid nå mot normalt i minutter, og ett ord for utviklingen: øker, uendret eller minker.
- **Ingen farge.** Farge er forbeholdt overgangstiden.
- **Kort som går gjennom køen** får et lite «kø» ved ankomsttiden, i samme stil som «sanntid» og «rutetid». Det betyr at ankomsttiden er usikker.
- **Plasseringen av «kø»:** på siden av ankomsttiden som vender inn mot kortet, slik at tallene fortsatt står under hverandre. På forsiden står det foran tiden, om bord etter.
- **Kort uten merking går utenom køen.** Om bord skiller dette alternativene der brukeren går av før køen fra dem som må gjennom den.
- **Ingen kø, ingen linje.** Skjermene ser da ut som de godkjente skissene for forsiden og om bord.

Kortene i skissen er tegnet før reisen ble regnet fra dør til dør. Kølinjen og «kø»-merkingen er uendret; kortenes oppbygning følger nå [for-avreise.md](for-avreise.md) og [om-bord.md](om-bord.md).

## Detaljskjermen

Åpnes ved å trykke på kølinjen. Dette er en oppslagsskjerm og kan ha mer innhold.

- Samlet kjøretid for strekningen nå mot normalt, og en setning om utviklingen.
- Tabell per delstrekning med «nå» og «normalt» i minutter. Trege rader er halvfete.
- Hvilke linjer tallene er målt på, og hvor gammel den nyeste målingen er.
- En påminnelse om at tallene ikke er en spådom.

## Grenser

- **Kølinjen vises** når en delstrekning tar minst dobbelt så lang tid som normalt, og minst fem minutter mer. Bekreftet 13. november 2026.
- **Øker eller minker** betyr at tiden har endret seg med minst tre minutter den siste halvtimen. Ellers står det «uendret». Dette er et forslag brukeren ikke har kommentert.
- **Et kort merkes med «kø»** når reisen bruker en delstrekning der kølinjen er utløst.
- **«Normalt» er rutetiden.** Utenom rush kjører bussene ofte raskere enn ruten, så tallet er litt høyt.

## Grunnlag

- Delstrekningene og linjene som deler dem, hentes automatisk fra rutedataene. For Bergen busstasjon → Storavatnet er det fem delstrekninger, og Askøy-bussene deler dem med blant annet 445, 450 og 460.
- I rushet gir alle linjene til sammen 12–39 passeringer i timen per delstrekning, mot 4–7 med bare Askøy-bussene.
- 10. november 2026 lå køen på Møhlenpris → Lyngbø og Lyngbø → Frieda Fasmer. Resten av strekningen gikk normalt.
- Et anslag for hele strekningen basert på disse målingene henger 20–30 minutter etter når køen vokser eller løser seg opp. Derfor vises tallene som et bilde av nå, ikke som en ankomsttid.
