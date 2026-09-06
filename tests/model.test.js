const test = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")

// One item as Techmeme actually serves it, trimmed to the parts the plugin
// reads: the credited title, the permalink, the description with the story
// link and its thumbnail, and the dek after the em dash.
const FEED = `<?xml version="1.0"?>
<rss version="2.0">
<channel>
<title>Techmeme</title>
<lastBuildDate>Sun, 06 Sep 2026 15:30:31 -0400</lastBuildDate>
<item>
  <title>Analysis: since October, Anthropic has entered into agreements for at least 14.8 GW of compute capacity (Valida Pau/The Information)</title>
  <link>https://www.techmeme.com/260906/p7#a260906p7</link>
  <description><![CDATA[<A HREF="https://www.theinformation.com/articles/anthropic-compute"><IMG BORDER="0" SRC="http://www.techmeme.com/260906/i7.jpg"></A>
<P><A HREF="https://www.techmeme.com/260906/p7#a260906p7"><IMG SRC="http://www.techmeme.com/img/pml.png"></A> Valida Pau / <A HREF="https://www.theinformation.com/">The Information</A>:<BR>
<SPAN><B><A HREF="https://www.theinformation.com/articles/anthropic-compute">Analysis: since October &hellip;</A></B></SPAN>&nbsp; &mdash;&nbsp; Anthropic in the last year has scrambled to line up cloud deals &hellip; </P>
]]></description>
  <pubDate>Sun, 06 Sep 2026 15:30:01 -0400</pubDate>
  <guid>https://www.techmeme.com/260906/p7#a260906p7</guid>
</item>
<item>
  <title>Sources: X (formerly Twitter) plans a paid tier for its API (Kate Park/TechCrunch)</title>
  <link>https://www.techmeme.com/260906/p6#a260906p6</link>
  <description><![CDATA[<P><A HREF="https://www.techmeme.com/260906/p6#a260906p6"><IMG SRC="http://www.techmeme.com/img/pml.png"></A> Kate Park / <A HREF="https://techcrunch.com/">TechCrunch</A>:<BR>
<A HREF="https://techcrunch.com/2026/09/06/x-api-tier/">Sources: X plans a paid tier</A>&nbsp; &mdash;&nbsp; The company told developers &hellip; </P>
]]></description>
  <pubDate>Sun, 06 Sep 2026 14:05:00 -0400</pubDate>
  <guid>https://www.techmeme.com/260906/p6#a260906p6</guid>
</item>
</channel>
</rss>`

test("the feed parses into stories, newest first", () => {
  const parsed = Model.parseFeed(FEED)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.error, "")
  assert.equal(parsed.items.length, 2)
  assert.ok(parsed.items[0].published > parsed.items[1].published)
  assert.equal(parsed.updated, Date.parse("Sun, 06 Sep 2026 15:30:31 -0400"))
})

test("a story keeps its headline, byline, and publication apart", () => {
  const [story] = Model.parseFeed(FEED).items
  assert.equal(story.headline, "Analysis: since October, Anthropic has entered into agreements for at least 14.8 GW of compute capacity")
  assert.equal(story.credit, "Valida Pau/The Information")
  assert.equal(story.byline, "Valida Pau")
  assert.equal(story.publication, "The Information")
})

test("an aside in the headline is not mistaken for the credit", () => {
  const story = Model.parseFeed(FEED).items[1]
  assert.equal(story.headline, "Sources: X (formerly Twitter) plans a paid tier for its API")
  assert.equal(story.publication, "TechCrunch")
})

test("a title with no credit at all keeps the whole headline", () => {
  const split = Model.splitTitle("Something happened today")
  assert.equal(split.headline, "Something happened today")
  assert.equal(split.credit, "")
  assert.equal(split.publication, "")
})

test("a title that is only a parenthesis is left alone", () => {
  assert.equal(Model.splitTitle("(Reuters)").headline, "(Reuters)")
})

test("the story link is the publisher's, not Techmeme's", () => {
  const [story] = Model.parseFeed(FEED).items
  assert.equal(story.articleUrl, "https://www.theinformation.com/articles/anthropic-compute")
  assert.equal(story.link, "https://www.techmeme.com/260906/p7#a260906p7")
})

test("thumbnails come back over https, and the permalink pin is not a thumbnail", () => {
  const items = Model.parseFeed(FEED).items
  assert.equal(items[0].imageUrl, "https://www.techmeme.com/260906/i7.jpg")
  assert.equal(items[1].imageUrl, "")
})

test("the dek is the text after the em dash", () => {
  const [story] = Model.parseFeed(FEED).items
  assert.equal(story.snippet, "Anthropic in the last year has scrambled to line up cloud deals …")
})

test("entities decode, including numeric ones", () => {
  assert.equal(Model.decodeEntities("AT&amp;T &hellip; &#8216;go&#8217; &#x2014;"), "AT&T … ‘go’ —")
  assert.equal(Model.decodeEntities("&notareal; stays"), "&notareal; stays")
})

test("a feed that is empty or not a feed reports why", () => {
  assert.equal(Model.parseFeed("").ok, false)
  assert.equal(Model.parseFeed("<html>nope</html>").ok, false)
  assert.equal(Model.parseFeed("<rss><channel><item><title></title></item></channel></rss>").ok, false)
  assert.ok(Model.parseFeed(null).error.length > 0)
})

test("parseFeed never returns more than it was asked for", () => {
  assert.equal(Model.parseFeed(FEED, 1).items.length, 1)
  assert.equal(Model.parseFeed(FEED, 0).items.length, 2)
  assert.ok(Model.parseFeed(FEED, 999).items.length <= Model.MAX_STORIES)
})

test("bar text cuts at a word and pays for its own ellipsis", () => {
  const story = { headline: "Anthropic signs another compute deal with a cloud provider" }
  const text = Model.barText(story, 30)
  assert.ok(text.length <= 30)
  assert.ok(text.endsWith("…"))
  assert.ok(!text.includes("  "))
  assert.equal(Model.barText(story, 200), story.headline)
  assert.equal(Model.barText(null, 30), "")
})

test("a headline shorter than the budget is left whole", () => {
  assert.equal(Model.trimToWord("Short one", 40), "Short one")
})

test("relative time reads as a newsroom would say it", () => {
  const now = Date.parse("Sun, 06 Sep 2026 16:00:00 -0400")
  const at = (minutes) => now - minutes * 60000
  assert.equal(Model.relativeTime(at(0), now), "now")
  assert.equal(Model.relativeTime(at(1), now), "now")
  assert.equal(Model.relativeTime(at(12), now), "12m")
  assert.equal(Model.relativeTime(at(200), now), "3h")
  assert.equal(Model.relativeTime(at(60 * 30), now), "1d")
  assert.equal(Model.relativeTime(0, now), "")
})

test("the source line pairs the credit with the age", () => {
  const now = Date.parse("Sun, 06 Sep 2026 16:00:00 -0400")
  const [story] = Model.parseFeed(FEED).items
  assert.equal(Model.sourceLine(story, now), "Valida Pau/The Information · 30m")
  assert.equal(Model.sourceLine({ headline: "x", credit: "", published: 0 }, now), "")
})

test("new stories are counted against when you last looked", () => {
  const { items } = Model.parseFeed(FEED)
  const between = Date.parse("Sun, 06 Sep 2026 15:00:00 -0400")
  assert.equal(Model.newSince(items, between), 1)
  assert.equal(Model.newSince(items, 0), 0)
  assert.equal(Model.newSince(items, Date.now()), 0)
  assert.equal(Model.unreadLabel(0), "")
  assert.equal(Model.unreadLabel(3), "3")
  assert.equal(Model.unreadLabel(42), "9+")
})

test("copying gives the headline, its credit, and the publisher's link", () => {
  const [story] = Model.parseFeed(FEED).items
  const payload = Model.copyPayload(story)
  assert.ok(payload.includes("(Valida Pau/The Information)"))
  assert.ok(payload.endsWith("https://www.theinformation.com/articles/anthropic-compute"))
  assert.equal(Model.copyPayload(null), "")
})

test("commands pass untrusted text as arguments, never as script", () => {
  const payload = 'evil"; rm -rf ~; echo "'
  const command = Model.copyCommand(payload)
  assert.deepEqual(command.slice(0, 3), ["sh", "-c", 'printf %s "$1" | wl-copy'])
  assert.equal(command[command.length - 1], payload)
  assert.deepEqual(Model.openCommand("https://x.test/a"), ["xdg-open", "https://x.test/a"])
  assert.equal(Model.openCommand("  "), null)
})

test("the fetch names itself and cannot be talked out of a timeout", () => {
  const command = Model.curlCommand(Model.FEED_URL, 1)
  assert.equal(command[0], "curl")
  assert.ok(command.includes("--max-time"))
  // A timeout below the floor is raised to it; no timeout at all takes the default.
  assert.equal(command[command.indexOf("--max-time") + 1], "4")
  const fallback = Model.curlCommand(Model.FEED_URL)
  assert.equal(fallback[fallback.indexOf("--max-time") + 1], "20")
  assert.ok(command.some((part) => part.includes(Model.USER_AGENT)))
  assert.equal(command[command.length - 1], Model.FEED_URL)
})

test("a notification body that opens with a dash cannot be read as a flag", () => {
  const command = Model.toastCommand({ headline: "-y drops the table", credit: "Someone/Somewhere" })
  assert.equal(command[0], "omarchy-notification-send")
  assert.notEqual(command[command.length - 1].charAt(0), "-")
  assert.equal(Model.toastCommand(null), null)
})

test("settings fall back rather than break the bar", () => {
  assert.equal(Model.boolSetting(undefined, true), true)
  assert.equal(Model.boolSetting("false", true), false)
  assert.equal(Model.numberSetting("nonsense", 38, 16, 90), 38)
  assert.equal(Model.numberSetting(500, 38, 16, 90), 90)
  assert.equal(Model.numberSetting(2, 38, 16, 90), 16)
})

test("the dateline and the edition are set the way a paper sets them", () => {
  const day = new Date(2026, 8, 6)
  assert.equal(Model.dateline(day), "SUNDAY, 6 SEPTEMBER 2026")
  assert.equal(Model.edition(day), "No. 20,702")
  // The same civil day everywhere in the day, and the next one after it.
  assert.equal(Model.edition(new Date(2026, 8, 6, 23, 59)), Model.edition(new Date(2026, 8, 6, 0, 1)))
  assert.notEqual(Model.edition(new Date(2026, 8, 7)), Model.edition(day))
  assert.equal(Model.dateline("not a date"), "")
  assert.equal(Model.edition("not a date"), "")
})

test("the press line counts the page and dates it", () => {
  const now = Date.parse("Sun, 06 Sep 2026 16:00:00 -0400")
  const filed = Date.parse("Sun, 06 Sep 2026 15:30:00 -0400")
  assert.equal(Model.pressLine(12, filed, now), "12 STORIES · FILED 30M AGO")
  assert.equal(Model.pressLine(1, filed, now), "1 STORY · FILED 30M AGO")
  assert.equal(Model.pressLine(0, 0, now), "0 STORIES")
  assert.equal(Model.pressLine(3, now, now), "3 STORIES · FILED JUST NOW")
})

test("the crawl strings the headlines together with diamonds", () => {
  const { items } = Model.parseFeed(FEED)
  const crawl = Model.crawlText(items)
  assert.ok(crawl.includes("◆"))
  assert.ok(crawl.startsWith(items[0].headline))
  assert.equal(Model.crawlText(items, 1), items[0].headline)
  assert.equal(Model.crawlText([]), "")
  assert.equal(Model.crawlText(null), "")
})

test("the page finds a serif it actually has, and never guesses", () => {
  assert.equal(Model.serifFamily(["Fira Code", "Noto Serif", "Liberation Serif"]), "Liberation Serif")
  assert.equal(Model.serifFamily(["Fira Code", "Noto Serif"]), "Noto Serif")
  assert.equal(Model.serifFamily(["Fira Code"]), "serif")
  assert.equal(Model.serifFamily([]), "serif")
  assert.equal(Model.serifFamily(null), "serif")
})

test("a failed fetch says which way it failed", () => {
  assert.equal(Model.fetchError(22, "curl: (22) The requested URL returned error: 429"),
    "Techmeme is rate-limiting the feed")
  assert.equal(Model.fetchError(22, "curl: (22) The requested URL returned error: 403"),
    "Techmeme refused the request (403)")
  assert.equal(Model.fetchError(22, "curl: (22) The requested URL returned error: 503"),
    "Techmeme is having trouble (503)")
  assert.equal(Model.fetchError(22, "curl: (22) The requested URL returned error: 418"),
    "Techmeme answered 418")
  assert.equal(Model.fetchError(6, ""), "Cannot resolve techmeme.com — no DNS")
  assert.equal(Model.fetchError(7, ""), "Cannot connect to Techmeme — is the network up?")
  assert.equal(Model.fetchError(28, ""), "Techmeme took too long to answer")
  assert.equal(Model.fetchError(60, ""), "Could not agree a secure connection with Techmeme")
  assert.equal(Model.fetchError(56, ""), "Techmeme dropped the connection")
  // An unknown code still carries the number, so the journal and the panel agree.
  assert.equal(Model.fetchError(99, ""), "Could not reach Techmeme (curl 99)")
  assert.equal(Model.fetchError(null, ""), "Could not reach Techmeme")
})
