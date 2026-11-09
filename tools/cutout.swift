// Removes the background from a photo or every frame of a video using the
// macOS Vision person segmentation (macOS 12+, no downloads needed).
// Works best on people and costumed mascots.
//
//   swift tools/cutout.swift INPUT OUTPUT_DIR [--fps N]
//
// Photos produce OUTPUT_DIR/00.png. Videos produce 00.png, 01.png, ...
// sampled at --fps (default 12). Used by tools/make_character.py.
import AVFoundation
import AppKit
import CoreImage
import Vision

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments
if args.count < 3 { fail("usage: cutout.swift INPUT OUTPUT_DIR [--fps N]") }
let input = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
var fps = 12.0
if let i = args.firstIndex(of: "--fps"), i + 1 < args.count, let v = Double(args[i + 1]) {
  fps = v
}
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let context = CIContext()

func cutout(_ image: CGImage) -> CGImage? {
  let handler = VNImageRequestHandler(cgImage: image)
  let request = VNGeneratePersonSegmentationRequest()
  request.qualityLevel = .accurate
  request.outputPixelFormat = kCVPixelFormatType_OneComponent8
  do { try handler.perform([request]) } catch { return nil }
  guard let maskBuffer = request.results?.first?.pixelBuffer else { return nil }
  let source = CIImage(cgImage: image)
  var mask = CIImage(cvPixelBuffer: maskBuffer)
  // the mask comes back at a lower resolution; scale it to the image
  mask = mask.transformed(by: CGAffineTransform(
    scaleX: source.extent.width / mask.extent.width,
    y: source.extent.height / mask.extent.height))
  let clear = CIImage(color: .clear).cropped(to: source.extent)
  guard let blend = CIFilter(name: "CIBlendWithMask", parameters: [
    kCIInputImageKey: source, kCIInputBackgroundImageKey: clear,
    kCIInputMaskImageKey: mask]), let out = blend.outputImage
  else { return nil }
  return context.createCGImage(out, from: source.extent)
}

func save(_ image: CGImage, _ index: Int) {
  let rep = NSBitmapImageRep(cgImage: image)
  let url = outDir.appendingPathComponent(String(format: "%02d.png", index))
  try! rep.representation(using: .png, properties: [:])!.write(to: url)
}

let videoExts: Set<String> = ["mov", "mp4", "m4v"]
if videoExts.contains(input.pathExtension.lowercased()) {
  let asset = AVURLAsset(url: input)
  let duration = CMTimeGetSeconds(asset.duration)
  let gen = AVAssetImageGenerator(asset: asset)
  gen.appliesPreferredTrackTransform = true
  gen.requestedTimeToleranceBefore = .zero
  gen.requestedTimeToleranceAfter = .zero
  let count = max(1, Int(duration * fps))
  var written = 0
  for i in 0..<count {
    let t = CMTime(seconds: Double(i) / fps, preferredTimescale: 600)
    guard let frame = try? gen.copyCGImage(at: t, actualTime: nil),
          let cut = cutout(frame) else { continue }
    save(cut, written)
    written += 1
  }
  if written == 0 { fail("no subject found in video") }
  print(written)
} else {
  guard let ns = NSImage(contentsOf: input),
        let cg = ns.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { fail("cannot read image") }
  guard let cut = cutout(cg) else { fail("no subject found in image") }
  save(cut, 0)
  print(1)
}
