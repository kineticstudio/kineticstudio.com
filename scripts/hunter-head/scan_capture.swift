// capture INDIR OUTDIR [detail]: Apple's Object Capture (RealityKit PhotogrammetrySession) on a folder of
// frames taken in order round the subject; writes OUTDIR/model-<detail>.usdz and OUTDIR/obj-<detail>/ (OBJ, MTL, textures)
import Foundation
import RealityKit

let a = CommandLine.arguments
let input = URL(fileURLWithPath: a[1], isDirectory: true)
let outDir = URL(fileURLWithPath: a[2], isDirectory: true)
let name = a.count > 3 ? a[3] : "full"
let details: [String: PhotogrammetrySession.Request.Detail] = ["preview": .preview, "reduced": .reduced, "medium": .medium, "full": .full, "raw": .raw]
var config = PhotogrammetrySession.Configuration()
config.sampleOrdering = .sequential
config.featureSensitivity = .high
config.isObjectMaskingEnabled = true
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let objDir = outDir.appendingPathComponent("obj-\(name)", isDirectory: true)
try FileManager.default.createDirectory(at: objDir, withIntermediateDirectories: true)
let session = try PhotogrammetrySession(input: input, configuration: config)
let detail = details[name] ?? .full
try session.process(requests: [
  .modelFile(url: outDir.appendingPathComponent("model-\(name).usdz"), detail: detail),
  .modelFile(url: objDir, detail: detail),
])
var lastPct = -10
for try await o in session.outputs {
  switch o {
  case .requestProgress(_, let f):
    let pct = Int(f * 100)
    if pct >= lastPct + 10 { lastPct = pct; print("progress \(pct)%"); fflush(stdout) }
  case .requestComplete(let r, let res): print("complete", r, res); fflush(stdout)
  case .requestError(let r, let e): print("error", r, e); fflush(stdout)
  case .inputComplete: print("input complete"); fflush(stdout)
  case .invalidSample(let id, let reason): print("invalid sample", id, reason)
  case .skippedSample(let id): print("skipped sample", id)
  case .automaticDownsampling: print("automatic downsampling")
  case .processingCancelled: print("cancelled"); exit(1)
  case .processingComplete: print("processing complete"); fflush(stdout); exit(0)
  @unknown default: print("other", o); fflush(stdout)
  }
}
