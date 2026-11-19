import classNames from "classnames";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { GUIDE_SECTIONS } from "./content";
import styles from "./guide.module.css";
import { guideImageSrc } from "./images.mjs";

const MARK_SYMBOL = { ok: "◎", warn: "△", ng: "×" };
const MARK_CLASS = { ok: styles.markOk, warn: styles.markWarn, ng: styles.markNg };
const PILL_CLASS = { ok: styles.pillOk, warn: styles.pillWarn, ng: styles.pillNg };

// The 10×10 counting example: a logo top-left, a badge top-right, a label bottom-right — 19 cells.
const TEXT_CELLS = new Set([0, 1, 2, 3, 9, 10, 11, 12, 13, 85, 86, 87, 88, 89, 95, 96, 97, 98, 99]);
const CELLS = Array.from({ length: 100 }, (_, index) => TEXT_CELLS.has(index));

// Where a section counts as "being read": its top has passed this line below the viewport top.
const READING_LINE = 120;

function Mark({ kind, size = "md" }) {
  return (
    <span className={classNames(styles.mark, styles[`mark_${size}`], MARK_CLASS[kind])} aria-hidden="true">
      {MARK_SYMBOL[kind]}
    </span>
  );
}

function AlertIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function RowIcon({ kind }) {
  if (kind === "alert") {
    return (
      <span className={classNames(styles.mark, styles.mark_lg, styles.markAlert)}>
        <AlertIcon />
      </span>
    );
  }
  if (kind === "search") {
    return (
      <span className={classNames(styles.mark, styles.mark_lg, styles.markInfo)}>
        <SearchIcon />
      </span>
    );
  }
  return <Mark kind={kind} size="lg" />;
}

function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      let current = ids[0];
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= READING_LINE) current = id;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActive(atBottom ? ids[ids.length - 1] : current);
    }
    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids]);

  return active;
}

// The page owns the document while it is open: a light background behind overscroll (the rest
// of the site may be in dark mode) and smooth scrolling for the in-page links.
function usePageChrome(htmlLang) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = {
      lang: root.lang,
      background: root.style.backgroundColor,
      scroll: root.style.scrollBehavior,
    };
    root.style.backgroundColor = "#F5F6F8";
    root.style.scrollBehavior = "smooth";
    return () => {
      root.lang = previous.lang;
      root.style.backgroundColor = previous.background;
      root.style.scrollBehavior = previous.scroll;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = htmlLang;
  }, [htmlLang]);
}

function SideNav({ content, active }) {
  const navRef = useRef(null);

  // On a phone the navigation is one scrolling row; keep the current section's tab in view.
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector(`[data-section="${active}"]`);
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    const left = link.offsetLeft - 16;
    if (typeof nav.scrollTo === "function") nav.scrollTo({ left, behavior: "smooth" });
  }, [active]);

  return (
    <aside className={styles.aside}>
      <p className={styles.asideLabel}>{content.ui.toc}</p>
      <nav ref={navRef} aria-label={content.ui.toc} className={styles.toc}>
        {GUIDE_SECTIONS.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            data-section={id}
            aria-current={active === id ? "location" : undefined}
            className={classNames(styles.tocLink, active === id && styles.tocLinkActive)}
          >
            {content[id].nav}
          </a>
        ))}
      </nav>
      <div className={styles.asideExtra}>
        <p className={styles.asideLabel}>{content.ui.official}</p>
        <div className={styles.asideLinks}>
          {content.ui.officialLinks.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SectionHead({ index, title }) {
  return (
    <>
      <p className={styles.sectionNum}>{String(index + 1).padStart(2, "0")}</p>
      <h2 className={styles.h2}>{title}</h2>
    </>
  );
}

function Checklist({ data, index }) {
  return (
    <section id="checklist" className={styles.section}>
      <SectionHead index={index} title={data.title} />
      <p className={styles.prose}>{data.intro}</p>
      <div className={styles.cards}>
        {data.cards.map((card) => (
          <div key={card.label} className={styles.card}>
            <p className={styles.cardLabel}>{card.label}</p>
            <p className={styles.cardBig}>{card.big}</p>
            <p className={styles.cardText}>{card.text}</p>
            <a href={card.link} className={styles.cardLink}>
              {card.linkLabel} →
            </a>
          </div>
        ))}
      </div>
      <div className={styles.notes}>
        <div className={styles.note}>
          <Mark kind="ng" size="sm" />
          <p>{data.gif}</p>
        </div>
        <div className={styles.note}>
          <span className={classNames(styles.mark, styles.mark_sm, styles.markInfo)} aria-hidden="true">
            i
          </span>
          <p>{data.partial}</p>
        </div>
      </div>
    </section>
  );
}

function Result({ data, index }) {
  return (
    <section id="result" className={styles.section}>
      <SectionHead index={index} title={data.title} />
      <div className={classNames(styles.panel, styles.spaced)}>
        {data.rows.map((row) => (
          <div key={row.label} className={classNames(styles.resultRow, row.kind === "alert" && styles.resultRowAlert)}>
            <div className={styles.resultHead}>
              <RowIcon kind={row.kind} />
              <p className={styles.resultLabel}>{row.label}</p>
            </div>
            <div className={styles.resultBody}>
              <p className={styles.resultText}>{row.body}</p>
              {row.points ? (
                <div className={styles.points}>
                  <p className={styles.pointsValue}>
                    {row.points.value}
                    <span>{row.points.unit}</span>
                  </p>
                  <p className={styles.pointsCaption}>{row.points.caption}</p>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <p className={classNames(styles.prose, styles.after)}>{data.after}</p>
      <p className={styles.links}>{data.links}</p>
    </section>
  );
}

function Symbols({ data, index }) {
  return (
    <section id="symbols" className={styles.section}>
      <SectionHead index={index} title={data.title} />
      <div className={styles.symbolsIntro}>
        <p className={styles.symbolsText}>{data.intro}</p>
        <figure className={styles.tool}>
          <p className={styles.toolLabel}>{data.mock.overall}</p>
          <span className={classNames(styles.mark, styles.mark_xl, styles.markNg)} aria-hidden="true">
            ×
          </span>
          <div className={styles.toolItems}>
            {["warn", "ok", "ng"].map((kind, i) => (
              <div key={data.mock.labels[i]} className={styles.toolItem}>
                <Mark kind={kind} size="tool" />
                <p>{data.mock.labels[i]}</p>
              </div>
            ))}
          </div>
          <figcaption className={styles.toolCaption}>{data.mock.caption}</figcaption>
        </figure>
      </div>

      <div className={classNames(styles.panel, styles.tableScroll, styles.spaced)}>
        <div className={styles.table}>
          <div className={classNames(styles.tableRow, styles.tableHead)}>
            {data.head.slice(0, 3).map((label) => (
              <p key={label} className={styles.tableMark}>
                {label}
              </p>
            ))}
            <p className={styles.tableMain}>{data.head[3]}</p>
          </div>
          {data.rows.map((row) => (
            <div key={row.verdictLabel} className={styles.tableRow}>
              {row.marks.map((kind, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <p
                  key={i}
                  className={classNames(
                    styles.tableMark,
                    styles.tableMarkValue,
                    row.verdict !== "ok" && kind === row.verdict && styles[`cellHit_${kind}`],
                    styles[`ink_${kind}`],
                  )}
                >
                  {MARK_SYMBOL[kind]}
                </p>
              ))}
              <div className={classNames(styles.tableMain, styles.tableVerdict)}>
                <span className={classNames(styles.pill, PILL_CLASS[row.verdict])}>{row.verdictLabel}</span>
                <p>{row.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendRing} aria-hidden="true" />
        <p>{data.legend}</p>
      </div>
    </section>
  );
}

function TextShare({ data, index }) {
  return (
    <section id="text" className={styles.section}>
      <SectionHead index={index} title={data.title} />
      <p className={styles.prose}>{data.lead}</p>

      <figure className={classNames(styles.box, styles.scale)}>
        <div className={styles.scaleTrackWrap}>
          <span className={styles.scaleLimit}>{data.scale.limit}</span>
          <span className={styles.scaleLimitLine} aria-hidden="true" />
          <div className={styles.scaleTrack} aria-hidden="true">
            <span className={classNames(styles.scaleSeg, styles.scaleOk)}>◎</span>
            <span className={classNames(styles.scaleSeg, styles.scaleWarn)}>△</span>
            <span className={classNames(styles.scaleSeg, styles.scaleNg)}>×</span>
          </div>
        </div>
        <div className={styles.scaleLabels}>
          {data.scale.ranges.map((range) => (
            <p key={range}>{range}</p>
          ))}
        </div>
        <figcaption className={styles.caption}>{data.scale.caption}</figcaption>
      </figure>

      <h3 className={styles.h3}>{data.count.title}</h3>
      <div className={styles.count}>
        <figure className={classNames(styles.box, styles.gridFigure)}>
          <div className={styles.grid} aria-hidden="true">
            {CELLS.map((on, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={i} className={on ? styles.cellOn : styles.cell} />
            ))}
          </div>
          <figcaption className={styles.gridCaption}>
            <span>{data.count.cellsLabel}</span>
            <strong>{data.count.cellsValue}</strong>
          </figcaption>
        </figure>
        <div className={styles.steps}>
          <ol className={styles.stepList}>
            {data.count.steps.map((step, i) => (
              <li key={step} className={styles.step}>
                <span className={styles.stepNum} aria-hidden="true">
                  {i + 1}
                </span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <p className={styles.muted}>{data.count.note}</p>
        </div>
      </div>

      <div className={styles.compare}>
        <div className={classNames(styles.card, styles.compareCard, styles.compareInclude)}>
          <p className={styles.compareTitle}>{data.include.title}</p>
          <p className={styles.cardText}>{data.include.text}</p>
        </div>
        <div className={classNames(styles.card, styles.compareCard, styles.compareExclude)}>
          <p className={styles.compareTitle}>{data.exclude.title}</p>
          <p className={styles.cardText}>{data.exclude.text}</p>
        </div>
      </div>

      <h3 className={styles.h3}>{data.examplesTitle}</h3>
      <div className={styles.examples}>
        {data.examples.map((example) => (
          <article key={example.image} className={styles.example}>
            <img src={guideImageSrc(example.image)} alt={example.alt} loading="lazy" className={styles.exampleImage} />
            <div className={styles.exampleBody}>
              <div className={styles.exampleHead}>
                <h4 className={styles.h4}>{example.name}</h4>
                <span className={classNames(styles.pill, styles.pillOk)}>{example.ok}</span>
                <span className={classNames(styles.pill, styles.pillNg)}>{example.ng}</span>
              </div>
              <p className={styles.cardText}>{example.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Borders({ data, index }) {
  return (
    <section id="border" className={styles.section}>
      <SectionHead index={index} title={data.title} />
      <p className={styles.prose}>{data.intro}</p>
      <div className={styles.cases}>
        {data.cases.map((item) => (
          <figure key={item.image} className={styles.case}>
            <img src={guideImageSrc(item.image)} alt={item.alt} loading="lazy" className={styles.caseImage} />
            <figcaption className={styles.caseCaption}>
              <p className={styles.caseTitle}>
                <Mark kind="ng" size="sm" />
                {item.label}
              </p>
              <p className={styles.caseText}>{item.text}</p>
            </figcaption>
          </figure>
        ))}
      </div>

      <h3 className={styles.h3}>{data.boundaryTitle}</h3>
      <ul className={styles.panel}>
        {data.boundary.map((item) => (
          <li key={item.text} className={styles.listRow}>
            <Mark kind={item.kind} />
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Backgrounds({ data, index }) {
  return (
    <section id="bg" className={styles.section}>
      <SectionHead index={index} title={data.title} />
      <p className={styles.prose}>{data.intro}</p>
      <div className={styles.cards}>
        {data.ways.map((way) => (
          <div key={way.title} className={styles.card}>
            <div className={styles.wayHead}>
              <span className={classNames(styles.swatch, styles[`swatch_${way.swatch}`])} aria-hidden="true" />
              <p className={styles.wayTitle}>{way.title}</p>
            </div>
            <p className={styles.cardText}>{way.text}</p>
          </div>
        ))}
      </div>

      <figure className={classNames(styles.panel, styles.spaced)}>
        <img
          src={guideImageSrc(data.figure.image)}
          alt={data.figure.alt}
          loading="lazy"
          className={styles.exampleImage}
        />
        <div className={styles.tableScroll}>
          <div className={styles.bgTable}>
            <div className={classNames(styles.bgRow, styles.tableHead)}>
              <p className={styles.bgWhere}>{data.figure.head[0]}</p>
              <p className={styles.bgMark}>{data.figure.head[1]}</p>
              <p className={styles.bgText}>{data.figure.head[2]}</p>
            </div>
            {data.figure.rows.map((row) => (
              <div key={row.where} className={styles.bgRow}>
                <p className={classNames(styles.bgWhere, styles.bgWhereValue)}>{row.where}</p>
                <p className={styles.bgMark}>
                  <Mark kind={row.kind} />
                </p>
                <p className={styles.bgText}>{row.text}</p>
              </div>
            ))}
          </div>
        </div>
      </figure>

      <div className={styles.warnBox}>
        <img src={guideImageSrc(data.warn.image)} alt={data.warn.alt} loading="lazy" className={styles.warnImage} />
        <div className={styles.warnBody}>
          <p className={styles.warnTitle}>
            <Mark kind="warn" />
            {data.warn.title}
          </p>
          <p className={styles.cardText}>{data.warn.text}</p>
        </div>
      </div>
    </section>
  );
}

const SECTION_VIEWS = {
  checklist: Checklist,
  result: Result,
  symbols: Symbols,
  text: TextShare,
  border: Borders,
  bg: Backgrounds,
};

export default function RakutenImageGuide({ content, lang, onLangChange }) {
  const active = useActiveSection(GUIDE_SECTIONS);
  usePageChrome(content.htmlLang);

  return (
    <div className={classNames(styles.page, lang === "ja" ? styles.ja : styles.zh)} lang={content.htmlLang}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.crumbs}>
            <Link href="/" className={styles.back}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              {content.ui.back}
            </Link>
            <span className={styles.crumbDivider} aria-hidden="true" />
            <span className={styles.crumb}>{content.ui.crumb}</span>
          </div>
          <div role="group" aria-label={content.ui.langNav} className={styles.langSwitch}>
            {[
              ["zh", "中文"],
              ["ja", "日本語"],
            ].map(([code, label]) => (
              <button
                key={code}
                type="button"
                lang={code === "zh" ? "zh-CN" : "ja"}
                aria-pressed={lang === code}
                className={classNames(styles.langButton, lang === code && styles.langButtonActive)}
                onClick={() => onLangChange(code)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>{content.hero.eyebrow}</p>
          <h1 className={styles.title}>{content.title}</h1>
          <p className={styles.lead}>{content.hero.lead}</p>
          <div className={styles.scope}>
            <div className={classNames(styles.scopeBox, styles.scopeIn)}>
              <p className={styles.scopeLabel}>{content.hero.inLabel}</p>
              <p className={styles.scopeText}>{content.hero.inText}</p>
            </div>
            <div className={classNames(styles.scopeBox, styles.scopeOut)}>
              <p className={styles.scopeLabel}>{content.hero.outLabel}</p>
              <p className={styles.scopeText}>{content.hero.outText}</p>
            </div>
          </div>
        </div>
      </section>

      <div className={styles.layout}>
        <SideNav content={content} active={active} />
        <main className={styles.main}>
          {GUIDE_SECTIONS.map((id, index) => {
            const View = SECTION_VIEWS[id];
            return <View key={id} data={content[id]} index={index} />;
          })}
          <footer className={styles.footer}>
            <p className={styles.footerTitle}>{content.footer.title}</p>
            <div className={styles.footerLinks}>
              {content.footer.links.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              ))}
            </div>
            <p className={styles.footerNote}>{content.footer.note}</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
