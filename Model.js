// Pure helpers for the Techmeme Omarchy plugin. QML imports this file; Node
// tests require the same exports at the bottom.

var APP_NAME = "Techmeme"
var FEED_URL = "https://www.techmeme.com/feed.xml"
var SITE_URL = "https://www.techmeme.com/"

// Techmeme serves the feed to anyone, but a reader that names itself is a
// reader that can be blocked on its own if it misbehaves.
var USER_AGENT = "omarchy-techmeme/1.0"

// The feed carries the current front page — around thirty items. More than
// twenty in the panel is a scroll nobody finishes.
var MAX_STORIES = 20

// ---- text ------------------------------------------------------------------

var ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", middot: "·", bull: "•", eacute: "é", trade: "™"
}

function decodeEntities(value) {
  var text = String(value === undefined || value === null ? "" : value)
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (whole, body) {
    if (body.charAt(0) === "#") {
      var code = body.charAt(1) === "x" || body.charAt(1) === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10)
      if (!isFinite(code) || code <= 0 || code > 0x10ffff) return whole
      return String.fromCharCode(code)
    }
    var named = ENTITIES[body.toLowerCase()]
    return named === undefined ? whole : named
  })
}

function stripTags(value) {
  return String(value === undefined || value === null ? "" : value).replace(/<[^>]*>/g, " ")
}

function collapse(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/\s+/g, " ")
    .replace(/^ | $/g, "")
}

// Cuts at a word so a headline never ends mid-syllable. The ellipsis is part
// of the budget, not added past it, so the bar keeps the width it was given.
function trimToWord(value, maxLength) {
  var text = collapse(value)
  var limit = Math.max(8, parseInt(maxLength, 10) || 0)
  if (text.length <= limit) return text
  var cut = text.slice(0, limit - 1)
  var space = cut.lastIndexOf(" ")
  if (space >= Math.floor(limit * 0.55)) cut = cut.slice(0, space)
  return cut.replace(/[\s,;:.—–-]+$/, "") + "…"
}

// ---- the feed --------------------------------------------------------------

// A headline arrives as "What happened (Reporter/Publication)". The credit is
// the last parenthesis, never one inside the sentence, so a headline about
// "(formerly Twitter)" keeps its aside and still finds its byline.
function splitTitle(value) {
  var text = collapse(decodeEntities(value))
  var match = text.match(/^([\s\S]*)\(([^()]*)\)\s*$/)
  if (!match || match[1].replace(/\s+$/, "") === "") {
    return { headline: text, credit: "", byline: "", publication: "" }
  }
  var headline = match[1].replace(/\s+$/, "")
  var credit = collapse(match[2])
  var slash = credit.indexOf("/")
  var byline = slash === -1 ? "" : collapse(credit.slice(0, slash))
  var publication = slash === -1 ? credit : collapse(credit.slice(slash + 1))
  return { headline: headline, credit: credit, byline: byline, publication: publication }
}

function itemBlocks(xml) {
  var text = String(xml || "")
  var blocks = []
  var pattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  var found
  while ((found = pattern.exec(text)) !== null) blocks.push(found[1])
  return blocks
}

function tagText(block, tag) {
  var pattern = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i")
  var found = String(block || "").match(pattern)
  if (!found) return ""
  var body = found[1]
  var cdata = body.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)
  return cdata ? cdata[1] : body
}

function hrefs(html) {
  var out = []
  var pattern = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi
  var found
  while ((found = pattern.exec(String(html || ""))) !== null) out.push(decodeEntities(found[1]))
  return out
}

// The permalink and the story are both in the description; the story is the
// first link that is not Techmeme's own.
function articleUrlFrom(html) {
  var links = hrefs(html)
  for (var i = 0; i < links.length; i++) {
    if (!/^https?:\/\/(www\.)?techmeme\.com/i.test(links[i])) return links[i]
  }
  return ""
}

// Thumbnails come off Techmeme over plain http in the feed. Ask for them the
// way the rest of the plugin asks for everything.
function secureUrl(value) {
  var url = String(value || "")
  return url.replace(/^http:\/\//i, "https://")
}

function imageUrlFrom(html) {
  var found = String(html || "").match(/<img\b[^>]*?src\s*=\s*["']([^"']+)["'][^>]*>/i)
  if (!found) return ""
  var url = decodeEntities(found[1])
  // The permalink pin is furniture, not a picture of anything.
  if (/\/img\//i.test(url)) return ""
  return secureUrl(url)
}

// Techmeme sets the dek after an em dash. Without one the story is a headline
// and a link, which is a complete story too.
function snippetFrom(html) {
  var text = collapse(decodeEntities(stripTags(html)))
  var dash = text.indexOf("—")
  if (dash === -1) return ""
  return collapse(text.slice(dash + 1))
}

function publishedMs(value) {
  var raw = collapse(value)
  if (raw === "") return 0
  var parsed = Date.parse(raw)
  return isFinite(parsed) ? parsed : 0
}

function normalizeItem(block) {
  var title = splitTitle(tagText(block, "title"))
  if (title.headline === "") return null
  var description = tagText(block, "description")
  var link = collapse(decodeEntities(tagText(block, "link")))
  var guid = collapse(decodeEntities(tagText(block, "guid")))
  return {
    id: guid !== "" ? guid : link,
    headline: title.headline,
    credit: title.credit,
    byline: title.byline,
    publication: title.publication,
    link: link,
    articleUrl: articleUrlFrom(description),
    imageUrl: imageUrlFrom(description),
    snippet: snippetFrom(description),
    published: publishedMs(tagText(block, "pubDate"))
  }
}

function parseFeed(xml, limit) {
  var text = String(xml || "")
  if (collapse(text) === "") return { ok: false, error: "The feed came back empty", items: [], updated: 0 }
  var blocks = itemBlocks(text)
  if (blocks.length === 0) return { ok: false, error: "No stories in the feed", items: [], updated: 0 }
  var cap = Math.max(1, Math.min(MAX_STORIES, parseInt(limit, 10) || MAX_STORIES))
  var items = []
  for (var i = 0; i < blocks.length && items.length < cap; i++) {
    var item = normalizeItem(blocks[i])
    if (item) items.push(item)
  }
  if (items.length === 0) return { ok: false, error: "Could not read the stories", items: [], updated: 0 }
  var built = publishedMs(tagText(text.split("<item")[0], "lastBuildDate"))
  return { ok: true, error: "", items: items, updated: built !== 0 ? built : items[0].published }
}

// ---- what the bar and panel say --------------------------------------------

function relativeTime(then, now) {
  var at = Number(then) || 0
  var reference = Number(now) || Date.now()
  if (at <= 0) return ""
  var seconds = Math.round((reference - at) / 1000)
  if (seconds < 90) return "now"
  var minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes + "m"
  var hours = Math.round(minutes / 60)
  if (hours < 24) return hours + "h"
  var days = Math.round(hours / 24)
  return days + "d"
}

function topStory(items) {
  return items && items.length ? items[0] : null
}

function barText(item, maxLength) {
  if (!item) return ""
  return trimToWord(item.headline, maxLength)
}

function sourceLine(item, now) {
  if (!item) return ""
  var parts = []
  if (item.credit !== "") parts.push(item.credit)
  var age = relativeTime(item.published, now)
  if (age !== "") parts.push(age)
  return parts.join(" · ")
}

function tooltipText(item) {
  if (!item) return APP_NAME
  return item.credit === "" ? item.headline : item.headline + " (" + item.credit + ")"
}

// How much of the front page turned over while you were not looking. Counted
// by story rather than by time, so a quiet hour reads as quiet.
function newSince(items, sinceMs) {
  var since = Number(sinceMs) || 0
  if (since <= 0 || !items) return 0
  var count = 0
  for (var i = 0; i < items.length; i++) {
    if (Number(items[i].published) > since) count++
  }
  return count
}

function unreadLabel(count) {
  var n = Math.max(0, parseInt(count, 10) || 0)
  if (n === 0) return ""
  return n > 9 ? "9+" : String(n)
}

// ---- the paper -------------------------------------------------------------

var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"]

// The page wants a serif and the machine may not have the first choice, so
// the family is picked from what is actually installed. Qt falls back to
// something sans if handed a name it does not know, which is the one outcome
// a newspaper cannot have.
var SERIF_STACK = ["Liberation Serif", "Noto Serif", "Tinos", "DejaVu Serif",
  "Georgia", "Times New Roman"]

function serifFamily(available) {
  var families = available || []
  for (var i = 0; i < SERIF_STACK.length; i++) {
    for (var j = 0; j < families.length; j++) {
      if (String(families[j]) === SERIF_STACK[i]) return SERIF_STACK[i]
    }
  }
  return "serif"
}

// "SUNDAY, 6 SEPTEMBER 2026", set the way a dateline is set.
function dateline(date) {
  var d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  return (DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear()).toUpperCase()
}

// One edition per day since the epoch — the same count the other daily
// widgets print, so the numbers agree across the bar.
function edition(date) {
  var d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ""
  var n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)
  return "No. " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

// The line under the masthead: how much is on the page, and how old it is.
function pressLine(count, updatedMs, nowMs) {
  var stories = Math.max(0, parseInt(count, 10) || 0)
  var head = stories === 1 ? "1 STORY" : stories + " STORIES"
  var age = relativeTime(updatedMs, nowMs)
  if (age === "") return head
  return head + " \u00b7 FILED " + (age === "now" ? "JUST NOW" : age.toUpperCase() + " AGO")
}

// The crawl along the foot of the page. Diamonds between stories, the way a
// wire ticker separates them; the panel loops it so it never ends.
function crawlText(items, limit) {
  if (!items || items.length === 0) return ""
  var cap = Math.max(1, Math.min(items.length, parseInt(limit, 10) || items.length))
  var parts = []
  for (var i = 0; i < cap; i++) {
    var headline = collapse(items[i].headline)
    if (headline !== "") parts.push(headline)
  }
  return parts.join("  \u25c6  ")
}


// Why a fetch failed, in the words of the thing that failed. curl reports the
// class of failure in its exit code and, for an HTTP error under -f, prints
// the status to stderr. Both are worth keeping: "could not reach Techmeme"
// covers a pulled cable and a rate limit alike, and they want different
// patience from the reader.
function fetchError(exitCode, stderr) {
  var code = parseInt(exitCode, 10)
  var status = String(stderr || "").match(/returned error:\s*(\d{3})/)
  if (status) {
    var http = status[1]
    if (http === "429") return "Techmeme is rate-limiting the feed"
    if (http === "403") return "Techmeme refused the request (403)"
    if (http.charAt(0) === "5") return "Techmeme is having trouble (" + http + ")"
    return "Techmeme answered " + http
  }
  if (code === 6) return "Cannot resolve techmeme.com — no DNS"
  if (code === 7) return "Cannot connect to Techmeme — is the network up?"
  if (code === 28) return "Techmeme took too long to answer"
  if (code === 22) return "Techmeme refused the request"
  if (code === 35 || code === 58 || code === 59 || code === 60 || code === 77)
    return "Could not agree a secure connection with Techmeme"
  if (code === 52 || code === 56) return "Techmeme dropped the connection"
  if (!isFinite(code) || code === 0) return "Could not reach Techmeme"
  return "Could not reach Techmeme (curl " + code + ")"
}


// ---- settings --------------------------------------------------------------

function boolSetting(value, fallback) {
  if (value === true || value === false) return value
  if (value === "true") return true
  if (value === "false") return false
  return fallback === true
}

function numberSetting(value, fallback, min, max) {
  var n = parseInt(value, 10)
  if (!isFinite(n)) n = parseInt(fallback, 10) || 0
  if (isFinite(min) && n < min) n = min
  if (isFinite(max) && n > max) n = max
  return n
}

// ---- what runs -------------------------------------------------------------

function curlCommand(url, timeoutSec) {
  var timeout = String(Math.max(4, parseInt(timeoutSec, 10) || 20))
  return [
    "curl", "-fsSL", "--max-time", timeout,
    "-H", "User-Agent: " + USER_AGENT,
    "-H", "Accept: application/rss+xml, application/xml",
    String(url || FEED_URL)
  ]
}

function openCommand(url) {
  var target = collapse(url)
  return target === "" ? null : ["xdg-open", target]
}

function copyPayload(item) {
  if (!item) return ""
  var url = item.articleUrl !== "" ? item.articleUrl : item.link
  var head = item.credit === "" ? item.headline : item.headline + " (" + item.credit + ")"
  return url === "" ? head : head + "\n" + url
}

function copyCommand(payload) {
  return ["sh", "-c", 'printf %s "$1" | wl-copy', "sh", String(payload || "")]
}

function notificationText(value) {
  var text = collapse(value)
  if (text.length > 180) text = text.slice(0, 177) + "…"
  // A body that opens with a dash is read as an option by the notifier.
  return text.charAt(0) === "-" ? "⁠" + text : text
}

function toastCommand(item) {
  if (!item) return null
  return [
    "omarchy-notification-send",
    "--app-name", APP_NAME,
    "-g", "📰",
    "-u", "low",
    notificationText(item.credit === "" ? "Top of Techmeme" : item.credit),
    notificationText(item.headline)
  ]
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    APP_NAME: APP_NAME,
    FEED_URL: FEED_URL,
    SITE_URL: SITE_URL,
    USER_AGENT: USER_AGENT,
    MAX_STORIES: MAX_STORIES,
    decodeEntities: decodeEntities,
    stripTags: stripTags,
    collapse: collapse,
    trimToWord: trimToWord,
    splitTitle: splitTitle,
    itemBlocks: itemBlocks,
    tagText: tagText,
    hrefs: hrefs,
    articleUrlFrom: articleUrlFrom,
    secureUrl: secureUrl,
    imageUrlFrom: imageUrlFrom,
    snippetFrom: snippetFrom,
    publishedMs: publishedMs,
    normalizeItem: normalizeItem,
    parseFeed: parseFeed,
    relativeTime: relativeTime,
    topStory: topStory,
    barText: barText,
    sourceLine: sourceLine,
    tooltipText: tooltipText,
    newSince: newSince,
    unreadLabel: unreadLabel,
    SERIF_STACK: SERIF_STACK,
    serifFamily: serifFamily,
    dateline: dateline,
    edition: edition,
    pressLine: pressLine,
    crawlText: crawlText,
    fetchError: fetchError,
    boolSetting: boolSetting,
    numberSetting: numberSetting,
    curlCommand: curlCommand,
    openCommand: openCommand,
    copyPayload: copyPayload,
    copyCommand: copyCommand,
    notificationText: notificationText,
    toastCommand: toastCommand
  }
}
