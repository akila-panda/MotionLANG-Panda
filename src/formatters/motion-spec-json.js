// Serialises the motionSpec object to the source-of-truth JSON file.
// All other formatters derive from this output.

export function formatMotionSpecJson(motionSpec) {
  return JSON.stringify(motionSpec, null, 2);
}