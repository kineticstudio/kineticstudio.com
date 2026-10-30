// landmarks IMAGE: Vision's face landmarks, in image pixels (origin top left), as JSON
import Foundation
import Vision
import CoreGraphics
import ImageIO

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let src = CGImageSourceCreateWithURL(url as CFURL, nil)!
let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let W = Double(img.width), H = Double(img.height)
let req = VNDetectFaceLandmarksRequest()
try VNImageRequestHandler(cgImage: img).perform([req])
var out: [[String: Any]] = []
for face in req.results ?? [] {
  let bb = face.boundingBox
  var d: [String: Any] = ["box": [bb.minX * W, (1 - bb.maxY) * H, bb.width * W, bb.height * H], "confidence": face.confidence]
  func pts(_ r: VNFaceLandmarkRegion2D?) -> [[Double]] {
    guard let r else { return [] }
    return r.pointsInImage(imageSize: CGSize(width: W, height: H)).map { [Double($0.x), H - Double($0.y)] }
  }
  if let l = face.landmarks {
    d["leftPupil"] = pts(l.leftPupil); d["rightPupil"] = pts(l.rightPupil)
    d["leftEye"] = pts(l.leftEye); d["rightEye"] = pts(l.rightEye)
    d["nose"] = pts(l.nose); d["noseCrest"] = pts(l.noseCrest); d["medianLine"] = pts(l.medianLine)
    d["outerLips"] = pts(l.outerLips); d["faceContour"] = pts(l.faceContour)
  }
  if let roll = face.roll { d["roll"] = roll.doubleValue }
  if let yaw = face.yaw { d["yaw"] = yaw.doubleValue }
  if let pitch = face.pitch { d["pitch"] = pitch.doubleValue }
  out.append(d)
}
print(String(data: try JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
