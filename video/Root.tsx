import { Composition, type CalculateMetadataFunction } from "remotion";
import { StoryShort, type StoryShortProps } from "./StoryShort";
import sample from "./sample-props.json";

const FPS = 30;

// voiceover length + 0.5s lead-in + 2.5s outro
const calculateMetadata: CalculateMetadataFunction<StoryShortProps> = ({ props }) => ({
  durationInFrames: Math.ceil(((props.durationMs + 3000) / 1000) * FPS),
  props,
});

export function RemotionRoot() {
  return (
    <Composition
      id="StoryShort"
      component={StoryShort}
      width={1080}
      height={1920}
      fps={FPS}
      defaultProps={sample as StoryShortProps}
      calculateMetadata={calculateMetadata}
    />
  );
}
