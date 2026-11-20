import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Alert, Button, Card, PageHeader } from "../../components/ui";
import { dismissInstall, installDismissed, useInstall } from "../../lib/install";

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="inline size-5 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1" />
    </svg>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="grid gap-3">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg">{i + 1}</span>
          <span className="pt-0.5 text-sm leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function InstallPage() {
  const inst = useInstall();
  const [result, setResult] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Ikona na ekranie" subtitle="Otwieraj Sushi Chef Lab jak zwykłą aplikację — jednym dotknięciem, na pełnym ekranie." />
      <div className="grid gap-4">
        {inst.installed && <Alert tone="success">Aplikacja jest już dodana do ekranu tego urządzenia.</Alert>}
        {result && <Alert tone="success">{result}</Alert>}

        {inst.canPrompt && (
          <Card>
            <p className="mb-3 text-sm">Ta przeglądarka może dodać ikonę automatycznie.</p>
            <Button onClick={async () => setResult((await inst.prompt()) ? "Gotowe — ikona jest na ekranie." : null)}>Dodaj ikonę na ekran</Button>
          </Card>
        )}

        <Card title={inst.platform === "ios" ? "iPhone / iPad (Safari)" : "iPhone / iPad"} className={inst.platform === "ios" ? "border-accent" : ""}>
          <Steps
            items={[
              <>Otwórz tę stronę w <strong>Safari</strong>.</>,
              <>
                Stuknij <strong>Udostępnij</strong> <ShareIcon /> (na dole ekranu lub obok paska adresu).
              </>,
              <>
                Przewiń w dół i wybierz <strong>„Do ekranu początkowego”</strong>.
              </>,
              <>
                Stuknij <strong>„Dodaj”</strong>. Ikona „Chef Lab” pojawi się na ekranie.
              </>,
            ]}
          />
        </Card>

        <Card title="Android (Chrome)" className={inst.platform === "android" ? "border-accent" : ""}>
          <Steps
            items={[
              <>Otwórz tę stronę w <strong>Chrome</strong>.</>,
              <>
                Stuknij menu <strong>⋮</strong> w prawym górnym rogu.
              </>,
              <>
                Wybierz <strong>„Zainstaluj aplikację”</strong> lub <strong>„Dodaj do ekranu głównego”</strong>.
              </>,
              <>Potwierdź. Ikona pojawi się na ekranie i w liście aplikacji.</>,
            ]}
          />
        </Card>

        <p className="text-xs text-muted">Po dodaniu nadal logujesz się tym samym kontem. Dane nie są przechowywane na telefonie — aplikacja potrzebuje internetu.</p>
      </div>
    </>
  );
}

/** Dashboard banner: shown until installed or dismissed. */
export function InstallBanner() {
  const inst = useInstall();
  const [hidden, setHidden] = useState(installDismissed);
  if (hidden || inst.installed || inst.platform === "other") return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft p-3">
      <img src="/pwa-192.png" alt="" className="size-10 rounded-lg" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Dodaj ikonę na ekran</span>
        <span className="block text-xs text-muted">Otwieraj aplikację jednym dotknięciem.</span>
      </p>
      {inst.canPrompt ? (
        <Button className="px-3" onClick={() => void inst.prompt()}>
          Dodaj
        </Button>
      ) : (
        <Link to="/instalacja" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg">
          Jak?
        </Link>
      )}
      <button
        type="button"
        aria-label="Nie pokazuj więcej"
        className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"
        onClick={() => {
          dismissInstall();
          setHidden(true);
        }}
      >
        ×
      </button>
    </div>
  );
}
