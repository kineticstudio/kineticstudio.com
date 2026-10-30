// extract SRC OUTDIR FPS: frames of a (HDR) video as SDR sRGB JPEGs, upright, through AVFoundation's own tone mapping
import AVFoundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let a = CommandLine.arguments
let src = URL(fileURLWithPath: a[1]), out = URL(fileURLWithPath: a[2]), fps = Double(a[3]) ?? 10
let asset = AVURLAsset(url: src)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
if #available(macOS 15.0, *) { gen.dynamicRangePolicy = .forceSDR }
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let dur = try await asset.load(.duration).seconds
var i = 0
var t = 0.0
while t < dur - 0.02 {
  let (img, _) = try await gen.image(at: CMTime(seconds: t, preferredTimescale: 600))
  // into plain 8-bit sRGB
  let ctx = CGContext(data: nil, width: img.width, height: img.height, bitsPerComponent: 8, bytesPerRow: 0, space: srgb, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
  let url = out.appendingPathComponent(String(format: "f%04d.jpg", i))
  let dst = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dst, ctx.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.94] as CFDictionary)
  CGImageDestinationFinalize(dst)
  i += 1
  t += 1 / fps
}
print("frames", i, "size", "\(gen.maximumSize)")
