import { GUIDE_CONTENT } from "components/guide/rakuten-image/content";
import RakutenImageGuide from "components/guide/rakuten-image/guide";
import { guideLangCookie, resolveGuideLang } from "components/guide/rakuten-image/lang.mjs";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap";

// Staff reference for Rakuten's main-image and SKU-image rules, in Chinese and Japanese.
// The language comes from ?lang=, then the reader's last choice, then the browser (lang.mjs).
export async function getServerSideProps({ query, req }) {
  return {
    props: {
      initialLang: resolveGuideLang({
        query,
        cookie: req.headers.cookie,
        acceptLanguage: req.headers["accept-language"],
      }),
    },
  };
}

export default function RakutenImageGuidePage({ initialLang }) {
  const router = useRouter();
  const [lang, setLang] = useState(initialLang);
  const content = GUIDE_CONTENT[lang];

  function changeLang(next) {
    if (next === lang || !GUIDE_CONTENT[next]) return;
    setLang(next);
    document.cookie = guideLangCookie(next);
    // A shared ?lang= link would otherwise win again on reload; keep the address in step.
    if (router.query.lang) {
      router.replace({ pathname: router.pathname, query: { ...router.query, lang: next } }, undefined, {
        shallow: true,
        scroll: false,
      });
    }
  }

  return (
    <>
      <Head>
        <title>{content.title}</title>
        <meta name="robots" content="noindex" />
        <link rel="icon" href="/favicon-32x32.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </Head>
      <RakutenImageGuide content={content} lang={lang} onLangChange={changeLang} />
    </>
  );
}
