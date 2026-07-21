import Link from "next/link";

export const metadata = {
  title: "Install tinkr extension",
  description: "Download and sideload the tinkr Chrome extension for beta testing."
};

const STEPS = [
  {
    title: "Download the extension",
    body: "Grab the latest pre-built zip. No Node.js or repo clone required."
  },
  {
    title: "Unzip the folder",
    body: "Extract tinkr-extension.zip to a permanent location such as Downloads/tinkr-extension."
  },
  {
    title: "Enable Developer mode in Chrome",
    body: "Open chrome://extensions, turn on Developer mode in the top-right corner."
  },
  {
    title: "Load unpacked",
    body: "Click Load unpacked and select the extracted tinkr-extension folder."
  },
  {
    title: "Try Design Mode",
    body: "Open any public website, click the tinkr toolbar icon, and enter Design Mode. Guest mode works offline."
  },
  {
    title: "Sign in for cloud sync",
    body: "Use Sign in from the side panel to connect your account and sync projects to the dashboard."
  }
];

const TROUBLESHOOTING = [
  {
    q: "Chrome says this extension is not from the Web Store",
    a: "Expected for beta sideload builds. Developer mode must stay enabled while you test."
  },
  {
    q: "Sign-in does not connect the extension",
    a: "Reload the extension on chrome://extensions, then sign in again from the side panel. If you are on localhost with an unpacked dev build, confirm the manual pairing prompt on the callback page."
  },
  {
    q: "Cloud save fails after sign-in",
    a: "Check that the packed extension URLs match this deployment. Re-download the latest zip after operator updates."
  },
  {
    q: "How do I update?",
    a: "Download the newest zip, replace the folder, and click Reload on chrome://extensions. There is no auto-update outside the Chrome Web Store."
  }
];

export default function InstallPage() {
  const appUrl = process.env.NEXT_PUBLIC_TINKR_APP_URL || "";
  const downloadPath = "/downloads/tinkr-extension.zip";
  const githubRepo = process.env.NEXT_PUBLIC_TINKR_GITHUB_REPO || "https://github.com/hatif03/tinkr/releases/latest";

  return (
    <div className="tk-page" style={{ maxWidth: 820 }}>
      <header className="tk-page-header" style={{ flexDirection: "column", alignItems: "flex-start" }}>
        <p className="tk-eyebrow">Beta install</p>
        <h1 className="tk-title">Install tinkr for Chrome</h1>
        <p className="tk-muted" style={{ margin: 0, maxWidth: 640 }}>
          tinkr is distributed outside the Chrome Web Store during beta. You only need Google Chrome and the zip below.
        </p>
      </header>

      <section className="tk-card" style={{ marginBottom: 20, padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Download</h2>
        <p className="tk-muted">Version 0.3.0 · sideload build for testers</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          <a className="tk-button tk-button--primary" href={downloadPath} download>
            Download tinkr-extension.zip
          </a>
          <a className="tk-button" href={githubRepo} target="_blank" rel="noreferrer">
            GitHub Releases
          </a>
          <Link className="tk-button" href="/login">
            Create account
          </Link>
        </div>
        {appUrl ? (
          <p className="tk-muted" style={{ marginTop: 14, fontSize: 12 }}>
            Dashboard: <a href={appUrl}>{appUrl}</a>
          </p>
        ) : null}
      </section>

      <section className="tk-card" style={{ marginBottom: 20, padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Install steps</h2>
        <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 16 }}>
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <strong>{index + 1}. {step.title}</strong>
              <p className="tk-muted" style={{ margin: "4px 0 0" }}>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="tk-card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Troubleshooting</h2>
        <div style={{ display: "grid", gap: 14 }}>
          {TROUBLESHOOTING.map(item => (
            <div key={item.q}>
              <strong>{item.q}</strong>
              <p className="tk-muted" style={{ margin: "4px 0 0" }}>{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
