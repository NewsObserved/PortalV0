import {
  AbsoluteFill,
  Audio,
  Img,
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

/** An image shown behind the captions, with its on-screen credit. */
export interface MediaShot {
  file: string;
  source: string;
  kind: "screenshot" | "photo";
}

export type StoryShortProps = {
  headline: string;
  kicker: string;
  words: TimedWord[];
  media: MediaShot[];
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

const LEAD_IN_MS = 300;
const INTRO_MS = 1600; // short — the hook has to land fast
const CAPTION_WORDS = 3;

function toLines(words: TimedWord[], perLine = CAPTION_WORDS): TimedWord[][] {
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
  media,
  audioFile,
  durationMs,
}: StoryShortProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const voiceMs = ms - LEAD_IN_MS;
  const outroStartMs = LEAD_IN_MS + durationMs;

  const lines = toLines(words);
  const currentLine = lines.find(
    (line) => voiceMs >= line[0].startMs && voiceMs <= line[line.length - 1].endMs + 220,
  );

  // Cut every ~4s regardless of how many images we have — cycling when few,
  // so the frame keeps moving even on a thin visual set.
  const bodyStart = INTRO_MS;
  const bodyMs = Math.max(1, outroStartMs - bodyStart);
  const MAX_SHOT_MS = 4200;
  const slots = media.length > 0 ? Math.max(media.length, Math.ceil(bodyMs / MAX_SHOT_MS)) : 0;
  const shotMs = slots > 0 ? bodyMs / slots : bodyMs;
  const slotIndex = Math.max(0, Math.floor((ms - bodyStart) / shotMs));
  const shotIndex = slots > 0 ? slotIndex % media.length : 0;
  const shot = media.length > 0 ? media[shotIndex] : null;
  const shotElapsed = ms - bodyStart - slotIndex * shotMs;
  const kenBurns = interpolate(shotElapsed, [0, shotMs], [1.04, 1.11], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shotFade = interpolate(shotElapsed, [0, 220], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const introOpacity = interpolate(ms, [INTRO_MS, INTRO_MS + 320], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const introPop = spring({ frame, fps, config: { damping: 12, stiffness: 140 } });
  const outroOpacity = interpolate(ms, [outroStartMs, outroStartMs + 280], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const inBody = ms > INTRO_MS && ms < outroStartMs;

  return (
    <AbsoluteFill style={{ backgroundColor: BLACK, fontFamily: SANS }}>
      {audioFile && <Audio src={staticFile(audioFile)} />}

      {/* visual bed */}
      {inBody && shot && (
        <AbsoluteFill style={{ opacity: shotFade }}>
          <Img
            src={staticFile(shot.file)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top center",
              transform: `scale(${kenBurns})`,
            }}
          />
          {/* legibility scrim */}
          <AbsoluteFill
            style={{
              background:
                "linear-gradient(180deg, rgba(18,16,9,.86) 0%, rgba(18,16,9,.72) 17%, rgba(18,16,9,.06) 34%, rgba(18,16,9,.10) 52%, rgba(18,16,9,.88) 72%, rgba(18,16,9,.97) 84%)",
            }}
          />
          {/* source credit */}
          <div
            style={{
              position: "absolute",
              top: 268,
              left: 60,
              background: shot.kind === "photo" ? RED : BLUE,
              color: PAPER,
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              padding: "10px 20px",
            }}
          >
            {shot.kind === "photo" ? "Submitted photo" : `Source: ${shot.source}`}
          </div>
        </AbsoluteFill>
      )}

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
      <div style={{ position: "absolute", top: 150, left: 60 }}>
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
      {ms < INTRO_MS + 340 && (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            padding: "0 70px",
            opacity: introOpacity,
            transform: `scale(${0.95 + introPop * 0.05})`,
            background: BLACK,
          }}
        >
          <div
            style={{
              alignSelf: "flex-start",
              background: YELLOW,
              color: BLACK,
              fontWeight: 800,
              fontSize: 34,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "14px 26px",
              transform: "rotate(-2deg)",
              marginBottom: 44,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontWeight: 700,
              fontSize: 92,
              lineHeight: 1.03,
              textTransform: "uppercase",
              color: PAPER,
            }}
          >
            {headline}
          </div>
        </AbsoluteFill>
      )}

      {/* karaoke captions — bottom third, over the visuals */}
      {inBody && currentLine && (
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            bottom: 300,
            fontWeight: 800,
            fontSize: 92,
            lineHeight: 1.12,
            textAlign: "center",
            textTransform: "uppercase",
            textShadow: "0 6px 28px rgba(0,0,0,.85)",
          }}
        >
          {currentLine.map((w, i) => (
            <span
              key={`${w.startMs}-${i}`}
              style={{
                color: voiceMs >= w.startMs ? YELLOW : PAPER,
                marginRight: 20,
                display: "inline-block",
              }}
            >
              {w.text}
            </span>
          ))}
        </div>
      )}

      {/* outro CTA */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: outroOpacity,
          background: BLACK,
        }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 700,
            fontSize: 76,
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
          Got a story they buried? Send it.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
