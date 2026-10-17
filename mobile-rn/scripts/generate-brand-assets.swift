import Foundation
import AppKit

struct Palette {
    static let emerald = NSColor(calibratedRed: 16.0 / 255.0, green: 185.0 / 255.0, blue: 129.0 / 255.0, alpha: 1)
    static let cyan = NSColor(calibratedRed: 14.0 / 255.0, green: 165.0 / 255.0, blue: 233.0 / 255.0, alpha: 1)
    static let amber = NSColor(calibratedRed: 249.0 / 255.0, green: 115.0 / 255.0, blue: 22.0 / 255.0, alpha: 1)
    static let slate = NSColor(calibratedRed: 15.0 / 255.0, green: 23.0 / 255.0, blue: 42.0 / 255.0, alpha: 1)
}

func roundedPath(_ rect: NSRect, radius: CGFloat) -> NSBezierPath {
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

func pngData(from image: NSImage) -> Data? {
    guard let tiffData = image.tiffRepresentation else { return nil }
    guard let rep = NSBitmapImageRep(data: tiffData) else { return nil }
    return rep.representation(using: .png, properties: [:])
}

func saveImage(_ image: NSImage, to path: String) throws {
    guard let data = pngData(from: image) else {
        throw NSError(domain: "GenerateAssets", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not encode PNG."])
    }
    try data.write(to: URL(fileURLWithPath: path))
}

func drawBrandMark(in bounds: NSRect, withBackground: Bool) {
    let outerRect = bounds.insetBy(dx: bounds.width * 0.13, dy: bounds.height * 0.13)
    let outerPath = roundedPath(outerRect, radius: outerRect.width * 0.23)

    if withBackground {
        let bgGradient = NSGradient(colors: [
            Palette.emerald,
            Palette.cyan,
            Palette.amber,
        ])!
        bgGradient.draw(in: bounds, angle: -34)

        NSColor.white.withAlphaComponent(0.18).setFill()
        NSBezierPath(ovalIn: NSRect(x: bounds.minX - 140, y: bounds.maxY - 380, width: 420, height: 420)).fill()
        NSColor.white.withAlphaComponent(0.16).setFill()
        NSBezierPath(ovalIn: NSRect(x: bounds.maxX - 360, y: bounds.maxY - 530, width: 500, height: 500)).fill()
        NSColor.white.withAlphaComponent(0.1).setFill()
        NSBezierPath(ovalIn: NSRect(x: bounds.midX - 250, y: bounds.minY - 190, width: 500, height: 500)).fill()
    }

    NSColor.black.withAlphaComponent(0.14).setFill()
    roundedPath(outerRect.offsetBy(dx: 0, dy: -18), radius: outerRect.width * 0.23).fill()

    let cardGradient = NSGradient(colors: [
        NSColor.white.withAlphaComponent(0.98),
        NSColor(calibratedWhite: 0.98, alpha: 0.98),
    ])!
    cardGradient.draw(in: outerPath, angle: -90)

    NSColor.white.withAlphaComponent(0.75).setStroke()
    outerPath.lineWidth = 6
    outerPath.stroke()

    let markRect = outerRect.insetBy(dx: outerRect.width * 0.15, dy: outerRect.height * 0.16)
    let markPath = roundedPath(markRect, radius: markRect.width * 0.28)
    let markGradient = NSGradient(colors: [
        Palette.emerald.withAlphaComponent(0.95),
        Palette.cyan.withAlphaComponent(0.92),
        Palette.amber.withAlphaComponent(0.9),
    ])!
    markGradient.draw(in: markPath, angle: -36)

    let lettersRect = NSRect(
        x: markRect.minX,
        y: markRect.midY - markRect.height * 0.16,
        width: markRect.width,
        height: markRect.height * 0.34
    )
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let fontSize = markRect.height * 0.44
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: fontSize, weight: .black),
        .foregroundColor: Palette.slate,
        .paragraphStyle: paragraph,
    ]
    NSString(string: "ET").draw(in: lettersRect, withAttributes: attrs)

    let accentY = markRect.minY + markRect.height * 0.16
    let accentWidth = markRect.width * 0.2
    let accentGap = markRect.width * 0.08
    let accentHeight = max(8, markRect.height * 0.055)

    let leftAccent = roundedPath(
        NSRect(x: markRect.midX - accentGap / 2 - accentWidth, y: accentY, width: accentWidth, height: accentHeight),
        radius: accentHeight / 2
    )
    let rightAccent = roundedPath(
        NSRect(x: markRect.midX + accentGap / 2, y: accentY, width: accentWidth, height: accentHeight),
        radius: accentHeight / 2
    )
    NSColor.white.withAlphaComponent(0.96).setFill()
    leftAccent.fill()
    rightAccent.fill()
}

func makeImage(size: CGFloat, transparent: Bool = false, draw: () -> Void) -> NSImage {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    defer { image.unlockFocus() }

    if !transparent {
        NSColor.white.setFill()
        NSRect(x: 0, y: 0, width: size, height: size).fill()
    } else {
        NSColor.clear.setFill()
        NSRect(x: 0, y: 0, width: size, height: size).fill()
    }

    draw()
    return image
}

let fileManager = FileManager()
let cwd = fileManager.currentDirectoryPath
let assetsDir = "\(cwd)/assets"

let icon = makeImage(size: 1024) {
    drawBrandMark(in: NSRect(x: 0, y: 0, width: 1024, height: 1024), withBackground: true)
}
try saveImage(icon, to: "\(assetsDir)/icon.png")

let adaptiveIcon = makeImage(size: 1024, transparent: true) {
    drawBrandMark(in: NSRect(x: 120, y: 120, width: 784, height: 784), withBackground: false)
}
try saveImage(adaptiveIcon, to: "\(assetsDir)/adaptive-icon.png")

let splash = makeImage(size: 2048, transparent: true) {
    drawBrandMark(in: NSRect(x: 544, y: 720, width: 960, height: 960), withBackground: false)

    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: 124, weight: .bold),
        .foregroundColor: Palette.slate.withAlphaComponent(0.94),
        .paragraphStyle: paragraph,
    ]
    NSString(string: "EasyTeam CRM").draw(
        in: NSRect(x: 350, y: 500, width: 1348, height: 160),
        withAttributes: attrs
    )
}
try saveImage(splash, to: "\(assetsDir)/splash-icon.png")

let favicon = makeImage(size: 48) {
    drawBrandMark(in: NSRect(x: 0, y: 0, width: 48, height: 48), withBackground: true)
}
try saveImage(favicon, to: "\(assetsDir)/favicon.png")

print("Generated app assets in \(assetsDir)")
