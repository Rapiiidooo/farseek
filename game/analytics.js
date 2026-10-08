// Pageviews for the hosted build, through the site's own /analytics route to a private Umami.
// The collection ID is public; dashboard access and the proxy configuration stay private.
// Nothing runs on a local preview or in an automated browser (the jam gate, test runs), and
// Do Not Track, Global Privacy Control and Umami's own opt-out are respected. Only the page
// itself is reported: no search, hash, detailed referrer, custom event or identifier.
const website = "e7a2dc08-58e3-4c04-8940-bd67b7b6db42";
const domains = ["farseek.rapidoai.dev", "fardoor.rapidoai.dev"];

function optedOut() {
  return (
    navigator.globalPrivacyControl === true ||
    [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack].some(
      (value) => value === "1" || value === 1 || value === "yes",
    )
  );
}

if (
  domains.includes(location.hostname) &&
  !navigator.webdriver &&
  !optedOut()
) {
  window.farDoorAnalyticsPayload = (type, payload) => {
    if (optedOut() || type !== "event" || payload.name || payload.id)
      return false;
    let referrer = "";
    try {
      const source = new URL(payload.referrer);
      if (["http:", "https:"].includes(source.protocol))
        referrer = source.origin;
    } catch {
      // Direct visits have no referring site.
    }
    return {
      website,
      hostname: location.hostname,
      url: location.pathname,
      title: "Farseek",
      referrer,
      screen: payload.screen,
      language: payload.language,
    };
  };

  const tracker = document.createElement("script");
  tracker.async = true;
  tracker.src = "/analytics/script.js";
  Object.assign(tracker.dataset, {
    websiteId: website,
    hostUrl: `${location.origin}/analytics`,
    domains: domains.join(","),
    excludeSearch: "true",
    excludeHash: "true",
    doNotTrack: "true",
    fetchCredentials: "omit",
    beforeSend: "farDoorAnalyticsPayload",
  });
  document.head.append(tracker);
}
