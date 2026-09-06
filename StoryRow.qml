import QtQuick
import qs.Commons
import "Model.js" as Model

// One story as it is set on the page: the headline in the paper's serif, the
// byline in small caps under it, the cut squared off at the right, and a
// hairline where the next story begins. The lead is the same setting, larger.
Item {
  id: root

  property var story: null
  property bool selected: false
  property bool unread: false
  property bool lead: false
  // The paper's two faces, handed down so every story is set the same.
  property string serif: "serif"
  property string fontFamily: Style.font.family
  property color ink: Color.foreground
  property color paper: Color.background
  property color accent: Color.accent
  // Ticks in the panel, so "12m" ages while the page is open.
  property real now: Date.now()

  readonly property color dim: Qt.rgba(ink.r, ink.g, ink.b, 0.62)
  readonly property color faint: Qt.rgba(ink.r, ink.g, ink.b, 0.40)
  readonly property bool hasCut: story && String(story.imageUrl || "") !== ""
  readonly property bool showDek: (lead || selected) && story && story.snippet !== ""

  signal clicked()
  signal discussionRequested()
  signal copyRequested()
  signal hovered(bool isHovered)

  width: parent ? parent.width : implicitWidth
  implicitWidth: Style.space(400)
  implicitHeight: column.implicitHeight + Style.space(lead ? 14 : 11)

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton
    cursorShape: Qt.PointingHandCursor
    onEntered: root.hovered(true)
    onExited: root.hovered(false)
    onClicked: function(event) {
      if (event.button === Qt.MiddleButton) root.copyRequested()
      else if (event.button === Qt.RightButton) root.discussionRequested()
      else root.clicked()
    }
  }

  // The story being read is marked in the margin, the way a reader's thumb
  // marks a column — no highlight, this is a page.
  Rectangle {
    x: 0
    y: Style.space(3)
    width: Math.max(2, Style.space(2))
    height: parent.height - Style.space(9)
    color: root.selected ? root.accent : (root.unread ? Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.45) : "transparent")
    Behavior on color { ColorAnimation { duration: 140 } }
  }

  Column {
    id: column
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.leftMargin: Style.space(12)
    anchors.rightMargin: Style.space(2)
    anchors.top: parent.top
    anchors.topMargin: Style.space(lead ? 8 : 6)
    spacing: Style.space(3)

    Item {
      width: parent.width
      implicitHeight: Math.max(headline.implicitHeight, cut.visible ? cut.height : 0)

      // The cut, squared and ruled like a halftone block.
      Rectangle {
        id: cut
        visible: root.hasCut
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.topMargin: Style.space(1)
        width: root.lead ? Style.space(96) : Style.space(58)
        height: root.lead ? Style.space(64) : Style.space(40)
        color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.06)
        border.width: 1
        border.color: root.faint
        clip: true

        Image {
          anchors.fill: parent
          anchors.margins: 1
          source: root.hasCut ? root.story.imageUrl : ""
          fillMode: Image.PreserveAspectCrop
          sourceSize.width: 240
          asynchronous: true
          cache: true
          smooth: true
          opacity: status === Image.Ready ? 1 : 0
          Behavior on opacity { NumberAnimation { duration: 220 } }
        }
      }

      Text {
        id: headline
        anchors.left: parent.left
        anchors.right: cut.visible ? cut.left : parent.right
        anchors.rightMargin: cut.visible ? Style.space(10) : 0
        text: root.story ? root.story.headline : ""
        color: root.ink
        font.family: root.serif
        font.pixelSize: root.lead ? Math.round(Style.font.title * 1.35) : Math.round(Style.font.body * 1.15)
        font.bold: root.lead
        font.weight: root.selected && !root.lead ? Font.DemiBold : Font.Normal
        wrapMode: Text.WordWrap
        maximumLineCount: root.lead ? 4 : (root.selected ? 3 : 2)
        elide: Text.ElideRight
        lineHeight: 1.12
        lineHeightMode: Text.ProportionalHeight
      }
    }

    // The byline, set small and spaced the way a paper sets a credit line.
    Text {
      width: parent.width
      text: Model.sourceLine(root.story, root.now).toUpperCase()
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.letterSpacing: 0.6
      elide: Text.ElideRight
    }

    Text {
      width: parent.width
      visible: root.showDek
      text: root.story ? root.story.snippet : ""
      color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.72)
      font.family: root.serif
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
      maximumLineCount: root.lead ? 3 : 2
      elide: Text.ElideRight
      lineHeight: 1.2
      lineHeightMode: Text.ProportionalHeight
      topPadding: Style.space(1)
    }
  }

  // Where the next story begins.
  Rectangle {
    anchors.bottom: parent.bottom
    anchors.left: parent.left
    anchors.right: parent.right
    height: 1
    color: root.faint
    opacity: 0.55
  }
}
