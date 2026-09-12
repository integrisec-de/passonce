# Sicherheit

PassOnce ist ein Werkzeug zum Schutz vertraulicher Daten. Fehler in der
Verschlüsselung, in der Einmal-Logik oder in der Auslieferung wiegen hier
schwerer als in gewöhnlicher Software. Meldungen sind ausdrücklich willkommen.

## Schwachstelle melden

**Bitte kein öffentliches GitHub-Issue.** Bei einem kryptografischen Werkzeug
macht ein öffentlicher Bericht die Nutzer angreifbar, bevor eine Korrektur
verfügbar ist.

Meldungen an **kontakt@integrisec.de**, bitte mit „Security" am Anfang des
Betreffs.

Hilfreich für eine schnelle Einschätzung:

- betroffene Version oder Commit
- Beschreibung und, soweit möglich, ein Weg zur Reproduktion
- Einschätzung der Auswirkung
- ob und wann Sie selbst veröffentlichen möchten

Vertrauliche Details können Sie über <https://passonce.de> als Einmal-Link
übermitteln, statt sie in die E-Mail zu schreiben.

## Was Sie erwarten können

| Schritt | Frist |
| --- | --- |
| Eingangsbestätigung | innerhalb von 3 Werktagen |
| Erste Einschätzung mit Schweregrad | innerhalb von 10 Werktagen |
| Abgestimmte Veröffentlichung | in der Regel innerhalb von 90 Tagen |

PassOnce wird von einer einzelnen Person gepflegt. Die Fristen sind bewusst so
gewählt, dass sie auch eingehalten werden können. Sollten Sie nichts hören,
fragen Sie bitte nach — dann ist etwas schiefgegangen.

Es gibt kein Bug-Bounty-Programm. Auf Wunsch nenne ich Sie bei der
Veröffentlichung als Finder oder Finderin.

## Umfang

Dieses Repository enthält die selbst betriebene Variante von PassOnce: Server,
Datenbankschema, clientseitige Verschlüsselung und Oberfläche. Meldungen dazu
gehören hierher.

Der gehostete Dienst unter <https://passonce.de> wird ebenfalls von integrisec
betrieben. Meldungen dazu gehen an dieselbe Adresse.

Nicht in unserem Zuständigkeitsbereich liegen Schwachstellen in Node.js, Caddy,
Docker oder dem Betriebssystem des Betreibers. Bitte wenden Sie sich dafür an
das jeweilige Projekt.

## Unterstützte Versionen

Sicherheitskorrekturen erscheinen für den jeweils aktuellen Stand des
`main`-Branches.

---

## English

Please do **not** open a public issue for security problems. Report them to
**kontakt@integrisec.de** with "Security" at the start of the subject line.
You may use <https://passonce.de> to send confidential details as a one-time
link.

You can expect an acknowledgement within 3 working days, an initial assessment
within 10 working days, and coordinated disclosure normally within 90 days.
PassOnce is maintained by a single person; there is no bug bounty programme.
Credit is given on request.

Vulnerabilities in Node.js, Caddy, Docker or the operator's own system are out
of scope — please report those to the respective projects.
