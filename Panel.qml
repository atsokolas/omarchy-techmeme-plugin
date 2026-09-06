import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Techmeme — the tech front page on the Omarchy bar.
//
// The panel is set as a page: masthead, dateline, a lead story, then the rest
// of the column, and a wire crawl along the foot. Everything takes its ink and
// its paper from the current Omarchy theme, so a theme change re-sets the page
// rather than leaving a white sheet in a dark room.
Panel {
  id: root
  moduleName: "atsokolas.techmeme"
  ipcTarget: "atsokolas.techmeme"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property bool openedFromHotkey: false

  readonly property var barIdentity: hostWidget || root

  // ---- ink and paper ------------------------------------------------------
  // Bound to the theme singleton rather than copied out of it, so switching
  // themes repaints the page live.
  readonly property color ink: bar ? bar.foreground : Color.foreground
  readonly property color paper: mix(Color.popups.background, ink, 0.045)
  readonly property color dim: Qt.rgba(ink.r, ink.g, ink.b, 0.62)
  readonly property color faint: Qt.rgba(ink.r, ink.g, ink.b, 0.34)
  // A wire light is red where the theme has a red to spare.
  readonly property color live: Color.urgent

  function mix(a, b, t) {
    return Qt.rgba(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, 1)
  }

  // The page is set in a serif; the furniture — datelines, bylines, keys —
  // stays in the bar's own face, so it still reads as part of the shell.
  readonly property string serif: Model.serifFamily(Qt.fontFamilies())
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property var sharedService: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(moduleName) : null
  readonly property var service: sharedService || localService

  readonly property var stories: service && service.items
    ? service.items.slice(0, service.stories)
    : []
  readonly property var rest: stories.length > 1 ? stories.slice(1) : []
  property int selected: 0
  property real seenMark: 0

  function pushSettings() { if (service) service.settings = settings }
  onSettingsChanged: pushSettings()
  onServiceChanged: pushSettings()
  Component.onCompleted: pushSettings()

  // Ages the bylines while the page is open.
  property real now: Date.now()
  Timer {
    running: root.opened
    interval: 30000
    repeat: true
    onTriggered: root.now = Date.now()
  }

  property real reveal: 1

  NumberAnimation {
    id: revealAnimation
    target: root
    property: "reveal"
    from: 0
    to: 1
    duration: 240
    easing.type: Easing.OutCubic
  }

  function open() {
    openedFromHotkey = false
    setCenterHoverRevealSuppressed(false)
    root.controller.show()
  }

  function openFromHotkey() {
    openedFromHotkey = true
    root.controller.show()
    Qt.callLater(function() {
      if (root.opened) setCenterHoverRevealSuppressed(true)
    })
  }

  function close() {
    setCenterHoverRevealSuppressed(false)
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function setCenterHoverRevealSuppressed(value) {
    if (root.bar && "centerHoverRevealSuppressed" in root.bar)
      root.bar.centerHoverRevealSuppressed = value
  }

  function handleClose() { root.close() }

  function storyAt(index) {
    return index >= 0 && index < stories.length ? stories[index] : null
  }

  readonly property var current: storyAt(selected)

  function move(delta) {
    if (stories.length === 0) return
    var next = selected + delta
    if (next < 0) next = 0
    if (next > stories.length - 1) next = stories.length - 1
    selected = next
    scrollTo(next)
  }

  // Keeps the story being read on the page without yanking the column about:
  // only the part that hangs outside the window is scrolled for. The lead sits
  // above the list, so index 0 simply goes back to the top of the page.
  function scrollTo(index) {
    if (index <= 0) {
      pageFlick.contentY = 0
      return
    }
    var item = rows.itemAt(index - 1)
    if (!item) return
    var top = leadBlock.height + item.y
    var bottom = top + item.height
    if (top < pageFlick.contentY) pageFlick.contentY = Math.max(0, top - Style.space(6))
    else if (bottom > pageFlick.contentY + pageFlick.height)
      pageFlick.contentY = Math.min(Math.max(0, pageFlick.contentHeight - pageFlick.height),
                                    bottom - pageFlick.height + Style.space(6))
  }

  function readCurrent() { service.openStory(current) }
  function discussCurrent() { service.openDiscussion(current) }
  function refresh() { service.refresh() }

  function copyCurrent() {
    if (!current) return
    service.copyStory(current)
    copiedTimer.restart()
  }

  function handleTextKey(key) {
    var k = String(key || "").toLowerCase()
    if (k === "r") refresh()
    else if (k === "c") copyCurrent()
    else if (k === "o") readCurrent()
    else if (k === "t") discussCurrent()
    else if (k === "g") { root.selected = 0; scrollTo(0) }
    else if (k === "s") service.openSite()
  }

  Timer {
    id: copiedTimer
    interval: 1600
  }

  onOpenedChanged: {
    if (!opened) {
      service.markSeen()
      return
    }
    seenMark = service.seenAt
    now = Date.now()
    // A page picked up again opens at the top unless you had left off part
    // way down the column.
    if (selected === 0) pageFlick.contentY = 0
    revealAnimation.restart()
    service.refreshIfStale()
    Qt.callLater(function() { if (keyCatcher) keyCatcher.forceActiveFocus() })
  }

  onStoriesChanged: if (selected > stories.length - 1) selected = Math.max(0, stories.length - 1)

  // Every edition that lands runs the press: the rule under the masthead
  // prints across, left to right.
  property real press: 1
  Connections {
    target: root.service
    ignoreUnknownSignals: true
    function onFetchedAtChanged() { if (root.opened) pressRun.restart() }
  }

  SequentialAnimation {
    id: pressRun
    NumberAnimation { target: root; property: "press"; to: 0; duration: 90 }
    NumberAnimation { target: root; property: "press"; to: 1; duration: 620; easing.type: Easing.OutCubic }
  }

  Service {
    id: localService
    active: root.sharedService === null
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(480))
    contentHeight: panel.fittedContentHeight(Style.space(560), Style.space(640))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) {
        if (dy !== 0) root.move(dy)
        else if (dx !== 0) root.move(dx)
      }
      onActivateRequested: root.readCurrent()
      onCloseRequested: root.handleClose()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) { root.handleTextKey(text) }

      // The sheet the page is printed on: the theme's popup ground, lifted a
      // few percent towards the ink so it reads as paper laid on the panel.
      Rectangle {
        anchors.fill: parent
        anchors.margins: -Style.space(4)
        color: root.paper
        border.width: 1
        border.color: root.faint
        radius: Math.min(3, Style.cornerRadius)
      }

      ColumnLayout {
        id: content
        anchors.fill: parent
        spacing: Style.space(6)

        // ---- masthead
        Item {
          Layout.fillWidth: true
          implicitHeight: nameplate.implicitHeight + Style.space(6)

          Text {
            id: nameplate
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            text: Model.APP_NAME.toUpperCase()
            color: root.ink
            font.family: root.serif
            font.pixelSize: Math.round(Style.font.displayLarge * 1.05)
            font.bold: true
            font.letterSpacing: Math.round(Style.font.display * 0.22)
          }

          // The edition sits in the corner opposite the buttons, where a paper
          // prints its number and its price.
          Text {
            anchors.left: parent.left
            anchors.top: parent.top
            anchors.topMargin: Style.space(4)
            text: Model.edition(new Date(root.now))
            color: root.faint
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.letterSpacing: 0.8
          }

          // The buttons keep out of the nameplate's way, up in the corner.
          Row {
            anchors.right: parent.right
            anchors.top: parent.top
            spacing: Style.space(1)

            PanelActionButton {
              iconText: "󰑐"
              tooltipText: "Refresh (r)"
              foreground: root.service.loading ? Color.accent : root.dim
              fontFamily: root.fontFamily
              onClicked: root.refresh()
            }

            PanelActionButton {
              iconText: "󰆏"
              tooltipText: "Copy the story (c)"
              foreground: copiedTimer.running ? Color.accent : root.dim
              fontFamily: root.fontFamily
              onClicked: root.copyCurrent()
            }

            PanelActionButton {
              iconText: "󰖟"
              tooltipText: "Open techmeme.com (s)"
              foreground: root.dim
              fontFamily: root.fontFamily
              onClicked: root.service.openSite()
            }
          }
        }

        // ---- the double rule, printed left to right on every edition
        Item {
          Layout.fillWidth: true
          implicitHeight: Style.space(5)

          Rectangle {
            width: parent.width * root.press
            height: 2
            color: root.ink
            opacity: 0.85
          }

          Rectangle {
            y: Style.space(4)
            width: parent.width * root.press
            height: 1
            color: root.ink
            opacity: 0.45
          }
        }

        // ---- dateline
        Item {
          Layout.fillWidth: true
          implicitHeight: dateline.implicitHeight

          Text {
            id: dateline
            anchors.left: parent.left
            // The wire line has the right-hand side; the dateline takes what
            // is left and drops the edition number before it collides.
            anchors.right: wire.left
            anchors.rightMargin: Style.space(10)
            elide: Text.ElideRight
            text: Model.dateline(new Date(root.now))
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            font.letterSpacing: 0.8
          }

          Row {
            id: wire
            anchors.right: parent.right
            anchors.verticalCenter: dateline.verticalCenter
            spacing: Style.space(5)

            // The wire light. It breathes for as long as the page is open.
            Rectangle {
              width: Style.space(6)
              height: width
              radius: width / 2
              anchors.verticalCenter: parent.verticalCenter
              color: root.service.error !== "" ? root.faint : root.live

              SequentialAnimation on opacity {
                running: root.opened && root.service.error === ""
                loops: Animation.Infinite
                NumberAnimation { from: 1; to: 0.25; duration: 900; easing.type: Easing.InOutSine }
                NumberAnimation { from: 0.25; to: 1; duration: 900; easing.type: Easing.InOutSine }
                onRunningChanged: if (!running) parent.opacity = 1
              }
            }

            Text {
              anchors.verticalCenter: parent.verticalCenter
              text: {
                if (copiedTimer.running) return "COPIED"
                if (root.service.error !== "") return root.service.error.toUpperCase()
                if (root.service.loading && root.stories.length === 0) return "GOING TO PRESS…"
                var line = "LIVE · " + Model.pressLine(root.stories.length, root.service.updated, root.now)
                return root.service.unread > 0 ? line + " · " + root.service.unread + " NEW" : line
              }
              color: copiedTimer.running || root.service.error !== "" ? Color.accent : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: 0.8
              elide: Text.ElideRight
            }
          }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: root.faint; opacity: 0.7 }

        // ---- the page
        Flickable {
          id: pageFlick
          Layout.fillWidth: true
          Layout.fillHeight: true
          clip: true
          contentWidth: width
          contentHeight: pageColumn.implicitHeight
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
          opacity: root.reveal
          transform: Translate { y: (1 - root.reveal) * Style.space(8) }

          Column {
            id: pageColumn
            width: pageFlick.width

            Text {
              visible: root.stories.length === 0
              width: parent.width
              topPadding: Style.space(28)
              horizontalAlignment: Text.AlignHCenter
              text: root.service.error !== "" ? root.service.error : "The wire is quiet."
              color: root.dim
              font.family: root.serif
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
            }

            // The lead, set larger and always with its dek.
            StoryRow {
              id: leadBlock
              visible: root.stories.length > 0
              story: root.stories.length > 0 ? root.stories[0] : null
              lead: true
              selected: root.selected === 0
              unread: root.seenMark > 0 && root.stories.length > 0 && Number(root.stories[0].published) > root.seenMark
              serif: root.serif
              fontFamily: root.fontFamily
              ink: root.ink
              paper: root.paper
              accent: Color.accent
              now: root.now

              onClicked: { root.selected = 0; root.readCurrent() }
              onDiscussionRequested: { root.selected = 0; root.discussCurrent() }
              onCopyRequested: { root.selected = 0; root.copyCurrent() }
              onHovered: function(isHovered) { if (isHovered) root.selected = 0 }
            }

            Repeater {
              id: rows
              model: root.rest

              delegate: StoryRow {
                required property int index
                required property var modelData

                story: modelData
                selected: root.selected === index + 1
                unread: root.seenMark > 0 && Number(modelData.published) > root.seenMark
                serif: root.serif
                fontFamily: root.fontFamily
                ink: root.ink
                paper: root.paper
                accent: Color.accent
                now: root.now

                onClicked: { root.selected = index + 1; root.readCurrent() }
                onDiscussionRequested: { root.selected = index + 1; root.discussCurrent() }
                onCopyRequested: { root.selected = index + 1; root.copyCurrent() }
                onHovered: function(isHovered) { if (isHovered) root.selected = index + 1 }
              }
            }
          }
        }

        // ---- the wire crawl, running for as long as the page is open
        Item {
          Layout.fillWidth: true
          implicitHeight: Style.space(18)
          visible: root.stories.length > 0
          clip: true

          Rectangle {
            anchors.fill: parent
            color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.06)
            border.width: 1
            border.color: root.faint
          }

          Item {
            anchors.fill: parent
            anchors.leftMargin: Style.space(6)
            anchors.rightMargin: Style.space(6)
            clip: true

            Row {
              id: crawl
              spacing: Style.space(28)
              y: (parent.height - height) / 2
              x: -crawl.offset

              // How far the first copy has travelled. When it has gone by its
              // own width the second copy is exactly where it started, so the
              // reset is invisible and the wire never stops.
              property real offset: 0
              readonly property real span: first.width + spacing

              NumberAnimation on offset {
                running: root.opened && crawl.span > 0
                loops: Animation.Infinite
                from: 0
                to: crawl.span
                // A steady reading pace rather than a fixed lap time, so a
                // long page does not race.
                duration: Math.max(8000, crawl.span * 22)
              }

              Text {
                id: first
                text: Model.crawlText(root.stories, 12)
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.letterSpacing: 0.5
              }

              Text {
                text: first.text
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.letterSpacing: 0.5
              }
            }
          }
        }

        // ---- the keys, set as a colophon
        Text {
          Layout.fillWidth: true
          text: "J/K MOVE · ENTER READ · T DISCUSSION · C COPY · R REFRESH"
          color: root.faint
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.letterSpacing: 0.8
          horizontalAlignment: Text.AlignHCenter
          elide: Text.ElideRight
        }
      }
    }
  }
}
