const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const http = require("node:http")
const { spawnSync, spawn } = require("node:child_process")
const Model = require("../Model.js")

const ROOT = path.join(__dirname, "..")

function item(title, description, link) {
  return `<item><title>${title}</title><link>${link || "https://www.techmeme.com/260906/p1#a260906p1"}</link>` +
    `<description><![CDATA[${description}]]></description><pubDate>Sun, 06 Sep 2026 15:30:01 -0400</pubDate></item>`
}

function feed(items) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Techmeme</title>${items.join("")}</channel></rss>`
}

// ---- links -----------------------------------------------------------------

test("a story opens only over https, on an ordinary host", () => {
  assert.equal(Model.httpsUrl("https://example.test/a?b=1#c"), "https://example.test/a?b=1#c")
  assert.equal(Model.httpsUrl("http://example.test/a"), "https://example.test/a")
  for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "ftp://example.test/", "data:text/html,hi",
    "https://exa mple.test/", "https://example.test/a\"b", "-https://example.test/", "https:///etc", ""]) {
    assert.equal(Model.httpsUrl(bad), "", bad)
    assert.equal(Model.openCommand(bad), null, bad)
  }
  assert.equal(Model.httpsUrl("https://example.test/" + "a".repeat(3000)), "")
})

test("a feed's links that are not https never reach the page", () => {
  const xml = feed([
    item("One (A/B)", '<A HREF="javascript:alert(1)">x</A> <A HREF="file:///home">y</A> <A HREF="https://pub.test/story">z</A>'),
    item("Two (A/B)", '<A HREF="javascript:alert(1)">x</A>', "javascript:alert(2)")
  ])
  const [one, two] = Model.parseFeed(xml).items
  assert.equal(one.articleUrl, "https://pub.test/story")
  assert.equal(two.articleUrl, "")
  assert.equal(two.link, "")
})

test("the permalink must be Techmeme's own", () => {
  assert.equal(Model.techmemeUrl("https://www.techmeme.com/260906/p7#a260906p7"), "https://www.techmeme.com/260906/p7#a260906p7")
  assert.equal(Model.techmemeUrl("https://www.techmeme.com.evil.test/"), "")
  assert.equal(Model.techmemeUrl("https://evil.test/www.techmeme.com/"), "")
})

// ---- pictures --------------------------------------------------------------

test("thumbnails come only from Techmeme's own picture addresses", () => {
  const src = (url) => Model.imageUrlFrom(`<IMG SRC="${url}">`)
  assert.equal(src("http://www.techmeme.com/261016/i27.jpg"), "https://www.techmeme.com/261016/i27.jpg")
  for (const bad of ["https://evil.test/261016/i27.jpg", "https://www.techmeme.com.evil.test/261016/i27.jpg",
    "https://www.techmeme.com/img/pml.png", "https://www.techmeme.com/261016/i27.svg",
    "https://www.techmeme.com/261016/../../i27.jpg", "file:///261016/i27.jpg", "https://www.techmeme.com/261016/i27.jpg?x=1"]) {
    assert.equal(src(bad), "", bad)
  }
})

test("a picture's file name is built from the checked parts, never the address", () => {
  assert.equal(Model.imageCacheName("https://www.techmeme.com/261016/i27.jpg"), "261016-i27.jpg")
  assert.equal(Model.imageCacheName("https://www.techmeme.com/261016/I3.JPEG"), "261016-i3.jpg")
  for (const bad of ["https://www.techmeme.com/../../.bashrc", "https://www.techmeme.com/261016/i27.jpg/../x",
    "https://www.techmeme.com/261016/..%2fi27.jpg", "../../etc/passwd"]) {
    assert.equal(Model.imageCacheName(bad), "", bad)
  }
  // The commit step refuses any name that is not one of these, whatever it is handed.
  const command = Model.imageCommitCommand("/c", [{ name: "../../x", ok: true }, { name: ".bashrc", ok: false },
    { name: "261016-i27.jpg", ok: true }])
  assert.deepEqual(command.slice(5), ["ok", "261016-i27.jpg"])
})

function hex(bytes) { return Buffer.from(bytes).toString("hex") }
function jpeg(width, height, extra) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03]
  return [0xff, 0xd8].concat(app0, extra || [], sof, new Array(12).fill(0))
}

test("a picture is checked by its bytes, and refused past the size a thumbnail can be", () => {
  assert.deepEqual(Model.imageInfo(hex(jpeg(142, 72))), { type: "jpeg", width: 142, height: 72 })
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 120, 0, 0, 0, 80]
  assert.deepEqual(Model.imageInfo(hex(png)), { type: "png", width: 120, height: 80 })
  assert.deepEqual(Model.imageInfo(hex([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 100, 0, 50, 0])), { type: "gif", width: 100, height: 50 })
  // Too large to be a thumbnail: the decoder never sees it.
  assert.equal(Model.imageInfo(hex(jpeg(30000, 30000))), null)
  assert.equal(Model.imageInfo(hex(png.slice(0, 16).concat([0, 1, 0, 0, 0, 0, 0, 80]))), null)
  // Not a picture at all, or one cut off before it says its size.
  assert.equal(Model.imageInfo(hex(Buffer.from("<svg onload=alert(1)>"))), null)
  assert.equal(Model.imageInfo(hex(jpeg(142, 72).slice(0, 20))), null)
  assert.equal(Model.imageInfo("zz"), null)
})

test("the fetcher's report is read only for names it was allowed to write", () => {
  const ok = hex(jpeg(142, 72))
  const out = Model.imageResults(`261016-i27.jpg ${ok}\n../x.jpg ${ok}\n261016-i26.jpg 3c7376673e\ngarbage\n`)
  assert.deepEqual(out, [{ name: "261016-i27.jpg", ok: true }, { name: "261016-i26.jpg", ok: false }])
})

// ---- the page --------------------------------------------------------------

test("markup in the feed reaches the page as text, not as markup", () => {
  const xml = feed([item("&lt;font color=red&gt;Big&lt;/font&gt; &lt;img src=https://evil.test/x.png&gt; news (A/B)",
    '<A HREF="https://pub.test/s">s</A> &mdash; &lt;img src="https://evil.test/y.png"&gt; <font>dek</font>')])
  const [story] = Model.parseFeed(xml).items
  // The literal characters survive in the data; it is the QML that must not render them.
  assert.match(story.headline, /<font color=red>/)
  assert.match(story.headline, /<img src=/)
  for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith(".qml"))) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8")
    const blocks = source.split(/^\s*Text \{/m).slice(1)
    for (const block of blocks) {
      assert.match(block.slice(0, 200), /textFormat: Text\.PlainText/, file + " has a Text without PlainText")
    }
  }
})

test("the panel loads only the checked copy of a picture", () => {
  const row = fs.readFileSync(path.join(ROOT, "StoryRow.qml"), "utf8")
  assert.match(row, /source: root\.imageSource/)
  assert.doesNotMatch(row, /story\.imageUrl/)
  assert.match(row, /sourceSize\.width/)
  assert.match(row, /sourceSize\.height/)
})

// ---- the limits, run for real against a local server ------------------------

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, "127.0.0.1", () => resolve(server))
  })
}

function run(command) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1))
    let stdout = ""
    child.stdout.on("data", (d) => { stdout += d })
    child.on("close", (code) => resolve({ code, stdout }))
  })
}

// The real script, pointed at a plain-http test server: only the protocol
// rule is relaxed, so everything else is exercised as shipped.
function testFetch(url, limit) {
  const command = Model.curlCommand(url, 5)
  command[2] = command[2].replace("--proto =https --proto-redir =https", "--proto =http")
  if (limit) command[6] = String(limit)
  return command
}

test("an oversized feed is refused before it is parsed, chunked or not", async () => {
  const big = "<rss>" + "x".repeat(20000) + "</rss>"
  const server = await serve((req, res) => {
    if (req.url === "/chunked") { res.writeHead(200); res.write(big.slice(0, 10000)); res.end(big.slice(10000)) }
    else { res.writeHead(200, { "Content-Length": Buffer.byteLength(big) }); res.end(big) }
  })
  const base = "http://127.0.0.1:" + server.address().port
  try {
    for (const route of ["/declared", "/chunked"]) {
      const result = await run(testFetch(base + route, 4096))
      assert.notEqual(result.code, 0, route)
      assert.equal(result.stdout, "", route)
    }
    const fits = await run(testFetch(base + "/declared", 1024 * 1024))
    assert.equal(fits.code, 0)
    assert.equal(fits.stdout, big)
  } finally { server.close() }
})

test("the feed is never fetched over plain http", () => {
  const command = Model.curlCommand("http://127.0.0.1:9/feed.xml", 4)
  const result = spawnSync(command[0], command.slice(1), { encoding: "utf8" })
  assert.equal(result.status, 1)
  assert.equal(result.stdout, "")
})

test("an oversized fetch reads as too large, not as a lost connection", () => {
  assert.match(Model.fetchError(63, ""), /larger/)
})

test("pictures are capped on the wire and on disk, and a cached file past the cap is dropped", async () => {
  const good = Buffer.from(jpeg(142, 72))
  const server = await serve((req, res) => {
    if (req.url.endsWith("i1.jpg")) { res.writeHead(200); res.end(good) }
    else if (req.url.endsWith("i2.jpg")) { res.writeHead(200); res.end(Buffer.alloc(Model.IMAGE_MAX_BYTES + 10, 0xff)) }
    else { res.writeHead(404); res.end() }
  })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "techmeme-test-"))
  const base = "http://127.0.0.1:" + server.address().port
  try {
    // A stale oversized file left in the cache from before.
    fs.writeFileSync(path.join(dir, "261016-i3.jpg"), Buffer.alloc(Model.IMAGE_MAX_BYTES + 1, 0xff))
    const urls = ["https://www.techmeme.com/261016/i1.jpg", "https://www.techmeme.com/261016/i2.jpg",
      "https://www.techmeme.com/261016/i3.jpg", "https://www.techmeme.com/261016/i4.jpg"]
    const command = Model.imageFetchCommand(dir, urls)
    command[2] = command[2].replace("--proto =https", "--proto =http")
    for (let i = 8; i < command.length; i += 2) command[i] = command[i].replace("https://www.techmeme.com", base)
    const result = await run(command)
    const verdicts = Model.imageResults(result.stdout)
    assert.deepEqual(verdicts, [{ name: "261016-i1.jpg", ok: true }])
    await run(Model.imageCommitCommand(dir, verdicts))
    assert.deepEqual(fs.readdirSync(dir).sort(), ["261016-i1.jpg"])
    assert.equal((fs.statSync(dir).mode & 0o777), 0o700)
  } finally {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
