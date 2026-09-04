import { BookOpen, Code2, Database, ExternalLink, HardDrive, ShieldCheck } from "lucide-react";
import { Page } from "../../components";
import { Card, Link, VisuallyHidden } from "../../components/ui";
import "./about.css";

const projectLinks = [
  {
    description: "Inspect the frontend, report issues, or follow development.",
    href: "https://github.com/Cjdcoy/cjs-web",
    icon: Code2,
    label: "Public source code",
  },
  {
    description: "Review the public contract used by CJS.",
    href: "https://api.jump4life.org/docs",
    icon: BookOpen,
    label: "CJ Stats API documentation",
  },
  {
    description: "Visit the community behind the Jump4Life data source.",
    href: "https://jump4life.org/",
    icon: ExternalLink,
    label: "Jump4Life community",
  },
  {
    description: "Visit the community behind the JumpersHeaven data source.",
    href: "https://www.jumpersheaven.com/",
    icon: ExternalLink,
    label: "JumpersHeaven community",
  },
] as const;

export function AboutPage() {
  return (
    <Page active="/about" accent="amber">
      <div className="cjs-about">
        <header className="cjs-about__hero">
          <div className="cjs-about__introduction cjs-page-heading">
            <p className="cjs-about__eyebrow cjs-page-heading__eyebrow">About the project</p>
            <h1>Jump statistics, clearly sourced.</h1>
            <p className="cjs-page-heading__description">
              CodJumper Stats is an independent public frontend for exploring player, map,
              leaderboard, and live-server data from JumpersHeaven and Jump4Life.
            </p>
          </div>

          <img
            src="/cjs-logo.png"
            alt="CJS mascot holding a faceted gold star above the CJS initials"
            width="1254"
            height="1254"
            decoding="async"
          />

          <dl className="cjs-about__facts" aria-label="Project facts">
            <div>
              <dt>Data sources</dt>
              <dd>JumpersHeaven and Jump4Life</dd>
            </div>
            <div>
              <dt>Current game</dt>
              <dd>Call of Duty 2</dd>
            </div>
            <div>
              <dt>Authoritative data</dt>
              <dd>Public CJ Stats API</dd>
            </div>
          </dl>
        </header>

        <section className="cjs-about__section" aria-labelledby="about-how-it-works">
          <div className="cjs-about__section-heading">
            <p className="cjs-about__eyebrow">How it works</p>
            <h2 id="about-how-it-works">A frontend, not the source of record</h2>
            <p>
              CJS organizes public statistics into focused views. It does not operate the game
              servers or create the underlying player and map records.
            </p>
          </div>

          <div className="cjs-about__card-grid">
            <Card className="cjs-about__card" padding="large">
              <Database aria-hidden="true" />
              <h3>Public API data</h3>
              <p>
                Pages request data from <strong>api.jump4life.org</strong>. The API remains the
                authority for published records, rankings, maps, players, and server activity.
              </p>
            </Card>
            <Card className="cjs-about__card" padding="large">
              <ShieldCheck aria-hidden="true" />
              <h3>No invented coverage</h3>
              <p>
                Available fields and features can differ by source. Missing or unsupported data is
                shown as unavailable instead of being inferred by the frontend.
              </p>
            </Card>
            <Card className="cjs-about__card" padding="large">
              <HardDrive aria-hidden="true" />
              <h3>Favorites stay local</h3>
              <p>
                Favorite maps and players are stored in this browser&apos;s local storage. CJS does
                not write them to the stats API, and clearing site data removes them from this
                browser.
              </p>
            </Card>
          </div>
        </section>

        <section className="cjs-about__section" aria-labelledby="about-limitations">
          <div className="cjs-about__section-heading">
            <p className="cjs-about__eyebrow">Scope and limitations</p>
            <h2 id="about-limitations">What CJS promises today</h2>
          </div>
          <ul className="cjs-about__limitations">
            <li>
              <strong>Sources are not game versions.</strong> The supported sources are
              JumpersHeaven and Jump4Life, and the current game scope is Call of Duty 2.
            </li>
            <li>
              <strong>Coverage follows the public contract.</strong> Source-specific features only
              appear when the API documents and supplies them.
            </li>
            <li>
              <strong>Call of Duty 4 is future work.</strong> CJS will not issue speculative COD4
              requests before the API publishes a supported contract.
            </li>
            <li>
              <strong>Live data can change.</strong> Availability and values reflect what the API
              returns when a page is loaded or refreshed.
            </li>
          </ul>
        </section>

        <section className="cjs-about__section" aria-labelledby="about-links">
          <div className="cjs-about__section-heading">
            <p className="cjs-about__eyebrow">Project and communities</p>
            <h2 id="about-links">Follow the source</h2>
            <p>
              The frontend is developed publicly and links directly to the API and communities it
              represents.
            </p>
          </div>

          <div className="cjs-about__links">
            {projectLinks.map(({ description, href, icon: Icon, label }) => (
              <Card className="cjs-about__link-card" key={href} padding="medium">
                <Icon aria-hidden="true" />
                <div>
                  <h3>
                    <Link href={href} target="_blank" rel="noreferrer">
                      {label}
                      <ExternalLink aria-hidden="true" size={15} />
                      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
                    </Link>
                  </h3>
                  <p>{description}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </Page>
  );
}
