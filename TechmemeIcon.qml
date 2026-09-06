import QtQuick
import qs.Commons

// The front page, drawn: a sheet with a lead story across the top and two
// columns of type under it. One set of paths in a unit square, so the mark
// reads the same at 14 pixels on the bar and at display size in the panel.
// When a story lands the lead bar sweeps across, the way a page is reset.
Item {
  id: root

  property real iconSize: Style.font.icon
  property color iconColor: Color.foreground
  // 0..1, how much of the lead bar has been set. Driven by `refile()`.
  property real lead: 1
  // The dot that says the page moved while you were not looking.
  property bool marked: false

  implicitWidth: iconSize
  implicitHeight: iconSize
  width: iconSize
  height: iconSize

  function refile() { refiling.restart() }

  SequentialAnimation {
    id: refiling
    NumberAnimation { target: root; property: "lead"; to: 0; duration: 130; easing.type: Easing.InQuad }
    NumberAnimation { target: root; property: "lead"; to: 1; duration: 420; easing.type: Easing.OutCubic }
  }

  onIconColorChanged: sheet.requestPaint()
  onLeadChanged: sheet.requestPaint()
  onMarkedChanged: sheet.requestPaint()

  Canvas {
    id: sheet
    anchors.fill: parent
    antialiasing: true

    onPaint: {
      var ctx = getContext("2d")
      var s = Math.min(width, height)
      ctx.reset()
      ctx.clearRect(0, 0, width, height)
      ctx.translate((width - s) / 2, (height - s) / 2)

      var stroke = Math.max(1, s * 0.075)
      ctx.strokeStyle = root.iconColor
      ctx.fillStyle = root.iconColor
      ctx.lineCap = "round"

      // The sheet itself, a touch taller than it is wide.
      var x = s * 0.14, y = s * 0.10, w = s * 0.72, h = s * 0.80
      var r = s * 0.10
      ctx.lineWidth = stroke
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
      ctx.globalAlpha = 0.85
      ctx.stroke()

      // The lead, set solid and sweeping in from the left when it changes.
      var inset = s * 0.13
      var leadY = y + h * 0.24
      var leadH = Math.max(stroke, s * 0.13)
      ctx.globalAlpha = 1
      ctx.fillRect(x + inset, leadY - leadH / 2, Math.max(0, (w - inset * 2) * root.lead), leadH)

      // Two lines of type below it, the second short as a column ends.
      ctx.globalAlpha = 0.62
      ctx.lineWidth = Math.max(1, stroke * 0.8)
      var lines = [[y + h * 0.56, 1.0], [y + h * 0.76, 0.62]]
      for (var i = 0; i < lines.length; i++) {
        ctx.beginPath()
        ctx.moveTo(x + inset, lines[i][0])
        ctx.lineTo(x + inset + (w - inset * 2) * lines[i][1], lines[i][0])
        ctx.stroke()
      }

      // A story filed since you last looked.
      if (root.marked) {
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(x + w, y, Math.max(1.4, s * 0.13), 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}
