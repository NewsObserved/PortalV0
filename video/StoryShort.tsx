import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/** One spoken word with its timing from the ElevenLabs timestamps. */
export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

export type StoryShortProps = {
  headline: string;
  kicker: string;
  words: TimedWord[];
  /** Filename inside public/ (staticFile), or null for silent preview renders. */
  audioFile: string | null;
  durationMs: number;
};

const BLACK = "#121009";
const PAPER = "#f5f1e6";
const RED = "#e0261c";
const BLUE = "#2b418f";
const YELLOW = "#f5c543";
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const LEAD_IN_MS = 500;
const INTRO_MS = 2600;

/** Group words into caption lines of ~4 words for the karaoke display. */
function toLines(words: TimedWord[], perLine = 4): TimedWord[][] {
  const lines: TimedWord[][] = [];
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine));
  }
  return lines;
}

export function StoryShort({
  headline,
  kicker,
  words,
  audioFile,
  durationMs,
}: StoryShortProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const voiceMs = ms - LEAD_IN_MS; // audio starts after the lead-in
  const outroStartMs = LEAD_IN_MS + durationMs;

  const lines = toLines(words);
  const currentLine = lines.find(
    (line) => voiceMs >= line[0].startMs && voiceMs <= line[line.length - 1].endMs + 350,
  );

  const introOpacity = interpolate(ms, [INTRO_MS, INTRO_MS + 500], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const introPop = spring({ frame, fps, config: { damping: 14 } });
  const outroOpacity = interpolate(ms, [outroStartMs, outroStartMs + 400], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BLACK, fontFamily: SANS }}>
      {audioFile && <Audio src={staticFile(audioFile)} />}

      {/* ticker bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          background: BLUE,
          color: PAPER,
          fontWeight: 800,
          fontSize: 34,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          padding: "26px 0",
          textAlign: "center",
        }}
      >
        Buried ✦ Missed ✦ Refused ✦ Tell It Anyway
      </div>

      {/* masthead */}
      <div style={{ position: "absolute", top: 150, left: 70 }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 56, color: PAPER }}>
          News <span style={{ color: RED }}>Observed</span>
        </div>
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#8ea4e8",
            marginTop: 8,
          }}
        >
          Black press since 1974 · OGNSC
        </div>
      </div>

      {/* intro headline card */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: "0 80px",
          opacity: introOpacity,
          transform: `scale(${0.94 + introPop * 0.06})`,
        }}
      >
        <div
          style={{
            display: "inline-block",
            alignSelf: "flex-start",
            background: YELLOW,
            color: BLACK,
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "14px 26px",
            transform: "rotate(-2deg)",
            marginBottom: 46,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 700,
            fontSize: 88,
            lineHeight: 1.04,
            textTransform: "uppercase",
            color: PAPER,
          }}
        >
          {headline}
        </div>
      </AbsoluteFill>

      {/* karaoke captions */}
      {ms > INTRO_MS && ms < outroStartMs && currentLine && (
        <AbsoluteFill style={{ justifyContent: "center", padding: "0 70px" }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 84,
              lineHeight: 1.18,
              textAlign: "center",
              textTransform: "uppercase",
              color: PAPER,
            }}
          >
            {currentLine.map((w, i) => (
              <span
                key={`${w.startMs}-${i}`}
                style={{
                  color: voiceMs >= w.startMs ? YELLOW : PAPER,
                  transition: "color 80ms",
                  marginRight: 22,
                  display: "inline-block",
                }}
              >
                {w.text}
              </span>
            ))}
          </div>
        </AbsoluteFill>
      )}

      {/* outro CTA */}
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", opacity: outroOpacity }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 700,
            fontSize: 72,
            color: PAPER,
            marginBottom: 30,
          }}
        >
          News <span style={{ color: RED }}>Observed</span>
        </div>
        <div
          style={{
            background: RED,
            color: PAPER,
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "26px 48px",
            boxShadow: `10px 10px 0 ${PAPER}`,
          }}
        >
          Full story → newsobserved.com
        </div>
        <div style={{ marginTop: 40, fontSize: 30, color: "#9a958a" }}>
          Verified by real reporters. Reviewed by real editors.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
