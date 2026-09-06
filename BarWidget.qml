import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "atsokolas.techmeme"

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  readonly property var service: panelLoader.item ? panelLoader.item.service : null
  readonly property var lead: service ? service.lead : null
  readonly property bool loading: service ? service.loading === true : false
  readonly property int unread: service ? service.unread : 0
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

  readonly property bool showHeadline: Model.boolSetting(root.setting("showHeadline", true), true)
  readonly property int headlineLength: Model.numberSetting(root.setting("headlineLength", 38), 38, 16, 90)

  function togglePanel() {
    if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
  }

  function open() {
    if (panelLoader.item && panelLoader.item.openFromHotkey) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
  }

  function refresh() { if (service) service.refresh() }
  function openTop() { if (service) service.openStory(service.lead) }

  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  // The headline is reset rather than swapped: the old line drops away, the
  // new one rises into its place and the mark re-sets its lead bar. Driven by
  // the story's id, so a refresh that finds the same front page stays still.
  property string shownId: ""
  property string shownHeadline: ""
  property real slide: 1   // 1 in place, 0 clear of the bar

  onLeadChanged: {
    if (!lead) return
    if (String(lead.id) === shownId) {
      shownHeadline = Model.barText(lead, headlineLength)
      return
    }
    reset.restart()
  }

  onHeadlineLengthChanged: if (lead) shownHeadline = Model.barText(lead, headlineLength)

  // The shared service is usually already holding a page by the time a bar is
  // built, so there is no change to wait for: set the line, without the reset.
  function adoptLead() {
    if (!lead) return
    shownId = String(lead.id)
    shownHeadline = Model.barText(lead, headlineLength)
  }

  onServiceChanged: adoptLead()
  Component.onCompleted: Qt.callLater(adoptLead)

  SequentialAnimation {
    id: reset
    NumberAnimation { target: root; property: "slide"; to: 0; duration: 140; easing.type: Easing.InQuad }
    ScriptAction {
      script: {
        root.shownId = root.lead ? String(root.lead.id) : ""
        root.shownHeadline = Model.barText(root.lead, root.headlineLength)
        mark.refile()
      }
    }
    NumberAnimation { target: root; property: "slide"; to: 1; duration: 380; easing.type: Easing.OutCubic }
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  IpcHandler {
    target: "atsokolas.techmeme"
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.togglePanel() }
    function refresh(): string { root.refresh(); return "ok" }
    // Opens the story at the top of the page in the browser.
    function read(): string { root.openTop(); return "ok" }
    function site(): string {
      if (root.service) root.service.openSite()
      return "ok"
    }
    function copy(): string {
      if (root.service) root.service.copyStory(root.service.lead)
      return "ok"
    }
    // Prints the top headline, so a greeter or a script can read the same page.
    function top(): string {
      return root.lead ? Model.tooltipText(root.lead) : ""
    }
    // The bar is a layer surface, so what it says cannot be read off a
    // screenshot. This is how you check.
    function status(): string {
      if (!root.service) return "{}"
      var s = root.service
      return JSON.stringify({
        stories: s.items.length,
        headlineOnBar: root.shownHeadline,
        showing: s.stories,
        unread: s.unread,
        loading: s.loading,
        error: s.error,
        lastExit: s.lastExit,
        updated: s.updated ? new Date(s.updated).toISOString() : "",
        fetched: s.fetchedAt ? new Date(s.fetchedAt).toISOString() : "",
        headline: s.lead ? s.lead.headline : "",
        credit: s.lead ? s.lead.credit : "",
        url: s.lead ? (s.lead.articleUrl || s.lead.link) : ""
      })
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: ""
    labelVisible: false
    hasVisualContent: true
    fixedWidth: root.vertical ? -1 : Math.max(Style.bar.iconSlot, content.contentWidth + button.scaledHorizontalMargin * 2)
    foreground: root.opened ? Color.accent : (root.bar ? root.bar.barForeground : Color.foreground)
    tooltipText: root.lead
      ? Model.tooltipText(root.lead)
      : (root.loading ? "Reading the front page…" : (root.service && root.service.error !== "" ? root.service.error : Model.APP_NAME))
    horizontalMargin: 8.5
    verticalPadding: 6

    onPressed: function(buttonCode) {
      if (buttonCode === Qt.MiddleButton) root.openTop()
      else if (buttonCode === Qt.RightButton) root.refresh()
      else root.togglePanel()
    }

    Item {
      id: content
      anchors.fill: parent

      readonly property real gap: Style.spaceReal(7)
      readonly property bool headlineVisible: root.showHeadline && !root.vertical && root.shownHeadline !== ""
      // Measured off to the side rather than off the label itself: an elided
      // Text inside a box it is also sizing reports the width it was given,
      // which is nothing, and the headline never gets off the ground.
      readonly property real headlineWidth: headlineVisible ? Math.min(headlineMetrics.width, Style.spaceReal(360)) : 0

      TextMetrics {
        id: headlineMetrics
        font.family: button.fontFamily
        font.pixelSize: button.fontSize
        text: root.shownHeadline
      }
      readonly property real contentWidth: mark.implicitWidth + (headlineVisible ? gap + headlineWidth : 0)

      TechmemeIcon {
        id: mark
        iconSize: Math.min(parent.height - Style.spaceReal(3), Style.bar.iconFont * 1.25)
        iconColor: button.foreground
        marked: root.unread > 0
        y: (parent.height - height) / 2
        x: content.headlineVisible
          ? (parent.width - content.contentWidth) / 2
          : (parent.width - implicitWidth) / 2

        // A page that is still being read breathes rather than spins.
        SequentialAnimation on opacity {
          running: root.loading && root.lead === null
          loops: Animation.Infinite
          NumberAnimation { from: 1; to: 0.45; duration: 900; easing.type: Easing.InOutSine }
          NumberAnimation { from: 0.45; to: 1; duration: 900; easing.type: Easing.InOutSine }
          onRunningChanged: if (!running) mark.opacity = 1
        }
      }

      Item {
        id: headlineClip
        visible: content.headlineVisible
        x: mark.x + mark.implicitWidth + content.gap
        width: content.headlineWidth
        height: parent.height
        clip: true

        Text {
          id: headline
          width: parent.width
          y: (parent.height - height) / 2 + (1 - root.slide) * height
          text: root.shownHeadline
          color: button.foreground
          font.family: button.fontFamily
          font.pixelSize: button.fontSize
          elide: Text.ElideRight
          opacity: root.slide
          renderType: Text.NativeRendering
        }
      }
    }
  }
}
