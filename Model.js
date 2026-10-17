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

// The feed runs to about twenty kilobytes and a thumbnail to under ten. The
// limits sit a hundred and fifty times above that: room for a busy day, none
// for a response that would fill the shell's memory or the disk.
var FEED_MAX_BYTES = 2 * 1024 * 1024
var IMAGE_MAX_BYTES = 512 * 1024
// Thumbnails are about 140 pixels wide. A file that claims to be past this
// is not a thumbnail, and is not decoded.
var IMAGE_MAX_SIDE = 2048

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

// Links come off Techmeme over plain http as often as not. Ask for them the
// way the rest of the plugin asks for everything.
function secureUrl(value) {
  var url = String(value || "")
  return url.replace(/^http:\/\//i, "https://")
}

// The only links the plugin hands to a browser: https, a plain host, and
// nothing a shell or a URL parser could read two ways.
function httpsUrl(value) {
  var url = secureUrl(collapse(value))
  if (url.length > 2048) return ""
  if (!/^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:\d{1,5})?([/?#][^\s<>"'\\`\x00-\x1f\x7f]*)?$/.test(url)) return ""
  return url
}

function techmemeUrl(value) {
  var url = httpsUrl(value)
  return /^https:\/\/www\.techmeme\.com([/?#]|$)/i.test(url) ? url : ""
}

// The permalink and the story are both in the description; the story is the
// first link that is not Techmeme's own.
function articleUrlFrom(html) {
  var links = hrefs(html)
  for (var i = 0; i < links.length; i++) {
    if (/^https?:\/\/(www\.)?techmeme\.com/i.test(links[i])) continue
    var url = httpsUrl(links[i])
    if (url !== "") return url
  }
  return ""
}

// Techmeme keeps its thumbnails at one shape of address, the day and then the
// story: /261016/i27.jpg. Nothing else is loaded, so the feed cannot point
// the plugin at another host or another kind of file. The permalink pin,
// under /img/, is furniture and falls outside the shape too.
var IMAGE_URL = /^https:\/\/www\.techmeme\.com\/(\d{6})\/(i\d{1,4})\.(jpg|jpeg|png|gif)$/i

function imageUrlFrom(html) {
  var found = String(html || "").match(/<img\b[^>]*?src\s*=\s*["']([^"']+)["'][^>]*>/i)
  if (!found) return ""
  var url = secureUrl(decodeEntities(found[1]))
  return IMAGE_URL.test(url) ? url : ""
}

// Where a thumbnail is kept on disk, named from the parts the address was
// checked for and never from the address itself, so no feed value reaches
// a path.
var IMAGE_NAME = /^[0-9]{6}-i[0-9]{1,4}\.(jpg|png|gif)$/

function imageCacheName(url) {
  var m = String(url || "").match(IMAGE_URL)
  if (!m) return ""
  var ext = m[3].toLowerCase()
  return m[1] + "-" + m[2].toLowerCase() + "." + (ext === "jpeg" ? "jpg" : ext)
}

// What the bytes say the picture is, read from the head of the file as hex.
// JPEG, PNG and GIF only; anything else, or a size past IMAGE_MAX_SIDE, is
// refused before Qt decodes a pixel of it.
function imageInfo(hex) {
  var h = String(hex || "").toLowerCase()
  if (!/^[0-9a-f]*$/.test(h)) return null
  var bytes = Math.floor(h.length / 2)
  var byte = function (i) { return parseInt(h.substr(i * 2, 2), 16) }
  var info = null
  if (h.indexOf("89504e470d0a1a0a") === 0 && bytes >= 24 && h.substr(24, 8) === "49484452") {
    info = { type: "png",
      width: byte(16) * 16777216 + byte(17) * 65536 + byte(18) * 256 + byte(19),
      height: byte(20) * 16777216 + byte(21) * 65536 + byte(22) * 256 + byte(23) }
  } else if (/^474946383[79]61/.test(h) && bytes >= 10) {
    info = { type: "gif", width: byte(6) + byte(7) * 256, height: byte(8) + byte(9) * 256 }
  } else if (h.indexOf("ffd8") === 0) {
    // The size is in the frame header, after however many segments come
    // first, so the segments are walked rather than an offset trusted.
    var i = 2
    while (i + 9 <= bytes) {
      if (byte(i) !== 0xff) return null
      var marker = byte(i + 1)
      if (marker === 0xff) { i++; continue }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue }
      if (marker === 0xd9 || marker === 0xda) return null
      var length = byte(i + 2) * 256 + byte(i + 3)
      if (length < 2) return null
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        info = { type: "jpeg", height: byte(i + 5) * 256 + byte(i + 6), width: byte(i + 7) * 256 + byte(i + 8) }
        break
      }
      i += 2 + length
    }
  }
  if (!info || !(info.width > 0) || !(info.height > 0)) return null
  if (info.width > IMAGE_MAX_SIDE || info.height > IMAGE_MAX_SIDE) return null
  return info
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
  var link = techmemeUrl(decodeEntities(tagText(block, "link")))
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
  if (code === 63 || code === 23) return "The feed came back larger than a front page can be"
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

// The fetch, held to FEED_MAX_BYTES however the body arrives. curl refuses a
// declared length past the limit and stops a chunked one that runs past it;
// head stops it again in case curl does not, and the length is counted in
// bytes before anything is printed. Over the limit exits 63, curl's own code
// for it, and nothing reaches the parser.
var FETCH_SCRIPT = 'set -o pipefail; export LC_ALL=C; ' +
  'body=$(curl -fsSL --proto =https --proto-redir =https --max-redirs 3 --max-time "$2" --max-filesize "$3" ' +
  '-H "User-Agent: $4" -H "Accept: application/rss+xml, application/xml" -- "$1" | head -c "$(($3 + 1))") || exit $?; ' +
  '[ "${#body}" -le "$3" ] || exit 63; printf %s "$body"'

function curlCommand(url, timeoutSec) {
  var timeout = String(Math.max(4, parseInt(timeoutSec, 10) || 20))
  return ["bash", "-c", FETCH_SCRIPT, "techmeme-fetch",
    String(url || FEED_URL), timeout, String(FEED_MAX_BYTES), USER_AGENT]
}

// Thumbnails, fetched into a cache only this user can read: one curl, four
// at a time over the same connection, each held to IMAGE_MAX_BYTES and to
// ten seconds. New ones land in hidden part files, which curl removes if the
// transfer fails or runs past the limit; anything still over the limit
// afterwards, cached or new, is thrown away. The script prints a line per
// picture, its name and then its first bytes as hex, and the service checks
// what the bytes are before anything is moved into place or decoded.
// Week-old pictures are cleared on the way in.
var IMAGE_SCRIPT = 'export LC_ALL=C; dir=${1:?}; max=$2; ua=$3; shift 3; umask 077; mkdir -p -- "$dir" || exit 1; ' +
  'find "$dir" -maxdepth 1 -type f -mmin +10080 -delete 2>/dev/null; ' +
  'names=(); args=(); ' +
  'while [ $# -ge 2 ]; do name=${1:?}; url=$2; shift 2; ' +
  'case $name in *[!A-Za-z0-9.-]*|.*) continue;; esac; names+=("$name"); ' +
  '[ -f "$dir/$name" ] || args+=(-o "$dir/.$name.part" --url "$url"); done; ' +
  'if [ ${#args[@]} -gt 0 ]; then curl -fsS --proto =https --max-time 10 --max-filesize "$max" --remove-on-error ' +
  '--parallel --parallel-max 4 -H "User-Agent: $ua" "${args[@]}" 2>/dev/null; fi; ' +
  'for name in "${names[@]}"; do src="$dir/$name"; [ -f "$src" ] || src="$dir/.$name.part"; [ -f "$src" ] || continue; ' +
  'size=$(wc -c < "$src"); ' +
  'if [ "$size" -gt "$max" ] || [ "$size" -lt 16 ]; then rm -f -- "${src:?}"; continue; fi; ' +
  'printf "%s " "$name"; od -An -v -tx1 -N 65536 -- "$src" | tr -d " \\n"; echo; done'

function imageFetchCommand(dir, urls) {
  var command = ["bash", "-c", IMAGE_SCRIPT, "techmeme-images", String(dir), String(IMAGE_MAX_BYTES), USER_AGENT]
  var seen = {}
  for (var i = 0; i < (urls || []).length; i++) {
    var name = imageCacheName(urls[i])
    if (name === "" || seen[name]) continue
    seen[name] = true
    command.push(name, urls[i])
  }
  return command
}

// What the fetch printed, read back into a verdict per picture.
function imageResults(output) {
  var lines = String(output || "").split("\n")
  var out = []
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^(\S+) ([0-9a-f]*)$/)
    if (!m || !IMAGE_NAME.test(m[1])) continue
    out.push({ name: m[1], ok: imageInfo(m[2]) !== null })
  }
  return out
}

// A part file that passed is renamed into place, in one step, so Qt never
// sees half a picture; one that failed is removed, and so is a cached file
// that no longer passes.
var COMMIT_SCRIPT = 'dir=${1:?}; shift; while [ $# -ge 2 ]; do verdict=$1; name=${2:?}; shift 2; ' +
  'case $name in *[!A-Za-z0-9.-]*|.*) continue;; esac; ' +
  'part="$dir/.$name.part"; ' +
  'if [ -f "$part" ]; then if [ "$verdict" = ok ]; then mv -f -- "$part" "$dir/$name"; else rm -f -- "${part:?}"; fi; ' +
  'elif [ "$verdict" != ok ]; then rm -f -- "${dir:?}/${name:?}"; fi; done'

function imageCommitCommand(dir, results) {
  var command = ["sh", "-c", COMMIT_SCRIPT, "techmeme-images", String(dir)]
  for (var i = 0; i < (results || []).length; i++) {
    if (!IMAGE_NAME.test(String(results[i].name))) continue
    command.push(results[i].ok ? "ok" : "bad", results[i].name)
  }
  return command
}

function openCommand(url) {
  var target = httpsUrl(url)
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

// The theme's palette from colors.toml. The shell's Color singleton isn't
// visible to third-party plugins, so the plugin reads the file itself.
function parseColors(toml) {
  var out = {}
  var lines = String(toml || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^\s*([a-z_]+)\s*=\s*"([^"]*)"/)
    if (m) out[m[1]] = m[2]
  }
  var hex = /^#[0-9a-fA-F]{6}$/
  if (!hex.test(out.foreground || "") || !hex.test(out.background || "")) return null
  var pick = function(key, fallback) { return hex.test(out[key] || "") ? out[key].toLowerCase() : fallback }
  var fg = out.foreground.toLowerCase()
  var accent = pick("accent", fg)
  return {
    mode: out.mode === "light" ? "light" : "dark",
    foreground: fg,
    background: out.background.toLowerCase(),
    accent: accent,
    muted: pick("muted", pick("dark_foreground", fg)),
    red: pick("red", accent)
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseColors: parseColors,
    APP_NAME: APP_NAME,
    FEED_URL: FEED_URL,
    SITE_URL: SITE_URL,
    USER_AGENT: USER_AGENT,
    MAX_STORIES: MAX_STORIES,
    FEED_MAX_BYTES: FEED_MAX_BYTES,
    IMAGE_MAX_BYTES: IMAGE_MAX_BYTES,
    IMAGE_MAX_SIDE: IMAGE_MAX_SIDE,
    httpsUrl: httpsUrl,
    techmemeUrl: techmemeUrl,
    imageCacheName: imageCacheName,
    imageInfo: imageInfo,
    imageFetchCommand: imageFetchCommand,
    imageResults: imageResults,
    imageCommitCommand: imageCommitCommand,
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
