import { Page } from "../components";

export function NotFoundPage() {
  return (
    <Page active="" accent="blue">
      <section className="empty-state" aria-labelledby="not-found-title">
        <p>404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p>The address may be outdated, or the page may have moved.</p>
        <a href="/">Return to live servers</a>
      </section>
    </Page>
  );
}
