import Board from "components/tvboard/board";
import { findWidgetByType } from "components/tvboard/find-widget.mjs";
import Stage from "components/tvboard/stage";
import Head from "next/head";
import { servicesResponse } from "utils/config/api-response";

const FONTS =
  "https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&family=Barlow:wght@500;600;700&family=Noto+Sans+SC:wght@400;700&display=swap";

// The workshop TV board. Data sources are found by widget type in the cleaned services config —
// the same sanitised widgets the home page already sends to browsers — and read through
// /api/services/proxy, so no URL or credential reaches the TV.
export async function getServerSideProps() {
  const groups = await servicesResponse();
  const pick = (type) => findWidgetByType(groups, type);
  return {
    props: {
      sources: {
        shipping: pick("uoshippingdashboard"),
        rakuten: pick("uorakutensales"),
        attention: pick("uoattention"),
        attendance: pick("uoattendance"),
        aiSummary: pick("uoaisummary"),
        weather: pick("kobeweather"),
      },
    },
  };
}

export default function TvPage({ sources }) {
  return (
    <>
      <Head>
        <title>出荷ボード</title>
        <meta name="robots" content="noindex" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </Head>
      <Stage>
        <Board sources={sources} />
      </Stage>
    </>
  );
}
