import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// One newsroom per shell. Every bar — one per monitor — reads this instance,
// so the front page is fetched once every few minutes rather than once per
// screen, and anything else on the shell that wants the top story can ask
// for it here rather than reaching into the panel.
Item {
  id: root

  property var shell: null
  property var settings: ({})
  property bool active: true

  // Newest first, as Techmeme ranks them — never re-sorted here.
  property var items: []
  property bool loading: false
  property string error: ""
  // When Techmeme last rebuilt the page, and when we last managed to ask.
  property real updated: 0
  property real fetchedAt: 0
  // Where your attention was left. Stories filed after this are the ones the
  // bar counts as new.
  property real seenAt: 0

  // `top` is an anchor line on Item, so the lead story is called what a
  // newsroom calls it.
  readonly property var lead: Model.topStory(items)
  readonly property bool ready: items.length > 0
  readonly property int unread: Model.newSince(items, seenAt)

  readonly property bool notify: Model.boolSetting(setting("notify", false), false)
  readonly property int stories: Model.numberSetting(setting("stories", 12), 12, 5, Model.MAX_STORIES)

  // The story the last toast announced, so a refresh that finds the same page
  // stays quiet and only a genuine change at the top gets to interrupt.
  property string _announcedId: ""
  property string _output: ""
  property string _stderr: ""
  // Kept for `status`, so the next time it says it cannot reach Techmeme the
  // reason is one IPC call away rather than a guess.
  property int lastExit: 0

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function load() {
    if (!active) return
    if (fetchProcess.running) return
    loading = true
    _output = ""
    _stderr = ""
    fetchProcess.command = Model.curlCommand(Model.FEED_URL, 20)
    fetchProcess.running = true
  }

  function refresh() {
    load()
  }

  // Opening the panel should not cost a fetch every time, but a page from
  // twenty minutes ago is not news.
  function refreshIfStale() {
    if (Date.now() - fetchedAt > 120000) load()
  }

  // You have seen the front page; nothing on it is new any more.
  function markSeen() {
    seenAt = Date.now()
  }

  function applyFeed(raw) {
    var parsed = Model.parseFeed(raw, Model.MAX_STORIES)
    loading = false
    if (!parsed.ok) {
      error = parsed.error || "Could not read the front page"
      retryTimer.restart()
      return
    }
    error = ""
    retryTimer.stop()
    fetchedAt = Date.now()
    updated = parsed.updated
    // The first page to arrive is the state of the world, not a bulletin.
    var first = items.length === 0
    items = parsed.items
    if (first && seenAt === 0) seenAt = Date.now()
    announce(first)
  }

  function announce(first) {
    if (!notify || !lead) return
    var id = String(lead.id || "")
    if (first) {
      _announcedId = id
      return
    }
    if (id === "" || id === _announcedId) return
    _announcedId = id
    var command = Model.toastCommand(lead)
    if (command) Quickshell.execDetached(command)
  }

  function openStory(story) {
    var target = story && story.articleUrl !== "" ? story.articleUrl : (story ? story.link : "")
    var command = Model.openCommand(target)
    if (command) Quickshell.execDetached(command)
  }

  // The permalink, where Techmeme keeps the cluster of everyone else's
  // coverage of the same story.
  function openDiscussion(story) {
    var command = Model.openCommand(story ? story.link : "")
    if (command) Quickshell.execDetached(command)
  }

  function openSite() {
    Quickshell.execDetached(Model.openCommand(Model.SITE_URL))
  }

  function copyStory(story) {
    var payload = Model.copyPayload(story)
    if (payload === "") return
    Quickshell.execDetached(Model.copyCommand(payload))
  }

  Process {
    id: fetchProcess
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._output = text
    }
    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: root._stderr = text
    }
    onExited: function(code) {
      if (code !== 0) {
        root.loading = false
        root.lastExit = code
        root.error = Model.fetchError(code, root._stderr)
        // The journal is where this is looked for after the fact.
        console.warn("techmeme: fetch failed, curl exit " + code + " " + Model.collapse(root._stderr))
        retryTimer.restart()
        return
      }
      root.lastExit = 0
      root.applyFeed(root._output)
    }
  }

  // A laptop that wakes with no network should not sit on yesterday's page
  // until the next quarter hour comes round.
  Timer {
    id: retryTimer
    interval: 120000
    repeat: false
    running: false
    onTriggered: if (root.active) root.load()
  }

  // Techmeme rebuilds through the day rather than on a schedule; five minutes
  // keeps the bar current without leaning on them.
  Timer {
    running: root.active
    interval: 300000
    repeat: true
    onTriggered: root.load()
  }

  Component.onCompleted: if (active) load()
}
