import { ExternalLink } from "lucide-react";
import { Page } from "../components";

export function AboutPage() {
  return (
    <Page active="/about" accent="amber">
      <section className="about-hero">
        <div>
          <h1>ABOUT CODJUMPER<br />STATS</h1>
          <p>CodJumper Stats turns player, map, leaderboard, and server data into a format that is easy to browse, compare, and understand.</p>
        </div>
        <dl>
          <div><dt>Purpose</dt><dd>A clearer way to browse competitive jump statistics.</dd></div>
          <div><dt>Position</dt><dd>An independent public project for JumpersHeaven and Jump4Life players.</dd></div>
          <div><dt>Data access</dt><dd>Live public data is provided by api.jump4life.org.</dd></div>
        </dl>
      </section>

      <section className="about-section">
        <h2>Project overview</h2>
        <div className="about-columns two">
          <article><h3>What CJS is</h3><p>CJS is an independent statistics frontend for the <a href="https://jumpersheaven.com">JumpersHeaven <ExternalLink size={13} /></a> and <a href="https://jump4life.org">Jump4Life <ExternalLink size={13} /></a> communities. It brings rankings, records, completions, maps, and live server activity into one place.</p></article>
          <article><h3>What you can do here</h3><ul><li>Compare global leaderboard standings.</li><li>Explore map records and completion progress.</li><li>Check active servers and player activity.</li><li>Save favorite maps and players locally.</li></ul></article>
        </div>
      </section>

      <section className="about-section">
        <h2>How the project works</h2>
        <div className="about-columns three">
          <article><h3>Independent presentation</h3><p>The UI is maintained separately and focuses on organizing dense statistics into a calm, readable experience.</p></article>
          <article><h3>Trusted data source</h3><p>Player rankings, map completions, records, and live server state are read from the public stats API.</p></article>
          <article><h3>Readability first</h3><p>Layouts adapt from wide comparison tables to compact cards on smaller screens.</p></article>
        </div>
      </section>

      <section className="about-section team-section">
        <h2>Open development</h2>
        <div className="about-columns two"><article><h3>Public by design</h3><p>CJS is developed in public so its implementation can be reviewed, improved, and maintained by the community.</p></article><article><h3>Independent implementation</h3><p>The frontend is built independently around the public CJ Stats API and does not depend on private source code.</p></article></div>
      </section>
    </Page>
  );
}
