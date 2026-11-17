# Bussbytte: konsept og faseplan

Konseptet ble godkjent 13. november 2026. Fase 1 (design) ble ferdig samme dag. Fase 2 er påbegynt; se status under fasen.

## Formål

En app for iPhone og Android som gjør pendlingen mellom Krokåsskiftet og Birkelandsskiftet / Grana enklere å styre, særlig valget av bytte mens man sitter på bussen. Appen er til eget bruk.

### Navn og logo

Appen heter **Bussbytte** (valgt av brukeren 17. november 2026). Arbeidsnavnet var Skyss-reise, og mappen og repoet heter fortsatt `skyss-reise`.

- Brukerens krav: appen er et alternativ til Skyss sin reiseplanlegger, ikke en konkurrent, og skal ikke kunne tas for å etterligne den. Navnet bruker derfor ikke «Skyss». Det skal samtidig være tydelig at appen handler om bussreiser.
- Logoen er to busser forskjøvet for hverandre, en lys og en grønn, på mørk flate (`#2C2C2A`). Det grønne er fargen for god overgangstid. Kilden er `assets/logo/bussbytte-*.svg`, og ikonfilene i `assets/images/` er laget fra den.
- App-identifikatoren er `dev.hatland.bussbytte`.

## Konsept

### Reisetyper og alternativer

- To reisetyper: Til jobb og Fra jobb, hver med faste start- og målholdeplasser.
- Jobben ligger i Lønningsflaten 22. Grana er nærmeste holdeplass, men det går sjelden buss derfra, så brukeren må ofte gå til eller fra Birkelandsskiftet. Det er grunnen til at reisetypene har to holdeplasser i jobbenden. Gangen mellom jobben og holdeplassen er dermed en del av reisen.
- Reisen regnes fra dør til dør (avgjort 13. november 2026): Til jobb viser når brukeren er fremme på jobben, Fra jobb viser når brukeren må gå fra jobben. Hvert sted har holdeplasser med gangtid.
- Periodebilletten gjelder buss, bybane, båt og tog innenfor sonen. Appen søker derfor bare hos Skyss og Vy tog. Flybussen er privat, dekkes ikke, og skal aldri vises. Sonegrensen kontrolleres ikke.
- Hva appen er til for, med brukerens ord 13. november 2026: som busspassasjer bryr brukeren seg om hvor og når bussen går. Appen skal forenkle reisekombinasjonene, slik at brukeren slipper å sammenligne mange alternativer selv og får enkel oversikt ved å se på appen.
- Hver reisetype har lagrede alternativer: kjeder av etapper. En etappe har fra-holdeplass, til-holdeplass og én eller flere ruter, eller er gange.
- Alternativene finnes i en kartleggingsøkt: appen søker hos Entur på flere måter gjennom et tidsrom, slår sammen funnene, og brukeren huker av dem som skal lagres. De kan også bygges manuelt etappe for etappe. Etter lagring skal brukeren ikke trenge å forholde seg til dem igjen.
- Buss, bybane og båt. Askøybåten (linje 490, Kleppestø–Strandkaien) bygges manuelt fordi Entur ofte utelater den fra reiseforslag.
- Egen gangtid per bytte. Enturs anslag er utgangspunktet og kan overstyres.
- Plattformbokstav vises på terminalene, både for avstigning og påstigning.

### Før avreise

- Neste avganger per alternativ med sanntid, ankomsttid og om byttene holder.
- Reisetid nå ved siden av rutetid. Avgjort 14. november 2026: vises ikke på forsiden; tallet regnes ut og beholdes til trafikkbildet.
- For busser som ikke har startet: Enturs typiske forsinkelse (median og «dårlig dag»).

### Om bord-modus

- Brukeren velger bussen de sitter på, og appen følger den.
- For hvert byttested fremover: ankomst dit, neste avgang derfra, margin etter gangtid og ankomst ved målet.
- Margin vises med sekunder (`9:18`) og merkes trygg, knapp eller tapt.
- Beste alternativ står øverst og oppdateres omtrent hvert 20.–30. sekund.
- Brukeren trykker «byttet», og appen fortsetter med neste buss i kjeden.

### Hvor tidene kommer fra

- Enturs sanntidsprognose for alle tider og marginer på busser som er underveis.
- Enturs typiske forsinkelse (`empiricalDelay`, p50 og p90) for busser som ikke har startet.
- Bybanen og båten regnes som presise og vises med rutetid. Entur har ikke sanntid for dem.
- Appen lager ingen egne ankomsttider.

### Trafikkbilde

- For strekninger med mye trafikk (for eksempel rv. 555 Bergen–Storavatnet): kjøretid nå mot normalt, hvor køen står, og om den øker eller minker.
- Bygger på faktiske passeringstider for alle linjer som kjører de samme delstrekningene.
- Tabellen over linjer per delstrekning lages automatisk fra rutedataene.
- Trafikkbildet beskriver og advarer. Det spår ikke ankomsttider.

### Logging og overvåking

Målet er å fange feil, mangler og forbedringer fra telefonen mens appen utvikles.

Dette logges:

- **Bruk:** skjermer som åpnes, valgt reisetype og alternativ, valgt buss, «byttet», og om anbefalingen ble fulgt.
- **Beslutningsgrunnlag:** hver anbefaling appen viser, med tallene bak (prognose, margin, gangtid), og hver gang anbefalingen endrer seg.
- **Fasit:** faktiske ankomst- og avgangstider hentet i ettertid, slik at anbefalingene kan vurderes.
- **Teknisk:** Entur-kall (svartid, feil, gamle data), JavaScript-feil og krasj, appversjon og nettverkstilstand.
- **Egne notater:** en «merk»-knapp som lagrer et notat sammen med et øyeblikksbilde av det appen viste.
- **GPS-posisjon:** under en aktiv reise, omtrent hvert tiende sekund og ved hver hendelse (valgt buss, «byttet», «merk»), med nøyaktighet, fart og retning.

Slik lagres det:

- Loggen sendes til PostHog med lagring i EU (valgt 13. november 2026). EU-regionen velges ved oppsett og kan ikke endres etterpå.
- PostHogs SDK mellomlagrer hendelser på telefonen og sender dem når det er dekning.
- Skjermopptak av økter og feilrapporter med krasj hører med, siden appen kjøres som eget bygg på telefonen.
- Claude Code kobles til PostHog, slik at logg og feil kan leses direkte under utviklingen.

GPS-loggen brukes til å måle faktisk gangtid på byttene, kontrollere hvilken buss brukeren satt på, og som grunnlag for automatisk gjenkjenning senere.

Loggen gir også prognosene underveis på ekte reiser, noe Enturs historikk mangler. Dermed kan den svare på det åpne spørsmålet om hvor godt sanntidsprognosen treffer i kø.

### Rammer

- Expo (React Native + TypeScript). iPhone er daglig telefon; Android skal også støttes.
- Appen bygges og installeres som eget bygg på iPhonen fra første versjon. Det krever Apple-utviklerkonto, som brukeren oppretter. Bygget lages i skyen, siden utviklingsmaskinen er Linux.
- Ingen egen server i første versjon. Appen snakker direkte med Entur og må være åpen for å oppdatere seg.
- Buss og bytte velges manuelt i første versjon.

### Bekreftet 13. november 2026

- Bare lagrede alternativer vises og rangeres. Kan ingen av dem brukes, vises et vanlig Entur-søk som reserve.
- Gangtiden lagres per byttested og gjelder alle alternativer som bruker det.
- GPS logges bare under en aktiv reise, fra om bord-modus starter til brukeren er fremme, ikke ellers i døgnet.
- Appen velger reisetype etter posisjon ved åpning, med klokkeslett som reserve. Det krever posisjon også når appen åpnes, men den posisjonen logges ikke.

### Åpent

- Hvor godt Enturs sanntidsprognose treffer i tung kø. Måles med loggen fra fase 5.
- Hvor ofte prognosen oppdateres, altså hvor mye sekundene hopper.

## Faser

Rekkefølgen er avtalt slik: faser, deretter design sammen, deretter implementasjon.

### Fase 1: Design

Skjermskisser utvikles sammen før noe bygges.

- Om bord: godkjent 13. november 2026, se `docs/design/om-bord.md`
- Før avreise: godkjent 13. november 2026, se `docs/design/for-avreise.md`
- Hjem med reisetyper: utgår. Før avreise er forsiden, med bryter mellom Til jobb og Fra jobb.
- Alternativer: kartleggingen godkjent 13. november 2026, se `docs/design/alternativer.md`. Skjermene for å justere lagrede alternativer er tegnet, men ikke uttrykkelig godkjent.
- Trafikkbilde: godkjent 13. november 2026, se `docs/design/trafikkbilde.md`
- «Merk», logg og turrapport: godkjent 13. november 2026, se `docs/design/merk-og-logg.md`

Alle skjermene er dermed tegnet og fase 1 er ferdig. De åpne valgene ble avklart med brukeren samme dag og står i hver designfil. Det som fortsatt er åpent, er smått og står under «Ikke avgjort» i filene.

De andre skjermene skal låne uttrykket fra om bord-skjermen.

Ferdig når skissene for alle skjermene er godkjent.

### Fase 2: Grunnmur og logging

- Expo-prosjekt og git i `skyss-reise`.
- Eget bygg installert på iPhonen, med oppdateringer uten nytt bygg for endringer i JavaScript.
- Entur-klient med typer og tester for kjernelogikken.
- PostHog koblet til: hendelser, feil og krasj, skjermopptak, «merk»-knapp.
- GPS-logging under aktiv reise, også med låst skjerm.
- Claude Code koblet til PostHog.

Ferdig når appen viser en ekte avgangstavle for Krokåsskiftet på telefonen uten å være koblet til utviklingsmaskinen, og hendelser, feil og GPS-spor fra telefonen kan leses i PostHog.

Status 13. november 2026:

- Gjort: git, Expo-prosjekt (SDK 58), Entur-klient, kjernelogikk for overgangstid og avgangsmerking med tester, og en avgangstavle for Krokåsskiftet som er kontrollert i nettleser mot ekte Entur-data.
- Gjenstår: eget bygg på iPhonen, PostHog, «merk»-knapp, GPS-logging og kobling fra Claude Code til PostHog. Alt dette venter på kontoer hos Apple, Expo og PostHog, som brukeren oppretter.
- Loggen går til konsollen og, med nøkkel i `.env.local`, til PostHog (EU), gjennom `src/logging/logger.ts`. Se «Status 17. november 2026» under.
- `ET-Client-Name` mot Entur er en nøytral standardverdi. Brukeren bør sette sin egen i `EXPO_PUBLIC_ENTUR_CLIENT_NAME`.
- Lint er ikke satt opp.

Status 17. november 2026 (grenen `fase-2-posthog`, ikke committet):

- Gjort: PostHog-sink (`src/logging/posthog.ts`) som legges ved loggeren når `EXPO_PUBLIC_POSTHOG_KEY` er satt, med EU-verten `https://eu.i.posthog.com` som standard. Uten nøkkel logger appen bare til konsollen, som før. Uncaught feil og avviste løfter fanges av SDK-en; feil appen selv fanger går gjennom `log.error` til `captureException`. «Merk»-knappen (`src/components/mark-button.tsx`, `src/logging/mark.ts`) står nederst på forsiden og på om bord-skjermen: ett trykk sender `mark_created` med skjermen, reisetype, kortenes kjøretøy og tider og om bord-øktens tilstand; kategori og notat fra arket sendes som `mark_noted` med samme `markId`.
- Ikke gjort: skjermopptak (PostHogs dokumentasjon sier ikke at det fungerer med Expo SDK 58, og det krever et eget bygg), krasjfangst i native kode (`nativeCrashes`, krever `@posthog/react-native-plugin` og et eget bygg), posisjon i merket (GPS-loggingen kommer senere), logg-skjermen bak tannhjulet der notatet kan skrives senere, og koblingen fra Claude Code.
- Prøvd i nettleseren, ikke på telefon. Alt som bare gjelder iPhone-bygget, står i rapporten fra økten.

Status 17. november 2026 (grenen `fase-2-iphone-bygg`, ikke committet): eget bygg satt på vent, Expo Go brukes inntil videre.

- Oppsatt: Expo-prosjektet `@nedoverbakke/bussbytte` (id i `app.json`), `expo-updates` med `runtimeVersion` `{ "policy": "sdkVersion" }` (gir `exposdk:58.0.0`, slik at Expo Go kan laste oppdateringene), og `eas.json` med profilen `preview` (intern distribusjon, kanal og miljø `preview`) for et eget bygg senere. `ios.bundleIdentifier` er `dev.hatland.bussbytte`. `EXPO_PUBLIC_POSTHOG_KEY` ligger i Expo-miljøet `preview` (synlighet `sensitive`) og er verifisert lagt inn i den publiserte pakken.
- Stoppet: bygget til iPhone ble avvist av Apple under arbeidsgiverens team (Admmit As) da app-id'en `dev.hatland.bussbytte` skulle registreres: «Apple 403 detected - Access forbidden… Please check with one of your Team Admins». Innlogging, tofaktor og registrering av telefonen (`eas device:create`) gikk fint. Rollen på kontoen mangler trolig tilgang til «Certificates, Identifiers & Profiles». Ingen app-id, sertifikat eller bygg er opprettet. Telefonen står som enhet under arbeidsgiverens team (fjernes med `eas device:delete`).
- Slik publiserer du en oppdatering til Expo Go: `npx eas-cli@latest update --branch preview --platform ios --environment preview --message "…"`. `--environment` er påkrevd fra SDK 55, og lokale `.env`-filer leses ikke, så nøkkelen må ligge i Expo-miljøet (`npx eas-cli@latest env:set --name EXPO_PUBLIC_POSTHOG_KEY --environment preview --visibility sensitive`). Første oppdatering ble publisert samme dag (oppdateringsside: `https://expo.dev/accounts/nedoverbakke/projects/bussbytte/updates/af194f5d-9286-4b62-86be-abf92fb9a9d8`).
- Slik lages et eget bygg senere (krever at Apple-kontoen kan opprette app-id, sertifikat og profil): bytt `runtimeVersion` til `{ "policy": "fingerprint" }` (eller `appVersion`), kjør `npx eas-cli@latest device:create`, og så `npx eas-cli@latest build --platform ios --profile preview`. Oppdateringer publiseres da som over.
- Ved flytting til egen Apple-konto: ny innlogging, valg av det personlige teamet og ny registrering av telefonen (`device:create`); app-id, sertifikat og provisjoneringsprofil opprettes på nytt under det teamet, og appen må bygges og installeres på nytt (samme `dev.hatland.bussbytte` kan bare brukes hvis den ikke allerede er registrert under arbeidsgiveren). Sertifikatet fra arbeidsgiverens team kan fjernes med `eas credentials`.
- Bekreftet 17. november 2026: brukeren åpnet appen i Expo Go på iPhonen, og hendelser fra telefonen kom i PostHog (`Application Installed`, `Application Opened`, `entur_call` og `mapping_run`, med `$app_name` «Expo Go», `$os` iOS, `$device_name` «iPhone 16» og `platform` ios; kontrollert med SQL mot prosjektet). Ikke bekreftet: at en oppdatering publisert etterpå nådde telefonen uten utviklingsmaskinen, og at appen kjørte med utviklingsmaskinen av. I Expo Go har appen Expo Gos navn og ikon. Skjermopptak, krasjfangst i native kode og GPS med låst skjerm krever uansett eget bygg.

### Fase 3: Reisetyper og alternativer

- Datamodell for reisetyper, alternativer, etapper og bytter, med flere ruter per etappe.
- Kartlegging: søk hos Entur på flere måter, sammenslåing, gruppering og lagring av valgte.
- Bygge og justere alternativer manuelt, inkludert båten.
- Gangtid per bytte og plattformvisning.

Ferdig når de faktiske alternativene for Til jobb og Fra jobb er lagret i appen.

Status 13. november 2026:

- Gjort: datamodell (`src/model`), kartleggingsmotor med tester (`src/mapping`), lagring (`src/storage`) og kartleggingsskjermen (`src/app/kartlegging.tsx`). En ekte kartlegging for Fra jobb er kjørt i nettleser: 56 søk ga 37 alternativer fra jobbadressen, og avkrysning og lagring virker.
- Gjort senere samme dag: listen over lagrede alternativer (`src/app/alternativer.tsx`), redigering av ett alternativ med egen gangtid per bytte (`src/app/alternativ.tsx`), og sletting. Kartleggingen tar vare på Enturs gangtid på hvert bytte. En kartlegging for Til jobb er kjørt i nettleser og ga 34 alternativer.
- Avgjort samme dag: appen kombinerer selv etapper på tvers av de lagrede alternativene. De lagrede alternativene utgjør et nett (`src/model/network.ts`), og motoren i fase 4 finner veiene gjennom det. En kombinasjon trenger derfor ikke være lagret som eget alternativ.
- Avgjort samme dag: gangtid ved bytte gjelder per par av plattformer, ikke per holdeplass. Se `docs/design/alternativer.md`.
- Gjort senere samme dag: tidsrom og via-holdeplasser kan endres i oppsettet og huskes per reisetype, «Søk via holdeplass» utvider et resultat med ett søk til, «Bygg selv» lager et alternativ etappe for etappe (`src/app/bygg.tsx`), og rutene på en etappe kan endres med forslag fra Entur (`src/app/etappe.tsx`). Alt er prøvd i nettleser mot Entur.
- Funksjonene i fase 3 er dermed på plass. Fasen er ikke ferdig etter sitt eget mål før brukeren har kjørt kartleggingen på telefonen og lagret sine alternativer, og det venter på bygget til iPhone i fase 2.
- Ikke laget: å endre holdeplassene på en etappe (bygg et nytt alternativ i stedet), og å slette en enkelt etappe.
- Avgjort: reiser som bare skiller seg i veien mellom jobben og første eller siste holdeplass, slås sammen til ett alternativ. Veiene lagres for seg per holdeplass, og appen velger selv. Det tok listen fra 37 til 21 alternativer. Se `docs/design/alternativer.md`.

### Fase 4: Før avreise

- Neste avganger per alternativ med sanntid.
- Margin per bytte med sekunder og status.
- Reisetid nå mot rutetid, og typisk forsinkelse for busser som ikke har startet.

Ferdig når appen kan brukes til å velge avgang hjemmefra og fra jobb.

Status 14. november 2026:

- Gjort: motoren (`src/engine` og `src/entur/calls.ts`) med tester, kjørt mot Entur for begge reisetyper. Inngangen er `planTrips(tripType, now)`. Den gir ett kort per siste kjøretøy før veien mellom holdeplassen og adressen, sortert på ankomst dør til dør.
- Avgjort samme dag: reglene for forsiden, blant annet hva «sanntid» betyr og hva som er ett kort. De står i `docs/design/for-avreise.md`.
- Gjort senere samme dag: forsiden (`src/app/index.tsx`, `src/components/trip-card.tsx`, `src/hooks/use-trip-plan.ts`) etter den godkjente skissen, med oppdatering hvert 30. sekund og «Vis flere». Prøvd i nettleser mot Entur for begge reisetyper.
- Gjenstår: prøve på telefon og i rushtid med ekte forsinkelser. «Merk»-knappen og knappen som starter om bord-modus kommer med resten av fase 2 og fase 5.

Endret 14. november 2026 (kveld), sammen med om bord-logikken på grenen `fase-5-om-bord-logikk`:

- Kort blir stående på forsiden: et bytte som faller under ett minutt eller går inntil tre minutter i minus, fjerner ikke kortet (ett minutt for et bytte som ikke har vært vist). Et kort som er fjernet, kommer ikke tilbake før overgangstiden er 0:00 eller bedre. `planTrips` tar imot og gir tilbake det som må huskes (`memory`), og `use-trip-plan.ts` holder på det per reisetype.
- Den beste øverst: tidligst fremme blant reisene med minst ett minutt på alle bytter. Resten sortert på ankomst, i hele minutter.
- Røde kort viser «Rekker du den ikke: fremme HH:MM».
- Reglene står i `docs/design/for-avreise.md`. `missedGraceSeconds` er ikke lenger et valg på `planTrips`.

### Fase 5: Om bord-modus

- Velge buss og følge den.
- Rangere bytter fremover og vise beste alternativ.
- «Byttet» og videre til neste buss.
- Reservesøk hos Entur når alle lagrede alternativer ryker.
- Turrapport fra loggen: hva appen anbefalte, hva som ble valgt, og hva som faktisk skjedde.

Ferdig når en hel reise til jobb med tre–fire bytter er gjennomført med appen, og turrapporten kan leses etterpå.

Status 14. november 2026:

- Gjort: logikken for om bord, uten skjerm (`src/onboard`, `src/entur/journey.ts`), med tester, kjørt mot Entur på busser som var underveis, for begge reisetyper. Inngangen er `followVehicle(tripType, following, now)`. Den gir kjøretøyet (linje, destinasjon, forventet ankomst til hver holdeplass videre der brukeren kan bytte) og alle reiser videre som kort, med planen først og resten sortert på ankomst dør til dør. Første rad i hver reise er kjøretøyet brukeren sitter på.
- Tapt bytte: motorens `missedGraceSeconds` er ett minutt om bord. «Rekker du den ikke: fremme HH:MM» regnes nå fra neste mulige reise videre uansett vei (også gange), ikke bare neste avgang på samme vei.
- Bytte av kjøretøy: appen kaller `followVehicle` på nytt med det nye kjøretøyet. `nextVehicleOf(kort, kjøretøy)` gir neste kjøretøy i et kort. `gotOffAt` holder på reisene videre fra holdeplassen mens brukeren venter der.
- Turlogg (`src/onboard/trip-log.ts`): `startLog`, `observe`, `finishLog` og `tripReport` gir data til turrapporten: rutetid mot faktisk tid per kjøretøy, vist overgangstid (første og siste gang) mot faktisk per bytte, bytter som røk, og ankomst mot første anslag.
- Entur lister noen avganger som to turer, der bare den ene rapporterer etter start. Den andre står på rutetiden og får «faktisk ankomst» lik rutetiden, men aldri faktisk avgang. `followVehicle` bytter til turen som rapporterer, og `plan.following` sier hvilken det er.
- Gjort samme kveld: om bord-skjermen (`src/app/om-bord.tsx`) og veien inn fra forsiden. Knappen nederst på forsiden («Jeg er på 400 fra 07:09») gjelder det øverste kortet, og et trykk på et kort starter om bord for kortets første kjøretøy. Økten ligger utenfor skjermen (`src/onboard/store.ts`, `src/hooks/use-on-board.ts`) og oppdateres mot Entur hvert 20. sekund mens skjermen er åpen. Skjermen viser overskriften, spørsmålet med Ja og Nei, kortene med planen øverst (`TripCard` med `onBoard`), «Vis flere» og «Jeg har gått av». Turloggen føres i minnet. Når brukeren har gått av der reisen ender, går appen tilbake til forsiden. Ny hendelse i logikken: `gotOffHere` og `stopVehicleIsAt` i `session.ts` for «Jeg har gått av», og `tripIsOver`. Valgene som ble gjort under byggingen, står i `docs/design/om-bord.md` under «Skjermen slik den er bygget».
- Ikke med: økten og turloggen lagres ikke, så de er borte når appen startes på nytt. Forsiden har knappen «Tilbake til reisen» mens en reise pågår (lagt inn 15. november 2026). Flaggknappen «merk» kom med fase 2 (17. november 2026).
- «Jeg har gått av» på en holdeplass uten lagrede reiser videre gir «Ingen lagrede reiser videre fra {holdeplass}.» og knappen «Avslutt reisen» (avgjort av brukeren samme kveld). Reservesøk derfra kommer senere.
- Gjenstår: lagring av økten og turloggen, reservesøk hos Entur, turrapportskjermen, gjenkjenning med GPS og hastighet, og prøve på telefon og i rushtiden.
- Avgjort av brukeren samme dag, og lagt inn i logikken (reglene står i `docs/design/om-bord.md` under «Avgjort 14. november 2026»):
  - Aktiv plan: tidligst fremme blant reisene der hvert bytte har minst ett minutt. `plan.activePlan` er planen og står først i `plan.trips`. Kort som er fremme mer enn 30 minutter etter planen, ligger i `plan.hidden`.
  - Appen spør «Gikk du av på {holdeplass}?» og «Er du på {linje} nå?». `src/onboard/session.ts` holder tilstanden: `startSession`, `refresh` (gir plan og aktuelt spørsmål) og `answer` (svar som hendelse med kilde).
  - Turrapporten holder det som skjedde opp mot planen ved påstigning (`report.plan`).
  - GPS og hastighet skal senere svare på spørsmålene. Ikke bygget.
  - Appen holder på planen: den byttes bare når en annen reise som holder, er et helt minutt tidligere fremme, eller når planen ikke holder lenger. `plan.planReason` sier hvorfor planen er den den er.
  - Et bytte som har vært vist og så er tapt med mer enn tre minutter, kommer ikke tilbake før overgangstiden er 0:00 eller bedre. Økten husker dette (`session.memory`).
- Rettet i motoren samme dag: `ridesOnLeg` velger turen som er underveis når Entur lister samme avgang som to turer. Nye i motoren: `minMarginSeconds`, som brukes til å finne den beste reisen, og `allowTransfer`, som brukes til å holde bytter som er gitt opp, ute. Forsiden bruker dem også, se under fase 4.

### Fase 6: Trafikkbilde

- Tabell over linjer per delstrekning, laget fra rutedataene.
- Kjøretid nå mot normalt og hvor køen står.
- Advarsel på bytter som trues av kø.

Ferdig når trafikkbildet for rv. 555 vises i appen og stemmer med faktiske passeringer.

### Fase 7: Android

- Android-bygg og test på en Android-telefon.

### Senere

- Avgangsvarsel med grenseverdi («57 går fra Grana om 6 min»). Krever en liten server for push til iPhone.
- Visning på låseskjermen.
- Automatisk gjenkjenning av buss og bytte med GPS.

## Modeller og økter for videre arbeid

Lagt til 13. november 2026. Appen selv bruker ingen AI-modell. Dette gjelder hvilken Claude-modell som brukes til å utvikle den i Claude Code.

Modellene som er aktuelle, med listepris per million tokens (inn / ut) per 3. november 2026. Alle har kontekstvindu på én million tokens.

| Modell | ID | Pris | Brukes til |
|---|---|---|---|
| Fable 5.2 | `claude-fable-5-2` | 8 / 40 USD | Det vanskeligste: logikk der en feil gir gale tall til brukeren |
| Opus 5.5 | `claude-opus-5-5` | 4 / 20 USD | Vanlig utvikling av skjermer og funksjoner |
| Sonnet 5.5 | `claude-sonnet-5-5` | 2 / 10 USD | Oppsett og arbeid som følger dokumentasjon |
| Haiku 5.5 | `claude-haiku-5-5` | 0,10 / 0,50 USD | Små rettelser og oppslag |

Forslag per oppgave:

| Oppgave | Modell | Hvorfor |
|---|---|---|
| Fase 4: motoren (avganger per etappe, overgangstid, dør til dør) | Fable 5.2 | Kjernen i appen. Tidsregning over flere bytter med sanntid er lett å få subtilt feil |
| Fase 4: forsiden etter godkjent skisse | Opus 5.5 | Skissen og reglene er ferdige; dette er gjennomføring |
| Fase 5: om bord-logikken (rangere bytter, følge bussen, tapt bytte) | Fable 5.2 | Samme slags logikk som motoren, med flere tilstander |
| Fase 5: om bord-skjermen og turrapporten | Opus 5.5 | Gjennomføring etter skisse |
| Fase 6: trafikkbildet | Opus 5.5 | Oppsummering av passeringstider, uten egne spådommer |
| Resten av fase 2: bygg til iPhone, PostHog, «merk», GPS | Sonnet 5.5 | Mest oppsett etter Expos og PostHogs dokumentasjon |
| Fase 7: Android | Sonnet 5.5 | Bygg og testing |
| Kodegjennomgang | Fable 5.2, egen økt | Skal finne feil den som skrev koden overså |
| Rette funn fra gjennomgang | Opus 5.5 | Avgrensede endringer med tester |
| Skisser sammen med brukeren | Opus 5.5 | Mange små runder; kvaliteten ligger i brukerens tilbakemeldinger |
| Små tekst- og stilrettelser, oppdatere dokumenter | Haiku 5.5 eller Sonnet 5.5 | Krever lite |

Slik deles arbeidet i økter:

- Én fase, eller én tydelig del av en fase, per økt. Den første økten ble svært lang (over 800 000 tokens), og hver ny melding må da lese hele historikken.
- En ny økt starter med å lese denne filen og reglene i `docs/design/` for skjermen det gjelder. Alt som er avgjort, skal stå der og ikke bare i en samtale.
- Kodegjennomgang kjøres i egen økt uten historikken fra utviklingen, slik at den leser koden med friske øyne.
- Prisene er listepriser for API-et. Med et abonnement gjelder bruksgrenser i stedet, men forholdet mellom modellene er det samme.

## Referanse: Entur

Alle kall trenger headeren `ET-Client-Name`. Ingen API-nøkkel.

| Hva | Hvor |
|---|---|
| Reisesøk, avgangstavler, sanntid per avgang | `https://api.entur.io/journey-planner/v3/graphql` |
| Holdeplassøk | `https://api.entur.io/geocoder/v1/autocomplete` |
| Råstrøm sanntid for Skyss (maks 4 kall i minuttet) | `https://api.entur.io/realtime/v1/rest/et?datasetId=SKY` |
| Historikk: planlagt og faktisk tid per stopp fra 2020 | BigQuery-tabellen `realtime_siri_et_last_recorded`, se `https://data.entur.no/public/datasets/realtime_siri_et` |
| Historikk som CSV per dag og datakilde | `https://siri-data-exporter.entur.no/` |

Nyttige felt i reiseplanleggeren:

- `EstimatedCall.expectedArrivalTime` / `expectedDepartureTime`: sanntidsprognose med sekunder.
- `EstimatedCall.actualArrivalTime` / `actualDepartureTime`: faktisk tid, bare for avganger som er underveis.
- `EstimatedCall.empiricalDelay { p50 p90 }`: typisk forsinkelse per stopp for avgangen.
- `EstimatedCall.predictionInaccurate`: flagg for upålitelig prognose.
- `Quay.publicCode`: plattformbokstav.

Holdeplasser:

| Navn | ID |
|---|---|
| Krokåsskiftet | `NSR:StopPlace:32541` |
| Birkelandsskiftet terminal | `NSR:StopPlace:58537` |
| Grana | `NSR:StopPlace:29485` |
| Bergen busstasjon | `NSR:StopPlace:30810` |
| Møhlenpris | `NSR:StopPlace:30918` |
| Lagunen terminal | `NSR:StopPlace:59849` |
| Storavatnet terminal | `NSR:StopPlace:31984` |
| Kleppestø terminal | `NSR:StopPlace:30815` |
| Kleppestø båtkai | `NSR:StopPlace:32539` |
| Strandkaiterminalen | `NSR:StopPlace:59223` |

Gange fra jobben (Lønningsflaten 22), Enturs anslag 13. november 2026:

| Holdeplass | Gangtid | Avstand | Merknad |
|---|---|---|---|
| Grana | 4 min | 260 m | Linje 57 og 99, sjeldne avganger |
| Liland skole | 8 min | 510 m | Ikke undersøkt |
| Blomsterdalen | 10 min | 720 m | Linje 51, 53 og 65. Entur brukte den i flere morgenforslag |
| Bergen lufthavn | 18 min | 1300 m | Bybanens endestopp og flybussene |
| Birkelandsskiftet terminal | 20 min | 1470 m | |
| Kokstadskiftet | 22 min | 1590 m | |

Et søk helt fra og til adressen ga reisetider på 67–98 minutter dør til dør mandag 16. november 2026.

Funn fra utforskingen:

- Reiseplanleggeren beholder ikke sanntid for avganger som er ferdige. Historikk må hentes fra datasettet over.
- Bybanen (linje 1) og båten (linje 490) har ingen registrerte tider i historikken.
- 10. november 2026 var det tung kø på rv. 555 mellom Møhlenpris og Frieda Fasmer. Linje 400 brukte opptil 70 minutter fra Bergen busstasjon til Krokåsskiftet mot 35 i ruten. 12. november var en vanlig rushdag. De to dagene er gode testdata.
- Et eget anslag basert på bussene foran hang 20–30 minutter etter i køen, og er derfor tatt ut av konseptet.
