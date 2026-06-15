/**
 * The send-clip orchestration now lives in `@sulion-ableton/shared` (the reuse surface
 * shared with the other extensions). Re-exported here so this package's entry point and
 * tests keep importing from "./capture.js".
 */
export {
  captureAndSend,
  captureAndSendAll,
  clipPath,
  type CaptureDeps,
  type ProgressHost,
} from "@sulion-ableton/shared";
