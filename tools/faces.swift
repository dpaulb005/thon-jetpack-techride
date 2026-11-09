// Prints the face rectangles Vision finds in an image, one per line, as
// "x y w h" in pixels from the top-left corner. Used by tools/make_rockets.py.
//
//   swift tools/faces.swift IMAGE
import AppKit
import Vision

guard CommandLine.arguments.count > 1,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else { exit(1) }
let request = VNDetectFaceRectanglesRequest()
try? VNImageRequestHandler(cgImage: cg).perform([request])
let w = Double(cg.width), h = Double(cg.height)
for face in request.results ?? [] {
  let b = face.boundingBox  // normalized, origin bottom-left
  print(Int(b.minX * w), Int((1 - b.maxY) * h), Int(b.width * w), Int(b.height * h))
}
