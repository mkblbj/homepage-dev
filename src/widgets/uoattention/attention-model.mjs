// Pure data shaping for the 運営対応 widget. Every rule here comes from the
// /api/attention contract: null means UNKNOWN and must never become 0, and the
// company status is decided server-side — this module only reshapes it.

export const DASH = "—";

export function isNil(value) {
  return value === null || value === undefined;
}

// Unknown members are skipped, but if EVERY member is unknown the sum itself is unknown.
export function sumNullable(list) {
  const known = list.filter((value) => !isNil(value));

  return known.length ? known.reduce((total, value) => total + Number(value || 0), 0) : null;
}

function toNullableNumber(value) {
  return isNil(value) ? null : Number(value);
}

function toStars(byRating) {
  const rating = byRating || {};

  return [1, 2, 3].map((star) => ({ star, n: toNullableNumber(rating[star]) })).filter((entry) => entry.n > 0);
}

// Severity order of the per-shop board; a status this map does not know sorts as "unknown".
const SEVERITY = { critical: 0, attention: 1, unknown: 2, normal: 3 };

// Only a shop the Server calls normal, with every count a known 0 and no error, has nothing
// to show. An unknown count is not a zero, so it keeps the shop on the board.
function isQuiet(shop) {
  return (
    shop.status === "normal" &&
    !shop.lastError &&
    [shop.pending, shop.inquiry, shop.overdue, shop.reviews].every((count) => count === 0)
  );
}

function bySeverity(a, b) {
  const rank = (shop) => SEVERITY[shop.status] ?? SEVERITY.unknown;

  return rank(a) - rank(b) || (b.total ?? -1) - (a.total ?? -1);
}

// Logos are optional context merged by shopName; a missing entry just falls back to an initial.
function toLogoMap(logos) {
  return new Map((logos?.shops || []).map((shop) => [shop.shopName, shop.logoUrl || null]));
}

export function buildAttentionModel(data, logos) {
  if (!data) {
    return null;
  }

  const summary = data.summary || {};
  const byRating = summary.reviewCountByRating || {};
  const logoByName = toLogoMap(logos);
  const reviewTotal = toNullableNumber(summary.unrepliedReviewCount);
  const feedCount = (data.recentReviews || []).length;
  const shops = (data.shops || []).map((shop) => {
    const pending = toNullableNumber(shop.pendingOrderCount);
    const inquiry = toNullableNumber(shop.unansweredInquiryCount);
    const reviews = toNullableNumber(shop.unrepliedReviewCount);

    return {
      name: shop.shopName,
      logoUrl: logoByName.get(shop.shopName) || null,
      status: shop.status || "unknown",
      pending,
      inquiry,
      overdue: toNullableNumber(shop.overdueInquiryCount),
      reviews,
      // overdue is a subset of inquiry, so it never adds to the total
      total: sumNullable([pending, inquiry, reviews]),
      stars: toStars(shop.reviewCountByRating),
      lastError: shop.lastError || null,
    };
  });

  return {
    generatedAtJST: data.generatedAtJST || "",
    status: data.status || "unknown",
    partial: data.partial === true,
    shopCount: Number(data.shopCount || shops.length),
    coveredShopCount: shops.filter((shop) => !isNil(shop.reviews)).length,
    pending: toNullableNumber(summary.pendingOrderCount),
    inquiry: toNullableNumber(summary.unansweredInquiryCount),
    overdue: toNullableNumber(summary.overdueInquiryCount),
    reviews: reviewTotal,
    // The Server counts every unreplied review from its full paginated fetch but only ships
    // the newest 20 as detail rows, so the feed can hold fewer items than the headline says.
    // Deriving it here beats trusting the array length as a total.
    feedCount,
    reviewsTruncated: !isNil(reviewTotal) && feedCount < reviewTotal,
    productReviews: toNullableNumber(summary.productReviewCount),
    shopReviews: toNullableNumber(summary.shopReviewCount),
    ratings: [1, 2, 3].map((star) => ({ star, n: toNullableNumber(byRating[star]) })),
    total: sumNullable([summary.pendingOrderCount, summary.unansweredInquiryCount, summary.unrepliedReviewCount]),
    // An unknown review count must not be folded into the headline number.
    totalPartial: isNil(summary.unrepliedReviewCount),
    shops,
    // The per-shop board: shops with something to handle, most severe first; the rest fold away.
    activeShops: shops.filter((shop) => !isQuiet(shop)).sort(bySeverity),
    quietShops: shops.filter(isQuiet),
    // Capped at 20 by the Server, newest first. reviewUrl and itemName are deliberately
    // dropped: RMS requires a login so the feed stays link-free, and the management number
    // identifies the item far more compactly than its full title.
    recentReviews: (data.recentReviews || []).map((review) => ({
      id: review.reviewId,
      shop: review.shopName,
      logoUrl: logoByName.get(review.shopName) || null,
      type: review.reviewType,
      rating: Number(review.rating),
      postedAtJST: review.postedAtJST,
      itemNo: review.itemManagementNumber || null,
      excerpt: review.excerpt || "",
    })),
    sources: data.sources || {},
    lastError: data.lastError || null,
  };
}
