export default function TermsPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <h1>Regole della piattaforma</h1>

      <h2>Regole sui contenuti</h2>
      <p>Gli utenti si impegnano a non pubblicare:</p>
      <ul>
        <li>contenuti copiati da libri di testo o materiali editoriali protetti da copyright</li>
        <li>dati personali di studenti o altre persone</li>
        <li>contenuti offensivi, discriminatori o illegali</li>
      </ul>
      <p>
        L&apos;amministratore della piattaforma si riserva il diritto di rimuovere
        contenuti che violino queste regole o le normative vigenti.
      </p>

      <h2>Rimozione dei contenuti</h2>
      <p>
        La piattaforma agisce come servizio di hosting dei contenuti caricati dagli utenti.
      </p>
      <p>
        Qualora venga segnalata una violazione di legge o dei diritti di terzi, i contenuti
        potranno essere rimossi senza preavviso.
      </p>

      <h2>Licenze dei contenuti</h2>
      <p>
        I quiz pubblicati su questa piattaforma sono condivisi per scopi didattici.
        Gli autori possono scegliere tra le seguenti licenze:
      </p>
      <ul>
        <li>
          <strong>Creative Commons Attribution (CC BY)</strong> — Permette a chiunque di
          copiare, distribuire e modificare il contenuto, anche a fini commerciali,
          a condizione che venga attribuito il merito all&apos;autore originale.
        </li>
        <li>
          <strong>Creative Commons Attribution-ShareAlike (CC BY-SA)</strong> — Come CC BY,
          ma le opere derivate devono essere distribuite con la stessa licenza.
        </li>
      </ul>
    </article>
  );
}
